// The walker in VR (3d/player.js setXr, turn, canStandAt, hop), in node, on a made-up campus.
// three.js places the headset's view at the camera's PARENT times the headset's own pose, so what
// carries the camera in VR decides where the wearer stands and which way is level:
//   - local-floor poses start at the floor, so the carrier stands at the feet, not the eye;
//   - the flat view's look pitch must not tilt the world;
//   - a hop obeys the walker's own rules: no building, no fenced site, no wall, no door.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const D3 = (f) => pathToFileURL(path.join(__dirname, "..", "..", "3d", f)).href;
const close = (actual, expected, eps = 1e-9, what = "") =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what} ${actual} ≈ ${expected}`);

// player.js listens on window and document; node has neither
const stubTarget = () => ({ addEventListener() {}, removeEventListener() {} });
globalThis.window ??= stubTarget();
globalThis.document ??= { ...stubTarget(), activeElement: null, querySelector: () => null, hidden: false };

const square = (x0, z0, s) => [[x0, z0], [x0 + s, z0], [x0 + s, z0 + s], [x0, z0 + s]];
/** A 20 m solid building with its south-west corner at (20, -10), and a fenced site at
 *  (-30..-20, -10..10). The walker starts at the origin, facing north (-z). */
async function makePlayer() {
  const THREE = await import(D3("lib/three.module.js"));
  const { createPlayer } = await import(D3("player.js"));
  const ring = square(20, -10, 20);
  const solid = { solid: true, bbox: [20, -10, 40, 10], ring, building: { code: "T" } };
  // the Medical Center, (-10..10, 30..50), its door in the middle of its south face
  const mc = { solid: true, bbox: [-10, 30, 10, 50], ring: square(-10, 30, 20), building: { code: "MC", renderedBy: "hospital" } };
  const index = { cells: new Map([["0,-1", [solid]], ["0,0", [solid, mc]], ["-1,0", [mc]]]) };
  const door = { x: 0, z: 30, label: "Test Entrance" };
  const floors = { 1: { y: 0 }, 2: { y: 4.5 } };
  const hospital = {
    entranceNear: (x, z, r) => (Math.hypot(x - door.x, z - door.z) <= r ? door : null),
    throughDoor: (d, inward) => (inward ? { x: 0, z: 33 } : { x: 0, z: 27 }),
    floor: (id) => floors[id],
    walkable: (id, x) => x < 10 && x > -50, // Level 2: a wall at x = 10
    contains: () => true,
    setInside() {},
    elevatorNear: () => null,
    stairsNear: () => null,
    stairsOn: () => ({ x: 0, z: 0 }),
    elevatorOn: () => ({ x: 0, z: 0 }),
    exitSpot: (id, x, z) => ({ x, z: z - 1 }),
  };
  const fence = { name: "Test site" };
  const zoneAt = (x, z) => (x >= -30 && x <= -20 && z >= -10 && z <= 10 ? fence : null);
  const world = {
    camera: new THREE.PerspectiveCamera(70, 1.5, 0.3, 4000),
    scene: new THREE.Scene(),
    renderer: { domElement: { ...stubTarget(), setPointerCapture() {} } },
  };
  const player = createPlayer(world, index, hospital, { x: 0, z: 0, yaw: 0 }, zoneAt);
  return { THREE, world, player };
}

test("vr walker: the camera rides a rig at the feet in VR, and goes back on the pitch carrier after", async () => {
  const { THREE, world, player } = await makePlayer();
  const flatParent = world.camera.parent;
  player.update(0.016);
  player.setXr(true, 1.7);
  player.update(0.016);
  assert.strictEqual(world.camera.parent, player.xrRig, "the camera rides the VR rig");
  const v = new THREE.Vector3();
  player.xrRig.updateWorldMatrix(true, false);
  close(player.xrRig.getWorldPosition(v).y, 0, 1e-9, "the rig stands at the feet on the ground");
  player.setXr(false);
  assert.strictEqual(world.camera.parent, flatParent, "back on the pitch carrier");
  player.setXr(true, 0); // plain local: poses start at the head
  player.xrRig.updateWorldMatrix(true, false);
  close(player.xrRig.getWorldPosition(v).y, 1.7, 1e-9, "the rig at the eye when poses start there");
  player.setXr(false);
});

test("vr walker: the flat view's look pitch never tilts the world in VR", async () => {
  const { THREE, world, player } = await makePlayer();
  world.camera.parent.rotation.x = -0.9; // the flat view looking steeply down
  player.setXr(true, 1.7);
  world.camera.updateWorldMatrix(true, false);
  const q = new THREE.Quaternion();
  world.camera.getWorldQuaternion(q);
  close(new THREE.Euler().setFromQuaternion(q, "YXZ").x, 0, 1e-9, "level: the headset alone tilts it");
  player.setXr(false);
  assert.strictEqual(world.camera.parent.rotation.x, -0.9, "and the flat view keeps its pitch for when it returns");
});

test("vr walker: a hop lands on open ground, never in or past a building or a fenced site", async () => {
  const { player } = await makePlayer();
  assert.strictEqual(player.canStandAt(0, -8), true, "open ground ahead");
  assert.strictEqual(player.hop(0, -8), true);
  close(player.object.position.z, -8, 1e-9, "hopped there");
  close(player.object.position.y, 1.7, 1e-9, "eye over the ground");
  assert.strictEqual(player.canStandAt(25, -8), false, "into the building");
  assert.strictEqual(player.hop(25, -8), false);
  close(player.object.position.x, 0, 1e-9, "a refused hop does not move");
  player.teleport(15, 0);
  assert.strictEqual(player.canStandAt(15, 0), true);
  player.teleport(-15, 0);
  assert.strictEqual(player.canStandAt(-25, 0), false, "into the fenced site");
  assert.strictEqual(player.canStandAt(-29, 9), false, "or anywhere on it");
  player.teleport(-18, 12);
  assert.strictEqual(player.canStandAt(-32, -12), false, "across a corner of it");
  assert.strictEqual(player.canStandAt(NaN, 0), false);
});

test("vr walker: a hop at the Medical Center's door goes through it, as walking does", async () => {
  const { player } = await makePlayer();
  player.teleport(0, 20);
  let entered = null;
  player.onEnter = (d) => { entered = d; };
  assert.strictEqual(player.canStandAt(0, 32), true, "the door is the first thing in the way");
  assert.strictEqual(player.hop(0, 32), true);
  assert.strictEqual(player.state.floor, "1", "inside, on Level 1");
  assert.deepStrictEqual([player.object.position.x, player.object.position.z], [0, 33], "set down past the door");
  assert.strictEqual(entered?.label, "Test Entrance", "and announced as walking in is");
  player.leaveBuilding();
  player.teleport(-20, 20);
  assert.strictEqual(player.canStandAt(-8, 35), false, "the Medical Center's wall away from a door is a wall");
});

test("vr walker: indoors a hop stays on the floor's walkable side of a wall; overhead and paused there is none", async () => {
  const { player } = await makePlayer();
  player.goToFloor("2", "stairs");
  assert.strictEqual(player.state.floor, "2");
  close(player.groundY(), 4.5, 1e-9, "the hop ray meets Level 2's floor");
  assert.strictEqual(player.canStandAt(5, -3), true, "this side of the wall");
  assert.strictEqual(player.canStandAt(12, -3), false, "through the wall at x = 10");
  assert.strictEqual(player.hop(5, -3), true);
  close(player.object.position.y, 4.5 + 1.7, 1e-9, "on Level 2");
  player.pause();
  assert.strictEqual(player.canStandAt(4, -3), false, "behind the floor picker: no hop");
  player.resume();
  player.setMode("over");
  assert.strictEqual(player.canStandAt(4, -3), false, "overhead: no hop");
});

test("vr walker: turn turns the walker by the snap, not behind a modal", async () => {
  const { player } = await makePlayer();
  player.turn(-Math.PI / 6);
  close(player.object.rotation.y, -Math.PI / 6, 1e-12);
  player.turn(NaN);
  close(player.object.rotation.y, -Math.PI / 6, 1e-12, "garbage is ignored");
  player.pause();
  player.turn(1);
  close(player.object.rotation.y, -Math.PI / 6, 1e-12, "paused: held");
});

test("vr walker: words like ahead and left follow the head in VR, the walker's heading on the flat screen", async () => {
  const { THREE, world, player } = await makePlayer();
  player.object.rotation.y = 0.3;
  close(player.facingYaw(), 0.3, 1e-9, "flat: the walker's heading");
  player.setXr(true, 1.7);
  world.camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // the head turned 90° left
  close(player.facingYaw(), 0.3 + Math.PI / 2, 1e-9, "VR: the body's heading plus the head's");
  world.camera.quaternion.setFromEuler(new THREE.Euler(-0.8, -0.4, 0.2, "YXZ")); // looking down and right, tilted
  close(player.facingYaw(), 0.3 - 0.4, 1e-9, "only the head's turn about the vertical counts");
  player.setXr(false);
  close(player.facingYaw(), 0.3, 1e-9, "flat again");
});

test("vr walker: stepping about the room moves the walker with the head, and a wall holds the head back", async () => {
  const { THREE, world, player } = await makePlayer();
  player.setXr(true, 1.7);
  player.object.rotation.y = -Math.PI / 2; // facing east, at the building whose west wall is x = 20
  const head = new THREE.Vector3();
  /** The headset's pose (in the rig's frame) as three.js leaves it on the camera after a draw. */
  const pose = (x, z) => {
    world.camera.position.set(x, 1.6, z);
    player.update(0.016);
    world.camera.updateWorldMatrix(true, false);
    return world.camera.getWorldPosition(head);
  };
  pose(0, 0);
  close(player.object.position.x, 0, 1e-9, "a head at the play space's middle moves nobody");
  let h = pose(0, -0.5); // half a metre forward in the room
  close(player.object.position.x, 0.5, 1e-9, "the walker stepped east with the head");
  close(player.object.position.z, 0, 1e-9);
  close(h.x, player.object.position.x, 1e-9, "the head stands on the walker");
  close(h.z, player.object.position.z, 1e-9);
  for (let k = 1; k <= 250; k++) h = pose(0, -0.5 - 0.1 * k); // 25 m on in the room: the wall is 19.5 m on
  assert.ok(player.object.position.x < 20 && player.object.position.x > 19.5, `stopped at the wall: ${player.object.position.x}`);
  close(h.x, player.object.position.x, 1e-9, "the head was held back with the walker");
  const held = player.object.position.x;
  h = pose(0, 0); // 25 m back in one frame: the headset recentred
  close(player.object.position.x, held, 1e-9, "a jump of the pose moves nobody");
  close(h.x, held, 1e-9, "the view centres on the walker");
  // to the overhead view and back: the camera comes onto the rig at its origin; the gap to the
  // head's pose is not a step
  const stood = { x: player.object.position.x, z: player.object.position.z };
  player.setMode("over");
  player.update(0.016);
  player.setMode("walk");
  world.camera.position.set(0, 0, 0);
  pose(0.4, -0.3); // the first draw back on the rig puts the pose on the camera
  close(player.object.position.x, stood.x, 1e-9, "no step taken coming back on the rig");
  close(player.object.position.z, stood.z, 1e-9);
  h = pose(0.4, -0.2); // and the next 10 cm, back from the wall, is a step again
  close(player.object.position.x, stood.x - 0.1, 1e-9, "a step back west");
  player.setXr(false);
  close(player.xrRig.position.x, 0, 1e-9, "leaving VR, the rig's offset goes");
  close(player.xrRig.position.z, 0, 1e-9);
});
