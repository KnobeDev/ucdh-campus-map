// Tests for VR (WebXR) input as pure numbers (3d/vr-math.js): the thumbsticks, the turn, the walk
// a stick asks for, the hop's check, the overhead flight and the in-headset menu's layout. Ported
// from the UC Davis campus map's vr-math tests (owner, 2026-11-21: "We need a VR view as well,
// similar to the campus VR capabilities").
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const MATH = pathToFileURL(path.join(__dirname, "..", "..", "3d", "vr-math.js")).href;
const JOY = pathToFileURL(path.join(__dirname, "..", "..", "3d", "joystick-core.js")).href;
const close = (actual, expected, eps = 1e-9, what = "") =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what} ${actual} ≈ ${expected}`);
const DEG = Math.PI / 180;
const yawQuat = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

test("vr: stickOf reads the thumbstick, axes 2 and 3 on an xr-standard pad, 0 and 1 on a two-axis one", async () => {
  const { stickOf } = await import(MATH);
  assert.deepStrictEqual(stickOf({ axes: [0, 0, 0.5, -1] }), { x: 0.5, y: -1 }, "Quest Touch: touchpad 0/1 empty, stick 2/3");
  assert.deepStrictEqual(stickOf({ axes: [0.25, 0.75] }), { x: 0.25, y: 0.75 }, "a pad with only the stick");
  assert.deepStrictEqual(stickOf({ axes: [] }), { x: 0, y: 0 });
  assert.deepStrictEqual(stickOf(null), { x: 0, y: 0 }, "a hand has no gamepad");
  assert.deepStrictEqual(stickOf({ axes: [0, 0, NaN, undefined] }), { x: 0, y: 0 }, "garbage reads as rest");
});

test("vr: deadZone reads a resting thumb as zero and rescales past it to reach 1 at the rim", async () => {
  const { deadZone, STICK_DEAD_ZONE } = await import(MATH);
  assert.deepStrictEqual(deadZone({ x: 0.1, y: 0.05 }), { x: 0, y: 0 });
  assert.deepStrictEqual(deadZone({ x: STICK_DEAD_ZONE, y: 0 }), { x: 0, y: 0 }, "exactly on the edge is still rest");
  const full = deadZone({ x: 0, y: -1 });
  close(full.x, 0); close(full.y, -1, 1e-9, "the rim stays the rim");
  close(deadZone({ x: 0.6, y: 0 }).x, (0.6 - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE), 1e-9, "rescaled from the dead zone");
  const over = deadZone({ x: 1, y: 1 });
  close(Math.hypot(over.x, over.y), 1, 1e-9, "a corner push never exceeds 1");
  close(over.x, over.y, 1e-12, "and keeps its direction");
});

test("vr: isPressed counts a button down when pressed or past half travel; the xr-standard mapping", async () => {
  const { isPressed, BUTTON } = await import(MATH);
  const pad = { buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0.7 }, { pressed: false, value: 0.2 }] };
  assert.strictEqual(isPressed(pad, 0), true);
  assert.strictEqual(isPressed(pad, 1), true, "an analogue grip squeezed past half");
  assert.strictEqual(isPressed(pad, 2), false);
  assert.strictEqual(isPressed(pad, BUTTON.b), false, "no such button");
  assert.strictEqual(isPressed(null, 0), false);
  assert.deepStrictEqual({ ...BUTTON }, { trigger: 0, squeeze: 1, stick: 3, a: 4, b: 5 });
});

test("vr: headYaw is the head's turn about the vertical, whatever its tilt", async () => {
  const { headYaw } = await import(MATH);
  for (const yaw of [0, 30 * DEG, -90 * DEG, 179 * DEG]) close(headYaw(yawQuat(yaw)), yaw, 1e-9, `${yaw}`);
  const t = 60 * DEG, p = -40 * DEG; // turned 60° left, looking 40° down (YXZ)
  const q = {
    x: Math.cos(t / 2) * Math.sin(p / 2), y: Math.sin(t / 2) * Math.cos(p / 2),
    z: -Math.sin(t / 2) * Math.sin(p / 2), w: Math.cos(t / 2) * Math.cos(p / 2),
  };
  close(headYaw(q), t, 1e-9, "a nod does not turn");
});

test("vr: stickWalk walks where the head faces, in the walker's frame (x right, z back)", async () => {
  const { stickWalk, WALK_CAP } = await import(MATH);
  const fwd = stickWalk({ x: 0, y: -1 }, 0);
  close(fwd.x, 0); close(fwd.z, -WALK_CAP, 1e-12, "straight ahead, at the walking cap");
  const left = stickWalk({ x: 0, y: -1 }, 90 * DEG); // the head turned 90° left
  close(left.x, -WALK_CAP, 1e-12); close(left.z, 0, 1e-12);
  const right = stickWalk({ x: 1, y: 0 }, 90 * DEG); // right, with the head turned left: forward
  close(right.x, 0, 1e-12); close(right.z, -WALK_CAP, 1e-12);
  assert.deepStrictEqual(stickWalk({ x: 0, y: 0 }, 1), { x: 0, z: 0 }, "a resting stick stops");
});

test("vr: a full push walks at the keyboard's walking speed, a held grip runs, overhead flies at the push", async () => {
  const { stickWalk, WALK_CAP } = await import(MATH);
  const { walkFromStick, JOYSTICK_WALK } = await import(JOY);
  assert.strictEqual(WALK_CAP, JOYSTICK_WALK, "the cap is where the touch joystick reaches walking speed");
  const walk = stickWalk({ x: 0.6, y: -0.8 }, 0);
  close(Math.hypot(walk.x, walk.z), WALK_CAP, 1e-12);
  close(walkFromStick(walk.x, walk.z, 3.2, 7).speed, 3.2, 1e-9, "a full push: the walking speed, not a run");
  close(Math.hypot(...Object.values(stickWalk({ x: 0, y: -0.3 }, 0))), 0.3 * WALK_CAP, 1e-12, "a gentle push walks slowly");
  const run = stickWalk({ x: 0, y: -0.3 }, 0, { run: true });
  close(Math.hypot(run.x, run.z), 1, 1e-12, "a grip runs at any push");
  close(walkFromStick(run.x, run.z, 3.2, 7).speed, 7, 1e-9, "at the running speed");
  const fly = stickWalk({ x: 0, y: -0.5 }, 0, { overhead: true });
  close(Math.hypot(fly.x, fly.z), 0.5, 1e-12, "overhead keeps the push");
});

test("vr: snap turning turns 30° once per push; the stick must come back before the next", async () => {
  const { createSnapTurn, SNAP_TURN_RAD } = await import(MATH);
  const snap = createSnapTurn();
  assert.strictEqual(snap(0.5), 0, "not far enough");
  close(snap(0.7), -SNAP_TURN_RAD, 1e-12, "stick right turns right (three.js yaw + is left)");
  assert.strictEqual(snap(1), 0, "held over: no second turn");
  assert.strictEqual(snap(0.4), 0, "easing back but not to rest: still held");
  assert.strictEqual(snap(0.1), 0, "back to rest re-arms");
  close(snap(-0.9), SNAP_TURN_RAD, 1e-12, "stick left turns left");
  close(SNAP_TURN_RAD, 30 * DEG, 1e-12);
});

test("vr: smooth turning turns right for right, scaled by push and time", async () => {
  const { smoothTurn } = await import(MATH);
  close(smoothTurn(1, 0.5), -Math.PI / 4, 1e-12, "90°/s at a full push");
  close(smoothTurn(-0.5, 1), Math.PI / 4, 1e-12);
  assert.strictEqual(smoothTurn(0, 1), 0);
  assert.strictEqual(smoothTurn(NaN, 1), 0);
});

test("vr: createEdges is true once per press, per button", async () => {
  const { createEdges } = await import(MATH);
  const edge = createEdges();
  assert.strictEqual(edge("left:b", true), true);
  assert.strictEqual(edge("left:b", true), false, "held");
  assert.strictEqual(edge("right:b", true), true, "another button is its own");
  assert.strictEqual(edge("left:b", false), false);
  assert.strictEqual(edge("left:b", true), true, "pressed again");
});

test("vr: the menu's rows sit below a heading with gaps between, and a ray's uv finds the row", async () => {
  const { MENU, menuHeight, menuRowTop, menuItemAt } = await import(MATH);
  const n = 12, h = menuHeight(n); // the longest menu: inside, at a lift, with a route
  assert.strictEqual(h, MENU.pad + MENU.head + n * MENU.row + (n - 1) * MENU.gap + MENU.pad);
  assert.ok(0.56 * h / MENU.width < 0.9, "it stays under 0.9 m tall at 0.56 m wide");
  const at = (px, py) => menuItemAt(px / MENU.width, 1 - py / h, n);
  const mid = MENU.width / 2;
  for (let i = 0; i < n; i++) {
    assert.strictEqual(at(mid, menuRowTop(i) + 1), i, `top of row ${i}`);
    assert.strictEqual(at(mid, menuRowTop(i) + MENU.row - 1), i, `bottom of row ${i}`);
  }
  assert.strictEqual(at(mid, MENU.pad + MENU.head / 2), -1, "the heading is no row");
  assert.strictEqual(at(mid, menuRowTop(0) + MENU.row + MENU.gap / 2), -1, "a gap is no row");
  assert.strictEqual(at(MENU.pad / 2, menuRowTop(1) + 5), -1, "the margin is no row");
  assert.strictEqual(at(mid, h - MENU.pad / 2), -1, "below the last row");
  assert.strictEqual(menuItemAt(NaN, 0.5, n), -1, "no hit");
});

test("vr: the menu stands ahead of the head on its turn, below the eye, facing it", async () => {
  const { menuPose } = await import(MATH);
  const p = menuPose({ x: 0.2, y: 1.6, z: -0.1 }, 0);
  close(p.x, 0.2); close(p.z, -0.1 - 0.9); close(p.y, 1.6 - 0.2); close(p.yaw, 0);
  assert.ok(p.tilt < 0, "leans back like a lectern, toward an eye above it");
  const q = menuPose({ x: 0, y: 1.6, z: 0 }, 90 * DEG);
  close(q.x, -0.9, 1e-12, "head turned left: the menu is on the left"); close(q.z, 0, 1e-12);
});

test("vr: buttonItem reads a page button as a row: its words, and On/Off for a switch", async () => {
  const { buttonItem } = await import(MATH);
  const btn = (txt, pressed, hidden = false) => ({
    hidden,
    getAttribute: (a) => (a === "aria-pressed" ? pressed : null),
    querySelector: (s) => (s === ".btn-txt" ? { textContent: txt } : null),
    textContent: `🚁${txt}`,
  });
  assert.deepStrictEqual(buttonItem(btn("Overhead view", "false")), { label: "Overhead view", state: "Off" });
  assert.deepStrictEqual(buttonItem(btn("Voice on", "true")), { label: "Voice on", state: "On" });
  assert.deepStrictEqual(buttonItem(btn("Sonar", null)), { label: "Sonar", state: "" });
  assert.strictEqual(buttonItem(btn("Gone", null, true)), null, "a hidden button is not offered");
  assert.strictEqual(buttonItem(null), null);
  const floor = { hidden: false, getAttribute: () => null, querySelector: () => null, textContent: " Level 5 " };
  assert.deepStrictEqual(buttonItem(floor), { label: "Level 5", state: "" }, "a floor button: its own text");
});

test("vr: assignSticks splits walk and turn between two controllers; one alone walks and turns", async () => {
  const { assignSticks } = await import(MATH);
  const L = { x: 0.2, y: -0.9 }, R = { x: 0.8, y: 0.1 };
  assert.deepStrictEqual(assignSticks(L, R), { move: L, steer: R });
  assert.deepStrictEqual(assignSticks(null, R), { move: { x: 0, y: 0.1 }, steer: { x: 0.8, y: 0 } });
  assert.deepStrictEqual(assignSticks(L, null), { move: { x: 0, y: -0.9 }, steer: { x: 0.2, y: 0 } });
  assert.deepStrictEqual(assignSticks(null, null), { move: { x: 0, y: 0 }, steer: { x: 0, y: 0 } });
});

test("vr: the menu by ear, a row's words and what a choice did", async () => {
  const { rowWords, resultWords } = await import(MATH);
  assert.strictEqual(rowWords({ label: "Dark mode", state: "Off" }), "Dark mode, off");
  assert.strictEqual(rowWords({ label: "Sonar", state: "" }), "Sonar");
  assert.strictEqual(rowWords({ label: "Turning", state: "Snap 30°" }), "Turning, snap 30 degrees", "a bare ° is said as the word");
  assert.strictEqual(rowWords(null), "");
  assert.strictEqual(resultWords({ label: "Dark mode", state: "Off" }, { label: "Light mode", state: "On" }), "Light mode: on.", "a switch says its new state");
  assert.strictEqual(resultWords({ label: "Turning", state: "Smooth" }, { label: "Turning", state: "Snap 30°" }), "Turning: snap 30 degrees.");
  assert.strictEqual(resultWords({ label: "Use stairs", state: "" }, { label: "Nearest elevator", state: "" }), "Use stairs.", "a button that names its next action");
  assert.strictEqual(resultWords({ label: "Sonar", state: "" }, { label: "Sonar", state: "" }), "", "it speaks for itself");
  assert.strictEqual(resultWords({ label: "Exit VR", state: "" }, undefined), "");
});

test("vr: groundHit finds where a ray pointing down meets the ground, within reach", async () => {
  const { groundHit, TELEPORT_RANGE } = await import(MATH);
  const o = { x: 10, y: 1.2, z: 20 };
  const d = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const hit = groundHit(o, d, 0);
  close(hit.x, 10, 1e-9); close(hit.z, 20 - 1.2, 1e-9, "1.2 m ahead at 45°");
  close(groundHit({ x: 0, y: 3.2 + 4.5, z: 0 }, d, 4.5).z, -3.2, 1e-9, "measured from the floor under the walker (Level 2)");
  assert.strictEqual(groundHit(o, { x: 0, y: 0, z: -1 }, 0), null, "level: never meets it");
  assert.strictEqual(groundHit(o, { x: 0, y: 0.5, z: -1 }, 0), null, "up: the sky");
  assert.strictEqual(groundHit(o, { x: 0, y: -0.04, z: -1 }, 0), null, `past ${TELEPORT_RANGE} m is out of reach`);
  assert.strictEqual(groundHit(o, { x: NaN, y: -1, z: 0 }, 0), null, "garbage");
});

test("vr: a hop checks every step of the way, so it never lands past a wall or a fence", async () => {
  const { segmentClear, HOP_STEP } = await import(MATH);
  const open = () => true;
  assert.strictEqual(segmentClear(0, 0, 10, 0, open), true);
  // a wall band 0.3 m thick at x = 5: every hop across it is refused, however it falls on the steps
  for (const end of [5.2, 7, 10, 14.9]) {
    assert.strictEqual(segmentClear(0, 0, end, 0, (x) => !(x >= 4.95 && x <= 5.25)), false, `to x=${end}`);
  }
  assert.strictEqual(segmentClear(0, 0, 4.9, 0, (x) => !(x >= 4.95 && x <= 5.25)), true, "short of the wall: fine");
  assert.strictEqual(segmentClear(0, 0, 3, 4, (x, z) => !(x === 3 && z === 4)), false, "the landing itself is checked");
  const seen = [];
  segmentClear(0, 0, 0, 1, (x, z) => { seen.push(z); return true; });
  assert.ok(seen.length >= 1 / HOP_STEP && seen.every((z, i) => i === 0 || z - seen[i - 1] <= HOP_STEP + 1e-12), "at most HOP_STEP apart");
  assert.strictEqual(segmentClear(0, 0, NaN, 0, open), false, "garbage is refused");
});

test("vr: the overhead flight moves where the head faces, faster higher up, and stays over the campus", async () => {
  const { flyStep, flySpeed, FLY } = await import(MATH);
  const box = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
  const at = { x: 0, y: FLY.start, z: 0, yaw: 0 };
  const ahead = flyStep(at, { x: 0, z: -1 }, 0, 1, box);
  close(ahead.x, 0, 1e-9); close(ahead.z, -flySpeed(FLY.start), 1e-9, "forward is -z at yaw 0"); close(ahead.y, FLY.start);
  const turned = flyStep({ ...at, yaw: 90 * DEG }, { x: 0, z: -1 }, 0, 1, box);
  close(turned.x, -flySpeed(FLY.start), 1e-9, "the rig turned left: forward is west"); close(turned.z, 0, 1e-9);
  assert.ok(flySpeed(600) > flySpeed(100), "higher is faster");
  assert.ok(flyStep(at, null, 1, 0.5, box).y > FLY.start, "stick up climbs");
  assert.ok(flyStep(at, null, -1, 0.5, box).y < FLY.start, "and down sinks");
  assert.strictEqual(flyStep({ ...at, y: FLY.min + 1 }, null, -1, 5, box).y, FLY.min, "never below the floor of the flight");
  assert.strictEqual(flyStep({ ...at, y: FLY.max - 1 }, null, 1, 5, box).y, FLY.max, "nor above its ceiling");
  const far = flyStep({ ...at, x: 490 }, { x: 1, z: 0 }, 0, 10, box);
  assert.strictEqual(far.x, 500, "held over the campus");
  assert.deepStrictEqual(flyStep(at, { x: NaN, z: 0 }, NaN, NaN, box), { x: 0, y: FLY.start, z: 0 }, "garbage stands still");
});
