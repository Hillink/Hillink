// Pass 5H prerequisites P1-P4 (Kyle approved P1 and P2, 2026-10-01 01:40Z).
// P1: Real and Fantasy run on ONE canonical spatial layout (the planner's); the 5G kingdom is superseded, debug-only.
// P2: T0 is one compact storey with ChatGPT, Claude and Codex; meeting and break share one legitimate common room in
//     canonical data, and a world founded before 5H replays exactly as it was.
// P3: ChatGPT's canonical post is the command office (definition data, not renderer choice).
// P4: one canonical display name per capability kind, identical in both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, replayWorld, worldFingerprint } from '../procgen/world.mjs';
import { SEED_CAPABILITIES, capabilityName, shareRooms, normalizeCapability } from '../procgen/capabilities.mjs';
import { placeKind, placeKinds } from '../procgen/furnish.mjs';
import { loadTheme, SUPERSEDED_LAYOUTS } from '../themes/index.mjs';
import { SIM_ROSTER, SIM_AGENTS } from '../sim/simulator.mjs';
import { DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { placeAgents } from '../core/behavior.mjs';

const SEEDS = ['hillink', 'alpha', 'bravo', 'charlie', 'delta', 'echo'];
const geometry = L => JSON.stringify({
  nodes: Object.entries(L.nodePlan).sort(), edges: L.navEdges, levels: L.levels,
  rooms: L.locations.map(l => [l.id, l.spaceId, l.floor, l.room.x0, l.room.x1, l.room.z0, l.room.z1, Object.keys(l.stations)]),
  stations: Object.entries(L.stationInfo).map(([k, s]) => [k, s.x, s.z, s.use, s.facing, s.floor]).sort(),
  furnishing: Object.entries(L.furnishing).map(([id, F]) => [id, F.kind, F.items.map(i => [i.type, i.x, i.z, i.w, i.d])]),
});

test('P1: Real and Fantasy share one canonical spatial layout; only presentation differs', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), real = loadTheme('real', { world: w }), fantasy = loadTheme('fantasy', { world: w });
    assert.equal(real.layout.id, 'generated'); assert.equal(fantasy.layout.id, 'generated');
    assert.equal(geometry(real.layout), geometry(fantasy.layout), `${seed}: same footprint, rooms, doors, walks, stations and furniture`);
    assert.equal(JSON.stringify(real.layout.home), JSON.stringify(fantasy.layout.home));
  }
  // The 5G kingdom is kept, inactive, behind an explicit debug option only.
  assert.ok(SUPERSEDED_LAYOUTS['kingdom-5g']);
  const w = createWorld({ seed: 'hillink' });
  assert.notEqual(loadTheme('fantasy', { world: w, art: '5d' }).layout.id, 'kingdom');
  assert.equal(loadTheme('fantasy', { world: w, layout: 'kingdom-5g' }).layout.id, 'kingdom');
});

test('P2: T0 is one compact storey: three agents, a station each, a server bay and one shared common room', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), b = Object.values(w.buildings);
    assert.equal(b.length, 1); assert.deepEqual(b[0].levels, [0], `${seed}: one storey`);
    assert.ok(b[0].plan.W * b[0].plan.D <= 220, `${seed}: compact (${b[0].plan.W}×${b[0].plan.D} m)`);
    // Every founding capability exists, separately, and is operational.
    for (const c of SEED_CAPABILITIES) assert.equal(w.capabilities[c.id].status, 'operational');
    // Meeting and break share ONE room in canonical data; each keeps its own capability record.
    const common = w.capabilities['meeting-space'].placement.spaceId;
    assert.equal(w.capabilities['break-space'].placement.spaceId, common);
    assert.deepEqual([...w.spaces[common].capabilities].sort(), ['break-space', 'meeting-space']);
    // Other capabilities keep a room each (the command office, the build workshop, review, the server bay).
    const own = ['command', 'engineering', 'review', 'compute-infrastructure'].map(id => w.capabilities[id].placement.spaceId);
    assert.equal(new Set(own).size, 4); assert.ok(!own.includes(common));
    // The common room is furnished for both purposes; nothing merges rooms that canonical data keeps apart.
    const L = loadTheme('real', { world: w }).layout, uses = new Set(Object.values(L.stationInfo).filter(s => L.locationById[s.room].spaceId === common).map(s => s.use));
    assert.ok(uses.has('meeting'), `${seed}: meeting seats`); assert.ok(uses.has('relax') || uses.has('snack'), `${seed}: break seating`);
    assert.deepEqual(placeKinds(w, w.spaces[common]), ['comms', 'lounge']);
    for (const id of own) assert.equal(placeKinds(w, w.spaces[id]).length, 1);
    assert.equal(Object.keys(L.furnishing).length, Object.values(w.spaces).filter(s => L.furnishing[s.id]).length);
    assert.equal(L.places.communicating.location, L.places.idle.location, 'meetings and breaks go to the same common room');
  }
  // The simulated team is the T0 team.
  assert.deepEqual(SIM_ROSTER, ['chatgpt', 'claude', 'codex']);
  assert.ok(SIM_AGENTS.every(a => a.role), 'every simulated agent registers with a role');
});

