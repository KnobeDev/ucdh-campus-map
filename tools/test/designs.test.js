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

test("designs: the California Tower is a 14-storey slab, an estimate, with no lower wing (owner, 2026-11-20)", () => {
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
    // Only the slab: the owner (2026-11-20) had the lower wing along X Street dropped; that
    // part of the site is still the fenced lot his photos show.
    assert.deepStrictEqual(f.design.parts.map((p) => p.role), ["tower"]);
    const [tower] = f.design.parts;
    assert.strictEqual(tower.floors, 14);
    assert.strictEqual(f.height, tower.height, "the footprint's height is the tower's, so the caution sign clears it");
    assert.strictEqual(f.heightSource, "estimated");
    // The slab is the outline's north arm along 45th Street, cut once from OSM's site outline.
    assert.ok(contains(f.ring, centroid(tower.ring)), "the slab lies in the outline");
    assert.ok(area(tower.ring) < area(f.ring) * 0.75, `only the north arm: ${area(tower.ring).toFixed(0)} of ${area(f.ring).toFixed(0)} m²`);
    assert.ok(centroid(tower.ring)[1] < centroid(f.ring)[1], "north of the site's centre");
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

// A square with a quarter-circle bite out of its north-west corner (centre 0,0, radius 20),
// like Shriners' curved entrance front, with a vertex 8 m along each straight edge past the curve.
const bitten = () => {
  const curve = [];
  for (let deg = 90; deg >= 0; deg -= 15) curve.push([20 * Math.cos((deg * Math.PI) / 180), 20 * Math.sin((deg * Math.PI) / 180)]);
  return [[28, 0], [60, 0], [60, 60], [0, 60], [0, 28], ...curve];
};

test("designs: a curved front is cut from the outline along an arc through two of its own vertices, parallel to its curved face", () => {
  const { cutAlongArc } = require("../lib/designs");
  const ring = bitten();
  const { front, rest, arc } = cutAlongArc(ring, [28.3, 0.2], [0.1, 27.8]);
  // the arc runs between the two OSM vertices, the ends exactly on them
  assert.deepStrictEqual(arc[0], [0, 28]);
  assert.deepStrictEqual(arc[arc.length - 1], [28, 0]);
  for (const [x, z] of arc) assert.ok(Math.abs(Math.hypot(x, z) - 28) < 0.05, `on the circle 8 m behind the curved face: ${x},${z}`);
  // the front is the band between the curved face and the arc; the rest is everything else
  const band = (Math.PI / 4) * (28 * 28 - 20 * 20);
  assert.ok(Math.abs(area(front) - band) < band * 0.02, `front ${area(front).toFixed(1)} m², a quarter ring of ${band.toFixed(1)} m²`);
  assert.ok(Math.abs(area(front) + area(rest) - area(ring)) < 0.01, "together they are the outline");
  const at = (r, deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  assert.ok(contains(front, at(24, 45)) && !contains(rest, at(24, 45)), "the band is the front");
  assert.ok(contains(rest, at(32, 45)) && !contains(front, at(32, 45)), "behind the arc is the rest");
  for (const v of ring.slice(5)) assert.ok(front.some((p) => p[0] === v[0] && p[1] === v[1]), `the curved face's vertex ${v} is the front's`);
  for (const v of [[60, 0], [60, 60], [0, 60]]) assert.ok(rest.some((p) => p[0] === v[0] && p[1] === v[1]), `${v} stays with the rest`);
});

test("designs: an arc cut that is not through the outline's own vertices, or leaves the outline, is refused", () => {
  const { cutAlongArc } = require("../lib/designs");
  const ring = bitten();
  assert.throws(() => cutAlongArc(ring, [34, 0], [0, 28]), /not on the outline/);
  // through two outline vertices with no curved face between them: nothing to be parallel to
  assert.throws(() => cutAlongArc(ring, [60, 0], [60, 60]), /curved face/);
});

for (const file of BUILDS) {
  test(`designs (${file}): Shriners Hospital is 8 storeys behind a 2-storey curved front on the plaza, both cut from its OSM outline`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.code === "SH");
    assert.ok(b, "the building is there");
    const f = b.footprints.find((x) => x.osmId === 307095185);
    assert.ok(f && f.design, "keyed by its OSM way: the way has no name");
    const main = f.design.parts.find((p) => p.role === "main");
    const front = f.design.parts.find((p) => p.role === "front");
    assert.ok(main && front && f.design.parts.length === 2, `a main block and a front: ${f.design.parts.map((p) => p.role)}`);
    assert.strictEqual(main.floors, 8);
    assert.strictEqual(front.floors, 2);
    assert.strictEqual(front.minHeight, 0, "the front stands on the ground");
    assert.ok(front.height < 10 && main.height > 30, `${front.height} m front, ${main.height} m block`);
    assert.strictEqual(main.facade, "banded");
    assert.strictEqual(front.facade, "arcade");
    // The parts are the outline, cut once: together they cover it.
    const sum = area(main.ring) + area(front.ring);
    assert.ok(Math.abs(sum - area(f.ring)) < 1, `parts ${sum.toFixed(1)} m² = outline ${area(f.ring).toFixed(1)} m²`);
    // The front holds OSM's curved face (the quarter circle facing the plaza, vertices
    // (-219.41,-142.91) to (-246.01,-116.79)) and the end vertices the cut runs through.
    const has = (ring, v) => ring.some((p) => Math.abs(p[0] - v[0]) < 1e-6 && Math.abs(p[1] - v[1]) < 1e-6);
    // The owner (2026-11-20): the front runs back to the outline's outer corners, about 11 m deep.
    for (const v of [[-208.42, -143.06], [-212.14, -142.75], [-219.41, -142.91], [-226.84, -124.78], [-246.01, -116.79], [-245.4, -108.64], [-245.55, -105.11]]) assert.ok(has(front.ring, v), `front has OSM vertex ${v}`);
    for (const v of [[-208.42, -143.06], [-245.55, -105.11], [-181.36, -78.98]]) assert.ok(has(main.ring, v), `main has OSM vertex ${v}`);
    for (const v of [[-226.84, -124.78], [-212.14, -142.75], [-245.4, -108.64]]) assert.ok(!has(main.ring, v), `the front's vertex ${v} is not the block's`);
    assert.ok(area(front.ring) > 500 && area(front.ring) < 750, `a band about 11 m deep along the curve: ${area(front.ring).toFixed(1)} m²`);
    assert.strictEqual(f.floors, 8, "the building's storeys are its tallest part's");
    assert.ok(f.height > 30, `hospital storeys, not the 3.4 m default for an outside building: ${f.height}`);
    assert.strictEqual(f.heightSource, "estimated");
    assert.match(f.design.note, /2-storey front/);
    assert.match(f.design.note, /estimate/);
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

// Parking Structure 3, the Medical Center's main garage on Stockton Boulevard (OSM way 198423271).
// The owner, 2026-11-20: "Recheck the Medical Center parking structure (night image) nearest
// Stockton Blvd." Photos show open decks behind light horizontal bands, three solar canopies on
// posts on the roof deck and stair/elevator towers at the corners; the outline is OSM's.
const P3_WAY = 198423271;
const footprintOf = (data, way) => {
  for (const b of data.buildings) for (const f of b.footprints || []) if (f.osmId === way) return { b, f };
  return {};
};
/** Do two convex rings overlap (separating axis test; touching counts as apart)? */
const overlap = (a, b) => {
  for (const ring of [a, b]) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i]; const [x2, z2] = ring[(i + 1) % ring.length];
      const n = [z1 - z2, x2 - x1];
      const proj = (r) => r.map(([x, z]) => x * n[0] + z * n[1]);
      const pa = proj(a); const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
};
/** Distance from a point to a ring's nearest edge. */
const edgeDist = ([px, pz], ring) => {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]; const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax; const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx - px, az + t * dz - pz));
  }
  return best;
};

