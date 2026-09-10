# UC Davis Health Sacramento — 3D Walkable Campus: Build Plan

Status: **All nine phases built.** Ready for the owner's hands-on pass; the
manual screen-reader, dictation and zoom checks listed in
`docs/accessibility-audit.md` are still owed before any public deployment. Written 2026-09-09 on branch
`claude/ucd-health-campus-3d-82ad07`.

Sibling reference implementation: `/mnt/devdrive/Workbook/3D-UCDCampusMap/3d/`
(UC Davis *Davis* campus, ~16 k lines across 70 ES modules, shipped through v203).
This plan reuses its architecture wholesale and diverges only where a **hospital**
campus differs from an academic one.

---

## 0. Currency check (done)

The repo you are reading **is** the latest UC Davis Health map:

| Check | Result |
|---|---|
| Worktree HEAD | `bef4db1` — *vector floor plan + canonical stage + flush sidebar legend* (2026-05-20) |
| `main` | same commit |
| `origin/main` | same commit — 0 ahead / 0 behind |
| Main checkout `/mnt/devdrive/Workbook/CampusMap` | clean; only ignored files differ |
| Other copies on disk | `UCDCampusMap/` and `3D-UCDCampusMap/` are the **Davis** campus fork — different data, not newer versions of this |
| `~/Downloads/default-edits.json` (Jun 27) | Davis export (Welcome Center etc.), **not** a newer Health export |

⚠️ **One real problem:** `git fetch` against `origin`
(`git@github.com:jdhori/ucdh-campus-map.git`) returns **"Repository not found."**
The local `origin/main` ref is stale-but-equal, so nothing is lost, but the
remote is either renamed/deleted or the SSH identity in use lacks access. Needs
fixing before any of this work can be pushed or the GitHub Pages demo updated.

### What exists today

65 base buildings + 6 added, 21 routing nodes, 13 POIs, 23 shuttle stops,
8 construction zones, 2 entrance sets, and a **13-floor vector floor plan of the
Medical Center** (traced boundaries, room nodes, elevator banks) — all in a
919 × 792 SVG pixel space, with a full in-browser edit mode and versioned
`default-edits.json`.

---

## 1. De-risking spikes (run this session — both passed)

### 1.1 The schematic map is georeferencable

Fitted a single affine from the map's 919 × 792 pixel space to WGS84 Web Mercator
using **18 name-matched control buildings** (`tools/fit-georef.py`):

```
cx = [ 2.095480283557903,  0.019737985258021704, -13521038.178462502 ]
cy = [ 0.002737975444267888, -2.0774730781853026,  4658517.990787355 ]
      # merc_x = cx·[px, py, 1] ;  merc_y = cy·[px, py, 1]
```

* **RMS residual 9.5 m** on the ground; worst point 20.6 m (48X Complex),
  best 1.2 m (Police).
* **Scale 1.639 m/px in x, 1.625 m/px in y** — 0.9 % anisotropy.
* **Rotation 0.07°** — the map is effectively north-up and true-scale.
* Map extent ≈ **1506 m × 1287 m**.

This is the single most important finding: the Sacramento basemap is a
*to-scale* drawing, not a stylised diagram. So every piece of curated semantic
data in `default-edits.json` — buildings, POIs, shuttle stops, ADA entrances,
construction zones, the walking graph — can be **projected into real-world
coordinates automatically**, and real GIS data can be projected back into pixel
space to render in the existing 2D app. One transform serves both directions.

*(9.5 m RMS is a fine join key for name-matching and for placing point features;
it is **not** good enough to be the source of building geometry — see 2.2.)*

### 1.2 OpenStreetMap covers the campus well

`tools/osm-coverage.py`, over the map extent:

| Layer | Inside map | Length |
|---|---|---|
| Building footprints | **175** (200 in bbox) | — |
| Named UCD Health buildings | ~40 incl. Cal Hospital Tower (`building=construction`), Aggie Square Garage, Tschannen Eye Institute | — |
| `footway` + `pedestrian` + `path` | 129 ways | **12.4 km** |
| `service` roads (lots, drives, ambulance bays) | 298 | 23.0 km |
| Residential / secondary / tertiary streets | 112 | 19.6 km |
| Parking areas | 27 | — |
| Bus stops | 24 | — |

No path tracing required — unlike the Davis build, which needed a bespoke
`gen_walk_paths.js` pass over UC Davis GIS.

