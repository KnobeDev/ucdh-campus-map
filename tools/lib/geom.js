// Planar polygon helpers, all operating on [[x, z], ...] rings in ENU metres.
"use strict";

function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    // Degenerate ring — fall back to the vertex mean.
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

function bbox(ring) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

function contains(ring, [px, pz]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Intersection-over-union, estimated by sampling on a fixed metric grid.
 *
 * A sampled IoU rather than an exact polygon clip: the inputs are a hand-traced
 * schematic footprint and an OSM trace of the same building, so they never agree
 * to better than a few metres anyway (the georeference itself carries 9.5 m RMS).
 * A 1 m grid is far below that noise floor, and it cannot produce the degenerate
 * self-intersection cases an exact clipper has to defend against.
 */
function iou(ringA, ringB, cell = 1.0) {
  const a = bbox(ringA);
  const b = bbox(ringB);
  const minX = Math.min(a.minX, b.minX);
  const minZ = Math.min(a.minZ, b.minZ);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxZ = Math.max(a.maxZ, b.maxZ);
  // Guard against a pathological ring blowing the sample count up.
  const cols = Math.ceil((maxX - minX) / cell);
  const rows = Math.ceil((maxZ - minZ) / cell);
  if (cols <= 0 || rows <= 0 || cols * rows > 4e6) return 0;

  let both = 0;
  let either = 0;
  for (let r = 0; r < rows; r++) {
    const z = minZ + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cell;
      const inA = contains(ringA, [x, z]);
      const inB = contains(ringB, [x, z]);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either === 0 ? 0 : both / either;
}

/** Fraction of ringB's area that falls inside ringA. */
function coverage(ringA, ringB, cell = 1.0) {
  const b = bbox(ringB);
  const cols = Math.ceil((b.maxX - b.minX) / cell);
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  if (cols <= 0 || rows <= 0 || cols * rows > 4e6) return 0;

  let inB = 0;
  let inBoth = 0;
  for (let r = 0; r < rows; r++) {
    const z = b.minZ + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = b.minX + (c + 0.5) * cell;
      if (!contains(ringB, [x, z])) continue;
      inB++;
      if (contains(ringA, [x, z])) inBoth++;
    }
  }
  return inB === 0 ? 0 : inBoth / inB;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Drop near-duplicate and spike vertices.
 *
 * Ported from the Davis build (newmap/gen_3d_data.js): traced footprints often
 * retrace a segment, and extruding a ring that doubles back on itself makes
 * earcut emit striped garbage walls.
 */
function cleanRing(pts, minEdge = 0.35) {
  let out = pts.filter((p, i) => dist(p, pts[(i - 1 + pts.length) % pts.length]) > minEdge);
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const v1 = [b[0] - a[0], b[1] - a[1]];
      const v2 = [c[0] - b[0], c[1] - b[1]];
      const cross = v1[0] * v2[1] - v1[1] * v2[0];
      const dot = v1[0] * v2[0] + v1[1] * v2[1];
      if (!(Math.abs(cross) < 0.3 && dot < 0)) next.push(b); // spike = collinear + reversing
    }
    if (next.length === out.length) break;
    out = next;
  }
  return out.length >= 3 ? out : pts;
}

/** OSM rings repeat the first node as the last; three.js shapes must not. */
function openRing(ring) {
  if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-6) return ring.slice(0, -1);
  return ring;
}

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const roundRing = (ring, dp = 2) => ring.map(([x, z]) => [round(x, dp), round(z, dp)]);

module.exports = {
  area,
  centroid,
  bbox,
  contains,
  iou,
  coverage,
  dist,
  cleanRing,
  openRing,
  round,
  roundRing,
};
