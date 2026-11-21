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
const VIEW = { dist: 260, fovDeg: 70, viewHeight: 760, pitch: Math.PI / 4 }; // the view setView() opens: pitch 45

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

test("overhead keys: W A S D move north, west, south, east; the arrows tilt and turn; Q E, PgUp PgDn and + − as before", async () => {
  const { keyAction } = await import(CORE);
  const k = (key, code, extra = {}) => keyAction({ key, code, shiftKey: false, ...extra });
  assert.strictEqual(k("w", "KeyW"), "north");
  assert.strictEqual(k("W", "KeyW"), "north", "with Caps Lock too");
  assert.strictEqual(k("a", "KeyA"), "west");
  assert.strictEqual(k("s", "KeyS"), "south");
  assert.strictEqual(k("d", "KeyD"), "east");
  assert.strictEqual(k("", "KeyD"), "east", "by the physical key when no character comes");
  assert.strictEqual(k("ArrowUp", "ArrowUp"), "tiltUp");
  assert.strictEqual(k("ArrowDown", "ArrowDown"), "tiltDown");
  assert.strictEqual(k("ArrowLeft", "ArrowLeft"), "ccw");
  assert.strictEqual(k("ArrowRight", "ArrowRight"), "cw");
  assert.strictEqual(k("ArrowUp", "ArrowUp", { shiftKey: true }), "tiltUp", "Shift+Up still tilts");
  assert.strictEqual(k("q", "KeyQ"), "ccw");
  assert.strictEqual(k("e", "KeyE"), "cw");
  assert.strictEqual(k("PageUp", "PageUp"), "tiltUp");
  assert.strictEqual(k("PageDown", "PageDown"), "tiltDown");
  assert.strictEqual(k("+", "Equal"), "in");
  assert.strictEqual(k("-", "Minus"), "out");
  assert.strictEqual(k("x", "KeyX"), null);
  assert.strictEqual(k("w", "KeyW", { ctrlKey: true }), null, "Ctrl+W is the browser's, not a move");
  assert.strictEqual(k("d", "KeyD", { metaKey: true }), null);
});

test("overhead keys: a compass move goes the same way on the ground whichever way the camera faces", async () => {
  const { compassStep } = await import(CORE);
  // +x is east, +z is south
  assert.deepStrictEqual(compassStep("north", 10), [0, -10]);
  assert.deepStrictEqual(compassStep("south", 10), [0, 10]);
  assert.deepStrictEqual(compassStep("east", 10), [10, 0]);
  assert.deepStrictEqual(compassStep("west", 10), [-10, 0]);
  assert.strictEqual(compassStep("cw", 10), null);
});

// ---- the heading strip and the pitch scale (owner, 2026-11-21) ----
// Heading: 0 north, 90 east, 180 south, 270 west, the way the camera faces. The camera sits at
// focus + dist*(cos p sin yaw, sin p, cos p cos yaw) and looks at the focus, so it faces
// (-sin yaw, -cos yaw) in (x east, z south). Pitch as shown: 0 straight down at the map,
// 90 level with the horizon, 45 halfway; the view opens at 45.

test("gauges: the heading is the way the camera faces, clockwise from north", async () => {
  const { headingDeg } = await import(CORE);
  const facing = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)]; // (x, z)
  const bearing = ([x, z]) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360; // clockwise from north (-z)
  for (const yaw of [0, 0.3, 1, Math.PI / 2, 2.5, Math.PI, -0.7, -Math.PI / 2, 7.2, -9.9]) {
    const h = headingDeg(yaw);
    assert.ok(h >= 0 && h < 360, `${yaw} -> ${h}`);
    const b = bearing(facing(yaw));
    assert.ok(near(h, b, 1e-9) || near(Math.abs(h - b), 360, 1e-9), `yaw ${yaw}: ${h} vs the camera's facing ${b}`);
  }
  assert.ok(near(headingDeg(0), 0), "yaw 0 looks north");
  assert.ok(near(headingDeg(-Math.PI / 2), 90), "east");
  assert.ok(near(headingDeg(Math.PI), 180), "south");
  assert.ok(near(headingDeg(Math.PI / 2), 270), "west");
  // Turning left (Left, Q: yaw grows) is counter-clockwise: the heading falls.
  assert.ok(headingDeg(-0.5 + 0.18) < headingDeg(-0.5));
});

