// Renderer, camera, lights, ground plane, theme application.
//
// The scene frame is the data's ENU frame: metres, +x east, +z south, y up,
// origin at the map centre (campus-data.json meta.georef.enuOrigin). Nothing
// here scales pixels — that was done once, in the pipeline.
import * as THREE from "./lib/three.module.js";
import { PALETTES } from "./theme.js?v=4";

export const EYE = 1.7; // metres, standing eye height

export function createWorld(canvas, worldBox) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  // Near/far chosen for a ~1.7 km world: a 12 km far plane would cost depth
  // precision at street level for no benefit (the Davis build z-fought its
  // freeway decks over exactly this).
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 4000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-0.4, 1, 0.35).multiplyScalar(800);
  scene.add(sun);

  const w = worldBox.maxX - worldBox.minX;
  const d = worldBox.maxZ - worldBox.minZ;
  const cx = (worldBox.minX + worldBox.maxX) / 2;
  const cz = (worldBox.minZ + worldBox.maxZ) / 2;

  // Campus ground: lawn-toned plane under everything; surfaces draw on top.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x9cb87a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.05, cz);
  scene.add(ground);

  // Wider, duller context plane so the world doesn't end at a hard edge.
  const contextMat = new THREE.MeshLambertMaterial({ color: 0xa3b28a });
  const context = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, d * 4), contextMat);
  context.rotation.x = -Math.PI / 2;
  context.position.set(cx, -0.06, cz);
  scene.add(context);

  const world = {
    renderer, scene, camera, hemi, sun, groundMat,
    center: { x: cx, z: cz },
    box: worldBox,
    themeTargets: { surfaceMats: { context: contextMat }, catMats: {} },
    applyTheme(name) {
      const p = PALETTES[name];
      scene.background = new THREE.Color(p.sky);
      scene.fog = new THREE.FogExp2(p.sky, p.fogDensity);
      groundMat.color.setHex(p.ground);
      hemi.color.setHex(p.hemiSky);
      hemi.groundColor.setHex(p.hemiGround);
      hemi.intensity = p.hemiIntensity;
      sun.color.setHex(p.sunColor);
      sun.intensity = p.sunIntensity;
      for (const [t, mat] of Object.entries(this.themeTargets.surfaceMats)) {
        mat.color.setHex(p.surfaces[t] ?? p.surfaces.foot);
        const em = p.surfaceEmissive[t];
        mat.emissive.setHex(em ? em[0] : 0x000000);
        mat.emissiveIntensity = em ? em[1] : 0;
      }
      for (const [key, mat] of Object.entries(this.themeTargets.catMats)) {
        const cat = key.split("#")[0];
        mat.color.setHex(p.cats[cat] ?? p.cats.default);
        mat.emissive.setHex(p.building.emissive);
        mat.emissiveIntensity = p.building.emissiveIntensity;
      }
    },
  };

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return world;
}
