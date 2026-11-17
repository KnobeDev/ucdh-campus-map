// The 2D page's accessibility, in a real browser (WCAG 2.1 Level A and AA are pass/fail here).
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
//   AXE_MODULE=/path/to/node_modules/axe-core \
//   node --test tools/test/a11y.browser.test.js
//
// Skipped without PLAYWRIGHT_MODULE; the axe scans are skipped without AXE_MODULE. Run on the
// site build, which is the one visitors get. An axe scan finds a minority of failures, so the
// tests before it drive the page by keyboard and check what a screen reader is given. None of
// this replaces a person with a screen reader, voice control and browser zoom.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { serve } = require("./browser-harness.js");

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE;
const AXE = process.env.AXE_MODULE;
const WCAG21 = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("the 2D page's accessibility", { skip: !PLAYWRIGHT && "set PLAYWRIGHT_MODULE to run the browser checks" }, async (t) => {
  const { chromium } = require(PLAYWRIGHT);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { server, base } = await serve({ site: true });
  t.after(() => server.close());

  async function open(viewport = { width: 1280, height: 800 }, options = {}) {
    const page = await browser.newPage({ viewport, ...options });
    await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app");
    return page;
  }
  /** What has focus: its role-ish tag, accessible-ish name, and whether a focus indicator is drawn. */
  const focused = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body" };
    const cs = getComputedStyle(el);
    const ringed = (e) => { const c = getComputedStyle(e); return (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) >= 2) || c.boxShadow !== "none"; };
    const labelled = el.getAttribute("aria-labelledby");
    const name = el.getAttribute("aria-label")
      || (labelled && labelled.split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" "))
      || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || "";
    return {
      tag: el.tagName.toLowerCase(), role: el.getAttribute("role"), name: name.replace(/\s+/g, " ").trim(),
      cls: String(el.className), id: el.id,
      // the indicator may be on the control or on the box around it (the search field)
      ring: ringed(el) || (el.parentElement && ringed(el.parentElement)) || (el.nextElementSibling && ringed(el.nextElementSibling)),
      visible: el.getClientRects().length > 0 && cs.visibility !== "hidden",
    };
  });
  const status = (page) => page.locator(".sidebar [role=status]").textContent();
  /** Focus is moved a frame after the panel changes; wait for it to arrive on `selector`. */
  const focusOn = (page, selector) => page.waitForFunction((sel) => document.activeElement && document.activeElement.matches(sel), selector, { timeout: 5000 })
    .catch(() => { /* the assertion after this says what had focus instead */ });
  const viewBox = (page) => page.locator(".map-wrap svg").first().getAttribute("viewBox").then((v) => v.split(" ").map(Number));

  await t.test("structure: one main, one h1, a heading on every section, a named map region", async () => {
    const page = await open();
    assert.strictEqual(await page.locator("main").count(), 1);
    assert.strictEqual(await page.locator("h1").count(), 1);
    assert.strictEqual((await page.locator("h1").textContent()).replace(/\s+/g, " ").trim(), "UC Davis Health Sacramento Campus Map");
    const h2 = await page.locator("main h2").allTextContents();
    for (const want of ["Filter map", "Layers", "Buildings A–Z", "Parking", "Shuttle stops"]) {
      assert.ok(h2.some((t2) => t2.includes(want)), `an h2 for ${want}: ${h2}`);
    }
    assert.strictEqual(await page.getByRole("region", { name: "Map" }).count(), 1);
    assert.strictEqual(await page.getByRole("banner").count(), 1, "the build bar is the one banner");
    await page.close();
  });

  await t.test("keyboard: nothing takes focus at load, and Tab goes through the page from the top", async () => {
    const page = await open();
    assert.strictEqual((await focused(page)).tag, "body", "no autofocus: the page is read from its top");
    const stops = [];
    for (let i = 0; i < 9; i++) { await page.keyboard.press("Tab"); stops.push(await focused(page)); }
    const names = stops.map((s) => s.name);
    assert.match(names[0], /3D view/, `first stop: ${names[0]}`);
    assert.ok(stops[1].role === "tab" && /Find a place/.test(names[1]), `second stop is the selected tab: ${names[1]}`);
    assert.ok(stops[2].tag === "input" && /Search buildings, clinics, services/.test(names[2]), `then the search, by its label: ${names[2]}`);
    for (const s of stops) {
      assert.ok(s.visible, `${s.name} is on screen when focused`);
      assert.ok(s.ring, `${s.tag} "${s.name}" shows a focus indicator`);
    }
    await page.close();
  });

  await t.test("tabs: a real tablist, arrow keys switch, the panel is named by its tab", async () => {
    const page = await open();
    const tablist = page.getByRole("tablist");
    assert.strictEqual(await tablist.count(), 1);
    const find = page.getByRole("tab", { name: "Find a place" });
    const directions = page.getByRole("tab", { name: "Directions" });
    assert.strictEqual(await find.getAttribute("aria-selected"), "true");
    assert.strictEqual(await directions.getAttribute("tabindex"), "-1", "one tab stop for the set");
    await find.focus();
    await page.keyboard.press("ArrowRight");
    assert.strictEqual(await directions.getAttribute("aria-selected"), "true");
    assert.match((await focused(page)).name, /Directions/, "focus moved with the arrow key");
    const panel = page.getByRole("tabpanel");
    assert.strictEqual(await panel.count(), 1);
    assert.strictEqual(await panel.getAttribute("aria-labelledby"), await directions.getAttribute("id"));
    assert.strictEqual(await directions.getAttribute("aria-controls"), await panel.getAttribute("id"));
    await page.keyboard.press("ArrowLeft");
    assert.strictEqual(await find.getAttribute("aria-selected"), "true");
    await page.keyboard.press("End");
    assert.strictEqual(await directions.getAttribute("aria-selected"), "true");
    await page.keyboard.press("Home");
    assert.strictEqual(await find.getAttribute("aria-selected"), "true");
    await page.close();
  });

  await t.test("search: labelled, results announced, no-match said, and picking a place moves focus to its card", async () => {
    const page = await open();
    const search = page.getByRole("textbox", { name: "Search buildings, clinics, services" });
    assert.strictEqual(await page.locator(".sidebar [role=status]").count(), 1, "the status region is there before anything is said");
    assert.strictEqual(await status(page), "");
    await search.fill("cancer");
    await assert.doesNotReject(page.waitForFunction(() => /\d+ results?/.test(document.querySelector(".sidebar [role=status]").textContent)));
    const n = await page.locator(".sb-result").count();
    assert.match(await status(page), new RegExp(`^${n} results?`));
    assert.strictEqual(await page.getByRole("button", { name: "Clear search" }).count(), 1);

    await search.fill("zzzzqq");
    await page.waitForFunction(() => /No places match/.test(document.querySelector(".sidebar [role=status]").textContent));
    assert.match(await page.locator(".sb-no-results").textContent(), /No places match/);

    await page.getByRole("button", { name: "Clear search" }).click();
    assert.strictEqual(await search.inputValue(), "");
    assert.strictEqual((await focused(page)).tag, "input", "clearing leaves focus in the search");

    await search.fill("Medical Center");
    await page.locator(".sb-result").filter({ has: page.locator(".sb-result-name", { hasText: /^Medical Center$/ }) }).first().focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".sb-detail");
    await focusOn(page, "h2.sb-detail-name");
    const at = await focused(page);
    assert.ok(at.tag === "h2" && at.name === "Medical Center", `focus is on the card's heading: ${JSON.stringify(at)}`);
    // the Find a place tab still owns this panel
    assert.strictEqual(await page.getByRole("tab", { name: "Find a place" }).getAttribute("aria-selected"), "true");

    await page.getByRole("button", { name: "Back" }).focus();
    await page.keyboard.press("Enter");
    await focusOn(page, "#sb-search-input");
    assert.strictEqual((await focused(page)).tag, "input", "Back returns to the search, where this card was opened from");

    // Opened from the A–Z list instead, Back returns to that row.
    const row = page.locator(".sb-list-item[data-code=A]");
    await row.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".sb-detail");
    await focusOn(page, "h2.sb-detail-name");
    await page.getByRole("button", { name: "Back" }).focus();
    await page.keyboard.press("Enter");
    await focusOn(page, ".sb-list-item[data-code=A]");
    const back = await focused(page);
    assert.ok(/sb-list-item/.test(back.cls) && back.ring, `Back returns to the row it was opened from: ${JSON.stringify(back)}`);
    await page.close();
  });

  await t.test("a mouse click on the map opens the place without dragging focus into the sidebar", async () => {
    const page = await open();
    const shape = page.locator(".map-wrap svg g[style*='cursor: pointer']").first();
    await shape.click({ force: true });
    await page.waitForSelector(".sb-detail");
    await page.waitForTimeout(150);
    const at = await focused(page);
    assert.notStrictEqual(at.tag, "h2", "focus was not moved to the card's heading");
    assert.ok(at.tag === "body" || at.id === "campus-map", `focus stays with the map: ${JSON.stringify(at)}`);
    await page.close();
  });

  await t.test("what was only on the picture is also in words: closures and entrances", async () => {
    const page = await open();
    const zones = await page.evaluate(() => window.CONSTRUCTION_ZONES.map((z) => z.name));
    const doors = await page.evaluate(() => window.ENTRANCES.map((e) => e.label));
    assert.ok(zones.length >= 1 && doors.length >= 1, "the data has both today");
    await page.locator(".sb-section-toggle", { hasText: "Construction" }).click();
    await page.locator(".sb-section-toggle", { hasText: "Building entrances" }).click();
    const lists = await page.locator(".sb-notice-list").allTextContents();
    for (const name of zones) assert.ok(lists[0].includes(name), `the Construction list names ${name}`);
    assert.match(lists[0], /Directions go around this area/);
    for (const label of doors) assert.ok(lists[1].includes(label), `the entrances list names ${label}`);
    assert.match(lists[1], /Step-free/);
    assert.match(await page.locator(".map-wrap svg").first().getAttribute("aria-label"), /Buildings A–Z and Parking lists.*construction and entrances are listed there too/);
    await page.close();
  });

  await t.test("layers: every switch is reached and worked by keyboard, and says its state", async () => {
    const page = await open();
    const shuttle = page.getByRole("checkbox", { name: "Shuttle stops" });
    assert.strictEqual(await shuttle.isChecked(), false);
    const before = await page.locator(".map-wrap svg circle[fill='#FFBF00']").count();
    await shuttle.focus();
    const f = await focused(page);
    assert.ok(f.tag === "input" && f.ring, `the switch takes focus and shows it: ${JSON.stringify(f)}`);
    await page.keyboard.press("Space");
    assert.strictEqual(await shuttle.isChecked(), true);
    assert.ok(await page.locator(".map-wrap svg circle[fill='#FFBF00']").count() > before, "the stops appear on the map");
    // every switch in the Layers group is a focusable checkbox
    const all = page.locator(".sb-toggles input[type=checkbox]");
    assert.ok(await all.count() >= 10);
    for (let i = 0; i < await all.count(); i++) {
      await all.nth(i).focus();
      assert.strictEqual(await all.nth(i).evaluate((el) => el === document.activeElement), true, `switch ${i} takes focus`);
    }
    const reduce = page.getByRole("checkbox", { name: "Reduce animation" });
    await reduce.focus();
    await page.keyboard.press("Space");
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute("data-reduce-motion")), "1");
    await page.close();
  });

  await t.test("filters: each chip is a toggle button that says whether it is on", async () => {
    const page = await open();
    const chip = page.getByRole("button", { name: "Hospital", exact: true });
    assert.strictEqual(await chip.getAttribute("aria-pressed"), "false");
    await chip.focus();
    await page.keyboard.press("Enter");
    assert.strictEqual(await chip.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Space");
    assert.strictEqual(await chip.getAttribute("aria-pressed"), "false");
    await page.close();
  });

  await t.test("directions: named pickers, Escape, focus kept, the result announced", async () => {
    const page = await open();
    await page.getByRole("tab", { name: "Directions" }).click();
    const from = page.getByRole("button", { name: /^From\b/ });
    const to = page.getByRole("button", { name: /^To\b/ });
    assert.strictEqual(await from.count(), 1);
    assert.strictEqual(await to.count(), 1);
    assert.strictEqual(await from.getAttribute("aria-expanded"), "false");

    await from.focus();
    await page.keyboard.press("Enter");
    assert.strictEqual(await from.getAttribute("aria-expanded"), "true");
    assert.match((await focused(page)).name, /^Type to filter the From list/);
    assert.strictEqual(await page.locator(".sb-route-dropdown input").getAttribute("placeholder"), "Type to filter…", "its name starts with the words on screen");
    await page.keyboard.press("Escape");
    assert.strictEqual(await from.getAttribute("aria-expanded"), "false");
    await focusOn(page, "#sb-route-from-label ~ .sb-route-input");
    assert.match((await focused(page)).name, /^From\b/, "Escape closes it and gives focus back");

    await page.keyboard.press("Enter");
    await page.keyboard.type("Parking");
    await page.locator(".sb-route-option").first().focus();
    const chosen = (await page.locator(".sb-route-option").first().textContent()).trim();
    assert.ok(chosen.length > 3, "there is an option to choose");
    assert.doesNotMatch(chosen, /[\u{1F17F}\u{26DF}\u{1F68C}\u{2605}]/u, "options are words, not emoji");
    await page.keyboard.press("Enter");
    await focusOn(page, "#sb-route-from-label ~ .sb-route-input");
    const after = await focused(page);
    assert.ok(/^From\b/.test(after.name) && after.name.includes(chosen), `focus is back on the picker, which now reads its value: ${after.name}`);

    // With only one place chosen the button is not dead: it stays reachable and says what is missing.
    const go = page.getByRole("button", { name: "Get directions" });
    assert.strictEqual(await go.getAttribute("aria-disabled"), "true");
    assert.strictEqual(await go.evaluate((el) => el.disabled), false, "aria-disabled, not disabled: it can still take focus");
    await go.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /Choose a start and a destination first/.test(document.querySelector(".sidebar [role=status]").textContent));
    assert.match(await page.locator("#sb-route-hint").textContent(), /Choose a start and a destination first/);
    assert.strictEqual(await go.getAttribute("aria-describedby"), "sb-route-hint");
    assert.strictEqual(await page.locator(".sb-steps").count(), 0);

    // The list closes when focus leaves it without a choice.
    await to.click();
    assert.strictEqual(await to.getAttribute("aria-expanded"), "true");
    await go.focus();
    assert.strictEqual(await to.getAttribute("aria-expanded"), "false", "moving on closes the open list");

    await to.click();
    await page.keyboard.type("Medical Center");
    await page.locator(".sb-route-option").first().click();
    assert.strictEqual(await go.getAttribute("aria-disabled"), null);
    // Count how many times the status region is filled with a route: pressing twice must say it twice.
    await page.evaluate(() => {
      window.__said = [];
      new MutationObserver(() => { const t = document.querySelector(".sidebar [role=status]").textContent; if (t) window.__said.push(t); })
        .observe(document.querySelector(".sidebar [role=status]"), { childList: true, characterData: true, subtree: true });
    });
    await go.click();
    await page.waitForSelector(".sb-steps");
    await page.waitForFunction(() => window.__said.length === 1);
    assert.match(await status(page), /Route found: about \d+ min(ute)?s?, [\d,]+ feet, \d+ steps/);
    await go.click();
    await page.waitForFunction(() => window.__said.length === 2);
    assert.strictEqual(await page.evaluate(() => window.__said[0] === window.__said[1]), true, "the same words, announced again");
    assert.ok(await page.locator("ol.sb-steps li").count() >= 2);
    assert.strictEqual(await page.locator(".sb-step-icon[aria-hidden=true]").count(), await page.locator(".sb-step-icon").count());

    // no way through: said in words, on screen and to a screen reader
    await page.evaluate(() => { window.__realRoute = window.buildRoute; window.buildRoute = () => null; });
    await page.getByRole("button", { name: "Get directions" }).click();
    await page.waitForSelector(".sb-route-problem");
    assert.match(await page.locator(".sb-route-problem").textContent(), /No walking route was found/);
    await page.waitForFunction(() => /No walking route was found/.test(document.querySelector(".sidebar [role=status]").textContent));
    // That message is about this pair of places: choosing another start takes it away.
    await from.click();
    await page.locator(".sb-route-option").nth(1).click();
    await page.waitForFunction(() => !document.querySelector(".sb-route-problem"));
    // Clear takes its own button away: focus goes to the panel's heading, not to the page.
    await page.evaluate(() => { window.buildRoute = window.__realRoute; });
    await page.getByRole("button", { name: "Clear" }).focus();
    await page.keyboard.press("Enter");
    await focusOn(page, "h2.sb-section");
    const cleared = await focused(page);
    assert.ok(cleared.tag === "h2" && cleared.name === "Plan a walk", `after Clear: ${JSON.stringify(cleared)}`);
    await page.close();
  });

  await t.test("map: named as an image that points to the list, and moved and zoomed without a mouse", async () => {
    const page = await open();
    const svg = page.locator(".map-wrap svg").first();
    assert.strictEqual(await svg.getAttribute("role"), "img");
    assert.match(await svg.getAttribute("aria-label"), /Map of the UC Davis Health Sacramento campus.*Buildings A–Z and Parking lists/);

    const start = await viewBox(page);
    await page.getByRole("button", { name: "Move map right" }).focus();
    await page.keyboard.press("Enter");
    let vb = await viewBox(page);
    assert.ok(vb[0] > start[0] && vb[1] === start[1], `right: ${start} -> ${vb}`);
    await page.getByRole("button", { name: "Move map down" }).click();
    vb = await viewBox(page);
    assert.ok(vb[1] > start[1]);
    await page.getByRole("button", { name: "Move map left" }).click();
    await page.getByRole("button", { name: "Move map up" }).click();
    vb = await viewBox(page);
    assert.ok(Math.abs(vb[0] - start[0]) < 0.01 && Math.abs(vb[1] - start[1]) < 0.01, "left and up undo right and down");
    await page.getByRole("button", { name: "Zoom in" }).click();
    assert.ok((await viewBox(page))[2] < start[2]);
    await page.getByRole("button", { name: "Reset view" }).click();
    assert.deepStrictEqual(await viewBox(page), start);
    for (const name of ["Zoom in", "Zoom out", "Reset view", "Move map up", "Move map down", "Move map left", "Move map right"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      assert.ok(box.width >= 24 && box.height >= 24, `${name} is at least 24 by 24 (${box.width}x${box.height})`);
    }
    await page.close();
  });

  await t.test("map: a finger drags it (pointer events, not mouse events)", async () => {
    const page = await open({ width: 390, height: 780 }, { hasTouch: true });
    const start = await viewBox(page);
    const box = await page.locator(".map-wrap svg").first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.evaluate(([px, py]) => {
      const svg = document.querySelector(".map-wrap svg");
      const fire = (type, cx, cy) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: cx, clientY: cy }));
      fire("pointerdown", px, py); fire("pointermove", px - 30, py - 20); fire("pointermove", px - 60, py - 40); fire("pointerup", px - 60, py - 40);
    }, [x, y]);
    const vb = await viewBox(page);
    assert.ok(vb[0] > start[0] && vb[1] > start[1], `dragging up-left moves the view down-right: ${start} -> ${vb}`);
    // one finger is the map's; two fingers still zoom the page
    assert.strictEqual(await page.locator(".map-wrap svg").first().evaluate((el) => getComputedStyle(el).touchAction), "pinch-zoom");

    // A drag that ends on a building does not open it; a tap does.
    const tapOrDrag = (drag) => page.evaluate((dragging) => {
      const svg = document.querySelector(".map-wrap svg");
      const shape = [...svg.querySelectorAll("g[style*='cursor: pointer']")].find((g) => { const r = g.getBoundingClientRect(); return r.width > 12 && r.top > 80; });
      const r = shape.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const fire = (type, x, y) => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, clientX: x, clientY: y }));
      fire("pointerdown", dragging ? cx + 40 : cx, cy);
      if (dragging) { fire("pointermove", cx + 20, cy); fire("pointermove", cx, cy); }
      fire("pointerup", cx, cy);
      shape.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: cx, clientY: cy }));
    }, drag);
    await tapOrDrag(true);
    await page.waitForTimeout(150);
    assert.strictEqual(await page.locator(".sb-detail").count(), 0, "a pan that ends on a building opens nothing");
    await tapOrDrag(false);
    await page.waitForSelector(".sb-detail");
    await page.close();
  });

  await t.test("colour: every badge and card head holds 4.5:1, and no state is told by colour alone", async () => {
    const page = await open();
    const measure = () => page.evaluate(() => {
      const lum = (rgb) => { const c = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return "rgb(255,255,255)"; };
      return [...document.querySelectorAll(".sb-list-badge, .sb-result-badge, .sb-detail-code, .sb-detail-name, .sb-detail-cat, .sb-section, .sb-route-label, .sb-route-placeholder")]
        .filter((el) => el.getClientRects().length && el.textContent.trim() && el.getAttribute("aria-hidden") !== "true")
        .map((el) => { const cs = getComputedStyle(el); return { cls: el.className, text: el.textContent.trim().slice(0, 18), ratio: ratio(cs.color, bgOf(el)), opacity: cs.opacity }; });
    });
    const check = (rows, where) => {
      assert.ok(rows.length > 0, where);
      for (const r of rows) {
        assert.ok(r.ratio >= 4.5, `${where}: ${r.cls} "${r.text}" is ${r.ratio.toFixed(2)}:1`);
        assert.strictEqual(r.opacity, "1", `${where}: ${r.cls} is not faded`);
      }
    };
    check(await measure(), "browse");
    // a card of each category colour
    const codes = await page.evaluate(() => { const seen = new Set(); return window.BUILDINGS.filter((b) => { const k = b.cat === "parking" ? "parking:" + window.parkingTypeOf(b) : b.cat; if (seen.has(k)) return false; seen.add(k); return true; }).map((b) => b.code); });
    assert.ok(codes.length >= 8);
    for (const code of codes) {
      await page.locator(".sb-list-item").filter({ has: page.locator(".sb-list-badge", { hasText: new RegExp(`^${code}$`) }) }).first().evaluate((el) => el.click());
      await page.waitForSelector(".sb-detail");
      check(await measure(), `card ${code}`);
      await page.getByRole("button", { name: "Back" }).click();
      // the lists that were open stay open, so the next code can be clicked; open Parking for its lots
      const parking = page.locator(".sb-section-toggle", { hasText: "Parking" });
      if (await parking.getAttribute("aria-expanded") === "false") await parking.click();
    }
    // a pressed filter chip is marked by more than its colour, and keeps its name
    const chip = page.getByRole("button", { name: "Hospital", exact: true });
    assert.strictEqual(await chip.locator(".sb-filter-tick").count(), 0);
    await chip.click();
    assert.strictEqual(await page.getByRole("button", { name: "Hospital", exact: true }).getAttribute("aria-pressed"), "true", "still named Hospital when on");
    assert.strictEqual(await chip.locator(".sb-filter-tick[aria-hidden=true]").count(), 1, "a pressed chip carries a tick");
    await page.close();
  });

  await t.test("reflow: at 320 by 256 the page is one column that scrolls down, never sideways", async () => {
    const page = await open({ width: 320, height: 256 });
    const m = await page.evaluate(() => {
      const body = document.querySelector(".sb-body");
      return {
        sideways: document.documentElement.scrollWidth > window.innerWidth,
        pageScrolls: document.documentElement.scrollHeight > window.innerHeight * 2,
        listClipped: body.scrollHeight > body.clientHeight + 2,
        mapHeight: document.querySelector(".map-wrap").offsetHeight,
        mapFirstInPage: !!(document.querySelector(".map-wrap").compareDocumentPosition(document.querySelector(".sidebar")) & Node.DOCUMENT_POSITION_FOLLOWING),
        mapAbove: document.querySelector(".map-wrap").getBoundingClientRect().top < document.querySelector(".sidebar").getBoundingClientRect().top,
        touch: getComputedStyle(document.querySelector(".map-wrap svg")).touchAction,
      };
    });
    assert.strictEqual(m.sideways, false);
    assert.strictEqual(m.pageScrolls, true, "the page itself scrolls");
    assert.strictEqual(m.listClipped, false, "the list is not shut in a strip a few lines tall");
    assert.ok(m.mapHeight >= 160, `the map keeps a usable height (${m.mapHeight})`);
    assert.ok(m.mapAbove && m.mapFirstInPage, "the map is above the places, and before them in the page");
    assert.strictEqual(m.touch, "pan-y pinch-zoom", "a finger on the map can still scroll the page here");
    // At phone size the two panes fit the window, the map on top, and the page's order says so too.
    const phone = await open({ width: 320, height: 640 });
    const ph = await phone.evaluate(() => ({
      sideways: document.documentElement.scrollWidth > window.innerWidth,
      mapFirstInPage: !!(document.querySelector(".map-wrap").compareDocumentPosition(document.querySelector(".sidebar")) & Node.DOCUMENT_POSITION_FOLLOWING),
      mapAbove: document.querySelector(".map-wrap").getBoundingClientRect().top < document.querySelector(".sidebar").getBoundingClientRect().top,
    }));
    assert.deepStrictEqual(ph, { sideways: false, mapFirstInPage: true, mapAbove: true });
    await phone.keyboard.press("Tab");
    assert.match((await focused(phone)).name, /Zoom in/, "the first stop is on the map, which is first on screen");
    await phone.close();
    // On a wide window the places are on the left and first in the page.
    const wide = await open();
    assert.strictEqual(await wide.evaluate(() => !!(document.querySelector(".sidebar").compareDocumentPosition(document.querySelector(".map-wrap")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    // Crossing the width keeps what the visitor had: a typed search survives the reorder.
    await wide.getByRole("textbox", { name: "Search buildings, clinics, services" }).fill("cancer");
    await wide.setViewportSize({ width: 600, height: 800 });
    await wide.waitForFunction(() => !!(document.querySelector(".map-wrap").compareDocumentPosition(document.querySelector(".sidebar")) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.strictEqual(await wide.getByRole("textbox", { name: "Search buildings, clinics, services" }).inputValue(), "cancer");
    await wide.close();
    await page.close();
  });

  await t.test("axe: no WCAG 2.1 A or AA violation in any state, at desktop and phone width", { skip: !AXE && "set AXE_MODULE to run the axe scans" }, async () => {
    const scan = async (page, where) => {
      await page.addScriptTag({ path: path.join(AXE, "axe.min.js") });
      const found = await page.evaluate((tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
        .then((r) => r.violations.map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)), WCAG21);
      assert.deepStrictEqual(found, [], where);
    };
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 640 }]) {
      const page = await open(viewport);
      const at = `${viewport.width}px`;
      await scan(page, `browse, ${at}`);
      await page.getByRole("textbox", { name: "Search buildings, clinics, services" }).fill("cancer");
      await scan(page, `search results, ${at}`);
      await page.locator(".sb-result").first().click();
      await page.waitForSelector(".sb-detail");
      await scan(page, `a place's card, ${at}`);
      await page.getByRole("button", { name: /Directions to here/ }).click();
      await page.getByRole("button", { name: /^From\b/ }).click();
      await scan(page, `directions with a picker open, ${at}`);
      await page.locator(".sb-route-option").first().click();
      await page.getByRole("button", { name: "Get directions" }).click();
      await page.waitForSelector(".sb-steps");
      await scan(page, `directions with a route, ${at}`);
      await page.close();
    }
  });
});
