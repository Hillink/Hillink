// Pass 5G: the Fantasy World foundation. Same HQ truth, same World events, a different interpretation: the kingdom
// (world/kingdom-layout.mjs, themes/fantasy/*, render/kingdom-skin.mjs). What these tests hold it to: Real and Fantasy
// share one canonical state and differ only in representation; switching or reloading never touches truth; READY is
// not ACTIVE; an agent the source has never seen is summoned, placed, routed and given work with no source edit;
// construction moves only on canonical progress and its Giant and workers can never make any; renderer and theme
// writes fail; everything is deterministic; disable/requeue and live/sim isolation are unchanged; every destination
// is reachable without crossing a wall; and the 2.5D layers order depth correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../../hillink-hq/engine.mjs';
import { MemoryStore } from '../../hillink-hq/store.mjs';
import { trimSnapshot } from '../serve.mjs';
import { HqTranslator } from '../adapters/hq.mjs';
import { createWorld } from '../procgen/world.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { STAGES } from '../procgen/construction.mjs';
import { DEMO_CAPABILITY } from '../sim/construction-demo.mjs';
import { loadTheme } from '../themes/index.mjs';
import { createInterpreter, readonly } from '../themes/interpreter.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { DEFAULT_DEFINITIONS, presenceOf, canWork, definitionOf, PROVISIONING_STAGES } from '../core/agents.mjs';
import { ENTITY_KINDS } from '../core/entities.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { placeAgents, stationPoint, taskPlacement } from '../core/behavior.mjs';
import { createKingdomLayout, KINGDOM } from '../world/kingdom-layout.mjs';
import { createKingdomSkin, depthOrder, kingdomLook, KINGDOM_LAYERS } from '../render/kingdom-skin.mjs';
import { createCanvasRenderer } from '../render/canvas2d.mjs';
import { DISTRICTS, domainOf, SUMMONING, CONSTRUCTION_PHASES, ENTITY_VOCABULARY, SECURITY_VOCABULARY, establishedDistricts } from '../themes/fantasy/metaphor.mjs';
import { deriveKingdomEntities, KINGDOM_KINDS } from '../themes/fantasy/entities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let n = 0;
const ev = (type, fields, { source = 'sim', at } = {}) => ({ v: 1, id: `t5g-${++n}`, type, at: at ?? n, source, ...fields });
const hq = (type, fields = {}) => ({ v: 1, source: 'hq', id: `t5g-hq-${++n}`, type, at: n, ...fields });
const snap = w => JSON.stringify(w);
// Canonical truth across two stores: equal except the per-process sim event id counter.
const truth = w => JSON.stringify({ ...w, log: (w.log ?? []).map(({ id, ...e }) => e) });

// Two themes on one store: the same canonical World, interpreted twice.
function rig(themeId, store, siteWorld = createWorld({ seed: 'hillink' })) {
  const theme = loadTheme(themeId, { world: siteWorld }), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery, theme.interpreter);
  view.sync(store.world, new Set(['*']), 0);
  let now = 0;
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); } };
  const sync = changed => view.sync(store.world, new Set([...changed, '*agent']), now);
  return { theme, L: theme.layout, scene, view, run, sync, get now() { return now; } };
}
function team(events = []) {
  const store = new WorldStore(emptyWorld());
  for (const [id, x] of [['claude', {}], ['codex', {}], ['chatgpt', {}]]) store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: id, name: DEFAULT_DEFINITIONS[id].name, role: DEFAULT_DEFINITIONS[id].role ?? 'r', activity: 'idle', ...x }, { source: 'sim', at: 1 }));
  for (const e of events) store.dispatch(e);
  store.flush();
  return store;
}
const onboarding = (def, at = 10, { activate = true } = {}) => [ev('AGENT_REQUESTED', { agentId: def.id, definition: def }, { at }), ...['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING'].map((stage, i) => ev('AGENT_PROVISIONING', { agentId: def.id, stage }, { at: at + i + 1 })), ev('AGENT_READY', { agentId: def.id }, { at: at + 8 }), ...(activate ? [ev('AGENT_ACTIVATED', { agentId: def.id }, { at: at + 9 })] : [])];
function buildTo(w, stage, { task = 'task-5g', cap = DEMO_CAPABILITY } = {}) {
  const f = (type, x) => { const r = applyHqEvent(w, hq(type, x)); assert.equal(r.applied, true, `${type}: ${r.reason}`); };
  f('CAPABILITY_REQUESTED', { capability: cap, objectiveId: 'obj-5g', taskId: task });
  if (stage === 'planning') return w;
  f('CONSTRUCTION_REQUESTED', { capabilityId: cap.id });
  f('TASK_ASSIGNED', { taskId: task, agentId: 'claude', objectiveId: 'obj-5g' });
  for (const s of ['foundation', 'structure', 'exterior', 'systems', 'furnishing']) { if (STAGES.indexOf(stage) < STAGES.indexOf(s)) return w; f('WORK_COMMITTED', { taskId: task, ref: s }); }
  if (STAGES.indexOf(stage) < STAGES.indexOf('inspection')) return w;
  f('TESTING', { agentId: 'codex', taskId: task });
  if (stage === 'inspection') return w;
  f('REVIEW_VERDICT', { taskId: task, verdict: 'approved' });
  f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id });
  f('CAPABILITY_VERIFIED', { capabilityId: cap.id });
  return w;
}

