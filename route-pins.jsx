// Route pin store — persists user-customised route waypoints, keyed by from→to pair.
// A "pin" is an arbitrary {x,y} that the routing engine threads Dijkstra through.

const ROUTE_PINS_KEY = "ucd-campus-map-route-pins-v1";

function readAll() {
  try {
    const raw = localStorage.getItem(ROUTE_PINS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeAll(data) {
  try { localStorage.setItem(ROUTE_PINS_KEY, JSON.stringify(data)); } catch {}
}
function pairKey(fromId, toId) { return `${fromId}__${toId}`; }

const listeners = new Set();
function notify() { listeners.forEach(cb => cb()); }

const routePinStore = {
  get(fromId, toId) {
    if (!fromId || !toId) return [];
    return readAll()[pairKey(fromId, toId)] || [];
  },
  set(fromId, toId, pins) {
    const all = readAll();
    if (!pins || pins.length === 0) delete all[pairKey(fromId, toId)];
    else all[pairKey(fromId, toId)] = pins.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    writeAll(all);
    notify();
  },
  add(fromId, toId, x, y, insertAt) {
    const cur = this.get(fromId, toId).slice();
    const idx = (insertAt == null) ? cur.length : insertAt;
    cur.splice(idx, 0, { x: Math.round(x), y: Math.round(y) });
    this.set(fromId, toId, cur);
    return idx;
  },
  move(fromId, toId, idx, x, y) {
    const cur = this.get(fromId, toId).slice();
    if (!cur[idx]) return;
    cur[idx] = { x: Math.round(x), y: Math.round(y) };
    this.set(fromId, toId, cur);
  },
  remove(fromId, toId, idx) {
    const cur = this.get(fromId, toId).slice();
    cur.splice(idx, 1);
    this.set(fromId, toId, cur);
  },
  clear(fromId, toId) { this.set(fromId, toId, []); },

  exportAll() { return readAll(); },
  importAll(obj) { writeAll(obj || {}); notify(); },
  resetAll() { writeAll({}); notify(); },

  subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
};

window.routePinStore = routePinStore;

// React hook so components re-render when pins change
window.useRoutePins = function useRoutePins(fromId, toId) {
  const [, force] = React.useState(0);
  React.useEffect(() => routePinStore.subscribe(() => force(x => x + 1)), []);
  return routePinStore.get(fromId, toId);
};
