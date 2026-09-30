// Pass 5F: agents created in HQ, seen by the World. Every test drives the real HQ engine (tools/hillink-hq) and feeds
// the World exactly what the live page gets: HQ state -> the World server's trimSnapshot -> HqTranslator -> a live
// WorldStore. HQ decides every lifecycle step; the World only shows it, and refuses anything that skips one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../../hillink-hq/engine.mjs';
import { MemoryStore } from '../../hillink-hq/store.mjs';
import { TRANSITIONS as HQ_TRANSITIONS, LIFECYCLE as HQ_LIFECYCLE } from '../../hillink-hq/agents.mjs';
import { trimSnapshot, commandableOf, commandHandler, createJournal } from '../serve.mjs';
import { HqTranslator } from '../adapters/hq.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { TRANSITIONS, LIFECYCLE, presenceOf, canWork, definitionOf } from '../core/agents.mjs';
import { resolveAppearance, figureLookOf } from '../render/appearance.mjs';
import { createInterpreter, readonly } from '../themes/interpreter.mjs';
import { createWorld } from '../procgen/world.mjs';
import { loadTheme } from '../themes/index.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView, resolveState } from '../engine/iso-view.mjs';
import { placeAgents, stationPoint } from '../core/behavior.mjs';
import { routeProblems } from './route-check.mjs';

