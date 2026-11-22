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
  height carries its provenance (`OpenStreetMap` / `floorplan` / `estimated` /
  `curated`, or `not mapped` where no source gives the storeys, as over the
  Medical Center's outline outside its towers and Pavilion).
- **The Medical Center is built from its floor plan**, not from OSM shells: the
  13 traced floors are registered onto the real footprints (podium → towers +
  pavilion → towers → Davis Tower) and you can **walk in through the Main or
  Emergency entrance**, use the **elevators** (every floor the bank reaches) or
  the **stairs** (one flight at a time) and find the printed plan's numbered
  departments on each floor.
- **12.4 km of real pedestrian network**, streets, lots and parks from OSM.
- **Live construction**: active zones from the 2D map's schedule are fenced,
  covered in hazard stripes and signed with the admin's end date. A building
  that lies mostly inside an active site (the California Tower) is drawn as a
  translucent ghost of its planned mass, so the site reads as a site and the
  cover stays visible; Vanderhoef Commons is an outdoor field and stays flat.
  covered in yellow/black hazard stripes, signed "Caution — construction site
  until <end date>" (the admin's date, or "until further notice"), solid to
  the walker, hatched on the inset map, and routed around. The "Construction
  labels" toggle hides the signs only; fences and the striped cover always
  show. The Layers list carries the same words as text.
- **Shuttle stops, SacRT bus stops and points of interest** (valet, assisted
  drop-off, bike lockers) as sign posts, each also a guide destination. Layer
  toggles mirror the 2D map's defaults.
- **278 neighbourhood buildings** as unnamed context.
- Light/dark theme following `prefers-color-scheme`, toggleable, persisted.
- **An inset 2D map** in the lower-left corner (**Move** sends it to the top
  right and back, **Hide** tucks it away): north-up, following you — or the
  overhead camera — with your heading, the floor you're on, construction and
  the guided route. Click a spot on it to see that spot from overhead.
- **Overhead gauges**: in the overhead view, the heading 0-360 along the top
  (0 north, 90 east: the way the camera faces, N E S W marked) and the pitch
  0-90 on the side (0 looking straight down, 90 level with the horizon); the
  view opens at 45. `H` says both; they step aside for the panel and the map.
- **The side panel collapses to a ☰ Menu button**; it starts collapsed on
  narrow screens. Menu, map corner, zoom and visibility are remembered.

### What is estimated, so nobody mistakes the picture for a survey

- Floor **shapes** are real OSM footprints, so the building never warps or
  overlaps its neighbours. The printed plan is an oblique drawing and explicitly
  *not to scale*, so it is used only to place **rooms**, which are fitted into
  the footprint and clamped inside it — their positions are approximate.
- Where a tier has several footprints (the three towers; the Pavilion on 2–3),
  they are joined by **connector bands** so each floor is one walkable piece.
  The plan only says that the towers join; the band's geometry comes from the
  footprints' facing edges, never from the drawing.
- **Corridors and partitions are inferred from room positions, not surveyed.**
  On a building-aligned 3 m grid, a corridor spine runs from the main elevators
  to every elevator, stairwell, entrance and connector, with a spur to each
  room; rooms are the cells nearest their node, walled from each other and from
  the corridor except at a door. The walker collides with these walls and the
  guided route follows the corridors — but the real hospital's layout differs.
- The plan shows no stairwells; one is placed beside the main elevators on each
  floor and labelled **"position estimated"** in the scene and the picker.
- Almost every building height is a category estimate; OSM tags storeys on only
  four buildings in the whole area.

## Controls

| Input | Action |
|---|---|
| `W A S D` | walk (`Shift` runs) |
| Arrow keys | look around — one tap turns a little, holding keeps turning |
| Drag | look around (mouse / touch); with two fingers on the view, the first one down turns it |
| Joystick (touch screens only, at the bottom: bottom left, or beside the inset map when the map is there) | walk the way you face: up forward, down back, left and right sideways; the further you push, the faster, rising evenly to a run near the rim. A second finger anywhere else on the view looks around at the same time. Let go to stop. Overhead, it moves the map: up is the way the camera faces. It appears only on a touch screen and steps around the inset map and the panel's Menu row (the open panel stops above it); with large text on a small screen it shrinks, and where there is still no room it waits out of sight until the panel closes or the inset map moves. It lets go when a dialog opens, the page hides, the screen turns or the view changes |
| `E` / **What's ahead** | identify the building ahead (name, distance, direction, floors and how sure we are); at an elevator or stairs, use it instead |
| `P` / **Sonar** | a pulse: each nearby building (or room, indoors) echoes from its position, then is named with distance and direction |
| **Voice on/off** | Amy, the Piper neural voice, reads buildings and announcements aloud (on by default; a screen-reader user who already hears the live region turns it off once and it stays off) |
| **Captions on/off** | show or hide the caption line at the bottom of the screen: what the voice is saying, or each announcement when the voice is off (on by default) |
| `G` / **Guide me** button | start (or stop) guidance to the chosen destination |
| `V` / **Overhead view** button | switch to the overhead orbit camera and back |
| Overhead: `W` `A` `S` `D` | move the view north, west, south, east (whichever way the camera faces) |
| Overhead: `↑` `↓`, `←` `→` (also `PgUp` `PgDn`, `Q` `E`) | tilt, turn |
| Overhead: `+` `−`, drag, Shift+drag | zoom, move the map, turn it |
| Overhead: `H` | say the heading and the pitch shown on the gauges |
| **Menu** | collapse or expand the side panel (Use elevator stays visible either way) |
| Map **+** **−** / **Move** / **Hide** | zoom the inset map (120 m to 2 km across), move it between the lower-left and top-right corners, hide or show it |
| Click the inset map | look at that spot in the overhead view (the keyboard equivalent is moving the overhead view with `W` `A` `S` `D`) |
| `Tab` | leave the map (nothing traps focus) |

### In a VR headset

**Enter VR** shows in the panel only where the browser can start a headset session (the
headset's own browser, or a PC browser with a headset attached); inside a session it reads
**Exit VR**. A headset never shows the page, so the controllers and a menu inside the headset
take over from the panel and the keys:

| Controller | Action |
|---|---|
| Left stick | walk where you look (a full push walks; hold a grip to run). Overhead, fly over the map |
| Right stick | turn 30° per push (or smoothly: the menu's **Turning** row, remembered). Overhead, up and down climb and sink |
| One controller alone | its stick walks forward and back and turns sideways |
| Point at the ground, pull the trigger (or pinch) | hop there (a ring shows where). Never into a building or a fenced site, never through a wall; aimed at a Medical Center door, through it |
| `B` or `Y` | show or hide the menu; a trigger or pinch pointing anywhere but the ground shows it too |
| Point at a menu row, pull the trigger | choose it: the rows are the panel's own buttons (Overhead view, Use elevator, Nearest elevator, Stop guiding, What's ahead, Sonar, Voice, Dark mode), plus Turning, Hear the controls, Exit VR and Close menu. The voice reads the row a ray lands on and what a choice did |
| At an elevator or stairs | the menu's **Use** row opens the floor picker, whose floors become the menu's rows (**Stay on this floor** cancels) |

Stepping about the room moves you on the map too, and walls and fences hold you back as the
sticks do; a hop starts from where your head is, and a turn pivots about it. What's ahead and
Sonar say "ahead", "left" and so on from where your head faces. Leaving VR puts the flat view
back as it was (at the window's size then, if it changed during the session). The menu speaks through the Voice switch: with the
voice off it is silent (its **Voice** row turns it back on).

Walk into a Medical Center entrance to go inside; walk back through the door to
leave. Every transition and every floor change is announced in a live region.

## Voice: Piper neural speech

Buildings are read aloud by **Amy** (`en_US-amy-low`), a Piper neural voice that
runs entirely in the browser: What's ahead, a click on a building, and every
sonar echo as it returns, plus route guidance and the other announcements.
Nothing is sent to a server. The first announcement waits for the one-to-two
second warm-up rather than falling back to another voice, and a new sonar pulse
replaces only the previous pulse's echoes, never a building description still
being read. Every spoken line is also written to the live region; the startup
summary goes to the live region only, so no audio plays before you act.

**Captions** show what Amy is saying at the bottom of the screen, line by line
as she says it, lingering briefly after. With the voice off they show each
announcement instead, held long enough to read, so nothing depends on hearing.
**Captions on/off** in the panel hides them, and the choice is remembered.
They are hidden from screen readers, which already get the same text from the
live region.

The voice files (~160 MB) are **not in git**. Vendor them once:

```
PIPER_SRC=/path/to/3D-UCDCampusMap/3d/lib/piper tools/fetch-piper.sh
```

The script accepts only the exact files in `tools/piper-manifest.sha256` (no
extras, no symlinks), verifies every checksum in a staging directory, and swaps
the result into `3d/lib/piper/`. Without the files the map still runs and speaks
through the browser's own voice.

- **CSP exceptions**, both for the voice: `script-src 'wasm-unsafe-eval'`
  compiles its WebAssembly (it does not permit JavaScript `eval`), and
  `connect-src blob:` lets the engine fetch blob URLs it created itself.
- **What is inside the bundle.** `piper-tts-web.js` embeds ONNX Runtime Web
  v1.20.1 and Hugging Face transformers.js, whose defaults point at
  `huggingface.co` and `cdn.jsdelivr.net`. `speech.js` overrides every base
  path to `lib/piper/`, and the CSP's `connect-src 'self' blob:` blocks both
  hosts regardless. The bundle's own piper-tts-web version is not recorded in
  the file; it is byte-identical to the Davis build's copy. Slimming it to the
  Piper, ONNX runtime and phonemizer code it actually uses is a follow-up.
- **Licences:** piper-tts-web and ONNX Runtime Web are MIT; the Amy voice is
  from rhasspy/piper-voices (see its model card for terms).

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
| `hospital.js` | Medical Center massing (footprints + connectors), interiors, walls, walkability and indoor routing helpers |
| `interior-core.js` | pure: the building-aligned interior grid — cells, walls, `walkable()`, `routeIndoor()` (shared with the generator; node-tested) |
| `player.js` | first-person walker, doors, elevator/stairs proximity |
| `elevator-ui.js` | floor picker (`<dialog>`) |
| `layers.js` | construction fencing (solid to the walker), hazard cover and signs, shuttle/bus stops, POIs |
| `caution-core.js` | pure: end-date formatting, "Caution — construction site until…" wording, sign sizing and placement (node-tested) |
| `caution.js` | the hazard stripe texture/material and the yellow caution sprite |
| `speech.js` / `sonar.js` / `picking.js` | voice, sonar, identify-what's-ahead (`spatial-core.js` is the tested maths) |
| `session.js` / `peers.js` | tours and events: lobby, sync loop, group panel, peer avatars |
| `route-core.js` | pedestrian router over the OSM network (pure; node-tested) |
| `wayfind.js` | guided route: ribbon, legs, re-routing, arrival, indoor continuation |
| `vr.js` / `vr-controls.js` | the VR view: the Enter VR button, the session, the camera rigs (at the walker's feet; a flying one overhead), the controllers and the menu inside the headset (`vr-math.js` is the tested maths: sticks, turns, the walk a stick asks for, the hop's check, the flight, the menu's layout) |
| `touch-controls.js` | the touch joystick: shown on a touch screen only, pointer-only and `aria-hidden` (`joystick-core.js` is the tested maths: the knob, the dead zone, walk and pan directions, placement) |
| `overhead.js` | keyboard-first orbit camera (`overhead-core.js` is the tested maths: keys, drag, heading and pitch, gauge placement) |
| `gauges.js` | the overhead view's heading strip (0-360 along the top) and pitch scale (0 straight down to 90 level, on the side) |
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
