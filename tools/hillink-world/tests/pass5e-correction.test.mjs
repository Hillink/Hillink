// Pass 5E targeted correction: regression tests for the six blockers the 5E adversarial audit reproduced at dc4f110
// (B1-B6) and the authorised truth-boundary hardening (B7). Each test starts from the audit's reproduction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../procgen/world.mjs';
import { loadTheme } from '../themes/index.mjs';
import { WorldStore, emptyWorld, applyEvent, eventOrder } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { presenceOf, canWork, attribute, attributionTokens, DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { createCanvasRenderer } from '../render/canvas2d.mjs';
import { readonly } from '../core/readonly.mjs';
import { createInterpreter } from '../themes/interpreter.mjs';
import { createConstructionSource, agentFor } from '../adapters/git.mjs';
import { HqTranslator, hqDefinitions } from '../adapters/hq.mjs';
import { SIM_AGENTS } from '../sim/simulator.mjs';
import { DEV_AGENTS, DEV_ONBOARDING } from '../sim/dev-agents.mjs';

let n = 0;
const ev = (type, fields, { source = 'hq', at } = {}) => ({ v: 1, id: `c5e-${String(++n).padStart(5, '0')}`, type, at: at ?? n, source, ...fields });
const snapshot = w => JSON.stringify(w);
// Apply one event to a world and report whether it was refused, asserting a refusal changed nothing.
function attempt(w, e) {
  const before = snapshot(w);
  try { applyEvent(w, e); return true; } catch (error) { assert.equal(snapshot(w), before, `${e.type} refused with zero mutation (${error.message})`); return false; }
}
// Agents in each non-member state the audit attacked, plus a working member ("act") and a registered pre-5E agent.
function cast(source = 'hq') {
  const w = emptyWorld(), at = { t: 0 }, go = (type, f) => applyEvent(w, ev(type, f, { source, at: ++at.t }));
  const provision = id => { go('AGENT_REQUESTED', { agentId: id }); go('AGENT_PROVISIONING', { agentId: id, stage: 'CONFIGURING' }); };
  provision('prov');
  provision('ready'); go('AGENT_READY', { agentId: 'ready' });
  provision('dis'); go('AGENT_READY', { agentId: 'dis' }); go('AGENT_ACTIVATED', { agentId: 'dis' }); go('AGENT_DISABLED', { agentId: 'dis' });
  provision('ret'); go('AGENT_READY', { agentId: 'ret' }); go('AGENT_ACTIVATED', { agentId: 'ret' }); go('AGENT_RETIRED', { agentId: 'ret' });
  provision('act'); go('AGENT_READY', { agentId: 'act' }); go('AGENT_ACTIVATED', { agentId: 'act' });
  go('AGENT_REGISTERED', { agentId: 'legacy', name: 'Legacy', role: 'r', activity: 'idle' });
  go('TASK_CREATED', { taskId: 'tq', title: 'Queued' });
  return { w, at, next: () => ++at.t };
}
const NON_MEMBERS = ['prov', 'ready', 'dis', 'ret'];

// ---------------------------------------------------------------------------------------------- B1
test('B1. READY cannot work: READY + TASK_STARTED (or any productive activity) is refused with zero mutation', () => {
  const { w, next } = cast();
  assert.equal(w.agents.ready.lifecycle.state, 'READY');
  assert.equal(presenceOf(w.agents.ready), 'candidate'); assert.equal(canWork(w.agents.ready), false);
  // The audit's reproduction: REQUESTED -> CONFIGURING -> READY -> TASK_STARTED.
  assert.equal(attempt(w, ev('TASK_STARTED', { taskId: 'tq', agentId: 'ready' }, { at: next() })), false);
  for (const type of ['AGENT_STARTED_WORK', 'AGENT_THINKING', 'AGENT_COORDINATING', 'AGENT_RESEARCHING', 'AGENT_REVIEWING', 'AGENT_TESTING', 'AGENT_WAITING', 'AGENT_IDLE', 'AGENT_ERROR'])
    assert.equal(attempt(w, ev(type, { agentId: 'ready' }, { at: next() })), false, `${type} refused for READY`);
  assert.equal(w.agents.ready.taskId, null); assert.equal(w.tasks.tq.status, 'queued');
  // READY -> AGENT_ACTIVATED -> TASK_STARTED is accepted.
  assert.ok(attempt(w, ev('AGENT_ACTIVATED', { agentId: 'ready' }, { at: next() })));
  assert.ok(attempt(w, ev('TASK_STARTED', { taskId: 'tq', agentId: 'ready' }, { at: next() })));
  assert.equal(w.tasks.tq.status, 'active'); assert.equal(w.agents.ready.taskId, 'tq');
  // Legacy compatibility: an agent registered the pre-5E way (no lifecycle) is still a working member.
  assert.equal(presenceOf(w.agents.legacy), 'member');
  assert.ok(attempt(w, ev('TASK_STARTED', { taskId: 't-legacy', agentId: 'legacy' }, { at: next() })));
  // The theme stages READY as onboarding complete, waiting to join: not in the team yet.
  const staged = createInterpreter('real').agent(w.agents.dis);
  assert.equal(staged.presence, 'absent');
  const { w: w2 } = cast(); const s = createInterpreter('real').agent(w2.agents.ready);
  assert.equal(s.presence, 'candidate'); assert.equal(s.place, 'onboarding'); assert.match(s.caption, /waiting to join/);
});

// ---------------------------------------------------------------------------------------------- B2
test('B2. no work, task, meeting seat, message or activity reaches a provisioning, READY, DISABLED or RETIRED agent', () => {
  for (const id of NON_MEMBERS) {
    const { w, next } = cast();
    const was = { ...w.agents[id], lifecycle: w.agents[id].lifecycle.state };
    assert.equal(attempt(w, ev('AGENT_WAITING', { agentId: id, taskId: 'tq' }, { at: next() })), false, `${id}: AGENT_WAITING with taskId`);
    assert.equal(attempt(w, ev('AGENT_IDLE', { agentId: id, taskId: 'tq' }, { at: next() })), false, `${id}: AGENT_IDLE with taskId`);
    assert.equal(attempt(w, ev('AGENT_ERROR', { agentId: id }, { at: next() })), false, `${id}: AGENT_ERROR`);
    assert.equal(attempt(w, ev('AGENT_OFFLINE', { agentId: id, taskId: 'tq' }, { at: next() })), false, `${id}: AGENT_OFFLINE carrying a task`);
    assert.equal(attempt(w, ev('AGENT_REVIEWING', { agentId: id, prId: 'pr1' }, { at: next() })), false, `${id}: a PR through an activity event`);
    assert.equal(attempt(w, ev('MEETING_STARTED', { meetingId: `m-${id}`, agentIds: ['act', id] }, { at: next() })), false, `${id}: MEETING_STARTED`);
    assert.equal(attempt(w, ev('AGENT_MESSAGE', { agentId: id, toAgentId: 'act' }, { at: next() })), false, `${id}: message from`);
    assert.equal(attempt(w, ev('AGENT_MESSAGE', { agentId: 'act', toAgentId: id }, { at: next() })), false, `${id}: message to`);
    assert.equal(attempt(w, ev('TASK_STARTED', { taskId: 'tq', agentId: id }, { at: next() })), false, `${id}: TASK_STARTED`);
    const a = w.agents[id];
    assert.equal(a.taskId, null); assert.ok(!a.meetingId); assert.equal(a.prId, was.prId); assert.equal(a.lifecycle.state, was.lifecycle);
    // Saying an agent is offline (without giving it anything) stays valid.
    assert.ok(attempt(w, ev('AGENT_OFFLINE', { agentId: id }, { at: next() })));
  }
});

test('B2. disabling (or retiring) an agent in a meeting leaves no ghost seat; a meeting left empty ends', () => {
  for (const leave of ['AGENT_DISABLED', 'AGENT_RETIRED']) {
    const { w, next } = cast();
    applyEvent(w, ev('AGENT_REGISTERED', { agentId: 'peer', name: 'Peer', role: 'r' }, { at: next() }));
    applyEvent(w, ev('MEETING_STARTED', { meetingId: 'm1', agentIds: ['act', 'peer'] }, { at: next() }));
    applyEvent(w, ev('TASK_STARTED', { taskId: 'tq', agentId: 'act' }, { at: next() }));
    applyEvent(w, ev(leave, { agentId: 'act' }, { at: next() }));
    assert.deepEqual(w.meetings.m1.agentIds, ['peer'], `${leave}: no ghost meeting reference`);
    assert.equal(w.agents.act.meetingId, null); assert.equal(w.agents.act.taskId, null);
    assert.equal(w.tasks.tq.status, 'queued'); assert.equal(w.tasks.tq.agentId, null);
    applyEvent(w, ev('AGENT_OFFLINE', { agentId: 'peer' }, { at: next() }));
    const { w: w2, next: n2 } = cast();
    applyEvent(w2, ev('MEETING_STARTED', { meetingId: 'solo', agentIds: ['act'] }, { at: n2() }));
    applyEvent(w2, ev(leave, { agentId: 'act' }, { at: n2() }));
    assert.equal(w2.meetings.solo, undefined, 'an empty meeting ends');
    assert.equal(w2.meetingLog.at(-1).outcome, 'no participants left');
  }
});

test('B2. runtime facts from HQ never give work or activity to an agent that is not a working member', () => {
  const { w, next } = cast();
  const running = { status: 'RUNNING', connected: true, taskId: 'tq', runId: 'r1', acknowledged: true, heartbeatAt: 1, activity: 'coding' };
  applyEvent(w, ev('AGENT_RUNTIME', { agentId: 'dis', runtime: running }, { at: next() }));
  assert.equal(w.agents.dis.taskId, null); assert.equal(w.agents.dis.activity, 'offline');
});

// ---------------------------------------------------------------------------------------------- B3
test('B3. membership needs a canonical READY: DISABLED -> ACTIVE only for an agent that was READY before', () => {
  const w = emptyWorld(); let t = 0;
  const go = (type, f) => attempt(w, ev(type, f, { at: ++t }));
  // REQUESTED -> DISABLED -> ACTIVATED: refused.
  go('AGENT_REQUESTED', { agentId: 'a' }); go('AGENT_DISABLED', { agentId: 'a' });
  assert.equal(go('AGENT_ACTIVATED', { agentId: 'a' }), false, 'REQUESTED -> DISABLED -> ACTIVE is refused');
  assert.equal(presenceOf(w.agents.a), 'absent');
  assert.ok(go('AGENT_REQUESTED', { agentId: 'a' }), 'it can go back through provisioning');
  // REQUESTED -> CONFIGURING -> ERROR -> DISABLED -> ACTIVATED: refused.
  go('AGENT_REQUESTED', { agentId: 'b' }); go('AGENT_PROVISIONING', { agentId: 'b', stage: 'CONFIGURING' }); go('AGENT_PROVISIONING_FAILED', { agentId: 'b' }); go('AGENT_DISABLED', { agentId: 'b' });
  assert.equal(go('AGENT_ACTIVATED', { agentId: 'b' }), false, 'ERROR -> DISABLED -> ACTIVE without READY is refused');
  assert.equal(go('TASK_STARTED', { taskId: 'tb', agentId: 'b' }), false);
  // READY -> ACTIVE -> DISABLED -> ACTIVE: permitted (re-enabling).
  go('AGENT_REQUESTED', { agentId: 'c' }); go('AGENT_PROVISIONING', { agentId: 'c', stage: 'TESTING' }); go('AGENT_READY', { agentId: 'c' }); go('AGENT_ACTIVATED', { agentId: 'c' }); go('AGENT_DISABLED', { agentId: 'c' });
  assert.ok(go('AGENT_ACTIVATED', { agentId: 'c' })); assert.equal(presenceOf(w.agents.c), 'member');
  // READY -> DISABLED -> ACTIVE is also a re-enable (it was READY).
  go('AGENT_REQUESTED', { agentId: 'd' }); go('AGENT_PROVISIONING', { agentId: 'd', stage: 'TESTING' }); go('AGENT_READY', { agentId: 'd' }); go('AGENT_DISABLED', { agentId: 'd' });
  assert.ok(go('AGENT_ACTIVATED', { agentId: 'd' }));
  // Readiness survives a long, bounded lifecycle history.
  for (let i = 0; i < 20; i++) { go('AGENT_DISABLED', { agentId: 'c' }); go('AGENT_ACTIVATED', { agentId: 'c' }); }
  assert.equal(w.agents.c.lifecycle.state, 'ACTIVE'); assert.ok(!w.agents.c.lifecycle.history.some(h => h.state === 'READY'), 'READY has scrolled out of the history');
  go('AGENT_DISABLED', { agentId: 'c' }); assert.ok(go('AGENT_ACTIVATED', { agentId: 'c' }), 'and it can still be re-enabled');
  // A pre-5E registered agent that is disabled can be re-enabled (it was a working member).
  go('AGENT_REGISTERED', { agentId: 'legacy', name: 'L', role: 'r' }); go('AGENT_DISABLED', { agentId: 'legacy' });
  assert.ok(go('AGENT_ACTIVATED', { agentId: 'legacy' }));
});

test('B3. an id an event merely mentions never becomes a member, and can still be provisioned properly later', () => {
  const w = emptyWorld(); let t = 0;
  const go = (type, f, source = 'hq') => attempt(w, ev(type, f, { source, at: ++t }));
  assert.equal(go('TASK_STARTED', { taskId: 't1', agentId: 'ghost-1' }), false, 'TASK_STARTED for an unknown id');
  assert.equal(go('TASK_STARTED', { taskId: 't1', agentId: 'ghost-1' }, 'sim'), false, 'from the simulator too');
  assert.equal(go('MEETING_STARTED', { meetingId: 'm', agentIds: ['ghost-2'] }), false, 'MEETING_STARTED for an unknown id');
  assert.equal(go('AGENT_MESSAGE', { agentId: 'ghost-3', toAgentId: 'ghost-4' }), false, 'a message between unknown ids');
  assert.equal(go('AGENT_TESTING', { agentId: 'ghost-5' }), false, 'an activity for an unknown id');
  assert.equal(Object.keys(w.agents).length, 0, 'nothing was created');
  // Facts that give no work may mention it: it is a placeholder, absent and unable to work.
  assert.ok(go('AGENT_RUNTIME', { agentId: 'ghost-1', runtime: { status: 'RUNNING', taskId: 't1', runId: 'r', acknowledged: true, activity: 'coding' } }));
  assert.ok(go('AGENT_OFFLINE', { agentId: 'ghost-2' }));
  for (const id of ['ghost-1', 'ghost-2']) { assert.equal(w.agents[id].placeholder, true); assert.equal(presenceOf(w.agents[id]), 'absent'); assert.equal(canWork(w.agents[id]), false); }
  assert.equal(w.agents['ghost-1'].taskId, null, 'runtime facts gave it no task');
  assert.equal(go('TASK_STARTED', { taskId: 't1', agentId: 'ghost-1' }), false, 'still no work for a placeholder');
  assert.equal(go('AGENT_ACTIVATED', { agentId: 'ghost-1' }), false, 'a placeholder cannot be activated');
  // The audit's lock-out: a legitimate AGENT_REQUESTED for that id is now possible, and provisioning runs as normal.
  assert.ok(go('AGENT_REQUESTED', { agentId: 'ghost-1' }), 'later provisioning is not blocked');
  assert.ok(go('AGENT_PROVISIONING', { agentId: 'ghost-1', stage: 'TESTING' })); assert.ok(go('AGENT_READY', { agentId: 'ghost-1' })); assert.ok(go('AGENT_ACTIVATED', { agentId: 'ghost-1' }));
  assert.ok(go('TASK_STARTED', { taskId: 't1', agentId: 'ghost-1' }));
  // Registration (the pre-5E path) also establishes a placeholder.
  assert.ok(go('AGENT_REGISTERED', { agentId: 'ghost-2', name: 'G2', role: 'r' }));
  assert.equal(presenceOf(w.agents['ghost-2']), 'member');
  // An HQ snapshot registers its agents before anything it says they did, so live HQ tasks still land.
  const snap = { seq: 3, now: 9_000, health: { controller: 'ONLINE' }, agents: [{ id: 'claude', name: 'Claude', role: 'r', status: 'RUNNING', assignment: 'o1', executionAdapter: 'cli', adapterAvailable: true }],
    tasks: [{ id: 'o1', title: 'Build', stage: 'IMPLEMENTING', agentId: 'claude', runId: 'r1', capability: 'implement', operation: 'implement-repo', createdAt: 1_000, claimedAt: 2_000 }], runs: { r1: { taskId: 'o1', agentId: 'claude', acknowledgedAt: 2_100, heartbeatAt: 8_900 } }, alerts: {}, events: [] };
  const store = new WorldStore(); store.reset(new HqTranslator().ingest(snap).events);
  assert.equal(store.rejected.length, 0, JSON.stringify(store.rejected[0]?.error)); assert.equal(store.world.tasks.o1.agentId, 'claude');
});

// ---------------------------------------------------------------------------------------------- B4
test('B4. live and simulated sources never cross: tasks, activity, meetings, messages, registration, replay', () => {
  const s = new WorldStore(emptyWorld());
  s.dispatchAll([ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'r', activity: 'idle' }, { source: 'hq', at: 1 }),
    ev('AGENT_REGISTERED', { agentId: 'simmy', name: 'Sim', role: 'r', activity: 'idle' }, { source: 'sim', at: 1 }),
    ev('TASK_CREATED', { taskId: 'hq-task', title: 'HQ task' }, { source: 'hq', at: 2 }),
    ev('TASK_CREATED', { taskId: 'sim-task', title: 'Sim task' }, { source: 'sim', at: 2 }),
    ev('MEETING_STARTED', { meetingId: 'hq-meet', agentIds: ['claude'] }, { source: 'hq', at: 3 })]);
  s.flush(); assert.equal(s.rejected.length, 0);
  const before = snapshot(s.world);
  const cross = [
    ev('TASK_STARTED', { taskId: 'simtask', agentId: 'claude' }, { source: 'sim', at: 10 }),
    ev('AGENT_TESTING', { agentId: 'claude' }, { source: 'sim', at: 10 }),
    ev('AGENT_OFFLINE', { agentId: 'claude' }, { source: 'sim', at: 10 }),
    ev('MEETING_STARTED', { meetingId: 'sm', agentIds: ['claude'] }, { source: 'sim', at: 10 }),
    ev('MEETING_ENDED', { meetingId: 'hq-meet' }, { source: 'sim', at: 10 }),
    ev('AGENT_MESSAGE', { agentId: 'simmy', toAgentId: 'claude' }, { source: 'sim', at: 10 }),
    ev('TASK_COMPLETED', { taskId: 'hq-task' }, { source: 'sim', at: 10 }),
    ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Hijack', role: 'r' }, { source: 'sim', at: 10 }),
    ev('TASK_STARTED', { taskId: 'hqtask2', agentId: 'simmy' }, { source: 'hq', at: 10 }),
    ev('AGENT_REVIEWING', { agentId: 'simmy' }, { source: 'hq', at: 10 }),
    ev('MEETING_STARTED', { meetingId: 'hm', agentIds: ['simmy'] }, { source: 'hq', at: 10 }),
    ev('TASK_COMPLETED', { taskId: 'sim-task' }, { source: 'github', at: 10 }),
    ev('PR_CREATED', { prId: 'p', title: 'x', agentId: 'simmy' }, { source: 'hq', at: 10 }),
    ev('AGENT_DISABLED', { agentId: 'claude' }, { source: 'replay', at: 10 }),
    ev('AGENT_IDLE', { agentId: 'claude' }, { source: 'replay', at: 10 }),
    ev('AGENT_REQUESTED', { agentId: 'fresh' }, { source: 'replay', at: 10 }),
  ];
  s.dispatchAll(cross); s.flush();
  assert.equal(snapshot(s.world), before, 'every cross-family event was refused with zero mutation');
  assert.equal(s.rejected.length, cross.length);
  // A placeholder belongs to the family that first mentioned it: the simulator cannot claim an HQ identity.
  const w = emptyWorld();
  applyEvent(w, ev('AGENT_RUNTIME', { agentId: 'z', runtime: { status: 'IDLE' } }, { source: 'hq', at: 1 }));
  assert.equal(attempt(w, ev('AGENT_REGISTERED', { agentId: 'z', name: 'Z', role: 'r' }, { source: 'sim', at: 2 })), false, 'sim cannot claim it');
  assert.ok(attempt(w, ev('AGENT_REGISTERED', { agentId: 'z', name: 'Z', role: 'r' }, { source: 'hq', at: 3 })), 'HQ still can');
  // A store locked to one family (the live page) takes nothing from the other, not even events for new ids.
  const live = new WorldStore(); live.family = 'live';
  live.dispatchAll([ev('AGENT_REGISTERED', { agentId: 'newsim', name: 'N', role: 'r' }, { source: 'sim', at: 1 }), ev('SYSTEM_STATUS', { systemId: 'x', state: 'down' }, { source: 'sim', at: 1 })]); live.flush();
  assert.deepEqual(live.world.agents, {}); assert.deepEqual(live.world.systems, {}); assert.equal(live.rejected.length, 2);
});

