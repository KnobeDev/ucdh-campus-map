// The 2D page in a real browser, in each build.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node --test tools/test/site-mode.browser.test.js
//
// Skipped without PLAYWRIGHT_MODULE (this repo has no dependencies of its own). The page
// loads React and Babel from unpkg, as it does on the owner's machine, so it also needs the
// network; the site's own build compiles them in and needs none.
//
// Why it exists: the unit tests check each piece, but only a browser shows whether the
// pieces meet. The edit store swallows storage errors by design, so a wiring mistake there
// draws a map from the bare base records and reports nothing.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
const SITE_CONFIG = JSON.stringify({ mode: "site", sessions: false, admin: false, entitlementUrl: "/health-campus/api/entitlement" });
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".jsx": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
};
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "3d", "campus-data.json"), "utf8"));
const NOTICE = "Unofficial test build — not affiliated with UC Davis Health";

/** The worktree on 127.0.0.1, no dotfiles; `site` serves the site's app-config.json in place of the local one. */
function serve({ site, breakData = false }) {
  const asked = [];
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    asked.push(rel);
    if (rel.split("/").some((s) => s.startsWith("."))) { res.writeHead(404).end(); return; }
    if (site && rel === "/3d/app-config.json") { res.writeHead(200, { "Content-Type": TYPES[".json"] }).end(SITE_CONFIG); return; }
    if (breakData && rel === "/3d/campus-data.json") { res.writeHead(500).end("no"); return; }
    fs.readFile(path.join(ROOT, rel), (err, body) => {
      if (err) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, asked, base: `http://127.0.0.1:${server.address().port}` });
  }));
}

const state = () => ({
  mode: window.MapMode.current && window.MapMode.current.name,
  notice: document.getElementById("build-notice").textContent,
  noticeShown: document.getElementById("build-notice").getClientRects().length > 0,
  creditShown: document.getElementById("map-credit").getClientRects().length > 0,
  basemapPaths: document.querySelectorAll("svg .basemap path").length,
  picture: document.querySelector(".map-wrap svg image") ? document.querySelector(".map-wrap svg image").getAttribute("href") : null,
  markers: document.querySelectorAll(".bldg-marker").length,
  buildings: (window.BUILDINGS || []).map((b) => ({ code: b.code, name: b.name, marker: !!b.marker, parts: b.parts ? b.parts.length : 0, points: b.points ? b.points.length : 0 })),
  launcher: !!document.querySelector(".twk-launcher"),
  link3d: document.querySelector(".sb-3d-link") ? document.querySelector(".sb-3d-link").getAttribute("href") : null,
  stored: Object.keys(localStorage),
  unavailable: document.querySelector(".map-unavailable") ? document.querySelector(".map-unavailable").textContent : null,
  pageScrolls: document.documentElement.scrollHeight > window.innerHeight || document.documentElement.scrollWidth > window.innerWidth,
  scale: window.MAP_SCALE || null,
});