test("designs: a stair tower is a rectangle on a corner of the outline, along one of its walls, inside it", () => {
  const { stairTower } = require("../lib/designs");
  const ring = sq(0, 0, 80, 60);
  const t = stairTower(ring, { corner: [0.4, 0.3], toward: [79.2, 0.5], size: [7, 6] });
  assert.ok(Math.abs(area(t) - 42) < 1e-6, `7 m along the wall, 6 m in: ${area(t)}`);
  assert.ok(t.some(([x, z]) => x === 0 && z === 0), "one corner is the outline's own vertex");
  for (const p of t) assert.ok(p[0] >= -1e-9 && p[0] <= 7 + 1e-9 && p[1] >= -1e-9 && p[1] <= 6 + 1e-9, `inside the corner: ${p}`);
  assert.throws(() => stairTower(ring, { corner: [5, 5], toward: [80, 0], size: [7, 6] }), /not on the outline/);
  assert.throws(() => stairTower(ring, { corner: [0, 0], toward: [80, 60], size: [7, 6] }), /wall/, "the two vertices must be the ends of one wall");
});

test("designs: solar canopies are spread along the roof's longest wall, their long sides across it, inside the roof", () => {
  const { solarLayout } = require("../lib/designs");
  const ring = sq(0, 0, 100, 60); // the longest walls run east-west
  const { panels } = solarLayout(ring, { count: 3, length: 26, width: 10, spacing: 18 });
  assert.strictEqual(panels.length, 3);
  const centres = panels.map((p) => centroid(p.ring));
  for (const [x, z] of centres) assert.ok(Math.abs(z - 30) < 1e-6, `on the roof's middle line: ${x},${z}`);
  assert.deepStrictEqual(centres.map(([x]) => +x.toFixed(6)), [32, 50, 68], "18 m apart along the longest wall");
  for (const p of panels) {
    const xs = p.ring.map(([x]) => x); const zs = p.ring.map(([, z]) => z);
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 10) < 1e-6 && Math.abs(Math.max(...zs) - Math.min(...zs) - 26) < 1e-6, "10 m wide along the wall, 26 m long across it");
    for (const c of p.ring) assert.ok(contains(ring, c) && edgeDist(c, ring) >= 1, `inside the roof's edge: ${c}`);
    assert.ok(p.posts.length >= 2, "on posts");
    for (const q of p.posts) assert.ok(contains(p.ring, q), `each post under its canopy: ${q}`);
  }
  assert.throws(() => solarLayout(sq(0, 0, 20, 20), { count: 3, length: 26, width: 10, spacing: 18 }), /fit/, "a roof too small for them is refused");
});

