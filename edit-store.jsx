// Edit store — wraps base data with user overrides, persisted to localStorage.
// Lets the rest of the app keep reading window.BUILDINGS / window.GRAPH_NODES
// while edit mode mutates them through setEdits().

const EDIT_STORAGE_KEY = "ucd-campus-map-edits-v2";
const LEGACY_KEYS = ["ucd-campus-map-edits-v1"];

// Snapshot of base data as imported from data.jsx
const BASE_BUILDINGS  = window.BUILDINGS.map(b => ({ ...b }));
const BASE_NODES      = JSON.parse(JSON.stringify(window.GRAPH_NODES));
const BASE_EDGES      = window.GRAPH_EDGES.map(e => [...e]);
const BASE_SHUTTLE    = window.SHUTTLE_STOPS.map(s => ({ ...s }));

window.BASE_BUILDINGS = BASE_BUILDINGS;
window.BASE_NODES     = BASE_NODES;
window.BASE_EDGES     = BASE_EDGES;
window.BASE_SHUTTLE   = BASE_SHUTTLE;

// Edge types ----
const EDGE_TYPES = {
  walk: { label: "Walking path",  color: "#0E7C66", dash: "none",   width: 3 },
  car:  { label: "Car / drive",   color: "#5A6470", dash: "none",   width: 4 },
  both: { label: "Mixed",         color: "#022851", dash: "none",   width: 3 },
};
window.EDGE_TYPES = EDGE_TYPES;

// Edits shape (v2):
// {
//   buildings: { [code]: { x, y, w, h, label } },
//   nodes:     { [id]: { x, y, label } },
//   addedNodes:{ [id]: { x, y, label } },
//   addedEdges:[ [a,b], ... ],
//   removedEdges:[ [a,b], ... ],
//   edgeMeta:  { [edgeKey]: { type: "walk"|"car"|"both" } },   // type override per edge
//   shuttle:   { [id]: { x, y } },
//   entrances: { [id]: { id, building, x, y, accessible, label } },
//   crosswalks:{ [id]: { id, x, y, angle, label } },
// }
function readEdits() {
  try {
    let raw = localStorage.getItem(EDIT_STORAGE_KEY);
    // Migrate from legacy keys (e.g. v1) so prior building/waypoint edits don't disappear
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        const legacy = localStorage.getItem(k);
        if (legacy) {
          try {
            const merged = { ...defaultEdits(), ...JSON.parse(legacy) };
            localStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(merged));
            raw = JSON.stringify(merged);
            break;
          } catch {}
        }
      }
    }
    if (!raw) return defaultEdits();
    const parsed = JSON.parse(raw);
    return { ...defaultEdits(), ...parsed };
  } catch {
    return defaultEdits();
  }
}
function defaultEdits() {
  return {
    buildings:{}, nodes:{}, addedNodes:{},
    addedEdges:[], removedEdges:[], edgeMeta:{},
    shuttle:{},
    entrances:{}, crosswalks:{},
    pois:{},
  };
}
function writeEdits(e) {
  try { localStorage.setItem(EDIT_STORAGE_KEY, JSON.stringify(e)); } catch {}
}

function applyEdits(edits) {
  // Buildings
  window.BUILDINGS = BASE_BUILDINGS.map(b => {
    const o = edits.buildings[b.code];
    return o ? { ...b, ...o } : b;
  });
  // Nodes: base + overrides + added
  const merged = {};
  for (const [k, v] of Object.entries(BASE_NODES)) {
    const o = edits.nodes[k];
    merged[k] = o ? { ...v, ...o } : v;
  }
  for (const [k, v] of Object.entries(edits.addedNodes || {})) merged[k] = v;
  window.GRAPH_NODES = merged;
  // Edges (with type metadata attached as third array slot for downstream code, but stored separately)
  const removed = new Set(edits.removedEdges.map(e => edgeKey(e)));
  const baseEdges = BASE_EDGES.filter(e => !removed.has(edgeKey(e)));
  window.GRAPH_EDGES = [...baseEdges, ...edits.addedEdges];
  window.EDGE_META = { ...edits.edgeMeta };
  // Shuttle stops
  window.SHUTTLE_STOPS = BASE_SHUTTLE.map(s => {
    const o = edits.shuttle[s.id];
    return o ? { ...s, ...o } : s;
  });
  // Entrances + crosswalks + POIs (purely user-added)
  window.ENTRANCES  = Object.values(edits.entrances || {});
  window.CROSSWALKS = Object.values(edits.crosswalks || {});
  window.POIS       = Object.values(edits.pois || {});
}

