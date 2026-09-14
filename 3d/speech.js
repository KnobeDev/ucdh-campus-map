// Voice: announcements are spoken by Piper, a neural text-to-speech voice
// ("Amy", en_US-amy-low) that runs entirely in the browser from lib/piper/:
// no server, no CDN. Buildings named by What's ahead, by a click, or by a
// sonar echo are all read in her voice. The queue in speech-core.js holds
// announcements during the one-to-two-second warm-up, so the first building is
// already Amy; the browser's own Web Speech voice is used only if Piper can
// never start (lib/piper/ not vendored, or no WebAssembly).
//
// Speech is always mirrored to the live region by the caller, so the voice is a
// layer on top of an already-accessible page, never the only channel. A lazy
// AudioContext also supplies the HRTF-panned sonar blips.
//
// CSP (index.html): the model needs 'wasm-unsafe-eval' (compile WebAssembly; it
// does not allow JavaScript eval) and connect-src blob: (the engine fetches
// blob URLs it creates itself).
import { createVoiceQueue } from "./speech-core.js?v=3";

const KEY = "ucdh3d-voice";
const VOICE = "en_US-amy-low";
const PIPER = new URL("./lib/piper/", import.meta.url).href;
const PLAY_SLACK_MS = 750; // past the clip's length, a playback that never ended is given up on

async function loadPiper() {
  if (typeof WebAssembly !== "object") throw new Error("WebAssembly is unavailable");
  const m = await import("./lib/piper/piper-tts-web.js");
  const engine = new m.PiperWebEngine({
    // One thread: several would need SharedArrayBuffer, i.e. cross-origin isolation headers.
    onnxRuntime: new m.OnnxWebRuntime({ basePath: `${PIPER}onnx/`, numThreads: 1 }),
    phonemizeRuntime: new m.PhonemizeWebRuntime({ basePath: `${PIPER}piper/` }),
    voiceProvider: new m.RemoteVoiceProvider({ baseUrl: `${PIPER}voices/` }),
  });
  await engine.generate("ready", VOICE); // compile the WASM and load the model now, not on the first building
  return engine;
}

/** onStart / onEnd(text): a line starts / stops being heard, from Piper or the fallback voice (captions). */
export function createSpeech({ onStart = () => {}, onEnd = () => {} } = {}) {
  // On unless switched off: naming buildings aloud is the point of What's ahead
  // and sonar. A screen-reader user, who already hears the live region, turns it
  // off once and that choice persists.
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch { /* no storage: default on */ }
  const nativeVoice = "speechSynthesis" in window;
  if (nativeVoice) {
    speechSynthesis.getVoices(); // Chrome fills the list asynchronously
    speechSynthesis.addEventListener?.("voiceschanged", () => speechSynthesis.getVoices());
  }

  let ctx = null;
  const ensureContext = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  // A context created before any gesture (a resumed session skips the lobby) starts
  // suspended; the next key or tap lets it play.
  const unlock = () => { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); };
  addEventListener("pointerdown", unlock, true);
  addEventListener("keydown", unlock, true);

  function nativeSpeak(text) {
    if (!nativeVoice) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.05;
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => /^en/i.test(v.lang) && /female|samantha|karen|zira|google uk english female/i.test(v.name))
      || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.onstart = () => onStart(text);
    u.onend = () => onEnd(text);
    u.onerror = () => onEnd(text); // also fires when cancelled
    speechSynthesis.speak(u);
  }

  let current = null; // { source, finish } for the clip playing now
  const queue = createVoiceQueue({
    load: loadPiper,
    synth: async (engine, text) => {
      const res = await engine.generate(text, VOICE);
      return ensureContext().decodeAudioData(await res.file.arrayBuffer());
    },
    play: (buffer) => new Promise((done) => {
      const c = ensureContext();
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(c.destination);
      // A suspended context never ends a source; the guard keeps that from stalling every later announcement.
      const guard = setTimeout(() => finish(), buffer.duration * 1000 + PLAY_SLACK_MS);
      const finish = () => {
        clearTimeout(guard);
        if (current && current.source === source) current = null;
        done();
      };
      source.onended = finish;
      current = { source, finish };
      source.start();
    }),
    stopPlayback: () => {
      if (nativeVoice) speechSynthesis.cancel();
      if (!current) return;
      const { source, finish } = current;
      try { source.stop(); } catch { /* already ended */ }
      finish();
    },
    fallback: nativeSpeak,
    onStart,
    onEnd,
    onError: (err) => console.error("Voice:", err),
  });
  if (enabled) queue.preload();

  return {
    get enabled() { return enabled; },
    get supported() { return typeof WebAssembly === "object" || nativeVoice; },
    /** idle | loading | ready | failed (failed = the browser's own voice is speaking instead). */
    get status() { return queue.status; },
    setEnabled(v, persist = true) {
      enabled = !!v;
      if (persist) try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch { /* fine */ }
      if (enabled) queue.preload();
      else queue.stop();
    },
    /** tag: lets one source (sonar) later cancel only its own announcements. */
    speak(text, { interrupt = true, tag } = {}) {
      if (enabled) queue.speak(text, { interrupt, tag });
    },
    stop() { queue.stop(); },
    /** Drop one source's queued announcements; cut it off only if it is the one speaking now. */
    cancel(tag) { queue.cancel(tag); },

    /** Ears at the camera: position + orientation from its world matrix. */
    setListenerFromCamera(camera) {
      const l = ensureContext().listener;
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements;
      const [ux, uy, uz] = [e[4], e[5], e[6]];
      const [fx, fy, fz] = [-e[8], -e[9], -e[10]];
      const [px, py, pz] = [e[12], e[13], e[14]];
      if (l.positionX) {
        l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
        l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
        l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
      } else {
        l.setPosition(px, py, pz);
        l.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    },

    /** One HRTF-panned blip at a world position, after delaySec. */
    blip({ x, y, z }, refM, maxM, delaySec = 0, hz = 880) {
      const c = ensureContext();
      const t = c.currentTime + delaySec;
      const pan = c.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "linear";
      pan.refDistance = refM;
      pan.maxDistance = maxM;
      pan.positionX ? (pan.positionX.value = x, pan.positionY.value = y, pan.positionZ.value = z) : pan.setPosition(x, y, z);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      o.connect(g).connect(pan).connect(c.destination);
      o.start(t);
      o.stop(t + 0.25);
      return o; // so a caller can cancel a scheduled blip
    },

    /** A short unpanned tick (the sonar wavefront crossing a ring). */
    tick(delaySec, hz = 440) {
      const c = ensureContext();
      const t = c.currentTime + delaySec;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = hz;
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.1);
      return o;
    },
  };
}
