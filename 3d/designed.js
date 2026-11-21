// Buildings drawn as they look (tools/lib/designs.js): the California Tower, a
// 14-storey slab of white fins over pale-blue glass with two rooftop helipads,
// drawn finished while still a site (the rest of its OSM site is the fenced lot);
// Shriners Hospital, 8 storeys of pale stone banded in mauve with green-framed
// windows, behind a 2-storey colonnaded front on its plaza; and
// the MIND Institute, 2 storeys of sandstone with a round tower at its entrance;
// Aggie Square: glass over a brick base, brick, pale walls, a parking garage;
// Betty Irene Moore Hall: white panels on stacked stone, with its canopy;
// and Parking Structure 3: six open decks behind light horizontal bands, two stair
// towers and three solar canopies on posts on its roof deck.
//
// Everything is drawn from plain shapes and small canvas patterns made here:
// no photo, rendering or texture of the real building is used. The storeys and
// where the slab ends are estimates (the info card says so via heightSource).
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { extrudedRing, flatPatch } from "./geometry.js?v=7";
import { roofLayout, centroidOf, inRing } from "./design-core.js?v=2";

const STOREY = 4.2; // metres: matches the data's hospital storey (tools/lib/heights.js)
const PLANT_H = 5.5; // rooftop plant room
const PAD_R = 7; // helipad radius, metres
const PAD_Y = 0.3; // above the roof it sits on (with a polygon offset, so it never shimmers from afar)
export const DAY_EMISSIVE = 0x5a5a5a; // lifts the shaded walls by day (hospital.js too)

/**
 * A canvas pattern, repeated every `w` x `h` metres along a wall. ExtrudeGeometry's
 * side UVs are in metres with v = 1 - height (three r166 generateSideWallUV), so
 * the V repeat is negated and offset: the canvas's bottom edge then sits on each
 * floor line and its top under the next, counted from the ground.
 */
export function pattern(w, h, draw, px = 128) {
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

/** A window: glass with sky in its upper part, a frame and one mullion each way. */
function framedWindow(g, x, y, ww, wh, frame) {
  g.fillStyle = "#35565f"; g.fillRect(x, y, ww, wh);
  g.fillStyle = "#8db0bd"; g.fillRect(x, y, ww, wh * 0.3); // sky in the upper panes (canvas top = top of the storey)
  g.strokeStyle = frame; g.lineWidth = Math.max(1.5, ww * 0.05);
  g.strokeRect(x, y, ww, wh);
  g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + wh); g.moveTo(x, y + wh / 2); g.lineTo(x + ww, y + wh / 2); g.stroke();
}
const SHRINERS_GREEN = "#3c7a66"; // window frames
const SHRINERS_MAUVE = "#76668c"; // the band at each floor

/** Banded stone: pale stone, a mauve band at each floor, a green-framed window per bay, a small diamond on each pier. */
const bandedFacade = (storeyH = STOREY) => pattern(3.6, storeyH, (g, w, h) => {
  g.fillStyle = "#e4ddd5"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#d4cbc0"; g.fillRect(0, 0, w * 0.06, h); g.fillRect(w * 0.94, 0, w * 0.06, h); // the pier between bays
  g.fillStyle = SHRINERS_MAUVE; g.fillRect(0, h * 0.84, w, h * 0.09); // spandrel band, just above the floor line
  framedWindow(g, w * 0.22, h * 0.2, w * 0.56, h * 0.56, SHRINERS_GREEN);
  g.fillStyle = "#4f8f83"; // the diamond where pier and band meet
  g.beginPath(); g.moveTo(0, h * 0.8); g.lineTo(w * 0.06, h * 0.885); g.lineTo(0, h * 0.97); g.lineTo(-w * 0.06, h * 0.885); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(w, h * 0.8); g.lineTo(w * 1.06, h * 0.885); g.lineTo(w, h * 0.97); g.lineTo(w * 0.94, h * 0.885); g.closePath(); g.fill();
});

