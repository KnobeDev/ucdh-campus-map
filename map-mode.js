// The 2D map's mode: local or site. A classic script, loaded before every other app script.
//
//   local  the owner's machine. The Tweaks panel and the map editor, edits kept in the
//          browser's storage, and the map drawn over the picture the owner edits against:
//          everything exactly as it always was.
//   site   the unofficial test build on hori.ble. No Tweaks panel and no editor, no message
//          to a host page, no floor-plan panel (it is drawn over the official floor diagram),
//          nothing read from or written to the browser's storage, and the campus drawn from data: every building, stop and path placed by the same file the
//          3D map reads (site-data.js, drawn-basemap.js), never by the picture.
//
// The mode comes from the SAME file the 3D map reads, 3d/app-config.json, through the SAME
// strict parser, 3d/app-config.js (loaded with import(), since this is a classic script), so
// the site's one file switches both maps. Nothing a visitor controls (a URL parameter, the
// browser's storage) is consulted. ANYTHING wrong (the file missing, malformed or refused, or
// the parser itself failing to load) means the site map: failing closed is the point.
//
// Until the mode is known, and in site mode, storage() is a store that lives and dies with
// the page, so nothing stored earlier (by this map, by the UC Davis campus map, which uses the
// same key names on the same origin, or by anyone) can change what the release shows, and
// nothing is left behind. app.jsx waits for `ready` before it loads any data or draws anything.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) { module.exports = api; return; } // node tests
  Object.defineProperty(root, "MapMode", { value: api.start(root), enumerable: true }); // not reassignable
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var PARSER = "3d/app-config.js?v=1";
  var DECIDE_WITHIN_MS = 10000; // a config that never arrives is a config that failed: the site map

  /** The 2D map's switches for a resolved app config. Anything but a local config is the site. */
  function modeFrom(config) {
    var local = !!config && config.mode === "local";
    return Object.freeze({
      name: local ? "local" : "site",
      site: !local,
      editor: local,        // the Tweaks panel, the map editor, the floor-plan editor, messages to a host page
      storedEdits: local,   // edits, backups, the dirty count and route pins in the browser's storage
      drawnBasemap: !local, // the campus drawn from data; local keeps the picture it edits against
      floorPlans: local,    // the floor-plan panel, drawn over the official floor diagram: never on the site
    });
  }
  var SITE = modeFrom(null);

  /** Import the parser and read the config. Never rejects, and never waits for ever: an
   *  import() or a request that hangs settles as the site map. @returns Promise<mode> */
  function resolveMode(opts) {
    var wait = opts.timeoutMs === undefined ? DECIDE_WITHIN_MS : opts.timeoutMs;
    var timer = null;
    var late = new Promise(function (resolve) {
      timer = setTimeout(function () {
        console.warn("[config] 3d/app-config.json took too long — the 2D map runs as the site build.");
        resolve(SITE);
      }, wait);
    });
    return Promise.race([readMode(opts), late]).then(function (mode) { clearTimeout(timer); return mode; });
  }

  function readMode(opts) {
    return Promise.resolve()
      .then(function () { return opts.importParser(new URL(PARSER, opts.baseUrl).href); })
      .then(function (mod) {
        if (!mod || typeof mod.loadAppConfig !== "function") throw new TypeError("3d/app-config.js has no loadAppConfig");
        // the parser's own default URL is ./app-config.json beside it: the 3D map's file
        return mod.loadAppConfig(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : undefined);
      })
      .then(modeFrom)
      .catch(function (err) {
        console.warn("[config] 3d/app-config.js didn't load — the 2D map runs as the site build:", (err && err.message) || err);
        return SITE;
      });
  }

  /** A Storage-shaped map that belongs to this page alone. */
  function memoryStorage() {
    var items = new Map();
    return {
      getItem: function (k) { k = String(k); return items.has(k) ? items.get(k) : null; },
      setItem: function (k, v) { items.set(String(k), String(v)); },
      removeItem: function (k) { items.delete(String(k)); },
      clear: function () { items.clear(); },
      key: function (i) { var keys = Array.from(items.keys()); return i < keys.length ? keys[i] : null; },
      get length() { return items.size; },
    };
  }

  /** Decide the mode for `win`. The returned state is what the rest of the app reads.
   *  @param opts.importParser  test hook: how to import the parser (default: import())
   *  @param opts.fetchImpl     test hook: how app-config.js fetches its file
   *  @param opts.timeoutMs     test hook: how long to wait for the config */
  function start(win, opts) {
    opts = opts || {};
    var memory = memoryStorage();
    var state = {
      current: null,   // the frozen mode, once known
      ready: null,     // Promise<mode>; never rejects
      /** Where edits and route pins are kept: the browser's storage in local mode only. Never
       *  throws: where the browser blocks storage, even local mode keeps them for this page alone. */
      storage: function () {
        if (!state.current || !state.current.storedEdits) return memory;
        try { return win.localStorage || memory; } catch (e) { return memory; }
      },
    };
    state.ready = resolveMode({
      importParser: opts.importParser || function (url) { return import(url); },
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
      baseUrl: win.document.baseURI,
    }).then(function (mode) {
      state.current = mode;
      Object.freeze(state); // decided once: nothing later on the page can swap the mode or the storage
      return mode;
    });
    return state;
  }

  return { modeFrom: modeFrom, resolveMode: resolveMode, start: start, PARSER: PARSER };
});
