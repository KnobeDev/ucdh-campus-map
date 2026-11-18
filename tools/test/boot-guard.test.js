// The 3D page's loading line when the app fails to start (3d/boot-guard.js).
//
// The guard is a classic script that listens for "error" at the capture phase and writes a
// failure on the loading line while the map isn't up yet. Only the app's own failure counts:
// its module script (main.js, with everything it imports) failing to load, or an error thrown
// by one of the release's own files. Cloudflare Web Analytics adds its beacon to every page on
// the preview as <script type="module" src="https://static.cloudflareinsights.com/…">, the
// campus's CSP blocks it, and the guard wrote "The 3D campus failed to start: Failed to load
// https://static.cloudflareinsights…" over a map that opened (2026-11-17). A browser
// extension's script, another origin's, a picture or a stylesheet is not the app either.
//
// The real file runs here in a bare context with a fake page and a clock this test moves.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "3d", "boot-guard.js"), "utf8");
const LOADING_TEXT = "Loading the 3D campus…";
const PAGE_URL = "https://preview.horible.com/health-campus/app/v44-727c831c/3d/index.html";
const OWN_MAIN = "https://preview.horible.com/health-campus/app/v44-727c831c/3d/main.js?v=44";
const OWN_FILE = "https://preview.horible.com/health-campus/app/v44-727c831c/3d/world.js";
const BEACON = "https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe7772f49c399c6a5babf22c1241717689176015";

function fakeElement(tagName, props = {}) {
  return { nodeType: 1, tagName, hidden: false, ...props };
}

/** The page boot-guard.js sees: #loading, a clock, error listeners and location. */
function page({ href = PAGE_URL } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const errorListeners = [];
  const loading = fakeElement("P", { textContent: LOADING_TEXT });
  const win = {
    document: { getElementById: (id) => (id === "loading" ? loading : null) },
    location: { href, hostname: new URL(href).hostname },
    addEventListener(type, fn, capture) { if (type === "error") errorListeners.push({ fn, capture }); },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { throw new Error("not expected"); },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SOURCE, win, { filename: "boot-guard.js" });
  return {
    win, loading, errorListeners,
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) { timers.delete(id); t.fn(); }
      }
    },
    /** Fire an "error" event as the browser does, at the capture phase on window. */
    error(event) { for (const { fn } of errorListeners) fn({ target: win, ...event }); },
  };
}
const moduleScript = (src) => fakeElement("SCRIPT", { type: "module", src });
const FAILED = /^The 3D campus failed to start: /;

test("boot guard: the app's own module script failing to load is a failure to start", () => {
  const p = page();
  p.error({ target: moduleScript(OWN_MAIN) });
  assert.strictEqual(p.loading.textContent, `The 3D campus failed to start: Failed to load ${OWN_MAIN} — try a hard refresh (Ctrl+Shift+R).`);
});

test("boot guard: an error thrown by one of the release's own files is a failure to start", () => {
  const p = page();
  p.error({ message: "Uncaught SyntaxError: Unexpected token", filename: OWN_FILE });
  assert.match(p.loading.textContent, /^The 3D campus failed to start: Uncaught SyntaxError/);
});

test("boot guard: another origin's module script (the analytics beacon) failing is not a failure to start", () => {
  for (const src of [
    BEACON,
    "https://preview.horible.com/health-campus/app/v43-ffffffff/3d/main.js?v=43", // another release
    "https://preview.horible.com/cdn-cgi/scripts/x.js", // this origin, not this release
    "https://preview.horible.com/health-campus/app/v44-727c831c.evil/3d/main.js", // a look-alike folder
    "",
    undefined,
  ]) {
    const p = page();
    p.error({ target: moduleScript(src) });
    assert.strictEqual(p.loading.textContent, LOADING_TEXT, String(src));
  }
  // the beacon failing first does not stop the app's own failure from being reported
  const p = page();
  p.error({ target: moduleScript(BEACON) });
  p.error({ target: moduleScript(OWN_MAIN) });
  assert.match(p.loading.textContent, FAILED);
  assert.ok(p.loading.textContent.includes(OWN_MAIN));
});

test("boot guard: on the developer's own machine the release is the server root", () => {
  const p = page({ href: "http://127.0.0.1:8000/3d/index.html" });
  p.error({ target: moduleScript(BEACON) });
  assert.strictEqual(p.loading.textContent, LOADING_TEXT);
  p.error({ target: moduleScript("http://127.0.0.1:8000/3d/main.js?v=44") });
  assert.match(p.loading.textContent, /^The 3D campus failed to start: Failed to load http:\/\/127\.0\.0\.1:8000\/3d\/main\.js/);
});

test("boot guard: an error from an extension or another origin is not a failure to start", () => {
  for (const filename of ["chrome-extension://abcdefghijklmnop/content.js", "moz-extension://1234-5678/inject.js", "https://cdn.example.net/widget.js", "", undefined]) {
    const p = page();
    p.error({ message: "TypeError: not ours", filename });
    assert.strictEqual(p.loading.textContent, LOADING_TEXT, String(filename));
  }
});

test("boot guard: a picture, stylesheet or classic script that fails to load is not a failure to start", () => {
  for (const target of [
    fakeElement("IMG", { src: "https://preview.horible.com/health-campus/app/v44-727c831c/3d/x.png" }),
    fakeElement("LINK", { href: "https://preview.horible.com/health-campus/app/v44-727c831c/3d/x.css" }),
    fakeElement("SCRIPT", { src: "https://www.youtube.com/iframe_api" }),
  ]) {
    const p = page();
    p.error({ target });
    assert.strictEqual(p.loading.textContent, LOADING_TEXT, target.tagName);
  }
});

test("boot guard: errors after the map is up are left to the console", () => {
  const p = page();
  p.loading.hidden = true;
  p.error({ target: moduleScript(OWN_MAIN) });
  p.error({ message: "runtime error", filename: OWN_FILE });
  assert.strictEqual(p.loading.textContent, LOADING_TEXT);
});

test("boot guard: listens for errors at the capture phase, so failed scripts reach it", () => {
  const p = page();
  assert.strictEqual(p.errorListeners.length, 1);
  assert.strictEqual(p.errorListeners[0].capture, true);
});

test("boot guard: the 20 s line is unchanged", () => {
  const p = page();
  p.advance(19_999);
  assert.strictEqual(p.loading.textContent, LOADING_TEXT);
  p.advance(1);
  assert.match(p.loading.textContent, /^Still loading after 20s/);
  const up = page();
  up.loading.hidden = true;
  up.advance(20_000);
  assert.strictEqual(up.loading.textContent, LOADING_TEXT, "not once the map is up");
});
