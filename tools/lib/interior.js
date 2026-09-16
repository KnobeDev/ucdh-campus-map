// Connectors between a floor's footprints, and an inferred interior.
//
// CONNECTORS (linkRings). A tier with several OSM rings — the three towers,
// plus the Pavilion on 2–3 — is one building in reality: the printed plan
// draws each floor as a single connected band. The plan is oblique and not to
// scale, so it decides only the TOPOLOGY (which ring joins which: nearest
// neighbours, a chain); the GEOMETRY of each connector comes from the rings
// themselves — a corridor-width band between the two facing edges, inset a
// little into each ring so the pieces overlap into one solid mass.
//
// INTERIOR (planFloor). Nobody has traced the corridors, so they are inferred
// on a building-aligned grid: a corridor spine from the main elevator to every
// elevator, stairwell, entrance and connector, a spur to each room's door,
// rooms as the cells nearest their node (a grid Voronoi), a partition wall
// wherever two rooms meet and between a room and the corridor except at its
// door. The grid model itself lives in 3d/interior-core.js, so the browser
// walks and routes on exactly what is planned here.
"use strict";

const core = require("../../3d/interior-core.js");
const { centroid, contains } = require("./geom");

const LINK_WIDTH = 9; // metres — the connector's width across the gap
const LINK_OVERLAP = 2; // metres each connector reaches into the rings it joins
const ENTRANCE_GAP = 2.0; // metres of perimeter wall cleared either side of a door
const LOBBY_R = 8; // metres: open floor around each entrance, so a door never opens into a closet
const PERIMETER_STEP = 0.5; // metres between perimeter samples
const TURN_COST = 2; // corridors prefer straight runs and L-turns to staircases
const NODE_CELL_COST = 8; // a corridor avoids running over another room's node
const NODE_CLEARANCE = core.WALL_MARGIN + 0.2; // no wall this close to a room, elevator, stairs or door point

// --- segments ------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function closestOnSeg(p, a, b) {
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
  return { t, p: lerp(a, b, t) };
}

/** Closest points between two segments (endpoint-to-segment suffices for planar rings that don't cross). */
function segSegClosest(a1, a2, b1, b2) {
  let best = null;
  const consider = (pa, pb) => {
    const d = len(sub(pa, pb));
    if (!best || d < best.d) best = { d, pa, pb };
  };
  for (const p of [b1, b2]) consider(closestOnSeg(p, a1, a2).p, p);
  for (const p of [a1, a2]) consider(p, closestOnSeg(p, b1, b2).p);
  return best;
}

const edgesOf = (ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);

/**
 * The closest pair of edges between two rings. Several pairs tie at a shared
 * corner, so ties go to the pair that FACES across the gap — edges most
 * perpendicular to the gap vector — or, for touching rings, the most parallel.
 */
function facingEdges(A, B) {
  let best = null;
  for (const [a1, a2] of edgesOf(A)) {
    const da = sub(a2, a1);
    const la = len(da);
    if (la < 0.05) continue;
    for (const [b1, b2] of edgesOf(B)) {
      const db = sub(b2, b1);
      const lb = len(db);
      if (lb < 0.05) continue;
      const c = segSegClosest(a1, a2, b1, b2);
      const parallel = Math.abs((da[0] * db[0] + da[1] * db[1]) / (la * lb));
      let score = parallel;
      if (c.d > 0.3) {
        const g = sub(c.pb, c.pa);
        const along = (e, l) => Math.abs((e[0] * g[0] + e[1] * g[1]) / (l * c.d));
        score = 2 - along(da, la) - along(db, lb); // higher = both edges square to the gap
      }
      if (!best || c.d < best.d - 0.05 || (Math.abs(c.d - best.d) <= 0.05 && score > best.score)) {
        best = { d: c.d, pa: c.pa, pb: c.pb, a1, a2, b1, b2, score };
      }
    }
  }
  return best;
}

/** Inward unit normal of edge a1→a2 for its ring — probed by containment, since a concave ring's centroid can sit on the wrong side. */
function inwardNormal(a1, a2, ring) {
  const d = sub(a2, a1);
  const l = len(d) || 1;
  const n = [-d[1] / l, d[0] / l];
  const mid = lerp(a1, a2, 0.5);
  return contains(ring, [mid[0] + n[0] * 0.5, mid[1] + n[1] * 0.5]) ? n : [-n[0], -n[1]];
}

