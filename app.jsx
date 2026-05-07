// Main app
const { useState: useS, useEffect: useE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "uc-classic",
  "showLabels": true,
  "showShuttle": true,
  "showPois": true,
  "showHotspots": true,
  "showEntrances": true,
  "showCrosswalks": true,
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
        showLabels={tweaks.showLabels} setShowLabels={(v) => setTweak("showLabels", v)}
        reduceMotion={tweaks.reduceMotion} setReduceMotion={(v) => setTweak("reduceMotion", v)}
        panelMode={panelMode} setPanelMode={setPanelMode}
        theme={theme}
      />
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
