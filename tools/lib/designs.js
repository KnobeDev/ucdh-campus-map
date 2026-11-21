// Buildings still under construction, drawn as their finished design.
//
// OpenStreetMap maps a building site as one outline (building=construction) and
// says nothing of what will stand on it, so the 3D map used to draw the whole
// site as a 4-storey translucent ghost. For a site whose finished form is
// published, a design here says how that outline divides into its parts and how
// tall each part stands. The geometry is still OpenStreetMap's: the parts are the
// site outline cut once along an east-west line through one of its own vertices.
// The storeys and the cut are read from published pictures of the finished
// building, so every number here is an estimate and says so (heightSource
// "estimated", like the other guessed heights in tools/lib/heights.js).
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
    tower: { floors: 14 },
    wing: { floors: 3 },
    roof: { helipads: 2 },
    source: "estimated",
    note: "Storeys, the tower/wing split and the two rooftop helipads are read from UC Davis Health's published renderings and photos of the finished tower (reference only: nothing from them is used in the map). The outline is OpenStreetMap's construction site.",
  },
};

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
  const d = f && DESIGNS[f.osmName];
  if (!d) return f;
  const h = typeof floorH === "number" ? floorH : 4.2;
  const zLine = nearestVertex(f.ring, d.cutAtVertexNear)[1];
  const { north, south } = splitRing(f.ring, zLine);
  const part = (role, ring, floors) => ({ role, ring: roundRing(ring), floors, height: +(floors * h).toFixed(2) });
  const tower = part("tower", north, d.tower.floors);
  const wing = part("wing", south, d.wing.floors);
  return {
    ...f,
    floors: tower.floors,
    height: tower.height,
    heightSource: d.source,
    design: { name: d.name, parts: [tower, wing], roof: { ...d.roof }, source: d.source, note: d.note },
  };
}

module.exports = { DESIGNS, splitRing, withDesign };
