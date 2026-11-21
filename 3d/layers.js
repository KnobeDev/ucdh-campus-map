// Health-specific layers: active construction zones (fenced, covered in hazard
// stripes, signed, and solid to the walker), shuttle stops, SacRT bus stops and
// typed points of interest (valet, assisted drop-off, bike lockers…). All from
// the same curated data the 2D map shows, with the 2D layer toggles mirrored
// in the HUD.
//
// What the "Construction labels" toggle hides: the signs only. The fence and
// the striped cover stay — a hazard is a hazard, and the walker still can't
// pass — just as the fence has always stayed. The Layers list is the text
// equivalent of everything here, so nothing visual is the only source.
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { flatPatch } from "./geometry.js?v=7";
import { labelSprite } from "./labels.js?v=6";
import { isZoneActive } from "./route-core.js?v=2";
import { pointInPolygon } from "./buildings.js?v=10";
import { cautionText, labelHeightFor, labelAnchors, signHeightAt, signHeightCap } from "./caution-core.js?v=1";
import { hazardMaterial, cautionSprite } from "./caution.js?v=1";

const FENCE_H = 2.2;
const POST_H = 2.6;
const POST_SPACING = 3.0; // metres between fence posts
const FILL_Y = 0.1; // above surfaces (≤0.08), below the guide ribbon (0.12); the cover is also polygon-offset toward the camera
const SIGN_CLEAR = 0.6; // metres of air between the fence top and the sign's bottom edge
const NAME_H = 1.3; // the zone's name plate, above the sign

/** Vertical fence ribbon around a ring, both faces visible. */
function fenceGeometry(ring) {
  const verts = [];
  const idx = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const v = verts.length / 3;
    verts.push(ax, 0, az, bx, 0, bz, bx, FENCE_H, bz, ax, FENCE_H, az);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function postsAlong(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / POST_SPACING));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  return out;
}

/** Put a sign (and its name plate, if any) at height h; the plate rides on top. */
function placeSign(s, h) {
  const f = h / s.base;
  const signY = s.floor + SIGN_CLEAR + h / 2;
  s.sign.position.y = signY;
  s.sign.scale.set(h * s.aspect, h, 1);
  if (!s.name) return;
  const nameH = NAME_H * f;
  s.name.position.y = signY + h / 2 + 0.15 * f + nameH / 2;
  s.name.scale.set(nameH * s.nameAspect, nameH, 1);
}

/**
 * The signs for one zone: the caution at every anchor, the name over the
 * first. Returns them with what the per-frame scaler needs: a sign is its base
 * height up close and grows with distance so it stays readable from overhead,
 * never wider than the zone allows (signHeightCap).
 */
function addSigns(labels, z) {
  const base = labelHeightFor(z.ring);
  const text = cautionText(z);
  return labelAnchors(z.ring).map(([x, zz], i) => {
    const sign = cautionSprite(`⚠ ${text}`, base);
    sign.position.set(x, 0, zz);
    labels.add(sign);
    const aspect = sign.scale.x / sign.scale.y;
    let name = null;
    if (i === 0) {
      name = labelSprite(`🚧 ${z.name}`, "stairs", NAME_H);
      name.position.set(x, 0, zz);
      labels.add(name);
    }
    // The sign clears the fence, or the tallest building on the site (a ghosted mass).
    const floor = Math.max(FENCE_H, z.coversHeight || 0);
    const s = { sign, name, base, aspect, floor, nameAspect: name ? name.scale.x / name.scale.y : 1, maxH: Math.max(base, signHeightCap(z.ring, aspect)) };
    placeSign(s, base);
    return s;
  });
}

