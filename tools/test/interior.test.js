// Tests for the inferred Medical Center interior: corridors and partition
// walls derived from the placed room nodes (tools/lib/interior.js), the wall
// collision rule the walker uses (3d/floor-core.js) and indoor routing over
// the corridor graph (3d/route-core.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { registerHospital } = require("../lib/floorplan");
const { CORRIDOR_W } = require("../lib/interior");
const { bbox, contains } = require("../lib/geom");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");
const EDITS = path.join(__dirname, "..", "..", "default-edits.json");
const FLOOR_CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "floor-core.js")).href;
const ROUTE_CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "route-core.js")).href;

let cached = null;
function hospital() {
  if (cached) return cached;
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const edits = JSON.parse(fs.readFileSync(EDITS, "utf8"));
  const T = data.buildings.find((b) => b.code === "T");
  const doors = data.hospital.entrances.map((e) => ({ id: e.id, label: e.label, accessible: e.accessible, x: e.curated.x, z: e.curated.z }));
  cached = registerHospital(edits.floorplan.T.floors, T.footprints, 4.2, doors);
  return cached;
}

const inFloor = (f, x, z) => f.rings.some((r) => contains(r, [x, z]));
const segDist = ([[ax, az], [bx, bz]], x, z) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + t * dx - x, az + t * dz - z);
};
const nearCorridor = (f, x, z, r) => f.corridors.some((pl) => pl.some((p, i) => i > 0 && segDist([pl[i - 1], p], x, z) <= r));

/** The points the walker must be able to reach on a floor. */
function mustReach(h, f) {
  const pts = f.nodes.map((n) => ({ name: n.label || n.id, x: n.x, z: n.z }));
  if (f.stairs) pts.push({ name: "stairs", ...f.stairs });
  if (f.id === "1") {
    for (const e of h.entrances) {
      const dx = f.center[0] - e.x;
      const dz = f.center[1] - e.z;
      const l = Math.hypot(dx, dz) || 1;
      pts.push({ name: `inside ${e.label}`, x: e.x + (dx / l) * 2, z: e.z + (dz / l) * 2 });
    }
  }
  return pts;
}

/** Cells reachable on foot: inside a ring and clear of every partition wall. */
function walkableCells(f, wallNear, walkerR, cell) {
  const b = bbox(f.rings.flat());
  const walkable = (x, z) => inFloor(f, x, z) && !wallNear(f.walls, x, z, walkerR);
  const main = f.nodes.find((n) => n.kind === "elevator");
  const key = (cx, cz) => `${cx},${cz}`;
  const start = [Math.floor(main.x / cell), Math.floor(main.z / cell)];
  const seen = new Set([key(...start)]);
  const stack = [start];
  while (stack.length) {
    const [cx, cz] = stack.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const nz = cz + dz;
      const px = (nx + 0.5) * cell;
      const pz = (nz + 0.5) * cell;
      if (px < b.minX || px > b.maxX || pz < b.minZ || pz > b.maxZ) continue;
      const k = key(nx, nz);
      if (seen.has(k) || !walkable(px, pz)) continue;
      seen.add(k);
      stack.push([nx, nz]);
    }
  }
  const reached = (x, z) => {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (seen.has(key(Math.floor(x / cell) + dx, Math.floor(z / cell) + dz))) return true;
    return false;
  };
  return { seen, reached };
}

test("interior: every floor has corridors, all of them inside the floor", () => {
  const h = hospital();
  for (const f of h.floors) {
    assert.ok(Array.isArray(f.corridors) && f.corridors.length >= 1, `${f.id} has no corridors`);
    for (const pl of f.corridors) {
      assert.ok(pl.length >= 2, `${f.id}: a corridor with one point`);
      for (let i = 0; i < pl.length; i++) {
        assert.ok(inFloor(f, pl[i][0], pl[i][1]), `${f.id}: corridor point ${pl[i]} is outside the floor`);
        if (i === 0) continue;
        // and the stretch between consecutive points too
        for (let t = 0.1; t < 1; t += 0.1) {
          const x = pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * t;
          const z = pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * t;
          assert.ok(inFloor(f, x, z), `${f.id}: a corridor leaves the floor between ${pl[i - 1]} and ${pl[i]}`);
        }
      }
    }
  }
});

