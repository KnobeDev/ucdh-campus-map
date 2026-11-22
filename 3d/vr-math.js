// VR (WebXR) input as pure numbers: the thumbsticks, the turn, the walk a stick asks for, the
// hop's landing check, the overhead flight, and the in-headset menu's layout. Pure: no DOM, no
// three.js, so tools/test/vr-math.test.js runs it in node. vr-controls.js wires it to the
// controllers and vr.js to the session. Ported from the UC Davis campus map's vr-math.js
// (owner, 2026-11-21: "We need a VR view as well, similar to the campus VR capabilities").
//
// Conventions (joystick-core.js): three.js yaw θ in radians, + turns LEFT, forward = (−sin θ, −cos θ).
// A gamepad's stick reads x + right and y + toward you, so pushing it forward is y = −1.
import { JOYSTICK_WALK } from "./joystick-core.js?v=1";

export const STICK_DEAD_ZONE = 0.15;      // a resting thumb (and a worn stick's drift) never walks
export const SNAP_TURN_RAD = Math.PI / 6; // 30° per push: the comfortable default
const SNAP_PRESS = 0.6, SNAP_RELEASE = 0.3; // push past to turn; back under to arm the next turn
const SMOOTH_TURN_RAD_S = Math.PI / 2;    // 90°/s at a full push (Turning in the VR menu)
// A full push WALKS, at the keyboard's walking speed: the touch joystick reaches that at
// JOYSTICK_WALK of its travel (player.js reads the stick through walkFromStick). Running through
// a headset is a choice (a held grip), not something a thumb does by accident.
export const WALK_CAP = JOYSTICK_WALK;
// The xr-standard gamepad mapping (Quest Touch and most others): which button is which.
export const BUTTON = Object.freeze({ trigger: 0, squeeze: 1, stick: 3, a: 4, b: 5 });

const num = (v) => (Number.isFinite(v) ? v : 0);

/** The thumbstick of a WebXR gamepad: axes 2/3 on an xr-standard pad (0/1 are its touchpad),
 *  0/1 on a pad that has only the stick. A hand has no gamepad: rest. */
export function stickOf(gamepad) {
  const a = gamepad?.axes;
  if (!a || !a.length) return { x: 0, y: 0 };
  return a.length >= 4 ? { x: num(a[2]), y: num(a[3]) } : { x: num(a[0]), y: num(a[1]) };
}

/** Radial dead zone: zero inside it, and past it the push rescales to reach 1 at the rim. */
export function deadZone({ x, y }, dz = STICK_DEAD_ZONE) {
  const m = Math.hypot(x, y);
  if (!(m > dz)) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

/** Is gamepad button i down (pressed, or an analogue one past half its travel)? */
export function isPressed(gamepad, i) {
  const b = gamepad?.buttons?.[i];
  return !!(b && (b.pressed || b.value > 0.5));
}

/** The turn about the vertical of a head pose quaternion {x, y, z, w}, whatever its tilt. */
export function headYaw(q) {
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
}

/** The walk a stick asks for, as player.setMoveInput takes it (x right, z back, in the walker's
 *  frame), turned so that forward is where the head faces (yaw: the head's turn in the walker's
 *  frame). On foot a full push walks and `run` (a held grip) runs at any push; overhead the push
 *  sets the speed. */
export function stickWalk(stick, yaw, { run = false, overhead = false } = {}) {
  const m = Math.hypot(stick.x, stick.y);
  if (!m) return { x: 0, z: 0 };
  const k = overhead ? 1 : run ? 1 / m : WALK_CAP;
  const sx = stick.x * k, sy = stick.y * k;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: sx * c + sy * s, z: sy * c - sx * s };
}

/** Snap turning: one SNAP_TURN_RAD turn per push past SNAP_PRESS; the stick must come back
 *  under SNAP_RELEASE before the next. Returns the yaw change (stick right turns right). */
export function createSnapTurn({ step = SNAP_TURN_RAD, press = SNAP_PRESS, release = SNAP_RELEASE } = {}) {
  let armed = true;
  return (x) => {
    const a = Math.abs(num(x));
    if (a < release) { armed = true; return 0; }
    if (!armed || a < press) return 0;
    armed = false;
    return x > 0 ? -step : step;
  };
}

/** Smooth turning: the yaw change for a (dead-zoned) push held for dt seconds. */
export function smoothTurn(x, dt, rate = SMOOTH_TURN_RAD_S) {
  return -num(x) * rate * num(dt) || 0;
}

/** Rising edges, per key: true once each time a button goes down. */
export function createEdges() {
  const was = new Map();
  return (key, down) => {
    const rising = !!down && !was.get(key);
    was.set(key, !!down);
    return rising;
  };
}

// ---- the menu panel (vr-controls.js draws it on a canvas of these pixels) ----
export const MENU = Object.freeze({ width: 640, pad: 20, head: 96, row: 64, gap: 8 });

/** The canvas height for n rows. */
export function menuHeight(n, L = MENU) {
  return L.pad + L.head + n * L.row + Math.max(0, n - 1) * L.gap + L.pad;
}

/** The canvas y of row i's top edge. */
export function menuRowTop(i, L = MENU) {
  return L.pad + L.head + i * (L.row + L.gap);
}

/** Which row a ray hit, from three.js's plane uv (u left → right, v bottom → top); −1 for the
 *  heading, a gap, the margin or a miss. */
export function menuItemAt(u, v, n, L = MENU) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return -1;
  const px = u * L.width, py = (1 - v) * menuHeight(n, L);
  if (px < L.pad || px > L.width - L.pad) return -1;
  const y = py - menuRowTop(0, L);
  if (y < 0) return -1;
  const i = Math.floor(y / (L.row + L.gap));
  if (i >= n || y - i * (L.row + L.gap) > L.row) return -1;
  return i;
}

