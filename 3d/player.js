// First-person walker. Fully keyboard-operable: W A S D walks (Shift runs),
// arrow keys look, E uses the elevator or stairs you are standing at, V hands
// the camera to the overhead view and back. Mouse drag looks around. On a touch
// screen the joystick (touch-controls.js) walks through setMoveInput, and any
// other finger on the view looks around at the same time. In VR (vr.js) the camera
// rides xrRig, at the feet, and the controllers walk, turn and hop through
// setMoveInput, turn and hop (vr-controls.js).
//
// Outdoors, building footprints block walking. Walking into the Medical
// Center at one of its entrances takes you inside; inside, the current floor's
// outline is the walkable area and its walls — perimeter and the inferred
// partitions — block. Elevators and stairs
// change floor through the picker (main.js) — this module only reports that
// you are standing at one.
import * as THREE from "./lib/three.module.js";
import { footprintAt } from "./buildings.js?v=13";
import { DOOR_RADIUS_OUT, DOOR_RADIUS_IN, CELL_RADIUS } from "./hospital.js?v=22";
import { EYE } from "./world.js?v=8";
import { clampStick, walkFromStick } from "./joystick-core.js?v=1";
import { segmentClear, headYaw } from "./vr-math.js?v=1";

const WALK_SPEED = 3.2;
const DOOR_PASS = 3.0; // metres from a door's centre: the opening's half width plus the wall margin. Reach the wall here and you go through.
const RUN_SPEED = 7;
const LOOK_SPEED = 1.9; // rad/s, arrow keys
const MAX_PITCH = Math.PI / 2 - 0.05;
const NUDGE_LOOK = 0.12; // a single arrow tap turns this much
const HEAD_JUMP = 1; // m: a head that moved further than this in one frame was recentred, not stepped (followHead)

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
  // VR carrier (setXr). three.js draws the headset's view from the camera's PARENT times the
  // headset's own pose, so in VR the camera rides this instead of the pitch carrier: it walks and
  // turns with the walker but never pitches (the wearer's head does, so the flat view's look pitch
  // never tilts the world), and it stands at the feet when the pose starts at the floor
  // (local-floor), or the headset's own height would land on top of EYE.
  const xrRig = new THREE.Object3D();
  xrRig.name = "xr-rig";
  yawObj.add(xrRig);
  let inXr = false;
  const headQ = new THREE.Quaternion();

  const keys = new Set();
  let stick = { x: 0, z: 0 }; // the touch joystick: x right, z back; used while no W A S D key is down
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
  function passableOutdoors(x, z) {
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

  function passable(x, z) {
    if (state.floor === null) return passableOutdoors(x, z);
    if (hospital.walkable(state.floor, x, z)) return true;
    if (state.floor === "1") {
      // Through the opening and out; or, pressed right up against the door
      // (its wall margin can stop you half a metre short), out anyway.
      const door = hospital.entranceNear(x, z, DOOR_RADIUS_IN);
      if (door && (!hospital.contains(state.floor, x, z) || Math.hypot(door.x - x, door.z - z) <= DOOR_PASS)) return { door, inward: false };
    }
    return { blocked: "wall" };
  }

  /**
   * Step through a door: the walker is placed just past it on the other side,
   * on ground that is clear there. Coming out, "clear" must mean clear of every
   * footprint: a spot inside one (the Main Entrance's overlaps the Pavilion's)
   * turns the next step into walking back in, and the walker loops in and out.
   */
  function passDoor({ door, inward }) {
    const isClear = inward ? (x, z) => hospital.walkable("1", x, z) : (x, z) => passableOutdoors(x, z) === true;
    const spot = hospital.throughDoor(door, inward, isClear);
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
  // Every pointer that goes down on the view is a LOOK pointer, tracked by its pointerId with its
  // last position, so two fingers never trade deltas (one slot used to take both, and the view
  // jumped between them). Only the first one down turns the view; when it lifts, the next takes
  // over from where it is. The joystick's finger is on its own element, so it never reaches these
  // listeners, and lifting it never ends a look.
  const lookers = new Map(); // pointerId -> [x, y], or null to re-measure; in the order they went down
  function onPointerDown(e) {
    if (e.button !== 0 || state.mode !== "walk") return;
    lookers.set(e.pointerId, [e.clientX, e.clientY]);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer (synthetic) */ }
  }
  function onPointerMove(e) {
    if (!lookers.has(e.pointerId)) return;
    const last = lookers.get(e.pointerId);
    lookers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!last || state.mode !== "walk") return; // only re-measured, or the overhead view has the camera
    if (lookers.keys().next().value !== e.pointerId) return; // a later finger waits its turn
    look(-(e.clientX - last[0]) * 0.005, -(e.clientY - last[1]) * 0.005);
  }
  const endDrag = (e) => { lookers.delete(e.pointerId); };
  // Turning the screen moves every finger's clientX/Y without the finger moving: each one's next
  // move only re-measures where it is, so the view does not jump by the difference.
  const remeasure = () => { for (const id of lookers.keys()) lookers.set(id, null); };
  // A lift lost while the page was in the background would leave a first finger holding the look
  // for ever: forget them all, and stop, as the keys do.
  const forget = () => { keys.clear(); lookers.clear(); stick = { x: 0, z: 0 }; };
  const onHidden = () => { if (document.hidden) forget(); };
  const listeners = [
    [window, "keydown", onKeyDown],
    [window, "keyup", onKeyUp],
    [window, "blur", forget],
    [window, "resize", remeasure],
    [document, "visibilitychange", onHidden],
    [canvas, "pointerdown", onPointerDown],
    [canvas, "pointermove", onPointerMove],
    [canvas, "pointerup", endDrag],
    [canvas, "pointercancel", endDrag],
    [canvas, "lostpointercapture", endDrag],
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
    (inXr ? xrRig : pitchObj).add(world.camera);
    world.camera.position.set(0, 0, 0);
    world.camera.rotation.set(0, 0, 0);
    world.camera.scale.set(1, 1, 1); // three.js decomposes the headset's pose into it, too
  }
  attachCamera();

  /** Enter (on) or leave VR. floorOffset: how far below the eye the headset's pose starts: EYE
   *  for a local-floor space (poses measure up from the floor), 0 for plain local (they start at
   *  the head). Walking, the camera moves onto the rig or back onto the pitch carrier; overhead,
   *  the overhead view (vr.js) decides where it goes. */
  function setXr(on, floorOffset = EYE) {
    inXr = !!on;
    xrRig.position.set(0, inXr ? -(Number.isFinite(floorOffset) ? floorOffset : EYE) : 0, 0);
    keys.clear();
    lookers.clear();
    stick = { x: 0, z: 0 };
    if (state.mode === "walk") attachCamera();
  }

  function setMode(mode) {
    state.mode = mode;
    keys.clear();
    stick = { x: 0, z: 0 };
    if (mode === "walk") attachCamera();
  }

  const floorY = () => (state.floor === null ? 0 : hospital.floor(state.floor).y);

  /** VR, walking: the walker stands where the HEAD is, not at the play space's origin, so a
   *  wearer who steps about the room (room scale) meets walls and fences as the sticks do, a hop
   *  is planned from the head and a snap turn pivots about it. Each frame the head's step since
   *  the last one (its place in the walker's frame, from the pose three.js put on the camera at
   *  the last draw) moves the walker through the same collision as walking, and the rig moves
   *  the other way by the whole of it, so the head sits on the walker again. Blocked, the world
   *  holds the wearer back: a head never goes through a wall. A jump of more than HEAD_JUMP (the
   *  headset recentred) moves nothing: the view just centres on the walker. So does the first
   *  pose after the camera comes onto the rig (entering VR, or back from the overhead view): until
   *  a draw puts the headset's pose on it, the camera sits at the rig's origin, and the gap
   *  between that and the pose is no step either. */
  let onRig = false;      // the camera was on the rig at the last update
  let recentre = false;   // the next pose is taken as where the head is, not as a step
  let rigFrame;           // the renderer's draw count when the camera came onto the rig
  const drawCount = () => world.renderer?.info?.render?.frame;
  function followHead() {
    if (!onRig) { onRig = true; recentre = true; rigFrame = drawCount(); }
    if (rigFrame !== undefined && drawCount() === rigFrame) return; // not drawn on the rig yet
    const c = world.camera.position;
    const hx = xrRig.position.x + c.x;
    const hz = xrRig.position.z + c.z;
    const d = Math.hypot(hx, hz);
    if (!recentre && d > 1e-4 && d <= HEAD_JUMP) {
      const yaw = yawObj.rotation.y, cs = Math.cos(yaw), sn = Math.sin(yaw);
      tryMove(yawObj.position.x + cs * hx + sn * hz, yawObj.position.z - sn * hx + cs * hz);
    }
    recentre = false;
    xrRig.position.x = -c.x;
    xrRig.position.z = -c.z;
  }

  /** Where a VR hop toward (x, z) would go: { x, z } on ground the walker could walk to in a
   *  straight line, or { door } when the first thing in the way is a Medical Center door (the hop
   *  goes through it, as walking would: a hand has no stick to walk in with); null when a wall, a
   *  fence or a building is in the way, overhead, or behind a modal. */
  function hopPlan(x, z) {
    if (state.mode !== "walk" || state.paused || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const { x: x0, z: z0 } = yawObj.position;
    let door = null;
    const clear = segmentClear(x0, z0, x, z, (px, pz) => {
      const p = passable(px, pz);
      if (p === true) return true;
      if (p && p.door) door = p; // segmentClear stops at the first point that is not clear
      return false;
    });
    if (clear) return { x, z };
    return door ? { door } : null;
  }
  /** Could a VR hop go to (x, z)? Never into a building or a fenced site, never through a wall or
   *  across a fence; through a door, yes. */
  const canStandAt = (x, z) => !!hopPlan(x, z);

  /** Put the walker somewhere outdoors (the Start select). */
  api.teleport = (x, z) => { yawObj.position.x = x; yawObj.position.z = z; };
  /** Pull the walker toward (x, z) through normal collision — walls and fences still hold. */
  api.nudgeTo = (x, z) => { tryMove(x, z); };
  api.leaveBuilding = () => { if (state.floor !== null) { state.floor = null; hospital.setInside(null); } };
  api.setMode = setMode;
  // ---- VR (vr.js, vr-controls.js) ----
  /** The VR carrier: the camera rides it in VR while walking, with the controllers' rays and the
   *  menu, in the headset's own frame. */
  api.xrRig = xrRig;
  api.setXr = setXr;
  api.inXr = () => inXr;
  /** The way the walker faces, for words like "ahead" and "left" (What's ahead, Sonar): on the
   *  flat screen the walker's heading; in VR the head's, since a wearer turns the head and the
   *  body all the time and the body's heading is only where the play space points. */
  api.facingYaw = () => (inXr ? headYaw(world.camera.getWorldQuaternion(headQ)) : yawObj.rotation.y);
  /** Turn the walker by dYaw (rad, + = left): the right stick's snap or smooth turn. */
  api.turn = (dYaw) => { if (Number.isFinite(dYaw) && dYaw && !state.paused) yawObj.rotation.y += dYaw; };
  api.canStandAt = canStandAt;
  /** VR's point-and-hop: stand at (x, z), or go through the door on the way, if hopPlan allows;
   *  true if moved. */
  api.hop = (x, z) => {
    const plan = hopPlan(x, z);
    if (!plan) return false;
    if (plan.door) passDoor(plan.door); // in or out, announced as walking through it is
    else {
      yawObj.position.x = plan.x;
      yawObj.position.z = plan.z;
    }
    yawObj.position.y = floorY() + EYE;
    return true;
  };
  /** The height of the floor under the walker's feet (m): where the hop ray meets the ground. */
  api.groundY = () => floorY();
  api.goToFloor = goToFloor;
  api.useNearby = useNearby;
  /** A modal is up: drop held keys and ignore the world until resumed. */
  api.pause = () => { keys.clear(); stick = { x: 0, z: 0 }; state.moving = false; state.paused = true; };
  /** The touch joystick: x right, z back (forward is -z), length <= 1; (0, 0) stops. Further is
   *  faster, running near the rim. Used only while no W A S D key is down, so the keys keep
   *  their behaviour; ignored in the overhead view and while a modal is up. */
  api.setMoveInput = (x, z) => { stick = state.mode === "walk" && !state.paused ? clampStick(x, z) : { x: 0, z: 0 }; };
  api.resume = () => { state.paused = false; };
  api.nearby = () => nearby;
  api.dispose = () => {
    for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
  };
  api.update = (dt) => {
    if (inXr && state.mode === "walk" && world.camera.parent === xrRig) followHead(); // a body moves even behind a modal
    else onRig = false;
    if (state.mode !== "walk" || state.paused) return;
    if (keys.has("ArrowLeft")) look(LOOK_SPEED * dt, 0);
    if (keys.has("ArrowRight")) look(-LOOK_SPEED * dt, 0);
    if (keys.has("ArrowUp")) look(0, LOOK_SPEED * dt * 0.7);
    if (keys.has("ArrowDown")) look(0, -LOOK_SPEED * dt * 0.7);

    const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let speed = run ? RUN_SPEED : WALK_SPEED;
    let fwd = 0;
    let strafe = 0;
    if (keys.has("KeyW")) fwd += 1;
    if (keys.has("KeyS")) fwd -= 1;
    if (keys.has("KeyA")) strafe -= 1;
    if (keys.has("KeyD")) strafe += 1;
    const keyed = ["KeyW", "KeyA", "KeyS", "KeyD"].some((k) => keys.has(k));
    const pushed = keyed ? null : walkFromStick(stick.x, stick.z, WALK_SPEED, RUN_SPEED);
    if (pushed) ({ fwd, strafe, speed } = pushed);
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