**Gap:** `building:levels` is present on only **4** buildings in the whole bbox.
Heights must be curated. Reuse the Davis honesty pattern: every building carries
a `heightSource` of `verified` / `OpenStreetMap` / `estimated`, shown on the
info card.

---

## 2. Architecture decisions

### 2.1 Lives in this repo, at `3d/`

Same as Davis: `3d/index.html` is a separate page, linked from the 2D app's HUD
and linking back. No build step, vanilla ES modules, **Three.js r166 vendored
into `3d/lib/`** (copy from the Davis project — 1.3 MB, no CDN at runtime), strict
same-origin CSP with `'wasm-unsafe-eval'` for the TTS engine.

Rationale: the 2D map is the source of truth for all curated data. Splitting
repos would fork `default-edits.json` on day one.

### 2.2 Geometry from OSM, semantics from `default-edits.json`

| Layer | Source |
|---|---|
| Building footprints, walls | **OSM** (real polygons, real corners) |
| Building identity — code, name, category, department list, clinics, entrances, hours, Open-in-Maps target | **`data.jsx` + `default-edits.json`** |
| Join between them | name/code match, **disambiguated by the §1.1 affine** (nearest OSM footprint within ~25 m of the projected pixel centroid) |
| Unmatched curated buildings | fall back to extruding the hand-traced pixel polygon through the affine |
| Paths, roads, parking surfaces | **OSM** |
| Shuttle stops, POIs, ADA entrances, construction zones, valet | curated pixel data → affine |
| Heights | OSM `building:levels` (4) → curated table → category default |

The join is the one piece with real failure modes; §3 Phase 1 ends with a
**printed match report** (matched / ambiguous / unmatched, with distances) that a
human reads before anything renders.

### 2.3 What makes this different from the Davis 3D map

Davis is an exploration toy with genuine accessibility depth. A hospital campus
has a **task**: a patient parks somewhere and has to reach a clinic, often while
stressed, in pain, or navigating for someone else. The plan bends toward that:

1. **Indoor continuation.** The Medical Center floor plan already exists —
   13 floors, traced boundaries, elevator banks. Phase 6 makes the route continue
   *through the door*: lot → entrance → lobby → elevator → floor → clinic, as one
   unbroken guided path. Nothing in the Davis build does this.
2. **Construction is a first-class hazard**, not scenery. The California Hospital
   Tower is mid-build and already tagged `building=construction` in OSM; the
   2D app's 8 construction zones with expiry dates drive both the detour and the
   3D barriers.
3. **Accessible-route mode** — ADA entrances, elevators over stairs, curb-cut-aware
   path preference. This is the whole point of the deliverable, not a toggle.
4. **Arrival rehearsal** over free roaming: the primary flow is "show me what my
   walk from P3 to Cancer Center South looks like", playable before the visit.

---

## 3. Phases

Each phase ends with something runnable. Version-stamp every asset (`?v=N`) the
way both existing apps do, and bump on every publish.

### Phase 1 — Data pipeline → `3d/campus-data.json` ✅ **done 2026-09-09**

`node tools/gen-3d-data.js` — loads `data.jsx` in a `vm` sandbox, applies
`default-edits.json`, reads the cached OSM extract, joins per §2.2, and emits
71 buildings / 76 footprints, 278 context buildings, 730 paths, 68 areas,
8 construction zones and every point feature, all in ENU metres (286 KB).
`node --test "tools/test/*.test.js"` — 18 tests covering the transforms, the
join invariants and the generated artefact.

| Module | Purpose |
|---|---|
| `tools/fetch-osm.sh` | refresh the Overpass extract, atomically |
| `tools/lib/georef.js` | px ↔ WGS84 ↔ ENU transforms |
| `tools/lib/geom.js` | ring area/centroid/IoU/coverage, spike cleanup |
| `tools/lib/curated.js` | data.jsx + default-edits.json merge |
| `tools/lib/osm.js` | extract → classified layers |
| `tools/lib/match.js` | the join |
| `tools/lib/heights.js` | heights + provenance |

**Outcome — 52 of 59 joinable buildings matched (88 %), 0 ambiguous.** The
original ≥ 90 % target assumed Davis-level OSM coverage and was the wrong
measure: 12 curated buildings have **no OSM footprint at all** and can't be
joined by any threshold, so they are reported as `absent` and extruded from the
traced polygon. The remaining 5 `unmatched` and 2 `contested` also fall back to
traced geometry. Nothing is silently dropped.

