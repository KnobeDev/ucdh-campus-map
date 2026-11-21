// Buildings drawn as they look (tools/lib/designs.js): the California Tower, a
// 14-storey slab of white fins over pale-blue glass with two rooftop helipads,
// and its 3-storey wing with a roof garden, drawn finished while still a site;
// Shriners Hospital, 8 storeys of pale stone with a grid of blue windows; and
// the MIND Institute, 2 storeys of sandstone with a round tower at its entrance;
// and Aggie Square: glass over a brick base, brick, pale walls, a parking garage.
//
// Everything is drawn from plain shapes and small canvas patterns made here:
// no photo, rendering or texture of the real building is used. The storeys and
// the slab/wing split are estimates (the info card says so via heightSource).
import * as THREE from "./lib/three.module.js";
import { extrudedRing, flatPatch } from "./geometry.js?v=7";
import { roofLayout, centroidOf, inRing } from "./design-core.js?v=2";

const STOREY = 4.2; // metres: matches the data's hospital storey (tools/lib/heights.js)
const PLANT_H = 5.5; // rooftop plant room
const PAD_R = 7; // helipad radius, metres
const PAD_Y = 0.3; // above the roof it sits on (with a polygon offset, so it never shimmers from afar)
const DAY_EMISSIVE = 0x5a5a5a; // lifts the shaded walls by day

/**
 * A canvas pattern, repeated every `w` x `h` metres along a wall. ExtrudeGeometry's
 * side UVs are in metres with v = 1 - height (three r166 generateSideWallUV), so
 * the V repeat is negated and offset: the canvas's bottom edge then sits on each
 * floor line and its top under the next, counted from the ground.
 */
function pattern(w, h, draw, px = 128) {
  const c = document.createElement("canvas");
  c.width = px;
  c.height = Math.round((px * h) / w);
  draw(c.getContext("2d"), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / w, -1 / h);
  t.offset.set(0, 1 / h);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Tower facade: one storey of pale-blue glass behind white vertical fins of uneven widths, slab edge at the floor. */
const towerFacade = (storeyH = STOREY) => pattern(9, storeyH, (g, w, h) => {
  g.fillStyle = "#b4d2e4"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#d3e4ef"; g.fillRect(0, 0, w, h * 0.45); // sky caught in the upper glass
  g.fillStyle = "#fbfcfc";
  for (const [x, fw] of [[0, 0.12], [0.2, 0.07], [0.33, 0.13], [0.53, 0.08], [0.66, 0.12], [0.84, 0.06], [0.94, 0.06]]) g.fillRect(x * w, 0, fw * w, h);
  g.fillStyle = "#eef1f2"; g.fillRect(0, h * 0.88, w, h * 0.12);
});

/** Wing facade: white spandrel with one ribbon window per storey, thin mullions. */
const wingFacade = (storeyH = STOREY) => pattern(6, storeyH, (g, w, h) => {
  g.fillStyle = "#f1f2f0"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#9fc1d6"; g.fillRect(0, h * 0.18, w, h * 0.5);
  g.fillStyle = "#f1f2f0";
  for (let x = 0; x < w; x += w / 4) g.fillRect(x, h * 0.18, w * 0.03, h * 0.5);
});

/** Punched windows: pale stone, one blue window per bay, a dark band at each floor. */
const punchedFacade = (storeyH = STOREY) => pattern(3.6, storeyH, (g, w, h) => {
  g.fillStyle = "#efe6df"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6fa6bd"; g.fillRect(w * 0.22, h * 0.3, w * 0.56, h * 0.5);
  g.fillStyle = "#a9cfe0"; g.fillRect(w * 0.22, h * 0.3, w * 0.56, h * 0.2); // sky in the upper pane (canvas top = top of the storey)
  g.fillStyle = "#94606c"; g.fillRect(0, h * 0.08, w, h * 0.07);
});

/** Sandstone: coursed blocks, one tall window per bay. */
const STONE_BAY = 4.5;
const stoneDraw = (g, w, h) => {
  g.fillStyle = "#d8b68d"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#c39f77";
  for (let k = 1; k < 7; k++) g.fillRect(0, (h * k) / 7, w, Math.max(1, h * 0.012)); // bed joints
  for (let k = 0; k < 7; k++) g.fillRect(((k % 2 ? 0.25 : 0.75) * w), (h * k) / 7, Math.max(1, w * 0.01), h / 7); // staggered head joints
  g.fillStyle = "#5d8ea6"; g.fillRect(w * 0.36, h * 0.22, w * 0.28, h * 0.6);
  g.fillStyle = "#9cc2d4"; g.fillRect(w * 0.36, h * 0.22, w * 0.28, h * 0.16); // sky in the upper pane (canvas top = top of the storey)
};
const stoneFacade = (storeyH = STOREY) => pattern(STONE_BAY, storeyH, stoneDraw);

/**
 * A round tower. CylinderGeometry's side UVs run 0..1 around and 0 (bottom) to 1
 * (top), so its pattern repeats once per bay around and once per storey up.
 */
function drum(feature, mats) {
  const { x, z, radius, height, floors } = feature;
  const g = new THREE.CylinderGeometry(radius, radius, height, 40, 1, false);
  g.translate(x, height / 2, z);
  const wall = mats.drumWall.clone();
  wall.map = mats.drumWall.map.clone();
  wall.map.repeat.set(Math.max(1, Math.round((2 * Math.PI * radius) / STONE_BAY)), floors);
  wall.map.offset.set(0, 0);
  wall.map.needsUpdate = true;
  wall.emissiveMap = wall.map;
  wall.userData.dayEmissive = DAY_EMISSIVE;
  const mesh = new THREE.Mesh(g, [wall, mats.roof, mats.roof]); // groups: side, top, bottom
  const cornice = new THREE.CylinderGeometry(radius + 0.35, radius + 0.35, 0.6, 40, 1, false);
  cornice.translate(x, height - 0.3, z);
  return { mesh, cornice: new THREE.Mesh(cornice, mats.plant), wall };
}

/** Red brick: running-bond courses, one tall window per bay. */
const brickFacade = (storeyH = STOREY) => pattern(4.2, storeyH, (g, w, h) => {
  g.fillStyle = "#a4563f"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#8f4a36";
  for (let k = 1; k < 14; k++) g.fillRect(0, (h * k) / 14, w, Math.max(1, h * 0.01));
  g.fillStyle = "#4f7d93"; g.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.62);
  g.fillStyle = "#8fb6c8"; g.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.16); // sky in the upper pane
  g.fillStyle = "#cfc6bb"; g.fillRect(w * 0.28, h * 0.82, w * 0.44, h * 0.04); // sill
});

