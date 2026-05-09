// EditToolbar — chrome shown at top of map when edit mode is on.

function EditToolbar({ mode, setMode, editTargetId, setEditTargetId, onClose, pathTypeDefault, setPathTypeDefault }) {
  const edits = window.useEdits();
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportText, setExportText] = React.useState("");
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState("");
  const [importErr, setImportErr] = React.useState("");
  const fileInputRef = React.useRef(null);

  const target = (() => {
    if (!editTargetId) return null;
    if (editTargetId.kind === "building") {
      const b = window.BUILDINGS.find(x => x.code === editTargetId.code);
      return b && { kind:"building", data: b };
    }
    if (editTargetId.kind === "node") {
      const n = window.GRAPH_NODES[editTargetId.id];
      return n && { kind:"node", id: editTargetId.id, data: n };
    }
    if (editTargetId.kind === "shuttle") {
      const s = window.SHUTTLE_STOPS.find(x => x.id === editTargetId.id);
      return s && { kind:"shuttle", data: s };
    }
    if (editTargetId.kind === "entrance") {
      const e = window.ENTRANCES.find(x => x.id === editTargetId.id);
      return e && { kind:"entrance", id: editTargetId.id, data: e };
    }
    if (editTargetId.kind === "crosswalk") {
      const c = window.CROSSWALKS.find(x => x.id === editTargetId.id);
      return c && { kind:"crosswalk", id: editTargetId.id, data: c };
    }
    if (editTargetId.kind === "constructionZone") {
      const z = (window.CONSTRUCTION_ZONES || []).find(x => x.id === editTargetId.id);
      return z && { kind:"constructionZone", id: editTargetId.id, data: z };
    }
    if (editTargetId.kind === "poi") {
      const p = (window.POIS || []).find(x => x.id === editTargetId.id);
      return p && { kind:"poi", id: editTargetId.id, data: p };
    }
    return null;
  })();

  const updateBuilding = (patch) => {
    if (!target || target.kind !== "building") return;
    window.editStore.moveBuilding(target.data.code, patch);
  };
  const updateNode = (patch) => {
    if (!target || target.kind !== "node") return;
    const cur = window.GRAPH_NODES[target.id];
    if (patch.label !== undefined) {
      window.editStore.setNodeLabel(target.id, patch.label);
    } else {
      window.editStore.moveNode(target.id, patch.x ?? cur.x, patch.y ?? cur.y);
    }
  };
  const updateShuttle = (patch) => {
    if (!target || target.kind !== "shuttle") return;
    // Route through the store API so base-stop edits go to `shuttle{}` and
    // added-stop edits go to `addedShuttle{}` automatically.
    window.editStore.updateShuttle(target.data.id, patch);
  };
  const updateEntrance = (patch) => {
    if (!target || target.kind !== "entrance") return;
    window.editStore.updateEntrance(target.id, patch);
  };
  const updateCrosswalk = (patch) => {
    if (!target || target.kind !== "crosswalk") return;
    window.editStore.updateCrosswalk(target.id, patch);
  };

  const editsCount =
    Object.keys(edits.buildings).length +
    Object.keys(edits.nodes).length +
    Object.keys(edits.addedNodes).length +
    edits.addedEdges.length +
    edits.removedEdges.length +
    Object.keys(edits.edgeMeta || {}).length +
    Object.keys(edits.shuttle).length +
    Object.keys(edits.addedShuttle || {}).length +
    Object.keys(edits.entrances || {}).length +
    Object.keys(edits.crosswalks || {}).length +
    Object.keys(edits.pois || {}).length;

  const helpText = window.EDIT_MODES.find(m => m.id === mode)?.help || "";

  // For entrance "assign to building" dropdown
  const buildingOptions = [{ value: "", label: "— None —" },
    ...window.BUILDINGS.map(b => ({ value: b.code, label: `${b.code} · ${b.name}` }))];

  return (
    <div className="edit-toolbar">
      <div className="edit-tb-row">
        <div className="edit-tb-left">
          <span className="edit-tb-badge">EDIT MODE</span>
          <div className="edit-tb-tabs">
            {window.EDIT_MODES.map(m => (
              <button key={m.id}
                className={`edit-tb-tab ${mode === m.id ? "active" : ""}`}
                onClick={() => { setMode(m.id); setEditTargetId(null); }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="edit-tb-right">
          <span className="edit-tb-count">{editsCount} edit{editsCount === 1 ? "" : "s"}</span>
          <button className="edit-tb-btn primary" title="Download these edits as default-edits.json with a fresh version stamp. After committing the file, every visitor's stale localStorage gets replaced on their next load." onClick={() => {
            // Apply: download the canonical default-edits.json so the user can commit it
            // to the repo and have these edits become the baseline for all visitors. The
            // file name matches what default-edits-loader.js fetches, making the swap a
            // straight drop-in replacement.
            //
            // Stamp a `_version` field with the current ISO timestamp. The loader will
            // compare this to localStorage's stored version and trigger a full reset of
            // any user-cached overrides whose keys we now ship as defaults — so editors
            // can publish updates without remembering to bump a constant in the loader.
            try {
              const edits = JSON.parse(window.editStore.exportJSON());
              edits._version = "applied-" + new Date().toISOString().replace(/[:.]/g, "-");
              const text = JSON.stringify(edits, null, 2);
              const blob = new Blob([text], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "default-edits.json";
              document.body.appendChild(a); a.click();
              setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
            } catch (err) {
              alert("Couldn't download default-edits.json: " + (err.message || err));
            }
          }}>
            ✓ Apply
          </button>
          <button className="edit-tb-btn" onClick={() => {
            setExportText(window.editStore.exportJSON());
            // also offer file download
            try {
              const blob = new Blob([window.editStore.exportJSON()], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "campus-map-edits.json";
              document.body.appendChild(a); a.click();
              setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
            } catch {}
            setExportOpen(true);
          }}>
            ⬇ Export
          </button>
          <button className="edit-tb-btn" onClick={() => { setImportErr(""); setImportText(""); setImportOpen(true); }}>
            ⬆ Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" style={{display:"none"}}
            onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader();
              r.onload = () => {
                try {
                  window.editStore.importJSON(String(r.result));
                  setImportOpen(false);
                } catch (err) { setImportErr(err.message || String(err)); }
              };
              r.readAsText(f);
              e.target.value = "";
            }} />
          <button className="edit-tb-btn danger" onClick={() => { if (confirm("Reset all edits? This cannot be undone.")) window.editStore.reset(); }}>
            Reset
          </button>
          <button className="edit-tb-btn" onClick={onClose}>Done</button>
        </div>
      </div>
      <div className="edit-tb-row edit-tb-help">
        <span>{helpText}</span>
        {mode === "paths" && (
          <span className="edit-tb-pathtype">
            <span className="edit-tb-help-label">New path type:</span>
            {["walk","car","both"].map(t => (
              <button key={t}
                className={`edit-tb-pill ${pathTypeDefault === t ? "active" : ""} pt-${t}`}
                onClick={() => setPathTypeDefault(t)}>
                {t === "walk" ? "🚶 Walk" : t === "car" ? "🚗 Car" : "Mixed"}
              </button>
            ))}
          </span>
        )}
      </div>

      {target && (
        <div className="edit-tb-inspector">
          {target.kind === "building" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code">{target.data.code}</span>
                <span className="edit-insp-name">{target.data.name}</span>
                <span className="edit-insp-shape">
                  {(target.data.points && target.data.points.length >= 3)
                    ? `polygon · ${target.data.points.length} pts`
                    : "rectangle"}
                </span>
              </div>
              <TextField label="Label" value={target.data.label || ""} width={180}
                onChange={(v) => updateBuilding({ label: v })} />
              {!(target.data.points && target.data.points.length >= 3) && (
                <>
                  <NumField label="X" value={target.data.x} onChange={(v) => updateBuilding({ x:v })} />
                  <NumField label="Y" value={target.data.y} onChange={(v) => updateBuilding({ y:v })} />
                  <NumField label="W" value={target.data.w} onChange={(v) => updateBuilding({ w:Math.max(8,v) })} />
                  <NumField label="H" value={target.data.h} onChange={(v) => updateBuilding({ h:Math.max(8,v) })} />
                  <button className="edit-tb-btn small" onClick={() => window.editStore.convertToPolygon(target.data.code)}>
                    ◇ Convert to polygon
                  </button>
                </>
              )}
              {(target.data.points && target.data.points.length >= 3) && (
                <button className="edit-tb-btn small" onClick={() => window.editStore.convertToRect(target.data.code)}>
                  ▭ Back to rectangle
                </button>
              )}
              <button className="edit-tb-btn small" onClick={() => {
                window.editStore.set(e => { const nn = {...e.buildings}; delete nn[target.data.code]; return {...e, buildings: nn}; });
              }}>Reset</button>
              <ConstructionControls building={target.data} edits={edits} />
            </>
          )}
          {target.kind === "node" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code">●</span>
                <span className="edit-insp-name">{target.id}</span>
              </div>
              <TextField label="Label" value={target.data.label || ""} width={200}
                onChange={(v) => updateNode({ label: v })} />
              <NumField label="X" value={target.data.x} onChange={(v) => updateNode({ x:v })} />
              <NumField label="Y" value={target.data.y} onChange={(v) => updateNode({ y:v })} />
              {edits.addedNodes[target.id] && (
                <button className="edit-tb-btn small danger" onClick={() => {
                  window.editStore.deleteAddedNode(target.id);
                  setEditTargetId(null);
                }}>Delete</button>
              )}
            </>
          )}
          {target.kind === "shuttle" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code">S</span>
                <span className="edit-insp-name">{target.data.name}</span>
              </div>
              <TextField label="Name" value={target.data.name || ""} width={220}
                onChange={(v) => window.editStore.updateShuttle(target.data.id, { name: v })} />
              <NumField label="X" value={target.data.x} onChange={(v) => updateShuttle({ x:v })} />
              <NumField label="Y" value={target.data.y} onChange={(v) => updateShuttle({ y:v })} />
              <button className="edit-insp-delete" onClick={() => {
                if (!confirm(`Delete shuttle stop "${target.data.name}"?`)) return;
                window.editStore.deleteShuttle(target.data.id);
                setEditTargetId(null);
              }}>Delete</button>
            </>
          )}
          {target.kind === "entrance" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code" style={{background: target.data.accessible ? "#0072CE" : "#022851"}}>
                  {target.data.accessible ? "♿" : "▢"}
                </span>
                <span className="edit-insp-name">Entrance</span>
              </div>
              <TextField label="Label" value={target.data.label || ""} width={180}
                onChange={(v) => updateEntrance({ label: v })} />
              <SelectField label="Building" value={target.data.building || ""} width={200}
                options={buildingOptions}
                onChange={(v) => updateEntrance({ building: v })} />
              <label className="edit-checkbox">
                <input type="checkbox" checked={!!target.data.accessible}
                  onChange={(e) => updateEntrance({ accessible: e.target.checked })} />
                <span>♿ Accessible (ADA)</span>
              </label>
              <NumField label="X" value={target.data.x} onChange={(v) => updateEntrance({ x:v })} />
              <NumField label="Y" value={target.data.y} onChange={(v) => updateEntrance({ y:v })} />
              <button className="edit-tb-btn small danger" onClick={() => {
                window.editStore.deleteEntrance(target.id);
                setEditTargetId(null);
              }}>Delete</button>
            </>
          )}
          {target.kind === "crosswalk" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code">▦</span>
                <span className="edit-insp-name">Crosswalk</span>
              </div>
              <TextField label="Label" value={target.data.label || ""} width={180}
                onChange={(v) => updateCrosswalk({ label: v })} />
              <NumField label="X" value={target.data.x} onChange={(v) => updateCrosswalk({ x:v })} />
              <NumField label="Y" value={target.data.y} onChange={(v) => updateCrosswalk({ y:v })} />
              <NumField label="Angle°" value={target.data.angle || 0}
                onChange={(v) => updateCrosswalk({ angle: ((v % 360) + 360) % 360 })} />
              <button className="edit-tb-btn small" onClick={() => updateCrosswalk({ angle: ((target.data.angle || 0) + 15) % 360 })}>
                ↻ +15°
              </button>
              <button className="edit-tb-btn small danger" onClick={() => {
                window.editStore.deleteCrosswalk(target.id);
                setEditTargetId(null);
              }}>Delete</button>
            </>
          )}
          {target.kind === "constructionZone" && (
            <>
              <div className="edit-insp-title">
                <span className="edit-insp-code" style={{ background: "#7A0019" }}>🚧</span>
                <span className="edit-insp-name">{target.data.name || "Construction zone"}</span>
                <span className="edit-insp-shape">{target.data.points?.length || 0} pts</span>
              </div>
              <TextField label="Name" value={target.data.name || ""} width={200}
                onChange={(v) => window.editStore.updateConstructionZone(target.id, { name: v })} />
              <label className="edit-num">
                <span>Start</span>
                <input type="date" value={target.data.startDate || ""} style={{ width: 130 }}
                  onChange={(e) => window.editStore.updateConstructionZone(target.id, { startDate: e.target.value })} />
              </label>
              <label className="edit-num">
                <span>End</span>
                <input type="date" value={target.data.endDate || ""} style={{ width: 130 }}
                  onChange={(e) => window.editStore.updateConstructionZone(target.id, { endDate: e.target.value })} />
              </label>
              <TextField label="Affects" value={(target.data.affects || []).join(", ")} width={140}
                onChange={(v) => window.editStore.updateConstructionZone(target.id, {
                  affects: v.split(",").map(s => s.trim()).filter(Boolean)
                })} />
              <button className="edit-tb-btn small danger" onClick={() => {
                if (confirm("Delete this construction zone?")) {
                  window.editStore.deleteConstructionZone(target.id);
                  setEditTargetId(null);
                }
              }}>Delete</button>
            </>
          )}
          {target.kind === "poi" && (
            <POIInspector poi={target.data} onChange={(patch) => window.editStore.updatePOI(target.id, patch)}
              onDelete={() => { window.editStore.deletePOI(target.id); setEditTargetId(null); }} />
          )}
        </div>
      )}

      {importOpen && (
        <div className="edit-export-modal" onClick={(e) => { if (e.target === e.currentTarget) setImportOpen(false); }}>
          <div className="edit-export-box">
            <div className="edit-export-head">
              <strong>Import map edits</strong>
              <button onClick={() => setImportOpen(false)}>✕</button>
            </div>
            <div style={{fontSize:12, color:"#5A6470"}}>
              Paste a previously-exported JSON below, or load a file. Accepts both the raw edits format and the full-data snapshot.
            </div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
              placeholder='{ "buildings": { ... }, "addedNodes": { ... } }' />
            {importErr && <div style={{color:"#C8102E", fontSize:12}}>⚠ {importErr}</div>}
            <div className="edit-export-actions">
              <button className="edit-tb-btn" onClick={() => fileInputRef.current?.click()}>Choose file…</button>
              <button className="edit-tb-btn primary" onClick={() => {
                try {
                  window.editStore.importJSON(importText);
                  setImportOpen(false);
                } catch (err) { setImportErr(err.message || String(err)); }
              }} disabled={!importText.trim()}>Import</button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="edit-export-modal" onClick={(e) => { if (e.target === e.currentTarget) setExportOpen(false); }}>
          <div className="edit-export-box">
            <div className="edit-export-head">
              <strong>Map data — copy & paste into data.jsx</strong>
              <button onClick={() => setExportOpen(false)}>✕</button>
            </div>
            <textarea value={exportText} readOnly />
            <div className="edit-export-actions">
              <button className="edit-tb-btn" onClick={() => { navigator.clipboard?.writeText(exportText); }}>
                Copy to clipboard
              </button>
              <button className="edit-tb-btn primary" onClick={() => setExportOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <label className="edit-num">
      <span>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
    </label>
  );
}
function TextField({ label, value, onChange, width = 140 }) {
  return (
    <label className="edit-num">
      <span>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width }} />
    </label>
  );
}
function SelectField({ label, value, onChange, options, width = 140 }) {
  return (
    <label className="edit-num">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width, padding:"4px 6px", border:"1px solid #E5E0D5", borderRadius:4, font:"inherit", fontSize:12 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// Construction controls inside the building inspector. Lets editors mark a hotspot as
// under construction with an end date — the construction zone is created using the
// building's current polygon (or rect, expanded to a 4-corner polygon) so routing has
// an obstacle to avoid. After endDate passes, edit-store.pruneExpiredZones drops the
// zone automatically on next read and routing reopens through the area.
function ConstructionControls({ building, edits }) {
  const zones = edits.constructionZones || {};
  const existing = Object.values(zones).find(z => (z.affects || []).includes(building.code));
  const [end, setEnd] = React.useState(existing?.endDate || "");
  const [name, setName] = React.useState(existing?.name || `${building.name} construction`);
  React.useEffect(() => {
    setEnd(existing?.endDate || "");
    setName(existing?.name || `${building.name} construction`);
  }, [building.code, existing?.id]);

  const polyForBuilding = () => {
    if (building.points && building.points.length >= 3) {
      return building.points.map(p => [p[0], p[1]]);
    }
    return [
      [building.x, building.y], [building.x + building.w, building.y],
      [building.x + building.w, building.y + building.h], [building.x, building.y + building.h],
    ];
  };

  const apply = () => {
    if (!end) { alert("Pick an end date first."); return; }
    if (existing) {
      window.editStore.updateConstructionZone(existing.id, { endDate: end, name, points: polyForBuilding() });
    } else {
      window.editStore.addConstructionZone(polyForBuilding(), {
        name,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: end,
        affects: [building.code],
      });
    }
  };
  const remove = () => {
    if (existing && confirm(`Remove construction marker on ${building.name}?`)) {
      window.editStore.deleteConstructionZone(existing.id);
    }
  };

  return (
    <div className="edit-construction">
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7A0019", marginRight: 6 }}>
        🚧 {existing ? "Construction active" : "Mark as construction"}
      </div>
      <TextField label="Name" value={name} width={160} onChange={setName} />
      <label className="edit-num">
        <span>End date</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 130 }} />
      </label>
      <button className="edit-tb-btn small primary" onClick={apply}>
        {existing ? "Update" : "Apply construction"}
      </button>
      {existing && (
        <button className="edit-tb-btn small danger" onClick={remove}>
          Remove
        </button>
      )}
    </div>
  );
}

