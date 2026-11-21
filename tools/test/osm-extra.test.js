// OSM ways that are buildings but carry no building=* tag, so the main extract's
// building query never sees them (ucdh-data/osm-extra.json, tools/fetch-osm-extra.js).
// The MIND Institute is mapped as amenity=research_institute only: without the
// extra file the map could show it only as a signpost.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadOsm } = require("../lib/osm");
const { area } = require("../lib/geom");

const DIR = path.join(__dirname, "..", "..", "3d");
const EXTRA = path.join(__dirname, "..", "..", "ucdh-data", "osm-extra.json");

test("osm-extra: the file says where each way came from and why it is there", () => {
  const x = JSON.parse(fs.readFileSync(EXTRA, "utf8"));
  assert.match(x.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(x.source, /api\.openstreetmap\.org/);
  assert.ok(x.elements.length >= 1);
  for (const e of x.elements) {
    assert.strictEqual(e.type, "way");
    assert.ok(Number.isInteger(e.version), "the way's version, so a refresh can tell it changed");
    assert.ok(e.why && e.why.length > 20, `why ${e.id} is added by hand`);
    assert.ok(!e.tags.building, `${e.id} has no building tag; one that does belongs in the main extract`);
    assert.ok(e.geometry.length >= 4 && e.geometry.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));
  }
});

test("osm-extra: loadOsm offers the extra ways as buildings, marked as added", () => {
  const { buildings } = loadOsm();
  const mind = buildings.find((b) => b.osmId === 796721511);
  assert.ok(mind, "the MIND Institute's way is a building candidate");
  assert.strictEqual(mind.name, "University of California, Davis MIND Institute");
  assert.strictEqual(mind.addedFrom, "osm-extra");
  assert.ok(area(mind.ring) > 3000, `a building's worth of outline: ${area(mind.ring)}`);
  assert.strictEqual(buildings.filter((b) => b.osmId === 796721511).length, 1, "once, even if a refresh of the main extract ever picks it up too");
});

for (const file of ["campus-data.json", "campus-data.site.json"]) {
  test(`osm-extra (${file}): the MIND Institute stands on OpenStreetMap's outline, not as a signpost`, () => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const b = data.buildings.find((x) => x.code === "V2");
    assert.ok(b, "the building is there");
    assert.notStrictEqual(b.marker, true, "not a signpost any more");
    const f = b.footprints.find((x) => x.osmId === 796721511);
    assert.ok(f, JSON.stringify(b.footprints.map((x) => [x.osmId, x.geomSource])));
    assert.strictEqual(f.geomSource, "osm");
    assert.ok(f.height > 0, "a building, not a ground patch");
  });
}
