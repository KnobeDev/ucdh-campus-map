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
import { flatPatch, extrudedRing, mergeBuckets } from "./geometry.js?v=7";
import { buildDesigned } from "./designed.js?v=6";
import { drumRing } from "./design-core.js?v=2";

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
  const designed = []; // footprints drawn as their finished design
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
      // A site whose finished form is published (tools/lib/designs.js) is drawn as
      // that form by designed.js; it collides and answers to its name like any other.
      if (f.design && f.design.parts && f.design.parts.length) {
        // Collide and answer by the parts actually drawn, not the whole OSM outline: a design may
        // leave part of its site unbuilt (the California Tower's lot along X Street).
        const seen = new Set();
        for (const part of f.design.parts) {
          const key = JSON.stringify(part.ring);
          if (seen.has(key)) continue; // a base and the block above it share one ring
          seen.add(key);
          const entry = { building: b, footprint: f, ring: part.ring, bbox: bboxOf(part.ring), solid: true };
          index.entries.push(entry);
          registerInIndex(index, entry);
        }
        designed.push({ building: b, footprint: f });
        // A round tower may stand past OSM's outline: it collides and answers to the building's name too.
        for (const feature of f.design.features || []) {
          if (feature.kind !== "drum") continue;
          const ring = drumRing(feature);
          const drum = { building: b, footprint: f, ring, bbox: bboxOf(ring), solid: true };
          index.entries.push(drum);
          registerInIndex(index, drum);
        }
        continue;
      }
      // A building site: its planned mass as a translucent ghost so the caution
      // cover on the ground shows through. Still solid to the walker (it is fenced).
      const bucket = f.underConstruction ? "construction" : solid ? b.cat : `${b.cat}#flat`;
      add(bucket, f.ring, f.height, {
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
  mergeBuckets(buckets, group, (key, mat) => {
    if (key === "construction") {
      mat.transparent = true;
      mat.opacity = 0.3;
      mat.depthWrite = false;
      mat.color.setHex(0xff7a1a);
      world.themeTargets.ghostMat = mat; // theme.js: emissive only, the tint is the hazard colour
      return;
    }
    world.themeTargets.catMats[key] = mat;
  }, {
    pickable: (key) => key !== "context",
  });
  // Ghost outlines so a translucent mass still reads as a shape from every angle.
  const ghost = group.children.find((m) => m.userData && m.userData.bucket === "construction");
  if (ghost) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry, 20), new THREE.LineBasicMaterial({ color: 0xff7a1a }));
    edges.userData.pickable = false;
    group.add(edges);
  }
  world.scene.add(group);
  if (designed.length) {
    const out = buildDesigned(world, designed);
    world.themeTargets.designMats = out.materials;
  }
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
