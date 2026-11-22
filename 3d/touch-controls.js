// Moving on a touch screen: an on-screen joystick at the bottom left (owner, 2026-11-21: "We
// need a joystick for mobile view in order to move around the map"). Ported from the UC Davis
// campus map's touch-controls.js and fitted to this map. Walking, it walks the way you face
// (forward, back, sideways) through the walker's own moves, so footprints, walls, doors, fences
// and floors all still hold; another finger anywhere else on the 3D view looks around at the
// same time (player.js). Overhead, it moves the map: up is the way the camera faces.
//
// The joystick is pointer-only and aria-hidden: keyboard users already move with W A S D, and a
// screen reader has nothing to operate here. It listens to Pointer Events only and belongs to
// ONE pointer at a time, the finger that pressed it: every move, release and cancel is filtered
// by that pointerId, so the look finger never steers it and lifting it never ends a look.
// Pressing anywhere inside the circle sets the direction at once; it is analog (further is
// faster, joystick-core.js) with a small dead zone for a resting thumb. Releasing it, or a
// pointercancel, puts the knob back and stops. A dialog opening (the floor picker), the page
// hiding, the screen turning, or the view changing lets go of it, as those stop the keys: the
// thumb lifts and presses again to move on.
//
// Placing: it steps around what shares the lower edge with it (the inset map, wherever it is,
// the code chip and the group panel) and around the side panel's top row (its Menu button row,
// the part that is always there, open or closed), and it publishes the room it takes
// (--joy-reserve, --joy-reserve-w) so the rest of the open panel stops above it and the
// captions sit above or beside it, as they do for the inset map. The panel may shrink to that
// top row while there is a joystick (--hud-floor; it scrolls), so with large text on a short
// screen it no longer grows down over the joystick. Where even that leaves no room, the circle
// shrinks (to MIN_SIZE), and where there is still none it waits out of sight until there is
// (closing the panel, moving the inset map): partly covered, a thumb would land on the panel.
// Nothing it is measured against depends on where it is, so placing never feeds back on itself.
// The gauges treat it as an obstacle (gauges.js). It sits under the panel and the inset map
// (z-index, styles.css), so it never covers a control. It never moves under a thumb: a move it
// put off is made once the thumb lifts.
import { isTouchScreen, joystickVector, fitJoystick, joystickSizes } from "./joystick-core.js?v=1";

const GAP = 12;     // px between the joystick and anything it steps around, as the inset map's
const EDGE = 12;    // px kept from the screen's right edge, as from its left
const MIN_TOP = 64; // never climb into the menu button's row at the top
const MIN_SIZE = 96; // px: the smallest circle it shrinks to for room (the knob is then 38 px)
const OBSTACLES = ["minimap", "code-chip", "conn-panel"];

/**
 * @param onMove    (x, z) -> the stick: x right, z down the screen, length <= 1; (0, 0) stops
 * @param obstacles () -> elements it never overlaps (hidden or absent ones are skipped)
 * @param panel     () -> the side panel, whose top row it keeps clear of and whose rest makes room
 * @param blocked   () -> true while a dialog is up: it lets go, and takes no press
 */
export function createJoystick({ doc = globalThis.document, onMove, obstacles = () => [], panel = () => null, blocked = () => false }) {
  const base = doc.createElement("div");
  base.id = "joystick";
  base.className = "joystick";
  base.setAttribute("aria-hidden", "true");
  const knob = doc.createElement("div");
  knob.className = "joystick-knob";
  base.append(knob);
  doc.body.append(base);

  let owner = null;  // the pointerId that pressed it, or null
  let centre = null; // { x, y, radius }, measured when pressed
  const keepClear = createKeepClear(doc, base, { obstacles, panel, held: () => owner !== null });

  function steer(e) {
    if (blocked()) { release(); return; }
    const v = joystickVector(e.clientX - centre.x, e.clientY - centre.y, centre.radius);
    knob.style.transform = `translate(${v.knobX}px, ${v.knobY}px)`;
    onMove(v.x, v.z);
  }
  function release() {
    owner = null;
    centre = null;
    knob.style.transform = "";
    onMove(0, 0);
    keepClear.settle(); // a move it put off while the thumb was on it
  }
  base.addEventListener("pointerdown", (e) => {
    if (owner !== null || e.button !== 0 || blocked()) return; // a second finger on the circle is ignored
    e.preventDefault(); // no text selection, no emulated mouse
    owner = e.pointerId;
    const r = base.getBoundingClientRect();
    centre = { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: Math.max(24, (r.width - knob.offsetWidth) / 2) };
    try { base.setPointerCapture(e.pointerId); } catch { /* not an active pointer (synthetic) */ }
    steer(e);
  });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === owner) steer(e); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    base.addEventListener(type, (e) => { if (e.pointerId === owner) release(); });
  }
  base.addEventListener("contextmenu", (e) => e.preventDefault()); // the long-press menu
  const letGo = () => { if (owner !== null) release(); };
  const onVisibility = () => { if (doc.hidden) letGo(); };
  const win = doc.defaultView;
  // A turned screen moves the circle from under the thumb: steering on from the centre measured
  // at the press would run at full speed in whatever direction the thumb now lies.
  const listeners = [[win, "blur", letGo], [doc, "visibilitychange", onVisibility], [win, "resize", letGo], [win, "orientationchange", letGo]];
  for (const [t, type, fn] of listeners) t.addEventListener(type, fn);
  const dialogs = new MutationObserver(() => { if (blocked()) letGo(); });
  dialogs.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["open", "hidden"] });

  return {
    element: base,
    layout: keepClear.schedule,
    letGo,
    get active() { return owner !== null; },
    /** Stop and take it away: every listener and observer it added goes with it. */
    dispose() {
      letGo();
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      dialogs.disconnect();
      keepClear.dispose();
      base.remove();
    },
  };
}