export function buildConstruction(world, zones, today) {
  const group = new THREE.Group();
  world.scene.add(group);
  const active = zones.filter((z) => z.ring.length >= 3 && isZoneActive(z, today));
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const coverMat = hazardMaterial();
  const postMat = new THREE.MeshLambertMaterial({ color: 0xffb000 });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.16, POST_H, 6);
  postGeo.translate(0, POST_H / 2, 0);

  const labels = new THREE.Group(); // the signs: the toggle. Cover, fences and posts stay.
  group.add(labels);
  const fences = [];
  const posts = [];
  const signs = [];
  const camWorld = new THREE.Vector3(); // scratch for update()
  for (const z of active) {
    fences.push(fenceGeometry(z.ring));
    try {
      group.add(new THREE.Mesh(flatPatch(z.ring, FILL_Y), coverMat));
    } catch {
      console.warn(`construction: zone ${z.id} cover is degenerate; fence only`);
    }
    posts.push(...postsAlong(z.ring));
    signs.push(...addSigns(labels, z));
  }
  if (fences.length) {
    const merged = mergeGeometries(fences, false);
    if (merged) group.add(new THREE.Mesh(merged, fenceMat));
    else console.error("construction: fence geometries failed to merge — no fencing rendered");
  }
  if (posts.length) {
    const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); inst.setMatrixAt(i, m); });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return {
    active,
    group,
    /** Hides the signs only — the fence is a wall and the striped cover is the hazard; both stay. */
    setVisible: (v) => { labels.visible = v; },
    /** Per frame: size each sign for the camera's distance so it reads from the street and from overhead alike. */
    update() {
      if (!labels.visible) return;
      const cam = world.camera;
      // World position, not cam.position: while walking the camera is a child of the
      // player, so its local position is ~0 and every sign would scale to its maximum.
      cam.getWorldPosition(camWorld);
      const view = { fovDeg: cam.fov, viewportPx: innerHeight };
      for (const s of signs) {
        const d = s.sign.position.distanceTo(camWorld);
        placeSign(s, signHeightAt(d, s.base, s.maxH, view));
      }
    },
    /** The active zone containing (x, z), if any. */
    zoneAt: (x, z) => active.find((zn) => pointInPolygon(x, z, zn.ring)) || null,
  };
}

const OSM_DEDUPE_M = 25; // an OSM stop this close to a curated one (or another OSM one) is the same stop

/** One instanced post per layer plus a floating label per marker. */
function addMarkers(world, group, postGeo, color, items) {
  const inst = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color }), Math.max(items.length, 1));
  const m = new THREE.Matrix4();
  items.forEach((it, i) => { m.makeTranslation(it.x, 0, it.z); inst.setMatrixAt(i, m); });
  inst.count = items.length;
  inst.instanceMatrix.needsUpdate = true;
  group.add(inst);
  for (const it of items) {
    const label = labelSprite(it.text, it.style, it.height);
    label.position.set(it.x, POST_H + 0.9, it.z);
    group.add(label);
  }
  world.scene.add(group);
}

/** Drop OSM stops that duplicate a curated stop or each other. */
function dedupeStops(curated, osm) {
  const kept = [];
  for (const b of osm) {
    const near = (c) => Math.hypot(c.x - b.x, c.z - b.z) < OSM_DEDUPE_M;
    if (curated.some(near) || kept.some(near)) continue;
    kept.push(b);
  }
  return kept;
}

export function buildPointLayers(world, points, osmBusStops, poiTypes) {
  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, POST_H, 6);
  postGeo.translate(0, POST_H / 2, 0);
  const layers = { shuttle: new THREE.Group(), bus: new THREE.Group(), pois: new THREE.Group() };

  addMarkers(world, layers.shuttle, postGeo, 0x002855,
    points.shuttle.map((s) => ({ x: s.x, z: s.z, text: `🚐 ${s.name}`, style: "entrance", height: 1.0 })));
  addMarkers(world, layers.bus, postGeo, 0x4a4f57, [
    ...points.busStops.map((b) => ({ x: b.x, z: b.z, text: `🚌 ${b.name}`, style: "elevator", height: 0.9 })),
    ...dedupeStops(points.busStops, osmBusStops).map((b) => ({ x: b.x, z: b.z, text: `🚌 ${b.name || "Bus stop"}`, style: "elevator", height: 0.8 })),
  ]);
  addMarkers(world, layers.pois, postGeo, 0xc8102e,
    points.pois.map((p) => { const t = poiTypes[p.type] || poiTypes.general; return { x: p.x, z: p.z, text: `${t.icon} ${p.name}`, style: "room", height: 1.0 }; }));

  return {
    layers,
    setVisible(name, v) { if (layers[name]) layers[name].visible = v; },
  };
}

/**
 * A named signpost for every building that has no outline to build (the site's data, where
 * OpenStreetMap lacks one and a tracing of the official map never ships: `marker: true`).
 * Always shown: it is the building. Wayfinding reaches it by name from the destination list.
 */
export function buildPlaceMarkers(world, buildings) {
  const places = buildings.filter((b) => b.marker && b.center);
  const group = new THREE.Group();
  if (!places.length) return { group, count: 0 };
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, POST_H, 6);
  postGeo.translate(0, POST_H / 2, 0);
  addMarkers(world, group, postGeo, 0x002855,
    places.map((b) => ({ x: b.center.x, z: b.center.z, text: b.name, style: "entrance", height: 1.2 })));
  return { group, count: places.length };
}
