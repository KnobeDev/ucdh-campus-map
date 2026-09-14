// Tests for the construction caution wording and sizing (3d/caution-core.js, a pure ES module).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "caution-core.js")).href;

test("caution: an ISO end date reads as a day, month name and year, without shifting a day", async () => {
  const { formatUntilDate } = await import(CORE);
  // Parsed as a calendar date, not via new Date("2027-03-15") (UTC midnight,
  // which is 14 March in every timezone west of Greenwich).
  assert.strictEqual(formatUntilDate("2027-03-15"), "15 March 2027");
  assert.strictEqual(formatUntilDate("2026-01-01"), "1 January 2026");
  assert.strictEqual(formatUntilDate("2026-12-31"), "31 December 2026");
});

test("caution: missing or invalid dates format as null", async () => {
  const { formatUntilDate } = await import(CORE);
  for (const bad of [null, undefined, "", "soon", "2027-13-01", "2027-02-30", "2027-3-5", "20270315", 20270315]) {
    assert.strictEqual(formatUntilDate(bad), null, `${JSON.stringify(bad)} should not format`);
  }
});

test("caution: the phrase names the admin's end date, or says 'until further notice'", async () => {
  const { cautionText, zoneListText } = await import(CORE);
  assert.strictEqual(cautionText({ endDate: "2027-03-15" }), "Caution — construction site until 15 March 2027");
  assert.strictEqual(cautionText({ endDate: null }), "Caution — construction site until further notice");
  assert.strictEqual(cautionText({ endDate: "garbage" }), "Caution — construction site until further notice");
  assert.strictEqual(zoneListText({ name: "X St", endDate: "2026-09-30" }), "X St — Caution — construction site until 30 September 2026");
});

test("caution: label height scales with the zone's short side and stays within bounds", async () => {
  const { labelHeightFor, LABEL_H_MIN, LABEL_H_MAX } = await import(CORE);
  const square = (s) => [[0, 0], [s, 0], [s, s], [0, s]];
  assert.strictEqual(labelHeightFor(square(4)), LABEL_H_MIN); // a tiny closure: the sprite must not dwarf it
  assert.strictEqual(labelHeightFor(square(400)), LABEL_H_MAX);
  const mid = labelHeightFor(square(15));
  assert.ok(mid > LABEL_H_MIN && mid < LABEL_H_MAX, `15 m square gave ${mid}`);
  assert.strictEqual(labelHeightFor([[0, 0], [1, 0]]), LABEL_H_MIN); // degenerate ring: still a number
});

test("caution: a sign keeps its base size up close and holds a readable screen height far away", async () => {
  const { signHeightAt } = await import(CORE);
  const view = { fovDeg: 70, viewportPx: 800, targetPx: 28 };
  // Close: the base height; a sign must not balloon in your face.
  assert.strictEqual(signHeightAt(10, 2.4, 60, view), 2.4);
  // Far: tall enough to paint ~28 px on an 800 px viewport (h = px · 2d · tan(fov/2) / H).
  const far = signHeightAt(320, 2.4, 60, view);
  const px = (far * 800) / (2 * 320 * Math.tan((70 / 2) * (Math.PI / 180)));
  assert.ok(Math.abs(px - 28) < 0.5, `far sign paints ${px.toFixed(1)} px`);
  // Very far: capped, so three signs can't cover the whole campus from 900 m (uncapped it would be 44 m).
  assert.strictEqual(signHeightAt(900, 2.4, 40, view), 40);
  // Never below the base whatever the numbers.
  assert.strictEqual(signHeightAt(0, 2.4, 60, view), 2.4);
});

test("caution: the sign's cap keeps it no wider than the zone, with a floor for tiny sites", async () => {
  const { signHeightCap } = await import(CORE);
  const aspect = 12; // a wide plate: width = 12 × height
  assert.strictEqual(signHeightCap([[0, 0], [240, 0], [240, 20], [0, 20]], aspect), 240 * 1.5 / aspect);
  // A 6 m closure: the floor (30 m wide) wins over 1.5 × 6 m.
  assert.strictEqual(signHeightCap([[0, 0], [6, 0], [6, 6], [0, 6]], aspect), 30 / aspect);
});

test("caution: a small zone gets one label at its centre; a long one repeats along its length", async () => {
  const { labelAnchors } = await import(CORE);
  const small = labelAnchors([[0, 0], [10, 0], [10, 10], [0, 10]], 80);
  assert.deepStrictEqual(small, [[5, 5]]);
  const long = labelAnchors([[0, 0], [300, 0], [300, 20], [0, 20]], 80);
  assert.deepStrictEqual(long, [[150, 10], [70, 10], [230, 10]]);
  const tall = labelAnchors([[0, 0], [20, 0], [20, 300], [0, 300]], 80);
  assert.deepStrictEqual(tall, [[10, 150], [10, 70], [10, 230]]);
});

test("caution: repeated labels only land inside the polygon", async () => {
  const { labelAnchors } = await import(CORE);
  // An L: a 300 m bar along the top with a stub hanging down at the left. Its
  // bbox centre (150, 100) is in the notch, outside the polygon — the first
  // anchor must still be inside, near it, and nothing may land in the notch.
  const L = [[0, 0], [300, 0], [300, 20], [40, 20], [40, 200], [0, 200]];
  const anchors = labelAnchors(L, 80);
  assert.ok(anchors.length >= 1);
  const [fx, fz] = anchors[0];
  assert.ok(Math.hypot(fx - 150, fz - 100) < 120, `first anchor ${fx},${fz} strayed far from the centre`);
  for (const [x, z] of anchors) {
    const onBar = z >= 0 && z <= 20 && x >= 0 && x <= 300;
    const onStub = x >= 0 && x <= 40 && z >= 0 && z <= 200;
    assert.ok(onBar || onStub, `anchor ${x},${z} is outside the L`);
  }
});
