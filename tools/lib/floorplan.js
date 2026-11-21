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
const { linkRings, planFloor } = require("./interior");

const FLOOR_ORDER = ["LL", "1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "14"];
const OUTLINE = "UC Davis Medical Center";
// Parts of an OSM outline that are roofs over pavement, not enclosed floor:
// cut from the floor shape and the outdoor collision shape, drawn as an awning.
// Each is the lobe of the ring between the two vertices nearest `from` and `to`.
const CANOPIES = {
  [OUTLINE]: [{ from: [-206.06, -249.71], to: [-221.11, -248.67], label: "Main Entrance canopy" }],
};
const PAVILION = "Surgery and Emergency Services Pavilion";
const TOWERS = ["UC Davis Davis Tower", "UC Davis University Tower", "UC Davis East Wing"];

function tierFor(levelId) {
  if (levelId === "LL" || levelId === "1") return { name: "podium", names: [OUTLINE] };
  if (levelId === "2" || levelId === "3") return { name: "towers+pavilion", names: [PAVILION, ...TOWERS] };
  if (["4", "5", "6", "7", "8"].includes(levelId)) return { name: "towers", names: TOWERS };
  return { name: "davis-tower", names: [TOWERS[0]] };
}

const bboxOfAll = (rings) => bbox(rings.flat());

/**
 * The highest floor (at or above street level, index >= 0) the 3D map draws over one of
 * the Medical Center's footprints: the top floor whose tier includes it. The podium
 * floors' outline is the envelope every other footprint stands in, so it counts for all
 * of them. Returns { id, index } (id is the plan's own floor number: Davis Tower's top is
 * "14", the 12th storey drawn, as the plan shows no 9 or 13), or null for a name on no tier.
 * A top floor of index 0 means the plan shows only the ground floor there: it says
 * nothing about the storeys above, so callers must not present that as a storey count.
 */
function topFloorOver(floors, name) {
  let top = null;
  for (const f of floors) {
    if (f.index < 0) continue;
    const names = tierFor(f.id).names;
    if ((names.includes(name) || names.includes(OUTLINE)) && (!top || f.index > top.index)) top = { id: f.id, index: f.index };
  }
  return top;
}

/**
 * OSM rooftop helipads (aeroway=helipad, location=roof) placed on the Medical Center's
 * roof: each one's centre, the roof height of the highest floor drawn under it, and a
 * marking radius that fits inside OSM's own outline (its centre's distance to the
 * nearest edge). A helipad over no drawn floor is
 * left out (it is not on this building).
 * @param {Array} floors  registered floors (ENU rings, y)
 * @param {number} floorH storey height
 * @param {Array<{id, tags, ring}>} pads OSM ways, ring in ENU
 */
function helipadsOn(floors, floorH, pads) {
  const out = [];
  for (const p of pads) {
    if (!p.tags || p.tags.aeroway !== "helipad" || p.tags.location !== "roof") continue;
    const pts = p.ring.length > 1 && p.ring[0][0] === p.ring[p.ring.length - 1][0] && p.ring[0][1] === p.ring[p.ring.length - 1][1] ? p.ring.slice(0, -1) : p.ring;
    const x = pts.reduce((s, v) => s + v[0], 0) / pts.length;
    const z = pts.reduce((s, v) => s + v[1], 0) / pts.length;
    let top = null;
    for (const f of floors) if (f.index >= 0 && f.rings.some((r) => contains(r, [x, z])) && (!top || f.index > top.index)) top = f;
    if (!top) continue;
    // the largest circle about the centre inside OSM's outline: its distance to the nearest edge
    let radius = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i]; const [bx, bz] = pts[(i + 1) % pts.length];
      const dx = bx - ax; const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      radius = Math.min(radius, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
    out.push({ osmId: p.id, name: p.tags.name || null, x: +x.toFixed(2), z: +z.toFixed(2), y: +(top.y + floorH).toFixed(2), radius: +radius.toFixed(2), floor: top.id });
  }
  return out;
}

/**
 * Cut the lobe between the vertices nearest `from` and `to` (the shorter arc,
 * by vertex count) out of a ring. Returns the trimmed ring and the lobe as its
 * own ring, both sharing the two neck vertices.
 */
function cutLobe(ring, from, to) {
  const nearest = (p) => ring.reduce((best, v, i) => { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); return d < best.d ? { i, d } : best; }, { i: -1, d: Infinity }).i;
  let i = nearest(from);
  let j = nearest(to);
  if (i === j) return { ring, lobe: null };
  const n = ring.length;
  const fwd = (j - i + n) % n; // vertices strictly between, going forward from i
  if (fwd - 1 > n - fwd - 1) [i, j] = [j, i]; // take the shorter arc as the lobe
  const lobe = [];
  for (let k = i; ; k = (k + 1) % n) { lobe.push(ring[k]); if (k === j) break; }
  const kept = [];
  for (let k = j; ; k = (k + 1) % n) { kept.push(ring[k]); if (k === i) break; }
  // kept runs j → … → i; rotate so it starts where the ring did, for stable output
  const start = kept.findIndex((v) => v === ring[0]);
  const out = start >= 0 ? [...kept.slice(start), ...kept.slice(0, start)] : kept;
  return { ring: out, lobe };
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
  let seg = null; // the edge the point landed on
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
    if (d < bestD) { bestD = d; best = [px, pz]; seg = [[ax, az], [bx, bz]]; }
  }
  return { point: best, distance: bestD, seg };
}

/** A doorway needs this much wall either side of its centre, or the frame sits in a corner. */
const DOOR_CLEAR = 4.5;

