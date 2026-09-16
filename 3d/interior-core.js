// The Medical Center's walkable model, shared by the data generator (which
// plans corridors and partitions with it), the node tests (which prove every
// room is reachable with it) and the browser (which collides and routes with
// it). No three.js here.
//
// A floor's interior is a grid of CELL-metre squares aligned with the building
// (the frame's u axis follows its longest wall). Each cell is outside, corridor,
// open, or owned by one room; walls sit on cell edges as two bits per cell
// (+u side, +v side). Perimeter walls are real ring edges, kept separately.
//
// Nothing in here is surveyed: the corridors and partitions are INFERRED from
// where the printed plan puts rooms and elevators. The README says so.

export const CELL = 3; // metres per grid cell — one cell is one corridor width, one door width
export const OUTSIDE = -1;
export const SOLID = -2; // an elevator shaft or stairwell: never walkable, never a room, corridors pass beside it
export const CORRIDOR = 0;
export const OPEN = 1; // floor area no room claimed: open to the corridor
export const ROOM0 = 2; // room k is stored as ROOM0 + k
export const WALL_U = 1; // bit: wall on the cell's +u edge
export const WALL_V = 2; // bit: wall on the cell's +v edge
export const WALL_T = 0.35; // wall thickness, metres (drawn and collided)
export const WALL_MARGIN = 0.45; // metres a walker keeps from a wall's centre line

/** Point in ring (ray casting), ring = [[x, z], ...]. */
export function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function centroidOf(ring) {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * a), cz / (3 * a)];
}

// --- frame ---------------------------------------------------------------------

/** Grid frame for a set of rings: u along the largest ring's longest edge. */
export function makeFrame(rings, cell = CELL, pad = 1) {
  let main = rings[0];
  let mainArea = 0;
  for (const r of rings) {
    const a = Math.abs(r.reduce((s, [x1, z1], i) => s + x1 * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * z1, 0)) / 2;
    if (a > mainArea) { mainArea = a; main = r; }
  }
  let best = 0;
  let ux = 1;
  let uz = 0;
  for (let i = 0; i < main.length; i++) {
    const [ax, az] = main[i];
    const [bx, bz] = main[(i + 1) % main.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > best) { best = l; ux = (bx - ax) / l; uz = (bz - az) / l; }
  }
  // Frame u/v extents of every vertex.
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const r of rings) {
    for (const [x, z] of r) {
      const u = x * ux + z * uz;
      const v = -x * uz + z * ux;
      if (u < minU) minU = u;
      if (v < minV) minV = v;
      if (u > maxU) maxU = u;
      if (v > maxV) maxV = v;
    }
  }
  minU -= pad * cell;
  minV -= pad * cell;
  const cols = Math.ceil((maxU - minU) / cell) + pad;
  const rows = Math.ceil((maxV - minV) / cell) + pad;
  // Origin: world point at (u = minU, v = minV).
  const ox = minU * ux - minV * uz;
  const oz = minU * uz + minV * ux;
  return { ox: r2(ox), oz: r2(oz), ux: r6(ux), uz: r6(uz), cell, cols, rows };
}

const r2 = (v) => Math.round(v * 100) / 100;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** Fractional grid coordinates of a world point. */
export function toGrid(frame, x, z) {
  const dx = x - frame.ox;
  const dz = z - frame.oz;
  return { u: (dx * frame.ux + dz * frame.uz) / frame.cell, v: (-dx * frame.uz + dz * frame.ux) / frame.cell };
}

export function cellOf(frame, x, z) {
  const { u, v } = toGrid(frame, x, z);
  return { i: Math.floor(u), j: Math.floor(v) };
}

/** World point of grid coordinates (u, v) — cell (i, j)'s centre is (i + 0.5, j + 0.5). */
export function toWorld(frame, u, v) {
  const du = u * frame.cell;
  const dv = v * frame.cell;
  return [frame.ox + du * frame.ux - dv * frame.uz, frame.oz + du * frame.uz + dv * frame.ux];
}

export const cellCenter = (frame, i, j) => toWorld(frame, i + 0.5, j + 0.5);
export const idx = (frame, i, j) => j * frame.cols + i;
export const inGrid = (frame, i, j) => i >= 0 && j >= 0 && i < frame.cols && j < frame.rows;

/** Is there a wall between cell (i, j) and its neighbour in direction (di, dj)? */
export function wallBetween(interior, i, j, di, dj) {
  const { frame, walls } = interior;
  if (di === 1) return (walls[idx(frame, i, j)] & WALL_U) !== 0;
  if (di === -1) return inGrid(frame, i - 1, j) ? (walls[idx(frame, i - 1, j)] & WALL_U) !== 0 : false;
  if (dj === 1) return (walls[idx(frame, i, j)] & WALL_V) !== 0;
  return inGrid(frame, i, j - 1) ? (walls[idx(frame, i, j - 1)] & WALL_V) !== 0 : false;
}

// --- walls as world segments ---------------------------------------------------------

/**
 * Interior walls as world segments [x1, z1, x2, z2], collinear runs merged.
 * Perimeter walls are not included; they are `interior.perimeter`.
 */
export function wallSegments(interior) {
  const { frame, walls } = interior;
  const out = [];
  // +u walls: vertical lines at u = i + 1, runs along v.
  for (let i = 0; i < frame.cols; i++) {
    let start = -1;
    for (let j = 0; j <= frame.rows; j++) {
      const on = j < frame.rows && (walls[idx(frame, i, j)] & WALL_U) !== 0;
      if (on && start < 0) start = j;
      if (!on && start >= 0) {
        out.push([...toWorld(frame, i + 1, start), ...toWorld(frame, i + 1, j)]);
        start = -1;
      }
    }
  }
  for (let j = 0; j < frame.rows; j++) {
    let start = -1;
    for (let i = 0; i <= frame.cols; i++) {
      const on = i < frame.cols && (walls[idx(frame, i, j)] & WALL_V) !== 0;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push([...toWorld(frame, start, j + 1), ...toWorld(frame, i, j + 1)]);
        start = -1;
      }
    }
  }
  return out.map((s) => s.map(r2));
}

