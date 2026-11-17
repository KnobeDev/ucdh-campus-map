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
});
