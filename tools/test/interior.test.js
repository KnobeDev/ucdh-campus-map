// Tests for the Medical Center's connectors (tools/lib/interior.js) and its
// inferred interior — corridors, partitions, doors — and for the walkable
// model the browser shares (3d/interior-core.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { linkRings, planFloor } = require("../lib/interior");
const { contains, area } = require("../lib/geom");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");
const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "interior-core.js")).href;
const load = async () => ({ core: await import(CORE), data: JSON.parse(fs.readFileSync(DATA, "utf8")) });

const sq = (x, z, w, h) => [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];

test("interior: linkRings bridges two separated rings with a connector that overlaps both", () => {
  const a = sq(0, 0, 30, 30);
  const b = sq(40, 5, 30, 30); // 10 m gap in x
  const links = linkRings([a, b], { width: 9, overlap: 2 });
  assert.strictEqual(links.length, 1);
  const link = links[0];
  assert.deepStrictEqual(link.between, [0, 1]);
  assert.ok(link.ring.length >= 4);
  // It reaches into both rings and spans the gap, and nothing else.
  assert.ok(link.ring.some((p) => contains(a, p)), "link does not reach ring a");
  assert.ok(link.ring.some((p) => contains(b, p)), "link does not reach ring b");
  for (const [x, z] of link.ring) {
    assert.ok(x >= 20 && x <= 50, `link vertex x=${x} strays from the gap`);
    assert.ok(z >= 0 && z <= 35, `link vertex z=${z} strays from the facing edges`);
  }
  assert.ok(area(link.ring) < 9.5 * 14.5 && area(link.ring) > 8 * 12, `link area ${area(link.ring)} is not a corridor-width band`);
});

test("interior: linkRings joins n rings with n-1 connectors along nearest neighbours (a chain, not a star)", () => {
  const rings = [sq(0, 0, 20, 20), sq(30, 0, 20, 20), sq(60, 0, 20, 20)];
  const links = linkRings(rings, { width: 6, overlap: 1.5 });
  assert.strictEqual(links.length, 2);
  const pairs = links.map((l) => l.between.join("-")).sort();
  assert.deepStrictEqual(pairs, ["0-1", "1-2"]);
});

test("interior: linkRings connects rings that already share an edge with a doorway-sized bridge", () => {
  const a = sq(0, 0, 30, 30);
  const b = sq(30, 0, 30, 30); // touching along x = 30
  const links = linkRings([a, b], { width: 9, overlap: 2 });
  assert.strictEqual(links.length, 1);
  assert.ok(links[0].ring.some((p) => contains(a, p)) && links[0].ring.some((p) => contains(b, p)));
});

test("interior: a single ring needs no connector", () => {
  assert.deepStrictEqual(linkRings([sq(0, 0, 10, 10)], {}), []);
});

function synthFloor() {
  return {
    id: "X",
    rings: [sq(0, 0, 60, 30)],
    links: [],
    nodes: [
      { id: "e", kind: "elevator", label: "Elevator", x: 30, z: 15 },
      { id: "r1", kind: "room", label: "One", x: 8, z: 6 },
      { id: "r2", kind: "room", label: "Two", x: 52, z: 24 },
      { id: "r3", kind: "room", label: "Three", x: 50, z: 6 },
    ],
    stairs: { x: 36.5, z: 15 },
    entrances: [],
  };
}

test("interior: planFloor lays a corridor from the elevator to every room, with walls and a door per room", async () => {
  const { core } = await load();
  const floor = synthFloor();
  const plan = planFloor(floor);
  assert.ok(plan.frame.cols > 0 && plan.frame.rows > 0);
  assert.strictEqual(plan.cells.length, plan.frame.cols * plan.frame.rows);
  assert.strictEqual(plan.walls.length, plan.cells.length);
  const corridor = plan.cells.filter((c) => c === core.CORRIDOR).length;
  const roomCells = plan.cells.filter((c) => c >= core.ROOM0).length;
  assert.ok(corridor > 5, "no corridor");
  assert.ok(roomCells > corridor, "rooms should be most of the floor");
  assert.strictEqual(plan.rooms.length, 3);
  // Every room has a door; a room split by a corridor gets one per piece.
  assert.ok(plan.doors.length >= 3, "a door per room");
  for (const id of plan.rooms) assert.ok(plan.doors.some((d) => d.room === id), `${id} has no door`);
  const walls = core.wallSegments(plan);
  assert.ok(walls.length > 4, "no partitions");
  // Every room node and the stairs are reachable from the elevator along the grid.
  const e = floor.nodes[0];
  for (const n of [...floor.nodes.slice(1), floor.stairs]) {
    const r = core.routeIndoor(plan, e, n);
    assert.ok(r, `${n.id || "stairs"} unreachable from the elevator`);
    assert.ok(r.length >= Math.hypot(n.x - e.x, n.z - e.z) - 1, "route shorter than the straight line");
    assert.deepStrictEqual(r.pts[0], [e.x, e.z]);
    assert.deepStrictEqual(r.pts[r.pts.length - 1], [n.x, n.z]);
    // The line never hooks back to the middle of the walker's own cell, nor
    // overshoots the goal to the middle of its cell.
    const own = core.cellOf(plan.frame, e.x, e.z);
    const [ox, oz] = core.cellCenter(plan.frame, own.i, own.j);
    assert.ok(Math.hypot(r.pts[1][0] - ox, r.pts[1][1] - oz) > 1e-6, "route starts by walking back to the cell centre");
    const goal = core.cellOf(plan.frame, n.x, n.z);
    const [gx, gz] = core.cellCenter(plan.frame, goal.i, goal.j);
    const penultimate = r.pts[r.pts.length - 2];
    assert.ok(Math.hypot(penultimate[0] - gx, penultimate[1] - gz) > 1e-6 || r.pts.length === 2, "route overshoots to the goal's cell centre");
  }
  // And a room is NOT reachable by walking through its partition: a point
  // straight across a wall from room One is blocked at the wall margin.
  let blocked = 0;
  for (const [x1, z1, x2, z2] of walls) {
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    if (!core.walkable(plan, floor.rings, mx, mz)) blocked++;
  }
  assert.strictEqual(blocked, walls.length, "a wall midpoint must not be walkable");
  assert.ok(core.walkable(plan, floor.rings, e.x, e.z), "the elevator itself is walkable");
});

