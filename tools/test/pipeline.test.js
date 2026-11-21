// Tests for the 3D data pipeline.
//
//   run:  node --test tools/test/
//
// These guard the invariants every later phase depends on: that the coordinate
// transforms round-trip, that the join never hands one footprint to two
// buildings, and that no building silently ends up with no geometry at all.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { pxToEnu, enuToPx, lonLatToEnu, enuToLonLat, GEOREF } = require("../lib/georef");
const geom = require("../lib/geom");
const { tokenize, nameScore, buildIdf } = require("../lib/match");
const { resolveHeight } = require("../lib/heights");
const { loadCurated } = require("../lib/curated");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");

test("georef: px -> ENU -> px round-trips to sub-millimetre", () => {
  for (const [px, py] of [[0, 0], [459.5, 396], [919, 792], [123.4, 567.8]]) {
    const [x, z] = pxToEnu(px, py);
    const [bx, by] = enuToPx(x, z);
    assert.ok(Math.abs(bx - px) < 1e-3, `x drifted: ${px} -> ${bx}`);
    assert.ok(Math.abs(by - py) < 1e-3, `y drifted: ${py} -> ${by}`);
  }
});

test("georef: lon/lat -> ENU -> lon/lat round-trips", () => {
  const [lon0, lat0] = [-121.4555, 38.5549];
  const [x, z] = lonLatToEnu(lon0, lat0);
  const [lon1, lat1] = enuToLonLat(x, z);
  assert.ok(Math.abs(lon1 - lon0) < 1e-9);
  assert.ok(Math.abs(lat1 - lat0) < 1e-9);
});

test("georef: the ENU origin sits at the map centre", () => {
  const [x, z] = pxToEnu(GEOREF.mapPx.w / 2, GEOREF.mapPx.h / 2);
  assert.ok(Math.hypot(x, z) < 5, `origin is ${Math.hypot(x, z).toFixed(1)} m off centre`);
});

test("georef: +z points south and +x points east", () => {
  const [, zNorth] = pxToEnu(459.5, 0);
  const [, zSouth] = pxToEnu(459.5, 792);
  assert.ok(zNorth < zSouth, "top of the map must have a smaller z than the bottom");
  const [xWest] = pxToEnu(0, 396);
  const [xEast] = pxToEnu(919, 396);
  assert.ok(xWest < xEast, "left of the map must have a smaller x than the right");
});

test("geom: area and centroid of a known square", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.strictEqual(geom.area(sq), 100);
  const [cx, cz] = geom.centroid(sq);
  assert.ok(Math.abs(cx - 5) < 1e-9 && Math.abs(cz - 5) < 1e-9);
});

test("geom: IoU is 1 for identical rings and 0 for disjoint ones", () => {
  const a = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const b = [[100, 100], [110, 100], [110, 110], [100, 110]];
  assert.ok(geom.iou(a, a) > 0.98);
  assert.strictEqual(geom.iou(a, b), 0);
});

test("geom: coverage detects a ring fully inside another", () => {
  const outer = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const inner = [[5, 5], [10, 5], [10, 10], [5, 10]];
  assert.ok(geom.coverage(outer, inner) > 0.95);
  assert.ok(geom.coverage(inner, outer) < 0.3);
});

test("geom: cleanRing removes a spike that would wreck the extrusion", () => {
  const spiked = [[0, 0], [10, 0], [10, 10], [10, 0.0001], [0, 10]];
  assert.ok(geom.cleanRing(spiked).length < spiked.length);
});

test("match: numerals are interchangeable between roman and arabic", () => {
  const idf = buildIdf([["Research 1"], ["Research II"], ["Research III"], ["Glassrock"]]);
  // The bug this guards: without the alias, "Research 1" scored 0 against every
  // Research building and the join fell through to footprint overlap, labelling
  // Research I as Research 2.
  const right = nameScore(["Research 1"], ["Research I"], idf);
  const wrong = nameScore(["Research 1"], ["Research II"], idf);
  assert.ok(right > wrong, `expected Research 1 to prefer Research I (${right} vs ${wrong})`);
});

