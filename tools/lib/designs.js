// Buildings drawn as they look, not as a plain box: a design says how tall a
// building stands and what its walls look like, and, for a building site whose
// finished form is published, how the site outline divides into its parts.
//
// OpenStreetMap maps a building site as one outline (building=construction) and
// says nothing of what will stand on it, so the 3D map used to draw the whole
// site as a 4-storey translucent ghost; and it gives most finished buildings no
// storey count, so they stand at a category default. The geometry is still
// OpenStreetMap's: a part is the outline itself, the outline cut once along
// an east-west line through one of its own vertices, or (a curved front) the
// outline cut along an arc through two of its own vertices, parallel to the
// curved face between them. Storeys and cuts are read
// from published pictures of the building, so every number here is an estimate
// and says so (heightSource "estimated", like the guesses in tools/lib/heights.js).
//
// A design is keyed by the OSM way's name, or by "osm:<way id>" for a way with
// no name. Facades: "fins" (white fins over glass), "ribbon" (a window band per
// storey), "punched" (a grid of windows in stone with a band at each floor),
// "stone" (sandstone coursing with tall windows), "brick" (red brick with tall
// windows), "glass" (a blue glass curtain wall), "garage" (open parking decks),
// "ledge" (stacked stone in uneven bands), "panel" (white metal panels, slot windows),
// "banded" (pale stone, a mauve band at each floor, green-framed windows), "arcade"
// (a colonnade under one storey of tall green-framed windows: drawn two storeys high).
// A whole design may stand on a `base` of other walls (brick under glass): the
// base is its own part, and the main part starts at the base's top (minHeight).
// Or it may have a lower `front`: the outline's curved face and the band behind it,
// cut off along an arc through two OSM vertices (`cutArc`, see cutAlongArc).
// A design may add features
// that OSM does not map, such as a round tower ("drum", centre and radius) or
// a canopy over a courtyard ("canopy", corners snapped to the outline's own
// vertices); their places are estimates, said so in the note.
//
// The pictures are reference only. Nothing from them ships: no image, texture,
// colour sample or traced line. The 3D app draws the facade from plain shapes.
"use strict";

const { roundRing, area: areaOf, contains, centroid: centroidOf } = require("./geom");