// Kingdom route check: every segment stays inside the walkable areas, crosses a wall or fence only through its
// opening, and never enters furniture. Points come from each waypoint's plan position (.at).
const crosses = (p, q, a, b) => {
  const d = (u, v, w) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
};
function kingdomRouteProblems(L, from, route) {
  const out = [], pts = [L.planAt(from[0], from[1]), ...route.map(p => p.at)];
  if (pts.some(p => !p)) return ['a waypoint has no plan position'];
  const inWalk = q => L.walkAreas.some(r => q.x >= r.x0 - 5 && q.x <= r.x1 + 5 && q.z >= r.z0 - 5 && q.z <= r.z1 + 5);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    for (let s = 0; s <= 16; s++) { const q = { x: a.x + (b.x - a.x) * s / 16, z: a.z + (b.z - a.z) * s / 16 }; if (!inWalk(q)) { out.push(`segment ${k} leaves the walkable areas at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`); break; } if (L.solids.some(o => q.x > o.x0 + 1 && q.x < o.x1 - 1 && q.z > o.z0 + 1 && q.z < o.z1 - 1)) { out.push(`segment ${k} passes through furniture`); break; } }
    for (const w of L.walls) {
      if (!crosses(a, b, w.a, w.b)) continue;
      const horizontal = w.a.z === w.b.z, t = horizontal ? (w.a.z - a.z) / (b.z - a.z) : (w.a.x - a.x) / (b.x - a.x), x = a.x + (b.x - a.x) * t;
      if (!horizontal || !w.openings.some(o => x >= o.x0 && x <= o.x1)) out.push(`segment ${k} crosses the ${w.side} ${w.kind} of ${w.district}`);
    }
  }
  return out;
}

