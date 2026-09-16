// The Medical Center, built from its floor plan rather than from OSM shells.
//
// Each floor carries the REAL OSM footprints of its tier (one ring for the
// podium, several for the tower floors) joined by connector bands where a tier
// has more than one — see tools/lib/floorplan.js and tools/lib/interior.js.
// Exterior: every ring and connector extruded one storey, which is the true
// massing. Interior: slabs, ceilings, the perimeter walls (cut at doors and
// connectors), the inferred partition walls, elevator cores, an (estimated)
// stairwell and labelled room zones. When the walker is inside, floors above
// the current one are cut away so the inside stays visible.
//
// What is and isn't real here, so nobody mistakes the picture for a survey:
//   · floor outlines are real OSM footprints — exact;
//   · the connectors between the towers are corridor-width bands between the
//     footprints' facing edges: the plan only says the towers join, the
//     footprints say where;
//   · room and elevator positions come from the printed plan, which is drawn
//     in oblique projection and "not to scale", so they are fitted into the
//     footprint and clamped inside it: approximate by construction;
//   · corridors and partitions are INFERRED from those room positions on a
//     building-aligned grid (3d/interior-core.js) — nobody has surveyed them;
//   · the printed plan shows no stairs; one stairwell per floor is placed
//     beside the main elevators and labelled "estimated".
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { flatPatch, extrudedRing } from "./geometry.js?v=7";
import { pointInPolygon } from "./buildings.js?v=7";
import { labelSprite } from "./labels.js?v=6";
import { WALL_T, wallSegments, walkable, routeIndoor, cellOf, cellCenter, inGrid, idx, CORRIDOR } from "./interior-core.js?v=1";

const CORE = 3.2; // elevator core footprint, metres
const STAIR = [3.0, 4.4]; // stairwell footprint
const ROOM_R = 3.2;
const LINK_SINK = 0.03; // metres a connector's slab and roof sit below its towers', so coplanar overlaps don't flicker
export const CELL_RADIUS = 2.6; // "near enough" to use an elevator or stairs
// The floor-1 outline and the outdoor collision footprint are now the SAME
// geometry (the real OSM podium), so a door needs only a tight radius on both
// sides. It used to be 18 m outdoors purely to bridge the gap left by fitting
// the oblique floor drawing onto the building — that gap is gone.
export const DOOR_RADIUS_OUT = 6.0;
export const DOOR_RADIUS_IN = 4.0;
export const DOOR_STEP = 2.0; // metres past the door the walker is placed

/** Wall boxes along world segments [x1, z1, x2, z2]. */
function wallGeometry(segments, floorH) {
  const parts = [];
  for (const [ax, az, bx, bz] of segments) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const g = new THREE.BoxGeometry(len + WALL_T, floorH, WALL_T);
    g.rotateY(-Math.atan2(bz - az, bx - ax));
    g.translate((ax + bx) / 2, floorH / 2, (az + bz) / 2);
    parts.push(g);
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Accessible entrances say so on their sign — that is what the ♿ flag is for. */
const doorText = (e) => `${e.label || "Entrance"}${e.accessible ? " ♿" : ""}`;

const DOOR_W = 3.6; // clear opening, metres
const DOOR_H = 2.7;
const JAMB = 0.35;

/**
 * A doorway you can see is a doorway: two jambs, a lintel and a pair of glass
 * leaves in the opening, set along the wall (its direction is at right angles
 * to door → inside). `out` metres pushes it outward for the street side, and
 * a canopy over the pavement says "entrance" from a distance.
 */
function doorway(e, mats, rings, { out = 0, canopy = false } = {}) {
  const g = new THREE.Group();
  const ins = e.inside || { x: e.x, z: e.z };
  // Along the wall the door is in: the nearest ring edge, not door→inside,
  // which the planner may have set at an angle (the frame came out skewed).
  let tx; let tz;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const dx = bx - ax; const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.z - az) * dz) / len2));
      const d = Math.hypot(ax + t * dx - e.x, az + t * dz - e.z);
      if (d < best) { best = d; tx = dx / Math.sqrt(len2); tz = dz / Math.sqrt(len2); }
    }
  }
  // Inward normal: the side the inside point is on.
  let nx = -tz; let nz = tx;
  if ((ins.x - e.x) * nx + (ins.z - e.z) * nz < 0) { nx = -nx; nz = -nz; }
  const cx = e.x - nx * out;
  const cz = e.z - nz * out;
  const yaw = -Math.atan2(tz, tx);
  const place = (geo, ax, ay, az) => { geo.rotateY(yaw); geo.translate(ax, ay, az); return geo; };
  const half = DOOR_W / 2 + JAMB / 2;
  g.add(new THREE.Mesh(place(new THREE.BoxGeometry(JAMB, DOOR_H + JAMB, 0.5), cx + tx * half, (DOOR_H + JAMB) / 2, cz + tz * half), mats.door));
  g.add(new THREE.Mesh(place(new THREE.BoxGeometry(JAMB, DOOR_H + JAMB, 0.5), cx - tx * half, (DOOR_H + JAMB) / 2, cz - tz * half), mats.door));
  g.add(new THREE.Mesh(place(new THREE.BoxGeometry(DOOR_W + 2 * JAMB, JAMB, 0.5), cx, DOOR_H + JAMB / 2, cz), mats.door));
  g.add(new THREE.Mesh(place(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.06), cx, DOOR_H / 2, cz), mats.glass));
  if (canopy) {
    g.add(new THREE.Mesh(place(new THREE.BoxGeometry(DOOR_W + 2.4, 0.25, 3.2), cx - nx * 1.6, DOOR_H + 0.9, cz - nz * 1.6), mats.door));
  }
  return g;
}

