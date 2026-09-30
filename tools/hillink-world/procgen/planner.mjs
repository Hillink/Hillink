// Pass 5A: the spatial planner answers "where should this capability physically exist?". It considers every way
// the world could make room, cheapest first in spirit:
//
//   existing-room   a vacant (or shareable) room that is already big enough
//   subdivide       split the spare length off a room
//   add-wing        extend the building to the rear along its corridor (a wing)
//   add-floor       a new storey on the stair core (upper floors carry no public spaces)
//   add-basement    a level below ground, where the water table allows
//   new-building    a vacant parcel in an existing district, with a road spur and a path
//   new-district    reserve and split a new block of land next to the settlement, then build there
//   outdoor-plot    open land (a yard, pad or field) on a vacant parcel, for outdoor capabilities
//
// Each option returns feasible or a reason it is not, and a cost. The cheapest feasible option wins (ties by
// option order, then target id), so the plan is deterministic and explainable: planCapability() returns every
// option it considered. Planning never changes the world; applyPlan() does, tagging every new or changed
// structure with the capability as its construction project (status 'planned' until HQ reports it built).
import { DIMS, snap, snapUp } from './units.mjs';
import { rng } from './rng.mjs';
import { rect, r3, centre, overlaps, containsRect, union, dist, segmentHitsRect, inset } from './geom.mjs';
import { normalizeCapability } from './capabilities.mjs';
import { buildableShare } from './terrain.mjs';
import { roomLength, roleFor, designBuilding, footprintFor, placeBuilding, addLevel, layoutBands, placeBandRooms, roomDoor, frame, refreshStairs, addDoor, addSpace, nextId } from './building.mjs';
import { addDistrict, routeTo, nearestRoadPoint, entrancePath, clearEnvironment, DISTRICT_SIZE } from './site.mjs';

export const OPTIONS = ['existing-room', 'subdivide', 'add-wing', 'add-floor', 'add-basement', 'new-building', 'new-district', 'outdoor-plot'];
const BASE_COST = { 'existing-room': 0, subdivide: 10, 'add-wing': 30, 'add-floor': 45, 'add-basement': 55, 'new-building': 60, 'new-district': 100, 'outdoor-plot': 20 };

const rooms = world => Object.values(world.spaces).filter(s => s.primitive === 'room');
const usedArea = (world, room) => room.capabilities.reduce((sum, id) => sum + (world.capabilities[id]?.spec.area ?? 0), 0);
const hosts = (world, b, kinds) => Object.values(world.capabilities).some(c => c.placement?.buildingId === b.id && kinds.includes(c.spec.kind));
// Roads and paths may not run through a new structure.
const clearOfWays = (world, r) => ![...Object.values(world.roads), ...Object.values(world.paths)].some(w => w.points.some((p, k) => k > 0 && segmentHitsRect(w.points[k - 1], p, inset(r, -1))));
const clearOfBuildings = (world, r) => !Object.values(world.buildings).some(b => overlaps(inset(b.footprint, -DIMS.setback), r));

