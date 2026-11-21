#!/usr/bin/env node
//
// Writes ucdh-data/osm-extra.json: OpenStreetMap ways that are buildings on the
// ground but carry no building=* tag, so the main extract's building query
// (tools/fetch-osm.sh) never returns them. Each one is listed here with why.
//
//   run:  node tools/fetch-osm-extra.js        (Node 18 or later: it uses fetch)
//
// Reads each way from the OSM API (way/<id>/full) and stores it in the same
// shape as the Overpass extract ("out geom": tags + a lat/lon geometry), with
// its version and edit time, so a refresh shows when a way changed. Writes only
// when every way came back whole. Data is ODbL, credited like the main extract.
"use strict";

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "ucdh-data", "osm-extra.json");
const API = "https://api.openstreetmap.org/api/0.6";
const TIMEOUT_MS = 30000;

// Only ways that ARE a building's outline belong here. Checked and left out (2026-11-21):
// way 198423270 "UC Davis Institute for Regenerative Cures" is the institute's whole site,
// a 10,625 m² parcel between Stockton Blvd and its footpaths, not the building.
const WAYS = [
  {
    id: 796721511,
    why: "The MIND Institute (2825 50th Street) is mapped as amenity=research_institute with no building=* tag, so the main extract's building query misses it and the map could only show a signpost.",
  },
];

async function fetchWay({ id, why }) {
  const res = await fetch(`${API}/way/${id}/full.json`, {
    headers: { "User-Agent": "campus-map-osm-extra" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`way ${id}: HTTP ${res.status}`);
  const body = await res.json();
  const nodes = new Map(body.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
  const way = body.elements.find((e) => e.type === "way" && e.id === id);
  if (!way) throw new Error(`way ${id}: not in the response`);
  if (way.visible === false) throw new Error(`way ${id}: deleted in OpenStreetMap`);
  const geometry = way.nodes.map((n) => {
    const node = nodes.get(n);
    if (!node) throw new Error(`way ${id}: node ${n} missing`);
    return { lat: node.lat, lon: node.lon };
  });
  if (geometry.length < 4) throw new Error(`way ${id}: only ${geometry.length} points`);
  return { type: "way", id, version: way.version, timestamp: way.timestamp, tags: way.tags || {}, why, geometry };
}

(async () => {
  const elements = [];
  for (const w of WAYS) elements.push(await fetchWay(w));
  const out = {
    retrieved: new Date().toLocaleDateString("en-CA"), // the local date, YYYY-MM-DD
    source: `${API}/way/<id>/full.json`,
    licence: "© OpenStreetMap contributors, ODbL",
    elements,
  };
  // temp file then rename: a reader never sees half a file
  const tmp = `${OUT}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(out, null, 1)}\n`);
  fs.renameSync(tmp, OUT);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${elements.map((e) => `way ${e.id} v${e.version}`).join(", ")}`);
})().catch((err) => {
  console.error(`fetch-osm-extra: ${err.message} (nothing written)`);
  process.exit(1);
});
