// Pure spatial helpers for the non-visual layer (sonar, identify): no three.js,
// node-testable.

const DIRS = ["ahead", "ahead right", "right", "behind right", "behind", "behind left", "left", "ahead left"];

/** Nearest point on a ring's edges to (px, pz). */
export function nearestOnRing(px, pz, ring) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < best.d) best = { d, x: qx, z: qz };
  }
  return best;
}

/**
 * One of eight direction words for a target relative to the walker's facing.
 * yaw follows the player: forward = (-sin yaw, -cos yaw) in the x/z plane.
 */
export function directionLabel(yaw, px, pz, tx, tz) {
  const facing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  const toTarget = Math.atan2(tx - px, tz - pz);
  let rel = toTarget - facing;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return DIRS[((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Spoken distance: metres, rounded so it reads naturally. */
export function metresWord(m) {
  if (m < 3) return "right here";
  if (m < 20) return `${Math.round(m)} metres`;
  return `${Math.round(m / 5) * 5} metres`;
}

/**
 * Places that are a point, not an outline (a building shown as a signpost), within `reach`
 * metres of (px, pz), nearest first: what sonar names beside the outlined buildings.
 * @param {{name: string, x: number, z: number}[]} places
 * @returns {{name: string, d: number, x: number, z: number}[]}
 */
export function placesInReach(places, px, pz, reach) {
  return places
    .map((p) => ({ name: p.name, d: Math.hypot(p.x - px, p.z - pz), x: p.x, z: p.z }))
    .filter((p) => p.d <= reach)
    .sort((a, b) => a.d - b.d);
}

/**
 * The nearest such place in front of the walker: within `reach` metres and within
 * `halfAngle` radians of the way they face (forward = (-sin yaw, -cos yaw)). What
 * "What's ahead" names when no outlined building is in view.
 * @returns {{place: object, d: number} | null}
 */
export function placeAhead(places, px, pz, yaw, { reach = 30, halfAngle = Math.PI / 4 } = {}) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best = null;
  for (const place of places) {
    const dx = place.x - px;
    const dz = place.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > reach) continue;
    // Standing on it counts as ahead; otherwise it must lie inside the cone.
    if (d > 1 && (dx * fx + dz * fz) / d < Math.cos(halfAngle)) continue;
    if (!best || d < best.d) best = { place, d };
  }
  return best;
}
