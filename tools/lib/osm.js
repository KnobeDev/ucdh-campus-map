// Reads the cached Overpass extract (ucdh-data/osm-sac.json) and classifies it
// into the layers the 3D scene needs, all converted to ENU metres.
//
// Provenance and the exact query live in ucdh-data/SOURCES.md. Data is ODbL:
// any published map must carry the OpenStreetMap attribution.
"use strict";

const fs = require("fs");
const path = require("path");
const { osmGeomToEnu } = require("./georef");
const { centroid, area, openRing, cleanRing } = require("./geom");

const EXTRACT = path.join(__dirname, "..", "..", "ucdh-data", "osm-sac.json");

// highway -> how the 3D world should treat it.
const WAY_KINDS = {
  footway: { kind: "foot", width: 2.0 },
  pedestrian: { kind: "foot", width: 6.0 },
  path: { kind: "foot", width: 2.0 },
  steps: { kind: "steps", width: 1.5 },
  cycleway: { kind: "cycle", width: 2.5 },
  service: { kind: "service", width: 5.0 },
  residential: { kind: "street", width: 9.0 },
  unclassified: { kind: "street", width: 9.0 },
  tertiary: { kind: "street", width: 11.0 },
  secondary: { kind: "street", width: 14.0 },
  busway: { kind: "service", width: 7.0 },
};

/** Sidewalks and service drives get their own width when OSM states one. */
function widthOf(tags, fallback) {
  const raw = parseFloat(tags.width || tags["est_width"]);
  if (Number.isFinite(raw) && raw > 0.5 && raw < 40) return raw;
  const lanes = parseInt(tags.lanes, 10);
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(lanes * 3.6, 30);
  return fallback;
}

function loadOsm() {
  const raw = JSON.parse(fs.readFileSync(EXTRACT, "utf8"));
  const buildings = [];
  const ways = [];
  const areas = [];
  const points = [];

  for (const el of raw.elements) {
    const tags = el.tags || {};

    if (el.type === "node") {
      if (tags.highway === "bus_stop") {
        const [x, z] = osmGeomToEnu([{ lon: el.lon, lat: el.lat }])[0];
        points.push({ osmId: el.id, kind: "bus_stop", name: tags.name || null, x, z });
      }
      continue;
    }

    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    const enu = osmGeomToEnu(geom);

    if (tags.building) {
      const ring = cleanRing(openRing(enu));
      if (ring.length < 3) continue;
      buildings.push({
        osmId: el.id,
        name: tags.name || null,
        building: tags.building,
        levels: parseFloat(tags["building:levels"]) || null,
        heightTag: parseFloat(tags.height) || null,
        operator: tags.operator || null,
        amenity: tags.amenity || null,
        tags,
        ring,
        center: centroid(ring),
        area: area(ring),
      });
      continue;
    }

    if (tags.amenity === "parking" || tags.leisure || tags.landuse) {
      const ring = openRing(enu);
      if (ring.length < 3) continue;
      areas.push({
        osmId: el.id,
        kind: tags.amenity === "parking" ? "parking" : tags.leisure || tags.landuse,
        name: tags.name || null,
        access: tags.access || null,
        ring,
        area: area(ring),
      });
      continue;
    }

    if (tags.highway) {
      const spec = WAY_KINDS[tags.highway];
      if (!spec) continue; // motorway and anything else we don't render
      ways.push({
        osmId: el.id,
        kind: spec.kind,
        highway: tags.highway,
        name: tags.name || null,
        width: widthOf(tags, spec.width),
        // A tunnel or bridge changes how the surface should be drawn later.
        bridge: !!tags.bridge,
        tunnel: !!tags.tunnel,
        pts: enu,
      });
    }
  }

  return { buildings, ways, areas, points };
}

module.exports = { loadOsm };
