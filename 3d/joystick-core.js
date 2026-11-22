// The touch joystick's decisions, kept pure (no DOM, no three.js) so node can test them:
// tools/test/joystick.test.js. 3d/touch-controls.js does the pointers and the placing on screen.
// Ported from the UC Davis campus map's touch-controls.js and look-math.js (joystickVector).
//
// Conventions: the stick's x is right and z is down the screen (backward), so pushing it up is
// -z. Walking, three.js yaw + turns left and forward is (-sin yaw, -cos yaw) on the ground
// (x east, z south). Overhead, "up" on the stick is the way the camera faces: the top of the screen.
import { panToWorld } from "./overhead-core.js?v=4";

/** Of the knob's travel: a resting thumb never walks. */
export const JOYSTICK_DEAD_ZONE = 0.12;
/** Pushed this far (of its travel) the walker is at its keyboard walking speed. */
export const JOYSTICK_WALK = 0.7;
/** Pushed this far (of its travel) the walker runs, as Shift does on a keyboard. Between the
 *  two the speed rises in a straight line from walking to running, so there is no jump. */
export const JOYSTICK_RUN = 0.92;

/** A touch screen, decided once at boot: a coarse pointer anywhere, or touch support. Never the user agent. */
export function isTouchScreen(win = globalThis) {
  try {
    if (win.matchMedia?.("(any-pointer: coarse)").matches) return true;
  } catch { /* a matchMedia that throws: decide by touch support alone */ }
  return "ontouchstart" in win;
}

/**
 * A finger at (dx, dy) px from the joystick's centre, as a walk. The knob follows the finger but
 * never leaves `radius`; mag is 0 inside the dead zone and rises to 1 at the rim; x is right and
 * z is down the screen.
 * @returns {{ x: number, z: number, mag: number, knobX: number, knobY: number }}
 */
export function joystickVector(dx, dy, radius, deadZone = JOYSTICK_DEAD_ZONE) {
  const dist = Math.hypot(dx, dy);
  if (!(radius > 0) || !Number.isFinite(dist) || dist === 0) return { x: 0, z: 0, mag: 0, knobX: 0, knobY: 0 };
  const k = Math.min(1, radius / dist);
  const raw = Math.min(1, dist / radius);
  const mag = raw <= deadZone ? 0 : (raw - deadZone) / (1 - deadZone);
  return { x: mag ? (dx / dist) * mag : 0, z: mag ? (dy / dist) * mag : 0, mag, knobX: dx * k, knobY: dy * k };
}

/** A stick input made safe: finite, and never longer than 1. */
export function clampStick(x, z) {
  const fx = Number.isFinite(x) ? x : 0;
  const fz = Number.isFinite(z) ? z : 0;
  const len = Math.hypot(fx, fz);
  return len > 1 ? { x: fx / len, z: fz / len } : { x: fx, z: fz };
}

/**
 * The stick as the walker's move: a unit direction (fwd + ahead, strafe + right) and a speed:
 * analog up to `walk` at JOYSTICK_WALK, rising evenly to `run` at JOYSTICK_RUN, `run` beyond.
 * Null when the stick is at rest.
 */
export function walkFromStick(x, z, walk, run) {
  const s = clampStick(x, z);
  const mag = Math.hypot(s.x, s.z);
  if (!mag) return null;
  const speed = mag <= JOYSTICK_WALK ? walk * (mag / JOYSTICK_WALK)
    : walk + (run - walk) * Math.min(1, (mag - JOYSTICK_WALK) / (JOYSTICK_RUN - JOYSTICK_WALK));
  return { fwd: -s.z / mag, strafe: s.x / mag, speed };
}

/**
 * The stick as an overhead pan: `step` metres at full push, toward the top of the screen for up
 * (the way a camera at heading `yaw` faces) and the screen's right for right.
 * @returns {[number, number]} [dx, dz] on the ground
 */
export function stickPan(yaw, x, z, step) {
  const s = clampStick(x, z);
  return panToWorld(yaw, s.x * step, -s.z * step);
}

/**
 * Where the joystick goes, as { lift, shift } px from home (bottom left): home when nothing is in
 * the way, else the nearest place, by lift + shift, that is whole on screen, below `minTop`, and
 * `gap` clear of every obstacle on all four sides: lifted above each one, moved right of each
 * one, or both. Null when there is no such place.
 * @param {{ home: {left: number, top: number, right: number, bottom: number}, obstacles: object[],
 *   vw: number, gap: number, minTop: number, edge: number }} o
 */
export function placeJoystick({ home, obstacles, vw, gap, minTop, edge }) {
  const lifts = [...new Set([0, ...obstacles.map((r) => Math.ceil(home.bottom - r.top + gap))])].filter((d) => d >= 0);
  const shifts = [...new Set([0, ...obstacles.map((r) => Math.ceil(r.right + gap - home.left))])].filter((d) => d >= 0);
  const options = shifts.flatMap((shift) => lifts.map((lift) => ({ lift, shift })))
    .sort((a, b) => a.lift + a.shift - (b.lift + b.shift) || a.lift - b.lift);
  const fits = ({ lift, shift }) => {
    const box = { left: home.left + shift, right: home.right + shift, top: home.top - lift, bottom: home.bottom - lift };
    if (box.top < minTop || box.right > vw - edge) return false;
    return obstacles.every((r) => r.right <= box.left - gap || r.left >= box.right + gap
      || r.bottom <= box.top - gap || r.top >= box.bottom + gap);
  };
  return options.find(fits) || null;
}

/**
 * placeJoystick at each size in `sizes` (px, largest first) in turn, the circle keeping its
 * home's left and bottom edges: the first size with a place wins, as { lift, shift, size }.
 * Null when none has one (the joystick then waits, out of sight, for room: touch-controls.js).
 */
export function fitJoystick({ home, sizes, ...rest }) {
  for (const size of sizes) {
    const box = { left: home.left, bottom: home.bottom, right: home.left + size, top: home.bottom - size };
    const p = placeJoystick({ ...rest, home: box });
    if (p) return { ...p, size };
  }
  return null;
}

/** The sizes to try, px: `natural`, then smaller by `step` down to `min` (never below it). */
export function joystickSizes(natural, min, step = 8) {
  const sizes = [natural];
  for (let s = natural - step; s >= min; s -= step) sizes.push(s);
  if (sizes[sizes.length - 1] > min && natural > min) sizes.push(min);
  return sizes;
}
