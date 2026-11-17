// Routing — dense walkable grid that routes AROUND buildings.
// Passable categories (parking, amenity/parks) are treated as walkable space.
// Buildings of any other category are obstacles; segments crossing them are rejected.

const PASSABLE_CATS = new Set(["parking", "amenity"]);
const GRID_SPACING = 18;       // px between grid samples
const GRID_MARGIN  = 6;        // px buffer around buildings (avoid hugging walls)
const CONNECT_DIAG = true;     // include 8-direction grid neighbors

// ---- Geometry helpers ----
function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}
function buildingPolygon(b) {
  if (b.points && b.points.length >= 3) return b.points.map(p => ({ x: p[0], y: p[1] }));
  return [
    { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
  ];
}
/** Every outline of a building, as point lists: its parts when it has several, else its one shape. */
function buildingRings(b) {
  if (Array.isArray(b.parts) && b.parts.length) return b.parts.map(ring => ring.map(p => ({ x: p[0], y: p[1] })));
  return [buildingPolygon(b)];
}
function ringAABB(poly, m = 0) {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  return { x1: Math.min(...xs)-m, y1: Math.min(...ys)-m, x2: Math.max(...xs)+m, y2: Math.max(...ys)+m };
}
function inflatePoly(poly, m) {
  // Approximate inflation by pushing each vertex outward from centroid
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  cx /= poly.length; cy /= poly.length;
  return poly.map(p => {
    const dx = p.x - cx, dy = p.y - cy, L = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / L) * m, y: p.y + (dy / L) * m };
  });
}
function buildingAABB(b, m = 0) {
  const poly = buildingPolygon(b);
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  return { x1: Math.min(...xs)-m, y1: Math.min(...ys)-m, x2: Math.max(...xs)+m, y2: Math.max(...ys)+m };
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}
function segCrossesPolygon(p1, p2, poly) {
  // Reject if endpoints are inside (we already filter walkable points, but defensive)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (segIntersect(p1, p2, a, b)) return true;
  }
  return false;
}

const SIDE_SPACING = 30; // px between a building's side points, along its outline
const SIDE_CLEAR = GRID_MARGIN + 5; // px outside the outline: clear of the wall and its margin

/**
 * Points just outside a building's outlines, about SIDE_SPACING apart, that can be stood on.
 * Each is stepped straight out from the wall (along the edge's normal), on whichever side
 * `isWalkable` accepts, so it works for any outline, whichever way round it was drawn.
 */
function sidePoints(rings, isWalkable) {
  const out = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const count = Math.max(1, Math.round(len / SIDE_SPACING));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t;
        for (const sign of [1, -1]) {
          const x = mx + nx * SIDE_CLEAR * sign, y = my + ny * SIDE_CLEAR * sign;
          if (isWalkable(x, y)) { out.push({ x, y }); break; }
        }
      }
    }
  }
  return out;
}