function edgeKey(e) {
  const [a, b] = e;
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}
window.edgeKey = edgeKey;

// Hook so React components re-render when edits change
const editListeners = new Set();
function notifyEdits() { editListeners.forEach(cb => cb()); }

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 7);
}

const editStore = {
  get() { return readEdits(); },
  set(updater) {
    const cur = readEdits();
    const next = typeof updater === "function" ? updater(cur) : updater;
    writeEdits(next);
    applyEdits(next);
    notifyEdits();
  },
  subscribe(cb) { editListeners.add(cb); return () => editListeners.delete(cb); },
  reset() { writeEdits(defaultEdits()); applyEdits(defaultEdits()); notifyEdits(); },

  // ---- Buildings ----
  moveBuilding(code, partial) {
    this.set(e => ({ ...e, buildings: { ...e.buildings, [code]: { ...(e.buildings[code]||{}), ...partial } } }));
  },
  setBuildingLabel(code, label) {
    this.moveBuilding(code, { label });
  },
  // Convert a building from rect → polygon (4 corners derived from current x/y/w/h)
  convertToPolygon(code) {
    const b = window.BUILDINGS.find(x => x.code === code);
    if (!b) return;
    const pts = [
      [b.x, b.y], [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h], [b.x, b.y + b.h],
    ];
    this.moveBuilding(code, { points: pts });
  },
  // Convert polygon → rect (using bbox of current points)
  convertToRect(code) {
    const b = window.BUILDINGS.find(x => x.code === code);
    if (!b || !b.points) return;
    const xs = b.points.map(p => p[0]), ys = b.points.map(p => p[1]);
    const x = Math.round(Math.min(...xs)), y = Math.round(Math.min(...ys));
    const w = Math.round(Math.max(...xs) - x), h = Math.round(Math.max(...ys) - y);
    this.set(e => {
      const cur = e.buildings[code] || {};
      const next = { ...cur, x, y, w, h };
      delete next.points;
      return { ...e, buildings: { ...e.buildings, [code]: next } };
    });
  },
  setPolygonPoint(code, idx, x, y) {
    this.set(e => {
      const cur = e.buildings[code] || {};
      const base = window.BASE_BUILDINGS.find(x => x.code === code) || {};
      const points = (cur.points ? cur.points : (base.points || null) ||
        // synthesise from current rect
        (() => { const b = window.BUILDINGS.find(x => x.code === code);
          return [[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]]; })()
      ).map((p, i) => i === idx ? [Math.round(x), Math.round(y)] : [...p]);
      return { ...e, buildings: { ...e.buildings, [code]: { ...cur, points } } };
    });
  },
  insertPolygonPoint(code, afterIdx, x, y) {
    this.set(e => {
      const cur = e.buildings[code] || {};
      const points = (cur.points || []).slice();
      points.splice(afterIdx + 1, 0, [Math.round(x), Math.round(y)]);
      return { ...e, buildings: { ...e.buildings, [code]: { ...cur, points } } };
    });
  },
  deletePolygonPoint(code, idx) {
    this.set(e => {
      const cur = e.buildings[code] || {};
      if (!cur.points || cur.points.length <= 3) return e;
      const points = cur.points.filter((_, i) => i !== idx);
      return { ...e, buildings: { ...e.buildings, [code]: { ...cur, points } } };
    });
  },

  // ---- Waypoints ----
  moveNode(id, x, y) {
    this.set(e => {
      if (BASE_NODES[id]) {
        return { ...e, nodes: { ...e.nodes, [id]: { ...(e.nodes[id]||{}), x, y } } };
      } else {
        return { ...e, addedNodes: { ...e.addedNodes, [id]: { ...(e.addedNodes[id]||{}), x, y } } };
      }
    });
  },
  setNodeLabel(id, label) {
    this.set(e => {
      if (BASE_NODES[id]) {
        return { ...e, nodes: { ...e.nodes, [id]: { ...(e.nodes[id]||{}), label } } };
      } else if (e.addedNodes[id]) {
        return { ...e, addedNodes: { ...e.addedNodes, [id]: { ...e.addedNodes[id], label } } };
      }
      return e;
    });
  },
  addNode(id, x, y, label) {
    this.set(e => ({ ...e, addedNodes: { ...e.addedNodes, [id]: { x, y, label: label || "" } } }));
  },
  deleteAddedNode(id) {
    this.set(e => {
      if (!e.addedNodes[id]) return e;
      const nn = { ...e.addedNodes }; delete nn[id];
      const ae = e.addedEdges.filter(([a,b]) => a !== id && b !== id);
      // also clean edge meta touching this node
      const em = { ...e.edgeMeta };
      for (const k of Object.keys(em)) {
        const [aa, bb] = k.split("__");
        if (aa === id || bb === id) delete em[k];
      }
      return { ...e, addedNodes: nn, addedEdges: ae, edgeMeta: em };
    });
  },

  // ---- Edges ----
  toggleEdge(a, b, type) {
    if (a === b) return;
    this.set(e => {
      const k = edgeKey([a,b]);
      // If it's an added edge, remove it
      if (e.addedEdges.some(ed => edgeKey(ed) === k)) {
        const em = { ...e.edgeMeta }; delete em[k];
        return { ...e, addedEdges: e.addedEdges.filter(ed => edgeKey(ed) !== k), edgeMeta: em };
      }
      // If it's in base edges
      const inBase = BASE_EDGES.some(ed => edgeKey(ed) === k);
      if (inBase) {
        const isRemoved = e.removedEdges.some(ed => edgeKey(ed) === k);
        if (isRemoved) {
          return { ...e, removedEdges: e.removedEdges.filter(ed => edgeKey(ed) !== k) };
        }
        return { ...e, removedEdges: [...e.removedEdges, [a,b]] };
      }
      // Otherwise add new
      const em = type ? { ...e.edgeMeta, [k]: { type } } : e.edgeMeta;
      return { ...e, addedEdges: [...e.addedEdges, [a,b]], edgeMeta: em };
    });
  },
  setEdgeType(a, b, type) {
    this.set(e => {
      const k = edgeKey([a,b]);
      return { ...e, edgeMeta: { ...e.edgeMeta, [k]: { ...(e.edgeMeta[k]||{}), type } } };
    });
  },

  // ---- Entrances ----
  addEntrance(x, y, opts = {}) {
    const id = uid("ent");
    this.set(e => ({ ...e, entrances: { ...e.entrances,
      [id]: { id, x, y, accessible: !!opts.accessible, building: opts.building || "", label: opts.label || "" }
    }}));
    return id;
  },
  updateEntrance(id, partial) {
    this.set(e => {
      if (!e.entrances[id]) return e;
      return { ...e, entrances: { ...e.entrances, [id]: { ...e.entrances[id], ...partial } } };
    });
  },
  deleteEntrance(id) {
    this.set(e => {
      const ee = { ...e.entrances }; delete ee[id];
      return { ...e, entrances: ee };
    });
  },

  // ---- Crosswalks ----
  addCrosswalk(x, y, opts = {}) {
    const id = uid("xw");
    this.set(e => ({ ...e, crosswalks: { ...e.crosswalks,
      [id]: { id, x, y, angle: opts.angle ?? 0, label: opts.label || "" }
    }}));
    return id;
  },
  updateCrosswalk(id, partial) {
    this.set(e => {
      if (!e.crosswalks[id]) return e;
      return { ...e, crosswalks: { ...e.crosswalks, [id]: { ...e.crosswalks[id], ...partial } } };
    });
  },
  deleteCrosswalk(id) {
    this.set(e => {
      const cc = { ...e.crosswalks }; delete cc[id];
      return { ...e, crosswalks: cc };
    });
  },

  // ---- Points of Interest ----
  // POI shape: { id, x, y, name, instructions, events: [{title,when,note}], mapsLink }
  addPOI(x, y, opts = {}) {
    const id = uid("poi");
    this.set(e => ({ ...e, pois: { ...(e.pois || {}),
      [id]: {
        id, x, y,
        name: opts.name || "New point of interest",
        instructions: opts.instructions || "",
        events: opts.events || [],
        mapsLink: opts.mapsLink || "",
      }
    }}));
    return id;
  },
  updatePOI(id, partial) {
    this.set(e => {
      const cur = (e.pois || {})[id];
      if (!cur) return e;
      return { ...e, pois: { ...e.pois, [id]: { ...cur, ...partial } } };
    });
  },
  deletePOI(id) {
    this.set(e => {
      const pp = { ...(e.pois || {}) }; delete pp[id];
      return { ...e, pois: pp };
    });
  },

  exportJSON() {
    return JSON.stringify(readEdits(), null, 2);
  },
  importJSON(text) {
    // Accepts either the raw edits shape OR the "full data" shape (BUILDINGS/etc)
    const parsed = JSON.parse(text);
    if (parsed.buildings || parsed.addedNodes || parsed.entrances || parsed.crosswalks) {
      // Edits shape — merge with defaults & save
      const merged = { ...defaultEdits(), ...parsed };
      writeEdits(merged); applyEdits(merged); notifyEdits();
      return;
    }
    if (parsed.BUILDINGS || parsed.GRAPH_NODES) {
      // Full snapshot — derive a minimal edits shape by diffing against base
      const next = defaultEdits();
      // Buildings: store overrides for any field that differs
      if (Array.isArray(parsed.BUILDINGS)) {
        for (const b of parsed.BUILDINGS) {
          const base = BASE_BUILDINGS.find(x => x.code === b.code);
          if (!base) continue;
          const diff = {};
          for (const k of ["x","y","w","h","label","points"]) {
            if (k in b && JSON.stringify(b[k]) !== JSON.stringify(base[k])) diff[k] = b[k];
          }
          if (Object.keys(diff).length) next.buildings[b.code] = diff;
        }
      }
      // Nodes
      if (parsed.GRAPH_NODES) {
        for (const [id, n] of Object.entries(parsed.GRAPH_NODES)) {
          if (BASE_NODES[id]) {
            const base = BASE_NODES[id];
            if (n.x !== base.x || n.y !== base.y || (n.label && n.label !== base.label)) {
              next.nodes[id] = { ...n };
            }
          } else {
            next.addedNodes[id] = { ...n };
          }
        }
      }
      // Edges
      if (Array.isArray(parsed.GRAPH_EDGES)) {
        const baseSet = new Set(BASE_EDGES.map(e => edgeKey(e)));
        const newSet = new Set(parsed.GRAPH_EDGES.map(e => edgeKey(e)));
        for (const e of parsed.GRAPH_EDGES) {
          if (!baseSet.has(edgeKey(e))) next.addedEdges.push([e[0], e[1]]);
        }
        for (const e of BASE_EDGES) {
          if (!newSet.has(edgeKey(e))) next.removedEdges.push([e[0], e[1]]);
        }
      }
      if (parsed.EDGE_META) next.edgeMeta = { ...parsed.EDGE_META };
      // Shuttle
      if (Array.isArray(parsed.SHUTTLE_STOPS)) {
        for (const s of parsed.SHUTTLE_STOPS) {
          const base = BASE_SHUTTLE.find(x => x.id === s.id);
          if (base && (s.x !== base.x || s.y !== base.y)) next.shuttle[s.id] = { x: s.x, y: s.y };
        }
      }
      // Entrances + crosswalks
      if (Array.isArray(parsed.ENTRANCES)) {
        for (const en of parsed.ENTRANCES) next.entrances[en.id] = { ...en };
      }
      if (Array.isArray(parsed.CROSSWALKS)) {
        for (const xw of parsed.CROSSWALKS) next.crosswalks[xw.id] = { ...xw };
      }
      writeEdits(next); applyEdits(next); notifyEdits();
      return;
    }
    throw new Error("Unrecognised JSON shape — expected an exported edits or full-data snapshot.");
  },
  exportFullData() {
    const out = {
      BUILDINGS: window.BUILDINGS.map(b => ({ ...b })),
      GRAPH_NODES: { ...window.GRAPH_NODES },
      GRAPH_EDGES: window.GRAPH_EDGES.map(e => [...e]),
      EDGE_META: { ...window.EDGE_META },
      SHUTTLE_STOPS: window.SHUTTLE_STOPS.map(s => ({ ...s })),
      ENTRANCES: window.ENTRANCES.map(x => ({ ...x })),
      CROSSWALKS: window.CROSSWALKS.map(x => ({ ...x })),
    };
    return JSON.stringify(out, null, 2);
  },
};

// Initialise from storage
applyEdits(readEdits());

window.editStore = editStore;

// React hook: re-render on edit changes
function useEdits() {
  const [, force] = React.useState(0);
  React.useEffect(() => editStore.subscribe(() => force(x => x+1)), []);
  return editStore.get();
}
window.useEdits = useEdits;
