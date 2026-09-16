// Entry point: loads campus data, assembles the world, wires the HUD.
import { createWorld } from "./world.js?v=6";
import { buildBuildings } from "./buildings.js?v=7";
import { buildGroundSurfaces } from "./ground.js?v=8";
import { createOverheadCamera } from "./overhead.js?v=6";
import { initialTheme, saveTheme } from "./theme.js?v=6";
import { buildHospital } from "./hospital.js?v=15";
import { createPlayer } from "./player.js?v=18";
import { createFloorPicker } from "./elevator-ui.js?v=9";
import { buildRouteGraph, snapToGraph } from "./route-core.js?v=2";
import { createWayfinder } from "./wayfind.js?v=6";
import { buildConstruction, buildPointLayers } from "./layers.js?v=6";
import { zoneListText } from "./caution-core.js?v=1";
import { createSpeech } from "./speech.js?v=7";
import { readingMs } from "./speech-core.js?v=3";
import { createCaptions } from "./captions.js?v=1";
import { createSonar } from "./sonar.js?v=5";
import { createPicking, enuToLonLat, mapsUrl } from "./picking.js?v=3";
import { createSession } from "./session.js?v=3";
import { createMinimap } from "./minimap.js?v=6";
import { initialPanelOpen, prefs } from "./minimap-core.js?v=1";

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
let speech = null; // set in boot; say() mirrors to the voice when it's on
let captions = null; // set in boot; with the voice on, captions follow the voice itself (speech.js hooks)
function say(text, { interrupt = true, speak = true } = {}) {
  // speak: false writes the live region only, for a caller that voices the same content its own way (sonar).
  if (speak) speech?.speak(text, { interrupt });
  // Voice off: nothing is heard, so caption the announcement itself, long enough to read.
  if (speech && !speech.enabled) captions?.show(text, { holdMs: readingMs(text) });
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
    $("elev-btn").hidden = f === null; // only inside is there an elevator to find
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
      : "Walk: W A S D · Shift runs · arrows look · E what's ahead / use elevator · P sonar · G guide me · V overhead · drag to look";
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
  player.onZoneBlocked = throttle((z) => {
    const guided = wayfinder && wayfinder.active;
    // The same words as the sign on the fence and the Layers list.
    say(`${zoneListText(z)}. ${guided ? "Follow the gold line — it goes around." : "Go around it, or pick a destination for a route that does."}`);
  }, 2500);
  player.onEnter = (d) => { setWhere(); say(`Entered the Medical Center through the ${d.label || "entrance"}. Level 1, street level.`); };
  player.onExit = (d) => { setWhere(); say(`Left the Medical Center through the ${d.label || "entrance"}.`); };
  setWhere();
  return {
    setWayfinder(w) { wayfinder = w; },
    setWhere,
    /** The inset map's click: look at that spot from overhead, switching view if walking. */
    showOverheadAt(x, z) {
      if (player.state.mode !== "over") setView("over");
      overhead.lookAt(x, z);
      canvas.focus(); // so the arrow keys pan from there straight away
    },
    dispose() { window.removeEventListener("keydown", onViewKey); player.dispose(); },
  };
}

