// Infers a walkable interior for a Medical Center floor from what is known:
// the floor's real footprint rings and the rooms, elevators, stairs and doors
// already placed on it. Nothing here is surveyed — the printed plan draws
// departments with walls between them but is oblique and not to scale, so it
// is never traced. Instead:
//
//   corridors   a tree of straight hallways, CORRIDOR_W wide, grown from the
//               main elevator to every room, elevator, stairwell and door in
//               nearest-first order over a 1 m grid of the floor (Prim over
//               grid distances), each leg straightened by line of sight;
//   walls       partitions between departments: the Voronoi boundaries of the
//               room nodes, clipped to the floor, with a door gap wherever a
//               corridor crosses them;
//   outline     the exterior wall pieces after the floor's rings are unioned —
//               a stretch of a ring that lies inside another ring (a tower
//               edge inside a connector band) is not a wall.
//
// Everything is plain data ([[x, z], ...] polylines and [[a], [b]] segments)
// so hospital.js can draw it, player.js can collide with it, route-core.js
// can route along it, and tests can flood-fill it.
"use strict";

const { bbox, contains } = require("./geom");

const CORRIDOR_W = 3.0; // metres; also the width of a door gap in a partition
const CELL = 1.0; // grid cell, metres
const HUG = 2; // cells: a corridor this close to the outer wall costs extra
const HUG_PENALTY = 2.0;
const GAP_MARGIN = 0.35; // a partition stops this far short of the corridor edge
const MIN_WALL = 0.5; // shorter wall pieces are dropped
const RUN_GAP = 2.0; // metres of missing boundary that splits one wall into two
const TERMINAL_SNAP = 4; // cells: how far a terminal may be from a walkable cell

// --- grid -------------------------------------------------------------------

function makeGrid(rings) {
  const b = bbox(rings.flat());
  const minX = Math.floor(b.minX) - 1;
  const minZ = Math.floor(b.minZ) - 1;
  const cols = Math.ceil(b.maxX - minX) + 2;
  const rows = Math.ceil(b.maxZ - minZ) + 2;
  // A half-cell raster of "inside the floor": cell centres are the odd
  // samples, and the sample between two centres says whether the step
  // between them crosses a wall — two footprints that nearly touch leave a
  // sliver of outside between cells that are each inside.
  const fineCols = 2 * cols + 1;
  const fine = new Uint8Array(fineCols * (2 * rows + 1));
  for (let fr = 0; fr <= 2 * rows; fr++) {
    for (let fc = 0; fc <= 2 * cols; fc++) {
      const x = minX + fc * (CELL / 2);
      const z = minZ + fr * (CELL / 2);
      if (rings.some((ring) => contains(ring, [x, z]))) fine[fr * fineCols + fc] = 1;
    }
  }
  const walkable = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) walkable[r * cols + c] = fine[(2 * r + 1) * fineCols + 2 * c + 1];
  /** May the walker step from cell (c, r) to (c + dc, r + dr) without leaving the floor? */
  const stepOk = (c, r, dc, dr) => fine[(2 * r + 1 + dr) * fineCols + 2 * c + 1 + dc] === 1;
  // Distance (in cells, 8-connected) to the nearest non-walkable cell.
  const edgeDist = new Int16Array(cols * rows).fill(-1);
  let frontier = [];
  for (let i = 0; i < walkable.length; i++) if (!walkable[i]) { edgeDist[i] = 0; frontier.push(i); }
  let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const i of frontier) {
      const c = i % cols;
      const r = (i - c) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const j = nr * cols + nc;
          if (edgeDist[j] !== -1) continue;
          edgeDist[j] = d;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  const at = (x, z) => {
    const c = Math.floor((x - minX) / CELL);
    const r = Math.floor((z - minZ) / CELL);
    return r < 0 || c < 0 || r >= rows || c >= cols ? -1 : r * cols + c;
  };
  const centre = (i) => {
    const c = i % cols;
    const r = (i - c) / cols;
    return [minX + (c + 0.5) * CELL, minZ + (r + 0.5) * CELL];
  };
  return { minX, minZ, cols, rows, walkable, edgeDist, at, centre, stepOk };
}