/** Blue glass curtain wall: light mullions, a spandrel at each floor, sky in the upper half. */
const glassFacade = (storeyH = STOREY) => pattern(3, storeyH, (g, w, h) => {
  g.fillStyle = "#3f6f95"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#7fa7c6"; g.fillRect(0, 0, w, h * 0.42);
  g.fillStyle = "#2c5274"; g.fillRect(0, h * 0.86, w, h * 0.14);
  g.fillStyle = "#d9e0e5"; g.fillRect(0, 0, w * 0.04, h); g.fillRect(0, h * 0.84, w, h * 0.03);
});

/** Parking decks: a concrete spandrel band at each level, open and dark above it. */
const garageFacade = (storeyH = 3) => pattern(4, storeyH, (g, w, h) => {
  g.fillStyle = "#3d4247"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#b9b5ad"; g.fillRect(0, h * 0.62, w, h * 0.38);
  g.fillStyle = "#a8a49c"; g.fillRect(0, 0, w * 0.08, h); // column
});

/** A helipad marking: white disc, red ring, red cross. Drawn here, the usual aviation sign. */
function padTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#f6f6f2"; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#c8102e"; g.lineWidth = 16; g.beginPath(); g.arc(128, 128, 108, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c8102e"; g.fillRect(104, 52, 48, 152); g.fillRect(52, 104, 152, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The plant room: a box at the roof's centre, long along the roof's long axis. */
function plantRoom(plant, y, mat) {
  const g = new THREE.BoxGeometry(18, PLANT_H, 10);
  g.rotateY(-Math.atan2(plant.along[1], plant.along[0]));
  g.translate(plant.x, y + PLANT_H / 2, plant.z);
  return new THREE.Mesh(g, mat);
}