// A local-checks stand-in: trials pass at once; real runs finish when the test says so.
function fakeLocal() {
  const runs = new Map();
  return {
    runs,
    health: async () => ({ status: 'IDLE', detail: 'Local launcher available.' }),
    async start({ task, runId, emit }) {
      runs.set(runId, { task, emit });
      if (runId.startsWith('trial-')) setImmediate(() => { emit({ kind: 'ACK', summary: 'trial up' }); emit({ kind: 'FINDING', summary: 'Inspected 12 source paths.' }); emit({ kind: 'COMPLETED', summary: 'exit 0' }); });
    },
    cancel: async runId => runs.has(runId),
  };
}
// The live path: HQ engine -> trimSnapshot -> HqTranslator -> live WorldStore (family locked to 'live').
function live({ adapters = {}, ollama = null } = {}) {
  let clock = 1_000_000;
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': fakeLocal(), ...adapters }, now: () => clock, config: { heartbeatMs: 3_600_000, progressMs: 3_600_000, observationJournalMs: 60_000 } });
  engine.initialize(); engine.provisioning = { ollama };
  const store = new WorldStore(emptyWorld()); store.family = 'live';
  const translator = new HqTranslator(), changed = new Set();
  store.subscribe(k => { for (const x of k) changed.add(x); });
  const snap = () => trimSnapshot({ ...engine.snapshot(), events: engine.state.events.slice(-300), health: { controller: 'ONLINE' } });
  const sync = () => { const { reset, events } = translator.ingest(snap()); if (reset) store.reset(events); else { store.dispatchAll(events); store.flush(); } };
  const step = async (n = 1, after = () => {}) => { for (let i = 0; i < n; i++) { clock += 1000; await engine.tick(); await engine.provisioningIdle(); sync(); after(); } };
  return { engine, store, sync, step, snap, changed, advance: ms => { clock += ms; }, get clock() { return clock; } };
}
const W = (h, id) => h.store.world.agents[id];
const create = (h, x = {}) => h.engine.createAgent({ id: 'agent-5f-unknown-927', name: 'Scout 927', backend: 'local-checks', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#e76f51' }, accessories: ['hardhat'], themes: { fantasy: { archetype: 'dwarf', accessories: ['helmet', 'beard'] } } }, ...x }, { by: 'kyle' });
const noRejections = h => assert.deepEqual(h.store.rejected.map(r => r.error), []);

test('the HQ lifecycle is the World registry\'s lifecycle: same states, same transitions', () => {
  assert.deepEqual(HQ_LIFECYCLE, LIFECYCLE);
  assert.deepEqual(HQ_TRANSITIONS, TRANSITIONS);
});

test('A, B, D, E: an unknown agent created in HQ appears in the World as a candidate, follows every HQ stage, and joins only when HQ activates it', async () => {
  const h = live(); h.sync();
  assert.equal(W(h, 'agent-5f-unknown-927'), undefined, 'not in source, not in the World before HQ creates it');
  const id = create(h);
  const seen = [];
  await h.step(7, () => { const a = W(h, id); if (a && seen.at(-1) !== a.lifecycle.state) seen.push(a.lifecycle.state); });
  assert.deepEqual(seen, ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING', 'READY']);
  const a = W(h, id);
  assert.deepEqual(a.lifecycle.history.map(x => x.state), ['REQUESTED', 'CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING', 'READY']);
  assert.equal(presenceOf(a), 'candidate', 'READY is not ACTIVE');
  assert.equal(canWork(a), false);
  assert.equal(createInterpreter('real').agent(a).caption, 'Onboarding complete: waiting to join');
  assert.equal(a.origin, 'hq');
  const def = definitionOf(a);
  assert.deepEqual([def.name, def.role, def.provider, def.team, def.capabilities, def.tools, def.permissions, def.meta.backend], ['Scout 927', 'Repository inspector', 'local', 'Engineering', ['inspect-repo'], ['file-inventory'], ['read-repo'], 'local-checks']);
  assert.equal(def.instructions, undefined, 'HQ-only fields stay in HQ');
  h.engine.activateAgent(id, { by: 'kyle' }); await h.step();
  assert.equal(W(h, id).lifecycle.state, 'ACTIVE');
  assert.equal(presenceOf(W(h, id)), 'member');
  noRejections(h);
});

test('C, 15: failing agents stay candidates (ERROR or WAITING) in the World and never get work; the World never advances them', async () => {
  const h = live(); h.sync();
  const cfg = create(h, { id: 'cfg-fail', name: 'Cfg Fail', backend: 'claude-cli', model: 'custom-model', capabilities: ['review-repo'], appearance: undefined });
  const tools = create(h, { id: 'tools-fail', name: 'Tools Fail', tools: ['file-inventory', 'repo-read'] });
  const wait = create(h, { id: 'wait-auth', name: 'Wait Auth', backend: 'codex-cli', capabilities: ['review-repo'], appearance: undefined });
  await h.step(8);
  for (const [id, state, stage] of [[cfg, 'ERROR', 'CONFIGURING'], [tools, 'ERROR', 'CONNECTING_TOOLS'], [wait, 'WAITING', 'CONNECTING_PROVIDER']]) {
    const a = W(h, id);
    assert.equal(a.lifecycle.state, state, id);
    assert.equal(a.lifecycle.history.at(-2).state, stage, `${id} stopped at ${stage}`);
    assert.equal(presenceOf(a), 'candidate'); assert.ok(!a.lifecycle.readied);
    assert.equal(createInterpreter('real').agent(a).place, 'onboarding');
  }
  assert.match(W(h, wait).lifecycle.detail, /bridge is off/);
  // Work named for a failed candidate is refused by HQ; a forged live event naming it is refused by the World.
  assert.throws(() => h.engine.createTask({ title: 't', description: 'd', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: tools }), /not an active agent/);
  h.store.dispatch(makeEvent('TASK_CREATED', { taskId: 'forged', title: 'x' }, { source: 'hq', at: h.clock }));
  h.store.dispatch(makeEvent('TASK_STARTED', { taskId: 'forged', agentId: tools }, { source: 'hq', at: h.clock + 1 }));
  h.store.dispatch(makeEvent('AGENT_READY', { agentId: tools }, { source: 'hq', at: h.clock + 2 }));
  h.store.flush();
  assert.ok(h.store.rejected.some(r => /not a working member/.test(r.error)));
  assert.ok(h.store.rejected.some(r => /cannot go from ERROR to READY/.test(r.error)), 'even a live event cannot skip provisioning');
  assert.equal(W(h, tools).taskId, null);
});

test('F, G: real work reaches the new agent through HQ, and the Living HQ journey plays for it: task board, carry, desk, archive', async () => {
  const h = live(); h.sync();
  const id = create(h);
  await h.step(7); h.engine.activateAgent(id, { by: 'kyle' }); await h.step();
  const w = createWorld({ seed: 'hillink' }), theme = loadTheme('real', { world: w }), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery);
  view.sync(h.store.world, new Set(['*']), 0); h.changed.clear();
  let now = 0; const frames = [];
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); const e = scene.get(`agent:${id}`); if (e) frames.push({ now, state: e.anim?.state ?? resolveState(e, now), journey: e.journey?.kind ?? null, carrying: !!e.carrying, moving: !!e.moving, activity: e.agent?.activity }); } };
  const show = s => { view.sync(h.store.world, new Set([...h.changed, '*agent']), now); h.changed.clear(); run(s); };
  show(10);
  const t = h.engine.createTask({ title: 'Inventory the source', description: 'Count files', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await h.step(); // dispatched to the new agent
  const runId = h.engine.state.tasks[t].runId, worker = h.engine.adapters['local-checks'].runs.get(runId);
  worker.emit({ kind: 'ACK', summary: 'worker up' }); h.sync();
  assert.equal(h.store.world.tasks[t].agentId, id); assert.equal(W(h, id).taskId, t);
  show(60);
  const pick = frames.findIndex(f => f.journey === 'start' && f.state === 'pickup');
  assert.ok(pick > 0, 'picks the task up at the board');
  assert.ok(frames.slice(pick).some(f => f.carrying && f.moving), 'carries it');
  assert.ok(frames.slice(pick).some(f => !f.moving && f.activity === 'researching'), 'works at its station');
  worker.emit({ kind: 'FINDING', summary: 'Inspected 12 source paths.' }); worker.emit({ kind: 'COMPLETED', summary: 'exit 0' });
  // The page redraws on every store change; so does this harness (a view that skipped a change would miss a transition).
  await h.step(3, () => show(2));
  assert.equal(h.store.world.tasks[t].status, 'done');
  assert.equal(W(h, id).activity, 'completed', 'a stale WORKING report does not pull it back to work');
  // Released when HQ next observes it idle (its periodic keep-alive observation: 60 s here, 5 min by default).
  h.advance(60_000); await h.step(1, () => show(2));
  show(60);
  const fin = frames.findIndex(f => f.journey === 'finish');
  assert.ok(fin > pick, 'a finish journey follows completion');
  assert.ok(frames.slice(fin).some(f => f.state === 'file'), 'files the task at the archive');
  noRejections(h);
});

test('H: disabling the agent mid-task requeues the task, frees its station, and it leaves: no ghost, no stale ownership; retired never returns', async () => {
  const h = live(); h.sync();
  const id = create(h);
  await h.step(7); h.engine.activateAgent(id, { by: 'kyle' }); await h.step();
  const t = h.engine.createTask({ title: 'Inventory', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await h.step();
  h.engine.adapters['local-checks'].runs.get(h.engine.state.tasks[t].runId).emit({ kind: 'ACK', summary: 'up' }); h.sync();
  // A meeting seat, so leaving has something to clean up.
  h.store.dispatch(makeEvent('MEETING_STARTED', { meetingId: 'm1', agentIds: [id, 'hq-verifier'], topic: 'standup' }, { source: 'hq', at: h.clock + 1 })); h.store.flush();
  assert.ok(h.store.world.meetings.m1);
  const w = createWorld({ seed: 'hillink' }), theme = loadTheme('real', { world: w }), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery);
  view.sync(h.store.world, new Set(['*']), 0);
  assert.ok(scene.get(`agent:${id}`), 'in the building while ACTIVE');
  await h.engine.disableAgent(id, { by: 'kyle' }); h.sync();
  const a = W(h, id), task = h.store.world.tasks[t];
  assert.equal(a.lifecycle.state, 'DISABLED'); assert.equal(presenceOf(a), 'absent');
  assert.equal(a.taskId, null); assert.equal(a.meetingId, null);
  assert.equal(task.status, 'queued'); assert.equal(task.agentId, null);
  assert.notEqual(task.outcome, 'failed', 'a stop for disabling is not a failed task');
  assert.ok(!(h.store.world.meetings.m1?.agentIds ?? []).includes(id), 'no meeting ghost');
  view.sync(h.store.world, new Set(['*']), 1000);
  assert.equal(scene.get(`agent:${id}`), undefined, 'the entity left');
  assert.ok(!Object.values(view.places).some((p, i) => Object.keys(view.places)[i] === id), 'its station is released');
  await h.step(); // the requeued task goes to another capable active agent
  assert.equal(h.store.world.tasks[t].agentId, 'hq-verifier');
  h.engine.activateAgent(id, { by: 'kyle' }); await h.step();
  assert.equal(W(h, id).lifecycle.state, 'ACTIVE', 're-enabled: it was READY before');
  await h.engine.retireAgent(id, { by: 'kyle' }); await h.step();
  assert.equal(W(h, id).lifecycle.state, 'RETIRED');
  h.store.dispatch(makeEvent('AGENT_ACTIVATED', { agentId: id }, { source: 'hq', at: h.clock + 5 })); h.store.flush();
  assert.ok(h.store.rejected.some(r => /cannot go from RETIRED to ACTIVE/.test(r.error)));
  assert.equal(W(h, id).lifecycle.state, 'RETIRED');
});

test('I: a World reload or HQ reconnect (snapshot) rebuilds the same agent: identity, definition, lifecycle, appearance, activation', async () => {
  const h = live(); h.sync();
  const a = create(h), b = create(h, { id: 'retry-me', name: 'Retry Me', tools: ['file-inventory', 'repo-read'] });
  await h.step(8); h.engine.activateAgent(a, { by: 'kyle' });
  h.engine.retryAgent(b, { by: 'kyle' }); await h.step(2);
  const fresh = new WorldStore(emptyWorld()); fresh.family = 'live';
  const { reset, events } = new HqTranslator().ingest(h.snap());
  assert.equal(reset, true);
  fresh.reset(events);
  assert.deepEqual(fresh.rejected.map(r => r.error), []);
  for (const id of [a, b]) {
    const x = W(h, id), y = fresh.world.agents[id];
    assert.deepEqual(y.lifecycle.history.map(e => e.state), x.lifecycle.history.map(e => e.state), id);
    assert.deepEqual([y.lifecycle.state, y.lifecycle.readied, presenceOf(y), y.name, y.origin], [x.lifecycle.state, x.lifecycle.readied, presenceOf(x), x.name, x.origin]);
    assert.deepEqual(definitionOf(y).appearance, definitionOf(x).appearance);
    assert.deepEqual(definitionOf(y).capabilities, definitionOf(x).capabilities);
  }
  assert.equal(fresh.world.agents[a].lifecycle.state, 'ACTIVE');
});

test('7: HQ appearance lands in the appearance system (base plus themes); one identity has a Real and a Fantasy look; agents are distinguishable', async () => {
  const request = async (url, opts) => url.endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'qwen3:4b', details: { family: 'qwen3' }, size: 1 }] }) } : { ok: true, body: (async function* () { const m = JSON.parse(opts.body).model; yield new TextEncoder().encode(`${JSON.stringify({ model: m, response: 'ok', done: false })}\n${JSON.stringify({ model: m, response: '', done: true })}\n`); })() };
  const h = live({ ollama: { enabled: true, request } }); h.sync();
  const a = create(h);
  const b = create(h, { id: 'agent-5f-scribe-414', name: 'Scribe 414', backend: 'ollama', model: 'qwen3:4b', role: 'Local summarizer', team: 'Research', capabilities: ['summarize'], appearance: { palette: { primary: '#3a86ff', hair: '#222222' }, accessories: ['glasses'], themes: { fantasy: { archetype: 'gnome', accessories: ['wizard'] } } } });
  await h.step(8);
  const look = (id, theme) => figureLookOf(resolveAppearance(definitionOf(W(h, id)).appearance, theme), theme);
  assert.deepEqual([look(a, 'real').shirt, look(a, 'real').hat, look(a, 'fantasy').hat, look(a, 'fantasy').beard != null], ['#e76f51', 'hardhat', 'helmet', true]);
  assert.equal(resolveAppearance(definitionOf(W(h, a)).appearance, 'fantasy').archetype, 'dwarf');
  assert.deepEqual([look(b, 'real').shirt, look(b, 'real').glasses, look(b, 'fantasy').hat], ['#3a86ff', true, 'wizard']);
  assert.notEqual(look(a, 'real').shirt, look(b, 'real').shirt);
  // The known 5E limitation is fixed: HQ's old display words are per-theme labels, not stray base fields.
  const claude = definitionOf(W(h, 'claude')).appearance;
  assert.equal(claude.real, undefined); assert.equal(claude.fantasy, undefined);
  assert.equal(claude.themes.real.label, 'Engineer'); assert.equal(claude.themes.fantasy.label, 'Dwarf builder');
  assert.ok(claude.themes.real.figure, 'the default figure is kept alongside');
});

