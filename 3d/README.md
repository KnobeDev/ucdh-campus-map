# UC Davis Health — 3D Walkable Campus (Three.js)

First-person 3D version of the Sacramento campus map, built from the same
curated data as the 2D app plus OpenStreetMap geometry. No build step — vanilla
ES modules and a vendored Three.js r166 (`lib/`, no CDN at runtime, strict
same-origin CSP).

**Run:** `../serve.sh` then open `http://localhost:8092/3d/`.

## What's in the scene

- **71 campus buildings** with identity from the 2D map (`data.jsx` +
  `default-edits.json`) and footprints from OSM where OSM has them; 12 buildings
  OSM has never mapped are extruded from the hand-traced polygons instead. Every
  height carries its provenance (`OpenStreetMap` / `floorplan` / `estimated`).
- **The Medical Center is built from its floor plan**, not from OSM shells: the
  13 traced floors are registered onto the real footprints (podium → towers +
  pavilion → towers → Davis Tower) and you can **walk in through the Main or
  Emergency entrance**, use the **elevators** (every floor the bank reaches) or
  the **stairs** (one flight at a time) and find the printed plan's numbered
  departments on each floor.
- **12.4 km of real pedestrian network**, streets, lots and parks from OSM.
- **278 neighbourhood buildings** as unnamed context.
- Light/dark theme following `prefers-color-scheme`, toggleable, persisted.

### What is estimated, so nobody mistakes the picture for a survey

- The printed floor plan is explicitly *not to scale*; each floor is fitted to
  its footprint's bounding box, so room positions are approximate.
- Corridors are not traced yet — every floor is open space.
- The plan shows no stairwells; one is placed beside the main elevators on each
  floor and labelled **"position estimated"** in the scene and the picker.
- Almost every building height is a category estimate; OSM tags storeys on only
  four buildings in the whole area.

## Controls

| Input | Action |
|---|---|
| `W A S D` | walk (`Shift` runs) |
| Arrow keys | look around — one tap turns a little, holding keeps turning |
| Drag | look around (mouse / touch) |
| `E` / **Use …** button | use the elevator or stairs you are standing at |
| `G` / **Guide me** button | start (or stop) guidance to the chosen destination |
| `V` / **Overhead view** button | switch to the overhead orbit camera and back |
| Overhead: arrows, `Q` `E`, `PgUp` `PgDn`, `+` `−` | pan, rotate, tilt, zoom |
| `Tab` | leave the map (nothing traps focus) |

Walk into a Medical Center entrance to go inside; walk back through the door to
leave. Every transition and every floor change is announced in a live region.

## Wayfinding

Pick a **Start** (any building, or where you stand) and a destination — a
building, a department, a Medical Center entrance, or any numbered room on any
floor — and press **Guide me**. A gold ribbon follows real walkways (footways
first, streets only as a last resort; **Step-free** excludes steps; active
construction zones are cut exactly as the 2D map cuts them), the panel lists
the legs ("Follow X Street for 215 m"), and distances are spoken every ~30 m.
For a room, the route continues through the accessible entrance, to the
elevators (the picker pre-selects your floor), and on to the room. Indoor legs
are straight lines until corridors are traced in the 2D editor.

## Files

| File | Purpose |
|---|---|
| `main.js` | boot, HUD wiring, render loop |
| `world.js` | renderer, camera, lights, theme application |
| `theme.js` | light/dark palettes (the 2D category colours, lifted to pastel) |
| `buildings.js` | footprint extrusion, spatial hash, point-in-polygon |
| `ground.js` | OSM paths as mitered ribbons, lots/parks as patches |
| `hospital.js` | Medical Center massing + interiors + walkability helpers |
| `player.js` | first-person walker, doors, elevator/stairs proximity |
| `elevator-ui.js` | floor picker (`<dialog>`) |
| `route-core.js` | pedestrian router over the OSM network (pure; node-tested) |
| `wayfind.js` | guided route: ribbon, legs, re-routing, arrival, indoor continuation |
| `overhead.js` | keyboard-first orbit camera |
| `labels.js` | canvas-texture text sprites |
| `geometry.js` | shared ring → shape/extrude helpers, the merge-bucket rule |
| `campus-data.json` | generated — `node ../tools/gen-3d-data.js` |

## Regenerating data

```bash
./tools/fetch-osm.sh          # refresh the OSM extract (validated, atomic)
node tools/gen-3d-data.js     # rebuild 3d/campus-data.json + the join report
node --test "tools/test/*.test.js"
```

Read the join report the generator prints. It is conservative on purpose.

Building and path geometry © OpenStreetMap contributors, ODbL.
