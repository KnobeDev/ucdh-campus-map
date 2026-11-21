// The overhead ("helicopter") camera's decisions, kept pure (no three.js, no DOM) so node
// can test them: tools/test/overhead.test.js. 3d/overhead.js does the input and the camera.

// Below this the view is nearly level and one pixel of drag would cover a runaway stretch of ground.
const MIN_FORESHORTEN = 0.3;

/**
 * What a pointer drag does: pan the map, as a drag does on the 2D map (and as a finger can,
 * with no Shift key to hold), or with Shift held, turn and tilt the view around its spot.
 * @param {{ shiftKey: boolean }} e  the pointer event
 * @returns {"pan" | "orbit"}
 */
export const dragAction = (e) => (e.shiftKey ? "orbit" : "pan");

/**
 * A drag of (dx, dy) screen pixels as a pan in the camera's ground frame, so the ground under
 * the pointer follows the pointer: metres per pixel at the spot the camera looks at, with the
 * up/down direction stretched by the tilt (a tilted view shows more ground per pixel).
 * @returns {[number, number]} [right, away] in metres, for the camera's own right and away
 */
export function dragToPan({ dx, dy, dist, fovDeg, viewHeight, pitch }) {
  const mpp = (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(viewHeight, 1);
  const fore = Math.max(Math.sin(pitch), MIN_FORESHORTEN);
  return [-dx * mpp, (dy * mpp) / fore];
}

/**
 * The camera's right and away, in metres, as a move in the world (x east, z south). The camera
 * sits at heading `yaw` from its spot, so at yaw 0 it looks north and "away" is -z.
 * @returns {[number, number]} [dx, dz]
 */
export function panToWorld(yaw, right, away) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [right * c - away * s, -right * s - away * c];
}

/**
 * The spot held inside the world's box (data.meta.world: the 3D world, not the 2D map's frame).
 * A value that isn't a finite number keeps the previous one, so one bad input can't lose the view.
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} box
 * @param {[number, number]} prev  the spot before this move
 * @returns {[number, number]}
 */
export function clampToBox(x, z, box, prev) {
  const fx = Number.isFinite(x) ? x : prev[0];
  const fz = Number.isFinite(z) ? z : prev[1];
  return [Math.min(Math.max(fx, box.minX), box.maxX), Math.min(Math.max(fz, box.minZ), box.maxZ)];
}

// The overhead view's keys. W A S D move the view due north, west, south, east on the ground,
// whichever way the camera faces; the arrows tilt it (up, down) and turn it (left, right);
// Q E turn, PgUp PgDn tilt and + − zoom as before. A key with Ctrl, Alt or Meta held is the
// browser's or the system's (Ctrl+W closes the tab), never a move.
const KEY_ACTIONS = {
  w: "north", W: "north", KeyW: "north",
  s: "south", S: "south", KeyS: "south",
  a: "west", A: "west", KeyA: "west",
  d: "east", D: "east", KeyD: "east",
  ArrowUp: "tiltUp", ArrowDown: "tiltDown", ArrowLeft: "ccw", ArrowRight: "cw",
  PageUp: "tiltUp", PageDown: "tiltDown",
  q: "ccw", Q: "ccw", KeyQ: "ccw", e: "cw", E: "cw", KeyE: "cw",
  "+": "in", "=": "in", Equal: "in", NumpadAdd: "in",
  "-": "out", _: "out", Minus: "out", NumpadSubtract: "out",
};

/**
 * One key event as one action name, by e.key or else e.code (some keyboards and automation
 * send only one of them), or null when the key does nothing here.
 * @param {{key?: string, code?: string, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean}} e
 */
export function keyAction(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return (Object.hasOwn(KEY_ACTIONS, e.key) && KEY_ACTIONS[e.key]) || (Object.hasOwn(KEY_ACTIONS, e.code) && KEY_ACTIONS[e.code]) || null;
}

/** A compass move of `step` metres as a move on the ground (+x east, +z south), or null. */
export function compassStep(action, step) {
  if (action === "north") return [0, -step];
  if (action === "south") return [0, step];
  if (action === "east") return [step, 0];
  if (action === "west") return [-step, 0];
  return null;
}

// ---- the heading strip and the pitch scale (owner, 2026-11-21) -------------------------
// The camera sits at focus + dist*(cos p sin yaw, sin p, cos p cos yaw) and looks at the focus,
// so it faces (-sin yaw, -cos yaw) in (x east, z south): north at yaw 0. Its look-down angle is
// the internal pitch, so the pitch as shown is 90 minus it: 0 straight down at the map, 90 level
// with the horizon, 45 halfway, which is where the view opens.

const DEG = 180 / Math.PI;
/** The tilt's range, in radians above the ground: shown as about 81 down to just above 0. Never
 *  exactly straight down (pi/2), where the camera's lookAt has no "up" to work with. */
export const TILT_MIN = 0.15;
export const TILT_MAX = 1.56;
/** The heading, in degrees clockwise from north, [0, 360): the way the camera faces. */
export const headingDeg = (yaw) => (((-yaw * DEG) % 360) + 360) % 360;
/** The pitch as shown: 0 looking straight down, 90 level. */
export const displayPitch = (pitch) => 90 - pitch * DEG;
/** The internal pitch for a shown one. */
export const pitchForDisplay = (deg) => (90 - deg) / DEG;
/** Where the overhead view opens: shown pitch 45. */
export const OPEN_PITCH = pitchForDisplay(45);

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const POINT_NAMES = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
/** The nearest of the eight compass points to a heading in degrees. */
export const compassPoint = (deg) => POINTS[((Math.round(deg / 45) % 8) + 8) % 8];

