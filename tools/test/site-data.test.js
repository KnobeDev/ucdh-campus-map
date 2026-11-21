// The site build's 2D map: every position from the site's copy of the campus data
// (3d/campus-data.site.json: OpenStreetMap geometry joined to the curated building list, with
// nothing that depends on the official printed map), and none from the picture itself.
//
//   site-data.js      turns that file into the 2D app's own "edits" document, in the app's
//                     919x792 drawing area, by the plain frame the file carries (meta.frame2d)
//   drawn-basemap.js  draws the campus under it from the same file
//
// What must never reach the site map: an outline traced over the official map. The site's
// data file has none; these also hand site-data.js the FULL file's buildings (HYBRID), to
// show that even then a traced outline becomes a marker and is never drawn.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const SiteData = require(path.join(ROOT, "site-data.js"));
const DrawnBasemap = require(path.join(ROOT, "drawn-basemap.js"));
const { siteCampusData, FRAME_PAD } = require(path.join(ROOT, "tools", "lib", "site-campus-data.js"));

const FULL = JSON.parse(fs.readFileSync(path.join(ROOT, "3d", "campus-data.json"), "utf8"));
const DATA = siteCampusData(FULL);
/**
 * A hotspot the 2D editor left unnamed, with an outline traced over the printed map. The full
 * file no longer carries one (gen-3d-data.js drops X1, the California Tower site's), so the
 * hybrid below is handed one, to show site-data.js still leaves it off.
 */
const PLACEHOLDER = {
  code: "X1", name: "New hotspot", label: "X1", cat: "external", type: null, entryNode: null, departments: [],
  match: { status: "contested", reason: "best footprint went to U", osmName: null },
  center: { x: -69.8, z: -249.5 }, pxCenter: { x: 402.5, y: 227 },
  footprints: [{ osmId: null, osmName: null, geomSource: "traced", ring: [[-74.53, -342.06], [-8.84, -327.62], [-50.01, -177.49], [-145.03, -174.14]], floors: 0, height: 0, heightSource: "curated" }],
};
/** The site's frame with the full file's buildings: traced outlines and the placeholder included. */
const HYBRID = { ...DATA, buildings: [...FULL.buildings, PLACEHOLDER] };

/** data.jsx is pure data assigned onto `window`: the app's base records. */
function baseRecords() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data.jsx"), "utf8"), ctx, { filename: "data.jsx" });
  const w = ctx.window;
  return { buildings: w.BUILDINGS, nodes: w.GRAPH_NODES, edges: w.GRAPH_EDGES, shuttle: w.SHUTTLE_STOPS, frame: w.MAP_IMG };
}
const BASE = baseRecords();
const P = SiteData.projector(DATA.meta.frame2d);
const BUILT = SiteData.siteEdits(DATA, BASE);
const BUILT_HYBRID = SiteData.siteEdits(HYBRID, BASE);
const key = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);
const hasOsm = (b) => b.footprints.some((f) => f.geomSource === "osm");
/** The buildings the site map lists: all of the data file's (it holds no unnamed hotspot). */
const LISTED = DATA.buildings.filter((b) => !SiteData.isPlaceholder(b));
const round1 = (n) => Math.round(n * 10) / 10;

/** What edit-store.jsx's applyEdits makes of an edits document (buildings, nodes, edges, stops). */
function applied(edits) {
  const buildings = [
    ...BASE.buildings.map((b) => (edits.buildings[b.code] ? { ...b, ...edits.buildings[b.code] } : b)).filter((b) => !b._deleted),
    ...Object.values(edits.addedBuildings),
  ];
  const nodes = {};
  for (const [id, n] of Object.entries(BASE.nodes)) nodes[id] = edits.nodes[id] ? { ...n, ...edits.nodes[id] } : n;
  for (const [id, n] of Object.entries(edits.addedNodes)) nodes[id] = n;
  const removed = new Set(edits.removedEdges.map(([a, b]) => key(a, b)));
  const edges = [...BASE.edges.filter(([a, b]) => !removed.has(key(a, b))), ...edits.addedEdges];
  const shuttle = [
    ...BASE.shuttle.map((s) => (edits.shuttle[s.id] ? { ...s, ...edits.shuttle[s.id] } : s)).filter((s) => !s._deleted),
    ...Object.values(edits.addedShuttle),
  ];
  return { buildings, nodes, edges, shuttle };
}
const MAP = applied(BUILT.edits);

