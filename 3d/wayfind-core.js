// The wayfinder's decisions, with no three.js in them, so they can be tested
// in node exactly as they run in the browser.
//
// A guided route is a sequence of LEGS decided from two facts: where the goal
// is (outdoors, or a room on a floor) and where the walker is (outdoors, or on
// a floor). Everything else — ribbons, beacons, speech — presents a leg.

export const ARRIVE_OUT = 7; // metres from an outdoor goal counts as arrived
export const ARRIVE_IN = 3.5; // metres from a room counts as arrived
export const ARRIVE_DOOR = 20; // just inside the door of an entrance goal counts as arrived
export const MILESTONE = 30; // metres between spoken distance updates

/**
 * Which leg applies.
 * @param {object} dest   {kind: "room", floor} | {kind: "building"}
 * @param {string|null} floor  the walker's floor, null outdoors
 * @returns {"outdoor"|"on-floor"|"to-elevator"|"to-door"}
 */
export function legFor(dest, floor) {
  const inside = floor !== null;
  if (dest.kind === "room") {
    if (!inside) return "outdoor";
    return floor === dest.floor ? "on-floor" : "to-elevator";
  }
  if (!inside) return "outdoor";
  return floor === "1" ? "to-door" : "to-elevator";
}

/**
 * Has the walker arrived?
 * @param {object} dest
 * @param {string|null} floor
 * @param {number} dist  metres from the walker to the goal point (room node or outdoor point)
 */
export function arrived(dest, floor, dist) {
  const leg = legFor(dest, floor);
  if (dest.kind === "room") return leg === "on-floor" && dist <= ARRIVE_IN;
  if (leg === "outdoor") return dist <= Math.max(ARRIVE_OUT, dest.radius || 0);
  // An entrance (or any outdoor goal) reached by walking THROUGH its door:
  // the walker is now inside, a step past the goal point. That is arrival,
  // not a reason to send them back out.
  return floor === "1" && dist <= ARRIVE_DOOR;
}

/** Whether a distance milestone is due, and the new "last spoken" value. */
export function milestoneDue(lastSpokenAt, remaining) {
  return lastSpokenAt - remaining >= MILESTONE;
}

/**
 * Debounce a leg change: the leg must be observed `stableTicks` times in a row
 * before it counts, so a walker dithering on a doorstep doesn't get told to go
 * in, out, in, out. Returns the new tracker state and whether the leg changed.
 */
export function settleLeg(tracker, observed, stableTicks = 2) {
  const t = { current: tracker.current ?? null, candidate: tracker.candidate ?? null, count: tracker.count ?? 0 };
  if (observed === t.current) {
    return { tracker: { ...t, candidate: null, count: 0 }, leg: t.current, changed: false };
  }
  if (observed === t.candidate) t.count += 1;
  else { t.candidate = observed; t.count = 1; }
  // A fresh route (no current leg yet) settles immediately.
  if (t.current === null || t.count >= stableTicks) {
    return { tracker: { current: observed, candidate: null, count: 0 }, leg: observed, changed: true };
  }
  return { tracker: t, leg: t.current, changed: false };
}

/** Minutes for a walking distance, never less than one. */
export const walkMinutes = (metres) => Math.max(1, Math.round(metres / 80));