const DESIGNS = {
  // UC Davis Health's California Tower, OSM way 1381212787 (checked 2025-10-27).
  "California Hospital Tower Construction": {
    name: "California Tower",
    // The tall slab is the outline's north arm, along 45th Street, cut off at the outline's
    // inner corner (the OSM vertex nearest this point; the cut runs east-west through it).
    // The rest of the site, along X Street, is drawn as no building: the owner (2026-11-20)
    // had the 3-storey lower wing dropped, as that part is still the fenced lot his photos show.
    cutAtVertexNear: [-95.3, -237.0],
    tower: { floors: 14, facade: "fins", plant: true },
    wing: null,
    fenceSite: true, // the construction fence follows this OSM outline (lib/construction-cover.js)
    roof: { helipads: 2 },
    source: "estimated",
    note: "Storeys, where the slab ends and the two rooftop helipads are read from UC Davis Health's published renderings and photos of the finished tower (reference only: nothing from them is used in the map). Only the slab is drawn; the rest of OpenStreetMap's construction site is the fenced lot.",
  },
  // UC Davis MIND Institute, 2825 50th Street, OSM way 796721511 (amenity=research_institute,
  // no building tag: ucdh-data/osm-extra.json brings it in).
  "osm:796721511": {
    name: "MIND Institute",
    floorH: 4.6, // tall clinic and research storeys
    whole: { floors: 2, facade: "stone", plant: false },
    // The round sandstone tower at the entrance, one storey above the wings, on
    // the outline's rounded south-west corner beside the drop-off loop.
    features: [{ kind: "drum", x: 546.5, z: 243.5, radius: 7, floors: 3 }],
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys, the look of the walls and the round entrance tower are read from photos of the building (reference only: nothing from them is used in the map). The tower's place is estimated from the outline's rounded corner; OSM does not map it. The outline is OpenStreetMap's.",
  },
  // Aggie Square (Stockton Boulevard, 2nd to 3rd Avenue). The owner, 2026-11-20:
  // the long block east of 400 is ONE building (its name stays as curated), and
  // 100 Aggie Square is not built yet (a later phase), so nothing is drawn for it.
  "osm:1539582698": {
    name: "Aggie Square - Lifelong Learning Building & East Lab",
    floorH: 4.2, // lab storeys
    base: { floors: 2, facade: "brick" },
    whole: { floors: 8, facade: "glass", plant: true },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys and the look (a two-storey brick base under a blue glass curtain wall) are read from photos and renderings of Aggie Square (reference only: nothing from them is used in the map). The outline is OpenStreetMap's.",
  },
  "osm:1539582699": {
    name: "400 Aggie Square",
    floorH: 4.2,
    whole: { floors: 3, facade: "brick", plant: false },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys and the brick walls are read from photos and renderings of Aggie Square (reference only). The outline is OpenStreetMap's.",
  },
  "osm:1493760477": {
    name: "Aggie Square - Anova",
    floorH: 3.6,
    whole: { floors: 5, facade: "punched", plant: false },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys and the pale walls with a grid of windows are read from renderings of Aggie Square (reference only). The outline is OpenStreetMap's.",
  },
  "osm:791935708": {
    name: "Aggie Square Garage",
    floorH: 3.0,
    whole: { floors: 6, facade: "garage", plant: false },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Decks and the open concrete walls are read from photos of the garage (reference only; its mural is art and is not copied). The outline is OpenStreetMap's.",
  },
  // Betty Irene Moore Hall (School of Nursing), 2570 48th Street, OSM way 522792282:
  // OSM gives building:levels=2, so the storey count is OSM's and only its height is estimated.
  "osm:522792282": {
    name: "Betty Irene Moore Hall",
    floorH: 5.0, // tall teaching storeys
    base: { floors: 1, facade: "ledge" },
    whole: { floors: 2, facade: "panel", plant: false },
    // The entrance canopy: a perforated metal roof on slim posts over the courtyard in
    // the outline's north-west notch (its inner corners are the outline's own vertices),
    // reaching out past the building line in a curved edge over the plaza, posts along
    // that edge (owner, 2026-11-20: the notch-only version was wrong). OSM does not map
    // it: the 8 m reach is estimated from photos.
    features: [{ kind: "canopy", corners: [[116.77, -10.03], [156.93, -9.1], [156.93, -25.8], [134.05, -32.75]], bulge: 8, height: 7.5 }],
    roof: { helipads: 0 },
    source: "OpenStreetMap",
    note: "Storeys are OSM's (building:levels=2); their 5 m height, the stacked-stone base under white metal panels and the entrance canopy over the north-west courtyard are read from photos of the building (reference only: nothing from them is used in the map). The outline is OpenStreetMap's.",
  },
  // Parking Structure 3, the Medical Center's main garage, 4251 X Street, OSM way 198423271
  // (amenity=parking, building=parking, parking=multi-storey; no levels, no height). It is the
  // garage nearest Stockton Boulevard: its long south-west chamfer runs along the boulevard.
  // The owner, 2026-11-20: "Recheck the Medical Center parking structure (night image) nearest
  // Stockton Blvd." The outline is right as OSM maps it: a near-square deck (about 79 x 82 m
  // in its own grid) with chamfered corners, 5,846 m², which at 7 parking levels is close to
  // the builder's published 417,000 sq ft. Photos show six open decks behind light horizontal
  // bands under the roof deck. Sources differ on the count: the builder (McCarthy) calls it a
  // 7-level structure, Clark Pacific says 6, and UC Davis Health's visitor page names only the
  // Lower Level and Levels 1 to 3 for patients and visitors; six decks are drawn (estimated).
  // Three long solar canopies on posts stand on the roof deck (the builder lists a 145 kW
  // photovoltaic array at the roof level), and stair/elevator towers rise above it at the
  // outline's north-west corner and at the east end of its north wall.
  "osm:198423271": {
    name: "Parking Structure 3",
    floorH: 3.3, // a parking deck, floor to floor
    whole: { floors: 6, facade: "louvred", plant: false },
    features: [
      // 7 x 7 m, one storey above the deck: estimates. Corners and walls are OSM's.
      { kind: "stair", corner: [-351.09, -281.88], toward: [-293.63, -271.03], size: [7, 7], rise: 4.5 },
      { kind: "stair", corner: [-293.63, -271.03], toward: [-351.09, -281.88], size: [7, 7], rise: 4.5 },
      // three canopies, each 10 x 26 m, 18 m apart, 4.2 m over the deck: estimates
      { kind: "solar", count: 3, length: 26, width: 10, spacing: 18, clearance: 4.2 },
    ],
    roof: { helipads: 0 },
    source: "estimated",
    note: "Six open decks under the roof deck (7 parking levels counting the roof), their light horizontal bands, the three solar canopies on posts and the two stair towers are read from photos of the garage (reference only: nothing from them is used in the map). Estimates: the 3.3 m deck height; each canopy 10 x 26 m, 18 m apart and 4.2 m over the deck, in a row along the outline's longest wall; each tower 7 x 7 m and 4.5 m above the deck, on corners of OpenStreetMap's outline. The outline is OpenStreetMap's.",
  },
  // Shriners Children's Northern California, OSM way 307095185 (building=hospital, no name, no levels;
  // version 2, 2018, checked against the OSM API 2026-11-20: no building:part ways map its parts).
  // The owner, 2026-11-20: "there's 2 levels at the front but the map just goes straight up."
  // The outline's north-west corner is a quarter circle (OSM vertices (-219.41,-142.91) to
  // (-246.01,-116.79), radius 25.7 m) facing the round plaza with the flags: that curved face is
  // the 2-storey front (a colonnade under one storey of tall windows), and the 8-storey block's
  // own curved wall stands behind it. The owner (2026-11-20) placed that wall at the outline's
  // outer corners, (-208.42,-143.06) and (-245.55,-105.11): the cut is an arc through those two
  // vertices, parallel to the curved face, so the front is a band about 11 m deep.
  "osm:307095185": {
    name: "Shriners Hospital",
    floorH: 4.2, // hospital storeys, though the curated category is "external" (3.4 m)
    whole: { floors: 8, facade: "banded", plant: true },
    front: { floors: 2, facade: "arcade", cutArc: [[-208.42, -143.06], [-245.55, -105.11]] },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys, the 2-storey front on the plaza and the look of the walls (pale stone, a mauve band at each floor, green-framed windows, a colonnade along the front) are read from photos of the building (reference only: nothing from them is used in the map). The front's depth, about 11 m, is an estimate that follows the owner's reading of the plaza (2026-11-20): the cut runs between the outline's outer corners, parallel to its curved face. The outline is OpenStreetMap's.",
  },
};

