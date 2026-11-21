// Where things stand on a designed building's roof (tools/lib/designs.js says
// which buildings have a design). Pure: no three.js, so the node tests check it.
import { formatUntilDate } from "./caution-core.js?v=1";

/**
 * What identify says about a building site, after its floors: that it is one,
 * until when, and that the map draws its finished design. Null for a finished building.
 */
export function siteStatus(f) {
  if (!f || !f.underConstruction) return null;
  const until = formatUntilDate(f.underConstruction.endDate);
  return `under construction${until ? ` until ${until}` : ""}${f.design ? ", shown as the finished design" : ""}`;
}

/** Area-weighted centroid of a ring [[x, z], ...]. */
export function centroidOf(ring) {
  let a = 0; let cx = 0; let cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const f = x1 * z2 - x2 * z1;
    a += f; cx += (x1 + x2) * f; cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * a), cz / (3 * a)];
}

export function inRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The ring's long axis: unit vector of its principal direction (second moments of its vertices). */
export function longAxis(ring) {
  const [cx, cz] = centroidOf(ring);
  let sxx = 0; let szz = 0; let sxz = 0;
  for (const [x, z] of ring) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  return [Math.cos(theta), Math.sin(theta)];
}

/** Distance from p to the ring's nearest edge. */
function edgeDistance([px, pz], ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const dx = bx - ax; const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx - px, az + t * dz - pz));
  }
  return best;
}

/**
 * Helipads spread along the roof's long axis, each kept `radius` + 1 m inside
 * the roof's edge (pulled toward the centre until it fits), and a plant room at
 * the centre between them.
 * @returns {{ helipads: Array<[number, number]>, plant: {x:number, z:number, along:[number, number]} }}
 */
export function roofLayout(ring, { helipads = 2, radius = 7 } = {}) {
  const [cx, cz] = centroidOf(ring);
  const [ax, az] = longAxis(ring);
  // half the roof's length along the axis
  let half = 0;
  for (const [x, z] of ring) half = Math.max(half, Math.abs((x - cx) * ax + (z - cz) * az));
  const spots = [];
  for (let k = 0; k < helipads; k++) {
    const f = helipads === 1 ? 0 : -1 + (2 * k) / (helipads - 1); // -1 … 1
    let s = f * half * 0.62;
    let p = [cx + ax * s, cz + az * s];
    for (let tries = 0; tries < 40 && !(inRing(p, ring) && edgeDistance(p, ring) >= radius + 1); tries++) {
      s *= 0.9;
      p = [cx + ax * s, cz + az * s];
    }
    spots.push(p);
  }
  return { helipads: spots, plant: { x: cx, z: cz, along: [ax, az] } };
}