/** Where an opened menu stands, in the rig's frame: `dist` ahead of the head on its turn,
 *  `drop` below the eye, turned to face it and leaning back (tilt < 0) toward the eye above. */
export function menuPose(head, yaw, { dist = 0.9, drop = 0.2 } = {}) {
  return {
    x: head.x - Math.sin(yaw) * dist,
    y: head.y - drop,
    z: head.z - Math.cos(yaw) * dist,
    yaw,
    tilt: -Math.atan2(drop, dist),
  };
}

/** A page button as a menu row: its visible words (the .btn-txt span, else its own text) and,
 *  for a switch (aria-pressed), On or Off. A missing or hidden button is not offered (null). */
export function buttonItem(btn) {
  if (!btn || btn.hidden) return null;
  const label = (btn.querySelector?.(".btn-txt")?.textContent ?? btn.textContent ?? "").trim();
  const pressed = btn.getAttribute?.("aria-pressed");
  return { label, state: pressed === "true" ? "On" : pressed === "false" ? "Off" : "" };
}

/** Which stick walks and which turns. Two controllers: left walks, right turns. One alone (the
 *  other asleep, or a hand, which has no stick): forward and back walk and sideways turns, so a
 *  one-handed visitor still turns without turning their body. */
export function assignSticks(left, right) {
  if (left && right) return { move: left, steer: right };
  const one = left || right;
  if (!one) return { move: { x: 0, y: 0 }, steer: { x: 0, y: 0 } };
  return { move: { x: 0, y: one.y }, steer: { x: one.x, y: 0 } };
}

// ---- the menu by ear: a headset has no screen reader and no live region a wearer can hear ----

// the voice drops a bare ° (and Amy's phonemizer folds it away): say the word
const spoken = (text) => text.replace(/°/g, " degrees");

/** What a ray landing on a row says: its words, and the switch's state. */
export function rowWords(row) {
  if (!row) return "";
  return spoken(row.state ? `${row.label}, ${row.state.toLowerCase()}` : row.label);
}

/** What choosing a row did, from the row before and after: a switch says its new state; a
 *  button that names its next action (Overhead view becomes Walk) says what was done;
 *  a row that did not change (Sonar speaks for itself) or went away says nothing. */
export function resultWords(before, after) {
  if (!before || !after) return "";
  if (after.state && after.state !== before.state) return spoken(`${after.label}: ${after.state.toLowerCase()}.`);
  if (after.label !== before.label) return spoken(`${before.label}.`);
  return "";
}

// ---- hop: point at the ground and pull the trigger (or pinch) ----
export const TELEPORT_RANGE = 15; // m: far enough to cross a street, near enough to aim
export const HOP_STEP = 0.25;     // m between the points a hop checks: thinner than any wall's margin band

/** Where a ray meets the ground at height groundY, if it points down at it within
 *  TELEPORT_RANGE (measured along the ground); null for the sky, level, or out of reach. */
export function groundHit(origin, dir, groundY, range = TELEPORT_RANGE) {
  const vals = [origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, groundY];
  if (!vals.every(Number.isFinite) || !(dir.y < 0)) return null;
  const t = (groundY - origin.y) / dir.y;
  if (!(t > 0)) return null;
  const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
  if (Math.hypot(x - origin.x, z - origin.z) > range) return null;
  return { x, z };
}

/** Is every point along the ground from (x0, z0) to (x1, z1), at most `step` apart and the far
 *  end included, clear by `isClear(x, z)`? A hop is a walk you skip, not a jump over things: it
 *  never lands past a wall, a fence or a building it would have had to cross. */
export function segmentClear(x0, z0, x1, z1, isClear, step = HOP_STEP) {
  if (![x0, z0, x1, z1].every(Number.isFinite) || !(step > 0)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!isClear(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}

// ---- the overhead view in VR: a flight over the map (the flat view's orbit camera cannot carry
// a headset, whose pose three.js puts on the camera's parent) ----
export const FLY = Object.freeze({ start: 180, min: 40, max: 1200 }); // m above the ground

/** Ground speed (m/s) at a full push from `alt` metres up: about the flat overhead view's pan
 *  for the same height, so higher is faster. */
export function flySpeed(alt) {
  return Math.min(Math.max(0.3 * num(alt), 12), 360);
}

/**
 * One frame of flight. `at` { x, y, z, yaw } is the flying rig; `move` { x, z } the stick's push
 * in the rig's frame (x right, z back: stickWalk with overhead), `climb` −1..1 (up climbs), `box`
 * { minX, maxX, minZ, maxZ } the campus it stays over. Returns the rig's new { x, y, z }.
 */
export function flyStep(at, move, climb, dt, box) {
  const d = Math.max(0, num(dt));
  const v = flySpeed(at.y) * d;
  const c = Math.cos(num(at.yaw)), s = Math.sin(num(at.yaw));
  const mx = num(move?.x), mz = num(move?.z);
  const x = num(at.x) + (mx * c + mz * s) * v;
  const z = num(at.z) + (mz * c - mx * s) * v;
  const y = num(at.y) + Math.max(-1, Math.min(1, num(climb))) * (0.6 * num(at.y) + 20) * d;
  const clamp = (val, lo, hi) => Math.min(Math.max(val, lo), hi);
  return {
    x: box ? clamp(x, box.minX, box.maxX) : x,
    y: clamp(y, FLY.min, FLY.max),
    z: box ? clamp(z, box.minZ, box.maxZ) : z,
  };
}
