// Construction caution wording and label sizing. Pure data, no three.js or DOM,
// so it runs in node for tests exactly as it runs in the browser.
//
// The end date is whatever the map admin set in the 2D editor (YYYY-MM-DD). It
// is a calendar date, not an instant: it is parsed field by field, never via
// new Date("YYYY-MM-DD"), which is UTC midnight and reads as the day before
// everywhere west of Greenwich.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const LABEL_H_MIN = 0.9; // metres: a tiny closure keeps a readable but modest sign
export const LABEL_H_MAX = 2.4; // a city-block site gets a big one
const LABEL_H_PER_M = 1 / 10; // sign height as a fraction of the zone's short side
export const LABEL_SPACING = 80; // metres between repeated signs on a long site

/** Strict YYYY-MM-DD → { y, m, d } (m 1-12), or null. Rejects 2027-02-30. */
export function parseIsoDate(s) {
  if (typeof s !== "string") return null;
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** "2027-03-15" → "15 March 2027"; anything unparseable → null. */
export function formatUntilDate(s) {
  const p = parseIsoDate(s);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : null;
}

/** The sign's text: "Caution — construction site until <date | further notice>". */
export function cautionText(zone) {
  const until = formatUntilDate(zone?.endDate) || "further notice";
  return `Caution — construction site until ${until}`;
}

/** The Layers list and the live-region wording: the zone's name, then the sign. */
export function zoneListText(zone) {
  return `${zone.name} — ${cautionText(zone)}`;
}

export const SIGN_TARGET_PX = 28; // on-screen plate height a distant sign is scaled to hold
const SIGN_WIDTH_PER_ZONE = 1.5; // a sign may be this much wider than its zone's long side…
const SIGN_WIDTH_FLOOR_M = 30; // …but a tiny closure still gets a sign at least this wide

/**
 * How tall (metres) a sign should be when the camera is `dist` metres away:
 * its base height up close, then growing so it paints `targetPx` on the
 * viewport, capped at `maxH`. h = px · 2d · tan(fov/2) / H, the perspective
 * projection inverted. Pure, so the scene can call it every frame.
 */
export function signHeightAt(dist, baseH, maxH, { fovDeg, viewportPx, targetPx = SIGN_TARGET_PX }) {
  const h = (targetPx * 2 * dist * Math.tan((fovDeg / 2) * (Math.PI / 180))) / viewportPx;
  return Math.min(maxH, Math.max(baseH, h));
}

/** The tallest a sign of the given width:height aspect may grow over this zone. */
export function signHeightCap(ring, aspect) {
  const b = bbox(ring);
  const width = Math.max(SIGN_WIDTH_FLOOR_M, Math.max(b.w, b.h) * SIGN_WIDTH_PER_ZONE);
  return width / aspect;
}

function bbox(ring) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Sign height in metres for a zone: a tenth of its short side, clamped. */
export function labelHeightFor(ring) {
  if (!ring || ring.length < 3) return LABEL_H_MIN;
  const b = bbox(ring);
  const short = Math.min(b.w, b.h);
  return Math.min(LABEL_H_MAX, Math.max(LABEL_H_MIN, short * LABEL_H_PER_M));
}

const GRID_N = 8; // cells per side when hunting for an inside point

/**
 * A point inside the polygon near its bbox centre. The centre itself when it
 * is inside (every convex zone); otherwise — an L or a C — the nearest of the
 * cell centres of a coarse grid over the bbox that lands inside.
 */
function insidePoint(ring, b, cx, cz) {
  if (pointInRing(cx, cz, ring)) return [cx, cz];
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const x = b.minX + (b.w * (i + 0.5)) / GRID_N;
      const z = b.minZ + (b.h * (j + 0.5)) / GRID_N;
      if (!pointInRing(x, z, ring)) continue;
      const d = Math.hypot(x - cx, z - cz);
      if (d < bestD) { bestD = d; best = [x, z]; }
    }
  }
  return best || [cx, cz]; // a sliver thinner than the grid: the centre is as good as anything
}

/**
 * Where to put the signs: a point inside the zone near its bbox centre, plus
 * repeats every `spacing` metres along the long axis of a long site, keeping
 * only those inside the polygon. The first anchor is where the name goes too.
 */
export function labelAnchors(ring, spacing = LABEL_SPACING) {
  if (!ring || ring.length < 3) return [];
  const b = bbox(ring);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const out = [insidePoint(ring, b, cx, cz)];
  const alongX = b.w >= b.h;
  const half = Math.max(b.w, b.h) / 2;
  for (let k = 1; k * spacing < half - spacing / 2; k++) {
    for (const sign of [-1, 1]) {
      const off = sign * k * spacing;
      const p = alongX ? [cx + off, cz] : [cx, cz + off];
      if (pointInRing(p[0], p[1], ring)) out.push(p);
    }
  }
  return out;
}