/** Re-place the joystick whenever an obstacle shows, hides, moves corner or changes size, or the
 *  screen turns; never under a thumb (the knob would part from the centre measured at the press),
 *  but once it lifts (settle). */
function createKeepClear(doc, base, { obstacles, panel, held }) {
  const root = doc.documentElement;
  const win = doc.defaultView;
  const sized = new ResizeObserver(() => schedule());
  const watched = new Set();
  let queued = false;
  let putOff = false;
  let frame = 0;
  const watch = (el) => { if (!watched.has(el)) { watched.add(el); sized.observe(el); } };
  function rectsOf(elements) {
    const rects = [];
    for (const el of elements) {
      if (!el) continue;
      watch(el);
      if (el.hidden || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return rects;
  }
  /** The side panel's top row as an obstacle, padding and border included: open or closed, it is
   *  always there, and its height is its own (never the room the joystick leaves the panel), so
   *  measuring it never feeds back. Null when there is no panel showing. */
  function panelTop() {
    const hud = panel();
    const row = hud?.querySelector(".hud-top");
    if (!hud || !row || hud.hidden || !hud.isConnected) return null;
    watch(hud);
    const r = hud.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = win.getComputedStyle(hud);
    // offsetTop is from the panel's padding edge and ignores its scroll; add the border above it
    const head = parseFloat(cs.borderTopWidth) + row.offsetTop + row.offsetHeight
      + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    return { head: Math.ceil(head), rect: { left: r.left, top: r.top, right: r.right, bottom: r.top + head } };
  }
  function move({ lift, shift, size }) {
    base.style.setProperty("--joy-lift", `${lift}px`);
    base.style.setProperty("--joy-shift", `${shift}px`);
    if (size) base.style.setProperty("--joy-size", `${size}px`);
    else base.style.removeProperty("--joy-size");
  }
  function layout() {
    queued = false;
    frame = 0;
    putOff = held();
    if (putOff) return;
    base.removeAttribute("data-no-room");
    move({ lift: 0, shift: 0, size: 0 });
    const home = base.getBoundingClientRect();
    const top = panelTop();
    // the open panel may shrink to its top row and scroll, but never below it
    if (top) root.style.setProperty("--hud-floor", `${top.head}px`);
    const p = fitJoystick({ home, sizes: joystickSizes(Math.round(home.width), MIN_SIZE),
      obstacles: [...rectsOf(obstacles()), ...(top ? [top.rect] : [])], vw: win.innerWidth, gap: GAP, minTop: MIN_TOP, edge: EDGE });
    if (!p) {
      // No room anywhere: out of sight, and taking none, until something moves (this re-runs).
      base.setAttribute("data-no-room", "");
      root.style.setProperty("--joy-reserve", "0px");
      root.style.setProperty("--joy-reserve-w", "0px");
      return;
    }
    move({ ...p, size: p.size === Math.round(home.width) ? 0 : p.size });
    // The room it takes, measured as the inset map's is (minimap.js reserve): from the screen's
    // bottom to its top, and from the screen's left to its right.
    const r = base.getBoundingClientRect();
    root.style.setProperty("--joy-reserve", `${Math.max(0, Math.ceil(win.innerHeight - r.top))}px`);
    root.style.setProperty("--joy-reserve-w", `${Math.ceil(r.right)}px`);
  }
  function schedule() {
    if (queued) return;
    queued = true;
    frame = win.requestAnimationFrame(layout);
  }
  // hidden and class carry every show, hide and corner move (and the panel opening and closing);
  // style writes (the knob) and text changes are not watched, so moving never re-runs this, and
  // neither does data-no-room
  const shown = new MutationObserver(schedule);
  shown.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  win.addEventListener("resize", schedule);
  layout();
  return {
    schedule,
    settle() { if (putOff) schedule(); },
    dispose() {
      if (frame) win.cancelAnimationFrame(frame);
      queued = false;
      shown.disconnect();
      sized.disconnect();
      win.removeEventListener("resize", schedule);
      for (const name of ["--joy-reserve", "--joy-reserve-w", "--hud-floor"]) root.style.removeProperty(name);
    },
  };
}

/**
 * On a touch screen (decided once, at boot), the joystick: it drives the walker while walking and
 * the overhead camera in the overhead view; each ignores it in the other view. Null elsewhere.
 */
export function wireTouch({ player, overhead, walker, win = globalThis }) {
  if (!isTouchScreen(win)) return null;
  const $ = (id) => document.getElementById(id);
  const joystick = createJoystick({
    onMove: (x, z) => { player.setMoveInput(x, z); overhead.setMoveInput(x, z); },
    obstacles: () => OBSTACLES.map($),
    panel: () => $("hud"),
    blocked: () => !!document.querySelector("dialog[open]") || player.state.paused,
  });
  walker.onViewChange = () => joystick.letGo();
  const dispose = joystick.dispose;
  joystick.dispose = () => { walker.onViewChange = null; dispose(); };
  return joystick;
}
