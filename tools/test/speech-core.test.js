// Tests for the voice queue in front of the Piper neural voice (3d/speech-core.js,
// pure: the engine, audio playback and native fallback are injected).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");

const CORE = pathToFileURL(path.join(__dirname, "..", "..", "3d", "speech-core.js")).href;

const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function deferred() {
  let resolve;
  let reject;
  const p = new Promise((a, b) => { resolve = a; reject = b; });
  return { p, resolve, reject };
}

/** A fake engine: load waits until told (unless holdLoad is false); play records, and waits if holdPlay. */
function harness({ holdLoad = true, holdPlay = false } = {}) {
  const log = { played: [], fallback: [], errors: [], stopped: 0, synthCalls: [] };
  const load = deferred();
  let playing = null;
  const opts = {
    load: () => (holdLoad ? load.p : Promise.resolve({ engine: true })),
    synth: async (engine, text) => {
      log.synthCalls.push(text);
      if (text === "boom") throw new Error("synth failed");
      return `audio:${text}`;
    },
    play: (audio) => {
      log.played.push(audio);
      if (!holdPlay) return Promise.resolve();
      playing = deferred();
      return playing.p;
    },
    stopPlayback: () => { log.stopped++; playing?.resolve(); },
    fallback: (text) => log.fallback.push(text),
    onError: (err) => log.errors.push(err.message),
  };
  return { opts, log, load, finishPlay: () => playing?.resolve() };
}

test("speech: text is folded to what the Amy voice's phonemizer can say", async () => {
  const { sanitizeSpeech } = await import(CORE);
  // Out-of-range phoneme ids from these characters crash the ONNX model and drop the whole utterance.
  assert.strictEqual(sanitizeSpeech("Cancer Center — South"), "Cancer Center, South");
  assert.strictEqual(sanitizeSpeech("Children’s Surgery “Center”"), "Children's Surgery \"Center\"");
  assert.strictEqual(sanitizeSpeech("Loading…"), "Loading.");
  assert.strictEqual(sanitizeSpeech("Outside · near the Main Entrance"), "Outside, near the Main Entrance");
  assert.strictEqual(sanitizeSpeech("Elevator → Level 8"), "Elevator to Level 8");
  assert.strictEqual(sanitizeSpeech("Café ♿ entrance"), "Cafe entrance", "accents keep their letter; symbols go");
  assert.strictEqual(sanitizeSpeech(null), "");
});

test("speech: announcements wait for the voice to warm up, then all play through it in order", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness();
  const q = createVoiceQueue(h.opts);
  assert.strictEqual(q.status, "idle");
  q.speak("Pathology", { interrupt: false });
  q.speak("Davis Tower", { interrupt: false });
  await settle();
  assert.deepStrictEqual(h.log.played, [], "nothing plays before the engine is ready");
  assert.strictEqual(q.status, "loading");
  h.load.resolve({ engine: true });
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:Pathology", "audio:Davis Tower"]);
  assert.deepStrictEqual(h.log.fallback, [], "no other voice is heard during warm-up");
  assert.strictEqual(q.status, "ready");
});

test("speech: if the neural voice can never load, every announcement still reaches the fallback voice", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness();
  const q = createVoiceQueue(h.opts);
  q.speak("Pathology", { interrupt: false });
  h.load.reject(new Error("no wasm"));
  await settle();
  assert.deepStrictEqual(h.log.fallback, ["Pathology"]);
  q.speak("Davis Tower");
  await settle();
  assert.deepStrictEqual(h.log.fallback, ["Pathology", "Davis Tower"]);
  assert.deepStrictEqual(h.log.played, []);
  assert.strictEqual(q.status, "failed");
  assert.deepStrictEqual(h.log.errors, ["no wasm"], "the failure is reported once, not swallowed");
});

test("speech: stop during warm-up drops what was queued, and a later announcement still plays", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness();
  const q = createVoiceQueue(h.opts);
  q.speak("stale", { interrupt: false });
  q.stop();
  q.speak("fresh", { interrupt: false });
  h.load.resolve({ engine: true });
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:fresh"], "the queue must not stall after a stop");
});

test("speech: an interrupting announcement cuts off the current one and drops the queue", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness({ holdLoad: false, holdPlay: true });
  const q = createVoiceQueue(h.opts);
  q.speak("first", { interrupt: false });
  q.speak("second", { interrupt: false });
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:first"], "second waits its turn");
  q.speak("urgent"); // interrupt is the default
  await settle();
  assert.ok(h.log.stopped >= 1, "the playing utterance was stopped");
  h.finishPlay();
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:first", "audio:urgent"], "the queued one was dropped");
});

test("speech: audio synthesised for a stopped announcement is never played", async () => {
  const { createVoiceQueue } = await import(CORE);
  const gate = deferred();
  const h = harness({ holdLoad: false });
  const q = createVoiceQueue({ ...h.opts, synth: async (e, t) => { await gate.p; return `audio:${t}`; } });
  q.speak("Old news", { interrupt: false });
  await settle();
  q.stop();
  gate.resolve();
  await settle();
  assert.deepStrictEqual(h.log.played, []);
});

test("speech: one failed synthesis does not block the next announcement", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness({ holdLoad: false });
  const q = createVoiceQueue(h.opts);
  q.speak("boom", { interrupt: false });
  q.speak("Pathology", { interrupt: false });
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:Pathology"]);
  assert.deepStrictEqual(h.log.errors, ["synth failed"]);
});

