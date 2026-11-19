// The inset map's and the side panel's decisions, with no three.js and no DOM,
// so they can be tested in node exactly as they run in the browser.
//
// The data frame is ENU metres: +x east, +z south (world.js). The inset is
// north-up, so a world point maps to the screen with no rotation at all:
// right is east, down is south.

/** Metres shown across the inset's shorter side, closest first. */
export const ZOOM_LEVELS = [120, 250, 500, 1000, 2000];
export const DEFAULT_ZOOM = 1;
/** Below this viewport width the side panel starts collapsed. */
export const NARROW_PX = 700;
export const CORNERS = ["bottom-left", "top-right"];

/**
 * World <-> inset pixels for a view centred on (cx, cz) showing `across`
 * metres over the shorter side of a width × height inset.
 */
export function viewTransform({ cx, cz, across, width, height }) {
  const scale = Math.min(width, height) / across;
  const ox = width / 2;
  const oy = height / 2;
  return {
    scale,
    toScreen: (x, z) => [ox + (x - cx) * scale, oy + (z - cz) * scale],
    toWorld: (px, py) => ({ x: cx + (px - ox) / scale, z: cz + (py - oy) / scale }),
  };
}

/** The next zoom level in `dir` (-1 closer, +1 wider), clamped; junk becomes the default. */
export function stepZoom(level, dir) {
  const i = Number.isFinite(level) ? Math.round(level) : DEFAULT_ZOOM;
  return Math.min(Math.max(i + dir, 0), ZOOM_LEVELS.length - 1);
}

/**
 * Canvas rotation for the "you" arrow, drawn pointing up at angle 0.
 * The walker faces (-sin yaw, -cos yaw) in (x, z), which is (right, down) on
 * the inset; rotate(a) turns "up" into (sin a, -cos a), so a = -yaw.
 */
export const headingAngle = (yaw) => -yaw;

export const normalizeCorner = (v) => (CORNERS.includes(v) ? v : CORNERS[0]);
export const otherCorner = (c) => (normalizeCorner(c) === CORNERS[0] ? CORNERS[1] : CORNERS[0]);

/** A saved choice wins; with none, the panel is open unless the screen is narrow. */
export function initialPanelOpen(saved, viewportWidth) {
  if (saved === "open") return true;
  if (saved === "closed") return false;
  return viewportWidth >= NARROW_PX;
}

/** 0x002855 -> "#002855": theme.js palettes are three.js hex numbers. */
export const cssHex = (n) => `#${(n >>> 0).toString(16).padStart(6, "0")}`;

/** localStorage that never throws (private mode, blocked storage): a preference just won't persist. */
export const prefs = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* not persisted */ }
  },
};

/** The shortest canvas worth showing; below this the map moves or goes. */
export const MIN_CANVAS_PX = 96;

/**
 * Where the inset map actually goes and how tall its canvas can be, so that
 * it never covers the side panel's top row (the Menu button) at any viewport
 * (SC 2.1.1: the button must stay reachable; SC 1.4.10: no lost content at
 * 400% zoom or on a phone held sideways).
 *
 * The preferred corner wins whenever a canvas of at least MIN_CANVAS_PX fits
 * there; otherwise the other corner, if the map fits; otherwise nothing fits
 * (`fits: false`) and the caller hides the map. The saved preference is never
 * changed here: `moved` says the map is somewhere else for now.
 *
 * All lengths in CSS px. `rowBottom` is the lowest edge the lower-left map
 * must clear (the panel's top row, or the whole panel when collapsed);
 * `hudRight` is the panel's right edge, which a top-right map must clear;
 * `chromeH` is the map panel's height minus its canvas; `panelW` its width.
 */
export function placeMinimap({
  preferred, viewportW, viewportH, rowBottom, hudRight, chromeH, panelW, canvasW, gap = 12, edge = 12,
}) {
  const roomTopRight = hudRight + gap <= viewportW - edge - panelW ? viewportH - 2 * edge - chromeH : 0;
  const room = {
    "bottom-left": viewportH - rowBottom - gap - edge - chromeH,
    "top-right": roomTopRight,
  };
  const first = normalizeCorner(preferred);
  for (const corner of [first, otherCorner(first)]) {
    if (room[corner] < MIN_CANVAS_PX) continue;
    return { corner, canvasH: Math.min(canvasW, Math.floor(room[corner])), fits: true, moved: corner !== first };
  }
  return { corner: first, canvasH: 0, fits: false, moved: false };
}
