// Camera-facing text labels: the name drawn on a CanvasTexture sprite. Used for
// room names, elevators, stairs and entrances. Ported from the Davis build;
// positions here are ENU metres.
import * as THREE from "./lib/three.module.js";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const STYLES = {
  room: { plate: "rgba(2,40,81,0.92)", border: "rgba(242,169,0,0.95)", text: "#ffffff" },
  elevator: { plate: "rgba(40,44,52,0.94)", border: "rgba(255,255,255,0.9)", text: "#ffffff" },
  stairs: { plate: "rgba(96,72,16,0.94)", border: "rgba(255,214,110,0.95)", text: "#ffffff" },
  entrance: { plate: "rgba(0,120,60,0.94)", border: "rgba(255,255,255,0.9)", text: "#ffffff" },
};

/** @returns {THREE.Sprite} about `height` metres tall, text aspect preserved */
export function labelSprite(text, style = "room", height = 1.1) {
  const FONT = 44;
  const PAD = 22;
  const s = STYLES[style] || STYLES.room;
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  ctx.font = `600 ${FONT}px system-ui, -apple-system, sans-serif`;
  const tw = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.min(tw + PAD * 2, 1400);
  canvas.height = FONT + PAD * 2;
  ctx = canvas.getContext("2d"); // resizing resets the context state
  ctx.font = `600 ${FONT}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  roundRect(ctx, 3, 3, canvas.width - 6, canvas.height - 6, 18);
  ctx.fillStyle = s.plate;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = s.border;
  ctx.stroke();
  ctx.fillStyle = s.text;
  ctx.fillText(text, PAD, canvas.height / 2 + 2, canvas.width - PAD * 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(height * (canvas.width / canvas.height), height, 1);
  return spr;
}
