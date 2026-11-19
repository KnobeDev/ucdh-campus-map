// Where the walker lands after going through one of the Medical Center's doors.
// Pure: no three.js, so the node tests check it against the real footprints.
//
// The usual landing is DOOR_STEP metres past the door along the line from the
// door's inside point (or from the building's centre when a door has none).
// That spot is not always clear: the Main Entrance sits where two OSM
// footprints overlap, and 2 m out is still inside the second one — so the very
// next step counted as walking back in, and the walker was stuck in a loop of
// leaving and entering. The caller says what "clear" means on the far side; the
// landing moves further along the same line until it is clear with a margin.

export const DOOR_STEP = 2.0; // metres past the door the walker is placed
export const LANDING_MAX = 10; // metres: never set the walker down further than this from the door
export const LANDING_MARGIN = 0.6; // metres of clear ground kept around the landing, so a sidestep doesn't go back through
const STEP = 0.25;

/** Unit vector from the door toward the inside, and the usual step length. */
function inwardOf(door, center) {
  if (door.inside) {
    const dx = door.inside.x - door.x;
    const dz = door.inside.z - door.z;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) return { ux: dx / l, uz: dz / l, start: l };
  }
  const dx = (center ? center[0] : door.x) - door.x;
  const dz = (center ? center[1] : door.z) - door.z;
  const l = Math.hypot(dx, dz) || 1;
  return { ux: dx / l, uz: dz / l, start: DOOR_STEP };
}

const clearAround = (isClear, x, z, m) =>
  isClear(x, z) && isClear(x + m, z) && isClear(x - m, z) && isClear(x, z + m) && isClear(x, z - m);

/**
 * The spot to set the walker down after going through `door`.
 * @param {{x:number, z:number, inside?:{x:number, z:number}}} door
 * @param {boolean} inward  true = going in, false = coming out
 * @param {(x:number, z:number) => boolean} isClear  can the walker stand here, on the far side?
 * @param {[number, number]} [center]  the building's centre, for a door with no inside point
 * @returns {{x:number, z:number}}
 */
export function landingSpot(door, inward, isClear, center) {
  const { ux, uz, start } = inwardOf(door, center);
  const s = inward ? 1 : -1;
  const at = (d) => ({ x: door.x + ux * d * s, z: door.z + uz * d * s });
  // A door's own `inside` point is used exactly as given when it is clear (the
  // floor's walkable test already keeps a wall margin). Every other landing
  // needs clear ground around it, or a sidestep goes straight back through.
  const exact = inward && !!door.inside;
  const first = exact ? { x: door.inside.x, z: door.inside.z } : at(start);
  if (exact ? isClear(first.x, first.z) : clearAround(isClear, first.x, first.z, LANDING_MARGIN)) return first;
  let pointClear = isClear(first.x, first.z) ? first : null; // clear where the walker stands, short of the margin
  for (let d = start + STEP; d <= LANDING_MAX + 1e-9; d += STEP) {
    const p = at(d);
    if (clearAround(isClear, p.x, p.z, LANDING_MARGIN)) return p;
    if (!pointClear && isClear(p.x, p.z)) pointClear = p;
  }
  return pointClear || first;
}