/**
 * A band of `width` between the facing edges of rings A and B, reaching
 * `overlap` into each. With `within` (the podium envelope) the band slides
 * along the facing edges to the position nearest the middle that lies inside it.
 */
function bridge(A, B, width, overlap, within) {
  const f = facingEdges(A, B);
  const da = sub(f.a2, f.a1);
  const la = len(da);
  const ua = [da[0] / la, da[1] / la];
  // Where along A's edge does B face it? The middle of the overlap of B's
  // edge projected onto A's; failing any overlap (a corner facing an edge),
  // the closest point itself.
  const proj = (p) => (p[0] - f.a1[0]) * ua[0] + (p[1] - f.a1[1]) * ua[1];
  const lo = Math.max(0, Math.min(proj(f.b1), proj(f.b2)));
  const hi = Math.min(la, Math.max(proj(f.b1), proj(f.b2)));
  const mid = hi > lo ? (lo + hi) / 2 : proj(f.pa);
  const candidates = [mid];
  for (let k = 1.5; hi > lo && k <= (hi - lo) / 2; k += 1.5) candidates.push(mid + k, mid - k);
  let ring = null;
  for (const tA of candidates) {
    ring = bandAt(f, A, B, tA, width, overlap);
    if (!within || ring.every((p) => contains(within, p))) break;
  }
  return { ring, gap: f.d };
}

function bandAt(f, A, B, tA, width, overlap) {
  const da = sub(f.a2, f.a1);
  const la = len(da);
  const pA = lerp(f.a1, f.a2, tA / la);
  const cB = closestOnSeg(pA, f.b1, f.b2);
  const db = sub(f.b2, f.b1);
  const lb = len(db);
  const tB = cB.t * lb;
  // `width` metres of the edge around t; at a corner the span slides along the
  // edge rather than shrinking, so the band never narrows below a corridor.
  const span = (p1, p2, l, t) => {
    let t0 = Math.max(0, t - width / 2);
    let t1 = Math.min(l, t0 + width);
    t0 = Math.max(0, t1 - width);
    return [lerp(p1, p2, t0 / l), lerp(p1, p2, t1 / l)];
  };
  const [a1, a2] = span(f.a1, f.a2, la, tA);
  let [b1, b2] = span(f.b1, f.b2, lb, tB);
  // a1→a2→b2→b1 is a simple quad only if the b side runs the other way.
  const dot = (b2[0] - b1[0]) * (a2[0] - a1[0]) + (b2[1] - b1[1]) * (a2[1] - a1[1]);
  if (dot < 0) [b1, b2] = [b2, b1];
  const na = inwardNormal(f.a1, f.a2, A);
  const nb = inwardNormal(f.b1, f.b2, B);
  const push = (p, n) => [round(p[0] + n[0] * overlap), round(p[1] + n[1] * overlap)];
  return [push(a1, na), push(a2, na), push(b2, nb), push(b1, nb)];
}

/**
 * Connector rings joining every footprint of a floor into one piece: a
 * minimum spanning tree over ring-to-ring gaps (nearest neighbours), one
 * band per tree edge.
 * @param {Array} [opts.within]  a polygon every connector must stay inside (the podium envelope)
 * @returns {Array<{ring, between: [i, j], gap}>}
 */
function linkRings(rings, { width = LINK_WIDTH, overlap = LINK_OVERLAP, within = null } = {}) {
  if (rings.length < 2) return [];
  const pairs = [];
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) pairs.push({ i, j, d: facingEdges(rings[i], rings[j]).d });
  }
  pairs.sort((p, q) => p.d - q.d);
  const parent = rings.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const links = [];
  for (const p of pairs) {
    if (find(p.i) === find(p.j)) continue;
    parent[find(p.i)] = find(p.j);
    const b = bridge(rings[p.i], rings[p.j], width, overlap, within);
    links.push({ ring: b.ring, between: [p.i, p.j], gap: round(b.gap, 1) });
  }
  return links;
}

// --- the interior plan ----------------------------------------------------------------