test("frame: plain north-up, one scale, and nothing of the official picture's calibration", () => {
  const f = DATA.meta.frame2d;
  assert.deepStrictEqual(Object.keys(f).sort(), ["h", "metresPerUnit", "w", "x0", "z0"]);
  assert.deepStrictEqual([f.w, f.h], [BASE.frame.w, BASE.frame.h], "it is made for the app's own drawing area");
  // east is right, south is down, the same scale both ways, no rotation or shear
  const [ox, oy] = P.toPx(0, 0);
  const [ex, ey] = P.toPx(100, 0);
  const [sx, sy] = P.toPx(0, 100);
  assert.ok(ex > ox && Math.abs(ey - oy) < 1e-9, "100 m east is straight right");
  assert.ok(sy > oy && Math.abs(sx - ox) < 1e-9, "100 m south is straight down");
  assert.ok(Math.abs((ex - ox) - (sy - oy)) < 1e-9);
  assert.ok(Math.abs((ex - ox) - 100 / f.metresPerUnit) < 1e-9);
  // the picture's pixels-to-world fit is not in the site's file at all
  assert.deepStrictEqual(Object.keys(DATA.meta.georef), ["enuOrigin"]);
  assert.ok(!JSON.stringify(DATA.meta).includes("rmsMeters"));
});

test("frame: every campus place is inside the drawing area, clear of its edge", () => {
  const inside = ([x, y], what) => assert.ok(x >= FRAME_PAD - 0.5 && x <= BASE.frame.w - FRAME_PAD + 0.5 && y >= FRAME_PAD - 0.5 && y <= BASE.frame.h - FRAME_PAD + 0.5, `${what} at ${x.toFixed(1)},${y.toFixed(1)}`);
  for (const b of DATA.buildings) {
    for (const fp of b.footprints) for (const [x, z] of fp.ring) inside(P.toPx(x, z), b.code);
    inside(P.toPx(b.center.x, b.center.z), `${b.code} centre`);
  }
  for (const [id, n] of Object.entries(DATA.graph.nodes)) inside(P.toPx(n.x, n.z), id);
  for (const s of [...DATA.points.shuttle, ...DATA.points.busStops, ...DATA.points.pois, ...DATA.points.entrances]) inside(P.toPx(s.x, s.z), s.id);
  // and it uses the room: the campus spans most of at least one side
  const xs = DATA.buildings.flatMap((b) => b.footprints.flatMap((fp) => fp.ring.map(([x, z]) => P.toPx(x, z)[0])));
  const ys = DATA.buildings.flatMap((b) => b.footprints.flatMap((fp) => fp.ring.map(([x, z]) => P.toPx(x, z)[1])));
  const spanX = (Math.max(...xs) - Math.min(...xs)) / BASE.frame.w;
  const spanY = (Math.max(...ys) - Math.min(...ys)) / BASE.frame.h;
  assert.ok(Math.max(spanX, spanY) > 0.75, `${spanX.toFixed(2)} x ${spanY.toFixed(2)}`);
});

test("frame: distances come from its scale, not a guess", () => {
  assert.strictEqual(P.metresPerPx, DATA.meta.frame2d.metresPerUnit);
  assert.ok(P.metresPerPx > 1.2 && P.metresPerPx < 2.2, String(P.metresPerPx));
  assert.ok(Math.abs(P.ftPerPx - P.metresPerPx * 3.28084) < 1e-9);
  assert.strictEqual(BUILT.scale.ftPerPx, P.ftPerPx);
});