test('J: two HQ-created agents with different id, name, role, backend, capabilities and look coexist, both ACTIVE, doing different work', async () => {
  const request = async (url, opts) => url.endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'qwen3:4b', details: { family: 'qwen3' }, size: 1 }] }) } : { ok: true, body: (async function* () { const m = JSON.parse(opts.body).model; yield new TextEncoder().encode(`${JSON.stringify({ model: m, response: 'ok', done: false })}\n${JSON.stringify({ model: m, response: '', done: true })}\n`); })() };
  const h = live({ ollama: { enabled: true, request } }); h.sync();
  const a = create(h), b = create(h, { id: 'agent-5f-scribe-414', name: 'Scribe 414', backend: 'ollama', model: 'qwen3:4b', role: 'Local summarizer', team: 'Research', capabilities: ['summarize'], appearance: { palette: { primary: '#3a86ff' } } });
  await h.step(8);
  for (const id of [a, b]) h.engine.activateAgent(id, { by: 'kyle' });
  await h.step();
  const t1 = h.engine.createTask({ title: 'Inventory', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: a });
  const t2 = h.engine.createTask({ title: 'Summarize notes', description: 'Summarize: the World shows HQ.', operation: 'summarize-local', safety: 'local-read-only', priority: 40, preferredAgentId: b });
  await h.step();
  const r1 = h.engine.adapters['local-checks'].runs.get(h.engine.state.tasks[t1].runId);
  r1.emit({ kind: 'ACK', summary: 'up' }); r1.emit({ kind: 'COMPLETED', summary: 'done' });
  await h.step(); await new Promise(r => setTimeout(r, 30)); await h.step();
  assert.deepEqual([h.store.world.tasks[t1].agentId, h.store.world.tasks[t2].agentId], [a, b]);
  assert.equal(h.store.world.tasks[t1].status, 'done');
  assert.equal(h.store.world.tasks[t2].status, 'done', 'the local model answered through its own adapter');
  assert.deepEqual([W(h, a).lifecycle.state, W(h, b).lifecycle.state], ['ACTIVE', 'ACTIVE']);
  assert.deepEqual([definitionOf(W(h, a)).provider, definitionOf(W(h, b)).provider, definitionOf(W(h, b)).model], ['local', 'ollama', 'qwen3:4b']);
  noRejections(h);
});

