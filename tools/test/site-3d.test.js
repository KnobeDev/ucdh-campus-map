// The 3D map's site build, and the data file both maps read on the site.
//
//   3d/campus-data.site.json  what a site release ships in place of 3d/campus-data.json:
//                             the same campus without any outline traced over the official
//                             map, made by tools/site-data.js (tools/lib/site-campus-data.js)
//   3d/entitlement.js         whether this visit includes members' extras (3d/fun/), asked of
//                             the server; the 3D map loads fun/ only after a yes
//   3d/index.html             carries the "Unofficial test build" line in plain HTML
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..", "..");
const { siteCampusData, isPlaceholder } = require(path.join(ROOT, "tools", "lib", "site-campus-data.js"));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const FULL = JSON.parse(read("3d/campus-data.json"));
const SITE = siteCampusData(FULL);
const ENTITLEMENT = pathToFileURL(path.join(ROOT, "3d", "entitlement.js")).href;
const NOTICE = "Unofficial test build — not affiliated with UC Davis Health";

test("site data: no outline traced over the official map is left in it, anywhere", () => {
  const text = JSON.stringify(SITE);
  assert.ok(!text.includes("traced"), "no footprint is marked traced");
  assert.ok(!text.includes("pxCenter"), "and no position in the official picture's own frame");
  // nor the picture's calibration: its pixels-to-world fit and that fit's error
  assert.deepStrictEqual(Object.keys(SITE.meta.georef), ["enuOrigin"], "only the 3D scene's origin is kept");
  assert.deepStrictEqual(SITE.meta.georef.enuOrigin, FULL.meta.georef.enuOrigin);
  assert.ok(FULL.meta.georef.cx && FULL.meta.georef.cy, "the full file has it");
  assert.ok(!text.includes("rmsMeters"));
  assert.ok(!text.includes(JSON.stringify(FULL.meta.georef.cx).slice(1, -1)), "the fit's numbers are nowhere in the file");
  const tracedRings = FULL.buildings.flatMap((b) => b.footprints.filter((f) => f.geomSource !== "osm").map((f) => JSON.stringify(f.ring)));
  assert.ok(tracedRings.length >= 10, "the full file has them");
  const buildings = JSON.stringify(SITE.buildings);
  for (const ring of tracedRings) assert.ok(!buildings.includes(ring), "a traced ring is still in the buildings");
});

test("site data: every named building is there, with its OpenStreetMap outlines or as a marker", () => {
  const named = FULL.buildings.filter((b) => !isPlaceholder(b));
  assert.deepStrictEqual(SITE.buildings.map((b) => b.code), named.map((b) => b.code));
  let markers = 0;
  for (const src of named) {
    const b = SITE.buildings.find((x) => x.code === src.code);
    assert.deepStrictEqual(b.footprints, src.footprints.filter((f) => f.geomSource === "osm"), src.code);
    assert.strictEqual(b.marker, b.footprints.length === 0, src.code);
    if (b.marker) markers++;
    for (const k of ["name", "label", "cat", "type", "entryNode", "departments", "center"]) assert.deepStrictEqual(b[k], src[k], `${src.code}.${k}`);
    if (src.renderedBy) assert.strictEqual(b.renderedBy, src.renderedBy);
    assert.ok(!("match" in b), `${src.code}: the join's working notes are not shipped`);
    assert.ok(b.center && Number.isFinite(b.center.x) && Number.isFinite(b.center.z), `${src.code} can be placed`);
  }
  assert.strictEqual(markers, named.filter((b) => !b.footprints.some((f) => f.geomSource === "osm")).length);
  assert.ok(markers > 0, "the full file has buildings OpenStreetMap lacks today");
});

test("site data: a place's saved share link is left out; its name makes the maps link instead", () => {
  assert.ok(FULL.points.pois.some((p) => p.mapsLink), "the full file has some");
  assert.ok(!JSON.stringify(SITE.points).includes("mapsLink"));
  assert.ok(!JSON.stringify(SITE).includes("goo.gl"));
  assert.deepStrictEqual(SITE.points.pois, FULL.points.pois.map(({ mapsLink, ...rest }) => rest));
});

test("site data: a hotspot nobody named is not a place, and is left out", () => {
  // The full file no longer carries one either (gen-3d-data.js drops X1, the California Tower
  // site's, which was drawn as a lot under the Medical Center). Handed one, the site data still leaves it out.
  assert.ok(!FULL.buildings.some(isPlaceholder), "the full file has none");
  const placeholder = { code: "X1", name: "New hotspot", label: "X1", cat: "external", departments: [], center: { x: -69.8, z: -249.5 },
    footprints: [{ osmId: null, geomSource: "traced", ring: [[-74.53, -342.06], [-8.84, -327.62], [-145.03, -174.14]], floors: 0, height: 0, heightSource: "curated" }] };
  const handed = siteCampusData({ ...FULL, buildings: [...FULL.buildings, placeholder] });
  for (const site of [SITE, handed]) {
    assert.ok(!site.buildings.some(isPlaceholder));
    assert.ok(!JSON.stringify(site.buildings).includes("New hotspot"));
  }
});

