// Pass 5A proofs: the World is a generator, not a map. A determinism, B variation, C dual representation, D scale,
// E navigation, F persistence, G expansion with capabilities the seed world never heard of; plus the HQ event
// contract, camera framing and the primitive vocabulary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createWorld, placeCapability, setConstruction, replayWorld, worldFingerprint, developedShare, addPrimitive, summary } from '../procgen/world.mjs';
import { buildNav, validateNav, route, nodeFor } from '../procgen/nav.mjs';
import { represent, sameCanonicalSet, capabilityLook, THEMES } from '../procgen/themes.mjs';
import { DIMS, scaleReport, toUnits, UNITS_PER_METRE } from '../procgen/units.mjs';
import { openWorldFile, serializeWorld, deserializeWorld } from '../procgen/persist.mjs';
import { applyHqEvent, fromHqActivity, validateHqEvent } from '../procgen/contract.mjs';
import { frames, frameFor, zoomLimits } from '../procgen/camera.mjs';
import { primitive, primitives } from '../procgen/primitives.mjs';
import { planCapability, entities } from '../procgen/planner.mjs';
import { KNOWN, SEED_CAPABILITIES } from '../procgen/capabilities.mjs';
import { renderSvg } from '../procgen/svg.mjs';
import { worldActivity } from '../../hillink-hq/orchestration/activity.mjs';
import { ARCH, AGENT, STREET_SCALE } from '../world/scale.mjs';
import { terrainOf } from '../procgen/world.mjs';
import { contains, containsRect, overlaps } from '../procgen/geom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = ['hillink', 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'];
const UNKNOWN = [
  { id: 'podcast-studio', area: 8, traits: ['quiet', 'recording'] },
  { id: 'drone-lab', area: 30, access: 'secure', traits: ['machines', 'flight'] },
  { id: 'test-track', outdoor: true, vehicles: true, area: 900, traits: ['vehicles'] },
  { id: 'training-hall', area: 60, traits: ['gathering'] },
  { id: 'robot-foundry', area: 140, traits: ['machines', 'making'] },
];
// Facts carry HQ's journal sequence (provenance), as the live feed does: construction orders facts by it.
let hqSeq = 0;
const hq = (type, fields, id = `${type}-${Math.random().toString(16).slice(2)}`) => ({ v: 1, source: 'hq', id, type, at: 1, seq: ++hqSeq, ...fields });
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const roomsOf = world => Object.values(world.spaces).filter(s => s.primitive === 'room');

// ---------------------------------------------------------------- A. determinism
test('A. the same seed and capabilities give the same world, in this process and in a fresh one', () => {
  const a = createWorld({ seed: 'hillink' }), b = createWorld({ seed: 'hillink' });
  assert.equal(worldFingerprint(a), worldFingerprint(b));
  assert.deepEqual(a, b);
  for (const w of [a, b]) for (const u of UNKNOWN.slice(0, 3)) placeCapability(w, u);
  assert.equal(worldFingerprint(a), worldFingerprint(b), 'the same growth decisions too');
  // A separate Node process (no shared module state) generates the identical world.
  const script = `import { createWorld, worldFingerprint } from ${JSON.stringify(new URL('../procgen/world.mjs', import.meta.url).href)}; console.log(worldFingerprint(createWorld({ seed: 'hillink' })));`;
  const other = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim();
  assert.equal(other, worldFingerprint(createWorld({ seed: 'hillink' })));
  // Order of founding capabilities does not matter: the program is a set.
  assert.equal(worldFingerprint(createWorld({ seed: 'hillink', capabilities: [...SEED_CAPABILITIES].reverse() })), worldFingerprint(createWorld({ seed: 'hillink' })));
});