test('K: sim events aimed at a live HQ agent, and live events aimed at a sim agent, fail closed; the simulator cannot provision a real agent', async () => {
  const h = live(); h.sync();
  const id = create(h);
  await h.step(7);
  // The live page's store takes no sim event at all.
  h.store.dispatch(makeEvent('AGENT_ACTIVATED', { agentId: id }, { source: 'sim', at: h.clock + 1 })); h.store.flush();
  assert.equal(W(h, id).lifecycle.state, 'READY');
  assert.match(h.store.rejected.at(-1).error, /a live World refuses sim events/);
  // Without the family lock (a mixed store), the agent's origin still refuses the other family, both ways.
  const mixed = new WorldStore(emptyWorld());
  mixed.reset(new HqTranslator().ingest(h.snap()).events);
  mixed.dispatch(makeEvent('AGENT_ACTIVATED', { agentId: id }, { source: 'sim', at: h.clock + 2 }));
  mixed.dispatch(makeEvent('AGENT_REQUESTED', { agentId: 'dev-sim-1', definition: { name: 'Dev Sim' } }, { source: 'sim', at: h.clock + 3 }));
  mixed.dispatch(makeEvent('AGENT_PROVISIONING', { agentId: 'dev-sim-1', stage: 'CONFIGURING' }, { source: 'hq', at: h.clock + 4 }));
  mixed.flush();
  assert.equal(mixed.world.agents[id].lifecycle.state, 'READY', 'the simulator cannot activate an HQ agent');
  assert.ok(mixed.rejected.some(r => /sim events cannot change agent agent-5f-unknown-927/.test(r.error)));
  assert.ok(mixed.rejected.some(r => /hq events cannot change agent dev-sim-1/.test(r.error)));
  assert.equal(mixed.world.agents['dev-sim-1'].lifecycle.state, 'REQUESTED');
});

