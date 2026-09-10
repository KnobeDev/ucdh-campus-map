// Other people in a live tour or event, rendered in the world: a simple
// capsule figure with a floating name tag; the guide wears gold and a slowly
// turning beacon. States arrive ~4×/s from the session server and are eased
// every frame so walking looks continuous. Peers on a different Medical Center
// floor (or inside while you're outside) are hidden — you can't see through slabs.
import * as THREE from "./lib/three.module.js";
import { labelSprite } from "./labels.js?v=6";

const EYE = 1.7;
const LERP_RATE = 8;
const TAG_Y = 2.35;

function makeFigure(isGuide) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), new THREE.MeshLambertMaterial({ color: isGuide ? 0xb8860b : 0x2f6e91 }));
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8c9a8 }));
  head.position.y = 1.72;
  g.add(body, head);
  let beacon = null;
  if (isGuide) {
    beacon = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.44, 4), new THREE.MeshBasicMaterial({ color: 0xffbf00 }));
    beacon.rotation.x = Math.PI;
    beacon.position.y = 2.15;
    g.add(beacon);
  }
  return { group: g, beacon };
}

export function createPeers(world) {
  const root = new THREE.Group();
  world.scene.add(root);
  const peers = new Map();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  function dispose(p) {
    root.remove(p.fig.group);
    p.fig.group.traverse((o) => {
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); return; }
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }

  return {
    /** Reconcile against the server's peer list (~4/s). myFloor: the local walker's floor. */
    setPeers(list, myFloor) {
      const seen = new Set();
      for (const remote of list) {
        seen.add(remote.id);
        let p = peers.get(remote.id);
        if (!p) {
          const fig = makeFigure(remote.role === "guide");
          const tag = labelSprite(remote.role === "guide" ? `★ ${remote.name}` : remote.name, remote.role === "guide" ? "stairs" : "room", 0.7);
          tag.position.y = TAG_Y;
          fig.group.add(tag);
          root.add(fig.group);
          p = { fig, cur: { ...remote.state }, name: remote.name, role: remote.role };
          fig.group.position.set(p.cur.x, Math.max(p.cur.y - EYE, -10), p.cur.z);
          peers.set(remote.id, p);
        }
        if (Math.hypot(remote.state.x - p.cur.x, remote.state.z - p.cur.z) > 100) p.cur = { ...remote.state }; // a teleport, not a step
        p.target = remote.state;
        p.floor = remote.state.floor || null;
        p.fig.group.visible = !remote.away && p.floor === (myFloor || null);
      }
      for (const [id, p] of peers) if (!seen.has(id)) { dispose(p); peers.delete(id); }
    },
    update(dt) {
      const k = 1 - Math.exp(-LERP_RATE * dt);
      for (const p of peers.values()) {
        if (!p.target) continue;
        p.cur.x += (p.target.x - p.cur.x) * k;
        p.cur.y += (p.target.y - p.cur.y) * k;
        p.cur.z += (p.target.z - p.cur.z) * k;
        let dy = p.target.yaw - p.cur.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.cur.yaw += dy * k;
        p.fig.group.position.set(p.cur.x, Math.max(p.cur.y - EYE, -10), p.cur.z);
        p.fig.group.rotation.y = p.cur.yaw;
        if (p.fig.beacon && !reduced.matches) p.fig.beacon.rotation.y += dt * 2.2;
      }
    },
    info(id) {
      const p = peers.get(id);
      return p ? { name: p.name, role: p.role, x: p.cur.x, z: p.cur.z, floor: p.floor } : null;
    },
    guidePos() {
      for (const p of peers.values()) if (p.role === "guide") return { x: p.cur.x, z: p.cur.z, floor: p.floor, seen: !!p.target };
      return null;
    },
    clear() {
      for (const p of peers.values()) dispose(p);
      peers.clear();
    },
  };
}