function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  return Math.hypot(x1 + t * dx - px, z1 + t * dz - pz);
}

/** Distance from a world point to the nearest grid wall around its cell. */
function nearestGridWall(interior, x, z) {
  const { frame } = interior;
  const { i: ci, j: cj } = cellOf(frame, x, z);
  let best = Infinity;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (!inGrid(frame, i, j)) continue;
      const w = interior.walls[idx(frame, i, j)];
      if (!w) continue;
      if (w & WALL_U) {
        const [ax, az] = toWorld(frame, i + 1, j);
        const [bx, bz] = toWorld(frame, i + 1, j + 1);
        best = Math.min(best, distToSeg(x, z, ax, az, bx, bz));
      }
      if (w & WALL_V) {
        const [ax, az] = toWorld(frame, i, j + 1);
        const [bx, bz] = toWorld(frame, i + 1, j + 1);
        best = Math.min(best, distToSeg(x, z, ax, az, bx, bz));
      }
    }
  }
  return best;
}

/**
 * Can a walker stand at (x, z)? Inside one of the floor's rings (footprints
 * and connectors) and clear of every wall by WALL_MARGIN. This is the one
 * predicate the browser collides with and the tests flood-fill with.
 */
export function walkable(interior, rings, x, z, margin = WALL_MARGIN) {
  if (!rings.some((r) => inRing(r, x, z))) return false;
  const c = cellOf(interior.frame, x, z);
  if (inGrid(interior.frame, c.i, c.j) && interior.cells[idx(interior.frame, c.i, c.j)] === SOLID) return false;
  if (nearestGridWall(interior, x, z) < margin) return false;
  for (const [x1, z1, x2, z2] of interior.perimeter) {
    if (distToSeg(x, z, x1, z1, x2, z2) < margin) return false;
  }
  return true;
}

// --- routing -----------------------------------------------------------------

/** Nearest inside cell to a world point (its own cell, else a neighbour). */
export function insideCellNear(interior, x, z) {
  const { frame, cells } = interior;
  const { i, j } = cellOf(frame, x, z);
  let best = null;
  for (let r = 0; r <= 2 && !best; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ci = i + di;
        const cj = j + dj;
        if (!inGrid(frame, ci, cj) || cells[idx(frame, ci, cj)] === OUTSIDE || cells[idx(frame, ci, cj)] === SOLID) continue;
        const [cx, cz] = cellCenter(frame, ci, cj);
        const d = Math.hypot(cx - x, cz - z);
        if (!best || d < best.d) best = { i: ci, j: cj, d };
      }
    }
  }
  return best;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Shortest walk along the grid between two world points, honouring walls.
 * @returns {{pts: Array<[number, number]>, length: number} | null}
 */
export function routeIndoor(interior, from, to) {
  const { frame, cells } = interior;
  const a = insideCellNear(interior, from.x, from.z);
  const b = insideCellNear(interior, to.x, to.z);
  if (!a || !b) return null;
  const n = frame.cols * frame.rows;
  const start = idx(frame, a.i, a.j);
  const goal = idx(frame, b.i, b.j);
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  dist[start] = 0;
  // Plain BFS-with-heap over uniform costs (a tiny Dijkstra keeps it exact when
  // turn costs are added later); A* isn't needed at these sizes.
  const heap = [[0, start]];
  const push = (item) => {
    heap.push(item);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, id] = pop();
    if (d > dist[id]) continue;
    if (id === goal) break;
    const i = id % frame.cols;
    const j = (id - i) / frame.cols;
    for (const [di, dj] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (!inGrid(frame, ni, nj)) continue;
      const nid = idx(frame, ni, nj);
      if (cells[nid] === OUTSIDE || cells[nid] === SOLID || wallBetween(interior, i, j, di, dj)) continue;
      const nd = d + 1;
      if (nd < dist[nid]) {
        dist[nid] = nd;
        prev[nid] = id;
        push([nd, nid]);
      }
    }
  }
  if (dist[goal] === Infinity) return null;
  const chain = [];
  for (let id = goal; id !== -1; id = prev[id]) chain.push(id);
  chain.reverse();
  let centres = chain.map((id) => cellCenter(frame, id % frame.cols, Math.floor(id / frame.cols)));
  // Don't send the walker back to the middle of the cell they are standing in
  // (or on to the middle of the goal's cell past the goal): two route cells are
  // adjacent with no wall between them, so their union is a convex rectangle
  // and the straight step from an endpoint inside one to the centre of the
  // other stays clear of every wall.
  if (chain.length >= 2) {
    const c0 = cellOf(frame, from.x, from.z);
    const cn = cellOf(frame, to.x, to.z);
    if (c0.i === a.i && c0.j === a.j) centres = centres.slice(1);
    if (cn.i === b.i && cn.j === b.j) centres = centres.slice(0, -1);
  }
  const pts = simplify([[from.x, from.z], ...centres, [to.x, to.z]]);
  let length = 0;
  for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return { pts, length };
}

/** Drop points that sit on the straight line between their neighbours. */
function simplify(pts) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const [ax, az] = out[out.length - 1];
    const [bx, bz] = pts[k];
    const [cx, cz] = pts[k + 1];
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const dot = (bx - ax) * (cx - bx) + (bz - az) * (cz - bz);
    if (Math.abs(cross) < 1e-6 && dot >= 0) continue;
    out.push(pts[k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
