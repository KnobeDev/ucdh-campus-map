// Overhead camera for the scene shell: an orbit around a focus point on the
// ground, driven by keyboard first (arrows pan, Q/E rotate, +/- zoom) and by
// mouse drag / wheel second. Phase 3 adds the first-person player; this stays
// as the "helicopter" view.
//
// Everything responds on key-down/pointer-move only while the input is held —
// nothing fires on pointer-down alone (SC 2.5.2 pointer cancellation) and there
// is no motion unless the user is actively driving it.
import * as THREE from "./lib/three.module.js";

const PAN_SPEED = 220; // metres per second at 1× zoom, scaled by distance
const ROT_SPEED = 1.4; // radians per second
const ZOOM_RATE = 1.25; // per key press / wheel notch
const MIN_DIST = 25;
const MAX_DIST = 2500;

export function createOverheadCamera(world, canvas) {
  const cam = world.camera;
  const focus = new THREE.Vector3(world.center.x, 0, world.center.z);
  let yaw = 0; // radians around +y
  let pitch = 0.95; // radians above the ground plane
  let dist = 900;
  const keys = new Set();
  let dragging = false;
  let last = null;

  function apply() {
    const cp = Math.cos(pitch);
    cam.position.set(
      focus.x + dist * cp * Math.sin(yaw),
      focus.y + dist * Math.sin(pitch),
      focus.z + dist * cp * Math.cos(yaw)
    );
    cam.lookAt(focus);
  }

  function clampFocus() {
    const b = world.box;
    focus.x = Math.min(Math.max(focus.x, b.minX), b.maxX);
    focus.z = Math.min(Math.max(focus.z, b.minZ), b.maxZ);
  }

  function pan(dx, dz) {
    // Move in the camera's ground-plane frame so "up" always means "away".
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    focus.x += dx * c - dz * s;
    focus.z += -dx * s - dz * c;
    clampFocus();
  }

  function zoom(factor) {
    dist = Math.min(Math.max(dist * factor, MIN_DIST), MAX_DIST);
  }

  // Normalise a key event to one action name, accepting either e.key or e.code
  // (some automation and some keyboards deliver only one of them).
  const ACTIONS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    q: "ccw", Q: "ccw", KeyQ: "ccw", e: "cw", E: "cw", KeyE: "cw",
    "+": "in", "=": "in", Equal: "in", NumpadAdd: "in",
    "-": "out", "_": "out", Minus: "out", NumpadSubtract: "out",
  };
  // Tilt is keyboard-reachable too (PageUp/PageDown, or Shift+Up/Down) — a
  // switch or keyboard-only user must be able to do everything the mouse drag can.
  const actionOf = (e) => {
    if (e.key === "PageUp" || e.code === "PageUp") return "tiltUp";
    if (e.key === "PageDown" || e.code === "PageDown") return "tiltDown";
    if (e.shiftKey && (e.key === "ArrowUp" || e.code === "ArrowUp")) return "tiltUp";
    if (e.shiftKey && (e.key === "ArrowDown" || e.code === "ArrowDown")) return "tiltDown";
    return ACTIONS[e.key] || ACTIONS[e.code] || null;
  };
  const TILT_MIN = 0.15;
  const TILT_MAX = 1.5;
  const tilt = (d) => { pitch = Math.min(Math.max(pitch + d, TILT_MIN), TILT_MAX); };

  // A single key press must do something visible on its own — a screen-reader
  // user taps keys, they don't hold them. So every key-down applies one discrete
  // nudge immediately; holding the key then continues smoothly via update().
  const NUDGE_PAN = 0.06; // fraction of the view distance per tap
  const NUDGE_ROT = 0.18; // radians per tap
  function nudge(action) {
    const step = dist * NUDGE_PAN;
    if (action === "up") pan(0, step);
    else if (action === "down") pan(0, -step);
    else if (action === "left") pan(-step, 0);
    else if (action === "right") pan(step, 0);
    else if (action === "ccw") yaw += NUDGE_ROT;
    else if (action === "cw") yaw -= NUDGE_ROT;
    else if (action === "in") zoom(1 / ZOOM_RATE);
    else if (action === "out") zoom(ZOOM_RATE);
    else if (action === "tiltUp") tilt(NUDGE_ROT);
    else if (action === "tiltDown") tilt(-NUDGE_ROT);
  }

  function press(e) {
    const action = actionOf(e);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // OS auto-repeat: update() already handles the hold
    nudge(action);
    keys.add(action);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || !last) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    if (e.shiftKey) {
      pan((-dx * dist) / 900, (dy * dist) / 900);
    } else {
      yaw -= dx * 0.005;
      tilt(dy * 0.005);
    }
  }
  const endDrag = () => { dragging = false; last = null; };
  function onWheel(e) {
    e.preventDefault();
    zoom(e.deltaY > 0 ? ZOOM_RATE : 1 / ZOOM_RATE);
  }

  // On key-up, clear EVERY action this physical key could have armed — e.key
  // reflects the modifiers held at release, so Shift+Up armed "tiltUp" but a
  // key-up after Shift is released reports plain "up" and would leave the tilt
  // running until focus left the canvas.
  const SIBLINGS = { up: ["tiltUp"], down: ["tiltDown"], tiltUp: ["up"], tiltDown: ["down"] };
  const release = (e) => {
    const action = actionOf(e);
    if (!action) return;
    keys.delete(action);
    for (const s of SIBLINGS[action] || []) keys.delete(s);
  };
  const listeners = [
    ["keydown", press],
    ["keyup", release],
    ["blur", () => keys.clear()],
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", endDrag],
    ["pointercancel", endDrag],
    ["wheel", onWheel, { passive: false }],
  ];
  for (const [type, fn, opts] of listeners) canvas.addEventListener(type, fn, opts);

  apply();
  return {
    focus,
    update(dt) {
      if (keys.size) {
        const step = PAN_SPEED * dt * (dist / 900);
        if (keys.has("up")) pan(0, step);
        if (keys.has("down")) pan(0, -step);
        if (keys.has("left")) pan(-step, 0);
        if (keys.has("right")) pan(step, 0);
        if (keys.has("ccw")) yaw += ROT_SPEED * dt;
        if (keys.has("cw")) yaw -= ROT_SPEED * dt;
        if (keys.has("in")) zoom(1 - 0.9 * dt);
        if (keys.has("out")) zoom(1 + 0.9 * dt);
        if (keys.has("tiltUp")) tilt(ROT_SPEED * dt);
        if (keys.has("tiltDown")) tilt(-ROT_SPEED * dt);
      }
      apply();
    },
    /** Detach every listener — Phase 3 swaps in the first-person controller. */
    dispose() {
      for (const [type, fn, opts] of listeners) canvas.removeEventListener(type, fn, opts);
      keys.clear();
    },
    /** Re-aim at a world point — used by later phases to jump to a building. */
    lookAt(x, z, d) {
      focus.set(x, 0, z);
      if (d) dist = Math.min(Math.max(d, MIN_DIST), MAX_DIST);
      clampFocus();
      apply();
    },
  };
}
