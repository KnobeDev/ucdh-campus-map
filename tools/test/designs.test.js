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

for (const file of BUILDS) {
  test(`designs (${file}): the MIND Institute is 2 storeys of stone with a taller round tower at its entrance`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.code === "V2");
    const f = b.footprints.find((x) => x.osmId === 796721511);
    assert.ok(f && f.design, "keyed by its OSM way");
    const [main] = f.design.parts;
    assert.strictEqual(f.design.parts.length, 1);
    assert.strictEqual(main.floors, 2);
    assert.strictEqual(main.facade, "stone");
    assert.deepStrictEqual(main.ring, f.ring);
    const drum = (f.design.features || []).find((x) => x.kind === "drum");
    assert.ok(drum, "the rotunda");
    assert.ok(drum.height > main.height, `it rises above the wings: ${drum.height} vs ${main.height}`);
    assert.ok(drum.radius >= 5 && drum.radius <= 10, `a believable rotunda: r ${drum.radius}`);
    // it stands at the building, its centre on or inside the outline's edge
    const near = f.ring.some(([x, z]) => Math.hypot(x - drum.x, z - drum.z) < drum.radius + 2) || contains(f.ring, [drum.x, drum.z]);
    assert.ok(near, `the rotunda belongs to the building: ${drum.x},${drum.z}`);
    assert.strictEqual(f.heightSource, "estimated");
  });
}

test("designs: a round tower's collision ring is a closed polygon on its circle", async () => {
  const { drumRing, inRing } = await core();
  const ring = drumRing({ x: 10, z: -5, radius: 7 }, 24);
  assert.strictEqual(ring.length, 24);
  for (const [x, z] of ring) assert.ok(Math.abs(Math.hypot(x - 10, z + 5) - 7) < 1e-9, "every corner on the circle");
  assert.ok(inRing([10, -5], ring) && inRing([16.5, -5], ring), "its centre and near its rim are inside");
  assert.ok(!inRing([17.5, -5], ring), "outside the rim is not");
});

test("designs: a stacked design is a base part, then the main part starting at the base's top", () => {
  const f = { osmId: 1539582698, osmName: null, ring: sq(0, 0, 40, 100), floors: 2, height: 8, heightSource: "estimated" };
  const out = withDesign(f, 4.0);
  const [base, main] = out.design.parts;
  assert.strictEqual(base.role, "base");
  assert.strictEqual(base.minHeight, 0);
  assert.strictEqual(main.role, "main");
  assert.strictEqual(main.minHeight, base.height, "the glass starts where the brick ends");
  assert.strictEqual(out.height, main.height, "the footprint's height is the top of the building");
  assert.strictEqual(out.floors, main.floors);
});

const AGGIE = [
  // [code, OSM way, storeys, facade of the part that reaches the top, base facade or null]
  ["AS5", 1539582698, 8, "glass", "brick"],
  ["AS4", 1539582699, 3, "brick", null],
  ["AS3", 1493760477, 5, "punched", null],
  ["P6", 791935708, 6, "garage", null],
];
for (const file of BUILDS) {
  test(`designs (${file}): Aggie Square's buildings stand at their storeys with their own walls, names unchanged`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const names = { AS5: "Aggie Square - Lifelong Learning Building & East Lab", AS4: "400 Aggie Square", AS3: "Aggie Square - Anova", P6: "Aggie Square Parking" };
    for (const [code, way, floors, facade, base] of AGGIE) {
      const b = data.buildings.find((x) => x.code === code);
      assert.strictEqual(b.name, names[code], `${code} keeps its name`);
      const f = b.footprints.find((x) => x.osmId === way);
      assert.ok(f && f.design, `${code} has a design`);
      const top = f.design.parts[f.design.parts.length - 1];
      assert.strictEqual(f.floors, floors, `${code} storeys`);
      assert.strictEqual(top.facade, facade, `${code} walls`);
      assert.strictEqual(f.height, top.height);
      assert.strictEqual(f.heightSource, "estimated");
      for (const p of f.design.parts) assert.deepStrictEqual(p.ring, f.ring, `${code}: every part is the whole OSM outline`);
      if (base) assert.strictEqual(f.design.parts[0].facade, base, `${code} base`);
    }
    // 100 Aggie Square is not built yet: nothing is invented for it
    assert.ok(!data.buildings.some((x) => /100 Aggie Square/i.test(x.name)), "no 100 Aggie Square");
  });
}

for (const file of BUILDS) {
  test(`designs (${file}): every part's walls repeat with its own storeys, and a stacked part starts on a floor line`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    for (const b of data.buildings) for (const f of b.footprints || []) {
      if (!f.design) continue;
      for (const p of f.design.parts) {
        assert.ok(p.storeyH > 2.5 && p.storeyH < 6, `${b.name} ${p.role}: storey ${p.storeyH}`);
        assert.ok(Math.abs(p.height - p.floors * p.storeyH) < 0.01, `${b.name} ${p.role}: height is whole storeys`);
        const k = p.minHeight / p.storeyH;
        assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `${b.name} ${p.role}: starts on a floor line (${p.minHeight} m)`);
      }
    }
  });
}

