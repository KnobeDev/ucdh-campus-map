// Shared by the browser tests: the worktree served on 127.0.0.1, and a page opened on it.
// Not a test itself (no ".test." in its name).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SITE_CONFIG = JSON.stringify({ mode: "site", sessions: false, admin: false, entitlementUrl: "/health-campus/api/entitlement" });
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".jsx": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
};

/**
 * The worktree on 127.0.0.1, no dotfiles.
 *   site         serve the site's app-config.json in place of the local one
 *   breakData    the site's data file answers 500
 *   entitlement  what /health-campus/api/entitlement answers: { fun: boolean } as JSON, or
 *                undefined for a 404 (no such address, as on a server with no members API)
 *   sessions     answer /api/health as the owner's session server does ({ multiplayer: true }),
 *                so the local build offers tours; every other /api path is still a 404
 * `asked` lists the paths requested; `posted` those requested with POST.
 */
function serve({ site, breakData = false, entitlement, sessions = false }) {
  const asked = [];
  const posted = [];
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    asked.push(rel);
    if (req.method === "POST") posted.push(rel);
    if (sessions && rel === "/api/health") { res.writeHead(200, { "Content-Type": TYPES[".json"] }).end('{"multiplayer":true}'); return; }
    if (rel.split("/").some((s) => s.startsWith("."))) { res.writeHead(404).end(); return; }
    if (site && rel === "/3d/app-config.json") { res.writeHead(200, { "Content-Type": TYPES[".json"] }).end(SITE_CONFIG); return; }
    if (breakData && rel === "/3d/campus-data.site.json") { res.writeHead(500).end("no"); return; }
    if (rel === "/health-campus/api/entitlement" && entitlement) {
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(JSON.stringify(entitlement));
      return;
    }
    fs.readFile(path.join(ROOT, rel), (err, body) => {
      if (err) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, asked, posted, base: `http://127.0.0.1:${server.address().port}` });
  }));
}

module.exports = { ROOT, SITE_CONFIG, serve };
