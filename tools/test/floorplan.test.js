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
  const envelope = footprints.find((f) => f.osmName === "UC Davis Medical Center").ring;
  for (const f of h.floors) {
    assert.strictEqual(f.ringSources.length, f.rings.length, `${f.id}: every ring must say where it came from`);
    f.rings.forEach((ring, i) => {
      const src = f.ringSources[i];
      if (src.startsWith("connector:")) {
        // A connector is the ONLY ring that is not a survey: a short band of
        // corridor width bridging two adjacent footprints. It must be small and
        // sit wholly inside the complex's envelope — never derived from the
        // printed (oblique, not-to-scale) plan.
        assert.ok(area(ring) < 400, `${f.id} ${src} is ${Math.round(area(ring))} m² — a connector is a link, not a wing`);
        for (const v of ring) assert.ok(contains(envelope, v), `${f.id} ${src} has a vertex outside the building envelope`);
        return;
      }
      assert.ok(real.has(JSON.stringify(ring)), `${f.id} has a ring that is not a real OSM footprint`);
      assert.strictEqual(real.get(JSON.stringify(ring)), src);
    });
  }
  // The bug this guards: the oblique drawing stretched Level 1 to ~42,600 m²
  // against a real 32,640 m² podium, pushing a third of the Lower Level out
  // over Pathology, Parking 3 and North Addition.
  const podium = footprints.find((f) => f.osmName === "UC Davis Medical Center");
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
    for (const ring of f.rings) {
      const b = bbox(ring);
      assert.ok(b.minX >= env.minX - 0.5 && b.maxX <= env.maxX + 0.5, `${f.id} spills out in x`);
      assert.ok(b.minZ >= env.minZ - 0.5 && b.maxZ <= env.maxZ + 0.5, `${f.id} spills out in z`);
    }
  }
});

test("floorplan: the towers are joined — on every floor, every footprint is reachable from every other", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const expectedLinks = { "2": 3, "3": 3, "4": 2, "5": 2, "6": 2, "7": 2, "8": 2 };
  for (const f of h.floors) {
    const connectors = f.ringSources.filter((s) => s.startsWith("connector:")).length;
    assert.strictEqual(connectors, expectedLinks[f.id] || 0, `${f.id} has ${connectors} connectors`);
    // Flood-fill the union of the floor's rings on a 1 m grid from the main
    // elevator; every real footprint must be almost entirely reached.
    const inside = (x, z) => f.rings.some((r) => contains(r, [x, z]));
    const main = f.nodes.find((n) => n.kind === "elevator");
    const reached = floodFill(f.rings, inside, main.x, main.z, 1);
    f.rings.forEach((ring, i) => {
      if (f.ringSources[i].startsWith("connector:")) return;
      let cells = 0;
      let hit = 0;
      const b = bbox(ring);
      for (let x = Math.floor(b.minX); x <= b.maxX; x++) {
        for (let z = Math.floor(b.minZ); z <= b.maxZ; z++) {
          if (!contains(ring, [x + 0.5, z + 0.5])) continue;
          cells++;
          if (reached.has(`${x},${z}`)) hit++;
        }
      }
      assert.ok(hit / cells > 0.95, `${f.id}: only ${(100 * hit / cells).toFixed(0)}% of ${f.ringSources[i]} is reachable from the main elevator`);
    });
  }
});

/** Cells (1 m, keyed "x,z" by floor of the cell origin) reachable from (x0, z0) on foot. */
function floodFill(rings, inside, x0, z0, cell) {
  const b = bbox(rings.flat());
  const key = (cx, cz) => `${cx},${cz}`;
  const start = [Math.floor(x0 / cell), Math.floor(z0 / cell)];
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
      if (seen.has(k) || !inside(px, pz)) continue;
      seen.add(k);
      stack.push([nx, nz]);
    }
  }
  return seen;
}

test("floorplan: the pipeline places one stairwell per floor, inside the floor, clear of the elevator core", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.stairs, `${f.id} has no stairwell`);
    assert.ok(f.rings.some((r) => contains(r, [f.stairs.x, f.stairs.z])), `${f.id}: stairs are outside the floor`);
    for (const n of f.nodes.filter((n) => n.kind === "elevator")) {
      assert.ok(Math.hypot(n.x - f.stairs.x, n.z - f.stairs.z) > 3.5, `${f.id}: stairs sit on ${n.id}`);
    }
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