test("designs: a base as tall as the building is refused", () => {
  const { DESIGNS } = require("../lib/designs");
  const key = "osm:999999999";
  DESIGNS[key] = { name: "Test", base: { floors: 3, facade: "brick" }, whole: { floors: 3, facade: "glass" }, roof: { helipads: 0 }, source: "estimated", note: "test" };
  try {
    assert.throws(() => withDesign({ osmId: 999999999, ring: sq(0, 0, 10, 10) }, 4), /fewer storeys/);
  } finally {
    delete DESIGNS[key];
  }
});

for (const file of BUILDS) {
  test(`designs (${file}): Betty Irene Moore Hall keeps OSM's 2 storeys, stone under white panels, its canopy over the courtyard`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.code === "D");
    assert.strictEqual(b.name, "Betty Irene Moore Hall");
    const f = b.footprints.find((x) => x.osmId === 522792282);
    assert.ok(f && f.design, "keyed by its OSM way");
    assert.strictEqual(f.floors, 2, "OSM's building:levels");
    assert.strictEqual(f.heightSource, "OpenStreetMap", "the storey count is OSM's");
    const [base, main] = f.design.parts;
    assert.strictEqual(base.facade, "ledge");
    assert.strictEqual(base.floors, 1);
    assert.strictEqual(main.facade, "panel");
    assert.strictEqual(main.minHeight, base.height);
    const canopy = (f.design.features || []).find((x) => x.kind === "canopy");
    assert.ok(canopy, "the entrance canopy");
    // Over the courtyard: its inner corners are the notch's own OSM corners …
    const onOutline = canopy.ring.filter(([x, z]) => f.ring.some(([vx, vz]) => vx === x && vz === z));
    assert.strictEqual(onOutline.length, 4, "the four courtyard corners are OSM's");
    // … and it reaches out past the building line, its curved outer edge over the plaza.
    assert.ok(canopy.outer.length >= 8, "a curved outer edge");
    const [e0, e1] = [canopy.outer[0], canopy.outer[canopy.outer.length - 1]];
    const off = ([x, z]) => {
      // distance from the chord a-b, positive on the side away from the building's courtyard (x decreasing here)
      const dx = e1[0] - e0[0]; const dz = e1[1] - e0[1]; const l = Math.hypot(dx, dz);
      return ((x - e0[0]) * dz - (z - e0[1]) * dx) / l;
    };
    const mid = canopy.outer[Math.floor(canopy.outer.length / 2)];
    const notch = [156.93, -17]; // inside the courtyard
    assert.ok(Math.sign(off(mid)) !== Math.sign(off(notch)), "the bulge is on the plaza side, away from the courtyard");
    assert.ok(Math.abs(off(mid)) > 5 && Math.abs(off(mid)) < 12, `it reaches out several metres: ${Math.abs(off(mid)).toFixed(1)}`);
    for (const p of canopy.outer.slice(1, -1)) assert.ok(!contains(f.ring, p), `the outer edge stands outside the building: ${p}`);
    assert.ok(area(canopy.ring) > 700, `bigger than the courtyard alone: ${area(canopy.ring).toFixed(0)} m²`);
    assert.ok(canopy.height > base.height && canopy.height < main.height, `it stands above the stone base, below the roof: ${canopy.height}`);
  });
}

test("designs: a canopy's bulge must be a shallow arc on the open side, or the design is refused", () => {
  const { DESIGNS } = require("../lib/designs");
  const key = "osm:999999998";
  const ring = sq(0, 0, 20, 20);
  const make = (bulge) => { DESIGNS[key] = { name: "T", whole: { floors: 1, facade: "panel" }, features: [{ kind: "canopy", corners: [[0, 0], [20, 0], [20, 20]], bulge, height: 5 }], roof: { helipads: 0 }, source: "estimated", note: "t" }; };
  try {
    for (const bad of [-3, 14.2, 20]) { // the closing edge (20,20)->(0,0) is 28.3 m: half is 14.14
      make(bad);
      assert.throws(() => withDesign({ osmId: 999999998, ring }, 4), /bulge/, `bulge ${bad} refused`);
    }
    make(5);
    const f = withDesign({ osmId: 999999998, ring }, 4);
    const mid = f.design.features[0].outer[6];
    assert.ok(mid[0] < mid[1], `a 5 m bulge bows away from the corner (20, 0): ${mid}`);
  } finally {
    delete DESIGNS[key];
  }
});