/** The ids of the largest connected group of grid points (the others are sealed pockets). */
function mainComponent(nodes) {
  const seen = new Set();
  let best = new Set();
  for (const start of Object.keys(nodes)) {
    if (seen.has(start)) continue;
    const group = new Set([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      for (const { id } of nodes[queue.pop()].neighbors) {
        if (seen.has(id)) continue;
        seen.add(id); group.add(id); queue.push(id);
      }
    }
    if (group.size > best.size) best = group;
  }
  return best;
}

// ---- Build walking grid ----
function buildGraph() {
  const buildings = window.BUILDINGS;
  // A building shown as a marker (the site build, where OpenStreetMap has no outline for it)
  // has no shape to walk around: it is a point to route to, never an obstacle.
  const obstacles = buildings.filter(b => !PASSABLE_CATS.has(b.cat) && !b.marker);
  // One obstacle per outline: a building of several parts (the site build's Medical Center
  // is three OpenStreetMap buildings) blocks with every one of them.
  const obstaclePolys = obstacles.flatMap(b => buildingRings(b).map(ring => ({
    code: b.code,
    poly: inflatePoly(ring, GRID_MARGIN),
    aabb: ringAABB(ring, GRID_MARGIN + 4),
  })));

  // Construction zones — treat as obstacles for the duration of the closure.
  // window.CONSTRUCTION_ZONES is pre-filtered to active-only by edit-store.
  for (const z of (window.CONSTRUCTION_ZONES || [])) {
    if (!z.points || z.points.length < 3) continue;
    const poly = z.points.map(p => ({ x: p[0], y: p[1] }));
    const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
    obstaclePolys.push({
      code: `CZ_${z.id}`,
      poly: inflatePoly(poly, GRID_MARGIN),
      aabb: {
        x1: Math.min(...xs) - GRID_MARGIN - 4,
        y1: Math.min(...ys) - GRID_MARGIN - 4,
        x2: Math.max(...xs) + GRID_MARGIN + 4,
        y2: Math.max(...ys) + GRID_MARGIN + 4,
      },
    });
  }

  const W = (window.MAP_IMG?.w) || 1212;
  const H = (window.MAP_IMG?.h) || 1084;

  const nodes = {};
  const grid = {};   // ix,iy → id

  // 1) Sample grid points in walkable space
  const cols = Math.floor(W / GRID_SPACING);
  const rows = Math.floor(H / GRID_SPACING);
  function isWalkable(x, y) {
    for (const o of obstaclePolys) {
      if (x < o.aabb.x1 || x > o.aabb.x2 || y < o.aabb.y1 || y > o.aabb.y2) continue;
      if (pointInPoly({ x, y }, o.poly)) return false;
    }
    return true;
  }
  function segWalkable(p1, p2) {
    for (const o of obstaclePolys) {
      const sx1 = Math.min(p1.x, p2.x), sx2 = Math.max(p1.x, p2.x);
      const sy1 = Math.min(p1.y, p2.y), sy2 = Math.max(p1.y, p2.y);
      if (sx2 < o.aabb.x1 || sx1 > o.aabb.x2 || sy2 < o.aabb.y1 || sy1 > o.aabb.y2) continue;
      if (segCrossesPolygon(p1, p2, o.poly)) return false;
    }
    return true;
  }

  for (let iy = 0; iy <= rows; iy++) {
    for (let ix = 0; ix <= cols; ix++) {
      const x = ix * GRID_SPACING, y = iy * GRID_SPACING;
      if (!isWalkable(x, y)) continue;
      const id = `g_${ix}_${iy}`;
      nodes[id] = { x, y, neighbors: [] };
      grid[`${ix},${iy}`] = id;
    }
  }

  // 2) Connect grid neighbors
  const offsets = CONNECT_DIAG
    ? [[1,0],[0,1],[1,1],[-1,1]]
    : [[1,0],[0,1]];
  for (const k of Object.keys(grid)) {
    const [ix, iy] = k.split(",").map(Number);
    const aId = grid[k], a = nodes[aId];
    for (const [dx, dy] of offsets) {
      const bk = `${ix+dx},${iy+dy}`;
      const bId = grid[bk]; if (!bId) continue;
      const b = nodes[bId];
      if (!segWalkable(a, b)) continue;
      const w = Math.hypot(a.x - b.x, a.y - b.y);
      a.neighbors.push({ id: bId, w });
      b.neighbors.push({ id: aId, w });
    }
  }

  // 3) Add named/labelled nodes (preserved labels from data.jsx + edits)
  for (const [id, p] of Object.entries(window.GRAPH_NODES || {})) {
    if (!isWalkable(p.x, p.y)) continue;
    nodes[id] = { x: p.x, y: p.y, neighbors: [], label: p.label };
  }

  // 4) Add building anchors (route TO this point) at the centroid OR nearest walkable
  function snapToWalkable(x, y) {
    if (isWalkable(x, y)) return { x, y };
    // Spiral search outward
    for (let r = GRID_SPACING; r < 200; r += GRID_SPACING) {
      for (let a = 0; a < 360; a += 30) {
        const rad = (a * Math.PI) / 180;
        const nx = x + Math.cos(rad) * r, ny = y + Math.sin(rad) * r;
        if (isWalkable(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }
  // A building you cannot walk through on the map is left, and reached, by whichever side is
  // nearest the other end: points just outside its outline, a few paces apart, each tied to the
  // building itself. Without them a route began at one fixed spot beside the building, and a
  // neighbour on its far side read as a walk right round it (a 170 ft hop as 2,000 ft).
  const sidesOf = {}; // B_<code> -> ids of its side points
  for (const b of buildings) {
    const c = window.buildingCentroid ? window.buildingCentroid(b) : { cx: b.x + b.w/2, cy: b.y + b.h/2 };
    const id = `B_${b.code}`;
    const solid = !PASSABLE_CATS.has(b.cat) && !b.marker;
    const sides = solid ? sidePoints(buildingRings(b), isWalkable) : [];
    if (!sides.length) {
      const snapped = snapToWalkable(c.cx, c.cy);
      nodes[id] = { x: snapped.x, y: snapped.y, neighbors: [], building: b };
      continue;
    }
    nodes[id] = { x: c.cx, y: c.cy, neighbors: [], building: b };
    sidesOf[id] = sides.map((s, i) => {
      const sid = `BS_${b.code}_${i}`;
      const d = Math.hypot(s.x - c.cx, s.y - c.cy);
      nodes[sid] = { x: s.x, y: s.y, neighbors: [{ id, w: d }] };
      nodes[id].neighbors.push({ id: sid, w: d });
      return sid;
    });
  }
  for (const s of window.SHUTTLE_STOPS || []) {
    const snapped = snapToWalkable(s.x, s.y);
    nodes[`S_${s.id}`] = { x: snapped.x, y: snapped.y, neighbors: [], shuttle: s };
  }
  for (const p of window.POIS || []) {
    const snapped = snapToWalkable(p.x, p.y);
    nodes[`POI_${p.id}`] = { x: snapped.x, y: snapped.y, neighbors: [], poi: p };
  }
  for (const b of window.BUS_STOPS || []) {
    const snapped = snapToWalkable(b.x, b.y);
    nodes[`BUS_${b.id}`] = { x: snapped.x, y: snapped.y, neighbors: [], bus: b };
  }

  // 5) Connect special nodes (named, building, shuttle) to nearby grid.
  // Only to the grid's main body: real building outlines leave pockets (a courtyard, a gap
  // between a building and a closure) whose grid points connect to nothing else, and a place
  // tied only to a pocket could never be routed to.
  const main = mainComponent(nodes);
  const gridList = Object.entries(nodes).filter(([id]) => id.startsWith("g_") && main.has(id));
  function connectToGrid(id, k = 6) {
    const me = nodes[id];
    const candidates = gridList
      .map(([gid, gn]) => [gid, gn, Math.hypot(me.x - gn.x, me.y - gn.y)])
      .filter(([, , d]) => d < 90)
      .sort((a, b) => a[2] - b[2]);
    let added = 0;
    for (const [gid, gn, d] of candidates) {
      if (added >= k) break;
      if (!segWalkable(me, gn)) continue;
      me.neighbors.push({ id: gid, w: d });
      nodes[gid].neighbors.push({ id, w: d });
      added++;
    }
    // Nothing in clear sight: tie it to the nearest point of the main body, however far,
    // at three times the distance, so the place is still reachable and a clear way is preferred.
    if (added === 0) {
      let gid = null, d = Infinity;
      if (candidates.length) [gid, , d] = candidates[0];
      else for (const [g, gn] of gridList) { // rare: nothing within 90
        const dist = Math.hypot(me.x - gn.x, me.y - gn.y);
        if (dist < d) { d = dist; gid = g; }
      }
      if (gid !== null) {
        me.neighbors.push({ id: gid, w: d * 3 });
        nodes[gid].neighbors.push({ id, w: d * 3 });
      }
    }
  }
  for (const id of Object.keys(nodes)) {
    if (id.startsWith("g_")) continue;
    if (sidesOf[id]) continue; // a building with side points meets the grid through them
    connectToGrid(id, id.startsWith("B_") ? 4 : 6);
  }

  return nodes;
}

// ---- Path simplification (collapse collinear grid hops) ----
function simplifyPath(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1], b = points[i], c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    // Always keep user-pinned points so the pin marker can render and be alt-clickable
    if (b.pinned || Math.abs(cross) > 0.5) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function dijkstra(graph, start, end) {
  const dist = {}, prev = {}, visited = new Set();
  for (const id of Object.keys(graph)) dist[id] = Infinity;
  dist[start] = 0;
  // Simple priority loop (graphs are small enough that O(V^2) is fine)
  const remaining = new Set(Object.keys(graph));
  while (remaining.size) {
    let u = null, best = Infinity;
    for (const id of remaining) if (dist[id] < best) { best = dist[id]; u = id; }
    if (u === null) break;
    if (u === end) break;
    remaining.delete(u); visited.add(u);
    for (const { id: v, w } of graph[u].neighbors) {
      if (visited.has(v)) continue;
      const alt = dist[u] + w;
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    }
  }
  if (!isFinite(dist[end])) return null;
  const path = []; let cur = end;
  while (cur) { path.unshift(cur); cur = prev[cur]; }
  return { path, dist: dist[end] };
}

// Find the closest grid node to an arbitrary (x,y) — used to thread pins through Dijkstra.
function nearestGridNode(g, x, y) {
  let best = null, bestD = Infinity;
  for (const [id, n] of Object.entries(g)) {
    if (!id.startsWith("g_")) continue;
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

function buildRoute(fromId, toId) {
  const g = buildGraph();
  if (!g[fromId] || !g[toId]) return null;

  // Read user-pinned waypoints for this route, if any.
  const pins = (window.routePinStore?.get(fromId, toId)) || [];
  // For each pin, register it as a one-off node and snap it to the nearest grid node.
  const pinIds = [];
  pins.forEach((p, i) => {
    const pid = `pin_${i}`;
    // Add a node at the pin position, connected only to its nearest grid node so Dijkstra is forced through it.
    const nearest = nearestGridNode(g, p.x, p.y);
    if (!nearest) return;
    const d = Math.hypot(g[nearest].x - p.x, g[nearest].y - p.y);
    g[pid] = {
      x: p.x, y: p.y,
      neighbors: [{ id: nearest, w: d }],
      pin: true,
    };
    g[nearest].neighbors.push({ id: pid, w: d });
    pinIds.push(pid);
  });

  // Compute legs: from → pin1 → pin2 → … → to
  const sequence = [fromId, ...pinIds, toId];
  let totalDist = 0;
  let stitched = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const r = dijkstra(g, sequence[i], sequence[i + 1]);
    if (!r) return null;
    totalDist += r.dist;
    const pts = r.path.map(id => ({ id, x: g[id].x, y: g[id].y, node: g[id], pinned: g[id].pin === true }));
    if (i === 0) stitched.push(...pts);
    else stitched.push(...pts.slice(1));
  }

  // The length of the walk is the length of the line drawn, measured before it is simplified.
  // (Dijkstra's own total is a COST: it holds the threefold penalty on a place tied to the
  // grid across a wall, which made a short walk read several times too long.)
  totalDist = 0;
  for (let i = 1; i < stitched.length; i++) totalDist += Math.hypot(stitched[i].x - stitched[i - 1].x, stitched[i].y - stitched[i - 1].y);
  const points = simplifyPath(stitched);
  const sn = g[fromId], en = g[toId];
  const sName = sn.building?.name || sn.shuttle?.name || "Start";
  const eName = en.building?.name || en.shuttle?.name || "End";
  const steps = [{ icon: "start", text: `Start at ${sName}` }];
  for (let i = 1; i < points.length - 1; i++) {
    const pr = points[i - 1], cu = points[i], nx = points[i + 1];
    const cross = (cu.x - pr.x) * (nx.y - cu.y) - (cu.y - pr.y) * (nx.x - cu.x);
    if (Math.abs(cross) < 1) continue;
    const dist = Math.round(Math.hypot(nx.x - cu.x, nx.y - cu.y));
    steps.push({ icon: cross > 0 ? "right" : "left", text: `Turn ${cross > 0 ? "right" : "left"}`, dist });
  }
  // The site build knows the real scale from its data file's frame (site-data.js).
  const ftPerPx = window.MAP_SCALE?.ftPerPx || 2.0;
  const totalFt = Math.round(totalDist * ftPerPx);
  const totalMin = Math.max(1, Math.round(totalFt / 270));
  steps.push({ icon: "end", text: `Arrive at ${eName}` });
  return { points, distance: totalDist, totalFt, totalMin, steps, hasPins: pins.length > 0, pinCount: pins.length };
}

window.buildRoute = buildRoute;
window.buildGraph = buildGraph;
