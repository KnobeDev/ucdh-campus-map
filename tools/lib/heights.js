// Building heights, with the provenance of every number carried alongside it.
//
// OSM tags building:levels on only 4 buildings in the whole campus bbox, so most
// heights here are estimates. That is fine as long as we never pretend otherwise:
// every building carries a heightSource, the info card shows it, and nothing in
// the app may present an estimate as a survey.
//
//   floorplan     — derived from the traced Medical Center floor plan in this repo
//   OpenStreetMap — the building:levels or height tag on the OSM way
//   estimated     — a category default, or a considered guess recorded below
"use strict";

// Metres per storey, by curated category. Hospital and lab floors run tall
// because of the interstitial service space above the ceiling.
const FLOOR_H = {
  hospital: 4.2,
  clinic: 4.0,
  research: 4.0,
  education: 3.8,
  admin: 3.6,
  amenity: 3.6,
  parking: 3.0,
  external: 3.4,
  _default: 3.6,
};

// Storey counts we can actually defend, keyed by the OSM footprint name.
//
// The three tower entries come from this repo's own Medical Center floor plan
// (default-edits.json floorplan.T): floors LL and 1-8 are shared by East Wing,
// University Tower and Davis Tower; 10, 11, 12 and 14 are Davis-Tower-only. So
// Davis Tower stands 12 storeys above grade (there is no 9 or 13) and the other
// two stand 8. Everything else in this table is an honest guess.
const BY_OSM_NAME = {
  "UC Davis Davis Tower": { floors: 12, source: "floorplan" },
  "UC Davis University Tower": { floors: 8, source: "floorplan" },
  "UC Davis East Wing": { floors: 8, source: "floorplan" },
  "Parking Structure 1": { floors: 5, source: "estimated" },
  "Parking Structure 2": { floors: 5, source: "estimated" },
  "Parking Structure 3": { floors: 7, source: "estimated" },
  "Parking Structure 4": { floors: 5, source: "estimated" },
  "Parking Structure 5": { floors: 5, source: "estimated" },
  "Aggie Square Garage": { floors: 6, source: "estimated" },
};

// Storey counts by curated building code, when the OSM name doesn't carry one.
const BY_CODE = {
  T: { floors: 8, source: "estimated" }, // podium + shared stack; towers are separate footprints
};

// Fallback storeys by curated category.
const BY_CATEGORY = {
  hospital: 4,
  clinic: 3,
  research: 3,
  education: 3,
  admin: 2,
  amenity: 1,
  parking: 4,
  external: 2,
};

// Fallback storeys for unclaimed OSM footprints — the surrounding neighbourhood.
const BY_OSM_TAG = {
  house: 1,
  detached: 1,
  residential: 2,
  apartments: 3,
  garage: 1,
  garages: 1,
  shed: 1,
  roof: 1,
  commercial: 2,
  retail: 1,
  office: 3,
  school: 2,
  hospital: 4,
  parking: 4,
  construction: 4,
  yes: 2,
};

const floorHeight = (cat) => FLOOR_H[cat] || FLOOR_H._default;

/**
 * Resolve one building's height.
 * @param {object} opts
 * @param {string|null} opts.osmName  name on the matched OSM footprint
 * @param {number|null} opts.levels   OSM building:levels
 * @param {number|null} opts.heightTag OSM height tag, metres
 * @param {string|null} opts.code     curated building code
 * @param {string|null} opts.cat      curated category
 * @param {string|null} opts.osmTag   the OSM building=* value
 */
function resolveHeight({ osmName, levels, heightTag, code, cat, osmTag } = {}) {
  const h = floorHeight(cat);

  if (Number.isFinite(heightTag) && heightTag > 2) {
    return { floors: Math.max(1, Math.round(heightTag / h)), height: heightTag, heightSource: "OpenStreetMap" };
  }
  if (Number.isFinite(levels) && levels >= 1) {
    return { floors: levels, height: +(levels * h).toFixed(2), heightSource: "OpenStreetMap" };
  }
  const byName = osmName && BY_OSM_NAME[osmName];
  if (byName) {
    return { floors: byName.floors, height: +(byName.floors * h).toFixed(2), heightSource: byName.source };
  }
  const byCode = code && BY_CODE[code];
  if (byCode) {
    return { floors: byCode.floors, height: +(byCode.floors * h).toFixed(2), heightSource: byCode.source };
  }
  const floors = (cat && BY_CATEGORY[cat]) || BY_OSM_TAG[osmTag] || 2;
  return { floors, height: +(floors * h).toFixed(2), heightSource: "estimated" };
}

module.exports = { resolveHeight, floorHeight, FLOOR_H };
