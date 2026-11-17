// The build's switches, read ONCE at boot from app-config.json beside this file.
//
//   local — the owner's machine under serve.py: tours, events and joining, the map
//           editor, the Piper voice. Everything works exactly as it always has.
//   site  — the unofficial test build on hori.ble. There is no session server there:
//           Tour, Event and Join are not offered, the 2D map has no editor, and the
//           browser's own voice speaks. The site ships its own app-config.json; this
//           repo commits the local one.
//
// The file is the ONLY input. Nothing a visitor controls — a URL parameter, localStorage —
// is consulted here, so nothing a visitor does can switch sessions back on. And the file is
// checked strictly: ANYTHING WRONG with it — missing (a 404), not JSON (a login page), an
// unknown or missing key, a wrong type, a site file that tries to switch sessions or admin
// on, a server error, no network — means the site-safe set: sessions and admin OFF, and no
// entitlement address (so nothing that needs a membership is ever loaded). Failing closed
// is the point: a broken or lost file on the site must never send anything to the site's
// own /api. Every local checkout has the committed file, so local work is unchanged.
//
// {mode, sessions, admin, entitlementUrl} are the file's four keys, all required: the same
// four the UC Davis campus map's file has, so the site's release tool checks both maps'
// files by one rule. This map has no role codes, so `admin` is false in both of its builds;
// it is kept so a site file that sets it true is still refused. `voice` is not a key: it
// follows the mode (the site build ships without Piper). entitlementUrl is where a later
// build asks whether a visit includes members' extras: null means there is no one to ask.

// What the committed app-config.json says (tools/test/site-mode.test.js pins the two together).
// Only the file can give it: no failure falls back to it.
export const LOCAL_DEFAULTS = Object.freeze({ mode: "local", sessions: true, admin: false, entitlementUrl: null });
export const SITE_SAFE = Object.freeze({ mode: "site", sessions: false, admin: false, entitlementUrl: null });

const KEYS = ["mode", "sessions", "admin", "entitlementUrl"];
// A same-origin, root-relative path of plain segments: no scheme, no host ("//x"), no
// backslash, no percent-encoding and no "." / ".." segment that could walk it somewhere else.
const SAME_ORIGIN_PATH = /^(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)+\/?$/;

/** The resolved config the app runs on: the four file keys plus the derived voice. */
function resolved(base) {
  return Object.freeze({ ...base, voice: base.mode === "site" ? "device" : "piper" });
}

/** Validate an already-parsed app-config.json value.
 *  @returns {{config: object, problem: string|null}} — site-safe with a reason when it fails */
export function parseAppConfig(value) {
  const fail = (problem) => ({ config: resolved(SITE_SAFE), problem });
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("not a JSON object");
  const keys = Object.keys(value);
  const extra = keys.filter((k) => !KEYS.includes(k));
  if (extra.length) return fail(`unknown key ${extra.join(", ")}`);
  const missing = KEYS.filter((k) => !keys.includes(k));
  if (missing.length) return fail(`missing key ${missing.join(", ")}`);
  const { mode, sessions, admin, entitlementUrl } = value;
  if (mode !== "local" && mode !== "site") return fail(`mode must be "local" or "site"`);
  if (typeof sessions !== "boolean" || typeof admin !== "boolean") return fail("sessions and admin must be true or false");
  if (mode === "site" && (sessions || admin)) return fail("the site build cannot switch sessions or admin on");
  if (entitlementUrl !== null && (typeof entitlementUrl !== "string" || entitlementUrl.length > 200
      || !SAME_ORIGIN_PATH.test(entitlementUrl))) {
    return fail("entitlementUrl must be null or a same-origin path like /health-campus/api/entitlement");
  }
  return { config: resolved({ mode, sessions, admin, entitlementUrl }), problem: null };
}

/** Fetch and validate app-config.json. Never rejects: every failure — a missing file included
 *  — resolves to the site-safe set. */
export async function loadAppConfig({ fetchImpl = globalThis.fetch, url = new URL("./app-config.json", import.meta.url) } = {}) {
  let response;
  try {
    // no-cache: revalidate every boot, so a switched file is never shadowed by a stale copy
    response = await fetchImpl(url, { cache: "no-cache" });
  } catch (err) {
    console.warn("[config] app-config.json unreachable — running as the site build:", err?.message || err);
    return resolved(SITE_SAFE);
  }
  let problem;
  if (response.status === 404) {
    problem = "missing, HTTP 404";
  } else if (!response.ok) {
    problem = `HTTP ${response.status}`;
  } else {
    let value;
    try { value = await response.json(); } catch { value = undefined; }
    const parsed = value === undefined ? { problem: "not JSON" } : parseAppConfig(value);
    if (!parsed.problem) return parsed.config;
    problem = parsed.problem;
  }
  console.warn(`[config] app-config.json rejected (${problem}) — running as the site build.`);
  return resolved(SITE_SAFE);
}
