// First-person walker. Fully keyboard-operable: W A S D walks (Shift runs),
// arrow keys look, E uses the elevator or stairs you are standing at, V hands
// the camera to the overhead view and back. Mouse drag looks around.
//
// Outdoors, building footprints block walking. Walking into the Medical
// Center at one of its entrances takes you inside; inside, the current floor's
// outline is the walkable area and its walls — perimeter and the inferred
// partitions — block. Elevators and stairs
// change floor through the picker (main.js) — this module only reports that
// you are standing at one.
import * as THREE from "./lib/three.module.js";
import { footprintAt } from "./buildings.js?v=7";
import { DOOR_RADIUS_OUT, DOOR_RADIUS_IN, CELL_RADIUS } from "./hospital.js?v=12";
import { EYE } from "./world.js?v=6";

const WALK_SPEED = 3.2;
const RUN_SPEED = 7;
const LOOK_SPEED = 1.9; // rad/s, arrow keys
const MAX_PITCH = Math.PI / 2 - 0.05;
const NUDGE_LOOK = 0.12; // a single arrow tap turns this much

// Physical-key names, with e.key fallbacks for environments that only send one.
const CODE_BY_KEY = {
  w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD", e: "KeyE", shift: "ShiftLeft",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
};
// The only codes update() reads; anything else is never remembered.
const HELD_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const codeOf = (e) => e.code || CODE_BY_KEY[String(e.key).toLowerCase()] || "";
const isTypingTarget = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);