Three defects the report caught, all now fixed and covered by tests:

1. **Research 1 was matched to Research II** (and 2 to I). Curated uses arabic
   numerals, OSM uses roman, so the numeral carried no weight and the join fell
   through to footprint overlap. Fixed with numeral aliasing in the tokenizer.
2. **Two buildings claimed the same footprint** — the California Hospital Tower
   was rendered by both "California Tower" and an unnamed user hotspot, because
   assignment was sequential. Now a global best-first assignment, one footprint
   to one building.
3. **A rate-limited Overpass response silently replaced the cached extract**
   with an HTML error page. `tools/fetch-osm.sh` now validates before moving.

### ⚠ Phase 1 finding that needs a decision

`Research 1` and `Research 2` are **swapped between the 2D map and OSM**. Both
datasets place the three buildings within ~5 m of each other, but the middle
building is `Research 1` on the curated map and `Research II` in OSM; the north
building is `Research 2` curated and `Research I` in OSM. OSM's north→south
I, II, III ordering is self-consistent, which weakly suggests the 2D map has the
labels reversed — but that is a guess, not a finding.

The join resolves it **in favour of geometry**: each building keeps its curated
identity and stays where the 2D map puts it, so the two apps still agree.

**Resolved 2026-09-09 — the 2D map is right, OSM is wrong.** The official UC
Davis Health campus map (`uploads/SacramentoCampusMap-2025Update-11x17-press.pdf`)
labels the buildings, north to south, RESEARCH 2 / RESEARCH 1 / RESEARCH 3 —
exactly what the curated data says. OSM's own `addr:housenumber` tags (4635 north,
4625 middle, 4645 south) are non-monotonic, which fits a loose attribution. The
verdict lives in `ucdh-data/join-decisions.json`, and the report now lists the
pair under *reviewed conflicts* instead of asking again. (Organic Maps was
considered as a second witness but it is built from OSM, so it can only echo it.)
A fix upstream in OSM would be a kindness to the next person; it is out of scope
here.

### Phase 2 — Scene shell ✅ **done 2026-09-09**

`3d/` now boots: `world.js` (renderer, camera, lights, theme), `theme.js`
(the 2D category palette, lifted to pastel), `buildings.js` (merged-per-category
extrusion + spatial hash + point-in-polygon), `ground.js` (OSM paths as mitered
ribbons, lots/parks as patches, a documented y-stack), `overhead.js` (keyboard-
first orbit camera: arrows/Q/E/±, each tap a discrete nudge, hold to continue),
`boot-guard.js`, strict same-origin CSP, vendored Three.js r166. The 2D sidebar
now carries a **3D view** link and the 3D HUD links back.

Measured in the Browser pane: **20 draw calls, 16k triangles**, no runtime
errors, theme toggle flips `aria-pressed`, the live region announces the load
summary, keyboard pan/rotate/zoom verified by dispatched KeyboardEvents (the
pane's own key action doesn't reach a canvas handler — a recorded quirk).

Two things learned building it:
* **`?v=` must be bumped on every edited module** or Chrome serves the cached
  one — a chunk of time went to "why doesn't my fix work" before that clicked.
* `frame-ancestors` in a `<meta>` CSP is ignored and logs an error. It lives
  in the HTTP header only — a deployment note, not something the page can fix.

Original brief, kept for the record: `world.js` (renderer, camera, lights,
theme), `theme.js`, `buildings.js` (merged-per-category extrusion + spatial hash
+ point-in-polygon), `ground.js` (path/lot/road surfaces), `boot-guard.js`. Copy
the Davis modules and re-point the data; do **not** rewrite them.

**Carry the hard-won Davis rules across verbatim** (they are recorded lessons,
each one cost a debugging session):
* every geometry in a `mergeGeometries` bucket needs an **identical attribute set**
  or the whole bucket silently vanishes;
* every geometry in a `vertexColors: true` material needs a `color` attribute or it
  renders black;
* densify any polyline before applying a height profile;
* flat `ShapeGeometry` tiles cannot be per-vertex dipped to follow terrain.

**Acceptance:** campus renders, 60 fps at desktop, no console errors.

### Phase 3 — Player, collision, camera ✅ **done 2026-09-09** (with Phase 6)

`player.js`: first-person walker, WASD/Shift, arrow-key look with a discrete
nudge per tap, drag look, footprint collision with axis sliding and a
never-trap rule, `V` hands the camera to `overhead.js` and back. Third-person
and minimap deferred. Spawns on the street facing the Main Entrance.

