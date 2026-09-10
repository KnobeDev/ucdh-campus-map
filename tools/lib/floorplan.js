// Registers the Medical Center floor plan onto the real building.
//
// The 2D app's floor plan is traced from UC Davis Health's printed diagram:
// 13 floors as stacked bands, explicitly "not to scale" AND drawn in an
// oblique projection — each band is a sheared parallelogram seen from an
// angle, not an orthographic plan. So the traced outlines must NEVER be used
// as building geometry: stretching a sheared drawing onto a real bounding box
// inflated Level 1 to 42,600 m² against a real 32,640 m² podium and pushed a
// third of the Lower Level out over Pathology, Parking 3 and North Addition.
//
// What is used from where:
//   floor SHAPE    real OSM footprints, per tier (below) — exact, never warped
//   floor CONTENTS the traced diagram: room and elevator positions, fitted into
//                  the tier's footprint and clamped inside it. Approximate by
//                  construction, and labelled as such in the app.
//
// Tiers follow what the diagram itself shows, and the footprints nest: the
// Medical Center way is the whole-complex envelope (the Pavilion lies 94%
// inside it, Davis Tower 97%, East Wing 100%), so the podium needs it alone.
//   LL, 1     the podium envelope
//   2, 3      the Surgery & Emergency Pavilion + the three towers
//   4 – 8     the three towers
//   10 – 14   Davis Tower alone
// There is no level 9 or 13; physical storeys are numbered by `index`.
"use strict";

const { bbox, centroid, area, contains } = require("./geom");

const FLOOR_ORDER = ["LL", "1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "14"];
const OUTLINE = "UC Davis Medical Center";
const PAVILION = "Surgery and Emergency Services Pavilion";
const TOWERS = ["UC Davis Davis Tower", "UC Davis University Tower", "UC Davis East Wing"];

function tierFor(levelId) {
  if (levelId === "LL" || levelId === "1") return { name: "podium", names: [OUTLINE] };
  if (levelId === "2" || levelId === "3") return { name: "towers+pavilion", names: [PAVILION, ...TOWERS] };
  if (["4", "5", "6", "7", "8"].includes(levelId)) return { name: "towers", names: TOWERS };
  return { name: "davis-tower", names: [TOWERS[0]] };
}

const bboxOfAll = (rings) => bbox(rings.flat());

/** Anisotropic bbox→bbox map: diagram pixels to the tier's real extent. */
function bboxFit(from, to) {
  const sx = (to.maxX - to.minX) / (from.maxX - from.minX);
  const sz = (to.maxZ - to.minZ) / (from.maxZ - from.minZ);
  return {
    sx, sz,
    apply: ([x, y]) => [to.minX + (x - from.minX) * sx, to.minZ + (y - from.minZ) * sz],
  };
}

/** Nearest point on a ring's edges to (x, z), with its distance. */
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
    if (d < bestD) { bestD = d; best = [px, pz]; }
  }
  return { point: best, distance: bestD };
}

const INSET = 2.5; // metres a clamped point is pushed in from the wall

/**
 * Put a point inside one of the tier's rings. Already inside → unchanged.
 * Outside → snapped onto the nearest ring and nudged toward that ring's
 * centre, so a room never ends up standing in a wall or out on the street.
 */
function clampInto(rings, x, z) {
  if (rings.some((r) => contains(r, [x, z]))) return { x, z, clamped: false };
  let best = null;
  for (const ring of rings) {
    const s = snapToRing(ring, x, z);
    if (!best || s.distance < best.distance) best = { ...s, ring };
  }
  const [px, pz] = best.point;
  const [cx, cz] = centroid(best.ring);
  const dx = cx - px;
  const dz = cz - pz;
  const l = Math.hypot(dx, dz) || 1;
  return { x: px + (dx / l) * INSET, z: pz + (dz / l) * INSET, clamped: true, movedBy: best.distance };
}

/** Entrances belong in the wall the walker collides with: snap onto the podium. */
function placeEntrances(entrances, podiumRings) {
  return entrances.map((e) => {
    let best = null;
    for (const ring of podiumRings) {
      const s = snapToRing(ring, e.x, e.z);
      if (!best || s.distance < best.distance) best = s;
    }
    return {
      ...e,
      x: round(best.point[0]),
      z: round(best.point[1]),
      curated: { x: e.x, z: e.z },
      snappedMetres: round(best.distance, 1),
    };
  });
}

/**
 * Elevator banks derived from the floor data itself: a bank reaches exactly the
 * floors that carry an elevator node with its id.
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

/**
 * @param {object} floorsPx   default-edits floorplan.T.floors (diagram px)
 * @param {Array}  footprints the T building's OSM footprints (ENU rings, osmName)
 * @param {number} floorH     storey height, metres
 * @param {Array}  entrances  curated doors, ENU
 */
function registerHospital(floorsPx, footprints, floorH, entrances = []) {
  const byName = new Map(footprints.map((f) => [f.osmName, f]));
  const missing = [OUTLINE, PAVILION, ...TOWERS].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`hospital registration: OSM footprints missing: ${missing.join(", ")}`);

  const floors = [];
  const report = [];
  FLOOR_ORDER.forEach((id, index) => {
    const src = floorsPx[id];
    if (!src || !src.boundary || src.boundary.length < 3) return;
    const tier = tierFor(id);
    // The shape IS the real footprints — no fitting, no warping, no overlap.
    const rings = tier.names.map((n) => byName.get(n).ring.map(([x, z]) => [round(x), round(z)]));
    // The drawing only places the contents inside that shape.
    const fit = bboxFit(bbox(src.boundary), bboxOfAll(rings));
    let clamped = 0;
    const nodes = Object.values(src.nodes || {}).map((n) => {
      const [fx, fz] = fit.apply([n.x, n.y]);
      const p = clampInto(rings, fx, fz);
      if (p.clamped) clamped++;
      return {
        id: n.id,
        kind: n.kind,
        label: n.label || null,
        roomN: n.roomN ?? null,
        elevatorId: n.elevatorId || null,
        x: round(p.x),
        z: round(p.z),
        placement: p.clamped ? "clamped" : "fitted",
      };
    });
    const main = rings.reduce((a, r) => (area(r) > area(a) ? r : a), rings[0]);
    floors.push({
      id,
      index: index - 1, // LL = -1, street level = 0
      y: round((index - 1) * floorH),
      tier: tier.name,
      rings,
      center: centroid(main).map((v) => round(v)),
      nodes,
      // Corridors are still untraced in the 2D editor; an empty list means the
      // whole floor is open space to the walker. Honest, not a bug.
      edges: src.edges || [],
    });
    report.push({ id, tier: tier.name, rings: rings.length, nodes: nodes.length, clamped });
  });

  const podium = floors.find((f) => f.id === "1");
  return {
    code: "T",
    floorH,
    floors,
    banks: deriveBanks(floors),
    entrances: podium ? placeEntrances(entrances, podium.rings) : entrances,
    registration: "floor shape from real OSM footprints per tier; the printed plan (oblique, not to scale) only places rooms, which are clamped inside the footprint",
    report,
  };
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { registerHospital, deriveBanks, snapToRing, clampInto, tierFor, FLOOR_ORDER };
