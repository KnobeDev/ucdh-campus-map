// Tests for the Medical Center floor-plan registration.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { registerHospital, deriveBanks, FLOOR_ORDER } = require("../lib/floorplan");
const { bbox, contains } = require("../lib/geom");

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

test("floorplan: each floor lands inside its target footprint's bbox", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const outline = bbox(footprints.find((f) => f.osmName === "UC Davis Medical Center").ring);
  const slack = 0.5;
  for (const f of h.floors) {
    const b = bbox(f.ring);
    assert.ok(b.minX >= outline.minX - slack && b.maxX <= outline.maxX + slack, `${f.id} spills out in x`);
    assert.ok(b.minZ >= outline.minZ - slack && b.maxZ <= outline.maxZ + slack, `${f.id} spills out in z`);
  }
  // The tower-only floors must be strictly smaller than the podium.
  const podium = bbox(h.floors.find((f) => f.id === "1").ring);
  const tower = bbox(h.floors.find((f) => f.id === "14").ring);
  assert.ok(tower.maxX - tower.minX < 0.5 * (podium.maxX - podium.minX));
});

test("floorplan: every floor keeps an elevator, and every node is inside its floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.nodes.some((n) => n.kind === "elevator"), `${f.id} has no elevator`);
    const inside = f.nodes.filter((n) => contains(f.ring, [n.x, n.z])).length;
    // Traced by hand on a not-to-scale diagram; a node or two on the edge is expected.
    assert.ok(inside >= f.nodes.length * 0.8, `${f.id}: only ${inside}/${f.nodes.length} nodes inside the ring`);
  }
});

test("floorplan: the street-level entrances sit on the podium outline", () => {
  const { data } = fixture();
  const h = data.hospital;
  assert.ok(h && h.entrances.length >= 2);
  const floor1 = h.floors.find((f) => f.id === "1");
  for (const e of h.entrances) {
    // Snapped onto an edge, so the distance to the nearest edge is ~0; the
    // curated point it came from is kept for provenance.
    assert.ok(e.curated && typeof e.snappedMetres === "number", `${e.label} lost its provenance`);
    let d = Infinity;
    for (let i = 0; i < floor1.ring.length; i++) {
      const [ax, az] = floor1.ring[i];
      const [bx, bz] = floor1.ring[(i + 1) % floor1.ring.length];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.z - az) * dz) / l2));
      d = Math.min(d, Math.hypot(ax + t * dx - e.x, az + t * dz - e.z));
    }
    assert.ok(d < 0.05, `${e.label} is ${d.toFixed(2)} m off the floor-1 outline`);
    assert.ok(e.snappedMetres < 60, `${e.label} was snapped ${e.snappedMetres} m — suspicious`);
  }
});

test("floorplan: elevator banks are derived from the nodes, and the main bank reaches every floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  assert.ok(h.banks["T-main"], "no T-main bank");
  assert.strictEqual(h.banks["T-main"].reaches.length, h.floors.length);
  assert.strictEqual(h.banks["T-main"].name, "Main elevators");
  // A bank only reaches floors that actually carry one of its nodes.
  const fake = deriveBanks([
    { id: "1", nodes: [{ kind: "elevator", elevatorId: "X", label: "Elevator" }] },
    { id: "2", nodes: [{ kind: "elevator", elevatorId: "Y", label: "Y bank" }] },
  ]);
  assert.deepStrictEqual(fake.X.reaches, ["1"]);
  assert.strictEqual(fake.X.name, "X"); // a generic "Elevator" label doesn't become the bank name
  assert.strictEqual(fake.Y.name, "Y bank");
});
