// The voice's decisions, with no audio APIs in them, so they can be tested in
// node exactly as they run in the browser. speech.js injects the real engine
// (Piper), the playback (Web Audio) and the fallback (Web Speech).

const DASHES = /\s*[‒-―−]\s*/g; // figure, en, em, horizontal-bar dashes and minus

/**
 * Longest announcement synthesised in one piece. The longest real ones (the
 * startup summary, a route's opening line) are under 300; the cap only stops
 * one runaway string from holding the voice, and every queued line behind it,
 * for minutes.
 */
export const MAX_SPEECH_CHARS = 500;

/**
 * Fold text to what the Amy voice's phonemizer can say. Some non-ASCII
 * punctuation maps to out-of-range phoneme ids, which crashes the ONNX model
 * and silently drops the whole utterance, so it is replaced before synthesis.
 */
export function sanitizeSpeech(text) {
  const clean = String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // é -> e: keep the letter, drop the accent
    .replace(DASHES, ", ")
    .replace(/\s*·\s*/g, ", ") // the middle dot in "Outside · near the entrance"
    .replace(/\s*→\s*/g, " to ") // "Elevator → Level 8"
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, ". ")
    .replace(/[^\x00-\x7F]/g, " ") // any other symbol (♿, emoji) would be unsayable anyway
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  if (clean.length <= MAX_SPEECH_CHARS) return clean;
  const cut = clean.slice(0, MAX_SPEECH_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, "")}.`;
}

/**
 * A single-voice announcement queue.
 *
 * @param {object} o
 * @param {() => Promise<object>} o.load              start the engine; resolves when it can speak
 * @param {(engine, text: string) => Promise<any>} o.synth   text -> playable audio
 * @param {(audio) => Promise<void>} o.play           resolves when the audio has finished (or was stopped)
 * @param {() => void} o.stopPlayback                 cut off whatever is playing now
 * @param {(text: string) => void} o.fallback         used only once the engine has permanently failed
 * @param {(err: Error) => void} [o.onError]
 * @param {(text: string) => void} [o.onStart]      a line starts being heard (captions)
 * @param {(text: string) => void} [o.onEnd]        that line finished or was cut off
 */
export function createVoiceQueue({ load, synth, play, stopPlayback, fallback, onError = () => {}, onStart = () => {}, onEnd = () => {} }) {
  let status = "idle"; // idle | loading | ready | failed
  let loading = null;
  let generation = 0; // bumped to abandon whatever is being synthesised or played under the old value
  let busy = false;
  let currentTag; // tag of the item being synthesised or played now; undefined when none, or untagged
  const queue = []; // { text, tag }

  function ensureLoaded() {
    if (!loading) {
      status = "loading";
      loading = Promise.resolve()
        .then(load)
        .then((engine) => {
          if (!engine) throw new Error("the voice engine did not start");
          status = "ready";
          return engine;
        })
        .catch((err) => {
          status = "failed";
          onError(err);
          return null;
        });
    }
    return loading;
  }

  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const gen = generation;
        const engine = await ensureLoaded();
        if (gen !== generation) continue; // stopped during warm-up: the queue now holds only newer items
        if (!engine) {
          for (const item of queue.splice(0)) fallback(item.text);
          break;
        }
        const item = queue.shift();
        currentTag = item.tag;
        try {
          const audio = await synth(engine, item.text);
          if (gen !== generation) continue; // stopped mid-synthesis: never play a stale announcement
          onStart(item.text); // captions show exactly the line being heard, as it starts
          try {
            await play(audio);
          } finally {
            onEnd(item.text); // ...and end with it, whether it finished or was cut off
          }
        } catch (err) {
          onError(err);
        } finally {
          currentTag = undefined;
        }
      }
    } finally {
      busy = false;
    }
  }

  function stop() {
    generation++;
    queue.length = 0;
    stopPlayback();
  }

  return {
    get status() { return status; },
    /** Warm the engine now, so the first announcement isn't the one that waits. */
    preload() { ensureLoaded(); },
    /** tag: lets one source (sonar) later cancel only its own announcements. */
    speak(text, { interrupt = true, tag } = {}) {
      const clean = sanitizeSpeech(text);
      if (!/[a-z0-9]/i.test(clean)) return; // nothing sayable: never start a download for it
      if (interrupt) stop();
      queue.push({ text: clean, tag });
      drain();
    },
    stop,
    /** Drop one source's queued announcements; cut it off only if it is the one speaking now. */
    cancel(tag) {
      if (tag === undefined) return;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].tag === tag) queue.splice(i, 1);
      }
      if (currentTag === tag) {
        generation++;
        stopPlayback();
      }
    },
  };
}

/** How long a caption shown without the voice stays up: roughly reading pace, within bounds. */
export const readingMs = (text) =>
  Math.min(12000, Math.max(2500, 1200 + String(text ?? "").trim().split(/\s+/).length * 280));