// Own keys only: an OSM name like "constructor" must not find Object.prototype's.
const own = (key) => (Object.hasOwn(DESIGNS, key) ? DESIGNS[key] : null);
const designFor = (f) => (f && (own(String(f.osmName)) || (f.osmId != null && own(`osm:${f.osmId}`)))) || null;

/**
 * Cut a ring on the east-west line z = zLine. +z is south, so `north` is the
 * part with z <= zLine. Sutherland–Hodgman against each half-plane; a ring that
 * the line meets in more than two places would come back as one self-touching
 * ring per side, so designs cut only where the outline crosses the line once.
 * @returns {{north: Array<[number, number]>, south: Array<[number, number]>}}
 */
function splitRing(ring, zLine) {
  const clip = (keep) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ina = keep(a[1]);
      const inb = keep(b[1]);
      if (ina) out.push(a);
      if (ina !== inb && a[1] !== b[1]) {
        const t = (zLine - a[1]) / (b[1] - a[1]);
        const p = [a[0] + t * (b[0] - a[0]), zLine];
        if (!out.length || out[out.length - 1][0] !== p[0] || out[out.length - 1][1] !== p[1]) out.push(p);
      }
    }
    // a vertex on the line is kept by both sides; drop a repeated closing point
    if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    return out;
  };
  return { north: clip((z) => z <= zLine), south: clip((z) => z >= zLine) };
}

