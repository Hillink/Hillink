// Pass 5A: the canonical World. One model underneath every rendering: land, circulation, structures, spaces,
// capabilities and where they live, operational state reported by HQ, and the history of every decision. Real
// and Fantasy are read-only views of it (themes.mjs); switching between them changes nothing here.
//
// Identity. A world is its seed, its founding capabilities and its history. createWorld() founds it; every later
// change (a capability placed, construction reported, an HQ fact) is appended to world.history, and
// replayWorld(seed, history) rebuilds an identical world (same fingerprint). The terrain is regenerated from the
// seed; everything else is stored (persist.mjs).
import { rng, fingerprint } from './rng.mjs';
import { DIMS } from './units.mjs';
import { rect, centre, union, area, inset } from './geom.mjs';
import { normalizeCapability, SEED_CAPABILITIES } from './capabilities.mjs';
import { generateTerrain, TERRAIN_DEFAULTS, buildableShare } from './terrain.mjs';
import { designBuilding, footprintFor, placeBuilding, frame, refreshStairs } from './building.mjs';
import { chooseOrigin, addDistrict, accessRoad, entrancePath, scatterEnvironment } from './site.mjs';
import { planCapability, applyPlan, entities, undergroundLevels, clone, adopt } from './planner.mjs';
import { definePrimitive } from './primitives.mjs';

export const SCHEMA = 1;
export const GENERATOR = '5a.1';

const terrains = new Map();
export function terrainOf(world) {
  const key = `${world.seed}|${JSON.stringify(world.terrain.options)}`;
  if (!terrains.has(key)) { const t = generateTerrain(world.seed, world.terrain.options); if (terrains.size > 8) terrains.clear(); terrains.set(key, t); }
  const t = terrains.get(key);
  if (world.terrain.fingerprint && t.fingerprint !== world.terrain.fingerprint) throw Error('this world was made by a different terrain generator: its land cannot be regenerated identically');
  return t;
}

function emptyWorld(seed, options) {
  return {
    schema: SCHEMA, generator: GENERATOR, seed: String(seed),
    terrain: { options: { ...TERRAIN_DEFAULTS, ...options } },
    counters: {}, origin: null, arrival: null,
    districts: {}, parcels: {}, roads: {}, paths: {}, buildings: {}, spaces: {}, doors: {}, points: {}, anchors: {},
    capabilities: {}, environment: [], primitives: {},
    ops: { agents: {}, tasks: {}, objectives: {} },
    history: [], applied: {},
  };
}

// Founds a world: a district on the flattest dry land near the middle, one access road from the map edge, and one
// small building holding exactly the founding capabilities. Everything else stays undeveloped.
export function createWorld({ seed, capabilities = SEED_CAPABILITIES, terrain: options = {} } = {}) {
  if (seed === undefined || seed === null || String(seed) === '') throw Error('a world needs a seed');
  const world = emptyWorld(seed, options), t = terrainOf(world);
  world.terrain.fingerprint = t.fingerprint;
  const specs = capabilities.map(normalizeCapability).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // a program is a set
  if (new Set(specs.map(s => s.id)).size !== specs.length) throw Error('founding capabilities must have distinct ids');
  if (specs.some(s => s.outdoor)) throw Error('founding capabilities are indoor; add outdoor ones with placeCapability');
  const origin = world.origin = chooseOrigin(t, world.seed);
  const d = addDistrict(world, t, origin, { seed: world.seed, key: 'founding' });
  const design = designBuilding(specs, rng(world.seed, 'building', 'founding'));
  const parcels = d.parcels.map(id => world.parcels[id]).filter(p => p.buildable >= 0.85).sort((a, b) => Math.hypot(centre(a.rect).x - origin.x, centre(a.rect).y - origin.y) - Math.hypot(centre(b.rect).x - origin.x, centre(b.rect).y - origin.y) || (a.id < b.id ? -1 : 1));
  let founded = false;
  for (const p of parcels) {
    const w2 = clone(world);
    const access = accessRoad(w2, t, w2.parcels[p.id], world.seed);
    if (!access) continue;
    const fp = footprintFor(p.rect, access.front, design.W, design.D, rng(world.seed, 'slide', 'founding').float(0.2, 0.8));
    if (!fp || buildableShare(t, fp) < 0.9) continue;
    const b = placeBuilding(w2, { parcelId: p.id, fp, front: access.front, design, status: 'built' });
    entrancePath(w2, { roadEnd: access.end, door: w2.doors[b.entranceDoorId], front: access.front, buildingId: b.id });
    w2.parcels[p.id].status = 'developed'; w2.parcels[p.id].uses = [b.id];
    w2.arrival = access.road.points[0];
    for (const s of specs) {
      const room = Object.values(w2.spaces).find(x => x.buildingId === b.id && x.capabilities.includes(s.id));
      w2.capabilities[s.id] = { id: s.id, spec: s, placement: { buildingId: b.id, level: room.level, spaceId: room.id }, option: 'founding', status: 'operational' };
    }
    adopt(world, w2); founded = true; break;
  }
  if (!founded) throw Error(`seed ${world.seed}: no parcel near the origin can hold the founding building`);
  scatterEnvironment(world, t, world.seed);
  refreshAnchors(world);
  world.history.push({ seq: 1, type: 'WORLD_FOUNDED', seed: world.seed, terrain: world.terrain.options, capabilities: specs.map(s => ({ ...s })) });
  return world;
}

