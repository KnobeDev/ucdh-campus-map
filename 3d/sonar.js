// Sonar: press P and a pulse expands from the walker, ticking at every 10 m
// ring out to 40 m. Every building (outdoors) or room, elevator and stairwell
// (inside) that the wavefront reaches echoes — an HRTF blip from its position
// plus "name, distance, direction" — so the delay before an echo IS the
// distance. A gold ring sweeps the ground for sighted users (still, under
// prefers-reduced-motion). Sonar is only ever a supplement to the live region:
// the whole list is also written there at once.
import * as THREE from "./lib/three.module.js";
import { nearestOnRing, directionLabel, metresWord, placesInReach } from "./spatial-core.js?v=2";

export const RING_M = 10;
export const RINGS = 4; // 40 m reach
export const RING_SEC = 0.4;
const MAX_ECHOES = 6;

/** places: buildings that are a signpost, not an outline ({ name, x, z }); named like the rest. */
export function createSonar(world, { index, hospital, player, speech, say, places = [] }) {
  const seg = 72;
  const circle = new Float32Array((seg + 1) * 3);
  for (let i = 0; i <= seg; i++) {
    circle[i * 3] = Math.cos((i / seg) * Math.PI * 2);
    circle[i * 3 + 2] = Math.sin((i / seg) * Math.PI * 2);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute("position", new THREE.BufferAttribute(circle, 3));
  const ring = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.9 }));
  ring.visible = false;
  world.scene.add(ring);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let t = -1;
  let timers = [];
  let liveNodes = []; // scheduled oscillators: a re-fire must silence the old pulse

  /** Outdoors: named buildings by nearest edge. Inside: this floor's rooms/elevators/stairs. */
  function scan() {
    const p = player.object.position;
    const out = [];
    if (player.state.floor === null) {
      // One echo per building, from its NEAREST part: a building may be several entries
      // (Shriners' front and the block behind it; a round tower beside its wings).
      const best = new Map();
      for (const e of index.entries) {
        if (!e.building) continue;
        const near = nearestOnRing(p.x, p.z, e.ring);
        if (near.d > RING_M * RINGS) continue;
        const had = best.get(e.building.code);
        if (!had || near.d < had.d) best.set(e.building.code, { name: e.building.name, d: near.d, x: near.x, z: near.z });
      }
      out.push(...best.values());
      out.push(...placesInReach(places, p.x, p.z, RING_M * RINGS));
    } else {
      const f = hospital.floor(player.state.floor);
      for (const n of f.nodes) {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d > RING_M * RINGS) continue;
        const name = n.kind === "elevator" ? (n.label || "Elevator") : n.roomN != null ? `${n.roomN}, ${n.label}` : n.label;
        out.push({ name, d, x: n.x, z: n.z });
      }
      const st = hospital.stairsOn(player.state.floor);
      if (st) {
        const d = Math.hypot(st.x - p.x, st.z - p.z);
        if (d <= RING_M * RINGS) out.push({ name: "Stairs (position estimated)", d, x: st.x, z: st.z });
      }
    }
    // Same-name duplicates (a complex with several footprints) keep the nearest.
    const byName = new Map();
    for (const h of out) if (!byName.has(h.name) || byName.get(h.name).d > h.d) byName.set(h.name, h);
    return [...byName.values()].sort((a, b) => a.d - b.d).slice(0, MAX_ECHOES);
  }

  return {
    get active() { return t >= 0; },
    fire() {
      timers.forEach(clearTimeout);
      timers = [];
      for (const n of liveNodes) { try { n.stop(0); } catch { /* already ended */ } }
      liveNodes = [];
      speech.cancel("sonar"); // replace the last pulse's echoes, never a building description still being read
      const p = player.object.position;
      const yaw = player.facingYaw(); // in VR the head's heading, not the body's
      const y = p.y - 1.7 + 0.25;
      try { speech.setListenerFromCamera(world.camera); } catch { /* no audio context available */ }
      for (let r = 1; r <= RINGS; r++) {
        try { liveNodes.push(speech.tick(r * RING_SEC, 380 + r * 60)); } catch { /* audio unavailable */ }
      }
      const hits = scan();
      const lines = hits.map((h) => `${h.name}, ${metresWord(h.d)}, ${directionLabel(yaw, p.x, p.z, h.x, h.z)}`);
      for (const [i, h] of hits.entries()) {
        const at = (h.d / RING_M) * RING_SEC;
        try { liveNodes.push(speech.blip({ x: h.x, y: p.y, z: h.z }, RING_M, RING_M * RINGS, at)); } catch { /* audio unavailable */ }
        timers.push(setTimeout(() => speech.speak(lines[i], { interrupt: false, tag: "sonar" }), at * 1000 + 60));
      }
      // The live region gets the whole list at once; the voice names each echo as it
      // returns (above). Voicing this too said every building twice.
      say(lines.length ? `Sonar: ${lines.join(". ")}.` : `Sonar: nothing within ${RING_M * RINGS} metres.`, { speak: false });
      if (!lines.length) timers.push(setTimeout(() => speech.speak(`Nothing within ${RING_M * RINGS} metres.`, { interrupt: false, tag: "sonar" }), RINGS * RING_SEC * 1000));
      ring.position.set(p.x, y, p.z);
      t = 0;
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const total = RINGS * RING_SEC;
      if (t >= total) { t = -1; ring.visible = false; return; }
      // Reduced motion: hold the ring at full reach instead of sweeping it.
      const rr = reduced.matches ? RING_M * RINGS : (t / total) * RING_M * RINGS;
      ring.scale.set(rr, 1, rr);
      ring.material.opacity = reduced.matches ? 0.9 : 0.9 * (1 - t / total); // no fade either under reduced motion
      ring.visible = true;
    },
  };
}
