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

`map-mode.js` decides the mode before any other script reads storage or data.
The page carries two lines of plain HTML above the map in both builds: what
the build is ("Unofficial test build — not affiliated with UC Davis Health")
and the data credit ("Map data © OpenStreetMap contributors").

Not in the site build: `campus-map.svg`, `campus-map.png`,
`default-edits.json`, the floor-plan panel (`floorplan.jsx`, drawn over the
official floor diagram), the editor toolbar, and anything under `uploads/`.
The site compiles the JSX ahead of time and serves React itself, so its page
loads nothing from another host.

## Tests

```bash
node --test "tools/test/*.test.js"
# with a browser (any Playwright install), the 2D page in both builds:
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node --test tools/test/site-mode.browser.test.js
```

## License

MIT — see [LICENSE](LICENSE).

The campus map artwork and "UC Davis Health" branding remain property of UC Regents.