test("site data: everything else is the full file's, untouched", () => {
  for (const key of Object.keys(FULL)) {
    if (key === "buildings" || key === "meta" || key === "points") continue;
    assert.deepStrictEqual(SITE[key], FULL[key], key);
  }
  for (const key of Object.keys(FULL.points)) {
    if (key !== "pois") assert.deepStrictEqual(SITE.points[key], FULL.points[key], `points.${key}`);
  }
  assert.deepStrictEqual(Object.keys(SITE).sort(), Object.keys(FULL).sort());
  const { site, counts, georef, frame2d, ...meta } = SITE.meta;
  const { counts: fullCounts, georef: fullGeoref, ...fullMeta } = FULL.meta;
  assert.deepStrictEqual(meta, fullMeta);
  assert.strictEqual(site, true);
  assert.deepStrictEqual([frame2d.w, frame2d.h], [919, 792]);
  assert.strictEqual(counts.buildings, SITE.buildings.length);
  assert.strictEqual(counts.footprints, SITE.buildings.reduce((n, b) => n + b.footprints.length, 0));
  assert.match(SITE.meta.attribution, /OpenStreetMap contributors/);
});

test("site data: making it changes nothing in the full data it is made from", () => {
  const before = JSON.stringify(FULL);
  siteCampusData(FULL);
  assert.strictEqual(JSON.stringify(FULL), before);
});

test("site data: the committed 3d/campus-data.site.json is today's, byte for byte what the tool writes", () => {
  const { render } = require(path.join(ROOT, "tools", "lib", "site-campus-data.js"));
  assert.strictEqual(read("3d/campus-data.site.json"), render(FULL),
    "3d/campus-data.json changed: run `node tools/site-data.js` and commit 3d/campus-data.site.json");
});

test("both maps read the site file on the site, and the 2D map never names the full one", () => {
  const SiteData = require(path.join(ROOT, "site-data.js"));
  assert.strictEqual(SiteData.DATA_URL, "3d/campus-data.site.json");
  assert.doesNotMatch(read("site-data.js"), /campus-data\.json/);
  const main = read("3d/main.js");
  assert.match(main, /config\.mode === "site" \? "campus-data\.site\.json" : "campus-data\.json"/);
});

const jsonResponse = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

test("entitlement: the local build has its extras; a site build with no one to ask has none", async () => {
  const { checkFun } = await import(ENTITLEMENT);
  const never = async () => { throw new Error("must not be called"); };
  assert.strictEqual(await checkFun({ mode: "local", entitlementUrl: null }, never), true);
  assert.strictEqual(await checkFun({ mode: "site", entitlementUrl: null }, never), false);
  assert.strictEqual(await checkFun(null, never), false);
  assert.strictEqual(await checkFun({}, never), false);
});

test("entitlement: on the site only the server's own yes unlocks, asked once, with the visitor's sign-in and no cache", async () => {
  const { checkFun } = await import(ENTITLEMENT);
  const config = { mode: "site", entitlementUrl: "/health-campus/api/entitlement" };
  const calls = [];
  const yes = await checkFun(config, async (url, init) => { calls.push([url, init]); return jsonResponse({ fun: true }); });
  assert.strictEqual(yes, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], "/health-campus/api/entitlement");
  assert.strictEqual(calls[0][1].credentials, "same-origin");
  assert.strictEqual(calls[0][1].cache, "no-store");
  assert.strictEqual(calls[0][1].redirect, "error", "a redirect to a sign-in page is a no, not followed");
  const noes = [
    async () => jsonResponse({ fun: false }),
    async () => jsonResponse({ fun: "true" }),
    async () => jsonResponse({ fun: 1 }),
    async () => jsonResponse({}),
    async () => jsonResponse(null),
    async () => jsonResponse([true]),
    async () => jsonResponse({ fun: true }, 404),
    async () => jsonResponse({ fun: true }, 500),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("<html>"); } }),
    async () => { throw new Error("offline"); },
  ];
  for (const fetchImpl of noes) assert.strictEqual(await checkFun(config, fetchImpl), false);
  // an inherited `fun` is not the server's answer
  assert.strictEqual(await checkFun(config, async () => jsonResponse(Object.create({ fun: true }))), false);
});

