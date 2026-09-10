"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");
const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "spatial-core.js")).href;

test("spatial: direction words follow the walker's facing", async () => {
  const { directionLabel } = await import(CORE);
  // yaw 0 faces -z (north on the map). A target straight north is "ahead".
  assert.strictEqual(directionLabel(0, 0, 0, 0, -10), "ahead");
  assert.strictEqual(directionLabel(0, 0, 0, 0, 10), "behind");
  assert.strictEqual(directionLabel(0, 0, 0, 10, 0), "right");
  assert.strictEqual(directionLabel(0, 0, 0, -10, 0), "left");
  // Turn to face east (yaw -90°): east is now ahead.
  assert.strictEqual(directionLabel(-Math.PI / 2, 0, 0, 10, 0), "ahead");
});

test("spatial: nearest point on a ring is on an edge, not just a vertex", async () => {
  const { nearestOnRing } = await import(CORE);
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const n = nearestOnRing(5, -3, sq);
  assert.ok(Math.abs(n.d - 3) < 1e-9);
  assert.ok(Math.abs(n.x - 5) < 1e-9 && Math.abs(n.z - 0) < 1e-9);
});

test("spatial: spoken distances read naturally", async () => {
  const { metresWord } = await import(CORE);
  assert.strictEqual(metresWord(1), "right here");
  assert.strictEqual(metresWord(12.4), "12 metres");
  assert.strictEqual(metresWord(47), "45 metres");
});

const PICK = pathToFileURL(path.join(__dirname, "..", "..", "3d", "picking.js")).href;

test("picking: ENU -> lon/lat agrees with the pipeline's georef", async () => {
  // picking.js imports three.js at module top, so only its pure exports are reachable via a stub.
  const georef = require("../lib/georef");
  const origin = georef.ORIGIN;
  const src = require("fs").readFileSync(path.join(__dirname, "..", "..", "3d", "picking.js"), "utf8");
  const fn = new Function(src.slice(src.indexOf("export function enuToLonLat")).replace(/export function/g, "function") + "\nreturn { enuToLonLat, mapsUrl };");
  const { enuToLonLat, mapsUrl } = fn();
  const [lon, lat] = georef.enuToLonLat(120, -80);
  const b = enuToLonLat(120, -80, origin);
  assert.ok(Math.abs(b.lon - lon) < 1e-9 && Math.abs(b.lat - lat) < 1e-9, "browser and pipeline inverses drifted");
  // node's globalThis.navigator is getter-only; define over it for the UA branches
  const setUA = (ua) => Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true });
  setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
  assert.ok(mapsUrl(38.55, -121.45, "Test").startsWith("https://maps.apple.com/"));
  setUA("Mozilla/5.0 (X11; Linux x86_64)");
  assert.ok(mapsUrl(38.55, -121.45, "Test").startsWith("https://www.google.com/maps/"));
});
