// Seeds the edit store with bundled default polygons / paths / entrances / crosswalks.
// Runs synchronously before edit-store.jsx via blocking XHR so localStorage is populated
// in time for the React render. User edits made later take precedence on subsequent loads.
(function () {
  var KEY = "ucd-campus-map-edits-v2";
  var DEFAULTS_KEY = "ucd-campus-map-defaults-version";
  var VERSION = "2026-05-08-construction"; // bump to force re-seed when default-edits.json changes
  // Versions in this set trigger a full reset of building/node/shuttle/entrance/crosswalk maps
  // because their coordinate system changed. User edits saved against the old coords are
  // discarded so the new defaults take effect.
  var FULL_RESET_VERSIONS = { "2026-05-08-svg-migration": true, "2026-05-08-construction": true };

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

  // Effective version is the embedded `_version` from the JSON if present, otherwise
  // the hardcoded VERSION constant. The Apply button stamps a fresh ISO timestamp into
  // every published default-edits.json, so any change to the file automatically forces
  // a reset on visitors with stale localStorage — no need to remember to bump the
  // constant in this loader by hand.
  var effectiveVersion = (defaults && defaults._version) || VERSION;
  var seenVersion = null;
  try { seenVersion = localStorage.getItem(DEFAULTS_KEY); } catch (e) {}
  // Force a full reset if either: this is one of the legacy hand-bumped FULL_RESET versions,
  // OR the published JSON's _version differs from the version this browser last saw.
  var isLegacyReset = FULL_RESET_VERSIONS[effectiveVersion] && seenVersion !== effectiveVersion;
  var isStaleAfterApply = !!(defaults && defaults._version) && seenVersion !== effectiveVersion;
  if (isLegacyReset || isStaleAfterApply) {
    ["buildings","nodes","addedNodes","addedEdges","removedEdges","edgeMeta","shuttle","entrances","crosswalks","pois","constructionZones"].forEach(function (k) {
      delete existing[k];
    });
  }

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
    constructionZones: mergeMaps(defaults.constructionZones || {}, existing.constructionZones || {}),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.setItem(DEFAULTS_KEY, effectiveVersion);
  } catch (e) {}
})();
