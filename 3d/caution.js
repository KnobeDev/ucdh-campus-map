// The look of a construction caution: a yellow/black hazard-striped ground
// cover and a yellow sign with black text. Hazard colours are deliberately the
// same in both themes — a caution stripe is a caution stripe — and black on
// this yellow is ~14:1, so the sign reads in daylight and at night alike.
// Nothing here moves (no animated stripes: prefers-reduced-motion is moot).
import * as THREE from "./lib/three.module.js";

export const HAZARD_YELLOW = "#ffd400";
export const HAZARD_BLACK = "#141414";
const STRIPE_PERIOD_M = 2.0; // metres from one black stripe to the next, in world space
const TILE = 128; // px; the tile holds two stripe periods so it wraps seamlessly

/**
 * A seamlessly tiling 45° stripe texture. ShapeGeometry's UVs are the shape's
 * own coordinates (metres), so `repeat` = 1 / (metres per tile) paints the
 * stripes at a fixed world size on every zone regardless of its shape.
 */
export function hazardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = HAZARD_YELLOW;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = HAZARD_BLACK;
  // Bands between the lines x + y = o and x + y = o + TILE/4, every TILE/2:
  // the pattern's period along each axis is TILE/2, so the tile wraps cleanly.
  for (let o = -TILE; o <= 2 * TILE; o += TILE / 2) {
    ctx.beginPath();
    ctx.moveTo(o, 0);
    ctx.lineTo(o + TILE / 4, 0);
    ctx.lineTo(o + TILE / 4 - TILE, TILE);
    ctx.lineTo(o - TILE, TILE);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / (STRIPE_PERIOD_M * 2), 1 / (STRIPE_PERIOD_M * 2));
  tex.anisotropy = 8; // the cover is seen at a grazing angle from street level
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The ground cover's material: unlit so the stripes keep their hazard colours
 * under the night palette, offset toward the camera so it never z-fights the
 * walkway 3 cm below it when the overhead camera is 900 m out.
 */
export function hazardMaterial() {
  return new THREE.MeshBasicMaterial({
    map: hazardTexture(),
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A camera-facing sign: bold black text on a yellow plate with a black border
 * and a hazard-striped top edge. About `height` metres tall.
 */
export function cautionSprite(text, height) {
  const FONT = 46;
  const PAD = 24;
  const BAND = 14; // the striped strip along the top of the plate
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  const font = `800 ${FONT}px system-ui, -apple-system, sans-serif`;
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.min(tw + PAD * 2, 1600);
  canvas.height = FONT + PAD * 2 + BAND;
  ctx = canvas.getContext("2d"); // resizing resets the context state
  roundRect(ctx, 3, 3, canvas.width - 6, canvas.height - 6, 10);
  ctx.fillStyle = HAZARD_YELLOW;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = HAZARD_BLACK;
  for (let x = -BAND; x < canvas.width + BAND; x += BAND * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 3);
    ctx.lineTo(x + BAND, 3);
    ctx.lineTo(x, 3 + BAND);
    ctx.lineTo(x - BAND, 3 + BAND);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = HAZARD_BLACK;
  ctx.stroke();
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = HAZARD_BLACK;
  ctx.fillText(text, PAD, BAND + (canvas.height - BAND) / 2 + 2, canvas.width - PAD * 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(height * (canvas.width / canvas.height), height, 1);
  return spr;
}
