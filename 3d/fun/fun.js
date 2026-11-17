// Members' extras for the 3D map. There are none yet.
//
// Everything under 3d/fun/ is for visitors whose level includes the map's extras (on
// hori.ble, the Supporter level and above: the same rule as the UC Davis campus map). The
// site's server does not send these files to anyone else, and main.js loads this module only
// after the server has said yes (entitlement.js). So an extra added here later is members-only
// from its first day, with nothing to move.
//
// Nothing a visitor needs to find their way belongs here: wayfinding, the voice, captions,
// sonar, the floor picker and every pause or sound switch stay in the free map.

/**
 * @param {object} app what the map hands an extra: { world, player, say }
 * @returns {{ extras: string[] }} the names of the extras that were started
 */
export function initFun(app) {
  void app;
  return { extras: [] };
}