const nearestVertex = (ring, [x, z]) => ring.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? p : best), ring[0]);

/** The circle through points (least squares, Kåsa's fit): { x, z, r }. */
function fitCircle(pts) {
  // minimise the sum of (x² + z² + D x + E z + F)² over D, E, F (normal equations, Gaussian elimination)
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const [x, z] of pts) {
    const row = [x, z, 1]; const w = -(x * x + z * z);
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j]; M[i][3] += row[i] * w; }
  }
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null; // the points are on a line
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  const [D, E, F] = M.map((r, i) => r[3] / r[i]);
  const x = -D / 2; const z = -E / 2;
  return { x, z, r: Math.sqrt(x * x + z * z - F) };
}

const sameVertex = (a, b) => a[0] === b[0] && a[1] === b[1];

/**
 * Cut a curved front off an outline. `from` and `to` snap to two of the outline's
 * own vertices (within 2 m, or the cut is refused); the outline between them, the
 * shorter way round, must hold a curved face: at least three vertices on one
 * circle. The cut is an arc from one vertex to the other, centred as near the
 * curved face's own centre as an arc through both vertices can be, so it runs
 * parallel to the face. Nothing is traced: every point is OSM's or on that arc.
 * @returns {{front: Array<[number, number]>, rest: Array<[number, number]>, arc: Array<[number, number]>}}
 *   front: the face and the band behind it; rest: everything else; arc: the cut, from
 *   the front's first vertex to its last.
 */