export function planCapability(world, input, terrain) {
  const spec = normalizeCapability(input);
  if (world.capabilities[spec.id]) throw Error(`capability ${spec.id} already exists`);
  const considered = [];
  const add = (option, target, feasible, reason, extra = 0, apply = null) => considered.push({ option, target, feasible, reason, cost: feasible ? r3(BASE_COST[option] + extra) : null, apply });
  const levelOk = level => (spec.level === 'ground' ? level === 0 : spec.access === 'public' ? level === 0 : true);
  const levelBias = level => (spec.level === 'below' ? (level < 0 ? -30 : 10) : 0);
  const adjBias = b => (spec.adjacent.length && hosts(world, b, spec.adjacent) ? -5 : 0);
  // Public spaces want to be near their building's entrance, secure ones deep inside it.
  const depthBias = room => { const b = world.buildings[room.buildingId], d = b && world.doors[b.entranceDoorId]; if (!d) return 0; const m = dist(centre(room.rect), d.centre) + Math.abs(room.level) * 6; return spec.access === 'public' ? m / 2 : spec.access === 'secure' ? -m / 8 : 0; };

  if (spec.outdoor) {
    for (const x of ['existing-room', 'subdivide', 'add-wing', 'add-floor', 'add-basement']) add(x, null, false, 'an outdoor capability needs open land, not a room');
  } else {
    // existing-room
    for (const room of rooms(world)) {
      const b = world.buildings[room.buildingId];
      if (!levelOk(room.level)) { add('existing-room', room.id, false, `level ${room.level} is not allowed for ${spec.access}/${spec.level}`); continue; }
      if (room.vacant) {
        if (room.rect.w * room.rect.h + 1e-9 < spec.area * 0.9) add('existing-room', room.id, false, `vacant but ${r3(room.rect.w * room.rect.h)} m² < ${spec.area} m²`);
        else add('existing-room', room.id, true, `vacant ${r3(room.rect.w * room.rect.h)} m² room`, (room.rect.w * room.rect.h - spec.area) / 10 + levelBias(room.level) + adjBias(b) + depthBias(room), w => occupy(w, room.id, spec));
      } else if (spec.shareable && room.access === spec.access && room.capabilities.every(id => world.capabilities[id]?.spec.shareable)) {
        const free = room.rect.w * room.rect.h - usedArea(world, room);
        if (free + 1e-9 >= spec.area) add('existing-room', room.id, true, `shared: ${r3(free)} m² free`, 2 + levelBias(room.level) + adjBias(b) + depthBias(room), w => occupy(w, room.id, spec));
        else add('existing-room', room.id, false, `shared room has only ${r3(free)} m² free`);
      } else add('existing-room', room.id, false, room.capabilities.length ? 'occupied and not shareable' : 'not vacant');
    }
    // subdivide
    for (const room of rooms(world)) {
      if (!room.band || !levelOk(room.level)) continue;
      if (room.access === 'secure' && !room.vacant) { add('subdivide', room.id, false, 'secure rooms are not split'); continue; }
      const need = roomLength(spec.area, room.local.w), keep = room.vacant ? DIMS.room.minSide : roomLength(usedArea(world, room), room.local.w);
      if (room.local.d - need + 1e-9 >= keep) add('subdivide', room.id, true, `split ${need} m off a ${room.local.d} m room`, levelBias(room.level) + adjBias(world.buildings[room.buildingId]) + depthBias(room), w => subdivide(w, room.id, spec, need));
      else add('subdivide', room.id, false, `needs ${need} m, room has ${r3(room.local.d - keep)} m spare`);
    }
    for (const b of Object.values(world.buildings)) {
      // add-wing (ground level, to the rear)
      if (!levelOk(0)) add('add-wing', b.id, false, 'wings are ground level');
      else {
        const wing = wingGeometry(world, b, spec, terrain);
        add('add-wing', b.id, wing.ok, wing.reason, spec.area / 10 + levelBias(0) + adjBias(b), wing.ok ? w => addWing(w, b.id, spec, terrain) : null);
      }
      // add-floor / add-basement
      for (const [option, level] of [['add-floor', Math.max(...b.levels) + 1], ['add-basement', Math.min(...b.levels) - 1]]) {
        if (!levelOk(level)) { add(option, b.id, false, `${spec.id} must be at ground level`); continue; }
        if (option === 'add-floor' && b.levels.filter(l => l >= 0).length >= b.maxLevels) { add(option, b.id, false, `already ${b.maxLevels} storeys`); continue; }
        if (option === 'add-basement') {
          const under = undergroundLevels(world, b, terrain);
          if (-level > under) { add(option, b.id, false, under ? `only ${under} level(s) above the water table` : 'the water table is too high to dig'); continue; }
        }
        const bands = layoutBands({ program: [spec], bl: b.plan.bl, br: b.plan.br, start: b.plan.hallD, depth: b.plan.D - b.plan.hallD, r: rng(world.seed, 'level', b.id, level) });
        if (!bands) add(option, b.id, false, `${spec.area} m² does not fit a level of this building`);
        else add(option, b.id, true, `new level ${level} on the stair core`, levelBias(level) + adjBias(b), w => addStorey(w, b.id, level, spec));
      }
    }
  }
  // new-building / outdoor-plot on vacant parcels (nearest first), else a new district.
  const onParcel = spec.outdoor ? 'outdoor-plot' : 'new-building';
  let parcelOk = false;
  for (const p of vacantParcels(world).slice(0, 10)) {
    const trial = spec.outdoor ? outdoorOn(clone(world), p.id, spec, terrain) : buildOn(clone(world), p.id, spec, terrain);
    if (trial.ok) parcelOk = true;
    add(onParcel, p.id, trial.ok, trial.reason, dist(centre(p.rect), settlementCentre(world)) / 10, trial.ok ? w => (spec.outdoor ? outdoorOn(w, p.id, spec, terrain) : buildOn(w, p.id, spec, terrain)).placement : null);
  }
  if (spec.outdoor) for (const x of ['new-building']) add(x, null, false, 'an outdoor capability is not a building');
  const reserve = landFor(spec);
  for (const c of districtSites(world, terrain)) {
    const w2 = clone(world), d = addDistrict(w2, terrain, c.at, { seed: world.seed, key: c.key, reserve, toward: settlementCentre(world) });
    const p = districtParcel(w2, d, spec, terrain);
    const trial = p ? (spec.outdoor ? outdoorOn(w2, p.id, spec, terrain) : buildOn(w2, p.id, spec, terrain)) : { ok: false, reason: 'no parcel in it can hold this' };
    add('new-district', c.key, trial.ok, trial.ok ? `new district toward ${c.key}` : trial.reason, dist(c.at, settlementCentre(world)) / 10 + (parcelOk ? 0 : -20), trial.ok ? w => newDistrict(w, c, spec, terrain) : null);
  }
  const feasible = considered.filter(c => c.feasible).sort((a, b) => a.cost - b.cost || OPTIONS.indexOf(a.option) - OPTIONS.indexOf(b.option) || String(a.target).localeCompare(String(b.target)));
  const chosen = feasible[0] ?? null;
  return { capability: spec, chosen: chosen && { option: chosen.option, target: chosen.target, cost: chosen.cost, reason: chosen.reason }, considered: considered.map(({ apply, ...c }) => c), apply: chosen?.apply ?? null };
}