test("gauges: the pitch as shown is 0 looking straight down and 90 level, and the view opens at 45", async () => {
  const { displayPitch, pitchForDisplay, OPEN_PITCH, TILT_MIN, TILT_MAX } = await import(CORE);
  assert.ok(near(displayPitch(Math.PI / 2), 0), "straight down is 0");
  assert.ok(near(displayPitch(0), 90), "level is 90");
  assert.ok(near(displayPitch(Math.PI / 4), 45));
  for (const d of [0, 12, 45, 81, 90]) assert.ok(near(displayPitch(pitchForDisplay(d)), d, 1e-9), `${d}`);
  assert.ok(near(OPEN_PITCH, Math.PI / 4) && near(displayPitch(OPEN_PITCH), 45), "opens at 45");
  // The tilt can reach close to straight down and to about 81, but never exactly down,
  // where the camera's lookAt has no "up" to work with.
  assert.ok(TILT_MAX < Math.PI / 2 && displayPitch(TILT_MAX) < 1.5 && displayPitch(TILT_MAX) > 0, `${displayPitch(TILT_MAX)}`);
  assert.ok(displayPitch(TILT_MIN) > 80 && displayPitch(TILT_MIN) < 90, `${displayPitch(TILT_MIN)}`);
  assert.ok(TILT_MIN < OPEN_PITCH && OPEN_PITCH < TILT_MAX);
});

test("gauges: the readout rounds to whole degrees and never shows 360", async () => {
  const { gaugeReadout, compassPoint } = await import(CORE);
  const deg = (d) => (-d * Math.PI) / 180; // the yaw that faces heading d
  assert.deepStrictEqual(gaugeReadout(deg(45), Math.PI / 4), { heading: 45, point: "NE", pitch: 45 });
  assert.deepStrictEqual(gaugeReadout(deg(359.7), Math.PI / 2 - 0.001), { heading: 0, point: "N", pitch: 0 });
  assert.strictEqual(gaugeReadout(deg(271), 0.3).point, "W");
  assert.deepStrictEqual([0, 22, 23, 90, 135, 180, 225, 270, 315, 338, 359].map(compassPoint),
    ["N", "N", "NE", "E", "SE", "S", "SW", "W", "NW", "N", "N"]);
  const { compassName } = await import(CORE);
  assert.deepStrictEqual([0, 45, 135, 270].map(compassName), ["north", "north-east", "south-east", "west"]);
});

test("gauges: the heading strip's ticks: N E S W at the quarters, numbers every 30, around the heading", async () => {
  const { headingTicks, tickLabel } = await import(CORE);
  assert.deepStrictEqual([0, 90, 180, 270].map(tickLabel), ["N", "E", "S", "W"]);
  assert.deepStrictEqual([30, 60, 120, 150, 210, 240, 300, 330].map(tickLabel), ["30", "60", "120", "150", "210", "240", "300", "330"]);
  assert.deepStrictEqual([10, 20, 45, 350].map(tickLabel), [null, null, null, null], "minor ticks are unlabelled");
  // Facing 350: the strip runs from 290 on the left to 50 on the right, through N.
  const ticks = headingTicks(350, 60, 10);
  assert.deepStrictEqual(ticks.map((t) => t.deg), [290, 300, 310, 320, 330, 340, 350, 0, 10, 20, 30, 40, 50]);
  assert.deepStrictEqual(ticks.map((t) => t.offset), [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60]);
  assert.strictEqual(ticks.find((t) => t.deg === 0).label, "N");
  // Between ticks: the offsets are fractions, and nothing past the half span is shown.
  const mid = headingTicks(95.5, 60, 10);
  assert.ok(mid.every((t) => Math.abs(t.offset) <= 60), JSON.stringify(mid));
  assert.ok(near(mid.find((t) => t.deg === 90).offset, -5.5));
  assert.strictEqual(mid[0].deg, 40);
  assert.strictEqual(mid[mid.length - 1].deg, 150);
});