test('B4. legitimate replay keeps original sources and is deterministic; the live page exposes no simulator', () => {
  const events = [ev('AGENT_REGISTERED', { agentId: 'h', name: 'H', role: 'r', activity: 'idle' }, { source: 'hq', at: 1 }), ev('AGENT_REQUESTED', { agentId: 's' }, { source: 'sim', at: 2 }),
    ev('TASK_CREATED', { taskId: 't', title: 'T' }, { source: 'hq', at: 3 }), ev('TASK_STARTED', { taskId: 't', agentId: 'h' }, { source: 'hq', at: 4 }), ev('AGENT_PROVISIONING', { agentId: 's', stage: 'TESTING' }, { source: 'sim', at: 5 })];
  const a = new WorldStore(); a.reset(events); const b = new WorldStore(); b.reset([...events].reverse());
  assert.equal(snapshot(a.world), snapshot(b.world)); assert.equal(a.rejected.length, 0);
  assert.equal(a.world.agents.h.origin, 'hq'); assert.equal(a.world.agents.s.origin, 'sim');
  // main.mjs: the dev handle returns the simulator only in simulation mode, the scenario buttons do nothing live, and
  // the store is locked to the page's family before any feed connects.
  const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /get sim\(\) \{ return mode === 'sim' \? sim : null; \}/);
  assert.ok(!/[,{ ]sim,/.test(main.slice(main.indexOf('window.hillinkWorld'))), 'no bare sim handle');
  assert.match(main, /if \(!key \|\| mode !== 'sim'\) return;/);
  assert.ok(main.indexOf("store.family = mode === 'hq' ? 'live' : 'sim';") < main.indexOf('connectHq(store'));
});