// ---------------------------------------------------------------- B. variation
test('B. different seeds give different, valid layouts for the same capabilities', () => {
  const worlds = SEEDS.map(seed => createWorld({ seed }));
  const shapes = new Set(), sites = new Set(), roads = new Set();
  for (const w of worlds) {
    const v = validateNav(w);
    assert.ok(v.ok, `${w.seed}: ${v.problems.join('; ')}`);
    assert.deepEqual(Object.keys(w.capabilities).sort(), SEED_CAPABILITIES.map(c => c.id).sort(), `${w.seed}: every founding capability has a room`);
    const b = Object.values(w.buildings);
    assert.equal(b.length, 1, `${w.seed}: one small building`);
    shapes.add(`${b[0].plan.bl}/${b[0].plan.br}/${b[0].plan.D}/${b[0].plan.stairSide}/${roomsOf(w).map(r => r.capabilities.join()).join(',')}`);
    sites.add(`${b[0].footprint.x},${b[0].footprint.y},${b[0].front}`);
    roads.add(JSON.stringify(Object.values(w.roads)[0].points));
  }
  assert.equal(new Set(worlds.map(worldFingerprint)).size, SEEDS.length, 'every seed is its own world');
  assert.ok(shapes.size >= SEEDS.length - 2, `building layouts vary (${shapes.size} distinct of ${SEEDS.length})`);
  assert.ok(sites.size >= SEEDS.length - 1, 'sites vary'); assert.equal(roads.size, SEEDS.length, 'roads vary');
});

// ---------------------------------------------------------------- C. dual representation
test('C. one canonical capability appears as a Real room and a Fantasy room, without copying or changing canonical state', () => {
  const w = createWorld({ seed: 'hillink' }), before = worldFingerprint(w);
  deepFreeze(w); // any write by a theme would throw
  const real = represent(w, 'real'), fantasy = represent(w, 'fantasy');
  assert.equal(worldFingerprint(w), before);
  assert.ok(sameCanonicalSet(w), 'both themes describe exactly the same canonical things');
  const labelOf = (rep, cap) => rep.items.find(i => i.canonicalId === w.capabilities[cap].placement.spaceId).label;
  assert.equal(labelOf(real, 'engineering'), 'engineering workshop'); assert.equal(labelOf(fantasy, 'engineering'), 'forge workshop');
  assert.equal(labelOf(real, 'meeting-space'), 'meeting room'); assert.equal(labelOf(fantasy, 'meeting-space'), 'council chamber');
  assert.equal(labelOf(real, 'compute-infrastructure'), 'server room'); assert.equal(labelOf(fantasy, 'compute-infrastructure'), 'arcane engine chamber');
  assert.equal(real.items.find(i => i.primitive === 'building').label, 'startup office and workshop');
  assert.equal(fantasy.items.find(i => i.primitive === 'building').label, 'outpost keep');
  assert.equal(real.items.find(i => i.primitive === 'road').label, 'road'); assert.equal(fantasy.items.find(i => i.primitive === 'road').label, 'dirt road');
  // Items point at canonical ids; they carry no geometry of their own, so a theme cannot move anything.
  for (const item of [...real.items, ...fantasy.items]) assert.ok(!('rect' in item) && !('points' in item));
  // A kind neither theme knows is dressed by its traits.
  const drone = { kind: 'drone-lab', traits: ['flight', 'machines'], access: 'secure' };
  assert.match(capabilityLook('real', drone).label, /hangar|workshop/); assert.match(capabilityLook('fantasy', drone).label, /aerie|artificer/);
  // Both renderings draw from the same world.
  assert.notEqual(renderSvg(w, { theme: 'real' }), renderSvg(w, { theme: 'fantasy' }));
});