test("gauges: the pitch scale runs 0 (straight down) to 90 (level) every 15", async () => {
  const { pitchTicks } = await import(CORE);
  const t = pitchTicks(15);
  assert.deepStrictEqual(t.map((x) => x.deg), [0, 15, 30, 45, 60, 75, 90]);
  assert.deepStrictEqual(t.map((x) => x.label), ["0", "15", "30", "45", "60", "75", "90"]);
  assert.ok(near(t[3].frac, 0.5) && t[0].frac === 0 && t[6].frac === 1);
});

test("gauges: one sentence for a screen reader, said on request, not on every frame", async () => {
  const { gaugeText } = await import(CORE);
  assert.strictEqual(gaugeText((-45 * Math.PI) / 180, Math.PI / 4),
    "Facing north-east, heading 45 degrees. Pitch 45 degrees, halfway between straight down and level.");
  assert.strictEqual(gaugeText(0, Math.PI / 2 - 0.001), "Facing north, heading 0 degrees. Pitch 0 degrees, looking straight down.");
  assert.match(gaugeText(Math.PI / 2, 0.15), /^Facing west, heading 270 degrees\. Pitch 81 degrees, toward the horizon\.$/);
  assert.match(gaugeText(Math.PI, 1.2), /^Facing south, heading 180 degrees\. Pitch 21 degrees, toward straight down\.$/);
});

const R = (left, top, right, bottom) => ({ left, top, right, bottom });
const SIZES = { gap: 12, strip: { w: 320, h: 64, minW: 200 }, scale: { w: 72, h: 240, minH: 130 } };
const inside = (r, vw, vh) => r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh;
const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const rects = (p) => [p.strip && R(p.strip.left, p.strip.top, p.strip.left + p.strip.width, p.strip.top + SIZES.strip.h),
  p.scale && R(p.scale.left, p.scale.top, p.scale.left + SIZES.scale.w, p.scale.top + p.scale.height)].filter(Boolean);

