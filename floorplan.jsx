// Medical Center floor plan — data + sidebar panel.
//
// Source: 26-0050-map-medical-center-11x17-press.pdf (UCDH, April 2026).
// The PDF is a vertical stacked diagram of three towers (East Wing,
// University Tower, Davis Tower) across 14 floors. We capture the same
// content as structured data so the campus map can offer interactive
// in-building navigation when the Medical Center hotspot is selected.
//
// Numbered locations match the printed legend; entries with `n === null`
// (Cafeteria, Information Desk) appear on the diagram without a number.
// Items 35 ("Medical Surgery and Respiratory Care, 50" in the printed
// alphabetical index) and 37 ("Transplant/Metabolic Special Care Unit, 36"
// in the printed alphabetical index) are corrected here against the
// diagram numbering, which is the source of truth.

const MEDICAL_CENTER_FLOORPLAN = {
  buildingCode: "T",
  buildingName: "UC Davis Medical Center & Children's Hospital",
  address: "2315 Stockton Blvd., Sacramento, CA 95817",
  parkingNote: "Enter parking garage on X St.",
  towers: ["East Wing", "University Tower", "Davis Tower"],
  phones: [
    { label: "Admissions",                    number: "916-734-2450" },
    { label: "Consumer Resource Center",      number: "1-800-282-3284" },
    { label: "Emergency",                     number: "9-1-1" },
    { label: "Patient Relations",             number: "916-734-9777" },
    { label: "Guest Relations Desk",          number: "916-703-6850" },
    { label: "Hospital Operator",             number: "916-734-2011" },
    { label: "Interpreting Services",         number: "916-734-2321" },
    { label: "Parking Information",           number: "916-734-2687" },
    { label: "Police Services",               number: "916-734-2555" },
    { label: "Wheelchair / Mobility",         number: "916-703-4309" },
  ],
  levels: [
    {
      id: "LL", short: "LL", name: "Lower Level",
      rooms: [
        { n: 1, name: "Auditorium" },
      ],
    },
    {
      id: "1", short: "1", name: "Level 1 (Street Level)",
      rooms: [
        { n: 2,    name: "Admissions" },
        { n: 3,    name: "Assisted Patient Discharge" },
        { n: null, name: "Cafeteria" },
        { n: 4,    name: "Cardiology and Vascular Medicine (ECHO, EKG)" },
        { n: 5,    name: "Cashier's Office" },
        { n: 6,    name: "Emergency", emphasis: true },
        { n: null, name: "Information Desk" },
        { n: 7,    name: "Interventional Radiology and Neuroangiography" },
        { n: 8,    name: "Meditation Room" },
        { n: 9,    name: "Radiology – CT/MRI" },
        { n: 10,   name: "Radiology Reception" },
      ],
    },
    {
      id: "2", short: "2", name: "Level 2",
      rooms: [
        { n: 11, name: "Blood Bank and Clinical Lab" },
        { n: 12, name: "Burn Unit" },
        { n: 13, name: "Children's Surgery Center" },
        { n: 14, name: "Respiratory Therapy" },
        { n: 15, name: "Surgery and Endoscopy Suite" },
        { n: 16, name: "Surgical Intensive Care Unit (SICU)" },
      ],
    },
    {
      id: "3", short: "3", name: "Level 3",
      rooms: [
        { n: 17, name: "Birthing Suites" },
        { n: 18, name: "Cardiothoracic Intensive Care Unit (CTICU)" },
        { n: 19, name: "Main Operating Rooms" },
        { n: 20, name: "Neurological Services Intensive Care Unit (NSICU)" },
        { n: 21, name: "Post Anesthesia Care Unit (PACU)" },
        { n: 22, name: "Surgery and ICU Waiting Room" },
        { n: 23, name: "Women's Pavilion OB/GYN" },
      ],
    },
    {
      id: "4", short: "4", name: "Level 4",
      rooms: [
        { n: 24, name: "ENT / Internal Medicine Unit" },
      ],
    },
    {
      id: "5", short: "5", name: "Level 5",
      rooms: [
        { n: 25, name: "Medical Intensive Care Unit (MICU)" },
        { n: 26, name: "Neonatal Intensive Care Unit (NICU)" },
        { n: 27, name: "PM&R and Neurosciences" },
      ],
    },
    {
      id: "6", short: "6", name: "Level 6",
      rooms: [
        { n: 28, name: "Cardiac Intensive Care Unit (CICU)" },
        { n: 29, name: "Cardiac Services" },
        { n: 30, name: "Cardiology" },
      ],
    },
    {
      id: "7", short: "7", name: "Level 7",
      rooms: [
        { n: 31, name: "Medical Surgery Intensive Care Unit (MSICU)" },
        { n: 32, name: "Neurology" },
        { n: 33, name: "Pediatrics" },
        { n: 34, name: "Transfer and Receiving Unit (TRU-ICU)" },
      ],
    },
    {
      id: "8", short: "8", name: "Level 8",
      rooms: [
        { n: 35, name: "Medical Surgery and Respiratory Care" },
        { n: 36, name: "Oncology and Bone Marrow Transplant" },
        { n: 37, name: "Transplant / Metabolic Special Care Unit" },
      ],
    },
    {
      id: "10", short: "10", name: "Level 10",
      rooms: [
        { n: 38, name: "Pediatric Intensive Care Unit / Pediatric Cardiac Intensive Care Unit (PICU/PCICU)" },
      ],
    },
    {
      id: "11", short: "11", name: "Level 11",
      rooms: [
        { n: 39, name: "Trauma" },
      ],
    },
    {
      id: "12", short: "12", name: "Level 12",
      rooms: [
        { n: 40, name: "Vascular / GI" },
      ],
    },
    {
      id: "14", short: "14", name: "Level 14",
      rooms: [
        { n: 41, name: "Orthopaedics" },
      ],
    },
  ],
};

// Codes that should expose the floor-plan entry point on the detail panel.
// For now only the Medical Center has a printed floor plan; California Tower,
// North Addition, and the Rehab Hospital remain directions-only.
const FLOORPLAN_BY_BUILDING_CODE = {
  T: MEDICAL_CENTER_FLOORPLAN,
};

window.MEDICAL_CENTER_FLOORPLAN = MEDICAL_CENTER_FLOORPLAN;
window.FLOORPLAN_BY_BUILDING_CODE = FLOORPLAN_BY_BUILDING_CODE;
window.getFloorPlanForBuilding = function (code) {
  return FLOORPLAN_BY_BUILDING_CODE[code] || null;
};

