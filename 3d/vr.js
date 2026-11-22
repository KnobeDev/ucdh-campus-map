// VR view (WebXR immersive-vr), ported from the UC Davis campus map (owner, 2026-11-21: "We need
// a VR view as well, similar to the campus VR capabilities"). The Enter VR button shows only where
// the browser says a headset session can start; it toggles to Exit VR.
//
// In VR the camera rides a rig, because three.js draws the headset's view from the camera's
// PARENT times the headset's own pose:
//   - walking, the walker's xrRig (player.js), at the feet, so the wearer's own height is the
//     eye height and the flat view's look pitch never tilts the world;
//   - overhead, a flying rig of its own, level, high over what the overhead view looked at (the
//     flat overhead view is an orbit camera, which a headset cannot carry). The left stick flies,
//     the right stick turns, climbs and sinks.
// The controllers and the menu inside the headset are vr-controls.js. The menu's rows are the
// page's own buttons; while the floor picker (elevator-ui.js, an HTML dialog a headset never
// shows) is open, its floor buttons are the rows, so a floor is chosen exactly as on the page.
// Leaving VR puts the flat view back as it was: the camera on its carrier with its own lens,
// the overhead view where it was.
import * as THREE from "./lib/three.module.js";
import { EYE } from "./world.js?v=8";
import { FLY, flyStep } from "./vr-math.js?v=1";
import { createVrControls } from "./vr-controls.js?v=1";

// The page's buttons the menu carries, in order. Hidden ones (Use elevator away from a lift,
// Nearest elevator outdoors, Stop guiding with no route) are left out until they show. This page's
// buttons name what they do next (Overhead view, Dark mode) or say their state in their words
// (Voice on), so the menu does not add On/Off from aria-pressed to them: Voice is a row of its
// own name with the state beside it, and the view says what VR's sticks do there.
const MENU_ITEMS = (overheadNow) => [
  { button: "view-btn", state: "", done: () => (overheadNow()
    ? "Overhead view. The left stick flies where you look; the right stick turns, climbs and sinks."
    : "Walking.") },
  { button: "use-btn" },
  { button: "elev-btn" },
  { button: "wf-stop" },
  { button: "identify-btn" },
  { button: "sonar-btn" },
  { button: "voice-btn", label: "Voice" },
  { button: "theme-btn", state: "" },
];
const HELP = "The left stick walks where you look; hold a grip to run. The right stick turns. "
  + "With one controller, its stick walks forward and back, and turns. "
  + "Point at the ground nearby and pull the trigger, or pinch, to hop there. "
  + "B or Y opens the menu, or pinch while pointing up. Point at a row to hear it, then pull the trigger. "
  + "At an elevator or stairs, the menu's Use row lists the floors. "
  + "In the overhead view the left stick flies, and the right stick turns, climbs and sinks.";

/**
 * @param say     the page's announcement (#status, and the voice when it is on)
 * @param speak   the voice alone, cutting off the last line: the menu by ear
 * @param joystick the touch joystick, or null: it lets go on the way in
 */
