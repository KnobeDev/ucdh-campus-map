// Tests for the Medical Center floor-plan registration.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { registerHospital, deriveBanks, clampInto, FLOOR_ORDER } = require("../lib/floorplan");
const { bbox, contains, area } = require("../lib/geom");

const DATA = path.join(__dirname, "..", "..", "3d", "campus-data.json");
const EDITS = path.join(__dirname, "..", "..", "default-edits.json");

function fixture() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const edits = JSON.parse(fs.readFileSync(EDITS, "utf8"));
  const T = data.buildings.find((b) => b.code === "T");
  return { data, floorsPx: edits.floorplan.T.floors, footprints: T.footprints };
}

test("floorplan: every traced floor registers, in storey order, LL below grade", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  assert.strictEqual(h.floors.length, 13);
  assert.strictEqual(h.floors[0].id, "LL");
  assert.strictEqual(h.floors[0].index, -1);
  assert.ok(h.floors[0].y < 0);
  for (let i = 1; i < h.floors.length; i++) {
    assert.ok(h.floors[i].y > h.floors[i - 1].y, `floor ${h.floors[i].id} is not above ${h.floors[i - 1].id}`);
  }
  assert.strictEqual(h.floors.find((f) => f.id === "14").index, 11); // no 9, no 13
});

test("floorplan: floor shapes ARE the real footprints — never a warped drawing", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const real = new Map(footprints.map((f) => [JSON.stringify(f.ring.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])), f.osmName]));
  const podium = footprints.find((f) => f.osmName === "UC Davis Medical Center");
  for (const f of h.floors) {
    for (const ring of f.rings) {
      assert.ok(real.has(JSON.stringify(ring)), `${f.id} has a ring that is not a real OSM footprint`);
    }
    // Connectors are the one non-OSM shape allowed: a band between two real
    // rings, built from THEIR facing edges (never from the printed plan), and
    // it must lie inside the podium footprint polygon — not just its bbox.
    assert.strictEqual(f.links.length, Math.max(0, f.rings.length - 1), `${f.id}: one connector per gap`);
    for (const l of f.links) {
      assert.ok(Array.isArray(l.between) && l.between.length === 2);
      for (const p of l.ring) assert.ok(contains(podium.ring, p), `${f.id}: connector vertex ${p} is outside the podium`);
    }
  }
  // The bug this guards: the oblique drawing stretched Level 1 to ~42,600 m²
  // against a real 32,640 m² podium, pushing a third of the Lower Level out
  // over Pathology, Parking 3 and North Addition.
  const one = h.floors.find((f) => f.id === "1");
  assert.strictEqual(one.rings.length, 1);
  assert.ok(Math.abs(area(one.rings[0]) - area(podium.ring)) < 1, "Level 1 is not exactly the podium footprint");
  // Tower floors are strictly smaller than the podium.
  const top = h.floors.find((f) => f.id === "14");
  assert.ok(area(top.rings[0]) < 0.25 * area(podium.ring));
});

test("floorplan: no floor spills outside the building envelope", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  const envelope = footprints.find((f) => f.osmName === "UC Davis Medical Center").ring;
  const env = bbox(envelope);
  for (const f of h.floors) {
    for (const ring of [...f.rings, ...f.links.map((l) => l.ring)]) {
      const b = bbox(ring);
      assert.ok(b.minX >= env.minX - 0.5 && b.maxX <= env.maxX + 0.5, `${f.id} spills out in x`);
      assert.ok(b.minZ >= env.minZ - 0.5 && b.maxZ <= env.maxZ + 0.5, `${f.id} spills out in z`);
    }
  }
});

test("floorplan: the estimated stairwell is placed in the data, beside the main elevator, inside the floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.stairs, `${f.id} has no stairwell`);
    assert.ok(f.rings.some((r) => contains(r, [f.stairs.x, f.stairs.z])), `${f.id}: stairs are outside the floor`);
    const main = f.nodes.find((n) => n.id === `T_${f.id}_elev_main`) || f.nodes.find((n) => n.kind === "elevator");
    assert.ok(Math.hypot(main.x - f.stairs.x, main.z - f.stairs.z) < 10, `${f.id}: stairs are far from the main elevator`);
  }
});

test("floorplan: entrances carry the point just inside the door, inside the podium", () => {
  const { data } = fixture();
  const floor1 = data.hospital.floors.find((f) => f.id === "1");
  for (const e of data.hospital.entrances) {
    assert.ok(e.inside && contains(floor1.rings[0], [e.inside.x, e.inside.z]), `${e.label}: no walkable point inside the door`);
  }
});