function POIInspector({ poi, onChange, onDelete }) {
  const events = poi.events || [];
  const updateEvent = (idx, patch) => {
    const next = events.map((ev, i) => i === idx ? { ...ev, ...patch } : ev);
    onChange({ events: next });
  };
  const addEvent = () => onChange({ events: [...events, { title: "", when: "", note: "" }] });
  const removeEvent = (idx) => onChange({ events: events.filter((_, i) => i !== idx) });

  const linkValid = !poi.mapsLink || /^https?:\/\//i.test(poi.mapsLink);

  return (
    <>
      <div className="edit-insp-title">
        <span className="edit-insp-code">★</span>
        <span className="edit-insp-name">Point of interest</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 100%" }}>
        <TextField label="Name" value={poi.name || ""} width={260}
          onChange={(v) => onChange({ name: v })} />
        <label className="edit-num" style={{ alignItems: "flex-start" }}>
          <span style={{ paddingTop: 4 }}>Visitor instructions</span>
          <textarea value={poi.instructions || ""}
            placeholder="What visitors should know — e.g. enter through east lobby, ask at info desk."
            onChange={(e) => onChange({ instructions: e.target.value })}
            style={{ width: 320, minHeight: 50, padding: "4px 6px", border: "1px solid #E5E0D5", borderRadius: 4, font: "inherit", fontSize: 12, resize: "vertical" }} />
        </label>
        <label className="edit-num" style={{ alignItems: "flex-start" }}>
          <span style={{ paddingTop: 4 }}>Apple/Google Maps link</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 320 }}>
            <input type="url" value={poi.mapsLink || ""}
              placeholder="https://maps.google.com/?q=… or https://maps.apple.com/?q=…"
              onChange={(e) => onChange({ mapsLink: e.target.value })}
              style={{ width: "100%", padding: "4px 6px", border: `1px solid ${linkValid ? "#E5E0D5" : "#C8102E"}`, borderRadius: 4, font: "inherit", fontSize: 12 }} />
            <small style={{ color: "#5A6470", fontSize: 11 }}>
              Visitors can tap this link to open the location on their phone's map app.
            </small>
            {!linkValid && <small style={{ color: "#C8102E", fontSize: 11 }}>Must start with http(s)://</small>}
          </div>
        </label>
        <NumField label="X" value={poi.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y" value={poi.y} onChange={(v) => onChange({ y: v })} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <strong style={{ fontSize: 11, letterSpacing: 0.04, textTransform: "uppercase", color: "#5A6470" }}>Upcoming events</strong>
          <button className="edit-tb-btn small" onClick={addEvent}>+ Add event</button>
        </div>
        {events.length === 0 && (
          <small style={{ color: "#8A8F99", fontSize: 11 }}>No events yet — add one to highlight an upcoming activity at this location.</small>
        )}
        {events.map((ev, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, padding: "6px 8px", border: "1px solid #E5E0D5", borderRadius: 6, background: "#F8F6F0" }}>
            <input type="text" value={ev.title || ""} placeholder="Event title"
              onChange={(e) => updateEvent(i, { title: e.target.value })}
              style={{ padding: "4px 6px", border: "1px solid #E5E0D5", borderRadius: 4, font: "inherit", fontSize: 12 }} />
            <input type="text" value={ev.when || ""} placeholder="When (e.g. May 12, 6pm)"
              onChange={(e) => updateEvent(i, { when: e.target.value })}
              style={{ padding: "4px 6px", border: "1px solid #E5E0D5", borderRadius: 4, font: "inherit", fontSize: 12 }} />
            <button className="edit-tb-btn small danger" onClick={() => removeEvent(i)}>×</button>
            <input type="text" value={ev.note || ""} placeholder="Optional note (audience, registration, etc.)"
              onChange={(e) => updateEvent(i, { note: e.target.value })}
              style={{ gridColumn: "1 / span 3", padding: "4px 6px", border: "1px solid #E5E0D5", borderRadius: 4, font: "inherit", fontSize: 12 }} />
          </div>
        ))}

        <button className="edit-tb-btn small danger" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={onDelete}>
          Delete POI
        </button>
      </div>
    </>
  );
}

window.EditToolbar = EditToolbar;
