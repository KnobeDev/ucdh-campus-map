// Renders the OSM path network as flat ribbons and OSM areas (lots, parks) as
// flat patches. Walkways sit on top of everything they cross — on a wayfinding
// map they are the primary circulation and must never be hidden by a lot edge.
import * as THREE from "./lib/three.module.js";
import { flatPatch, mergeBuckets } from "./geometry.js?v=6";

// y-stack: lawn/park 0.015 < street 0.02 < service 0.03 < lot 0.04 < flat
// building patch 0.05 < cycle 0.06 < foot 0.07 < steps 0.08.
const Y_BY_KIND = {
  green: 0.015, pitch: 0.02, street: 0.02, service: 0.03, parking: 0.04,
  cycle: 0.06, foot: 0.07, steps: 0.08,
};

// OSM area kinds we draw, mapped to a surface bucket. Large landuse polygons
// (residential blocks, whole schools) are deliberately NOT here: they'd paint
// entire districts and z-fight everything on them.
export const AREA_KIND = { // also read by the inset map, so both maps colour areas alike
  parking: "parking",
  park: "green", garden: "green", grass: "green", recreation_ground: "green",
  village_green: "green", greenfield: "green", playground: "green",
  pitch: "pitch",
};

const MITER_LIMIT = 2.5; // stop sharp joints from spiking the ribbon outward

/**
 * A flat ribbon of the given width along a polyline, as an indexed
 * BufferGeometry with position/normal/uv — the same attribute set as
 * ShapeGeometry, so ribbons and patches could share a merge bucket.
 */
export function ribbonGeometry(pts, width, y) {
  const n = pts.length;
  if (n < 2) return null;
  const half = width / 2;
  const pos = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx = [];

  // Direction of segment i (from pts[i] to pts[i+1]), unit length.
  const dir = (i) => {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return [(bx - ax) / l, (bz - az) / l];
  };

  for (let i = 0; i < n; i++) {
    // At either end there is only one real segment: use it for both sides, so
    // the cap is square. Averaging against a synthetic zero vector made cosHalf
    // collapse to 0 and every ribbon flared to MITER_LIMIT at its last vertex.
    const dIn = i === 0 ? dir(0) : dir(i - 1);
    const dOut = i === n - 1 ? dIn : dir(i);
    // Joint direction = average of the two segment directions; offset along its
    // normal, scaled by the miter factor (clamped) so the ribbon keeps constant width.
    let tx = dIn[0] + dOut[0];
    let tz = dIn[1] + dOut[1];
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-6) { tx = dOut[0]; tz = dOut[1]; } else { tx /= tl; tz /= tl; }
    const cosHalf = tx * dOut[0] + tz * dOut[1];
    const miter = Math.min(1 / Math.max(cosHalf, 1e-3), MITER_LIMIT);
    const nx = -tz * half * miter;
    const nz = tx * half * miter;
    const [x, z] = pts[i];
    const L = i * 2;
    pos.set([x + nx, y, z + nz], L * 3);
    pos.set([x - nx, y, z - nz], (L + 1) * 3);
    nrm.set([0, 1, 0, 0, 1, 0], L * 3);
    uv.set([0, i, 1, i], L * 2);
    if (i < n - 1) {
      // Two triangles per segment, wound so the face normal points +y.
      idx.push(L, L + 2, L + 1, L + 1, L + 2, L + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

export function buildGroundSurfaces(world, paths, areas) {
  const buckets = {};
  let skipped = 0;

  for (const p of paths) {
    const y = Y_BY_KIND[p.kind];
    if (y === undefined) continue;
    const geo = ribbonGeometry(p.pts, p.width, y);
    if (geo) (buckets[p.kind] ||= []).push(geo);
    else skipped++; // a one-point way; count it rather than lose it silently
  }
  for (const a of areas) {
    const kind = AREA_KIND[a.kind];
    if (!kind || a.ring.length < 3) continue;
    try {
      (buckets[kind] ||= []).push(flatPatch(a.ring, Y_BY_KIND[kind]));
    } catch {
      skipped++;
    }
  }

  const group = new THREE.Group();
  mergeBuckets(buckets, group, (kind, mat) => { world.themeTargets.surfaceMats[kind] = mat; });
  world.scene.add(group);
  if (skipped) console.warn(`ground: skipped ${skipped} degenerate path(s)/area(s)`);
  return group;
}
