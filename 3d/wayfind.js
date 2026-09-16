// Guided route: a gold ribbon along real walkways to a destination, live
// re-routing as the walker moves, a beacon at the goal, and — when the goal is
// inside the Medical Center — the route continues through the door: to the
// entrance, to the elevators, to the floor, along the corridors to the room. Every leg is spoken
// through `say`, the single live channel, so a non-visual walker gets the same
// guidance. The decisions live in wayfind-core.js; this file presents them.
import * as THREE from "./lib/three.module.js";
import { ribbonGeometry } from "./ground.js?v=8";
import { route, describeLegs } from "./route-core.js?v=2";
import { labelSprite } from "./labels.js?v=6";
import { legFor, arrived, milestoneDue, settleLeg, walkMinutes } from "./wayfind-core.js?v=1";

const REROUTE_EVERY = 0.7; // seconds
const RIBBON_W = 1.2;

export function createWayfinder(world, { graph, hospital, player, say, ui }) {
  const group = new THREE.Group();
  world.scene.add(group);
  const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.92, depthWrite: false });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.25, 0.25, 6, 8); // shared; never disposed per tick
  let ribbon = null;
  let beacon = null; // { group, key }
  let dest = null;
  let stepFree = false;
  let clock = 0;
  let lastSpokenAt = Infinity;
  let tracker = {};

  // --- scene objects -------------------------------------------------------

  let routePts = null; // the drawn ribbon's points, for the inset map
  function dropRibbon() {
    routePts = null;
    if (!ribbon) return;
    group.remove(ribbon);
    ribbon.geometry.dispose();
    ribbon = null;
  }
  function drawRibbon(pts, y) {
    dropRibbon();
    const geo = ribbonGeometry(pts, RIBBON_W, y);
    if (!geo) return;
    ribbon = new THREE.Mesh(geo, ribbonMat);
    group.add(ribbon);
    routePts = pts;
  }
  function dropBeacon() {
    if (!beacon) return;
    group.remove(beacon.group);
    beacon.group.traverse((o) => {
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
    });
    beacon = null;
  }
  /** Rebuilt only when position or text changes — not on every 0.7 s tick. */
  function drawBeacon(x, z, y, text) {
    const k = `${x.toFixed(1)},${z.toFixed(1)},${y},${text}`;
    if (beacon && beacon.key === k) return;
    dropBeacon();
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, beaconMat);
    post.position.set(x, y + 3, z);
    const label = labelSprite(text, "room", 1.2);
    label.position.set(x, y + 7, z);
    g.add(post, label);
    group.add(g);
    beacon = { group: g, key: k };
  }
  function clearScene() {
    dropRibbon();
    dropBeacon();
  }

  // --- helpers ---------------------------------------------------------------

  const here = () => ({ x: player.object.position.x, z: player.object.position.z });
  const distTo = (p) => Math.hypot(p.x - here().x, p.z - here().z);
  const door = () => hospital.entrances.find((e) => e.accessible) || hospital.entrances[0];
  const goalPoint = () => (dest.kind === "room" ? dest.node : dest);

  /** Show one leg: ribbon, beacon, steps, summary, and speech on change or milestone. */
  function present({ pts, y, beaconAt, beaconText, steps, summary, remaining, opening, changed }) {
    drawRibbon(pts, y);
    drawBeacon(beaconAt.x, beaconAt.z, beaconAt.y, beaconText);
    ui.steps(steps);
    ui.summary(summary);
    if (changed) {
      say(opening);
      lastSpokenAt = remaining;
    } else if (milestoneDue(lastSpokenAt, remaining)) {
      say(`${Math.round(remaining)} metres to go.`);
      lastSpokenAt = remaining;
    }
  }

  // --- legs ---------------------------------------------------------------------

  function outdoorLeg(changed) {
    const goal = dest.kind === "room" ? door() : dest;
    const r = route(graph, here(), goal, { stepFree });
    if (!r.ok) {
      clearScene();
      ui.steps([]);
      ui.summary(`No walkable route found (${r.reason}).`);
      if (changed) say(`I couldn't find a walkable route to ${dest.name}: ${r.reason}.`);
      return;
    }
    const m = Math.round(r.length);
    const mins = walkMinutes(r.length);
    const steps = describeLegs(r.legs);
    if (dest.kind === "room") {
      steps.push(`Enter through the ${goal.label || "entrance"}`, `Take the elevator to ${dest.floorName}`, `Walk to ${dest.name}`);
    }
    present({
      pts: r.pts, y: 0.12,
      beaconAt: { x: goal.x, z: goal.z, y: 0 },
      beaconText: dest.kind === "room" ? `${goal.label || "Entrance"} → ${dest.name}` : dest.name,
      steps,
      summary: `${m} m · about ${mins} min${stepFree ? " · step-free" : ""}`,
      remaining: r.length,
      opening: `Guiding you to ${dest.name}: ${m} metres, about ${mins} minute${mins === 1 ? "" : "s"}. ${steps[0] || ""}`,
      changed,
    });
  }

  function indoorLeg(leg, changed) {
    const f = hospital.floor(player.state.floor);
    if (!f) return; // the walker left the building between the leg decision and this draw
    const y = f.y + 0.1;
    const h = here();
    // Indoors the line follows the floor's corridors, so it never points through a wall.
    const walk = (goal) => hospital.route(player.state.floor, h, goal);
    if (leg === "on-floor") {
      const goal = dest.node;
      const w = walk(goal);
      const d = w.length;
      present({
        pts: w.pts, y,
        beaconAt: { x: goal.x, z: goal.z, y: f.y }, beaconText: dest.name,
        steps: [`Walk to ${dest.name} (${Math.round(d)} m)`],
        summary: `${Math.round(d)} m on ${dest.floorName}`,
        remaining: d,
        opening: `You're on ${dest.floorName}. ${dest.name} is ${Math.round(d)} metres ahead — follow the gold line.`,
        changed,
      });
      return;
    }
    if (leg === "to-door") {
      const dr = door();
      const w = walk(dr.inside || dr);
      const d = w.length;
      present({
        pts: [...w.pts, [dr.x, dr.z]], y,
        beaconAt: { x: dr.x, z: dr.z, y: f.y }, beaconText: dr.label || "Exit",
        steps: [`Leave through the ${dr.label || "entrance"}`, `Then walk to ${dest.name}`],
        summary: `${Math.round(d)} m to the exit`,
        remaining: d,
        opening: `Head for the ${dr.label || "entrance"} to leave the building; then I'll guide you on to ${dest.name}.`,
        changed,
      });
      return;
    }
    const targetName = dest.kind === "room" ? dest.floorName : "Level 1";
    const elev = hospital.elevatorOn(player.state.floor, null, h.x, h.z);
    const w = walk(elev);
    const d = w.length;
    present({
      pts: w.pts, y,
      beaconAt: { x: elev.x, z: elev.z, y: f.y }, beaconText: `Elevator → ${targetName}`,
      steps: [`Walk to the ${elev.label || "elevator"} (${Math.round(d)} m)`, `Take it to ${targetName}`, `Walk to ${dest.name}`],
      summary: `${Math.round(d)} m to the elevator`,
      remaining: d,
      opening: `Take the ${elev.label || "elevator"} to ${targetName} — it's ${Math.round(d)} metres away, follow the gold line.`,
      changed,
    });
  }

  function replan(force) {
    const settled = settleLeg(tracker, legFor(dest, player.state.floor), force ? 1 : 2);
    tracker = settled.tracker;
    const changed = settled.changed || force;
    if (settled.leg === "outdoor") outdoorLeg(changed);
    else indoorLeg(settled.leg, changed);
  }

  const api = {
    get active() { return !!dest; },
    get destination() { return dest; },
    /** The drawn route as [[x, z], ...], or null: the inset map draws it too. */
    routePoints() { return routePts; },
    /** The floor the picker should offer first while guiding. */
    preferredFloor() {
      if (!dest) return null;
      if (dest.kind === "room") return dest.floor;
      return player.state.floor !== null ? "1" : null;
    },
    setStepFree(v) {
      stepFree = !!v;
      if (dest) replan(true);
    },
    guideTo(d) {
      dest = d;
      tracker = {};
      lastSpokenAt = Infinity;
      clock = 0;
      replan(true);
      ui.active(true);
    },
    stop(quiet) {
      if (!dest) return;
      const name = dest.name;
      dest = null;
      tracker = {};
      clearScene();
      ui.steps([]);
      ui.summary("");
      ui.active(false);
      if (!quiet) say(`Stopped guiding to ${name}.`);
    },
    update(dt) {
      if (!dest || player.state.paused) return; // a modal is up: no replans, no speech
      clock += dt;
      if (clock < REROUTE_EVERY) return;
      clock = 0;
      if (arrived(dest, player.state.floor, distTo(goalPoint()))) {
        const name = dest.name;
        api.stop(true);
        say(`You have arrived at ${name}.`);
        ui.summary(`Arrived at ${name}.`);
        return;
      }
      replan(false);
    },
  };
  return api;
}
