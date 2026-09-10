#!/usr/bin/env python3
"""Campus-map server: static files + the live-session API for the 3D map.

Standard library only. Replaces the bare `python3 -m http.server` so guided tours
and events can share one live map session (ported from the Davis campus build):

  POST /api/session/create  {kind:"tour"|"event", name}          -> {code,id,token,kind}
  POST /api/session/join    {code, name}                         -> {id,token,kind,code}
  POST /api/session/sync    {code,id,token,state}                -> {peers,events,you,...}
  POST /api/session/kick    {code,id,token,targetId}  guide only -> {ok}
  POST /api/session/leave   {code,id,token}                      -> {ok}
  GET  /api/health                                               -> {ok:true, multiplayer:true}

Everything lives in memory; restart = fresh lobby. Clients poll `sync` (~4/s) with
their avatar state (position in ENU metres, yaw, and which Medical Center floor
they are on, if any) and receive everyone else's plus queued join/leave/kick events.
The guide is never reaped: if their tab dies the session survives GUIDE_GRACE
seconds (a refresh resumes seamlessly), then ends for everyone.
"""
import json
import os
import re
import secrets
import sys
import threading
import time
import unicodedata
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# no 0/O 1/I/L lookalikes — codes are read aloud across a room
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
CODE_LEN = 6
CODE_RE = re.compile(r"^[A-Z2-9]{%d}$" % CODE_LEN)
FLOOR_RE = re.compile(r"^[A-Z0-9]{1,3}$")

MAX_SESSIONS = 200
MAX_MEMBERS = 64
MEMBER_TIMEOUT = 15.0
GUIDE_GRACE = 60.0
SESSION_IDLE_MAX = 6 * 3600
NAME_MAX = 24
BODY_MAX = 4096
EVENT_QUEUE_MAX = 32
WORLD_MAX = 5000.0        # ENU metres either side of the campus centre
RATE_LIMIT = 10           # create/join attempts per IP per RATE_WINDOW
RATE_WINDOW = 60.0
SYNC_LIMIT = 40           # sync/kick/leave per IP per SYNC_WINDOW (~4 Hz polling is 20)
SYNC_WINDOW = 5.0
MAX_THREADS = 256         # concurrent request threads before new connections are refused
USED_CODES_MAX = 100_000
TETHER_M = 61.0           # 200 ft: members stay this close to the guide

_sessions = {}
_used_codes = set()
_rate = {}
_lock = threading.Lock()


def _now():
    return time.monotonic()


_sync_rate = {}


def _rate_limited(ip, table=None, limit=RATE_LIMIT, window=RATE_WINDOW):
    """True if this IP has burned its budget for the given table. Call under _lock."""
    table = _rate if table is None else table
    t = _now()
    q = table.setdefault(ip, deque())
    while q and t - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(t)
    if len(table) > 4096:
        for k in [k for k, v in table.items() if not v or t - v[-1] > window][:2048]:
            table.pop(k, None)
    return False


def _sync_limited(ip):
    return _rate_limited(ip, _sync_rate, SYNC_LIMIT, SYNC_WINDOW)


def _clean_name(raw):
    txt = "".join(c for c in str(raw or "") if unicodedata.category(c) not in ("Cc", "Cf"))
    return re.sub(r"\s+", " ", txt).strip()[:NAME_MAX]