// Applies a plan. Every entity created or changed is tagged with project = capability id.
export function applyPlan(world, plan, { status = 'planned' } = {}) {
  if (!plan.apply) throw Error(`no feasible place for ${plan.capability.id}: ${plan.considered.filter(c => !c.feasible).slice(0, 3).map(c => `${c.option} ${c.target ?? ''}: ${c.reason}`).join('; ')}`);
  const before = new Set(entityIds(world));
  world.pendingStatus = status;
  const placement = plan.apply(world);
  delete world.pendingStatus;
  for (const [id, e] of entities(world)) if (!before.has(id)) { e.project = plan.capability.id; if (e.status === 'built' && status !== 'built') e.status = status; }
  for (const b of Object.values(world.buildings)) refreshStairs(world, b);
  // Prerequisites: unfinished projects this one hangs off (a road it branches from, anything unfinished in the same
  // building). It cannot be completed before them, so nothing built is ever reachable only through a plan.
  const unfinished = id => id !== plan.capability.id && world.capabilities[id] && !['built', 'operational'].includes(world.capabilities[id].status);
  const dependsOn = new Set();
  for (const [id, e] of entities(world)) if (!before.has(id)) {
    if (e.buildingId) for (const c of Object.values(world.capabilities)) if (unfinished(c.id) && c.placement?.buildingId === e.buildingId) dependsOn.add(c.id);
    if (e.primitive === 'road' && e.from && unfinished(world.roads[e.from]?.project)) dependsOn.add(world.roads[e.from].project);
  }
  const host = placement?.spaceId && world.spaces[placement.spaceId];
  if (host?.project && unfinished(host.project)) dependsOn.add(host.project);
  if (host?.buildingId) for (const c of Object.values(world.capabilities)) if (unfinished(c.id) && c.placement?.buildingId === host.buildingId) dependsOn.add(c.id);
  if (status === 'built' && dependsOn.size) throw Error(`${plan.capability.id} cannot be built before ${[...dependsOn].join(', ')}`);
  world.capabilities[plan.capability.id] = { id: plan.capability.id, spec: plan.capability, placement, option: plan.chosen.option, status: status === 'built' ? 'operational' : 'planned', dependsOn: [...dependsOn].sort() };
  clearEnvironment(world);
  return placement;
}