test('L: the renderer and theme cannot change the new agent\'s truth', async () => {
  const h = live(); h.sync();
  const id = create(h);
  await h.step(7);
  const before = JSON.stringify(h.store.world);
  const a = readonly(W(h, id));
  assert.throws(() => { a.lifecycle.state = 'ACTIVE'; }, /cannot change canonical state/);
  assert.throws(() => { a.definition.appearance.palette.primary = '#000000'; }, /cannot change canonical state/);
  assert.throws(() => { a.definition.capabilities.push('implement-repo'); }, /cannot change canonical state/);
  const w = createWorld({ seed: 'hillink' }), theme = loadTheme('real', { world: w }), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery);
  view.sync(h.store.world, new Set(['*']), 0);
  for (let t = 0; t < 600; t++) view.step(0.05, t * 50, { instant: false }, stepPath);
  const e = scene.get(`agent:${id}`);
  assert.equal(e.staging.presence, 'candidate'); assert.equal(e.staging.place, 'onboarding');
  assert.throws(() => { e.agent.lifecycle.state = 'ACTIVE'; }, /cannot change canonical state/);
  assert.equal(JSON.stringify(h.store.world), before, 'rendering 30 seconds changed nothing canonical');
});

test('8: with more agents than stations, placement stays coherent: distinct spots, clean routes, no canonical change', async () => {
  const h = live(); h.sync();
  const ids = Array.from({ length: 14 }, (_, i) => create(h, { id: `crowd-${i + 1}`, name: `Crowd ${i + 1}`, appearance: undefined }));
  await h.step(8);
  for (const id of ids) h.engine.activateAgent(id, { by: 'kyle' });
  await h.step(2);
  noRejections(h);
  const L = loadTheme('real', { world: createWorld({ seed: 'hillink' }) }).layout;
  const members = Object.values(h.store.world.agents).filter(canWork);
  assert.ok(members.length >= 14 + 1);
  const before = JSON.stringify(h.store.world);
  const places = placeAgents(members, {}, L);
  const points = members.map(a => stationPoint(places[a.id], L));
  assert.equal(new Set(points.map(p => p.map(v => Math.round(v)).join(','))).size, points.length, 'no two agents on one spot');
  const plan = p => p.at ?? L.planAt(p[0], p[1]);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) { const a = plan(points[i]), b = plan(points[j]); if (a.floor === b.floor && (places[members[i].id].overflow || places[members[j].id].overflow)) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 8, `${members[i].id} and ${members[j].id} overlap (an overflow spot is a body's width from everyone)`); }
  assert.ok(Object.values(places).some(p => p.overflow > 0), 'some agents overflowed their room\'s stations');
  const door = L.locationById[L.spawn ?? 'command'].door;
  for (const a of members) {
    const p = places[a.id], target = stationPoint(p, L), r = L.route(door, p.location, target);
    assert.ok(r, `a route to ${a.id}`);
    assert.deepEqual(routeProblems(L, r), [], `${a.id} route`);
  }
  assert.equal(JSON.stringify(h.store.world), before);
});