// ---------------------------------------------------------------------------------------------- B5
// Canonical state: everything but the applied-event log, its counter, and the note about which snapshot was loaded.
const canon = w => { const c = structuredClone(w); delete c.log; delete c.seq; delete c.snapshot; return JSON.stringify(c); };
const lifecycle = (id, t0, source = 'hq') => [ev('AGENT_REQUESTED', { agentId: id }, { source, at: t0 }), ev('AGENT_PROVISIONING', { agentId: id, stage: 'TESTING' }, { source, at: t0 + 1 }), ev('AGENT_READY', { agentId: id }, { source, at: t0 + 2 }), ev('AGENT_ACTIVATED', { agentId: id }, { source, at: t0 + 3 })];
function liveOf(batches, family = null) { const s = new WorldStore(); s.family = family; for (const b of batches) { s.dispatchAll(b); s.flush(); } return s; }
const replayOf = events => { const s = new WorldStore(); s.reset(events); return s; };

test('B5. live state equals replay: a late TASK_STARTED, ACTIVATED before an earlier READY, equal timestamps', () => {
  // The audit's first reproduction: READY(3) ACTIVATED(4) DISABLED(10), then TASK_STARTED(at 5) in a later batch.
  const q = [ev('AGENT_REQUESTED', { agentId: 'q' }, { at: 1 }), ev('AGENT_PROVISIONING', { agentId: 'q', stage: 'TESTING' }, { at: 2 }), ev('AGENT_READY', { agentId: 'q' }, { at: 3 }), ev('AGENT_ACTIVATED', { agentId: 'q' }, { at: 4 }), ev('AGENT_DISABLED', { agentId: 'q' }, { at: 10 })];
  const late = ev('TASK_STARTED', { taskId: 'late', agentId: 'q' }, { at: 5 });
  const L1 = liveOf([...q.map(e => [e]), [late]]), R1 = replayOf([...q, late]);
  assert.equal(canon(L1.world), canon(R1.world)); assert.equal(L1.world.tasks.late.status, 'queued', 'started while active, requeued by the disable');
  // ACTIVATED(111) delivered before READY(110).
  const a = [ev('AGENT_REQUESTED', { agentId: 'a' }, { at: 100 }), ev('AGENT_PROVISIONING', { agentId: 'a', stage: 'TESTING' }, { at: 101 })];
  const act = ev('AGENT_ACTIVATED', { agentId: 'a' }, { at: 111 }), ready = ev('AGENT_READY', { agentId: 'a' }, { at: 110 });
  const L2 = liveOf([a, [act], [ready]]), R2 = replayOf([...a, ready, act]);
  assert.equal(L2.world.agents.a.lifecycle.state, 'ACTIVE'); assert.equal(canon(L2.world), canon(R2.world));
  // Equal timestamps: the result does not depend on array or batch order.
  const same = [ev('AGENT_REQUESTED', { agentId: 'e' }, { at: 200 }), ev('AGENT_PROVISIONING', { agentId: 'e', stage: 'TESTING' }, { at: 200 }), ev('AGENT_READY', { agentId: 'e' }, { at: 200 }), ev('AGENT_ACTIVATED', { agentId: 'e' }, { at: 200 })];
  const outs = [same, [...same].reverse(), [same[3], same[1], same[0], same[2]]].flatMap(order => [canon(replayOf(order).world), canon(liveOf(order.map(e => [e])).world)]);
  assert.equal(new Set(outs).size, 1); assert.equal(replayOf(same).world.agents.e.lifecycle.state, 'ACTIVE');
});