test("interior: partition walls sit inside the floor and never cross a corridor", () => {
  const h = hospital();
  let total = 0;
  for (const f of h.floors) {
    assert.ok(Array.isArray(f.walls), `${f.id} has no walls list`);
    total += f.walls.length;
    for (const w of f.walls) {
      const [[ax, az], [bx, bz]] = w;
      const len = Math.hypot(bx - ax, bz - az);
      assert.ok(len >= 0.5, `${f.id}: a ${len.toFixed(2)} m wall stub`);
      assert.ok(inFloor(f, (ax + bx) / 2, (az + bz) / 2), `${f.id}: wall ${JSON.stringify(w)} is outside the floor`);
      const n = Math.ceil(len / 0.25);
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * (i / n);
        const z = az + (bz - az) * (i / n);
        assert.ok(!nearCorridor(f, x, z, CORRIDOR_W / 2), `${f.id}: wall ${JSON.stringify(w)} blocks a corridor`);
      }
    }
  }
  assert.ok(total > 30, `only ${total} partition walls on 13 floors — the floors are still open space`);
  assert.ok(h.floors.every((f) => f.nodes.filter((n) => n.kind === "room").length < 2 || f.walls.length > 0), "a floor with several departments has no walls between them");
});

test("interior: from the elevators, every room, elevator, stairwell and (on Level 1) door is reachable on foot", async () => {
  const { wallNear, WALKER_R } = await import(FLOOR_CORE);
  const h = hospital();
  for (const f of h.floors) {
    const { reached } = walkableCells(f, wallNear, WALKER_R, 0.5);
    for (const p of mustReach(h, f)) {
      assert.ok(reached(p.x, p.z), `${f.id}: ${p.name} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) cannot be reached from the main elevator`);
    }
  }
});

test("interior: the corridor graph routes from the elevators to every room along walkable floor", async () => {
  const { buildRouteGraph, route } = await import(ROUTE_CORE);
  const { wallNear, WALKER_R } = await import(FLOOR_CORE);
  const h = hospital();
  for (const f of h.floors) {
    const g = buildRouteGraph(f.corridors.map((pts) => ({ kind: "foot", pts })));
    const main = f.nodes.find((n) => n.kind === "elevator");
    for (const n of f.nodes) {
      const r = route(g, main, n);
      assert.ok(r.ok, `${f.id}: no corridor route from the main elevator to ${n.label || n.id} (${r.reason})`);
      assert.ok(r.snapTo < 1.5 && r.snapFrom < 1.5, `${f.id}: ${n.id} is ${r.snapTo.toFixed(1)} m off the corridor network`);
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1];
        const [bx, bz] = r.pts[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
        for (let s = 0; s <= steps; s++) {
          const x = ax + (bx - ax) * (s / steps);
          const z = az + (bz - az) * (s / steps);
          assert.ok(inFloor(f, x, z) && !wallNear(f.walls, x, z, WALKER_R), `${f.id}: the route to ${n.id} passes through a wall at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        }
      }
    }
  }
});

test("interior: the exterior outline drops the wall stretches that lie inside another ring", () => {
  const h = hospital();
  const f8 = h.floors.find((f) => f.id === "8");
  assert.ok(Array.isArray(f8.outline) && f8.outline.length > 10, "Level 8 has no outline walls");
  for (const [[ax, az], [bx, bz]] of f8.outline) {
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    // strictly inside some OTHER ring than the one this piece lies on = would wall off a connector
    const strictlyInside = f8.rings.filter((r) => contains(r, [mx, mz]) && r.every(([vx, vz]) => Math.hypot(vx - mx, vz - mz) > 0.01));
    const onEdge = f8.rings.some((r) => r.some((p, i) => segDist([r[(i + r.length - 1) % r.length], p], mx, mz) < 0.02));
    assert.ok(onEdge, `outline piece ${JSON.stringify([[ax, az], [bx, bz]])} is not on any ring edge`);
    assert.ok(strictlyInside.length <= 1, "an outline wall runs through the middle of a connector");
  }
});

test("floor-core: wallNear is a segment-distance test with the walker's radius", async () => {
  const { wallNear, WALKER_R } = await import(FLOOR_CORE);
  const walls = [[[0, 0], [10, 0]]];
  assert.ok(WALKER_R > 0.2 && WALKER_R < 1);
  assert.strictEqual(wallNear(walls, 5, 0.2, WALKER_R), true);
  assert.strictEqual(wallNear(walls, 5, 2, WALKER_R), false);
  assert.strictEqual(wallNear(walls, 12, 0, WALKER_R), false, "past the end of the segment");
  assert.strictEqual(wallNear([], 5, 0, WALKER_R), false);
});
