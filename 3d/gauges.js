// The overhead view's gauges (owner, 2026-11-21): the heading 0-360 along the top (0 north,
// 90 east, 180 south, 270 west: the way the camera faces, N E S W marked) and the pitch 0-90 on
// the side (0 straight down at the map, 90 level with the horizon, 45 halfway).
//
// They are pictures (aria-hidden in index.html). The same values are in #gauge-text, a plain
// paragraph, not a live region: #status stays the page's one voice, and nothing is said on
// every frame. H in the overhead view reads them aloud (main.js), and the view says them when
// it opens. pointer-events: none (styles.css), so they never take a drag from the map, and
// they sit under the panel, the inset map and the captions. placeGauges (overhead-core.js)
// keeps them clear of those and of the touch joystick anyway, and leaves a gauge out where
// there is no room.
import { gaugeReadout, gaugeText, headingDeg, displayPitch, headingTicks, pitchTicks, placeGauges } from "./overhead-core.js?v=4";

const HALF_SPAN = 60; // degrees either side of the middle of the heading strip
const STEP = 10; // a tick every 10 degrees; labelled every 30, N E S W at the quarters
const PITCH_STEP = 15;
const PLACE_EVERY = 0.25; // seconds between re-measuring the panel, the map and the window
const GAP = 12; // px, as the inset map's corner offset
// Sizes in rem, so the gauges grow with the text (SC 1.4.4); styles.css uses the same numbers.
const SIZE = { stripW: 20, stripH: 4.25, stripMinW: 12.5, scaleW: 4.75, scaleH: 16, scaleMinH: 8.5 };
// What the gauges must stay clear of: the touch joystick too, on a touch screen (touch-controls.js),
// which steps around none of these itself. The captions are not here: they come and go, and moving
// the gauges each time would be motion nobody asked for; they are drawn over the gauges instead.
const OBSTACLES = ["hud", "minimap", "code-chip", "conn-panel", "joystick"];
const COMPACT_TRACK = 110; // px: a shorter pitch track labels only 0, 45 and 90
// rem kept between a heading label's middle and the strip's edge: about half a label's width
const labelEdge = (label) => (label.length === 1 ? 0.55 : 0.8);
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export function createGauges({ overhead }) {
  const $ = (id) => document.getElementById(id);
  const root = $("gauges");
  const strip = $("heading-strip");
  const tape = $("heading-tape");
  const scale = $("pitch-scale");
  const track = $("pitch-track");
  const marker = $("pitch-marker");
  const text = $("gauge-text");
  const headingValue = $("heading-value");
  const headingPoint = $("heading-point");
  const pitchValue = $("pitch-value");

  for (const t of pitchTicks(PITCH_STEP)) {
    const tick = document.createElement("span");
    tick.className = t.deg % 45 === 0 ? "ps-tick ps-major" : "ps-tick";
    tick.style.top = `${t.frac * 100}%`;
    tick.textContent = t.label;
    track.insertBefore(tick, marker);
  }

  let shown = false;
  let clock = PLACE_EVERY;
  let tapeKey = "";
  let readKey = "";

  function rectOf(id) {
    const el = $(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
  }

  function place() {
    const rem = remPx();
    const p = placeGauges({
      vw: innerWidth, vh: innerHeight, gap: GAP,
      obstacles: OBSTACLES.map(rectOf).filter(Boolean),
      strip: { w: SIZE.stripW * rem, h: SIZE.stripH * rem, minW: SIZE.stripMinW * rem },
      scale: { w: SIZE.scaleW * rem, h: SIZE.scaleH * rem, minH: SIZE.scaleMinH * rem },
    });
    strip.hidden = !p.strip;
    if (p.strip) Object.assign(strip.style, { left: `${p.strip.left}px`, top: `${p.strip.top}px`, width: `${p.strip.width}px` });
    scale.hidden = !p.scale;
    if (p.scale) {
      Object.assign(scale.style, { left: `${p.scale.left}px`, top: `${p.scale.top}px`, height: `${p.scale.height}px` });
      scale.classList.toggle("compact", track.clientHeight < COMPACT_TRACK);
    }
  }

  function drawTape(heading) {
    const width = tape.clientWidth;
    const key = `${Math.round(heading * 4)}|${width}`; // a quarter degree is under a pixel
    if (key === tapeKey || !width) return;
    tapeKey = key;
    const ppd = width / (2 * HALF_SPAN);
    // A label cut in half by the strip's edge can read as another letter (half a W looks like
    // an N), so near the edges only the tick is drawn.
    const rem = remPx();
    tape.replaceChildren(...headingTicks(heading, HALF_SPAN, STEP).map((t) => {
      const label = t.label && Math.abs(t.offset) * ppd <= width / 2 - labelEdge(t.label) * rem ? t.label : null;
      const tick = document.createElement("span");
      tick.className = label ? (t.deg % 90 === 0 ? "hs-tick hs-cardinal" : "hs-tick hs-major") : t.label ? "hs-tick hs-major" : "hs-tick";
      tick.style.left = `${width / 2 + t.offset * ppd}px`;
      if (label) tick.textContent = label;
      return tick;
    }));
  }

  function render() {
    const { yaw, pitch } = overhead;
    if (!strip.hidden) drawTape(headingDeg(yaw));
    const frac = Math.min(Math.max(displayPitch(pitch) / 90, 0), 1);
    marker.style.top = `${frac * 100}%`;
    const r = gaugeReadout(yaw, pitch);
    const key = `${r.heading}|${r.pitch}`;
    if (key === readKey) return;
    readKey = key;
    headingValue.textContent = `${r.heading}°`;
    headingPoint.textContent = r.point;
    pitchValue.textContent = `${r.pitch}°`;
    text.textContent = gaugeText(yaw, pitch);
  }

  addEventListener("resize", () => { clock = PLACE_EVERY; });

  return {
    /** Show the gauges (the overhead view) or hide them (walking). */
    show(on) {
      shown = on;
      root.hidden = !on;
      if (!on) return;
      tapeKey = "";
      place();
      render();
    },
    update(dt) {
      if (!shown) return;
      clock += dt;
      if (clock >= PLACE_EVERY) {
        clock = 0;
        place();
      }
      render();
    },
    /** The heading and pitch in one sentence, for the H key. */
    get text() { return gaugeText(overhead.yaw, overhead.pitch); },
  };
}
