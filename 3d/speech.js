// Voice: the Web Speech API reads every announcement aloud when the voice is on,
// and a lazy AudioContext supplies HRTF-panned blips for sonar. Speech is
// always mirrored to the live region by the caller, so the voice is a layer on
// top of an already-accessible page, never the only channel.
//
// Piper (the neural voice the Davis build ships) is a 154 MB lazy download and
// needs a wider CSP; it is a documented follow-up, not a dependency here.
const KEY = "ucdh3d-voice";

export function createSpeech() {
  // Off until asked for: a screen-reader user already hears the live region, and
  // a second synthetic voice would talk over their own. Sighted and low-vision
  // users switch it on once and it stays on.
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === "on"; } catch { /* no storage */ }
  const supported = "speechSynthesis" in window;
  if (supported) {
    speechSynthesis.getVoices(); // Chrome fills the list asynchronously
    speechSynthesis.addEventListener?.("voiceschanged", () => speechSynthesis.getVoices());
  }
  let ctx = null;
  const ensureContext = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };

  return {
    get enabled() { return enabled; },
    get supported() { return supported; },
    setEnabled(v, persist = true) {
      enabled = !!v;
      if (persist) try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch { /* fine */ }
      if (!enabled && supported) speechSynthesis.cancel();
    },
    speak(text, { interrupt = true } = {}) {
      if (!enabled || !supported || !text) return;
      if (interrupt) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.05;
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find((v) => /^en/i.test(v.lang) && /female|samantha|karen|zira|google uk english female/i.test(v.name))
        || voices.find((v) => /^en/i.test(v.lang)) || null;
      speechSynthesis.speak(u);
    },
    stop() { if (supported) speechSynthesis.cancel(); },

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
