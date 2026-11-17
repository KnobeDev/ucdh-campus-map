// Which text colour to put on a coloured background, so the pair always holds 4.5:1 (WCAG
// 2.1 SC 1.4.3). The map's category colours run from navy to pale cyan and gold; white text
// on the pale ones was under 3:1. A classic script: window.Ink in the page, a module in node.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) { module.exports = api; return; } // node tests
  root.Ink = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var LIGHT = "#FFFFFF";
  var DARK = "#1B2330"; // the stylesheet's --text

  /** [r, g, b] in 0..1 from "#rgb" or "#rrggbb", or null. */
  function parse(hex) {
    if (typeof hex !== "string") return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].split("").map(function (c) { return c + c; }).join("") : m[1];
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
  }

  /** WCAG relative luminance, or null for a colour that cannot be read. */
  function luminance(hex) {
    var rgb = parse(hex);
    if (!rgb) return null;
    var c = rgb.map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /** WCAG contrast ratio of two colours (1 to 21), or 1 when either cannot be read. */
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    if (la === null || lb === null) return 1;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** The text colour for a background: white or the page's dark ink, whichever reads better. */
  function on(background) {
    if (luminance(background) === null) return DARK;
    return contrast(LIGHT, background) >= contrast(DARK, background) ? LIGHT : DARK;
  }

  return { on: on, contrast: contrast, luminance: luminance, LIGHT: LIGHT, DARK: DARK };
});
