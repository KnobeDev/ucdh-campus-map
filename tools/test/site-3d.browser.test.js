// The 3D page in a real browser, in each build.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright [AXE_MODULE=/path/to/node_modules/axe-core] \
//   node --test tools/test/site-3d.browser.test.js
//
// Skipped without PLAYWRIGHT_MODULE. Chromium draws the scene in software here, which is
// slow but enough: these tests are about what the page asks for, offers and stores, not
// about how the campus looks.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { ROOT, serve } = require("./browser-harness.js");

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
const AXE = process.env.AXE_MODULE;
const NOTICE = "Unofficial test build — not affiliated with UC Davis Health";
const SITE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "3d", "campus-data.site.json"), "utf8"));

test("the 3D page in a browser", { skip: !PLAYWRIGHT && "set PLAYWRIGHT_MODULE to run the browser checks" }, async (t) => {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  t.after(() => browser.close());

  /** Open the 3D page; returns the page, the paths its server was asked for, and page errors. */
  async function open(options, before) {
    const { server, asked, posted, base } = await serve(options);
    t.after(() => server.close());
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    if (before) await before(page);
    await page.goto(`${base}/3d/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#lobby[open]", { timeout: 30000 });
    return { page, asked, posted, errors, base };
  }
  /** Through the door, and wait for the map to be up. */
  async function enter(page) {
    await page.locator("#lobby-guest").click();
    await page.waitForFunction(() => document.getElementById("loading").hidden && !document.getElementById("hud").hidden, null, { timeout: 90000 });
  }

  await t.test("site build: one door, no server asked, no tours, the site's data, the device's voice", async () => {
    const { page, asked, posted, errors } = await open({ site: true }, (p) => p.addInitScript(() => {
      // what an earlier local session on this origin would have left behind
      sessionStorage.setItem("ucdh3d-session", JSON.stringify({ code: "ABC234", id: "x", token: "y", name: "Pat" }));
      localStorage.setItem("ucdh3d-name", "Pat");
    }));
    // the door
    assert.strictEqual(await page.locator("#lobby-build-notice").textContent(), NOTICE);
    assert.ok(await page.locator("#lobby-build-notice").isVisible());
    const choices = await page.locator("#lobby button:visible").allTextContents();
    assert.strictEqual(choices.length, 1, `one way in: ${JSON.stringify(choices)}`);
    assert.match(choices[0], /Start exploring/);
    for (const id of ["lobby-tour", "lobby-event", "lobby-join", "lobby-name", "lobby-code"]) {
      assert.strictEqual(await page.locator(`#${id}`).isVisible(), false, `${id} is not offered`);
    }
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "lobby-guest", "focus is on the one choice");

    await enter(page);
    assert.deepStrictEqual(errors, []);
    // what it asked its server for
    for (const p of asked) {
      assert.doesNotMatch(p, /^\/api\//, `the site build asked ${p}`);
      assert.doesNotMatch(p, /lib\/piper\//, `the site build asked for the Piper voice: ${p}`);
      assert.doesNotMatch(p, /\/fun\//, `no members' extras without a yes: ${p}`);
    }
    assert.ok(asked.includes("/3d/campus-data.site.json"));
    assert.ok(!asked.includes("/3d/campus-data.json"), "the full data file, which holds traced outlines, is never read");
    assert.ok(asked.includes("/health-campus/api/entitlement"), "it asked whether this visit has members' extras");
    // what it offers
    assert.ok(await page.locator("#hud-build-notice").isVisible());
    assert.strictEqual(await page.locator("#hud-build-notice").textContent(), NOTICE);
    assert.strictEqual(await page.locator("#join-btn").isVisible(), false, "no Join a tour");
    assert.strictEqual(await page.locator("#conn-btn").isVisible(), false);
    assert.strictEqual(await page.locator("a.hud-link[href='../index.html']").count(), 1, "the 2D map is one link away");
    assert.strictEqual(await page.evaluate(() => typeof window.__ucd3d), "undefined", "no debugging handle on the site");
    // the destination list has every building, the signposted ones too
    const options = await page.locator("#wf-dest option").allTextContents();
    for (const b of SITE_DATA.buildings.filter((x) => x.marker)) assert.ok(options.some((o) => o.includes(b.name)), `${b.name} can be guided to`);
    // the summary a screen reader gets says how the outline-less buildings are shown
    assert.match(await page.locator("#status").textContent(), /Loaded \d+ campus buildings: \d+ drawn from OpenStreetMap and \d+ shown as named signposts, plus/);
    // the notice stays in the page for a screen reader when the menu is collapsed
    await page.locator("#hud-toggle").click();
    assert.strictEqual(await page.locator("#hud-body").isHidden(), true);
    assert.strictEqual(await page.locator("#hud-build-notice").evaluate((el) => el.closest("[hidden]") === null && getComputedStyle(el).display !== "none"), true);
    await page.locator("#hud-toggle").click();

    // A hidden control is still in the page. Forced, it must reach nothing: not the site's own
    // /api, not the browser's storage.
    const before = asked.length;
    await page.evaluate(() => {
      document.getElementById("late-name").value = "Mallory";
      document.getElementById("late-code").value = "ABC234";
      document.getElementById("late-join").click();
      document.getElementById("join-btn").click();
      document.getElementById("lobby-tour").click();
      document.getElementById("lobby-join").click();
      document.getElementById("conn-leave").click();
      window.dispatchEvent(new Event("pagehide"));
    });
    await page.waitForTimeout(600);
    for (const p of asked.slice(before)) assert.doesNotMatch(p, /^\/api\//, `a forced control asked ${p}`);
    assert.deepStrictEqual(posted, [], "nothing was posted anywhere");
    assert.strictEqual(await page.locator("#lobby").evaluate((el) => el.open), false, "and no join dialog opened");
    // what it kept: nothing of a session, and what was there before is untouched and unread
    const kept = await page.evaluate(() => ({
      local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(),
      name: localStorage.getItem("ucdh3d-name"), stored: sessionStorage.getItem("ucdh3d-session"),
    }));
    assert.deepStrictEqual(kept.session, ["ucdh3d-session"], "left as found");
    assert.strictEqual(kept.name, "Pat", "the name an earlier local visit left is neither changed nor replaced");
    assert.strictEqual(kept.stored, JSON.stringify({ code: "ABC234", id: "x", token: "y", name: "Pat" }));
    assert.ok(kept.local.every((k) => /^ucdh3d-(name|theme|panel|voice|captions|minimap-(corner|zoom|shown))$/.test(k)), `only the visitor's own display choices: ${kept.local}`);
    await page.close();
  });

  // Cloudflare Web Analytics adds a cross-origin module script to every page on the preview,
  // and the campus's CSP blocks it. It fails while the map loads; the loading line must not
  // call that a failure to start (it wrote "The 3D campus failed to start: Failed to load
  // https://static.cloudflareinsights…", 2026-11-17), and the map opens as usual.
  await t.test("site build: another origin's module script failing while the map loads is not a failure to start", async () => {
    const BEACON = "https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe7772f49c399c6a5babf22c1241717689176015";
    const failed = [];
    const { page, errors } = await open({ site: true }, async (p) => {
      await p.route("**/3d/index.html", async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        assert.ok(html.includes("</body>"));
        const tag = `<script defer type="module" src="${BEACON}" data-cf-beacon='{"token": "0123"}'></script>`;
        await route.fulfill({ response, body: html.replace("</body>", `${tag}</body>`) });
      });
      await p.route("https://static.cloudflareinsights.com/**", (route) => route.abort("blockedbyclient"));
      p.on("requestfailed", (request) => failed.push(request.url()));
    });
    assert.ok(failed.includes(BEACON), `the beacon was asked for and failed: ${JSON.stringify(failed)}`);
    assert.strictEqual(await page.locator("#loading").textContent(), "Loading the 3D campus…");
    await enter(page);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("site build: members' extras load only when the server says yes", async () => {
    const no = await open({ site: true, entitlement: { fun: false } });
    await enter(no.page);
    await no.page.waitForTimeout(800); // a late import() would show up by now
    assert.ok(no.asked.includes("/health-campus/api/entitlement"));
    assert.ok(!no.asked.some((p) => /\/fun\//.test(p)), "a no loads nothing from fun/");
    await no.page.close();

    const yes = await open({ site: true, entitlement: { fun: true } });
    await enter(yes.page);
    await yes.page.waitForFunction(() => performance.getEntriesByType("resource").some((r) => /\/3d\/fun\/fun\.js/.test(r.name)), null, { timeout: 15000 });
    assert.ok(yes.asked.includes("/3d/fun/fun.js"));
    assert.deepStrictEqual(yes.errors, []);
    await yes.page.close();
  });

  await t.test("site build: the door and the open menu pass the axe scan (WCAG 2.1 A and AA)", { skip: !AXE && "set AXE_MODULE to run the axe scans" }, async () => {
    const { page } = await open({ site: true });
    const scan = async (where) => {
      // Evaluated, not added as a script tag: the page's own policy allows scripts from itself only.
      await page.evaluate(fs.readFileSync(path.join(AXE, "axe.min.js"), "utf8"));
      const found = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })
        .then((r) => r.violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)));
      assert.deepStrictEqual(found, [], where);
    };
    await scan("the door");
    await enter(page);
    await scan("the map with its menu open");
    await page.close();
  });

  await t.test("local build: a tour still reaches the session server", async () => {
    const { page, posted } = await open({ site: false, sessions: true });
    await page.waitForFunction(() => !document.getElementById("lobby-tour").disabled);
    await page.locator("#lobby-name").fill("Pat");
    await page.locator("#lobby-tour").click();
    // this server has no session API beyond /api/health, so the create is refused; what
    // matters is that it was asked, once, and the page said so instead of hanging
    await page.waitForFunction(() => /session server|Couldn't create/.test(document.getElementById("lobby-status").textContent), null, { timeout: 10000 });
    assert.deepStrictEqual(posted, ["/api/session/create"]);
    await page.close();
  });

  await t.test("local build: tours, events and joining are offered, as they always were", async () => {
    const { page, asked } = await open({ site: false });
    const choices = await page.locator("#lobby .lobby-choice:visible").allTextContents();
    assert.strictEqual(choices.length, 3, JSON.stringify(choices));
    assert.ok(await page.locator("#lobby-name").isVisible());
    assert.ok(await page.locator("#lobby-join").isVisible());
    await page.waitForFunction(() => /session server/.test(document.getElementById("lobby-status").textContent));
    assert.ok(asked.includes("/api/health"), "the local build looks for its session server");
    assert.ok(await page.locator("#lobby-build-notice").isVisible(), "the notice is there in both builds");
    await enter(page);
    assert.ok(asked.some((p) => p === "/3d/campus-data.json"), "the full data file");
    assert.ok(!asked.includes("/3d/campus-data.site.json"));
    assert.strictEqual(await page.evaluate(() => typeof window.__ucd3d), "object");
    assert.ok(await page.locator("#join-btn").isVisible());
    await page.close();
  });

  await t.test("both doors: walk in, walk back out, and stay out (the Main Entrance used to loop in and out)", async () => {
    const { page } = await open({ site: false }); // the local build keeps its debugging handle
    await enter(page);
    const trips = await page.evaluate(() => {
      const { player, hospital } = window.__ucd3d;
      const STEP = 0.1; // ~ one frame of walking
      const walk = (dx, dz, n) => {
        const seen = [];
        for (let k = 0; k < n; k++) {
          const p = player.object.position;
          player.nudgeTo(p.x + dx * STEP, p.z + dz * STEP);
          const f = player.state.floor;
          if (seen[seen.length - 1] !== f) seen.push(f);
        }
        return seen;
      };
      return hospital.entrances.map((e) => {
        const dx = e.inside.x - e.x;
        const dz = e.inside.z - e.z;
        const l = Math.hypot(dx, dz);
        const ux = dx / l;
        const uz = dz / l;
        player.leaveBuilding();
        player.teleport(e.x - ux * 12, e.z - uz * 12); // 12 m out, facing the door
        const goingIn = walk(ux, uz, 150);
        const inside = player.state.floor;
        const comingOut = walk(-ux, -uz, 150);
        const p = player.object.position;
        return { label: e.label, goingIn, inside, comingOut, end: player.state.floor, fromDoor: Math.hypot(p.x - e.x, p.z - e.z) };
      });
    });
    for (const trip of trips) {
      assert.strictEqual(trip.inside, "1", `${trip.label}: walking at the door takes you in: ${JSON.stringify(trip)}`);
      assert.deepStrictEqual(trip.comingOut, ["1", null], `${trip.label}: walking back out leaves once and stays out: ${JSON.stringify(trip)}`);
      assert.ok(trip.fromDoor > 5, `${trip.label}: and keeps walking away from the door: ${JSON.stringify(trip)}`);
    }
    await page.close();
  });

  await t.test("the California Tower: drawn as its finished design, still fenced, and identify says both", async () => {
    const { page, errors } = await open({ site: false }); // the local build keeps its debugging handle
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player, picking } = window.__ucd3d;
      const parts = [];
      let ghostOfTower = false;
      world.scene.traverse((o) => {
        if (o.userData && o.userData.design) parts.push(o.userData.design);
        if (o.userData && o.userData.bucket === "construction") {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox; // the tower stands around x -95..-8, z -339..-178
          if (b.max.x > -100 && b.min.x < -10 && b.max.z > -330 && b.min.z < -190) ghostOfTower = true;
        }
      });
      // stand on 45th Street, east of the slab, and face it (west)
      player.leaveBuilding();
      player.teleport(15, -280);
      player.object.rotation.y = Math.PI / 2;
      player.object.children[0].rotation.x = 0;
      return { parts, ghostOfTower };
    });
    // the camera follows the walker when a frame is drawn
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent, shown: !document.getElementById("info").hidden };
    }));
    assert.deepStrictEqual(seen.parts.filter((n) => n.startsWith("California Tower")).sort(), ["California Tower · tower"], JSON.stringify(seen));
    assert.strictEqual(seen.ghostOfTower, false, "no orange ghost over the tower any more");
    assert.ok(seen.shown, "identify opens the card");
    assert.strictEqual(seen.title, "California Tower");
    assert.match(seen.meta, /14 floors \(estimated\)/);
    assert.match(seen.meta, /under construction until 2 February 2030, shown as the finished design/);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("Shriners Hospital: 8 storeys drawn with its own walls, identified as a finished building", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player } = window.__ucd3d;
      let top = null;
      world.scene.traverse((o) => {
        if (o.userData && o.userData.design === "Shriners Hospital · main") { o.geometry.computeBoundingBox(); top = o.geometry.boundingBox.max.y; }
      });
      // north of the building on X Street, facing south at it
      player.leaveBuilding();
      player.teleport(-200, -175);
      player.object.rotation.y = Math.PI;
      player.object.children[0].rotation.x = 0;
      return { top };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    assert.ok(seen.top > 30 && seen.top < 40, `8 storeys of 4.2 m: ${seen.top}`);
    assert.strictEqual(seen.title, "Shriners Hospital", JSON.stringify(seen));
    assert.match(seen.meta, /8 floors \(estimated\)/);
    assert.doesNotMatch(seen.meta, /under construction/, "a finished building says nothing of a site");
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("the MIND Institute: on its OSM outline, 2 storeys with a taller round tower, identified by name", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player } = window.__ucd3d;
      const tops = {};
      world.scene.traverse((o) => {
        if (o.userData && typeof o.userData.design === "string" && o.userData.design.startsWith("MIND Institute")) {
          o.geometry.computeBoundingBox();
          tops[o.userData.design] = o.geometry.boundingBox.max.y;
        }
      });
      // south of the building, facing north at its long south front
      player.leaveBuilding();
      player.teleport(588, 305);
      player.object.rotation.y = 0;
      player.object.children[0].rotation.x = 0;
      return { tops };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    assert.ok(seen.tops["MIND Institute · main"] > 8 && seen.tops["MIND Institute · main"] < 10, JSON.stringify(seen));
    assert.ok(seen.tops["MIND Institute · rotunda"] > seen.tops["MIND Institute · main"], "the round tower rises above the wings");
    assert.strictEqual(seen.title, "MIND Institute", JSON.stringify(seen));
    assert.match(seen.meta, /2 floors \(estimated\)/);
    // the round tower where it stands outside OSM's outline: identify names it, and it is solid
    await page.evaluate(() => {
      const { player } = window.__ucd3d;
      player.teleport(530, 262); // south-west of the tower, facing it
      player.object.rotation.y = Math.atan2(-16.5, 18.5);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const drum = await page.evaluate(() => {
      const { picking, player } = window.__ucd3d;
      picking.identifyAhead();
      const title = document.getElementById("info-title").textContent;
      // walk straight at the tower's west side (it sticks out past the outline there)
      player.teleport(530, 243.5);
      for (let k = 0; k < 200; k++) player.nudgeTo(player.object.position.x + 0.1, 243.5);
      return { title, stoppedAt: player.object.position.x };
    });
    assert.strictEqual(drum.title, "MIND Institute", JSON.stringify(drum));
    assert.ok(drum.stoppedAt < 539.6, `the tower's wall stops the walker (rim at x 539.5): ${drum.stoppedAt}`);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("Aggie Square: glass over a brick base, brick, pale walls and a garage, each identified by its name", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player, data } = window.__ucd3d;
      const box = {};
      world.scene.traverse((o) => {
        const n = o.userData && o.userData.design;
        if (typeof n === "string" && /Aggie Square/.test(n)) { o.geometry.computeBoundingBox(); box[n] = [o.geometry.boundingBox.min.y, o.geometry.boundingBox.max.y]; }
      });
      // stand on 3rd Avenue south of 400 Aggie Square and face north at it
      const ring = data.buildings.find((b) => b.code === "AS4").footprints[0].ring;
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
      const maxZ = Math.max(...ring.map((p) => p[1]));
      player.leaveBuilding();
      player.teleport(cx, maxZ + 25);
      player.object.rotation.y = 0;
      player.object.children[0].rotation.x = 0;
      return { box };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    const base = seen.box["Aggie Square - Lifelong Learning Building & East Lab · base"];
    const main = seen.box["Aggie Square - Lifelong Learning Building & East Lab · main"];
    assert.ok(base && main, JSON.stringify(seen.box));
    assert.ok(Math.abs(base[0]) < 1e-3 && Math.abs(base[1] - 8.4) < 1e-3, `the brick base: two storeys from the ground: ${base}`);
    assert.ok(Math.abs(main[0] - 8.4) < 1e-3 && Math.abs(main[1] - 33.6) < 1e-3, `the glass starts on top of it: ${main}`);
    assert.ok(Math.abs(seen.box["400 Aggie Square · main"][1] - 12.6) < 1e-3, "400 stands 3 storeys");
    assert.ok(seen.box["Aggie Square Garage · main"], "the garage is drawn as designed");
    assert.strictEqual(seen.title, "400 Aggie Square", JSON.stringify(seen));
    assert.match(seen.meta, /3 floors \(estimated\)/);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  // The owner, 2026-11-20: "in the helicopter view I seem to be stuck in one area and can't move
  // around the map with it." A plain drag only orbited the same spot (panning needed Shift held,
  // which nothing said and a finger can't do), so a mouse, pen or touch could not move the view.
  await t.test("overhead view: a drag moves the view across the whole campus, as on the 2D map", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    await page.locator("#view-btn").click();
    const state = () => page.evaluate(() => {
      const { overhead, world, player } = window.__ucd3d;
      const c = world.camera.position;
      return { x: overhead.focus.x, z: overhead.focus.z, cam: [c.x, c.y, c.z], mode: player.state.mode, box: world.box };
    });
    const first = await state();
    assert.strictEqual(first.mode, "over");
    const { box } = first;
    // the drags run over the map itself, clear of the panel and the inset map
    const L = 560, R = 900, T = 240, B = 560, MX = 730, MY = 400;
    const onMap = await page.evaluate((pts) => pts.every(([x, y]) => document.elementFromPoint(x, y)?.id === "scene"),
      [[L, MY], [R, MY], [MX, T], [MX, B]]);
    assert.ok(onMap, "the drag area is on the map, not on the panel or the inset map");
    const drag = async (from, to, times) => {
      for (let i = 0; i < times; i++) {
        await page.mouse.move(...from);
        await page.mouse.down();
        await page.mouse.move(...to, { steps: 6 });
        await page.mouse.up();
      }
    };
    const centre = () => page.evaluate(() => window.__ucd3d.overhead.lookAt(0, 0));
    // Grab the ground and pull: dragging it left takes the view east, and so on, to every edge.
    const reach = {};
    await centre(); await drag([R, MY], [L, MY], 8); reach.east = (await state()).x;
    await centre(); await drag([L, MY], [R, MY], 8); reach.west = (await state()).x;
    await centre(); await drag([MX, T], [MX, B], 8); reach.north = (await state()).z;
    await centre(); await drag([MX, B], [MX, T], 8); reach.south = (await state()).z;
    assert.ok(reach.east > 0.8 * box.maxX, `a drag reaches the east edge: ${JSON.stringify(reach)}`);
    assert.ok(reach.west < 0.8 * box.minX, `a drag reaches the west edge: ${JSON.stringify(reach)}`);
    assert.ok(reach.north < 0.8 * box.minZ, `a drag reaches the north edge: ${JSON.stringify(reach)}`);
    assert.ok(reach.south > 0.8 * box.maxZ, `a drag reaches the south edge: ${JSON.stringify(reach)}`);
    for (const v of Object.values(reach)) assert.ok(Number.isFinite(v), "and the view stays a number");
    assert.ok(reach.east <= box.maxX && reach.west >= box.minX && reach.north >= box.minZ && reach.south <= box.maxZ,
      `but never leaves the campus: ${JSON.stringify(reach)}`);
    // A drag is not a click: no place opened under the pointer (SC 2.5.2).
    assert.strictEqual(await page.locator("#info").isHidden(), true, "dragging opened nothing");

    // The arrow keys still pan, the wheel still zooms, and Shift+drag still turns the view around its spot.
    await centre();
    await page.keyboard.press("ArrowRight");
    assert.ok((await state()).x > 5, "an arrow tap pans");
    const before = await state();
    await page.mouse.move(MX, MY);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    const zoomed = await state();
    assert.ok(zoomed.cam[1] > before.cam[1] + 1, `the wheel zooms out: ${before.cam[1]} -> ${zoomed.cam[1]}`);
    await page.keyboard.down("Shift");
    await drag([L, MY], [R, MY], 1);
    await page.keyboard.up("Shift");
    const turned = await state();
    assert.ok(Math.abs(turned.x - zoomed.x) < 1e-6 && Math.abs(turned.z - zoomed.z) < 1e-6, "Shift+drag keeps the spot");
    assert.ok(Math.hypot(turned.cam[0] - zoomed.cam[0], turned.cam[2] - zoomed.cam[2]) > 10, "and turns the view around it");
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("Betty Irene Moore Hall: stone under white panels, its canopy on posts over the courtyard, identified as 2 floors from OSM", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player, data } = window.__ucd3d;
      const box = {};
      world.scene.traverse((o) => {
        const n = o.userData && o.userData.design;
        if (typeof n === "string" && n.startsWith("Betty Irene Moore Hall")) {
          const bb = { min: Infinity, max: -Infinity };
          o.traverse((m) => { if (m.geometry) { m.geometry.computeBoundingBox(); bb.min = Math.min(bb.min, m.geometry.boundingBox.min.y); bb.max = Math.max(bb.max, m.geometry.boundingBox.max.y); } });
          box[n] = [bb.min, bb.max];
        }
      });
      // west of the building on the lawn, facing east at it
      const ring = data.buildings.find((b) => b.code === "D").footprints[0].ring;
      const minX = Math.min(...ring.map((p) => p[0]));
      player.leaveBuilding();
      player.teleport(minX - 25, 0);
      player.object.rotation.y = -Math.PI / 2;
      player.object.children[0].rotation.x = 0;
      return { box };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    const base = seen.box["Betty Irene Moore Hall · base"];
    const main = seen.box["Betty Irene Moore Hall · main"];
    const canopy = seen.box["Betty Irene Moore Hall · canopy"];
    assert.ok(base && main && canopy, JSON.stringify(seen.box));
    assert.ok(Math.abs(base[1] - 5) < 1e-3 && Math.abs(main[0] - 5) < 1e-3 && Math.abs(main[1] - 10) < 1e-3, `stone to 5 m, panels 5-10 m: ${base} ${main}`);
    assert.ok(Math.abs(canopy[0]) < 1e-3 && canopy[1] > 7 && canopy[1] < 8, `the canopy stands on posts from the ground to about 7.5 m: ${canopy}`);
    assert.strictEqual(seen.title, "Betty Irene Moore Hall", JSON.stringify(seen));
    assert.match(seen.meta, /2 floors \(OpenStreetMap\)/);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("overhead view: the map's name and its linked hint say how to move it, and switch back on Walk", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const read = () => page.evaluate(() => {
      const c = document.getElementById("scene");
      return { label: c.getAttribute("aria-label"), describedby: c.getAttribute("aria-describedby"), hint: document.getElementById("hint").textContent };
    });
    const walk = await read();
    assert.strictEqual(walk.describedby, "hint", "the hint describes the map");
    assert.match(walk.label, /first person/);
    await page.locator("#view-btn").click();
    const over = await read();
    assert.match(over.label, /overhead view/i);
    assert.match(over.label, /Drag or the arrow keys move the map/);
    assert.match(over.hint, /drag or arrows move the map/i);
    await page.locator("#view-btn").click(); // now labelled "Walk"
    assert.strictEqual((await read()).label, walk.label, "back to the walking name");
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
  await t.test("Shriners Hospital: a 2-storey curved front on the plaza, the 8-storey block behind it, identified from the plaza", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player } = window.__ucd3d;
      const box = {};
      world.scene.traverse((o) => {
        const n = o.userData && o.userData.design;
        if (typeof n === "string" && n.startsWith("Shriners Hospital") && o.geometry) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          box[n] = { minY: b.min.y, maxY: b.max.y, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
        }
      });
      // in the plaza, at the centre of the curved front (OSM's quarter circle), facing it (south-east)
      player.leaveBuilding();
      player.teleport(-240, -137);
      player.object.rotation.y = (-3 * Math.PI) / 4; // forward = (-sin, -cos) = south-east
      player.object.children[0].rotation.x = 0;
      return { box };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    const front = seen.box["Shriners Hospital · front"];
    const main = seen.box["Shriners Hospital · main"];
    assert.ok(front && main, JSON.stringify(seen.box));
    assert.ok(Math.abs(front.minY) < 1e-3 && Math.abs(front.maxY - 8.4) < 1e-3, `the front: 2 storeys of 4.2 m from the ground: ${JSON.stringify(front)}`);
    assert.ok(Math.abs(main.maxY - 33.6) < 1e-3, `the block behind: 8 storeys: ${JSON.stringify(main)}`);
    assert.ok(front.maxX < -205 && front.maxZ < -105, `the front is the north-west corner, on the plaza: ${JSON.stringify(front)}`);
    assert.strictEqual(seen.title, "Shriners Hospital", JSON.stringify(seen));
    assert.match(seen.meta, /8 floors \(estimated\)/);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
  // The owner, 2026-11-20: "Recheck the Medical Center parking structure (night image) nearest
  // Stockton Blvd." Parking Structure 3 (OSM way 198423271) was a plain 7-storey box.
  await t.test("Parking Structure 3: six open decks, two stair towers and three solar canopies on its roof, identified from Stockton Boulevard", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, player } = window.__ucd3d;
      const box = {};
      let glows = false;
      world.scene.traverse((o) => {
        const n = o.userData && o.userData.design;
        if (typeof n === "string" && n.startsWith("Parking Structure 3") && o.geometry) {
          o.geometry.computeBoundingBox();
          (box[n] = box[n] || []).push([o.geometry.boundingBox.min.y, o.geometry.boundingBox.max.y]);
          if (n.endsWith("· main")) glows = [].concat(o.material).some((m) => (world.themeTargets.designMats || []).includes(m));
        }
      });
      // on Stockton Boulevard, 25 m out from the garage's south-west face (the chamfer between
      // OSM vertices (-360.94,-230.36) and (-336.76,-195.38)), facing it (north-east)
      player.leaveBuilding();
      player.teleport(-369.4, -198.6);
      player.object.rotation.y = Math.atan2(-0.823, 0.569); // forward = (-sin, -cos) = (0.823, -0.569)
      player.object.children[0].rotation.x = 0;
      return { box, glows };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    Object.assign(seen, await page.evaluate(() => {
      window.__ucd3d.picking.identifyAhead();
      return { title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
    }));
    const near = (a, b) => Math.abs(a - b) < 1e-3;
    const [main] = seen.box["Parking Structure 3 · main"] || [];
    assert.ok(main && near(main[0], 0) && near(main[1], 19.8), `six decks of 3.3 m from the ground: ${JSON.stringify(seen.box)}`);
    const towers = seen.box["Parking Structure 3 · stair tower"] || [];
    assert.strictEqual(towers.length, 2, JSON.stringify(seen.box));
    for (const [lo, hi] of towers) assert.ok(near(lo, 19.8) && near(hi, 24.3), `a tower rises from the roof deck: ${lo}-${hi}`);
    const panels = seen.box["Parking Structure 3 · solar canopy"] || [];
    assert.strictEqual(panels.length, 3, `three solar canopies: ${JSON.stringify(seen.box)}`);
    for (const [lo, hi] of panels) assert.ok(lo > 19.8 + 3 && near(hi, 24), `a canopy over the roof deck: ${lo}-${hi}`);
    const posts = seen.box["Parking Structure 3 · solar canopy posts"] || [];
    assert.ok(posts.length && near(posts[0][0], 19.8), `its posts stand on the roof deck: ${JSON.stringify(posts)}`);
    assert.ok(seen.glows, "the decks take the night glow, like every other building");
    assert.strictEqual(seen.title, "Parking 3 (hospital main)", JSON.stringify(seen));
    assert.match(seen.meta, /6 floors \(estimated\)/);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
  // Checker, 2026-11-20: the card said "8 floors (estimated)" for the Medical Center's outline
  // and its Pavilion, where hospital.js draws 1 and 3 storeys; then "1 floor (floorplan)" for
  // the outline, which the floor plan does not say either (second pass). Where the crosshair
  // lands, the card names the top floor the plan shows there (Pavilion 3, Davis Tower 14),
  // and over the rest of the outline says its height is not mapped.
  await t.test("the Medical Center: identify names the floor plan's top floor where it is looked at, and says where the height is not mapped", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const rings = await page.evaluate(() => Object.fromEntries(window.__ucd3d.data.buildings.find((b) => b.code === "T").footprints.map((f) => [f.osmName, f.ring])));
    const inRing = ([x, z], ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i]; const [xj, zj] = ring[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    const views = [
      // west of the outline's west lobe, facing it (east): a one-storey wall
      { at: [-420, -300], yaw: -Math.PI / 2, pitch: 0, part: "UC Davis Medical Center", not: ["Surgery and Emergency Services Pavilion", "UC Davis Davis Tower", "UC Davis University Tower", "UC Davis East Wing"], says: "height not mapped, drawn one storey high" },
      // on X Street, facing the Pavilion (north)
      { at: [-170, -215], yaw: 0, pitch: 0, part: "Surgery and Emergency Services Pavilion", says: "top floor 3 (floorplan)" },
      // at the roundabout, looking up over the Pavilion at the Davis Tower (north)
      { at: [-220, -215], yaw: 0, pitch: 0.52, part: "UC Davis Davis Tower", says: "top floor 14 (floorplan)" },
    ];
    for (const v of views) {
      await page.evaluate((v) => {
        const { player } = window.__ucd3d;
        player.leaveBuilding();
        player.teleport(v.at[0], v.at[1]);
        player.object.rotation.y = v.yaw;
        player.object.children[0].rotation.x = v.pitch;
      }, v);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const seen = await page.evaluate(() => {
        const { picking } = window.__ucd3d;
        picking.identifyAhead();
        return { hit: picking.lastHit ? picking.lastHit() : null, title: document.getElementById("info-title").textContent, meta: document.getElementById("info-meta").textContent };
      });
      const why = `${v.part}: ${JSON.stringify(seen)}`;
      assert.strictEqual(seen.title, "Medical Center", why);
      assert.ok(seen.hit, why);
      assert.ok(inRing([seen.hit.x, seen.hit.z], rings[v.part]), `the crosshair is on ${why}`);
      for (const other of v.not || []) assert.ok(!inRing([seen.hit.x, seen.hit.z], rings[other]), `not on ${other}: ${why}`);
      assert.ok(seen.meta.includes(v.says), why);
      assert.ok(!/\d+ floors? \(/.test(seen.meta), `no storey count is claimed: ${why}`);
    }
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
  // Checker, 2026-11-20: the real Medical Center was blank category-blue massing with no
  // helipads, while the finished California Tower beside it, white with two red-cross pads,
  // read as "the hospital". The Medical Center now has its own walls drawn in code (pale
  // walls, one band of windows per storey) and OSM's two rooftop helipads on the Davis Tower.
  await t.test("the Medical Center: walls with a window band per storey, OSM's two helipads on the Davis Tower roof", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { world, data } = window.__ucd3d;
      const pads = [];
      let walls = null;
      let massing = 0;
      world.scene.traverse((o) => {
        if (o.userData.hospitalPart === "helipad") {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          pads.push({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2, r: (b.max.x - b.min.x) / 2, map: !!o.material.map });
        }
        if (o.userData.hospitalPart === "massing") {
          massing++;
          const m = [].concat(o.material);
          walls = walls || { n: m.length, map: !!(m[1] && m[1].map), glows: (world.themeTargets.designMats || []).includes(m[1]) && !(world.themeTargets.designMats || []).includes(m[0]), repeatV: m[1] && m[1].map ? m[1].map.repeat.y : null };
        }
      });
      return { pads, walls, massing, floorH: data.hospital.floorH, want: data.hospital.helipads };
    });
    assert.ok(seen.massing > 13, `every floor ring and connector is drawn: ${seen.massing}`);
    assert.deepStrictEqual({ n: seen.walls.n, map: seen.walls.map, glows: seen.walls.glows }, { n: 2, map: true, glows: true }, JSON.stringify(seen.walls));
    assert.ok(Math.abs(-1 / seen.walls.repeatV - seen.floorH) < 1e-6, `one window band per ${seen.floorH} m storey: ${seen.walls.repeatV}`);
    assert.strictEqual(seen.pads.length, 2, JSON.stringify(seen.pads));
    for (const w of seen.want) {
      const p = seen.pads.find((q) => Math.hypot(q.x - w.x, q.z - w.z) < 0.5);
      assert.ok(p, `a helipad at OSM ${w.osmId}: ${JSON.stringify(seen.pads)}`);
      assert.ok(p.y > w.y && p.y < w.y + 0.5, `on the roof at ${w.y} m: ${p.y}`);
      assert.ok(Math.abs(p.r - w.radius) < 0.1 && p.map, JSON.stringify(p));
    }
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("the California Tower: only the slab is a building; its lot along X Street is not (owner, 2026-11-20)", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(() => {
      const { index, data } = window.__ucd3d;
      const f = data.buildings.find((b) => b.name === "California Tower").footprints[0];
      const tower = f.design.parts[0].ring;
      const entries = index.entries.filter((e) => e.building && e.building.name === "California Tower");
      // a point in the site's south part (the former wing), and one in the slab
      const pip = (x, z, r) => { let i = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const [xa, za] = r[a]; const [xb, zb] = r[b]; if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) i = !i; } return i; };
      const lot = [-120, -200];
      const slab = tower.reduce((m, p) => [m[0] + p[0] / tower.length, m[1] + p[1] / tower.length], [0, 0]);
      return {
        parts: f.design.parts.map((p) => p.role),
        lotInSite: pip(lot[0], lot[1], f.ring),
        lotIsBuilding: entries.some((e) => pip(lot[0], lot[1], e.ring)),
        slabIsBuilding: entries.some((e) => pip(slab[0], slab[1], e.ring)),
      };
    });
    assert.deepStrictEqual(seen.parts, ["tower"]);
    assert.ok(seen.lotInSite, "the test point is on the site");
    assert.strictEqual(seen.lotIsBuilding, false, "the lot is no building: nothing invisible stands there");
    assert.strictEqual(seen.slabIsBuilding, true);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await t.test("sonar measures to a building's nearest drawn part, and the California Tower's whole lot is fenced", async () => {
    const { page, errors } = await open({ site: false });
    await enter(page);
    const seen = await page.evaluate(async () => {
      const { player, sonar, construction } = window.__ucd3d;
      // in the plaza, 4.8 m from Shriners' 2-storey front wall
      player.leaveBuilding();
      player.teleport(-230.5, -127.9);
      sonar.fire();
      await new Promise((r) => setTimeout(r, 300));
      const status = document.getElementById("status").textContent;
      // the lot's west end along X Street, outside the old traced fence but inside OSM's site
      const fenced = construction.zoneAt(-160, -185) != null;
      player.teleport(-200, -185);
      for (let k = 0; k < 60; k++) player.nudgeTo(player.object.position.x + 0.5, -185);
      return { status, fenced, reached: player.object.position.x };
    });
    const m = /Shriners Hospital, (\d+) metres?/.exec(seen.status);
    assert.ok(m, `sonar names Shriners: ${seen.status}`);
    assert.ok(Number(m[1]) <= 6, `to its front wall, not the block behind it: ${seen.status}`);
    assert.ok(seen.fenced, "the lot's west end is inside the fence");
    assert.ok(seen.reached < -177, `the fence stops the walker at the site's west edge (x -178): ${seen.reached}`);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
});
