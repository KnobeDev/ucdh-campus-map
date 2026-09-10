// Live tours and events: the entry lobby (Guest / Lead a Tour / Host an Event /
// Join with a code), the 4 Hz state-sync loop against serve.py, the group panel,
// and the guide's two-step remove. Ported from the Davis campus build.
//
// Roles: guest — solo, no networking. guide — created the session, owns the
// wayfinding, can remove people, ending it ends it for everyone. member — full
// controls and building details, but guidance is the guide's (body.sess-member
// hides Guide me; main.js also guards the G key), and members stay within
// 200 ft of the guide on the same floor.
//
// The lobby markup lives in index.html; this only wires it. Server text lands
// in the DOM via textContent, never HTML.
import { createPeers } from "./peers.js?v=2";

const SYNC_MS = 250;
const TETHER_M = 61; // 200 ft
const TETHER_FAR_M = TETHER_M * 2; // beyond this the pull is a "brought to your group", not a nudge
const TETHER_MSG_COOLDOWN_MS = 6000;
const STORE_KEY = "ucdh3d-session";
const NAME_KEY = "ucdh3d-name";
const KICK_KEY = "ucdh3d-kickmarks";
const CODE_RE = /^[A-Z2-9]{6}$/;
const KIND_LABEL = { tour: "tour", event: "event" };
const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const r = await fetch("/api/session/" + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}
const storage = {
  load() { try { const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); return s && s.code && s.id && s.token ? s : null; } catch { return null; } },
  save(c) { try { c ? sessionStorage.setItem(STORE_KEY, JSON.stringify(c)) : sessionStorage.removeItem(STORE_KEY); } catch { /* storage off */ } },
  name() { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } },
  saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch { /* fine */ } },
  kickmarks() { try { return JSON.parse(sessionStorage.getItem(KICK_KEY) || "{}") || {}; } catch { return {}; } },
  markKicked(code, id) { try { const m = storage.kickmarks(); m[code] = id; sessionStorage.setItem(KICK_KEY, JSON.stringify(m)); } catch { /* fine */ } },
};
const spellOut = (code) => code.split("").join(" ");