test("a frame the maths cannot use, or one made for another drawing area, is refused, not guessed around", () => {
  const good = DATA.meta.frame2d;
  for (const bad of [null, undefined, {}, { ...good, metresPerUnit: 0 }, { ...good, metresPerUnit: -1 }, { ...good, x0: "0" },
    { ...good, w: NaN }, { ...good, h: 0 }, { w: 919, h: 792 }]) {
    assert.throws(() => SiteData.projector(bad), /frame/, JSON.stringify(bad));
  }
  assert.throws(() => SiteData.siteEdits({ ...DATA, meta: {} }, BASE), /frame/);
  // the full data file has no such frame: handed to the site map by mistake, it is refused
  assert.throws(() => SiteData.siteEdits(FULL, BASE), /frame/);
  assert.throws(() => SiteData.siteEdits({ ...DATA, meta: { ...DATA.meta, frame2d: { ...good, w: 1000 } } }, BASE), /1000x792.*919x792/);
  assert.throws(() => SiteData.siteEdits({ ...DATA, buildings: null }, BASE), /buildings/);
});

test("every building the data file has is on the map once, by its curated identity", () => {
  assert.deepStrictEqual(MAP.buildings.map((b) => b.code).sort(), LISTED.map((b) => b.code).sort());
  for (const d of LISTED) {
    const b = MAP.buildings.find((x) => x.code === d.code);
    assert.strictEqual(b.name, d.name, d.code);
    assert.strictEqual(b.cat, d.cat, d.code);
    for (const v of [b.x, b.y, b.w, b.h]) assert.ok(Number.isFinite(v), `${d.code}: ${[b.x, b.y, b.w, b.h]}`);
  }
});

test("a hotspot nobody named is not a place: it is left off the site map", () => {
  assert.strictEqual(SiteData.isPlaceholder({ name: "New hotspot" }), true);
  assert.strictEqual(SiteData.isPlaceholder({ name: " new Hotspot " }), true);
  for (const name of ["New hotspot 2", "Medical Center", "", undefined]) assert.strictEqual(SiteData.isPlaceholder({ name }), false, String(name));
  assert.ok(!MAP.buildings.some((b) => /new hotspot/i.test(b.name)));
  // The site's data file has none. Handed the full file's buildings, which do, it still lists none.
  const placeholders = HYBRID.buildings.filter(SiteData.isPlaceholder);
  assert.ok(placeholders.length >= 1, "the hybrid carries one (X1, the California Tower site's)");
  const map = applied(BUILT_HYBRID.edits);
  for (const p of placeholders) assert.ok(!map.buildings.some((b) => b.code === p.code), p.code);
});

test("a base building the data file dropped is gone, not left where the official map had it", () => {
  const kept = new Set(LISTED.map((b) => b.code));
  const dropped = BASE.buildings.filter((b) => !kept.has(b.code));
  for (const b of dropped) assert.deepStrictEqual(BUILT.edits.buildings[b.code], { _deleted: true }, b.code);
});

test("a building with an OpenStreetMap outline is drawn by it, every part of it", () => {
  const osm = LISTED.filter(hasOsm);
  assert.ok(osm.length > LISTED.length / 2, String(osm.length));
  for (const d of osm) {
    const b = MAP.buildings.find((x) => x.code === d.code);
    assert.ok(!b.marker, d.code);
    const rings = d.footprints.filter((f) => f.geomSource === "osm").map((f) => f.ring.map(([x, z]) => P.toPx(x, z).map(round1)));
    assert.deepStrictEqual(b.parts, rings, d.code);
    assert.ok(rings.some((r) => JSON.stringify(r) === JSON.stringify(b.points)), `${d.code}: points is one of its rings`);
    // the hit box covers every part
    for (const [x, y] of rings.flat()) {
      assert.ok(x >= b.x - 0.11 && x <= b.x + b.w + 0.11 && y >= b.y - 0.11 && y <= b.y + b.h + 0.11, d.code);
    }
  }
  const t = MAP.buildings.find((x) => x.code === "T");
  assert.ok(t.parts.length >= 3, "the Medical Center is several OpenStreetMap buildings");
});

test("a building OpenStreetMap lacks is a marker at its place", () => {
  const markers = LISTED.filter((b) => !hasOsm(b));
  assert.ok(markers.length > 0);
  for (const d of markers) {
    const b = MAP.buildings.find((x) => x.code === d.code);
    assert.strictEqual(b.marker, true, d.code);
    assert.strictEqual(b.points, null, d.code);
    assert.strictEqual(b.parts, undefined, d.code);
    const [cx, cy] = P.toPx(d.center.x, d.center.z);
    assert.ok(Math.abs(b.x + b.w / 2 - cx) < 0.11 && Math.abs(b.y + b.h / 2 - cy) < 0.11, d.code);
  }
});