function cutAlongArc(ring, from, to) {
  const n = ring.length;
  const snap = (c) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.hypot(ring[i][0] - c[0], ring[i][1] - c[1]) < Math.hypot(ring[best][0] - c[0], ring[best][1] - c[1])) best = i;
    if (Math.hypot(ring[best][0] - c[0], ring[best][1] - c[1]) > 2) throw new Error(`arc cut end ${c} is not on the outline`);
    return best;
  };
  const i = snap(from); const j = snap(to);
  if (i === j) throw new Error("an arc cut needs two different vertices");
  const run = (a, b) => { const out = [ring[a]]; for (let k = a; k !== b;) { k = (k + 1) % n; out.push(ring[k]); } return out; };
  const len = (pts) => pts.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
  const ab = run(i, j); const ba = run(j, i);
  const [face, other] = len(ab) <= len(ba) ? [ab, ba] : [ba, ab];
  // The curve to run parallel to: the face's inner vertices, less any straight lead-in at
  // either end (an end face running from the cut's corner to where the curve starts),
  // trimmed one vertex at a time from whichever end fits the circle worse.
  let inner = face.slice(1, -1);
  const off = (f, [x, z]) => Math.abs(Math.hypot(x - f.x, z - f.z) - f.r);
  let fit = inner.length >= 3 ? fitCircle(inner) : null;
  while (fit && inner.some((p) => off(fit, p) > 1) && inner.length > 3) {
    inner = off(fit, inner[0]) >= off(fit, inner[inner.length - 1]) ? inner.slice(1) : inner.slice(0, -1);
    fit = fitCircle(inner);
  }
  // A real curve: at least four vertices on the circle (any three fit one), standing a metre
  // or more off the chord between the curve's own ends (millimetre noise on a straight edge is not one).
  const sagittaOf = (pts) => {
    const [c0, c1] = [pts[0], pts[pts.length - 1]];
    const chord = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1;
    return Math.max(0, ...pts.map(([x, z]) => Math.abs((x - c0[0]) * (c1[1] - c0[1]) - (z - c0[1]) * (c1[0] - c0[0])) / chord));
  };
  if (!fit || inner.length < 4 || inner.some((p) => off(fit, p) > 1) || sagittaOf(inner) < 1) {
    throw new Error(`no curved face between ${face[0]} and ${face[face.length - 1]}: the arc has nothing to run parallel to`);
  }
  const A = face[0]; const B = face[face.length - 1];
  // the centre: the curved face's own, moved onto the line of points as far from A as from B
  const mx = (A[0] + B[0]) / 2; const mz = (A[1] + B[1]) / 2;
  const half = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2;
  const ux = -(B[1] - A[1]) / (2 * half); const uz = (B[0] - A[0]) / (2 * half);
  const t = (fit.x - mx) * ux + (fit.z - mz) * uz;
  const cx = mx + t * ux; const cz = mz + t * uz;
  const R = Math.hypot(A[0] - cx, A[1] - cz);
  const t0 = Math.atan2(A[1] - cz, A[0] - cx);
  let d = Math.atan2(B[1] - cz, B[0] - cx) - t0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steps = Math.max(6, Math.ceil((Math.abs(d) * R) / 3)); // a point every 3 m or so
  const arc = [A];
  for (let k = 1; k < steps; k++) arc.push([cx + R * Math.cos(t0 + (d * k) / steps), cz + R * Math.sin(t0 + (d * k) / steps)]);
  arc.push(B);
  const between = arc.slice(1, -1);
  const front = [...face, ...between.slice().reverse()];
  const rest = [...other, ...between];
  // The arc must stay inside the outline, and the two parts must be the outline, no more.
  if (between.some((p) => !contains(ring, p)) || Math.abs(areaOf(front) + areaOf(rest) - areaOf(ring)) > areaOf(ring) * 1e-6) {
    throw new Error(`the arc cut from ${A} to ${B} leaves the outline`);
  }
  return { front, rest, arc };
}

/**
 * A circular arc from `a` to `b` whose middle stands `sagitta` metres off the chord,
 * on the side away from the points in `away` (its ends included).
 */
function bowedEdge(a, b, sagitta, away, steps = 12) {
  const [ax, az] = a; const [bx, bz] = b;
  const cx = (ax + bx) / 2; const cz = (az + bz) / 2;
  const half = Math.hypot(bx - ax, bz - az) / 2;
  // A shallow arc only (less than a half circle): the sweep below goes the short way round.
  if (!(sagitta > 0 && sagitta < half)) throw new Error(`canopy bulge ${sagitta} m must be more than 0 and less than half its edge (${half.toFixed(2)} m)`);
  let nx = -(bz - az) / (2 * half); let nz = (bx - ax) / (2 * half);
  const mean = away.reduce((m, p) => [m[0] + p[0] / away.length, m[1] + p[1] / away.length], [0, 0]);
  if ((mean[0] - cx) * nx + (mean[1] - cz) * nz > 0) { nx = -nx; nz = -nz; }
  const R = (half * half + sagitta * sagitta) / (2 * sagitta);
  const ox = cx - nx * (R - sagitta); const oz = cz - nz * (R - sagitta); // the circle's centre
  const t0 = Math.atan2(az - oz, ax - ox); let t1 = Math.atan2(bz - oz, bx - ox);
  // go the short way round, through the bulge
  let d = t1 - t0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts = [];
  for (let k = 0; k <= steps; k++) { const t = t0 + (d * k) / steps; pts.push([ox + R * Math.cos(t), oz + R * Math.sin(t)]); }
  pts[0] = [ax, az]; pts[steps] = [bx, bz];
  return pts;
}

