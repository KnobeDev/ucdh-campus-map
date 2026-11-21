// Buildings drawn as their finished design (tools/lib/designs.js): today the
// California Tower, a 14-storey slab of white fins over pale-blue glass with
// two rooftop helipads, and its 3-storey wing with a roof garden.
//
// Everything is drawn from plain shapes and small canvas patterns made here:
// no photo, rendering or texture of the real building is used. The storeys and
// the slab/wing split are estimates (the info card says so via heightSource).
import * as THREE from "./lib/three.module.js";
import { extrudedRing, flatPatch } from "./geometry.js?v=7";
import { roofLayout } from "./design-core.js?v=1";

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
const towerFacade = () => pattern(9, STOREY, (g, w, h) => {
  g.fillStyle = "#b4d2e4"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#d3e4ef"; g.fillRect(0, 0, w, h * 0.45); // sky caught in the upper glass
  g.fillStyle = "#fbfcfc";
  for (const [x, fw] of [[0, 0.12], [0.2, 0.07], [0.33, 0.13], [0.53, 0.08], [0.66, 0.12], [0.84, 0.06], [0.94, 0.06]]) g.fillRect(x * w, 0, fw * w, h);
  g.fillStyle = "#eef1f2"; g.fillRect(0, h * 0.88, w, h * 0.12);
});

/** Wing facade: white spandrel with one ribbon window per storey, thin mullions. */
const wingFacade = () => pattern(6, STOREY, (g, w, h) => {
  g.fillStyle = "#f1f2f0"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#9fc1d6"; g.fillRect(0, h * 0.18, w, h * 0.5);
  g.fillStyle = "#f1f2f0";
  for (let x = 0; x < w; x += w / 4) g.fillRect(x, h * 0.18, w * 0.03, h * 0.5);
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
    tower: lit({ map: towerFacade() }),
    wing: lit({ map: wingFacade() }),
    // By day a pale facade on its shaded side still reads as pale (world.applyTheme swaps in the night glow).
    roof: lit({ color: 0xd9dcdc }),
    garden: lit({ color: 0x6f9a52 }),
    plant: lit({ color: 0xe6e8e8 }),
    pad: new THREE.MeshLambertMaterial({ map: padTexture(), transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  for (const { footprint } of designed) {
    const d = footprint.design;
    const before = group.children.length;
    for (const part of d.parts) {
      try {
        // ExtrudeGeometry: group 0 is the caps (roof and underside), group 1 the walls.
        const roof = part.role === "wing" ? mats.garden : mats.roof;
        const mesh = new THREE.Mesh(extrudedRing(part.ring, part.height), [roof, part.role === "wing" ? mats.wing : mats.tower]);
        mesh.userData.pickable = true;
        mesh.userData.design = `${d.name} · ${part.role}`;
        group.add(mesh);
        if (part.role !== "tower") continue;
        const layout = roofLayout(part.ring, { helipads: (d.roof && d.roof.helipads) || 0, radius: PAD_R });
        group.add(plantRoom(layout.plant, part.height, mats.plant));
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
    if (group.children.length === before) {
      // nothing of this design built: at least show where it stands
      try { group.add(new THREE.Mesh(flatPatch(footprint.ring, 0.05), mats.roof)); } catch { /* nothing to draw */ }
    }
  }
  for (const m of [mats.tower, mats.wing, mats.plant]) {
    m.emissiveMap = m.map || null;
    m.userData.dayEmissive = DAY_EMISSIVE;
  }
  world.scene.add(group);
  // Night: the facades take the same faint window glow as every other building (world.applyTheme).
  return { group, materials: [mats.tower, mats.wing, mats.plant] };
}