test('B5. duplicates, restart and replay, many batches and two interleaved agents all converge', () => {
  const x = lifecycle('x', 10), y = lifecycle('y', 11);
  const work = [ev('TASK_CREATED', { taskId: 'tx', title: 'X' }, { at: 20 }), ev('TASK_STARTED', { taskId: 'tx', agentId: 'x' }, { at: 21 }), ev('TASK_CREATED', { taskId: 'ty', title: 'Y' }, { at: 21 }),
    ev('TASK_STARTED', { taskId: 'ty', agentId: 'y' }, { at: 22 }), ev('MEETING_STARTED', { meetingId: 'm', agentIds: ['x', 'y'] }, { at: 23 }), ev('AGENT_DISABLED', { agentId: 'x' }, { at: 24 }),
    ev('TASK_COMPLETED', { taskId: 'ty' }, { at: 25 }), ev('AGENT_ACTIVATED', { agentId: 'x' }, { at: 26 }), ev('TASK_STARTED', { taskId: 'tx', agentId: 'x' }, { at: 27 })];
  const all = [...x, ...y, ...work], want = canon(replayOf(all).world);
  // Shuffled deterministically into many batches, with every event delivered twice.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 12; round++) {
    const deck = [...all, ...all].map(e => [rnd(), e]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
    const batches = []; for (let i = 0; i < deck.length;) { const k = 1 + Math.floor(rnd() * 4); batches.push(deck.slice(i, i + k)); i += k; }
    assert.equal(canon(liveOf(batches).world), want, `round ${round}`);
    assert.equal(canon(replayOf(deck).world), want, `replay ${round}`);
  }
  const w = replayOf(all).world;
  assert.equal(w.tasks.tx.status, 'active'); assert.equal(w.tasks.tx.agentId, 'x'); assert.equal(w.tasks.ty.status, 'done');
  assert.deepEqual(w.meetings.m.agentIds, ['y'], 'x left the meeting when disabled and was not re-seated');
  // Restart: save the world as JSON, reload it, keep going; equals one uninterrupted replay.
  const half = all.filter(e => e.at <= 22), rest = all.filter(e => e.at > 22);
  const cont = new WorldStore(JSON.parse(JSON.stringify(replayOf(half).world))); cont.dispatchAll(rest); cont.flush();
  assert.equal(canon(cont.world), want);
  // A redelivered id changes nothing; two different events sharing an id resolve to the earlier one, however delivered.
  const s = liveOf([all, all]); assert.equal(canon(s.world), want);
  const twinA = ev('AGENT_TESTING', { agentId: 'y' }, { at: 30 }), twinB = { ...twinA, type: 'AGENT_REVIEWING', at: 29 };
  assert.equal(canon(liveOf([all, [twinA], [twinB]]).world), canon(replayOf([...all, twinB, twinA]).world));
  assert.equal(liveOf([all, [twinA], [twinB]]).world.agents.y.activity, 'reviewing');
  // Canonical order is total: the same pair always compares the same way.
  for (const p of all) for (const q of all) if (p !== q) assert.equal(Math.sign(eventOrder(p, q)), -Math.sign(eventOrder(q, p)));
});

