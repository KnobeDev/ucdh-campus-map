// Sidebar: search, category filters, building list, selected detail, route planner

const { useState: useState2, useMemo, useEffect: useEffect2, useRef: useRef2 } = React;

// Text colour for a coloured badge or card head, so the pair holds 4.5:1 (ink.js).
const inkOn = (background) => window.Ink.on(background);
// Which tab owns each panel: a place's card and its floor plan belong to "Find a place".
const TAB_OF = { browse: "find", detail: "find", floorplan: "find", route: "route" };
const TAB_IDS = { find: "sb-tab-find", route: "sb-tab-route" };
const PANEL_ID = "sb-panel";

function Sidebar({
  selectedId, setSelectedId,
  hoveredId, setHoveredId,
  filters, setFilters,
  routeFromId, setRouteFromId,
  routeToId, setRouteToId,
  route, setRoute,
  showShuttle, setShowShuttle,
  showPois, setShowPois,
  showEvents, setShowEvents,
  showAccessibility, setShowAccessibility,
  showParkingBikes, setShowParkingBikes,
  showValet, setShowValet,
  showConstruction, setShowConstruction,
  showEntrances, setShowEntrances,
  showCrosswalks, setShowCrosswalks,
  showLabels, setShowLabels,
  reduceMotion, setReduceMotion,
  panelMode, setPanelMode, // 'browse' | 'route' | 'detail' | 'floorplan'
  activeLevelId, setActiveLevelId,
  floorRoute, setFloorRoute,
  floorPlanEditMode, setFloorPlanEditMode,
  theme,
}) {
  const [query, setQuery] = useState2("");
  const [filterOpen, setFilterOpen] = useState2(true);
  const [layersOpen, setLayersOpen] = useState2(true);
  const [buildingsOpen, setBuildingsOpen] = useState2(true);
  const [parkingOpen, setParkingOpen] = useState2(false);
  const [shuttleOpen, setShuttleOpen] = useState2(false);
  const [poiOpen, setPoiOpen] = useState2(false);
  const [constructionOpen, setConstructionOpen] = useState2(false);
  const [entrancesOpen, setEntrancesOpen] = useState2(false);
  // What a screen reader is told when something changes without a page load (one polite
  // region, so two messages never talk over each other): search results, a route.
  const [announce, setAnnounce] = useState2("");
  const [routeMissing, setRouteMissing] = useState2(false);
  const [routeHint, setRouteHint] = useState2(false);
  const activeTab = TAB_OF[panelMode] || "find";
  // Say `text` in the status region. The region is emptied first and filled a moment later,
  // so the same words twice in a row (two searches with "3 results", Get directions pressed
  // again) are announced both times; `delay` also keeps typing from being read letter by letter.
  const sayTimer = useRef2(null);
  const say = (text, delay = 150) => {
    clearTimeout(sayTimer.current);
    setAnnounce("");
    if (text) sayTimer.current = setTimeout(() => setAnnounce(text), delay);
  };
  useEffect2(() => () => clearTimeout(sayTimer.current), []);
  // The list row a place's card was opened from, so Back can return there.
  const opener = useRef2(null);
  /** Put focus on the current panel's start (the search, a card's name, "Plan a walk"). */
  const focusPanelStart = () => requestAnimationFrame(() => document.querySelector(".sidebar [data-panel-focus]")?.focus());

  const allItems = useMemo(() => [
    ...window.BUILDINGS.map(b => ({
      id: b.code, kind: b.cat === "parking" ? "parking" : "building",
      code: b.code, name: b.name, cat: b.cat,
      sub: b.cat === "parking"
        ? (window.PARKING_TYPES[window.parkingTypeOf(b)].label)
        : (window.CATEGORIES[b.cat]?.label || "Facility"),
    })),
    ...window.DEPARTMENTS.map(d => ({
      id: `dept-${d.name}`, kind: "department", code: d.building, name: d.name,
      cat: window.BUILDINGS.find(b => b.code === d.building)?.cat || "clinic",
      sub: `in Building ${d.building}${d.note ? " · " + d.note : ""}`,
    })),
  ], []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.code?.toLowerCase().includes(q) ||
      it.sub?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, allItems]);

  // Search results, said: how many, or that there are none. Empty when the box is empty.
  // Waits for a pause in typing (600 ms) before it speaks.
  useEffect2(() => {
    if (!query.trim()) { say(""); return; }
    say(results.length
      ? `${results.length} result${results.length === 1 ? "" : "s"}${results.length === 12 ? ", the first 12" : ""}`
      : `No places match ${query.trim()}`, 600);
  }, [query, results]);

  // When the panel changes and the control that had focus is GONE (a result that was picked,
  // "Directions to here", Back: focus has fallen to the page itself), focus goes to the new
  // panel's start, or, on Back, to the list row the card was opened from. Focus that is
  // anywhere else is left alone: on a tab, on the map after a click on a building, in the
  // editor's toolbar. So a mouse click on the map never drags focus (or the scroll) away.
  const firstDraw = useRef2(true);
  useEffect2(() => {
    if (firstDraw.current) { firstDraw.current = false; return; }
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && document.contains(active)) return;
      const row = panelMode === "browse" && opener.current
        ? [...document.querySelectorAll(".sidebar .sb-list-item[data-code]")].find(el => el.dataset.code === opener.current)
        : null;
      (row || document.querySelector(".sidebar [data-panel-focus]"))?.focus();
      if (panelMode === "browse") opener.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [panelMode, selectedId]);

  // A "no route" message is about one pair of places: choosing another clears it.
  useEffect2(() => { setRouteMissing(false); setRouteHint(false); }, [routeFromId, routeToId]);

  // Tabs: arrow keys, Home and End move between them and switch the panel (WAI-ARIA tabs).
  const onTabKey = (e) => {
    const order = ["find", "route"];
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = order[(order.indexOf(activeTab) + 1) % order.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = order[(order.indexOf(activeTab) + order.length - 1) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (!next) return;
    e.preventDefault();
    setPanelMode(next === "find" ? "browse" : "route");
    document.getElementById(TAB_IDS[next])?.focus();
  };

  const selected = selectedId ? window.BUILDINGS.find(b => b.code === selectedId) : null;
  const isParkingSelected = selected && selected.cat === "parking";

  const departmentsInBuilding = selected && !isParkingSelected
    ? window.DEPARTMENTS.filter(d => d.building === selected.code)
    : [];

  const toggleFilter = (cat) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const handleSelectItem = (item) => {
    opener.current = null; // opened from the search: Back returns to the search
    setQuery("");
    if (item.kind === "department") {
      setSelectedId(item.code);
    } else {
      setSelectedId(item.id);
    }
    setPanelMode("detail");
  };

  const ROUTE_HINT = "Choose a start and a destination first.";
  const computeRoute = () => {
    // The button is never disabled (a disabled button says nothing about why): without both
    // places it says what is missing, on screen and aloud.
    if (!routeFromId || !routeToId) { setRouteHint(true); say(ROUTE_HINT); return; }
    const r = window.buildRoute(routeFromId, routeToId);
    setRoute(r);
    setRouteMissing(!r);
    say(r
      ? `Route found: about ${r.totalMin} minute${r.totalMin === 1 ? "" : "s"}, ${r.totalFt.toLocaleString()} feet, ${r.steps.length} steps`
      : "No walking route was found between these two places.");
  };

  const swapFromTo = () => {
    setRouteFromId(routeToId);
    setRouteToId(routeFromId);
    setRoute(null);
    setRouteMissing(false);
  };

  const clearRoute = () => {
    setRoute(null);
    setRouteMissing(false);
    setRouteFromId(null);
    setRouteToId(null);
    say("Directions cleared");
    focusPanelStart(); // the Clear button itself goes away
  };

  return (
    <section className="sidebar" aria-label="Places and directions">
      {/* One polite region for everything announced: search results, a route. */}
      <div className="sr-only" role="status">{announce}</div>
      <div className="sb-header">
        <div className="sb-logo">
          <div className="sb-logo-mark">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
              <rect x="3" y="14" width="26" height="15" rx="2" fill="#022851"/>
              <polygon points="3,14 16,5 29,14" fill="#FFBF00"/>
              <rect x="14" y="18" width="4" height="6" fill="#FFBF00"/>
              <rect x="7" y="18" width="3" height="3" fill="#FFBF00"/>
              <rect x="22" y="18" width="3" height="3" fill="#FFBF00"/>
            </svg>
          </div>
          <h1 className="sb-logo-text">
            <span className="sb-logo-title">UC Davis Health</span>{" "}
            <span className="sb-logo-sub">Sacramento Campus Map</span>
          </h1>
        </div>
        {/* A link, not a button: it's a page navigation, so open-in-new-tab and
            middle-click work and it's reachable by keyboard and voice control. */}
        <a className="sb-3d-link" href="3d/">
          <span aria-hidden="true">🧊</span> 3D view
        </a>
      </div>

      {/* Mode tabs: one tab stop, arrow keys between them, each owning the one panel below. */}
      <div className="sb-tabs" role="tablist" aria-label="What to do" onKeyDown={onTabKey}>
        <button role="tab" id={TAB_IDS.find} aria-selected={activeTab === "find"} aria-controls={activeTab === "find" ? PANEL_ID : undefined}
          tabIndex={activeTab === "find" ? 0 : -1}
          className={`sb-tab ${activeTab === "find" ? "active" : ""}`}
          onClick={() => setPanelMode("browse")}>
          <span className="sb-tab-icon" aria-hidden="true">⌕</span> Find a place
        </button>
        <button role="tab" id={TAB_IDS.route} aria-selected={activeTab === "route"} aria-controls={activeTab === "route" ? PANEL_ID : undefined}
          tabIndex={activeTab === "route" ? 0 : -1}
          className={`sb-tab ${activeTab === "route" ? "active" : ""}`}
          onClick={() => setPanelMode("route")}>
          <span className="sb-tab-icon" aria-hidden="true">↝</span> Directions
        </button>
      </div>

      {panelMode === "browse" && (
        <div className="sb-body" role="tabpanel" id={PANEL_ID} aria-labelledby={TAB_IDS.find}>
          <div className="sb-search">
            <span className="sb-search-icon" aria-hidden="true">⌕</span>
            {/* The same words as the placeholder a visitor sees, so "click Search buildings…" works by voice. */}
            <label className="sr-only" htmlFor="sb-search-input">Search buildings, clinics, services</label>
            <input
              id="sb-search-input"
              type="text"
              autoComplete="off"
              placeholder="Search buildings, clinics, services…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              data-panel-focus=""
            />
            {query && (
              <button className="sb-search-clear" aria-label="Clear search"
                onClick={() => { setQuery(""); document.getElementById("sb-search-input")?.focus(); }}>
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>

          {query.trim() && results.length === 0 && (
            <p className="sb-no-results">No places match “{query.trim()}”. Try a building name, a letter code or a service.</p>
          )}

          {results.length === 12 && <p className="sb-results-note">Showing the first 12. Type more to narrow it down.</p>}

          {results.length > 0 && (
            <div className="sb-results" role="group" aria-label="Search results">
              {results.map(it => {
                // Search results store the building's `code` so we can ask for its
                // parking sub-type color directly. Falls back gracefully when the
                // item isn't a parking lot.
                const bForLookup = it.cat === "parking" ? (window.BUILDINGS.find(b => b.code === it.code) || it) : null;
                const color = it.cat === "parking" ? window.parkingColorOf(bForLookup) : (window.CATEGORIES[it.cat]?.color || "#5A6470");
                return (
                  <button key={it.id} className="sb-result"
                    onMouseEnter={() => setHoveredId(it.code)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => handleSelectItem(it)}>
                    <span className="sb-result-badge" style={{ background: color, color: inkOn(color) }}>{it.code}</span>
                    <span className="sb-result-text">
                      <span className="sb-result-name">{it.name}</span>
                      <span className="sb-result-sub">{it.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!query && panelMode === "browse" && (
            <>
              <a className="sb-skip-link" href="#sb-buildings"
                 onClick={(e) => {
                   e.preventDefault();
                   setBuildingsOpen(true);
                   const el = document.getElementById("sb-buildings");
                   el?.scrollIntoView({ behavior: "smooth" });
                   setTimeout(() => document.querySelector("#sb-buildings .sb-list-item")?.focus(), 50);
                 }}>
                Skip to buildings list
              </a>

              <CollapsibleSection title="Filter map" open={filterOpen} setOpen={setFilterOpen}>
                <div className="sb-filters" role="group" aria-label="Show only these kinds of place">
                  {Object.entries(window.CATEGORIES).map(([key, c]) => (
                    <button key={key} type="button" aria-pressed={filters.has(key)}
                      className={`sb-filter ${filters.has(key) ? "active" : ""}`}
                      onClick={() => toggleFilter(key)}
                      style={{ "--filter-color": c.color }}>
                      <span className="sb-filter-dot" style={{ background: c.color }} aria-hidden="true"></span>
                      {/* On: a tick as well as the colour. Hidden from the name, which stays "Hospital". */}
                      {filters.has(key) && <span className="sb-filter-tick" aria-hidden="true">✓</span>}
                      {c.label}
                    </button>
                  ))}
                  <button type="button" aria-pressed={filters.has("parking")}
                    className={`sb-filter ${filters.has("parking") ? "active" : ""}`}
                    onClick={() => toggleFilter("parking")}
                    style={{ "--filter-color": "#1ba0d3" }}>
                    <span className="sb-filter-dot" style={{ background: "#1ba0d3" }} aria-hidden="true"></span>
                    {filters.has("parking") && <span className="sb-filter-tick" aria-hidden="true">✓</span>}
                    Parking
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Layers" open={layersOpen} setOpen={setLayersOpen}>
                <div className="sb-toggles">
                  <Toggle label="Shuttle stops" checked={showShuttle} onChange={setShowShuttle} />
                  <Toggle label="Points of interest" checked={showPois} onChange={setShowPois} />
                  <Toggle label="Events" checked={showEvents} onChange={setShowEvents} />
                  <Toggle label="Accessible parking and drop-off" checked={showAccessibility} onChange={setShowAccessibility} />
                  <Toggle label="Parking & bikes" checked={showParkingBikes} onChange={setShowParkingBikes} />
                  <Toggle label="Valet" checked={showValet} onChange={setShowValet} />
                  <Toggle label="Construction" checked={showConstruction} onChange={setShowConstruction} />
                  <Toggle label="Building entrances" checked={showEntrances} onChange={setShowEntrances} />
                  <Toggle label="Crosswalks" checked={showCrosswalks} onChange={setShowCrosswalks} />
                  <Toggle label="Building names" checked={showLabels} onChange={setShowLabels} />
                  <Toggle label="Reduce animation" checked={!!reduceMotion} onChange={setReduceMotion} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Buildings A–Z" open={buildingsOpen} setOpen={setBuildingsOpen} id="sb-buildings">
                <div className="sb-list">
                  {[...window.BUILDINGS]
                    .filter(b => b.cat !== "parking")
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map(b => (
                      <button key={b.code}
                        className={`sb-list-item ${selectedId === b.code ? "selected" : ""}`}
                        aria-current={selectedId === b.code ? "true" : undefined}
                        data-code={b.code}
                        onMouseEnter={() => setHoveredId(b.code)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { opener.current = b.code; setSelectedId(b.code); setPanelMode("detail"); }}>
                        <span className="sb-list-badge" style={{ background: (window.CATEGORIES[b.cat]?.color || "#1ba0d3"), color: inkOn(window.CATEGORIES[b.cat]?.color || "#1ba0d3") }}>{b.code}</span>
                        <span className="sb-list-name">{b.name}</span>
                      </button>
                    ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Parking" open={parkingOpen} setOpen={setParkingOpen}>
                <div className="sb-list">
                  {[...window.BUILDINGS]
                    .filter(b => b.cat === "parking")
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map(b => (
                      <button key={b.code}
                        className={`sb-list-item ${selectedId === b.code ? "selected" : ""}`}
                        aria-current={selectedId === b.code ? "true" : undefined}
                        data-code={b.code}
                        onMouseEnter={() => setHoveredId(b.code)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { opener.current = b.code; setSelectedId(b.code); setPanelMode("detail"); }}>
                        <span className="sb-list-badge" style={{ background: "#1ba0d3", color: inkOn("#1ba0d3") }}>{b.code}</span>
                        <span className="sb-list-name">{b.name}</span>
                      </button>
                    ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Shuttle stops" open={shuttleOpen} setOpen={setShuttleOpen}>
                <ul className="sb-list sb-plain-list">
                  {(window.SHUTTLE_STOPS || []).map(s => (
                    <li key={s.id} className="sb-list-item" style={{ cursor: "default" }}>
                      <span className="sb-list-badge" style={{ background: "#0E7C66" }} aria-hidden="true">⛟</span>
                      <span className="sb-list-name">{s.name}</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>

              {/* What was only drawn on the map, in words: closures to walk around, and doors. */}
              {(window.CONSTRUCTION_ZONES || []).length > 0 && (
                <CollapsibleSection title="Construction" open={constructionOpen} setOpen={setConstructionOpen}>
                  <ul className="sb-plain-list sb-notice-list">
                    {window.CONSTRUCTION_ZONES.map(z => {
                      const near = (z.affects || []).map(code => window.BUILDINGS.find(b => b.code === code)?.name).filter(Boolean);
                      return (
                        <li key={z.id}>
                          <strong>{z.name || "Construction"}</strong>
                          {near.length > 0 && <span> · at {near.join(", ")}</span>}
                          {z.endDate && <span> · until {z.endDate}</span>}
                          {z.notes && <div className="sb-dep-note">{z.notes}</div>}
                          <div className="sb-dep-note">Directions go around this area.</div>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleSection>
              )}

              {(window.ENTRANCES || []).length > 0 && (
                <CollapsibleSection title="Building entrances" open={entrancesOpen} setOpen={setEntrancesOpen}>
                  <ul className="sb-plain-list sb-notice-list">
                    {window.ENTRANCES.map(en => {
                      const at = window.BUILDINGS.find(b => b.code === en.building)?.name;
                      return (
                        <li key={en.id}>
                          <strong>{en.label || "Entrance"}</strong>
                          {at && at !== en.label && <span> · {at}</span>}
                          <div className="sb-dep-note">{en.accessible ? "Step-free (accessible) entrance" : "Not marked as step-free"}</div>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleSection>
              )}

              {(window.POIS || []).length > 0 && (
                <CollapsibleSection title="Points of interest" open={poiOpen} setOpen={setPoiOpen}>
                  <ul className="sb-poi-list">
                    {window.POIS.map((p, i) => (
                      <li key={p.id || i} className="sb-poi-item">
                        <div className="sb-poi-head">
                          <span className="sb-list-badge" style={{ background: "#C8102E" }} aria-hidden="true">★</span>
                          <span className="sb-poi-name">{p.name || "Point of interest"}</span>
                        </div>
                        {p.instructions && <p className="sb-poi-instructions">{p.instructions}</p>}
                        {(p.events || []).length > 0 && (
                          <ul className="sb-poi-events">
                            {p.events.map((ev, j) => (
                              <li key={j}>
                                <strong>{ev.title || "Untitled event"}</strong>
                                {ev.when && <span className="sb-poi-when"> · {ev.when}</span>}
                                {ev.note && <div className="sb-poi-note">{ev.note}</div>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {(() => {
                          // Platform-aware Open in Maps: buildPoiMapsUrl picks
                          // Apple vs Google based on the visitor's device and
                          // anchors the query to UC Davis Health so common
                          // names ("Surgery Center") don't open the wrong place.
                          const url = window.buildPoiMapsUrl ? window.buildPoiMapsUrl(p) : null;
                          if (!url) return null;
                          return (
                            <a className="sb-btn small" href={url} target="_blank" rel="noopener noreferrer">
                              <span style={{ marginRight: 6 }} aria-hidden="true">📱</span> Open in Maps
                              <span className="sr-only"> for {p.name || "this place"} (opens a maps app or a new tab)</span>
                            </a>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
            </>
          )}
        </div>
      )}

      {panelMode === "detail" && selected && (
        <div className="sb-body" role="tabpanel" id={PANEL_ID} aria-labelledby={TAB_IDS.find}>
          <button className="sb-back" onClick={() => setPanelMode("browse")}><span aria-hidden="true">‹ </span>Back</button>
          <div className="sb-detail">
            {(() => {
              const headColor = isParkingSelected ? window.parkingColorOf(selected) : (window.CATEGORIES[selected.cat]?.color || "#5A6470");
              return (
            <div className="sb-detail-head" style={{ background: headColor, color: inkOn(headColor) }}>
              <div className="sb-detail-code" aria-hidden="true">{selected.code}</div>
              {/* Focus lands here when a place is opened, so its name is the first thing read. */}
              <h2 className="sb-detail-name" tabIndex={-1} data-panel-focus="">{selected.name}</h2>
              <div className="sb-detail-cat">
                {isParkingSelected ? window.PARKING_TYPES[window.parkingTypeOf(selected)].label : (window.CATEGORIES[selected.cat]?.label || "Facility")}
                <span className="sr-only">, building code {selected.code}</span>
              </div>
            </div>
              );
            })()}

            <div className="sb-detail-actions">
              <button className="sb-btn primary" onClick={() => {
                setRouteToId(`${isParkingSelected ? "P" : "B"}_${selected.code}`);
                setPanelMode("route");
              }}>
                <span style={{ marginRight: 6 }} aria-hidden="true">↝</span> Directions to here
              </button>
              {window.MapMode.current.floorPlans && window.getFloorPlanForBuilding && window.getFloorPlanForBuilding(selected.code) && (
                // Floor plan is only available for buildings whose interior layout
                // has been captured in floorplan.jsx (currently the Medical Center
                // "T"). The button is offered as an explicit alternative to
                // Directions for hospital wayfinding inside the building.
                <button className="sb-btn" onClick={() => setPanelMode("floorplan")}>
                  <span style={{ marginRight: 6 }} aria-hidden="true">▦</span> Floor plan
                </button>
              )}
              <button className="sb-btn" onClick={() => {
                setRouteFromId(`${isParkingSelected ? "P" : "B"}_${selected.code}`);
                setPanelMode("route");
              }}>
                Directions from here
              </button>
              {(() => {
                // A link, not a button: it leaves the page for a maps app or site.
                // Disambiguate from same-named places elsewhere — anchor to the UC Davis Health campus.
                const query = selected.mapsQuery || `${selected.name}, UC Davis Health, Sacramento, CA`;
                const enc = encodeURIComponent(query);
                const ua = navigator.userAgent || "";
                const isApple = /iPhone|iPad|iPod|Macintosh/.test(ua) && !/CrOS/.test(ua);
                const url = isApple
                  ? `https://maps.apple.com/?daddr=${enc}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
                return (
                  <a className="sb-btn" href={url} target="_blank" rel="noopener noreferrer">
                    <span style={{ marginRight: 6 }} aria-hidden="true">📱</span> Get directions on phone
                    <span className="sr-only"> (opens a maps app or a new tab)</span>
                  </a>
                );
              })()}
            </div>

            {departmentsInBuilding.length > 0 && (
              <>
                <SectionHeader level={3}>Departments & services</SectionHeader>
                <ul className="sb-deps">
                  {departmentsInBuilding.map((d, i) => (
                    <li key={i}>
                      <span className="sb-dep-name">{d.name}</span>
                      {d.note && <span className="sb-dep-note">{d.note}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!isParkingSelected && (
              <>
                <SectionHeader level={3}>Nearby parking</SectionHeader>
                <ul className="sb-deps">
                  {window.BUILDINGS.filter(b => b.cat === "parking")
                    .map(p => ({ ...p, d: Math.hypot(selected.x - p.x, selected.y - p.y) }))
                    .sort((a, bb) => a.d - bb.d)
                    .slice(0, 3)
                    .map(p => (
                      <li key={p.code}>
                        <button className="sb-link" onClick={() => { setSelectedId(p.code); setPanelMode("detail"); }}>
                          <span className="sb-list-badge" style={{ background: "#1ba0d3", color: inkOn("#1ba0d3"), marginRight: 8 }}>{p.code}</span>
                          {p.name}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {window.MapMode.current.floorPlans && panelMode === "floorplan" && selected && window.FloorPlanPanel && (
        // (the floor-plan panel is the local build's; its own accessibility is not part of this pass)
        <window.FloorPlanPanel
          buildingCode={selected.code}
          setPanelMode={setPanelMode}
          setRouteToId={setRouteToId}
          setRouteFromId={setRouteFromId}
          activeLevelId={activeLevelId}
          setActiveLevelId={setActiveLevelId}
          floorRoute={floorRoute}
          setFloorRoute={setFloorRoute}
          floorPlanEditMode={floorPlanEditMode}
          setFloorPlanEditMode={setFloorPlanEditMode}
        />
      )}

      {panelMode === "route" && (
        <div className="sb-body" role="tabpanel" id={PANEL_ID} aria-labelledby={TAB_IDS.route}>
          <SectionHeader focusTarget>Plan a walk</SectionHeader>
          <div className="sb-route-form">
            <RouteField label="From" kind="from" value={routeFromId} onChange={setRouteFromId} accent="#0E7C66" placeholder="Parking, shuttle stop, or point of interest" />
            <button className="sb-swap" onClick={swapFromTo} aria-label="Swap from and to"><span aria-hidden="true">⇅</span></button>
            <RouteField label="To" kind="to" value={routeToId} onChange={setRouteToId} accent="#C8102E" placeholder="Pick a destination building" />
            <div className="sb-route-actions">
              <button className="sb-btn primary" onClick={computeRoute}
                aria-disabled={!routeFromId || !routeToId ? "true" : undefined}
                aria-describedby={routeHint ? "sb-route-hint" : undefined}>
                Get directions
              </button>
              {(routeFromId || routeToId || route) && (
                <button className="sb-btn ghost" onClick={clearRoute}>Clear</button>
              )}
            </div>
          </div>

          {route && (
            <>
              <div className="sb-route-summary">
                <div>
                  <div className="sb-route-time">{route.totalMin} min</div>
                  <div className="sb-route-dist">{route.totalFt.toLocaleString()} ft walk</div>
                </div>
                <div className="sb-route-icon" aria-hidden="true">🚶</div>
              </div>
              {route.hasPins && (
                <div className="sb-route-pins-note">
                  <span><span aria-hidden="true">📌 </span>{route.pinCount} custom pin{route.pinCount === 1 ? "" : "s"} on this route</span>
                  <button className="sb-btn ghost small" onClick={() => {
                    window.routePinStore.clear(routeFromId, routeToId);
                    setRoute(window.buildRoute(routeFromId, routeToId));
                    focusPanelStart(); // this button goes away with the pins
                  }}>Reset to auto</button>
                </div>
              )}
              <SectionHeader>Step by step</SectionHeader>
              <ol className="sb-steps">
                {route.steps.map((s, i) => (
                  <li key={i} className={`sb-step sb-step-${s.icon}`}>
                    <span className="sb-step-icon" aria-hidden="true">
                      {s.icon === "start" && "●"}
                      {s.icon === "left" && "↰"}
                      {s.icon === "right" && "↱"}
                      {s.icon === "end" && "◉"}
                    </span>
                    <span className="sb-step-text">
                      {s.text}
                      {/* The site build knows the real scale (site-data.js), the same one the total uses. */}
                      {s.dist && <span className="sb-step-dist"> · {Math.round(s.dist * (window.MAP_SCALE?.ftPerPx || 1.5))} ft</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {routeHint && (!routeFromId || !routeToId) && <p id="sb-route-hint" className="sb-route-hint">{ROUTE_HINT}</p>}

          {!route && routeMissing && (
            <p className="sb-route-problem">No walking route was found between these two places. Try another starting point, or ask at an information desk.</p>
          )}

          {!route && !routeMissing && (
            <div className="sb-tip">
              <strong>Tip:</strong> Pick any building or parking lot. You can also click items on the map and use “Directions to here.”
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// A section's heading: h2, or h3 inside a place's card. `focusTarget` marks the one a panel
// change moves focus to (the Sidebar's effect), so it is read out when the panel opens.
function SectionHeader({ children, level = 2, focusTarget = false }) {
  const Tag = level === 3 ? "h3" : "h2";
  const focus = focusTarget ? { tabIndex: -1, "data-panel-focus": "" } : {};
  return <Tag className="sb-section" {...focus}>{children}</Tag>;
}

function CollapsibleSection({ title, open, setOpen, children, id }) {
  const bodyId = `sb-sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="sb-collapsible" id={id}>
      <h2 className="sb-collapsible-head">
        <button type="button"
          className={`sb-section sb-section-toggle ${open ? "open" : "closed"}`}
          aria-expanded={open} aria-controls={bodyId}
          onClick={() => setOpen(!open)}>
          <span className="sb-section-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          {title}
        </button>
      </h2>
      <div className="sb-collapsible-body" id={bodyId} hidden={!open}>{open && children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="sb-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="sb-toggle-track"><span className="sb-toggle-thumb"></span></span>
      <span className="sb-toggle-label">{label}</span>
    </label>
  );
}

function RouteField({ label, value, onChange, accent, placeholder, kind = "to" }) {
  const [open, setOpen] = useState2(false);
  const [q, setQ] = useState2("");
  const button = useRef2(null);
  const fid = `sb-route-${kind}`;
  // Close the list and put focus back on the field's button, which reads its label and value.
  const close = () => { setOpen(false); setQ(""); requestAnimationFrame(() => button.current?.focus()); };

  const items = useMemo(() => {
    if (kind === "from") {
      // Arrival points: parking lots, shuttle stops, points of interest
      const parking = window.BUILDINGS
        .filter(b => b.cat === "parking")
        .map(b => ({ id: `B_${b.code}`, label: `${b.code} · ${b.name}`, group: "Parking" }));
      const shuttles = (window.SHUTTLE_STOPS || [])
        .map(s => ({ id: `S_${s.id}`, label: `Shuttle stop · ${s.name}`, group: "Shuttle" }));
      const buses = (window.BUS_STOPS || [])
        .map(b => ({ id: `BUS_${b.id}`, label: `Bus stop · ${b.name}`, group: "Bus" }));
      const pois = (window.POIS || [])
        .map(p => ({ id: `POI_${p.id}`, label: `${p.name || "Point of interest"}`, group: "POI" }));
      return [...parking, ...shuttles, ...buses, ...pois];
    }
    // Destinations: all buildings
    return window.BUILDINGS.map(b => ({ id: `B_${b.code}`, label: `${b.code} · ${b.name}` }));
  }, [kind, window.POIS, window.SHUTTLE_STOPS, window.BUILDINGS]);

  const filtered = q ? items.filter(it => it.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : items.slice(0, 12);

  // Resolve the chip label across ALL possible sources (buildings, parking, shuttles,
  // buses, POIs) — not just `items`. Otherwise "Directions from here" on a building
  // sets a valid `B_<code>` value that the dropdown can't match, and the field
  // silently shows the placeholder while the state is in fact set correctly.
  const current = (() => {
    const inItems = items.find(it => it.id === value);
    if (inItems) return inItems;
    if (!value) return null;
    if (value.startsWith("B_")) {
      const b = window.BUILDINGS.find(x => x.code === value.slice(2));
      if (b) return { id: value, label: `${b.code} · ${b.name}` };
    }
    if (value.startsWith("S_")) {
      const s = (window.SHUTTLE_STOPS || []).find(x => x.id === value.slice(2));
      if (s) return { id: value, label: `Shuttle stop · ${s.name}` };
    }
    if (value.startsWith("BUS_")) {
      const b = (window.BUS_STOPS || []).find(x => x.id === value.slice(4));
      if (b) return { id: value, label: `Bus stop · ${b.name}` };
    }
    if (value.startsWith("POI_")) {
      const p = (window.POIS || []).find(x => x.id === value.slice(4));
      if (p) return { id: value, label: `${p.name || "Point of interest"}` };
    }
    return null;
  })();

  return (
    <div className="sb-route-field">
      <span className="sb-route-pin" style={{ background: accent }} aria-hidden="true">{label[0]}</span>
      <div className="sb-route-input-wrap"
        onBlur={(e) => { if (open && !e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setQ(""); } }}>
        <div className="sb-route-label" id={`${fid}-label`}>{label}</div>
        {/* Named by its label and its value: "From, P1 · Parking 1". */}
        <button type="button" ref={button} className="sb-route-input"
          aria-expanded={open} aria-controls={`${fid}-list`}
          aria-labelledby={`${fid}-label ${fid}-value`}
          onClick={() => setOpen(!open)}>
          <span id={`${fid}-value`} className={current ? undefined : "sb-route-placeholder"}>{current ? current.label : placeholder}</span>
          <span className="sb-route-caret" aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="sb-route-dropdown" id={`${fid}-list`}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
            {/* Focus goes to the filter because the visitor just opened this list. */}
            <input autoFocus aria-label={`Type to filter the ${label} list`} autoComplete="off"
              placeholder="Type to filter…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="sb-route-options" role="group" aria-label={`${label} choices`}>
              {filtered.map(it => (
                <button type="button" key={it.id} className="sb-route-option" onClick={() => { onChange(it.id); close(); }}>
                  {it.label}
                </button>
              ))}
              {filtered.length === 0 && <div className="sb-route-empty">No matches</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