/**
 * Arcade: drawn two storeys high (the front is two storeys). Below, a colonnade:
 * stone columns and the dark, open arcade behind them; above, one tall green-framed
 * window per bay with a ring in its glass, a mauve band along the parapet.
 */
const arcadeFacade = (storeyH = STOREY) => pattern(5, storeyH * 2, (g, w, h) => {
  g.fillStyle = "#e4ddd5"; g.fillRect(0, 0, w, h);
  // the colonnade (lower storey; the canvas's bottom is the ground)
  g.fillStyle = "#3a3d40"; g.fillRect(w * 0.16, h * 0.6, w * 0.84, h * 0.4);
  g.fillStyle = "#d4cbc0"; g.fillRect(0, h * 0.55, w, h * 0.05); // the beam over the columns
  // the upper storey: a tall window with a ring in it
  const x = w * 0.2; const y = h * 0.1; const ww = w * 0.6; const wh = h * 0.4;
  framedWindow(g, x, y, ww, wh, SHRINERS_GREEN);
  g.strokeStyle = SHRINERS_GREEN; g.lineWidth = Math.max(1.5, ww * 0.04);
  g.beginPath(); g.arc(x + ww / 2, y + wh / 2, Math.min(ww, wh) * 0.3, 0, Math.PI * 2); g.stroke();
  g.fillStyle = SHRINERS_MAUVE; g.fillRect(0, h * 0.02, w, h * 0.045); // parapet band
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

/**
 * Open decks behind light horizontal bands (Parking Structure 3): a pale concrete
 * spandrel at the top of each storey (the deck above's edge, so the roof deck has
 * its parapet and the lowest deck opens at the ground), the dark deck behind thin
 * pale rails below it, a column at each bay. The rails are what glows in bands at night.
 */
const louvredFacade = (storeyH = 3.3) => pattern(8.5, storeyH, (g, w, h) => {
  g.fillStyle = "#454b51"; g.fillRect(0, 0, w, h); // the deck inside, in shadow
  g.fillStyle = "#f2f0ea";
  for (let k = 0; k < 4; k++) g.fillRect(0, h * (0.38 + k * 0.16), w, Math.max(1, h * 0.04)); // the rails
  g.fillStyle = "#dedad1"; g.fillRect(0, 0, w, h * 0.28); // the spandrel (canvas top = top of the storey)
  g.fillStyle = "#d2cec5"; g.fillRect(0, 0, w * 0.05, h); // the column
});

/** A stair/elevator tower over a roof deck: pale concrete, a tall glass strip with the stair behind it. */
const stairFacade = (h = 4.5) => pattern(7, h, (g, w, ht) => {
  g.fillStyle = "#e1ded7"; g.fillRect(0, 0, w, ht);
  g.fillStyle = "#4f7488"; g.fillRect(w * 0.3, ht * 0.12, w * 0.4, ht * 0.88);
  g.fillStyle = "#8fb1c3"; g.fillRect(w * 0.3, ht * 0.12, w * 0.4, ht * 0.25); // sky in the upper glass
  g.fillStyle = "#e1ded7"; g.fillRect(w * 0.49, ht * 0.12, w * 0.02, ht * 0.88); // mullion
});

/**
 * Solar canopies over a roof deck: for each panel a thin slab of solar modules at
 * `height`, on posts down its middle standing on the deck (`minHeight`).
 */
function solarCanopies(feature, pvMat, frameMat, postMat) {
  const T = 0.3;
  const out = [];
  const posts = [];
  for (const panel of feature.panels) {
    const slab = extrudedRing(panel.ring, T);
    slab.translate(0, feature.height - T, 0);
    out.push(new THREE.Mesh(slab, [pvMat, frameMat])); // groups: caps (the modules), sides (the frame)
    for (const [x, z] of panel.posts) {
      const post = new THREE.CylinderGeometry(0.2, 0.2, feature.height - T - feature.minHeight, 8);
      post.translate(x, feature.minHeight + (feature.height - T - feature.minHeight) / 2, z);
      posts.push(post);
    }
  }
  const postMesh = posts.length ? new THREE.Mesh(mergeGeometries(posts, false), postMat) : null;
  return { panels: out, posts: postMesh };
}

/** Stacked stone: long courses of uneven height in tan and grey, a low window band. */
const ledgeFacade = (storeyH = STOREY) => pattern(6, storeyH, (g, w, h) => {
  const tones = ["#cbbfae", "#a99d8d", "#d8cdbd", "#8f8577", "#c2b5a2", "#b3a795"];
  let y = 0; let k = 0;
  while (y < h) {
    const band = h * (0.035 + ((k * 37) % 7) * 0.012);
    g.fillStyle = tones[k % tones.length]; g.fillRect(0, y, w, band + 1);
    y += band; k++;
  }
  g.fillStyle = "#355a6e"; g.fillRect(w * 0.1, h * 0.55, w * 0.8, h * 0.22); // ribbon of glass low in the storey
});

/** White metal panels: vertical seams and one tall narrow window per bay. */
const panelFacade = (storeyH = STOREY) => pattern(4, storeyH, (g, w, h) => {
  g.fillStyle = "#f1f2f1"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#d9dcdc";
  for (let k = 1; k < 4; k++) g.fillRect((w * k) / 4, 0, Math.max(1, w * 0.008), h);
  g.fillStyle = "#2f4f63"; g.fillRect(w * 0.42, h * 0.18, w * 0.13, h * 0.6);
  g.fillStyle = "#c7ccce"; g.fillRect(w * 0.4, h * 0.16, w * 0.17, h * 0.03); // the little hood over each window
});

/**
 * A canopy: a thin roof over its ring at `height`, on slim posts. The posts stand
 * along its open (outer) edge when it has one (so none against the building walls
 * it meets), otherwise along every edge. Walkable underneath, so no part in collision.
 */
function canopy(feature, mat, postMat) {
  const { ring, height } = feature;
  const line = feature.outer && feature.outer.length > 1 ? feature.outer : [...ring, ring[0]];
  const edges = [];
  for (let i = 0; i + 1 < line.length; i++) edges.push([line[i], line[i + 1]]);
  const T = 0.45;
  const g = new THREE.Group();
  const slab = extrudedRing(ring, T);
  slab.translate(0, height - T, 0);
  g.add(new THREE.Mesh(slab, mat));
  // Posts evenly along the line by its length (an arc is many short edges), half a
  // spacing in from each end, each inset 1 m along its edge's inward normal.
  const POST = 7.5; // metres between posts
  const lens = edges.map(([[ax, az], [bx, bz]]) => Math.hypot(bx - ax, bz - az));
  const total = lens.reduce((a, b) => a + b, 0);
  const count = Math.max(2, Math.round(total / POST));
  const posts = [];
  for (let k = 0; k < count; k++) {
    let left = (total * (k + 0.5)) / count;
    let i = 0;
    while (i < edges.length - 1 && left > lens[i]) { left -= lens[i]; i++; }
    const [[ax, az], [bx, bz]] = edges[i];
    const len = lens[i] || 1;
    const t = Math.min(1, left / len);
    const px = ax + (bx - ax) * t; const pz = az + (bz - az) * t;
    let nx = -(bz - az) / len; let nz = (bx - ax) / len;
    if (!inRing([px + nx * 0.5, pz + nz * 0.5], ring)) { nx = -nx; nz = -nz; }
    const post = new THREE.CylinderGeometry(0.18, 0.18, height - T, 8);
    post.translate(px + nx, (height - T) / 2, pz + nz);
    posts.push(post);
  }
  if (posts.length) g.add(new THREE.Mesh(mergeGeometries(posts, false), postMat));
  return g;
}

/** A helipad marking: white disc, red ring, red cross. Drawn here, the usual aviation sign. */
export function padTexture() {
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
  const FACADES = { fins: towerFacade, ribbon: wingFacade, punched: punchedFacade, stone: stoneFacade, brick: brickFacade, glass: glassFacade, garage: garageFacade, ledge: ledgeFacade, panel: panelFacade, banded: bandedFacade, arcade: arcadeFacade, louvred: louvredFacade };
  // pale perforated metal: lit from within a little, so its underside reads pale too, not in shadow
  // Perforated metal panels: a light grid every 3 m (the slab's cap UVs are in metres).
  const panelGrid = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const gx = c.getContext("2d");
    gx.fillStyle = "#e3e6e8"; gx.fillRect(0, 0, 64, 64);
    gx.fillStyle = "#b9bec2"; gx.fillRect(0, 0, 64, 3); gx.fillRect(0, 0, 3, 64);
    gx.fillStyle = "#d3d7da"; for (let y = 8; y < 64; y += 8) for (let x = 8; x < 64; x += 8) gx.fillRect(x, y, 2, 2);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 3, 1 / 3);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const canopyMat = lit({ map: panelGrid, side: THREE.DoubleSide });
  canopyMat.userData.dayEmissive = 0x737779; // world.applyTheme: this by day, the shared window glow at night
  const postMat = lit({ color: 0xeeeeee });
  extraMats.push(canopyMat, postMat);
  // Solar modules: dark blue cells in a pale grid, one cell a metre (the slab's cap UVs are in metres).
  const pvGrid = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const gx = c.getContext("2d");
    gx.fillStyle = "#1d3557"; gx.fillRect(0, 0, 32, 32);
    gx.fillStyle = "#7d93ad"; gx.fillRect(0, 0, 32, 2); gx.fillRect(0, 0, 2, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const pvMat = lit({ map: pvGrid, side: THREE.DoubleSide }); // dark day and night: no glow
  const frameMat = lit({ color: 0xb9bdc0 });
  const stairWalls = new Map();
  const stairWall = (h) => {
    if (!stairWalls.has(h)) {
      const m = lit({ map: stairFacade(h) });
      m.userData.dayEmissive = DAY_EMISSIVE;
      m.emissiveMap = m.map;
      stairWalls.set(h, m);
      extraMats.push(m);
    }
    return stairWalls.get(h);
  };
  const stairRoof = lit({ color: 0x4d7398 }); // a blue metal roof over each tower
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
      if (feature.kind === "stair") {
        try {
          // a stair/elevator tower standing on the roof deck
          const rise = +(feature.height - feature.minHeight).toFixed(2);
          const geo = extrudedRing(feature.ring, rise);
          geo.translate(0, feature.minHeight, 0);
          const mesh = new THREE.Mesh(geo, [stairRoof, stairWall(rise)]);
          mesh.userData.design = `${d.name} · stair tower`;
          group.add(mesh);
        } catch (err) {
          console.error(`designed: ${d.name} stair tower failed to build — skipped`, err);
        }
        continue;
      }
      if (feature.kind === "solar") {
        try {
          const built = solarCanopies(feature, pvMat, frameMat, postMat);
          for (const m of built.panels) { m.userData.design = `${d.name} · solar canopy`; group.add(m); }
          if (built.posts) { built.posts.userData.design = `${d.name} · solar canopy posts`; group.add(built.posts); }
        } catch (err) {
          console.error(`designed: ${d.name} solar canopies failed to build — skipped`, err);
        }
        continue;
      }
      if (feature.kind === "canopy") {
        try {
          const c = canopy(feature, canopyMat, postMat);
          c.userData.design = `${d.name} · canopy`;
          group.add(c);
        } catch (err) {
          console.error(`designed: ${d.name} canopy failed to build — skipped`, err);
        }
        continue;
      }
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