test('B5. HQ ordering: same-time HQ events follow HQ\'s own sequence, and a live HQ session still matches its replay', () => {
  const tr = new HqTranslator(), agent = (id, status, extra = {}) => ({ id, name: id, role: 'r', status, assignment: null, executionAdapter: 'cli', adapterAvailable: true, ...extra });
  const base = { seq: 2, now: 2_000, health: { controller: 'ONLINE' }, agents: [agent('claude', 'IDLE'), agent('codex', 'UNKNOWN')], tasks: [], runs: {}, alerts: {}, events: [{ seq: 1, id: 'h1', at: 1_001, type: 'AGENT_REGISTERED', data: {} }, { seq: 2, id: 'h2', at: 1_002, type: 'AGENT_REGISTERED', data: {} }] };
  const first = tr.ingest(base);
  const evs = [{ seq: 3, id: 'h3', at: 3_000, type: 'TASK_CREATED', data: { id: 't', title: 'T', capability: 'verify-unit', operation: 'verify-unit', safety: 'local-read-only' } },
    { seq: 4, id: 'h4', at: 3_000, type: 'DISPATCHED', data: { taskId: 't', agentId: 'codex', runId: 'r' } },
    { seq: 5, id: 'h5', at: 3_000, type: 'WORKER_EVENT', data: { runId: 'r', kind: 'RATE_LIMITED', summary: 'limit' } },
    { seq: 6, id: 'h6', at: 3_000, type: 'TASK_REQUEUED', data: { taskId: 't' } }];
  const second = tr.ingest({ ...base, seq: 6, now: 3_000, agents: [agent('claude', 'IDLE'), agent('codex', 'RATE_LIMITED')], events: [...base.events, ...evs] });
  const store = new WorldStore(); store.family = 'live'; store.reset(first.events); store.dispatchAll([...second.events].reverse()); store.flush();
  assert.equal(store.world.tasks.t.status, 'queued'); assert.equal(store.world.agents.codex.activity, 'waiting');
  assert.equal(canon(store.world), canon(replayOf([...first.events, ...second.events]).world));
});

