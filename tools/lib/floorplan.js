// Registers the Medical Center floor plan onto the real building.
//
// The 2D app's floor plan is a traced copy of UC Davis Health's printed
// diagram: 13 floors drawn as stacked bands in the diagram's own pixel space,
// explicitly "not to scale", compressed ~2:1 horizontally. Each band IS drawn
// geo-oriented (Stockton to the left, V St up, X St down), so each floor can
// be mapped onto its real OSM footprint with an anisotropic bbox-to-bbox fit.
//
// Which real footprint a floor lands on follows the diagram itself:
//   LL, 1     the whole podium — OSM's "UC Davis Medical Center" outline
//   2, 3      towers + the Surgery & Emergency Pavilion (the bands still
//             carry the Burn Unit, Blood Bank and the main ORs on the right)
//   4 – 8     the three towers (East Wing, University Tower, Davis Tower)
//   10 – 14   Davis Tower alone
// There is no level 9 or 13; physical storeys are numbered by `index`.
"use strict";

const { bbox, centroid } = require("./geom");

const FLOOR_ORDER = ["LL", "1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "14"];
const TOWERS = ["UC Davis Davis Tower", "UC Davis University Tower", "UC Davis East Wing"];
const PAVILION = "Surgery and Emergency Services Pavilion";
const OUTLINE = "UC Davis Medical Center";

function targetFor(levelId, byName) {
  const ring = (n) => byName.get(n)?.ring || [];
  const union = (names) => names.flatMap(ring);
  if (levelId === "LL" || levelId === "1") return { name: "podium", ring: ring(OUTLINE) };
  if (levelId === "2" || levelId === "3") return { name: "towers+pavilion", ring: union([...TOWERS, PAVILION]) };
  if (["4", "5", "6", "7", "8"].includes(levelId)) return { name: "towers", ring: union(TOWERS) };
  return { name: "davis-tower", ring: ring(TOWERS[0]) };
}

/** Anisotropic affine that maps one bbox onto another. */
function bboxFit(from, to) {
  const sx = (to.maxX - to.minX) / (from.maxX - from.minX);
  const sz = (to.maxZ - to.minZ) / (from.maxZ - from.minZ);
  return {
    sx, sz,
    apply: ([x, y]) => [to.minX + (x - from.minX) * sx, to.minZ + (y - from.minZ) * sz],
  };
}

/**
 * @param {object} floorsPx   default-edits floorplan.T.floors (diagram px)
 * @param {Array}  footprints the T building's OSM footprints (ENU rings, osmName)
 * @param {object} banks      ELEVATOR_BANKS from floorplan.jsx
 * @param {number} floorH     storey height, metres
 */
/** Nearest point on the ring's edges to (x, z). */
function snapToRing(ring, x, z) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + t * dx;
    const pz = az + t * dz;
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  return { point: best, distance: bestD };
}

/**
 * The 2D app's entrance points sit on its hand-traced polygon, which the
 * registered floor-1 ring only approximates. A door has to be IN the wall for
 * the walker to pass through it, so each entrance is snapped to the nearest
 * point of the floor-1 outline; the curated position is kept alongside.
 */
function placeEntrances(entrances, floor1) {
  return entrances.map((e) => {
    const { point, distance } = snapToRing(floor1.ring, e.x, e.z);
    return {
      ...e,
      x: round(point[0]),
      z: round(point[1]),
      curated: { x: e.x, z: e.z },
      snappedMetres: round(distance, 1),
    };
  });
}

/**
 * Elevator banks derived from the floor data itself: a bank reaches exactly the
 * floors that carry an elevator node with its id. This replaces a hand-kept
 * copy of floorplan.jsx's ELEVATOR_BANKS, which a node script cannot load
 * (it's a JSX module) and which the 2D router only uses as a fallback anyway.
 */
function deriveBanks(floors) {
  const banks = {};
  for (const f of floors) {
    for (const n of f.nodes) {
      if (n.kind !== "elevator" || !n.elevatorId) continue;
      const b = (banks[n.elevatorId] ||= { name: null, reaches: [] });
      if (!b.name && n.label && !/^elevator$/i.test(n.label)) b.name = n.label;
      if (!b.reaches.includes(f.id)) b.reaches.push(f.id);
    }
  }
  for (const [id, b] of Object.entries(banks)) if (!b.name) b.name = id;
  return banks;
}

function registerHospital(floorsPx, footprints, floorH, entrances = []) {
  const byName = new Map(footprints.map((f) => [f.osmName, f]));
  const missing = [OUTLINE, PAVILION, ...TOWERS].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`hospital registration: OSM footprints missing: ${missing.join(", ")}`);

  const floors = [];
  FLOOR_ORDER.forEach((id, index) => {
    const src = floorsPx[id];
    if (!src || !src.boundary || src.boundary.length < 3) return;
    const target = targetFor(id, byName);
    const fit = bboxFit(bboxPx(src.boundary), bbox(target.ring));
    const ring = src.boundary.map(fit.apply).map(([x, z]) => [round(x), round(z)]);
    const nodes = Object.values(src.nodes || {}).map((n) => {
      const [x, z] = fit.apply([n.x, n.y]);
      return {
        id: n.id,
        kind: n.kind,
        label: n.label || null,
        roomN: n.roomN ?? null,
        elevatorId: n.elevatorId || null,
        x: round(x),
        z: round(z),
      };
    });
    floors.push({
      id,
      index: index - 1, // LL = -1, street level = 0
      y: round((index - 1) * floorH),
      target: target.name,
      scale: { x: round(fit.sx, 3), z: round(fit.sz, 3) },
      ring,
      center: centroid(ring).map((v) => round(v)),
      nodes,
      // Corridors are still untraced in the 2D editor; an empty list here means
      // the whole floor is open space to the walker. Honest, not a bug.
      edges: src.edges || [],
    });
  });

  const floor1 = floors.find((f) => f.id === "1");
  return {
    code: "T",
    floorH,
    floors,
    banks: deriveBanks(floors),
    entrances: floor1 ? placeEntrances(entrances, floor1) : entrances,
    registration: "bbox-to-bbox per floor, anisotropic; the source diagram is not to scale",
  };
}

const bboxPx = (pts) => {
  const b = bbox(pts.map(([x, y]) => [x, y]));
  return b;
};
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { registerHospital, deriveBanks, snapToRing, FLOOR_ORDER };
