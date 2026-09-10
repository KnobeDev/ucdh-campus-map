// Identify what's ahead: the E key (when not standing at an elevator) or a
// click on a building. A ray from the crosshair (E) or the pointer (click)
// meets a pickable mesh; the hit point is resolved to a building through the
// spatial index. Click fires on pointer-UP and a drag is not a click (SC 2.5.2).
import * as THREE from "./lib/three.module.js";
import { footprintAt } from "./buildings.js?v=6";
import { nearestOnRing, directionLabel, metresWord } from "./spatial-core.js?v=1";

const DRAG_TOLERANCE = 6; // px

export function createPicking(world, { index, player, onSelect }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = world.renderer.domElement;
  let downAt = null;

  function entryAt(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, world.camera);
    ray.camera = world.camera;
    for (const h of ray.intersectObjects(world.scene.children, true)) {
      if (!h.object.userData.pickable) continue;
      // Nudge the wall hit a little along the ray so it lands inside the footprint.
      const px = h.point.x + ray.ray.direction.x * 0.2;
      const pz = h.point.z + ray.ray.direction.z * 0.2;
      const e = footprintAt(index, px, pz, false) || footprintAt(index, h.point.x, h.point.z, false);
      if (e) return { entry: e, point: h.point, distance: h.distance };
      // A pickable surface that resolved to no footprint (a seam, an edge): keep looking along the ray.
    }
    return null;
  }

  /** A spoken/text description of an index entry from where the walker stands. */
  function describe(hit) {
    const p = player.object.position;
    const b = hit.entry.building;
    const f = hit.entry.footprint;
    const near = nearestOnRing(p.x, p.z, hit.entry.ring);
    const dir = directionLabel(player.object.rotation.y, p.x, p.z, near.x, near.z);
    const name = b ? b.name : f.name || "an unnamed building";
    const floors = f.floors ? `${f.floors} floor${f.floors === 1 ? "" : "s"} (${f.heightSource})` : null;
    return { name, building: b, footprint: f, distance: near.d, dir, floors,
      text: `${name}, ${metresWord(near.d)} ${dir}${floors ? `, ${floors}` : ""}.` };
  }

  const onPointerDown = (e) => { downAt = [e.clientX, e.clientY]; };
  const onPointerUp = (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > DRAG_TOLERANCE) return; // a drag is a look, not a pick
    const hit = entryAt(e.clientX, e.clientY);
    onSelect(hit ? describe(hit) : null);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);

  return {
    /** Identify whatever the crosshair is on. */
    identifyAhead() {
      const hit = entryAt(innerWidth / 2, innerHeight / 2);
      onSelect(hit ? describe(hit) : null);
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    },
  };
}

/** ENU metres -> lon/lat, for the Open in Maps handoff. */
export function enuToLonLat(x, z, origin) {
  const mPerDegLat = 110574.0;
  const mPerDegLon = 111320.0 * Math.cos((origin.lat * Math.PI) / 180);
  return { lon: origin.lon + x / mPerDegLon, lat: origin.lat - z / mPerDegLat };
}

/** Apple Maps on Apple hardware, Google Maps elsewhere — mirrors the 2D app. */
export function mapsUrl(lat, lon, name) {
  const q = encodeURIComponent(`${name}, UC Davis Health, Sacramento, CA`);
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  return apple
    ? `https://maps.apple.com/?ll=${lat.toFixed(6)},${lon.toFixed(6)}&q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}
