// Which buildings a construction zone covers. A footprint that lies mostly
// inside an active zone is a building site, not a finished building: the 3D
// app draws it as a translucent ghost of its planned mass so the striped
// caution cover beneath stays visible, and the zone's sign is raised above it.
"use strict";

const { contains, centroid } = require("./geom");

const INSIDE_FRACTION = 0.5; // of sampled points (vertices + centroid) inside the zone

const isActive = (z, today) => !z.endDate || z.endDate >= today;

function fractionInside(ring, zoneRing) {
  const pts = [...ring, centroid(ring)];
  const n = pts.filter((p) => contains(zoneRing, p)).length;
  return n / pts.length;
}

/**
 * @returns {{ buildings, zones }} copies: footprints gain `underConstruction`
 *   ({ zoneId, endDate }) where covered; zones gain `coversHeight`, the tallest
 *   covered footprint (0 when none), so a sign can clear it.
 */
function markUnderConstruction(buildings, zones, today = new Date().toISOString().slice(0, 10)) {
  const active = zones.filter((z) => z.ring && z.ring.length >= 3 && isActive(z, today));
  const covers = new Map(active.map((z) => [z.id, 0]));
  const outBuildings = buildings.map((b) => {
    if (b.renderedBy) return b; // the Medical Center is built from its floor plan, never ghosted
    return {
      ...b,
      footprints: b.footprints.map((f) => {
        if (!(f.height > 0)) return f;
        const zone = active.find((z) => fractionInside(f.ring, z.ring) >= INSIDE_FRACTION);
        if (!zone) return f;
        covers.set(zone.id, Math.max(covers.get(zone.id), f.height));
        return { ...f, underConstruction: { zoneId: zone.id, endDate: zone.endDate || null } };
      }),
    };
  });
  const outZones = zones.map((z) => ({ ...z, coversHeight: covers.get(z.id) || 0 }));
  return { buildings: outBuildings, zones: outZones };
}

/**
 * The 2D editor names a freshly drawn hotspot "New hotspot" until the admin
 * renames it. Those are drawn to give a construction zone its ground (the zone
 * lists them in `affects`); they have no identity and are never a building.
 */
const isPlaceholderHotspot = (b) => /^new hotspot$/i.test(String(b && b.name || "").trim());

/**
 * Placeholder hotspots are left out of the 3D data altogether. Their outline is traced over
 * the printed map, never OSM's, and they name nothing. Flattened, X1 (the California Tower
 * site) was still drawn as a surface lot under the Medical Center's east end, painted as a
 * lot on the mini-map and listed as a destination called "New hotspot". The zone keeps its
 * own ring and its `affects` list; nothing in the 3D app reads a placeholder.
 */
const dropPlaceholders = (buildings) => buildings.filter((b) => !isPlaceholderHotspot(b));

/**
 * A designed building site whose design asks for it (design.fenceSite) has its zone's fence
 * moved onto the site's own OpenStreetMap outline: OSM's geometry, not a ring traced over the
 * printed map, and the whole lot is fenced even where the design draws no building
 * (the California Tower: only its slab is drawn; the rest of the site is the fenced lot).
 * @returns {Array} zones, copied where changed (ring, ringSource "osm:<way id>")
 */
function fenceDesignedSites(buildings, zones) {
  const byZone = new Map();
  for (const b of buildings) for (const f of b.footprints || []) {
    if (f.design && f.design.fenceSite && f.underConstruction && f.geomSource === "osm" && f.osmId != null) byZone.set(f.underConstruction.zoneId, f);
  }
  return zones.map((z) => {
    const f = byZone.get(z.id);
    return f ? { ...z, ring: f.ring, ringSource: `osm:${f.osmId}` } : z;
  });
}

module.exports = { markUnderConstruction, fenceDesignedSites, INSIDE_FRACTION, isPlaceholderHotspot, dropPlaceholders };