test("match: tokenizer splits letter/digit runs and drops filler words", () => {
  assert.deepStrictEqual(tokenize("48X Complex"), ["48", "x", "complex"]);
  assert.ok(!tokenize("UC Davis Pathology Building").includes("building"));
  assert.ok(tokenize("UC Davis Pathology Building").includes("pathology"));
});

test("heights: provenance is reported honestly and never invented", () => {
  const osm = resolveHeight({ levels: 5, cat: "clinic" });
  assert.strictEqual(osm.heightSource, "OpenStreetMap");
  assert.strictEqual(osm.floors, 5);

  const plan = resolveHeight({ osmName: "UC Davis Davis Tower", cat: "hospital" });
  assert.strictEqual(plan.heightSource, "floorplan");
  assert.strictEqual(plan.floors, 12);

  const guess = resolveHeight({ osmName: "Something Unknown", cat: "admin" });
  assert.strictEqual(guess.heightSource, "estimated");
  assert.ok(guess.height > 0);

  // An OSM levels tag must always win over a category guess.
  assert.strictEqual(resolveHeight({ levels: 2, cat: "hospital" }).heightSource, "OpenStreetMap");
});

test("curated: every merged building carries a usable polygon", () => {
  const cur = loadCurated();
  assert.ok(cur.buildings.length > 50);
  for (const b of cur.buildings) {
    assert.ok(b.code, "a building has no code");
    assert.ok(Array.isArray(b.pxPoints) && b.pxPoints.length >= 3, `${b.code} has no polygon`);
  }
});

test("curated: graph edges never reference a deleted node", () => {
  const { graph } = loadCurated();
  for (const e of graph.edges) {
    assert.ok(graph.nodes[e.a], `edge references missing node ${e.a}`);
    assert.ok(graph.nodes[e.b], `edge references missing node ${e.b}`);
  }
});

// --- invariants on the generated artefact ---------------------------------

const generated = () => {
  if (!fs.existsSync(DATA)) return null;
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
};

test("output: every building has at least one footprint with a height", (t) => {
  const data = generated();
  if (!data) return t.skip("run `node tools/gen-3d-data.js` first");
  for (const b of data.buildings) {
    assert.ok(b.footprints.length >= 1, `${b.code} has no footprint`);
    for (const f of b.footprints) {
      assert.ok(f.ring.length >= 3, `${b.code} footprint ring is degenerate`);
      // Flat footprints (surface lots, parks matched to OSM areas) legitimately have height 0.
      assert.ok(f.height > 0 || f.floors === 0, `${b.code} footprint has no height`);
      assert.ok(["osm", "traced"].includes(f.geomSource));
      // "not mapped": a footprint whose storeys no source gives (the Medical Center's outline:
      // OSM has no building:levels, the floor plan shows only its ground floor there).
      assert.ok(["OpenStreetMap", "floorplan", "estimated", "curated", "not mapped"].includes(f.heightSource));
    }
  }
});

test("output: no OSM footprint is claimed by two different buildings", (t) => {
  const data = generated();
  if (!data) return t.skip("run `node tools/gen-3d-data.js` first");
  const owner = new Map();
  for (const b of data.buildings) {
    for (const f of b.footprints) {
      if (f.osmId == null) continue;
      assert.ok(
        !owner.has(f.osmId),
        `OSM way ${f.osmId} claimed by both ${owner.get(f.osmId)} and ${b.code}`
      );
      owner.set(f.osmId, b.code);
    }
  }
});

test("output: context buildings never duplicate a claimed footprint", (t) => {
  const data = generated();
  if (!data) return t.skip("run `node tools/gen-3d-data.js` first");
  const claimed = new Set(
    data.buildings.flatMap((b) => b.footprints.map((f) => f.osmId).filter((v) => v != null))
  );
  for (const c of data.context) {
    assert.ok(!claimed.has(c.osmId), `context way ${c.osmId} is also a campus building`);
  }
});

test("output: building codes are unique", (t) => {
  const data = generated();
  if (!data) return t.skip("run `node tools/gen-3d-data.js` first");
  const seen = new Set();
  for (const b of data.buildings) {
    assert.ok(!seen.has(b.code), `duplicate building code ${b.code}`);
    seen.add(b.code);
  }
});

