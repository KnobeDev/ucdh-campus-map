// The build's switches (3d/app-config.js) and the 2D map's mode (map-mode.js).
//
// Two builds of one map: `local`, the owner's machine, with the editor and
// edits kept in the browser; and `site`, the unofficial test build, with no
// editor, nothing kept in the browser, and the campus drawn from data. The
// file 3d/app-config.json is the only input, and anything wrong with it means
// the site build: failing closed is the point.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..", "..");
const CONFIG = pathToFileURL(path.join(ROOT, "3d", "app-config.js")).href;
const MapMode = require(path.join(ROOT, "map-mode.js"));

const SITE_FILE = { mode: "site", sessions: false, admin: false, entitlementUrl: "/health-campus/api/entitlement" };
const jsonResponse = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

test("app-config: the committed file is the local build, exactly", async () => {
  const { parseAppConfig, LOCAL_DEFAULTS } = await import(CONFIG);
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "3d", "app-config.json"), "utf8"));
  assert.deepStrictEqual(committed, { ...LOCAL_DEFAULTS });
  const { config, problem } = parseAppConfig(committed);
  assert.strictEqual(problem, null);
  assert.strictEqual(config.mode, "local");
  assert.strictEqual(config.sessions, true);
});

test("app-config: the site's file is accepted, and names a same-origin entitlement address", async () => {
  const { parseAppConfig } = await import(CONFIG);
  const { config, problem } = parseAppConfig(SITE_FILE);
  assert.strictEqual(problem, null);
  assert.deepStrictEqual({ ...config }, { ...SITE_FILE, voice: "device" });
});

test("app-config: anything wrong with the file is the site-safe set", async () => {
  const { parseAppConfig, SITE_SAFE } = await import(CONFIG);
  const bad = [
    null, [], "site", 7,
    {},
    { mode: "site", sessions: false, admin: false },
    { ...SITE_FILE, extra: 1 },
    { ...SITE_FILE, mode: "Site" },
    { ...SITE_FILE, sessions: true },
    { ...SITE_FILE, admin: true },
    { ...SITE_FILE, sessions: "false" },
    { ...SITE_FILE, entitlementUrl: "https://example.com/x" },
    { ...SITE_FILE, entitlementUrl: "//example.com/x" },
    { ...SITE_FILE, entitlementUrl: "/a/../b" },
    { ...SITE_FILE, entitlementUrl: "/a%2fb" },
    { ...SITE_FILE, entitlementUrl: 5 },
  ];
  for (const value of bad) {
    const { config, problem } = parseAppConfig(value);
    assert.ok(problem, JSON.stringify(value));
    assert.deepStrictEqual({ ...config }, { ...SITE_SAFE, voice: "device" }, JSON.stringify(value));
  }
});

test("app-config: a file that cannot be read is the site-safe set, never the local build", async () => {
  const { loadAppConfig, SITE_SAFE } = await import(CONFIG);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const cases = [
      async () => { throw new Error("offline"); },
      async () => jsonResponse(null, 404),
      async () => jsonResponse(null, 500),
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("<html>"); } }),
      async () => jsonResponse({ mode: "local" }),
    ];
    for (const fetchImpl of cases) {
      const config = await loadAppConfig({ fetchImpl, url: "http://x.test/3d/app-config.json" });
      assert.deepStrictEqual({ ...config }, { ...SITE_SAFE, voice: "device" });
    }
    const good = await loadAppConfig({ fetchImpl: async () => jsonResponse(SITE_FILE), url: "http://x.test/3d/app-config.json" });
    assert.strictEqual(good.entitlementUrl, "/health-campus/api/entitlement");
  } finally {
    console.warn = warn;
  }
});

test("map-mode: only a local config is local; everything else is the site map", () => {
  const local = MapMode.modeFrom({ mode: "local", sessions: true, admin: false, entitlementUrl: null });
  assert.deepStrictEqual({ ...local }, { name: "local", site: false, editor: true, storedEdits: true, drawnBasemap: false, floorPlans: true });
  for (const config of [null, undefined, {}, SITE_FILE, { mode: "LOCAL" }, { mode: "site", sessions: true }]) {
    assert.deepStrictEqual({ ...MapMode.modeFrom(config) },
      { name: "site", site: true, editor: false, storedEdits: false, drawnBasemap: true, floorPlans: false }, JSON.stringify(config));
  }
  assert.ok(Object.isFrozen(local));
});