export const entities = world => [['districts', world.districts], ['parcels', world.parcels], ['roads', world.roads], ['paths', world.paths], ['buildings', world.buildings], ['spaces', world.spaces], ['doors', world.doors], ['points', world.points]].flatMap(([, m]) => Object.entries(m ?? {}));
const entityIds = world => entities(world).map(([id]) => id);
export const clone = world => structuredClone(world);
const adopt = (world, w2) => { for (const k of Object.keys(w2)) world[k] = w2[k]; };

export function settlementCentre(world) {
  const fps = Object.values(world.buildings).map(b => b.footprint);
  return fps.length ? centre(union(fps)) : world.origin;
}
const vacantParcels = world => Object.values(world.parcels).filter(p => p.status === 'vacant' && p.buildable >= 0.85).sort((a, b) => dist(centre(a.rect), settlementCentre(world)) - dist(centre(b.rect), settlementCentre(world)) || (a.id < b.id ? -1 : 1));

function occupy(world, roomId, spec) {
  const room = world.spaces[roomId];
  // Moving in is not construction: the room keeps its own project (if it is still being built, the capability waits for it).
  room.capabilities = [...room.capabilities, spec.id]; room.vacant = false; room.access = spec.access; room.roles = [roleFor(spec)];
  return { buildingId: room.buildingId, level: room.level, spaceId: room.id };
}

function subdivide(world, roomId, spec, need) {
  const room = world.spaces[roomId], b = world.buildings[room.buildingId], F = frame(b.block, b.front);
  const corridorId = `${b.id}-L${room.level}-corridor`; // wings extend the level's one corridor
  const keepD = room.local.d - need;
  room.local = { ...room.local, d: keepD }; room.rect = F.toWorld(room.local.u, room.local.v, room.local.w, keepD);
  // The kept room's door moves to its new centre.
  const d = world.doors[room.doorId], v = snap(room.local.v + keepD / 2), wallU = room.band === 'L' ? b.plan.bl : b.plan.bl + b.plan.cw, a = F.pt(wallU, v - d.width / 2), c = F.pt(wallU, v + d.width / 2);
  d.seg = { x1: a.x, y1: a.y, x2: c.x, y2: c.y }; d.centre = { x: r3((a.x + c.x) / 2), y: r3((a.y + c.y) / 2) };
  const status = world.pendingStatus ?? 'planned';
  const bands = { L: { slots: [] }, R: { slots: [] } };
  bands[room.band].slots.push({ spec, v: room.local.v + keepD, len: need });
  const [made] = placeBandRooms(world, b, room.level, bands, world.spaces[corridorId], F, status, room.wingId);
  return { buildingId: b.id, level: made.level, spaceId: made.id };
}

function wingGeometry(world, b, spec, terrain) {
  const P = b.plan, len = Math.max(roomLength(spec.area, P.bl), roomLength(spec.area, P.br));
  const F = frame(b.block, b.front), wingRect = F.toWorld(0, P.rearD, P.W, len);
  const parcel = world.parcels[b.parcelId];
  if (!containsRect(inset(parcel.rect, DIMS.setback), wingRect)) return { ok: false, reason: `a ${len} m rear wing leaves the parcel's buildable area` };
  if (buildableShare(terrain, wingRect) < 0.9) return { ok: false, reason: 'the ground behind the building is too steep or wet' };
  if (!clearOfWays(world, wingRect)) return { ok: false, reason: 'a road or path runs behind the building' };
  if (Object.values(world.spaces).some(s => s.primitive === 'outdoor-facility' && overlaps(s.rect, wingRect))) return { ok: false, reason: 'an outdoor facility is in the way' };
  return { ok: true, reason: `${len} m rear wing`, len, wingRect };
}

