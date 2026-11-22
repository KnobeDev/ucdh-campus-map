// VR (WebXR) controls. A headset never shows the page, so in VR the side panel, the keys, the
// touch joystick and the floor picker's dialog are all out of reach. Ported from the UC Davis
// campus map's vr-controls.js (owner, 2026-11-21: "We need a VR view as well, similar to the
// campus VR capabilities") and fitted to this map. The controllers:
//   - left stick: walk where you look (a held grip runs); overhead it flies over the map
//   - right stick: turn (30° snaps, or smooth: the menu's Turning row); overhead, up/down climbs
//     and sinks. One controller alone (the other asleep): its stick walks forward and back and
//     turns sideways, so one hand still turns without turning the body
//   - point at the ground nearby (a ring shows where) and pull the trigger, or pinch, to hop
//     there: the comfortable way to move, and the only one a hand has (it has no stick). The
//     walker's own rules decide where (player.canStandAt): never into a building or a fenced
//     site, never through a wall, never onto a door
//   - B or Y shows or hides the menu; with the menu hidden, a trigger or pinch let go while
//     pointing anywhere but the ground shows it
//   - point at a menu row (it is read out) and pull the trigger (a hand: pinch) to choose it
// The menu stands in front of you and walks and turns with you (it hangs on the rig the camera
// rides). Its rows are the page's own buttons, named by vr.js: choosing one clicks that button,
// so every switch keeps its one behaviour, its saved state and its announcement, and the row's
// words and On/Off are read off the button each frame. While the floor picker is open its floor
// buttons are the rows. A headset has no screen reader and no live region its wearer can hear,
// so the menu speaks for itself: the row a ray lands on, and what a choice did. The sums are in
// vr-math.js.
import * as THREE from "./lib/three.module.js";
import {
  BUTTON, MENU, stickOf, deadZone, isPressed, headYaw, stickWalk, createSnapTurn, smoothTurn,
  createEdges, menuHeight, menuRowTop, menuItemAt, menuPose, buttonItem,
  assignSticks, rowWords, resultWords, groundHit,
} from "./vr-math.js?v=1";

const TURN_KEY = "ucdh3d-vr-turn";     // "snap" (default) or "smooth", remembered
const PANEL_W = 0.56;                  // m: the menu's width in the world, 0.9 m from the eye
const RAY_MENU = 3, RAY_IDLE = 0.25;   // m: a ray reaches out while the menu is up, a stub otherwise
const SHARP = 2;                       // canvas pixels per layout pixel: crisp on a Quest 3's panel
// navy rows under white words (10.6:1); the row a ray points at turns gold under navy words
// (11.4:1) and gains a ▶, so it never shows by colour alone
const INK = { panel: "#0b1f3a", row: "#1d3f6e", text: "#ffffff", hint: "#cfe0f5", hot: "#ffd166", hotText: "#0b1f3a" };
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** The remembered turning, read and written defensively: storage can be absent or throw. */
const turnPref = {
  get() { try { return globalThis.localStorage?.getItem(TURN_KEY); } catch { return null; } },
  set(v) { try { globalThis.localStorage?.setItem(TURN_KEY, v); } catch { /* not remembered */ } },
};

/**
 * @param menu   () => { kind, title, hint, items, own }: what the menu shows now. Each item is
 *               { button: element | "<id>", label?, state?, run?, done? } (clicks that button and
 *               reads its words and aria-pressed, unless label or state says otherwise; a missing
 *               or hidden button is left out) or { label, state?, run, done? }. done() is what a
 *               choice says in place of the before-and-after comparison. own: false leaves out
 *               the menu's own rows (Turning, Hear the controls, Exit VR, Close menu).
 *               `kind` names the set: when it changes, a choice's before and after are not
 *               compared (they are different lists).
 * @param player canStandAt(x, z), hop(x, z), groundY(): the walker's ground and its rules
 * @param drive  { overhead(), walk(x, z), turn(dYaw), climb(dir, dt) }: where the sticks go
 * @param exit   ends the VR session (the menu's Exit VR row)
 * @param speak  says a line now, cutting off the last (the menu by ear)
 * @param help   the controls in words (the menu's Hear the controls row)
 * @param onClose the menu was closed (B, Y, Close menu): vr.js cancels an open floor picker
 */