// Growth anchors, derived from structures and land: where each building can gain a floor, a basement or a rear
// wing. Stored so a reader (the renderer, the planner's report) sees them without recomputing.
export function refreshAnchors(world) {
  const t = terrainOf(world), anchors = {};
  for (const b of Object.values(world.buildings)) {
    const P = b.plan, F = frame(b.block, b.front), parcel = world.parcels[b.parcelId], limit = inset(parcel.rect, DIMS.setback);
    const stair = world.spaces[`${b.id}-L${b.levels[0]}-stair`];
    anchors[`${b.id}:up`] = { id: `${b.id}:up`, primitive: 'vertical-expansion', buildingId: b.id, rect: stair.rect, levels: b.maxLevels - b.levels.filter(l => l >= 0).length };
    anchors[`${b.id}:down`] = { id: `${b.id}:down`, primitive: 'underground-expansion', buildingId: b.id, rect: b.block, levels: Math.max(0, undergroundLevels(world, b, t) + Math.min(0, ...b.levels)) };
    const rear = F.toWorld(0, P.rearD, P.W, 1), depthTo = { n: limit.y + limit.h - (rear.y), s: rear.y + rear.h - limit.y, w: limit.x + limit.w - rear.x, e: rear.x + rear.w - limit.x }[b.front]; // from the building's back line to the parcel's buildable edge
    anchors[`${b.id}:rear`] = { id: `${b.id}:rear`, primitive: 'wing-anchor', buildingId: b.id, side: 'rear', depth: Math.max(0, Math.round(depthTo * 100) / 100), rect: F.toWorld(0, P.rearD, P.W, Math.max(0, depthTo)) };
  }
  world.anchors = anchors;
}

// Plans and applies one capability (status 'planned' by default: HQ reports construction; 5B shows it).
export function placeCapability(world, input, { status = 'planned', record = true } = {}) {
  const plan = planCapability(world, input, terrainOf(world));
  const placement = applyPlan(world, plan, { status });
  refreshAnchors(world);
  if (record) world.history.push({ seq: world.history.length + 1, type: 'CAPABILITY_PLACED', capability: plan.capability, option: plan.chosen.option, target: plan.chosen.target, status });
  return { plan: { chosen: plan.chosen, considered: plan.considered }, placement };
}

export function setConstruction(world, capabilityId, stage, { record = true } = {}) {
  const cap = world.capabilities[capabilityId];
  if (!cap) throw Error(`unknown capability ${capabilityId}`);
  if (!['under-construction', 'built'].includes(stage)) throw Error(`unknown construction stage ${stage}`);
  const waiting = stage === 'built' ? (cap.dependsOn ?? []).filter(id => !['built', 'operational'].includes(world.capabilities[id]?.status)) : [];
  if (waiting.length) throw Error(`${capabilityId} cannot be completed before ${waiting.join(', ')}`);
  for (const [, e] of entities(world)) if (e.project === capabilityId && e.status !== 'reserved') e.status = stage;
  for (const b of Object.values(world.buildings)) for (const w of b.wings) if (w.status !== 'built' && Object.values(world.spaces).some(s => s.wingId === w.id && s.project === capabilityId)) w.status = stage;
  for (const b of Object.values(world.buildings)) refreshStairs(world, b);
  if (stage === 'built' && (cap.status === 'planned' || cap.status === 'under-construction')) cap.status = 'built';
  if (stage === 'under-construction' && cap.status === 'planned') cap.status = 'under-construction';
  if (record) world.history.push({ seq: world.history.length + 1, type: stage === 'built' ? 'CONSTRUCTION_COMPLETED' : 'CONSTRUCTION_STARTED', capabilityId });
}

