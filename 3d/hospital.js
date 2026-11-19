// The Medical Center, built from its floor plan rather than from OSM shells.
//
// Each floor carries the REAL OSM footprints of its tier (one ring for the
// podium, several for the tower floors) plus the connector bands that join
// them into one building — see tools/lib/floorplan.js. Exterior: every ring
// extruded one storey, which is the true massing. Interior: per ring, a slab
// and a ceiling; per floor, the exterior wall pieces of the rings' union, the
// inferred partition walls, elevator cores, the (estimated) stairwell and
// labelled room zones. When the walker is inside, floors above the current
// one are cut away so the inside stays visible.
//
// What is and isn't real here, so nobody mistakes the picture for a survey:
//   · floor outlines are real OSM footprints — exact; the bands joining the
//     towers are corridor-width links between their nearest edges;
//   · room and elevator positions come from the printed plan, which is drawn
//     in oblique projection and "not to scale", so they are fitted into the
//     footprint and clamped inside it: approximate by construction;
//   · corridors and partitions are inferred from those room positions
//     (tools/lib/interior.js), not surveyed;
//   · the printed plan shows no stairs; one stairwell per floor is placed
//     beside the main elevators and labelled "estimated".
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { flatPatch, extrudedRing } from "./geometry.js?v=6";
import { pointInPolygon } from "./buildings.js?v=6";
import { labelSprite } from "./labels.js?v=6";
import { wallNear } from "./floor-core.js?v=1";

const WALL_T = 0.35;
const CORE = 3.2; // elevator core footprint, metres
const STAIR = [3.0, 4.4]; // stairwell footprint
const ROOM_R = 3.2;
const LAYER = 0.004; // metres between overlapping slabs (a connector over a tower) so they never z-fight
const CONNECTOR_DROP = 0.03; // a connector's roof sits this far below the towers it joins, for the same reason
export const CELL_RADIUS = 2.6; // "near enough" to use an elevator or stairs
// The floor-1 outline and the outdoor collision footprint are now the SAME
// geometry (the real OSM podium), so a door needs only a tight radius on both
// sides. It used to be 18 m outdoors purely to bridge the gap left by fitting
// the oblique floor drawing onto the building — that gap is gone.
export const DOOR_RADIUS_OUT = 6.0;
export const DOOR_RADIUS_IN = 4.0;
export const DOOR_STEP = 2.0; // metres past the door the walker is placed

/** Full-height walls along segments [[ax, az], [bx, bz]] — the outline, or the partitions. */
function wallGeometry(segments, floorH) {
  const parts = [];
  for (const [[ax, az], [bx, bz]] of segments) {
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

const isConnector = (floor, i) => (floor.ringSources?.[i] || "").startsWith("connector:");

/** Accessible entrances say so on their sign — that is what the ♿ flag is for. */
const doorText = (e) => `${e.label || "Entrance"}${e.accessible ? " ♿" : ""}`;

function buildFloorInterior(floor, floorH, mats, entrances) {
  const g = new THREE.Group();
  g.position.y = floor.y;
  g.visible = false;

  floor.rings.forEach((ring, i) => {
    // Rings overlap where a connector joins a tower: stagger the slabs a hair.
    g.add(new THREE.Mesh(flatPatch(ring, 0.02 + i * LAYER), mats.floor));
    g.add(new THREE.Mesh(flatPatch(ring, floorH - 0.05 - i * LAYER), mats.ceiling));
  });
  // Exterior walls follow the union of the rings (a tower edge that lies
  // inside a connector band is an opening, not a wall); partitions are the
  // inferred department walls, with door gaps where the corridors pass.
  const outline = wallGeometry(floor.outline || [], floorH);
  if (outline) g.add(new THREE.Mesh(outline, mats.wall));
  const partitions = wallGeometry(floor.walls || [], floorH);
  if (partitions) g.add(new THREE.Mesh(partitions, mats.partition));

  const cores = [];
  for (const n of floor.nodes) {
    if (n.kind !== "elevator") continue;
    cores.push(boxAt(CORE, floorH, CORE, n.x, 0, n.z));
    const label = labelSprite(n.label || "Elevator", "elevator", 0.9);
    label.position.set(n.x, floorH - 0.9, n.z);
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
    partition: lit(0xe6e1d6, 0.45),
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
    const g = new THREE.Group();
    f.rings.forEach((ring, i) => {
      const geo = extrudedRing(ring, floorH - (isConnector(f, i) ? CONNECTOR_DROP : 0));
      geo.translate(0, f.y, 0);
      const mesh = new THREE.Mesh(geo, massingMat);
      mesh.userData.pickable = true;
      g.add(mesh);
    });
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
    contains: (id, x, z) => byId.get(id).rings.some((r) => pointInPolygon(x, z, r)),
    /** Inside the floor AND clear of its partition walls: where the walker may stand. */
    walkable(id, x, z) {
      const f = byId.get(id);
      return f.rings.some((r) => pointInPolygon(x, z, r)) && !wallNear(f.walls || [], x, z);
    },
    /** The floor's corridor centrelines, as route-core paths. */
    corridorPaths: (id) => (byId.get(id).corridors || []).map((pts) => ({ kind: "foot", pts })),
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