/** The compass point's name for a heading in degrees: "north", "north-east", ... */
export const compassName = (deg) => POINT_NAMES[compassPoint(deg)];

/** What the gauges show, in whole degrees (a heading of 359.7 shows as 0, never 360). */
export function gaugeReadout(yaw, pitch) {
  const heading = Math.round(headingDeg(yaw)) % 360;
  return { heading, point: compassPoint(heading), pitch: Math.round(displayPitch(pitch)) };
}

/** "1 degree", "45 degrees": a count of degrees in words that read right. */
export const degreesWord = (n) => `${n} degree${n === 1 ? "" : "s"}`;

/** The same in one sentence, for the H key and the page's text copy. */
export function gaugeText(yaw, pitch) {
  const r = gaugeReadout(yaw, pitch);
  const how = r.pitch <= 0 ? "looking straight down"
    : r.pitch >= 90 ? "level with the horizon"
    : r.pitch === 45 ? "halfway between straight down and level"
    : r.pitch < 45 ? "toward straight down" : "toward the horizon";
  return `Facing ${POINT_NAMES[r.point]}, heading ${degreesWord(r.heading)}. Pitch ${degreesWord(r.pitch)}, ${how}.`;
}

/** A heading tick's label: N E S W at the quarters, the number every 30, else none. */
export function tickLabel(deg) {
  if (deg % 90 === 0) return POINTS[(deg / 45) % 8];
  return deg % 30 === 0 ? String(deg) : null;
}

/**
 * The heading strip's ticks within `halfSpan` degrees either side of `heading`, left to right.
 * @returns {{ deg: number, offset: number, label: string | null }[]} offset in degrees from the middle
 */
export function headingTicks(heading, halfSpan, step) {
  const out = [];
  for (let k = Math.ceil((heading - halfSpan) / step) * step; k <= heading + halfSpan; k += step) {
    const deg = ((k % 360) + 360) % 360;
    out.push({ deg, offset: k - heading, label: tickLabel(deg) });
  }
  return out;
}

/** The pitch scale's ticks, 0 (straight down, top) to 90 (level, bottom). */
export function pitchTicks(step) {
  const out = [];
  for (let deg = 0; deg <= 90; deg += step) out.push({ deg, frac: deg / 90, label: String(deg) });
  return out;
}

// The free stretches of [lo, hi] once each [a, b] is taken out.
function freeSpans(lo, hi, taken) {
  let spans = [[lo, hi]];
  for (const [a, b] of taken) {
    spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(a, e)], [Math.max(b, s), e]]).filter(([x, y]) => y > x));
  }
  return spans;
}
// A length of `want` (at least `min`) inside the spans, as near `mid` as they allow, or null.
function fit(spans, want, min, mid) {
  const ok = spans.filter(([s, e]) => e - s >= min);
  if (!ok.length) return null;
  const best = ok.find(([s, e]) => e - s >= want && s <= mid && mid <= e) || ok.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const len = Math.min(want, best[1] - best[0]);
  return { start: Math.min(Math.max(mid - len / 2, best[0]), best[1] - len), len };
}
const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

/**
 * Where the heading strip (along the top, centred) and the pitch scale (against the right side,
 * else the left) go, clear of every obstacle (the panel, the inset map, the code chip) by `gap`.
 * The strip drops below an obstacle only when the top is full, and never past mid-screen; a gauge
 * with no room is left out (null), never drawn over the menu.
 * @param {{ vw: number, vh: number, gap: number, obstacles: {left: number, top: number, right: number, bottom: number}[],
 *   strip: { w: number, h: number, minW: number }, scale: { w: number, h: number, minH: number } }} o
 * @returns {{ strip: {left: number, top: number, width: number} | null, scale: {left: number, top: number, height: number} | null }}
 */
export function placeGauges({ vw, vh, gap, obstacles, strip, scale }) {
  let s = null;
  const rows = [gap, ...obstacles.map((o) => o.bottom + gap)].filter((y) => y <= vh / 2 && y + strip.h <= vh - gap).sort((a, b) => a - b);
  for (const y of rows) {
    const taken = obstacles.filter((o) => overlaps(y - gap, y + strip.h + gap, o.top, o.bottom)).map((o) => [o.left - gap, o.right + gap]);
    const f = fit(freeSpans(gap, vw - gap, taken), strip.w, strip.minW, vw / 2);
    if (f) { s = { left: f.start, top: y, width: f.len }; break; }
  }
  const blocks = s ? [...obstacles, { left: s.left, top: s.top, right: s.left + s.width, bottom: s.top + strip.h }] : obstacles;
  // Against the right side, else the left; only when both are full, beside an obstacle instead.
  const column = (lefts) => {
    let best = null;
    for (const left of lefts) {
      if (left < gap || left + scale.w > vw - gap) continue;
      const taken = blocks.filter((o) => overlaps(left - gap, left + scale.w + gap, o.left, o.right)).map((o) => [o.top - gap, o.bottom + gap]);
      const f = fit(freeSpans(gap, vh - gap, taken), scale.h, scale.minH, vh / 2);
      if (f && (!best || f.len > best.height)) best = { left, top: f.start, height: f.len };
    }
    return best;
  };
  const beside = obstacles.flatMap((o) => [o.left - gap - scale.w, o.right + gap])
    .sort((a, b) => Math.min(a, vw - a - scale.w) - Math.min(b, vw - b - scale.w) || b - a); // nearest a side first
  return { strip: s, scale: column([vw - gap - scale.w, gap]) || column(beside) };
}