export function createPlayer(world, index, hospital, spawn, zoneAt = () => null) {
  const yawObj = new THREE.Object3D();
  const pitchObj = new THREE.Object3D();
  yawObj.add(pitchObj);
  world.scene.add(yawObj);
  yawObj.position.set(spawn.x, EYE, spawn.z);
  yawObj.rotation.y = spawn.yaw || 0;

  const keys = new Set();
  const state = { mode: "walk", floor: null, moving: false, paused: false }; // floor: null = outdoors; paused = a modal is up
  const api = {
    object: yawObj,
    state,
    onEnter: null, // (entrance) -> void
    onExit: null, // (entrance) -> void
    onUse: null, // ({ kind: "elevator"|"stairs", node, floor }) -> void
    onNearby: null, // (cell|null) -> void, when what's within reach changes
    onBlocked: null,
    onZoneBlocked: null, // (zone) -> void: the walker pushed against construction fencing
    onIdentify: null, // () -> void: E pressed with nothing to use nearby
  };

  // --- collision ---------------------------------------------------------

  /**
   * Can the walker stand at (x, z)?
   * @returns {true | {door, inward} | {blocked: "zone", zone} | {blocked: "wall"}}
   * A pure query: it never announces anything. tryMove decides what to say, once.
   */
  function passable(x, z) {
    if (state.floor === null) {
      const zone = zoneAt(x, z);
      if (zone) return { blocked: "zone", zone }; // fencing, not a suggestion — you go around
      const hit = footprintAt(index, x, z, true);
      if (!hit) return true;
      if (hit.building && hit.building.renderedBy === "hospital") {
        const door = hospital.entranceNear(x, z, DOOR_RADIUS_OUT);
        if (door) return { door, inward: true };
      }
      return { blocked: "wall" };
    }
    if (hospital.walkable(state.floor, x, z)) return true;
    if (state.floor === "1" && !hospital.contains(state.floor, x, z)) {
      const door = hospital.entranceNear(x, z, DOOR_RADIUS_IN);
      if (door) return { door, inward: false };
    }
    return { blocked: "wall" };
  }

  /** Step through a door: the walker is placed just past it on the other side. */
  function passDoor({ door, inward }) {
    const spot = hospital.throughDoor(door, inward);
    yawObj.position.x = spot.x;
    yawObj.position.z = spot.z;
    if (inward) {
      state.floor = "1";
      hospital.setInside("1");
      api.onEnter?.(door);
    } else {
      state.floor = null;
      hospital.setInside(null);
      api.onExit?.(door);
    }
  }

  function tryMove(nx, nz) {
    const { x, z } = yawObj.position;
    const ahead = passable(nx, nz);
    if (ahead && ahead.door) {
      passDoor(ahead);
      return;
    }
    // Never trap the walker: if already inside something solid, let them out.
    if (ahead === true || passable(x, z) !== true) {
      yawObj.position.x = nx;
      yawObj.position.z = nz;
      return;
    }
    // Blocked. Slide along the obstacle where possible — and say so either way,
    // ONCE: a walker who can't see the fence or wall needs to know why the room
    // stopped getting closer.
    if (passable(nx, z) === true) yawObj.position.x = nx;
    else if (passable(x, nz) === true) yawObj.position.z = nz;
    if (ahead.blocked === "zone") api.onZoneBlocked?.(ahead.zone);
    else api.onBlocked?.();
  }

  // --- input ---------------------------------------------------------------

  const canvas = world.renderer.domElement;
  const look = (dyaw, dpitch) => {
    yawObj.rotation.y += dyaw;
    pitchObj.rotation.x = THREE.MathUtils.clamp(pitchObj.rotation.x + dpitch, -MAX_PITCH, MAX_PITCH);
  };
  // Single-character shortcuts (W A S D E) are scoped to the map having focus
  // (SC 2.1.4): with focus on a HUD button, "d" must not strafe the walker.
  const mapFocused = () => document.activeElement === canvas;
  function onKeyDown(e) {
    if (state.mode !== "walk" || !mapFocused() || isTypingTarget(e.target) || document.querySelector("dialog[open]")) return;
    const code = codeOf(e);
    if (!code) return;
    if (code === "KeyE") {
      if (!e.repeat) useNearby();
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
      e.preventDefault();
      if (!e.repeat) {
        // one tap = one visible turn; holding continues in update()
        if (code === "ArrowLeft") look(NUDGE_LOOK, 0);
        if (code === "ArrowRight") look(-NUDGE_LOOK, 0);
        if (code === "ArrowUp") look(0, NUDGE_LOOK * 0.7);
        if (code === "ArrowDown") look(0, -NUDGE_LOOK * 0.7);
      }
    }
    if (HELD_CODES.has(code)) keys.add(code);
  }
  function onKeyUp(e) {
    const code = codeOf(e);
    keys.delete(code);
    if (code === "ShiftLeft") keys.delete("ShiftRight");
    if (code === "ShiftRight") keys.delete("ShiftLeft");
  }
  let drag = null;
  function onPointerDown(e) {
    if (e.button !== 0 || state.mode !== "walk") return;
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag[0];
    const dy = e.clientY - drag[1];
    drag = [e.clientX, e.clientY];
    look(-dx * 0.005, -dy * 0.005);
  }
  const endDrag = () => { drag = null; };
  const listeners = [
    [window, "keydown", onKeyDown],
    [window, "keyup", onKeyUp],
    [window, "blur", () => keys.clear()],
    [canvas, "pointerdown", onPointerDown],
    [canvas, "pointermove", onPointerMove],
    [canvas, "pointerup", endDrag],
    [canvas, "pointercancel", endDrag],
  ];
  for (const [t, type, fn] of listeners) t.addEventListener(type, fn);

  // --- elevators & stairs ---------------------------------------------------

  let nearby = null;
  const LEAVE_SLACK = 1.5; // metres: harder to leave a cell than to enter it, so the prompt can't flicker
  function findNearby() {
    if (state.floor === null) return null;
    const { x, z } = yawObj.position;
    // Hysteresis: keep the current cell while still within the wider "leave" radius.
    if (nearby && nearby.floor === state.floor) {
      const keep = nearby.kind === "elevator"
        ? hospital.elevatorNear(state.floor, x, z, CELL_RADIUS + LEAVE_SLACK) === nearby.node
        : hospital.stairsNear(state.floor, x, z, CELL_RADIUS + LEAVE_SLACK) === nearby.node;
      if (keep) return nearby;
    }
    const elevator = hospital.elevatorNear(state.floor, x, z);
    if (elevator) return { kind: "elevator", node: elevator, floor: state.floor };
    const stairs = hospital.stairsNear(state.floor, x, z);
    if (stairs) return { kind: "stairs", node: stairs, floor: state.floor };
    return null;
  }
  function useNearby() {
    if (nearby) api.onUse?.(nearby);
    else api.onIdentify?.(); // nothing to use here: say what's ahead instead
  }

  /** Arrive on a floor at its elevator (or stairs) — called by main.js after the picker. */
  function goToFloor(id, via) {
    const { x, z } = yawObj.position;
    const spot = via === "stairs" ? hospital.stairsOn(id) || hospital.elevatorOn(id, null, x, z)
      : hospital.elevatorOn(id, via, x, z);
    state.floor = id;
    hospital.setInside(id);
    // Step out of the core into the corridor (not into a room across a wall),
    // facing away from the box.
    const out = hospital.exitSpot(id, spot.x, spot.z);
    const dx = out.x - spot.x;
    const dz = out.z - spot.z;
    const l = Math.hypot(dx, dz) || 1;
    yawObj.position.x = out.x;
    yawObj.position.z = out.z;
    if (l > 0.01) yawObj.rotation.y = Math.atan2(-(dx / l), -(dz / l));
  }

  // --- camera ownership ---------------------------------------------------------

  function attachCamera() {
    pitchObj.add(world.camera);
    world.camera.position.set(0, 0, 0);
    world.camera.rotation.set(0, 0, 0);
  }
  attachCamera();

  function setMode(mode) {
    state.mode = mode;
    keys.clear();
    if (mode === "walk") attachCamera();
  }

  const floorY = () => (state.floor === null ? 0 : hospital.floor(state.floor).y);

  /** Put the walker somewhere outdoors (the Start select). */
  api.teleport = (x, z) => { yawObj.position.x = x; yawObj.position.z = z; };
  /** Pull the walker toward (x, z) through normal collision — walls and fences still hold. */
  api.nudgeTo = (x, z) => { tryMove(x, z); };
  api.leaveBuilding = () => { if (state.floor !== null) { state.floor = null; hospital.setInside(null); } };
  api.setMode = setMode;
  api.goToFloor = goToFloor;
  api.useNearby = useNearby;
  /** A modal is up: drop held keys and ignore the world until resumed. */
  api.pause = () => { keys.clear(); state.moving = false; state.paused = true; };
  api.resume = () => { state.paused = false; };
  api.nearby = () => nearby;
  api.dispose = () => {
    for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  };
  api.update = (dt) => {
    if (state.mode !== "walk" || state.paused) return;
    if (keys.has("ArrowLeft")) look(LOOK_SPEED * dt, 0);
    if (keys.has("ArrowRight")) look(-LOOK_SPEED * dt, 0);
    if (keys.has("ArrowUp")) look(0, LOOK_SPEED * dt * 0.7);
    if (keys.has("ArrowDown")) look(0, -LOOK_SPEED * dt * 0.7);

    const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = run ? RUN_SPEED : WALK_SPEED;
    let fwd = 0;
    let strafe = 0;
    if (keys.has("KeyW")) fwd += 1;
    if (keys.has("KeyS")) fwd -= 1;
    if (keys.has("KeyA")) strafe -= 1;
    if (keys.has("KeyD")) strafe += 1;
    state.moving = !!(fwd || strafe);
    if (state.moving) {
      const yaw = yawObj.rotation.y;
      const dx = (-Math.sin(yaw) * fwd + Math.cos(yaw) * strafe) * speed * dt;
      const dz = (-Math.cos(yaw) * fwd - Math.sin(yaw) * strafe) * speed * dt;
      tryMove(yawObj.position.x + dx, yawObj.position.z + dz);
    }
    yawObj.position.y = floorY() + EYE;

    const n = findNearby();
    const changed = (n === null) !== (nearby === null) || (n && nearby && (n.kind !== nearby.kind || n.node !== nearby.node));
    if (changed) {
      nearby = n;
      api.onNearby?.(n);
    }
  };
  return api;
}
