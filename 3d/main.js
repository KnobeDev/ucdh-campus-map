// Entry point: loads campus data, assembles the world, wires the HUD.
import { createWorld } from "./world.js?v=6";
import { buildBuildings } from "./buildings.js?v=6";
import { buildGroundSurfaces } from "./ground.js?v=6";
import { createOverheadCamera } from "./overhead.js?v=6";
import { initialTheme, saveTheme } from "./theme.js?v=6";
import { buildHospital } from "./hospital.js?v=8";
import { createPlayer } from "./player.js?v=8";
import { createFloorPicker } from "./elevator-ui.js?v=8";

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

const FLOOR_NAMES = { LL: "Lower Level", 1: "Level 1 (street)", 2: "Level 2", 3: "Level 3", 4: "Level 4", 5: "Level 5", 6: "Level 6", 7: "Level 7", 8: "Level 8", 10: "Level 10", 11: "Level 11", 12: "Level 12", 14: "Level 14" };
const floorName = (id) => FLOOR_NAMES[id] || `Level ${id}`;

/** Spoken/live-region announcement. An unchanged value may not be re-announced
 *  by every AT, so identical text is cleared first and re-set a beat later. */
function say(text) {
  const el = $("status");
  if (el.textContent !== text) {
    el.textContent = text;
    return;
  }
  el.textContent = "";
  setTimeout(() => { el.textContent = text; }, 40);
}

/** Call fn at most once per `ms`; used for the wall bump so it can't spam. */
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
}

function wireWalker(world, player, overhead, hospital, canvas) {
  const viewBtn = $("view-btn");
  const useBtn = $("use-btn");
  const where = $("where");
  const hint = $("hint");

  const setWhere = () => {
    const f = player.state.floor;
    if (f !== null) {
      where.textContent = `Inside the Medical Center · ${floorName(f)}`;
      return;
    }
    // Outside: name the nearest entrance when one is close enough to matter.
    const { x, z } = player.object.position;
    const near = hospital.entrances
      .map((e) => ({ e, d: Math.hypot(e.x - x, e.z - z) }))
      .sort((a, b) => a.d - b.d)[0];
    where.textContent = near && near.d < 80 ? `Outside · near the ${near.e.label}` : "Outside";
  };

  function setView(mode) {
    player.setMode(mode);
    overhead.setEnabled(mode === "over");
    if (mode === "over") overhead.lookAt(player.object.position.x, player.object.position.z, 260);
    const over = mode === "over";
    viewBtn.setAttribute("aria-pressed", String(over));
    viewBtn.querySelector(".btn-txt").textContent = over ? "Walk" : "Overhead view";
    viewBtn.querySelector(".btn-ico").textContent = over ? "🚶" : "🚁";
    hint.textContent = over
      ? "Overhead: arrows pan · Q E rotate · PgUp PgDn tilt · + − zoom · V or the Walk button to walk"
      : "Walk: W A S D · Shift runs · arrows look · E at an elevator or stairs · V overhead · drag to look";
    say(over ? "Overhead view." : "Walking view.");
    canvas.focus();
  }
  viewBtn.addEventListener("click", () => setView(player.state.mode === "over" ? "walk" : "over"));
  // V is a single-character shortcut, so it only fires while the map has focus (SC 2.1.4).
  const onViewKey = (e) => {
    if ((e.code === "KeyV" || String(e.key).toLowerCase() === "v") && !e.repeat
        && document.activeElement === canvas && !document.querySelector("dialog[open]")) {
      setView(player.state.mode === "over" ? "walk" : "over");
    }
  };
  window.addEventListener("keydown", onViewKey);

  const picker = createFloorPicker({
    onChoose: (id) => {
      const cell = pendingCell;
      pendingCell = null;
      player.resume();
      if (!cell) return; // the picker was cancelled before the choice landed
      player.goToFloor(id, cell.kind === "stairs" ? "stairs" : cell.node.elevatorId);
      setWhere();
      say(`${cell.kind === "stairs" ? "Took the stairs" : "Took the elevator"} to ${floorName(id)}.`);
      canvas.focus();
    },
    onCancel: () => { pendingCell = null; player.resume(); canvas.focus(); },
  });
  let pendingCell = null;

  player.onUse = (cell) => {
    pendingCell = cell;
    player.pause(); // nothing keeps walking behind the modal
    if (cell.kind === "elevator") {
      const ids = hospital.reachableBy(cell.node.elevatorId);
      picker.open({
        title: cell.node.label || "Elevator",
        hint: "Choose a floor.",
        floors: ids.map((id) => ({ id, name: floorName(id), current: id === cell.floor })),
      });
    } else {
      const { up, down } = hospital.stairNeighbours(cell.floor);
      const floors = [];
      if (up) floors.push({ id: up, name: `Up to ${floorName(up)}` });
      if (down) floors.push({ id: down, name: `Down to ${floorName(down)}` });
      picker.open({ title: "Stairs", hint: "Stair position is estimated — the printed plan doesn't show stairwells.", floors });
    }
  };
  useBtn.addEventListener("click", () => player.useNearby());
  player.onNearby = (cell) => {
    useBtn.hidden = !cell;
    if (!cell) return;
    const label = cell.kind === "stairs" ? "Use stairs" : `Use ${cell.node.label || "elevator"}`;
    useBtn.querySelector(".btn-txt").textContent = label;
    useBtn.querySelector(".btn-ico").textContent = cell.kind === "stairs" ? "🪜" : "🛗";
    say(`${cell.kind === "stairs" ? "Stairs" : cell.node.label || "Elevator"} here. Press E or use the ${label} button.`);
  };
  // A wall is the one thing a non-visual walker can't see coming.
  player.onBlocked = throttle(() => say("Wall — no way through here."), 1200);
  player.onEnter = (d) => { setWhere(); say(`Entered the Medical Center through the ${d.label || "entrance"}. Level 1, street level.`); };
  player.onExit = (d) => { setWhere(); say(`Left the Medical Center through the ${d.label || "entrance"}.`); };
  setWhere();
  return { dispose() { window.removeEventListener("keydown", onViewKey); player.dispose(); } };
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
  const hospital = buildHospital(world, data.hospital);
  const overhead = createOverheadCamera(world, canvas);
  overhead.setEnabled(false);

  // Spawn on the street outside the Main Entrance, facing it.
  const door = hospital.entrances[0];
  const player = createPlayer(world, index, hospital, { x: door.x, z: door.z + 28, yaw: 0 });
  setTheme(world, initialTheme());
  const walker = wireWalker(world, player, overhead, hospital, canvas);

  $("theme-btn").addEventListener("click", () => {
    setTheme(world, document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  $("loading").hidden = true;
  $("hud").hidden = false;
  canvas.focus();

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
  window.__ucd3d = { world, index, data, overhead, player, hospital, walker }; // boot-guard.js checks this; handy in devtools

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    player.update(dt);
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