/** The index of the outline's vertex within 2 m of c, or an error naming what was asked. */
function vertexIndex(ring, c, what) {
  let best = 0;
  for (let i = 1; i < ring.length; i++) if (Math.hypot(ring[i][0] - c[0], ring[i][1] - c[1]) < Math.hypot(ring[best][0] - c[0], ring[best][1] - c[1])) best = i;
  if (Math.hypot(ring[best][0] - c[0], ring[best][1] - c[1]) > 2) throw new Error(`${what} ${c} is not on the outline`);
  return best;
}

const onOrIn = (ring, p) => contains(ring, p) || ring.some((a, i) => {
  const b = ring[(i + 1) % ring.length];
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dz - p[1]) < 0.01;
});
const r2 = ([x, z]) => [+x.toFixed(2), +z.toFixed(2)];

/**
 * A stair/elevator tower's outline: a rectangle on one corner of the outline, `size[0]`
 * metres along the wall from `corner` toward `toward` (the wall's other end) and `size[1]`
 * metres in from it. Both points snap to OSM vertices (within 2 m) that must be the two
 * ends of one wall; the tower's own sizes are estimates, said so in the design's note.
 */
function stairTower(ring, { corner, toward, size: [along, depth] }) {
  const n = ring.length;
  const i = vertexIndex(ring, corner, "stair tower corner");
  const j = vertexIndex(ring, toward, "stair tower wall end");
  if ((i + 1) % n !== j && (j + 1) % n !== i) throw new Error(`stair tower: ${corner} and ${toward} are not the two ends of one wall`);
  const c = ring[i]; const t = ring[j];
  const len = Math.hypot(t[0] - c[0], t[1] - c[1]);
  if (!(along > 0 && depth > 0 && along < len)) throw new Error(`stair tower: ${along} m along a ${len.toFixed(1)} m wall`);
  const u = [(t[0] - c[0]) / len, (t[1] - c[1]) / len];
  let nv = [-u[1], u[0]];
  if (!contains(ring, [c[0] + u[0] * 0.5 + nv[0] * 0.5, c[1] + u[1] * 0.5 + nv[1] * 0.5])) nv = [-nv[0], -nv[1]];
  const out = [
    [c[0], c[1]],
    r2([c[0] + u[0] * along, c[1] + u[1] * along]),
    r2([c[0] + u[0] * along + nv[0] * depth, c[1] + u[1] * along + nv[1] * depth]),
    r2([c[0] + nv[0] * depth, c[1] + nv[1] * depth]),
  ];
  if (!out.every((p) => onOrIn(ring, p))) throw new Error(`stair tower at ${corner} leaves the outline`);
  return out;
}

/** Do two convex rings overlap (separating axes; touching counts as apart)? */
function convexOverlap(a, b) {
  for (const ring of [a, b]) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i]; const [x2, z2] = ring[(i + 1) % ring.length];
      const nx = z1 - z2; const nz = x2 - x1;
      const pa = a.map(([x, z]) => x * nx + z * nz); const pb = b.map(([x, z]) => x * nx + z * nz);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

/** Distance from p to the ring's nearest edge. */
function edgeDistance([px, pz], ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]; const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax; const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx - px, az + t * dz - pz));
  }
  return best;
}

/**
 * Solar canopies over a roof deck: `count` rectangles in a row through the roof's
 * centre, `spacing` metres apart along the roof's long axis, each `width` metres
 * along it and `length` metres across it (a double row of stalls under each), on
 * posts down its middle. The long axis is the outline's longest wall, not the
 * vertices' principal axis (roofLayout's): on a near-square, chamfered deck like
 * Parking Structure 3 that axis runs along the chamfer, across the deck's grid.
 * When the row does not fit at the centroid (`margin` m inside the edge, clear of
 * `avoid`), it moves to the nearest place on a 0.5 m grid where it does.
 * @returns {{panels: Array<{ring: Array<[number, number]>, posts: Array<[number, number]>}>}}
 */