// ---------------------------------------------------------------------------------------------- B6
test('B6. git attribution resolves from the live registry, safely', async () => {
  assert.equal(agentFor('Kyle', 'Claude Opus 5.5 <noreply@anthropic.com>'), 'claude', 'existing Claude attribution');
  assert.equal(agentFor('chatgpt-codex-connector'), 'codex', 'existing Codex attribution');
  assert.equal(agentFor('Kyle'), null, 'an unknown author resolves to nobody');
  assert.equal(agentFor('claudette', 'codexical'), null, 'whole words only');
  const devin = { id: 'devin', name: 'Devin', meta: { attribution: { tokens: ['Devin'] } } };
  const registry = { ...DEFAULT_DEFINITIONS, devin };
  assert.equal(attribute(registry, 'Co-Authored-By: Devin <devin@example.com>'), 'devin', 'a dynamically registered coding agent');
  assert.equal(agentFor('Co-Authored-By: Devin'), null, 'not known to the defaults alone');
  // Malformed metadata fails safely: nothing is compiled or executed, and nothing is attributed.
  for (const bad of ['\\bdevin\\b', '(a+)+$', { tokens: 'devin' }, { tokens: [42, null, { x: 1 }, '', ' ', 'a'.repeat(80), '.*'] }, { pattern: '.*' }, null, 7])
    assert.equal(attribute({ x: { id: 'x', meta: { attribution: bad } } }, 'devin .* anything'), null, JSON.stringify(bad));
  assert.deepEqual(attributionTokens({ meta: { attribution: { tokens: ['  Nova  ', 'nova', 'x!'] } } }), ['nova']);
  // The construction source attributes through the registry it is given (the server passes defaults plus HQ's agents).
  const log = [['a'.repeat(40), 100, 'Kyle', 'Work', 'Devin <devin@example.com>'], ['b'.repeat(40), 200, 'Claude', 'More', '']].map(r => r.join('\x1f')).join('\x1e\n') + '\x1e';
  const run = async (cmd, args) => {
    if (cmd === 'gh') throw Error('no gh');
    if (args[0] === 'fetch') return ''; if (args[0] === 'for-each-ref') return 'origin/claude/x\n';
    if (args[0] === 'ls-tree') return args[2] === 'origin/claude/x' ? 'tools/hillink-world/world/passes/p.json\n' : '';
    if (args[0] === 'show') return JSON.stringify({ id: 'p', title: 'P', branch: 'claude/x', since: 'abc', scope: ['tools'] });
    if (args[0] === 'log' && args[1] === '-1') return '50\n'; if (args[0] === 'rev-parse') return 'b'.repeat(40); if (args[0] === 'log') return log;
    throw Error(`unexpected ${cmd} ${args.join(' ')}`);
  };
  const byOf = events => events.filter(e => e.evidence?.kind === 'commit').map(e => e.evidence.by);
  assert.deepEqual(byOf(await createConstructionSource({ run, registry: async () => registry }).poll()), ['devin', 'claude']);
  assert.deepEqual(byOf(await createConstructionSource({ run }).poll()), [null, 'claude'], 'defaults only without a registry');
  assert.deepEqual(byOf(await createConstructionSource({ run, registry: async () => { throw Error('HQ down'); } }).poll()), [null, 'claude'], 'HQ down: defaults still attribute');
  // HQ can declare it: the attribution it reports reaches the server's registry.
  const defs = hqDefinitions({ agents: [{ id: 'nova', name: 'Nova', role: 'Coder', attribution: { tokens: ['nova'] } }] });
  assert.equal(attribute({ ...DEFAULT_DEFINITIONS, ...defs }, 'Co-Authored-By: Nova <n@x>'), 'nova');
});