test("interior: perimeter walls follow the ring, are cut where a link joins, and leave a gap at each entrance", async () => {
  const { core } = await load();
  const a = sq(0, 0, 30, 30);
  const b = sq(40, 5, 30, 30);
  const links = linkRings([a, b], { width: 9, overlap: 2 });
  const floor = {
    id: "1", rings: [a, b], links, stairs: null,
    nodes: [{ id: "e", kind: "elevator", label: "E", x: 10, z: 10 }, { id: "r", kind: "room", label: "R", x: 60, z: 20 }],
    entrances: [{ x: 15, z: 0 }], // an entrance in a's north wall
  };
  const plan = planFloor(floor);
  // No perimeter piece crosses the link's mouth on ring a's east wall (x = 30)…
  const [lx0, lx1] = [Math.min(...links[0].ring.map((p) => p[1])), Math.max(...links[0].ring.map((p) => p[1]))];
  for (const [x1, z1, x2, z2] of plan.perimeter) {
    if (Math.abs(x1 - 30) < 1e-6 && Math.abs(x2 - 30) < 1e-6) {
      const lo = Math.min(z1, z2);
      const hi = Math.max(z1, z2);
      assert.ok(hi <= lx0 + 0.6 || lo >= lx1 - 0.6, `perimeter piece z[${lo},${hi}] walls off the link mouth z[${lx0},${lx1}]`);
    }
    // …and none sits on the entrance.
    if (Math.abs(z1) < 1e-6 && Math.abs(z2) < 1e-6) {
      assert.ok(Math.max(x1, x2) <= 13.5 || Math.min(x1, x2) >= 16.5, `perimeter piece x[${x1},${x2}] blocks the entrance at x=15`);
    }
  }
  // The walker can go from the entrance step, through the link, to the room.
  const r = core.routeIndoor(plan, { x: 15, z: 2 }, floor.nodes[1]);
  assert.ok(r, "room across the link is unreachable");
});

// --- the real building ------------------------------------------------------

test("interior: every Medical Center floor is one connected walkable piece — every ring reachable from every other", async () => {
  const { core, data } = await load();
  for (const f of data.hospital.floors) {
    assert.ok(f.interior, `${f.id} has no interior`);
    assert.ok(Array.isArray(f.links), `${f.id} has no links list`);
    if (f.rings.length > 1) assert.strictEqual(f.links.length, f.rings.length - 1, `${f.id}: ${f.rings.length} rings need ${f.rings.length - 1} links`);
    // A cell inside each ring, reached from a cell inside every other ring.
    const anchors = f.rings.map((ring) => {
      const n = f.nodes.find((nd) => contains(ring, [nd.x, nd.z]));
      return n || { x: core.centroidOf(ring)[0], z: core.centroidOf(ring)[1] };
    });
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        assert.ok(core.routeIndoor(f.interior, anchors[i], anchors[j]), `${f.id}: ring ${i} cannot reach ring ${j}`);
      }
    }
  }
});

test("interior: on every floor, every room, elevator and stairwell is reachable from every elevator; Level 1 from its doors", async () => {
  const { core, data } = await load();
  const h = data.hospital;
  for (const f of h.floors) {
    const goals = [...f.nodes, ...(f.stairs ? [{ id: "stairs", ...f.stairs }] : [])];
    const starts = f.nodes.filter((n) => n.kind === "elevator");
    if (f.id === "1") starts.push(...h.entrances.map((e) => ({ id: e.id, ...e.inside })));
    for (const s of starts) {
      for (const g of goals) {
        const r = core.routeIndoor(f.interior, s, g);
        assert.ok(r, `${f.id}: ${g.label || g.id} unreachable from ${s.label || s.id}`);
      }
    }
  }
});

test("interior: the browser's point-collision agrees — a 0.5 m flood fill from the Main Entrance reaches every Level 1 room", async () => {
  const { core, data } = await load();
  const h = data.hospital;
  const f = h.floors.find((x) => x.id === "1");
  const door = h.entrances.find((e) => /main/i.test(e.label)) || h.entrances[0];
  const STEP = 0.5;
  const key = (x, z) => `${Math.round(x / STEP)},${Math.round(z / STEP)}`;
  const start = [Math.round(door.inside.x / STEP) * STEP, Math.round(door.inside.z / STEP) * STEP];
  assert.ok(core.walkable(f.interior, [...f.rings, ...f.links.map((l) => l.ring)], start[0], start[1]), "the door step is not walkable");
  const seen = new Set([key(...start)]);
  const queue = [start];
  const rings = [...f.rings, ...f.links.map((l) => l.ring)];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx;
      const nz = z + dz;
      const k = key(nx, nz);
      if (seen.has(k) || !core.walkable(f.interior, rings, nx, nz)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  for (const n of f.nodes) {
    const near = [[0, 0], [STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]].some(([dx, dz]) =>
      seen.has(key(Math.round(n.x / STEP) * STEP + dx, Math.round(n.z / STEP) * STEP + dz)));
    assert.ok(near, `Level 1: ${n.label || n.id} is walled off from the Main Entrance`);
  }
});
