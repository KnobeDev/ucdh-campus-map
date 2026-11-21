# Data sources — UC Davis Health Sacramento campus

## `osm-sac.json` — OpenStreetMap extract

| | |
|---|---|
| Retrieved | 2026-09-09 |
| Endpoint | `https://overpass-api.de/api/interpreter` |
| Bounding box | `38.5435, -121.4655, 38.5605, -121.4400` |
| Elements | 2099 |
| Licence | © OpenStreetMap contributors, **ODbL** — attribution is required in any published map |

Refresh it with **`./tools/fetch-osm.sh`**, never a bare `curl -o`: Overpass answers
a rate limit with an HTTP 200 *HTML* page, which silently replaces the cache with
an error document (this happened on 2026-09-09). The script downloads to a temp
file, validates that the response parses and carries a plausible element count,
and only then moves it into place; it also falls back across three mirrors.

The bbox is the map extent **plus ~200 m of margin on every side**. The margin is
load-bearing: the first extract stopped at the map edge and MIND Institute,
Aggie Square and the Regenerative Cures buildings had no footprint to match
against, which read as a join failure rather than a clipped download.

Query:

```
[out:json][timeout:150];
(
  way["building"](38.5435,-121.4655,38.5605,-121.4400);
  way["highway"](38.5435,-121.4655,38.5605,-121.4400);
  way["amenity"="parking"](38.5435,-121.4655,38.5605,-121.4400);
  way["leisure"](38.5435,-121.4655,38.5605,-121.4400);
  way["landuse"](38.5435,-121.4655,38.5605,-121.4400);
  node["highway"="bus_stop"](38.5435,-121.4655,38.5605,-121.4400);
);
out geom;
```

### Known coverage gap

OSM tags `building:levels` on only **four** buildings in the entire bbox, so
almost every height in the 3D scene is an estimate. `tools/lib/heights.js`
records the provenance of each one (`OpenStreetMap` / `floorplan` / `estimated`)
and the info card must show it. Twelve curated buildings — Cypress, Western
Fairs, ABMCO, Gratitude Garden, Cancer Survivor Park, the Central Utility Plant,
MIND Institute, MIND Lab, Regenerative Cures, DOJ and two unnamed hotspots —
have **no OSM footprint at all** and are extruded from the hand-traced schematic
polygon instead. That is expected on this campus, not a bug.

## `georef.json` — pixel ↔ world transform

The affine from the 919 × 792 SVG pixel space of `campus-map.svg` to WGS84 Web
Mercator, fitted by `tools/fit-georef.py` on 18 name-matched building centroids.
RMS 9.5 m; see `docs/BUILD_PLAN_3D.md` §1.1. `tools/lib/georef.js` is the runtime
reader and adds the local ENU frame the 3D scene uses.

## `match-report.json` — generated, do not edit

Written by `tools/gen-3d-data.js` on every run: the full curated-building ↔ OSM
footprint join, with scores and reasons. Read it after any regeneration.

## `osm-extra.json` — OpenStreetMap buildings without a building tag

| | |
|---|---|
| Retrieved | 2026-11-20 (date stored in the file) |
| Endpoint | `https://api.openstreetmap.org/api/0.6/way/<id>/full.json` |
| Ways | 796721511 (UC Davis MIND Institute, v6) |
| Licence | © OpenStreetMap contributors, **ODbL**, credited like the main extract |

Some buildings are mapped in OSM with only an amenity tag (here
`amenity=research_institute`) and no `building=*`, so the main extract's
`way["building"]` query never returns them, and the map could show them only
as signposts. `tools/lib/osm.js` offers each way in this file as a building
(marked `addedFrom: "osm-extra"`); a way that a later refresh of the main
extract does return is taken from there instead.

Refresh or add a way with **`node tools/fetch-osm-extra.js`** (the list and the
reason for each way are in that script). It writes only when every way comes
back whole, and records each way's version and edit time.