/** All of a floor's shapes: footprints, then connectors. */
const shapesOf = (floor) => [...floor.rings, ...(floor.links || []).map((l) => l.ring)];

function buildFloorInterior(floor, floorH, mats, entrances) {
  const g = new THREE.Group();
  g.position.y = floor.y;
  g.visible = false;

  floor.rings.forEach((ring) => {
    g.add(new THREE.Mesh(flatPatch(ring, 0.02), mats.floor));
    g.add(new THREE.Mesh(flatPatch(ring, floorH - 0.05), mats.ceiling));
  });
  for (const l of floor.links || []) {
    g.add(new THREE.Mesh(flatPatch(l.ring, 0.02 + LINK_SINK), mats.floor));
    g.add(new THREE.Mesh(flatPatch(l.ring, floorH - 0.05 - LINK_SINK), mats.ceiling));
  }
  const interior = floor.interior;
  const perimeter = interior ? interior.perimeter : [];
  const partitions = interior ? wallSegments(interior) : [];
  const walls = wallGeometry([...perimeter, ...partitions], floorH);
  if (walls) g.add(new THREE.Mesh(walls, mats.wall));

  const cores = [];
  for (const n of floor.nodes) {
    if (n.kind !== "elevator") continue;
    cores.push(boxAt(CORE, floorH, CORE, n.x, 0, n.z));
    const label = labelSprite(`🛗 ${n.label || "Elevator"}`, "elevator", 1.4);
    label.position.set(n.x, floorH - 0.8, n.z);
    g.add(label);
  }
  if (cores.length) g.add(new THREE.Mesh(mergeGeometries(cores, false), mats.core));

  const stairs = floor.stairs || null;
  if (stairs) {
    g.add(new THREE.Mesh(boxAt(STAIR[0], floorH, STAIR[1], stairs.x, 0, stairs.z), mats.stairs));
    const label = labelSprite("Stairs (position estimated)", "stairs", 0.8);
    label.position.set(stairs.x, floorH - 0.9, stairs.z);
    g.add(label);
  }

  const discs = [];
  for (const n of floor.nodes) {
    if (n.kind !== "room") continue;
    const disc = new THREE.CircleGeometry(ROOM_R, 24);
    disc.rotateX(-Math.PI / 2);
    disc.translate(n.x, 0.06, n.z);
    discs.push(disc);
    const text = n.roomN != null ? `${n.roomN} · ${n.label}` : n.label;
    const label = labelSprite(text, "room", 1.0);
    label.position.set(n.x, 2.1, n.z);
    g.add(label);
  }
  if (discs.length) g.add(new THREE.Mesh(mergeGeometries(discs, false), mats.room));

  if (floor.id === "1") {
    for (const e of entrances) {
      g.add(doorway(e, mats, floor.rings)); // the opening itself, not a slab across it
      const label = labelSprite(`${doorText(e)} · exit`, "entrance", 1.1);
      label.position.set(e.x, DOOR_H + 1.2, e.z);
      g.add(label);
    }
  }
  return { group: g, stairs };
}