export function wireVr({ world, player, overhead, joystick = null, say, speak, doc = globalThis.document, nav = globalThis.navigator }) {
  const $ = (id) => doc.getElementById(id);
  const btn = $("vr-btn");
  const picker = $("floor-dialog");
  const xr = world.renderer.xr;
  xr.enabled = true;
  const cam = world.camera;

  // Leaving a session, three.js puts back the canvas size it had going in, after every "end"
  // listener has run (this one comes after): the window may have changed since (a phone turned,
  // a desktop window resized), and the page's resize handler stood aside meanwhile (world.js).
  xr.addEventListener("sessionend", () => {
    if (innerWidth > 0 && innerHeight > 0) {
      world.renderer.setSize(innerWidth, innerHeight);
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
    }
  });

  const flyRig = new THREE.Object3D();
  flyRig.name = "xr-fly-rig";
  world.scene.add(flyRig);

  let session = null;
  let starting = false;  // a second press while the first is still asking: ignored
  let presented = false; // the session got as far as drawing: only then is leaving it news
  let lens = null;       // the flat camera's own lens, put back on the way out
  let lastMode = null;   // the view the rig was last placed for
  let wasPicker = false;

  const endVr = () => { session?.end().catch(() => { /* already ending */ }); };
  const presenting = () => !!session && xr.isPresenting;
  const overheadNow = () => player.state.mode === "over";

  const controls = createVrControls({
    world, player, rig: player.xrRig, help: HELP, speak, exit: endVr, doc,
    menu: readMenu,
    drive: {
      overhead: overheadNow,
      walk(x, z, dt) {
        if (!overheadNow()) { player.setMoveInput(x, z); return; }
        if (x || z) setFly(flyStep(flyAt(), { x, z }, 0, dt, world.box));
      },
      turn(d) {
        if (!d) return;
        if (overheadNow()) flyRig.rotation.y += d; else player.turn(d);
      },
      climb(dir, dt) { if (dir) setFly(flyStep(flyAt(), null, dir, dt, world.box)); },
    },
    // closing the menu while the floor picker is up chooses nothing: Stay on this floor
    onClose: () => { if (picker?.open) picker.close("cancel"); },
  });

  function readMenu() {
    if (picker?.open) {
      const items = [...picker.querySelectorAll("#floor-dialog-list button")].map((b) => ({
        button: b,
        state: b.disabled ? "You are here" : b.classList.contains("preferred") ? "Your route" : "",
        run: b.disabled ? () => speak(`You are on ${b.textContent}.`) : undefined,
      }));
      items.push({ button: "floor-dialog-cancel" });
      return { kind: "floors", title: $("floor-dialog-title")?.textContent || "Floors", hint: "Point at a floor, then pull the trigger.", items, own: false };
    }
    return { kind: "main", title: "Campus menu", hint: "Point, then pull the trigger. B or Y hides it.", items: MENU_ITEMS(overheadNow) };
  }

  const flyAt = () => ({ x: flyRig.position.x, y: flyRig.position.y, z: flyRig.position.z, yaw: flyRig.rotation.y });
  const setFly = (p) => flyRig.position.set(p.x, p.y, p.z);

  /** Put the camera, the controllers and the menu on the rig for the current view. Overhead
   *  starts level over the overhead view's focus, facing its way. */
  function placeRig() {
    const mode = player.state.mode;
    if (mode !== lastMode && mode === "over") {
      flyRig.position.set(overhead.focus.x, FLY.start, overhead.focus.z);
      flyRig.rotation.set(0, overhead.yaw, 0);
    }
    lastMode = mode;
    const rig = mode === "over" ? flyRig : player.xrRig;
    if (cam.parent !== rig) {
      rig.add(cam);
      cam.position.set(0, 0, 0);
      cam.rotation.set(0, 0, 0);
    }
    controls.setRig(rig);
  }

  /** The floor picker opened or closed while in VR: the menu shows its floors, then goes. */
  function followPicker() {
    const now = !!picker?.open;
    if (now === wasPicker) return;
    wasPicker = now;
    if (now) {
      if (!controls.open) controls.openMenu(false);
      const hint = $("floor-dialog-hint")?.textContent || "";
      speak(`${$("floor-dialog-title")?.textContent || "Floors"}. ${hint ? `${hint} ` : ""}Point at a floor to hear it.`);
      return;
    }
    const menuWasUp = controls.open;
    controls.closeMenu(false);
    // a floor chosen says where it took you (main.js); a cancel from the menu says it stayed
    if (menuWasUp && picker.returnValue === "cancel") speak("Stayed on this floor.");
  }

  function render() {
    const inside = !!session;
    btn.querySelector(".btn-txt").textContent = inside ? "Exit VR" : "Enter VR";
  }

  /** The session `s` ended (or never got going): once per session, the flat view comes back. */
  function onEnd(s) {
    if (s !== session) return; // already handled, or an older session's late "end"
    const was = presented;
    session = null;
    presented = false;
    controls.end();
    player.setXr(false);
    if (lens) {
      cam.fov = lens.fov;
      cam.zoom = lens.zoom;
      cam.near = lens.near;
      cam.far = lens.far;
      lens = null;
    }
    cam.scale.set(1, 1, 1);
    if (innerWidth > 0 && innerHeight > 0) cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    // overhead, the flat view's orbit camera takes it back exactly where it was
    if (player.state.mode === "over") overhead.setEnabled(true);
    lastMode = null;
    wasPicker = !!picker?.open;
    render();
    if (was) say("Left VR. Back on the flat screen.");
  }

  async function supported() {
    try { return !!(nav.xr && await nav.xr.isSessionSupported("immersive-vr")); } catch { return false; }
  }

  async function start() {
    if (!(await supported())) {
      say("VR isn't available on this device or browser. On a headset, open this page in the headset's own browser and try again.");
      return;
    }
    let s = null;
    try {
      // hand-tracking: a headset whose controllers are put down still points and pinches
      s = await nav.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
      session = s;
      s.addEventListener("end", () => onEnd(s));
      // local-floor poses start at the floor and plain local ones at the head; three.js asks for
      // local-floor unless told otherwise, and fails outright where it was not granted
      let floor = true;
      try { await s.requestReferenceSpace("local-floor"); } catch { floor = false; }
      xr.setReferenceSpaceType(floor ? "local-floor" : "local");
      lens = { fov: cam.fov, zoom: cam.zoom, near: cam.near, far: cam.far };
      joystick?.letGo();
      player.setXr(true, floor ? EYE : 0); // before the first headset frame, so it starts at the feet
      await xr.setSession(s);
      lastMode = null;
      wasPicker = false;
      placeRig();
      controls.start();
      presented = true;
      render();
      say("VR mode. The left stick walks where you look, the right stick turns, and B or Y opens the menu. "
        + "Its Hear the controls row tells you the rest.");
    } catch (err) {
      say(`Couldn't start VR: ${err?.message || err}`);
      // a session left running with nothing drawn would hold the wearer in an empty void; one that
      // will never say "end" (it failed before it began) is put away here
      endVr();
      if (s && !xr.isPresenting) onEnd(s);
    }
  }

  btn.addEventListener("click", async () => {
    if (session) { endVr(); return; }
    if (starting) return;
    starting = true;
    try { await start(); } finally { starting = false; }
  });

  // Shown only where a session can start; a headset plugged in later shows it then.
  const check = async () => { btn.hidden = !(await supported()) && !session; };
  check();
  nav.xr?.addEventListener?.("devicechange", check);
  render();

  return {
    controls,
    flyRig,
    get presenting() { return presenting(); },
    /** Every frame, before player.update: in VR the controllers set this frame's walk and turn. */
    update(dt) {
      if (!presenting()) return;
      placeRig();
      followPicker();
      controls.update(dt);
    },
    /** Every frame, just before drawing: a view change since update (a menu row, a key) may
     *  have handed the camera to the flat overhead view; in VR it goes back on a rig. */
    beforeRender() {
      if (presenting()) placeRig();
    },
    end: endVr,
  };
}