test("output: geometry stays inside the declared world box", (t) => {
  const data = generated();
  if (!data) return t.skip("run `node tools/gen-3d-data.js` first");
  const w = data.meta.world;
  const slack = 400; // a way may cross the edge; it just can't be somewhere else entirely
  for (const p of data.paths) {
    const inside = p.pts.some(
      ([x, z]) =>
        x > w.minX - slack && x < w.maxX + slack && z > w.minZ - slack && z < w.maxZ + slack
    );
    assert.ok(inside, `path ${p.osmId} lies wholly outside the world box`);
  }
});

test("heights: Vanderhoef Commons is an outdoor field — flat, not a 1-storey box", () => {
  const { resolveHeight } = require("../lib/heights");
  const h = resolveHeight({ code: "VC", cat: "amenity" });
  assert.strictEqual(h.floors, 0);
  assert.strictEqual(h.height, 0);
  assert.strictEqual(h.heightSource, "curated");
  // the category default still applies to other amenities
  assert.ok(resolveHeight({ code: "ZZ", cat: "amenity" }).height > 0);
});

test("construction: a footprint mostly inside an active zone is marked under construction; the zone learns its height", () => {
  const { markUnderConstruction } = require("../lib/construction-cover");
  const sq = (x, z, s) => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];
  const buildings = [
    { code: "U", footprints: [{ ring: sq(10, 10, 20), height: 16.8 }] }, // fully inside
    { code: "H", footprints: [{ ring: sq(35, 10, 20), height: 6.8 }] }, // straddles: 25% inside
    { code: "F", footprints: [{ ring: sq(100, 100, 5), height: 3 }] }, // far away
    { code: "T", renderedBy: "hospital", footprints: [{ ring: sq(12, 12, 4), height: 30 }] }, // never ghosted
  ];
  const zones = [
    { id: "z1", name: "Site", endDate: "2030-01-01", ring: sq(0, 0, 40) },
    { id: "old", name: "Done", endDate: "2020-01-01", ring: sq(100, 100, 40) }, // expired: ignored
  ];
  const out = markUnderConstruction(buildings, zones, "2026-09-14");
  assert.deepStrictEqual(out.buildings[0].footprints[0].underConstruction, { zoneId: "z1", endDate: "2030-01-01" });
  assert.strictEqual(out.buildings[1].footprints[0].underConstruction, undefined, "a quarter inside is not under construction");
  assert.strictEqual(out.buildings[2].footprints[0].underConstruction, undefined, "an expired zone marks nothing");
  assert.strictEqual(out.buildings[3].footprints[0].underConstruction, undefined, "the hospital is rendered elsewhere");
  assert.strictEqual(out.zones[0].coversHeight, 16.8, "the sign must clear the tallest covered building");
  assert.strictEqual(out.zones[1].coversHeight, 0);
  assert.notStrictEqual(out.buildings, buildings, "inputs are not mutated");
  assert.strictEqual(buildings[0].footprints[0].underConstruction, undefined);
});

test("construction: an unnamed admin hotspot is a zone's ground, never a building", () => {
  const { isPlaceholderHotspot, dropPlaceholders } = require("../lib/construction-cover");
  assert.ok(isPlaceholderHotspot({ name: "New hotspot" }));
  assert.ok(!isPlaceholderHotspot({ name: "Pathology Building" }));
  const buildings = [
    { code: "X3", name: "New hotspot", footprints: [{ ring: [[0, 0], [1, 0], [1, 1]], height: 6.8, floors: 2, heightSource: "estimated" }] },
    { code: "P", name: "Pathology Building", footprints: [{ ring: [[0, 0], [1, 0], [1, 1]], height: 7.2, floors: 2, heightSource: "estimated" }] },
  ];
  // Not drawn, not a lot, not a destination: left out of the 3D data (it was a flat lot under the hospital).
  const out = dropPlaceholders(buildings);
  assert.deepStrictEqual(out.map((b) => b.code), ["P"]);
  assert.strictEqual(out[0].footprints[0].height, 7.2);
  assert.strictEqual(buildings.length, 2, "inputs are not mutated");
});
