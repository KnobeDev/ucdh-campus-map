// Indoor collision against partition walls, with no three.js in it, so the
// walker (player.js), the router (wayfind.js) and the node tests all apply
// the SAME rule to the same data: a wall is a segment [[ax, az], [bx, bz]]
// from campus-data.json's hospital floors, and the walker is a disc.

export const WALKER_R = 0.45; // metres: half a shoulder width plus the wall's own thickness

/** Is (x, z) within r of any wall segment? */
export function wallNear(walls, x, z, r = WALKER_R) {
  for (const [[ax, az], [bx, bz]] of walls) {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + t * dx - x;
    const pz = az + t * dz - z;
    if (px * px + pz * pz <= r * r) return true;
  }
  return false;
}
