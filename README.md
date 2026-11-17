# UC Davis Health — Sacramento Campus Map

Interactive digital wayfinding map for the UC Davis Health Sacramento campus.

**Live demo:** https://jdhori.github.io/ucdh-campus-map/

A self-contained React prototype (no build step — uses `babel-standalone`) that
overlays interactive hotspots on the official campus map PNG. Search by clinic
or department, plot walking routes that avoid building footprints, and hand off
to native maps on phone.

## Features

- **Search** by building name, code, department, or clinic
- **Wayfinding** — pick any From/To, get a routed walking path that avoids buildings and active construction zones (parking lots and parks are walkable)
- **Polygon hotspots** matching real building footprints (60+ buildings, parking lots, shuttle stops, bus stops, points of interest)
- **SVG vector basemap** that scales cleanly at any zoom (campus-map.svg)
- **Layer toggles** — shuttle stops, points of interest, building entrances, crosswalks, building names, plus a reduce-animation switch
- **Category filters** (Hospital, Clinic, Research, Education, Admin, Amenity, Non-UC Davis) with the filter dim-overlay made transparent enough to keep the underlying basemap legible
- **Parking sub-types** — patient/visitor (green), staff-only (beige), contractor-only (grey)
- **Pan / zoom** with mouse wheel + drag
- **Get directions on phone** — opens the destination in Apple Maps on iOS / macOS, Google Maps elsewhere; queries are anchored to "UC Davis Health, Sacramento, CA" so common building names don't collide with off-campus locations
- **Construction zones** — striped overlay polygons that route the walker around them; auto-expire when their `endDate` passes; editable per-vertex like building polygons
- **Full edit mode** — every map element is a first-class CRUD object:
  - Hotspots (buildings) — click empty map to create, drag/resize/polygonize, edit name/label/category, delete or hide-base
  - Shuttle stops — click to add, rename, drag, delete (base stops are tombstoned)
  - Waypoints, paths, entrances (♿), crosswalks, points of interest
  - Construction zones — full polygon editor with end-date scheduling
- **Apply versioning** — the Apply button writes `default-edits.json` with a fresh `_version` stamp; the loader auto-resets stale `localStorage` on visitors' next page load, so each push is picked up automatically

## Running locally

`file://` won't work — Chrome blocks fetching the JSX modules. Serve over HTTP:

```bash
./serve.sh
# then open http://localhost:8092/
```

Or any static server (`python3 -m http.server`, `npx serve`, etc.) pointed at this directory.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Entry point |
| `app.jsx` | Top-level component, tweaks panel state |
| `data.jsx` | 50+ buildings, parking, shuttle stops, base graph |
| `map.jsx` | SVG overlay on the inlined campus PNG |
| `sidebar.jsx` | Search, filters, building detail, From/To wayfinding |
| `routing.jsx` | Dijkstra over a dense walking grid that avoids buildings |
| `route-pins.jsx` | localStorage-backed custom-route waypoints |
| `edit-store.jsx` | Override store, localStorage persistence, JSON export |
| `edit-overlay.jsx` | Drag/resize/polygon handles, waypoint editor |
| `edit-toolbar.jsx` | Edit-mode toolbar + import/export modal |
| `tweaks-panel.jsx` | Theme + layer toggles |
| `default-edits.json` | Bundled polygon shapes / overrides |
| `default-edits-loader.js` | Seeds localStorage with defaults on first load |
| `campus-map.svg` | Vector campus map background |
| `campus-map-inline.js` | Base64-inlined PNG fallback (kept for revert) |
| `styles.css` | All styling |

## Two builds: local and site

