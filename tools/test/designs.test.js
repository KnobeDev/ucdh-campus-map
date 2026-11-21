// A building still under construction drawn as its finished design
// (tools/lib/designs.js): the California Tower's slab and lower wing, cut from
// OpenStreetMap's own site outline, with storeys that say they are estimates.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { withDesign, splitRing, DESIGNS } = require("../lib/designs");
const { area, contains, centroid } = require("../lib/geom");

const DIR = path.join(__dirname, "..", "..", "3d");
const BUILDS = ["campus-data.json", "campus-data.site.json"];
const sq = (x, z, w, h) => [[x, z], [x + w, z], [x + w, z + h], [x, z + h]];

test("designs: splitRing cuts a ring on an east-west line into its north and south parts", () => {
  const { north, south } = splitRing(sq(0, 0, 10, 20), 5);
  assert.ok(Math.abs(area(north) - 50) < 1e-9, `north ${area(north)}`);
  assert.ok(Math.abs(area(south) - 150) < 1e-9, `south ${area(south)}`);
  assert.ok(north.every(([, z]) => z <= 5 + 1e-9), "north is z <= the line (+z is south)");
  assert.ok(south.every(([, z]) => z >= 5 - 1e-9));
});

test("designs: a footprint with no design is returned as it was", () => {
  const f = { osmName: "Somewhere Else", ring: sq(0, 0, 10, 10), floors: 2, height: 7.2, heightSource: "estimated" };
  assert.strictEqual(withDesign(f, "hospital"), f);
});

test("designs: the California Tower is a 14-storey slab and a 3-storey wing, both estimates", () => {
  const d = DESIGNS["California Hospital Tower Construction"];
  assert.ok(d, "the design is keyed by the OSM way's name");
  assert.strictEqual(d.source, "estimated");
  assert.match(d.note, /reference only/i, "the renderings are reference only; nothing from them ships");
});

for (const file of BUILDS) {
  test(`designs (${file}): the California Tower carries its finished form, cut from the OSM outline`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.name === "California Tower");
    assert.ok(b, "the building is there");
    const f = b.footprints.find((x) => x.osmName === "California Hospital Tower Construction");
    assert.ok(f && f.design, "its footprint has a design");
    assert.strictEqual(f.geomSource, "osm", "the outline is still OpenStreetMap's");
    const tower = f.design.parts.find((p) => p.role === "tower");
    const wing = f.design.parts.find((p) => p.role === "wing");
    assert.ok(tower && wing, "a tower and a wing");
    assert.strictEqual(tower.floors, 14);
    assert.strictEqual(wing.floors, 3);
    assert.ok(tower.height > wing.height * 3, `the slab towers over the wing: ${tower.height} vs ${wing.height}`);
    assert.strictEqual(f.height, tower.height, "the footprint's height is the tower's, so the caution sign clears it");
    assert.strictEqual(f.heightSource, "estimated");
    // The parts are the outline, cut once: together they cover it, and neither leaves it.
    const sum = area(tower.ring) + area(wing.ring);
    assert.ok(Math.abs(sum - area(f.ring)) < 1, `parts ${sum.toFixed(1)} m² = outline ${area(f.ring).toFixed(1)} m²`);
    for (const p of [tower, wing]) assert.ok(contains(f.ring, centroid(p.ring)), `${p.role} lies in the outline`);
    // The slab is the north arm along 45th Street; the wing runs along X Street to the south.
    assert.ok(centroid(tower.ring)[1] < centroid(wing.ring)[1], "the tower is north of the wing");
    assert.strictEqual(f.design.roof.helipads, 2);
    assert.ok(f.underConstruction, "still a building site: the fence and caution stay");
  });
}

const { pathToFileURL } = require("url");
const core = () => import(pathToFileURL(path.join(DIR, "design-core.js")).href);

test("designs: on a long rectangle the helipads sit along its length, inside the roof, clear of each other", async () => {
  const { roofLayout } = await core();
  const ring = sq(0, 0, 100, 40); // long in x
  const { helipads, plant } = roofLayout(ring, { helipads: 2, radius: 7 });
  assert.strictEqual(helipads.length, 2);
  for (const [x, z] of helipads) assert.ok(x >= 8 && x <= 92 && z >= 8 && z <= 32, `inside with room for a 7 m pad: ${x},${z}`);
  assert.ok(Math.abs(helipads[0][0] - helipads[1][0]) > 40, "spread along the long side");
  assert.ok(Math.abs(plant.x - 50) < 1e-6 && Math.abs(plant.z - 20) < 1e-6, "the plant room is at the centre");
});

for (const file of BUILDS) {
  test(`designs (${file}): the California Tower's helipads fit on its roof`, async () => {
    const { roofLayout, inRing } = await core();
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const f = data.buildings.find((x) => x.name === "California Tower").footprints[0];
    const tower = f.design.parts.find((p) => p.role === "tower");
    const { helipads } = roofLayout(tower.ring, { helipads: f.design.roof.helipads, radius: 7 });
    assert.strictEqual(helipads.length, 2);
    for (const p of helipads) {
      for (let a = 0; a < 8; a++) {
        const q = [p[0] + 7 * Math.cos((a * Math.PI) / 4), p[1] + 7 * Math.sin((a * Math.PI) / 4)];
        assert.ok(inRing(q, tower.ring), `the pad's rim stays on the roof: ${q}`);
      }
    }
    assert.ok(Math.hypot(helipads[0][0] - helipads[1][0], helipads[0][1] - helipads[1][1]) > 16, "two pads, not one on top of the other");
  });
}

test("designs: a building site says so, with its end date, and says when it is drawn finished", async () => {
  const { siteStatus } = await core();
  assert.strictEqual(siteStatus({ floors: 3 }), null, "a finished building has nothing to add");
  assert.strictEqual(siteStatus({ underConstruction: { zoneId: "z", endDate: "2030-02-02" } }), "under construction until 2 February 2030");
  assert.strictEqual(
    siteStatus({ underConstruction: { zoneId: "z", endDate: "2030-02-02" }, design: { parts: [] } }),
    "under construction until 2 February 2030, shown as the finished design",
  );
  assert.strictEqual(siteStatus({ underConstruction: { zoneId: "z", endDate: null } }), "under construction");
});

for (const file of BUILDS) {
  test(`designs (${file}): Shriners Hospital stands 8 storeys, its whole OSM outline, a finished building`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.code === "SH");
    assert.ok(b, "the building is there");
    const f = b.footprints.find((x) => x.osmId === 307095185);
    assert.ok(f && f.design, "keyed by its OSM way: the way has no name");
    assert.strictEqual(f.design.parts.length, 1, "one part: the outline is not cut");
    const [main] = f.design.parts;
    assert.deepStrictEqual(main.ring, f.ring, "the part is the outline itself");
    assert.strictEqual(main.floors, 8);
    assert.strictEqual(main.facade, "punched");
    assert.strictEqual(f.floors, 8);
    assert.ok(f.height > 30, `hospital storeys, not the 3.4 m default for an outside building: ${f.height}`);
    assert.strictEqual(f.heightSource, "estimated");
    assert.ok(!f.underConstruction, "a finished building: no fence, no caution");
    assert.strictEqual(b.cat, "external", "still shown as a building outside UC Davis Health");
  });
}

test("designs: an OSM name that is also a built-in property name finds no design", () => {
  const f = { osmName: "constructor", osmId: 1, ring: sq(0, 0, 10, 10), floors: 2, height: 7.2 };
  assert.strictEqual(withDesign(f, 4.2), f);
  assert.strictEqual(withDesign({ ...f, osmName: "toString" }, 4.2).design, undefined);
});