test("even handed the full file's buildings, no outline traced over the official map is used", () => {
  const traced = FULL.buildings.filter((b) => !SiteData.isPlaceholder(b) && !hasOsm(b));
  assert.ok(traced.length >= 10, "the full file has them");
  const map = applied(BUILT_HYBRID.edits);
  for (const d of traced) assert.strictEqual(map.buildings.find((x) => x.code === d.code).marker, true, d.code);
  // No vertex of any traced ring appears in any building it produced. (A closure zone is the
  // map's own drawing of a fenced area, and may share a corner with a hotspot.)
  const out = JSON.stringify([BUILT_HYBRID.edits.buildings, BUILT_HYBRID.edits.addedBuildings]);
  let checked = 0;
  for (const d of FULL.buildings) {
    for (const f of d.footprints.filter((x) => x.geomSource !== "osm")) {
      const [x, y] = P.toPx(f.ring[1][0], f.ring[1][1]).map(round1);
      assert.ok(!out.includes(`[${x},${y}]`), `${d.code}: a traced vertex leaked`);
      checked++;
    }
  }
  assert.ok(checked >= 10);
});

test("the walking graph is the data file's: every node moved, exactly its edges", () => {
  assert.deepStrictEqual(Object.keys(MAP.nodes).sort(), Object.keys(DATA.graph.nodes).sort());
  for (const [id, n] of Object.entries(DATA.graph.nodes)) {
    const [x, y] = P.toPx(n.x, n.z).map(round1);
    assert.strictEqual(MAP.nodes[id].x, x, id);
    assert.strictEqual(MAP.nodes[id].y, y, id);
  }
  assert.deepStrictEqual(MAP.edges.map(([a, b]) => key(a, b)).sort(), DATA.graph.edges.map((e) => key(e.a, e.b)).sort());
  assert.deepStrictEqual(BUILT.edits.edgeMeta, {}, "the drawn map shows the real paths; no typed lines over them");
});

test("stops, places, entrances and closures all come from the data file", () => {
  const at = (p) => P.toPx(p.x, p.z).map(round1);
  assert.deepStrictEqual(MAP.shuttle.map((s) => s.id).sort(), DATA.points.shuttle.map((s) => s.id).sort());
  for (const s of DATA.points.shuttle) {
    const m = MAP.shuttle.find((x) => x.id === s.id);
    assert.deepStrictEqual([m.x, m.y, m.name], [...at(s), s.name], s.id);
  }
  assert.deepStrictEqual(BUILT.busStops, DATA.points.busStops.map((s) => ({ id: s.id, name: s.name, x: at(s)[0], y: at(s)[1] })));
  assert.deepStrictEqual(Object.keys(BUILT.edits.pois).sort(), DATA.points.pois.map((p) => p.id).sort());
  for (const p of DATA.points.pois) {
    const m = BUILT.edits.pois[p.id];
    assert.deepStrictEqual([m.x, m.y], at(p), p.id);
    assert.strictEqual(m.name, p.name);
    assert.strictEqual(m.z, undefined, "frame coordinates only");
  }
  assert.deepStrictEqual(Object.keys(BUILT.edits.entrances).sort(), DATA.points.entrances.map((p) => p.id).sort());
  assert.deepStrictEqual(Object.keys(BUILT.edits.constructionZones).sort(), DATA.construction.map((z) => z.id).sort());
  for (const z of DATA.construction) {
    const m = BUILT.edits.constructionZones[z.id];
    assert.strictEqual(m.points.length, z.ring.length, z.id);
    assert.strictEqual(m.endDate, z.endDate, z.id);
    assert.strictEqual(m.name, z.name, z.id);
  }
  assert.deepStrictEqual(BUILT.edits.floorplan, {}, "the floor-plan panel is not part of the site map");
});

