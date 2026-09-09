// Theme palettes (light/dark) + persistence. Colours are hex numbers for three.js
// materials; the HUD's CSS tokens live in styles.css and follow the same
// data-theme attribute. Initial theme follows prefers-color-scheme; a user choice
// persists in localStorage.
//
// Building colours are the 2D app's category palette (data.jsx CATEGORIES),
// lifted toward pastel so sun-lit facades don't saturate — the two maps should
// read as the same place.
const KEY = "ucdh3d-theme";

export const PALETTES = {
  light: {
    sky: 0xd6e6f5,
    fogDensity: 0.00035, // the campus is ~1.5 km across; fog closes in past that
    ground: 0x9cb87a,
    hemiSky: 0xc4dcff, hemiGround: 0x8aa46c, hemiIntensity: 0.85,
    sunColor: 0xfff3dc, sunIntensity: 1.6,
    // Walkways are the heroes of a wayfinding map: warm near-white foot paths,
    // steps a touch darker, cycle lanes cool blue; streets and lots recede.
    surfaces: {
      foot: 0xf1ecdc, steps: 0xd9d2bd, cycle: 0xa9c7df, service: 0x8f9297,
      street: 0x7b7e84, parking: 0x9a9da3, green: 0x84b060, pitch: 0x6fa34d,
      context: 0xa3b28a,
    },
    surfaceEmissive: {},
    cats: {
      hospital: 0x9fb4d1, clinic: 0xa9d9e8, research: 0xc7b3d4, education: 0xf0c39c,
      admin: 0xd8cfb1, amenity: 0xbdd6c1, external: 0xcfcfcf, parking: 0xa8abb1,
      context: 0xd9d4c8, default: 0xd2ccc0,
    },
    building: { emissive: 0x000000, emissiveIntensity: 0 },
    construction: { barrier: 0xff7a1a, emissive: 0x000000, emissiveIntensity: 0 },
  },
  dark: {
    sky: 0x0c1220,
    fogDensity: 0.0004,
    ground: 0x1a2419,
    hemiSky: 0x2b3a5c, hemiGround: 0x151c16, hemiIntensity: 0.65,
    sunColor: 0x9db8e8, sunIntensity: 0.7,
    // Moonlit walkways glow faintly so the route network stays legible at night.
    surfaces: {
      foot: 0x938d7e, steps: 0x7a7466, cycle: 0x5f82a2, service: 0x2a2c32,
      street: 0x1f2126, parking: 0x2e3036, green: 0x2f4526, pitch: 0x27401f,
      context: 0x232c1e,
    },
    surfaceEmissive: { foot: [0x2a2620, 0.35], cycle: [0x14263a, 0.45] },
    cats: {
      hospital: 0x3a4658, clinic: 0x354a55, research: 0x463c4e, education: 0x4e4232,
      admin: 0x4a463b, amenity: 0x37443d, external: 0x3c3c3c, parking: 0x33353d,
      context: 0x3a3833, default: 0x443f36,
    },
    building: { emissive: 0x241c0e, emissiveIntensity: 1 }, // faint warm window glow
    construction: { barrier: 0xff8c1a, emissive: 0x662200, emissiveIntensity: 0.55 },
  },
};

export function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable (private mode, blocked) — fall through to the OS preference */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Persist the choice. Applying it to the document is the caller's job. */
export function saveTheme(name) {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* preference simply won't persist */
  }
}