/**
 * Draw every footprint that carries a design. Collision and picking stay with
 * buildings.js, which indexes the footprint's outline like any other building.
 * @param {Array<{building, footprint}>} designed
 * @returns {{ group: THREE.Group, materials: THREE.Material[] }}
 */
export function buildDesigned(world, designed) {
  const group = new THREE.Group();
  const lit = (opts) => new THREE.MeshLambertMaterial(opts);
  const mats = {
    drumWall: lit({ map: pattern(STONE_BAY, STOREY, stoneDraw) }),
    // By day a pale facade on its shaded side still reads as pale (world.applyTheme swaps in the night glow).
    roof: lit({ color: 0xd9dcdc }),
    garden: lit({ color: 0x6f9a52 }),
    plant: lit({ color: 0xe6e8e8 }),
    pad: new THREE.MeshLambertMaterial({ map: padTexture(), transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  const extraMats = []; // per-feature materials that also take the day/night glow
  // Walls: one material per facade and storey height, so a pattern's floor line
  // repeats with the building's own storeys (3.6 m flats, 4.6 m labs, 3 m decks).
  const FACADES = { fins: towerFacade, ribbon: wingFacade, punched: punchedFacade, stone: stoneFacade, brick: brickFacade, glass: glassFacade, garage: garageFacade };
  const wallMats = new Map();
  const wallMat = (facade, storeyH) => {
    const make = FACADES[facade] || FACADES.punched;
    const key = `${FACADES[facade] ? facade : "punched"}@${storeyH}`;
    if (!wallMats.has(key)) wallMats.set(key, lit({ map: make(storeyH) }));
    return wallMats.get(key);
  };
  for (const { footprint } of designed) {
    const d = footprint.design;
    const before = group.children.length;
    for (const part of d.parts) {
      try {
        // ExtrudeGeometry: group 0 is the caps (roof and underside), group 1 the walls.
        const roof = part.roof === "garden" ? mats.garden : mats.roof;
        const walls = wallMat(part.facade, part.storeyH || STOREY);
        // a stacked part (glass over a brick base) starts at its minHeight
        const lift = part.minHeight || 0;
        const geo = extrudedRing(part.ring, part.height - lift);
        if (lift) geo.translate(0, lift, 0);
        const mesh = new THREE.Mesh(geo, [roof, walls]);
        mesh.userData.pickable = true;
        mesh.userData.design = `${d.name} · ${part.role}`;
        group.add(mesh);
        if (!part.plant && !part.helipads) continue;
        const layout = roofLayout(part.ring, { helipads: part.helipads || 0, radius: PAD_R });
        // the plant room at the roof's centre, unless the outline curls round so the centre is open air
        if (part.plant && inRing(centroidOf(part.ring), part.ring)) group.add(plantRoom(layout.plant, part.height, mats.plant));
        for (const [x, z] of layout.helipads) {
          const pad = new THREE.CircleGeometry(PAD_R, 40);
          pad.rotateX(-Math.PI / 2);
          pad.translate(x, part.height + PAD_Y, z);
          group.add(new THREE.Mesh(pad, mats.pad));
        }
      } catch (err) {
        // One bad ring costs that part, not the map: fall back to the plain outline.
        console.error(`designed: ${d.name} ${part.role} failed to build — skipped`, err);
      }
    }
    for (const feature of d.features || []) {
      if (feature.kind !== "drum") continue;
      try {
        const built = drum(feature, mats);
        built.mesh.userData.pickable = true;
        built.mesh.userData.design = `${d.name} · rotunda`;
        group.add(built.mesh, built.cornice);
        extraMats.push(built.wall);
      } catch (err) {
        console.error(`designed: ${d.name} rotunda failed to build — skipped`, err);
      }
    }
    if (group.children.length === before) {
      // nothing of this design built: at least show where it stands
      try { group.add(new THREE.Mesh(flatPatch(footprint.ring, 0.05), mats.roof)); } catch { /* nothing to draw */ }
    }
  }
  for (const m of [...wallMats.values(), mats.plant]) {
    m.emissiveMap = m.map || null;
    m.userData.dayEmissive = DAY_EMISSIVE;
  }
  world.scene.add(group);
  // Night: the facades take the same faint window glow as every other building (world.applyTheme).
  return { group, materials: [...wallMats.values(), mats.plant, ...extraMats] };
}