One file, `3d/app-config.json`, switches the map between two builds. Nothing a
visitor controls (a URL parameter, the browser's storage) is consulted, and
anything wrong with the file means the site build.

| | Local (this repo's committed file) | Site (an unofficial public test build) |
|---|---|---|
| Base map | the picture the editor draws over (`campus-map.svg`) | drawn from `3d/campus-data.json`: OpenStreetMap streets, paths, lawns and building outlines (`drawn-basemap.js`) |
| Buildings, stops, places, closures, walking graph | `data.jsx` plus `default-edits.json` and your own edits | the same data file the 3D map reads, placed by its georeference (`site-data.js`), so 2D and 3D agree |
| A building OpenStreetMap has no outline for | its traced polygon | a named marker at its place; a tracing of the official map never ships |
| Editor, Tweaks panel, messages to a host page | on | off |
| Browser storage | edits, backups and route pins | nothing is read or written |
| Distances in directions | the old estimate | the real scale from the georeference |

The 3D map follows the same file:

| | Local | Site |
|---|---|---|
| Campus data | `3d/campus-data.json` | `3d/campus-data.site.json`, the same campus with no outline traced over the official map (both maps read it) |
| Tours, events, joining with a code | offered (needs `./serve.sh`) | not offered; nothing is asked of a server under `/api` |
| Voice | Piper ("Amy"), from `3d/lib/piper/` | the browser's own voice; Piper is never requested |
| A building OpenStreetMap has no outline for | its traced shape | a named signpost, and a dot on the inset map |
| Members' extras (`3d/fun/`) | on | loaded only after the site's server says this visit includes them |

`3d/campus-data.site.json` is generated. After every `node tools/gen-3d-data.js`, run:

```bash
node tools/site-data.js          # writes 3d/campus-data.site.json
node tools/site-data.js --check  # exit 1 if it is stale (the tests check this too)
```

There are no members' extras yet: `3d/fun/fun.js` is an empty place for them, so
that anything added there later is members-only from its first day. Nothing a
visitor needs to find their way belongs in it.

`map-mode.js` decides the mode before any other script reads storage or data.
The page carries two lines of plain HTML above the map in both builds: what
the build is ("Unofficial test build — not affiliated with UC Davis Health")
and the data credit ("Map data © OpenStreetMap contributors").

Not in the site build: `campus-map.svg`, `campus-map.png`,
`default-edits.json`, the floor-plan panel (`floorplan.jsx`, drawn over the
official floor diagram), the editor toolbar, and anything under `uploads/`.
The site compiles the JSX ahead of time and serves React itself, so its page
loads nothing from another host.

## Accessibility of the 2D map

The target is WCAG 2.1 Level A and AA. What the page does:

- **Everything works from the keyboard.** The map's shapes are a mouse and touch
  convenience; every building is in the Buildings A–Z list, and the map is
  named to a screen reader as a picture that says so. The map moves with four
  "Move map" buttons and zooms with three more, and a finger drags it.
- **It has a structure.** One `main`, one `h1`, a heading on every section,
  real tabs (arrow keys switch them), and a named map region.
- **Nothing happens silently.** Search results, "no places match", a route's
  time and length, and "no walking route was found" are shown and announced.
- **Focus follows you.** Opening a place puts focus on its name; Back returns
  to the search; a list you close gives focus back to its button.
- **Colours hold their contrast.** Text on a coloured badge is white or dark,
  whichever reads better (`ink.js`); every focus ring and field edge is 3:1.
- **Nothing is only on the picture.** Construction closures and building
  entrances, once drawn only on the map, are also lists in the sidebar.
- **It reflows.** At 400% zoom the page becomes one scrolling column. On a
  narrow window the map is above the places, and first in the page's order too.

Checked by `tools/test/a11y.browser.test.js` (keyboard paths, names, focus,
contrast, reflow, and an axe scan of five states at two widths). **Not yet
checked by a person** with a screen reader, voice control or browser zoom;
automated checks find a minority of problems. Not covered by this pass: the
editor, the Tweaks panel and the floor-plan panel, which are local only.

## Tests

```bash
node --test "tools/test/*.test.js"
# with a browser (any Playwright install), the 2D page in both builds:
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node --test tools/test/site-mode.browser.test.js
# the 3D page in both builds (software rendering is enough):
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node --test tools/test/site-3d.browser.test.js
# and the 2D page's accessibility, with axe:
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright AXE_MODULE=/path/to/node_modules/axe-core \
  node --test tools/test/a11y.browser.test.js
```

## License

MIT — see [LICENSE](LICENSE).

The campus map artwork and "UC Davis Health" branding remain property of UC Regents.
