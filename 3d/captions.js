// Captions: one visible line at the bottom of the screen showing what the voice
// is saying, as it says it, lingering briefly after. With the voice off, it shows
// the announcement the voice would have made, held long enough to read. For
// anyone who can't hear the voice (deaf or hard of hearing, sound muted, a noisy
// room) and anyone who wants to read along.
//
// aria-hidden in index.html: the same text already reaches assistive technology
// through the #status live region, and exposing it twice would read it twice.
import { prefs } from "./minimap-core.js?v=1";

const KEY = "ucdh3d-captions";
const LINGER_MS = 1500; // after the voice finishes a line, so its last words can still be read
const FADE_MS = 200; // matches the CSS transition

export function createCaptions(el, button) {
  let enabled = prefs.get(KEY) !== "off";
  let hideTimer = 0;
  let fadeTimer = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  const clearTimers = () => { clearTimeout(hideTimer); clearTimeout(fadeTimer); };
  function hideNow() {
    clearTimers();
    el.classList.remove("is-fading");
    el.hidden = true;
    el.textContent = "";
  }
  function hideAfter(ms) {
    clearTimers();
    hideTimer = setTimeout(() => {
      if (reduced.matches) { hideNow(); return; } // no fade under reduced motion: just go
      el.classList.add("is-fading");
      fadeTimer = setTimeout(hideNow, FADE_MS);
    }, ms);
  }

  function syncButton() {
    button.setAttribute("aria-pressed", String(enabled));
    button.querySelector(".btn-txt").textContent = enabled ? "Captions on" : "Captions off";
  }
  syncButton();
  button.addEventListener("click", () => {
    enabled = !enabled;
    prefs.set(KEY, enabled ? "on" : "off"); // only a real toggle persists
    syncButton();
    if (!enabled) hideNow();
  });

  return {
    get enabled() { return enabled; },
    /**
     * Show a line. With holdMs it hides itself on a timer (nothing is being
     * spoken); without, it stays until end() says the voice has finished it.
     */
    show(text, { holdMs } = {}) {
      if (!enabled || !text) return;
      clearTimers();
      el.classList.remove("is-fading");
      el.textContent = text; // text, never markup: it can carry a tour member's name
      el.hidden = false;
      if (holdMs) hideAfter(holdMs);
    },
    /** The voice finished the line, or was cut off: let it linger, then go. */
    end() {
      if (!el.hidden) hideAfter(LINGER_MS);
    },
  };
}
