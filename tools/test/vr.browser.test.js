// The VR view (3d/vr.js, vr-controls.js) in a real (headless) browser, through Meta's WebXR
// emulator (IWER) playing a Quest 3 with Touch controllers (owner, 2026-11-21: "We need a VR view
// as well, similar to the campus VR capabilities").
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright IWER_MODULE=/path/to/node_modules/iwer[/build/iwer.js] \
//   [AXE_MODULE=/path/to/node_modules/axe-core] [VR_SHOTS=/dir/for/screenshots] node --test tools/test/vr.browser.test.js
//
// Skipped without PLAYWRIGHT_MODULE and IWER_MODULE (`npm i iwer` somewhere outside this repo).
// IWER's script is evaluated in the page, not added as a <script>: the page's own policy refuses
// inline script. It reads the walker through window.__ucd3d, so it runs the local build. One page
// walks the whole visit in order: booting the map again under software WebGL is slow.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { serve } = require("./browser-harness.js");

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
// the package directory works too: its UMD build is build/iwer.js
const IWER = (() => {
  const v = process.env.IWER_MODULE;
  if (!v) return v;
  try { return fs.statSync(v).isDirectory() ? path.join(v, "build", "iwer.js") : v; } catch { return v; }
})();
const AXE = process.env.AXE_MODULE;
const SHOTS = process.env.VR_SHOTS;
const WCAG21 = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SNAP = Math.PI / 6;
const skip = !PLAYWRIGHT ? "set PLAYWRIGHT_MODULE to run the browser checks"
  : !IWER ? "set IWER_MODULE to the iwer package (or its build/iwer.js) to run the VR checks" : false;

