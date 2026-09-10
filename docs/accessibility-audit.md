# Accessibility audit — UC Davis Health 3D Walkable Campus

Conformance target: **WCAG 2.1 Level A and AA** (the ADA Title II baseline).
WCAG 2.2 criteria are recorded as recommendations, never as failures.

Method: every phase of the 3D build was reviewed by the `a11y-architect` agent
against the code, with contrast ratios computed from the actual CSS tokens and
the Three.js palette, then each finding was fixed and re-verified live in the
Browser pane. **This is a code-level audit.** The passes below still owed
before sign-off are listed at the end; only a person at a real screen reader
and a real dictation tool can do them.

## Findings fixed, by phase (2026-09-09)

| Phase | SC | Severity | Finding | Fix |
|---|---|---|---|---|
| 2 | 4.1.3 | CRITICAL | Load summary written to the live region while its ancestor was `hidden` — never announced | `#status` moved outside the HUD, never hidden, written synchronously |
| 2 | 2.1.1 | HIGH | Camera tilt was mouse-only | PageUp/PageDown, Shift+↑/↓; every key tap nudges, holding continues |
| 2 | 1.4.11 | HIGH | Light-theme focus ring 2.56:1 over the sky | Near-black canvas ring in light, gold at night |
| 3/6 | 2.1.4 | CRITICAL | WASD/E/V fired with focus on a HUD button (`d` in "Dark mode" strafed the walker) | Single-character shortcuts require the map to have focus |
| 3/6 | 1.4.10 | CRITICAL | 13-floor picker had no scroll box under `body{overflow:hidden}` | `max-height` + `overflow-y:auto` |
| 3/6 | 1.4.3 | HIGH | Use-button green 3.2:1 in light theme | `#0a7a3f`, 5.4:1 |
| 3/6 | — | HIGH | No non-visual feedback on hitting a wall | "Wall — no way through here", throttled, on every rejected step |
| 3/6 | — | MEDIUM | Walker kept moving behind the modal | Paused while any dialog is open |
| 5 | 4.1.3 | HIGH | Two polite live regions updated every 0.7 s | Summary is visual-only; `#status` is the single spoken channel, distance milestones every 30 m on every leg |
| 5 | 3.2.6 (2.2) | MEDIUM | `G` undocumented | In the canvas label and the hint |
| 7 | 1.1.1 | HIGH | Construction closures existed only as sprites | "Active construction" text list under Layers; count in the boot summary |
| 7 | — | MEDIUM | Layer toggle hid the fence but left it solid | Fences always shown; the toggle hides labels/fill only |
| 4 | — | HIGH | Boot summary bypassed the voice | Routed through `say()` |
| 4 | — | MEDIUM | Voice on by default double-spoke for screen-reader users | Off by default, one-click opt-in, persisted |
| 4 | — | MEDIUM | A fast `P` after `E` cut the description off | Identify speaks without interrupting |
| 4 | 2.3.3 (2.2) | LOW | Sonar ring still faded under reduced motion | Held at full opacity |
| 4 | 3.2.5 (AAA) | NOTE | "Open in Maps" opens a new tab silently | Visually-hidden "(opens in a new tab)" |

## Verified passes worth stating

- `role="application"` canvas with a full instruction label; Tab never trapped.
- Every discrete control is a native `<button>`, `<a>`, `<input>` or `<select>`
  with its visible text as its accessible name (SC 2.5.3) — dictation users can
  say what they see. Pointer actions fire on up-event, drags don't pick (2.5.2).
- All text/background pairs ≥ 4.5:1 and all focus rings ≥ 3:1 in both themes.
- Modals are native `<dialog>`s: platform focus trap, Escape, dialog role.
- Nothing moves unless the user moves it; `prefers-reduced-motion` freezes the
  sonar sweep and the peer beacon.
- Sonar's audio-only cues are written to the live region in full, at once.

## Still owed before sign-off

1. **Screen-reader walkthrough** (NVDA, VoiceOver): boot, walk in, elevator
   picker, a guided route, sonar, the lobby.
2. **Dictation / voice-control pass** (Voice Control, Voice Access): "click
   Guide me", "click Level 8", "click Yes, remove".
3. **200 % and 400 % zoom** reflow check of the HUD and both dialogs at 320 px.
4. **Contrast of the gold ribbon over the rendered ground** in both themes — a
   3D render, not a token; needs a screenshot check.
5. An automated axe run against the served build (no Playwright harness is
   installed in this repo yet — see `docs/BUILD_PLAN_3D.md` Phase 9).
