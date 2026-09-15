#!/usr/bin/env node
//
// Generates 3d/campus-data.json — everything the 3D walkable campus renders.
//
//   run:  node tools/gen-3d-data.js [--quiet]
//
// Geometry comes from OpenStreetMap; identity comes from the 2D app's own
// data.jsx + default-edits.json; the two are joined by name and confirmed by
// footprint overlap (tools/lib/match.js). Nothing here is hand-maintained —
// re-run it after any edit-mode publish and the 3D world follows.
//
// It also writes ucdh-data/match-report.json and prints a human-readable
// summary. READ THAT REPORT before trusting the output: a bad join silently
// mislabels a building everywhere downstream.
"use strict";

const fs = require("fs");
const path = require("path");

const { GEOREF, ORIGIN, pxToEnu, pxPolyToEnu } = require("./lib/georef");
const { loadCurated } = require("./lib/curated");
const { loadOsm } = require("./lib/osm");
const { matchBuildings } = require("./lib/match");
const { resolveHeight, FLOOR_H } = require("./lib/heights");
const { registerHospital } = require("./lib/floorplan");
const { markUnderConstruction, flattenPlaceholders } = require("./lib/construction-cover");
const { centroid, area, cleanRing, roundRing, round } = require("./lib/geom");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "3d", "campus-data.json");
const REPORT = path.join(ROOT, "ucdh-data", "match-report.json");
const DECISIONS = path.join(ROOT, "ucdh-data", "join-decisions.json");

/** Human verdicts on previously reported conflicts, keyed by curated code. */
function loadDecisions() {
  if (!fs.existsSync(DECISIONS)) return {};
  return JSON.parse(fs.readFileSync(DECISIONS, "utf8")).conflicts || {};
}

const pt = ([x, z]) => ({ x: round(x), z: round(z) });

const pxPt = (o) => pt(pxToEnu(o.x, o.y));

// The OSM extract is deliberately fetched with ~200 m of margin so buildings on
// the map edge still have a footprint to match against. For rendering we clip
// back to the map extent plus a smaller skirt: enough neighbourhood that the
// campus doesn't end in a void, not so much that we ship half of Sacramento.
const WORLD_MARGIN = 120;
const WORLD = (() => {
  const corners = [
    pxToEnu(0, 0),
    pxToEnu(GEOREF.mapPx.w, 0),
    pxToEnu(GEOREF.mapPx.w, GEOREF.mapPx.h),
    pxToEnu(0, GEOREF.mapPx.h),
  ];
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return {
    minX: Math.min(...xs) - WORLD_MARGIN,
    maxX: Math.max(...xs) + WORLD_MARGIN,
    minZ: Math.min(...zs) - WORLD_MARGIN,
    maxZ: Math.max(...zs) + WORLD_MARGIN,
  };
})();

/** Keep anything with at least one vertex inside the world box. */
const touchesWorld = (pts) =>
  pts.some(([x, z]) => x >= WORLD.minX && x <= WORLD.maxX && z >= WORLD.minZ && z <= WORLD.maxZ);

// --- buildings ------------------------------------------------------------

function curatedToEnu(buildings) {
  return buildings.map((b) => {
    const ring = cleanRing(pxPolyToEnu(b.pxPoints));
    return { ...b, ring, center: centroid(ring), area: area(ring) };
  });
}

function buildBuildingRecords(curatedEnu, matchResults, curated) {
  const deptsByBuilding = new Map();
  for (const d of curated.departments) {
    if (!deptsByBuilding.has(d.building)) deptsByBuilding.set(d.building, []);
    deptsByBuilding.get(d.building).push(d.note ? { name: d.name, note: d.note } : { name: d.name });
  }
  const byCode = new Map(curatedEnu.map((b) => [b.code, b]));

  return matchResults.map((r) => {
    const cur = byCode.get(r.code);
    const footprints = [];
    if (r.status === "matched" && r.match && r.match.isArea) {
      // Matched an OSM *area* (a surface lot, a park): flat, never extruded. The
      // traced fallback below would have raised a surface lot into a 4-storey box.
      footprints.push({
        osmId: r.match.osmId,
        osmName: r.match.name,
        geomSource: "osm",
        ring: roundRing(r.match.ring),
        floors: 0,
        height: 0,
        heightSource: "OpenStreetMap",
      });
    } else if (r.status === "matched" && r.match) {
      footprints.push(shellOf(r.match, cur, r.code));
    }
    for (const a of r.annexes) footprints.push(shellOf(a, cur, r.code));
    if (!footprints.length) {
      // No usable OSM geometry — extrude the hand-traced schematic polygon.
      const h = resolveHeight({ code: r.code, cat: cur.cat });
      footprints.push({
        osmId: null,
        osmName: null,
        geomSource: "traced",
        ring: roundRing(cur.ring),
        ...h,
      });
    }
    return {
      code: r.code,
      name: cur.name,
      label: cur.label || cur.name,
      cat: cur.cat,
      type: cur.type || null, // parking sub-type (staff / patient / contractor)
      entryNode: curated.buildingEntry[r.code] || null,
      departments: deptsByBuilding.get(r.code) || [],
      match: { status: r.status, reason: r.reason, osmName: r.match ? r.match.name : null },
      center: pt(cur.center),
      pxCenter: { x: round(cur.x + (cur.w || 0) / 2, 1), y: round(cur.y + (cur.h || 0) / 2, 1) },
      footprints,
    };
  });
}

