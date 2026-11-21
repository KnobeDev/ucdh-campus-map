// Inset 2D map: a north-up top view of the campus in a corner of the screen,
// lower left by default, movable to the top right, and hideable. It follows
// the walker (or the overhead camera's focus in overhead view) and shows which
// way you face, the Medical Center floor you are on, active construction and
// the guided route.
//
// It is a visual aid. Everything it shows is also available as text: the
// location line, the route steps, the construction list, identify and sonar.
// So the canvas is one labelled image, and its single pointer action (click a
// spot to see it from overhead) has a keyboard equivalent in the overhead
// view's own panning (SC 2.1.1). It fires on click, i.e. on release (SC 2.5.2).
import { PALETTES } from "./theme.js?v=6";
import { AREA_KIND } from "./ground.js?v=8";
import { wallSegments } from "./interior-core.js?v=2";
import {
  viewTransform, headingAngle, ZOOM_LEVELS, DEFAULT_ZOOM, stepZoom,
  normalizeCorner, otherCorner, cssHex, prefs,
} from "./minimap-core.js?v=1";

const DRAW_EVERY = 1 / 15; // seconds: smooth for a follow-map, and cheap
const GAP = 12; // px from the screen edge, matching the code chip
const KEYS = { corner: "ucdh3d-minimap-corner", zoom: "ucdh3d-minimap-zoom", shown: "ucdh3d-minimap-shown" };
const STROKE_KINDS = ["street", "service", "cycle", "foot", "steps"]; // drawn in order: walkways on top

// Marks that are not surfaces. Each keeps 3:1 against the lawn and buildings
// under it in its theme (SC 1.4.11), helped by a contrasting edge.
const MARKS = {
  light: {
    you: "#002855", youEdge: "#ffffff", route: "#ffbf00", routeEdge: "#16232f",
    place: "#5b2a86", placeEdge: "#ffffff", // a building shown as a signpost: its own ink and shape, never mistaken for "you"
    floor: "#002855", floorFill: "rgba(0, 40, 85, 0.18)", fence: "#8a3600", fenceEdge: "rgba(255, 255, 255, 0.9)",
    view: "#16232f", outline: "rgba(22, 35, 47, 0.45)", northBg: "rgba(255, 255, 255, 0.9)", north: "#16232f",
  },
  dark: {
    you: "#9cc4ff", youEdge: "#0c1220", route: "#ffbf00", routeEdge: "#000000",
    place: "#e9b3ff", placeEdge: "#0c1220",
    floor: "#ffd75e", floorFill: "rgba(255, 215, 94, 0.2)", fence: "#ff8c1a", fenceEdge: "rgba(12, 18, 32, 0.9)",
    view: "#edf1f5", outline: "rgba(0, 0, 0, 0.6)", northBg: "rgba(16, 22, 32, 0.9)", north: "#edf1f5",
  },
};
// The construction cover is hazard yellow with black hatching in both themes,
// matching the striped cover in the scene; the hatch is drawn in screen pixels
// so it stays readable whether the map shows 150 m or 1.5 km.
const HAZARD = { fill: "rgba(255, 212, 0, 0.72)", hatch: "rgba(20, 20, 20, 0.85)", pitch: 7, width: 2 };

const $ = (id) => document.getElementById(id);

function addRing(path, ring) {
  if (!ring || ring.length < 3) return;
  path.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
  path.closePath();
}

function addLine(path, pts) {
  if (!pts || pts.length < 2) return;
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
}

