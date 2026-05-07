// Seeds the edit store with bundled default polygons / paths / entrances / crosswalks.
// Runs synchronously before edit-store.jsx via blocking XHR so localStorage is populated
// in time for the React render. User edits made later take precedence on subsequent loads.
(function () {
  var KEY = "ucd-campus-map-edits-v2";
  var DEFAULTS_KEY = "ucd-campus-map-defaults-version";
  var VERSION = "2026-05-06-1"; // bump to force re-seed when default-edits.json changes

  function fetchDefaultsSync() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "default-edits.json", false); // sync
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

  var alreadySeeded = localStorage.getItem(DEFAULTS_KEY) === VERSION;

  // If already seeded once, only fill in missing keys (user edits take precedence).
  // If not yet seeded, force defaults to apply (overwriting any prior edits to those buildings).
  var merged = {
    buildings:   alreadySeeded
                  ? mergeMaps(defaults.buildings || {}, existing.buildings || {})
                  : mergeMaps(existing.buildings || {}, defaults.buildings || {}),
    nodes:       alreadySeeded
                  ? mergeMaps(defaults.nodes || {}, existing.nodes || {})
                  : mergeMaps(existing.nodes || {}, defaults.nodes || {}),
    addedNodes:  mergeMaps(defaults.addedNodes || {}, existing.addedNodes || {}),
    addedEdges:  mergeArrays(defaults.addedEdges, existing.addedEdges),
    removedEdges:mergeArrays(defaults.removedEdges, existing.removedEdges),
    edgeMeta:    alreadySeeded
                  ? mergeMaps(defaults.edgeMeta || {}, existing.edgeMeta || {})
                  : mergeMaps(existing.edgeMeta || {}, defaults.edgeMeta || {}),
    shuttle:     mergeMaps(defaults.shuttle || {}, existing.shuttle || {}),
    entrances:   alreadySeeded
                  ? mergeMaps(defaults.entrances || {}, existing.entrances || {})
                  : mergeMaps(existing.entrances || {}, defaults.entrances || {}),
    crosswalks:  alreadySeeded
                  ? mergeMaps(defaults.crosswalks || {}, existing.crosswalks || {})
                  : mergeMaps(existing.crosswalks || {}, defaults.crosswalks || {}),
    pois:        alreadySeeded
                  ? mergeMaps(defaults.pois || {}, existing.pois || {})
                  : mergeMaps(existing.pois || {}, defaults.pois || {}),
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
    localStorage.setItem(DEFAULTS_KEY, VERSION);
  } catch (e) {}
})();