export function addPrimitive(world, id, spec, { record = true } = {}) {
  const p = definePrimitive(world, id, spec);
  if (record) world.history.push({ seq: world.history.length + 1, type: 'PRIMITIVE_DEFINED', id, spec: { ...spec } });
  return p;
}

// Rebuilds a world from its seed and history. Operational (HQ) entries are replayed by contract.mjs's reducer.
export function replayWorld(history, { applyOps = null } = {}) {
  const [founding, ...rest] = history;
  if (founding?.type !== 'WORLD_FOUNDED') throw Error('a history starts with WORLD_FOUNDED');
  const world = createWorld({ seed: founding.seed, capabilities: founding.capabilities, terrain: founding.terrain });
  for (const h of rest) {
    if (h.type === 'CAPABILITY_PLACED') {
      const r = placeCapability(world, h.capability, { status: h.status, record: false });
      if (r.plan.chosen.option !== h.option || String(r.plan.chosen.target) !== String(h.target)) throw Error(`replay diverged at #${h.seq}: planned ${r.plan.chosen.option} ${r.plan.chosen.target}, history says ${h.option} ${h.target}`);
    } else if (h.type === 'CONSTRUCTION_STARTED' || h.type === 'CONSTRUCTION_COMPLETED') setConstruction(world, h.capabilityId, h.type === 'CONSTRUCTION_COMPLETED' ? 'built' : 'under-construction', { record: false });
    else if (h.type === 'PRIMITIVE_DEFINED') definePrimitive(world, h.id, h.spec);
    else if (h.type === 'HQ_EVENT') { if (!applyOps) throw Error('replaying HQ events needs the contract reducer'); applyOps(world, h.event, { record: false }); }
    else throw Error(`unknown history entry ${h.type}`);
    world.history.push(h);
  }
  return world;
}

// What makes two worlds the same world: everything except history bookkeeping of already-applied HQ ids.
export const worldFingerprint = world => fingerprint({ ...world, applied: undefined });

// How much of the map is developed (parcels in use, roads, paths): the rest is wilderness by design.
export function developedShare(world) {
  const t = terrainOf(world), total = t.size * t.size;
  const parcels = Object.values(world.parcels).filter(p => p.status !== 'vacant').reduce((s, p) => s + area(p.rect), 0);
  const ways = [...Object.values(world.roads), ...Object.values(world.paths)].reduce((s, w) => s + w.points.slice(1).reduce((a, p, k) => a + Math.hypot(p.x - w.points[k].x, p.y - w.points[k].y), 0) * w.width, 0);
  return (parcels + ways) / total;
}

export function summary(world) {
  const count = pred => Object.values(world.spaces).filter(pred).length;
  return {
    seed: world.seed, fingerprint: worldFingerprint(world), mapMetres: world.terrain.options.size,
    districts: Object.keys(world.districts).length,
    parcels: { total: Object.keys(world.parcels).length, developed: Object.values(world.parcels).filter(p => p.status !== 'vacant').length },
    roads: Object.keys(world.roads).length, paths: Object.keys(world.paths).length,
    buildings: Object.values(world.buildings).map(b => ({ id: b.id, footprint: `${b.footprint.w}×${b.footprint.h} m`, levels: b.levels, wings: b.wings.length, status: b.status })),
    rooms: count(s => s.primitive === 'room'), vacantRooms: count(s => s.primitive === 'room' && s.vacant), doors: Object.keys(world.doors).length,
    capabilities: Object.values(world.capabilities).map(c => ({ id: c.id, status: c.status, option: c.option, space: c.placement?.spaceId, level: c.placement?.level })),
    environmentAnchors: world.environment.length,
    developedShare: Math.round(developedShare(world) * 10000) / 100,
  };
}
export { rect, union };
