// Loads everything the 2D app knows, with default-edits.json applied, in px space.
//
// data.jsx is pure data assigned onto `window` — no JSX, no React — so it runs
// safely in a vm sandbox. That keeps ONE source of truth: the 3D build can never
// drift from what the 2D map shows, because it reads the same two files.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");

function loadDataJsx() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data.jsx"), "utf8"), ctx, {
    filename: "data.jsx",
  });
  if (!Array.isArray(ctx.window.BUILDINGS)) {
    throw new Error("data.jsx did not define window.BUILDINGS — has its shape changed?");
  }
  return ctx.window;
}

const loadEdits = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "default-edits.json"), "utf8"));

/** Rect fallback for buildings that were never polygonised in the editor. */
const rectPoints = (b) => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
];

/**
 * Base buildings with overrides applied, plus editor-added ones, minus deletions.
 * Mirrors the merge order the browser's edit-store performs at runtime.
 */
function mergeBuildings(base, edits) {
  const overrides = edits.buildings || {};
  const out = [];
  for (const b of base) {
    const ov = overrides[b.code];
    if (ov && ov._deleted) continue;
    out.push(ov ? { ...b, ...ov } : { ...b });
  }
  for (const [code, added] of Object.entries(edits.addedBuildings || {})) {
    if (added._deleted) continue;
    out.push({ ...added, code });
  }
  return out.map((b) => ({ ...b, pxPoints: b.points && b.points.length >= 3 ? b.points : rectPoints(b) }));
}

/** Base records keyed by id, with per-id overrides and tombstones applied, plus additions. */
function mergeKeyed(baseList, overrides = {}, added = {}) {
  const out = [];
  for (const item of baseList) {
    const ov = overrides[item.id];
    if (ov && ov._deleted) continue;
    out.push(ov ? { ...item, ...ov } : { ...item });
  }
  for (const [id, item] of Object.entries(added)) {
    if (item._deleted) continue;
    out.push({ ...item, id });
  }
  return out;
}

function mergeGraph(win, edits) {
  const nodes = {};
  for (const [id, n] of Object.entries(win.GRAPH_NODES)) {
    const ov = (edits.nodes || {})[id];
    if (ov && ov._deleted) continue;
    nodes[id] = ov ? { ...n, ...ov } : { ...n };
  }
  for (const [id, n] of Object.entries(edits.addedNodes || {})) {
    if (n._deleted) continue;
    nodes[id] = { ...n };
  }

  const key = (a, b) => [a, b].sort().join("__");
  const removed = new Set((edits.removedEdges || []).map(([a, b]) => key(a, b)));
  const edges = [];
  const seen = new Set();
  for (const [a, b] of [...win.GRAPH_EDGES, ...(edits.addedEdges || [])]) {
    const k = key(a, b);
    if (removed.has(k) || seen.has(k)) continue;
    if (!nodes[a] || !nodes[b]) continue; // an endpoint was deleted
    seen.add(k);
    const meta = (edits.edgeMeta || {})[k] || {};
    edges.push({ a, b, ...meta });
  }
  return { nodes, edges };
}

function loadCurated() {
  const win = loadDataJsx();
  const edits = loadEdits();
  return {
    win,
    edits,
    version: edits._version,
    mapPx: win.MAP_IMG,
    buildings: mergeBuildings(win.BUILDINGS, edits),
    graph: mergeGraph(win, edits),
    shuttle: mergeKeyed(win.SHUTTLE_STOPS, edits.shuttle, edits.addedShuttle),
    busStops: mergeKeyed(win.BUS_STOPS, edits.busStops, edits.addedBusStops),
    pois: Object.values(edits.pois || {}).filter((p) => !p._deleted),
    entrances: Object.values(edits.entrances || {}).filter((e) => !e._deleted),
    crosswalks: Object.values(edits.crosswalks || {}).filter((c) => !c._deleted),
    constructionZones: Object.values(edits.constructionZones || {}).filter((z) => !z._deleted),
    floorplans: edits.floorplan || {},
    departments: win.DEPARTMENTS,
    categories: win.CATEGORIES,
    parkingTypes: win.PARKING_TYPES,
    poiTypes: win.POI_TYPES,
    buildingEntry: win.BUILDING_ENTRY,
  };
}

module.exports = { loadCurated, rectPoints };