// ---- HQ live harness (as Pass 5F): the real engine, the World server's snapshot trim, the translator, a live store.
function fakeLocal() {
  const runs = new Map();
  return {
    runs,
    health: async () => ({ status: 'IDLE', detail: 'Local launcher available.' }),
    async start({ runId, emit }) { runs.set(runId, { emit }); if (runId.startsWith('trial-')) setImmediate(() => { emit({ kind: 'ACK', summary: 'trial up' }); emit({ kind: 'FINDING', summary: 'ok' }); emit({ kind: 'COMPLETED', summary: 'exit 0' }); }); },
    cancel: async runId => { const r = runs.get(runId); if (!r) return false; runs.delete(runId); try { r.emit({ kind: 'CANCELLED', summary: 'Worker termination confirmed by process close.' }); } catch { /* terminal */ } return true; },
  };
}
function live() {
  let clock = 1_000_000;
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': fakeLocal() }, now: () => clock, config: { heartbeatMs: 3_600_000, progressMs: 3_600_000, observationJournalMs: 60_000 } });
  engine.initialize(); engine.provisioning = { ollama: null };
  const store = new WorldStore(emptyWorld()); store.family = 'live';
  const translator = new HqTranslator(), changed = new Set();
  store.subscribe(k => { for (const x of k) changed.add(x); });
  const snapOf = () => trimSnapshot({ ...engine.snapshot(), events: engine.state.events.slice(-300), health: { controller: 'ONLINE' } });
  const sync = () => { const { reset, events } = translator.ingest(snapOf()); if (reset) store.reset(events); else { store.dispatchAll(events); store.flush(); } };
  const step = async (k = 1, after = () => {}) => { for (let i = 0; i < k; i++) { clock += 1000; await engine.tick(); await engine.provisioningIdle(); sync(); after(); } };
  return { engine, store, sync, step, snap: snapOf, changed, get clock() { return clock; } };
}
const UNKNOWN = { id: 'agent-5g-unknown-318', name: 'Warden 318', backend: 'local-checks', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#2a9d8f' }, accessories: ['cap'], themes: { fantasy: { archetype: 'elf', palette: { primary: '#2a9d8f' }, accessories: ['hood'] } } } };

test('the kingdom is its own spatial system, not the Real building renamed', () => {
  const w = createWorld({ seed: 'hillink' }), real = loadTheme('real', { world: w }).layout, K = loadTheme('fantasy', { world: w }).layout;
  assert.equal(K.id, 'kingdom'); assert.equal(real.id, 'generated');
  for (const id of ['throne', 'forge', 'vault', 'oracle', 'observatory', 'academy', 'library', 'arcane', 'gate', 'summoning', 'yard', 'hearth', 'plaza']) assert.ok(K.locationById[id], id);
  // Different geometry: one ground level in two rows around a road, against the Real building's storeys.
  assert.deepEqual(K.levels, [0]); assert.ok(real.levels.length > 1);
  assert.notDeepEqual(Object.keys(K.stationInfo).sort(), Object.keys(real.stationInfo).sort());
  // The metaphor is one declarative table; which districts HQ really backs comes from canonical capabilities.
  assert.deepEqual([...establishedDistricts(w)].sort(), ['arcane', 'forge', 'gate', 'hearth', 'oracle', 'summoning', 'throne', 'yard']);
  assert.match(K.locationById.vault.represents, /no such capability in HQ yet/, 'an unbacked district never claims a capability');
  for (const [id, d] of Object.entries(DISTRICTS)) assert.ok(d.name && d.represents && d.row, id);
});

test('A. identical truth, different representation: Claude builds at the Forge, Codex inspects at the Oracle Chamber', () => {
  const events = [ev('TASK_CREATED', { taskId: 't-a', title: 'Build it' }, { at: 5 }), ev('TASK_STARTED', { taskId: 't-a', agentId: 'claude', activity: 'coding' }, { at: 6 }), ev('TASK_CREATED', { taskId: 't-b', title: 'Review it' }, { at: 7 }), ev('TASK_STARTED', { taskId: 't-b', agentId: 'codex', activity: 'reviewing' }, { at: 8 })];
  const sa = team(events), sb = team(events);
  const before = snap(sa.world), beforeB = snap(sb.world);
  assert.equal(truth(sa.world), truth(sb.world), 'the same events make the same canonical World');
  const R = rig('real', sa), F = rig('fantasy', sb);
  R.run(40); F.run(40);
  assert.equal(snap(sa.world), before); assert.equal(snap(sb.world), beforeB, 'viewing in either theme changes nothing');
  assert.equal(F.view.places.claude.location, 'forge'); assert.equal(F.L.stationInfo[`forge:${F.view.places.claude.station}`].use, 'work');
  assert.equal(F.view.places.codex.location, 'oracle'); assert.equal(F.L.stationInfo[`oracle:${F.view.places.codex.station}`].use, 'inspect');
  assert.notEqual(R.view.places.claude.location, 'forge');
  const ec = F.scene.get('agent:claude'), ex = F.scene.get('agent:codex');
  assert.equal(ec.anim.state, 'work'); assert.equal(ex.anim.state, 'inspect');
  // Same ids, same outcomes, same ownership in both.
  for (const S of [R, F]) assert.deepEqual([...S.scene.entities.values()].filter(e => e.kind === 'task').map(e => [e.ref.id, e.follow]).sort(), [['t-a', 'agent:claude'], ['t-b', 'agent:codex']]);
  const look = kingdomLook(sb.world.agents.codex);
  assert.equal(look.archetype, 'cyborg'); assert.ok(look.overlays.includes('bionic-eye')); assert.equal(look.look.visor, undefined, 'a face, not a full robot visor');
  assert.equal(kingdomLook(sb.world.agents.chatgpt).look.hat, 'crown');
  assert.equal(kingdomLook(sb.world.agents.claude).archetype, 'dwarf');
});

test('B, O. switching themes repeatedly (also mid-work) cannot mutate truth, duplicate entities or lose ownership', () => {
  const store = team([ev('TASK_CREATED', { taskId: 't-o', title: 'Long job' }, { at: 5 }), ev('TASK_STARTED', { taskId: 't-o', agentId: 'claude', activity: 'coding' }, { at: 6 })]);
  const before = snap(store.world), w = createWorld({ seed: 'hillink' });
  let places = {};
  for (let k = 0; k < 8; k++) {
    const S = rig(k % 2 ? 'real' : 'fantasy', store, w); S.view.places = places; S.sync(['*']); S.run(k % 3 + 1);
    places = S.view.places;
    const agents = [...S.scene.entities.values()].filter(e => e.kind === 'agent').map(e => e.ref.id).sort(), tasks = [...S.scene.entities.values()].filter(e => e.kind === 'task');
    assert.deepEqual(agents, ['chatgpt', 'claude', 'codex'], 'one entity per agent');
    assert.equal(tasks.length, 1); assert.equal(tasks[0].follow, 'agent:claude', 'ownership kept');
    assert.equal(snap(store.world), before, `switch ${k}`);
  }
  assert.equal(store.world.tasks['t-o'].status, 'active'); assert.equal(store.world.tasks['t-o'].agentId, 'claude'); assert.equal(store.world.agents.claude.activity, 'coding');
});

test('C. READY is not ACTIVE: a summoned hero waits at the circle\'s edge until HQ activates it', () => {
  const def = { id: 'candidate-5g', name: 'Candidate', role: 'Analyst', team: 'Analytics' };
  const store = team(onboarding(def, 10, { activate: false })), F = rig('fantasy', store);
  const a = store.world.agents[def.id];
  assert.equal(a.lifecycle.state, 'READY'); assert.equal(presenceOf(a), 'candidate'); assert.equal(canWork(a), false);
  const s = createInterpreter('fantasy').agent(a);
  assert.deepEqual([s.presence, s.place], ['candidate', 'summon-ready']); assert.match(s.caption, /not active/);
  assert.equal(F.view.places[def.id].location, 'summon-ready');
  assert.equal(F.scene.get(`derived:portal:${def.id}`).derived.state, 'stable');
  const before = snap(store.world); F.run(30); assert.equal(snap(store.world), before, 'standing ready does nothing to truth');
  store.dispatch(ev('AGENT_ACTIVATED', { agentId: def.id }, { at: 30 })); store.flush(); F.sync([`agent:${def.id}`]);
  assert.equal(presenceOf(store.world.agents[def.id]), 'member');
  assert.equal(F.view.places[def.id].location, 'observatory', 'an analyst joins at the Observatory');
  assert.equal(F.scene.get(`derived:portal:${def.id}`), undefined, 'the portal closes when the hero has entered');
  // Every provisioning stage has its own zone of the circle.
  for (const st of [...PROVISIONING_STAGES, 'WAITING', 'ERROR', 'READY', 'REQUESTED']) assert.ok(F.L.places[SUMMONING[st].zone]?.stations.length, st);
});

test('D. an unknown agent created in HQ is summoned, placed, given work, travels, works and survives a reload, with no source edit', async () => {
  const h = live(); h.sync();
  const id = h.engine.createAgent(UNKNOWN, { by: 'kyle' });
  const w = createWorld({ seed: 'hillink' }), F = rig('fantasy', h.store, w);
  const seen = [];
  await h.step(7, () => { F.sync([...h.changed]); h.changed.clear(); const p = F.view.places[id]; if (p && seen.at(-1) !== p.location) seen.push(p.location); });
  assert.equal(h.store.world.agents[id].lifecycle.state, 'READY');
  assert.ok(seen.includes('summon-ready'), `summoning zones seen: ${seen}`);
  assert.ok(seen.length >= 3, `moves through the circle as HQ reports each stage: ${seen}`);
  h.engine.activateAgent(id, { by: 'kyle' }); await h.step(); F.sync([...h.changed]); h.changed.clear();
  assert.equal(F.view.places[id].location, 'oracle', 'an inspector\'s home is the Oracle Chamber');
  assert.equal(kingdomLook(h.store.world.agents[id]).archetype, 'ranger', 'its own Fantasy archetype (elf) is honoured');
  const t = h.engine.createTask({ title: 'Inventory', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await h.step(); h.engine.adapters['local-checks'].runs.get(h.engine.state.tasks[t].runId).emit({ kind: 'ACK', summary: 'up' }); h.sync();
  const e = F.scene.get(`agent:${id}`), from = [e.x, e.y];
  F.sync([...h.changed]); h.changed.clear();
  const place = F.view.places[id], target = stationPoint(place, F.L), route = F.L.route(from, place.location, target);
  assert.ok(route, 'a route to its work'); assert.deepEqual(kingdomRouteProblems(F.L, from, route), []);
  F.run(60);
  assert.equal(e.agent.activity, 'researching'); assert.equal(e.anim.state, 'read', 'it works where the work is');
  // Reload: a fresh live store from HQ's snapshot places it identically.
  const fresh = new WorldStore(emptyWorld()); fresh.family = 'live'; fresh.reset(new HqTranslator().ingest(h.snap()).events);
  const G = rig('fantasy', fresh, w);
  assert.deepEqual(G.view.places[id], F.view.places[id]);
  // No source knows this id.
  assert.equal(DEFAULT_DEFINITIONS[id], undefined);
  for (const dir of ['core', 'engine', 'render', 'themes', 'themes/fantasy', 'world', 'procgen', 'adapters']) for (const f of fs.readdirSync(path.join(here, '..', dir)).filter(x => x.endsWith('.mjs'))) assert.ok(!fs.readFileSync(path.join(here, '..', dir, f), 'utf8').includes('agent-5g-unknown'), `${dir}/${f}`);
});

test('E, M. dynamic agents of any role get a valid home, work area and look, and many coexist on distinct reachable spots', () => {
  const defs = [
    { id: 'dyn-treasurer', name: 'Treasurer', role: 'Treasurer', team: 'Finance' },
    { id: 'dyn-cyclops', name: 'Cyclops', role: 'Analytics observer', team: 'Analytics' },
    { id: 'dyn-scout', name: 'Scout', role: 'Outreach scout', team: 'Outreach' },
    { id: 'dyn-oracle', name: 'Oracle', role: 'QA', responsibilities: ['review', 'testing'] },
    { id: 'dyn-apprentice', name: 'Apprentice', provider: 'local' },
    { id: 'dyn-plain', name: 'Plain' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `dyn-crowd-${i}`, name: `Crowd ${i}`, role: 'Builder', responsibilities: ['implementation'] })),
  ];
  const store = team(defs.flatMap((d, i) => onboarding(d, 20 + i * 20))), F = rig('fantasy', store);
  const expect = { 'dyn-treasurer': ['vault', 'goblin'], 'dyn-cyclops': ['observatory', 'cyclops'], 'dyn-scout': ['gate', 'cupid'], 'dyn-oracle': ['oracle', 'oracle'], 'dyn-apprentice': ['academy', 'apprentice'], 'dyn-plain': ['hearth', 'human'] };
  for (const [id, [district, arch]] of Object.entries(expect)) {
    assert.equal(domainOf(definitionOf(store.world.agents[id])).district, district, id);
    assert.equal(F.view.places[id].location, district, id);
    assert.equal(kingdomLook(store.world.agents[id]).archetype, arch, id);
  }
  // Every agent on its own spot, all reachable from the gate, none through a wall.
  F.run(1);
  const pts = Object.entries(F.view.places).map(([id, p]) => [id, stationPoint(p, F.L)]), spawn = F.L.locationById.gate.door;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1]) > 4, `${pts[i][0]} and ${pts[j][0]} share a spot`);
  for (const [id, p] of pts) { const r = F.L.route(spawn, F.view.places[id].location, p); assert.ok(r, id); assert.deepEqual(kingdomRouteProblems(F.L, spawn, r), [], id); }
  // They work: a treasurer's work is at the Vault, an apprentice reads at the Academy.
  store.dispatch(ev('TASK_CREATED', { taskId: 'tt', title: 'Ledger' }, { at: 900 })); store.dispatch(ev('TASK_STARTED', { taskId: 'tt', agentId: 'dyn-treasurer', activity: 'coding' }, { at: 901 }));
  store.dispatch(ev('TASK_CREATED', { taskId: 'ta', title: 'Study' }, { at: 902 })); store.dispatch(ev('TASK_STARTED', { taskId: 'ta', agentId: 'dyn-apprentice', activity: 'researching' }, { at: 903 }));
  store.flush(); F.sync(['*agent']);
  assert.equal(F.view.places['dyn-treasurer'].location, 'vault'); assert.equal(F.view.places['dyn-apprentice'].location, 'academy');
});