/** Nearest walkable cell to (x, z), within TERMINAL_SNAP cells; -1 if none. */
function snapCell(grid, x, z) {
  const i0 = grid.at(x, z);
  if (i0 >= 0 && grid.walkable[i0]) return i0;
  let best = -1;
  let bestD = Infinity;
  const c0 = Math.floor((x - grid.minX) / CELL);
  const r0 = Math.floor((z - grid.minZ) / CELL);
  for (let r = r0 - TERMINAL_SNAP; r <= r0 + TERMINAL_SNAP; r++) {
    for (let c = c0 - TERMINAL_SNAP; c <= c0 + TERMINAL_SNAP; c++) {
      if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
      const i = r * grid.cols + c;
      if (!grid.walkable[i]) continue;
      const [px, pz] = grid.centre(i);
      const d = Math.hypot(px - x, pz - z);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

// --- geometry helpers ----------------------------------------------------------

const segDist = (ax, az, bx, bz, x, z) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + t * dx - x, az + t * dz - z);
};

/** Nearest point on a polyline to (x, z): {d, pl, i (segment index), x, z}. */
function nearestOnPolylines(polylines, x, z) {
  let best = null;
  polylines.forEach((pl, p) => {
    for (let i = 1; i < pl.length; i++) {
      const [ax, az] = pl[i - 1];
      const [bx, bz] = pl[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const d = Math.hypot(px - x, pz - z);
      if (!best || d < best.d) best = { d, pl: p, i, x: px, z: pz };
    }
  });
  return best;
}

const inFloor = (rings, x, z) => rings.some((r) => contains(r, [x, z]));

/** Straight line of sight inside the floor with half a metre of margin. */
function clear(rings, [ax, az], [bx, bz]) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / 0.5));
  for (let s = 0; s <= n; s++) {
    const x = ax + (bx - ax) * (s / n);
    const z = az + (bz - az) * (s / n);
    if (!inFloor(rings, x, z)) return false;
    // margin, except right at the ends (a terminal may stand close to a wall)
    if (s === 0 || s === n) continue;
    for (const [ox, oz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
      if (!inFloor(rings, x + ox, z + oz)) return false;
    }
  }
  return true;
}

/** Greedy farthest-visible-point simplification of a corridor centreline. */
function straighten(rings, pts) {
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(rings, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// --- corridors ---------------------------------------------------------------------

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

/** Multi-source Dijkstra over walkable cells from every corridor cell. */
function distancesFrom(grid, sources) {
  const { cols, rows, walkable, edgeDist } = grid;
  const dist = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const heap = new Heap();
  for (const s of sources) { dist[s] = 0; heap.push({ id: s, d: 0 }); }
  while (heap.size) {
    const { id, d } = heap.pop();
    if (d > dist[id]) continue;
    const c = id % cols;
    const r = (id - c) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const j = nr * cols + nc;
        if (!walkable[j] || !grid.stepOk(c, r, dc, dr)) continue;
        // no corner cutting through a wall
        if (dr && dc && (!walkable[r * cols + nc] || !walkable[nr * cols + c])) continue;
        const step = (dr && dc ? Math.SQRT2 : 1) * (edgeDist[j] <= HUG ? 1 + HUG_PENALTY : 1);
        const nd = d + step;
        if (nd < dist[j]) {
          dist[j] = nd;
          prev[j] = id;
          heap.push({ id: j, d: nd });
        }
      }
    }
  }
  return { dist, prev };
}

/** Every cell within half a corridor width of the polyline. */
function bandCells(grid, pl, into) {
  const half = CORRIDOR_W / 2;
  const b = bbox(pl);
  const c0 = Math.max(0, Math.floor((b.minX - half - grid.minX) / CELL));
  const c1 = Math.min(grid.cols - 1, Math.floor((b.maxX + half - grid.minX) / CELL));
  const r0 = Math.max(0, Math.floor((b.minZ - half - grid.minZ) / CELL));
  const r1 = Math.min(grid.rows - 1, Math.floor((b.maxZ + half - grid.minZ) / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * grid.cols + c;
      if (!grid.walkable[i]) continue;
      const [x, z] = grid.centre(i);
      for (let k = 1; k < pl.length; k++) {
        if (segDist(pl[k - 1][0], pl[k - 1][1], pl[k][0], pl[k][1], x, z) <= half) { into.add(i); break; }
      }
    }
  }
}

/**
 * Grow the corridor tree: from the seed, repeatedly reach the nearest
 * unconnected terminal and add the straightened leg to it.
 * @returns {Array<Array<[number, number]>>} polylines; legs join existing
 *   legs at a shared vertex, so a coordinate-keyed graph (route-core) joins them.
 */