for (const file of BUILDS) {
  test(`designs (${file}): Parking Structure 3 is 6 open decks under its roof deck, with stair towers and three solar canopies, on its OSM outline`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const { b, f } = footprintOf(data, P3_WAY);
    assert.ok(b && f, "OSM way 198423271 is there");
    assert.strictEqual(b.code, "P3");
    assert.strictEqual(f.osmName, "Parking Structure 3");
    assert.strictEqual(f.geomSource, "osm");
    assert.ok(f.design, "it has a design");
    const [main] = f.design.parts;
    assert.strictEqual(f.design.parts.length, 1);
    assert.deepStrictEqual(main.ring, f.ring, "the decks are the whole OSM outline");
    assert.strictEqual(main.floors, 6);
    assert.strictEqual(main.facade, "louvred");
    assert.ok(main.storeyH >= 3 && main.storeyH <= 3.6, `parking-deck storeys: ${main.storeyH}`);
    assert.strictEqual(f.floors, 6);
    assert.strictEqual(f.height, main.height);
    assert.strictEqual(f.heightSource, "estimated");
    assert.strictEqual(main.plant, false, "no plant room on a parking deck");
    assert.strictEqual(f.design.roof.helipads, 0);
    const feats = f.design.features || [];
    const stairs = feats.filter((x) => x.kind === "stair");
    const solar = feats.find((x) => x.kind === "solar");
    // Two stair/elevator towers, each on a corner of OSM's outline, rising above the roof deck.
    assert.strictEqual(stairs.length, 2);
    for (const s of stairs) {
      assert.ok(s.ring.some(([x, z]) => f.ring.some(([vx, vz]) => vx === x && vz === z)), "a corner is one of OSM's vertices");
      for (const p of s.ring) assert.ok(contains(f.ring, p) || edgeDist(p, f.ring) < 0.01, `inside the outline (or on its wall, to the centimetre): ${p}`);
      assert.strictEqual(s.minHeight, main.height, "it stands on the roof deck");
      assert.ok(s.height > main.height + 3 && s.height < main.height + 6, `about one storey above the deck: ${s.height}`);
    }
    // Three solar canopies on posts over the roof deck, inside it, clear of the towers.
    assert.ok(solar, "the solar canopies");
    assert.strictEqual(solar.panels.length, 3);
    assert.strictEqual(solar.minHeight, main.height, "the posts stand on the roof deck");
    assert.ok(solar.height > main.height + 3 && solar.height < main.height + 5.5, `cars park under them: ${solar.height}`);
    for (const p of solar.panels) {
      for (const c of p.ring) assert.ok(contains(f.ring, c) && edgeDist(c, f.ring) >= 1, `on the roof: ${c}`);
      for (const s of stairs) assert.ok(!overlap(p.ring, s.ring), "clear of the stair towers");
      for (const q of p.posts) assert.ok(contains(p.ring, q), "posts under the canopy");
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(!overlap(solar.panels[i].ring, solar.panels[j].ring), "three separate canopies");
    // Spread along the outline's longest wall (its north side, OSM vertices (-293.63,-271.03) to (-351.09,-281.88)).
    const [a, c] = [[-293.63, -271.03], [-351.09, -281.88]];
    const u = [(c[0] - a[0]) / Math.hypot(c[0] - a[0], c[1] - a[1]), (c[1] - a[1]) / Math.hypot(c[0] - a[0], c[1] - a[1])];
    const centres = solar.panels.map((p) => centroid(p.ring));
    const across = centres.map(([x, z]) => x * -u[1] + z * u[0]);
    assert.ok(Math.max(...across) - Math.min(...across) < 0.05, "the canopies stand in a row parallel to the north wall (to the centimetres they are rounded to)");
    assert.ok(area(solar.panels[0].ring) > 150 && area(solar.panels[0].ring) < 400, `a canopy over a double row of stalls: ${area(solar.panels[0].ring).toFixed(0)} m²`);
    assert.match(f.design.note, /estimate/i);
    assert.match(f.design.note, /reference only/);
    assert.ok(!f.underConstruction);
  });
}