test("the 2D page in a browser", { skip: !PLAYWRIGHT && "set PLAYWRIGHT_MODULE to run the browser checks" }, async (t) => {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch();
  t.after(() => browser.close());

  /** Open the page against its own server; returns the page, what the server was asked, and errors. */
  async function open(options) {
    const { server, asked, base } = await serve(options);
    t.after(() => server.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app, .map-unavailable", { timeout: 30000 });
    return { page, asked, errors };
  }

  /** Search for the Medical Center (code T) and open its card, as a visitor would. */
  async function openMedicalCenter(page) {
    await page.locator(".sidebar input").first().fill("Medical Center");
    await page.locator(".sb-result")
      .filter({ has: page.locator(".sb-result-badge", { hasText: /^T$/ }) })
      .filter({ has: page.locator(".sb-result-name", { hasText: /^Medical Center$/ }) })
      .first().click();
    await page.getByRole("button", { name: /Directions to here/ }).waitFor();
  }

  await t.test("site build: the campus is drawn from the data file, and the official map is never asked for", async () => {
    const { page, asked, errors } = await open({ site: true });
    const s = await page.evaluate(state);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(s.mode, "site");
    assert.strictEqual(s.notice, NOTICE);
    assert.ok(s.noticeShown && s.creditShown, "the notice and the credit are on screen");
    assert.strictEqual(s.basemapPaths, 12);
    assert.strictEqual(s.picture, null, "no picture element");
    for (const p of asked) assert.doesNotMatch(p, /campus-map\.|default-edits\.json|uploads\/|floor-diagram|\/api\//, `the site build asked for ${p}`);
    assert.ok(asked.includes("/3d/campus-data.json"));

    // The map's records are the data file's, not the base ones: this is what a storage
    // wiring mistake breaks without a sound.
    const osm = (b) => b.footprints.some((f) => f.geomSource === "osm");
    const listed = DATA.buildings.filter((b) => !/^new hotspot$/i.test(b.name.trim()));
    assert.deepStrictEqual(s.buildings.map((b) => b.code).sort(), listed.map((b) => b.code).sort());
    assert.deepStrictEqual(s.buildings.filter((b) => b.marker).map((b) => b.code).sort(), listed.filter((b) => !osm(b)).map((b) => b.code).sort());
    assert.strictEqual(s.markers, listed.filter((b) => !osm(b)).length, "each is drawn as a marker");
    const t1 = s.buildings.find((b) => b.code === "T");
    assert.ok(t1.parts >= 3 && t1.points > 20, "the Medical Center has its OpenStreetMap outlines");

    assert.strictEqual(s.launcher, false, "no Tweaks launcher");

    // The Medical Center has a floor plan in floorplan.jsx, which this page still loads; the
    // site build must not offer it, or ask for the official diagram it is drawn over.
    await openMedicalCenter(page);
    assert.strictEqual(await page.getByRole("button", { name: /floor plan/i }).count(), 0, "no Floor plan button on the site");
    for (const p of asked) assert.doesNotMatch(p, /uploads\//, `asked for ${p}`);
    assert.strictEqual(s.link3d, "3d/", "3D view is one link away");
    assert.deepStrictEqual(s.stored, [], "nothing is kept in the browser");
    assert.strictEqual(s.pageScrolls, false, "the bar and the app fit the window");
    assert.ok(s.scale && s.scale.ftPerPx > 5 && s.scale.ftPerPx < 5.6);

    // Every listed place can be routed to from the Medical Center, at a believable distance.
    const routes = await page.evaluate(() => window.BUILDINGS.filter((b) => b.code !== "T").map((b) => {
      const r = window.buildRoute("B_T", `B_${b.code}`);
      return { code: b.code, ft: r ? r.totalFt : null };
    }));
    for (const r of routes) assert.ok(r.ft !== null && r.ft > 0 && r.ft < 12000, `T to ${r.code}: ${r.ft} ft`);
    await page.close();
  });

  await t.test("site build: a stored edit from earlier, or from another map on the origin, changes nothing", async () => {
    const { server, base } = await serve({ site: true });
    t.after(() => server.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.setItem("ucd-campus-map-edits-v2", JSON.stringify({ buildings: { T: { name: "PLANTED", _deleted: false } }, addedBuildings: { ZZ: { code: "ZZ", name: "PLANTED", cat: "admin", x: 1, y: 1, w: 9, h: 9 } } }));
      localStorage.setItem("ucd-campus-map-route-pins-v1", JSON.stringify({ "B_T__B_A": [{ x: 5, y: 5 }] }));
    });
    await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app");
    const s = await page.evaluate(state);
    assert.ok(!s.buildings.some((b) => b.name === "PLANTED" || b.code === "ZZ"));
    assert.deepStrictEqual(s.stored.sort(), ["ucd-campus-map-edits-v2", "ucd-campus-map-route-pins-v1"], "left as found, and nothing added");
    assert.strictEqual(await page.evaluate(() => window.buildRoute("B_T", "B_A").hasPins), false);
    await page.close();
  });

  await t.test("site build: without its data the page says so, and draws no half map", async () => {
    const { page } = await open({ site: true, breakData: true });
    const s = await page.evaluate(state);
    assert.match(s.unavailable, /could not load/);
    // the heading takes focus so it is read out, and there is a real way forward
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), "H1");
    assert.strictEqual(await page.getByRole("button", { name: "Reload the map" }).count(), 1);
    assert.strictEqual(await page.locator("main h1").count(), 1);
    assert.strictEqual(await page.locator(".map-wrap").count(), 0);
    assert.ok(s.noticeShown);
    await page.close();
  });

  await t.test("local build: the picture, the editor and the saved edits, as they always were", async () => {
    const { page, asked, errors } = await open({ site: false });
    const s = await page.evaluate(state);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(s.mode, "local");
    assert.strictEqual(s.picture, "campus-map.svg");
    assert.strictEqual(s.basemapPaths, 0);
    assert.strictEqual(s.markers, 0);
    assert.ok(asked.includes("/default-edits.json"), "the bundled defaults are read");
    assert.ok(s.stored.includes("ucd-campus-map-edits-v2"), "and kept in the browser");
    // the defaults reached the map: the editor's polygons, not the base rectangles
    const defaults = JSON.parse(fs.readFileSync(path.join(ROOT, "default-edits.json"), "utf8"));
    const withPolygon = Object.entries(defaults.buildings).filter(([, o]) => o.points && !o._deleted).map(([code]) => code);
    assert.ok(withPolygon.length > 40);
    for (const code of withPolygon) {
      const b = s.buildings.find((x) => x.code === code);
      assert.ok(b && b.points >= 3, `${code} has its polygon from the saved edits`);
    }
    assert.strictEqual(s.launcher, true, "the Tweaks launcher is there");
    // and the floor plan is still offered for the Medical Center
    await openMedicalCenter(page);
    assert.ok(await page.getByRole("button", { name: /floor plan/i }).count() >= 1, "the Floor plan button is there locally");
    assert.strictEqual(s.scale, null);
    assert.ok(s.noticeShown && s.creditShown);
    assert.strictEqual(s.pageScrolls, false);
    await page.close();
  });
});
