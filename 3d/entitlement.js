// Whether this visit includes members' extras (3d/fun/). Asked ONCE at boot; main.js loads
// fun/ only after a yes.
//
//   local build   yes, without asking anyone: the owner's own machine.
//   site build    the server decides. The page asks the address its app-config.json names
//                 (/health-campus/api/entitlement on hori.ble), with the visitor's own
//                 sign-in, and only a plain {"fun": true} is a yes. Anything else is a no:
//                 no address to ask, a 404, a redirect to a sign-in page, a body that is
//                 not JSON, a network error.
//
// This is a courtesy to the page, not the lock. The lock is the server's: it does not send
// a file under 3d/fun/ to a visitor without the level for it, whatever this returns. The
// answer is kept nowhere: not in storage, not in a cookie.
const ASK_WITHIN_MS = 15000;

/**
 * @param {{mode?: string, entitlementUrl?: string|null}|null} config the resolved app config
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>} never rejects
 */
export async function checkFun(config, fetchImpl = globalThis.fetch) {
  if (!config) return false;
  if (config.mode === "local" && config.entitlementUrl == null) return true;
  if (typeof config.entitlementUrl !== "string" || !config.entitlementUrl) return false;
  try {
    const init = {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    };
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(ASK_WITHIN_MS);
    const response = await fetchImpl(config.entitlementUrl, init);
    if (!response.ok) return false;
    const answer = await response.json();
    return !!answer && typeof answer === "object" && !Array.isArray(answer)
      && Object.prototype.hasOwnProperty.call(answer, "fun") && answer.fun === true;
  } catch {
    return false;
  }
}
