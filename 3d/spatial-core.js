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
