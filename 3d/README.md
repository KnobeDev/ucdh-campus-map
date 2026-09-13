# UC Davis Health — 3D Walkable Campus (Three.js)

First-person 3D version of the Sacramento campus map, built from the same
curated data as the 2D app plus OpenStreetMap geometry. No build step — vanilla
ES modules and a vendored Three.js r166 (`lib/`, no CDN at runtime, strict
same-origin CSP).

**Run:** `../serve.sh` then open `http://localhost:8092/3d/` (`serve.py` = static
files + the tour/event session API; any static server still serves the map, but
tours need `serve.py`).

## Sessions: Guest, Tour, Event

Opening the 3D map shows a lobby first. **Guest** is a solo walk. **Lead a Tour**
/ **Host an Event** create a live session and hand the guide a six-character
code (no 0/O/1/I/L — codes are read aloud); others enter it to join, and can
join mid-walk from the HUD. Everyone sees everyone else as an avatar with a
name tag; the guide wears gold and a beacon. Members keep every control except
guidance, which is the guide's, and stay within 200 ft of the guide on the same
floor. The guide's day/night theme is adopted on join; sound is never synced.
The group panel (or the corner code chip) lists everyone with live distances —
or their floor, when they're on another one — and gives the guide a two-tap
Remove. A refresh resumes the session; the session survives a silent guide for
60 s, then ends for everyone.

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
- **Live construction**: active zones from the 2D map's schedule are fenced,
  labelled with their end date, solid to the walker, and routed around.
- **Shuttle stops, SacRT bus stops and points of interest** (valet, assisted
  drop-off, bike lockers) as sign posts, each also a guide destination. Layer
  toggles mirror the 2D map's defaults.
- **278 neighbourhood buildings** as unnamed context.
- Light/dark theme following `prefers-color-scheme`, toggleable, persisted.
- **An inset 2D map** in the lower-left corner (**Move** sends it to the top
  right and back, **Hide** tucks it away): north-up, following you — or the
  overhead camera — with your heading, the floor you're on, construction and
  the guided route. Click a spot on it to see that spot from overhead.
- **The side panel collapses to a ☰ Menu button**; it starts collapsed on
  narrow screens. Menu, map corner, zoom and visibility are remembered.

### What is estimated, so nobody mistakes the picture for a survey

- Floor **shapes** are real OSM footprints, so the building never warps or
  overlaps its neighbours. The printed plan is an oblique drawing and explicitly
  *not to scale*, so it is used only to place **rooms**, which are fitted into
  the footprint and clamped inside it — their positions are approximate.
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
| `E` / **What's ahead** | identify the building ahead (name, distance, direction, floors and how sure we are); at an elevator or stairs, use it instead |
| `P` / **Sonar** | a pulse: each nearby building (or room, indoors) echoes from its position, then is named with distance and direction |
| **Voice on/off** | read every announcement aloud (off by default; screen readers already speak the live region) |
| `G` / **Guide me** button | start (or stop) guidance to the chosen destination |
| `V` / **Overhead view** button | switch to the overhead orbit camera and back |
| Overhead: arrows, `Q` `E`, `PgUp` `PgDn`, `+` `−` | pan, rotate, tilt, zoom |
| **Menu** | collapse or expand the side panel (Use elevator stays visible either way) |
| Map **+** **−** / **Move** / **Hide** | zoom the inset map (120 m to 2 km across), move it between the lower-left and top-right corners, hide or show it |
| Click the inset map | look at that spot in the overhead view (the keyboard equivalent is panning the overhead view) |
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
| `layers.js` | construction fencing (solid to the walker), shuttle/bus stops, POIs |
| `speech.js` / `sonar.js` / `picking.js` | voice, sonar, identify-what's-ahead (`spatial-core.js` is the tested maths) |
| `session.js` / `peers.js` | tours and events: lobby, sync loop, group panel, peer avatars |
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