test("floorplan: every room and elevator sits inside its own floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    for (const n of f.nodes) {
      assert.ok(f.rings.some((r) => contains(r, [n.x, n.z])),
        `${f.id}: ${n.label || n.id} is outside the floor`);
    }
  }
});

test("floorplan: clampInto leaves interior points alone and pulls outside ones in", () => {
  const sq = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const inside = clampInto([sq], 10, 10);
  assert.strictEqual(inside.clamped, false);
  assert.strictEqual(inside.x, 10);
  const outside = clampInto([sq], 40, 10);
  assert.ok(outside.clamped);
  assert.ok(contains(sq, [outside.x, outside.z]), "a clamped point must land inside");
});

test("floorplan: every floor keeps an elevator", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  for (const f of h.floors) {
    assert.ok(f.nodes.some((n) => n.kind === "elevator"), `${f.id} has no elevator`);
  }
});

test("floorplan: the street-level entrances sit in the podium wall", () => {
  const { data } = fixture();
  const h = data.hospital;
  assert.ok(h && h.entrances.length >= 2);
  const floor1 = h.floors.find((f) => f.id === "1");
  for (const e of h.entrances) {
    assert.ok(e.curated && typeof e.snappedMetres === "number", `${e.label} lost its provenance`);
    let d = Infinity;
    for (const ring of floor1.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.z - az) * dz) / l2));
        d = Math.min(d, Math.hypot(ax + t * dx - e.x, az + t * dz - e.z));
      }
    }
    assert.ok(d < 0.05, `${e.label} is ${d.toFixed(2)} m off the podium wall`);
    assert.ok(e.snappedMetres < 60, `${e.label} was snapped ${e.snappedMetres} m — suspicious`);
  }
});

test("floorplan: elevator banks are derived from the nodes, and the main bank reaches every floor", () => {
  const { floorsPx, footprints } = fixture();
  const h = registerHospital(floorsPx, footprints, 4.2);
  assert.ok(h.banks["T-main"], "no T-main bank");
  assert.strictEqual(h.banks["T-main"].reaches.length, h.floors.length);
  assert.strictEqual(h.banks["T-main"].name, "Main elevators");
  const fake = deriveBanks([
    { id: "1", nodes: [{ kind: "elevator", elevatorId: "X", label: "Elevator" }] },
    { id: "2", nodes: [{ kind: "elevator", elevatorId: "Y", label: "Y bank" }] },
  ]);
  assert.deepStrictEqual(fake.X.reaches, ["1"]);
  assert.strictEqual(fake.X.name, "X");
  assert.strictEqual(fake.Y.name, "Y bank");
});

test("floorplan: a door snapped onto a corner slides along its wall until the frame is clear", () => {
  const { placeEntrances, DOOR_CLEAR } = require("../lib/floorplan");
  const sq = [[0, 0], [40, 0], [40, 40], [0, 40]];
  // Curated just outside the corner: the nearest wall point IS the corner.
  const [door] = placeEntrances([{ id: "d", label: "Door", x: -1, z: -1 }], [sq]);
  const onWall = Math.abs(door.z) < 1e-6 || Math.abs(door.x) < 1e-6;
  assert.ok(onWall, "still in the wall");
  const toCorner = Math.min(...sq.map(([vx, vz]) => Math.hypot(vx - door.x, vz - door.z)));
  assert.ok(toCorner >= DOOR_CLEAR - 1e-6, `only ${toCorner.toFixed(1)} m from a corner`);
  assert.ok(door.inside.x > 0 && door.inside.z > 0, "the inside step is inside");
  // A door already mid-wall does not move.
  const [mid] = placeEntrances([{ id: "m", label: "Mid", x: 20, z: -1 }], [sq]);
  assert.strictEqual(mid.x, 20);
});

test("floorplan: a canopy lobe is cut from the outline and kept as an awning", () => {
  const { cutLobe } = require("../lib/floorplan");
  // A 40 x 40 square with a 10 x 4 bump on its north side: the bump is an awning.
  const ring = [[0, 0], [15, 0], [15, -4], [25, -4], [25, 0], [40, 0], [40, 40], [0, 40]];
  const { ring: cut, lobe } = cutLobe(ring, [15, 0], [25, 0]);
  assert.deepStrictEqual(cut, [[0, 0], [15, 0], [25, 0], [40, 40 - 40 + 40 - 40 + 0 + 0 + 0 + 0 + 0], [40, 40], [0, 40]].slice(0, 2).concat([[25, 0], [40, 0], [40, 40], [0, 40]]));
  assert.deepStrictEqual(lobe, [[15, 0], [15, -4], [25, -4], [25, 0]]);
  // The order of the two neck points must not matter.
  assert.deepStrictEqual(cutLobe(ring, [25, 0], [15, 0]).lobe, lobe);
});

