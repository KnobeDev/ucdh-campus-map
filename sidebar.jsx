// Sidebar: search, category filters, building list, selected detail, route planner

const { useState: useState2, useMemo } = React;

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
  showEntrances, setShowEntrances,
  showCrosswalks, setShowCrosswalks,
  showLabels, setShowLabels,
  reduceMotion, setReduceMotion,
  panelMode, setPanelMode, // 'browse' | 'route' | 'detail'
  theme,
}) {
  const [query, setQuery] = useState2("");
  const [filterOpen, setFilterOpen] = useState2(true);
  const [layersOpen, setLayersOpen] = useState2(true);
  const [buildingsOpen, setBuildingsOpen] = useState2(true);
  const [parkingOpen, setParkingOpen] = useState2(false);
  const [shuttleOpen, setShuttleOpen] = useState2(false);
  const [poiOpen, setPoiOpen] = useState2(false);

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
    setQuery("");
    if (item.kind === "department") {
      setSelectedId(item.code);
    } else {
      setSelectedId(item.id);
    }
    setPanelMode("detail");
  };

  const computeRoute = () => {
    if (!routeFromId || !routeToId) return;
    const r = window.buildRoute(routeFromId, routeToId);
    setRoute(r);
  };

  const swapFromTo = () => {
    setRouteFromId(routeToId);
    setRouteToId(routeFromId);
    setRoute(null);
  };

  const clearRoute = () => {
    setRoute(null);
    setRouteFromId(null);
    setRouteToId(null);
  };

  return (
    <aside className="sidebar">
      <header className="sb-header">
        <div className="sb-logo">
          <div className="sb-logo-mark">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect x="3" y="14" width="26" height="15" rx="2" fill="#022851"/>
              <polygon points="3,14 16,5 29,14" fill="#FFBF00"/>
              <rect x="14" y="18" width="4" height="6" fill="#FFBF00"/>
              <rect x="7" y="18" width="3" height="3" fill="#FFBF00"/>
              <rect x="22" y="18" width="3" height="3" fill="#FFBF00"/>
            </svg>
          </div>
          <div>
            <div className="sb-logo-title">UC Davis Health</div>
            <div className="sb-logo-sub">Sacramento Campus Map</div>
          </div>
        </div>
      </header>

      {/* Mode tabs */}
      <div className="sb-tabs" role="tablist">
        <button role="tab" aria-selected={panelMode === "browse"}
          className={`sb-tab ${panelMode === "browse" ? "active" : ""}`}
          onClick={() => setPanelMode("browse")}>
          <span className="sb-tab-icon">⌕</span> Find a place
        </button>
        <button role="tab" aria-selected={panelMode === "route"}
          className={`sb-tab ${panelMode === "route" ? "active" : ""}`}
          onClick={() => setPanelMode("route")}>
          <span className="sb-tab-icon">↝</span> Directions
        </button>
      </div>

      {panelMode === "browse" && (
        <div className="sb-body">
          <div className="sb-search">
            <span className="sb-search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search buildings, clinics, services…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {query && <button className="sb-search-clear" onClick={() => setQuery("")}>×</button>}
          </div>

          {results.length > 0 && (
            <div className="sb-results">
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
                    <span className="sb-result-badge" style={{ background: color }}>{it.code}</span>
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
                <div className="sb-filters">
                  {Object.entries(window.CATEGORIES).map(([key, c]) => (
                    <button key={key}
                      className={`sb-filter ${filters.has(key) ? "active" : ""}`}
                      onClick={() => toggleFilter(key)}
                      style={{ "--filter-color": c.color }}>
                      <span className="sb-filter-dot" style={{ background: c.color }}></span>
                      {c.label}
                    </button>
                  ))}
                  <button className={`sb-filter ${filters.has("parking") ? "active" : ""}`}
                    onClick={() => toggleFilter("parking")}
                    style={{ "--filter-color": "#1ba0d3" }}>
                    <span className="sb-filter-dot" style={{ background: "#1ba0d3" }}></span>
                    Parking
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Layers" open={layersOpen} setOpen={setLayersOpen}>
                <div className="sb-toggles">
                  <Toggle label="Shuttle stops" checked={showShuttle} onChange={setShowShuttle} />
                  <Toggle label="Points of interest" checked={showPois} onChange={setShowPois} />
                  <Toggle label="Events" checked={showEvents} onChange={setShowEvents} />
                  <Toggle label="Accessibility (♿ parking, drop/pickup)" checked={showAccessibility} onChange={setShowAccessibility} />
                  <Toggle label="Parking & bikes" checked={showParkingBikes} onChange={setShowParkingBikes} />
                  <Toggle label="Valet" checked={showValet} onChange={setShowValet} />
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
                        onMouseEnter={() => setHoveredId(b.code)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { setSelectedId(b.code); setPanelMode("detail"); }}>
                        <span className="sb-list-badge" style={{ background: (window.CATEGORIES[b.cat]?.color || "#1ba0d3") }}>{b.code}</span>
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
                        onMouseEnter={() => setHoveredId(b.code)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => { setSelectedId(b.code); setPanelMode("detail"); }}>
                        <span className="sb-list-badge" style={{ background: "#1ba0d3" }}>{b.code}</span>
                        <span className="sb-list-name">{b.name}</span>
                      </button>
                    ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Shuttle stops" open={shuttleOpen} setOpen={setShuttleOpen}>
                <div className="sb-list">
                  {(window.SHUTTLE_STOPS || []).map(s => (
                    <div key={s.id} className="sb-list-item" style={{ cursor: "default" }}>
                      <span className="sb-list-badge" style={{ background: "#0E7C66" }} aria-hidden="true">⛟</span>
                      <span className="sb-list-name">{s.name}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

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
                        {p.mapsLink && /^https?:\/\//i.test(p.mapsLink) && (
                          <a className="sb-btn small" href={p.mapsLink} target="_blank" rel="noopener noreferrer">
                            <span style={{ marginRight: 6 }}>📱</span> Open in Maps
                          </a>
                        )}
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
        <div className="sb-body">
          <button className="sb-back" onClick={() => setPanelMode("browse")}>‹ Back</button>
          <div className="sb-detail">
            <div className="sb-detail-head" style={{ background: isParkingSelected ? window.parkingColorOf(selected) : (window.CATEGORIES[selected.cat]?.color || "#5A6470") }}>
              <div className="sb-detail-code">{selected.code}</div>
              <div className="sb-detail-name">{selected.name}</div>
              <div className="sb-detail-cat">
                {isParkingSelected ? window.PARKING_TYPES[window.parkingTypeOf(selected)].label : (window.CATEGORIES[selected.cat]?.label || "Facility")}
              </div>
            </div>

            <div className="sb-detail-actions">
              <button className="sb-btn primary" onClick={() => {
                setRouteToId(`${isParkingSelected ? "P" : "B"}_${selected.code}`);
                setPanelMode("route");
              }}>
                <span style={{ marginRight: 6 }}>↝</span> Directions to here
              </button>
              <button className="sb-btn" onClick={() => {
                setRouteFromId(`${isParkingSelected ? "P" : "B"}_${selected.code}`);
                setPanelMode("route");
              }}>
                Directions from here
              </button>
              <button className="sb-btn" onClick={() => {
                // Disambiguate from same-named places elsewhere — anchor to the UC Davis Health campus.
                const query = selected.mapsQuery || `${selected.name}, UC Davis Health, Sacramento, CA`;
                const enc = encodeURIComponent(query);
                const ua = navigator.userAgent || "";
                const isApple = /iPhone|iPad|iPod|Macintosh/.test(ua) && !/CrOS/.test(ua);
                const url = isApple
                  ? `https://maps.apple.com/?daddr=${enc}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
                window.open(url, "_blank", "noopener");
              }}>
                <span style={{ marginRight: 6 }}>📱</span> Get directions on phone
              </button>
            </div>

            {departmentsInBuilding.length > 0 && (
              <>
                <SectionHeader>Departments & services</SectionHeader>
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
                <SectionHeader>Nearby parking</SectionHeader>
                <ul className="sb-deps">
                  {window.BUILDINGS.filter(b => b.cat === "parking")
                    .map(p => ({ ...p, d: Math.hypot(selected.x - p.x, selected.y - p.y) }))
                    .sort((a, bb) => a.d - bb.d)
                    .slice(0, 3)
                    .map(p => (
                      <li key={p.code}>
                        <button className="sb-link" onClick={() => { setSelectedId(p.code); setPanelMode("detail"); }}>
                          <span className="sb-list-badge" style={{ background: "#1ba0d3", marginRight: 8 }}>{p.code}</span>
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

      {panelMode === "route" && (
        <div className="sb-body">
          <SectionHeader>Plan a walk</SectionHeader>
          <div className="sb-route-form">
            <RouteField label="From" kind="from" value={routeFromId} onChange={setRouteFromId} accent="#0E7C66" placeholder="Parking, shuttle stop, or point of interest" />
            <button className="sb-swap" onClick={swapFromTo} title="Swap" aria-label="Swap from and to">⇅</button>
            <RouteField label="To" kind="to" value={routeToId} onChange={setRouteToId} accent="#C8102E" placeholder="Pick a destination building" />
            <div className="sb-route-actions">
              <button className="sb-btn primary" onClick={computeRoute} disabled={!routeFromId || !routeToId}>
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
                <div className="sb-route-icon">🚶</div>
              </div>
              {route.hasPins && (
                <div className="sb-route-pins-note">
                  <span>📌 {route.pinCount} custom pin{route.pinCount === 1 ? "" : "s"} on this route</span>
                  <button className="sb-btn ghost small" onClick={() => {
                    window.routePinStore.clear(routeFromId, routeToId);
                    setRoute(window.buildRoute(routeFromId, routeToId));
                  }}>Reset to auto</button>
                </div>
              )}
              <SectionHeader>Step by step</SectionHeader>
              <ol className="sb-steps">
                {route.steps.map((s, i) => (
                  <li key={i} className={`sb-step sb-step-${s.icon}`}>
                    <span className="sb-step-icon">
                      {s.icon === "start" && "●"}
                      {s.icon === "left" && "↰"}
                      {s.icon === "right" && "↱"}
                      {s.icon === "end" && "◉"}
                    </span>
                    <span className="sb-step-text">
                      {s.text}
                      {s.dist && <span className="sb-step-dist"> · {Math.round(s.dist * 1.5)} ft</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {!route && (
            <div className="sb-tip">
              <strong>Tip:</strong> Pick any building or parking lot. You can also click items on the map and use “Directions to here.”
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function SectionHeader({ children }) {
  return <div className="sb-section">{children}</div>;
}

function CollapsibleSection({ title, open, setOpen, children, id }) {
  return (
    <div className="sb-collapsible" id={id}>
      <button type="button"
        className={`sb-section sb-section-toggle ${open ? "open" : "closed"}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <span className="sb-section-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <div className="sb-collapsible-body">{children}</div>}
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

  const items = useMemo(() => {
    if (kind === "from") {
      // Arrival points: parking lots, shuttle stops, points of interest
      const parking = window.BUILDINGS
        .filter(b => b.cat === "parking")
        .map(b => ({ id: `B_${b.code}`, label: `🅿 ${b.code} · ${b.name}`, group: "Parking" }));
      const shuttles = (window.SHUTTLE_STOPS || [])
        .map(s => ({ id: `S_${s.id}`, label: `⛟ ${s.name}`, group: "Shuttle" }));
      const buses = (window.BUS_STOPS || [])
        .map(b => ({ id: `BUS_${b.id}`, label: `🚌 ${b.name}`, group: "Bus" }));
      const pois = (window.POIS || [])
        .map(p => ({ id: `POI_${p.id}`, label: `★ ${p.name || "Point of interest"}`, group: "POI" }));
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
      if (b) return { id: value, label: `${b.cat === "parking" ? "🅿 " : ""}${b.code} · ${b.name}` };
    }
    if (value.startsWith("S_")) {
      const s = (window.SHUTTLE_STOPS || []).find(x => x.id === value.slice(2));
      if (s) return { id: value, label: `⛟ ${s.name}` };
    }
    if (value.startsWith("BUS_")) {
      const b = (window.BUS_STOPS || []).find(x => x.id === value.slice(4));
      if (b) return { id: value, label: `🚌 ${b.name}` };
    }
    if (value.startsWith("POI_")) {
      const p = (window.POIS || []).find(x => x.id === value.slice(4));
      if (p) return { id: value, label: `★ ${p.name || "Point of interest"}` };
    }
    return null;
  })();

  return (
    <div className="sb-route-field">
      <span className="sb-route-pin" style={{ background: accent }}>{label[0]}</span>
      <div className="sb-route-input-wrap">
        <div className="sb-route-label">{label}</div>
        <button className="sb-route-input" onClick={() => setOpen(!open)}>
          {current ? <span>{current.label}</span> : <span className="sb-route-placeholder">{placeholder}</span>}
          <span className="sb-route-caret">▾</span>
        </button>
        {open && (
          <div className="sb-route-dropdown">
            <input autoFocus placeholder="Type to filter…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="sb-route-options">
              {filtered.map(it => (
                <button key={it.id} className="sb-route-option" onClick={() => { onChange(it.id); setOpen(false); setQ(""); }}>
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
