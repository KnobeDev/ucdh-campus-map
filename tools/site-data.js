#!/usr/bin/env node
// Writes 3d/campus-data.site.json, the campus data a site release ships, from
// 3d/campus-data.json (see tools/lib/site-campus-data.js for what is left out and why).
//
//   node tools/site-data.js           write it
//   node tools/site-data.js --check   exit 1 if the committed file is not today's
//
// Run it after every tools/gen-3d-data.js. tools/test/site-3d.test.js fails when it is stale.
"use strict";
const fs = require("fs");
const path = require("path");
const { render } = require("./lib/site-campus-data.js");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "3d", "campus-data.json");
const TARGET = path.join(ROOT, "3d", "campus-data.site.json");

const text = render(JSON.parse(fs.readFileSync(SOURCE, "utf8")));
if (process.argv.includes("--check")) {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : null;
  if (current !== text) {
    console.error("3d/campus-data.site.json is stale or missing: run `node tools/site-data.js`.");
    process.exit(1);
  }
  console.log("3d/campus-data.site.json is up to date.");
} else {
  fs.writeFileSync(TARGET, text);
  const site = JSON.parse(text);
  const markers = site.buildings.filter((b) => b.marker).length;
  console.log(`Wrote 3d/campus-data.site.json: ${site.buildings.length} buildings (${markers} as markers), ${text.length} bytes.`);
}