test("floorplan: the Medical Center's Main Entrance canopy is an awning, not floor", () => {
  const data = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "3d", "campus-data.json"), "utf8"));
  const h = data.hospital;
  assert.ok(h.awnings && h.awnings.length >= 1, "no awnings");
  const a = h.awnings[0];
  const { contains } = require("../lib/geom");
  const [cx, cz] = require("../lib/geom").centroid(a.ring);
  for (const f of h.floors) for (const r of f.rings) assert.ok(!contains(r, [cx, cz]), `floor ${f.id} still treats the awning as floor`);
  const T = data.buildings.find((b) => b.code === "T");
  for (const f of T.footprints) assert.ok(!contains(f.ring, [cx, cz]), "the walker would still collide with the awning outdoors");
});

test("floorplan: the Level 1 wall is open at each door itself, not two metres inside it", () => {
  const data = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "3d", "campus-data.json"), "utf8"));
  const f = data.hospital.floors.find((x) => x.id === "1");
  for (const e of data.hospital.entrances) {
    const blocking = f.interior.perimeter.filter(([x1, z1, x2, z2]) => {
      const dx = x2 - x1; const dz = z2 - z1; const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((e.x - x1) * dx + (e.z - z1) * dz) / L2));
      return Math.hypot(x1 + t * dx - e.x, z1 + t * dz - e.z) < 1.5;
    });
    assert.deepStrictEqual(blocking, [], `${e.label}: a wall piece runs across the door`);
  }
});

test("floorplan: nothing the Medical Center draws stands on a parking garage or lot", () => {
  // The owner (2026-11-20) asked whether the Medical Center was drawn over a parking area.
  // It is not: every floor ring, connector and awning is on the hospital's own OSM ways
  // (405350094 and the Pavilion and tower ways inside it). This keeps it that way.
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const h = data.hospital;
  const drawn = [];
  for (const f of h.floors) {
    f.rings.forEach((r, i) => drawn.push([`floor ${f.id} ring ${i}`, r]));
    (f.links || []).forEach((l, i) => drawn.push([`floor ${f.id} connector ${i}`, l.ring]));
  }
  for (const a of h.awnings || []) drawn.push([a.label, a.ring]);
  const parking = [];
  for (const b of data.buildings) {
    if (b.cat !== "parking" && !/parking|garage/i.test(b.name)) continue;
    for (const f of b.footprints) parking.push([`${b.name} (OSM ${f.osmId})`, f.ring]);
  }
  for (const a of data.areas) if (a.kind === "parking") parking.push([`parking lot (OSM ${a.osmId})`, a.ring]);
  assert.ok(parking.some(([n]) => /Parking 3/.test(n)), "Parking 3, beside the hospital, is in the data");
  /** Shared area of two rings, m², sampled on a 1 m grid over their common box. */
  const shared = (a, b) => {
    const A = bbox(a); const B = bbox(b);
    const x0 = Math.max(A.minX, B.minX); const x1 = Math.min(A.maxX, B.maxX);
    const z0 = Math.max(A.minZ, B.minZ); const z1 = Math.min(A.maxZ, B.maxZ);
    let n = 0;
    for (let x = x0 + 0.5; x < x1; x += 1) for (let z = z0 + 0.5; z < z1; z += 1) if (contains(a, [x, z]) && contains(b, [x, z])) n++;
    return n;
  };
  const over = [];
  for (const [dn, dr] of drawn) for (const [pn, pr] of parking) { const m2 = shared(dr, pr); if (m2 > 0) over.push(`${dn} covers ${m2} m² of ${pn}`); }
  assert.deepStrictEqual(over, []);
});