def _clamp(v, lo, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    if v != v:
        return 0.0
    return max(lo, min(hi, v))


def _clean_state(raw):
    """Whitelist + clamp what a client reports. Never trust the wire."""
    if not isinstance(raw, dict):
        raw = {}
    floor = raw.get("floor")
    floor = floor.upper() if isinstance(floor, str) and FLOOR_RE.match(floor.upper()) else None
    return {
        "x": _clamp(raw.get("x"), -WORLD_MAX, WORLD_MAX),
        "y": _clamp(raw.get("y"), -20.0, 2000.0),
        "z": _clamp(raw.get("z"), -WORLD_MAX, WORLD_MAX),
        "yaw": _clamp(raw.get("yaw"), -1000.0, 1000.0),
        "moving": bool(raw.get("moving")),
        "floor": floor,
    }


def _clean_world(raw):
    """The guide's shared world: only the theme. Sound is always personal."""
    if not isinstance(raw, dict):
        return None
    return {"theme": raw.get("theme") if raw.get("theme") in ("light", "dark") else None}


def _tether_member(session, member):
    guide = session["members"].get(session["guide_id"])
    if not guide:
        return
    gs, ms = guide["state"], member["state"]
    if not guide.get("synced"):
        return  # no real position from the guide yet
    if gs["floor"] != ms["floor"]:
        return  # different floors: the leash can't apply in the plane
    dx, dz = ms["x"] - gs["x"], ms["z"] - gs["z"]
    d = (dx * dx + dz * dz) ** 0.5
    if d > TETHER_M:
        k = TETHER_M / d
        ms["x"] = gs["x"] + dx * k
        ms["z"] = gs["z"] + dz * k


def _push_event(session, event, exclude_id=None):
    for mid, m in session["members"].items():
        if mid == exclude_id:
            continue
        q = m["events"]
        q.append(event)
        del q[:-EVENT_QUEUE_MAX]


def _reap(session):
    t = _now()
    stale = [mid for mid, m in session["members"].items()
             if mid != session["guide_id"] and t - m["last_seen"] > MEMBER_TIMEOUT]
    for mid in stale:
        gone = session["members"].pop(mid)
        _push_event(session, {"t": "leave", "name": gone["name"]})


def _session_over(session):
    guide = session["members"].get(session["guide_id"])
    if guide is None or _now() - guide["last_seen"] > GUIDE_GRACE:
        return True
    return _now() - session["last_activity"] > SESSION_IDLE_MAX


def _reap_sessions():
    for code in [c for c, s in _sessions.items() if _session_over(s)]:
        del _sessions[code]


def _new_code():
    if len(_used_codes) > USED_CODES_MAX:
        _used_codes.clear()
    for _ in range(64):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        if code not in _sessions and code not in _used_codes:
            _used_codes.add(code)
            return code
    return None


def _auth(session, body):
    mid = body.get("id")
    member = session["members"].get(mid) if isinstance(mid, str) else None
    if member is None:
        return None
    token = body.get("token")
    if not isinstance(token, str) or not secrets.compare_digest(member["token"], token):
        return None
    return member


def _member(name, role, token, ip):
    return {"name": name, "role": role, "token": token, "ip": ip,
            "state": _clean_state(None), "last_seen": _now(), "events": []}


def api_create(body, ip):
    kind = body.get("kind")
    if kind not in ("tour", "event"):
        return 400, {"error": "bad-kind"}
    name = _clean_name(body.get("name"))
    if not name:
        return 400, {"error": "name-required"}
    with _lock:
        if _rate_limited(ip):
            return 429, {"error": "slow-down"}
        _reap_sessions()
        if len(_sessions) >= MAX_SESSIONS:
            return 503, {"error": "server-full"}
        code = _new_code()
        if code is None:
            return 503, {"error": "server-full"}
        guide_id = "u" + secrets.token_hex(8)
        token = secrets.token_hex(16)
        _sessions[code] = {
            "kind": kind, "code": code, "created": _now(), "last_activity": _now(),
            "guide_id": guide_id, "members": {guide_id: _member(name, "guide", token, ip)},
            "kicked": set(), "kicked_ips": set(), "world": None,
        }
    return 200, {"ok": True, "code": code, "id": guide_id, "token": token, "kind": kind}


def api_join(body, ip):
    code = str(body.get("code") or "").strip().upper()
    if not CODE_RE.match(code):
        return 400, {"error": "bad-code"}
    name = _clean_name(body.get("name"))
    if not name:
        return 400, {"error": "name-required"}
    with _lock:
        if _rate_limited(ip):
            return 429, {"error": "slow-down"}
        _reap_sessions()
        session = _sessions.get(code)
        if session is None:
            return 404, {"error": "not-found"}
        member = _auth(session, body)
        if member is not None:  # a page refresh resumes as-is
            member["last_seen"] = _now()
            member["ip"] = ip
            return 200, {"ok": True, "code": code, "id": body["id"], "token": member["token"],
                         "kind": session["kind"], "role": member["role"]}
        prior_id = body.get("id")
        if (isinstance(prior_id, str) and prior_id in session["kicked"]) or ip in session["kicked_ips"]:
            return 403, {"error": "kicked"}
        _reap(session)
        if len(session["members"]) >= MAX_MEMBERS:
            return 403, {"error": "full"}
        mid = "u" + secrets.token_hex(8)
        token = secrets.token_hex(16)
        session["members"][mid] = _member(name, "member", token, ip)
        session["last_activity"] = _now()
        _push_event(session, {"t": "join", "name": name}, exclude_id=mid)
    return 200, {"ok": True, "code": code, "id": mid, "token": token, "kind": session["kind"], "role": "member"}


def api_sync(body, ip):
    code = str(body.get("code") or "").strip().upper()
    with _lock:
        if _sync_limited(ip):
            return 429, {"error": "slow-down"}
        session = _sessions.get(code)
        if session is None:
            return 200, {"error": "ended"}
        if _session_over(session):
            del _sessions[code]
            return 200, {"error": "ended"}
        mid = body.get("id")
        if isinstance(mid, str) and mid in session["kicked"]:
            return 200, {"error": "kicked"}
        member = _auth(session, body)
        if member is None:
            return 200, {"error": "not-found"}
        member["state"] = _clean_state(body.get("state"))
        member["synced"] = True
        member["last_seen"] = _now()
        session["last_activity"] = _now()
        if mid != session["guide_id"]:
            _tether_member(session, member)
        else:
            world = _clean_world(body.get("world"))
            if world is not None:
                session["world"] = world
        _reap(session)
        t = _now()
        guide = session["members"].get(session["guide_id"])
        peers = [{"id": pid, "name": p["name"], "role": p["role"], "state": p["state"],
                  "away": (t - p["last_seen"]) > MEMBER_TIMEOUT}
                 for pid, p in session["members"].items() if pid != mid]
        events, member["events"] = member["events"], []
        return 200, {"ok": True, "kind": session["kind"], "code": code,
                     "you": {"role": member["role"], "name": member["name"]},
                     "guideAway": bool(guide and (t - guide["last_seen"]) > MEMBER_TIMEOUT),
                     "peers": peers, "events": events, "world": session.get("world")}


def api_kick(body, ip):
    code = str(body.get("code") or "").strip().upper()
    with _lock:
        if _sync_limited(ip):
            return 429, {"error": "slow-down"}
        session = _sessions.get(code)
        if session is None:
            return 404, {"error": "not-found"}
        member = _auth(session, body)
        if member is None or member["role"] != "guide":
            return 403, {"error": "guide-only"}
        target_id = body.get("targetId")
        target = session["members"].get(target_id) if isinstance(target_id, str) else None
        if target is None:
            return 404, {"error": "no-such-member"}
        if target_id == session["guide_id"]:
            return 400, {"error": "cannot-kick-guide"}
        session["members"].pop(target_id)
        session["kicked"].add(target_id)
        if target.get("ip") and target["ip"] != member.get("ip"):
            session["kicked_ips"].add(target["ip"])
        _push_event(session, {"t": "kick", "name": target["name"]})
    return 200, {"ok": True}


def api_leave(body, ip):
    code = str(body.get("code") or "").strip().upper()
    with _lock:
        if _sync_limited(ip):
            return 429, {"error": "slow-down"}
        session = _sessions.get(code)
        if session is None:
            return 200, {"ok": True}
        member = _auth(session, body)
        if member is None:
            return 200, {"ok": True}
        mid = body["id"]
        session["members"].pop(mid, None)
        if mid == session["guide_id"]:
            del _sessions[code]
        else:
            _push_event(session, {"t": "leave", "name": member["name"]})
    return 200, {"ok": True}


ROUTES = {
    "/api/session/create": api_create,
    "/api/session/join": api_join,
    "/api/session/sync": api_sync,
    "/api/session/kick": api_kick,
    "/api/session/leave": api_leave,
}


class Handler(SimpleHTTPRequestHandler):
    timeout = 5

    def log_message(self, fmt, *args):
        pass

    # Never list a directory and never serve a dotfile: a normal clone has a
    # full .git/ under the served root, and SimpleHTTPRequestHandler would hand
    # the whole history to anyone who asked.
    def send_head(self):
        parts = [p for p in self.path.split("?")[0].split("/") if p]
        if any(p.startswith(".") for p in parts):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        # The page's <meta> CSP can't carry frame-ancestors; the header can.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _send_json(self, status, payload):
        blob = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/health":
            self._send_json(200, {"ok": True, "multiplayer": True})
            return
        super().do_GET()

    def do_POST(self):
        route = ROUTES.get(self.path.split("?")[0])
        if route is None:
            self._send_json(404, {"error": "not-found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > BODY_MAX:
            self._send_json(413, {"error": "too-large"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {"error": "bad-json"})
            return
        except OSError:
            return
        try:
            status, payload = route(body, self.client_address[0])
        except Exception:
            self._send_json(500, {"error": "server-error"})
            return
        self._send_json(status, payload)


def main():
    os.chdir(Path(__file__).resolve().parent)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8092"))
    class BoundedServer(ThreadingHTTPServer):
        daemon_threads = True
        _gate = threading.BoundedSemaphore(MAX_THREADS)

        def process_request(self, request, client_address):
            if not self._gate.acquire(blocking=False):
                request.close()  # at capacity: refuse rather than queue forever
                return
            try:
                super().process_request(request, client_address)
            except Exception:
                self._gate.release()
                raise

        def process_request_thread(self, request, client_address):
            try:
                super().process_request_thread(request, client_address)
            finally:
                self._gate.release()

    server = BoundedServer(("0.0.0.0", port), Handler)
    if os.environ.get("PUBLIC") is None:
        print("Note: tokens travel in plain HTTP. Put TLS (a reverse proxy) in front of this before serving beyond localhost.")
    print(f"Campus map + tour sessions on http://localhost:{port}/  (Ctrl-C stops)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