// ---------------------------------------------------------------------------------------------- B7
function world5e() {
  const w = createWorld({ seed: 'hillink' }), theme = loadTheme('real', { world: w }), store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery, theme.interpreter);
  for (const a of SIM_AGENTS) store.dispatch(makeEvent('AGENT_REGISTERED', { ...a, activity: 'idle' }, { source: 'sim', at: 1 }));
  store.flush(); view.sync(store.world, new Set(['*']), 0);
  const changed = new Set(); store.subscribe(k => { for (const x of k) changed.add(x); });
  let now = 0;
  const send = (...events) => { for (const e of events) store.dispatch(e); store.flush(); view.sync(store.world, new Set([...changed, '*agent']), now); changed.clear(); };
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); } };
  return { store, view, scene, theme, send, run };
}
const onboard = (def, at = 10) => [ev('AGENT_REQUESTED', { agentId: def.id, definition: def }, { source: 'sim', at }), ...DEV_ONBOARDING.map((stage, i) => ev('AGENT_PROVISIONING', { agentId: def.id, stage }, { source: 'sim', at: at + i + 1 })), ev('AGENT_READY', { agentId: def.id }, { source: 'sim', at: at + 10 }), ev('AGENT_ACTIVATED', { agentId: def.id }, { source: 'sim', at: at + 11 })];