test("nothing in what the site map is given is NaN, missing or out of the campus", () => {
  const walk = (v, where) => {
    if (typeof v === "number") assert.ok(Number.isFinite(v), where);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  walk(BUILT, "built");
  for (const b of MAP.buildings) {
    assert.ok(b.x >= 0 && b.x <= BASE.frame.w && b.y >= 0 && b.y <= BASE.frame.h, `${b.code} at ${b.x},${b.y}`);
  }
});

// ---- the drawn base map ----

const LAYERS = DrawnBasemap.layers(DATA, P.toPx, P.metresPerPx);
const subpaths = (d) => (d.match(/M/g) || []).length;
const byId = (id) => LAYERS.find((l) => l.id === id);

test("basemap: the campus is drawn from the data file, in a fixed order, as plain path data", () => {
  assert.deepStrictEqual(LAYERS.map((l) => l.id), [
    "green", "parking",
    "service-casing", "street-casing", "service", "street",
    "cycle", "foot", "steps",
    "neighbours", "lots", "buildings",
  ]);
  for (const l of LAYERS) {
    assert.match(l.d, /^[MLZ0-9 .,-]+$/, `${l.id}: only path commands and numbers`);
    assert.ok(l.d.length > 0, l.id);
    assert.ok(l.fill || l.stroke, l.id);
    if (l.stroke) assert.ok(l.width > 0, l.id);
  }
});

test("basemap: every outline and path keeps a fixed width on screen of at least one pixel", () => {
  // In frame units they would thin to under a pixel with the whole campus in view.
  for (const id of ["cycle", "foot", "steps", "neighbours", "lots", "buildings"]) {
    const l = byId(id);
    assert.strictEqual(l.fixed, true, id);
    assert.ok(l.width >= 1, `${id}: ${l.width}px`);
  }
  // A street keeps its real width instead, and is never drawn under 2.6 frame units.
  for (const id of ["service-casing", "street-casing", "service", "street"]) {
    assert.ok(!byId(id).fixed, id);
    assert.ok(byId(id).width >= 1.4, `${id}: ${byId(id).width}`);
  }
  assert.ok(byId("street-casing").width > byId("street").width && byId("service-casing").width > byId("service").width,
    "the casing shows either side of the road");
});

test("basemap: every OpenStreetMap building is there, and no traced one even from the full file", () => {
  const osm = DATA.buildings.flatMap((b) => b.footprints);
  const raised = osm.filter((f) => f.height > 0).length;
  assert.strictEqual(subpaths(byId("buildings").d), raised);
  assert.strictEqual(subpaths(byId("lots").d), osm.length - raised);
  assert.strictEqual(subpaths(byId("neighbours").d), DATA.context.length);
  // the full file's buildings draw exactly the same: its traced footprints are passed over
  const hybrid = DrawnBasemap.layers(HYBRID, P.toPx, P.metresPerPx);
  assert.strictEqual(hybrid.find((l) => l.id === "buildings").d, byId("buildings").d);
  const all = hybrid.map((l) => l.d).join(" ");
  let checked = 0;
  for (const b of FULL.buildings) {
    for (const f of b.footprints.filter((x) => x.geomSource !== "osm")) {
      const [x, y] = P.toPx(f.ring[1][0], f.ring[1][1]).map(round1);
      assert.ok(!all.includes(`${x},${y}`), `${b.code}: a traced vertex is drawn`);
      checked++;
    }
  }
  assert.ok(checked >= 10);
});

test("basemap: every street and path in the data file is drawn in its kind's layer", () => {
  const count = (kind) => DATA.paths.filter((p) => p.kind === kind).length;
  for (const kind of ["service", "street", "cycle", "foot", "steps"]) {
    assert.strictEqual(subpaths(byId(kind).d), count(kind), kind);
  }
  assert.strictEqual(subpaths(byId("street-casing").d), count("street"));
  assert.strictEqual(DATA.paths.length, ["service", "street", "cycle", "foot", "steps"].reduce((n, k) => n + count(k), 0),
    "a new kind of path in the data would otherwise go undrawn");
});

/** WCAG relative luminance and contrast ratio of two #rrggbb colours. */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("basemap: every outline and line holds 3:1 on every ground it crosses (SC 1.4.11)", () => {
  const ink = DrawnBasemap.INK;
  const grounds = [ink.ground, ink.green, ink.parking];
  for (const hex of Object.values(ink)) assert.match(hex, /^#[0-9a-f]{6}$/);
  const marks = {
    "building outline": ink.buildingEdge, "neighbour outline": ink.neighbourEdge, "lot outline": ink.lotEdge,
    "street edge": ink.streetCasing, "service road edge": ink.serviceCasing,
    "foot path": ink.foot, "cycle path": ink.cycle, steps: ink.steps,
  };
  for (const [name, hex] of Object.entries(marks)) {
    for (const ground of grounds) {
      assert.ok(contrast(hex, ground) >= 3, `${name} ${hex} on ${ground}: ${contrast(hex, ground).toFixed(2)}`);
    }
  }
  // A path may cross a lot or run beside a building: it shows on those too.
  for (const name of ["foot path", "cycle path", "steps"]) {
    for (const fill of [ink.lot, ink.building, ink.neighbour]) {
      assert.ok(contrast(marks[name], fill) >= 3, `${name} ${marks[name]} on ${fill}: ${contrast(marks[name], fill).toFixed(2)}`);
    }
  }
  // The ring round a marker shows on every ground and on every shape it may sit on.
  for (const under of [...grounds, ink.building, ink.neighbour, ink.lot, ink.street]) {
    assert.ok(contrast(ink.markerEdge, under) >= 3, `marker ring on ${under}: ${contrast(ink.markerEdge, under).toFixed(2)}`);
  }
  // An outline must also show against the shape it encloses.
  assert.ok(contrast(ink.buildingEdge, ink.building) >= 3, `${contrast(ink.buildingEdge, ink.building).toFixed(2)}`);
  assert.ok(contrast(ink.neighbourEdge, ink.neighbour) >= 3, `${contrast(ink.neighbourEdge, ink.neighbour).toFixed(2)}`);
});

test("basemap: the credit is OpenStreetMap's, as its licence asks", () => {
  assert.strictEqual(DrawnBasemap.CREDIT, "Map data © OpenStreetMap contributors");
});

// ---- data that is not quite right ----

test("a building the data file gives no place for is left out and named, not fatal", () => {
  const broken = { ...DATA, buildings: [...DATA.buildings, { code: "ZZ9", name: "Nowhere", cat: "admin", footprints: [] }, { name: "no code", footprints: [] }] };
  const built = SiteData.siteEdits(broken, BASE);
  assert.deepStrictEqual(built.skipped, ["ZZ9", "undefined"]);
  assert.ok(!built.edits.buildings.ZZ9 && !built.edits.addedBuildings.ZZ9);
  assert.deepStrictEqual(BUILT.skipped, [], "today's data file places every building");
});

test("an edge naming a node the graph lacks is left out", () => {
  const broken = { ...DATA, graph: { nodes: DATA.graph.nodes, edges: [...DATA.graph.edges, { a: "stk_top", b: "no_such_node" }] } };
  const built = SiteData.siteEdits(broken, BASE);
  const all = [...BASE.edges.filter(([a, b]) => !built.edits.removedEdges.some(([x, y]) => key(x, y) === key(a, b))), ...built.edits.addedEdges];
  assert.ok(!all.some(([a, b]) => a === "no_such_node" || b === "no_such_node"));
  assert.strictEqual(all.length, DATA.graph.edges.length);
});

test("the inputs are not changed by building the site map", () => {
  const before = JSON.stringify([DATA, BASE]);
  SiteData.siteEdits(DATA, BASE);
  assert.strictEqual(JSON.stringify([DATA, BASE]), before);
});

test("applied(): the map took the site data only if every record is a site record", () => {
  assert.strictEqual(SiteData.applied(BUILT, MAP.buildings), true);
  // what a swallowed storage error leaves behind: the base records
  assert.strictEqual(SiteData.applied(BUILT, BASE.buildings), false);
  assert.strictEqual(SiteData.applied(BUILT, MAP.buildings.slice(1)), false);
  assert.strictEqual(SiteData.applied(BUILT, MAP.buildings.map((b, i) => (i === 0 ? { ...b, marker: undefined } : b))), false);
  assert.strictEqual(SiteData.applied(BUILT, MAP.buildings.map((b, i) => (i === 0 ? { ...b, code: "OTHER" } : b))), false);
  assert.strictEqual(SiteData.applied(BUILT, null), false);
});