class Heap {
  constructor() { this.a = []; }
  push(d, v) {
    const a = this.a;
    a.push([d, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
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
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Cheapest 4-connected path from `start` to any cell satisfying `isTarget`,
 * with a turn penalty so corridors run straight. Returns cell ids, start first.
 */
function corridorPath(grid, start, isTarget, costOf) {
  const { frame, canStep } = grid;
  const n = frame.cols * frame.rows;
  const dist = new Float64Array(n * 4).fill(Infinity);
  const prev = new Int32Array(n * 4).fill(-1);
  const heap = new Heap();
  for (let d = 0; d < 4; d++) { dist[start * 4 + d] = 0; heap.push(0, start * 4 + d); }
  let end = -1;
  while (heap.size) {
    const [d, s] = heap.pop();
    if (d > dist[s]) continue;
    const id = s >> 2;
    const dir = s & 3;
    if (isTarget(id)) { end = s; break; }
    const i = id % frame.cols;
    const j = (id - i) / frame.cols;
    for (let nd = 0; nd < 4; nd++) {
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (!core.inGrid(frame, ni, nj)) continue;
      const nid = nj * frame.cols + ni;
      if (!canStep(id, nid)) continue;
      const ns = nid * 4 + nd;
      const c = d + costOf(nid) + (nd === dir ? 0 : TURN_COST);
      if (c < dist[ns]) { dist[ns] = c; prev[ns] = s; heap.push(c, ns); }
    }
  }
  if (end < 0) return null;
  const path = [];
  for (let s = end; s !== -1; s = prev[s]) {
    const id = s >> 2;
    if (path[path.length - 1] !== id) path.push(id);
  }
  return path.reverse();
}

/**
 * Grid Voronoi: each unclaimed cell goes to the room whose node is nearest by
 * walking. Distance flows THROUGH corridor cells (a department has rooms on
 * both sides of its corridor) but corridor cells are never claimed.
 */
function assignRooms(grid, cells, roomCells) {
  const { frame, canStep } = grid;
  const n = cells.length;
  const dist = new Float64Array(n).fill(Infinity);
  const owner = new Int16Array(n).fill(-1);
  const heap = new Heap();
  roomCells.forEach((id, k) => {
    if (id < 0) return;
    dist[id] = 0;
    owner[id] = k;
    heap.push(0, id);
  });
  while (heap.size) {
    const [d, id] = heap.pop();
    if (d > dist[id]) continue;
    const i = id % frame.cols;
    const j = (id - i) / frame.cols;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (!core.inGrid(frame, ni, nj)) continue;
        const nid = nj * frame.cols + ni;
        if (cells[nid] > core.OPEN || !canStep(id, nid) || (di && dj && !(canStep(id, id + di) && canStep(id, id + dj * frame.cols)))) continue;
        const c = d + Math.hypot(di, dj);
        if (c < dist[nid]) { dist[nid] = c; owner[nid] = owner[id]; heap.push(c, nid); }
      }
    }
  }
  for (let id = 0; id < n; id++) if (cells[id] === core.OPEN && owner[id] >= 0) cells[id] = core.ROOM0 + owner[id];
}

/** Connected pieces (4-neighbour) of one room's cells: each gets its own door. */
function pieces(frame, cells, value) {
  const seen = new Uint8Array(cells.length);
  const out = [];
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] !== value || seen[s]) continue;
    const piece = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const id = stack.pop();
      piece.push(id);
      const i = id % frame.cols;
      const j = (id - i) / frame.cols;
      for (const [di, dj] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (!core.inGrid(frame, ni, nj)) continue;
        const nid = nj * frame.cols + ni;
        if (cells[nid] === value && !seen[nid]) { seen[nid] = 1; stack.push(nid); }
      }
    }
    out.push(piece);
  }
  return out;
}

/** Perimeter walls: ring edges sampled, minus stretches inside another ring or link, minus door gaps. */
function perimeterWalls(rings, links, entrances) {
  const all = [...rings, ...links.map((l) => l.ring)];
  const out = [];
  const nearEdge = (p, ring, tol) => edgesOf(ring).some(([a, b]) => len(sub(closestOnSeg(p, a, b).p, p)) < tol);
  all.forEach((ring, k) => {
    for (const [a, b] of edgesOf(ring)) {
      const l = len(sub(b, a));
      if (l < 0.05) continue;
      // Every edge, however short, and every sample INCLUDING the far vertex: a
      // run that stopped one sample short left a slit of daylight at each corner.
      const steps = Math.max(1, Math.ceil(l / PERIMETER_STEP));
      let run = null;
      const flush = () => { if (run && len(sub(run[1], run[0])) >= 0.1) out.push([...run[0], ...run[1]].map((v) => round(v))); run = null; };
      for (let s = 0; s <= steps; s++) {
        const p = lerp(a, b, Math.min(1, s / steps));
        const keep = !all.some((o, m) => m !== k && (contains(o, p) || (m < k && nearEdge(p, o, 0.1))))
          && !entrances.some((e) => Math.hypot(e.x - p[0], e.z - p[1]) < ENTRANCE_GAP);
        if (keep && !run) run = [p, p];
        if (keep) run[1] = p;
        if (!keep) flush();
      }
      flush();
    }
  });
  return out;
}

