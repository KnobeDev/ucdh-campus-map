// Tests for the wayfinder's decisions (3d/wayfind-core.js, pure).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "wayfind-core.js")).href;
const room = { kind: "room", floor: "8", name: "Oncology" };
const bldg = { kind: "building", name: "Cancer Center South", radius: 6 };
const doorGoal = { kind: "building", name: "Main Entrance", radius: 6 };

test("wayfind: legs follow where the walker is relative to the goal", async () => {
  const { legFor } = await import(CORE);
  assert.strictEqual(legFor(room, null), "outdoor");
  assert.strictEqual(legFor(room, "1"), "to-elevator");
  assert.strictEqual(legFor(room, "8"), "on-floor");
  assert.strictEqual(legFor(bldg, null), "outdoor");
  assert.strictEqual(legFor(bldg, "1"), "to-door");
  assert.strictEqual(legFor(bldg, "5"), "to-elevator");
});

test("wayfind: arrival — rooms on their floor, buildings outdoors, entrances by walking through them", async () => {
  const { arrived } = await import(CORE);
  assert.ok(arrived(room, "8", 2));
  assert.ok(!arrived(room, "8", 10));
  assert.ok(!arrived(room, "1", 2), "same distance on the wrong floor is not arrival");
  assert.ok(arrived(bldg, null, 5));
  assert.ok(!arrived(bldg, null, 40));
  // The bug this guards: reaching an entrance flips the walker to Level 1 a
  // step past the door; that used to route them straight back out.
  assert.ok(arrived(doorGoal, "1", 4));
  assert.ok(!arrived(doorGoal, "5", 4), "being upstairs is not arriving at the entrance");
});

test("wayfind: big footprints count as reached from further out", async () => {
  const { arrived } = await import(CORE);
  assert.ok(arrived({ kind: "building", radius: 60 }, null, 50));
  assert.ok(!arrived({ kind: "building", radius: 6 }, null, 50));
});

test("wayfind: milestones are spoken every 30 m, not every tick", async () => {
  const { milestoneDue, MILESTONE } = await import(CORE);
  assert.ok(!milestoneDue(100, 95));
  assert.ok(milestoneDue(100, 100 - MILESTONE));
  assert.ok(!milestoneDue(Infinity, 400) === false, "a fresh route is always due");
});

test("wayfind: a leg change must be seen twice before it counts (doorstep dithering)", async () => {
  const { settleLeg } = await import(CORE);
  let r = settleLeg({}, "outdoor");
  assert.strictEqual(r.leg, "outdoor");
  assert.ok(r.changed, "a fresh route settles immediately");
  r = settleLeg(r.tracker, "to-door");
  assert.strictEqual(r.leg, "outdoor");
  assert.ok(!r.changed, "one sighting is not a change");
  r = settleLeg(r.tracker, "outdoor");
  assert.ok(!r.changed, "back on the doorstep: still outdoor, nothing announced");
  r = settleLeg(r.tracker, "to-door");
  r = settleLeg(r.tracker, "to-door");
  assert.strictEqual(r.leg, "to-door");
  assert.ok(r.changed, "two consecutive sightings settle the new leg");
});

test("wayfind: walking minutes never round to zero", async () => {
  const { walkMinutes } = await import(CORE);
  assert.strictEqual(walkMinutes(10), 1);
  assert.strictEqual(walkMinutes(439), 5);
});