test('F. a task starting and completing maps to Fantasy activity (quest board, forge, library archive) without changing truth', () => {
  const store = team(), F = rig('fantasy', store), changed = new Set();
  store.subscribe(k => { for (const x of k) changed.add(x); });
  F.run(5);
  store.dispatch(ev('TASK_CREATED', { taskId: 't-f', title: 'Forge it' }, { at: 50 })); store.flush(); F.sync([...changed]); changed.clear();
  const slot = taskPlacement(store.world.tasks, F.L)['t-f'].point, q = F.L.taskSlots.queue;
  assert.deepEqual(slot, [q.x, q.y], 'a queued task waits on the quest board');
  store.dispatch(ev('TASK_STARTED', { taskId: 't-f', agentId: 'claude', activity: 'coding' }, { at: 51 })); store.flush(); F.sync([...changed]); changed.clear();
  const e = F.scene.get('agent:claude'), frames = [];
  for (let k = 0; k < 900; k++) { F.run(0.05); frames.push({ state: e.anim?.state, journey: e.journey?.kind, loc: F.L.locationAt(e.x, e.y)?.id }); }
  assert.ok(frames.some(f => f.journey === 'start' && f.state === 'pickup'), 'takes the quest from the board');
  assert.equal(frames.at(-1).state, 'work'); assert.equal(frames.at(-1).loc, 'forge');
  const truth = snap(store.world);
  store.dispatch(ev('TASK_COMPLETED', { taskId: 't-f' }, { at: 60 })); store.flush(); F.sync([...changed]); changed.clear();
  store.dispatch(ev('AGENT_IDLE', { agentId: 'claude' }, { at: 61 })); store.flush(); F.sync([...changed]); changed.clear();
  const after = snap(store.world);
  const frames2 = []; for (let k = 0; k < 900; k++) { F.run(0.05); frames2.push({ state: e.anim?.state, journey: e.journey?.kind, loc: F.L.locationAt(e.x, e.y)?.id }); }
  assert.ok(frames2.some(f => f.journey === 'finish' && f.loc === 'library'), 'files the finished quest at the Great Library');
  assert.equal(snap(store.world), after, 'the journey changes nothing');
  assert.notEqual(truth, after); assert.equal(store.world.tasks['t-f'].status, 'done');
  assert.equal(createInterpreter('fantasy').cue({ type: 'TASK_COMPLETED', agentId: 'claude' }, () => 'Claude').text, 'Claude completed a quest');
});