function solarLayout(ring, { count = 3, length, width, spacing, margin = 1, avoid = [] }) {
  let wall = 0; let u = [1, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > wall) { wall = l; u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  }
  const v = [-u[1], u[0]];
  const [cx, cz] = centroidOf(ring);
  const row = (du, dv) => Array.from({ length: count }, (_, k) => {
    const s = (k - (count - 1) / 2) * spacing + du;
    const mx = cx + u[0] * s + v[0] * dv; const mz = cz + u[1] * s + v[1] * dv;
    const at = (a, b) => r2([mx + u[0] * a + v[0] * b, mz + u[1] * a + v[1] * b]);
    const w = width / 2; const h = length / 2;
    const posts = Math.max(2, Math.round(length / 9));
    return {
      ring: [at(-w, -h), at(w, -h), at(w, h), at(-w, h)],
      posts: Array.from({ length: posts }, (_, p) => at(0, -h + (length * (p + 0.5)) / posts)),
    };
  });
  const fits = (panels) => panels.every((p) => p.ring.every((c) => contains(ring, c) && edgeDistance(c, ring) >= margin)
    && avoid.every((a) => !convexOverlap(p.ring, a)));
  if (!(width < spacing)) throw new Error(`solar canopies ${width} m wide cannot stand ${spacing} m apart`);
  const tries = [];
  for (let du = -20; du <= 20; du += 0.5) for (let dv = -20; dv <= 20; dv += 0.5) tries.push([du, dv]);
  tries.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const [du, dv] of tries) {
    const panels = row(du, dv);
    if (fits(panels)) return { panels };
  }
  throw new Error(`${count} solar canopies of ${width} x ${length} m do not fit on the roof`);
}

/**
 * A design feature as the app draws it. A drum's height comes from its storeys;
 * a canopy's corners snap to the outline's own vertices (within 2 m), so it is
 * placed by OSM's geometry, not by a picture. A stair tower snaps to a corner and
 * a wall of the outline and stands on the roof (`roofH`); solar canopies stand on
 * posts on the roof, clear of the towers placed before them (`placed`).
 */
function featureOf(x, ring, h, roofH = 0, placed = []) {
  if (x.kind === "stair") {
    const { corner, toward, size, rise, ...rest } = x;
    return { ...rest, ring: stairTower(ring, { corner, toward, size }), minHeight: roofH, height: +(roofH + rise).toFixed(2) };
  }
  if (x.kind === "solar") {
    const { count, length, width, spacing, clearance, ...rest } = x;
    const { panels } = solarLayout(ring, { count, length, width, spacing, avoid: placed });
    return { ...rest, panels, minHeight: roofH, height: +(roofH + clearance).toFixed(2) };
  }
  if (x.kind === "canopy") {
    const { corners, ...rest } = x;
    const snapped = corners.map((c) => {
      const v = nearestVertex(ring, c);
      if (Math.hypot(v[0] - c[0], v[1] - c[1]) > 2) throw new Error(`canopy corner ${c} is not on the outline`);
      return [v[0], v[1]];
    });
    const distinct = new Set(snapped.map(([x, z]) => `${x},${z}`));
    if (distinct.size !== snapped.length || snapped.length < 3) throw new Error(`canopy corners ${JSON.stringify(corners)} do not make a shape on the outline`);
    if (!x.bulge) return { ...rest, ring: snapped };
    // The closing edge (last corner back to the first) bows out by `bulge` metres, on the
    // side away from the other corners: the canopy's open, curved front.
    const outer = bowedEdge(snapped[snapped.length - 1], snapped[0], x.bulge, snapped.slice(1, -1));
    const { bulge, ...kept } = rest;
    return { ...kept, ring: [...snapped, ...outer.slice(1, -1)].map(([px, pz]) => [+px.toFixed(2), +pz.toFixed(2)]), outer: outer.map(([px, pz]) => [+px.toFixed(2), +pz.toFixed(2)]) };
  }
  return { ...x, height: +(x.floors * h).toFixed(2) };
}

