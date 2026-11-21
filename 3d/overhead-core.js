// The overhead ("helicopter") camera's decisions, kept pure (no three.js, no DOM) so node
// can test them: tools/test/overhead.test.js. 3d/overhead.js does the input and the camera.

// Below this the view is nearly level and one pixel of drag would cover a runaway stretch of ground.
const MIN_FORESHORTEN = 0.3;

/**
 * What a pointer drag does: pan the map, as a drag does on the 2D map (and as a finger can,
 * with no Shift key to hold), or with Shift held, turn and tilt the view around its spot.
 * @param {{ shiftKey: boolean }} e  the pointer event
 * @returns {"pan" | "orbit"}
 */
export const dragAction = (e) => (e.shiftKey ? "orbit" : "pan");

/**
 * A drag of (dx, dy) screen pixels as a pan in the camera's ground frame, so the ground under
 * the pointer follows the pointer: metres per pixel at the spot the camera looks at, with the
 * up/down direction stretched by the tilt (a tilted view shows more ground per pixel).
 * @returns {[number, number]} [right, away] in metres, for the camera's own right and away
 */
export function dragToPan({ dx, dy, dist, fovDeg, viewHeight, pitch }) {
  const mpp = (2 * dist * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(viewHeight, 1);
  const fore = Math.max(Math.sin(pitch), MIN_FORESHORTEN);
  return [-dx * mpp, (dy * mpp) / fore];
}

/**
 * The camera's right and away, in metres, as a move in the world (x east, z south). The camera
 * sits at heading `yaw` from its spot, so at yaw 0 it looks north and "away" is -z.
 * @returns {[number, number]} [dx, dz]
 */
export function panToWorld(yaw, right, away) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return [right * c - away * s, -right * s - away * c];
}

/**
 * The spot held inside the world's box (data.meta.world: the 3D world, not the 2D map's frame).
 * A value that isn't a finite number keeps the previous one, so one bad input can't lose the view.
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} box
 * @param {[number, number]} prev  the spot before this move
 * @returns {[number, number]}
 */
export function clampToBox(x, z, box, prev) {
  const fx = Number.isFinite(x) ? x : prev[0];
  const fz = Number.isFinite(z) ? z : prev[1];
  return [Math.min(Math.max(fx, box.minX), box.maxX), Math.min(Math.max(fz, box.minZ), box.maxZ)];
}
