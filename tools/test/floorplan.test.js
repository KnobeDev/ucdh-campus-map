// Tests for the Medical Center floor-plan registration.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { registerHospital, deriveBanks, clampInto, FLOOR_ORDER } = require("../lib/floorplan");
const { bbox, contains, area } = require("../lib/geom");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");
const EDITS = path.join(__dirname, "..", "..", "default-edits.json");

function fixture() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const edits = JSON.parse(fs.readFileSync(EDITS, "utf8"));
  const T = data.buildings.find((b) => b.code === "T");
  return { data, floorsPx: edits.floorplan.T.floors, footprints: T.footprints };
}

test("floorplan: every traced floor registers, in storey order, LL below grade", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  assert.strictEqual(h.floors.length, 13);
  assert.strictEqual(h.floors[0].id, "LL");
  assert.strictEqual(h.floors[0].index, -1);
  assert.ok(h.floors[0].y < 0);
  for (let i = 1; i < h.floors.length; i++) {
    assert.ok(h.floors[i].y > h.floors[i - 1].y, `floor ${h.floors[i].id} is not above ${h.floors[i - 1].id}`);
  }
  assert.strictEqual(h.floors.find((f) => f.id === "14").index, 11); // no 9, no 13
});

test("floorplan: floor shapes ARE the real footprints — never a warped drawing", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const real = new Map(footprints.map((f) => [JSON.stringify(f.ring.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])), f.osmName]));
  const podium = footprints.find((f) => f.osmName === "UC Davis Medical Center");
  for (const f of h.floors) {
    for (const ring of f.rings) {
      assert.ok(real.has(JSON.stringify(ring)), `${f.id} has a ring that is not a real OSM footprint`);
    }
    // Connectors are the one non-OSM shape allowed: a band between two real
    // rings, built from THEIR facing edges (never from the printed plan), and
    // it must lie inside the podium footprint polygon — not just its bbox.
    assert.strictEqual(f.links.length, Math.max(0, f.rings.length - 1), `${f.id}: one connector per gap`);
    for (const l of f.links) {
      assert.ok(Array.isArray(l.between) && l.between.length === 2);
      for (const p of l.ring) assert.ok(contains(podium.ring, p), `${f.id}: connector vertex ${p} is outside the podium`);
    }
  }
  // The bug this guards: the oblique drawing stretched Level 1 to ~42,600 m²
  // against a real 32,640 m² podium, pushing a third of the Lower Level out
  // over Pathology, Parking 3 and North Addition.
  const one = h.floors.find((f) => f.id === "1");
  assert.strictEqual(one.rings.length, 1);
  assert.ok(Math.abs(area(one.rings[0]) - area(podium.ring)) < 1, "Level 1 is not exactly the podium footprint");
  // Tower floors are strictly smaller than the podium.
  const top = h.floors.find((f) => f.id === "14");
  assert.ok(area(top.rings[0]) < 0.25 * area(podium.ring));
});

test("floorplan: no floor spills outside the building envelope", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const envelope = footprints.find((f) => f.osmName === "UC Davis Medical Center").ring;
  const env = bbox(envelope);
  for (const f of h.floors) {
    for (const ring of [...f.rings, ...f.links.map((l) => l.ring)]) {
      const b = bbox(ring);
      assert.ok(b.minX >= env.minX - 0.5 && b.maxX <= env.maxX + 0.5, `${f.id} spills out in x`);
      assert.ok(b.minZ >= env.minZ - 0.5 && b.maxZ <= env.maxZ + 0.5, `${f.id} spills out in z`);
    }
  }
});

test("floorplan: the estimated stairwell is placed in the data, beside the main elevator, inside the floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.stairs, `${f.id} has no stairwell`);
    assert.ok(f.rings.some((r) => contains(r, [f.stairs.x, f.stairs.z])), `${f.id}: stairs are outside the floor`);
    const main = f.nodes.find((n) => n.id === `T_${f.id}_elev_main`) || f.nodes.find((n) => n.kind === "elevator");
    assert.ok(Math.hypot(main.x - f.stairs.x, main.z - f.stairs.z) < 10, `${f.id}: stairs are far from the main elevator`);
  }
});

test("floorplan: entrances carry the point just inside the door, inside the podium", () => {
  const { data } = fixture();
  const floor1 = data.hospital.floors.find((f) => f.id === "1");
  for (const e of data.hospital.entrances) {
    assert.ok(e.inside && contains(floor1.rings[0], [e.inside.x, e.inside.z]), `${e.label}: no walkable point inside the door`);
  }
});

test("floorplan: every room and elevator sits inside its own floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    for (const n of f.nodes) {
      assert.ok(f.rings.some((r) => contains(r, [n.x, n.z])),
        `${f.id}: ${n.label || n.id} is outside the floor`);
    }
  }
});