test("the VR view", { skip, timeout: 900_000 }, async (t) => {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  t.after(() => browser.close());
  const { server, base } = await serve({ site: false });
  t.after(() => server.close());
  const iwer = fs.readFileSync(IWER, "utf8");

  /** The map, through the door. With `headset`, IWER plays a Quest 3 from before the map boots. */
  async function openMap({ width = 1280, height = 800, touch = false, headset = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    await page.goto(`${base}/3d/index.html`, { waitUntil: "domcontentloaded" });
    if (headset) {
      await page.evaluate(iwer);
      await page.evaluate(() => {
        const xr = new window.IWER.XRDevice(window.IWER.metaQuest3);
        xr.installRuntime({ forceInstall: true });
        window.__xr = xr;
      });
    }
    await page.waitForSelector("#lobby[open]", { timeout: 30000 });
    await page.locator("#lobby-guest").click();
    await page.waitForFunction(() => document.getElementById("loading").hidden && !document.getElementById("hud").hidden, null, { timeout: 90000 });
    // what the voice says, recorded: the menu speaks through speech.speak, as the page's announcements do
    await page.evaluate(() => {
      window.__spoken = [];
      window.__ucd3d.speech.speak = (text) => { window.__spoken.push(String(text)); };
    });
    return { context, page, errors };
  }
  /** Wait for n more frames the renderer drew (in VR the headset's frame loop draws them, not the page's). */
  async function frames(page, n) {
    const from = await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame);
    await page.waitForFunction(([f, count]) => window.__ucd3d.world.renderer.info.render.frame >= f + count,
      [from, n], { timeout: 120_000, polling: 20 });
  }
  const walker = (page) => page.evaluate(() => {
    const { player, world, vr } = window.__ucd3d;
    const V = world.camera.position.constructor;
    const cam = world.camera;
    return {
      x: player.object.position.x, z: player.object.position.z, feet: player.groundY(),
      yaw: player.object.rotation.y, mode: player.state.mode, floor: player.state.floor,
      presenting: world.renderer.xr.isPresenting,
      onRig: cam.parent === player.xrRig, onFly: cam.parent === vr.flyRig,
      rigY: player.xrRig.getWorldPosition(new V()).y,
      flyY: vr.flyRig.position.y, flyX: vr.flyRig.position.x, flyZ: vr.flyRig.position.z, flyYaw: vr.flyRig.rotation.y,
      headY: cam.getWorldPosition(new V()).y,
    };
  });
  /** Everything the flat view is made of, to compare after leaving VR. */
  const flatView = (page) => page.evaluate(() => {
    const { player, world } = window.__ucd3d;
    const cam = world.camera;
    const pitchObj = player.object.children.find((c) => c.name !== "xr-rig");
    return {
      onPitch: cam.parent === pitchObj, pitch: pitchObj.rotation.x,
      pos: cam.position.toArray(), quat: cam.quaternion.toArray(), scale: cam.scale.toArray(),
      fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far, zoom: cam.zoom,
      projection: cam.projectionMatrix.toArray().map((v) => Math.round(v * 1e6) / 1e6),
      hud: document.getElementById("hud").hidden, gauges: document.getElementById("gauges").hidden,
      view: document.getElementById("view-btn").getAttribute("aria-pressed"),
      canvasLabel: document.getElementById("scene").getAttribute("aria-label"),
      canvas: (() => {
        const c = world.renderer.domElement;
        return { css: [c.style.width, c.style.height], buffer: [c.width, c.height], inner: [innerWidth, innerHeight] };
      })(),
    };
  });
  const menu = (page) => page.evaluate(() => {
    const c = window.__ucd3d.vr.controls;
    return { open: c.open, rows: c.open ? c.rows() : [], title: c.heading.title };
  });
  const lastSaid = (page) => page.evaluate(() => window.__spoken[window.__spoken.length - 1] || "");
  const saidCount = (page) => page.evaluate(() => window.__spoken.length);
  const saidSince = (page, n) => page.evaluate((from) => window.__spoken.slice(from), n);

  /** Press and let go of a controller button ("select" fires on the trigger's release). */
  async function press(page, hand, id) {
    await page.evaluate(([h, b]) => window.__xr.controllers[h].updateButtonValue(b, 1), [hand, id]);
    await frames(page, 3);
    await page.evaluate(([h, b]) => window.__xr.controllers[h].updateButtonValue(b, 0), [hand, id]);
    await frames(page, 3);
  }
  /** Hold a thumbstick for n frames, then let it go. */
  async function stick(page, hand, x, y, n) {
    await page.evaluate(([h, ax, ay]) => window.__xr.controllers[h].updateAxes("thumbstick", ax, ay), [hand, x, y]);
    await frames(page, n);
    await page.evaluate(([h]) => window.__xr.controllers[h].updateAxes("thumbstick", 0, 0), [hand]);
    await frames(page, 2);
  }
  /** Point the right controller at the middle of the menu row with this label, from low and to
   *  the right of the head (all in the rig's frame, the headset's reference space). */
  async function aimAt(page, label) {
    const found = await page.evaluate(async (want) => {
      const { MENU, menuHeight, menuRowTop } = await import("/3d/vr-math.js?v=1");
      const { vr, world } = window.__ucd3d;
      const rows = vr.controls.rows();
      const i = rows.findIndex((r) => r.label === want);
      if (i < 0) return false;
      const { panel } = vr.controls;
      const V = world.camera.position.constructor, M = world.camera.matrix.constructor, Q = world.camera.quaternion.constructor;
      panel.updateMatrix();
      const target = new V(0, 0.5 - (menuRowTop(i) + MENU.row / 2) / menuHeight(rows.length), 0).applyMatrix4(panel.matrix);
      const c = world.camera.position;
      const hand = new V(c.x + 0.15, c.y - 0.35, c.z - 0.1);
      const q = new Q().setFromRotationMatrix(new M().lookAt(hand, target, new V(0, 1, 0)));
      window.__xr.controllers.right.position.set(hand.x, hand.y, hand.z);
      window.__xr.controllers.right.quaternion.set(q.x, q.y, q.z, q.w);
      return true;
    }, label);
    assert.ok(found, `the menu has a "${label}" row: ${JSON.stringify((await menu(page)).rows.map((r) => r.label))}`);
    await frames(page, 3);
  }
  /** Point a controller at the ground `ahead` metres in front of the head (rig frame: the floor is y = 0). */
  async function aimAtGround(page, hand, ahead) {
    await page.evaluate(([h, d]) => {
      const { world } = window.__ucd3d;
      const V = world.camera.position.constructor, M = world.camera.matrix.constructor, Q = world.camera.quaternion.constructor;
      const c = world.camera.position;
      const from = new V(c.x + (h === "right" ? 0.15 : -0.15), c.y - 0.35, c.z - 0.1);
      const q = new Q().setFromRotationMatrix(new M().lookAt(from, new V(c.x, 0, c.z - d), new V(0, 1, 0)));
      window.__xr.controllers[h].position.set(from.x, from.y, from.z);
      window.__xr.controllers[h].quaternion.set(q.x, q.y, q.z, q.w);
    }, [hand, ahead]);
    await frames(page, 3);
  }
  /** Point a controller at a WORLD point (x, z) on the walker's ground (the rig's frame is the
   *  headset's reference space, so the point is taken into it). */
  async function aimAtWorld(page, hand, wx, wz) {
    await page.evaluate(([h, x, z]) => {
      const { world, player } = window.__ucd3d;
      const V = world.camera.position.constructor, M = world.camera.matrix.constructor, Q = world.camera.quaternion.constructor;
      const rig = world.camera.parent;
      rig.updateWorldMatrix(true, false);
      const target = new V(x, player.groundY(), z).applyMatrix4(new M().copy(rig.matrixWorld).invert());
      const c = world.camera.position;
      const from = new V(c.x + (h === "right" ? 0.15 : -0.15), c.y - 0.35, c.z - 0.1);
      const q = new Q().setFromRotationMatrix(new M().lookAt(from, target, new V(0, 1, 0)));
      window.__xr.controllers[h].position.set(from.x, from.y, from.z);
      window.__xr.controllers[h].quaternion.set(q.x, q.y, q.z, q.w);
    }, [hand, wx, wz]);
    await frames(page, 3);
  }
  /** Where the head is in the world, and the walker. */
  const headAndWalker = (page) => page.evaluate(() => {
    const { world, player } = window.__ucd3d;
    const h = world.camera.getWorldPosition(new world.camera.position.constructor());
    return { hx: h.x, hz: h.z, x: player.object.position.x, z: player.object.position.z };
  });
  async function aimUp(page, hand) {
    await page.evaluate((h) => {
      const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6); // 60° up about x
      window.__xr.controllers[h].quaternion.set(s, 0, 0, c);
    }, hand);
    await frames(page, 3);
  }
  const hopShown = (page) => page.evaluate(() => {
    let shown = false;
    window.__ucd3d.world.scene.traverse((o) => { if (o.name === "vr-hop" && o.visible) shown = true; });
    return shown;
  });
  async function axe(page, what) {
    if (!AXE) return;
    await page.evaluate(fs.readFileSync(path.join(AXE, "axe.min.js"), "utf8"));
    const found = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
      .then((r) => r.violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)), WCAG21);
    assert.deepStrictEqual(found, [], what);
  }
  async function shot(page, name) {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `vr-${name}.png`) });
  }

  await t.test("without a headset there is no Enter VR button", async () => {
    const { context, page, errors } = await openMap();
    try {
      await frames(page, 2);
      assert.strictEqual(await page.locator("#vr-btn").isHidden(), true, "hidden where no session can start");
      assert.strictEqual(await page.evaluate(() => window.__ucd3d.world.renderer.xr.enabled), true, "the renderer is ready for one all the same");
      assert.deepStrictEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test("on a phone with a headset runtime the button shows in the menu, labelled by its words", async () => {
    const { context, page, errors } = await openMap({ width: 390, height: 844, touch: true, headset: true });
    try {
      if (await page.locator("#hud-body").isHidden()) await page.locator("#hud-toggle").click();
      const btn = page.locator("#vr-btn");
      await btn.waitFor({ state: "visible" });
      const box = await btn.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `at least 44 px (${box.width} x ${box.height})`);
      assert.match(await page.evaluate(() => {
        const b = document.getElementById("vr-btn");
        return b.innerText;
      }), /Enter VR/);
      assert.strictEqual(await page.getByRole("button", { name: "Enter VR" }).count(), 1, "its accessible name holds its visible words (SC 2.5.3)");
      await btn.scrollIntoViewIfNeeded();
      await frames(page, 2);
      await shot(page, "phone-button");
      await axe(page, "WCAG 2.1 A/AA on a phone with the button");
      assert.deepStrictEqual(errors, []);
    } finally { await context.close(); }
  });

  const { context, page, errors } = await openMap({ headset: true });
  t.after(() => context.close());
  let flat;

  await t.test("on a desktop with a headset runtime the button shows, and the page passes axe", async () => {
    if (await page.locator("#hud-body").isHidden()) await page.locator("#hud-toggle").click();
    await page.locator("#vr-btn").waitFor({ state: "visible" });
    assert.strictEqual(await page.locator("#vr-btn .btn-txt").textContent(), "Enter VR");
    await frames(page, 2);
    await shot(page, "desktop-button");
    await axe(page, "WCAG 2.1 A/AA with the Enter VR button");
    flat = await flatView(page);
    assert.strictEqual(flat.onPitch, true);
  });

  await t.test("Enter VR: a session starts, frames keep coming, and the headset's floor is the walker's ground", async () => {
    await page.locator("#vr-btn").click();
    await page.waitForFunction(() => window.__ucd3d.world.renderer.xr.isPresenting, null, { timeout: 120_000 });
    const f0 = await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame);
    await frames(page, 10);
    assert.ok(await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame) >= f0 + 10, "the render loop runs inside the session");
    const w = await walker(page);
    assert.strictEqual(w.onRig, true, "the camera rides the VR rig");
    assert.ok(Math.abs(w.rigY - w.feet) < 1e-6, `the rig stands at the feet (${w.rigY} vs ${w.feet})`);
    const headset = await page.evaluate(() => window.__xr.position.y);
    assert.ok(Math.abs(w.headY - (w.feet + headset)) < 0.01, `the eye is the wearer's own height (${(w.headY - w.feet).toFixed(2)} m, headset ${headset} m)`);
    assert.strictEqual(await page.locator("#vr-btn .btn-txt").textContent(), "Exit VR");
    assert.match((await page.evaluate(() => window.__spoken.join(" | "))), /left stick walks/i, "the controls are said on the way in");
    assert.deepStrictEqual(await menu(page), { open: false, rows: [], title: "" }, "the menu starts down");
  });

  await t.test("What's ahead and Sonar say directions from where the head faces, not the body", async () => {
    const head = async (q) => { await page.evaluate((v) => window.__xr.quaternion.set(...v), q); await frames(page, 3); };
    const ahead = async () => {
      const n = await saidCount(page);
      await page.evaluate(() => window.__ucd3d.picking.identifyAhead());
      return (await saidSince(page, n)).join(" | ");
    };
    const sonar = async () => {
      await page.evaluate(() => window.__ucd3d.sonar.fire());
      await page.waitForTimeout(120); // the same words twice are written again 40 ms later
      return page.evaluate(() => document.getElementById("status").textContent);
    };
    const echoes = (text) => new Map(text.replace(/^Sonar: /, "").replace(/\.$/, "").split(". ")
      .map((line) => line.split(", ")).filter((p) => p.length === 3).map(([name, , dir]) => [name, dir]));
    const DIRS = ["ahead", "ahead right", "right", "behind right", "behind", "behind left", "left", "ahead left"];
    const yaw = (await walker(page)).yaw;
    const r = Math.SQRT1_2;
    const poses = { straight: [0, 0, 0, 1], left: [0, r, 0, r], right: [0, -r, 0, r], behind: [0, 1, 0, 0] };
    const turnOf = { straight: 0, left: Math.PI / 2, right: -Math.PI / 2, behind: Math.PI };
    let straight = null;
    for (const [name, q] of Object.entries(poses)) {
      await head(q);
      const f = await page.evaluate(() => window.__ucd3d.player.facingYaw());
      const want = yaw + turnOf[name];
      assert.ok(Math.abs(Math.atan2(Math.sin(f - want), Math.cos(f - want))) < 1e-3, `facing follows the head (${name}: ${f} vs ${want})`);
      const said = await ahead();
      assert.match(said, /(metres|right here) ahead/, `What's ahead names what is in front of the face as ahead (${name}): ${said}`);
      const e = echoes(await sonar());
      assert.ok(e.size > 0, `sonar heard something (${name})`);
      if (!straight) { straight = e; continue; }
      // the head turned by a whole number of eighths: every echo's word turns by as many
      const steps = Math.round(turnOf[name] / (Math.PI / 4)); // the head turned left: what was ahead is now right
      for (const [b, dir] of straight) {
        if (!e.has(b)) continue;
        assert.strictEqual(e.get(b), DIRS[(DIRS.indexOf(dir) + steps + 8) % 8], `${b} with the head ${name}`);
      }
    }
    await head(poses.straight);
  });

  await t.test("the left stick walks where the head looks; let go and it stops", async () => {
    await page.evaluate(() => window.__xr.quaternion.set(0, Math.SQRT1_2, 0, Math.SQRT1_2)); // head 90° left
    await frames(page, 2);
    const before = await walker(page);
    await stick(page, "left", 0, -1, 20);
    const after = await walker(page);
    const lx = -Math.cos(before.yaw), lz = Math.sin(before.yaw); // the walker's left
    const fx = -Math.sin(before.yaw), fz = -Math.cos(before.yaw);
    const along = (after.x - before.x) * lx + (after.z - before.z) * lz;
    const ahead = (after.x - before.x) * fx + (after.z - before.z) * fz;
    assert.ok(along > 0.3, `walked left, where the head looks (${along.toFixed(2)} m)`);
    assert.ok(Math.abs(ahead) < 0.05 * along, `not along the walker's heading (${ahead.toFixed(3)} m)`);
    await frames(page, 4);
    const still = await walker(page);
    assert.strictEqual(still.x, after.x, "let go: stopped");
    await page.evaluate(() => window.__xr.quaternion.set(0, 0, 0, 1));
  });

  await t.test("the right stick snaps 30° per push", async () => {
    const before = await walker(page);
    await stick(page, "right", 1, 0, 10);
    const once = await walker(page);
    assert.ok(Math.abs(once.yaw - (before.yaw - SNAP)) < 1e-6, `one snap right, held 10 frames (${once.yaw - before.yaw})`);
    await stick(page, "right", -1, 0, 4);
    assert.ok(Math.abs((await walker(page)).yaw - before.yaw) < 1e-6, "and one back left");
  });

  await t.test("one controller alone: its stick walks forward and back, and turns; a hand's pinch opens the menu", async () => {
    await page.evaluate(() => { window.__xr.controllers.left.connected = false; });
    await frames(page, 4);
    const b = await walker(page);
    await stick(page, "right", 0, -1, 15);
    const a = await walker(page);
    const ahead = (a.x - b.x) * -Math.sin(b.yaw) + (a.z - b.z) * -Math.cos(b.yaw);
    assert.ok(ahead > 0.3, `walked forward with the one stick (${ahead.toFixed(2)} m)`);
    await stick(page, "right", 1, 0, 6);
    assert.ok(Math.abs((await walker(page)).yaw - (b.yaw - SNAP)) < 1e-6, "and its sideways push turns");
    await stick(page, "right", -1, 0, 6);
    await page.evaluate(() => { window.__xr.controllers.left.connected = true; });
    await frames(page, 4);

    await page.evaluate(() => { window.__xr.primaryInputMode = "hand"; });
    await frames(page, 6);
    const mark = await saidCount(page);
    await page.evaluate(() => window.__xr.hands.right.updatePinchValue(1));
    await frames(page, 3);
    await page.evaluate(() => window.__xr.hands.right.updatePinchValue(0));
    await frames(page, 3);
    assert.strictEqual((await menu(page)).open, true, "a pinch pointing away from the ground opens the menu");
    assert.ok((await saidSince(page, mark)).some((t) => /^Menu open/.test(t)));
    await page.evaluate(() => window.__ucd3d.vr.controls.closeMenu());
    await page.evaluate(() => { window.__xr.primaryInputMode = "controller"; });
    await frames(page, 6);
    assert.strictEqual((await menu(page)).open, false);
  });

  let wallSpot = null; // a building's south wall, from the hop test
  await t.test("point at the ground and pull the trigger: hop there; a hop into a building is refused", async () => {
    await page.evaluate(() => { window.__ucd3d.player.object.rotation.y = 0; });
    await frames(page, 2);
    const before = await walker(page);
    await aimAtGround(page, "right", 3);
    assert.strictEqual(await hopShown(page), true, "a ring shows where the hop lands");
    await press(page, "right", "trigger");
    const after = await walker(page);
    assert.ok(Math.abs((before.z - after.z) - 3) < 0.6 && Math.abs(after.x - before.x) < 0.6, `hopped about 3 m ahead (${(before.z - after.z).toFixed(2)} m)`);
    assert.strictEqual((await menu(page)).open, false, "a hop is not a menu press");

    // a solid building straight ahead: stand a few metres south of one, facing it
    const spot = await page.evaluate(async () => {
      const { footprintAt } = await import("/3d/buildings.js?v=13");
      const { index, player } = window.__ucd3d;
      for (const list of index.cells.values()) {
        for (const e of list) {
          if (!e.solid || e.building?.renderedBy === "hospital") continue;
          const [minx, minz, maxx, maxz] = e.bbox;
          const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
          if (!footprintAt(index, cx, cz, true) || maxz - minz < 12) continue;
          // the first clear ground south of the middle, and 3 m further
          for (let d = 0.5; d < 40; d += 0.5) {
            if (footprintAt(index, cx, cz + d, true)) continue;
            player.teleport(cx, cz + d + 3);
            if (!player.canStandAt(cx, cz + d + 3)) break;
            player.object.rotation.y = 0;
            return { x: cx, z: cz + d + 3, edge: cz + d };
          }
        }
      }
      return null;
    });
    assert.ok(spot, "a building to hop at");
    wallSpot = spot;
    await frames(page, 3);
    const at = await walker(page);
    const into = at.z - (spot.edge - 3); // 3 m inside the wall
    await aimAtGround(page, "right", into);
    assert.strictEqual(await hopShown(page), false, "no ring on a building");
    assert.strictEqual(await page.evaluate(([x, z]) => window.__ucd3d.player.canStandAt(x, z), [spot.x, spot.edge - 3]), false);
    await press(page, "right", "trigger");
    const stayed = await walker(page);
    assert.ok(Math.abs(stayed.z - at.z) < 0.01 && Math.abs(stayed.x - at.x) < 0.01, "the walker did not move");
    const m = await menu(page);
    assert.strictEqual(m.open, true, "a trigger with nowhere to hop opens the menu");
    await press(page, "right", "b-button");
    assert.strictEqual((await menu(page)).open, false);
  });

  await t.test("stepping about the room moves the walker with the head, and a wall stops the head", async () => {
    const step = async (x, z) => { await page.evaluate(([px, pz]) => window.__xr.position.set(px, 1.6, pz), [x, z]); await frames(page, 2); };
    const start = await headAndWalker(page);
    assert.ok(Math.abs(start.hx - start.x) < 0.02 && Math.abs(start.hz - start.z) < 0.02, "the head stands on the walker");
    // a step to the right (the walker faces north, yaw 0: right is east)
    await step(0.6, 0);
    await frames(page, 2);
    let at = await headAndWalker(page);
    assert.ok(Math.abs(at.x - start.x - 0.6) < 0.02 && Math.abs(at.z - start.z) < 0.02, `the walker stepped with the head (${(at.x - start.x).toFixed(2)} m)`);
    assert.ok(Math.abs(at.hx - at.x) < 0.02 && Math.abs(at.hz - at.z) < 0.02, "and the head is still on it");
    await step(0, 0);
    await frames(page, 2);
    at = await headAndWalker(page);
    assert.ok(Math.abs(at.x - start.x) < 0.02 && Math.abs(at.z - start.z) < 0.02, "and back");
    // walk the head forward, 10 cm a step, 5 m: the building's wall is 3 m ahead
    const mark = await saidCount(page);
    for (let k = 1; k <= 50; k++) await step(0, -0.1 * k);
    await frames(page, 2);
    at = await headAndWalker(page);
    assert.ok(start.z - at.z > 1.5, `walked up to the wall (${(start.z - at.z).toFixed(2)} m)`);
    // wallSpot.edge is the first clear ground found in half-metre steps: the wall is within 0.5 m north of it
    assert.ok(at.hz > wallSpot.edge - 0.5, `the head did not go through the wall (head z ${at.hz.toFixed(2)}, wall by ${wallSpot.edge})`);
    assert.strictEqual(await page.evaluate(async ([x, z]) => {
      const { footprintAt } = await import("/3d/buildings.js?v=13");
      return !!footprintAt(window.__ucd3d.index, x, z, true);
    }, [at.hx, at.hz]), false, "the head is not inside the building");
    assert.ok(Math.abs(at.hz - at.z) < 0.15, "the head is held on the walker");
    assert.ok((await saidSince(page, mark)).some((t) => /^Wall/.test(t)), "and the wall is said");
    // back to the middle of the room in one go: a recentre, not a walk
    const held = at;
    await step(0, 0);
    await frames(page, 2);
    at = await headAndWalker(page);
    assert.ok(Math.abs(at.x - held.x) < 0.01 && Math.abs(at.z - held.z) < 0.01, "a jump of the pose moves nobody");
    assert.ok(Math.abs(at.hx - at.x) < 0.02 && Math.abs(at.hz - at.z) < 0.02, "and the head is on the walker again");
  });

  await t.test("a hop across a construction fence is refused", async () => {
    const f = await page.evaluate(() => {
      const { player, construction } = window.__ucd3d;
      player.leaveBuilding();
      player.teleport(-183, -185); // west of the California Tower site's fence (x -178), on X Street
      player.object.rotation.y = -Math.PI / 2; // facing east, at the fence
      let x = -183;
      while (x < -160 && !construction.zoneAt(x, -185)) x += 0.5;
      return { inside: construction.zoneAt(x + 3, -185) ? x + 3 : null, here: construction.zoneAt(-183, -185) == null, stand: player.canStandAt(-183, -185) };
    });
    assert.ok(f.here && f.stand && f.inside !== null, `outside the fence, with the site ahead: ${JSON.stringify(f)}`);
    await frames(page, 3);
    const before = await walker(page);
    await aimAtWorld(page, "right", f.inside, -185);
    assert.strictEqual(await hopShown(page), false, "no ring inside the fence");
    await press(page, "right", "trigger");
    const after = await walker(page);
    assert.ok(Math.abs(after.x - before.x) < 0.01 && Math.abs(after.z - before.z) < 0.01, "the walker did not move");
    if ((await menu(page)).open) await press(page, "right", "b-button");
    // and a hop along the street, this side of the fence, goes
    await aimAtWorld(page, "right", -190, -185);
    assert.strictEqual(await hopShown(page), true, "a ring on the street behind");
    await press(page, "right", "trigger");
    assert.ok(Math.abs((await walker(page)).x - -190) < 0.6, "hopped back along the street");
  });

  await t.test("a hop through a Medical Center door goes in, as walking through it does", async () => {
    const d = await page.evaluate(() => {
      const { hospital, player } = window.__ucd3d;
      for (const e of hospital.entrances) {
        for (let r = 5; r <= 9; r += 1) {
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8;
            const x = e.x + r * Math.cos(a), z = e.z + r * Math.sin(a);
            player.leaveBuilding();
            player.teleport(x, z);
            if (!player.canStandAt(x, z)) continue;
            const ux = (e.x - x) / r, uz = (e.z - z) / r;
            const to = { x: e.x + 2 * ux, z: e.z + 2 * uz }; // just past the door, inside
            if (!player.hop(to.x, to.z) || player.state.floor !== "1") continue; // a dry run
            player.leaveBuilding();
            player.teleport(x, z);
            player.object.rotation.y = Math.atan2(-ux, -uz); // facing the door
            return { from: { x, z }, to, label: e.label };
          }
        }
      }
      return null;
    });
    assert.ok(d, "a door to hop through");
    await page.evaluate(() => window.__ucd3d.walker.setWhere());
    await frames(page, 3);
    assert.strictEqual((await walker(page)).floor, null, "outdoors");
    const mark = await saidCount(page);
    await aimAtWorld(page, "right", d.to.x, d.to.z);
    await press(page, "right", "trigger");
    const w = await walker(page);
    assert.strictEqual(w.floor, "1", `in through the ${d.label}`);
    assert.ok((await saidSince(page, mark)).some((t) => /^Entered the Medical Center/.test(t)), "and it says so");
    // outdoors again for the menu's own rows
    await page.evaluate(([x, z]) => {
      const { player, walker } = window.__ucd3d;
      player.leaveBuilding();
      player.teleport(x, z);
      walker.setWhere();
    }, [d.from.x, d.from.z]);
    await frames(page, 3);
  });

  await t.test("B opens the menu of the page's own buttons; pointing reads a row, the trigger clicks the button", async () => {
    await aimUp(page, "left");
    const mark = await saidCount(page);
    await press(page, "right", "b-button");
    const m = await menu(page);
    assert.strictEqual(m.open, true, "B opened it");
    assert.ok((await saidSince(page, mark)).some((s) => /^Menu open/.test(s)), "and says so");
    assert.deepStrictEqual(m.rows.map((r) => r.label), [
      "Overhead view", "What's ahead", "Sonar", "Voice", "Dark mode",
      "Turning", "Hear the controls", "Exit VR", "Close menu",
    ]);
    assert.strictEqual(m.rows.find((r) => r.label === "Voice").state, "On", "the switch shows its state");
    await aimAt(page, "Voice");
    assert.strictEqual(await lastSaid(page), "Voice, on", "a ray landing on a row reads it out");
    await aimAt(page, "Dark mode");
    assert.strictEqual(await lastSaid(page), "Dark mode");
    if (SHOTS) {
      await frames(page, 4);
      await shot(page, "in-session-menu");
    }
    await press(page, "right", "trigger");
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "the row clicked the page's Dark mode button");
    assert.strictEqual(await lastSaid(page), "Dark mode.", "and says what it did");
    assert.ok((await menu(page)).rows.some((r) => r.label === "Light mode"), "the row now reads the button's new words");
    await press(page, "right", "trigger"); // still aimed: back to light
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    await aimAt(page, "Turning");
    assert.strictEqual(await lastSaid(page), "Turning, snap 30 degrees");
    await press(page, "right", "trigger");
    assert.strictEqual((await menu(page)).rows.find((r) => r.label === "Turning").state, "Smooth");
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("ucdh3d-vr-turn")), "smooth", "remembered");
    await press(page, "right", "trigger");
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("ucdh3d-vr-turn")), "snap");
  });

  await t.test("the Overhead view row flies: high over the map, level, the sticks fly, turn and climb", async () => {
    // stand the head off the play space's middle: coming back from the flight must not take the
    // gap between the rig's origin and the head for a step
    for (let k = 1; k <= 4; k++) { await page.evaluate((v) => window.__xr.position.set(0.1 * v, 1.6, 0.05 * v), k); await frames(page, 2); }
    const stood = await walker(page);
    const focus = [stood.x, stood.z];
    await aimAt(page, "Overhead view");
    await press(page, "right", "trigger");
    let w = await walker(page);
    assert.strictEqual(w.mode, "over");
    assert.strictEqual(w.onFly, true, "the camera rides the flying rig, not the flat view's orbit camera");
    assert.ok(w.flyY > 100 && Math.hypot(w.flyX - focus[0], w.flyZ - focus[1]) < 1, `over where the walker stood (${w.flyY} m up)`);
    assert.match(await lastSaid(page), /^Overhead view\. The left stick flies/);
    assert.ok((await menu(page)).rows.some((r) => r.label === "Walk"), "the row now offers the way back");
    await page.evaluate(() => window.__ucd3d.vr.controls.closeMenu());
    // what sizes the construction signs reads the camera before the draw: it must find the eye
    // on the flying rig, not the flat overhead view's orbit pose
    await page.evaluate(() => {
      const { construction, world, vr } = window.__ucd3d;
      const V = world.camera.position.constructor;
      const orig = construction.update;
      window.__signEye = [];
      construction.update = (...a) => {
        const eye = world.camera.getWorldPosition(new V()), rig = vr.flyRig.getWorldPosition(new V());
        window.__signEye.push(eye.distanceTo(rig));
        return orig.apply(construction, a);
      };
      window.__signEyeDone = () => { construction.update = orig; };
    });
    await frames(page, 4);
    const eyes = await page.evaluate(() => { window.__signEyeDone(); return window.__signEye; });
    assert.ok(eyes.length >= 3 && eyes.every((d) => d < 3), `the signs see the eye on the rig: ${eyes.map((d) => d.toFixed(1)).join(", ")} m from it`);
    const high = w.flyY;
    await stick(page, "right", 0, -1, 10);
    w = await walker(page);
    assert.ok(w.flyY > high, "right stick up climbs");
    const yaw0 = w.flyYaw, x0 = w.flyX, z0 = w.flyZ;
    await stick(page, "left", 0, -1, 10);
    w = await walker(page);
    const flown = (w.flyX - x0) * -Math.sin(yaw0) + (w.flyZ - z0) * -Math.cos(yaw0);
    assert.ok(flown > 5, `the left stick flies ahead, the way the flight faces (${flown.toFixed(1)} m)`);
    await stick(page, "right", 1, 0, 6);
    assert.ok(Math.abs((await walker(page)).flyYaw - (yaw0 - SNAP)) < 1e-6, "and the right stick turns the flight");
    await press(page, "right", "b-button");
    await aimAt(page, "Walk");
    await press(page, "right", "trigger");
    w = await walker(page);
    assert.strictEqual(w.mode, "walk");
    assert.strictEqual(w.onRig, true, "back on the walker's rig");
    assert.strictEqual(await lastSaid(page), "Walking.");
    await frames(page, 4);
    w = await walker(page);
    assert.ok(Math.abs(w.x - stood.x) < 1e-6 && Math.abs(w.z - stood.z) < 1e-6, `back where the flight started, not stepped (${(w.x - stood.x).toFixed(3)}, ${(w.z - stood.z).toFixed(3)})`);
    const hw = await headAndWalker(page);
    assert.ok(Math.abs(hw.hx - hw.x) < 0.02 && Math.abs(hw.hz - hw.z) < 0.02, "the head on the walker again");
    for (let k = 3; k >= 0; k--) { await page.evaluate((v) => window.__xr.position.set(0.1 * v, 1.6, 0.05 * v), k); await frames(page, 2); }
    await press(page, "right", "b-button");
    assert.strictEqual((await menu(page)).open, false);
  });

  await t.test("at an elevator the menu's Use row lists the floors, and choosing one changes floor", async () => {
    const atLift = await saidCount(page);
    await page.evaluate(() => {
      const { player, hospital } = window.__ucd3d;
      const node = hospital.floor("1").nodes.find((n) => n.id === "T_1_elev_main") || hospital.elevatorOn("1", null, 0, 0);
      player.goToFloor("1", node.elevatorId);
      window.__ucd3d.walker.setWhere(); // as walking in through a door does: the indoor buttons show
    });
    await page.waitForFunction(() => !document.getElementById("use-btn").hidden, null, { timeout: 30_000, polling: 50 });
    const useLabel = await page.locator("#use-btn .btn-txt").textContent();
    assert.ok((await saidSince(page, atLift)).some((s) => /here\. Open the menu \(B or Y, or pinch pointing up\) and choose Use/.test(s)), "the lift says how to use it in VR");
    await press(page, "right", "b-button");
    const rows = (await menu(page)).rows.map((r) => r.label);
    assert.ok(rows.includes(useLabel), `the menu offers "${useLabel}"`);
    assert.ok(rows.includes("Nearest elevator"), "and the indoor button");
    const mark = await saidCount(page);
    await aimAt(page, useLabel);
    await press(page, "right", "trigger");
    assert.strictEqual(await page.evaluate(() => document.getElementById("floor-dialog").open), true, "the page's floor picker opened");
    await frames(page, 3);
    const m = await menu(page);
    assert.strictEqual(m.open, true);
    assert.strictEqual(m.title, await page.locator("#floor-dialog-title").textContent(), "headed by the picker's own title");
    const here = m.rows.find((r) => r.state === "You are here");
    assert.ok(here && /Level 1/.test(here.label), "the floor you are on, marked");
    assert.strictEqual(m.rows[m.rows.length - 1].label, "Stay on this floor");
    assert.ok((await saidSince(page, mark)).some((s) => /Point at a floor to hear it/.test(s)), "the floors are announced");
    const pick = m.rows.find((r) => !r.state && r.label !== "Stay on this floor");
    assert.ok(pick, "another floor to go to");
    await aimAt(page, pick.label);
    assert.strictEqual(await lastSaid(page), pick.label);
    await press(page, "right", "trigger");
    const w = await walker(page);
    const want = await page.evaluate((name) => [...document.querySelectorAll("#floor-dialog-list button")].length === 0 ? null : name, pick.label);
    assert.ok(w.floor && w.floor !== "1", `took the elevator (${w.floor}, chose ${want ?? pick.label})`);
    assert.strictEqual(await page.evaluate(() => document.getElementById("floor-dialog").open), false, "the picker closed");
    await frames(page, 2);
    assert.strictEqual((await menu(page)).open, false, "and the menu with it");
    assert.ok((await saidSince(page, mark)).some((s) => /^Took the elevator to /.test(s)), "it says where it took you");
    const floorY = await page.evaluate((id) => window.__ucd3d.hospital.floor(id).y, w.floor);
    assert.ok(floorY !== 0 && Math.abs(w.feet - floorY) < 1e-6 && Math.abs(w.rigY - w.feet) < 1e-6, `the rig stands on the new floor (${w.feet} m)`);
    // and back down by the menu's Stay on this floor: nothing changes, the walker is not left paused
    await page.waitForFunction(() => !document.getElementById("use-btn").hidden, null, { timeout: 30_000, polling: 50 });
    await press(page, "right", "b-button");
    await aimAt(page, (await page.locator("#use-btn .btn-txt").textContent()));
    await press(page, "right", "trigger");
    await frames(page, 2);
    await aimAt(page, "Stay on this floor");
    await press(page, "right", "trigger");
    await frames(page, 2);
    assert.strictEqual(await page.evaluate(() => document.getElementById("floor-dialog").open), false);
    assert.strictEqual((await walker(page)).floor, w.floor, "stayed");
    assert.strictEqual(await lastSaid(page), "Stayed on this floor.");
    assert.strictEqual(await page.evaluate(() => window.__ucd3d.player.state.paused), false, "walking again");
  });

  await t.test("Exit VR from the menu puts the flat view back exactly as it was", async () => {
    await press(page, "right", "b-button");
    await aimAt(page, "Exit VR");
    await press(page, "right", "trigger");
    await page.waitForFunction(() => !window.__ucd3d.world.renderer.xr.isPresenting, null, { timeout: 60_000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const back = await flatView(page);
    assert.deepStrictEqual(back, flat, "camera carrier, pose, pitch, lens, HUD, gauges and the walking view as before");
    assert.strictEqual(await page.locator("#vr-btn .btn-txt").textContent(), "Enter VR");
    assert.strictEqual((await menu(page)).open, false);
    assert.match(await lastSaid(page), /Left VR/);
    const f0 = await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    assert.ok(await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame) > f0, "the flat screen's frames run again");
    assert.deepStrictEqual(errors, [], "no page errors");
  });

  await t.test("leaving VR from the overhead view, after the window changed size, gives back the flat overhead view at the new size", async () => {
    const warnings = [];
    const onConsole = (m) => { if (/warn/.test(m.type())) warnings.push(m.text()); };
    page.on("console", onConsole);
    const twoFrames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const overheadView = () => page.evaluate(() => {
      const { world, overhead } = window.__ucd3d;
      const cam = world.camera, c = world.renderer.domElement;
      const round = (a) => a.map((v) => Math.round(v * 1e5) / 1e5);
      return {
        onScene: cam.parent === world.scene, pos: round(cam.position.toArray()), quat: round(cam.quaternion.toArray()),
        focus: round([overhead.focus.x, overhead.focus.z]), yaw: overhead.yaw, pitch: overhead.pitch,
        gauges: document.getElementById("gauges").hidden, view: document.getElementById("view-btn").getAttribute("aria-pressed"),
        aspect: Math.round(cam.aspect * 1e6) / 1e6, css: [c.style.width, c.style.height], buffer: [c.width, c.height],
        want: [innerWidth, innerHeight, devicePixelRatio],
      };
    });
    try {
      await page.evaluate(() => document.getElementById("view-btn").click());
      await twoFrames();
      const over = await overheadView();
      assert.strictEqual(over.onScene, true, "the flat overhead view's orbit camera");
      assert.strictEqual(over.gauges, false, "with its gauges");
      await page.locator("#vr-btn").click();
      await page.waitForFunction(() => window.__ucd3d.world.renderer.xr.isPresenting, null, { timeout: 120_000 });
      await frames(page, 4);
      assert.strictEqual((await walker(page)).onFly, true, "overhead in VR flies");
      await page.setViewportSize({ width: 900, height: 640 });
      await frames(page, 6);
      await page.evaluate(() => window.__ucd3d.world.renderer.xr.getSession().end());
      await page.waitForFunction(() => !window.__ucd3d.world.renderer.xr.isPresenting, null, { timeout: 60_000 });
      await twoFrames();
      const back = await overheadView();
      const [w, h, dpr] = back.want;
      assert.deepStrictEqual([w, h], [900, 640]);
      assert.deepStrictEqual(back.css, ["900px", "640px"], "the canvas fills the new window");
      assert.deepStrictEqual(back.buffer, [Math.floor(900 * dpr), Math.floor(640 * dpr)], "and is drawn at its size");
      assert.strictEqual(back.aspect, Math.round((900 / 640) * 1e6) / 1e6, "with the new window's shape");
      const { css, buffer, aspect, want, ...same } = back;
      const { css: c0, buffer: b0, aspect: a0, want: w0, ...was } = over;
      assert.deepStrictEqual(same, was, "the orbit camera where it was, the gauges back");
      assert.deepStrictEqual(warnings.filter((m) => /Can't change size/.test(m)), [], "the page never asked a session to change size");
    } finally {
      page.off("console", onConsole);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => document.getElementById("view-btn").click());
      await twoFrames();
    }
    assert.strictEqual((await page.evaluate(() => window.__ucd3d.player.state.mode)), "walk");
    assert.deepStrictEqual(errors, [], "no page errors");
  });
});
