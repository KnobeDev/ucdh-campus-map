// The touch joystick (3d/touch-controls.js) in a real browser, on an emulated phone and tablet
// (owner, 2026-11-21: "We need a joystick for mobile view in order to move around the map").
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright [AXE_MODULE=/path/to/node_modules/axe-core] \
//   [JOYSTICK_SHOTS=/dir/for/screenshots] node --test tools/test/touch-controls.browser.test.js
//
// Skipped without PLAYWRIGHT_MODULE. Fingers are real touches (CDP Input.dispatchTouchEvent), so
// the browser does its own hit-testing and pointer capture: one thumb on the joystick, another
// finger on the 3D view. They read the walker through window.__ucd3d, so they run the local build.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { serve } = require("./browser-harness.js");

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
const AXE = process.env.AXE_MODULE;
const SHOTS = process.env.JOYSTICK_SHOTS;
const WCAG21 = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const LOOK_PER_PX = 0.005; // player.js: a drag of one pixel turns the view this much

test("the touch joystick", { skip: !PLAYWRIGHT && "set PLAYWRIGHT_MODULE to run the browser checks" }, async (t) => {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  t.after(() => browser.close());
  const { server, base } = await serve({ site: false });
  t.after(() => server.close());

  /** The map, through the door; on a touch screen when `touch`. */
  async function openMap({ width, height, touch }) {
    const context = await browser.newContext({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    await page.goto(`${base}/3d/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#lobby[open]", { timeout: 30000 });
    await page.locator("#lobby-guest").click();
    await page.waitForFunction(() => document.getElementById("loading").hidden && !document.getElementById("hud").hidden, null, { timeout: 90000 });
    const cdp = await context.newCDPSession(page);
    /** touchStart / touchMove list every finger down, touchEnd the ones that lift; [x, y, id]. */
    const touch_ = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
    return { context, page, errors, touch: touch_ };
  }
  /** Wait for n more rendered frames (the walker moves once per frame; a software frame is slow). */
  const frames = (page, n) => page.evaluate((count) => new Promise((done) => {
    const info = window.__ucd3d.world.renderer.info.render;
    const until = info.frame + count;
    const tick = () => (info.frame >= until ? done() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
  const walker = (page) => page.evaluate(() => {
    const p = window.__ucd3d.player;
    return { x: p.object.position.x, z: p.object.position.z, yaw: p.object.rotation.y, mode: p.state.mode, floor: p.state.floor };
  });
  const focusOf = (page) => page.evaluate(() => ({ x: window.__ucd3d.overhead.focus.x, z: window.__ucd3d.overhead.focus.z, yaw: window.__ucd3d.overhead.yaw, box: window.__ucd3d.world.box }));
  const box = (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }, sel);
  const centreOf = (b) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
  const hits = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const stick = (page) => page.evaluate(() => ({
    active: window.__ucd3d.joystick.active,
    knob: document.querySelector("#joystick .joystick-knob").style.transform,
  }));
  async function axe(page, what) {
    if (!AXE) return;
    await page.evaluate(fs.readFileSync(path.join(AXE, "axe.min.js"), "utf8"));
    const found = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
      .then((r) => r.violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)), WCAG21);
    assert.deepStrictEqual(found, [], what);
  }
  async function shot(page, name) {
    if (!SHOTS) return;
    await frames(page, 3);
    await page.screenshot({ path: path.join(SHOTS, `joystick-${name}.png`) });
  }

  await t.test("a desktop with a mouse has no joystick, and its layout is as before", async () => {
    const { context, page, errors } = await openMap({ width: 1100, height: 760, touch: false });
    assert.strictEqual(await page.locator("#joystick").count(), 0, "no joystick without touch");
    assert.strictEqual(await page.evaluate(() => window.__ucd3d.joystick), null);
    const reserve = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--joy-reserve"));
    assert.strictEqual(reserve.trim(), "", "nothing reserved for it");
    // the keys still walk
    const before = await walker(page);
    await page.locator("#scene").focus();
    await page.keyboard.down("w");
    await frames(page, 4);
    await page.keyboard.up("w");
    const after = await walker(page);
    assert.ok(before.z - after.z > 0.2, `W walks forward: ${before.z} -> ${after.z}`);
    assert.deepStrictEqual(errors, []);
    await context.close();
  });

  const { context, page, errors, touch } = await openMap({ width: 375, height: 812, touch: true });
  t.after(() => context.close());
  const joyCentre = async () => centreOf(await box(page, "#joystick"));
  const radius = () => page.evaluate(() => {
    const b = document.getElementById("joystick").getBoundingClientRect().width;
    return (b - document.querySelector("#joystick .joystick-knob").offsetWidth) / 2;
  });

  await t.test("on a phone: shown at the bottom, pointer-only and hidden from assistive technology, big enough to hold", async () => {
    const info = await page.evaluate(() => {
      const el = document.getElementById("joystick");
      const r = el.getBoundingClientRect();
      return { aria: el.getAttribute("aria-hidden"), focusable: el.tabIndex >= 0 || !!el.querySelector("[tabindex], button, a, input"),
        w: r.width, h: r.height, bottom: r.bottom, ta: getComputedStyle(el).touchAction, text: el.textContent };
    });
    assert.strictEqual(info.aria, "true", "aria-hidden: W A S D move by keyboard, and a screen reader has nothing to operate here");
    assert.strictEqual(info.focusable, false, "nothing in it takes focus");
    assert.strictEqual(info.text, "", "and it says nothing");
    assert.ok(info.w >= 44 && info.h >= 44, `at least 44 px: ${info.w} x ${info.h}`);
    assert.ok(info.bottom > 812 - 40, `at the bottom of the screen: ${info.bottom}`);
    assert.strictEqual(info.ta, "none", "the page never scrolls or zooms under the thumb");
    const r = await box(page, "#joystick");
    assert.ok(r.left >= 0 && r.top >= 0 && r.right <= 375 && r.bottom <= 812, `whole on screen: ${JSON.stringify(r)}`);
    assert.ok(!hits(r, await box(page, "#minimap")), "clear of the inset map");
    assert.ok(!hits(r, await box(page, "#hud")), "clear of the panel");
    await shot(page, "phone-portrait-walk-light");
    await axe(page, "a phone, walking, with the joystick");
  });

  await t.test("pushing up walks forward, the way you face; letting go stops", async () => {
    const [cx, cy] = await joyCentre();
    const R = await radius();
    const before = await walker(page);
    await touch("touchStart", [[cx, cy - R, 1]]); // a full push up, from the press itself
    await frames(page, 4);
    const during = await stick(page);
    assert.strictEqual(during.active, true);
    assert.match(during.knob, /translate\(0px, -\d+(\.\d+)?px\)/, "the knob went up with the thumb");
    const walked = await walker(page);
    const fx = -Math.sin(before.yaw), fz = -Math.cos(before.yaw);
    const along = (walked.x - before.x) * fx + (walked.z - before.z) * fz;
    const across = (walked.x - before.x) * fz - (walked.z - before.z) * fx;
    assert.ok(along > 0.3, `walked forward along the facing: ${along} m`);
    assert.ok(Math.abs(across) < 0.05 * along + 1e-6, `and not sideways: ${across} m`);
    assert.strictEqual(walked.yaw, before.yaw, "the stick walks; it does not turn");
    await touch("touchEnd", [[cx, cy - R, 1]]);
    await frames(page, 2);
    const stopped = await walker(page);
    await frames(page, 4);
    const still = await walker(page);
    assert.deepStrictEqual([still.x, still.z], [stopped.x, stopped.z], "released: the walker stands still");
    assert.deepStrictEqual(await stick(page), { active: false, knob: "" }, "and the knob is back in the middle");

    // further is faster: a push half way walks slower than a full one
    const part = async (frac) => {
      const a = await walker(page);
      await touch("touchStart", [[cx + R * frac, cy, 2]]);
      const t0 = await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame);
      await frames(page, 6);
      await touch("touchEnd", [[cx + R * frac, cy, 2]]);
      const b = await walker(page);
      const t1 = await page.evaluate(() => window.__ucd3d.world.renderer.info.render.frame);
      return { d: Math.hypot(b.x - a.x, b.z - a.z), frames: t1 - t0 };
    };
    const strafeR = await walker(page);
    const half = await part(0.55);
    const afterHalf = await walker(page);
    const rx = Math.cos(strafeR.yaw), rz = -Math.sin(strafeR.yaw); // the walker's right
    assert.ok((afterHalf.x - strafeR.x) * rx + (afterHalf.z - strafeR.z) * rz > 0, "pushed right: a step to the right");
    const tiny = await part(0.05);
    assert.strictEqual(tiny.d, 0, "a resting thumb (the dead zone) never walks");
    assert.ok(half.d > 0, `a half push walks: ${JSON.stringify(half)}`);
  });

  await t.test("a second finger looks around while the first walks, and each lifts on its own", async () => {
    const [cx, cy] = await joyCentre();
    const R = await radius();
    const before = await walker(page);
    const thumb = [cx, cy - R, 3];
    await touch("touchStart", [thumb]);
    await touch("touchStart", [thumb, [200, 300, 4]]);
    for (let i = 1; i <= 10; i++) await touch("touchMove", [thumb, [200 + i * 10, 300, 4]]); // 100 px right
    await frames(page, 3);
    const both = await walker(page);
    assert.ok(Math.abs(both.yaw - before.yaw - (-100 * LOOK_PER_PX)) < 1e-9, `the 100 px drag turned the view right by 0.5 rad, and only it did: ${both.yaw - before.yaw}`);
    assert.ok(Math.hypot(both.x - before.x, both.z - before.z) > 0.3, "and the walker walked meanwhile");
    // lift the thumb: walking stops, the look goes on
    await touch("touchEnd", [thumb]);
    await frames(page, 2);
    const stopped = await walker(page);
    await touch("touchMove", [[320, 300, 4]]);
    await frames(page, 3);
    const looked = await walker(page);
    assert.deepStrictEqual([looked.x, looked.z], [stopped.x, stopped.z], "the thumb lifted: no more walking");
    assert.ok(Math.abs(looked.yaw - stopped.yaw - (-20 * LOOK_PER_PX)) < 1e-9, `the look finger still turns: ${looked.yaw - stopped.yaw}`);
    // press the stick again while that finger is still down: the look finger never steers it
    const thumb2 = [cx, cy - R, 5];
    await touch("touchStart", [[320, 300, 4], thumb2]);
    await touch("touchEnd", [[320, 300, 4]]);
    await frames(page, 3);
    assert.strictEqual((await stick(page)).active, true, "lifting the look finger never lets go of the stick");
    await touch("touchEnd", [thumb2]);
    await frames(page, 2);
    assert.strictEqual((await stick(page)).active, false);

    // Two fingers on the view: only the first turns it, and they never trade deltas (one slot
    // used to take both, and the view jumped by the distance between them).
    const y0 = (await walker(page)).yaw;
    await touch("touchStart", [[100, 300, 21]]);
    await touch("touchStart", [[100, 300, 21], [300, 450, 22]]);
    await touch("touchMove", [[120, 300, 21], [300, 450, 22]]);
    await touch("touchMove", [[120, 300, 21], [340, 450, 22]]);
    await frames(page, 2);
    const y1 = (await walker(page)).yaw;
    assert.ok(Math.abs(y1 - y0 - (-20 * LOOK_PER_PX)) < 1e-9, `the first finger's 20 px turned it, the second's 40 px did not: ${y1 - y0}`);
    await touch("touchEnd", [[120, 300, 21]]);
    await touch("touchMove", [[360, 450, 22]]);
    await frames(page, 2);
    const y2 = (await walker(page)).yaw;
    assert.ok(Math.abs(y2 - y1 - (-20 * LOOK_PER_PX)) < 1e-9, `the first lifted: the second takes over from where it is: ${y2 - y1}`);
    await touch("touchEnd", [[360, 450, 22]]);
  });

  await t.test("a cancelled touch, a dialog, the page hiding or the screen turning lets go", async () => {
    const [cx, cy] = await joyCentre();
    const R = await radius();
    const held = async (id) => {
      await touch("touchStart", [[cx, cy - R, id]]);
      await frames(page, 2);
      assert.strictEqual((await stick(page)).active, true);
    };
    const standsStill = async (what) => {
      await frames(page, 2);
      const a = await walker(page);
      await frames(page, 4);
      const b = await walker(page);
      assert.deepStrictEqual([b.x, b.z], [a.x, a.z], `${what}: the walker stands still`);
      assert.deepStrictEqual(await stick(page), { active: false, knob: "" }, `${what}: the knob is back`);
    };
    await held(6);
    await touch("touchCancel", []); // pointercancel
    await standsStill("pointercancel");

    await held(7);
    await page.evaluate(() => document.getElementById("floor-dialog").showModal());
    await standsStill("the floor picker opened");
    await touch("touchEnd", [[cx, cy - R, 7]]);
    await page.evaluate(() => document.getElementById("floor-dialog").close());

    await held(8);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await standsStill("the page lost focus");
    await touch("touchEnd", [[cx, cy - R, 8]]);

    // the page hiding (a phone's app switcher): document.hidden and visibilitychange, no blur
    await held(14);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await standsStill("the page hid");
    await page.evaluate(() => {
      delete document.hidden; // back to the prototype's own getter
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // the same thumb, still down, moving on: it does not take the joystick back
    await touch("touchMove", [[cx, cy - R * 0.9, 14]]);
    await standsStill("the page came back, the thumb moving on");
    await touch("touchEnd", [[cx, cy - R * 0.9, 14]]);

    // the view changing (V, by keyboard, while the thumb is down): nothing pans overhead
    await held(15);
    await page.locator("#scene").focus();
    await page.keyboard.press("v");
    await page.waitForFunction(() => window.__ucd3d.player.state.mode === "over");
    assert.strictEqual((await stick(page)).active, false, "the view changed: let go");
    const o1 = await focusOf(page);
    await touch("touchMove", [[cx, cy - R * 0.9, 15]]);
    await frames(page, 4);
    const o2 = await focusOf(page);
    assert.deepStrictEqual([o2.x, o2.z], [o1.x, o1.z], "overhead, the held thumb moves nothing");
    await touch("touchEnd", [[cx, cy - R * 0.9, 15]]);
    await page.keyboard.press("v");
    await page.waitForFunction(() => window.__ucd3d.player.state.mode === "walk");

    await held(9);
    await page.setViewportSize({ width: 812, height: 375 });
    await standsStill("the screen turned");
    await touch("touchEnd", [[cx, cy - R, 9]]);
    await page.setViewportSize({ width: 375, height: 812 });
    await frames(page, 3);
  });

  await t.test("overhead: the stick moves the map the way the camera faces, held on the campus; a one-finger drag still pans", async () => {
    await page.locator("#hud-toggle").click(); // the panel starts minimized on a phone
    await page.locator("#view-btn").click();
    await page.locator("#hud-toggle").click();
    await page.waitForFunction(() => window.__ucd3d.player.state.mode === "over");
    await page.evaluate(() => window.__ucd3d.overhead.lookAt(0, 0, 260));
    await page.waitForTimeout(400); // the gauges re-place a few times a second
    await frames(page, 2);
    const [cx, cy] = await joyCentre();
    const R = await radius();
    const push = async (dx, dy, n = 4, id = 10) => {
      const a = await focusOf(page);
      await touch("touchStart", [[cx + dx * R, cy + dy * R, id]]);
      await frames(page, n);
      await touch("touchEnd", [[cx + dx * R, cy + dy * R, id]]);
      await frames(page, 1);
      const b = await focusOf(page);
      return { dx: b.x - a.x, dz: b.z - a.z, yaw: b.yaw, box: b.box, at: b };
    };
    let m = await push(0, -1);
    assert.ok(m.dz < -2 && Math.abs(m.dx) < 1e-6, `up, facing north: the map moves north: ${JSON.stringify(m)}`);
    m = await push(1, 0);
    assert.ok(m.dx > 2 && Math.abs(m.dz) < 1e-6, `right: east: ${JSON.stringify(m)}`);
    // turned (the left arrow, by keyboard, unchanged): up is still toward the top of the screen
    await page.locator("#scene").focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
    m = await push(0, -1);
    const f = [-Math.sin(m.yaw), -Math.cos(m.yaw)]; // the way the camera faces
    const len = Math.hypot(m.dx, m.dz);
    assert.ok(len > 2 && (m.dx * f[0] + m.dz * f[1]) / len > 0.999, `up moves the way the camera faces: ${JSON.stringify(m)}`);
    // never off the campus
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // back to facing north
    await page.evaluate(() => { const { overhead, world } = window.__ucd3d; overhead.lookAt(world.box.maxX - 5, 0); });
    m = await push(1, 0, 30, 12);
    assert.ok(m.at.x <= m.box.maxX + 1e-9 && m.at.x > m.box.maxX - 1, `held at the campus's east edge: ${m.at.x} of ${m.box.maxX}`);
    // a one-finger drag on the view still pans
    await page.evaluate(() => window.__ucd3d.overhead.lookAt(0, 0, 260));
    const a = await focusOf(page);
    await touch("touchStart", [[200, 500, 13]]);
    for (let i = 1; i <= 6; i++) await touch("touchMove", [[200, 500 - i * 20, 13]]);
    await touch("touchEnd", [[200, 380, 13]]);
    await frames(page, 2);
    const b = await focusOf(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 5, `the drag moved the map: ${JSON.stringify([a, b])}`);
    await page.evaluate(() => window.__ucd3d.overhead.lookAt(0, -120, 420));
    await shot(page, "phone-portrait-overhead-light");
    await axe(page, "a phone, overhead, with the joystick and the gauges");
  });

  await t.test("never over the panel, the inset map or the gauges; whole on screen at phone and tablet sizes", async () => {
    const SIZES = [[375, 812], [812, 375], [768, 1024], [1100, 760]];
    const check = async (at) => {
      await page.waitForTimeout(400);
      await frames(page, 2);
      const vw = await page.evaluate(() => innerWidth), vh = await page.evaluate(() => innerHeight);
      const j = await box(page, "#joystick");
      assert.ok(j && j.left >= 0 && j.top >= 0 && j.right <= vw && j.bottom <= vh, `${at}: whole on screen ${JSON.stringify(j)}`);
      for (const sel of ["#hud", "#minimap", "#heading-strip", "#pitch-scale", "#code-chip", "#conn-panel"]) {
        const o = await box(page, sel);
        assert.ok(!hits(j, o), `${at}: clear of ${sel} ${JSON.stringify(j)} ${JSON.stringify(o)}`);
      }
      // what is drawn at its centre is the joystick itself, so a thumb there reaches it
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("#joystick") !== null, centreOf(j));
      assert.ok(top, `${at}: nothing covers it`);
    };
    for (const mode of ["over", "walk"]) {
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        for (const corner of ["bottom-left", "top-right"]) {
          if (await page.evaluate(() => window.__ucd3d.minimap.corner) !== corner) await page.locator("#minimap-move").click();
          for (const panel of ["open", "closed"]) {
            const open = await page.locator("#hud-toggle").getAttribute("aria-expanded") === "true";
            if (open !== (panel === "open")) await page.locator("#hud-toggle").click();
            await check(`${mode}, ${w} x ${h}, map ${corner}, panel ${panel}`);
          }
        }
        if (w === 812 && SHOTS) {
          if (await page.evaluate(() => window.__ucd3d.minimap.corner) !== "bottom-left") await page.locator("#minimap-move").click();
          if (await page.locator("#hud-toggle").getAttribute("aria-expanded") === "true") await page.locator("#hud-toggle").click();
          await page.waitForTimeout(400);
          await shot(page, `phone-landscape-${mode === "over" ? "overhead" : "walk"}-light`);
        }
      }
      if (mode === "over") {
        await page.locator("#scene").focus();
        await page.keyboard.press("v"); // back to walking
        await page.waitForFunction(() => window.__ucd3d.player.state.mode === "walk");
      }
    }
    // the inset map hidden: the joystick goes home
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.evaluate(() => window.__ucd3d.minimap.corner) !== "bottom-left") await page.locator("#minimap-move").click();
    await page.locator("#minimap-hide").click();
    await check("375 x 812, map hidden");
    await page.locator("#minimap-show").click();
    await check("375 x 812, map shown again");
  });

  await t.test("the captions make room for it", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const [w, h] of [[375, 812], [812, 375]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => { if (!window.__ucd3d.speech.enabled) window.__ucd3d.speech.setEnabled(true, false); });
      await page.evaluate(() => document.getElementById("voice-btn").click()); // "Voice off." captioned, the voice being off
      await page.waitForFunction(() => !document.getElementById("captions").hidden, null, { timeout: 5000 });
      await page.waitForTimeout(300);
      const c = await box(page, "#captions"), j = await box(page, "#joystick");
      assert.ok(c && j && !hits(c, j), `${w} x ${h}: the caption is clear of the joystick ${JSON.stringify(c)} ${JSON.stringify(j)}`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
  });

  await t.test("screenshots, dark theme", { skip: !SHOTS && "set JOYSTICK_SHOTS to save screenshots" }, async () => {
    await page.evaluate(() => document.getElementById("theme-btn").click());
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await shot(page, "phone-portrait-walk-dark");
    const [cx, cy] = await joyCentre();
    const R = await radius();
    await touch("touchStart", [[cx + R * 0.5, cy - R * 0.8, 20]]);
    await frames(page, 3);
    await shot(page, "phone-portrait-walk-dark-pushed");
    await touch("touchEnd", [[cx + R * 0.5, cy - R * 0.8, 20]]);
    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(400);
    await shot(page, "phone-landscape-walk-dark");
    await page.locator("#scene").focus();
    await page.keyboard.press("v");
    await page.evaluate(() => window.__ucd3d.overhead.lookAt(0, -120, 420));
    await page.waitForTimeout(400);
    await shot(page, "phone-landscape-overhead-dark");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    await shot(page, "phone-portrait-overhead-dark");
    await axe(page, "dark, overhead, with the joystick");
  });

  await t.test("large text (root 200%) on short screens: never under the open panel; smaller, or out of sight, where there is no room", async () => {
    // checker, 2026-11-21: the panel's 8rem floor (256 px at 200%) grew it down over the joystick
    if (await page.evaluate(() => window.__ucd3d.player.state.mode) !== "walk") { // the dark screenshots end overhead
      await page.locator("#scene").focus();
      await page.keyboard.press("v");
      await page.waitForFunction(() => window.__ucd3d.player.state.mode === "walk");
    }
    await page.evaluate(() => document.documentElement.style.setProperty("font-size", "200%"));
    const state = () => page.evaluate(() => {
      const j = document.getElementById("joystick");
      const r = j.getBoundingClientRect();
      const hud = document.getElementById("hud");
      const row = hud.querySelector(".hud-top").getBoundingClientRect();
      const h = hud.getBoundingClientRect();
      return { shown: !!r.width, j: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        hud: { left: h.left, top: h.top, right: h.right, bottom: h.bottom }, rowBottom: row.bottom, scrollTop: hud.scrollTop,
        centreHit: !!r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("#joystick") !== null };
    });
    const setPanel = async (want) => {
      const open = await page.locator("#hud-toggle").getAttribute("aria-expanded") === "true";
      if (open !== want) await page.locator("#hud-toggle").click();
    };
    if (await page.evaluate(() => window.__ucd3d.minimap.corner) !== "bottom-left") await page.locator("#minimap-move").click();
    // [w, h, panel open, shown]: the sizes the checker found covered, and the one with no room open
    const CASES = [[360, 640, true, true], [568, 320, true, true], [640, 360, true, true], [740, 360, true, true],
      [320, 568, false, true], [320, 568, true, false]];
    for (const [w, h, open, shown] of CASES) {
      await page.setViewportSize({ width: w, height: h });
      await setPanel(open);
      await page.waitForTimeout(400);
      await frames(page, 2);
      const s = await state();
      const at = `${w} x ${h} at 200%, panel ${open ? "open" : "closed"}`;
      assert.strictEqual(s.shown, shown, `${at}: ${shown ? "shown" : "out of sight"} ${JSON.stringify(s)}`);
      if (s.scrollTop === 0) assert.ok(s.hud.bottom >= s.rowBottom - 1, `${at}: the panel's Menu row is whole ${JSON.stringify(s)}`);
      if (!shown) continue;
      assert.ok(!hits(s.j, s.hud), `${at}: clear of the panel ${JSON.stringify(s)}`);
      assert.ok(s.centreHit, `${at}: nothing covers its centre`);
      assert.ok(s.j.left >= 0 && s.j.top >= 0 && s.j.right <= w && s.j.bottom <= h, `${at}: whole on screen`);
      assert.ok(s.j.right - s.j.left >= 96, `${at}: never smaller than 96 px`);
    }
    // out of sight, it takes no room: the panel and the captions use the screen as without it
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--joy-reserve").trim()), "0px");
    // closing the panel brings it back, and it still walks
    await setPanel(false);
    await page.waitForTimeout(400);
    await frames(page, 2);
    assert.ok((await state()).shown, "the panel closed: back");
    const [cx, cy] = await joyCentre();
    const R = await radius();
    const a = await walker(page);
    await touch("touchStart", [[cx, cy - R, 40]]);
    await frames(page, 4);
    await touch("touchEnd", [[cx, cy - R, 40]]);
    const b = await walker(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.1, `the smaller joystick walks: ${JSON.stringify([a, b])}`);
    await page.evaluate(() => document.documentElement.style.removeProperty("font-size"));
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    const back = await state();
    assert.ok(back.shown && back.j.right - back.j.left >= 128, `100% text again: full size ${JSON.stringify(back.j)}`);
  });

  await t.test("the floor picker, opened by the app (E at an elevator) while the thumb is down, lets go", async () => {
    // inside, at an elevator: the walker's own floor change, then onto the elevator's spot
    await page.evaluate(() => {
      const { player: p, hospital: h } = window.__ucd3d;
      const id = h.floors[0].id;
      p.goToFloor(id);
      const s = h.elevatorOn(id, null, p.object.position.x, p.object.position.z);
      p.object.position.x = s.x;
      p.object.position.z = s.z;
    });
    await page.waitForFunction(() => !document.getElementById("use-btn").hidden, null, { timeout: 10000 });
    await page.waitForTimeout(400); // the joystick re-places for the panel's wider top row
    await frames(page, 2);
    const [cx, cy] = await joyCentre();
    const R = await radius();
    await touch("touchStart", [[cx, cy - R, 41]]);
    await frames(page, 2);
    assert.strictEqual((await stick(page)).active, true);
    // E, the app's own way to use what you stand at (main.js onUse -> the picker). Chromium sends
    // no click for a tap by a second finger while the first is down, so a finger on Use elevator
    // cannot be the test's path (see the report: a real-device question).
    await page.locator("#scene").focus();
    await page.keyboard.press("e");
    await page.waitForFunction(() => document.getElementById("floor-dialog").open, null, { timeout: 5000 });
    await frames(page, 2);
    assert.deepStrictEqual(await stick(page), { active: false, knob: "" }, "the picker opened: let go");
    const a = await walker(page);
    await touch("touchMove", [[cx, cy - R * 0.9, 41]]);
    await frames(page, 4);
    assert.deepStrictEqual(await walker(page), a, "behind the picker, the held thumb moves nothing");
    await touch("touchEnd", [[cx, cy - R * 0.9, 41]]);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("floor-dialog").open);
  });

  await t.test("dispose takes it away with everything it added", async () => {
    const left = await page.evaluate(() => {
      const j = window.__ucd3d.joystick;
      j.dispose();
      const root = getComputedStyle(document.documentElement);
      return { el: !!document.getElementById("joystick"), reserve: root.getPropertyValue("--joy-reserve").trim(),
        floor: root.getPropertyValue("--hud-floor").trim() };
    });
    assert.deepStrictEqual(left, { el: false, reserve: "", floor: "" });
    // the view still changes, with nothing left to let go
    await page.locator("#scene").focus();
    await page.keyboard.press("v");
    await page.waitForFunction(() => window.__ucd3d.player.state.mode === "over");
    await page.keyboard.press("v");
    await page.waitForFunction(() => window.__ucd3d.player.state.mode === "walk");
  });

  await t.test("no page errors on the phone", () => {
    assert.deepStrictEqual(errors, []);
  });
});