/** Voice, sonar and identify: the non-visual layer. */
function wireSenses(speech, sonar, picking, player, canvas) {
  const voiceBtn = $("voice-btn");
  // persist only on a real toggle: syncing the button to the default must not
  // silently pin a preference the user never expressed.
  const setVoice = (on, persist) => {
    speech.setEnabled(on, persist);
    voiceBtn.setAttribute("aria-pressed", String(on));
    voiceBtn.querySelector(".btn-txt").textContent = on ? "Voice on" : "Voice off";
    voiceBtn.querySelector(".btn-ico").textContent = on ? "🔊" : "🔇";
  };
  setVoice(speech.enabled, false);
  if (!speech.supported) { voiceBtn.disabled = true; voiceBtn.title = "Speech synthesis isn't available in this browser"; }
  voiceBtn.addEventListener("click", () => { setVoice(!speech.enabled, true); say(speech.enabled ? "Voice on." : "Voice off."); });
  $("captions-btn").addEventListener("click", () => say(captions.enabled ? "Captions on." : "Captions off."));
  $("sonar-btn").addEventListener("click", () => { sonar.fire(); canvas.focus(); });
  $("identify-btn").addEventListener("click", () => { picking.identifyAhead(); canvas.focus(); });
  // E with nothing to use nearby identifies what's ahead (player.js routes it here).
  player.onIdentify = () => picking.identifyAhead();
  const onSenseKey = (e) => {
    if (e.repeat || document.activeElement !== canvas || document.querySelector("dialog[open]")) return;
    if (e.code === "KeyP" || String(e.key).toLowerCase() === "p") sonar.fire();
  };
  window.addEventListener("keydown", onSenseKey);
}

/** The identified building: announce it and show the persistent card. */
let infoDest = null;
function showInfo(d, data) {
  const card = $("info");
  if (!d) {
    say("Nothing ahead within reach.");
    return;
  }
  say(d.text, { interrupt: false }); // a fast P afterwards must not cut the description off
  $("info-title").textContent = d.name;
  const meta = [];
  if (d.building) meta.push(data.categories[d.building.cat]?.label || d.building.cat);
  if (d.floors) meta.push(d.floors);
  meta.push(`${Math.round(d.distance)} m ${d.dir}`);
  $("info-meta").textContent = meta.join(" · ");
  const ul = $("info-depts");
  ul.replaceChildren();
  for (const dep of d.building?.departments || []) {
    const li = document.createElement("li");
    li.textContent = dep.note ? `${dep.name} (${dep.note})` : dep.name;
    ul.append(li);
  }
  const center = d.building ? d.building.center : { x: d.footprint.ring[0][0], z: d.footprint.ring[0][1] };
  const { lat, lon } = enuToLonLat(center.x, center.z, data.meta.georef.enuOrigin);
  $("info-maps").href = mapsUrl(lat, lon, d.name);
  infoDest = { kind: "building", name: d.name, x: center.x, z: center.z, radius: 12 };
  $("info-guide").hidden = !d.building;
  card.hidden = false;
}