test("members' extras are reached only by import() after the check, never by a static import", () => {
  const dir = path.join(ROOT, "3d");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const code = read(`3d/${file}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /\bfrom\s+["']\.\/fun\//, `${file} imports from fun/ statically`);
    assert.doesNotMatch(code, /import\s+["']\.\/fun\//, `${file} imports fun/ statically`);
  }
  const main = read("3d/main.js");
  const check = main.indexOf("checkFun(config)");
  const load = main.indexOf('import("./fun/fun.js');
  assert.ok(check > 0 && load > check, "main.js asks first and loads after");
  assert.ok(fs.existsSync(path.join(dir, "fun", "fun.js")));
});

test("the 3D page says what it is in plain HTML: at the door and in the menu", () => {
  const html = read("3d/index.html");
  assert.ok(html.includes(`<p id="lobby-build-notice" class="build-notice">${NOTICE}</p>`));
  assert.ok(html.includes(`<p id="hud-build-notice" class="build-notice">${NOTICE}</p>`));
  assert.match(html, /<dialog id="lobby"[^>]*aria-describedby="lobby-build-notice"/);
  assert.match(html, /© <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a> contributors/);
  for (const file of fs.readdirSync(path.join(ROOT, "3d")).filter((f) => f.endsWith(".js"))) {
    const text = read(`3d/${file}`);
    assert.doesNotMatch(text, /build-notice/, `${file} must not touch the notice`);
    assert.ok(!text.includes(NOTICE), file);
  }
  const css = read("3d/styles.css");
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.build-notice/.test(rule[1])) continue;
    assert.doesNotMatch(rule[2], /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|font-size\s*:\s*0(?![.\d])/, rule[1].trim());
  }
});

// ---- signposted buildings are named, not only shown ----

const SPATIAL = pathToFileURL(path.join(ROOT, "3d", "spatial-core.js")).href;
const PLACES = [
  { name: "Near", x: 10, z: 0 },
  { name: "Far", x: 0, z: -35 },
  { name: "Beyond", x: 200, z: 200 },
];

test("sonar names the signposted buildings in reach, nearest first", async () => {
  const { placesInReach } = await import(SPATIAL);
  assert.deepStrictEqual(placesInReach(PLACES, 0, 0, 40), [
    { name: "Near", d: 10, x: 10, z: 0 },
    { name: "Far", d: 35, x: 0, z: -35 },
  ]);
  assert.deepStrictEqual(placesInReach(PLACES, 0, 0, 5), []);
  assert.deepStrictEqual(placesInReach([], 0, 0, 40), []);
});

test("What's ahead names a signposted building in front of the walker, and only in front", async () => {
  const { placeAhead } = await import(SPATIAL);
  // yaw 0 faces -z (north on the map): "Far" is 35 m dead ahead, "Near" is 10 m to the right
  assert.strictEqual(placeAhead(PLACES, 0, 0, 0, { reach: 40 }).place.name, "Far");
  assert.strictEqual(placeAhead(PLACES, 0, 0, 0), null, "35 m is past the default reach, and Near is off to the side");
  // turned to face east (+x), Near is ahead
  const east = -Math.PI / 2;
  const hit = placeAhead(PLACES, 0, 0, east);
  assert.strictEqual(hit.place.name, "Near");
  assert.ok(Math.abs(hit.d - 10) < 1e-9);
  // facing west, nothing
  assert.strictEqual(placeAhead(PLACES, 0, 0, Math.PI / 2, { reach: 40 }), null);
  // standing on it counts whichever way you face
  assert.strictEqual(placeAhead(PLACES, 10, 0.5, Math.PI / 2).place.name, "Near");
});

test("the 3D map hands its signposted buildings to sonar and to What's ahead", () => {
  const main = read("3d/main.js");
  assert.match(main, /const places = data\.buildings\.filter\(\(b\) => b\.marker && b\.center\)/);
  assert.match(main, /createSonar\(world, \{[^}]*\bplaces\b[^}]*\}\)/);
  assert.match(main, /createPicking\(world, \{[^}]*\bplaces\b/);
  assert.match(read("3d/sonar.js"), /out\.push\(\.\.\.placesInReach\(places, p\.x, p\.z, RING_M \* RINGS\)\)/);
  assert.match(read("3d/picking.js"), /placeAhead\(places, p\.x, p\.z, player\.object\.rotation\.y\)/);
});

test("with tours off, no path in the session code can reach a server or the browser's storage", () => {
  const code = read("3d/session.js").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  // one definition of api(), and every use goes through the guarded call()
  assert.strictEqual((code.match(/\bapi\(/g) || []).length, 2, "api( appears only in its definition and inside call()");
  assert.match(code, /const call = \(path, body\) => \(sessions \? api\(path, body\) : Promise\.reject\(/);
  // and what a session keeps in the browser goes through `store`, which is inert with sessions off
  assert.match(code, /const store = sessions \? storage : NO_STORAGE;/);
  const inside = code.slice(code.indexOf("export function createSession("));
  assert.strictEqual((inside.match(/\bstorage\./g) || []).length, 0, "createSession never uses the real storage object directly");
  for (const guarded of ["async function joinByCode(c, name) {\n    if (!sessions) return", "async function lateJoin() {\n    if (!sessions) return;",
    "if (!sessions || !active || !creds || role === \"guide\") return;", "if (!sessions || !active || !hooks || timer) return;",
    "if (!sessions || !active || inFlight || !hooks) return;"]) {
    assert.ok(code.includes(guarded), guarded);
  }
});

test("the voice button tells the truth where nothing can speak", () => {
  const speech = read("3d/speech.js");
  assert.match(speech, /get supported\(\) \{ return engine === "piper" \? \(typeof WebAssembly === "object" \|\| nativeVoice\) : nativeVoice; \}/);
  assert.match(read("3d/main.js"), /speech\.enabled && speech\.supported \? "The voice reads buildings aloud/);
});