// ---------------------------------------------------------------- D. scale
test('D. people, doors, rooms, storeys, roads, vehicles and buildings share one coherent scale', () => {
  assert.ok(Object.values(scaleReport()).every(Boolean), JSON.stringify(scaleReport()));
  // Metres are derived from world/scale.mjs, not a second scale: the reference person, door and storey convert back.
  assert.equal(toUnits(DIMS.person.height), AGENT.height); assert.ok(Math.abs(toUnits(DIMS.door.height) - ARCH.door.h) < 0.5);
  assert.ok(Math.abs(toUnits(DIMS.vehicle.length) - STREET_SCALE.car.length) < 0.5);
  assert.equal(DIMS.person.height, 1.75); assert.ok(UNITS_PER_METRE > 28 && UNITS_PER_METRE < 29);
  for (const seed of SEEDS.slice(0, 4)) {
    const w = createWorld({ seed });
    for (const u of UNKNOWN) placeCapability(w, u, { status: 'built' });
    for (const d of Object.values(w.doors)) {
      const expect = d.kind === 'entrance' ? DIMS.entrance : d.kind === 'door' ? DIMS.door : null;
      if (expect) { assert.equal(d.width, expect.width); assert.equal(d.height, expect.height); }
      const len = Math.hypot(d.seg.x2 - d.seg.x1, d.seg.y2 - d.seg.y1);
      assert.ok(Math.abs(len - d.width) < 0.01, `${d.id}: drawn opening matches its width`);
      assert.ok(d.width > DIMS.person.footprint.w && d.height > DIMS.person.height, `${d.id} fits a person`);
    }
    for (const r of roomsOf(w)) assert.ok(Math.min(r.rect.w, r.rect.h) >= DIMS.room.minSide - 1e-9, `${seed} ${r.id} is at least ${DIMS.room.minSide} m on a side`);
    for (const s of Object.values(w.spaces).filter(s => s.id.endsWith('-corridor'))) assert.equal(Math.min(s.rect.w, s.rect.h), DIMS.corridor);
    for (const r of Object.values(w.roads)) assert.ok(r.width >= 2 * DIMS.road.lane && DIMS.road.lane > DIMS.vehicle.width);
    for (const p of Object.values(w.paths)) assert.ok(p.width >= 2 * DIMS.person.footprint.w);
    for (const b of Object.values(w.buildings)) {
      const side = Math.min(b.footprint.w, b.footprint.h);
      assert.ok(side / DIMS.person.height >= 4 && side / DIMS.person.height <= 40, `${b.id} is a human-scale building (${side} m)`);
    }
    // Every plan coordinate sits on the 0.5 m grid (doors on the grid at their centre).
    for (const r of roomsOf(w)) for (const v of [r.rect.x, r.rect.y, r.rect.w, r.rect.h]) assert.ok(Math.abs(v * 2 - Math.round(v * 2)) < 1e-6, `${r.id} is on the grid`);
  }
});

// ---------------------------------------------------------------- E. navigation
test('E. generated spaces produce valid routes: road to door to hall to corridor to every room, and between floors', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), nav = buildNav(w);
    assert.ok(validateNav(w, nav).ok);
    for (const cap of Object.values(w.capabilities)) {
      const r = route(nav, nav.arrival, nodeFor(nav, cap.placement.spaceId));
      assert.ok(r, `${seed}: ${cap.id} is reachable`);
      const entrance = `door:${Object.values(w.buildings)[0].entranceDoorId}`;
      assert.ok(r.nodes.includes(entrance), `${seed}: the route to ${cap.id} enters through the front door`);
      const a = nav.nodes.get(r.nodes[0]), b = nav.nodes.get(r.nodes.at(-1));
      assert.ok(r.cost >= Math.hypot(a.x - b.x, a.y - b.y) - 1e-6, 'a route is never shorter than the straight line');
    }
  }
  // Construction changes the graph: a planned floor is not walkable; once HQ reports it built it is, via the stair.
  const w = createWorld({ seed: 'hillink' });
  const placed = placeCapability(w, { id: 'library', area: 30, traits: ['records'] });
  const up = placeCapability(w, { id: 'upper-lab', area: 40, access: 'staff', level: 'any', traits: ['inspection'] });
  let nav = buildNav(w);
  assert.equal(nodeFor(nav, up.placement.spaceId), null, 'a planned room has no node: nobody walks into it');
  for (const c of [placed.placement, up.placement]) assert.ok(c.spaceId);
  setConstruction(w, 'library', 'built'); setConstruction(w, 'upper-lab', 'built');
  nav = buildNav(w);
  assert.ok(validateNav(w, nav).ok, validateNav(w, nav).problems.join('; '));
  const r = route(nav, nav.arrival, nodeFor(nav, up.placement.spaceId));
  assert.ok(r, 'the new space is reachable once built');
  if (up.placement.level !== 0) assert.ok(r.nodes.some(n => n.endsWith('-stair')), 'a route to another level uses the stair core');
});