/** Layer toggles mirror the 2D map's: construction on by default, the rest off. */
function wireLayers(construction, pointLayers) {
  const bind = (id, apply) => {
    const el = $(id);
    apply(el.checked);
    el.addEventListener("change", () => apply(el.checked));
  };
  bind("layer-construction", (v) => construction.setVisible(v));
  // Text equivalent of the fences and the caution signs: the same words, as real text.
  const ul = $("construction-items");
  ul.replaceChildren();
  for (const z of construction.active) {
    const li = document.createElement("li");
    li.textContent = zoneListText(z);
    ul.append(li);
  }
  if (!construction.active.length) {
    const li = document.createElement("li");
    li.textContent = "No active construction zones.";
    ul.append(li);
  }
  bind("layer-shuttle", (v) => pointLayers.setVisible("shuttle", v));
  bind("layer-bus", (v) => pointLayers.setVisible("bus", v));
  bind("layer-pois", (v) => pointLayers.setVisible("pois", v));
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
function wireWayfinding(data, hospital, player, wayfinder, graph, canvas, walker, session) {
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
  const gE = group("Medical Center entrances & elevators");
  const mainElev = hospital.floor("1")?.nodes.find((n) => n.id === "T_1_elev_main");
  if (mainElev) {
    targets.set("elev:1", { kind: "room", name: mainElev.label || "Main elevators", floor: "1", floorName: floorName("1"), node: mainElev, x: mainElev.x, z: mainElev.z });
    gE.append(opt("elev:1", `Main elevators (Level 1)`));
  }
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
  const gT = group("Shuttle & bus stops");
  for (const st of data.points.shuttle) {
    targets.set(`s:${st.id}`, { kind: "building", name: `${st.name} shuttle stop`, x: st.x, z: st.z, radius: 6 });
    gT.append(opt(`s:${st.id}`, `🚐 ${st.name}`));
  }
  for (const st of data.points.busStops) {
    targets.set(`bus:${st.id}`, { kind: "building", name: st.name, x: st.x, z: st.z, radius: 6 });
    gT.append(opt(`bus:${st.id}`, `🚌 ${st.name}`));
  }
  const gP = group("Points of interest");
  for (const p of data.points.pois) {
    const t = data.poiTypes[p.type] || data.poiTypes.general;
    targets.set(`p:${p.id}`, { kind: "building", name: p.name, x: p.x, z: p.z, radius: 6 });
    gP.append(opt(`p:${p.id}`, `${t.icon} ${p.name}`));
  }
  dest.append(gB, gE, gD, gR, gT, gP);
  start.append(gS);

  // Sensible defaults for the first try: P3 → Cancer Center South.
  if (targets.has("b:P3")) start.value = "b:P3";
  if (targets.has("b:L")) dest.value = "b:L";

  $("wf-stepfree").addEventListener("change", (e) => wayfinder.setStepFree(e.target.checked));
  $("wf-go").addEventListener("click", () => {
    if (session.blockWayfinding()) { say(session.blockedWayfindingMsg()); return; }
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
  // Inside and lost: guide to the nearest elevator on this floor.
  $("elev-btn").addEventListener("click", () => {
    const f = player.state.floor;
    if (f === null) return;
    if (session.blockWayfinding()) { say(session.blockedWayfindingMsg()); return; }
    const { x, z } = player.object.position;
    const node = hospital.elevatorOn(f, null, x, z);
    if (!node) { say("No elevator on this floor."); return; }
    wayfinder.guideTo({ kind: "room", name: node.label || "Elevator", floor: f, floorName: floorName(f), node, x: node.x, z: node.z });
    canvas.focus();
  });
  $("info-guide").addEventListener("click", () => {
    if (session.blockWayfinding()) { say(session.blockedWayfindingMsg()); return; }
    if (infoDest) { wayfinder.guideTo(infoDest); canvas.focus(); }
  });
  $("info-close").addEventListener("click", () => { $("info").hidden = true; canvas.focus(); });
  const onGuideKey = (e) => {
    if ((e.code === "KeyG" || String(e.key).toLowerCase() === "g") && !e.repeat && document.activeElement === canvas
        && !document.querySelector("dialog[open]")) {
      if (wayfinder.active) wayfinder.stop(); else $("wf-go").click();
    }
  };
  window.addEventListener("keydown", onGuideKey);
  return { dispose() { window.removeEventListener("keydown", onGuideKey); } };
}

/** The side panel collapses to its Menu button; the choice persists per browser. */
const PANEL_KEY = "ucdh3d-panel";
function wirePanel() {
  const hud = $("hud");
  const body = $("hud-body");
  const btn = $("hud-toggle");
  // The name stays "Menu"; aria-expanded carries the state, the icon mirrors it.
  const set = (open, persist) => {
    body.hidden = !open;
    hud.classList.toggle("collapsed", !open);
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector(".btn-ico").textContent = open ? "✕" : "☰";
    if (persist) prefs.set(PANEL_KEY, open ? "open" : "closed");
  };
  set(initialPanelOpen(prefs.get(PANEL_KEY), innerWidth), false);
  btn.addEventListener("click", () => set(body.hidden, true));
}

async function boot() {
  document.documentElement.dataset.theme = initialTheme();
  // The lobby (Guest / Tour / Event / Join) opens first; the data downloads
  // concurrently with the user's think-time.
  const session = createSession();
  const lobbyDone = session.openLobby();
  // t= defeats heuristic caching — this file changes on every data regeneration.
  const res = await fetch("campus-data.json?t=" + Date.now());
  if (!res.ok) throw new Error(`campus-data.json: HTTP ${res.status}`);
  const data = await res.json();
  await lobbyDone;

  const canvas = $("scene");
  const world = createWorld(canvas, data.meta.world);
  const { index } = buildBuildings(world, data.buildings, data.context);
  buildGroundSurfaces(world, data.paths, data.areas);
  const hospital = buildHospital(world, data.hospital);
  const overhead = createOverheadCamera(world, canvas);
  overhead.setEnabled(false);

  // Spawn on the street outside the Main Entrance, facing it.
  const construction = buildConstruction(world, data.construction);
  const pointLayers = buildPointLayers(world, data.points, data.osmBusStops, data.poiTypes);
  wireLayers(construction, pointLayers);
  const door = hospital.entrances[0];
  const player = createPlayer(world, index, hospital, { x: door.x, z: door.z + 28, yaw: 0 }, construction.zoneAt);
  setTheme(world, initialTheme());
  captions = createCaptions($("captions"), $("captions-btn"));
  speech = createSpeech({ onStart: (text) => captions.show(text), onEnd: () => captions.end() });
  const walker = wireWalker(world, player, overhead, hospital, canvas);
  const sonar = createSonar(world, { index, hospital, player, speech, say });
  const picking = createPicking(world, { index, player, onSelect: (d) => showInfo(d, data) });
  wireSenses(speech, sonar, picking, player, canvas);
  const graph = buildRouteGraph(data.paths, { construction: data.construction });
  const wayfinder = createWayfinder(world, { graph, hospital, player, say, ui: wayfindUi() });
  walker.setWayfinder(wayfinder);
  const wayfindingWiring = wireWayfinding(data, hospital, player, wayfinder, graph, canvas, walker, session);
  const minimap = createMinimap({
    data, hospital, construction, player, overhead, wayfinder,
    onLookAt: (x, z) => walker.showOverheadAt(x, z),
  });
  wirePanel();
  session.start({
    player, world, say,
    speak: (msg) => speech.speak(msg),
    getTheme: () => document.documentElement.dataset.theme,
    applyTheme: (name) => { if (document.documentElement.dataset.theme !== name) setTheme(world, name); },
  });

  $("theme-btn").addEventListener("click", () => {
    setTheme(world, document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  $("loading").hidden = true;
  $("hud").hidden = false;
  $("minimap").hidden = false;
  minimap.layout(); // measured only once visible: it reserves room under the panel
  canvas.focus();

  // Anyone using assistive tech gets the same summary the sighted user infers
  // from the picture: what's here and how much of it is real. #status lives
  // outside #hud and is never hidden, so it is in the accessibility tree from
  // page load and a plain synchronous write is announced. (Setting it while an
  // ancestor is display:none is silently dropped — that was the first version.)
  const shells = data.buildings.reduce((n, b) => n + b.footprints.length, 0);
  const named = data.buildings.filter((b) => b.footprints.some((f) => f.geomSource === "osm")).length;
  const zones = construction.active.length;
  // Live region only: nothing starts talking before the user has done anything (SC 1.4.2).
  // With the voice on, a screen-reader user learns here that it exists and how to silence it.
  say(`Loaded ${data.buildings.length} campus buildings (${shells} footprints, ${named} from OpenStreetMap), ` +
    `${data.context.length} neighbourhood buildings and ${data.paths.length} paths. ` +
    (zones ? `Caution: ${zones} active construction site${zones === 1 ? "" : "s"}, each with its end date under Layers; routes avoid them. ` : "") +
    (speech.enabled ? "The voice reads buildings aloud when you ask what's ahead or send a sonar pulse; the Voice button turns it off." : ""),
    { speak: false });
  window.__ucd3d = { world, index, data, overhead, player, hospital, walker, wayfinder, wayfindingWiring, graph, sonar, picking, speech, captions, session, minimap, construction }; // boot-guard.js checks this; handy in devtools

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    player.update(dt);
    wayfinder.update(dt);
    sonar.update(dt);
    session.update(dt);
    overhead.update(dt);
    construction.update(); // after the cameras have moved for this frame
    minimap.update(dt);
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