/**
 * Plan a floor's interior.
 * @param {object} floor  { id, rings, links, nodes, stairs, entrances: [{x, z}] (points just inside the doors) }
 * @returns {object} interior: { frame, cells, walls, perimeter, rooms, doors, corridorCells }
 */
function planFloor(floor) {
  const rings = [...floor.rings, ...floor.links.map((l) => l.ring)];
  const frame = core.makeFrame(rings);
  const n = frame.cols * frame.rows;
  const cells = new Int16Array(n).fill(core.OUTSIDE);
  const zone = new Int16Array(n).fill(-1); // ring index, or -(link index + 1)
  for (let j = 0; j < frame.rows; j++) {
    for (let i = 0; i < frame.cols; i++) {
      const id = j * frame.cols + i;
      const [x, z] = core.cellCenter(frame, i, j);
      const li = floor.links.findIndex((l) => contains(l.ring, [x, z]));
      if (li >= 0) { zone[id] = -(li + 1); cells[id] = core.CORRIDOR; continue; }
      const ri = floor.rings.findIndex((r) => contains(r, [x, z]));
      if (ri >= 0) { zone[id] = ri; cells[id] = core.OPEN; }
    }
  }
  const isLink = (id) => zone[id] < 0 && cells[id] !== core.OUTSIDE;
  const canStep = (a, b) => cells[b] !== core.OUTSIDE && (zone[a] === zone[b] || isLink(a) || isLink(b));
  const grid = { frame, zone, canStep };
  // A node's cell — or, for a node hugging the wall whose cell centre falls
  // outside the ring, the nearest inside cell (the browser looks up the same way).
  const cellAt = (p) => {
    const c = core.insideCellNear({ frame, cells }, p.x, p.z);
    return c ? c.j * frame.cols + c.i : -1;
  };

  // Hubs, nearest first from the main elevator, each joined to what is reached so far.
  const elevators = floor.nodes.filter((nd) => nd.kind === "elevator");
  const main = elevators.find((nd) => nd.id === `T_${floor.id}_elev_main`) || elevators[0] || floor.nodes[0];
  const dMain = (p) => Math.hypot(p.x - main.x, p.z - main.z);
  const hubs = [
    ...elevators,
    ...(floor.stairs ? [floor.stairs] : []),
    ...(floor.entrances || []),
    ...floor.links.map((l) => { const [x, z] = centroid(l.ring); return { x, z, link: l }; }),
  ].sort((a, b) => dMain(a) - dMain(b));
  const reached = new Uint8Array(n);
  const rooms = floor.nodes.filter((nd) => nd.kind === "room");
  const roomCells = rooms.map(cellAt);
  const nodeCost = (id) => (roomCells.includes(id) ? NODE_CELL_COST : 1);
  const claim = (path, skipLast) => {
    for (const id of skipLast ? path.slice(0, -1) : path) { cells[id] = core.CORRIDOR; reached[id] = 1; }
  };
  const seed = cellAt(main);
  if (seed >= 0) { cells[seed] = core.CORRIDOR; reached[seed] = 1; }
  const unreachable = [];
  for (const h of hubs) {
    const c = cellAt(h);
    if (c < 0) { unreachable.push(h.id || "hub"); continue; }
    if (!reached[c]) {
      const path = corridorPath(grid, c, (id) => reached[id] === 1, nodeCost);
      if (!path) { unreachable.push(h.id || (h.link ? "link" : "stairs")); continue; }
      claim(path, false);
    }
    if (h.link) for (let id = 0; id < n; id++) if (zone[id] === -(floor.links.indexOf(h.link) + 1)) reached[id] = 1;
  }
  // A spur to each room's doorstep; the node's own cell stays room.
  rooms.map((r, k) => ({ r, k })).sort((a, b) => dMain(a.r) - dMain(b.r)).forEach(({ r, k }) => {
    const c = roomCells[k];
    if (c < 0) { unreachable.push(r.id); return; }
    if (reached[c]) return;
    const path = corridorPath(grid, c, (id) => reached[id] === 1, nodeCost);
    if (!path) { unreachable.push(r.id); return; }
    claim(path, false);
    cells[c] = core.OPEN; // the doorstep is corridor; the node itself is the room
  });

  // A lobby at each door: everything within LOBBY_R is open floor, never a
  // room, so no partition can box the entrance in (it happened: a 2 m slot).
  for (const e of floor.entrances || []) {
    for (let id = 0; id < n; id++) {
      if (cells[id] === core.OUTSIDE) continue;
      // A room whose node falls in the lobby (an information desk) is open-plan: labelled, not walled.
      const [x, z] = core.cellCenter(frame, id % frame.cols, Math.floor(id / frame.cols));
      if (Math.hypot(x - e.x, z - e.z) < LOBBY_R) { cells[id] = core.CORRIDOR; reached[id] = 1; }
    }
  }

  assignRooms(grid, cells, roomCells);

  // Doors: for each connected piece of each room, the piece's boundary with
  // the corridor (or open floor) nearest the room's node.
  const doorKeys = new Set();
  const doors = [];
  rooms.forEach((r, k) => {
    for (const piece of pieces(frame, cells, core.ROOM0 + k)) {
      let best = null;
      for (const id of piece) {
        const i = id % frame.cols;
        const j = (id - i) / frame.cols;
        for (const [di, dj] of DIRS) {
          const ni = i + di;
          const nj = j + dj;
          if (!core.inGrid(frame, ni, nj)) continue;
          const nid = nj * frame.cols + ni;
          if (cells[nid] !== core.CORRIDOR && cells[nid] !== core.OPEN) continue;
          if (zone[nid] !== zone[id] && !isLink(nid)) continue;
          const [cx, cz] = core.cellCenter(frame, i, j);
          const d = Math.hypot(cx - r.x, cz - r.z) + (cells[nid] === core.OPEN ? 1 : 0);
          if (!best || d < best.d) best = { d, i, j, di, dj };
        }
      }
      if (!best) continue;
      const { i, j, di, dj } = best;
      doorKeys.add(di === 1 ? `${i},${j},u` : di === -1 ? `${i - 1},${j},u` : dj === 1 ? `${i},${j},v` : `${i},${j - 1},v`);
      const [ax, az] = di ? core.toWorld(frame, i + (di === 1 ? 1 : 0), j + 0.5) : core.toWorld(frame, i + 0.5, j + (dj === 1 ? 1 : 0));
      doors.push({ room: r.id, x: round(ax), z: round(az) });
    }
  });

  // Walls on cell edges. A node that happens to sit on a cell edge must not end
  // up inside a wall: any edge within clearance of a node stays open.
  const walls = new Uint8Array(n);
  const points = [...floor.nodes, ...(floor.stairs ? [floor.stairs] : []), ...(floor.entrances || [])];
  const nearNode = (p1, p2) => points.some((p) => len(sub(closestOnSeg([p.x, p.z], p1, p2).p, [p.x, p.z])) < NODE_CLEARANCE);
  const solid = (a, b) => {
    if (cells[a] === core.OUTSIDE || cells[b] === core.OUTSIDE) return false;
    if (zone[a] !== zone[b] && !isLink(a) && !isLink(b)) return true; // two rings meeting outside a connector: the perimeter
    if (cells[a] === cells[b]) return false;
    if (cells[a] <= core.OPEN && cells[b] <= core.OPEN) return false; // corridor and open space flow together
    return true;
  };
  for (let j = 0; j < frame.rows; j++) {
    for (let i = 0; i < frame.cols; i++) {
      const id = j * frame.cols + i;
      if (i + 1 < frame.cols && solid(id, id + 1) && !doorKeys.has(`${i},${j},u`)
          && !nearNode(core.toWorld(frame, i + 1, j), core.toWorld(frame, i + 1, j + 1))) walls[id] |= core.WALL_U;
      if (j + 1 < frame.rows && solid(id, id + frame.cols) && !doorKeys.has(`${i},${j},v`)
          && !nearNode(core.toWorld(frame, i, j + 1), core.toWorld(frame, i + 1, j + 1))) walls[id] |= core.WALL_V;
    }
  }

  return {
    frame,
    cells: Array.from(cells),
    walls: Array.from(walls),
    perimeter: perimeterWalls(floor.rings, floor.links, floor.entrances || []),
    rooms: rooms.map((r) => r.id),
    doors,
    corridorCells: cells.reduce((s, c) => s + (c === core.CORRIDOR ? 1 : 0), 0),
    unreachable,
    provenance: "corridors and partitions inferred from room positions on a building-aligned grid — not surveyed",
  };
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { linkRings, planFloor, facingEdges, LINK_WIDTH, LINK_OVERLAP, LOBBY_R };