// ---------------------------------------------------------------- F. persistence
test('F. save and reload preserve the world exactly; a reload never regenerates, and tampering is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-world-5a-')), file = path.join(dir, 'site.json');
  const first = openWorldFile(file, { seed: 'hillink' });
  assert.equal(first.created, true);
  placeCapability(first.world, UNKNOWN[1]); setConstruction(first.world, 'drone-lab', 'built');
  applyHqEvent(first.world, hq('AGENT_WORKING', { agentId: 'claude' }, 'e1'));
  first.save();
  const again = openWorldFile(file, { seed: 'a-different-seed-is-ignored' });
  assert.equal(again.created, false);
  assert.equal(worldFingerprint(again.world), worldFingerprint(first.world), 'identity, structures, placements and history survive');
  assert.equal(again.world.seed, 'hillink');
  assert.equal(again.world.capabilities['drone-lab'].status, 'built');
  assert.equal(again.world.ops.agents.claude.activity, 'working');
  // The saved history alone rebuilds the same world (with the HQ reducer for operational entries).
  assert.equal(worldFingerprint(replayWorld(again.world.history, { applyOps: applyHqEvent })), worldFingerprint(first.world));
  // A hand-edited or truncated save is refused, not silently "fixed" by regenerating.
  const text = fs.readFileSync(file, 'utf8');
  assert.throws(() => deserializeWorld(text.replace('"drone-lab"', '"drone-lap"')), /fingerprint/);
  assert.throws(() => deserializeWorld(text.slice(0, text.length / 2)));
  // A save whose terrain would not regenerate identically is refused.
  const w = JSON.parse(serializeWorld(first.world)).world; w.terrain.fingerprint = '0'.repeat(32);
  assert.throws(() => deserializeWorld(serializeWorld(w)), /terrain/);
});

// ---------------------------------------------------------------- G. expansion
test('G. capabilities unknown to the seed world are placed by the planner without redesigning the map', () => {
  const w = createWorld({ seed: 'hillink' });
  const before = new Map(entities(w).map(([id, e]) => [id, JSON.stringify(e.rect ?? e.points ?? e.seg ?? null)]));
  const results = [];
  for (const u of UNKNOWN) {
    assert.equal(KNOWN[u.id], undefined, `${u.id} is not in the known catalogue`);
    const plan = planCapability(w, u, terrainOf(w));
    assert.ok(plan.chosen, `${u.id}: some option is feasible`);
    assert.ok(plan.considered.length > 3 && plan.considered.every(c => c.feasible || c.reason), 'every rejected option says why');
    const r = placeCapability(w, u);
    assert.equal(r.plan.chosen.option, plan.chosen.option, 'planning is side-effect free: the plan is what gets applied');
    setConstruction(w, u.id, 'built');
    results.push(r.plan.chosen.option);
    const v = validateNav(w); assert.ok(v.ok, `${u.id}: ${v.problems.join('; ')}`);
  }
  // Growth used more than one strategy, including a new building and open land, and never a fixed slot.
  assert.ok(new Set(results).size >= 3, `strategies used: ${results.join(', ')}`);
  assert.ok(results.includes('outdoor-plot') && results.includes('new-building'));
  // Existing structures were not moved: only spaces the planner explicitly extended or split changed shape.
  const changed = entities(w).filter(([id, e]) => before.has(id) && before.get(id) !== JSON.stringify(e.rect ?? e.points ?? e.seg ?? null)).map(([id]) => id);
  for (const id of changed) assert.ok(/corridor$/.test(id) || /^door-/.test(id) || /^room-/.test(id), `${id} changed`);
  assert.ok(changed.length <= 4, `only extended or split spaces changed: ${changed.join(', ')}`);
  // Nothing overlaps: rooms on a level, buildings, and structures within their parcels.
  const buildings = Object.values(w.buildings);
  for (const [i, a] of buildings.entries()) for (const b of buildings.slice(i + 1)) assert.ok(!overlaps(a.footprint, b.footprint));
  for (const b of buildings) assert.ok(containsRect(w.parcels[b.parcelId].rect, b.footprint));
  const byLevel = new Map();
  for (const r of Object.values(w.spaces).filter(s => s.primitive === 'room')) { const k = `${r.buildingId}:${r.level}`; for (const o of byLevel.get(k) ?? []) assert.ok(!overlaps(o.rect, r.rect), `${o.id} overlaps ${r.id}`); byLevel.set(k, [...(byLevel.get(k) ?? []), r]); }
  // Still a small settlement in a big wilderness.
  assert.ok(developedShare(w) < 0.05, `developed ${developedShare(w)}`);
  // The whole growth replays from history to the same world.
  assert.equal(worldFingerprint(replayWorld(w.history)), worldFingerprint(w));
  // A capability too large for any building fits nowhere until the world grows a district for it.
  const huge = planCapability(w, { id: 'campus-quad', outdoor: true, area: 1600 }, terrainOf(w));
  assert.ok(huge.chosen && ['outdoor-plot', 'new-district'].includes(huge.chosen.option));
});