test("floorplan: clampInto leaves interior points alone and pulls outside ones in", () => {
  const sq = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const inside = clampInto([sq], 10, 10);
  assert.strictEqual(inside.clamped, false);
  assert.strictEqual(inside.x, 10);
  const outside = clampInto([sq], 40, 10);
  assert.ok(outside.clamped);
  assert.ok(contains(sq, [outside.x, outside.z]), "a clamped point must land inside");
});

test("floorplan: every floor keeps an elevator", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.nodes.some((n) => n.kind === "elevator"), `${f.id} has no elevator`);
  }
});

test("floorplan: the street-level entrances sit in the podium wall", () => {
  const { data } = fixture();
  const h = data.hospital;
  assert.ok(h && h.entrances.length >= 2);
  const floor1 = h.floors.find((f) => f.id === "1");
  for (const e of h.entrances) {
    assert.ok(e.curated && typeof e.snappedMetres === "number", `${e.label} lost its provenance`);
    let d = Infinity;
    for (const ring of floor1.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.z - az) * dz) / l2));
        d = Math.min(d, Math.hypot(ax + t * dx - e.x, az + t * dz - e.z));
      }
    }
    assert.ok(d < 0.05, `${e.label} is ${d.toFixed(2)} m off the podium wall`);
    assert.ok(e.snappedMetres < 60, `${e.label} was snapped ${e.snappedMetres} m — suspicious`);
  }
});

test("floorplan: elevator banks are derived from the nodes, and the main bank reaches every floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  assert.ok(h.banks["T-main"], "no T-main bank");
  assert.strictEqual(h.banks["T-main"].reaches.length, h.floors.length);
  assert.strictEqual(h.banks["T-main"].name, "Main elevators");
  const fake = deriveBanks([
    { id: "1", nodes: [{ kind: "elevator", elevatorId: "X", label: "Elevator" }] },
    { id: "2", nodes: [{ kind: "elevator", elevatorId: "Y", label: "Y bank" }] },
  ]);
  assert.deepStrictEqual(fake.X.reaches, ["1"]);
  assert.strictEqual(fake.X.name, "X");
  assert.strictEqual(fake.Y.name, "Y bank");
});

test("floorplan: a door snapped onto a corner slides along its wall until the frame is clear", () => {
  const { placeEntrances, DOOR_CLEAR } = require("../lib/floorplan");
  const sq = [[0, 0], [40, 0], [40, 40], [0, 40]];
  // Curated just outside the corner: the nearest wall point IS the corner.
  const [door] = placeEntrances([{ id: "d", label: "Door", x: -1, z: -1 }], [sq]);
  const onWall = Math.abs(door.z) < 1e-6 || Math.abs(door.x) < 1e-6;
  assert.ok(onWall, "still in the wall");
  const toCorner = Math.min(...sq.map(([vx, vz]) => Math.hypot(vx - door.x, vz - door.z)));
  assert.ok(toCorner >= DOOR_CLEAR - 1e-6, `only ${toCorner.toFixed(1)} m from a corner`);
  assert.ok(door.inside.x > 0 && door.inside.z > 0, "the inside step is inside");
  // A door already mid-wall does not move.
  const [mid] = placeEntrances([{ id: "m", label: "Mid", x: 20, z: -1 }], [sq]);
  assert.strictEqual(mid.x, 20);
});

test("floorplan: a canopy lobe is cut from the outline and kept as an awning", () => {
  const { cutLobe } = require("../lib/floorplan");
  // A 40 x 40 square with a 10 x 4 bump on its north side: the bump is an awning.
  const ring = [[0, 0], [15, 0], [15, -4], [25, -4], [25, 0], [40, 0], [40, 40], [0, 40]];
  const { ring: cut, lobe } = cutLobe(ring, [15, 0], [25, 0]);
  assert.deepStrictEqual(cut, [[0, 0], [15, 0], [25, 0], [40, 40 - 40 + 40 - 40 + 0 + 0 + 0 + 0 + 0], [40, 40], [0, 40]].slice(0, 2).concat([[25, 0], [40, 0], [40, 40], [0, 40]]));
  assert.deepStrictEqual(lobe, [[15, 0], [15, -4], [25, -4], [25, 0]]);
  // The order of the two neck points must not matter.
  assert.deepStrictEqual(cutLobe(ring, [25, 0], [15, 0]).lobe, lobe);
});

test("floorplan: the Medical Center's Main Entrance canopy is an awning, not floor", () => {
  const data = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "3d", "campus-data.json"), "utf8"));
  const h = data.hospital;
  assert.ok(h.awnings && h.awnings.length >= 1, "no awnings");
  const a = h.awnings[0];
  const { contains } = require("../lib/geom");
  const [cx, cz] = require("../lib/geom").centroid(a.ring);
  for (const f of h.floors) for (const r of f.rings) assert.ok(!contains(r, [cx, cz]), `floor ${f.id} still treats the awning as floor`);
  const T = data.buildings.find((b) => b.code === "T");
  for (const f of T.footprints) assert.ok(!contains(f.ring, [cx, cz]), "the walker would still collide with the awning outdoors");
});