/** A window whose localStorage counts every touch, and throws if `forbidden`. */
function fakeWindow({ forbidden = false } = {}) {
  const touched = [];
  const real = new Map();
  const storage = {
    getItem: (k) => { touched.push(`get ${k}`); return real.has(k) ? real.get(k) : null; },
    setItem: (k, v) => { touched.push(`set ${k}`); real.set(k, String(v)); },
    removeItem: (k) => { touched.push(`remove ${k}`); real.delete(k); },
  };
  const win = {
    document: { baseURI: "http://map.test/index.html" },
    location: { href: "http://map.test/index.html" },
    history: { state: null, replaceState() {} },
    get localStorage() {
      touched.push("localStorage");
      if (forbidden) throw new Error("storage is blocked");
      return storage;
    },
  };
  return { win, touched };
}
const parserFor = (config) => async () => ({ loadAppConfig: async () => config });

test("map-mode: until the mode is known, and on the site, nothing touches the browser's storage", async () => {
  const { win, touched } = fakeWindow();
  const state = MapMode.start(win, { importParser: parserFor(SITE_FILE) });
  assert.strictEqual(state.current, null);
  state.storage().setItem("k", "before");
  const mode = await state.ready;
  assert.strictEqual(mode.site, true);
  assert.strictEqual(state.current, mode);
  state.storage().setItem("ucd-campus-map-edits-v2", "{}");
  assert.strictEqual(state.storage().getItem("ucd-campus-map-edits-v2"), "{}");
  assert.strictEqual(state.storage().getItem("k"), "before", "one page-lived store before and after");
  assert.deepStrictEqual(touched, []);
  assert.ok(Object.isFrozen(state));
});

test("map-mode: the local build keeps edits in the browser, as it always did", async () => {
  const { win, touched } = fakeWindow();
  const state = MapMode.start(win, { importParser: parserFor({ mode: "local", sessions: true, admin: false, entitlementUrl: null }) });
  const mode = await state.ready;
  assert.strictEqual(mode.editor, true);
  state.storage().setItem("ucd-campus-map-edits-v2", "{}");
  assert.ok(touched.includes("set ucd-campus-map-edits-v2"));
});

test("map-mode: a parser that fails to load, or storage the browser blocks, never throws", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const a = fakeWindow();
    const failed = MapMode.start(a.win, { importParser: async () => { throw new Error("404"); } });
    assert.strictEqual((await failed.ready).site, true);
    const b = fakeWindow();
    const noFunction = MapMode.start(b.win, { importParser: async () => ({}) });
    assert.strictEqual((await noFunction.ready).site, true);
    const c = fakeWindow({ forbidden: true });
    const blocked = MapMode.start(c.win, { importParser: parserFor({ mode: "local", sessions: true, admin: false, entitlementUrl: null }) });
    await blocked.ready;
    blocked.storage().setItem("k", "v");
    assert.strictEqual(blocked.storage().getItem("k"), "v");
  } finally {
    console.warn = warn;
  }
});

test("map-mode: a config that never arrives is the site map, not a blank page for ever", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { win } = fakeWindow();
    const never = MapMode.start(win, { importParser: () => new Promise(() => {}), timeoutMs: 20 });
    const mode = await never.ready;
    assert.strictEqual(mode.site, true);
    assert.strictEqual(never.current, mode);
  } finally {
    console.warn = warn;
  }
});

test("app-config: a file that never arrives is the site-safe set, within the time allowed", async () => {
  const { loadAppConfig, SITE_SAFE } = await import(CONFIG);
  const warn = console.warn;
  console.warn = () => {};
  try {
    let seen = null;
    // a request that only ends when its signal aborts, as a stalled connection does
    const stalled = (url, init) => new Promise((resolve, reject) => {
      seen = init;
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
    const started = Date.now();
    const config = await loadAppConfig({ fetchImpl: stalled, url: "http://x.test/3d/app-config.json", timeoutMs: 30 });
    assert.deepStrictEqual({ ...config }, { ...SITE_SAFE, voice: "device" });
    assert.ok(Date.now() - started < 2000);
    assert.strictEqual(seen.cache, "no-cache");
  } finally {
    console.warn = warn;
  }
});