test('G2. the vocabulary can grow: a new primitive is recorded, persisted, replayed and dressed by both themes', () => {
  const w = createWorld({ seed: 'hillink' });
  assert.equal(primitive('landing-pad', w), null);
  addPrimitive(w, 'landing-pad', { layer: 'space', geometry: 'rect', walkable: true });
  assert.equal(primitive('landing-pad', w).layer, 'space');
  assert.ok(primitives(w).includes('landing-pad'));
  assert.throws(() => addPrimitive(w, 'landing-pad', { layer: 'space', geometry: 'rect' }), /exists/);
  assert.throws(() => addPrimitive(w, 'Bad Name', { layer: 'space', geometry: 'rect' }), /invalid/);
  const again = deserializeWorld(serializeWorld(w));
  assert.equal(primitive('landing-pad', again).walkable, true);
  assert.equal(worldFingerprint(replayWorld(w.history)), worldFingerprint(w));
  for (const e of entities(w)) assert.ok(primitive(e[1].primitive, w), `${e[0]} uses a registered primitive (${e[1].primitive})`);
});

// ---------------------------------------------------------------- HQ -> World contract
test('HQ contract: only HQ changes operational facts; renderer, simulator and malformed events change nothing', () => {
  const w = createWorld({ seed: 'hillink' }), fp = worldFingerprint(w);
  for (const ev of [{ ...hq('AGENT_WORKING', { agentId: 'claude' }), source: 'renderer' }, { ...hq('AGENT_WORKING', { agentId: 'claude' }), source: 'sim' }, hq('AGENT_DANCING', { agentId: 'claude' }), hq('TASK_ASSIGNED', { taskId: 't1' }), { ...hq('AGENT_WORKING', { agentId: 'x' }), v: 2 }]) {
    const r = applyHqEvent(w, ev);
    assert.equal(r.applied, false, JSON.stringify(ev)); assert.ok(validateHqEvent(ev));
  }
  assert.equal(worldFingerprint(w), fp, 'refused events changed nothing');
  // Real facts: an objective, an assignment, work in the engineering room, a capability's full lifecycle.
  assert.equal(applyHqEvent(w, hq('OBJECTIVE_CREATED', { objectiveId: 'o1', title: 'Add a podcast studio' }, 'h1')).applied, true);
  assert.equal(applyHqEvent(w, hq('OBJECTIVE_CREATED', { objectiveId: 'o1' }, 'h1')).applied, false, 'redelivery is a no-op');
  applyHqEvent(w, hq('TASK_ASSIGNED', { taskId: 't1', agentId: 'claude', objectiveId: 'o1' }, 'h2'));
  applyHqEvent(w, hq('IMPLEMENTATION_STARTED', { agentId: 'claude', taskId: 't1' }, 'h3'));
  assert.equal(w.ops.agents.claude.spaceId, w.capabilities.engineering.placement.spaceId, 'implementing happens where engineering lives');
  applyHqEvent(w, hq('CAPABILITY_REQUESTED', { capability: UNKNOWN[0], objectiveId: 'o1', taskId: 't1' }, 'h4'));
  assert.equal(w.capabilities['podcast-studio'].status, 'planned');
  assert.equal(applyHqEvent(w, hq('CAPABILITY_VERIFIED', { capabilityId: 'podcast-studio' }, 'h5')).applied, false, 'a planned capability cannot be verified');
  applyHqEvent(w, hq('CONSTRUCTION_REQUESTED', { capabilityId: 'podcast-studio' }, 'h6'));
  assert.equal(w.capabilities['podcast-studio'].status, 'under-construction');
  // Pass 5B: completion is only possible after the project was built, inspected and its review approved.
  assert.equal(applyHqEvent(w, hq('CONSTRUCTION_COMPLETED', { capabilityId: 'podcast-studio' }, 'h7a')).applied, false, 'no completion without inspection');
  for (let k = 0; k < 5; k++) applyHqEvent(w, hq('WORK_COMMITTED', { taskId: 't1', ref: `c${k}` }, `h7c${k}`));
  applyHqEvent(w, hq('TESTING', { agentId: 'codex', taskId: 't1' }, 'h7t'));
  assert.equal(applyHqEvent(w, hq('CONSTRUCTION_COMPLETED', { capabilityId: 'podcast-studio' }, 'h7b')).applied, false, 'no completion without an approved review');
  applyHqEvent(w, hq('REVIEW_VERDICT', { taskId: 't1', verdict: 'approved' }, 'h7v'));
  applyHqEvent(w, hq('CONSTRUCTION_COMPLETED', { capabilityId: 'podcast-studio' }, 'h7'));
  applyHqEvent(w, hq('CAPABILITY_VERIFIED', { capabilityId: 'podcast-studio' }, 'h8'));
  assert.equal(w.capabilities['podcast-studio'].status, 'operational');
  applyHqEvent(w, hq('WAITING_FOR_KYLE', { taskId: 't1', objectiveId: 'o1' }, 'h9'));
  assert.equal(w.ops.objectives.o1.status, 'waiting-for-kyle');
  assert.ok(validateNav(w).ok);
  assert.equal(worldFingerprint(replayWorld(w.history, { applyOps: applyHqEvent })), worldFingerprint(w), 'HQ facts replay from history');
});

