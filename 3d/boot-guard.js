// Classic (non-module) script: surfaces module-load failures that would otherwise
// leave the page stuck on "Loading…" forever with the only clue buried in devtools.
//
// Only the app's own failure counts: its module script (main.js, with everything it imports)
// failing to load, or an error thrown by one of the release's own files. Cloudflare Web
// Analytics adds its beacon to every page on the preview as <script type="module"
// src="https://static.cloudflareinsights.com/…">, the campus's CSP blocks it, and this guard
// wrote "failed to start: Failed to load https://static.cloudflareinsights…" over a map that
// opened (2026-11-17). So a module script counts only when its src is under the release's own
// folder, and a thrown error only when its file is; a browser extension's or another origin's
// error, a picture or a stylesheet stays in the console. tools/test/boot-guard.test.js.
(function () {
  function loadingEl() { return document.getElementById("loading"); }

  // The release's folder: the page is <release>/3d/index.html, so a file under <release>/ is
  // the campus's own. On the developer's machine that is the server root.
  var RELEASE = String(location.href || "").replace(/[#?].*$/, "").replace(/[^\/]*$/, "").replace(/[^\/]*\/$/, "");
  function isOwn(url) { return typeof url === "string" && url !== "" && url.indexOf(RELEASE) === 0; }

  window.addEventListener("error", function (e) {
    var el = loadingEl();
    if (!el || el.hidden) return; // app already booted; runtime errors go to console
    var target = e.target;
    if (target && target.nodeType === 1) {
      // A resource: only the release's own module script means the app can't run.
      if (target.tagName !== "SCRIPT" || target.type !== "module" || !isOwn(target.src)) return;
    } else if (!isOwn(e.filename)) {
      return; // an extension's or another origin's error: the campus is still coming
    }
    var msg = e.message || (target && target.src ? "Failed to load " + target.src : "Unknown error");
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