export function createSession() {
  let active = false;
  let role = null;
  let kind = null;
  let code = null;
  let creds = null;
  let peersR = null;
  let hooks = null; // { player, world, say, getTheme, applyTheme }
  let timer = null;
  let inFlight = false;
  let lastRoster = "";
  let guideAwayTold = false;
  let confirmTarget = null;
  let latestPeers = [];
  let distTick = 0;
  let lastTetherAt = 0;

  const lobby = $("lobby");
  const views = { choose: $("lobby-view-choose"), code: $("lobby-view-code"), join: $("lobby-view-join"), notice: $("lobby-view-notice") };
  const status = (msg) => { $("lobby-status").textContent = msg; };
  const isMember = () => active && role === "member";
  const say = (msg) => hooks?.say(msg);
  // Voice without the page-level live region: used when a modal is about to
  // open, which would make that region inert mid-announcement.
  const speakOnly = (msg) => hooks?.speak(msg);

  // ---------- views & dialog ----------
  function showView(name) { for (const [k, el] of Object.entries(views)) el.hidden = k !== name; }
  function openDialog(focusEl) { lobby.hidden = false; if (!lobby.open) lobby.showModal(); (focusEl || lobby).focus(); }
  function closeDialog() { if (lobby.open) lobby.close(); lobby.hidden = true; $("scene")?.focus(); }
  lobby.addEventListener("cancel", (e) => {
    // The boot lobby is a gate: Escape must not dismiss it. The join and notice views are escapable.
    if (!views.join.hidden || !views.notice.hidden) { closeDialog(); return; }
    e.preventDefault();
  });

  function applyRestrictions() {
    document.body.classList.toggle("sess-member", isMember());
    document.body.classList.toggle("sess-active", active);
    $("conn-btn").hidden = !active;
    $("join-btn").hidden = active;
    renderChip();
    if (active) renderConnBtn();
  }

  // ---------- code chip + group panel ----------
  const chip = $("code-chip");
  const panel = $("conn-panel");
  const connBtn = $("conn-btn");
  function renderChip() {
    const show = active && !!code;
    chip.hidden = !show;
    if (!show) return;
    const label = kind === "event" ? "Event code" : "Tour code";
    $("code-chip-label").textContent = label;
    $("code-chip-text").textContent = code;
    chip.setAttribute("aria-label", `${label} ${spellOut(code)} — group details`);
  }
  const setExpanded = (on) => { connBtn.setAttribute("aria-expanded", String(on)); chip.setAttribute("aria-expanded", String(on)); };
  function openPanel() { panel.hidden = false; setExpanded(true); renderPanel(latestPeers); $("conn-title").focus(); }
  function closePanel() { if (panel.hidden) return; panel.hidden = true; confirmTarget = null; setExpanded(false); }
  const collapseFocus = () => (chip.hidden ? connBtn : chip).focus();
  chip.addEventListener("click", () => (panel.hidden ? openPanel() : (closePanel(), chip.focus())));
  connBtn.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  $("conn-close").addEventListener("click", () => { closePanel(); collapseFocus(); });
  addEventListener("keydown", (e) => { if (e.code === "Escape" && !panel.hidden) { closePanel(); collapseFocus(); } });
  $("conn-copy").addEventListener("click", () => copyCode($("conn-copy")));
  function renderConnBtn(count) {
    const n = count ?? latestPeers.length + 1;
    connBtn.querySelector(".btn-txt").textContent = `Group (${n})`;
  }
  async function copyCode(btn) {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); btn.textContent = "Copied!"; say("Code copied to your clipboard."); }
    catch { btn.textContent = "Couldn't copy"; say(`Couldn't copy automatically — the code is ${spellOut(code)}.`); }
    setTimeout(() => { btn.textContent = "Copy code"; }, 1500);
  }
  function distanceText(x, z, floor) {
    const p = hooks?.player.object.position;
    if (!p) return "";
    const mine = hooks.player.state.floor || null;
    if ((floor || null) !== mine) return floor ? `Level ${floor}` : "outside";
    const m = Math.round(Math.hypot(p.x - x, p.z - z));
    return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  }
  function renderPanel(peers) {
    latestPeers = peers;
    if (panel.hidden) return;
    const focusedRow = document.activeElement?.closest?.("#conn-list > li")?.dataset.peerId;
    const k = KIND_LABEL[kind] || "group";
    $("conn-title").textContent = kind === "event" ? "Event group" : "Tour group";
    $("conn-code").textContent = `Code ${code} — share it to invite people to this ${k}.`;
    const list = $("conn-list");
    list.replaceChildren();
    list.append(row(`${creds.name} (you)`, role === "guide", null, null));
    for (const peer of peers) {
      const li = row(peer.name + (peer.away ? " — reconnecting…" : ""), peer.role === "guide", distanceText(peer.state.x, peer.state.z, peer.state.floor), peer.id);
      if (role === "guide" && peer.role !== "guide") appendKick(li, peer);
      list.append(li);
    }
    $("conn-leave").textContent = role === "guide" ? `End the ${k} for everyone` : `Leave the ${k}`;
    $("conn-hint").textContent = role === "guide"
      ? "Remove takes two taps — nothing happens on the first one."
      : "Only the guide can remove people. Guidance is the guide's during the session.";
    renderConnBtn(peers.length + 1);
    if (focusedRow && confirmTarget !== focusedRow) {
      (panel.querySelector(`[data-peer-id="${focusedRow}"] .conn-kick`) || $("conn-title")).focus();
    } else if (focusedRow) {
      // The row we were confirming on may have vanished (they left first), taking
      // the focused button with it. appendKick re-focuses only if it re-rendered.
      requestAnimationFrame(() => {
        if (document.activeElement === document.body && !panel.hidden) $("conn-title").focus();
      });
    }
  }
  function row(text, isGuide, dist, peerId) {
    const li = document.createElement("li");
    li.className = "conn-row";
    if (peerId) li.dataset.peerId = peerId;
    const nm = document.createElement("span");
    nm.className = "conn-name" + (isGuide ? " conn-guide" : "");
    nm.textContent = (isGuide ? "★ " : "") + text + (isGuide ? " — Guide" : "");
    li.append(nm);
    if (dist) { const d = document.createElement("span"); d.className = "conn-dist"; d.textContent = dist; li.append(d); }
    return li;
  }
  function appendKick(li, peer) {
    const btn = (text, cls, label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.setAttribute("aria-label", label); b.addEventListener("click", fn); return b; };
    if (confirmTarget === peer.id) {
      const yes = btn("Yes, remove", "conn-kick conn-kick-confirm", `Confirm: remove ${peer.name} from the group`, () => kick(peer));
      const no = btn("Cancel", "conn-kick", `Cancel removing ${peer.name}`, () => { confirmTarget = null; renderPanel(latestPeers); });
      li.append(yes, no);
      requestAnimationFrame(() => yes.focus());
    } else {
      li.append(btn("Remove", "conn-kick", `Remove ${peer.name} from the group`, () => { confirmTarget = peer.id; renderPanel(latestPeers); }));
    }
  }
  async function kick(peer) {
    confirmTarget = null;
    try {
      const r = await api("kick", { code: creds.code, id: creds.id, token: creds.token, targetId: peer.id });
      if (!active) return;
      say(r.ok ? `${peer.name} was removed from the group.` : "Couldn't remove them — they may have already left.");
    } catch { if (active) say("Couldn't reach the server to remove them — try again."); }
    if (active) renderPanel(latestPeers.filter((p) => p.id !== peer.id));
  }
  $("conn-leave").addEventListener("click", async () => {
    const guide = role === "guide";
    const k = KIND_LABEL[kind] || "session";
    if (guide && !confirm(`End the ${k} for everyone? The group returns to solo mode.`)) return;
    if (timer) { clearInterval(timer); timer = null; }
    const c = creds;
    try { await api("leave", { code: c.code, id: c.id, token: c.token }); } catch { /* leaving anyway */ }
    teardown();
    $("scene")?.focus();
    say(guide ? `You ended the ${k}.` : `You left the ${k}. Exploring solo now.`);
  });

  // ---------- lifecycle ----------
  function teardown() {
    if (timer) { clearInterval(timer); timer = null; }
    active = false; role = null; kind = null; code = null; creds = null;
    lastRoster = ""; confirmTarget = null; guideAwayTold = false; latestPeers = [];
    storage.save(null);
    peersR?.clear();
    closePanel();
    applyRestrictions();
  }
  function showNotice(title, msg) {
    $("lobby-notice-title").textContent = title;
    $("lobby-notice-msg").textContent = msg;
    showView("notice");
    // Focus the REASON, not the button: "Keep exploring solo, button" alone
    // never tells you whether you were removed or the tour simply ended.
    openDialog($("lobby-notice-title"));
    // #status sits outside the dialog, so a modal makes it inert — announce
    // through the dialog's own live region instead.
    status(`${title}. ${msg}`);
  }
  $("lobby-notice-solo").addEventListener("click", closeDialog);
  function endedByServer(reason) {
    const k = KIND_LABEL[kind] || "session";
    const kicked = reason === "kicked";
    if (kicked && creds) storage.markKicked(creds.code, creds.id);
    teardown();
    speakOnly(kicked ? "You were removed from the group." : `The ${k} has ended.`);
    showNotice(kicked ? "Removed from the group" : "Session ended",
      kicked ? `The guide removed you from the ${k}. You can keep exploring the campus on your own.`
        : `The ${k} has ended. You're exploring on your own now — every feature is back.`);
  }

  async function joinByCode(c, name) {
    const marks = storage.kickmarks();
    const body = { code: c, name };
    if (marks[c]) body.id = marks[c];
    let r;
    try { r = await api("join", body); } catch { return { ok: false, error: "unreachable" }; }
    if (!r.ok) return r;
    creds = { code: r.code, id: r.id, token: r.token, kind: r.kind, role: r.role, name };
    active = true; role = r.role; kind = r.kind; code = r.code;
    storage.save(creds);
    storage.saveName(name);
    return r;
  }
  const joinError = (e) => ({
    "not-found": "No tour or event has that code — check it with your guide.",
    kicked: "You were removed from that group; the code no longer admits you.",
    full: "That group is full.",
    "slow-down": "Too many attempts from this device — wait a minute and try again.",
    unreachable: "Can't reach the session server — is ./serve.sh running?",
  })[e] || "Couldn't join.";

  function beginSync() {
    if (!active || !hooks || timer) return;
    const k = KIND_LABEL[kind];
    say(role === "guide"
      ? `Your ${k} is live. The join code is ${spellOut(code)}. Open the Group panel to see everyone or to end the ${k}.`
      : `You're in a ${k} — the guide wears the gold beacon, and the group stays within 200 feet of them. Guidance is the guide's during the session.`);
    timer = setInterval(sync, SYNC_MS);
    sync();
  }
  async function sync() {
    if (!active || inFlight || !hooks) return;
    inFlight = true;
    try {
      const p = hooks.player;
      const payload = { code: creds.code, id: creds.id, token: creds.token,
        state: { x: p.object.position.x, y: p.object.position.y, z: p.object.position.z, yaw: p.object.rotation.y, moving: p.state.moving, floor: p.state.floor } };
      if (role === "guide") payload.world = { theme: hooks.getTheme() };
      const r = await api("sync", payload);
      if (!active) return;
      if (r.error === "not-found") {
        const rj = await api("join", { code: creds.code, name: creds.name, id: creds.id, token: creds.token });
        if (!active) return;
        if (rj.ok) { creds = { ...creds, id: rj.id, token: rj.token, role: rj.role }; role = rj.role; storage.save(creds); applyRestrictions(); }
        else if (rj.error === "kicked" || rj.error === "not-found") endedByServer(rj.error === "kicked" ? "kicked" : "ended");
        else say(`Reconnecting to the group… (${joinError(rj.error)})`); // full / slow-down: keep trying
        return;
      }
      if (r.error) { if (r.error === "kicked" || r.error === "ended") endedByServer(r.error); return; }
      if (r.you && r.you.role !== role) { role = r.you.role; applyRestrictions(); }
      peersR.setPeers(r.peers, p.state.floor);
      if (role !== "guide" && r.world?.theme) hooks.applyTheme(r.world.theme);
      for (const ev of r.events) announceEvent(ev);
      if (r.guideAway && !guideAwayTold && role !== "guide") { guideAwayTold = true; say("The guide's connection dropped — hang tight, the session stays open for a minute."); }
      if (!r.guideAway) guideAwayTold = false;
      const roster = r.peers.map((x) => `${x.id}\u0001${x.name}\u0001${x.away}`).sort().join("|");
      if (roster !== lastRoster) { lastRoster = roster; renderConnBtn(r.peers.length + 1); renderPanel(r.peers); }
      else latestPeers = r.peers;
    } catch { /* transient hiccup; next tick retries */ }
    finally { inFlight = false; }
  }
  function announceEvent(ev) {
    const k = KIND_LABEL[kind] || "group";
    const msg = ev.t === "join" ? `${ev.name} joined the ${k}.` : ev.t === "leave" ? `${ev.name} left the ${k}.` : ev.t === "kick" ? `${ev.name} was removed from the ${k}.` : null;
    if (msg) say(msg);
  }
  function enforceTether() {
    if (!isMember() || !hooks || !peersR) return;
    const gp = peersR.guidePos();
    if (!gp || !gp.seen) return; // no guide position received yet
    if ((gp.floor || null) !== (hooks.player.state.floor || null)) return; // the leash lives in the plane
    const p = hooks.player.object.position;
    const dx = p.x - gp.x, dz = p.z - gp.z;
    const d = Math.hypot(dx, dz);
    if (d <= TETHER_M) return;
    const far = d > TETHER_FAR_M;
    const k = TETHER_M / d;
    // Through the walker's own collision, so the leash can't drag anyone through a wall.
    hooks.player.nudgeTo(gp.x + dx * k, gp.z + dz * k);
    const now = performance.now();
    if (now - lastTetherAt < TETHER_MSG_COOLDOWN_MS) return;
    lastTetherAt = now;
    say(far ? "You've been brought to your group — tours stay within 200 feet of the guide." : "That's the 200-foot tour limit — stay with your guide.");
  }

  // ---------- lobby ----------
  // One in-flight lobby action at a time: a double-click must not mint two sessions.
  let busy = false;
  async function guarded(btn, fn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try { await fn(); } finally { busy = false; btn.disabled = false; }
  }
  function needName(input) {
    const name = (input.value || "").trim().replace(/\s+/g, " ").slice(0, 24);
    if (!name) { status("Enter your name first — the group sees it on your avatar."); input.focus(); }
    return name;
  }
  function openLobby() {
    return new Promise((settle) => {
      const nameInput = $("lobby-name");
      nameInput.value = storage.name();
      $("late-name").value = storage.name();
      const stored = storage.load();
      const resume = stored
        ? api("join", { code: stored.code, name: stored.name, id: stored.id, token: stored.token }).then((r) => {
          if (!r.ok) { storage.save(null); return false; }
          creds = { ...stored, id: r.id, token: r.token, role: r.role, kind: r.kind };
          active = true; role = r.role; kind = r.kind; code = r.code;
          storage.save(creds);
          return true;
        }).catch(() => false)
        : Promise.resolve(false);
      resume.then((resumed) => {
        if (resumed) { settle(); return; }
        showView("choose");
        openDialog($("lobby-name")); // two of the three paths need a name first
        fetch("/api/health").then((r) => r.ok ? r.json() : null).catch(() => null).then((h) => {
          if (h && h.multiplayer) return;
          for (const id of ["lobby-tour", "lobby-event", "lobby-join"]) $(id).disabled = true;
          status("Tours and events need the campus session server — start the map with ./serve.sh. Guest mode still works.");
        });
        $("lobby-guest").addEventListener("click", () => { storage.save(null); closeDialog(); settle(); });
        async function create(k) {
          const name = needName(nameInput);
          if (!name) return;
          status(`Creating your ${KIND_LABEL[k]}…`);
          let r;
          try { r = await api("create", { kind: k, name }); } catch { status("Can't reach the session server — is ./serve.sh running?"); return; }
          if (!r.ok) { status(r.error === "server-full" ? "The server is full right now — try again soon." : r.error === "slow-down" ? "Too many attempts from this device — wait a minute and try again." : "Couldn't create the session."); return; }
          creds = { code: r.code, id: r.id, token: r.token, kind: k, role: "guide", name };
          active = true; role = "guide"; kind = k; code = r.code;
          storage.save(creds);
          storage.saveName(name);
          status(`Your ${KIND_LABEL[k]} code is ${spellOut(r.code)}. Share it with your group.`);
          $("lobby-code-kind").textContent = k === "tour" ? "Your tour is live" : "Your event is live";
          $("lobby-code-value").textContent = r.code;
          $("lobby-code-value").setAttribute("aria-label", `Session code ${spellOut(r.code)}`);
          showView("code");
          $("lobby-code-start").focus();
        }
        $("lobby-tour").addEventListener("click", () => guarded($("lobby-tour"), () => create("tour")));
        $("lobby-event").addEventListener("click", () => guarded($("lobby-event"), () => create("event")));
        $("lobby-code-copy").addEventListener("click", () => copyCode($("lobby-code-copy")));
        $("lobby-code-start").addEventListener("click", () => { closeDialog(); settle(); });
        $("lobby-code-back").addEventListener("click", async () => {
          const c = creds;
          const was = KIND_LABEL[kind] || "session";
          active = false; role = null; kind = null; code = null; creds = null;
          storage.save(null);
          applyRestrictions();
          try { if (c) await api("leave", { code: c.code, id: c.id, token: c.token }); } catch { /* ages out */ }
          showView("choose");
          status(`The ${was} was cancelled — its code no longer works. Pick how you want to explore.`);
          $("lobby-tour").focus();
        });
        async function join() {
          const name = needName(nameInput);
          if (!name) return;
          const c = $("lobby-code").value.trim().toUpperCase();
          if (!CODE_RE.test(c)) { status("Codes are 6 letters and numbers, like KWX7PQ."); $("lobby-code").focus(); return; }
          status(`Joining ${c}…`);
          const r = await joinByCode(c, name);
          if (!r.ok) { status(joinError(r.error)); return; }
          closeDialog();
          settle();
        }
        $("lobby-join").addEventListener("click", () => guarded($("lobby-join"), join));
        $("lobby-code").addEventListener("keydown", (e) => { if (e.key === "Enter") guarded($("lobby-join"), join); });
      }).catch((err) => {
        // Never hang boot on the lobby: fall through to a guest walk and say why.
        console.error("lobby failed; continuing as guest", err);
        try { closeDialog(); } catch { /* dialog may never have opened */ }
        settle();
      });
    });
  }

  // ---------- mid-walk join ----------
  $("join-btn").addEventListener("click", () => { if (active) return; status(""); showView("join"); openDialog($("late-name").value ? $("late-code") : $("late-name")); });
  $("late-cancel").addEventListener("click", () => { status(""); closeDialog(); $("join-btn").focus(); });
  async function lateJoin() {
    const name = needName($("late-name"));
    if (!name) return;
    const c = $("late-code").value.trim().toUpperCase();
    if (!CODE_RE.test(c)) { status("Codes are 6 letters and numbers, like KWX7PQ."); $("late-code").focus(); return; }
    status(`Joining ${c}…`);
    const r = await joinByCode(c, name);
    if (!r.ok) { status(joinError(r.error)); return; }
    status("");
    closeDialog();
    applyRestrictions();
    beginSync();
  }
  $("late-join").addEventListener("click", () => guarded($("late-join"), lateJoin));
  $("late-code").addEventListener("keydown", (e) => { if (e.key === "Enter") guarded($("late-join"), lateJoin); });

  addEventListener("pagehide", () => {
    if (!active || !creds || role === "guide") return;
    navigator.sendBeacon?.("/api/session/leave", new Blob([JSON.stringify({ code: creds.code, id: creds.id, token: creds.token })], { type: "application/json" }));
  });

  return {
    openLobby,
    get active() { return active; },
    get role() { return role; },
    blockWayfinding: () => isMember(),
    blockedWayfindingMsg: () => `During a ${KIND_LABEL[kind] || "tour"}, guidance is in your guide's hands — follow the gold beacon.`,
    start(h) { hooks = h; peersR = createPeers(h.world); applyRestrictions(); beginSync(); },
    update(dt) {
      peersR?.update(dt);
      enforceTether();
      if (!panel.hidden && (distTick += dt) > 1) {
        distTick = 0;
        for (const li of panel.querySelectorAll("#conn-list > li[data-peer-id]")) {
          const peer = latestPeers.find((p) => p.id === li.dataset.peerId);
          const span = li.querySelector(".conn-dist");
          if (peer && span) span.textContent = distanceText(peer.state.x, peer.state.z, peer.state.floor);
        }
      }
    },
  };
}