export function createVrControls({ world, player, rig, menu, drive, exit = () => {}, speak = () => {}, help = "", onClose = () => {}, doc = globalThis.document }) {
  const xr = world.renderer.xr;
  let turnMode = turnPref.get() === "smooth" ? "smooth" : "snap";
  let snap = createSnapTurn();
  let edge = createEdges();

  // ---- the menu panel: a canvas on a plane, drawn over everything, so a wall or a building
  // between you and it never hides it: no depth test, and last in the see-through pass ----
  const canvas = doc.createElement("canvas");
  canvas.width = MENU.width * SHARP;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
  );
  panel.name = "vr-menu";
  panel.renderOrder = 1e4;
  panel.rotation.order = "YXZ"; // turn to the head, then lean back
  panel.visible = false;
  rig.add(panel);

  let open = false;
  let rows = [];    // what the open menu shows: { label, state, run }
  let kind = "";    // which list the rows are (menu().kind)
  let heading = { title: "", hint: "" };
  let hot = [];     // the rows the rays point at (each controller lights its own)
  let drawn = "";   // what the canvas shows now, so it is redrawn only when that changes

  const ownRows = [
    { label: () => "Turning", state: () => (turnMode === "snap" ? "Snap 30°" : "Smooth"), run: () => setTurn(turnMode === "snap" ? "smooth" : "snap") },
    { label: () => "Hear the controls", run: () => speak(help) },
    { label: () => "Exit VR", run: () => exit() },
    { label: () => "Close menu", run: () => closeMenu(true) },
  ];
  function readRows() {
    const m = menu();
    kind = m.kind;
    heading = { title: m.title, hint: m.hint };
    const out = [];
    for (const it of m.items) {
      if (it.button) {
        const btn = typeof it.button === "string" ? doc.getElementById(it.button) : it.button;
        const r = buttonItem(btn);
        if (r) out.push({ label: it.label ?? r.label, state: it.state ?? r.state, run: it.run || (() => btn.click()), done: it.done });
      } else out.push({ label: typeof it.label === "function" ? it.label() : it.label, state: it.state ?? "", run: it.run, done: it.done });
    }
    if (m.own !== false) for (const it of ownRows) out.push({ label: it.label(), state: it.state?.() ?? "", run: it.run });
    return out;
  }

  function draw() {
    const n = rows.length, h = menuHeight(n);
    if (canvas.height !== h * SHARP) {
      canvas.height = h * SHARP; // resizing clears the context's transform too
      panel.scale.set(PANEL_W, (PANEL_W * h) / MENU.width, 1);
      // three.js allocates a texture's storage once, at its first size: a taller or shorter list
      // (the floor picker's, a row that showed) would not upload into it, and the old menu would
      // stay on the panel. Dropped here, it is allocated again at the new size when next drawn.
      texture.dispose();
    }
    ctx.setTransform(SHARP, 0, 0, SHARP, 0, 0); // draw in layout pixels (vr-math.js MENU)
    const x = MENU.pad, w = MENU.width - 2 * MENU.pad;
    ctx.fillStyle = INK.panel;
    ctx.fillRect(0, 0, MENU.width, h);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = INK.text;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(heading.title, x, MENU.pad + 28, w);
    ctx.fillStyle = INK.hint;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(heading.hint, x, MENU.pad + 70, w);
    rows.forEach((r, i) => {
      const y = menuRowTop(i), mid = y + MENU.row / 2, isHot = hot.includes(i);
      ctx.fillStyle = isHot ? INK.hot : INK.row;
      ctx.fillRect(x, y, w, MENU.row);
      if (isHot) {
        ctx.strokeStyle = INK.hotText;
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 4, y + 4, w - 8, MENU.row - 8);
      }
      ctx.fillStyle = isHot ? INK.hotText : INK.text;
      ctx.font = `bold 28px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(`${isHot ? "▶ " : ""}${r.label}`, x + 20, mid, r.state ? w * 0.62 : w - 40);
      if (r.state) {
        ctx.textAlign = "right";
        ctx.fillText(r.state, x + w - 20, mid, w * 0.32);
      }
    });
    texture.needsUpdate = true;
  }
  // Re-read the rows (a switch flipped, Overhead view became Walk, the floor picker opened) and
  // redraw if anything shows differently. Cheap enough for every frame the menu is up.
  function refresh() {
    rows = readRows();
    hot = hot.filter((i) => i < rows.length);
    const now = `${hot.join()}\n${heading.title}|${heading.hint}\n${rows.map((r) => `${r.label}|${r.state}`).join("\n")}`;
    if (now !== drawn) { drawn = now; draw(); }
  }

  function openMenu(say = true) {
    // in front of the head, on the head's turn: both read in the rig's frame, where three.js
    // left the headset's latest pose on the camera
    const cam = world.camera;
    const p = menuPose(cam.position, headYaw(cam.quaternion));
    panel.position.set(p.x, p.y, p.z);
    panel.rotation.set(p.tilt, p.yaw, 0);
    open = true;
    hot = [];
    panel.visible = true;
    for (const c of hands) { c.hot = -1; c.ground = null; c.ring.visible = false; }
    refresh();
    if (say) speak("Menu open. Point at a row to hear it.");
  }
  function closeMenu(say = false) {
    const was = open;
    open = false;
    hot = [];
    panel.visible = false;
    for (const c of hands) c.hot = -1;
    if (was) onClose();
    if (say && was) speak("Menu closed.");
  }
  function setTurn(mode) {
    turnMode = mode === "smooth" ? "smooth" : "snap";
    snap = createSnapTurn();
    turnPref.set(turnMode);
  }

  // ---- the controllers' rays (three.js's target-ray spaces, hung on the rig like the head) ----
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const rayMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const hands = [0, 1].map((i) => {
    const target = xr.getController(i);
    const ray = new THREE.Line(rayGeo, rayMat);
    ray.renderOrder = 1e4;
    ray.scale.z = RAY_IDLE;
    ray.visible = false;
    target.add(ray);
    rig.add(target);
    const ring = makeRing();
    world.scene.add(ring); // on the ground, in the world: the hop's landing place
    const c = { target, ray, ring, source: null, hot: -1, ground: null };
    // a gaze "ray" comes from the eye itself: drawn, it would be a dot in the middle of the view
    target.addEventListener("connected", (e) => { c.source = e.data || null; ray.visible = e.data?.targetRayMode !== "gaze"; });
    target.addEventListener("disconnected", () => { c.source = null; c.hot = -1; c.ground = null; ray.visible = false; ring.visible = false; });
    // "select" comes when the trigger (or pinch) is LET GO, so pressing and then pointing away
    // chooses nothing (SC 2.5.2's up-event, in a headset)
    target.addEventListener("select", () => onSelect(c));
    return c;
  });

  // the landing ring: white inside a navy rim, so it shows on the grass and on a pale path
  function makeRing() {
    const flat = (inner, outer, color) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1e4;
      return m;
    };
    const g = new THREE.Group();
    g.name = "vr-hop";
    g.add(flat(0.3, 0.38, 0x0b1f3a), flat(0.2, 0.3, 0xffffff));
    g.visible = false;
    return g;
  }

  const raycaster = new THREE.Raycaster();
  const turnOnly = new THREE.Matrix4();
  function aim(c) {
    c.target.updateWorldMatrix(true, false);
    const { origin, direction } = raycaster.ray;
    origin.setFromMatrixPosition(c.target.matrixWorld);
    direction.set(0, 0, -1).applyMatrix4(turnOnly.extractRotation(c.target.matrixWorld)).normalize();
    // the panel's world place as of now: a row that moved the rig (Overhead view) moved it since
    // the last frame drew it
    if (open) panel.updateWorldMatrix(true, false);
    const hit = open ? raycaster.intersectObject(panel, false)[0] : null;
    const was = c.hot;
    c.hot = hit?.uv ? menuItemAt(hit.uv.x, hit.uv.y, rows.length) : -1;
    c.ray.scale.z = hit ? hit.distance : open ? RAY_MENU : RAY_IDLE;
    if (c.hot >= 0 && c.hot !== was) {
      pulse(c.source); // a tick in the hand as the ray finds a row
      speak(rowWords(rows[c.hot]));
    }
    // with the menu down, where on the ground a hop would land (only where one could)
    const g = open ? null : groundHit(origin, direction, player.groundY());
    c.ground = g && player.canStandAt(g.x, g.z) ? g : null;
    c.ring.visible = !!c.ground;
    if (c.ground) c.ring.position.set(c.ground.x, player.groundY() + 0.03, c.ground.z);
  }
  function pulse(source) {
    try { source?.gamepad?.hapticActuators?.[0]?.pulse?.(0.25, 20)?.catch?.(() => {}); } catch { /* no rumble here */ }
  }

  function onSelect(c) {
    if (!xr.isPresenting) return;
    aim(c); // where it points as the trigger or pinch is let go
    if (!open) {
      if (c.ground && player.hop(c.ground.x, c.ground.z)) { pulse(c.source); c.ring.visible = false; return; }
      openMenu();
      return;
    }
    const i = c.hot, row = rows[i];
    if (!row) return;
    pulse(c.source);
    const before = { label: row.label, state: row.state, kind };
    row.run();
    if (!open) return; // Close menu, Exit VR, a floor chosen: they say their own words
    refresh();
    if (kind !== before.kind) return; // a different list now (the floor picker opened): vr.js says it
    const said = row.done ? row.done() : resultWords(before, rows[i]);
    if (said) speak(said);
  }

  return {
    get open() { return open; },
    get turnMode() { return turnMode; },
    /** What the menu shows now (for the local build's test handle). */
    rows: () => rows.map(({ label, state }) => ({ label, state })),
    get heading() { return { ...heading }; },
    panel,
    openMenu,
    closeMenu,
    /** The camera moved to another rig (walking ↔ overhead): the controllers and the menu go
     *  with it, keeping their poses in the headset's frame. */
    setRig(next) {
      if (!next || next === rig) return;
      rig = next;
      rig.add(panel);
      for (const c of hands) rig.add(c.target);
    },
    /** A VR session began: forget every held button, start with the menu down. */
    start() {
      snap = createSnapTurn();
      edge = createEdges();
      closeMenu();
    },
    /** The session ended: stop walking, put the menu and the landing rings away. */
    end() {
      closeMenu();
      for (const c of hands) { c.ground = null; c.ring.visible = false; c.ray.visible = false; }
      drive.walk(0, 0);
    },
    /** Every frame while presenting, before player.update: the sticks set this frame's walk. */
    update(dt) {
      const session = xr.getSession?.();
      if (!session || !xr.isPresenting) return;
      let left = null, right = null, run = false, toggle = false;
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue; // a hand: it points and pinches, it has no stick
        const stick = deadZone(stickOf(gp));
        if (src.handedness === "right") right = stick; else left = stick;
        if (isPressed(gp, BUTTON.squeeze)) run = true;
        if (edge(`${src.handedness}:b`, isPressed(gp, BUTTON.b))) toggle = true;
      }
      if (toggle) { if (open) closeMenu(true); else openMenu(); }
      const { move, steer } = assignSticks(left, right);
      const overhead = drive.overhead();
      const w = stickWalk(move, headYaw(world.camera.quaternion), { run, overhead });
      drive.walk(w.x, w.z, dt);
      drive.turn(turnMode === "smooth" ? smoothTurn(steer.x, dt) : snap(steer.x));
      if (overhead) drive.climb(-steer.y, dt); // stick up climbs
      for (const c of hands) if (c.source) aim(c);
      if (!open) return;
      hot = [...new Set(hands.filter((c) => c.source && c.hot >= 0).map((c) => c.hot))].sort((a, b) => a - b);
      refresh();
    },
  };
}
