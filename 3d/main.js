// Entry point: loads campus data, assembles the world, wires the HUD.
import { createWorld } from "./world.js?v=4";
import { buildBuildings } from "./buildings.js?v=4";
import { buildGroundSurfaces } from "./ground.js?v=4";
import { createOverheadCamera } from "./overhead.js?v=4";
import { initialTheme, saveTheme } from "./theme.js?v=4";

const $ = (id) => document.getElementById(id);

function setTheme(world, name) {
  document.documentElement.dataset.theme = name;
  world.applyTheme(name);
  saveTheme(name);
  const btn = $("theme-btn");
  const dark = name === "dark";
  btn.setAttribute("aria-pressed", String(dark));
  btn.querySelector(".btn-txt").textContent = dark ? "Light mode" : "Dark mode";
  btn.querySelector(".btn-ico").textContent = dark ? "☀️" : "🌙";
}

async function boot() {
  document.documentElement.dataset.theme = initialTheme();
  // t= defeats heuristic caching — this file changes on every data regeneration.
  const res = await fetch("campus-data.json?t=" + Date.now());
  if (!res.ok) throw new Error(`campus-data.json: HTTP ${res.status}`);
  const data = await res.json();

  const canvas = $("scene");
  const world = createWorld(canvas, data.meta.world);
  const { index } = buildBuildings(world, data.buildings, data.context);
  buildGroundSurfaces(world, data.paths, data.areas);
  const overhead = createOverheadCamera(world, canvas);
  setTheme(world, initialTheme());

  $("theme-btn").addEventListener("click", () => {
    setTheme(world, document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  $("loading").hidden = true;
  $("hud").hidden = false;

  // Anyone using assistive tech gets the same summary the sighted user infers
  // from the picture: what's here and how much of it is real. #status lives
  // outside #hud and is never hidden, so it is in the accessibility tree from
  // page load and a plain synchronous write is announced. (Setting it while an
  // ancestor is display:none is silently dropped — that was the first version.)
  const shells = data.buildings.reduce((n, b) => n + b.footprints.length, 0);
  const named = data.buildings.filter((b) => b.footprints.some((f) => f.geomSource === "osm")).length;
  $("status").textContent =
    `Loaded ${data.buildings.length} campus buildings (${shells} footprints, ${named} from OpenStreetMap), ` +
    `${data.context.length} neighbourhood buildings and ${data.paths.length} paths.`;
  window.__ucd3d = { world, index, data, overhead }; // boot-guard.js checks this; handy in devtools

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    overhead.update(dt);
    world.renderer.render(world.scene, world.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  const el = $("loading");
  el.textContent = `The 3D campus failed to start: ${err.message}`;
});