function shellOf(m, cur, code) {
  const h = resolveHeight({
    osmName: m.name,
    levels: m.levels,
    code,
    cat: cur.cat,
    osmTag: m.building,
  });
  return {
    osmId: m.osmId,
    osmName: m.name,
    geomSource: "osm",
    ring: roundRing(m.ring),
    ...h,
  };
}

/** Neighbourhood context: real footprints nobody claimed, rendered without identity. */
function contextBuildings(unclaimed) {
  return unclaimed.filter((b) => touchesWorld(b.ring)).map((b) => {
    const h = resolveHeight({
      osmName: b.name,
      levels: b.levels,
      heightTag: b.heightTag,
      osmTag: b.building,
      cat: "external",
    });
    return {
      osmId: b.osmId,
      name: b.name || null,
      osmTag: b.building,
      ring: roundRing(b.ring),
      ...h,
    };
  });
}

// --- everything else ------------------------------------------------------

function buildPointFeatures(curated) {
  return {
    shuttle: curated.shuttle.map((s) => ({ id: s.id, name: s.name, ...pxPt(s) })),
    busStops: curated.busStops.map((s) => ({ id: s.id, name: s.name, ...pxPt(s) })),
    pois: curated.pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type || "general",
      instructions: p.instructions || null,
      building: p.building || null,
      mapsQuery: p.mapsQuery || null,
      mapsLink: p.mapsLink || null,
      events: p.events || [],
      ...pxPt(p),
    })),
    entrances: curated.entrances.map((e) => ({
      id: e.id,
      label: e.label || null,
      building: e.building || null,
      accessible: !!e.accessible,
      ...pxPt(e),
    })),
    crosswalks: curated.crosswalks.map((c) => ({ id: c.id, ...pxPt(c) })),
  };
}

function buildGraph(curated) {
  const nodes = {};
  for (const [id, n] of Object.entries(curated.graph.nodes)) nodes[id] = pxPt(n);
  return { nodes, edges: curated.graph.edges };
}

/** Construction zones keep their dates — the 3D layer expires them exactly as the 2D router does. */
const buildConstruction = (curated) =>
  curated.constructionZones.map((z) => ({
    id: z.id,
    name: z.name,
    startDate: z.startDate || null,
    endDate: z.endDate || null,
    affects: z.affects || [],
    notes: z.notes || null,
    ring: roundRing(cleanRing(pxPolyToEnu(z.points))),
  }));

const buildPaths = (osm) =>
  osm.ways.filter((w) => touchesWorld(w.pts)).map((w) => ({
    osmId: w.osmId,
    kind: w.kind,
    highway: w.highway,
    name: w.name,
    width: w.width,
    bridge: w.bridge,
    tunnel: w.tunnel,
    pts: roundRing(w.pts),
  }));

const buildAreas = (osm) =>
  osm.areas.filter((a) => touchesWorld(a.ring)).map((a) => ({
    osmId: a.osmId,
    kind: a.kind,
    name: a.name,
    access: a.access,
    ring: roundRing(a.ring),
  }));

// --- report ---------------------------------------------------------------

