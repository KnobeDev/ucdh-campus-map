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
// storey), "punched" (a grid of windows in stone with a band at each floor).
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
  const part = (role, ring, spec, first) => ({
    role,
    ring: roundRing(ring),
    floors: spec.floors,
    height: +(spec.floors * h).toFixed(2),
    facade: spec.facade,
    roof: spec.roof || "plain",
    plant: !!spec.plant,
    helipads: first ? helipads : 0,
  });
  let parts;
  if (d.whole) {
    parts = [part("main", f.ring, d.whole, true)];
  } else {
    const zLine = nearestVertex(f.ring, d.cutAtVertexNear)[1];
    const { north, south } = splitRing(f.ring, zLine);
    parts = [part("tower", north, d.tower, true), part("wing", south, d.wing, false)];
  }
  return {
    ...f,
    floors: parts[0].floors,
    height: parts[0].height,
    heightSource: d.source,
    design: { name: d.name, parts, roof: { ...d.roof }, source: d.source, note: d.note },
  };
}

module.exports = { DESIGNS, splitRing, withDesign, designFor };