function growCorridors(rings, grid, seed, terminals) {
  const polylines = [];
  const corridorCells = new Set();
  const seedCell = snapCell(grid, seed.x, seed.z);
  if (seedCell < 0) throw new Error("interior: the seed elevator is not on walkable floor");
  corridorCells.add(seedCell);
  let pending = terminals
    .map((t) => ({ ...t, cell: snapCell(grid, t.x, t.z) }))
    .filter((t) => t.cell >= 0 && !(t.x === seed.x && t.z === seed.z));

  while (pending.length) {
    const { dist, prev } = distancesFrom(grid, corridorCells);
    let pick = null;
    for (const t of pending) if (dist[t.cell] < Infinity && (!pick || dist[t.cell] < dist[pick.cell])) pick = t;
    if (!pick) {
      // Unreachable on the grid: separate rings with no connector. Leave it.
      throw new Error(`interior: ${pending.map((t) => t.name).join(", ")} cannot be reached from the corridor network`);
    }
    pending = pending.filter((t) => t !== pick);

    // Trace the grid path from the terminal back to the corridor.
    const cells = [];
    for (let i = pick.cell; i !== -1; i = prev[i]) cells.push(i);
    cells.reverse(); // corridor end first
    const attachCell = cells[0];
    let attach;
    if (polylines.length === 0) {
      attach = [seed.x, seed.z];
    } else {
      const [cx, cz] = grid.centre(attachCell);
      const near = nearestOnPolylines(polylines, cx, cz);
      attach = joinAt(polylines[near.pl], near);
    }
    const raw = [attach, ...cells.slice(1).map((i) => grid.centre(i)), [pick.x, pick.z]];
    const leg = straighten(rings, dedupe(raw));
    if (leg.length >= 2) {
      polylines.push(leg.map(([x, z]) => [round(x), round(z)]));
      bandCells(grid, leg, corridorCells);
    }
    corridorCells.add(pick.cell);
  }
  return polylines;
}

/** Insert the join point into the polyline it lands on (or reuse a vertex within 0.3 m). */
function joinAt(pl, near) {
  const p = [round(near.x), round(near.z)];
  for (const i of [near.i - 1, near.i]) {
    if (Math.hypot(pl[i][0] - p[0], pl[i][1] - p[1]) < 0.3) return pl[i];
  }
  pl.splice(near.i, 0, p);
  return p;
}

const dedupe = (pts) => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05);

// --- partitions ------------------------------------------------------------------

/** Split a segment into the pieces where keep(x, z) holds, dropping short ones. */
function keepRuns([ax, az], [bx, bz], keep) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / 0.25));
  const out = [];
  let start = null;
  for (let s = 0; s <= n + 1; s++) {
    const t = Math.min(1, s / n);
    const ok = s <= n && keep(ax + (bx - ax) * t, az + (bz - az) * t);
    if (ok && start === null) start = t;
    if (!ok && start !== null) {
      const end = (s - 1) / n;
      if ((end - start) * len >= MIN_WALL) out.push([[ax + (bx - ax) * start, az + (bz - az) * start], [ax + (bx - ax) * end, az + (bz - az) * end]]);
      start = null;
    }
  }
  return out;
}

/**
 * Partition walls: Voronoi boundaries between room nodes over the walkable
 * grid, each boundary reduced to straight pieces on the true bisector, then
 * clipped to the floor and cut where a corridor passes.
 */