function printReport(results, unclaimed, buildings, context) {
  const by = (s) => results.filter((r) => r.status === s);
  const matched = by("matched");
  const ambiguous = by("ambiguous");
  const unmatched = by("unmatched");
  const absent = by("absent");
  // Coverage is measured against the buildings OSM actually knows about. The
  // ones it has never mapped can't be joined by any threshold, and pretending
  // otherwise would just push the join into inventing matches.
  const joinable = results.length - absent.length;
  const pct = joinable ? ((matched.length / joinable) * 100).toFixed(1) : "0.0";

  const line = "─".repeat(78);
  console.log(`\n${line}\nBUILDING JOIN REPORT — curated identity → OSM footprint\n${line}`);
  console.log(
    `  matched   ${String(matched.length).padStart(3)} / ${joinable} joinable  (${pct}%)   of ${results.length} curated buildings\n` +
      `  ambiguous ${String(ambiguous.length).padStart(3)}   ← needs a human decision\n` +
      `  unmatched ${String(unmatched.length).padStart(3)}   ← a footprint is there but nothing convincing; human should look\n` +
      `  absent    ${String(absent.length).padStart(3)}   ← OSM has not mapped it; traced schematic polygon is the right source`
  );

  if (ambiguous.length) {
    console.log(`\nAMBIGUOUS — two overlapping candidates, neither settled by name:`);
    for (const r of ambiguous) {
      console.log(`  ${r.code.padEnd(5)} ${r.name}`);
      console.log(`      best: ${fmt(r.match)}`);
      if (r.runnerUp) console.log(`      next: ${fmt(r.runnerUp)}`);
    }
  }
  if (unmatched.length) {
    console.log(`\nUNMATCHED — something is there, but the join wasn't convinced:`);
    for (const r of unmatched) {
      console.log(`  ${r.code.padEnd(5)} ${r.name.padEnd(46)} ${r.reason}`);
      if (r.nearest) console.log(`      nearest: ${fmt(r.nearest)}`);
    }
  }
  if (absent.length) {
    console.log(`\nABSENT FROM OSM — extruded from the traced polygon (expected; not a join failure):`);
    for (const r of absent) console.log(`  ${r.code.padEnd(5)} ${r.name.slice(0, 48).padEnd(48)} ${r.reason}`);
  }
  const decided = loadDecisions();
  const reviewed = results.filter((r) => r.conflict && decided[r.code]);
  const conflicts = results.filter((r) => r.conflict && !decided[r.code]);
  if (reviewed.length) {
    console.log(`\nREVIEWED CONFLICTS — the 2D map and OSM disagree on these names; a human has ruled (ucdh-data/join-decisions.json):`);
    for (const r of reviewed) {
      const d = decided[r.code];
      console.log(`  ${r.code.padEnd(5)} ${r.name.padEnd(20)} verdict: ${d.verdict} is right  (${d.decided}) — OSM calls this footprint "${r.match.name}"`);
    }
  }
  if (conflicts.length) {
    console.log(`\n⚠ NAME / GEOMETRY CONFLICT — the 2D map and OSM disagree about which building is which.`);
    console.log(`  Resolved in favour of GEOMETRY, so 2D and 3D still agree on position — but one of the`);
    console.log(`  two datasets has these labels swapped, and only a human can say which.`);
    console.log(`  Record the verdict in ucdh-data/join-decisions.json once known.`);
    for (const r of conflicts) {
      console.log(`  ${r.code.padEnd(5)} ${r.name}`);
      console.log(`      name says     → ${fmt(r.conflict.nameSays)}`);
      console.log(`      geometry says → ${fmt(r.conflict.geometrySays)}`);
    }
  }

  const contested = by("contested");
  if (contested.length) {
    console.log(`\nCONTESTED — its best footprint was won by another building:`);
    for (const r of contested) console.log(`  ${r.code.padEnd(5)} ${r.name.slice(0, 44).padEnd(46)} ${r.reason}`);
  }

  // The join accepted these on footprint overlap with zero name agreement —
  // almost always because the OSM way is unnamed. Overlap alone cannot tell two
  // adjacent buildings apart, so these are the ones worth a human eyeball.
  const geomOnly = matched.filter((r) => r.evidence === "geometry");
  if (geomOnly.length) {
    console.log(`\nMATCHED ON GEOMETRY ALONE — no name evidence; worth eyeballing:`);
    for (const r of geomOnly) {
      console.log(`  ${r.code.padEnd(5)} ${r.name.slice(0, 40).padEnd(42)} → ${(r.match.name || "(unnamed OSM way)").padEnd(40)} IoU ${r.match.iou.toFixed(2)} ${r.match.dist.toFixed(0)} m`);
    }
  }

  const complexes = results.filter((r) => r.annexes.length);
  if (complexes.length) {
    console.log(`\nMULTI-FOOTPRINT COMPLEXES — one curated building owning several OSM footprints:`);
    for (const r of complexes) {
      console.log(`  ${r.code.padEnd(5)} ${r.name}  →  ${r.annexes.length + 1} footprints`);
      for (const a of [r.match, ...r.annexes]) console.log(`      · ${a.name || "(unnamed)"}`);
    }
  }

  const shells = buildings.flatMap((b) => b.footprints);
  const bySource = shells.reduce((acc, s) => {
    acc[s.heightSource] = (acc[s.heightSource] || 0) + 1;
    return acc;
  }, {});
  console.log(`\nHEIGHTS — ${shells.length} campus shells by provenance:`);
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log(`\nCONTEXT — ${context} of ${unclaimed.length} unclaimed OSM footprints are inside the world box\n           and render as unnamed neighbourhood; the rest are clipped away.`);
  console.log(line + "\n");

  return {
    curated: results.length,
    joinable,
    matched: matched.length,
    ambiguous: ambiguous.length,
    unmatched: unmatched.length,
    absent: absent.length,
    pctOfJoinable: +pct,
  };
}

