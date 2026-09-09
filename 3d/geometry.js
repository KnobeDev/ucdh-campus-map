// Shared geometry helpers for the scene builders.
//
// Every builder turns ENU rings ([[x, z], ...], metres, +z south) into three.js
// shapes the same way, and every builder merges its geometries into one mesh
// per material the same way. Keeping both here means the merge rule — every
// geometry in a bucket must share an identical attribute set and index-ness,
// or mergeGeometries silently returns null — is enforced in exactly one place.
import * as THREE from "./lib/three.module.js";
import { mergeGeometries } from "./lib/BufferGeometryUtils.js";

/** ENU ring -> THREE.Shape in the (x, -z) plane, which rotateX(-90°) lifts upright. */
export function ringShape(ring) {
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], -ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
  shape.closePath();
  return shape;
}

/** A flat patch of the ring at height y. */
export function flatPatch(ring, y) {
  const geo = new THREE.ShapeGeometry(ringShape(ring));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** The ring extruded straight up by height metres. */
export function extrudedRing(ring, height) {
  const geo = new THREE.ExtrudeGeometry(ringShape(ring), { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // shape (x, -z) extruded along +y' -> world (x, up, z)
  return geo;
}

/**
 * Merge each bucket of geometries into one Mesh, register its material under
 * `register(key, mat)` for theming, and add the meshes to `group`.
 * A bucket that fails to merge is reported loudly — it would otherwise vanish.
 */
export function mergeBuckets(buckets, group, register, { pickable } = {}) {
  for (const [key, geos] of Object.entries(buckets)) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) {
      console.error(`bucket "${key}" failed to merge (${geos.length} geometries) — attribute mismatch?`);
      continue;
    }
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    register(key, mat);
    const mesh = new THREE.Mesh(merged, mat);
    if (pickable) mesh.userData.pickable = pickable(key);
    group.add(mesh);
  }
}
