// The campus data a site release ships: 3d/campus-data.json without anything that depends on
// the official printed map.
//
// The full file (tools/gen-3d-data.js) joins OpenStreetMap geometry to the curated building
// list. It also carries what the editor made by working over the official picture: outlines
// traced over it where OpenStreetMap has none (footprint.geomSource "traced"), every
// building's place in that picture's own pixels (pxCenter), and the picture's calibration
// (meta.georef.cx / cy: its pixels to Web Mercator, with the fit's error). None of that
// belongs in a public build (owner, 2026-11-17: open data). So for the site:
//
//   - a building keeps only its OpenStreetMap footprints;
//   - a building left with none is a `marker`: both maps show a named marker at its centre;
//   - pxCenter and the join diagnostics (`match`) are dropped;
//   - a hotspot the editor never named ("New hotspot") is dropped: it is not a place;
//   - the picture's calibration is dropped. The 2D map gets a frame of its own instead
//     (meta.frame2d): plain north-up, one scale, fitted to the campus, owing nothing to the
//     picture. Only the 3D scene's origin (meta.georef.enuOrigin) is kept, for "Open in Maps";
//   - a place's saved share link (pois[].mapsLink) is dropped: both maps build a maps link
//     from the place's name instead.
//
// Everything else (streets, paths, lawns, stops, the walking graph, closures, the Medical
// Center's floors, whose shapes are OpenStreetMap's) is passed through unchanged. Pure: the
// input is never modified.
"use strict";

// The 2D app's drawing area (data.jsx MAP_IMG) and the clear margin kept inside it.
const FRAME_W = 919;
const FRAME_H = 792;
const FRAME_PAD = 40;

/** The editor names a freshly drawn hotspot "New hotspot" until someone names it. */
const isPlaceholder = (b) => /^new hotspot$/i.test(String((b && b.name) || "").trim());

function siteBuilding(b) {
  const { pxCenter, match, footprints, ...rest } = b;
  const osm = (footprints || []).filter((f) => f.geomSource === "osm");
  return { ...rest, marker: osm.length === 0, footprints: osm };
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * The 2D map's frame: where an [x east, z south] position in metres goes in the 919x792
 * drawing area. px = (x - x0) / metresPerUnit, py = (z - z0) / metresPerUnit. Fitted so that
 * every campus building, stop, place, entrance, closure and graph node is inside the margin.
 */
function frameFor(buildings, data) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const see = (x, z) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const b of buildings) {
    for (const f of b.footprints) for (const [x, z] of f.ring) see(x, z);
    if (b.center) see(b.center.x, b.center.z);
  }
  const points = data.points || {};
  for (const list of [points.shuttle, points.busStops, points.pois, points.entrances, points.crosswalks]) {
    for (const p of list || []) see(p.x, p.z);
  }
  for (const n of Object.values((data.graph && data.graph.nodes) || {})) see(n.x, n.z);
  for (const zone of data.construction || []) for (const [x, z] of zone.ring) see(x, z);
  if (!Number.isFinite(minX)) throw new Error("the campus data has nothing to fit a frame to");

  const metresPerUnit = round(Math.max((maxX - minX) / (FRAME_W - 2 * FRAME_PAD), (maxZ - minZ) / (FRAME_H - 2 * FRAME_PAD)), 4);
  return {
    w: FRAME_W,
    h: FRAME_H,
    metresPerUnit,
    x0: round((minX + maxX) / 2 - (FRAME_W / 2) * metresPerUnit, 2),
    z0: round((minZ + maxZ) / 2 - (FRAME_H / 2) * metresPerUnit, 2),
  };
}

/**
 * @param {object} data the parsed 3d/campus-data.json
 * @returns {object} the site's copy
 */
function siteCampusData(data) {
  const buildings = data.buildings.filter((b) => !isPlaceholder(b)).map(siteBuilding);
  const { georef, ...meta } = data.meta;
  const points = data.points
    ? { ...data.points, pois: (data.points.pois || []).map(({ mapsLink, ...poi }) => poi) }
    : data.points;
  return {
    ...data,
    meta: {
      ...meta,
      georef: { enuOrigin: georef.enuOrigin },
      frame2d: frameFor(buildings, data),
      site: true,
      counts: {
        ...(data.meta.counts || {}),
        buildings: buildings.length,
        footprints: buildings.reduce((n, b) => n + b.footprints.length, 0),
      },
    },
    buildings,
    points,
  };
}

/** The exact text of 3d/campus-data.site.json for `data`: compact, one trailing newline. */
const render = (data) => `${JSON.stringify(siteCampusData(data))}\n`;

module.exports = { siteCampusData, render, isPlaceholder, FRAME_W, FRAME_H, FRAME_PAD };