test('HQ contract: today\'s HQ activity feed (Pass 3 contract v1) translates into World events', () => {
  const journal = [
    { seq: 1, at: 10, type: 'OBJECTIVE_CREATED', data: { id: 'o1', input: { title: 'Fix the slug helper' } } },
    { seq: 2, at: 11, type: 'TASK_CREATED', data: { id: 't1', operation: 'implement-repo', link: { objectiveId: 'o1', stepId: 's1' } } },
    { seq: 3, at: 12, type: 'DISPATCHED', data: { taskId: 't1', runId: 'r1', agentId: 'claude' } },
    { seq: 4, at: 13, type: 'WORKER_EVENT', data: { runId: 'r1', kind: 'ACK' } },
    { seq: 5, at: 14, type: 'OBJECTIVE_TRANSITION', data: { objectiveId: 'o1', to: 'AWAITING_APPROVAL' } },
  ];
  const w = createWorld({ seed: 'hillink' });
  const events = worldActivity(journal).map(fromHqActivity).filter(Boolean);
  assert.ok(events.length >= 4, JSON.stringify(worldActivity(journal).map(i => i.type)));
  for (const ev of events) assert.equal(applyHqEvent(w, ev).applied, true, JSON.stringify(ev));
  assert.equal(w.ops.objectives.o1.status, 'waiting-for-kyle');
  assert.equal(w.ops.tasks.t1.agentId, 'claude');
  assert.equal(w.ops.agents.claude.spaceId, w.capabilities.engineering.placement.spaceId);
  assert.equal(Object.keys(w.capabilities).length, SEED_CAPABILITIES.length, 'HQ activity never invents structures');
});

