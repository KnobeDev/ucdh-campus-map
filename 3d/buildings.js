// Extrudes building footprints, merged per category for draw-call sanity, and
// builds the spatial index later phases use for picking and player collision.
//
// Two populations: campus buildings (identity from the 2D map, one or more
// footprints each — the Medical Center is five) and unnamed context buildings
// (the surrounding neighbourhood). Flat footprints — surface lots matched to
// an OSM area — render as ground patches, never as boxes.
//
// Merge rule carried over from the Davis build: every geometry in one
// mergeGeometries bucket must have an IDENTICAL attribute set and index-ness,
// or the whole bucket silently returns null and vanishes. Extrude + Shape both
// carry position/normal/uv and are indexed, so they may share a bucket; never
// add a BoxGeometry (uv layout differs) to either.
import * as THREE from "./lib/three.module.js";
import { flatPatch, extrudedRing, mergeBuckets } from "./geometry.js?v=6";

const CELL = 60; // metres, spatial hash cell
const FLAT_Y = 0.05; // ground patches: above lawn (0.03), below walkways (0.07)

function bboxOf(ring) {
  return ring.reduce(
    (a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

const footprintGeometry = (ring, height) =>
  height > 0 ? extrudedRing(ring, height) : flatPatch(ring, FLAT_Y);

function registerInIndex(index, entry) {
  const [minx, minz, maxx, maxz] = entry.bbox;
  for (let cx = Math.floor(minx / CELL); cx <= Math.floor(maxx / CELL); cx++) {
    for (let cz = Math.floor(minz / CELL); cz <= Math.floor(maxz / CELL); cz++) {
      const k = cx + "," + cz;
      if (!index.cells.has(k)) index.cells.set(k, []);
      index.cells.get(k).push(entry);
    }
  }
}

/**
 * @returns {{group: THREE.Group, index: {cells: Map, entries: Array}}}
 *   index entries: { building, footprint, ring, bbox, solid } — one per footprint,
 *   so a five-footprint complex is five collidable shapes that all answer to one name.
 */
export function buildBuildings(world, buildings, context) {
  const buckets = {}; // "cat" | "cat#flat" -> geometry list
  const index = { cells: new Map(), entries: [] };
  let skipped = 0;

  const add = (bucketKey, ring, height, entry) => {
    let geo;
    try {
      geo = footprintGeometry(ring, height);
    } catch {
      skipped++; // a degenerate ring; better a missing box than a striped one
      return;
    }
    (buckets[bucketKey] ||= []).push(geo);
    // Only register what actually rendered — a failed footprint must not become
    // an invisible collidable ghost.
    if (entry) {
      index.entries.push(entry);
      registerInIndex(index, entry);
    }
  };

  for (const b of buildings) {
    for (const f of b.footprints) {
      const solid = f.height > 0;
      // Rendered by another module (the Medical Center is built from its floor
      // plan by hospital.js): keep the footprint solid for collision, skip the box.
      if (b.renderedBy) {
        const entry = { building: b, footprint: f, ring: f.ring, bbox: bboxOf(f.ring), solid: true };
        index.entries.push(entry);
        registerInIndex(index, entry);
        continue;
      }
      add(solid ? b.cat : `${b.cat}#flat`, f.ring, f.height, {
        building: b,
        footprint: f,
        ring: f.ring,
        bbox: bboxOf(f.ring),
        solid,
      });
    }
  }
  for (const c of context) {
    add("context", c.ring, c.height, {
      building: null,
      footprint: c,
      ring: c.ring,
      bbox: bboxOf(c.ring),
      solid: c.height > 0,
    });
  }

  const group = new THREE.Group();
  // applyTheme resolves the palette entry from the key's prefix ("hospital#flat" -> hospital)
  mergeBuckets(buckets, group, (key, mat) => { world.themeTargets.catMats[key] = mat; }, {
    pickable: (key) => key !== "context",
  });
  world.scene.add(group);
  if (skipped) console.warn(`buildings: skipped ${skipped} degenerate footprint(s)`);
  return { group, index };
}

export function pointInPolygon(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The index entry whose footprint contains world point (x, z); solidOnly ignores flat patches. */
export function footprintAt(index, x, z, solidOnly) {
  const cands = index.cells.get(Math.floor(x / CELL) + "," + Math.floor(z / CELL));
  if (!cands) return null;
  for (const e of cands) {
    if (solidOnly && !e.solid) continue;
    const [minx, minz, maxx, maxz] = e.bbox;
    if (x < minx || x > maxx || z < minz || z > maxz) continue;
    if (pointInPolygon(x, z, e.ring)) return e;
  }
  return null;
}
