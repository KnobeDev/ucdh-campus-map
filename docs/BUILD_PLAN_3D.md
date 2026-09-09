# UC Davis Health Sacramento — 3D Walkable Campus: Build Plan

Status: **draft plan, nothing built yet.** Written 2026-09-09 on branch
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
identity and stays where the 2D map puts it, so the two apps still agree. The
disagreement is reported on every run rather than silently resolved. Someone who
knows the campus needs to say which dataset is wrong.

### Phase 2 — Scene shell

`world.js` (renderer, camera, lights, theme), `theme.js`, `buildings.js`
(merged-per-category extrusion + spatial hash + point-in-polygon), `ground.js`
(path/lot/road surfaces), `boot-guard.js`. Copy the Davis modules and re-point
the data; do **not** rewrite them.

**Carry the hard-won Davis rules across verbatim** (they are recorded lessons,
each one cost a debugging session):
* every geometry in a `mergeGeometries` bucket needs an **identical attribute set**
  or the whole bucket silently vanishes;
* every geometry in a `vertexColors: true` material needs a `color` attribute or it
  renders black;
* densify any polyline before applying a height profile;
* flat `ShapeGeometry` tiles cannot be per-vertex dipped to follow terrain.

**Acceptance:** campus renders, 60 fps at desktop, no console errors.

### Phase 3 — Player, collision, camera

`player.js` (first-person + overhead + third-person), `picking.js`
(pointer-**cancellation-safe** select — fires on up-event, per SC 2.5.2),
`minimap.js`. Buildings block; paths, lots, plazas walk.

**Acceptance:** keyboard-only walk of the full campus with no mouse; WASD + arrow
look; `V` toggles overhead.

### Phase 4 — Accessibility spine (not a later polish pass)

* `role="application"` canvas with a full instruction `aria-label`, all speech
  mirrored to an `aria-live` region.
* `E` identifies the building at the crosshair; sonar (`P`) for non-visual
  spatial awareness.
* `prefers-reduced-motion` honoured everywhere motion exists.
* Piper neural TTS (`3d/lib/piper/`, ~154 MB lazy-loaded, MIT) — copy from Davis;
  it must be `.gitignore`d and fetched by a setup script, not committed.

**Acceptance:** `a11y-architect` agent pass, keyboard-only + screen-reader +
**dictation** walkthrough, WCAG 2.1 A/AA clean.

### Phase 5 — Outdoor wayfinding

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

### Phase 7 — Health-specific layers

Shuttle stops + routes, valet, ADA entrances, POI markers by type, construction
barriers/noise, emergency department signage. All already curated in 2D; this is
projection + representation.

### Phase 8 — Group tour sessions (in scope for v1)

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

### Phase 9 — Hardening

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