function partitionWalls(rings, grid, rooms, corridors) {
  if (rooms.length < 2) return [];
  const { cols, rows, walkable } = grid;
  const label = new Int16Array(cols * rows).fill(-1);
  for (let i = 0; i < label.length; i++) {
    if (!walkable[i]) continue;
    const [x, z] = grid.centre(i);
    let best = 0;
    let bestD = Infinity;
    rooms.forEach((r, k) => {
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < bestD) { bestD = d; best = k; }
    });
    label[i] = best;
  }
  // Boundary midpoints per room pair, projected along the pair's bisector.
  const pairs = new Map();
  const note = (a, b, x, z) => {
    if (a === b) return;
    const [i, j] = a < b ? [a, b] : [b, a];
    const k = `${i},${j}`;
    if (!pairs.has(k)) {
      const ri = rooms[i];
      const rj = rooms[j];
      const dx = rj.x - ri.x;
      const dz = rj.z - ri.z;
      const l = Math.hypot(dx, dz) || 1;
      pairs.set(k, { m: [(ri.x + rj.x) / 2, (ri.z + rj.z) / 2], t: [-dz / l, dx / l], s: [] });
    }
    const p = pairs.get(k);
    p.s.push((x - p.m[0]) * p.t[0] + (z - p.m[1]) * p.t[1]);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (label[i] < 0) continue;
      const [x, z] = grid.centre(i);
      if (c + 1 < cols && label[i + 1] >= 0) note(label[i], label[i + 1], x + CELL / 2, z);
      if (r + 1 < rows && label[i + cols] >= 0) note(label[i], label[i + cols], x, z + CELL / 2);
    }
  }
  const half = CORRIDOR_W / 2 + GAP_MARGIN;
  const keep = (x, z) => inFloor(rings, x, z) && !corridors.some((pl) => pl.some((p, i) => i > 0 && segDist(pl[i - 1][0], pl[i - 1][1], p[0], p[1], x, z) <= half));
  const walls = [];
  for (const { m, t, s } of pairs.values()) {
    s.sort((a, b) => a - b);
    let runStart = s[0];
    for (let i = 1; i <= s.length; i++) {
      if (i < s.length && s[i] - s[i - 1] <= RUN_GAP) continue;
      const a = [m[0] + t[0] * runStart, m[1] + t[1] * runStart];
      const b = [m[0] + t[0] * s[i - 1], m[1] + t[1] * s[i - 1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= MIN_WALL) walls.push(...keepRuns(a, b, keep));
      if (i < s.length) runStart = s[i];
    }
  }
  return walls.map(([a, b]) => [[round(a[0]), round(a[1])], [round(b[0]), round(b[1])]]);
}

// --- outline -------------------------------------------------------------------------

/** Parameter t along P→Q where it crosses R→S, or null. */
function crossing([px, pz], [qx, qz], [rx, rz], [sx, sz]) {
  const d = (qx - px) * (sz - rz) - (qz - pz) * (sx - rx);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((rx - px) * (sz - rz) - (rz - pz) * (sx - rx)) / d;
  const u = ((rx - px) * (qz - pz) - (rz - pz) * (qx - px)) / d;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

/** Exterior wall pieces of the union of rings: ring edges minus the stretches inside another ring. */
function outlineWalls(rings) {
  const out = [];
  rings.forEach((ring, k) => {
    const others = rings.filter((_, j) => j !== k);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ts = [0, 1];
      for (const o of others) {
        for (let j = 0; j < o.length; j++) {
          const t = crossing(a, b, o[j], o[(j + 1) % o.length]);
          if (t !== null) ts.push(t);
        }
      }
      ts.sort((x, y) => x - y);
      for (let s = 1; s < ts.length; s++) {
        const t0 = ts[s - 1];
        const t1 = ts[s];
        if (t1 - t0 < 1e-6) continue;
        const tm = (t0 + t1) / 2;
        const mid = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
        if (others.some((o) => contains(o, mid))) continue;
        const p = [round(a[0] + (b[0] - a[0]) * t0), round(a[1] + (b[1] - a[1]) * t0)];
        const q = [round(a[0] + (b[0] - a[0]) * t1), round(a[1] + (b[1] - a[1]) * t1)];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 0.05) out.push([p, q]);
      }
    }
  });
  return out;
}

// --- entry ------------------------------------------------------------------------------

/**
 * @param {object} floor    {rings, nodes, stairs, center}
 * @param {Array}  doorsIn  points just inside the floor's entrances (Level 1 only)
 * @returns {{corridors, walls, outline}}
 */
function buildInterior(floor, doorsIn = []) {
  const { rings, nodes } = floor;
  const grid = makeGrid(rings);
  const seed = nodes.find((n) => n.kind === "elevator") || nodes[0];
  const terminals = [
    ...nodes.map((n) => ({ name: n.label || n.id, x: n.x, z: n.z })),
    ...(floor.stairs ? [{ name: "stairs", x: floor.stairs.x, z: floor.stairs.z }] : []),
    ...doorsIn.map((d) => ({ name: d.label || "door", x: d.x, z: d.z })),
  ];
  const corridors = growCorridors(rings, grid, seed, terminals);
  const walls = partitionWalls(rings, grid, nodes.filter((n) => n.kind === "room"), corridors);
  return { corridors, walls, outline: outlineWalls(rings) };
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { buildInterior, outlineWalls, partitionWalls, growCorridors, makeGrid, CORRIDOR_W };
