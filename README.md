# UC Davis Health — Sacramento Campus Map

Interactive digital wayfinding map for the UC Davis Health Sacramento campus.

**Live demo:** https://jdhori.github.io/ucdh-campus-map/

A self-contained React prototype (no build step — uses `babel-standalone`) that
overlays interactive hotspots on the official campus map PNG. Search by clinic
or department, plot walking routes that avoid building footprints, and hand off
to native maps on phone.

## Features

- **Search** by building name, code, department, or clinic
- **Wayfinding** — pick any From/To, get a routed walking path that avoids buildings (parking lots and parks are walkable)
- **Polygon hotspots** matching real building footprints (50+ buildings, parking lots, shuttle stops, points of interest)
- **Layer toggles** — shuttle stops, points of interest, building names, paths, entrances, crosswalks
- **Filters** by category (Hospital, Clinic, Research, Education, Admin, Parking, …)
- **Pan / zoom** with mouse wheel + drag
- **Get directions on phone** — opens the destination in Apple Maps on iOS / macOS, Google Maps elsewhere
- **Edit mode** — drag/resize hotspots, draw polygons, edit waypoints, mark entrances (♿) and crosswalks, export/import edits as JSON
- **Default edits bundled** — polygon shapes ship as `default-edits.json`, auto-loaded on first visit

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
| `campus-map-inline.js` | Base64-inlined campus map PNG |
| `styles.css` | All styling |

## License

MIT — see [LICENSE](LICENSE).

The campus map artwork and "UC Davis Health" branding remain property of UC Regents.
