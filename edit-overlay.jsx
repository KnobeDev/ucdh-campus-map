// EditOverlay — renders edit handles on top of the SVG map.
// Sub-modes:
//   "hotspots"  — drag/resize/label building rectangles
//   "waypoints" — drag waypoint nodes; click two to toggle edge; edit labels
//   "addnode"   — click on map to drop a new waypoint
//   "paths"     — click two waypoints (or click an edge) to set walk/car type
//   "entrances" — click on map to drop entrance markers; toggle accessibility
//   "crosswalks"— click on map to drop crosswalk markers
//   "shuttle"   — drag shuttle stops

const EDIT_MODES = [
  { id: "hotspots",  label: "Hotspots",   help: "Click empty map to add a hotspot. Drag to move; corner to resize. Convert to polygon for irregular shapes — drag corners (alt-click to remove), or click any midpoint dot to add a vertex. Inspector edits name, code, category." },
  { id: "routes",    label: "Routes",     help: "Pick a From and To in the sidebar to show a route. Drag any corner to pin the route through that point. Click on the path to drop a new pin. Alt-click a pin to remove it. Use “Reset route” to clear." },
  { id: "waypoints", label: "Waypoints",  help: "Drag a waypoint to move. Click two waypoints to toggle an edge between them. Edit the label in the inspector." },
  { id: "addnode",   label: "+ Waypoint", help: "Click anywhere on the map to drop a new waypoint." },
  { id: "paths",     label: "Paths",      help: "Click an edge to cycle Walk → Car → Mixed. Or click two waypoints to add a new path with the current type." },
  { id: "entrances", label: "Entrances",  help: "Click on the map to add a building entrance. Use the inspector to mark accessible (♿) and assign to a building." },
  { id: "crosswalks",label: "Crosswalks", help: "Click on the map to mark a crosswalk. Drag to move; rotate using the inspector." },
  { id: "pois",      label: "POIs",       help: "Click on the map to drop a point of interest. Use the inspector to set its name, visitor instructions, upcoming events, and an Apple/Google Maps link so visitors can open the location on their phone." },
  { id: "shuttle",   label: "Shuttle",    help: "Click empty map to add a stop. Drag to reposition. Use the inspector to rename or delete." },
  { id: "construction", label: "Construction", help: "Drag a zone to move. Drag corners to reshape; click a midpoint to add a vertex; alt-click a corner to remove. Set name + end date in the inspector. After end date passes the zone auto-clears and routing re-opens through the area." },
];

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function EditOverlay({
  svgRef, mode, editTargetId, setEditTargetId,
  edgePickFirst, setEdgePickFirst, pathTypeDefault,
  route, routeFromId, routeToId, recomputeRoute,
}) {
  const edits = window.useEdits();
  const buildings = window.BUILDINGS;
  const nodes = window.GRAPH_NODES;
  const edges = window.GRAPH_EDGES;
  const shuttle = window.SHUTTLE_STOPS;
  const entrances = window.ENTRANCES;
  const crosswalks = window.CROSSWALKS;
  const pois = window.POIS || [];
  const edgeMeta = window.EDGE_META || {};
  const zones = window.CONSTRUCTION_ZONES || [];
  // Keep handles in sync with stored pins (subscribes to pin store)
  const pins = window.useRoutePins ? window.useRoutePins(routeFromId, routeToId) : [];

  const [drag, setDrag] = React.useState(null);

  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (drag.kind === "move") {
        window.editStore.moveBuilding(drag.code, {
          x: Math.round(drag.orig.x + dx),
          y: Math.round(drag.orig.y + dy),
        });
      } else if (drag.kind === "resize") {
        let { x, y, w, h } = drag.orig;
        if (drag.handle.includes("e")) w = Math.max(8, Math.round(drag.orig.w + dx));
        if (drag.handle.includes("s")) h = Math.max(8, Math.round(drag.orig.h + dy));
        if (drag.handle.includes("w")) {
          const nw = Math.max(8, Math.round(drag.orig.w - dx));
          x = Math.round(drag.orig.x + (drag.orig.w - nw)); w = nw;
        }
        if (drag.handle.includes("n")) {
          const nh = Math.max(8, Math.round(drag.orig.h - dy));
          y = Math.round(drag.orig.y + (drag.orig.h - nh)); h = nh;
        }
        window.editStore.moveBuilding(drag.code, { x, y, w, h });
      } else if (drag.kind === "node") {
        window.editStore.moveNode(drag.id, Math.round(drag.orig.x + dx), Math.round(drag.orig.y + dy));
      } else if (drag.kind === "shuttle") {
        window.editStore.updateShuttle(drag.id, { x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) });
      } else if (drag.kind === "entrance") {
        window.editStore.updateEntrance(drag.id, { x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) });
      } else if (drag.kind === "crosswalk") {
        window.editStore.updateCrosswalk(drag.id, { x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) });
      } else if (drag.kind === "poi") {
        window.editStore.updatePOI(drag.id, { x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) });
      } else if (drag.kind === "polyMove") {
        const moved = drag.orig.map(([px, py]) => [Math.round(px + dx), Math.round(py + dy)]);
        window.editStore.moveBuilding(drag.code, { points: moved });
      } else if (drag.kind === "polyVtx") {
        window.editStore.setPolygonPoint(drag.code, drag.idx, drag.orig.x + dx, drag.orig.y + dy);
      } else if (drag.kind === "czMove") {
        window.editStore.set(e => {
          const z = (e.constructionZones || {})[drag.id];
          if (!z) return e;
          const pts = drag.orig.map(([px, py]) => [Math.round(px + dx), Math.round(py + dy)]);
          return { ...e, constructionZones: { ...e.constructionZones, [drag.id]: { ...z, points: pts } } };
        });
      } else if (drag.kind === "czVtx") {
        window.editStore.setConstructionZonePoint(drag.id, drag.idx, drag.orig.x + dx, drag.orig.y + dy);
      } else if (drag.kind === "routePin") {
        window.routePinStore.move(drag.fromId, drag.toId, drag.idx,
          Math.round(drag.orig.x + dx), Math.round(drag.orig.y + dy));
      }
    };
    const onUp = () => {
      const wasRoute = drag && drag.kind === "routePin";
      setDrag(null);
      if (wasRoute && recomputeRoute) recomputeRoute();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag]);

  const onSvgClick = (e) => {
    if (e.target.tagName !== "rect" || e.target.dataset.bg !== "1") return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    if (mode === "addnode") {
      const id = "n_" + Math.random().toString(36).slice(2, 7);
      window.editStore.addNode(id, Math.round(p.x), Math.round(p.y), "");
      setEditTargetId({ kind: "node", id });
    } else if (mode === "entrances") {
      const id = window.editStore.addEntrance(Math.round(p.x), Math.round(p.y), { accessible: false });
      setEditTargetId({ kind: "entrance", id });
    } else if (mode === "crosswalks") {
      const id = window.editStore.addCrosswalk(Math.round(p.x), Math.round(p.y), { angle: 0 });
      setEditTargetId({ kind: "crosswalk", id });
    } else if (mode === "pois") {
      const id = window.editStore.addPOI(Math.round(p.x), Math.round(p.y));
      setEditTargetId({ kind: "poi", id });
    } else if (mode === "shuttle") {
      const id = window.editStore.addShuttle(Math.round(p.x), Math.round(p.y));
      setEditTargetId({ kind: "shuttle", id });
    } else if (mode === "hotspots") {
      const code = window.editStore.addBuilding(Math.round(p.x), Math.round(p.y));
      setEditTargetId({ kind: "building", code });
    } else {
      setEditTargetId(null);
      setEdgePickFirst(null);
    }
  };

  // Keyboard delete
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!editTargetId) return;
      // Don't delete while typing in an input
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (editTargetId.kind === "node" && edits.addedNodes[editTargetId.id]) {
        window.editStore.deleteAddedNode(editTargetId.id);
        setEditTargetId(null);
      } else if (editTargetId.kind === "entrance") {
        window.editStore.deleteEntrance(editTargetId.id);
        setEditTargetId(null);
      } else if (editTargetId.kind === "crosswalk") {
        window.editStore.deleteCrosswalk(editTargetId.id);
        setEditTargetId(null);
      } else if (editTargetId.kind === "building" && edits.addedBuildings && edits.addedBuildings[editTargetId.code]) {
        window.editStore.deleteBuilding(editTargetId.code);
        setEditTargetId(null);
      } else if (editTargetId.kind === "shuttle") {
        window.editStore.deleteShuttle(editTargetId.id);
        setEditTargetId(null);
      } else if (editTargetId.kind === "poi") {
        window.editStore.deletePOI(editTargetId.id);
        setEditTargetId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editTargetId, edits]);

  const HANDLE_R = 6;
  const ET = window.EDGE_TYPES;

  // helpers
  const getEdgeType = (a, b) => edgeMeta[window.edgeKey([a, b])]?.type || "walk";
  const cycleType = (cur) => cur === "walk" ? "car" : cur === "car" ? "both" : "walk";

  const showWaypoints = mode === "waypoints" || mode === "paths" || mode === "addnode";

  return (
    <g className="edit-overlay">
      <rect data-bg="1" x="0" y="0" width={window.MAP_IMG.w} height={window.MAP_IMG.h}
            fill="transparent"
            onMouseDown={onSvgClick}
            style={{ cursor: (mode === "addnode" || mode === "entrances" || mode === "crosswalks" || mode === "pois" || mode === "shuttle" || mode === "hotspots") ? "crosshair" : "default" }} />

      {/* HOTSPOTS */}
      {mode === "hotspots" && buildings.map(b => {
        const isTgt = editTargetId?.kind === "building" && editTargetId.code === b.code;
        const isPoly = !!(b.points && b.points.length >= 3);
        const centroid = window.buildingCentroid(b);
        const onShapeMouseDown = (e) => {
          e.stopPropagation();
          setEditTargetId({ kind: "building", code: b.code });
          if (isPoly) {
            // Drag whole polygon
            const p = svgPoint(svgRef.current, e.clientX, e.clientY);
            setDrag({ kind: "polyMove", code: b.code, start: p, orig: b.points.map(pt => [...pt]) });
          } else {
            const p = svgPoint(svgRef.current, e.clientX, e.clientY);
            setDrag({ kind: "move", code: b.code, start: p, orig: { x: b.x, y: b.y, w: b.w, h: b.h } });
          }
        };
        return (
          <g key={b.code}>
            <path d={window.buildingPath(b)}
              fill={isTgt ? "rgba(0,160,224,0.20)" : "rgba(255,0,255,0.12)"}
              stroke={isTgt ? "#00A0E0" : "#C8102E"}
              strokeWidth={isTgt ? 2.5 : 1.4}
              strokeDasharray={isTgt ? "none" : "4 3"}
              style={{ cursor: "move" }}
              onMouseDown={onShapeMouseDown} />
            <text x={centroid.cx} y={centroid.cy} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="800" fill="#022851" pointerEvents="none"
              style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>
              {b.code}
            </text>

            {/* Rect resize handles */}
            {isTgt && !isPoly && [
              ["nw", b.x, b.y], ["n",  b.x + b.w/2, b.y], ["ne", b.x + b.w, b.y],
              ["w",  b.x, b.y + b.h/2],                     ["e",  b.x + b.w, b.y + b.h/2],
              ["sw", b.x, b.y + b.h], ["s",  b.x + b.w/2, b.y + b.h], ["se", b.x + b.w, b.y + b.h],
            ].map(([h, hx, hy]) => (
              <rect key={h} x={hx - HANDLE_R} y={hy - HANDLE_R} width={HANDLE_R*2} height={HANDLE_R*2}
                fill="white" stroke="#00A0E0" strokeWidth="2"
                style={{ cursor: `${h}-resize` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                  setDrag({ kind: "resize", code: b.code, handle: h, start: p, orig: { x: b.x, y: b.y, w: b.w, h: b.h } });
                }} />
            ))}

            {/* Polygon vertex handles + midpoint inserters */}
            {isTgt && isPoly && (
              <>
                {b.points.map((pt, i) => {
                  const next = b.points[(i+1) % b.points.length];
                  const mid = [(pt[0]+next[0])/2, (pt[1]+next[1])/2];
                  return (
                    <g key={"pv"+i}>
                      {/* Midpoint: click to insert vertex */}
                      <circle cx={mid[0]} cy={mid[1]} r="4"
                        fill="white" stroke="#00A0E0" strokeWidth="1.5"
                        opacity="0.6"
                        style={{ cursor: "copy" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          window.editStore.insertPolygonPoint(b.code, i, mid[0], mid[1]);
                          // Begin dragging the new vertex
                          const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                          setDrag({ kind: "polyVtx", code: b.code, idx: i+1, start: p, orig: { x: mid[0], y: mid[1] } });
                        }} />
                      {/* Vertex */}
                      <rect x={pt[0] - HANDLE_R} y={pt[1] - HANDLE_R} width={HANDLE_R*2} height={HANDLE_R*2}
                        fill="white" stroke="#00A0E0" strokeWidth="2"
                        style={{ cursor: "move" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (e.altKey || e.metaKey) {
                            // alt-click → delete vertex
                            window.editStore.deletePolygonPoint(b.code, i);
                            return;
                          }
                          const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                          setDrag({ kind: "polyVtx", code: b.code, idx: i, start: p, orig: { x: pt[0], y: pt[1] } });
                        }} />
                    </g>
                  );
                })}
              </>
            )}
          </g>
        );
      })}

      {/* EDGES + WAYPOINTS — visible in waypoints, paths, addnode */}
      {(mode === "waypoints" || mode === "paths" || mode === "addnode") && (
        <>
          {edges.map(([a,b], i) => {
            const A = nodes[a], B = nodes[b];
            if (!A || !B) return null;
            const type = getEdgeType(a, b);
            const meta = ET[type] || ET.walk;
            const isPathMode = mode === "paths";
            return (
              <line key={i+"_"+a+"_"+b} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={meta.color} strokeWidth={meta.width} opacity={mode === "addnode" ? 0.4 : 0.85}
                strokeDasharray={type === "car" ? "8 5" : (type === "both" ? "2 4" : "none")}
                style={{ cursor: isPathMode ? "pointer" : (mode === "waypoints" ? "pointer" : "default") }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (mode === "paths") {
                    window.editStore.setEdgeType(a, b, cycleType(type));
                  } else if (mode === "waypoints") {
                    window.editStore.toggleEdge(a, b);
                  }
                }} />
            );
          })}
          {Object.entries(nodes).map(([id, n]) => {
            const isTgt = editTargetId?.kind === "node" && editTargetId.id === id;
            const isPick1 = edgePickFirst === id;
            const isAdded = !!edits.addedNodes[id];
            const lbl = (edits.nodes[id]?.label) || (edits.addedNodes[id]?.label) || "";
            return (
              <g key={id}>
                <circle cx={n.x} cy={n.y} r={isTgt ? 9 : (mode === "addnode" ? 4 : 7)}
                  fill={isPick1 ? "#FFBF00" : (isAdded ? "#0E7C66" : "white")}
                  stroke={isTgt ? "#00A0E0" : "#022851"} strokeWidth={isTgt ? 3 : 2}
                  opacity={mode === "addnode" ? 0.7 : 1}
                  style={{ cursor: mode === "addnode" ? "default" : "pointer" }}
                  onMouseDown={(e) => {
                    if (mode === "addnode") return;
                    e.stopPropagation();
                    if (mode === "paths") {
                      // Path-mode: pick two nodes to add an edge w/ default type
                      if (!edgePickFirst) { setEdgePickFirst(id); return; }
                      if (edgePickFirst !== id) {
                        const k = window.edgeKey([edgePickFirst, id]);
                        const exists = window.GRAPH_EDGES.some(ed => window.edgeKey(ed) === k);
                        if (exists) {
                          window.editStore.setEdgeType(edgePickFirst, id, pathTypeDefault || "walk");
                        } else {
                          window.editStore.toggleEdge(edgePickFirst, id, pathTypeDefault || "walk");
                        }
                      }
                      setEdgePickFirst(null);
                      return;
                    }
                    // waypoints mode
                    if (e.shiftKey) {
                      if (!edgePickFirst) { setEdgePickFirst(id); }
                      else {
                        if (edgePickFirst !== id) window.editStore.toggleEdge(edgePickFirst, id);
                        setEdgePickFirst(null);
                      }
                      return;
                    }
                    setEditTargetId({ kind: "node", id });
                    setEdgePickFirst(null);
                    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                    setDrag({ kind: "node", id, start: p, orig: { x: n.x, y: n.y } });
                  }} />
                {(isTgt || (lbl && mode !== "addnode")) && (
                  <text x={n.x + 12} y={n.y + 4} fontSize="11" fontWeight="700" fill="#022851"
                        style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }} pointerEvents="none">
                    {lbl || id}
                  </text>
                )}
              </g>
            );
          })}
        </>
      )}

      {/* ENTRANCES */}
      {(mode === "entrances" || mode === "paths" || mode === "waypoints") && entrances.map(en => {
        const isTgt = editTargetId?.kind === "entrance" && editTargetId.id === en.id;
        const interactive = mode === "entrances";
        return (
          <g key={en.id} style={{ cursor: interactive ? "move" : "default" }}
            onMouseDown={(e) => {
              if (!interactive) return;
              e.stopPropagation();
              setEditTargetId({ kind: "entrance", id: en.id });
              const p = svgPoint(svgRef.current, e.clientX, e.clientY);
              setDrag({ kind: "entrance", id: en.id, start: p, orig: { x: en.x, y: en.y } });
            }}>
            {/* Larger invisible hit area so the label and a generous halo around the marker are clickable */}
            {interactive && <circle cx={en.x} cy={en.y} r="14" fill="transparent" />}
            <EntranceMarker x={en.x} y={en.y} accessible={en.accessible} selected={isTgt} />
            {(isTgt || en.label) && (
              <text x={en.x + 14} y={en.y + 4} fontSize="11" fontWeight="700" fill="#022851"
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }} pointerEvents="none">
                {en.label || (en.accessible ? "Accessible entrance" : "Entrance")}
              </text>
            )}
          </g>
        );
      })}

      {/* POIs (visible in pois edit mode) */}
      {mode === "pois" && pois.map(poi => {
        const isTgt = editTargetId?.kind === "poi" && editTargetId.id === poi.id;
        return (
          <g key={poi.id} style={{ cursor: "move" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setEditTargetId({ kind: "poi", id: poi.id });
              const p = svgPoint(svgRef.current, e.clientX, e.clientY);
              setDrag({ kind: "poi", id: poi.id, start: p, orig: { x: poi.x, y: poi.y } });
            }}>
            <POIMarker x={poi.x} y={poi.y} selected={isTgt} type={poi.type} />
            <text x={poi.x + 14} y={poi.y + 4} fontSize="11" fontWeight="700" fill="#022851"
                  style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }} pointerEvents="none">
              {poi.name || (window.POI_TYPES?.[poi.type]?.label) || "POI"}
            </text>
          </g>
        );
      })}

      {/* CONSTRUCTION ZONES — editable polygons (drag, reshape, alt-click vertex to remove) */}
      {mode === "construction" && zones.map(z => {
        if (!z.points || z.points.length < 3) return null;
        const isTgt = editTargetId?.kind === "constructionZone" && editTargetId.id === z.id;
        const ptsAttr = z.points.map(p => p.join(",")).join(" ");
        const cx = z.points.reduce((s, p) => s + p[0], 0) / z.points.length;
        const cy = z.points.reduce((s, p) => s + p[1], 0) / z.points.length;
        return (
          <g key={z.id}>
            <polygon points={ptsAttr}
              fill={isTgt ? "rgba(255,199,44,0.55)" : "url(#czStripes)"}
              stroke={isTgt ? "#7A0019" : "#7A0019"}
              strokeWidth={isTgt ? 2.5 : 1.5}
              style={{ cursor: "move" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setEditTargetId({ kind: "constructionZone", id: z.id });
                const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                setDrag({ kind: "czMove", id: z.id, start: p, orig: z.points.map(pt => [...pt]) });
              }} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="800" fill="#7A0019"
              stroke="#FFF8E0" strokeWidth="2.5" paintOrder="stroke" pointerEvents="none">
              {z.name ? z.name.toUpperCase().slice(0, 26) : "CONSTRUCTION"}
            </text>
            {/* Vertex + midpoint handles only on the selected zone to keep the canvas clean */}
            {isTgt && z.points.map((pt, i) => {
              const next = z.points[(i + 1) % z.points.length];
              const mid = [(pt[0] + next[0]) / 2, (pt[1] + next[1]) / 2];
              return (
                <g key={"czh" + i}>
                  <circle cx={mid[0]} cy={mid[1]} r="4"
                    fill="white" stroke="#7A0019" strokeWidth="1.5" opacity="0.6"
                    style={{ cursor: "copy" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      window.editStore.insertConstructionZonePoint(z.id, i, mid[0], mid[1]);
                      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                      setDrag({ kind: "czVtx", id: z.id, idx: i + 1, start: p, orig: { x: mid[0], y: mid[1] } });
                    }} />
                  <rect x={pt[0] - HANDLE_R} y={pt[1] - HANDLE_R} width={HANDLE_R * 2} height={HANDLE_R * 2}
                    fill="white" stroke="#7A0019" strokeWidth="2"
                    style={{ cursor: "move" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (e.altKey || e.metaKey) {
                        window.editStore.deleteConstructionZonePoint(z.id, i);
                        return;
                      }
                      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                      setDrag({ kind: "czVtx", id: z.id, idx: i, start: p, orig: { x: pt[0], y: pt[1] } });
                    }}>
                    <title>Drag to move · Alt-click to remove (min 3 vertices)</title>
                  </rect>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* CROSSWALKS */}
      {(mode === "crosswalks" || mode === "paths" || mode === "waypoints") && crosswalks.map(xw => {
        const isTgt = editTargetId?.kind === "crosswalk" && editTargetId.id === xw.id;
        const interactive = mode === "crosswalks";
        return (
          <g key={xw.id} style={{ cursor: interactive ? "move" : "default" }}
            transform={`translate(${xw.x} ${xw.y}) rotate(${xw.angle || 0})`}
            onMouseDown={(e) => {
              if (!interactive) return;
              e.stopPropagation();
              setEditTargetId({ kind: "crosswalk", id: xw.id });
              const p = svgPoint(svgRef.current, e.clientX, e.clientY);
              setDrag({ kind: "crosswalk", id: xw.id, start: p, orig: { x: xw.x, y: xw.y } });
            }}>
            <CrosswalkMarker selected={isTgt} />
            {(isTgt || xw.label) && (
              <text x={20} y={4} fontSize="11" fontWeight="700" fill="#022851"
                    transform={`rotate(${-(xw.angle || 0)})`}
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }} pointerEvents="none">
                {xw.label || "Crosswalk"}
              </text>
            )}
          </g>
        );
      })}

      {/* ROUTE EDITING — handles on each route vertex + segment hit-areas */}
      {mode === "routes" && route && routeFromId && routeToId && (() => {
        const pts = route.points;
        return (
          <g className="route-edit-handles">
            {/* Segment hit-areas: click to insert a new pin at that point */}
            {pts.slice(0, -1).map((a, i) => {
              const b = pts[i + 1];
              return (
                <line key={"seg" + i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="rgba(0,160,224,0.001)" strokeWidth="22"
                  style={{ cursor: "copy" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
                    // Decide where in the pin sequence the new pin should slot.
                    // Count how many existing pins lie on or before segment i.
                    let pinIdx = 0;
                    for (let k = 0; k <= i && k < pts.length; k++) {
                      if (pts[k].pinned) pinIdx++;
                    }
                    const newIdx = window.routePinStore.add(routeFromId, routeToId, p.x, p.y, pinIdx);
                    if (recomputeRoute) recomputeRoute();
                    // Begin dragging the freshly added pin
                    setDrag({ kind: "routePin", fromId: routeFromId, toId: routeToId, idx: newIdx,
                              start: p, orig: { x: Math.round(p.x), y: Math.round(p.y) } });
                  }} />
              );
            })}
            {/* Existing pin handles + auto-turn handles */}
            {pts.map((p, i) => {
              const isEndpoint = i === 0 || i === pts.length - 1;
              if (isEndpoint) return null;
              if (p.pinned) {
                // User-placed pin (draggable; alt-click to delete)
                const pinIdx = pts.slice(0, i + 1).filter(q => q.pinned).length - 1;
                return (
                  <g key={"pin" + i}>
                    <circle cx={p.x} cy={p.y} r="9" fill="#FFBF00" stroke="#022851" strokeWidth="2.5"
                      style={{ cursor: "move" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (e.altKey || e.metaKey) {
                          window.routePinStore.remove(routeFromId, routeToId, pinIdx);
                          if (recomputeRoute) recomputeRoute();
                          return;
                        }
                        const sp = svgPoint(svgRef.current, e.clientX, e.clientY);
                        setDrag({ kind: "routePin", fromId: routeFromId, toId: routeToId, idx: pinIdx,
                                  start: sp, orig: { x: p.x, y: p.y } });
                      }}>
                      <title>Drag to move · Alt-click to remove</title>
                    </circle>
                    <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
                      fontSize="10" fontWeight="800" fill="#022851" pointerEvents="none">📌</text>
                  </g>
                );
              }
              // Auto turn-vertex (smaller, hollow): drag converts it into a pin
              return (
                <circle key={"turn" + i} cx={p.x} cy={p.y} r="6"
                  fill="white" stroke="#00A0E0" strokeWidth="2"
                  style={{ cursor: "grab" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const sp = svgPoint(svgRef.current, e.clientX, e.clientY);
                    // Count pinned points before this index → that's where the new pin slots
                    const pinIdx = pts.slice(0, i).filter(q => q.pinned).length;
                    const newIdx = window.routePinStore.add(routeFromId, routeToId, p.x, p.y, pinIdx);
                    setDrag({ kind: "routePin", fromId: routeFromId, toId: routeToId, idx: newIdx,
                              start: sp, orig: { x: p.x, y: p.y } });
                  }}>
                  <title>Drag to pin this turn</title>
                </circle>
              );
            })}
          </g>
        );
      })()}

      {/* SHUTTLE */}
      {mode === "shuttle" && shuttle.map(s => {
        const isTgt = editTargetId?.kind === "shuttle" && editTargetId.id === s.id;
        return (
          <g key={s.id} style={{ cursor: "move" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setEditTargetId({ kind: "shuttle", id: s.id });
              const p = svgPoint(svgRef.current, e.clientX, e.clientY);
              setDrag({ kind: "shuttle", id: s.id, start: p, orig: { x: s.x, y: s.y } });
            }}>
            <circle cx={s.x} cy={s.y} r={isTgt ? 12 : 10}
              fill="#FFBF00" stroke={isTgt ? "#00A0E0" : "#022851"} strokeWidth={isTgt ? 3 : 2} />
            <text x={s.x} y={s.y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#022851" pointerEvents="none">S</text>
            {isTgt && (
              <text x={s.x + 14} y={s.y + 4} fontSize="11" fontWeight="700" fill="#022851"
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }} pointerEvents="none">
                {s.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---- Marker primitives (used both in edit + read-only map) ----
function EntranceMarker({ x, y, accessible, selected }) {
  const fill = accessible ? "#0072CE" : "#022851";
  const r = selected ? 11 : 9;
  // No pointerEvents="none" here — the parent <g> in edit-overlay relies on
  // child hit areas to receive mousedown. Read-only call sites (map.jsx)
  // wrap the marker in their own non-interactive <g>.
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke="white" strokeWidth="2" />
      {accessible ? (
        // Wheelchair glyph
        <g transform={`translate(${x - 4} ${y - 5})`}>
          <circle cx="3" cy="2" r="1.4" fill="white" />
          <path d="M 1 5 L 1 8 L 5 8 M 5 8 L 7 11" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="3.5" cy="9" r="2.5" fill="none" stroke="white" strokeWidth="1.2" />
        </g>
      ) : (
        // Door glyph
        <g transform={`translate(${x - 3.5} ${y - 4.5})`}>
          <rect x="0" y="0" width="7" height="9" fill="none" stroke="white" strokeWidth="1.4" rx="0.5" />
          <circle cx="5" cy="5" r="0.9" fill="white" />
        </g>
      )}
      {selected && <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#00A0E0" strokeWidth="2" />}
    </g>
  );
}
window.EntranceMarker = EntranceMarker;

function CrosswalkMarker({ selected }) {
  // Drawn at origin, rotation handled by parent <g>
  const stripes = [];
  const W = 26, H = 14, n = 5, gap = W / n;
  for (let i = 0; i < n; i++) {
    stripes.push(<rect key={i} x={-W/2 + i*gap + 1} y={-H/2} width={gap - 2} height={H}
      fill="white" stroke="#022851" strokeWidth="0.8" />);
  }
  return (
    <g pointerEvents="none">
      <rect x={-W/2 - 2} y={-H/2 - 2} width={W + 4} height={H + 4} rx="2"
        fill={selected ? "rgba(0,160,224,0.25)" : "rgba(2,40,81,0.10)"}
        stroke={selected ? "#00A0E0" : "transparent"} strokeWidth="2" />
      {stripes}
    </g>
  );
}
window.CrosswalkMarker = CrosswalkMarker;

function POIMarker({ x, y, selected, type }) {
  // Resolve the type record so each POI category gets its own icon + color.
  // Falls back to the legacy red ★ pin when no type is set.
  const t = (window.POI_TYPES && window.POI_TYPES[type]) || (window.POI_TYPES && window.POI_TYPES.general)
    || { color: "#C8102E", icon: "★" };
  // Halo + body: type color, with a selection ring layered behind.
  const isEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u26D4\u26A1]/u.test(t.icon);
  return (
    <g>
      {selected && <circle cx={x} cy={y} r="12" fill={`${t.color}33`} />}
      <circle cx={x} cy={y} r="9" fill={t.color}
        stroke={selected ? "#022851" : "white"} strokeWidth="2" />
      <text x={x} y={y + (isEmoji ? 1 : 1)} textAnchor="middle" dominantBaseline="middle"
        fontSize={isEmoji ? "11" : "11"} fontWeight="800" fill="white" pointerEvents="none">
        {t.icon}
      </text>
    </g>
  );
}
window.POIMarker = POIMarker;

// ---- Building shape helpers ----
// Returns SVG <path> d-string covering either polygon or rect form
window.buildingPath = function(b) {
  // Several outlines (the site build: one per OpenStreetMap building it is made of)
  if (Array.isArray(b.parts) && b.parts.length) {
    return b.parts.map(ring => "M " + ring.map(p => p.join(",")).join(" L ") + " Z").join(" ");
  }
  if (b.points && b.points.length >= 3) {
    return "M " + b.points.map(p => p.join(",")).join(" L ") + " Z";
  }
  return `M ${b.x} ${b.y} L ${b.x+b.w} ${b.y} L ${b.x+b.w} ${b.y+b.h} L ${b.x} ${b.y+b.h} Z`;
};
// Centroid for label placement
window.buildingCentroid = function(b) {
  if (b.points && b.points.length >= 3) {
    let sx = 0, sy = 0;
    for (const p of b.points) { sx += p[0]; sy += p[1]; }
    return { cx: sx / b.points.length, cy: sy / b.points.length };
  }
  return { cx: b.x + b.w/2, cy: b.y + b.h/2 };
};
// Bbox top
window.buildingBBox = function(b) {
  // With several outlines the record's own box covers them all (site-data.js)
  if (Array.isArray(b.parts) && b.parts.length) return { x: b.x, y: b.y, w: b.w, h: b.h };
  if (b.points && b.points.length >= 3) {
    const xs = b.points.map(p => p[0]), ys = b.points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: b.x, y: b.y, w: b.w, h: b.h };
};

window.EditOverlay = EditOverlay;
window.EDIT_MODES = EDIT_MODES;