/** World-space Path2D buckets, built once: one fill or stroke call per style per frame. */
function buildLayers(data, construction) {
  const areas = { green: new Path2D(), pitch: new Path2D(), parking: new Path2D() };
  for (const a of data.areas) {
    const kind = AREA_KIND[a.kind];
    if (areas[kind]) addRing(areas[kind], a.ring);
  }
  const neighbours = new Path2D();
  for (const c of data.context) addRing(neighbours, c.ring);
  const cats = {};
  const lots = new Path2D(); // flat footprints: surface lots matched to a campus building
  const outline = new Path2D();
  // Buildings with no outline to draw (the site's data): a dot at their place.
  const markers = data.buildings.filter((b) => b.marker && b.center).map((b) => b.center);
  for (const b of data.buildings) {
    for (const f of b.footprints) {
      if (!(f.height > 0)) { addRing(lots, f.ring); continue; }
      // A designed building is painted by the parts the 3D map draws (the California Tower's
      // lot is no building), each ring once (a base and the block above share one).
      const rings = f.design && f.design.parts && f.design.parts.length
        ? [...new Map(f.design.parts.map((p) => [JSON.stringify(p.ring), p.ring])).values()]
        : [f.ring];
      for (const r of rings) {
        addRing((cats[b.cat] ||= new Path2D()), r);
        addRing(outline, r);
      }
    }
  }
  const strokes = {};
  const widthSum = {};
  const count = {};
  for (const p of data.paths) {
    if (!STROKE_KINDS.includes(p.kind)) continue;
    addLine((strokes[p.kind] ||= new Path2D()), p.pts);
    widthSum[p.kind] = (widthSum[p.kind] || 0) + (p.width || 2);
    count[p.kind] = (count[p.kind] || 0) + 1;
  }
  const width = Object.fromEntries(Object.keys(strokes).map((k) => [k, widthSum[k] / count[k]]));
  const fences = new Path2D();
  for (const z of construction.active) addRing(fences, z.ring);
  return { areas, neighbours, cats, lots, outline, markers, strokes, width, fences, hasFences: construction.active.length > 0 };
}

/**
 * Hatch the construction zones: clip to them, then rule 45° lines across the
 * whole canvas in screen space. Called under the world transform; restores it.
 */
function drawHazardHatch(ctx, fences, dpr, cw, ch) {
  ctx.save();
  ctx.clip(fences);
  ctx.fillStyle = HAZARD.fill;
  ctx.fillRect(-1e6, -1e6, 2e6, 2e6); // the clip bounds it
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = HAZARD.hatch;
  ctx.lineWidth = HAZARD.width;
  ctx.beginPath();
  for (let o = -ch; o < cw + ch; o += HAZARD.pitch) {
    ctx.moveTo(o, 0);
    ctx.lineTo(o + ch, ch);
  }
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx, x, y, angle, mk) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(7.5, 8);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-7.5, 8);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = mk.youEdge;
  ctx.stroke();
  ctx.fillStyle = mk.you;
  ctx.fill();
  ctx.restore();
}

/** Crosshair at the overhead camera's focus: what the big view is looking at. */
function drawViewMark(ctx, x, y, mk) {
  ctx.save();
  ctx.strokeStyle = mk.view;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * 4, y + dy * 4);
    ctx.lineTo(x + dx * 13, y + dy * 13);
  }
  ctx.stroke();
  ctx.restore();
}

function drawNorth(ctx, mk) {
  ctx.save();
  ctx.fillStyle = mk.northBg;
  ctx.beginPath();
  ctx.arc(16, 16, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mk.north;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 16, 17);
  ctx.restore();
}

/**
 * @param {object} o
 * @param {(x: number, z: number) => void} o.onLookAt  show this world point in the overhead view
 */