const fmt = (m) =>
  `${(m.name || "(unnamed)").padEnd(44)} name ${m.nameScore.toFixed(2)}  IoU ${m.iou.toFixed(2)}  ${m.dist.toFixed(0)} m`;

// --- main -----------------------------------------------------------------

function main() {
  const curated = loadCurated();
  const osm = loadOsm();
  const curatedEnu = curatedToEnu(curated.buildings);
  const { results, unclaimed } = matchBuildings(curatedEnu, osm);
  const buildings = buildBuildingRecords(curatedEnu, results, curated);

  // The Medical Center is built from its floor plan, not from extruded OSM
  // shells: the OSM outline is a 344 m podium that, extruded eight storeys,
  // reads as one squat box. The floor plan carries the true massing AND the
  // walkable interior. The T record keeps its footprints for the join
  // provenance and outdoor collision; renderedBy tells buildings.js to leave
  // the extrusion to hospital.js.
  const medCenter = buildings.find((b) => b.code === "T");
  const floorsPx = (curated.floorplans.T || {}).floors;
  let hospital = null;
  if (medCenter && floorsPx) {
    const doors = curated.entrances
      .filter((e) => e.building === "T")
      .map((e) => ({ id: e.id, label: e.label || null, accessible: !!e.accessible, ...pxPt(e) }));
    hospital = registerHospital(floorsPx, medCenter.footprints, FLOOR_H.hospital, doors);
    medCenter.renderedBy = "hospital";
  }

  // Buildings inside an active site are drawn as ghosts, and the site's sign clears them.
  const covered = markUnderConstruction(flattenPlaceholders(buildings), buildConstruction(curated));
  const data = {
    meta: {
      generated: new Date().toISOString(),
      generator: "tools/gen-3d-data.js",
      curatedVersion: curated.version,
      georef: { cx: GEOREF.cx, cy: GEOREF.cy, enuOrigin: ORIGIN, rmsMeters: GEOREF.fit.rmsMeters },
      frame: "ENU metres, +x east, +z south, origin at meta.georef.enuOrigin",
      world: { ...WORLD, marginMetres: WORLD_MARGIN },
      floorHeights: FLOOR_H,
      attribution: "Building and path geometry © OpenStreetMap contributors, ODbL.",
      counts: {},
    },
    categories: curated.categories,
    parkingTypes: curated.parkingTypes,
    poiTypes: curated.poiTypes,
    buildings: covered.buildings,
    context: contextBuildings(unclaimed),
    paths: buildPaths(osm),
    areas: buildAreas(osm),
    points: buildPointFeatures(curated),
    graph: buildGraph(curated),
    construction: covered.zones,
    hospital,
    osmBusStops: osm.points.filter((p) => touchesWorld([[p.x, p.z]])),
  };
  data.meta.counts = {
    buildings: data.buildings.length,
    footprints: data.buildings.reduce((n, b) => n + b.footprints.length, 0),
    context: data.context.length,
    paths: data.paths.length,
    areas: data.areas.length,
    construction: data.construction.length,
    hospitalFloors: data.hospital ? data.hospital.floors.length : 0,
    ...Object.fromEntries(Object.entries(data.points).map(([k, v]) => [k, v.length])),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  const summary = printReport(results, unclaimed, buildings, data.context.length);
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        generated: data.meta.generated,
        curatedVersion: curated.version,
        summary,
        // Rings are big and already in campus-data.json; the report stays readable.
        results: results.map((r) => ({ ...r, match: strip(r.match), annexes: r.annexes.map(strip), runnerUp: strip(r.runnerUp), nearest: strip(r.nearest) })),
        unclaimed: unclaimed.map((b) => ({ osmId: b.osmId, name: b.name, building: b.building, area: Math.round(b.area) })),
      },
      null,
      2
    )
  );

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`wrote 3d/campus-data.json (${kb} KB) and ucdh-data/match-report.json`);
  console.log(JSON.stringify(data.meta.counts));
}

const strip = (m) => (m ? { ...m, ring: undefined } : null);

main();
