// Colours that carry text or mark a control (WCAG 2.1 SC 1.4.3 and 1.4.11).
//
// ink.js picks the text colour for a coloured background (a building's category badge, the
// head of its card) so the pair always holds 4.5:1; the stylesheet's text and control-border
// tokens are measured here against every surface they sit on.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const Ink = require(path.join(ROOT, "ink.js"));
const CSS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function appData() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data.jsx"), "utf8"), ctx, { filename: "data.jsx" });
  return ctx.window;
}
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(CSS);
  assert.ok(m, `styles.css defines --${name}`);
  return m[1];
};

test("ink: the contrast maths is WCAG's", () => {
  assert.ok(Math.abs(Ink.contrast("#000000", "#FFFFFF") - 21) < 1e-9);
  assert.ok(Math.abs(Ink.contrast("#FFFFFF", "#FFFFFF") - 1) < 1e-9);
  assert.ok(Math.abs(Ink.contrast("#777777", "#FFFFFF") - 4.478) < 0.01);
  assert.strictEqual(Ink.contrast("#fff", "#000"), Ink.contrast("#FFFFFF", "#000000"), "short hex is read too");
});

test("ink: text on every coloured badge and card head holds 4.5:1", () => {
  const w = appData();
  const backgrounds = [
    ...Object.values(w.CATEGORIES).map((c) => c.color),
    ...Object.values(w.PARKING_TYPES).map((c) => c.color),
    ...Object.values(w.POI_TYPES || {}).map((c) => c.color).filter(Boolean),
    "#1ba0d3", "#0E7C66", "#C8102E", "#5A6470", "#022851", "#FFBF00",
  ];
  assert.ok(backgrounds.length > 14);
  for (const bg of backgrounds) {
    const ink = Ink.on(bg);
    assert.ok([Ink.LIGHT, Ink.DARK].includes(ink), bg);
    assert.ok(Ink.contrast(ink, bg) >= 4.5, `${ink} on ${bg}: ${Ink.contrast(ink, bg).toFixed(2)}`);
  }
});

test("ink: a colour it cannot read gets dark text on nothing assumed, never a crash", () => {
  for (const bad of [undefined, null, "", "blue", "#12", "rgb(1,2,3)", 7]) assert.strictEqual(Ink.on(bad), Ink.DARK, String(bad));
});

test("stylesheet: every text colour token holds 4.5:1 on every surface it is used on", () => {
  const surfaces = ["#FFFFFF", "#FAFAF7", token("bg"), token("panel")];
  for (const name of ["text", "text-muted", "text-subtle"]) {
    for (const surface of surfaces) {
      const ratio = Ink.contrast(token(name), surface);
      assert.ok(ratio >= 4.5, `--${name} ${token(name)} on ${surface}: ${ratio.toFixed(2)}`);
    }
  }
});

test("stylesheet: the control border and the focus ring hold 3:1 on every surface (SC 1.4.11)", () => {
  for (const surface of ["#FFFFFF", "#FAFAF7", token("bg")]) {
    assert.ok(Ink.contrast(token("control-border"), surface) >= 3, `--control-border on ${surface}`);
    assert.ok(Ink.contrast(token("focus-ring"), surface) >= 3, `--focus-ring on ${surface}`);
  }
});

test("stylesheet: no sidebar control hides its checkbox or drops its focus outline without a replacement", () => {
  // The Layers switches were display:none checkboxes: not reachable by keyboard at all.
  assert.doesNotMatch(CSS, /\.sb-toggle input\s*\{[^}]*display\s*:\s*none/);
  assert.match(CSS, /\.sb-toggle input:focus-visible \+ \.sb-toggle-track\s*\{[^}]*outline/);
  // The search field's own outline is off only because its box shows the ring.
  assert.match(CSS, /\.sb-search:focus-within\s*\{[^}]*outline\s*:\s*3px solid var\(--focus-ring\)/);
});