export function createMinimap({ data, hospital, construction, player, overhead, wayfinder, onLookAt }) {
  const root = $("minimap");
  const panel = $("minimap-panel");
  const showBtn = $("minimap-show");
  const canvas = $("minimap-canvas");
  const zoomIn = $("minimap-in");
  const zoomOut = $("minimap-out");
  const moveBtn = $("minimap-move");
  const ctx = canvas.getContext("2d");
  const layers = buildLayers(data, construction);
  const floorPaths = new Map();

  let corner = normalizeCorner(prefs.get(KEYS.corner));
  let zoom = stepZoom(Number(prefs.get(KEYS.zoom) ?? DEFAULT_ZOOM), 0);
  let shown = prefs.get(KEYS.shown) !== "no";
  let clock = DRAW_EVERY; // draw on the first update
  let view = null; // the last transform, so a click lands where it was drawn

  const center = () => (player.state.mode === "over"
    ? { x: overhead.focus.x, z: overhead.focus.z }
    : { x: player.object.position.x, z: player.object.position.z });

  const wallPaths = new Map();
  function wallPath(id, f) {
    if (!wallPaths.has(id)) {
      const p = new Path2D();
      const it = f.interior;
      for (const [ax, az, bx, bz] of it ? [...it.perimeter, ...wallSegments(it)] : []) { p.moveTo(ax, az); p.lineTo(bx, bz); }
      wallPaths.set(id, p);
    }
    return wallPaths.get(id);
  }
  function floorPath(id) {
    if (!floorPaths.has(id)) {
      const p = new Path2D();
      const f = hospital.floor(id); // unknown id: an empty outline, not a dead render loop
      for (const r of [...(f?.rings || []), ...(f?.links || []).map((l) => l.ring)]) addRing(p, r);
      floorPaths.set(id, p);
    }
    return floorPaths.get(id);
  }

  /** Room the map takes in the lower left: the side panel stops above it; captions sit above or beside it. */
  function reserve() {
    const lowerLeft = corner === "bottom-left" && !root.hidden;
    document.documentElement.style.setProperty("--mm-reserve", `${lowerLeft ? root.offsetHeight + GAP : 0}px`);
    document.documentElement.style.setProperty("--mm-reserve-w", `${lowerLeft ? root.offsetWidth + GAP : 0}px`);
  }

  function layout() {
    root.classList.toggle("corner-bottom-left", corner === "bottom-left");
    root.classList.toggle("corner-top-right", corner === "top-right");
    panel.hidden = !shown;
    showBtn.hidden = shown;
    $("minimap-scale").textContent = `${ZOOM_LEVELS[zoom]} m across`;
    // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>.
    zoomIn.setAttribute("aria-disabled", String(zoom === 0));
    zoomOut.setAttribute("aria-disabled", String(zoom === ZOOM_LEVELS.length - 1));
    $("minimap-move-where").textContent = corner === "bottom-left" ? " map to the top right" : " map to the lower left";
    reserve();
    clock = DRAW_EVERY;
  }

  function draw() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(cw * dpr);
    const H = Math.round(ch * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const pal = PALETTES[theme];
    const mk = MARKS[theme];
    const c = center();
    view = viewTransform({ cx: c.x, cz: c.z, across: ZOOM_LEVELS[zoom], width: cw, height: ch });
    const s = view.scale;
    const px = 1 / s; // one CSS pixel, in metres

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cssHex(pal.ground);
    ctx.fillRect(0, 0, cw, ch);

    // World layers, in metres.
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (cw / 2 - c.x * s), dpr * (ch / 2 - c.z * s));
    const fill = (path, color) => { ctx.fillStyle = color; ctx.fill(path); };
    fill(layers.areas.green, cssHex(pal.surfaces.green));
    fill(layers.areas.pitch, cssHex(pal.surfaces.pitch));
    fill(layers.areas.parking, cssHex(pal.surfaces.parking));
    fill(layers.lots, cssHex(pal.surfaces.parking));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const k of STROKE_KINDS) {
      if (!layers.strokes[k]) continue;
      ctx.strokeStyle = cssHex(pal.surfaces[k]);
      ctx.lineWidth = Math.max(layers.width[k], 1.2 * px); // true width up close, never thinner than a hairline
      ctx.stroke(layers.strokes[k]);
    }
    fill(layers.neighbours, cssHex(pal.cats.context));
    for (const [cat, path] of Object.entries(layers.cats)) fill(path, cssHex(pal.cats[cat] ?? pal.cats.default));
    ctx.strokeStyle = mk.outline;
    ctx.lineWidth = px;
    ctx.stroke(layers.outline);
    // Buildings shown as signposts: a small diamond, a constant 5 px from centre to point, in
    // its own ink with a contrasting edge (the arrow is "you"; a diamond is a place).
    for (const m of layers.markers) {
      const r = 5 * px;
      ctx.beginPath();
      ctx.moveTo(m.x, m.z - r);
      ctx.lineTo(m.x + r, m.z);
      ctx.lineTo(m.x, m.z + r);
      ctx.lineTo(m.x - r, m.z);
      ctx.closePath();
      ctx.fillStyle = mk.place;
      ctx.fill();
      ctx.strokeStyle = mk.placeEdge;
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
    }

    if (layers.hasFences) {
      drawHazardHatch(ctx, layers.fences, dpr, cw, ch);
      ctx.strokeStyle = mk.fenceEdge; // a halo: the dashes hold 3:1 over lawn, street and building alike
      ctx.lineWidth = 4.5 * px;
      ctx.stroke(layers.fences);
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.strokeStyle = mk.fence;
      ctx.lineWidth = 2 * px;
      ctx.stroke(layers.fences);
      ctx.setLineDash([]);
    }

    if (player.state.floor !== null) {
      const id = player.state.floor;
      const p = floorPath(id);
      fill(p, mk.floorFill);
      ctx.strokeStyle = mk.floor;
      ctx.lineWidth = 2.5 * px;
      ctx.stroke(p);
      // Inside: the walls, the elevators, the stairs and (on Level 1) the doors —
      // so the way to an elevator or out can be seen at a glance.
      const f = hospital.floor(id);
      if (f) {
        ctx.strokeStyle = mk.floor;
        ctx.lineWidth = 1.2 * px;
        ctx.stroke(wallPath(id, f));
        for (const n of f.nodes) {
          if (n.kind !== "elevator") continue;
          ctx.fillStyle = mk.you;
          ctx.fillRect(n.x - 2.2, n.z - 2.2, 4.4, 4.4);
          ctx.strokeStyle = mk.youEdge;
          ctx.lineWidth = 1.5 * px;
          ctx.strokeRect(n.x - 2.2, n.z - 2.2, 4.4, 4.4);
        }
        if (f.stairs) { ctx.fillStyle = "#b9a878"; ctx.fillRect(f.stairs.x - 1.5, f.stairs.z - 2.2, 3, 4.4); }
        if (id === "1") {
          for (const e of hospital.entrances) {
            ctx.beginPath();
            ctx.arc(e.x, e.z, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = "#00a651";
            ctx.fill();
            ctx.lineWidth = 1.5 * px;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }
        }
      }
    }

    const route = wayfinder.routePoints();
    if (route && route.length >= 2) {
      const p = new Path2D();
      addLine(p, route);
      ctx.strokeStyle = mk.routeEdge;
      ctx.lineWidth = 6 * px;
      ctx.stroke(p);
      ctx.strokeStyle = mk.route;
      ctx.lineWidth = 3.5 * px;
      ctx.stroke(p);
      const [gx, gz] = route[route.length - 1];
      ctx.beginPath();
      ctx.arc(gx, gz, 5 * px, 0, Math.PI * 2);
      ctx.fillStyle = mk.route;
      ctx.fill();
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = mk.routeEdge;
      ctx.stroke();
    }

    // Screen-space marks, in CSS pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player.state.mode === "over") drawViewMark(ctx, cw / 2, ch / 2, mk);
    const [yx, yy] = view.toScreen(player.object.position.x, player.object.position.z);
    drawArrow(ctx, yx, yy, headingAngle(player.object.rotation.y), mk);
    drawNorth(ctx, mk);
  }

  const setZoom = (dir) => {
    const next = stepZoom(zoom, dir);
    if (next === zoom) return;
    zoom = next;
    prefs.set(KEYS.zoom, String(zoom));
    layout();
  };
  zoomIn.addEventListener("click", () => setZoom(-1));
  zoomOut.addEventListener("click", () => setZoom(1));
  moveBtn.addEventListener("click", () => {
    corner = otherCorner(corner);
    prefs.set(KEYS.corner, corner);
    layout(); // the button moves with the map, so focus stays on it
  });
  $("minimap-hide").addEventListener("click", () => {
    shown = false;
    prefs.set(KEYS.shown, "no");
    layout();
    showBtn.focus(); // the pressed button just disappeared; don't drop focus to <body>
  });
  showBtn.addEventListener("click", () => {
    shown = true;
    prefs.set(KEYS.shown, "yes");
    layout();
    $("minimap-hide").focus();
  });
  canvas.addEventListener("click", (e) => {
    if (!view) return;
    const r = canvas.getBoundingClientRect();
    const w = view.toWorld(e.clientX - r.left, e.clientY - r.top);
    onLookAt(w.x, w.z);
  });
  addEventListener("resize", () => { reserve(); clock = DRAW_EVERY; });

  return {
    layout,
    get corner() { return corner; },
    get zoom() { return zoom; },
    get shown() { return shown; },
    update(dt) {
      if (!shown || root.hidden || document.hidden) return;
      clock += dt;
      if (clock < DRAW_EVERY) return;
      clock = 0;
      draw();
    },
  };
}
