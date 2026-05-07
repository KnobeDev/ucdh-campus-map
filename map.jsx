// CampusMap — renders the original PNG as backdrop with interactive overlays on top.

const { useState, useEffect, useRef } = React;

function CampusMap({
  selectedId, hoveredId, onHover, onSelect,
  filters, route, routeFromId, routeToId, recomputeRoute,
  showShuttle, showPois, showLabels, showHotspots, theme,
  showEntrances, showCrosswalks, showPaths,
  editMode, editSubMode, editTargetId, setEditTargetId,
  edgePickFirst, setEdgePickFirst, pathTypeDefault,
}) {
  const svgRef = useRef(null);
  const W = window.MAP_IMG.w, H = window.MAP_IMG.h;
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  const dragRef = useRef(null);

  const onWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cur = pt.matrixTransform(svg.getScreenCTM().inverse());
    const scale = e.deltaY > 0 ? 1.15 : 1/1.15;
    const newW = Math.max(300, Math.min(W*1.2, vb.w * scale));
    const newH = newW * (H/W);
    setVb({
      x: cur.x - (cur.x - vb.x) * (newW/vb.w),
      y: cur.y - (cur.y - vb.y) * (newH/vb.h),
      w: newW, h: newH,
    });
  };
  const onMouseDown = (e) => {
    if (editMode) return; // disable pan in edit mode
    if (e.button !== 0) return;
    const r = svgRef.current.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y,
      kx: vb.w/r.width, ky: vb.h/r.height, moved: false };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const dx = (e.clientX - d.sx) * d.kx;
    const dy = (e.clientY - d.sy) * d.ky;
    if (Math.abs(dx)+Math.abs(dy) > 4) d.moved = true;
    setVb(v => ({...v, x: d.vx - dx, y: d.vy - dy }));
  };
  const onMouseUp = () => { dragRef.current = null; };

  const reset = () => setVb({ x:0, y:0, w:W, h:H });
  const zoom = (f) => {
    const cx = vb.x + vb.w/2, cy = vb.y + vb.h/2;
    const newW = Math.max(300, Math.min(W*1.2, vb.w*f));
    const newH = newW * (H/W);
    setVb({ x: cx-newW/2, y: cy-newH/2, w:newW, h:newH });
  };

  // Auto-fit selection
  useEffect(() => {
    if (!selectedId) return;
    const b = window.BUILDINGS.find(x => x.code === selectedId);
    if (!b) return;
    const bb = window.buildingBBox(b);
    const cx = bb.x + bb.w/2, cy = bb.y + bb.h/2;
    const w = 500, h = w * (H/W);
    setVb({ x: cx-w/2, y: cy-h/2, w, h });
  }, [selectedId]);

  // Auto-fit route
  useEffect(() => {
    if (!route) return;
    const xs = route.points.map(p=>p.x), ys = route.points.map(p=>p.y);
    const pad = 80;
    const minX=Math.min(...xs)-pad, minY=Math.min(...ys)-pad;
    const maxX=Math.max(...xs)+pad, maxY=Math.max(...ys)+pad;
    let w=maxX-minX, h=maxY-minY;
    if (w/h > W/H) h = w * (H/W); else w = h * (W/H);
    setVb({ x:(minX+maxX)/2 - w/2, y:(minY+maxY)/2 - h/2, w, h });
  }, [route]);

  const isFiltered = (cat) => filters.size === 0 || filters.has(cat);

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: editMode ? "default" : (dragRef.current?.moved ? "grabbing" : "grab"), userSelect: "none" }}
      >
        <defs>
          <filter id="bldgGlow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Base map image */}
        <image href={window.MAP_IMG.src} x="0" y="0" width={W} height={H}
               style={{ filter: ((() => {
                 const parts = [];
                 if (theme.imgFilter && theme.imgFilter !== "none") parts.push(theme.imgFilter);
                 if (filters.size > 0) parts.push("saturate(0.35) brightness(1.05)");
                 return parts.length ? parts.join(" ") : "none";
               })()) }} />

        {/* When filters are active, the PNG is desaturated above (CSS filter)
            so matched buildings stand out via their colored hotspot overlays. */}

        {/* Hotspots — hidden during hotspots edit submode (overlay handles them) */}
        {!(editMode && editSubMode === "hotspots") && window.BUILDINGS.map(b => {
          const cat = b.cat === "parking" ? "parking" : b.cat;
          const isF = isFiltered(cat);
          const isSel = selectedId === b.code;
          const isHov = hoveredId === b.code;
          const dim = filters.size > 0 && !isF;
          const path = window.buildingPath(b);
          const bbox = window.buildingBBox(b);
          if (dim && !isSel && !isHov) return (
            <g key={b.code} onMouseEnter={() => onHover(b.code)} onMouseLeave={() => onHover(null)}
               onClick={() => { if (!dragRef.current?.moved) onSelect(b.code); }}
               style={{ cursor:"pointer", opacity: 0 }}>
              <path d={path} fill="transparent" />
            </g>
          );
          const catColor = (window.CATEGORIES[b.cat] || window.PARKING_TYPES.patient).color;
          return (
            <g key={b.code}
               onMouseEnter={() => onHover(b.code)} onMouseLeave={() => onHover(null)}
               onClick={() => { if (!dragRef.current?.moved) onSelect(b.code); }}
               style={{ cursor:"pointer" }}>
              {/* Shape */}
              <path d={path}
                fill={isSel ? `${catColor}40` : (isHov ? `${catColor}30` : (filters.size > 0 ? `${catColor}40` : (showHotspots ? `${catColor}11` : "transparent")))}
                stroke={isSel ? "#022851" : (isHov ? catColor : (filters.size > 0 ? catColor : (showHotspots ? `${catColor}55` : "transparent")))}
                strokeWidth={isSel ? 3 : (isHov ? 2 : (filters.size > 0 ? 2 : 1))}
                strokeLinejoin="round" />
              {/* Code badge */}
              {(isSel || isHov || showLabels) && bbox.w >= 40 && (
                <g pointerEvents="none">
                  <circle cx={bbox.x + bbox.w/2} cy={bbox.y - 12} r="11"
                    fill={isSel ? "#022851" : "white"}
                    stroke={isSel ? "white" : catColor}
                    strokeWidth="2" />
                  <text x={bbox.x + bbox.w/2} y={bbox.y - 11} textAnchor="middle" dominantBaseline="middle"
                    fill={isSel ? "white" : catColor}
                    fontSize="11" fontWeight="800">
                    {b.code.length > 2 ? b.code.slice(0,2) : b.code}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Path lines (walk vs car) — visible by default in non-edit mode */}
        {showPaths && !editMode && (
          <g pointerEvents="none">
            {window.GRAPH_EDGES.map(([a,b], i) => {
              const A = window.GRAPH_NODES[a], B = window.GRAPH_NODES[b];
              if (!A || !B) return null;
              const k = window.edgeKey([a,b]);
              const type = (window.EDGE_META || {})[k]?.type;
              if (!type) return null;  // only show paths that have been explicitly typed
              const meta = window.EDGE_TYPES[type] || window.EDGE_TYPES.walk;
              return (
                <line key={i+"_p_"+k} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                  stroke={meta.color} strokeWidth={meta.width} opacity="0.75"
                  strokeDasharray={type === "car" ? "8 5" : (type === "both" ? "2 4" : "none")}
                  strokeLinecap="round" />
              );
            })}
          </g>
        )}

        {/* Crosswalks */}
        {showCrosswalks && !(editMode && editSubMode === "crosswalks") && (window.CROSSWALKS || []).map(xw => (
          <g key={xw.id} pointerEvents="none"
             transform={`translate(${xw.x} ${xw.y}) rotate(${xw.angle || 0})`}>
            <window.CrosswalkMarker selected={false} />
          </g>
        ))}

        {/* Entrances */}
        {showEntrances && !(editMode && editSubMode === "entrances") && (window.ENTRANCES || []).map(en => (
          <g key={en.id} pointerEvents="none">
            <window.EntranceMarker x={en.x} y={en.y} accessible={en.accessible} selected={false} />
          </g>
        ))}

        {/* Shuttle stops */}
        {showShuttle && !(editMode && editSubMode === "shuttle") && window.SHUTTLE_STOPS.map(s => (
          <g key={s.id} pointerEvents="none">
            <circle cx={s.x} cy={s.y} r="9" fill="#FFBF00" stroke="#022851" strokeWidth="2" />
            <text x={s.x} y={s.y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#022851">S</text>
          </g>
        ))}

        {/* POIs (user-added points of interest with optional events + maps link) */}
        {showPois && (window.POIS || []).map(p => (
          <g key={p.id} pointerEvents="none">
            <circle cx={p.x} cy={p.y} r="9" fill="#C8102E" stroke="white" strokeWidth="2" />
            <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="800" fill="white">★</text>
            {p.name && (
              <text x={p.x + 14} y={p.y + 4} fontSize="11" fontWeight="700" fill="#022851"
                style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>
                {p.name}
              </text>
            )}
          </g>
        ))}

        {/* Route */}
        {route && (
          <g pointerEvents="none">
            <polyline points={route.points.map(p => `${p.x},${p.y}`).join(" ")}
              fill="none" stroke="rgba(200,16,46,0.35)" strokeWidth="14"
              strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={route.points.map(p => `${p.x},${p.y}`).join(" ")}
              fill="none" stroke="#C8102E" strokeWidth="6"
              strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={route.points.map(p => `${p.x},${p.y}`).join(" ")}
              fill="none" stroke="white" strokeWidth="2"
              strokeDasharray="8 12" strokeLinejoin="round" strokeLinecap="round"
              className="route-flow" />
            <RoutePin x={route.points[0].x} y={route.points[0].y} color="#0E7C66" label="A" />
            <RoutePin x={route.points[route.points.length-1].x} y={route.points[route.points.length-1].y} color="#C8102E" label="B" />
          </g>
        )}
        {!route && routeFromId && <PendingPin id={routeFromId} color="#0E7C66" label="A" />}
        {!route && routeToId && <PendingPin id={routeToId} color="#C8102E" label="B" />}

        {/* Edit overlay */}
        {editMode && window.EditOverlay && (
          <window.EditOverlay
            svgRef={svgRef}
            mode={editSubMode}
            editTargetId={editTargetId}
            setEditTargetId={setEditTargetId}
            edgePickFirst={edgePickFirst}
            setEdgePickFirst={setEdgePickFirst}
            pathTypeDefault={pathTypeDefault}
            route={route} routeFromId={routeFromId} routeToId={routeToId}
            recomputeRoute={recomputeRoute}
          />
        )}
      </svg>

      <div className="map-controls">
        <button onClick={() => zoom(1/1.3)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1.3)} aria-label="Zoom out">−</button>
        <button onClick={reset} aria-label="Reset view" title="Reset view">⌂</button>
      </div>
    </div>
  );
}

function RoutePin({ x, y, color, label }) {
  return (
    <g>
      <ellipse cx={x} cy={y+3} rx="8" ry="2" fill="rgba(0,0,0,0.25)" />
      <circle cx={x} cy={y-14} r="11" fill={color} stroke="white" strokeWidth="2.5" />
      <path d={`M ${x-6} ${y-7} L ${x+6} ${y-7} L ${x} ${y+1} Z`} fill={color} />
      <text x={x} y={y-13} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="800">{label}</text>
    </g>
  );
}
function PendingPin({ id, color, label }) {
  const code = id.startsWith("B_") ? id.slice(2) : null;
  if (!code) return null;
  const b = window.BUILDINGS.find(x => x.code === code);
  if (!b) return null;
  const c = window.buildingCentroid(b);
  return <RoutePin x={c.cx} y={c.cy} color={color} label={label} />;
}

window.CampusMap = CampusMap;