test("floorplan: the card's storeys for each Medical Center footprint are what the floor plan shows there, and no more", () => {
  // hospital.js draws the whole OSM outline (405350094) on LL and 1 only, the Pavilion up to
  // floor 3 and the towers higher. The card used to say "8 floors (estimated)" for the outline
  // and the Pavilion (checker, 2026-11-20). Then it said "1 floor (floorplan)" for the outline,
  // which was false too (checker, 2026-11-20, second pass): the floor plan only leaves the
  // outline's upper floors out, OSM gives it no building:levels, and the owner's photos show
  // multi-storey wings. So the outline's storeys are "not mapped"; its height stays the one
  // storey drawn, for collision. Where the plan does show upper floors the card names the top
  // floor's own number (Davis Tower: 14; there is no 9 or 13 on the plan).
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const h = data.hospital;
  const T = data.buildings.find((b) => b.code === "T");
  const key = (r) => JSON.stringify(r);
  const outline = h.floors.find((f) => f.id === "1").rings[0];
  const got = {};
  for (const fp of T.footprints) {
    // the podium floors' outline is the envelope every other footprint stands in
    let top = null;
    for (const f of h.floors) {
      if (f.index < 0) continue;
      if (f.rings.some((r) => key(r) === key(fp.ring) || key(r) === key(outline)) && (!top || f.index > top.index)) top = f;
    }
    if (top.index === 0) {
      assert.strictEqual(fp.floors, null, `${fp.osmName}: no storey count where the plan shows only the ground floor`);
      assert.strictEqual(fp.heightSource, "not mapped", fp.osmName);
      assert.strictEqual(fp.topFloor, undefined, fp.osmName);
      assert.ok(Math.abs(fp.height - h.floorH) < 1e-6, `${fp.osmName}: the drawn storey stays solid (${fp.height})`);
    } else {
      assert.strictEqual(fp.floors, top.index + 1, `${fp.osmName}: card ${fp.floors}, drawn ${top.index + 1}`);
      assert.ok(Math.abs(fp.height - (top.index + 1) * h.floorH) < 1e-6, `${fp.osmName}: height ${fp.height}`);
      assert.strictEqual(fp.heightSource, "floorplan", fp.osmName);
      assert.strictEqual(fp.topFloor, top.id, fp.osmName);
    }
    got[fp.osmName] = fp.topFloor || fp.heightSource;
  }
  assert.deepStrictEqual(got, {
    "UC Davis Medical Center": "not mapped",
    "Surgery and Emergency Services Pavilion": "3",
    "UC Davis Davis Tower": "14",
    "UC Davis University Tower": "8",
    "UC Davis East Wing": "8",
  });
});

test("floorplan: the two OSM rooftop helipads sit on the Davis Tower's roof", () => {
  // OSM ways 852273806 and 852273807 (aeroway=helipad, location=roof; cached in
  // ucdh-data/osm-helipads.json) are on the Davis Tower. The finished California Tower
  // carried the only helipads in the map, so it read as the hospital (checker, 2026-11-20).
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const h = data.hospital;
  const pads = h.helipads || [];
  assert.deepStrictEqual(pads.map((p) => p.osmId).sort(), [852273806, 852273807]);
  const davis = data.buildings.find((b) => b.code === "T").footprints.find((f) => f.osmName === "UC Davis Davis Tower");
  const top = h.floors[h.floors.length - 1];
  assert.strictEqual(top.id, "14");
  for (const p of pads) {
    assert.ok(contains(davis.ring, [p.x, p.z]), `${p.osmId} is on the Davis Tower`);
    assert.ok(top.rings.some((r) => contains(r, [p.x, p.z])), `${p.osmId} is over floor 14`);
    assert.ok(Math.abs(p.y - (top.y + h.floorH)) < 1e-6, `${p.osmId} on the roof: ${p.y}`);
    assert.ok(p.radius > 5 && p.radius <= 7.2, `${p.osmId} radius ${p.radius} fits OSM's 14 m square`);
    for (let a = 0; a < 24; a++) {
      const q = [p.x + p.radius * Math.cos((a * Math.PI) / 12), p.z + p.radius * Math.sin((a * Math.PI) / 12)];
      assert.ok(top.rings.some((r) => contains(r, q)), `${p.osmId}: the marking stays on the roof`);
    }
  }
});

test("floorplan: no outline traced from the printed map, and no unnamed hotspot, is drawn over the Medical Center", () => {
  // X1 "New hotspot" (a traced, unnamed 2D-editor shape for the California Tower site) was drawn
  // as a surface lot under the hospital's east end and offered as a destination.
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  assert.deepStrictEqual(data.buildings.filter((b) => /^\s*new hotspot\s*$/i.test(b.name)).map((b) => b.code), []);
  const rings = [];
  for (const f of data.hospital.floors) for (const r of [...f.rings, ...(f.links || []).map((l) => l.ring)]) rings.push(r);
  const over = [];
  for (const b of data.buildings) {
    for (const fp of b.footprints) {
      if (fp.geomSource !== "traced") continue;
      const A = bbox(fp.ring);
      let n = 0;
      for (const r of rings) {
        const B = bbox(r);
        for (let x = Math.max(A.minX, B.minX) + 0.5; x < Math.min(A.maxX, B.maxX); x += 1) {
          for (let z = Math.max(A.minZ, B.minZ) + 0.5; z < Math.min(A.maxZ, B.maxZ); z += 1) if (contains(fp.ring, [x, z]) && contains(r, [x, z])) n++;
        }
      }
      if (n) over.push(`${b.code} ${b.name}: ${n} m²`);
    }
  }
  assert.deepStrictEqual(over, []);
});