test("designs: Parking Structure 3 is the Medical Center garage nearest Stockton Boulevard", () => {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, "campus-data.json"), "utf8"));
  const stockton = data.paths.filter((p) => p.name === "Stockton Boulevard");
  assert.ok(stockton.length, "Stockton Boulevard is in the data");
  const segDist = (p, a, b) => edgeDist(p, [a, b]);
  const dist = (ring) => Math.min(...ring.flatMap((v) => stockton.flatMap((s) => s.pts.slice(1).map((q, i) => segDist(v, s.pts[i], q)))));
  const garages = data.buildings.filter((b) => b.cat === "parking").flatMap((b) => (b.footprints || []).map((f) => ({ code: b.code, d: dist(f.ring) })));
  garages.sort((x, y) => x.d - y.d);
  assert.strictEqual(garages[0].code, "P3", JSON.stringify(garages.slice(0, 3)));
  assert.ok(garages[0].d < 20, `right on the boulevard: ${garages[0].d.toFixed(1)} m`);
});

test("designs: an arc cut refuses a face that is not really curved (an L corner, a near-straight noisy edge)", () => {
  const { cutAlongArc } = require("../lib/designs");
  // a real L with an inner corner, cut from one end of the L's notch side to the other
  const L = [[0, 0], [20, 0], [20, 20], [40, 20], [40, 40], [0, 40]];
  assert.throws(() => cutAlongArc(L, [0, 0], [40, 20]), /curved face/);
  // a near-straight edge with millimetre noise
  const noisy = [[0, 0], [10, 0.01], [20, 0.015], [30, 0.01], [40, 0], [40, 30], [0, 30]];
  assert.throws(() => cutAlongArc(noisy, [0, 0], [40, 0]), /curved face/);
});

for (const file of BUILDS) {
  test(`designs (${file}): the California Tower's fence follows OpenStreetMap's site outline, so the whole lot is fenced`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const f = data.buildings.find((b) => b.name === "California Tower").footprints[0];
    const zone = data.construction.find((z) => z.id === f.underConstruction.zoneId);
    assert.deepStrictEqual(zone.ring, f.ring, "the fence is the OSM construction outline");
    assert.strictEqual(zone.ringSource, `osm:${f.osmId}`);
    assert.ok(Math.abs(zone.coversHeight - f.height) < 1e-9, "its sign still clears the tower");
  });
}