test("gauges: placed on the top and the side, clear of the panel, the inset map in either corner and the code chip", async () => {
  const { placeGauges } = await import(CORE);
  const cases = [
    // [name, vw, vh, obstacles]
    ["desktop, map lower left", 1100, 760, [R(12, 12, 364, 700), R(12, 418, 296, 748)]],
    ["desktop, map top right", 1100, 760, [R(12, 12, 364, 700), R(804, 12, 1088, 342)]],
    ["desktop, panel collapsed", 1100, 760, [R(12, 12, 140, 70), R(12, 418, 296, 748)]],
    ["desktop, a tour's code chip", 1100, 760, [R(12, 12, 364, 700), R(12, 418, 296, 748), R(930, 690, 1088, 748)]],
    ["phone, panel collapsed", 375, 812, [R(12, 12, 140, 72), R(12, 560, 198, 800)]],
    ["phone, panel collapsed, map top right", 375, 812, [R(12, 12, 140, 72), R(177, 12, 363, 252)]],
    ["short, map lower left", 800, 300, [R(12, 12, 364, 140), R(12, 48, 198, 288)]],
    ["short, map top right", 800, 300, [R(12, 12, 364, 140), R(602, 12, 788, 252)]],
  ];
  for (const [name, vw, vh, obstacles] of cases) {
    const p = placeGauges({ vw, vh, obstacles, ...SIZES });
    assert.ok(p.strip, `${name}: the heading strip has room`);
    assert.ok(p.scale, `${name}: the pitch scale has room`);
    assert.ok(p.strip.width >= SIZES.strip.minW && p.strip.width <= SIZES.strip.w, `${name}: ${JSON.stringify(p)}`);
    assert.ok(p.scale.height >= SIZES.scale.minH && p.scale.height <= SIZES.scale.h, `${name}: ${JSON.stringify(p)}`);
    // Along the top; only on a phone with the inset map up there does it drop just below the map.
    if (name === "phone, panel collapsed, map top right") assert.strictEqual(p.strip.top, 252 + 12, name);
    else assert.strictEqual(p.strip.top, 12, `${name}: the strip is along the top`);
    const placed = rects(p);
    for (const r of placed) {
      assert.ok(inside(r, vw, vh), `${name}: on screen: ${JSON.stringify(r)}`);
      for (const o of obstacles) assert.ok(!hits(r, o), `${name}: ${JSON.stringify(r)} covers ${JSON.stringify(o)}`);
    }
    assert.ok(!hits(placed[0], placed[1]), `${name}: the two don't overlap`);
    if (name.startsWith("desktop")) assert.strictEqual(p.scale.left + SIZES.scale.w, vw - 12, `${name}: on the right when it fits there`);
    assert.ok(p.scale.left === 12 || p.scale.left + SIZES.scale.w === vw - 12, `${name}: against a side: ${JSON.stringify(p.scale)}`);
  }
  // Both sides full (a short window, the panel its full height, the map top right): beside the map.
  const short = placeGauges({ vw: 800, vh: 300, obstacles: [R(12, 12, 364, 288), R(602, 12, 788, 252)], ...SIZES });
  assert.ok(short.strip && short.scale, JSON.stringify(short));
  for (const o of [R(12, 12, 364, 288), R(602, 12, 788, 252)]) for (const r of rects(short)) assert.ok(!hits(r, o), `${JSON.stringify(r)} covers ${JSON.stringify(o)}`);
  assert.strictEqual(short.scale.left + SIZES.scale.w, 602 - 12, `just left of the map: ${JSON.stringify(short.scale)}`);
  assert.ok(!hits(...rects(short)), "and under the strip, not over it");
  // The strip is centred on the window when the panel leaves room for that.
  const wide = placeGauges({ vw: 1100, vh: 760, obstacles: [R(12, 12, 140, 70)], ...SIZES });
  assert.strictEqual(wide.strip.left + wide.strip.width / 2, 550);
});

test("gauges: with no room (the open panel fills a phone, or 400% zoom) a gauge is left out, never drawn over the menu", async () => {
  const { placeGauges } = await import(CORE);
  // a 375 px phone with the panel open: it spans the width down to the inset map
  const phone = placeGauges({ vw: 375, vh: 812, obstacles: [R(12, 12, 363, 500), R(12, 560, 198, 800)], ...SIZES });
  assert.strictEqual(phone.strip, null, "no strip over the open menu");
  if (phone.scale) for (const o of [R(12, 12, 363, 500), R(12, 560, 198, 800)]) assert.ok(!hits(rects({ scale: phone.scale })[0], o));
  // 1100 x 760 at 400%: a 275 x 190 window
  const zoomed = placeGauges({ vw: 275, vh: 190, obstacles: [R(12, 12, 263, 178)], ...SIZES });
  assert.deepStrictEqual(zoomed, { strip: null, scale: null });
});

test("gauges: one degree reads in the singular, and the opening line says so too", async () => {
  const { gaugeText, degreesWord } = await import(CORE);
  assert.strictEqual(degreesWord(1), "1 degree");
  assert.strictEqual(degreesWord(0), "0 degrees");
  assert.strictEqual(degreesWord(45), "45 degrees");
  // heading 1: yaw = -1° (heading = -yaw); pitch display 1: internal 89°
  const t = gaugeText((-1 * Math.PI) / 180, (89 * Math.PI) / 180);
  assert.match(t, /heading 1 degree\./);
  assert.match(t, /Pitch 1 degree,/);
});