test('G. construction changes only on canonical progress; every stage has a kingdom phase', () => {
  const w = createWorld({ seed: 'hillink' });
  buildTo(w, 'site-preparation');
  const p = () => w.projects[DEMO_CAPABILITY.id];
  let K = createKingdomLayout(w);
  const site = K.locationById[`site:${DEMO_CAPABILITY.id}`];
  assert.ok(site?.site && site.reachable); assert.match(site.name, /Clearing ground/);
  const store = team(), F = rig('fantasy', store, w), before = snap(w);
  F.run(120);
  assert.equal(snap(w), before, 'two minutes of animation at the site advance nothing');
  applyHqEvent(w, hq('WORK_COMMITTED', { taskId: 'task-5g', ref: 'next' }));
  assert.equal(p().stage, 'foundation');
  K = createKingdomLayout(w); assert.match(K.locationById[`site:${DEMO_CAPABILITY.id}`].name, /foundation stones/);
  for (const s of STAGES) assert.ok(CONSTRUCTION_PHASES[s]?.phase && CONSTRUCTION_PHASES[s]?.label, s);
  // Complete: the site goes, and the capability (meeting-space) is established at King's Command.
  const done = buildTo(createWorld({ seed: 'hillink' }), 'operational'), KD = createKingdomLayout(done);
  assert.equal(KD.locationById[`site:${DEMO_CAPABILITY.id}`], undefined); assert.ok(KD.established.has('throne'));
  // A capability no district stands for keeps its finished plot as a guild hall.
  const odd = buildTo(createWorld({ seed: 'hillink' }), 'operational', { cap: { id: 'drone-lab', kind: 'drone-lab', area: 20, traits: ['vehicles'] }, task: 'task-odd' });
  assert.ok(createKingdomLayout(odd).plots.some(pl => pl.guild && pl.project.id === 'drone-lab'));
});