test('B7. renderers, the view and the HUD get read-only views: a downstream write throws and canonical state is unchanged', () => {
  const W = world5e(), [A] = DEV_AGENTS;
  W.send(...onboard(A), ev('TASK_CREATED', { taskId: 'tA', title: 'Scan' }, { source: 'sim', at: 30 }), ev('TASK_STARTED', { taskId: 'tA', agentId: A.id, activity: 'researching' }, { source: 'sim', at: 31 }));
  W.run(5);
  const before = snapshot(W.store.world), e = W.scene.get(`agent:${A.id}`), t = W.scene.get('task:tA');
  assert.ok(e && t);
  // The audit's reproduction: a renderer writing through entity.agent.
  assert.throws(() => { e.agent.lifecycle.state = 'ACTIVE'; }, /cannot change canonical state/);
  assert.throws(() => { e.agent.activity = 'coding'; }, /cannot change canonical state/);
  assert.throws(() => { e.agent.definition.appearance.rig = 'x'; }, /cannot change canonical state/);
  assert.throws(() => { delete e.agent.taskId; }, /cannot change canonical state/);
  assert.throws(() => { t.task.status = 'done'; }, /cannot change canonical state/);
  assert.throws(() => { e.agent.lifecycle.history.push({ state: 'READY' }); }, /cannot change canonical state/);
  assert.throws(() => { Object.defineProperty(e.agent, 'x', { value: 1 }); }, /cannot change canonical state/);
  assert.throws(() => { W.view.world.agents[A.id].taskId = null; }, /cannot change canonical state/);
  // The renderer's frame: a skin that writes to the World it is given throws, and draws everything else as before.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const canvas = { getContext: () => ctx, style: {} };
  const hostile = { background() {}, frame(c, env) { env.world.agents[A.id].activity = 'coding'; } };
  const r = createCanvasRenderer(canvas);
  assert.throws(() => r.draw({ camera: { width: 100, height: 100, zoom: 1, x: 0, y: 0 }, scene: W.scene, skin: hostile, layout: W.theme.layout, world: W.store.world, entities: [], time: 0, effects: [], signals: {}, activity: {}, theme: {} }), /cannot change canonical state/);
  // A read-only view reads exactly the same data, and wrapping one again returns the same view.
  const ro = readonly(W.store.world); assert.equal(readonly(ro), ro); assert.equal(JSON.stringify(ro), before);
  W.run(30);
  assert.equal(snapshot(W.store.world), before, 'canonical World state is unchanged');
  assert.equal(W.store.world.agents[A.id].activity, 'researching');
});

// ---------------------------------------------------------------------------------------------- accepted behaviour
test('two unknown agents still run end to end after the correction; living HQ journeys still reach their stations', () => {
  const W = world5e(), [A, B] = DEV_AGENTS;
  W.send(...onboard(A, 10), ...onboard(B, 12).slice(0, 7)); W.run(10);
  assert.equal(presenceOf(W.store.world.agents[B.id]), 'candidate', 'B is still READY: waiting, not working');
  assert.equal(W.scene.get(`agent:${B.id}`).staging.caption, 'Onboarding complete: waiting to join');
  W.send(ev('TASK_CREATED', { taskId: 'tB', title: 'B work' }, { source: 'sim', at: 40 }), ev('TASK_STARTED', { taskId: 'tB', agentId: B.id }, { source: 'sim', at: 41 }));
  assert.equal(W.store.world.tasks.tB.status, 'queued', 'READY B was refused work');
  W.send(ev('AGENT_ACTIVATED', { agentId: B.id }, { source: 'sim', at: 42 }), ev('TASK_STARTED', { taskId: 'tB', agentId: B.id, activity: 'testing' }, { source: 'sim', at: 43 }),
    ev('TASK_CREATED', { taskId: 'tA', title: 'A work' }, { source: 'sim', at: 44 }), ev('TASK_STARTED', { taskId: 'tA', agentId: A.id, activity: 'researching' }, { source: 'sim', at: 45 }),
    ev('TASK_CREATED', { taskId: 'tC', title: 'Claude work' }, { source: 'sim', at: 46 }), ev('TASK_STARTED', { taskId: 'tC', agentId: 'claude', activity: 'coding' }, { source: 'sim', at: 47 }));
  W.run(60);
  for (const id of [A.id, B.id, 'claude']) { const e = W.scene.get(`agent:${id}`); assert.ok(e && !e.moving && e.spot, `${id} reached its station`); }
  const spots = [A.id, B.id, 'claude'].map(id => W.scene.get(`agent:${id}`).spot); assert.equal(new Set(spots).size, 3, 'stations are unique');
  W.send(ev('TASK_COMPLETED', { taskId: 'tA' }, { source: 'sim', at: 50 }), ev('AGENT_DISABLED', { agentId: B.id }, { source: 'sim', at: 51 })); W.run(5);
  assert.equal(W.store.world.tasks.tB.status, 'queued'); assert.equal(W.scene.get(`agent:${B.id}`), undefined);
  assert.equal(W.store.rejected.filter(r => r.event.at !== 41).length, 0, JSON.stringify(W.store.rejected.map(r => r.error)));
  // Reload/replay of everything that was delivered equals the live World.
  const replay = new WorldStore(); replay.reset(W.store.history);
  assert.equal(canon(replay.world), canon(W.store.world));
});
