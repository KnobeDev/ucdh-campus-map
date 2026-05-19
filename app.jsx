// Main app
const { useState: useS, useEffect: useE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "uc-classic",
  // First-visit defaults: only Construction is on. Visitors can opt into
  // additional overlays from the Layers panel; their choices stick via
  // localStorage so they don't have to re-toggle on every load.
  "showLabels": false,
  "showShuttle": false,
  "showPois": false,
  "showEvents": false,
  "showAccessibility": false,
  "showParkingBikes": false,
  "showValet": false,
  "showConstruction": true,
  "showHotspots": true,
  "showEntrances": false,
  "showCrosswalks": false,
  "showPaths": true,
  "imageOpacity": 1,
  "editMode": false,
  "reduceMotion": false
}/*EDITMODE-END*/;

const THEMES = {
  "uc-classic": { name: "Original (PNG)", imgFilter: "none" },
  "soft":       { name: "Soft / muted",   imgFilter: "saturate(0.7) brightness(1.05)" },
  "high-contrast": { name: "High contrast", imgFilter: "contrast(1.15) saturate(1.2)" },
  "dimmed":     { name: "Dimmed (route focus)", imgFilter: "saturate(0.5) brightness(0.92)" },
};

function App() {
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [selectedId, setSelectedId] = useS(null);
  const [hoveredId, setHoveredId] = useS(null);
  const [filters, setFilters] = useS(new Set());
  const [routeFromId, setRouteFromId] = useS(null);
  const [routeToId, setRouteToId] = useS(null);
  const [route, setRoute] = useS(null);
  const [panelMode, setPanelMode] = useS("browse");
  // Lifted so the sidebar floor browser and the floor-diagram in the map
  // area stay in sync. Defaults to Level 1 (street level) — the entry floor
  // users care about most often.
  const [activeLevelId, setActiveLevelId] = useS("1");
  // Multi-floor route computed by WalkingDirections; consumed by FloorPlanMap.
  const [floorRoute, setFloorRoute] = useS(null);
  // Which floor-plan editor sub-mode is active when edit mode is on.
  const [editFloorMode, setEditFloorMode] = useS("nodes");
  // Local edit toggle for the floor plan ONLY — independent of the
  // global campus editor (tweaks.editMode). This lets a hospital ops user
  // tune room positions without unleashing the full campus-map editor.
  const [floorPlanEditMode, setFloorPlanEditMode] = useS(false);

  // Edit-mode state
  const [editSubMode, setEditSubMode] = useS("hotspots");
  const [editTargetId, setEditTargetId] = useS(null);
  const [edgePickFirst, setEdgePickFirst] = useS(null);
  const [pathTypeDefault, setPathTypeDefault] = useS("walk");
  const editMode = !!tweaks.editMode;

  // Need to subscribe so non-edit map re-renders when entrances/crosswalks change
  window.useEdits();

  const theme = THEMES[tweaks.theme] || THEMES["uc-classic"];

  useE(() => { setRoute(null); }, [routeFromId, routeToId]);

  // Drop any in-progress floor-plan route the moment the user leaves floor-
  // plan mode or switches to a different building. Without this the red
  // dashed polyline lingers in the SVG the next time the user re-enters
  // floor-plan view — it looks like a "phantom path" they never asked for.
  // Also turns off the local floor-plan editor so the user starts every
  // visit in a clean read-only state.
  useE(() => {
    if (panelMode !== "floorplan") {
      setFloorRoute(null);
      setFloorPlanEditMode(false);
    }
  }, [panelMode]);
  useE(() => { setFloorRoute(null); setFloorPlanEditMode(false); }, [selectedId]);

  // Reduce-motion: respect explicit toggle, fall back to OS preference.
  useE(() => {
    const prefersReduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const on = !!tweaks.reduceMotion || prefersReduce;
    document.documentElement.setAttribute("data-reduce-motion", on ? "1" : "0");
  }, [tweaks.reduceMotion]);

  return (
    <div className="app">
      <window.Sidebar
        selectedId={selectedId} setSelectedId={setSelectedId}
        hoveredId={hoveredId} setHoveredId={setHoveredId}
        filters={filters} setFilters={setFilters}
        routeFromId={routeFromId} setRouteFromId={setRouteFromId}
        routeToId={routeToId} setRouteToId={setRouteToId}
        route={route} setRoute={setRoute}
        showShuttle={tweaks.showShuttle} setShowShuttle={(v) => setTweak("showShuttle", v)}
        showPois={tweaks.showPois} setShowPois={(v) => setTweak("showPois", v)}
        showEvents={tweaks.showEvents} setShowEvents={(v) => setTweak("showEvents", v)}
        showAccessibility={tweaks.showAccessibility} setShowAccessibility={(v) => setTweak("showAccessibility", v)}
        showParkingBikes={tweaks.showParkingBikes} setShowParkingBikes={(v) => setTweak("showParkingBikes", v)}
        showValet={tweaks.showValet} setShowValet={(v) => setTweak("showValet", v)}
        showConstruction={tweaks.showConstruction} setShowConstruction={(v) => setTweak("showConstruction", v)}
        showEntrances={tweaks.showEntrances} setShowEntrances={(v) => setTweak("showEntrances", v)}
        showCrosswalks={tweaks.showCrosswalks} setShowCrosswalks={(v) => setTweak("showCrosswalks", v)}
        showLabels={tweaks.showLabels} setShowLabels={(v) => setTweak("showLabels", v)}
        reduceMotion={tweaks.reduceMotion} setReduceMotion={(v) => setTweak("reduceMotion", v)}
        panelMode={panelMode} setPanelMode={setPanelMode}
        activeLevelId={activeLevelId} setActiveLevelId={setActiveLevelId}
        floorRoute={floorRoute} setFloorRoute={setFloorRoute}
        floorPlanEditMode={floorPlanEditMode} setFloorPlanEditMode={setFloorPlanEditMode}
        theme={theme}
      />
      {panelMode === "floorplan" && selectedId && window.getFloorPlanForBuilding(selectedId) && window.FloorPlanMap ? (
        <window.FloorPlanMap
          buildingCode={selectedId}
          activeLevelId={activeLevelId}
          setActiveLevelId={setActiveLevelId}
          editMode={editMode || floorPlanEditMode}
          editFloorMode={editFloorMode}
          setEditFloorMode={setEditFloorMode}
          route={floorRoute && floorRoute.ok ? floorRoute : null}
        />
      ) : (
      <window.CampusMap
        selectedId={selectedId} hoveredId={hoveredId}
        onHover={setHoveredId}
        onSelect={(id) => { if (!editMode) { setSelectedId(id); setPanelMode("detail"); } }}
        filters={filters}
        route={route} routeFromId={routeFromId} routeToId={routeToId}
        recomputeRoute={() => {
          if (routeFromId && routeToId) setRoute(window.buildRoute(routeFromId, routeToId));
        }}
        showShuttle={tweaks.showShuttle} showPois={tweaks.showPois}
        showEvents={tweaks.showEvents}
        showAccessibility={tweaks.showAccessibility}
        showParkingBikes={tweaks.showParkingBikes}
        showValet={tweaks.showValet}
        showConstruction={tweaks.showConstruction}
        showLabels={tweaks.showLabels}
        showHotspots={tweaks.showHotspots}
        showEntrances={tweaks.showEntrances}
        showCrosswalks={tweaks.showCrosswalks}
        showPaths={tweaks.showPaths}
        theme={theme}
        editMode={editMode} editSubMode={editSubMode}
        editTargetId={editTargetId} setEditTargetId={setEditTargetId}
        edgePickFirst={edgePickFirst} setEdgePickFirst={setEdgePickFirst}
        pathTypeDefault={pathTypeDefault}
      />
      )}
      {editMode && window.EditToolbar && (
        <window.EditToolbar
          mode={editSubMode}
          setMode={setEditSubMode}
          editTargetId={editTargetId}
          setEditTargetId={setEditTargetId}
          pathTypeDefault={pathTypeDefault}
          setPathTypeDefault={setPathTypeDefault}
          onClose={() => setTweak("editMode", false)}
        />
      )}
      <TweaksPanelInner tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

function TweaksPanelInner({ tweaks, setTweak }) {
  const { TweaksPanel, TweakSection, TweakToggle, TweakSelect } = window;
  return (
    <TweaksPanel>
      <TweakSection label="Map style" />
      <TweakSelect label="Image treatment" value={tweaks.theme}
        onChange={(v) => setTweak("theme", v)}
        options={Object.entries(THEMES).map(([k, v]) => ({ value: k, label: v.name }))} />
      <TweakSection label="Overlays" />
      <TweakToggle label="Building hotspots" value={tweaks.showHotspots} onChange={(v) => setTweak("showHotspots", v)} />
      <TweakToggle label="Building badges" value={tweaks.showLabels} onChange={(v) => setTweak("showLabels", v)} />
      <TweakToggle label="Walking / car paths" value={tweaks.showPaths} onChange={(v) => setTweak("showPaths", v)} />
      <TweakToggle label="Building entrances" value={tweaks.showEntrances} onChange={(v) => setTweak("showEntrances", v)} />
      <TweakToggle label="Crosswalks" value={tweaks.showCrosswalks} onChange={(v) => setTweak("showCrosswalks", v)} />
      <TweakToggle label="Shuttle stops" value={tweaks.showShuttle} onChange={(v) => setTweak("showShuttle", v)} />
      <TweakToggle label="Points of interest" value={tweaks.showPois} onChange={(v) => setTweak("showPois", v)} />
      <TweakSection label="Editor" />
      <TweakToggle label="Edit map" value={tweaks.editMode} onChange={(v) => setTweak("editMode", v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
