// Tests for the overhead ("helicopter") camera's decisions (3d/overhead-core.js, pure —
// no three.js, no DOM).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "overhead-core.js")).href;
const SITE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "3d", "campus-data.site.json"), "utf8"));
const BOX = SITE.meta.world; // the 3D world's extent, not meta.frame2d (the 2D map's)
const VIEW = { dist: 260, fovDeg: 70, viewHeight: 760, pitch: 0.95 }; // the view setView() opens

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("overhead: a plain drag pans the map, as the 2D map does; Shift+drag turns the view", async () => {
  const { dragAction } = await import(CORE);
  assert.strictEqual(dragAction({ shiftKey: false }), "pan");
  assert.strictEqual(dragAction({ shiftKey: true }), "orbit");
});

test("overhead: a drag pulls the ground along with the pointer", async () => {
  const { dragToPan } = await import(CORE);
  // Looking straight down, a drag across the whole view height moves the whole visible height.
  const [, away] = dragToPan({ ...VIEW, pitch: Math.PI / 2, dx: 0, dy: 760 });
  assert.ok(near(away, 2 * 260 * Math.tan((35 * Math.PI) / 180), 1e-9), `${away}`);
  // Pointer right: the ground goes right, so the view's spot moves left (west of the camera).
  const [right] = dragToPan({ ...VIEW, dx: 100, dy: 0 });
  assert.ok(right < 0, `${right}`);
  // Pointer down: the ground comes toward you, so the spot moves away; tilted, a pixel covers more ground.
  const [, awayTilted] = dragToPan({ ...VIEW, dx: 0, dy: 100 });
  const [, awayFlat] = dragToPan({ ...VIEW, pitch: Math.PI / 2, dx: 0, dy: 100 });
  assert.ok(awayTilted > awayFlat && awayFlat > 0, `${awayTilted} ${awayFlat}`);
  // Zoomed out, the same drag covers more ground.
  const [farRight] = dragToPan({ ...VIEW, dist: 900, dx: 100, dy: 0 });
  assert.ok(near(farRight / right, 900 / 260, 1e-9));
  // A view not laid out yet (0 px tall) must not make Infinity or NaN.
  for (const v of dragToPan({ ...VIEW, viewHeight: 0, dx: 5, dy: 5 })) assert.ok(Number.isFinite(v));
});

test("overhead: 'away' and 'right' follow the camera's heading", async () => {
  const { panToWorld } = await import(CORE);
  // Heading 0: the camera sits south of its spot looking north (-z); right is east (+x).
  let [x, z] = panToWorld(0, 0, 10);
  assert.ok(near(x, 0) && near(z, -10));
  [x, z] = panToWorld(0, 10, 0);
  assert.ok(near(x, 10) && near(z, 0));
  // Turned a quarter: looking west (-x), right is north (-z).
  [x, z] = panToWorld(Math.PI / 2, 0, 10);
  assert.ok(near(x, -10) && near(z, 0));
  [x, z] = panToWorld(Math.PI / 2, 10, 0);
  assert.ok(near(x, 0) && near(z, -10));
});

test("overhead: the spot stays on the campus, and a bad number never gets in", async () => {
  const { clampToBox } = await import(CORE);
  assert.deepStrictEqual(clampToBox(5000, -5000, BOX, [0, 0]), [BOX.maxX, BOX.minZ]);
  assert.deepStrictEqual(clampToBox(10, 20, BOX, [0, 0]), [10, 20]);
  assert.deepStrictEqual(clampToBox(NaN, 20, BOX, [3, 4]), [3, 20]);
  assert.deepStrictEqual(clampToBox(10, Infinity, BOX, [3, 4]), [10, 4]);
});

test("overhead: drags from the middle reach every edge of the 3D world", async () => {
  const { dragToPan, panToWorld, clampToBox } = await import(CORE);
  const run = (dx, dy) => {
    let f = [0, 0];
    for (let i = 0; i < 12; i++) {
      const [r, a] = dragToPan({ ...VIEW, dx, dy });
      const [wx, wz] = panToWorld(0, r, a);
      f = clampToBox(f[0] + wx, f[1] + wz, BOX, f);
    }
    return f;
  };
  assert.ok(near(run(-300, 0)[0], BOX.maxX), "dragging left reaches the east edge");
  assert.ok(near(run(300, 0)[0], BOX.minX), "dragging right reaches the west edge");
  assert.ok(near(run(0, 300)[1], BOX.minZ), "dragging down reaches the north edge");
  assert.ok(near(run(0, -300)[1], BOX.maxZ), "dragging up reaches the south edge");
});
