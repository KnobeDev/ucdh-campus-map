// Buildings drawn as they look, not as a plain box: a design says how tall a
// building stands and what its walls look like, and, for a building site whose
// finished form is published, how the site outline divides into its parts.
//
// OpenStreetMap maps a building site as one outline (building=construction) and
// says nothing of what will stand on it, so the 3D map used to draw the whole
// site as a 4-storey translucent ghost; and it gives most finished buildings no
// storey count, so they stand at a category default. The geometry is still
// OpenStreetMap's: a part is the outline itself, or the outline cut once along
// an east-west line through one of its own vertices. Storeys and cuts are read
// from published pictures of the building, so every number here is an estimate
// and says so (heightSource "estimated", like the guesses in tools/lib/heights.js).
//
// A design is keyed by the OSM way's name, or by "osm:<way id>" for a way with
// no name. Facades: "fins" (white fins over glass), "ribbon" (a window band per
// storey), "punched" (a grid of windows in stone with a band at each floor),
// "stone" (sandstone coursing with tall windows), "brick" (red brick with tall
// windows), "glass" (a blue glass curtain wall), "garage" (open parking decks),
// "ledge" (stacked stone in uneven bands), "panel" (white metal panels, slot windows).
// A whole design may stand on a `base` of other walls (brick under glass): the
// base is its own part, and the main part starts at the base's top (minHeight).
// A design may add features
// that OSM does not map, such as a round tower ("drum", centre and radius) or
// a canopy over a courtyard ("canopy", corners snapped to the outline's own
// vertices); their places are estimates, said so in the note.
//
// The pictures are reference only. Nothing from them ships: no image, texture,
// colour sample or traced line. The 3D app draws the facade from plain shapes.
"use strict";

const { roundRing } = require("./geom");

const DESIGNS = {
  // UC Davis Health's California Tower, OSM way 1381212787 (checked 2025-10-27).
  "California Hospital Tower Construction": {
    name: "California Tower",
    // The tall slab is the outline's north arm, along 45th Street; the lower wing
    // runs west along X Street. They meet at the outline's inner corner, the OSM
    // vertex nearest this point; the cut runs east-west through it.
    cutAtVertexNear: [-95.3, -237.0],
    tower: { floors: 14, facade: "fins", plant: true },
    wing: { floors: 3, facade: "ribbon", roof: "garden" },
    roof: { helipads: 2 },
    source: "estimated",
    note: "Storeys, the tower/wing split and the two rooftop helipads are read from UC Davis Health's published renderings and photos of the finished tower (reference only: nothing from them is used in the map). The outline is OpenStreetMap's construction site.",
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
  // Shriners Children's Northern California, OSM way 307095185 (building=hospital, no name, no levels).
  "osm:307095185": {
    name: "Shriners Hospital",
    floorH: 4.2, // hospital storeys, though the curated category is "external" (3.4 m)
    whole: { floors: 8, facade: "punched", plant: true },
    roof: { helipads: 0 },
    source: "estimated",
    note: "Storeys and the look of the walls (pale stone, a grid of blue windows, a dark band at each floor) are read from photos of the building (reference only: nothing from them is used in the map). The outline is OpenStreetMap's.",
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

/**
 * A design feature as the app draws it. A drum's height comes from its storeys;
 * a canopy's corners snap to the outline's own vertices (within 2 m), so it is
 * placed by OSM's geometry, not by a picture.
 */
function featureOf(x, ring, h) {
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
  if (d.whole && d.base) {
    // The base is the lower storeys of the same building: it must be shorter, and
    // the part above starts on a floor line (base.floors × the one storey height).
    if (!(d.base.floors < d.whole.floors)) throw new Error(`design ${d.name}: base (${d.base.floors}) must be fewer storeys than the building (${d.whole.floors})`);
    const base = part("base", f.ring, d.base, false);
    // the plant room and any helipads go on the top part's roof
    parts = [base, part("main", f.ring, d.whole, true, base.height)];
  } else if (d.whole) {
    parts = [part("main", f.ring, d.whole, true)];
  } else {
    const zLine = nearestVertex(f.ring, d.cutAtVertexNear)[1];
    const { north, south } = splitRing(f.ring, zLine);
    parts = [part("tower", north, d.tower, true), part("wing", south, d.wing, false)];
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
      ...(d.features ? { features: d.features.map((x) => featureOf(x, f.ring, h)) } : {}),
      roof: { ...d.roof },
      source: d.source,
      note: d.note,
    },
  };
}

module.exports = { DESIGNS, splitRing, withDesign, designFor };