### Phase 6 (pulled forward) — Medical Center interior ✅ **done 2026-09-09**

Owner's request: *"the medical center seems small … make it something users
can walk into and use elevators/stairs."* The measurement behind "small": the
OSM `UC Davis Medical Center` way is a **344 × 199 m outline of the whole
complex**, which extruded eight storeys read as one squat box with the towers
poking out of it. Building from the floor plan fixed size and interior together.

* `tools/lib/floorplan.js` gives each floor the **real OSM footprints** of its
  tier, keyed by what the diagram itself shows: LL/1 → the podium envelope;
  2–3 → Surgery & Emergency Pavilion + the three towers; 4–8 → the three
  towers; 10–14 → Davis Tower. The footprints nest (the Pavilion is 94% inside
  the podium way, Davis Tower 97%, East Wing 100%), so the podium needs that
  one ring alone. Storey index skips 9 and 13 like the building does; Davis
  Tower tops out at 50.4 m. The printed plan is used **only to place rooms**,
  fitted into the tier's extent and clamped inside it. Entrances snap into the
  podium wall; the curated point is kept for provenance.

  **Corrected 2026-09-09 (owner report: "the floor map was done at multiple
  angles and it's showing the warping").** The first pass fitted each traced
  band onto a real bounding box — but the printed plan is an *oblique
  projection*, so every band is a sheared parallelogram whose bbox is far
  larger than the building. Stretching that inflated Level 1 to 42,600 m²
  against a real 32,640 m² podium and pushed **39.5% of the Lower Level and
  32% of Level 1 outside the building**, over Pathology, Parking 3, North
  Addition and the California Tower. Taking shape from the footprints instead
  puts every floor at **0.0% outside, overlapping no building and no road**,
  and let `DOOR_RADIUS_OUT` drop from 18 m to 6 m — that margin existed only to
  bridge the gap the warping created.
* `hospital.js`: exterior massing per floor; per-floor slab, lit ceiling,
  perimeter walls, elevator cores, one **estimated** stairwell beside the main
  elevators, numbered room zones with labels; cutaway hides floors above the
  one you're on. `elevator-ui.js`: a native `<dialog>` picker — every choice is
  a button whose visible text is the floor name.
* Verified in the pane by driving `player.update()` directly: street → Main
  Entrance → Level 1 → elevator → Level 8 (y = 31.1 m, inside the floor-8
  ring) → stairs → Level 10 → back out through the door, each step announced.

Honest limits, all labelled in the scene: the plan is oblique and not to scale,
so **room positions are approximate** — they are fitted into the real footprint
and clamped inside it (37 of 127 needed clamping), and which tier levels 2–3
occupy is a judgement call from the diagram's own tower headers; no corridors traced so floors are open space; stair positions
are invented. Corridor tracing in the 2D editor remains the data task that
lifts indoor routing from coarse to real (§4 item 4).

Original Phase 3 brief follows.

`player.js` (first-person + overhead + third-person), `picking.js`
(pointer-**cancellation-safe** select — fires on up-event, per SC 2.5.2),
`minimap.js`. Buildings block; paths, lots, plazas walk.

**Acceptance:** keyboard-only walk of the full campus with no mouse; WASD + arrow
look; `V` toggles overhead.

### Phase 4 — Accessibility spine ✅ **done 2026-09-09**

`speech.js` (Web Speech voice for every announcement, off by default so a
screen-reader user isn't read to twice; HRTF-panned blips), `picking.js`
(`E` or a click identifies the building ahead: "Medical Center, 30 metres
ahead, 8 floors (estimated)", with a card — category, departments, Guide me
here, Open in Maps), `sonar.js` (`P`: a pulse ticking every 10 m to 40 m,
each building or room echoing from its position, the whole list written to the
live region at once; indoors it lists rooms, elevators and stairs), and
`spatial-core.js` (pure, tested). Piper's neural voice (154 MB, wider CSP)
stays a documented follow-up: Web Speech costs nothing and the page is already
accessible without any voice.

Original brief follows.

### Phase 4 — Accessibility spine (original brief)

* `role="application"` canvas with a full instruction `aria-label`, all speech
  mirrored to an `aria-live` region.
* `E` identifies the building at the crosshair; sonar (`P`) for non-visual
  spatial awareness.
* `prefers-reduced-motion` honoured everywhere motion exists.
* Piper neural TTS (`3d/lib/piper/`, ~154 MB lazy-loaded, MIT) — copy from Davis;
  it must be `.gitignore`d and fetched by a setup script, not committed.

**Acceptance:** `a11y-architect` agent pass, keyboard-only + screen-reader +
**dictation** walkthrough, WCAG 2.1 A/AA clean.

### Phase 5 — Wayfinding ✅ **done 2026-09-09** — outdoors AND through the door

`route-core.js` (pure, node-testable): a graph from the OSM pedestrian network
keyed by shared junction nodes, grid-indexed snapping, Dijkstra with surface
penalties (footways first, streets last), step-free mode that excludes `steps`,
and construction cuts using the 2D app's exact expiry rule. `wayfind.js`: gold
ribbon along real walkways, live re-route, spoken legs and distance milestones,
arrival — and when the goal is inside the Medical Center the route continues:
to the accessible entrance, to the elevators, to the floor, to the room. The
elevator picker pre-focuses the floor the route continues on.

HUD: Start (any building) and Guide-me-to (148 destinations: buildings,
entrances, departments, every Medical Center room by floor), step-free
checkbox, summary + numbered steps. `G` starts/stops guidance.

Verified live: **P3 → Cancer Center South, 439 m, ~5 min, "Follow the service
drive for 181 m, follow X Street for 215 m"**, milestones every ~30 m, arrival.
And the sentence this whole plan was written around: **P3 → Oncology (36),
Level 8** — service drive → Main Entrance → "Take the Main elevators to Level
8, 41 m, follow the gold line" → picker with Level 8 pre-focused → "You're on
Level 8, Oncology is 33 m ahead" → arrived. 28 tests pass.

Indoor legs are straight lines because corridors are untraced (§4 item 4);
they become real corridors the day the 2D editor has them, with no 3D change.

Original brief follows.

### Phase 5 — Outdoor wayfinding (original brief)

`route-graph.js` over the OSM pedestrian network, snapped to curated ADA
entrances; `wayfind.js` gold ribbon + beacon + live re-route + arrival
announcement, ported from Davis. Construction zones from `default-edits.json`
become graph cuts, honouring `endDate` expiry exactly as the 2D router does.

**Acceptance:** every 2D route (any From/To pair the sidebar offers) has a 3D
equivalent that reaches the same entrance.

### Phase 6 — Indoor continuation ⭐ the differentiator

The one phase with no Davis precedent, so it carries the real risk.

* **Spike first:** the 13 floor boundaries live in the floor-plan diagram's
  stacked-band space, not in campus space. Fit a per-floor affine from each band
  to its tower footprint (floor 1 + LL = podium; 2–8 = East Wing/University/Davis
  towers; 10–14 = Davis Tower only). Verify the traced outlines actually match
  the OSM footprint before building on them.
* Extrude floor slabs at `FLOOR_H` intervals, cutaway/ghost the shell when the
  player is inside.
* Extend the route graph vertically: `buildFloorRoute` in `floorplan.jsx` already
  routes floor→elevator→floor; the 3D layer consumes the same function so the two
  apps can never disagree.
* Corridor edges are currently **unseeded** (`edges: 0` on every floor) — the
  router falls back to synthetic edges. Real corridors need tracing in the
  existing 2D editor. That is data work, not code work, and it gates the quality
  of indoor routing.

**Acceptance:** one unbroken guided route from a P3 parking stall to a named
Cancer Center clinic room, spoken at each transition.

### Phase 7 — Health-specific layers ✅ **done 2026-09-09**

`layers.js`: active construction zones as safety-orange fences with posts every
3 m, a translucent fill and a "🚧 name · until date" label — and they are solid
to the walker, who hears "Construction fencing: California Tower Construction,
closed until 2030-02-02. Go around — guidance routes around it." Shuttle stops
(21), curated + OSM SacRT bus stops, and typed POIs (valet, assisted drop-off,
bike lockers, repair stations) as sign posts. Layer checkboxes mirror the 2D
defaults (construction on, the rest off), and every stop and POI is a
destination in the guide list (six groups, 186 destinations).

Original brief follows.

### Phase 7 — Health-specific layers (original brief)

Shuttle stops + routes, valet, ADA entrances, POI markers by type, construction
barriers/noise, emergency department signage. All already curated in 2D; this is
projection + representation.

### Phase 8 — Group tour sessions ✅ **done 2026-09-09**

`serve.py` (stdlib; static files + the session API, ported from Davis with the
admin/editor roles and world actions removed and a `floor` added to the synced
state), `session.js` (lobby as a native `<dialog>` gate — Guest / Lead a Tour /
Host an Event / Join; code chip; group panel with live distances that say
"Level 8" when someone is on another floor; two-tap Remove; 200 ft tether that
only applies on the same floor), `peers.js` (capsule avatars, hidden through
slabs). `serve.sh` now runs `serve.py`; a plain static server still serves the
map and greys out Tour/Event/Join.

Verified on the served build: lobby → tour code spoken letter by letter → a
second participant joined over the API → their avatar and roster row appeared
→ two-tap remove → "Pat was removed from the tour."

Original brief follows.

### Phase 8 — Group tour sessions (original brief)

Port `serve.py` + `session.js` + `peers.js` for guided group tours: new-employee
orientation, pre-surgery family walkthroughs, patient-navigator training. Runs
**last** — Phases 1–7 must be solid first, because this is the only phase that
adds a server dependency the current static app doesn't have (the 2D map is
pure static hosting today, and `serve.sh` must keep degrading gracefully to that:
lobby probes `/api/health`, greys out Tour/Event/Join, Guest still works).

Hospital-specific wrinkle worth deciding during the phase: the Davis build gives
the guide exclusive control of wayfinding and leashes members to 200 ft. For a
patient-navigator tour that's probably right; for an orientation cohort spread
across the campus it may not be.

### Phase 9 — Hardening ✅ **done 2026-09-09**

`docs/security-audit.md` and `docs/accessibility-audit.md` record every finding
and its fix. Security: the stdlib server no longer lists directories or serves
dotfiles (a normal clone would have handed `.git/` to anyone), sync/kick/leave
are rate-limited, the thread pool is bounded, and TLS is documented as a
deployment prerequisite. Accessibility: 17 findings across the phases, from a
live region that was never announced to a destructive button at 1.95:1 in dark
mode. 38 tests. Measured with every layer on: **62 draw calls, 30.5k triangles**.

Still owed, and only a person can do them: a screen-reader walkthrough
(NVDA/VoiceOver), a dictation pass, a 200/400 % zoom reflow check, and a
contrast read of the gold route ribbon over the rendered ground in both themes.

Original brief follows.

### Phase 9 — Hardening (original brief)

Perf budget (Davis targets, hospital campus is ~1/8 the area so aim higher),
`docs/security-audit.md` + `docs/accessibility-audit.md` equivalents, Playwright
smoke tests, CSP review, `code-reviewer` + `security-reviewer` + `a11y-architect`
passes.

---

## 4. Decisions (settled 2026-09-09)

1. **Indoor scope — in for v1.** Phases 1–7, Medical Center indoor included.
2. **Group tours — in for v1.** Phase 8, built last (§3 Phase 8).
3. **The broken `origin`** — owner is handling it outside this work. Until it
   resolves, everything stays on the local branch; do not attempt to push.

### Still open

4. **Corridor tracing** — the Medical Center floors carry room and elevator nodes
   but **zero corridor edges**, so indoor routing currently falls back to
   synthetic edges. Someone has to trace corridors in the existing 2D floor-plan
   editor before Phase 6 routing is trustworthy. Also worth knowing: is there a
   better floor-plan source than the 11×17 ADA PDF/SVG in `uploads/`?

## 5. Risks

| Risk | Mitigation |
|---|---|
| OSM footprint ↔ curated building join is wrong for a few buildings | Phase 1 ends with a human-read match report; unmatched fall back to traced polygons |
| Floor-plan bands don't align to real footprints | Phase 6 opens with a spike; if alignment fails, indoor becomes a schematic 3D stack rather than a georeferenced one |
| Heights are mostly estimates | Label the source on every info card, as Davis does |
| Piper TTS is 154 MB | Lazy-load, gitignore, setup script; native Web Speech fallback |
| Scope creep from the Davis feature list (airshow, fireworks, eggheads…) | A hospital map is a **task tool**. Fun layers are out of scope unless they serve orientation. |

## 6. Provenance

* `tools/fit-georef.py` — the affine fit and residual report (§1.1)
* `tools/osm-coverage.py` — the OSM coverage report (§1.2)
* OSM extract: Overpass (`overpass.kumi.systems`), bbox
  `38.5460,-121.4620,38.5580,-121.4450`, retrieved 2026-09-09. ODbL.
