// Tests for the pedestrian router (3d/route-core.js, a pure ES module).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");
const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "route-core.js")).href;

const load = async () => ({ core: await import(CORE), data: JSON.parse(fs.readFileSync(DATA, "utf8")) });
const building = (data, code) => data.buildings.find((b) => b.code === code);

test("route: the graph joins OSM ways at shared junction nodes", async () => {
  const { core, data } = await load();
  const g = core.buildRouteGraph(data.paths, { construction: [], today: "2026-09-09" });
  assert.ok(g.nodes.length > 2500, `only ${g.nodes.length} nodes`);
  // Junctions exist: some nodes have three or more edges.
  const junctions = g.adj.filter((a) => a.length >= 3).length;
  assert.ok(junctions > 100, `only ${junctions} junction nodes — ways aren't joining`);
});

test("route: P3 to Cancer Center South is walkable and plausibly long", async () => {
  const { core, data } = await load();
  const g = core.buildRouteGraph(data.paths, { construction: data.construction, today: "2026-09-09" });
  const from = building(data, "P3").center;
  const to = building(data, "L").center;
  const r = core.route(g, from, to);
  assert.ok(r.ok, r.reason);
  const crow = Math.hypot(to.x - from.x, to.z - from.z);
  assert.ok(r.length >= crow, "a walking route can't be shorter than the crow flies");
  assert.ok(r.length < crow * 2.5, `route is ${r.length.toFixed(0)} m for ${crow.toFixed(0)} m as the crow flies`);
  assert.ok(r.pts.length > 5);
  assert.ok(core.describeLegs(r.legs).length >= 1);
});

test("route: step-free mode never uses steps", async () => {
  const { core, data } = await load();
  const g = core.buildRouteGraph(data.paths, { construction: [], today: "2026-09-09" });
  const stepSeg = g.segs.find((s) => s.kind === "steps");
  if (!stepSeg) return; // nothing to test against in this extract
  const a = g.nodes[stepSeg.a];
  const b = g.nodes[stepSeg.b];
  const r = core.route(g, { x: a[0], z: a[1] }, { x: b[0], z: b[1] }, { stepFree: true });
  if (r.ok) assert.ok(r.legs.every((l) => l.kind !== "steps"), "step-free route walked up steps");
});

test("route: an active construction zone cuts the edges under it; an expired one does not", async () => {
  const { core, data } = await load();
  const seg = data.paths.find((p) => p.kind === "foot" && p.pts.length >= 2);
  const [[ax, az], [bx, bz]] = seg.pts;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const ring = [[mx - 5, mz - 5], [mx + 5, mz - 5], [mx + 5, mz + 5], [mx - 5, mz + 5]];
  const active = core.buildRouteGraph(data.paths, { construction: [{ ring, endDate: "2026-12-31" }], today: "2026-09-09" });
  const expired = core.buildRouteGraph(data.paths, { construction: [{ ring, endDate: "2026-01-01" }], today: "2026-09-09" });
  assert.ok(active.zonesCut >= 1, "the active zone cut nothing");
  assert.strictEqual(expired.zonesCut, 0);
  assert.strictEqual(active.activeZones, 1);
  assert.strictEqual(expired.activeZones, 0);
});

test("route: the 2D expiry rule — a zone is active until its endDate has passed", async () => {
  const { core } = await load();
  assert.ok(core.isZoneActive({ endDate: "2026-09-09" }, "2026-09-09"));
  assert.ok(!core.isZoneActive({ endDate: "2026-09-08" }, "2026-09-09"));
  assert.ok(core.isZoneActive({ endDate: null }, "2026-09-09"));
});
