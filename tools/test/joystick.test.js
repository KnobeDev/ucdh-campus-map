// Tests for the touch joystick's decisions (3d/joystick-core.js, pure: no DOM, no three.js).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "joystick-core.js")).href;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("joystick: a touch screen is a coarse pointer or touch support, never the user agent", async () => {
  const { isTouchScreen } = await import(CORE);
  const win = ({ coarse = false, ontouch = false, userAgent = "" } = {}) => ({
    ...(ontouch ? { ontouchstart: null } : {}),
    navigator: { userAgent },
    matchMedia: (q) => ({ matches: q === "(any-pointer: coarse)" ? coarse : false }),
  });
  assert.strictEqual(isTouchScreen(win({ coarse: true })), true);
  assert.strictEqual(isTouchScreen(win({ ontouch: true })), true, "touch events alone count");
  assert.strictEqual(isTouchScreen(win()), false, "a desktop with a mouse");
  assert.strictEqual(isTouchScreen(win({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" })), false, "the user agent is not asked");
  assert.strictEqual(isTouchScreen({}), false, "no matchMedia, no touch");
  assert.strictEqual(isTouchScreen({ ontouchstart: null, matchMedia: () => { throw new Error("no"); } }), true, "a matchMedia that throws falls back to touch support");
});

test("joystick: the knob follows the finger inside the circle, and the walk grows with the push", async () => {
  const { joystickVector, JOYSTICK_DEAD_ZONE } = await import(CORE);
  const up = joystickVector(0, -40, 40);
  assert.ok(near(up.x, 0) && near(up.z, -1) && near(up.mag, 1), `a full push up is forward: ${JSON.stringify(up)}`);
  assert.deepStrictEqual([up.knobX, up.knobY], [0, -40]);
  const half = joystickVector(20, 0, 40);
  assert.ok(half.mag > 0 && half.mag < 1 && near(half.z, 0) && half.x > 0, `half way right is a slower strafe right: ${JSON.stringify(half)}`);
  assert.ok(near(half.mag, (0.5 - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE)));
  const far = joystickVector(0, 400, 40);
  assert.ok(near(far.mag, 1) && near(far.z, 1), "past the rim is a full push, no more");
  assert.deepStrictEqual([far.knobX, far.knobY], [0, 40], "and the knob stays on the rim");
  const diag = joystickVector(30, -30, 40);
  assert.ok(near(Math.hypot(diag.x, diag.z), diag.mag), "the direction is a unit vector times the push");
});

test("joystick: a resting thumb (the dead zone), the centre and bad input never walk", async () => {
  const { joystickVector } = await import(CORE);
  for (const [dx, dy, r] of [[0, 0, 40], [3, -3, 40], [0, -4.7, 40], [NaN, 5, 40], [10, Infinity, 40], [10, 10, 0], [10, 10, NaN]]) {
    const v = joystickVector(dx, dy, r);
    assert.ok(v.x === 0 && v.z === 0 && v.mag === 0, `${dx}, ${dy}, ${r}: ${JSON.stringify(v)}`);
  }
  const v = joystickVector(3, -3, 40);
  assert.deepStrictEqual([v.knobX, v.knobY], [3, -3], "the knob still shows where the thumb rests");
});

test("joystick: walking, up is forward and right is a strafe; further is faster; the rim runs", async () => {
  const { walkFromStick, JOYSTICK_WALK, JOYSTICK_RUN } = await import(CORE);
  assert.strictEqual(walkFromStick(0, 0, 3.2, 7), null, "at rest");
  const fwd = walkFromStick(0, -1, 3.2, 7);
  assert.ok(near(fwd.fwd, 1) && near(fwd.strafe, 0) && fwd.speed === 7, JSON.stringify(fwd));
  const back = walkFromStick(0, 0.35, 3.2, 7);
  assert.ok(near(back.fwd, -1) && near(back.speed, 3.2 * 0.35 / JOYSTICK_WALK), JSON.stringify(back));
  const right = walkFromStick(0.3, 0, 3.2, 7);
  assert.ok(near(right.strafe, 1) && near(right.fwd, 0) && near(right.speed, 3.2 * 0.3 / JOYSTICK_WALK), JSON.stringify(right));
  assert.ok(near(walkFromStick(0, -JOYSTICK_WALK, 3.2, 7).speed, 3.2), "the keyboard's walking speed at JOYSTICK_WALK");
  assert.ok(near(walkFromStick(0, -JOYSTICK_RUN, 3.2, 7).speed, 7), "running from JOYSTICK_RUN");
  const big = walkFromStick(30, -40, 3.2, 7);
  assert.ok(near(Math.hypot(big.fwd, big.strafe), 1) && big.speed === 7, "an input longer than 1 is held to 1");
  assert.strictEqual(walkFromStick(NaN, Infinity, 3.2, 7), null, "junk is rest");
});

test("joystick: the speed never jumps on the way to running (checker, 2026-11-21: 2.9 to 7 m/s at 0.92)", async () => {
  const { walkFromStick } = await import(CORE);
  let last = walkFromStick(0, -0.01, 3.2, 7).speed;
  for (let m = 0.02; m <= 1.0001; m += 0.01) {
    const { speed } = walkFromStick(0, -m, 3.2, 7);
    assert.ok(speed >= last - 1e-9, `never slower for a longer push: ${m.toFixed(2)}`);
    assert.ok(speed - last < 0.5, `no jump at ${m.toFixed(2)}: ${last.toFixed(2)} to ${speed.toFixed(2)} m/s`);
    last = speed;
  }
  assert.strictEqual(last, 7);
});

test("joystick: overhead, up moves the map the way the camera faces; right, to the screen's right", async () => {
  const { stickPan } = await import(CORE);
  // yaw 0: the camera faces north (-z), so up is north and right is east.
  let [dx, dz] = stickPan(0, 0, -1, 10);
  assert.ok(near(dx, 0) && near(dz, -10), `${dx}, ${dz}`);
  [dx, dz] = stickPan(0, 1, 0, 10);
  assert.ok(near(dx, 10) && near(dz, 0), `${dx}, ${dz}`);
  // turned a quarter left (yaw +pi/2): the camera faces west (-x), its right is north.
  [dx, dz] = stickPan(Math.PI / 2, 0, -1, 10);
  assert.ok(near(dx, -10) && near(dz, 0), `${dx}, ${dz}`);
  [dx, dz] = stickPan(Math.PI / 2, 1, 0, 10);
  assert.ok(near(dx, 0) && near(dz, -10), `${dx}, ${dz}`);
  // analog, and never more than a full push
  [dx, dz] = stickPan(0, 0, -0.25, 10);
  assert.ok(near(dz, -2.5), `${dz}`);
  [dx, dz] = stickPan(0, 0, -5, 10);
  assert.ok(near(dz, -10), `${dz}`);
  assert.deepStrictEqual(stickPan(0, NaN, 0, 10).map((n) => n + 0), [0, 0]);
});

test("joystick: placed at home when clear; beside or above what is in the way; never off screen", async () => {
  const { placeJoystick } = await import(CORE);
  const VW = 375;
  const base = { vw: VW, gap: 12, minTop: 64, edge: 12 };
  const home = { left: 12, right: 147, top: 812 - 12 - 135, bottom: 812 - 12 }; // 135 px at the bottom left
  const hits = (a, b, gap) => !(b.right <= a.left - gap || b.left >= a.right + gap || b.bottom <= a.top - gap || b.top >= a.bottom + gap);
  const moved = (p) => ({ left: home.left + p.shift, right: home.right + p.shift, top: home.top - p.lift, bottom: home.bottom - p.lift });

  assert.deepStrictEqual(placeJoystick({ ...base, home, obstacles: [] }), { lift: 0, shift: 0 }, "nothing in the way: home");
  const farAway = { left: 200, right: 363, top: 12, bottom: 260 }; // the inset map at the top right
  assert.deepStrictEqual(placeJoystick({ ...base, home, obstacles: [farAway] }), { lift: 0, shift: 0 }, "the map in the other corner: home");

  // The inset map at the bottom left, 185 px wide and 250 tall: beside it is nearer than above it.
  const map = { left: 12, right: 197, top: 812 - 12 - 250, bottom: 800 };
  const p = placeJoystick({ ...base, home, obstacles: [map] });
  assert.strictEqual(p.lift, 0, `beside it, on the bottom row: ${JSON.stringify(p)}`);
  assert.ok(!hits(moved(p), map, 12), "clear of the map by the gap");
  assert.ok(moved(p).right <= VW - 12, "whole on screen");

  // A screen too narrow for beside it: above it instead.
  const narrow = placeJoystick({ ...base, vw: 320, home, obstacles: [map] });
  assert.strictEqual(narrow.shift, 0, JSON.stringify(narrow));
  assert.ok(!hits(moved(narrow), map, 12) && moved(narrow).top >= 64, `above it: ${JSON.stringify(narrow)}`);

  // Two things in a row: past both.
  const chip = { left: 209, right: 300, top: 760, bottom: 800 };
  const two = placeJoystick({ ...base, home, obstacles: [map, chip] });
  assert.ok(!hits(moved(two), map, 12) && !hits(moved(two), chip, 12) && moved(two).right <= VW - 12 && moved(two).top >= 64, JSON.stringify(two));

  // Nowhere clear: no place (the caller hides it), never off screen or into the top row.
  const wall = { left: 0, right: VW, top: 70, bottom: 812 };
  assert.strictEqual(placeJoystick({ ...base, home, obstacles: [wall] }), null);
});

test("joystick: below the side panel's top row and above the inset map, shrinking to fit; none when even the smallest has no room", async () => {
  const { fitJoystick, joystickSizes, placeJoystick } = await import(CORE);
  assert.deepStrictEqual(joystickSizes(128, 96), [128, 120, 112, 104, 96]);
  assert.deepStrictEqual(joystickSizes(130, 96), [130, 122, 114, 106, 98, 96]);
  assert.deepStrictEqual(joystickSizes(96, 96), [96]);
  const base = { vw: 360, gap: 12, minTop: 64, edge: 12 };
  const hits = (a, b, gap) => !(b.right <= a.left - gap || b.left >= a.right + gap || b.bottom <= a.top - gap || b.top >= a.bottom + gap);
  // 360 x 640 at 200% text (checker's sweep): the inset map at the bottom left, the open panel's top row above
  const home = { left: 12, right: 142, top: 640 - 12 - 130, bottom: 628 };
  const map = { left: 12, top: 327, right: 210, bottom: 628 };
  const row = { left: 24, top: 24, right: 336, bottom: 157 };
  const p = fitJoystick({ ...base, home, sizes: joystickSizes(130, 96), obstacles: [map, row] });
  assert.ok(p && p.size === 130, JSON.stringify(p));
  const box = { left: 12 + p.shift, right: 12 + p.shift + p.size, bottom: 628 - p.lift, top: 628 - p.lift - p.size };
  assert.ok(!hits(box, map, 12) && !hits(box, row, 12), `clear of both: ${JSON.stringify(box)}`);
  // a taller top row (more text) pushes it no higher than the row allows: then none at this size
  const tall = { ...row, bottom: 200 };
  const q = fitJoystick({ ...base, home, sizes: joystickSizes(130, 96), obstacles: [map, tall] });
  assert.ok(q && q.size < 130 && 628 - q.lift - q.size >= 212, JSON.stringify(q));
  assert.strictEqual(placeJoystick({ ...base, home, obstacles: [map, tall] }), null, "not at the full size");

  // 320 x 568 at 200%, panel closed: 100 px between the closed bar and the map, so it shrinks
  const home2 = { left: 12, right: 140, top: 568 - 12 - 128, bottom: 556 };
  const map2 = { left: 12, top: 255, right: 210, bottom: 556 };
  const closed = { left: 24, top: 24, right: 251, bottom: 131 };
  const small = fitJoystick({ ...base, vw: 320, home: home2, sizes: joystickSizes(128, 96), obstacles: [map2, closed] });
  assert.ok(small && small.size < 128 && small.size >= 96, JSON.stringify(small));
  const b2 = { left: 12 + small.shift, right: 12 + small.shift + small.size, bottom: 556 - small.lift, top: 556 - small.lift - small.size };
  assert.ok(!hits(b2, map2, 12) && !hits(b2, closed, 12) && b2.top >= 64, JSON.stringify(b2));
  // the same, panel open (its top row reaches 157): no room even at 96 px
  const open = { ...closed, right: 296, bottom: 157 };
  assert.strictEqual(fitJoystick({ ...base, vw: 320, home: home2, sizes: joystickSizes(128, 96), obstacles: [map2, open] }), null);
});