/** Slide a point on edge a→b away from the ends so it is DOOR_CLEAR from both (or centred on a short edge). */
function clearOfCorners([ax, az], [bx, bz], x, z) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return [x, z];
  const t0 = ((x - ax) * dx + (z - az) * dz) / (len * len);
  const c = Math.min(DOOR_CLEAR / len, 0.5);
  const t = Math.max(c, Math.min(1 - c, t0));
  return [ax + t * dx, az + t * dz];
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

const DOOR_STEP = 2.0; // metres inside the door the walker is placed (and the corridor starts)

/**
 * Entrances belong in the wall the walker collides with: snap onto the podium.
 * Each also carries `inside`, the point DOOR_STEP metres in through the door —
 * where the walker lands, and where the corridor begins.
 */
function placeEntrances(entrances, podiumRings) {
  return entrances.map((e) => {
    let best = null;
    for (const ring of podiumRings) {
      const s = snapToRing(ring, e.x, e.z);
      if (!best || s.distance < best.distance) best = { ...s, ring };
    }
    // Nearest wall point, then slid along that wall clear of its ends: a door
    // in an inside corner is half-buried and reads edge-on from the street.
    const [px, pz] = clearOfCorners(best.seg[0], best.seg[1], ...best.point);
    const [cx, cz] = centroid(best.ring);
    const dx = cx - px;
    const dz = cz - pz;
    const l = Math.hypot(dx, dz) || 1;
    return {
      ...e,
      x: round(px),
      z: round(pz),
      inside: { x: round(px + (dx / l) * DOOR_STEP), z: round(pz + (dz / l) * DOOR_STEP) },
      curated: { x: e.x, z: e.z },
      snappedMetres: round(best.distance, 1),
    };
  });
}

const STAIR_OFFSET = 6.5; // metres beside the main elevator

/**
 * The printed plan shows no stairwells. One per floor is placed beside the
 * main elevators, on the first side that is inside the floor — and labelled
 * "estimated" everywhere it appears.
 */
function stairSpot(id, rings, nodes) {
  const main = nodes.find((n) => n.id === `T_${id}_elev_main`) || nodes.find((n) => n.kind === "elevator");
  if (!main) return null;
  for (const dx of [STAIR_OFFSET, -STAIR_OFFSET, 0]) {
    for (const dz of [0, STAIR_OFFSET, -STAIR_OFFSET]) {
      const x = round(main.x + dx);
      const z = round(main.z + dz);
      if ((dx || dz) && rings.some((r) => contains(r, [x, z]))) return { x, z, estimated: true };
    }
  }
  return null;
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
  const byName = new Map(footprints.map((f) => [f.osmName, { ...f }]));
  const missing = [OUTLINE, PAVILION, ...TOWERS].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`hospital registration: OSM footprints missing: ${missing.join(", ")}`);
  // Canopies out of the outlines first: everything below sees the enclosed shape.
  const awnings = [];
  const footprintOverrides = {};
  for (const [name, cuts] of Object.entries(CANOPIES)) {
    const fp = byName.get(name);
    if (!fp) continue;
    for (const c of cuts) {
      const { ring, lobe } = cutLobe(fp.ring, c.from, c.to);
      if (!lobe) continue;
      fp.ring = ring;
      awnings.push({ label: c.label, over: name, ring: lobe.map(([x, z]) => [round(x), round(z)]) });
    }
    footprintOverrides[name] = fp.ring;
  }

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
      // Several footprints on a tier are one building: connector bands between
      // facing edges (geometry from the rings, topology from the plan's bands).
      links: linkRings(rings, { within: byName.get(OUTLINE).ring }),
      center: centroid(main).map((v) => round(v)),
      nodes,
      stairs: stairSpot(id, rings, nodes),
      // The 2D editor traces no corridors; the interior below is inferred instead.
      edges: src.edges || [],
    });
    report.push({ id, tier: tier.name, rings: rings.length, nodes: nodes.length, clamped });
  });

  const podium = floors.find((f) => f.id === "1");
  const placed = podium ? placeEntrances(entrances, podium.rings) : entrances;
  for (const f of floors) {
    // The step inside is where corridors go; the door itself is where the wall opens.
    f.interior = planFloor({ ...f, entrances: f.id === "1" ? placed.map((e) => ({ ...e.inside, door: { x: e.x, z: e.z } })) : [] });
    // Cores sit on grid cells now: move each elevator and the stairs to its cell centre.
    const cores = f.interior.cores || [];
    let k = 0;
    for (const n of f.nodes) if (n.kind === "elevator" && cores[k]) { n.x = cores[k].x; n.z = cores[k].z; k++; }
    if (f.stairs && cores[k]) { f.stairs.x = cores[k].x; f.stairs.z = cores[k].z; }
    const r = report.find((x) => x.id === f.id);
    r.links = f.links.length;
    r.corridorCells = f.interior.corridorCells;
    r.unreachable = f.interior.unreachable;
  }
  return {
    code: "T",
    floorH,
    floors,
    banks: deriveBanks(floors),
    entrances: placed,
    awnings,
    footprintOverrides,
    registration: "floor shape from real OSM footprints per tier, joined by connector bands between facing edges; the printed plan (oblique, not to scale) only places rooms, which are clamped inside the footprint; corridors and partitions are inferred from those room positions, not surveyed",
    report,
  };
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

module.exports = { registerHospital, topFloorOver, helipadsOn, deriveBanks, snapToRing, clampInto, stairSpot, tierFor, FLOOR_ORDER, DOOR_STEP, placeEntrances, DOOR_CLEAR, cutLobe, CANOPIES };