test('H. the Giant and the workers are derived from the stage and can never create progress', () => {
  for (const stage of STAGES.slice(0, -1)) {
    const w = buildTo(createWorld({ seed: 'hillink' }), stage), K = createKingdomLayout(w), store = team();
    const specs = K.derive(readonly(store.world)), giant = specs.find(s => s.kind === 'giant'), worker = specs.find(s => s.kind === 'worker');
    const heavy = ['site-preparation', 'foundation', 'structure'].includes(stage);
    assert.equal(Boolean(giant), heavy, `giant at ${stage}`);
    assert.equal(Boolean(worker), STAGES.indexOf(stage) >= 1 && STAGES.indexOf(stage) <= 6, `worker at ${stage}`);
    if (giant) { assert.equal(typeof giant.project, 'string', 'a spec names its project; it holds no reference to it'); assert.equal(giant.stage, stage); }
    assert.deepEqual(K.derive(readonly(store.world)), specs, 'deterministic');
    const F = rig('fantasy', store, w), before = snap(w); F.run(60);
    assert.equal(snap(w), before, `${stage}: nothing the kingdom does moves the build`);
  }
  // Blocked: no Giant, no workers (only canonical facts start or stop them).
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure');
  applyHqEvent(w, hq('BLOCKED', { taskId: 'task-5g', reason: 'tests failing' }));
  const specs = createKingdomLayout(w).derive(readonly(team().world));
  assert.ok(!specs.some(s => s.kind === 'giant' || s.kind === 'worker'));
  for (const k of Object.keys(KINGDOM_KINDS)) { assert.equal(ENTITY_KINDS[k].canonical, false, k); assert.equal(ENTITY_KINDS[k].selectable, false, k); }
});