/** Every feature, in order; solar canopies keep clear of the stair towers before them. */
function featuresOf(list, ring, h, roofH) {
  const out = [];
  for (const x of list) out.push(featureOf(x, ring, h, roofH, out.filter((y) => y.kind === "stair").map((y) => y.ring)));
  return out;
}

/**
 * A footprint with its finished design attached, or the footprint unchanged
 * when it has none. The footprint's own floors and height become the tower's,
 * so anything that clears the tallest mass on a site (the caution sign) clears it.
 * @param {object} f  footprint ({ osmName, ring, ... })
 * @param {number} floorH  metres per storey for the building's category
 */
function withDesign(f, floorH) {
  const d = designFor(f);
  if (!d) return f;
  const h = d.floorH || (typeof floorH === "number" ? floorH : 4.2);
  const helipads = (d.roof && d.roof.helipads) || 0;
  // The first part is the tallest: helipads and the plant room go on its roof.
  const part = (role, ring, spec, first, minHeight = 0) => ({
    role,
    ring: roundRing(ring),
    floors: spec.floors,
    height: +(spec.floors * h).toFixed(2),
    minHeight,
    storeyH: h, // the wall pattern repeats once per storey of this height
    facade: spec.facade,
    roof: spec.roof || "plain",
    plant: !!spec.plant,
    helipads: first ? helipads : 0,
  });
  let parts;
  if (d.base && d.front) throw new Error(`design ${d.name}: a base or a front, not both`);
  if (d.whole && d.base) {
    // The base is the lower storeys of the same building: it must be shorter, and
    // the part above starts on a floor line (base.floors × the one storey height).
    if (!(d.base.floors < d.whole.floors)) throw new Error(`design ${d.name}: base (${d.base.floors}) must be fewer storeys than the building (${d.whole.floors})`);
    const base = part("base", f.ring, d.base, false);
    // the plant room and any helipads go on the top part's roof
    parts = [base, part("main", f.ring, d.whole, true, base.height)];
  } else if (d.whole && d.front) {
    // A lower front cut off along an arc (Shriners' colonnade on its plaza); the block behind it is the main part.
    if (!(d.front.floors < d.whole.floors)) throw new Error(`design ${d.name}: the front (${d.front.floors}) must be fewer storeys than the building (${d.whole.floors})`);
    const { front, rest } = cutAlongArc(f.ring, ...d.front.cutArc);
    parts = [part("main", rest, d.whole, true), part("front", front, d.front, false)];
  } else if (d.whole) {
    parts = [part("main", f.ring, d.whole, true)];
  } else {
    const zLine = nearestVertex(f.ring, d.cutAtVertexNear)[1];
    const { north, south } = splitRing(f.ring, zLine);
    parts = [part("tower", north, d.tower, true), ...(d.wing ? [part("wing", south, d.wing, false)] : [])];
  }
  // The tallest part sets the footprint's storeys and height (what the caution sign clears, what identify says).
  const top = parts.reduce((a, b) => (b.height > a.height ? b : a));
  return {
    ...f,
    floors: top.floors,
    height: top.height,
    heightSource: d.source,
    design: {
      name: d.name,
      parts,
      ...(d.fenceSite ? { fenceSite: true } : {}),
      ...(d.features ? { features: featuresOf(d.features, f.ring, h, top.height) } : {}),
      roof: { ...d.roof },
      source: d.source,
      note: d.note,
    },
  };
}

module.exports = { DESIGNS, splitRing, cutAlongArc, stairTower, solarLayout, withDesign, designFor };
