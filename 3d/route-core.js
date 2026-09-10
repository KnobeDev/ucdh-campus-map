// Pedestrian routing over the OSM path network. Pure data, no three.js, so it
// runs in node for tests exactly as it runs in the browser.
//
// Graph nodes are path vertices keyed by rounded coordinates: OSM ways share
// their junction nodes, so two ways that meet produce the same key and join.
// Any point (the walker, a building) is snapped onto the nearest segment and
// attached as a temporary node for the query.
//
// Construction zones are cut exactly as the 2D router cuts them: a zone is
// active until its endDate has passed (edit-store.jsx), and any edge that
// touches an active zone is removed.

// Walking cost per metre by surface. Footways are the heroes; a street with no
// sidewalk is a last resort, never a wall. Steps are excluded outright in
// step-free mode, the only kind that is.
const PENALTY = { foot: 1.0, steps: 1.0, cycle: 1.15, service: 1.35, street: 1.9 };
const GRID = 40; // metres, segment index cell

// Explicit 2 dp rounding so joining never depends on how upstream happened to
// round; OSM ways that share a junction node get the same key regardless.
const key = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
const ZONE_SAMPLE = 3; // metres between construction-zone probes along an edge

export function isZoneActive(zone, today = new Date().toISOString().slice(0, 10)) {
  return !zone.endDate || zone.endDate >= today;
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Probe an edge every ZONE_SAMPLE metres — a 378 m service road must not
 *  slip past a 10 m closure because only its ends and midpoint were tested. */
function edgeTouchesZone(ax, az, bx, bz, len, inZone) {
  const n = Math.max(1, Math.ceil(len / ZONE_SAMPLE));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (inZone(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
  }
  return false;
}

/**
 * @param {Array} paths        campus-data paths ({kind, name, pts})
 * @param {object} [opts]
 * @param {Array}  [opts.construction]  zones ({ring, endDate, name})
 * @param {string} [opts.today]         YYYY-MM-DD, for tests
 */
export function buildRouteGraph(paths, { construction = [], today } = {}) {
  const zones = construction.filter((z) => isZoneActive(z, today));
  const inZone = (x, z) => zones.some((zn) => pointInRing(x, z, zn.ring));

  const nodes = []; // [x, z]
  const ids = new Map(); // key -> id
  const adj = []; // id -> [{to, w, len, kind, name}]
  const segs = []; // {a, b, kind, name} for snapping
  let cut = 0;

  const nodeId = (x, z) => {
    const k = key(x, z);
    let id = ids.get(k);
    if (id === undefined) {
      id = nodes.length;
      ids.set(k, id);
      nodes.push([x, z]);
      adj.push([]);
    }
    return id;
  };

  for (const p of paths) {
    const pen = PENALTY[p.kind];
    if (pen === undefined) continue;
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i];
      const [bx, bz] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      if (edgeTouchesZone(ax, az, bx, bz, len, inZone)) {
        cut++;
        continue;
      }
      const a = nodeId(ax, az);
      const b = nodeId(bx, bz);
      const e = { len, w: len * pen, kind: p.kind, name: p.name || null };
      adj[a].push({ to: b, ...e });
      adj[b].push({ to: a, ...e });
      segs.push({ a, b, kind: p.kind, name: p.name || null });
    }
  }

  // Segment grid for snapping.
  const grid = new Map();
  segs.forEach((s, i) => {
    const [ax, az] = nodes[s.a];
    const [bx, bz] = nodes[s.b];
    for (let cx = Math.floor(Math.min(ax, bx) / GRID); cx <= Math.floor(Math.max(ax, bx) / GRID); cx++) {
      for (let cz = Math.floor(Math.min(az, bz) / GRID); cz <= Math.floor(Math.max(az, bz) / GRID); cz++) {
        const k = `${cx},${cz}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });

  return { nodes, adj, segs, grid, zonesCut: cut, activeZones: zones.length };
}

/** Nearest point on the network to (x, z), searching outward ring by ring. */
export function snapToGraph(graph, x, z, { stepFree = false, maxRadius = 400 } = {}) {
  const { nodes, segs, grid } = graph;
  const cx0 = Math.floor(x / GRID);
  const cz0 = Math.floor(z / GRID);
  let best = null;
  for (let r = 0; r * GRID <= maxRadius; r++) {
    for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
      for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== r) continue;
        for (const si of grid.get(`${cx},${cz}`) || []) {
          const s = segs[si];
          if (stepFree && s.kind === "steps") continue;
          const [ax, az] = nodes[s.a];
          const [bx, bz] = nodes[s.b];
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const px = ax + t * dx;
          const pz = az + t * dz;
          const d = Math.hypot(px - x, pz - z);
          if (!best || d < best.dist) best = { seg: si, t, x: px, z: pz, dist: d };
        }
      }
    }
    // Once a hit exists, one more ring guarantees nothing closer hides in a neighbour cell.
    if (best && r * GRID > best.dist) break;
  }
  return best;
}

// A tiny binary heap for Dijkstra.
class Heap {
  constructor() { this.a = []; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= a[i].d) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].d < a[m].d) m = l;
        if (r < a.length && a[r].d < a[m].d) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Shortest walking route between two arbitrary points.
 * @returns {{ok: boolean, pts: Array<[number, number]>, length: number, legs: Array, reason?: string}}
 *   legs: consecutive stretches sharing a way name/kind, for spoken directions.
 */
export function route(graph, from, to, { stepFree = false } = {}) {
  const { nodes, adj, segs } = graph;
  const sFrom = snapToGraph(graph, from.x, from.z, { stepFree });
  const sTo = snapToGraph(graph, to.x, to.z, { stepFree });
  if (!sFrom || !sTo) return { ok: false, reason: "no path network nearby", pts: [], length: 0, legs: [] };

  // Temporary nodes for the two snap points, attached to their segment ends.
  const N = nodes.length;
  const S = N;
  const E = N + 1;
  const extra = new Map();
  const attach = (id, snap) => {
    const s = segs[snap.seg];
    const pen = PENALTY[s.kind];
    const list = [];
    for (const end of [s.a, s.b]) {
      const [ex, ez] = nodes[end];
      const len = Math.hypot(ex - snap.x, ez - snap.z);
      list.push({ to: end, len, w: len * pen, kind: s.kind, name: s.name });
      (extra.get(end) || extra.set(end, []).get(end)).push({ to: id, len, w: len * pen, kind: s.kind, name: s.name });
    }
    extra.set(id, list);
  };
  attach(S, sFrom);
  attach(E, sTo);
  // Same segment: a direct hop is always allowed.
  if (sFrom.seg === sTo.seg) {
    const s = segs[sFrom.seg];
    const len = Math.hypot(sTo.x - sFrom.x, sTo.z - sFrom.z);
    extra.get(S).push({ to: E, len, w: len * PENALTY[s.kind], kind: s.kind, name: s.name });
  }
  const edgesOf = (id) => {
    const base = id < N ? adj[id] : [];
    const more = extra.get(id) || [];
    return more.length ? base.concat(more) : base;
  };
  const pos = (id) => (id === S ? [sFrom.x, sFrom.z] : id === E ? [sTo.x, sTo.z] : nodes[id]);

  const dist = new Map([[S, 0]]);
  const prev = new Map();
  const heap = new Heap();
  heap.push({ id: S, d: 0 });
  while (heap.size) {
    const { id, d } = heap.pop();
    if (d > (dist.get(id) ?? Infinity)) continue;
    if (id === E) break;
    for (const e of edgesOf(id)) {
      if (stepFree && e.kind === "steps") continue;
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { id, e });
        heap.push({ id: e.to, d: nd });
      }
    }
  }
  if (!dist.has(E)) return { ok: false, reason: "no connected path", pts: [], length: 0, legs: [] };

  const chain = [];
  for (let id = E; id !== undefined; id = prev.get(id)?.id) chain.push(id);
  chain.reverse();
  const pts = [[from.x, from.z], ...chain.map(pos), [to.x, to.z]];
  const legs = [];
  let length = 0;
  for (let i = 1; i < chain.length; i++) {
    const { e } = prev.get(chain[i]);
    length += e.len;
    const last = legs[legs.length - 1];
    if (last && last.name === e.name && last.kind === e.kind) last.length += e.len;
    else legs.push({ name: e.name, kind: e.kind, length: e.len });
  }
  length += sFrom.dist + sTo.dist;
  return { ok: true, pts, length, legs, snapFrom: sFrom.dist, snapTo: sTo.dist };
}

/** Human directions from the legs — one line per named stretch, short ones merged. */
export function describeLegs(legs) {
  const out = [];
  for (const l of legs) {
    if (l.length < 12 && out.length) {
      out[out.length - 1].length += l.length;
      continue;
    }
    out.push({ ...l });
  }
  const KIND = { foot: "the walkway", steps: "the steps", cycle: "the bike path", service: "the service drive", street: "the street" };
  return out.map((l) => `${l.name ? `Follow ${l.name}` : `Follow ${KIND[l.kind] || "the path"}`} for ${Math.round(l.length)} m`);
}