function addWing(world, bId, spec, terrain) {
  const b = world.buildings[bId], P = b.plan, g = wingGeometry(world, b, spec, terrain), F = frame(b.block, b.front), status = world.pendingStatus ?? 'planned';
  const r = rng(world.seed, 'wing', b.id, spec.id);
  const side = roomLength(spec.area, P.bl) <= roomLength(spec.area, P.br) ? (roomLength(spec.area, P.bl) === roomLength(spec.area, P.br) ? (r.chance(0.5) ? 'L' : 'R') : 'L') : 'R';
  const bands = { L: { slots: [] }, R: { slots: [] } };
  bands[side].slots.push({ spec, v: P.rearD, len: g.len });
  const other = side === 'L' ? 'R' : 'L';
  if (g.len >= DIMS.room.minSide) bands[other].slots.push({ spec: null, v: P.rearD, len: g.len });
  const wingId = nextId(world, 'wing');
  b.wings = [...b.wings, { id: wingId, primitive: 'wing', rect: g.wingRect, level: 0, status }];
  // The corridor grows into the wing (the new stretch is part of the wing's construction).
  const corr = world.spaces[`${b.id}-L0-corridor`];
  corr.local = { ...corr.local, d: corr.local.d + g.len }; corr.rect = F.toWorld(corr.local.u, corr.local.v, corr.local.w, corr.local.d);
  P.rearD = r3(P.rearD + g.len);
  b.footprint = union([b.footprint, g.wingRect]);
  const made = placeBandRooms(world, b, 0, bands, corr, F, status, wingId);
  const room = made.find(m => m.capabilities.includes(spec.id));
  return { buildingId: b.id, level: 0, spaceId: room.id, wingId };
}

function addStorey(world, bId, level, spec) {
  const b = world.buildings[bId], status = world.pendingStatus ?? 'planned';
  const bands = layoutBands({ program: [spec], bl: b.plan.bl, br: b.plan.br, start: b.plan.hallD, depth: b.plan.D - b.plan.hallD, r: rng(world.seed, 'level', b.id, level) });
  addLevel(world, b, level, bands.bands, status);
  const room = Object.values(world.spaces).find(s => s.buildingId === b.id && s.level === level && s.capabilities.includes(spec.id));
  return { buildingId: b.id, level, spaceId: room.id };
}

export function undergroundLevels(world, b, terrain) {
  const [i, j] = [Math.floor((b.block.x + b.block.w / 2) / terrain.cell), Math.floor((b.block.y + b.block.h / 2) / terrain.cell)];
  const ground = terrain.heights[j * terrain.n + i];
  return Math.max(0, Math.min(2, Math.floor((ground - terrain.waterLevel - 1) / DIMS.storey)));
}

// A new building for one capability on a vacant parcel: a road spur, the building facing it, a path.
function buildOn(world, parcelId, spec, terrain) {
  const parcel = world.parcels[parcelId];
  const design = designBuilding([spec], rng(world.seed, 'building', spec.id));
  const start = nearestRoadPoint(world, centre(parcel.rect));
  if (!start) return { ok: false, reason: 'no road network' };
  const spur = routeTo(world, terrain, start.point, parcel, { kind: 'spur', from: start.roadId });
  if (!spur) return { ok: false, reason: 'no road can reach the parcel' };
  const fp = footprintFor(parcel.rect, spur.front, design.W, design.D, rng(world.seed, 'slide', spec.id).float(0.2, 0.8));
  if (!fp) return { ok: false, reason: `a ${design.W}×${design.D} m building does not fit the parcel` };
  if (buildableShare(terrain, fp) < 0.9) return { ok: false, reason: 'the parcel is too steep or wet where the building would stand' };
  if (!clearOfWays(world, fp)) return { ok: false, reason: 'a road crosses the building site' };
  if (!clearOfBuildings(world, fp)) return { ok: false, reason: 'too close to another building' };
  const b = placeBuilding(world, { parcelId, fp, front: spur.front, design, status: world.pendingStatus ?? 'planned' });
  entrancePath(world, { roadEnd: spur.end, door: world.doors[b.entranceDoorId], front: spur.front, buildingId: b.id, status: world.pendingStatus ?? 'planned' });
  parcel.status = 'developed'; parcel.uses = [...parcel.uses, b.id];
  const room = Object.values(world.spaces).find(s => s.buildingId === b.id && s.capabilities.includes(spec.id));
  return { ok: true, reason: `new ${design.W}×${design.D} m building`, placement: { buildingId: b.id, level: 0, spaceId: room.id } };
}

