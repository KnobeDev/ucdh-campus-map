// Overhead camera for the scene shell: an orbit around a focus point on the
// ground, driven by keyboard first (W A S D move the view north, west, south, east;
// the arrows tilt and turn it; Q/E turn, PgUp/PgDn tilt, +/- zoom) and by
// pointer drag / wheel second: a drag pans the map as it does on the 2D map (mouse,
// pen or finger), Shift+drag turns and tilts it. Phase 3 adds the first-person
// player; this stays as the "helicopter" view.
//
// Everything responds on key-down/pointer-move only while the input is held —
// nothing fires on pointer-down alone (SC 2.5.2 pointer cancellation) and there
// is no motion unless the user is actively driving it.
import * as THREE from "./lib/three.module.js";
import { dragAction, dragToPan, panToWorld, clampToBox, keyAction, compassStep, TILT_MIN, TILT_MAX, OPEN_PITCH } from "./overhead-core.js?v=4";

const PAN_SPEED = 220; // metres per second at 1× zoom, scaled by distance
const ROT_SPEED = 1.4; // radians per second
const ZOOM_RATE = 1.25; // per key press / wheel notch
const MIN_DIST = 25;
const MAX_DIST = 2500;

export function createOverheadCamera(world, canvas) {
  const cam = world.camera;
  const focus = new THREE.Vector3(world.center.x, 0, world.center.z);
  let yaw = 0; // radians around +y
  let pitch = OPEN_PITCH; // radians above the ground plane: shown as 45, halfway between straight down and level
  let dist = 900;
  const keys = new Set();
  let dragging = false;
  let dragId = null; // the one pointer driving the drag: a second finger doesn't fight it
  let dragMode = "pan"; // chosen when the drag starts (Shift or not) and kept until it ends
  let last = null;
  let enabled = true; // false while the first-person walker owns the camera

  function apply() {
    const cp = Math.cos(pitch);
    cam.position.set(
      focus.x + dist * cp * Math.sin(yaw),
      focus.y + dist * Math.sin(pitch),
      focus.z + dist * cp * Math.cos(yaw)
    );
    cam.lookAt(focus);
  }

  // Move the spot to (x, z), held on the campus (world.box is data.meta.world).
  function setFocus(x, z) {
    const [cx, cz] = clampToBox(x, z, world.box, [focus.x, focus.z]);
    focus.x = cx;
    focus.z = cz;
  }

  function pan(dx, dz) {
    // Move in the camera's ground-plane frame so "up" always means "away".
    const [wx, wz] = panToWorld(yaw, dx, dz);
    setFocus(focus.x + wx, focus.z + wz);
  }

  function zoom(factor) {
    dist = Math.min(Math.max(dist * factor, MIN_DIST), MAX_DIST);
  }

  // One key event as one action (overhead-core.js keyAction): W A S D move due north, west,
  // south, east; the arrows tilt (up, down) and turn (left, right); Q E, PgUp PgDn, + − too.
  // Everything a drag does is reachable by keyboard (SC 2.1.1).
  const actionOf = keyAction;
  const tilt = (d) => { pitch = Math.min(Math.max(pitch + d, TILT_MIN), TILT_MAX); };

  // A single key press must do something visible on its own — a screen-reader
  // user taps keys, they don't hold them. So every key-down applies one discrete
  // nudge immediately; holding the key then continues smoothly via update().
  const NUDGE_PAN = 0.06; // fraction of the view distance per tap
  const NUDGE_ROT = 0.18; // radians per tap
  function nudge(action) {
    const step = dist * NUDGE_PAN;
    const move = compassStep(action, step);
    if (move) setFocus(focus.x + move[0], focus.z + move[1]);
    else if (action === "ccw") yaw += NUDGE_ROT;
    else if (action === "cw") yaw -= NUDGE_ROT;
    else if (action === "in") zoom(1 / ZOOM_RATE);
    else if (action === "out") zoom(ZOOM_RATE);
    else if (action === "tiltUp") tilt(NUDGE_ROT);
    else if (action === "tiltDown") tilt(-NUDGE_ROT);
    apply(); // a tap shows at once, not a frame later
  }

  function press(e) {
    if (!enabled) return;
    const action = actionOf(e);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // OS auto-repeat: update() already handles the hold
    nudge(action);
    keys.add(action);
  }

  function onPointerDown(e) {
    if (!enabled || e.button !== 0) return;
    if (dragging) return; // a second finger while one drags
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      return; // no capture, no drag: a half-started drag must never block the next one
    }
    dragging = true;
    dragId = e.pointerId;
    dragMode = dragAction(e); // letting go of Shift mid-drag must not switch a turn into a pan
    last = [e.clientX, e.clientY];
  }
  function onPointerMove(e) {
    if (!dragging || !last || e.pointerId !== dragId) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    if (dragMode === "pan") {
      // Grab the ground: the spot under the pointer follows it.
      const [right, away] = dragToPan({ dx, dy, dist, fovDeg: cam.fov, viewHeight: canvas.clientHeight, pitch });
      pan(right, away);
    } else {
      yaw -= dx * 0.005;
      tilt(dy * 0.005);
    }
  }
  const endDrag = (e) => {
    if (e && e.pointerId !== dragId) return;
    dragging = false;
    dragId = null;
    last = null;
  };
  function onWheel(e) {
    if (!enabled) return;
    e.preventDefault();
    zoom(e.deltaY > 0 ? ZOOM_RATE : 1 / ZOOM_RATE);
  }

  // On key-up, clear what this physical key armed. Read the key without its modifiers: one
  // released with Ctrl or Alt now held must still stop the move it started.
  const release = (e) => {
    const action = actionOf({ key: e.key, code: e.code });
    if (action) keys.delete(action);
  };
  const listeners = [
    ["keydown", press],
    ["keyup", release],
    ["blur", () => keys.clear()],
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", endDrag],
    ["pointercancel", endDrag],
    ["lostpointercapture", endDrag], // a lost drag must never leave the next one ignored
    ["wheel", onWheel, { passive: false }],
  ];
  for (const [type, fn, opts] of listeners) canvas.addEventListener(type, fn, opts);

  apply();
  return {
    focus,
    /** Take or release the camera. Taking it re-parents the camera to the scene. */
    setEnabled(on) {
      enabled = on;
      keys.clear();
      endDrag();
      if (on) {
        if (cam.parent !== world.scene) world.scene.add(cam);
        apply();
      }
    },
    update(dt) {
      if (!enabled) return;
      if (keys.size) {
        const step = PAN_SPEED * dt * (dist / 900);
        for (const a of ["north", "south", "east", "west"]) {
          if (!keys.has(a)) continue;
          const [dx, dz] = compassStep(a, step);
          setFocus(focus.x + dx, focus.z + dz);
        }
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
    /** The heading and tilt, for the gauges (overhead-core.js headingDeg, displayPitch). */
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    /** Set the tilt (radians above the ground, held in range): the view opens at OPEN_PITCH. */
    setPitch(p) {
      if (!Number.isFinite(p)) return;
      tilt(p - pitch);
      apply();
    },
    /** Re-aim at a world point — used by later phases to jump to a building. */
    lookAt(x, z, d) {
      setFocus(x, z);
      if (d) dist = Math.min(Math.max(d, MIN_DIST), MAX_DIST);
      apply();
    },
  };
}
