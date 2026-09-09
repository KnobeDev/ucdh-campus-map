// Coordinate transforms for the UC Davis Health Sacramento campus.
//
// Three spaces are in play:
//   px    — the 2D app's 919x792 SVG viewport (everything curated lives here)
//   WGS84 — lon/lat (OSM lives here)
//   ENU   — the 3D scene's local metric frame: +x east, +z SOUTH, metres,
//           origin at ucdh-data/georef.json enuOrigin. z is flipped because
//           three.js is y-up and we want +z to read "down the map", matching
//           the px axes (the map is north-up to within 0.07 deg).
"use strict";

const fs = require("fs");
const path = require("path");

const R = 6378137.0; // WGS84 semi-major axis, Web Mercator sphere radius
const GEOREF = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "ucdh-data", "georef.json"), "utf8")
);

const { cx, cy } = GEOREF;
const ORIGIN = GEOREF.enuOrigin;

// Local equirectangular scale factors at the origin latitude. Over a 1.5 km
// campus the error against a proper geodesic is sub-centimetre.
const M_PER_DEG_LAT = 110574.0;
const M_PER_DEG_LON = 111320.0 * Math.cos((ORIGIN.lat * Math.PI) / 180);

const DET = cx[0] * cy[1] - cx[1] * cy[0];

function pxToMerc(px, py) {
  return [cx[0] * px + cx[1] * py + cx[2], cy[0] * px + cy[1] * py + cy[2]];
}

function mercToPx(mx, my) {
  const X = mx - cx[2];
  const Y = my - cy[2];
  return [(cy[1] * X - cx[1] * Y) / DET, (-cy[0] * X + cx[0] * Y) / DET];
}

function mercToLonLat(mx, my) {
  return [
    (mx / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

function lonLatToMerc(lon, lat) {
  return [
    R * lon * (Math.PI / 180),
    R * Math.log(Math.tan(Math.PI / 4 + (lat * (Math.PI / 180)) / 2)),
  ];
}

/** lon/lat -> ENU metres [x east, z south] */
function lonLatToEnu(lon, lat) {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

/** ENU metres -> lon/lat */
function enuToLonLat(x, z) {
  return [ORIGIN.lon + x / M_PER_DEG_LON, ORIGIN.lat - z / M_PER_DEG_LAT];
}

/** The workhorse: curated pixel coordinate -> ENU metres. */
function pxToEnu(px, py) {
  const [mx, my] = pxToMerc(px, py);
  const [lon, lat] = mercToLonLat(mx, my);
  return lonLatToEnu(lon, lat);
}

/** Inverse: ENU metres -> curated pixel coordinate (for writing back to the 2D app). */
function enuToPx(x, z) {
  const [lon, lat] = enuToLonLat(x, z);
  const [mx, my] = lonLatToMerc(lon, lat);
  return mercToPx(mx, my);
}

const pxPolyToEnu = (pts) => pts.map(([x, y]) => pxToEnu(x, y));
const osmGeomToEnu = (geom) => geom.map((p) => lonLatToEnu(p.lon, p.lat));

module.exports = {
  GEOREF,
  ORIGIN,
  pxToEnu,
  enuToPx,
  lonLatToEnu,
  enuToLonLat,
  pxPolyToEnu,
  osmGeomToEnu,
};