test('P2: deterministic, and worlds founded before 5H replay exactly (two storeys, no shared room)', () => {
  assert.equal(worldFingerprint(createWorld({ seed: 'hillink' })), worldFingerprint(createWorld({ seed: 'hillink' })));
  const t0 = createWorld({ seed: 'hillink' });
  assert.equal(worldFingerprint(replayWorld(t0.history)), worldFingerprint(t0), 'a T0 world replays to itself');
  // A pre-5H founding record: no storeys/share fields, meeting and break not shareable.
  const legacy = { seq: 1, type: 'WORLD_FOUNDED', seed: 'hillink', terrain: t0.history[0].terrain, capabilities: SEED_CAPABILITIES.map(c => normalizeCapability({ id: c.id, kind: c.kind })).sort((a, b) => (a.id < b.id ? -1 : 1)) };
  const old = replayWorld([legacy]), b = Object.values(old.buildings)[0];
  assert.deepEqual(b.levels, [0, 1], 'the old two-storey founding is kept for persisted worlds');
  assert.notEqual(old.capabilities['meeting-space'].placement.spaceId, old.capabilities['break-space'].placement.spaceId);
  assert.equal(worldFingerprint(old), worldFingerprint(replayWorld([legacy])));
  assert.throws(() => createWorld({ seed: 'x', storeys: 3 }));
  // shareRooms groups only shareable capabilities of one access class.
  const g = shareRooms(['a', 'b', 'c'].map((id, i) => normalizeCapability({ id, area: 5, shareable: i < 2 })));
  assert.deepEqual(g.map(s => s.members ?? [s.id]), [['a', 'b'], ['c']]); assert.equal(g[0].area, 10);
});

test('P3: ChatGPT holds the command office as its post (canonical definition), idle or coordinating', () => {
  assert.deepEqual(DEFAULT_DEFINITIONS.chatgpt.workstation, { kind: 'command', location: 'command', uses: ['work'] });
  for (const seed of SEEDS) {
    const L = loadTheme('real', { world: createWorld({ seed }) }).layout;
    const agents = ['chatgpt', 'claude', 'codex'].map(id => ({ id, activity: 'idle' }));
    const p = placeAgents(agents, {}, L);
    assert.equal(p.chatgpt.location, 'command', `${seed}: ChatGPT at the command office`);
    assert.equal(L.locationById.command.spaceId, createWorld({ seed }).capabilities.command.placement.spaceId);
    assert.equal(p.claude.location, L.places.idle.location); assert.equal(p.codex.location, L.places.idle.location);
    assert.equal(placeAgents([{ id: 'chatgpt', activity: 'coordinating' }], {}, L).chatgpt.location, 'command');
    assert.equal(placeAgents([{ id: 'chatgpt', activity: 'idle' }], {}, L).chatgpt.location, 'command');
    assert.equal(placeKind(createWorld({ seed }), createWorld({ seed }).spaces[L.locationById.command.spaceId]), 'command');
  }
});

test('P4: one canonical display name per capability, identical in both themes', () => {
  const w = createWorld({ seed: 'hillink' });
  assert.equal(capabilityName(w.capabilities.engineering.spec), 'Build Workshop');
  assert.equal(capabilityName(w.capabilities.review.spec), 'Engineering & Testing');
  assert.equal(capabilityName(w.capabilities.command.spec), 'Command Office');
  assert.equal(capabilityName({ id: 'drone-lab', kind: 'drone-lab' }), 'Drone Lab');
  // The name is a function of canonical data only: no theme argument exists.
  assert.equal(capabilityName.length, 1);
});
