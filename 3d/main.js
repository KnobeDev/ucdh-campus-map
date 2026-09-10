// Entry point: loads campus data, assembles the world, wires the HUD.
import { createWorld } from "./world.js?v=6";
import { buildBuildings } from "./buildings.js?v=6";
import { buildGroundSurfaces } from "./ground.js?v=6";
import { createOverheadCamera } from "./overhead.js?v=6";
import { initialTheme, saveTheme } from "./theme.js?v=6";
import { buildHospital } from "./hospital.js?v=8";
import { createPlayer } from "./player.js?v=9";
import { createFloorPicker } from "./elevator-ui.js?v=9";
import { buildRouteGraph, snapToGraph } from "./route-core.js?v=1";
import { createWayfinder } from "./wayfind.js?v=2";

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
      : "Walk: W A S D · Shift runs · arrows look · E at an elevator or stairs · G guide me · V overhead · drag to look";
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

  let wayfinder = null;
  player.onUse = (cell) => {
    pendingCell = cell;
    player.pause(); // nothing keeps walking behind the modal
    if (cell.kind === "elevator") {
      const ids = hospital.reachableBy(cell.node.elevatorId);
      const preferred = wayfinder && wayfinder.preferredFloor();
      picker.open({
        title: cell.node.label || "Elevator",
        hint: preferred && preferred !== cell.floor ? `Your route continues on ${floorName(preferred)}.` : "Choose a floor.",
        floors: ids.map((id) => ({ id, name: floorName(id), current: id === cell.floor, preferred: id === preferred })),
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
  return {
    setWayfinder(w) { wayfinder = w; },
    setWhere,
    dispose() { window.removeEventListener("keydown", onViewKey); player.dispose(); },
  };
}

/** The wayfinder's view of the HUD: summary line, steps list, active state. */
function wayfindUi() {
  return {
    summary: (text) => { $("wf-summary").textContent = text; },
    steps: (items) => {
      const ol = $("wf-steps");
      ol.replaceChildren();
      for (const t of items) {
        const li = document.createElement("li");
        li.textContent = t;
        ol.append(li);
      }
    },
    active: (on) => { $("wf-stop").hidden = !on; },
  };
}

/** Destinations: every campus building, every department (→ its building),
 *  every Medical Center room (→ floor + node). Starts: any building. */
function wireWayfinding(data, hospital, player, wayfinder, graph, canvas, walker) {
  const dest = $("wf-dest");
  const start = $("wf-start");
  const byCode = new Map(data.buildings.map((b) => [b.code, b]));
  const targets = new Map();
  const group = (label) => { const g = document.createElement("optgroup"); g.label = label; return g; };
  const opt = (id, text) => { const o = document.createElement("option"); o.value = id; o.textContent = text; return o; };

  const buildingTarget = (b) => ({
    kind: "building", name: b.name, x: b.center.x, z: b.center.z, code: b.code,
    // A big footprint counts as reached from further out.
    radius: b.footprints.length ? Math.max(...b.footprints.map((f) => {
      const xs = f.ring.map((p) => p[0]); const zs = f.ring.map((p) => p[1]);
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 6;
    })) : 0,
  });

  const gB = group("Buildings");
  const gS = group("Buildings");
  for (const b of [...data.buildings].sort((a, c) => a.name.localeCompare(c.name))) {
    if (b.renderedBy === "hospital") continue; // reached via its rooms and entrances below
    targets.set(`b:${b.code}`, buildingTarget(b));
    gB.append(opt(`b:${b.code}`, b.name));
    gS.append(opt(`b:${b.code}`, b.name));
  }
  const gE = group("Medical Center entrances");
  for (const e of hospital.entrances) {
    targets.set(`e:${e.id}`, { kind: "building", name: e.label || "Entrance", x: e.x, z: e.z, radius: 6 });
    gE.append(opt(`e:${e.id}`, `${e.label}${e.accessible ? " ♿" : ""}`));
    gS.append(opt(`e:${e.id}`, `Medical Center · ${e.label}`));
  }
  const gD = group("Departments");
  for (const d of [...data.buildings.flatMap((b) => b.departments.map((d) => ({ ...d, b })))].sort((a, c) => a.name.localeCompare(c.name))) {
    if (d.b.renderedBy === "hospital") continue;
    const id = `d:${d.b.code}:${d.name}`; // keyed by building too — two buildings may share a department name
    targets.set(id, { ...buildingTarget(d.b), name: `${d.name} (${d.b.name})` });
    gD.append(opt(id, `${d.name} — ${d.b.label || d.b.name}`));
  }
  const gR = group("Medical Center — by floor");
  for (const f of hospital.floors) {
    for (const n of f.nodes.filter((n) => n.kind === "room").sort((a, c) => (a.roomN ?? 999) - (c.roomN ?? 999))) {
      const id = `r:${f.id}:${n.id}`;
      const name = n.roomN != null ? `${n.roomN} · ${n.label}` : n.label;
      targets.set(id, { kind: "room", name, floor: f.id, floorName: floorName(f.id), node: n, x: n.x, z: n.z });
      gR.append(opt(id, `${floorName(f.id)} — ${name}`));
    }
  }
  dest.append(gB, gE, gD, gR);
  start.append(gS);

  // Sensible defaults for the first try: P3 → Cancer Center South.
  if (targets.has("b:P3")) start.value = "b:P3";
  if (targets.has("b:L")) dest.value = "b:L";

  $("wf-stepfree").addEventListener("change", (e) => wayfinder.setStepFree(e.target.checked));
  $("wf-go").addEventListener("click", () => {
    const t = targets.get(dest.value);
    if (!t) return;
    const s = targets.get(start.value);
    if (s) {
      // Begin on the nearest walkway outside the chosen start — never inside its footprint.
      const snap = snapToGraph(graph, s.x, s.z);
      player.leaveBuilding();
      player.teleport(snap ? snap.x : s.x, snap ? snap.z : s.z);
      walker.setWhere();
      say(`Starting at ${s.name}.`);
    }
    wayfinder.guideTo(t);
    canvas.focus();
  });
  $("wf-stop").addEventListener("click", () => { wayfinder.stop(); canvas.focus(); });
  const onGuideKey = (e) => {
    if ((e.code === "KeyG" || String(e.key).toLowerCase() === "g") && !e.repeat && document.activeElement === canvas
        && !document.querySelector("dialog[open]")) {
      if (wayfinder.active) wayfinder.stop(); else $("wf-go").click();
    }
  };
  window.addEventListener("keydown", onGuideKey);
  return { dispose() { window.removeEventListener("keydown", onGuideKey); } };
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
  const graph = buildRouteGraph(data.paths, { construction: data.construction });
  const wayfinder = createWayfinder(world, { graph, hospital, player, say, ui: wayfindUi() });
  walker.setWayfinder(wayfinder);
  const wayfindingWiring = wireWayfinding(data, hospital, player, wayfinder, graph, canvas, walker);

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
  window.__ucd3d = { world, index, data, overhead, player, hospital, walker, wayfinder, wayfindingWiring, graph }; // boot-guard.js checks this; handy in devtools

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    player.update(dt);
    wayfinder.update(dt);
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
