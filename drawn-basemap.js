// The 2D map's campus backdrop in the site build, DRAWN from 3d/campus-data.site.json: lawns and
// lots, streets and paths, the neighbourhood's buildings and the campus's own, all
// OpenStreetMap geometry. The site never shows the official printed map (owner, 2026-11-17:
// open data), so app.jsx asks for this in site mode only; locally the owner keeps editing
// against the picture, exactly as before.
//
// It is drawn as SVG path data, not a picture: one <path> per layer inside the map's own
// <svg>, so it stays sharp at any zoom and needs no canvas. layers() is pure (data in, path
// strings out) and tested in node. Only OpenStreetMap footprints are drawn: the site's data
// file holds no others, and the same test is kept here in case a full file is handed to it.
// A building with no footprint is a marker (site-data.js).
//
// The inks are chosen so every outline and line holds 3:1 against every ground it crosses
// (SC 1.4.11); tools/test/site-data.test.js measures each pair. The data credit is static
// HTML in index.html's header. A classic script.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) { module.exports = api; return; } // node tests
  root.DrawnBasemap = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var CREDIT = "Map data © OpenStreetMap contributors";

  var INK = Object.freeze({
    ground: "#f4f1ea",          // the page's own background
    green: "#d3e2c0",           // lawns, parks, pitches
    parking: "#e4e0d6",         // surface lots
    building: "#d9d2c3", buildingEdge: "#5b564c",
    neighbour: "#e9e5db", neighbourEdge: "#7d796f",
    lot: "#e4e0d6", lotEdge: "#7d796f",
    street: "#ffffff", streetCasing: "#77736a",
    service: "#ffffff", serviceCasing: "#7d796f",
    foot: "#7a5a2c", cycle: "#2c6a99", steps: "#5a4526",
    markerEdge: "#022851",      // the ring round a building shown as a marker (map.jsx)
  });

  // What an OpenStreetMap land-use ring is drawn as; anything else (retail, residential,
  // industrial land) is left as ground.
  var AREA_LAYER = { grass: "green", park: "green", pitch: "green", playground: "green", parking: "parking" };
  var PATH_KINDS = ["service", "street", "cycle", "foot", "steps"];

  var n1 = function (n) { return String(Math.round(n * 10) / 10); };

  function open(pts, toPx) {
    return "M" + pts.map(function (p) { var q = toPx(p[0], p[1]); return n1(q[0]) + "," + n1(q[1]); }).join(" L");
  }
  var closed = function (ring, toPx) { return open(ring, toPx) + " Z"; };

  /**
   * The campus as layers of SVG path data, in drawing order.
   * @param data the parsed 3d/campus-data.site.json
   * @param toPx (x, z) -> [px, py]: ENU metres to the 2D app's frame (SiteData.projector)
   * @param metresPerPx ground metres to one frame unit, for line widths
   * @returns {{id: string, d: string, fill?: string, stroke?: string, width?: number, dash?: string, fixed?: boolean}[]}
   *   `width` is in frame units and grows with the zoom, as a street's width should; with
   *   `fixed` it (and `dash`) is in screen pixels at every zoom, so an outline or a foot path
   *   never thins to nothing when the whole campus is in view (map.jsx: non-scaling-stroke).
   */
  function layers(data, toPx, metresPerPx) {
    var d = { green: [], parking: [], neighbours: [], lots: [], buildings: [] };
    var lines = {};
    PATH_KINDS.forEach(function (k) { lines[k] = []; });

    (data.areas || []).forEach(function (a) {
      var layer = AREA_LAYER[a.kind];
      if (layer && a.ring && a.ring.length >= 3) d[layer].push(closed(a.ring, toPx));
    });
    (data.context || []).forEach(function (c) {
      if (c.ring && c.ring.length >= 3) d.neighbours.push(closed(c.ring, toPx));
    });
    (data.buildings || []).forEach(function (b) {
      (b.footprints || []).forEach(function (f) {
        if (f.geomSource !== "osm" || !f.ring || f.ring.length < 3) return; // a traced outline never ships
        (f.height > 0 ? d.buildings : d.lots).push(closed(f.ring, toPx));  // a flat footprint is a surface lot
      });
    });
    (data.paths || []).forEach(function (p) {
      if (lines[p.kind] && p.pts && p.pts.length >= 2) lines[p.kind].push(open(p.pts, toPx));
    });

    // A street's width on the ground, in frame units, kept wide enough to see when zoomed out.
    var roadWidth = function (metres, least) { return Math.max(least, metres / metresPerPx); };
    var join = function (list) { return list.join(" "); };

    return [
      { id: "green", d: join(d.green), fill: INK.green },
      { id: "parking", d: join(d.parking), fill: INK.parking },
      { id: "service-casing", d: join(lines.service), stroke: INK.serviceCasing, width: roadWidth(5, 2.6) },
      { id: "street-casing", d: join(lines.street), stroke: INK.streetCasing, width: roadWidth(9, 4.6) },
      { id: "service", d: join(lines.service), stroke: INK.service, width: roadWidth(5, 2.6) - 1.2 },
      { id: "street", d: join(lines.street), stroke: INK.street, width: roadWidth(9, 4.6) - 1.4 },
      { id: "cycle", d: join(lines.cycle), stroke: INK.cycle, width: 1.5, fixed: true },
      { id: "foot", d: join(lines.foot), stroke: INK.foot, width: 1.5, dash: "4 3", fixed: true },
      { id: "steps", d: join(lines.steps), stroke: INK.steps, width: 2.5, dash: "2 2", fixed: true },
      { id: "neighbours", d: join(d.neighbours), fill: INK.neighbour, stroke: INK.neighbourEdge, width: 1, fixed: true },
      { id: "lots", d: join(d.lots), fill: INK.lot, stroke: INK.lotEdge, width: 1, dash: "5 3", fixed: true },
      { id: "buildings", d: join(d.buildings), fill: INK.building, stroke: INK.buildingEdge, width: 1.25, fixed: true },
    ];
  }

  return { layers: layers, INK: INK, CREDIT: CREDIT };
});
