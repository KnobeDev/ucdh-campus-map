// Seeds the edit store with bundled default polygons / paths / entrances / crosswalks.
// Runs synchronously before edit-store.jsx via blocking XHR so localStorage is populated
// in time for the React render. User edits made later take precedence on subsequent loads.
(function () {
  var KEY = "ucd-campus-map-edits-v2";
  var DEFAULTS_KEY = "ucd-campus-map-defaults-version";
  var VERSION = "2026-05-06-2"; // bump to force re-seed when default-edits.json changes

  // One-time cleanup of leftover test data that shipped in earlier defaults.
  // Removed when found, regardless of version — runs before merge.
  var PURGE = {
    crosswalks: ["xw_c3p0i"], // landed on Research 3
  };

  function fetchDefaultsSync() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "default-edits.json?v=" + VERSION, false); // sync; bust cache when version bumps
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) return JSON.parse(xhr.responseText);
    } catch (e) { console.warn("default-edits load failed", e); }
    return null;
  }

  function mergeMaps(defaults, existing) {
    var out = {};
    for (var k in defaults) out[k] = defaults[k];
    for (var k in existing) out[k] = existing[k]; // user edits win
    return out;
  }

  function mergeArrays(a, b) {
    var seen = {};
    var out = [];
    (a || []).concat(b || []).forEach(function (e) {
      var key = JSON.stringify(e);
      if (!seen[key]) { seen[key] = 1; out.push(e); }
    });
    return out;
  }

  var defaults = fetchDefaultsSync();
  if (!defaults) return;

  var existing = {};
  try { existing = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}

  // Apply one-time purges to existing data
  Object.keys(PURGE).forEach(function (key) {
    if (!existing[key]) return;
    PURGE[key].forEach(function (id) { delete existing[key][id]; });
  });

  // mergeMaps(defaults, existing) → existing always wins.
  // This means: defaults are only applied when the user has no entry for that key,
  // so the first visit gets the bundled polygons/etc., and all subsequent edits stick.
  // Version-driven cleanup is handled by the PURGE list above.
  var merged = {
    buildings:   mergeMaps(defaults.buildings || {}, existing.buildings || {}),
    nodes:       mergeMaps(defaults.nodes || {}, existing.nodes || {}),
    addedNodes:  mergeMaps(defaults.addedNodes || {}, existing.addedNodes || {}),
    addedEdges:  mergeArrays(defaults.addedEdges, existing.addedEdges),
    removedEdges:mergeArrays(defaults.removedEdges, existing.removedEdges),
    edgeMeta:    mergeMaps(defaults.edgeMeta || {}, existing.edgeMeta || {}),
    shuttle:     mergeMaps(defaults.shuttle || {}, existing.shuttle || {}),
    entrances:   mergeMaps(defaults.entrances || {}, existing.entrances || {}),
    crosswalks:  mergeMaps(defaults.crosswalks || {}, existing.crosswalks || {}),
    pois:        mergeMaps(defaults.pois || {}, existing.pois || {}),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.setItem(DEFAULTS_KEY, VERSION);
  } catch (e) {}
})();