export function buildHospital(world, hospital) {
  const { floorH, floors, entrances } = hospital;
  // Interiors are lit rooms, not outdoors: the scene's sun and sky lighting
  // barely reaches a ceiling seen from below or a north-facing wall, so the
  // surfaces carry an emissive base that reads as indoor lighting in both themes.
  const lit = (color, k = 0.55) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: k });
  const mats = {
    floor: lit(0xe9e5dc, 0.35),
    ceiling: new THREE.MeshLambertMaterial({ color: 0xf4f1ea, emissive: 0xf4f1ea, emissiveIntensity: 0.7, side: THREE.DoubleSide }),
    wall: lit(0xf3f0e8, 0.5),
    core: new THREE.MeshLambertMaterial({ color: 0x1f4e8c, emissive: 0x0b2a52, emissiveIntensity: 0.6 }), // elevator blue: it must be findable
    glass: new THREE.MeshLambertMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    stairs: new THREE.MeshLambertMaterial({ color: 0xb9a878 }),
    room: new THREE.MeshLambertMaterial({ color: 0x00a6ce, transparent: true, opacity: 0.55 }),
    door: new THREE.MeshLambertMaterial({ color: 0x00a651, emissive: 0x004d22, emissiveIntensity: 0.6 }),
  };

  const exterior = new THREE.Group();
  const massingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  world.themeTargets.catMats["hospital#massing"] = massingMat;
  const exteriorByFloor = new Map();
  for (const f of floors) {
    const g = new THREE.Group();
    for (const ring of f.rings) {
      const geo = extrudedRing(ring, floorH);
      geo.translate(0, f.y, 0);
      const mesh = new THREE.Mesh(geo, massingMat);
      mesh.userData.pickable = true;
      g.add(mesh);
    }
    // Connectors: a hair lower than the towers they join, so the roofs don't fight.
    for (const l of f.links || []) {
      const geo = extrudedRing(l.ring, floorH - LINK_SINK);
      geo.translate(0, f.y, 0);
      const mesh = new THREE.Mesh(geo, massingMat);
      mesh.userData.pickable = true;
      g.add(mesh);
    }
    exteriorByFloor.set(f.id, g);
    exterior.add(g);
  }
  world.scene.add(exterior);

  const interior = new THREE.Group();
  const interiorByFloor = new Map();
  const stairsByFloor = new Map();
  for (const f of floors) {
    // One degenerate ring must cost one floor's interior, not the whole boot.
    try {
      const built = buildFloorInterior(f, floorH, mats, entrances);
      interiorByFloor.set(f.id, built.group);
      stairsByFloor.set(f.id, built.stairs);
      interior.add(built.group);
    } catch (err) {
      console.error(`hospital: floor ${f.id} interior failed to build — skipped`, err);
      const empty = new THREE.Group();
      empty.visible = false;
      interiorByFloor.set(f.id, empty);
      interior.add(empty);
    }
  }
  world.scene.add(interior);


  const byId = new Map(floors.map((f) => [f.id, f]));
  const order = floors.map((f) => f.id);
  const shapes = new Map(floors.map((f) => [f.id, shapesOf(f)]));

  // Outdoor entrance markers so the doors can be found from the street.
  const doorMarks = new THREE.Group();
  for (const e of entrances) {
    // A framed glass door with a canopy, proud of the wall: the massing behind it
    // is one solid extrusion, so this is what makes the entrance visible.
    doorMarks.add(doorway(e, mats, byId.get("1").rings, { out: 0.7, canopy: true }));
    const label = labelSprite(`${doorText(e)} ▸`, "entrance", 1.3);
    label.position.set(e.x, 5.2, e.z);
    doorMarks.add(label);
  }
  world.scene.add(doorMarks);

  return {
    floors,
    byId,
    order,
    floorH,
    entrances,
    banks: hospital.banks,
    floor: (id) => byId.get(id) || null,
    /** Inside the floor's outline (footprints and connectors) — walls not considered. */
    contains: (id, x, z) => shapes.get(id).some((r) => pointInPolygon(x, z, r)),
    /** Inside the outline AND clear of every wall: what the walker collides with. */
    walkable(id, x, z) {
      const f = byId.get(id);
      return f.interior ? walkable(f.interior, shapes.get(id), x, z) : this.contains(id, x, z);
    },
    /**
     * A walk along the floor's corridors from one point to another, honouring
     * walls; a straight line where a floor has no interior plan.
     * @returns {{pts: Array<[x, z]>, length: number}}
     */
    route(id, from, to) {
      const f = byId.get(id);
      const r = f.interior ? routeIndoor(f.interior, from, to) : null;
      return r || { pts: [[from.x, from.z], [to.x, to.z]], length: Math.hypot(to.x - from.x, to.z - from.z) };
    },
    /**
     * Where to stand after stepping out of an elevator or stairwell at (x, z):
     * the nearest corridor cell centre that is not the core's own cell, so the
     * walker lands in the corridor, not in the box and not in a room across a wall.
     */
    exitSpot(id, x, z) {
      const f = byId.get(id);
      const it = f.interior;
      if (!it) return { x, z };
      const { frame, cells } = it;
      const { i: ci, j: cj } = cellOf(frame, x, z);
      let best = null;
      for (let r = 1; r <= 2 && !best; r++) {
        for (let j = cj - r; j <= cj + r; j++) {
          for (let i = ci - r; i <= ci + r; i++) {
            if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !inGrid(frame, i, j)) continue;
            if (cells[idx(frame, i, j)] !== CORRIDOR) continue;
            const [px, pz] = cellCenter(frame, i, j);
            if (!walkable(it, shapes.get(id), px, pz)) continue;
            const d = Math.hypot(px - x, pz - z);
            if (!best || d < best.d) best = { x: px, z: pz, d };
          }
        }
      }
      return best || { x, z };
    },
    /** The NEAREST entrance within r — two doors can sit within one radius of each other. */
    entranceNear(x, z, r = DOOR_RADIUS_IN) {
      let best = null;
      let bestD = r;
      for (const e of entrances) {
        const d = Math.hypot(e.x - x, e.z - z);
        if (d <= bestD) { bestD = d; best = e; }
      }
      return best;
    },
    /** A point DOOR_STEP metres inside (or outside) the door: the data's `inside` point, or its mirror. */
    throughDoor(door, inward) {
      if (door.inside) {
        return inward ? { x: door.inside.x, z: door.inside.z } : { x: 2 * door.x - door.inside.x, z: 2 * door.z - door.inside.z };
      }
      const f = byId.get("1");
      const dx = f.center[0] - door.x;
      const dz = f.center[1] - door.z;
      const l = Math.hypot(dx, dz) || 1;
      const s = (inward ? 1 : -1) * DOOR_STEP;
      return { x: door.x + (dx / l) * s, z: door.z + (dz / l) * s };
    },
    elevatorNear(id, x, z, r = CELL_RADIUS) {
      const f = byId.get(id);
      return f.nodes.find((n) => n.kind === "elevator" && Math.hypot(n.x - x, n.z - z) <= r + CORE / 2) || null;
    },
    stairsNear(id, x, z, r = CELL_RADIUS) {
      const s = stairsByFloor.get(id);
      return s && Math.hypot(s.x - x, s.z - z) <= r + STAIR[1] / 2 ? s : null;
    },
    stairsOn: (id) => stairsByFloor.get(id) || null,
    /** The floor's node for a bank, nearest to (x, z); the main elevator as a fallback. */
    elevatorOn(id, elevatorId, x, z) {
      const f = byId.get(id);
      const cands = f.nodes.filter((n) => n.kind === "elevator" && (!elevatorId || n.elevatorId === elevatorId));
      cands.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      return cands[0] || f.nodes.find((n) => n.kind === "elevator") || { x: f.center[0], z: f.center[1] };
    },
    reachableBy(elevatorId) {
      const bank = hospital.banks[elevatorId];
      return bank ? bank.reaches.filter((id) => byId.has(id)) : order;
    },
    stairNeighbours(id) {
      const i = order.indexOf(id);
      return { up: order[i + 1] || null, down: order[i - 1] || null };
    },
    /** Cutaway: show one floor's interior and hide the massing above it; null = outside. */
    setInside(id) {
      const cur = id ? byId.get(id).index : null;
      for (const f of floors) {
        exteriorByFloor.get(f.id).visible = cur === null || f.index < cur;
        interiorByFloor.get(f.id).visible = f.id === id;
      }
      doorMarks.visible = id === null;
    },
  };
}
