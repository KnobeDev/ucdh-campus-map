// The 2D page itself (index.html) and what its site-mode scripts may contain.
//
// The page carries, as plain HTML that no script writes or removes, the line
// that says what this build is and the data credit. The mode script loads
// before anything that reads storage or data.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const HTML = read("index.html");
const CSS = read("styles.css");
const NOTICE = "Unofficial test build — not affiliated with UC Davis Health";
const CREDIT = require(path.join(ROOT, "drawn-basemap.js")).CREDIT;

const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attrs, body]) => ({
  src: (/\bsrc="([^"]+)"/.exec(attrs) || [])[1] || null,
  babel: /type="text\/babel"/.test(attrs),
  body: body.trim(),
}));
const order = scripts.map((s) => (s.src || "").split("?")[0]);
const before = (a, b) => order.indexOf(a) >= 0 && order.indexOf(b) >= 0 && order.indexOf(a) < order.indexOf(b);

test("the page says what it is and whose data it draws, in plain HTML before the app", () => {
  const header = /<header class="build-bar">\s*<p id="build-notice" class="build-notice">([^<]+)<\/p>\s*<p id="map-credit" class="map-credit">([^<]+)<\/p>\s*<\/header>\s*<div id="root"><\/div>/.exec(HTML);
  assert.ok(header, "the build bar comes right before #root");
  assert.strictEqual(header[1], NOTICE);
  assert.strictEqual(header[2], CREDIT);
});

test("no stylesheet rule hides those two lines", () => {
  for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.build-bar|\.build-notice|\.map-credit/.test(rule[1])) continue;
    assert.doesNotMatch(rule[2], /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|font-size\s*:\s*0(?![.\d])|clip\s*:|clip-path|left\s*:\s*-\d{3}/, rule[1].trim());
  }
  assert.match(CSS, /\.build-bar\s*\{/);
});

test("no script names those lines or their text: nothing can rewrite them", () => {
  for (const file of fs.readdirSync(ROOT).filter((f) => /\.(js|jsx)$/.test(f))) {
    const text = read(file);
    assert.doesNotMatch(text, /build-notice|map-credit|build-bar/, file);
    assert.ok(!text.includes(NOTICE), file);
  }
});

test("the mode is decided before anything reads storage or data", () => {
  for (const later of ["tweaks-panel.jsx", "data.jsx", "default-edits-loader.js", "edit-store.jsx", "route-pins.jsx", "site-data.js",
    "drawn-basemap.js", "app.jsx"]) {
    assert.ok(before("map-mode.js", later), `map-mode.js before ${later}`);
  }
  assert.ok(before("site-data.js", "app.jsx") && before("drawn-basemap.js", "app.jsx"));
  assert.ok(before("edit-store.jsx", "app.jsx") && before("routing.jsx", "app.jsx") && before("sidebar.jsx", "app.jsx"), "app.jsx boots last");
});

test("the page has no inline script, no style attribute, and no dead 1 MB picture script", () => {
  for (const s of scripts) assert.ok(s.src && s.body === "", `an inline script: ${s.body.slice(0, 40)}`);
  assert.doesNotMatch(HTML, /\sstyle="/);
  assert.ok(!order.includes("campus-map-inline.js"), "campus-map-inline.js inlines the official map and nothing reads it");
});

test("the site-mode scripts never name the official map, the editor's file, or any API", () => {
  for (const file of ["map-mode.js", "site-data.js", "drawn-basemap.js"]) {
    const text = read(file);
    assert.doesNotMatch(text, /campus-map|default-edits|uploads\/|\/api\/|localStorage\.(get|set|remove)Item/, file);
  }
});

test("nothing but the mode script reaches for the browser's storage by name", () => {
  for (const file of ["edit-store.jsx", "route-pins.jsx", "default-edits-loader.js", "app.jsx", "map.jsx", "sidebar.jsx", "routing.jsx"]) {
    const code = read(file).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /\blocalStorage\b|\bsessionStorage\b/, `${file} goes through MapMode.storage()`);
  }
});

test("the editor's host messages and the Tweaks panel are for the local build only", () => {
  const tweaks = read("tweaks-panel.jsx");
  // every postMessage sits behind the mode's editor switch
  const posts = [...tweaks.matchAll(/postMessage\(/g)].length;
  const guarded = [...tweaks.matchAll(/hostPost\(/g)].length;
  assert.strictEqual(posts, 1, "one place posts to the host");
  assert.ok(guarded >= 3, "and every caller goes through it");
  assert.match(tweaks, /function hostPost\([^)]*\)\s*\{\s*if \(!window\.MapMode\?\.current\?\.editor\) return;/);
  const app = read("app.jsx");
  assert.match(app, /mode\.editor && <TweaksPanelInner/);
  assert.match(app, /const editMode = mode\.editor && !!tweaks\.editMode;/);
});

test("directions state one scale: each step's distance uses the scale the total uses", () => {
  // routing.jsx totals with MAP_SCALE (the site build's real feet per frame unit); a step
  // shown at another scale would not add up to the total it sits under.
  assert.match(read("routing.jsx"), /const ftPerPx = window\.MAP_SCALE\?\.ftPerPx \|\| 2\.0;/);
  assert.match(read("sidebar.jsx"), /s\.dist \* \(window\.MAP_SCALE\?\.ftPerPx \|\| 1\.5\)/);
});

test("the floor-plan panel is behind the mode in every place that can open it", () => {
  // floorplan.jsx draws over the official floor diagram (uploads/). The site's build leaves
  // the file out, and these keep the panel shut even on a page that still loads it.
  const sidebar = read("sidebar.jsx");
  const offers = [...sidebar.matchAll(/getFloorPlanForBuilding\(selected\.code\)|window\.FloorPlanPanel &&/g)];
  assert.ok(offers.length >= 2);
  for (const line of sidebar.split("\n").filter((l) => /getFloorPlanForBuilding\(selected\.code\) && \(|window\.FloorPlanPanel && \(/.test(l))) {
    assert.match(line, /window\.MapMode\.current\.floorPlans &&/, line.trim());
  }
  assert.match(read("app.jsx"), /\{mode\.floorPlans && panelMode === "floorplan"/);
});

test("the site map is applied from its own document and checked before anything is drawn", () => {
  const store = read("edit-store.jsx");
  const loadSite = store.slice(store.indexOf("loadSite(edits) {"), store.indexOf("// ---- Backup API ----"));
  assert.match(loadSite, /applyEdits\(all\);/);
  assert.doesNotMatch(loadSite, /readEdits\(/, "never from what storage hands back");
  const app = read("app.jsx");
  const order = ["window.editStore.loadSite(built.edits)", "window.SiteData.applied(built, window.BUILDINGS)", "root.render(<App basemap={basemap} />)"].map((s) => app.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
});
