// Classic (non-module) script: surfaces module-load failures that would otherwise
// leave the page stuck on "Loading…" forever with the only clue buried in devtools.
(function () {
  function loadingEl() { return document.getElementById("loading"); }
  window.addEventListener("error", function (e) {
    var el = loadingEl();
    if (!el || el.hidden) return; // app already booted; runtime errors go to console
    var msg = e.message || (e.target && e.target.src ? "Failed to load " + e.target.src : "Unknown error");
    el.textContent = "The 3D campus failed to start: " + msg +
      " — try a hard refresh (Ctrl+Shift+R).";
  }, true);
  setTimeout(function () {
    var el = loadingEl();
    if (el && !el.hidden && !window.__ucd3d) {
      el.textContent = "Still loading after 20s — this usually means a cached broken file. " +
        "Hard-refresh the page (Ctrl+Shift+R).";
    }
  }, 20000);
})();
