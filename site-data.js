// The site build's map data: every position from 3d/campus-data.json, the file the 3D map
// reads (OpenStreetMap geometry joined to the curated building list by tools/gen-3d-data.js),
// and none from the official printed map or from outlines traced over it.
//
// The 2D app keeps all its data as base records (data.jsx) plus one "edits" document
// (edit-store.jsx): building shapes, the walking graph, stops, places, entrances, closures.
// Locally that document is the editor's saved file, drawn in the editor over the picture. On
// the site it is built here instead, from the data file:
//
//   - a building with an OpenStreetMap outline is drawn by it: `points` is its largest ring
//     (what the router and the label use) and `parts` every ring (what is drawn and clicked);
//   - a building OpenStreetMap lacks is a `marker` at its place. Its outline exists only as a
//     tracing of the official map (footprints with geomSource "traced"), which never ships;
//   - a base building the data file no longer has is removed, and so is a hotspot the
//     editor never named ("New hotspot"): the 3D map treats those as bare ground, not places;
//   - the walking graph, shuttle and bus stops, places, entrances and closures are the data
//     file's, so the 2D and 3D maps agree to the metre.
//
// Positions are put in the 2D app's own 919x792 frame by the georeference the data file
// carries (meta.georef: the frame to Web Mercator, plus the 3D scene's origin). The maths is
// tools/lib/georef.js's, kept equal by tools/test/site-data.test.js. A classic script.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) { module.exports = api; return; } // node tests
  root.SiteData = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var DATA_URL = "3d/campus-data.json";
  var R = 6378137.0;            // WGS84 semi-major axis, the Web Mercator sphere's radius
  var M_PER_DEG_LAT = 110574.0;
  var FT_PER_M = 3.28084;
  var MARKER_BOX = 14;          // frame units: the hit box of a building shown as a marker

  var isNum = function (v) { return typeof v === "number" && isFinite(v); };
  var round1 = function (n) { return Math.round(n * 10) / 10; };

  /** The data file's georeference as functions.
   *  @returns {{toPx: (x: number, z: number) => [number, number], metresPerPx: number, ftPerPx: number}} */
  function projector(georef) {
    var cx = georef && georef.cx, cy = georef && georef.cy, origin = georef && georef.enuOrigin;
    var triple = function (a) { return Array.isArray(a) && a.length === 3 && a.every(isNum); };
    if (!triple(cx) || !triple(cy) || !origin || !isNum(origin.lon) || !isNum(origin.lat)) {
      throw new Error("the data file's georeference is missing or malformed");
    }
    var det = cx[0] * cy[1] - cx[1] * cy[0];
    if (!isNum(det) || Math.abs(det) < 1e-9) throw new Error("the data file's georeference cannot be inverted");
    var mPerDegLon = 111320.0 * Math.cos((origin.lat * Math.PI) / 180);

    function toPx(x, z) {
      var lon = origin.lon + x / mPerDegLon;
      var lat = origin.lat - z / M_PER_DEG_LAT;
      var mx = R * lon * (Math.PI / 180);
      var my = R * Math.log(Math.tan(Math.PI / 4 + (lat * (Math.PI / 180)) / 2));
      var X = mx - cx[2], Y = my - cy[2];
      return [(cy[1] * X - cx[1] * Y) / det, (-cy[0] * X + cx[0] * Y) / det];
    }
    // Ground metres to one frame unit, measured across the campus (the frame is north-up and
    // square to well under 1%, so one number serves both axes).
    var a = toPx(0, 0), b = toPx(1000, 0), c = toPx(0, 1000);
    var perKm = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 2;
    var metresPerPx = 1000 / perKm;
    return { toPx: toPx, metresPerPx: metresPerPx, ftPerPx: metresPerPx * FT_PER_M };
  }

  function ringArea(ring) {
    var sum = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(sum) / 2;
  }

  function bbox(rings) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rings.forEach(function (ring) {
      ring.forEach(function (p) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      });
    });
    return { x: minX, y: minY, w: round1(maxX - minX), h: round1(maxY - minY) };
  }

  /** One building's shape for the site map: its OpenStreetMap rings, or a marker. */
  function buildingShape(b, at) {
    var rings = (b.footprints || [])
      .filter(function (f) { return f.geomSource === "osm" && Array.isArray(f.ring) && f.ring.length >= 3; })
      .map(function (f) { return f.ring.map(function (p) { return at(p[0], p[1]); }); });
    if (rings.length === 0) {
      var c = at(b.center.x, b.center.z);
      return {
        marker: true, points: null,
        x: round1(c[0] - MARKER_BOX / 2), y: round1(c[1] - MARKER_BOX / 2), w: MARKER_BOX, h: MARKER_BOX,
      };
    }
    var main = rings.reduce(function (best, r) { return ringArea(r) > ringArea(best) ? r : best; });
    var box = bbox(rings);
    return { marker: false, points: main, parts: rings, x: box.x, y: box.y, w: box.w, h: box.h };
  }

  /** Whether a building can be put on the map: an OpenStreetMap ring, or a centre for a marker. */
  function placeable(b) {
    if (!b || typeof b.code !== "string") return false;
    var hasRing = (b.footprints || []).some(function (f) { return f.geomSource === "osm" && Array.isArray(f.ring) && f.ring.length >= 3; });
    return hasRing || (!!b.center && isNum(b.center.x) && isNum(b.center.z));
  }

  function buildingRecord(b, at) {
    var record = Object.assign({ name: b.name, label: b.label, cat: b.cat }, buildingShape(b, at));
    if (typeof b.type === "string") record.type = b.type;
    return record;
  }

  /** The editor names a freshly drawn hotspot "New hotspot" until someone names it
   *  (tools/lib/construction-cover.js treats it the same way): not a place to list. */
  function isPlaceholder(b) {
    return /^new hotspot$/i.test(String((b && b.name) || "").trim());
  }

  var edgeKey = function (a, b) { return a < b ? a + "__" + b : b + "__" + a; };

  /** Records keyed by id become overrides of the base ones, additions, and removals of the rest. */
  function keyed(baseList, records) {
    var overrides = {}, added = {};
    var baseIds = new Set(baseList.map(function (r) { return r.id; }));
    records.forEach(function (r) { (baseIds.has(r.id) ? overrides : added)[r.id] = r; });
    baseList.forEach(function (r) { if (!overrides[r.id]) overrides[r.id] = { _deleted: true }; });
    return { overrides: overrides, added: added };
  }

  /**
   * The site map's edits document, from the data file.
   * @param data the parsed 3d/campus-data.json
   * @param base the app's base records: { buildings, nodes, edges, shuttle } as data.jsx defines them
   * @returns {{ edits: object, busStops: object[], scale: { metresPerPx: number, ftPerPx: number }, skipped: string[] }}
   */
  function siteEdits(data, base) {
    if (!data || !data.meta) throw new Error("the data file has no georeference");
    var p = projector(data.meta.georef);
    if (!Array.isArray(data.buildings)) throw new Error("the data file has no buildings");
    var at = function (x, z) { var q = p.toPx(x, z); return [round1(q[0]), round1(q[1])]; };
    var point = function (rec) { var q = at(rec.x, rec.z); return { x: q[0], y: q[1] }; };
    /** A record with its ENU position replaced by its place in the frame. */
    var placed = function (rec) {
      var out = Object.assign({}, rec, point(rec));
      delete out.z;
      return out;
    };
    var points = data.points || {};
    var graph = data.graph || { nodes: {}, edges: [] };

    // Buildings: overrides of the base list, additions, and tombstones.
    var buildings = {}, addedBuildings = {};
    var baseCodes = new Set(base.buildings.map(function (b) { return b.code; }));
    var skipped = [];
    data.buildings.forEach(function (b) {
      if (isPlaceholder(b)) return; // left out; a base record of it is removed below
      if (!placeable(b)) { skipped.push(String(b && b.code)); return; } // nowhere to put it: left out, and said so
      var record = buildingRecord(b, at);
      if (baseCodes.has(b.code)) buildings[b.code] = record;
      else addedBuildings[b.code] = Object.assign({ code: b.code }, record);
    });
    base.buildings.forEach(function (b) { if (!buildings[b.code]) buildings[b.code] = { _deleted: true }; });

    // The walking graph: every node at the data file's place, exactly the data file's edges.
    var nodes = {}, addedNodes = {};
    Object.keys(graph.nodes).forEach(function (id) {
      var n = graph.nodes[id];
      var q = point(n);
      if (base.nodes[id]) nodes[id] = q;
      else addedNodes[id] = Object.assign({ label: n.label || id }, q);
    });
    var missing = Object.keys(base.nodes).filter(function (id) { return !graph.nodes[id]; });
    if (missing.length) {
      // A base node cannot be removed by an edit, and left alone it would sit where the
      // official map had it. Stop rather than draw a graph that is half one map, half another.
      throw new Error("the data file's graph lacks the base node " + missing.join(", ") + "; regenerate 3d/campus-data.json");
    }
    // An edge naming a node the graph lacks could not be drawn or walked: left out.
    var edgesIn = graph.edges.filter(function (e) { return graph.nodes[e.a] && graph.nodes[e.b]; });
    graph = { nodes: graph.nodes, edges: edgesIn };
    var want = new Set(graph.edges.map(function (e) { return edgeKey(e.a, e.b); }));
    var have = new Set(base.edges.map(function (e) { return edgeKey(e[0], e[1]); }));
    var removedEdges = base.edges.filter(function (e) { return !want.has(edgeKey(e[0], e[1])); }).map(function (e) { return [e[0], e[1]]; });
    var addedEdges = graph.edges.filter(function (e) { return !have.has(edgeKey(e.a, e.b)); }).map(function (e) { return [e.a, e.b]; });

    var shuttle = keyed(base.shuttle, (points.shuttle || []).map(placed));
    var byId = function (list) {
      var out = {};
      (list || []).forEach(function (rec) { out[rec.id] = placed(rec); });
      return out;
    };
    var constructionZones = {};
    (data.construction || []).forEach(function (z) {
      constructionZones[z.id] = {
        id: z.id, name: z.name, startDate: z.startDate || null, endDate: z.endDate || null,
        affects: z.affects || [], notes: z.notes || "",
        points: z.ring.map(function (q) { return at(q[0], q[1]); }),
      };
    });

    return {
      edits: {
        buildings: buildings, addedBuildings: addedBuildings,
        nodes: nodes, addedNodes: addedNodes, addedEdges: addedEdges, removedEdges: removedEdges,
        edgeMeta: {}, // the drawn map shows the real streets and paths; no typed lines over them
        shuttle: shuttle.overrides, addedShuttle: shuttle.added,
        entrances: byId(points.entrances), crosswalks: byId(points.crosswalks), pois: byId(points.pois),
        constructionZones: constructionZones,
        floorplan: {}, // the floor-plan panel is drawn over the official floor diagram: not on the site
      },
      busStops: (points.busStops || []).map(function (s) { var q = point(s); return { id: s.id, name: s.name, x: q.x, y: q.y }; }),
      scale: { metresPerPx: p.metresPerPx, ftPerPx: p.ftPerPx },
      skipped: skipped, // codes of buildings the data file gave no place for
    };
  }

  /**
   * Whether the map's records are the ones `built` asked for. The edit store swallows its
   * storage errors by design, so app.jsx asks this before it draws: a site map that did not
   * take its data would otherwise show the base records, placed on the official map.
   * @param buildings window.BUILDINGS after editStore.loadSite(built.edits)
   */
  function applied(built, buildings) {
    var want = Object.keys(built.edits.buildings).filter(function (c) { return !built.edits.buildings[c]._deleted; })
      .concat(Object.keys(built.edits.addedBuildings)).sort();
    if (!Array.isArray(buildings) || buildings.length !== want.length) return false;
    var have = buildings.map(function (b) { return b.code; }).sort();
    return have.every(function (code, i) { return code === want[i]; })
      && buildings.every(function (b) { return typeof b.marker === "boolean"; }); // only a site record has one
  }

  var LOAD_WITHIN_MS = 30000;

  /** Fetch and parse the data file. Rejects with a plain reason when it cannot be read,
   *  and after half a minute when it never arrives. */
  function load(fetchImpl) {
    var init = { cache: "no-cache" }; // the 3D map reads this file fresh on every load, and the two must agree
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(LOAD_WITHIN_MS);
    return (fetchImpl || fetch)(DATA_URL, init).then(function (r) {
      if (!r.ok) throw new Error(DATA_URL + ": HTTP " + r.status);
      return r.json();
    });
  }

  return { projector: projector, siteEdits: siteEdits, applied: applied, isPlaceholder: isPlaceholder, load: load, DATA_URL: DATA_URL };
});