test('13: World commands follow HQ capabilities and lifecycle, never ids; a new agent gets its own operation and never falls back to another agent', async () => {
  const cli = { health: async () => ({ status: 'IDLE', detail: 'signed in', auth: 'subscription' }), start: async () => {}, cancel: async () => true, supports: () => true };
  const h = live({ adapters: { 'cli-claude': cli } }); h.sync();
  const a = create(h), r = create(h, { id: 'agent-5f-reviewer', name: 'Reviewer 5F', backend: 'claude-cli', role: 'Read-only reviewer', capabilities: ['review-repo'], appearance: undefined });
  await h.step(8);
  let cmd = commandableOf(h.snap().agents);
  assert.equal(cmd[a], undefined, 'READY is not commandable');
  h.engine.activateAgent(a, { by: 'kyle' }); h.engine.activateAgent(r, { by: 'kyle' });
  cmd = commandableOf(h.snap().agents);
  assert.equal(cmd[a].operation, 'inspect-repo');
  assert.equal(cmd[r].operation, 'review-repo');
  assert.match(cmd[r].label, /Ask Reviewer 5F/);
  const created = [];
  const hq = { raw: async () => h.snap(), createTask: async input => { created.push(input); return h.engine.createTask(input); } };
  const submit = commandHandler({ hq, journal: createJournal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hlw5f-')), 'c.jsonl')) });
  const res = await submit({ commandId: 'cmd-5f-00001', agentId: r, instruction: 'Where is the payout logic?' });
  assert.equal(res.code, 201);
  assert.deepEqual([created[0].operation, created[0].preferredAgentId], ['review-repo', r], 'queued for this agent only');
  await h.engine.disableAgent(r, { by: 'kyle' });
  const refused = await submit({ commandId: 'cmd-5f-00002', agentId: r, instruction: 'Again?' });
  assert.equal(refused.code, 400, 'a disabled agent takes no commands');
  assert.equal(created.length, 1);
});
