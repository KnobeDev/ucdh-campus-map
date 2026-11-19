// Where the walker lands after going through a Medical Center door
// (3d/door-core.js), checked against the real footprints of both builds.
//
// The bug this guards: the Main Entrance sits where the podium's footprint and
// the Surgery and Emergency Services Pavilion's overlap. Leaving set the walker
// 2 m outside the door, which was still inside the Pavilion's footprint, so the
// next step counted as walking into the hospital: in, out, in, out — stuck.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DIR = path.join(__dirname, "..", "..", "3d");
const url = (f) => pathToFileURL(path.join(DIR, f)).href;
const load = async () => ({ door: await import(url("door-core.js")), core: await import(url("interior-core.js")) });
const BUILDS = ["campus-data.site.json", "campus-data.json"];

const pip = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

/** Everything solid outdoors, as buildings.js indexes it for collision. */
function solidsOf(data) {
  const out = [];
  for (const b of data.buildings) for (const f of b.footprints || []) if (b.renderedBy || f.height > 0) out.push(f.ring);
  for (const c of data.context || []) if (c.height > 0) out.push(c.ring);
  return out;
}

test("door: a clear spot at the usual step is used as it is", async () => {
  const { door } = await load();
  const d = { x: 0, z: 0, inside: { x: 0, z: 2 } };
  assert.deepStrictEqual(door.landingSpot(d, true, () => true), { x: 0, z: 2 });
  assert.deepStrictEqual(door.landingSpot(d, false, () => true), { x: 0, z: -2 });
});

test("door: a blocked step is pushed further along the same line until it is clear", async () => {
  const { door } = await load();
  const d = { x: 0, z: 0, inside: { x: 0, z: 2 } };
  // outdoors is blocked until 4 m out (an overlapping footprint)
  const spot = door.landingSpot(d, false, (x, z) => z <= -4);
  assert.strictEqual(spot.x, 0);
  assert.ok(spot.z <= -4 - door.LANDING_MARGIN + 1e-9, `clear of the edge by the margin: ${spot.z}`);
  assert.ok(spot.z >= -door.LANDING_MAX, `never further than LANDING_MAX: ${spot.z}`);
});

test("door: with no inside point, the direction is away from (or toward) the building's centre", async () => {
  const { door } = await load();
  const d = { x: 10, z: 0 };
  const center = [0, 0];
  assert.deepStrictEqual(door.landingSpot(d, true, () => true, center), { x: 10 - door.DOOR_STEP, z: 0 });
  assert.deepStrictEqual(door.landingSpot(d, false, () => true, center), { x: 10 + door.DOOR_STEP, z: 0 });
});

test("door: coming out, the usual step needs the margin too — clear but hard against a footprint is not enough", async () => {
  const { door } = await load();
  const d = { x: 0, z: 0, inside: { x: 0, z: 2 } };
  // the usual step (z = -2) is clear, but a footprint starts 0.3 m to its side
  const clear = (x, z) => !(x > 0.3 && z > -3);
  const spot = door.landingSpot(d, false, clear);
  assert.ok(spot.z <= -3 + 1e-9, `moved out past the footprint's end, not left beside it at -2: ${spot.z}`);
  const m = door.LANDING_MARGIN;
  for (const [ox, oz] of [[m, 0], [-m, 0], [0, m], [0, -m]]) assert.ok(clear(spot.x + ox, spot.z + oz), `clear ${m} m around: ${ox},${oz}`);
});

test("door: with no spot clear by the margin, a spot clear at least where the walker stands beats the blocked step", async () => {
  const { door } = await load();
  const d = { x: 0, z: 0, inside: { x: 0, z: 2 } };
  // a narrow strip, clear only on the centre line from 3 m out
  const clear = (x, z) => Math.abs(x) < 0.1 && z <= -3;
  const spot = door.landingSpot(d, false, clear);
  assert.ok(clear(spot.x, spot.z), `lands where it is clear: ${JSON.stringify(spot)}`);
});

test("door: nothing clear within reach falls back to the usual step, never a spot inside a wall far away", async () => {
  const { door } = await load();
  const d = { x: 0, z: 0, inside: { x: 0, z: 2 } };
  assert.deepStrictEqual(door.landingSpot(d, false, () => false), { x: 0, z: -2 });
});

for (const file of BUILDS) {
  test(`door (${file}): every entrance lands the walker on clear ground, going in and going out`, async () => {
    const { door, core } = await load();
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const h = data.hospital;
    const f1 = h.floors.find((f) => f.id === "1");
    const shapes = [...f1.rings, ...(f1.links || []).map((l) => l.ring)];
    const solids = solidsOf(data);
    const outdoors = (x, z) => !solids.some((r) => pip(x, z, r));
    const indoors = (x, z) => core.walkable(f1.interior, shapes, x, z);
    for (const e of h.entrances) {
      const out = door.landingSpot(e, false, outdoors, f1.center);
      assert.ok(outdoors(out.x, out.z), `${e.label}: leaving lands outside every footprint (${out.x}, ${out.z})`);
      assert.ok(Math.hypot(out.x - e.x, out.z - e.z) <= door.LANDING_MAX + 1e-9, `${e.label}: and near the door`);
      const inn = door.landingSpot(e, true, indoors, f1.center);
      assert.ok(indoors(inn.x, inn.z), `${e.label}: entering lands on walkable floor (${inn.x}, ${inn.z})`);
    }
  });
}