// ---------------------------------------------------------------- camera
test('camera: overview, settlement, building, room and agent frames; zoom from the whole map to a few people', () => {
  const w = createWorld({ seed: 'hillink' }), vp = { w: 1200, h: 800 };
  const f = frames(w), size = w.terrain.options.size;
  assert.deepEqual(f.world, { x: 0, y: 0, w: size, h: size });
  for (const b of Object.values(w.buildings)) { assert.ok(containsRect(f.settlement, b.footprint)); assert.ok(containsRect(f.buildings[b.id], b.footprint)); }
  for (const s of Object.values(w.spaces)) assert.ok(containsRect(frameFor(w, s.id), s.rect));
  const { min, max } = zoomLimits(w, vp);
  assert.ok(Math.abs(min - 800 / size) < 1e-9, 'fully out shows the whole map');
  assert.ok(Math.abs(max * 3 * DIMS.person.height - 800) < 1e-6, 'fully in shows about three people');
  applyHqEvent(w, hq('TESTING', { agentId: 'codex' }, 'c1'));
  const follow = frameFor(w, 'codex');
  assert.equal(follow.follow, 'codex'); assert.ok(contains(w.spaces[w.capabilities.review.placement.spaceId].rect, follow.at));
  // The settlement frame grows with the world; the map frame does not.
  const settled = f.settlement;
  for (const u of UNKNOWN) placeCapability(w, u);
  const later = frames(w);
  assert.ok(later.settlement.w * later.settlement.h > settled.w * settled.h);
  assert.deepEqual(later.world, f.world);
  // A far larger map works the same way.
  const big = createWorld({ seed: 'hillink', terrain: { size: 2048, cell: 8 } });
  assert.ok(zoomLimits(big, vp).min < min && validateNav(big).ok);
});

test('the seed world is tiny: one small building on mostly undeveloped land, no pre-built facilities', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), s = summary(w);
    assert.equal(s.buildings.length, 1); assert.equal(s.parcels.developed, 1);
    assert.ok(s.parcels.total >= 9, 'land is reserved for growth, not built on');
    assert.ok(s.developedShare < 2, `${seed}: ${s.developedShare}% developed`);
    assert.equal(s.rooms - s.vacantRooms, SEED_CAPABILITIES.length, 'one room per founding capability; the rest is spare space');
    assert.ok(s.rooms <= 10 && s.buildings[0].levels.length <= 2, `${seed}: ${s.rooms} rooms on ${s.buildings[0].levels.length} storeys`);
    assert.ok(s.environmentAnchors > 300, 'mostly wilderness');
  }
});