// Open land for an outdoor capability: a square pad behind the setback on the road side, with a gate.
function outdoorOn(world, parcelId, spec, terrain) {
  const parcel = world.parcels[parcelId], side = snapUp(Math.sqrt(Math.max(spec.area, DIMS.room.minArea)));
  const start = nearestRoadPoint(world, centre(parcel.rect));
  if (!start) return { ok: false, reason: 'no road network' };
  const spur = routeTo(world, terrain, start.point, parcel, { kind: 'spur', from: start.roadId });
  if (!spur) return { ok: false, reason: 'no road can reach the parcel' };
  const fp = footprintFor(parcel.rect, spur.front, side, side, 0.5);
  if (!fp) return { ok: false, reason: `a ${side} m square does not fit the parcel` };
  if (buildableShare(terrain, fp) < 0.8) return { ok: false, reason: 'the land is too steep or wet' };
  if (!clearOfWays(world, fp)) return { ok: false, reason: 'a road crosses the site' };
  const status = world.pendingStatus ?? 'planned';
  const id = nextId(world, 'yard');
  const yard = addSpace(world, id, { primitive: 'outdoor-facility', roles: [spec.access === 'secure' ? 'secure-area' : 'workstation-area'], level: 0, rect: fp, access: spec.access, capabilities: [spec.id], status });
  const F = frame(fp, spur.front), gw = DIMS.path.width, u = side / 2;
  const gate = addDoor(world, { level: 0, a: id, b: 'outside', seg: [F.pt(u - gw / 2, 0), F.pt(u + gw / 2, 0)], width: gw, height: DIMS.entrance.height, kind: 'gate', status });
  entrancePath(world, { roadEnd: spur.end, door: world.doors[gate], front: spur.front, buildingId: null, status });
  if (spec.vehicles) { const pid = nextId(world, 'node'); world.points = { ...(world.points ?? {}), [pid]: { id: pid, primitive: 'transport-node', x: spur.end.x, y: spur.end.y, roadId: spur.road.id, status } }; }
  parcel.status = 'developed'; parcel.uses = [...parcel.uses, id];
  return { ok: true, reason: `${side}×${side} m open plot`, placement: { buildingId: null, level: 0, spaceId: id } };
}

// Where a new district could go: next to an existing one, on the map, not overlapping, mostly buildable.
function districtSites(world, terrain) {
  const out = [], S = DISTRICT_SIZE, seen = new Set();
  for (const d of Object.values(world.districts)) for (const [dir, dx, dy] of [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]]) {
    const r = rect(d.rect.x + dx * S, d.rect.y + dy * S, S, S), key = `${d.id}-${dir}`;
    if (r.x < 0 || r.y < 0 || r.x + S > terrain.size || r.y + S > terrain.size || seen.has(`${r.x},${r.y}`)) continue;
    seen.add(`${r.x},${r.y}`);
    if (Object.values(world.districts).some(o => overlaps(o.rect, r))) continue;
    if (buildableShare(terrain, r) < 0.5) continue;
    out.push({ key, at: centre(r) });
  }
  return out;
}
function newDistrict(world, c, spec, terrain) {
  const d = addDistrict(world, terrain, c.at, { seed: world.seed, key: c.key, reserve: landFor(spec), toward: settlementCentre(world) });
  const p = districtParcel(world, d, spec, terrain);
  return (spec.outdoor ? outdoorOn(world, p.id, spec, terrain) : buildOn(world, p.id, spec, terrain)).placement;
}
// The parcel side a capability needs when the smallest ordinary parcel might not hold it (0 when any parcel will do).
function landFor(spec) {
  const side = spec.outdoor ? snapUp(Math.sqrt(Math.max(spec.area, DIMS.room.minArea))) : Math.sqrt(spec.area * 1.6) + 8;
  const need = side + 2 * DIMS.setback;
  return need > DIMS.parcel.min ? snapUp(need) : 0; // ordinary parcels can be as small as DIMS.parcel.min
}

// The first parcel of a new district (nearest the settlement) that can actually hold the capability.
function districtParcel(world, d, spec, terrain) {
  return vacantParcels(world).filter(q => q.districtId === d.id).slice(0, 4).find(q => (spec.outdoor ? outdoorOn : buildOn)(clone(world), q.id, spec, terrain).ok) ?? null;
}
export { adopt };