// A 2D context that accepts every call: the kingdom skin draws a full frame into it.
function fakeCanvas() {
  const noop = () => {};
  const ctx = new Proxy({ canvas: { width: 1400, height: 900 }, getTransform: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }), measureText: s => ({ width: String(s).length * 5 }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => null }, { get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; } });
  return { getContext: () => ctx, style: {}, width: 1400, height: 900, ctx };
}
test('I. renderer, theme and derived-entity writes fail; a full kingdom frame draws from read-only state', () => {
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure'), store = team(onboarding({ id: 'cand-i', name: 'C', role: 'Treasurer', team: 'Finance' }, 10, { activate: false }));
  const F = rig('fantasy', store, w); F.run(3);
  const before = snap(store.world), site = snap(w), renderer = createCanvasRenderer(fakeCanvas());
  const camera = { width: 1400, height: 900, zoom: 1, x: 0, y: 0 };
  assert.doesNotThrow(() => renderer.draw({ camera, scene: F.scene, skin: F.theme.skin, layout: F.L, world: store.world, entities: [...F.scene.entities.values()], time: 1000, effects: [{ kind: 'message', from: 'agent:claude', to: 'agent:codex', duration: 1800, start: 0 }], activity: F.view.activity, reducedMotion: false }));
  assert.equal(snap(store.world), before); assert.equal(snap(w), site);
  const ro = readonly(store.world);
  assert.throws(() => { ro.agents.claude.activity = 'coding'; }, /cannot change canonical state/);
  assert.throws(() => { createInterpreter('fantasy').agent(store.world.agents['cand-i']); const s = readonly(store.world.agents['cand-i']); s.lifecycle.state = 'ACTIVE'; }, /cannot change canonical state/);
  assert.throws(() => { F.scene.get('agent:claude').agent.taskId = 'x'; }, /cannot change canonical state/);
  // A derived spec is fresh data: changing it changes nothing canonical.
  const specs = F.L.derive(ro); specs.forEach(s => { s.stage = 'operational'; s.x = 0; });
  assert.equal(w.projects[DEMO_CAPABILITY.id].stage, 'structure');
  assert.deepEqual(KINGDOM_LAYERS, ['farBackground', 'background', 'ground', 'building', 'agent', 'foreground', 'overlay']);
});

test('J. deterministic: the same canonical state gives the same kingdom, placements, entities and motion', () => {
  const w1 = buildTo(createWorld({ seed: 'hillink' }), 'foundation'), w2 = buildTo(createWorld({ seed: 'hillink' }), 'foundation');
  const A = createKingdomLayout(w1), B = createKingdomLayout(w2), pick = L => JSON.stringify({ l: L.locations.map(l => [l.id, l.room, Object.keys(l.stations)]), e: L.navEdges, s: L.solids, st: L.stationInfo });
  assert.equal(pick(A), pick(B));
  const events = onboarding({ id: 'det-1', name: 'D1', team: 'Finance' }, 10).concat(onboarding({ id: 'det-2', name: 'D2', provider: 'local' }, 40));
  const runs = [0, 1].map(() => { const store = team(events), F = rig('fantasy', store, w1); F.run(30); return JSON.stringify([...F.scene.entities.values()].filter(e => e.kind === 'agent' || e.derived).map(e => [e.id, Math.round(e.x * 100), Math.round(e.y * 100), e.anim?.state ?? null])); });
  assert.equal(runs[0], runs[1]);
  const agents = Object.values(team(events).world.agents);
  assert.deepEqual(placeAgents(agents, {}, A), placeAgents([...agents].reverse(), {}, A), 'order-independent');
});

test('K. disable mid-run in the kingdom: the task goes back to the quest board, the hero leaves; nothing failed', async () => {
  const h = live(); h.sync();
  const id = h.engine.createAgent(UNKNOWN, { by: 'kyle' });
  await h.step(7); h.engine.activateAgent(id, { by: 'kyle' }); await h.step();
  h.engine.emit('AGENT_OBSERVED', { agentId: 'hq-verifier', status: 'OFFLINE', detail: 'kept out of this test', quarantineUntil: h.clock + 3_600_000 });
  const t = h.engine.createTask({ title: 'Inventory', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await h.step(); h.engine.adapters['local-checks'].runs.get(h.engine.state.tasks[t].runId).emit({ kind: 'ACK', summary: 'up' }); h.sync();
  const F = rig('fantasy', h.store);
  assert.ok(F.scene.get(`agent:${id}`));
  const r = await h.engine.disableAgent(id, { by: 'kyle' }); h.sync(); F.sync(['*']);
  assert.equal(r.requeued, t);
  const task = h.store.world.tasks[t];
  assert.equal(task.status, 'queued'); assert.equal(task.agentId, null); assert.notEqual(task.outcome, 'failed');
  assert.ok(!task.history.some(x => x.type === 'TASK_FAILED'));
  assert.equal(F.scene.get(`agent:${id}`), undefined, 'the disabled hero left the kingdom');
  assert.deepEqual(taskPlacement(h.store.world.tasks, F.L)[t].point, [F.L.taskSlots.queue.x, F.L.taskSlots.queue.y], 'back on the quest board');
  assert.equal(createInterpreter('fantasy').cue({ type: 'AGENT_DISABLED', agentId: id }, () => 'Warden').text, 'Warden left the kingdom (disabled)');
});

test('L. live and simulated stay isolated whichever theme draws them', () => {
  const store = new WorldStore(emptyWorld()); store.family = 'live';
  store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'r', activity: 'idle' }, { source: 'hq', at: 1 })); store.flush();
  for (const t of ['fantasy', 'real', 'fantasy']) { const S = rig(t, store); S.run(2); }
  store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: 'sim-bot', name: 'Sim', role: 'r', activity: 'idle' }, { source: 'sim', at: 2 })); store.flush();
  assert.equal(store.world.agents['sim-bot'], undefined, 'a live World refuses simulated events in any theme');
  assert.ok(store.rejected.length >= 1);
  const S = rig('fantasy', store);
  assert.ok(![...S.scene.entities.values()].some(e => e.kind === 'agent' && e.ref.id === 'sim-bot'));
  assert.ok([...S.scene.entities.keys()].filter(k => k.startsWith('derived:')).every(k => !store.world.agents[k]), 'no theme entity is ever an agent');
});

