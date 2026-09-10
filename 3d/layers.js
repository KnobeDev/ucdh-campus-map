// Health-specific layers: active construction zones (fenced, filled, labelled,
// and solid to the walker), shuttle stops, SacRT bus stops and typed points of
// interest (valet, assisted drop-off, bike lockers…). All from the same curated
// data the 2D map shows, with the 2D layer toggles mirrored in the HUD.
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";
import { flatPatch } from "./geometry.js?v=6";
import { labelSprite } from "./labels.js?v=6";
import { isZoneActive } from "./route-core.js?v=2";
import { pointInPolygon } from "./buildings.js?v=6";

const FENCE_H = 2.2;
const POST_H = 2.6;
const POST_SPACING = 3.0; // metres between fence posts
const FILL_Y = 0.1; // above surfaces (≤0.08), below the guide ribbon (0.12)

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

const centroidOf = (ring) => [
  ring.reduce((s, p) => s + p[0], 0) / ring.length,
  ring.reduce((s, p) => s + p[1], 0) / ring.length,
];

export function buildConstruction(world, zones, today) {
  const group = new THREE.Group();
  world.scene.add(group);
  const active = zones.filter((z) => z.ring.length >= 3 && isZoneActive(z, today));
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const fillMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  const postMat = new THREE.MeshLambertMaterial({ color: 0xffb000 });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.16, POST_H, 6);
  postGeo.translate(0, POST_H / 2, 0);

  const labels = new THREE.Group(); // fill + labels: the toggle; fences + posts stay
  group.add(labels);
  const fences = [];
  const posts = [];
  for (const z of active) {
    fences.push(fenceGeometry(z.ring));
    try {
      labels.add(new THREE.Mesh(flatPatch(z.ring, FILL_Y), fillMat));
    } catch {
      console.warn(`construction: zone ${z.id} fill is degenerate; fence only`);
    }
    posts.push(...postsAlong(z.ring));
    const [cx, cz] = centroidOf(z.ring);
    const until = z.endDate ? ` · until ${z.endDate}` : "";
    const label = labelSprite(`🚧 ${z.name}${until}`, "stairs", 1.3);
    label.position.set(cx, 5, cz);
    labels.add(label);
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
    /** Hides the fill and labels only — the fence is a wall and stays. */
    setVisible: (v) => { labels.visible = v; },
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
