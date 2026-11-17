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

/** The worktree on 127.0.0.1, no dotfiles; `site` serves the site's app-config.json in place of the local one. */
function serve({ site, breakData = false }) {
  const asked = [];
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    asked.push(rel);
    if (rel.split("/").some((s) => s.startsWith("."))) { res.writeHead(404).end(); return; }
    if (site && rel === "/3d/app-config.json") { res.writeHead(200, { "Content-Type": TYPES[".json"] }).end(SITE_CONFIG); return; }
    if (breakData && rel === "/3d/campus-data.json") { res.writeHead(500).end("no"); return; }
    fs.readFile(path.join(ROOT, rel), (err, body) => {
      if (err) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(rel)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, asked, base: `http://127.0.0.1:${server.address().port}` });
  }));
}

module.exports = { ROOT, SITE_CONFIG, serve };
