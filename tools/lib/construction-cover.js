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

module.exports = { markUnderConstruction, INSIDE_FRACTION };