test('the World server serves the persisted procedural world read-only, same-origin only', async () => {
  const { createServer } = await import('../serve.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-world-5a-srv-'));
  const site = openWorldFile(path.join(dir, 'site.json'), { seed: 'hillink' });
  const server = createServer({ hq: null, site }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  try {
    const ok = await fetch(`${base}/api/site`);
    assert.equal(ok.status, 200);
    assert.equal(worldFingerprint((await ok.json()).world), worldFingerprint(site.world));
    assert.equal((await fetch(`${base}/api/site`, { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/site`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/procgen/world.mjs`)).status, 200);
    assert.equal((await fetch(`${base}/procgen/persist.mjs`)).status, 404, 'the file-system module stays on the server');
    assert.equal((await fetch(`${base}/site.html`)).status, 200);
  } finally { server.close(); }
});

test('robustness: random growth on many seeds keeps every world valid, non-overlapping and replayable', async () => {
  const { rng } = await import('../procgen/rng.mjs');
  const used = new Set();
  for (let s = 0; s < 12; s++) {
    const seed = `fuzz-${s}`, w = createWorld({ seed }), r = rng(seed, 'fuzz');
    for (let k = 0; k < 10; k++) {
      const outdoor = r.chance(0.15);
      const cap = { id: `cap-${k}`, area: outdoor ? r.int(100, 1500) : r.pick([6, 8, 12, 20, 30, 45, 80, 150]), access: outdoor ? 'staff' : r.pick(['public', 'staff', 'staff', 'secure']), level: outdoor ? 'any' : r.pick(['any', 'any', 'ground', 'below']), shareable: r.chance(0.3), outdoor, vehicles: outdoor && r.chance(0.5), traits: [r.pick(['machines', 'quiet', 'records', 'gathering', 'unheard-of'])] };
      let placed = null;
      try { placed = placeCapability(w, cap); } catch (e) { assert.match(e.message, /no feasible place/); continue; }
      used.add(placed.plan.chosen.option);
      if (r.chance(0.8)) { try { setConstruction(w, cap.id, 'built'); } catch (e) { assert.match(e.message, /cannot be completed before/); } }
      const v = validateNav(w); assert.ok(v.ok, `${seed} after ${cap.id}: ${v.problems.slice(0, 3).join('; ')}`);
    }
    const bs = Object.values(w.buildings);
    for (const [i, a] of bs.entries()) for (const b of bs.slice(i + 1)) assert.ok(!overlaps(a.footprint, b.footprint), `${seed}: ${a.id}/${b.id}`);
    for (const y of Object.values(w.spaces).filter(x => x.primitive === 'outdoor-facility')) for (const b of bs) assert.ok(!overlaps(y.rect, b.footprint), `${seed}: ${y.id}/${b.id}`);
    assert.equal(worldFingerprint(replayWorld(w.history)), worldFingerprint(w), `${seed} replays`);
  }
  assert.ok(used.size >= 6, `strategies exercised: ${[...used].join(', ')}`);
});

test('construction order: a project cannot be completed before what it hangs off; HQ gets the reason', () => {
  const w = createWorld({ seed: 'hillink' });
  // Growth that HQ has planned but not built yet: later projects hang off earlier ones (same building, a road spur).
  for (const u of [...UNKNOWN, { id: 'side-office', area: 6 }, { id: 'tool-store', area: 6, shareable: true }, { id: 'second-yard', outdoor: true, area: 400 }]) placeCapability(w, u);
  const waiting = Object.values(w.capabilities).filter(c => c.dependsOn?.length);
  assert.ok(waiting.length >= 1, 'some planned project depends on another');
  const c = waiting[0], r = applyHqEvent(w, hq('CONSTRUCTION_COMPLETED', { capabilityId: c.id }, `early-${c.id}`));
  assert.equal(r.applied, false); assert.match(r.reason, new RegExp(`before ${c.dependsOn[0]}`));
  // Completing in dependency order is always accepted, and everything built is reachable at every step.
  const done = new Set(Object.values(w.capabilities).filter(x => x.status === 'operational').map(x => x.id));
  let progress = true;
  while (progress) {
    progress = false;
    for (const x of Object.values(w.capabilities)) if (!done.has(x.id) && (x.dependsOn ?? []).every(d => done.has(d))) {
      assert.equal(applyHqEvent(w, hq('CONSTRUCTION_COMPLETED', { capabilityId: x.id }, `done-${x.id}`)).applied, true, x.id);
      done.add(x.id); progress = true;
      assert.ok(validateNav(w).ok, validateNav(w).problems.join('; '));
    }
  }
  assert.equal(done.size, Object.keys(w.capabilities).length, 'no dependency cycles');
});
