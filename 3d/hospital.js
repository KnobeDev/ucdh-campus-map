// The Medical Center, built from its floor plan rather than from OSM shells.
//
// Exterior: each registered floor ring extruded one storey — the true massing
// (podium, towers + pavilion, towers, Davis Tower). Interior: per floor, a
// slab, a ceiling, perimeter walls, elevator cores, an (estimated) stairwell,
// labelled room zones. When the walker is inside, floors above the current one
// are cut away so the inside is visible from any angle.
//
// What is and isn't real here, so nobody mistakes the picture for a survey:
//   · floor outlines, room positions and elevators come from the traced plan,
//     registered onto real OSM footprints (see tools/lib/floorplan.js);
//   · corridors are not traced yet, so each floor is open space;
//   · the printed plan shows no stairs; one stairwell per floor is placed
//     beside the main elevators and labelled "estimated".
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { flatPatch, extrudedRing } from "./geometry.js?v=6";
import { pointInPolygon } from "./buildings.js?v=6";
import { labelSprite } from "./labels.js?v=6";

const WALL_T = 0.35;
const CORE = 3.2; // elevator core footprint, metres
const STAIR = [3.0, 4.4]; // stairwell footprint
const STAIR_OFFSET = 6.5; // metres beside the main elevator
const ROOM_R = 3.2;
export const CELL_RADIUS = 2.6; // "near enough" to use an elevator or stairs
// Doors are snapped onto the registered floor-1 wall, but outdoor collision
// uses the OSM outline, which runs up to ~12 m OUTSIDE that wall (the diagram
// is not to scale). So from the street a door is "near" from further away than
// it is from inside; either way the walker is placed just through it.
export const DOOR_RADIUS_OUT = 18.0;
export const DOOR_RADIUS_IN = 4.0;
export const DOOR_STEP = 2.0; // metres past the door the walker is placed

function wallGeometry(ring, floorH) {
  const parts = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
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

/** Stairwell beside the floor's main elevator, nudged to stay inside the ring. */
function stairSpot(floor) {
  const main = floor.nodes.find((n) => n.id === `T_${floor.id}_elev_main`) || floor.nodes.find((n) => n.kind === "elevator");
  if (!main) return null;
  for (const dx of [STAIR_OFFSET, -STAIR_OFFSET, 0]) {
    for (const dz of [0, STAIR_OFFSET, -STAIR_OFFSET]) {
      const x = main.x + dx;
      const z = main.z + dz;
      if ((dx || dz) && pointInPolygon(x, z, floor.ring)) return { x, z };
    }
  }
  // Nowhere to put it without sitting on the elevator core (where the elevator
  // would always win the proximity check). Better no stairs than unreachable ones.
  console.warn(`hospital: floor ${floor.id} has no room for a stairwell beside the elevators; none placed`);
  return null;
}

/** Accessible entrances say so on their sign — that is what the ♿ flag is for. */
const doorText = (e) => `${e.label || "Entrance"}${e.accessible ? " ♿" : ""}`;

function buildFloorInterior(floor, floorH, mats, entrances) {
  const g = new THREE.Group();
  g.position.y = floor.y;
  g.visible = false;

  g.add(new THREE.Mesh(flatPatch(floor.ring, 0.02), mats.floor));
  g.add(new THREE.Mesh(flatPatch(floor.ring, floorH - 0.05), mats.ceiling));
  const walls = wallGeometry(floor.ring, floorH);
  if (walls) g.add(new THREE.Mesh(walls, mats.wall));

  const cores = [];
  for (const n of floor.nodes) {
    if (n.kind !== "elevator") continue;
    cores.push(boxAt(CORE, floorH, CORE, n.x, 0, n.z));
    const label = labelSprite(n.label || "Elevator", "elevator", 0.9);
    label.position.set(n.x, floorH - 0.9, n.z);
    g.add(label);
  }
  if (cores.length) g.add(new THREE.Mesh(mergeGeometries(cores, false), mats.core));

  const stairs = stairSpot(floor);
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
      g.add(new THREE.Mesh(boxAt(3.6, 2.6, 0.5, e.x, 0, e.z), mats.door));
      const label = labelSprite(doorText(e), "entrance", 0.9);
      label.position.set(e.x, 3.3, e.z);
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
    core: new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
    stairs: new THREE.MeshLambertMaterial({ color: 0xb9a878 }),
    room: new THREE.MeshLambertMaterial({ color: 0x00a6ce, transparent: true, opacity: 0.55 }),
    door: new THREE.MeshLambertMaterial({ color: 0x00a651, emissive: 0x004d22, emissiveIntensity: 0.6 }),
  };

  const exterior = new THREE.Group();
  const massingMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  world.themeTargets.catMats["hospital#massing"] = massingMat;
  const exteriorByFloor = new Map();
  for (const f of floors) {
    const geo = extrudedRing(f.ring, floorH);
    geo.translate(0, f.y, 0);
    const mesh = new THREE.Mesh(geo, massingMat);
    mesh.userData.pickable = true;
    exteriorByFloor.set(f.id, mesh);
    exterior.add(mesh);
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

  // Outdoor entrance markers so the doors can be found from the street.
  const doorMarks = new THREE.Group();
  for (const e of entrances) {
    const label = labelSprite(`${doorText(e)} ▸`, "entrance", 1.3);
    label.position.set(e.x, 5.2, e.z);
    doorMarks.add(label);
  }
  world.scene.add(doorMarks);

  const byId = new Map(floors.map((f) => [f.id, f]));
  const order = floors.map((f) => f.id);

  return {
    floors,
    byId,
    order,
    floorH,
    entrances,
    banks: hospital.banks,
    floor: (id) => byId.get(id) || null,
    contains: (id, x, z) => pointInPolygon(x, z, byId.get(id).ring),
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
    /** A point DOOR_STEP metres inside (or outside) the door, along the wall normal. */
    throughDoor(door, inward) {
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
