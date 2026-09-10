# Security audit — UC Davis Health 3D Walkable Campus

Method: `security-reviewer` agent pass over `serve.py`, `serve.sh`, the session
client, the CSP, every place data-derived text reaches a sink, and the OSM
ingest; findings fixed and re-verified. Date: 2026-09-09.

## Findings and fixes

| Severity | Finding | Fix |
|---|---|---|
| HIGH | `SimpleHTTPRequestHandler` listed directories and served dotfiles — a normal clone would hand `.git/` history to anyone | `send_head` 404s any dotfile path component; `list_directory` always 404s |
| MEDIUM | `sync`/`kick`/`leave` had no rate limit; unbounded request threads | Separate 40-per-5 s per-IP budget on those routes; a `BoundedSemaphore(256)` refuses connections at capacity |
| MEDIUM | Session and member tokens travel over plain HTTP | Documented as a deployment prerequisite: TLS termination in front of `serve.py` before serving beyond localhost; the server prints the reminder at start |
| MEDIUM | 200 idle sessions could be created cheaply from rotating IPs | Accepted for a LAN/internal deployment; revisit (global ceiling, shorter idle for empty sessions) if ever exposed publicly |
| LOW | Kick/ban is by client-held id and IP — clearing storage and changing network rejoins | Accepted tradeoff: no persistent identity system; the guide can remove again |
| LOW | OSM-sourced names are spoken/drawn unsanitised | Not an injection risk (canvas `fillText` and `SpeechSynthesisUtterance` are not HTML); content-integrity only |

## Verified sound

- No `innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write` in `3d/`;
  all server and data text lands via `textContent`.
- Names are stripped of Unicode control/format characters (bidi overrides) and
  capped at 24 characters; every synced field is whitelisted and clamped.
- Token comparison uses `secrets.compare_digest`; tokens are 128-bit; codes are
  6 symbols from a 30-symbol no-lookalike alphabet (7.3 × 10⁸) behind a
  10-per-minute per-IP limit — brute force is infeasible within a session's life.
- CSP is strict same-origin with no `unsafe-inline` or `unsafe-eval`;
  `frame-ancestors` (meta-incapable) is covered by `X-Frame-Options: DENY`,
  plus `nosniff` and a strict referrer policy on every response.
- Path traversal is handled by the stdlib's `translate_path` (verified against
  the installed 3.13 source). Body size is bounded, malformed JSON is a 400,
  handler exceptions are a generic 500 with no trace.
- `mapsUrl` hardcodes its hosts; the only user-influenced part is an
  `encodeURIComponent`-escaped query; the link carries `rel="noopener"`.
- No hardcoded secrets; no runtime dependency tree (Three.js is vendored).