// ---------------------------------------------------------------------------
// Diagram image + per-floor highlight bands.
//
// The diagram is page 2 of the printed UCDH Medical Center 11x17 wayfinding
// PDF, exported at 200 dpi and downscaled to 1100x1700 so it loads fast and
// stays crisp on retina displays.
//
// Each band describes the rectangle (in image-pixel coordinates) that the
// printed map uses for a given floor:
//   - levels 1-8 + Lower Level span the full "main stack" because those
//     floors physically contain all three towers (East Wing, University
//     Tower, Davis Tower);
//   - levels 10, 11, 12, and 14 are Davis-Tower-only and are drawn in a
//     separate right-hand column on the printed page, so their bands have
//     different x coordinates.
//
// Coordinates are eyeballed from the source image; they should be tuned by
// inspecting the diagram in the running app rather than reverse-engineered
// from the PDF.
// ---------------------------------------------------------------------------
// Each floor is now a polygon "boundary" (editable) + a walking-path graph
// of public corridors. Nodes carry a `kind`:
//   - "walk":     a hallway waypoint, used to connect rooms via corridors;
//   - "room":     a publicly-reachable room/department (the numbered ones
//                 from MEDICAL_CENTER_FLOORPLAN); `roomN` links back to it;
//   - "elevator": a publicly-accessible elevator; carries `elevatorId`,
//                 which is what makes vertical routing possible.
// Edges are ordered pairs of node ids and represent one walkable corridor
// segment. Edges live inside one floor only — vertical traversal happens
// implicitly when two elevator nodes share the same `elevatorId`.
//
// Seed coordinates here come from eyeballing the printed diagram. They are
// intentionally minimal: one elevator node per floor at the band centre, no
// walking-path edges yet. Real values are layered on top via the editor
// (edit-store.floorplan.*), which is the source of truth at runtime.
function rectPoly(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

const SEED_FLOORS = {
  // Main stack — East Wing + University Tower + Davis Tower share these floors.
  "8":  { boundary: rectPoly(18,  70,   460, 160), elevatorXY: [240, 150] },
  "7":  { boundary: rectPoly(18,  245,  460, 165), elevatorXY: [240, 327] },
  "6":  { boundary: rectPoly(18,  425,  460, 140), elevatorXY: [240, 495] },
  "5":  { boundary: rectPoly(18,  580,  460, 140), elevatorXY: [240, 650] },
  "4":  { boundary: rectPoly(18,  740,  460, 130), elevatorXY: [240, 805] },
  "3":  { boundary: rectPoly(18,  890,  460, 180), elevatorXY: [240, 980] },
  "2":  { boundary: rectPoly(18,  1090, 460, 160), elevatorXY: [240, 1170] },
  "1":  { boundary: rectPoly(18,  1270, 770, 240), elevatorXY: [403, 1390] },
  "LL": { boundary: rectPoly(18,  1535, 770, 150), elevatorXY: [403, 1610] },
  // Davis-Tower-only upper floors — sit in the diagram's right-hand column.
  "14": { boundary: rectPoly(490, 70,   290, 160), elevatorXY: [635, 150] },
  "12": { boundary: rectPoly(490, 245,  290, 165), elevatorXY: [635, 327] },
  "11": { boundary: rectPoly(490, 425,  290, 140), elevatorXY: [635, 495] },
  "10": { boundary: rectPoly(490, 580,  290, 140), elevatorXY: [635, 650] },
};

// Elevator registry — each entry lists which floors a given elevator bank
// reaches. "T-main" is the seeded fall-back that reaches every floor; once
// you add real banks via the editor, you'll want to split this into the
// actual towers (e.g. University Tower elevators that don't reach 10-14).
const ELEVATOR_BANKS = {
  "T-main": {
    name: "Main elevators (placeholder)",
    reaches: ["LL", "1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "14"],
  },
};

// Build the seeded floors object that other code reads.
//
// Each floor gets:
//   - one elevator node at the band centre (id "T_<levelId>_elev_main")
//   - one room node per entry in MEDICAL_CENTER_FLOORPLAN.levels[X].rooms,
//     positioned along a row inside the band so they don't all stack on
//     top of each other. The user moves them into the right spots via the
//     editor; the IDs and roomN fields stay stable across moves so any
//     user-drawn corridor edges aren't broken by a layout refresh.
//
// No edges are seeded — corridors come from the editor. The router adds
// synthetic fallback edges at query time so routing still works before
// real corridors are traced.
function buildSeedFloors() {
  const floors = {};
  const planLevels = (MEDICAL_CENTER_FLOORPLAN.levels || [])
    .reduce((acc, l) => { acc[l.id] = l; return acc; }, {});
  for (const [levelId, def] of Object.entries(SEED_FLOORS)) {
    const elevId = `T_${levelId}_elev_main`;
    const nodes = {
      [elevId]: {
        id: elevId,
        kind: "elevator",
        elevatorId: "T-main",
        x: def.elevatorXY[0],
        y: def.elevatorXY[1],
        label: "Main elevators",
      },
    };
    // Lay rooms out in a grid inside the band so they're individually
    // selectable from the diagram even before the user repositions them.
    const rooms = (planLevels[levelId] && planLevels[levelId].rooms) || [];
    if (rooms.length) {
      const xs = def.boundary.map(p => p[0]);
      const ys = def.boundary.map(p => p[1]);
      const bx = Math.min(...xs), by = Math.min(...ys);
      const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      // Inset so we don't sit on the boundary stroke.
      const pad = 14;
      const cols = Math.min(rooms.length, Math.max(2, Math.ceil(Math.sqrt(rooms.length * (bw / Math.max(bh, 1))))));
      const rowsCount = Math.ceil(rooms.length / cols);
      const cellW = (bw - pad * 2) / cols;
      const cellH = (bh - pad * 2) / Math.max(rowsCount, 1);
      rooms.forEach((r, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        // Stable id: includes roomN when present, otherwise a slug of the name.
        // This way edits to the room list don't shuffle existing edges.
        const slug = r.n != null
          ? `n${r.n}`
          : r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
        const id = `T_${levelId}_room_${slug}`;
        nodes[id] = {
          id,
          kind: "room",
          roomN: r.n ?? null,
          label: r.name,
          x: Math.round(bx + pad + cellW * (col + 0.5)),
          y: Math.round(by + pad + cellH * (row + 0.5)),
        };
      });
    }
    floors[levelId] = {
      boundary: def.boundary.map(p => [...p]),
      nodes,
      edges: [],
    };
  }
  return floors;
}

const MEDICAL_CENTER_DIAGRAM = {
  src: "medical-center-floor-diagram.png",
  w: 1100,
  h: 1700,
  buildingCode: "T",
  // Floors stay editable: edits.floorplan.T overrides everything below.
  seedFloors: buildSeedFloors(),
  elevatorBanks: ELEVATOR_BANKS,
};

window.MEDICAL_CENTER_DIAGRAM = MEDICAL_CENTER_DIAGRAM;

// Read the *effective* floor data for a building, merging the seed with any
// edits.floorplan.<buildingCode> overrides written by the editor.
//
// Merge semantics (per floor):
//   - boundary: override REPLACES the seed (a single polygon is one thing,
//     not a union — partial overrides don't make sense).
//   - nodes:    seed ∪ override, with override wins on id collision. This
//     means adding more rooms to the seed at a later date doesn't get
//     hidden by an existing user override, and moving a seeded room only
//     stores the new x/y for that one id.
//   - edges:    seed ∪ override, deduped by undirected pair so a user-saved
//     edge that happens to also exist in the seed isn't drawn twice.
//
// If a user "deletes" a seed node, the current behaviour is to let the
// seed resurrect it on the next merge. Permanent removal requires
// tombstoning (a deletedNodes set per floor), which we can add later if
// hospital ops actually want to suppress printed departments.
window.getFloors = function (buildingCode) {
  if (buildingCode !== MEDICAL_CENTER_DIAGRAM.buildingCode) return null;
  const edits = window.editStore ? window.editStore.get() : null;
  const overrides = edits?.floorplan?.[buildingCode]?.floors || {};
  const merged = {};
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const [levelId, seed] of Object.entries(MEDICAL_CENTER_DIAGRAM.seedFloors)) {
    const ov = overrides[levelId] || {};
    const seedEdges = seed.edges || [];
    const ovEdges = ov.edges || [];
    const seen = new Set();
    const edges = [];
    for (const e of [...seedEdges, ...ovEdges]) {
      const k = edgeKey(e[0], e[1]);
      if (!seen.has(k)) { seen.add(k); edges.push(e); }
    }
    merged[levelId] = {
      boundary: ov.boundary || seed.boundary,
      nodes: { ...(seed.nodes || {}), ...(ov.nodes || {}) },
      edges,
    };
  }
  return merged;
};

// Bounding box of a floor boundary polygon. Used to drive auto-zoom.
window.floorBBox = function (boundary) {
  const xs = boundary.map(p => p[0]);
  const ys = boundary.map(p => p[1]);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};

// ---------------------------------------------------------------------------
// FloorPlanPanel — sidebar UI rendered when panelMode === "floorplan".
//
// Renders three logical sections:
//   1. Header with building name, address, and back button.
//   2. A sticky horizontal rail of level chips (LL, 1, 2, ..., 14).
//   3. The active level's room list with circled numbered badges that
//      mirror the printed legend, plus a per-level "Directions to here"
//      shortcut that hands off to the existing routing flow.
//
// Cross-level search filters the visible rooms across every floor at once
// and auto-pivots the active chip to the first level with a match.
// ---------------------------------------------------------------------------
const { useState: useFP, useMemo: useMemoFP, useRef: useRefFP, useEffect: useEffectFP } = React;

function FloorPlanPanel({
  buildingCode,
  setPanelMode,
  setRouteToId,
  setRouteFromId,
  activeLevelId: controlledLevelId,
  setActiveLevelId: setControlledLevelId,
  floorRoute,
  setFloorRoute,
  floorPlanEditMode,
  setFloorPlanEditMode,
}) {
  const plan = window.getFloorPlanForBuilding(buildingCode);
  // Support both controlled (preferred — shared with FloorPlanMap) and
  // uncontrolled (legacy / standalone) usage.
  const [internalLevelId, setInternalLevelId] = useFP(plan ? plan.levels[1]?.id || plan.levels[0].id : null);
  const activeLevelId = controlledLevelId != null ? controlledLevelId : internalLevelId;
  const setActiveLevelId = setControlledLevelId || setInternalLevelId;
  const [query, setQuery] = useFP("");
  const chipsRef = useRefFP(null);

  // When the active level changes via search/level-jump, scroll the chip
  // rail so the active chip stays visible. Pure UX nicety — bail if the
  // ref hasn't mounted yet or there are no chips.
  useEffectFP(() => {
    const rail = chipsRef.current;
    if (!rail || !activeLevelId) return;
    const chip = rail.querySelector(`[data-level-id="${activeLevelId}"]`);
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeLevelId]);

  // Flattened searchable index of every room across every level.
  // Built once per plan; cheap to keep in memo since the data is static.
  const searchIndex = useMemoFP(() => {
    if (!plan) return [];
    const out = [];
    for (const lvl of plan.levels) {
      for (const r of lvl.rooms) {
        out.push({ ...r, levelId: lvl.id, levelName: lvl.name });
      }
    }
    return out;
  }, [plan]);

  const trimmedQuery = query.trim().toLowerCase();
  const searchResults = useMemoFP(() => {
    if (!trimmedQuery) return [];
    return searchIndex
      .filter(item =>
        item.name.toLowerCase().includes(trimmedQuery) ||
        item.levelName.toLowerCase().includes(trimmedQuery) ||
        (item.n != null && String(item.n) === trimmedQuery)
      )
      .slice(0, 40);
  }, [trimmedQuery, searchIndex]);

  if (!plan) {
    return (
      <div className="sb-body">
        <button className="sb-back" onClick={() => setPanelMode("detail")}>‹ Back</button>
        <div className="sb-tip">No floor plan is available for this building yet.</div>
      </div>
    );
  }

  const activeLevel = plan.levels.find(l => l.id === activeLevelId) || plan.levels[0];

  return (
    <div className="sb-body sb-floorplan">
      <button className="sb-back" onClick={() => setPanelMode("detail")}>‹ Back to building</button>

      <header className="fp-header">
        <div className="fp-eyebrow">Floor plan</div>
        <h2 className="fp-title">{plan.buildingName}</h2>
        <div className="fp-meta">
          <div>{plan.address}</div>
          {plan.parkingNote && <div className="fp-meta-sub">{plan.parkingNote}</div>}
        </div>
        <div className="fp-tower-tags" aria-label="Building wings">
          {plan.towers.map(t => (
            <span key={t} className="fp-tower-tag">{t}</span>
          ))}
        </div>
        {/* Campus-level directions live on the building detail panel
            (where "Directions to here" already covers this). Inside the
            floor plan the relevant action is *Walking Directions* between
            departments, rendered below. */}
        {setFloorPlanEditMode && (
          <div className="fp-header-actions">
            {/* One-click toggle into the floor-plan editor. Independent of
                the global campus-map editor in the tweaks panel so a user
                tuning a single floor doesn't have to unleash the full
                editing surface. */}
            <button
              type="button"
              className={`sb-btn ${floorPlanEditMode ? "primary" : ""}`}
              aria-pressed={!!floorPlanEditMode}
              onClick={() => setFloorPlanEditMode(!floorPlanEditMode)}
            >
              <span style={{ marginRight: 6 }}>{floorPlanEditMode ? "✓" : "✎"}</span>
              {floorPlanEditMode ? "Done editing" : "Edit this floor"}
            </button>
            {floorPlanEditMode && (
              <p className="fp-edit-blurb">
                Drag room dots into place · click empty area to add a node
                (pick its type in the toolbar above the diagram) · right-click any
                node to delete.
              </p>
            )}
          </div>
        )}
      </header>

      <div className="fp-search">
        <span className="sb-search-icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          placeholder="Search rooms across all floors…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search rooms inside the Medical Center"
        />
        {query && (
          <button className="sb-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button>
        )}
      </div>

      {trimmedQuery && (
        <div className="fp-search-results" role="region" aria-label="Search results">
          {searchResults.length === 0 && (
            <div className="sb-tip">No rooms match “{query}”.</div>
          )}
          {searchResults.map((r, i) => (
            <button
              key={`${r.levelId}-${r.n ?? r.name}-${i}`}
              className="fp-room fp-room-search"
              onClick={() => { setActiveLevelId(r.levelId); setQuery(""); }}
            >
              <RoomBadge n={r.n} />
              <span className="fp-room-body">
                <span className="fp-room-name">{r.name}</span>
                <span className="fp-room-level">{r.levelName}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!trimmedQuery && (
        <>
          <div className="fp-level-rail" role="tablist" aria-label="Select a floor" ref={chipsRef}>
            {plan.levels.map(lvl => {
              const isActive = lvl.id === activeLevel.id;
              return (
                <button
                  key={lvl.id}
                  role="tab"
                  aria-selected={isActive}
                  data-level-id={lvl.id}
                  className={`fp-chip ${isActive ? "active" : ""}`}
                  onClick={() => setActiveLevelId(lvl.id)}
                >
                  {lvl.short}
                </button>
              );
            })}
          </div>

          <section className="fp-level" aria-label={activeLevel.name}>
            <header className="fp-level-head">
              <h3>{activeLevel.name}</h3>
              <span className="fp-level-count">
                {activeLevel.rooms.length} {activeLevel.rooms.length === 1 ? "location" : "locations"}
              </span>
            </header>
            <ul className="fp-rooms">
              {activeLevel.rooms.map((r, i) => (
                <li key={`${r.n ?? r.name}-${i}`} className={`fp-room ${r.emphasis ? "fp-room-emphasis" : ""}`}>
                  <RoomBadge n={r.n} />
                  <span className="fp-room-body">
                    <span className="fp-room-name">{r.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <WalkingDirections
            buildingCode={buildingCode}
            floorRoute={floorRoute}
            setFloorRoute={setFloorRoute}
            setActiveLevelId={setActiveLevelId}
          />

          <details className="fp-phones">
            <summary>Hospital phone numbers</summary>
            <ul className="fp-phone-list">
              {plan.phones.map(p => (
                <li key={p.label}>
                  <span className="fp-phone-label">{p.label}</span>
                  <a className="fp-phone-number" href={`tel:${p.number.replace(/[^\d+]/g, "")}`}>
                    {p.number}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          <div className="fp-footnote">
            Diagram is a vertical schematic of three towers — not a to-scale architectural plan.
          </div>
        </>
      )}
    </div>
  );
}

// Numbered badge that mirrors the circled numbers on the printed map.
// Renders a plain bullet when the location has no printed number.
function RoomBadge({ n }) {
  if (n == null) {
    return <span className="fp-badge fp-badge-empty" aria-hidden="true">•</span>;
  }
  return (
    <span className="fp-badge" aria-label={`Location ${n}`}>{n}</span>
  );
}

// Walking Directions — Room→Room finder. Lists every node across every floor
// (elevators + walk waypoints + rooms) as picker options. When you click
// "Find route", it calls window.buildFloorRoute and threads the result back
// up so the FloorPlanMap can render the highlighted path.
//
// Note that "rooms" here are graph nodes flagged `kind === "room"`, not the
// PDF-derived `MEDICAL_CENTER_FLOORPLAN.levels[].rooms` entries — those are
// editorial copy and don't carry coordinates. Once you place a room node in
// the editor and tag it with the right `roomN`, the picker correlates the
// printed label with the routable node.
function WalkingDirections({ buildingCode, floorRoute, setFloorRoute, setActiveLevelId }) {
  const floors = window.getFloors(buildingCode) || {};
  const plan = window.getFloorPlanForBuilding(buildingCode);
  // Picker options are ROOMS only. Elevators are transit infrastructure,
  // not destinations — the router picks them automatically. Walk nodes are
  // anonymous waypoints, same story.
  //
  // Grouped by floor so a 40+ room list stays scannable. Within each floor
  // rooms keep their numbered order (matching the printed legend); rooms
  // without a number fall to the bottom of their floor.
  const groupedRooms = useMemoFP(() => {
    const byLevel = {};
    for (const [levelId, floor] of Object.entries(floors)) {
      const level = plan.levels.find(l => l.id === levelId);
      const lvlName = level ? level.name : `Level ${levelId}`;
      const items = Object.values(floor.nodes || {})
        .filter(n => n.kind === "room")
        .map(n => ({
          key: `${levelId}::${n.id}`,
          label: n.roomN != null ? `${n.roomN} · ${n.label}` : n.label,
          sortKey: n.roomN != null ? n.roomN : 999 + (n.label || "").charCodeAt(0),
          levelId,
        }));
      if (items.length) {
        items.sort((a, b) => a.sortKey - b.sortKey);
        byLevel[levelId] = { levelId, lvlName, items };
      }
    }
    // Order the floor groups the same way the chip rail does — LL, 1, 2, ...
    const order = plan.levels.map(l => l.id);
    return order.map(id => byLevel[id]).filter(Boolean);
  }, [floors, plan]);

  const totalRooms = groupedRooms.reduce((n, g) => n + g.items.length, 0);

  const [fromKey, setFromKey] = useFP("");
  const [toKey, setToKey] = useFP("");

  const findRoute = () => {
    if (!fromKey || !toKey) return;
    const r = window.buildFloorRoute(buildingCode, fromKey, toKey);
    setFloorRoute && setFloorRoute(r);
    if (r.ok && r.segments.length) {
      // Jump to the FIRST level the route enters so the user sees their
      // starting segment immediately.
      const startSeg = r.segments[0];
      if (startSeg && setActiveLevelId) setActiveLevelId(startSeg.levelId);
    }
  };
  const clearRoute = () => { setFloorRoute && setFloorRoute(null); };

  const renderOptions = () => groupedRooms.map(group => (
    <optgroup key={group.levelId} label={group.lvlName}>
      {group.items.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
    </optgroup>
  ));

  return (
    <section className="fp-walk" aria-label="Walking directions inside the building">
      <header className="fp-section-head">
        <h3>Walking directions</h3>
        <span className="fp-section-sub">
          Routes use only public corridors and elevators. Pick any two departments below.
        </span>
      </header>
      {totalRooms < 2 && (
        <div className="sb-tip">
          <strong>No departments yet.</strong> Open the tweaks panel (the ✦ button in the
          bottom-right corner), turn on <em>Edit map</em>, then in the Floor Plan editor
          choose <em>Place nodes → Room</em> and click on the diagram for each
          department you want to add. You'll be prompted to name each room as you
          place it.
        </div>
      )}
      {totalRooms >= 2 && (
        <>
          <label className="fp-walk-field">
            <span>From department</span>
            <select value={fromKey} onChange={e => setFromKey(e.target.value)}>
              <option value="">— pick a starting department —</option>
              {renderOptions()}
            </select>
          </label>
          <label className="fp-walk-field">
            <span>To department</span>
            <select value={toKey} onChange={e => setToKey(e.target.value)}>
              <option value="">— pick a destination department —</option>
              {renderOptions()}
            </select>
          </label>
          <div className="fp-walk-actions">
            <button className="sb-btn primary" onClick={findRoute} disabled={!fromKey || !toKey}>
              Find route
            </button>
            {floorRoute && (
              <button className="sb-btn ghost" onClick={clearRoute}>Clear</button>
            )}
          </div>
        </>
      )}

      {floorRoute && floorRoute.ok === false && (
        <div className="sb-tip" role="status">
          {floorRoute.reason === "no-path"
            ? "No public path connects these two locations yet. Add corridor edges in the editor."
            : "Routing data is missing for this building."}
        </div>
      )}
      {floorRoute && floorRoute.ok && (
        <ol className="fp-walk-steps" aria-label="Step-by-step directions">
          {floorRoute.steps.map((s, i) => (
            <li key={i}>
              <span className="fp-walk-step-num">{i + 1}</span>
              <span className="fp-walk-step-text">{s}</span>
            </li>
          ))}
          {floorRoute.totalLevels > 1 && (
            <li className="fp-walk-summary">
              Route spans {floorRoute.totalLevels} floors via elevator.
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

window.FloorPlanPanel = FloorPlanPanel;

// ---------------------------------------------------------------------------
// FloorPlanMap — replaces the campus map in the main viewport when the user
// is in floor-plan mode.
//
// Layered overlays from back to front:
//   1. The PDF-derived diagram image (raster baseline; never edited).
//   2. A dim mask (outer-rect + active-floor cut-out, even-odd fill) that
//      pushes inactive floors visually backward.
//   3. The active floor's boundary polygon (gold stroke). Editable.
//   4. Walking-path edges drawn as line segments tinted by edge metadata.
//   5. Path nodes — walk markers, elevator markers, room markers — each with
//      distinct shape/colour and accessible <title>.
//   6. Route highlight (if the sidebar requested directions) drawn on top.
//   7. Click-through floor-pick zones (still active so users can switch
//      floors by clicking anywhere outside the active band).
//
// Edit mode (driven by the global window.editStore + the `editMode` prop):
//   - "boundary": vertex drag; double-click on an edge to insert a vertex;
//                 right-click vertex to remove (min 3 stays enforced).
//   - "nodes":    click empty area to add a walk node; shift-click to add an
//                 elevator node; drag any node to move; right-click to delete.
//   - "edges":    click two nodes in sequence to connect them; click an
//                 existing edge to remove it.
// ---------------------------------------------------------------------------
const { useState: useFM, useEffect: useEffectFM, useRef: useRefFM, useMemo: useMemoFM } = React;

function FloorPlanMap({
  buildingCode,
  activeLevelId,
  setActiveLevelId,
  editMode,
  editFloorMode,        // null | "boundary" | "nodes" | "edges"
  setEditFloorMode,
  route,                // optional: { segments: [{levelId, points:[...]}], ... }
}) {
  const plan = window.getFloorPlanForBuilding(buildingCode);
  const diagram = window.MEDICAL_CENTER_DIAGRAM;
  // Re-render when edits change so the renderer sees freshly-saved polygons,
  // node positions, etc. (uses the existing edit-store subscription hook.)
  window.useEdits && window.useEdits();
  const floors = window.getFloors(buildingCode) || {};
  const floor = floors[activeLevelId];
  const W = diagram.w, H = diagram.h;

  const svgRef = useRefFM(null);
  const dragRef = useRefFM(null);
  const [vb, setVb] = useFM({ x: 0, y: 0, w: W, h: H });

  // Edit-state: which vertex / node is currently being dragged; for the
  // "edges" sub-mode, which node was clicked first (waiting to be paired).
  const [vertexDrag, setVertexDrag] = useFM(null); // { index, startPoint }
  const [nodeDrag, setNodeDrag] = useFM(null);     // { nodeId, startXY }
  const [edgePickFirst, setEdgePickFirst] = useFM(null); // nodeId
  // Which kind of node the next click in "nodes" mode will create. Defaults
  // to "room" because that's the most common need when populating a floor
  // — walking-path waypoints are useful but secondary to actual destinations.
  const [placeKind, setPlaceKind] = useFM("room"); // "room" | "walk" | "elevator"
  // Inline rename for a selected node (room labels especially benefit from
  // this; we don't need a full property panel for one string).
  const [renamingId, setRenamingId] = useFM(null);
  const [renameDraft, setRenameDraft] = useFM("");

  // Auto-zoom to active floor whenever the level changes.
  useEffectFM(() => {
    if (!floor) { setVb({ x: 0, y: 0, w: W, h: H }); return; }
    const bb = window.floorBBox(floor.boundary);
    const pad = Math.max(bb.w, bb.h) * 0.25;
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const aspect = W / H;
    let w = bb.w + pad * 2;
    let h = bb.h + pad * 2;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    const x = Math.max(0, Math.min(W - w, cx - w / 2));
    const y = Math.max(0, Math.min(H - h, cy - h / 2));
    setVb({ x, y, w, h });
  }, [activeLevelId]); // eslint-disable-line

  // Pan / zoom interaction (mirrors CampusMap).
  const onWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cur = pt.matrixTransform(svg.getScreenCTM().inverse());
    const scale = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const newW = Math.max(120, Math.min(W * 1.5, vb.w * scale));
    const newH = newW * (H / W);
    setVb({
      x: cur.x - (cur.x - vb.x) * (newW / vb.w),
      y: cur.y - (cur.y - vb.y) * (newH / vb.h),
      w: newW, h: newH,
    });
  };

  // Convert a mouse event to image-space coordinates.
  const eventToSvg = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  // Empty-area click → either pan-start, or in node-edit mode, add a node.
  const onSvgMouseDown = (e) => {
    if (e.button !== 0) return;
    // Vertex / node drags handle their own pointerdown — skip pan in those.
    if (vertexDrag || nodeDrag) return;
    // Node-edit mode: empty click places a node of the currently-selected
    // `placeKind` (set by the inline node-type toggle). Rooms default to a
    // placeholder label so they're immediately visible in the Walking
    // Directions picker, even before the user renames them.
    if (editMode && editFloorMode === "nodes" && !e.target.closest("[data-fp-node]")) {
      const p = eventToSvg(e);
      const opts = { kind: placeKind, x: Math.round(p.x), y: Math.round(p.y) };
      if (placeKind === "elevator") {
        opts.elevatorId = "T-main";
        opts.label = "Elevator";
      }
      if (placeKind === "room") {
        opts.label = "New room";
      }
      const id = window.editStore.addFloorNode(buildingCode, activeLevelId, opts);
      // Auto-open inline rename for rooms — there's no point in placing one
      // without naming it, and forcing a follow-up click is friction.
      if (placeKind === "room") {
        setRenamingId(id);
        setRenameDraft("");
      }
      e.stopPropagation();
      return;
    }
    // Otherwise — pan.
    const r = svgRef.current.getBoundingClientRect();
    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      vx: vb.x, vy: vb.y,
      kx: vb.w / r.width, ky: vb.h / r.height,
    };
  };
  const onSvgMouseMove = (e) => {
    // Vertex drag (boundary edit)
    if (vertexDrag) {
      const p = eventToSvg(e);
      const pts = floor.boundary.map((pt, i) =>
        i === vertexDrag.index ? [Math.round(p.x), Math.round(p.y)] : pt);
      window.editStore.setFloorBoundary(buildingCode, activeLevelId, pts);
      return;
    }
    // Node drag (nodes / edges edit)
    if (nodeDrag) {
      const p = eventToSvg(e);
      window.editStore.moveFloorNode(buildingCode, activeLevelId,
        nodeDrag.nodeId, Math.round(p.x), Math.round(p.y));
      return;
    }
    // Pan
    if (!dragRef.current) return;
    const d = dragRef.current;
    const dx = (e.clientX - d.sx) * d.kx;
    const dy = (e.clientY - d.sy) * d.ky;
    setVb(v => ({ ...v, x: d.vx - dx, y: d.vy - dy }));
  };
  const onSvgMouseUp = () => {
    dragRef.current = null;
    setVertexDrag(null);
    setNodeDrag(null);
  };

  const reset = () => {
    if (!floor) { setVb({ x: 0, y: 0, w: W, h: H }); return; }
    const bb = window.floorBBox(floor.boundary);
    const pad = Math.max(bb.w, bb.h) * 0.25;
    const aspect = W / H;
    let w = bb.w + pad * 2, h = bb.h + pad * 2;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    const x = Math.max(0, Math.min(W - w, (bb.x + bb.w / 2) - w / 2));
    const y = Math.max(0, Math.min(H - h, (bb.y + bb.h / 2) - h / 2));
    setVb({ x, y, w, h });
  };
  const zoom = (f) => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    const newW = Math.max(120, Math.min(W * 1.5, vb.w * f));
    const newH = newW * (H / W);
    setVb({ x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH });
  };

  // Polygon path string from boundary points.
  const polyPoints = (pts) => pts.map(p => p.join(",")).join(" ");

  // Click-handlers for nodes — vary by edit mode.
  const onNodeMouseDown = (e, node) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!editMode) return;
    if (editFloorMode === "nodes") {
      setNodeDrag({ nodeId: node.id, startXY: [node.x, node.y] });
    }
  };
  const onNodeClick = (e, node) => {
    if (!editMode) return;
    e.stopPropagation();
    if (editFloorMode === "edges") {
      if (!edgePickFirst) { setEdgePickFirst(node.id); return; }
      if (edgePickFirst === node.id) { setEdgePickFirst(null); return; }
      window.editStore.addFloorEdge(buildingCode, activeLevelId, edgePickFirst, node.id);
      setEdgePickFirst(null);
    }
  };
  const onNodeContextMenu = (e, node) => {
    if (!editMode || editFloorMode !== "nodes") return;
    e.preventDefault(); e.stopPropagation();
    window.editStore.deleteFloorNode(buildingCode, activeLevelId, node.id);
  };

  // Click-handlers for edges (in "edges" edit mode → delete).
  const onEdgeClick = (e, a, b) => {
    if (!editMode || editFloorMode !== "edges") return;
    e.stopPropagation();
    window.editStore.removeFloorEdge(buildingCode, activeLevelId, a, b);
  };

  // Vertex pointerdown — start drag (boundary edit).
  const onVertexMouseDown = (e, index) => {
    if (e.button !== 0 || !editMode || editFloorMode !== "boundary") return;
    e.stopPropagation();
    setVertexDrag({ index });
  };
  const onVertexContextMenu = (e, index) => {
    if (!editMode || editFloorMode !== "boundary") return;
    e.preventDefault(); e.stopPropagation();
    if (floor.boundary.length <= 3) return; // keep polygon valid
    const pts = floor.boundary.filter((_, i) => i !== index);
    window.editStore.setFloorBoundary(buildingCode, activeLevelId, pts);
  };
  // Double-click an edge midpoint → insert a vertex there.
  const onEdgeMidDblClick = (e, insertAt, midXY) => {
    if (!editMode || editFloorMode !== "boundary") return;
    e.stopPropagation();
    const pts = [...floor.boundary];
    pts.splice(insertAt, 0, [Math.round(midXY[0]), Math.round(midXY[1])]);
    window.editStore.setFloorBoundary(buildingCode, activeLevelId, pts);
  };

  // Pre-compute node lookups for fast edge rendering.
  const nodeLookup = useMemoFM(() => {
    if (!floor) return {};
    return floor.nodes || {};
  }, [floor]);

  if (!plan || !diagram) {
    return (
      <div className="fpmap-empty">No floor diagram is available for this building.</div>
    );
  }

  const strokeBase = Math.max(1.2, vb.w / 400);

  return (
    <div className={`fpmap ${editMode ? "fpmap-editing" : ""}`}>
      <svg
        ref={svgRef}
        className="fpmap-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseUp}
        onContextMenu={(e) => { if (editMode) e.preventDefault(); }}
      >
        <image
          href={diagram.src}
          x={0} y={0} width={W} height={H}
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Dim mask — outer rect minus active floor polygon, drawn via the
            even-odd fill rule. The polygon is closed by repeating the first
            point so the cut-out is unambiguous. */}
        {floor && (() => {
          const ptsStr = polyPoints(floor.boundary);
          // The path: full canvas, then the polygon traced backwards as a
          // sub-path so the even-odd fill carves it out.
          const polyPath = floor.boundary.map((p, i) =>
            `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";
          return (
            <>
              <path
                d={`M0,0 H${W} V${H} H0 Z ${polyPath}`}
                fillRule="evenodd"
                fill="rgba(2, 40, 81, 0.32)"
                pointerEvents="none"
              />
              <polygon
                points={ptsStr}
                fill="none"
                stroke="#FFBF00"
                strokeWidth={strokeBase * 2.2}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            </>
          );
        })()}

        {/* Walking-path edges. Rendered before nodes so node markers sit on
            top of the line endpoints. */}
        {floor && floor.edges.map(([a, b], i) => {
          const A = nodeLookup[a], B = nodeLookup[b];
          if (!A || !B) return null;
          // Slightly fatter stroke + invisible widened hit area for clicks
          // in "edges" edit mode (otherwise 2px lines are nearly impossible
          // to hit reliably).
          const editing = editMode && editFloorMode === "edges";
          return (
            <g key={`edge-${a}-${b}-${i}`}>
              <line
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke="#0E7C66"
                strokeWidth={strokeBase * 1.6}
                strokeLinecap="round"
                opacity={0.9}
                pointerEvents="none"
              />
              {editing && (
                <line
                  x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                  stroke="transparent"
                  strokeWidth={strokeBase * 8}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => onEdgeClick(e, a, b)}
                />
              )}
            </g>
          );
        })}

        {/* Route highlight (multi-segment, drawn over edges so it sits on
            top). `route.segments` is precomputed in the sidebar. */}
        {route && route.segments && route.segments
          .filter(s => s.levelId === activeLevelId)
          .map((s, i) => (
            <polyline
              key={`route-${i}`}
              points={s.points.map(p => p.join(",")).join(" ")}
              fill="none"
              stroke="#C8102E"
              strokeWidth={strokeBase * 2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${strokeBase * 8} ${strokeBase * 4}`}
              pointerEvents="none"
            />
        ))}

        {/* Path nodes.
            Rooms are intentionally small + label-on-hover so a 41-room
            floor doesn't look like confetti. Elevators stay larger because
            they're a critical wayfinding landmark for users. */}
        {floor && Object.values(floor.nodes).map(n => {
          const isElev = n.kind === "elevator";
          const isRoom = n.kind === "room";
          const r = strokeBase * (isElev ? 6 : isRoom ? 3 : 3.5);
          const stroke = isElev ? "#022851" : isRoom ? "#C8102E" : "#0E7C66";
          const fill = isElev ? "#FFBF00" : "white";
          const editingNodes = editMode && editFloorMode === "nodes";
          const editingEdges = editMode && editFloorMode === "edges";
          const isEdgePickStart = editingEdges && edgePickFirst === n.id;
          return (
            <g
              key={n.id}
              data-fp-node={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: editMode ? (editingNodes ? "move" : "pointer") : "default" }}
              onMouseDown={(e) => onNodeMouseDown(e, n)}
              onClick={(e) => onNodeClick(e, n)}
              onContextMenu={(e) => onNodeContextMenu(e, n)}
            >
              <title>
                {n.kind === "elevator"
                  ? `Elevator${n.label ? ` — ${n.label}` : ""}`
                  : n.kind === "room"
                    ? `Room ${n.roomN ?? ""}${n.label ? ` — ${n.label}` : ""}`
                    : "Walking-path waypoint"}
              </title>
              {isElev ? (
                <>
                  <rect
                    x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.25}
                    fill={fill}
                    stroke={isEdgePickStart ? "#C8102E" : stroke}
                    strokeWidth={strokeBase * (isEdgePickStart ? 1.4 : 0.9)}
                  />
                  <text
                    x={0} y={0} dy="0.35em"
                    textAnchor="middle"
                    fontSize={r * 1.2}
                    fontWeight={700}
                    fill="#022851"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >E</text>
                </>
              ) : (
                <circle
                  r={r}
                  fill={fill}
                  stroke={isEdgePickStart ? "#C8102E" : stroke}
                  strokeWidth={strokeBase * (isEdgePickStart ? 1.4 : 0.9)}
                />
              )}
            </g>
          );
        })}

        {/* Boundary vertex handles (only visible when editing boundary). */}
        {editMode && editFloorMode === "boundary" && floor && floor.boundary.map((p, i) => {
          const next = floor.boundary[(i + 1) % floor.boundary.length];
          const mid = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
          const r = strokeBase * 4;
          return (
            <g key={`vh-${i}`}>
              <circle
                cx={mid[0]} cy={mid[1]} r={strokeBase * 2.4}
                fill="white" stroke="#FFBF00" strokeWidth={strokeBase}
                style={{ cursor: "copy" }}
                onDoubleClick={(e) => onEdgeMidDblClick(e, i + 1, mid)}
              >
                <title>Double-click to add a vertex</title>
              </circle>
              <circle
                cx={p[0]} cy={p[1]} r={r}
                fill="#FFBF00" stroke="#022851" strokeWidth={strokeBase * 0.9}
                style={{ cursor: "grab" }}
                onMouseDown={(e) => onVertexMouseDown(e, i)}
                onContextMenu={(e) => onVertexContextMenu(e, i)}
              >
                <title>Drag to move · right-click to remove</title>
              </circle>
            </g>
          );
        })}

        {/* Floor-pick zones: clicks outside the active floor switch to the
            clicked one. Rendered last so they don't block the path overlay
            from receiving its own clicks. */}
        {!editMode && Object.entries(floors).map(([levelId, f]) => {
          if (levelId === activeLevelId) return null;
          return (
            <polygon
              key={`pick-${levelId}`}
              points={polyPoints(f.boundary)}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={() => setActiveLevelId(levelId)}
            >
              <title>{plan.levels.find(l => l.id === levelId)?.name || `Level ${levelId}`}</title>
            </polygon>
          );
        })}
      </svg>

      <div className="fpmap-zoom" aria-label="Zoom controls">
        <button type="button" onClick={() => zoom(1 / 1.3)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(1.3)} aria-label="Zoom out">−</button>
        <button type="button" onClick={reset} aria-label="Reset view">⌂</button>
      </div>

      <div className="fpmap-legend" aria-live="polite">
        <span className="fpmap-legend-eyebrow">Now showing</span>
        <span className="fpmap-legend-level">
          {plan.levels.find(l => l.id === activeLevelId)?.name || "Whole building"}
        </span>
      </div>

      {editMode && (
        <div className="fpmap-edit-bar" role="toolbar" aria-label="Floor-plan editor">
          <span className="fpmap-edit-eyebrow">Editing</span>
          <button
            type="button"
            className={editFloorMode === "boundary" ? "active" : ""}
            onClick={() => setEditFloorMode("boundary")}
          >Boundary</button>
          <button
            type="button"
            className={editFloorMode === "nodes" ? "active" : ""}
            onClick={() => setEditFloorMode("nodes")}
          >Place nodes</button>
          <button
            type="button"
            className={editFloorMode === "edges" ? "active" : ""}
            onClick={() => setEditFloorMode("edges")}
          >Connect / cut</button>
          {/* When the user is in "Place nodes" mode, surface a second tier
              of buttons that picks which type the next click will create.
              This replaces the previous (undiscoverable) shift-click for
              elevators and finally exposes Room placement as a first-class
              action. */}
          {editFloorMode === "nodes" && (
            <span className="fpmap-edit-kind" role="group" aria-label="Node type to place">
              <span className="fpmap-edit-kind-label">Type:</span>
              <button
                type="button"
                className={placeKind === "room" ? "active room" : "room"}
                onClick={() => setPlaceKind("room")}
                aria-pressed={placeKind === "room"}
              >Room</button>
              <button
                type="button"
                className={placeKind === "walk" ? "active walk" : "walk"}
                onClick={() => setPlaceKind("walk")}
                aria-pressed={placeKind === "walk"}
              >Walk waypoint</button>
              <button
                type="button"
                className={placeKind === "elevator" ? "active elevator" : "elevator"}
                onClick={() => setPlaceKind("elevator")}
                aria-pressed={placeKind === "elevator"}
              >Elevator</button>
            </span>
          )}
          <span className="fpmap-edit-spacer" />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (confirm("Reset this floor's overrides back to the seeded boundary and nodes?")) {
                window.editStore.resetFloor(buildingCode, activeLevelId);
              }
            }}
          >Reset floor</button>
        </div>
      )}

      {editMode && editFloorMode && (
        <div className="fpmap-edit-hint">
          {editFloorMode === "boundary" && "Drag yellow corners to reshape · double-click a midpoint dot to add a vertex · right-click a corner to remove it (minimum 3)."}
          {editFloorMode === "nodes" && (
            placeKind === "room"
              ? "Click anywhere inside the floor to place a Room — you'll be prompted to name it · drag existing nodes to move · right-click to delete."
              : placeKind === "walk"
                ? "Click to drop a Walk waypoint along a corridor · use these between rooms to bend the path around walls · drag to move · right-click to delete."
                : "Click to place an Elevator — it auto-joins the T-main bank and connects this floor to every other elevator in the same bank · drag to move · right-click to delete."
          )}
          {editFloorMode === "edges" && (edgePickFirst
            ? "Now click a second node to connect them — or click the highlighted node again to cancel."
            : "Click a node to start a corridor segment, then click another node to finish it · click an existing line to remove it.")}
        </div>
      )}

      {/* Inline rename modal — appears next to the newly-placed room so the
          user can name it without leaving the diagram. Positioned via the
          node's pixel position projected back to the screen. */}
      {renamingId && (() => {
        const node = floor?.nodes?.[renamingId];
        if (!node) return null;
        return (
          <div className="fpmap-rename" role="dialog" aria-label="Name this room">
            <label>
              <span>Name</span>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Cafeteria, Pediatrics, MICU…"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = renameDraft.trim();
                    if (v) window.editStore.updateFloorNode(buildingCode, activeLevelId, renamingId, { label: v });
                    setRenamingId(null); setRenameDraft("");
                  } else if (e.key === "Escape") {
                    setRenamingId(null); setRenameDraft("");
                  }
                }}
              />
            </label>
            <div className="fpmap-rename-actions">
              <button
                type="button" className="primary"
                onClick={() => {
                  const v = renameDraft.trim();
                  if (v) window.editStore.updateFloorNode(buildingCode, activeLevelId, renamingId, { label: v });
                  setRenamingId(null); setRenameDraft("");
                }}
              >Save</button>
              <button
                type="button" className="ghost"
                onClick={() => {
                  // Cancel discards the just-placed node so the user doesn't
                  // end up with an anonymous "New room" cluttering the picker.
                  window.editStore.deleteFloorNode(buildingCode, activeLevelId, renamingId);
                  setRenamingId(null); setRenameDraft("");
                }}
              >Cancel</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

window.FloorPlanMap = FloorPlanMap;

// ---------------------------------------------------------------------------
// Multi-floor routing — public elevator nodes link floors. Builds a single
// graph keyed by `<levelId>::<nodeId>`, connects two elevator nodes whenever
// they share an `elevatorId` and both floors are within the bank's reach,
// then runs Dijkstra.
//
// Returned shape:
//   { ok: true, segments: [{ levelId, points: [[x,y], ...] }],
//     steps: [ "Walk to Elevator X", "Take Elevator X to Level 5", ...],
//     totalLevels: number }
// or
//   { ok: false, reason: "no-path" | "missing-data" }
// ---------------------------------------------------------------------------
window.buildFloorRoute = function (buildingCode, fromKey, toKey) {
  const floors = window.getFloors(buildingCode);
  if (!floors) return { ok: false, reason: "missing-data" };
  const diagram = window.MEDICAL_CENTER_DIAGRAM;
  if (!diagram || diagram.buildingCode !== buildingCode) {
    return { ok: false, reason: "missing-data" };
  }
  const banks = diagram.elevatorBanks || {};

  // Build the flattened graph: node id is "<levelId>::<nodeId>".
  const graph = {};
  const meta = {}; // graph node id → { levelId, nodeId, node }
  const addNeighbor = (a, b, w) => {
    graph[a] = graph[a] || { neighbors: [] };
    graph[a].neighbors.push({ id: b, w });
  };
  for (const [levelId, floor] of Object.entries(floors)) {
    for (const [nodeId, node] of Object.entries(floor.nodes || {})) {
      const key = `${levelId}::${nodeId}`;
      meta[key] = { levelId, nodeId, node };
      graph[key] = graph[key] || { neighbors: [] };
    }
    for (const [a, b] of floor.edges || []) {
      const ka = `${levelId}::${a}`, kb = `${levelId}::${b}`;
      const A = floor.nodes[a], B = floor.nodes[b];
      if (!A || !B) continue;
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      addNeighbor(ka, kb, d); addNeighbor(kb, ka, d);
    }

    // Synthetic fallback edges — connect every non-elevator node on this
    // floor to the floor's nearest elevator. These exist only inside the
    // router and are never persisted, so they don't show up on the diagram
    // as visible corridor lines.
    //
    // Why this matters: rooms ship as standalone graph nodes with no
    // walking-path edges. Without these synthetic links, "From: Admissions
    // (Level 1) → To: Trauma (Level 11)" would return "no path" until the
    // user manually traces a corridor. With them, the router can always
    // construct a coarse but accurate route (room → floor's elevator →
    // vertical hop → destination floor's elevator → destination room), and
    // the user's later corridor edits naturally take over as shorter paths.
    //
    // Cost penalty: the synthetic edge cost is the straight-line distance
    // plus a small penalty so any user-drawn corridor (whose length is the
    // sum of multiple segments) is always preferred when available.
    const elevatorsOnFloor = Object.entries(floor.nodes || {})
      .filter(([, n]) => n.kind === "elevator");
    if (elevatorsOnFloor.length) {
      const FALLBACK_PENALTY = 25; // image-px equivalent
      for (const [nodeId, node] of Object.entries(floor.nodes || {})) {
        if (node.kind === "elevator") continue;
        // Snap to the closest elevator on this floor.
        let bestElev = null, bestD = Infinity;
        for (const [eid, e] of elevatorsOnFloor) {
          const d = Math.hypot(e.x - node.x, e.y - node.y);
          if (d < bestD) { bestD = d; bestElev = eid; }
        }
        if (!bestElev) continue;
        const w = bestD + FALLBACK_PENALTY;
        const kn = `${levelId}::${nodeId}`;
        const ke = `${levelId}::${bestElev}`;
        addNeighbor(kn, ke, w); addNeighbor(ke, kn, w);
      }
    }
  }
  // Vertical connections — pair every elevator node on level X with every
  // elevator node on level Y that shares the same bank. Cost is a constant
  // PER-FLOOR penalty so the planner prefers routes that minimise vertical
  // hops without overweighting them.
  const VERTICAL_PER_FLOOR = 60; // arbitrary "feels right" weight in image-px
  const elevByBank = {};
  for (const key of Object.keys(meta)) {
    const m = meta[key];
    if (m.node.kind !== "elevator" || !m.node.elevatorId) continue;
    elevByBank[m.node.elevatorId] = elevByBank[m.node.elevatorId] || [];
    elevByBank[m.node.elevatorId].push(key);
  }
  // Approximate "level index" by parseInt; LL counts as 0.
  const levelIndex = (lvl) => lvl === "LL" ? 0 : parseInt(lvl, 10);
  for (const [bankId, keys] of Object.entries(elevByBank)) {
    const bank = banks[bankId];
    const reachable = new Set(bank?.reaches || keys.map(k => meta[k].levelId));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const ka = keys[i], kb = keys[j];
        const la = meta[ka].levelId, lb = meta[kb].levelId;
        if (!reachable.has(la) || !reachable.has(lb)) continue;
        const w = Math.abs(levelIndex(la) - levelIndex(lb)) * VERTICAL_PER_FLOOR + 1;
        addNeighbor(ka, kb, w); addNeighbor(kb, ka, w);
      }
    }
  }

  if (!graph[fromKey] || !graph[toKey]) return { ok: false, reason: "missing-data" };

  // Dijkstra (small graphs — O(V²) is fine).
  const dist = {}, prev = {};
  const all = new Set(Object.keys(graph));
  for (const k of all) dist[k] = Infinity;
  dist[fromKey] = 0;
  while (all.size) {
    let u = null, best = Infinity;
    for (const k of all) if (dist[k] < best) { best = dist[k]; u = k; }
    if (u === null) break;
    if (u === toKey) break;
    all.delete(u);
    for (const { id: v, w } of graph[u].neighbors) {
      if (!all.has(v)) continue;
      const alt = dist[u] + w;
      if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    }
  }
  if (!isFinite(dist[toKey])) return { ok: false, reason: "no-path" };

  // Walk back along prev[] to build the full ordered path.
  const path = []; let cur = toKey;
  while (cur) { path.unshift(cur); cur = prev[cur]; }

  // Break into per-floor polyline segments and human-readable steps.
  const segments = [];
  const steps = [];
  let curLevel = meta[path[0]].levelId;
  let curPoints = [[meta[path[0]].node.x, meta[path[0]].node.y]];
  let lastElevatorLabel = null;
  for (let i = 1; i < path.length; i++) {
    const a = meta[path[i - 1]], b = meta[path[i]];
    if (a.levelId === b.levelId) {
      curPoints.push([b.node.x, b.node.y]);
    } else {
      // Vertical hop — close the current floor segment, emit a step, start a
      // new segment on the destination floor at the elevator's exit node.
      if (curPoints.length > 1) {
        segments.push({ levelId: curLevel, points: curPoints });
      }
      const elevLabel = a.node.label || a.node.elevatorId || "elevator";
      lastElevatorLabel = elevLabel;
      steps.push(`Take ${elevLabel} to ${b.levelId === "LL" ? "Lower Level" : "Level " + b.levelId}`);
      curLevel = b.levelId;
      curPoints = [[b.node.x, b.node.y]];
    }
  }
  if (curPoints.length > 1) segments.push({ levelId: curLevel, points: curPoints });
  if (!steps.length && segments.length) {
    steps.unshift("Walk along the highlighted path.");
  }

  // Count distinct levels touched so the panel can show "spans X floors".
  const totalLevels = new Set(path.map(k => meta[k].levelId)).size;

  return { ok: true, segments, steps, totalLevels, fromKey, toKey };
};