test('N. navigation: every station, overflow spot and site in the kingdom is reachable, and no route crosses a wall or furniture', () => {
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure'), K = createKingdomLayout(w);
  const starts = [K.locationById.gate.door, K.locationById.throne.door, K.locationById.yard.door, K.stationInfo['forge:forge:work2'].point];
  let checked = 0;
  for (const from of starts) for (const loc of K.locations) {
    const targets = [...Object.values(loc.stations), ...K.overflowSpots(loc.id).slice(0, 4)];
    for (const to of targets) { const r = K.route(from, loc.id, to); assert.ok(r, `${loc.id} unreachable`); assert.deepEqual(kingdomRouteProblems(K, from, r), [], `${loc.id}`); checked++; }
  }
  assert.ok(checked > 300);
  assert.ok(K.locationById[`site:${DEMO_CAPABILITY.id}`].reachable);
  // A point outside every walkable area has no route (fail closed, never a straight line through a wall).
  assert.equal(K.route(K.locationById.gate.door, 'forge', K.P.at(-5000, 5000, 0)), null);
});

test('2.5D: explicit layers order depth; a hero passes behind a fence and in front of a hall', () => {
  const K = createKingdomLayout(createWorld({ seed: 'hillink' })), skin = createKingdomSkin(K);
  const fence = skin.items.find(i => i.layer === 'foreground'), wall = skin.items.find(i => i.layer === 'building' && i.z0 >= KINGDOM.back.z0 - 10 && i.z1 <= KINGDOM.back.z0 + 10 && i.x0 >= K.districts.oracle.x0 && i.x1 <= K.districts.oracle.x1);
  assert.ok(wall, 'an established back-row hall (the Oracle Chamber) has a front wall facing the road');
  const box = (x, z, layer) => ({ layer, x0: x - 7, x1: x + 7, z0: z - 5, z1: z + 5, id: `${layer}@${z}` });
  const inForge = box(1000, 250, 'agent'), onRoad = box((wall.x0 + wall.x1) / 2, 540, 'agent'), inOracle = box((wall.x0 + wall.x1) / 2, 800, 'agent');
  const order = depthOrder([fence, wall, inForge, onRoad, inOracle, { layer: 'farBackground', id: 'far' }, { layer: 'overlay', id: 'ui' }]);
  const at = x => order.indexOf(x);
  assert.equal(order[0].id, 'far'); assert.equal(order.at(-1).id, 'ui');
  assert.ok(at(inForge) < at(fence), 'the front fence is drawn over a hero inside the forge');
  assert.ok(at(wall) < at(onRoad), 'a hero on the road is drawn over the hall\'s front wall');
  assert.ok(at(inOracle) < at(wall), 'a hero inside the Oracle Chamber is behind its front wall');
  assert.ok(Object.values(ENTITY_VOCABULARY).every(v => typeof v.canonical === 'boolean' && v.source));
  assert.deepEqual(Object.keys(SECURITY_VOCABULARY), ['detect', 'alert', 'enforce', 'investigate', 'repair']);
  // Security is vocabulary only: the gate raises an alert only while a canonical issue is open, never on its own.
  const quiet = deriveKingdomEntities(K, { agents: {}, issues: {} }), open = deriveKingdomEntities(K, { agents: {}, issues: { 'i-1': { id: 'i-1', open: true } } }), closed = deriveKingdomEntities(K, { agents: {}, issues: { 'i-1': { id: 'i-1', open: false } } });
  const alerts = specs => specs.filter(x => x.kind === 'ranger' || x.kind === 'golem').map(x => x.alert);
  assert.deepEqual(alerts(quiet), [false, false]); assert.deepEqual(alerts(closed), [false, false]); assert.deepEqual(alerts(open), [true, true]);
  assert.ok(quiet.every(x => KINGDOM_KINDS[x.kind]?.canonical === false), 'no kingdom entity is canonical');
});
