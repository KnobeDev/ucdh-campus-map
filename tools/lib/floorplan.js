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
//
// The towers are one building, not three: the printed plan draws every floor
// band as a single connected shape, East Wing joined to University Tower joined
// to Davis Tower (and the Pavilion joined to Davis Tower on 2–3). The plan
// gives only that TOPOLOGY; the geometry of each link is a short band of
// corridor width between the nearest edges of the two real footprints (LINKS
// below), which keeps every floor one walkable piece without ever tracing the
// drawing. Corridors, partitions and the stairwell are inferred from the
// placed nodes — see interior.js — and labelled as estimates in the app.
"use strict";

const { bbox, centroid, area, contains } = require("./geom");
const { buildInterior } = require("./interior");

const FLOOR_ORDER = ["LL", "1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "14"];
const OUTLINE = "UC Davis Medical Center";
const PAVILION = "Surgery and Emergency Services Pavilion";
const TOWERS = ["UC Davis Davis Tower", "UC Davis University Tower", "UC Davis East Wing"];
const [DAVIS, UNIVERSITY, EAST] = TOWERS;
// Which footprints the plan shows joined; a link is built only when both are on the tier.
const LINKS = [[EAST, UNIVERSITY], [UNIVERSITY, DAVIS], [PAVILION, DAVIS]];
const CONNECT_W = 10; // metres: a corridor with rooms either side, as the plan draws the links
const CONNECT_OVERLAP = 10; // metres a band reaches into each footprint it joins
const CORNER = 0.5; // metres: a projection this close to an edge's end is a corner, not a facing edge
const STAIR_OFFSET = 6.5; // metres beside the main elevator
const STAIR_CLEAR = 3.5; // never on top of another elevator core
const DOOR_STEP = 2.0; // metres inside the door the walker is placed (hospital.js DOOR_STEP)

function tierFor(levelId) {
  if (levelId === "LL" || levelId === "1") return { name: "podium", names: [OUTLINE] };
  if (levelId === "2" || levelId === "3") return { name: "towers+pavilion", names: [PAVILION, ...TOWERS] };
  if (["4", "5", "6", "7", "8"].includes(levelId)) return { name: "towers", names: TOWERS };
  return { name: "davis-tower", names: [TOWERS[0]] };
}

const bboxOfAll = (rings) => bbox(rings.flat());

/**
 * Every vertex of one ring against every edge of the other, with the
 * direction a link between them would cross: the edge's normal when the
 * vertex projects onto the edge proper, the gap itself when it lands on a
 * corner (East Wing's corner sits square below University Tower's). A corner
 * touching a corner, or a vertex lying on the other's edge, is no gap to
 * bridge and gives no direction, so those pairs are skipped.
 */
function facingPairs(from, onto, swap) {
  const out = [];
  for (const [x, z] of from) {
    for (let i = 0; i < onto.length; i++) {
      const [ax, az] = onto[i];
      const [bx, bz] = onto[(i + 1) % onto.length];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
      const p = [ax + t * dx, az + t * dz];
      const d = Math.hypot(p[0] - x, p[1] - z);
      const onEdge = t * len > CORNER && (1 - t) * len > CORNER;
      let dir;
      if (onEdge) dir = [-dz / len, dx / len];
      else if (d > 2 * CORNER) dir = [(p[0] - x) / d, (p[1] - z) / d];
      else continue;
      out.push(swap ? { d, a: p, b: [x, z], dir } : { d, a: [x, z], b: p, dir });
    }
  }
  return out;
}

/**
 * The band joining two adjacent footprints: centred on the closest facing
 * pair of boundary points (the pair nearest the line between the centroids
 * when several tie), crossing along the facing edge's normal, reaching
 * CONNECT_OVERLAP into each ring, and slid sideways to where it overlaps
 * both rings most — so a link off a corner still lands inside both.
 */
function connectorBand(ringA, ringB) {
  const cA = centroid(ringA);
  const cB = centroid(ringB);
  const mid = [(cA[0] + cB[0]) / 2, (cA[1] + cB[1]) / 2];
  const cands = [...facingPairs(ringA, ringB, false), ...facingPairs(ringB, ringA, true)];
  if (!cands.length) throw new Error("hospital registration: two footprints to join have no facing edges");
  const best = Math.min(...cands.map((c) => c.d));
  const pick = cands
    .filter((c) => c.d <= best + 1)
    .map((c) => ({ ...c, off: Math.hypot((c.a[0] + c.b[0]) / 2 - mid[0], (c.a[1] + c.b[1]) / 2 - mid[1]) }))
    .sort((p, q) => p.off - q.off)[0];
  // Cross along the facing edge's normal, pointed from A toward B.
  let [ux, uz] = pick.dir;
  if (ux * (cB[0] - cA[0]) + uz * (cB[1] - cA[1]) < 0) { ux = -ux; uz = -uz; }
  const hl = pick.d / 2 + CONNECT_OVERLAP;
  const hw = CONNECT_W / 2;
  const c0 = [(pick.a[0] + pick.b[0]) / 2, (pick.a[1] + pick.b[1]) / 2];
  let bestShift = { score: -1, s: 0 };
  for (let s = -hw; s <= hw; s += 0.5) {
    const pts = sampleBand(c0[0] - uz * s, c0[1] + ux * s, ux, uz, hl, hw);
    const score = Math.min(pts.filter((p) => contains(ringA, p)).length, pts.filter((p) => contains(ringB, p)).length);
    if (score > bestShift.score || (score === bestShift.score && Math.abs(s) < Math.abs(bestShift.s))) bestShift = { score, s };
  }
  if (bestShift.score === 0) throw new Error("hospital registration: a connector band misses the footprint it should join");
  const cx = c0[0] - uz * bestShift.s;
  const cz = c0[1] + ux * bestShift.s;
  return [
    [cx - ux * hl + uz * hw, cz - uz * hl - ux * hw],
    [cx + ux * hl + uz * hw, cz + uz * hl - ux * hw],
    [cx + ux * hl - uz * hw, cz + uz * hl + ux * hw],
    [cx - ux * hl - uz * hw, cz - uz * hl + ux * hw],
  ].map(([x, z]) => [round(x), round(z)]);
}

function sampleBand(cx, cz, ux, uz, hl, hw) {
  const pts = [];
  for (let s = -hl; s <= hl; s += 1) for (let w = -hw; w <= hw; w += 1) pts.push([cx + ux * s - uz * w, cz + uz * s + ux * w]);
  return pts;
}

/** The tier's real rings plus one connector band per link the tier carries. */
function ringsForTier(tier, byName) {
  const rings = tier.names.map((n) => byName.get(n).ring.map(([x, z]) => [round(x), round(z)]));
  const sources = [...tier.names];
  for (const [a, b] of LINKS) {
    const ia = tier.names.indexOf(a);
    const ib = tier.names.indexOf(b);
    if (ia < 0 || ib < 0) continue;
    rings.push(connectorBand(rings[ia], rings[ib]));
    sources.push(`connector:${a}→${b}`);
  }
  return { rings, sources };
}

/** Stairwell beside the floor's main elevator: the plan shows none, so this is an estimate. */
function stairSpot(rings, nodes) {
  const main = nodes.find((n) => /_elev_main$/.test(n.id)) || nodes.find((n) => n.kind === "elevator");
  if (!main) return null;
  const elevators = nodes.filter((n) => n.kind === "elevator");
  for (const dx of [STAIR_OFFSET, -STAIR_OFFSET, 0]) {
    for (const dz of [0, STAIR_OFFSET, -STAIR_OFFSET]) {
      if (!dx && !dz) continue;
      const x = round(main.x + dx);
      const z = round(main.z + dz);
      if (!rings.some((r) => contains(r, [x, z]))) continue;
      if (elevators.some((e) => Math.hypot(e.x - x, e.z - z) <= STAIR_CLEAR)) continue;
      return { x, z };
    }
  }
  return null;
}

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
    // The shape IS the real footprints (plus the bands that join them) — no
    // fitting, no warping. Rooms are fitted into the real rings' extent.
    const { rings, sources } = ringsForTier(tier, byName);
    const realRings = rings.slice(0, tier.names.length);
    // The drawing only places the contents inside that shape.
    const fit = bboxFit(bbox(src.boundary), bboxOfAll(realRings));
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
    const main = realRings.reduce((a, r) => (area(r) > area(a) ? r : a), realRings[0]);
    floors.push({
      id,
      index: index - 1, // LL = -1, street level = 0
      y: round((index - 1) * floorH),
      tier: tier.name,
      rings,
      ringSources: sources,
      center: centroid(main).map((v) => round(v)),
      nodes,
      stairs: stairSpot(rings, nodes),
    });
    report.push({ id, tier: tier.name, rings: rings.length, nodes: nodes.length, clamped });
  });

  const podium = floors.find((f) => f.id === "1");
  const doors = podium ? placeEntrances(entrances, podium.rings) : entrances;
  // Corridors and partitions are inferred from the placed nodes, floor by
  // floor; Level 1's corridors also reach the spot just inside each door.
  for (const f of floors) {
    const doorsIn = f.id === "1" ? doors.map((e) => ({ label: e.label, ...stepInside(f, e) })) : [];
    const interior = buildInterior(f, doorsIn);
    Object.assign(f, interior);
    const r = report.find((x) => x.id === f.id);
    r.corridors = interior.corridors.length;
    r.walls = interior.walls.length;
  }
  return {
    code: "T",
    floorH,
    floors,
    banks: deriveBanks(floors),
    entrances: doors,
    registration: "floor shape from real OSM footprints per tier, joined by corridor-width connector bands; the printed plan (oblique, not to scale) only places rooms, which are clamped inside the footprint; corridors, partitions and stairs are inferred from those positions, not surveyed",
    report,
  };
}

/** The point DOOR_STEP metres inside a door, toward the floor's centre — where the walker lands (hospital.js throughDoor). */
function stepInside(floor, door) {
  const dx = floor.center[0] - door.x;
  const dz = floor.center[1] - door.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: round(door.x + (dx / l) * DOOR_STEP), z: round(door.z + (dz / l) * DOOR_STEP) };
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { registerHospital, deriveBanks, snapToRing, clampInto, connectorBand, stairSpot, tierFor, FLOOR_ORDER, LINKS };
