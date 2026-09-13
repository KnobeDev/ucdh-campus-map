// Tests for the inset 2D map's and the collapsible panel's decisions
// (3d/minimap-core.js, pure — no three.js, no DOM).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "minimap-core.js")).href;

test("minimap: the view is north-up and centred on the viewer", async () => {
  const { viewTransform } = await import(CORE);
  // 200 px square showing 100 m across: 2 px per metre.
  const v = viewTransform({ cx: 50, cz: -20, across: 100, width: 200, height: 200 });
  assert.strictEqual(v.scale, 2);
  assert.deepStrictEqual(v.toScreen(50, -20), [100, 100], "the viewer is the centre");
  // +x is east (right); +z is south (down) — so north is up.
  assert.deepStrictEqual(v.toScreen(60, -20), [120, 100]);
  assert.deepStrictEqual(v.toScreen(50, -30), [100, 80]);
});

test("minimap: a click maps back to the world point under it", async () => {
  const { viewTransform } = await import(CORE);
  const v = viewTransform({ cx: 10, cz: 10, across: 250, width: 240, height: 180 });
  for (const [x, z] of [[10, 10], [-40, 55], [120, -60]]) {
    const [px, py] = v.toScreen(x, z);
    const w = v.toWorld(px, py);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.z - z) < 1e-9, `round trip ${x},${z}`);
  }
  // A non-square inset fits the metres across its SHORTER side.
  assert.strictEqual(v.scale, 180 / 250);
});

test("minimap: zoom steps stay within the levels", async () => {
  const { ZOOM_LEVELS, DEFAULT_ZOOM, stepZoom } = await import(CORE);
  assert.ok(ZOOM_LEVELS.length >= 3);
  assert.ok(ZOOM_LEVELS.every((m, i) => i === 0 || m > ZOOM_LEVELS[i - 1]), "levels grow outward");
  assert.ok(DEFAULT_ZOOM > 0 && DEFAULT_ZOOM < ZOOM_LEVELS.length - 1, "the default can zoom both ways");
  assert.strictEqual(stepZoom(0, -1), 0, "cannot zoom in past the closest level");
  assert.strictEqual(stepZoom(ZOOM_LEVELS.length - 1, 1), ZOOM_LEVELS.length - 1);
  assert.strictEqual(stepZoom(DEFAULT_ZOOM, 1), DEFAULT_ZOOM + 1);
  assert.strictEqual(stepZoom(99, 0), ZOOM_LEVELS.length - 1, "a corrupt saved level is clamped");
});

test("minimap: the heading arrow turns with the walker", async () => {
  const { headingAngle } = await import(CORE);
  // yaw 0 faces -z = north = straight up the inset.
  const up = (a) => [Math.sin(a), -Math.cos(a)]; // unit arrow after a canvas rotate(a)
  const close = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  // The walker's forward vector on the ground is (-sin yaw, -cos yaw) in (x, z),
  // and screen (right, down) is (x, z). The arrow must point the same way.
  for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.1]) {
    assert.ok(close(up(headingAngle(yaw)), [-Math.sin(yaw), -Math.cos(yaw)]), `yaw ${yaw}`);
  }
});

test("minimap: the corner is one of two, and moving toggles between them", async () => {
  const { normalizeCorner, otherCorner } = await import(CORE);
  assert.strictEqual(normalizeCorner("top-right"), "top-right");
  assert.strictEqual(normalizeCorner("bottom-left"), "bottom-left");
  assert.strictEqual(normalizeCorner(null), "bottom-left", "lower left is the default");
  assert.strictEqual(normalizeCorner("somewhere"), "bottom-left");
  assert.strictEqual(otherCorner("bottom-left"), "top-right");
  assert.strictEqual(otherCorner("top-right"), "bottom-left");
});

test("panel: a saved choice wins; otherwise open on wide screens, collapsed on narrow", async () => {
  const { initialPanelOpen, NARROW_PX } = await import(CORE);
  assert.strictEqual(initialPanelOpen("closed", 1600), false);
  assert.strictEqual(initialPanelOpen("open", 360), true);
  assert.strictEqual(initialPanelOpen(null, 1280), true);
  assert.strictEqual(initialPanelOpen(null, NARROW_PX - 1), false);
  assert.strictEqual(initialPanelOpen("garbage", 1280), true);
});

test("minimap: three.js hex colours become CSS colours", async () => {
  const { cssHex } = await import(CORE);
  assert.strictEqual(cssHex(0x002855), "#002855");
  assert.strictEqual(cssHex(0xffffff), "#ffffff");
  assert.strictEqual(cssHex(0), "#000000");
});