test("speech: nothing sayable never starts the download", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness({ holdLoad: false });
  const q = createVoiceQueue(h.opts);
  q.speak("   ");
  q.speak(null);
  q.speak("—");
  await settle();
  assert.deepStrictEqual(h.log.synthCalls, []);
  assert.strictEqual(q.status, "idle");
});

test("speech: preload warms the voice without saying anything", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness();
  const q = createVoiceQueue(h.opts);
  q.preload();
  assert.strictEqual(q.status, "loading");
  h.load.resolve({ engine: true });
  await settle();
  assert.strictEqual(q.status, "ready");
  assert.deepStrictEqual(h.log.played, []);
});

test("speech: an overlong announcement is cut at a word, so one string can't hold the voice for minutes", async () => {
  const { sanitizeSpeech, MAX_SPEECH_CHARS } = await import(CORE);
  assert.ok(MAX_SPEECH_CHARS >= 300, "room for the longest real announcement (boot summary, route opening)");
  const out = sanitizeSpeech("Pathology Building ".repeat(100));
  assert.ok(out.length <= MAX_SPEECH_CHARS + 1, `length ${out.length}`);
  assert.match(out, /(Pathology|Building)\.$/, "ends on a whole word");
  assert.strictEqual(sanitizeSpeech("Short and sweet"), "Short and sweet", "short text is untouched");
});

test("speech: cancelling one source's announcements leaves everyone else's alone", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness({ holdLoad: false, holdPlay: true });
  const q = createVoiceQueue(h.opts);
  q.speak("Medical Center, 6 metres ahead", { interrupt: false }); // What's ahead
  q.speak("Sherman Building, 19 metres", { interrupt: false, tag: "sonar" }); // an older pulse's echoes
  q.speak("Davis I Building, 30 metres", { interrupt: false, tag: "sonar" });
  await settle();
  q.cancel("sonar"); // a new pulse replaces the old one
  q.speak("Pathology, 12 metres", { interrupt: false, tag: "sonar" });
  await settle();
  assert.strictEqual(h.log.stopped, 0, "the building description was not cut off");
  h.finishPlay();
  await settle();
  h.finishPlay();
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:Medical Center, 6 metres ahead", "audio:Pathology, 12 metres"]);
});

test("captions: the start and end hooks fire exactly around what is heard, never for dropped lines", async () => {
  const { createVoiceQueue } = await import(CORE);
  const events = [];
  const gate = deferred();
  const h = harness({ holdLoad: false, holdPlay: true });
  let synthCount = 0;
  const q = createVoiceQueue({
    ...h.opts,
    synth: async (e, t) => { synthCount++; if (t === "Abandoned") await gate.p; return `audio:${t}`; },
    play: (audio) => { events.push(`play ${audio}`); return h.opts.play(audio); },
    onStart: (text) => events.push(`start ${text}`),
    onEnd: (text) => events.push(`end ${text}`),
  });
  q.speak("Medical Center — 6 metres ahead", { interrupt: false });
  await settle();
  assert.deepStrictEqual(events, ["start Medical Center, 6 metres ahead", "play audio:Medical Center, 6 metres ahead"],
    "the caption shows the sanitised text the voice actually says, as it starts");
  h.finishPlay();
  await settle();
  assert.deepStrictEqual(events.slice(2), ["end Medical Center, 6 metres ahead"]);

  events.length = 0;
  q.speak("Abandoned", { interrupt: false });
  await settle();
  q.stop();
  gate.resolve();
  await settle();
  assert.ok(synthCount >= 2);
  assert.deepStrictEqual(events, [], "a line stopped before it was heard never flashes a caption");

  q.speak("Sherman Building", { interrupt: false, tag: "sonar" });
  await settle();
  q.cancel("sonar");
  await settle();
  assert.deepStrictEqual(events, ["start Sherman Building", "play audio:Sherman Building", "end Sherman Building"],
    "a line cut off mid-speech ends its caption");
});

test("captions: lines shown without the voice stay up long enough to read", async () => {
  const { readingMs } = await import(CORE);
  const short = readingMs("Voice off.");
  const long = readingMs("Sonar: Hotel Med Park, right here, behind right. Sherman Building, 19 metres, ahead. Davis I Building, 30 metres, behind.");
  assert.ok(short >= 2500, `a short line still gets time to be noticed (${short} ms)`);
  assert.ok(long > short, "longer lines stay longer");
  assert.ok(readingMs("word ".repeat(500)) <= 12000, "but never park on screen indefinitely");
});

test("speech: cancelling the source that is speaking right now stops it, and the rest still plays", async () => {
  const { createVoiceQueue } = await import(CORE);
  const h = harness({ holdLoad: false, holdPlay: true });
  const q = createVoiceQueue(h.opts);
  q.speak("Sherman Building, 19 metres", { interrupt: false, tag: "sonar" });
  q.speak("Medical Center", { interrupt: false });
  await settle();
  q.cancel("sonar");
  await settle();
  assert.strictEqual(h.log.stopped, 1);
  h.finishPlay();
  await settle();
  assert.deepStrictEqual(h.log.played, ["audio:Sherman Building, 19 metres", "audio:Medical Center"]);
});
