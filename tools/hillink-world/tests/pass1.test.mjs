// Pass 1: the trust boundary (runtime -> canonical state -> visual) and the one real command loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { deriveAgentState, explainAgent, PRODUCTIVE_ACTIVITIES } from '../core/truth.mjs';
import { HqTranslator } from '../adapters/hq.mjs';
import { createServer, createJournal, commandHandler, commandView, COMMANDABLE } from '../serve.mjs';
import { inspectHTML, commandStatus } from '../ui/inspect.mjs';

const agent = (id, status, extra = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), role: 'Worker', real: 'Engineer', fantasy: 'Dwarf', status, assignment: null, executionAdapter: `cli-${id}`, adapterAvailable: true, ...extra });
const task = (id, stage, extra = {}) => ({ id, title: `Task ${id}`, stage, agentId: 'claude', capability: 'review-repo', operation: 'review-repo', createdAt: 1_000, ...extra });
// A consistent HQ snapshot: agents, tasks and runs as HQ's /api/state reports them.
function snap({ seq = 1, now = 5_000, agents, tasks = [], runs = {}, events = [] }) {
  return { seq, now, health: { controller: 'ONLINE' }, agents, tasks, runs, alerts: {}, events };
}
const idle = () => snap({ agents: [agent('claude', 'IDLE'), agent('codex', 'IDLE'), agent('chatgpt', 'UNKNOWN', { executionAdapter: null, adapterAvailable: false, detail: 'Execution adapter is not connected in this controller.' })] });
const running = (seq = 2) => snap({ seq, now: 6_000, agents: [agent('claude', 'RUNNING', { assignment: 't1' }), agent('codex', 'IDLE'), idle().agents[2]], tasks: [task('t1', 'IMPLEMENTING', { runId: 'r1', claimedAt: 5_500 })], runs: { r1: { taskId: 't1', agentId: 'claude', acknowledgedAt: 5_600, heartbeatAt: 5_900 } } });
function live(s) { const tr = new HqTranslator(), store = new WorldStore(); const out = tr.ingest(s); store.reset(out.events); return { tr, store, poll(next) { const o = tr.ingest(next); if (o.reset) store.reset(o.events); else { store.dispatchAll(o.events); store.flush(); } } }; }
const hqEv = (type, fields, at = 7_000) => makeEvent(type, fields, { source: 'hq', at });

test('1. an event or animation claiming work cannot make an idle HQ agent look working', () => {
  const { store } = live(idle());
  store.dispatch(hqEv('AGENT_STARTED_WORK', { agentId: 'claude', detail: 'looks busy' })); store.flush();
  const claude = store.world.agents.claude;
  assert.equal(claude.truth.state, 'IDLE');
  assert.ok(!PRODUCTIVE_ACTIVITIES.has(claude.activity), `activity ${claude.activity}`);
});

test('2. a real acknowledged, heartbeating HQ run is WORKING, with the task and run as the reason', () => {
  const { store } = live(running());
  const claude = store.world.agents.claude;
  assert.equal(claude.truth.state, 'WORKING');
  assert.equal(claude.truth.taskId, 't1'); assert.equal(claude.truth.runId, 'r1');
  assert.match(claude.truth.reason, /run r1 was acknowledged/);
  assert.equal(claude.activity, 'reviewing', 'a review-repo run animates as reviewing');
  assert.equal(claude.taskId, 't1');
});

test('2b. dispatched but not yet acknowledged is STARTING, not WORKING', () => {
  const s = snap({ seq: 2, agents: [agent('claude', 'UNKNOWN', { assignment: 't1' })], tasks: [task('t1', 'CLAIMED', { runId: 'r1' })], runs: { r1: { taskId: 't1', agentId: 'claude' } } });
  const { store } = live(s);
  assert.equal(store.world.agents.claude.truth.state, 'STARTING');
  assert.ok(!PRODUCTIVE_ACTIVITIES.has(store.world.agents.claude.activity));
});

test('3. a completed run leaves WORKING, and what was done stays inspectable', () => {
  const w = live(running());
  w.poll(snap({ seq: 3, now: 8_000, agents: [agent('claude', 'IDLE'), agent('codex', 'IDLE'), idle().agents[2]], tasks: [task('t1', 'DONE', { runId: 'r1', claimedAt: 5_500, endedAt: 7_900, evidence: [{ kind: 'COMPLETED', summary: 'finished', at: 7_900 }] })], runs: { r1: { taskId: 't1', agentId: 'claude', endedAt: 7_900 } }, events: [{ seq: 3, id: 'e3', at: 7_900, type: 'WORKER_EVENT', data: { runId: 'r1', kind: 'COMPLETED', summary: 'finished' } }] }));
  const claude = w.store.world.agents.claude;
  assert.equal(claude.truth.state, 'IDLE');
  assert.ok(!PRODUCTIVE_ACTIVITIES.has(claude.activity));
  assert.equal(w.store.world.tasks.t1.status, 'done', 'the task and its outcome survive');
  assert.deepEqual(claude.transitions.map(t => t.to), ['WORKING', 'IDLE']);
});

test('4. a failed last task is FAILED, and a parked one needs attention, with the reason from HQ', () => {
  const failed = snap({ agents: [agent('claude', 'IDLE')], tasks: [task('t1', 'FAILED', { endedAt: 4_000, blocker: 'Claude Code exited 1' })] });
  assert.equal(live(failed).store.world.agents.claude.truth.state, 'FAILED');
  assert.equal(live(failed).store.world.agents.claude.activity, 'error');
  const parked = snap({ agents: [agent('claude', 'IDLE')], tasks: [task('t1', 'BLOCKED', { endedAt: 4_000, blocker: 'Recovery parked: sign in again' })] });
  const a = live(parked).store.world.agents.claude;
  assert.equal(a.truth.state, 'NEEDS_ATTENTION'); assert.match(a.truth.reason, /sign in again/);
  const later = snap({ agents: [agent('claude', 'IDLE')], tasks: [task('t0', 'BLOCKED', { endedAt: 3_000 }), task('t1', 'DONE', { endedAt: 4_000 })] });
  assert.equal(live(later).store.world.agents.claude.truth.state, 'IDLE', 'a newer success supersedes an old parked task');
});

test('5. offline, rate-limited and unreachable-HQ agents never animate work', () => {
  const off = live(snap({ agents: [agent('claude', 'OFFLINE', { detail: 'Recovery quarantine' })] }));
  off.store.dispatch(hqEv('AGENT_STARTED_WORK', { agentId: 'claude' })); off.store.flush();
  assert.equal(off.store.world.agents.claude.truth.state, 'OFFLINE');
  assert.equal(off.store.world.agents.claude.activity, 'offline');
  const limited = live(snap({ agents: [agent('claude', 'RATE_LIMITED', { retryAt: 9_000 })] }));
  assert.equal(limited.store.world.agents.claude.truth.state, 'WAITING');
  // Stale state: HQ goes away mid-run. The World must stop vouching for the run.
  const w = live(running());
  w.store.dispatch(makeEvent('SYSTEM_STATUS', { systemId: 'hq', state: 'down', detail: 'HQ unreachable' }, { source: 'hq', at: 9_000 })); w.store.flush();
  assert.equal(w.store.world.agents.claude.truth.state, 'UNKNOWN');
  assert.equal(w.store.world.agents.claude.activity, 'offline');
});

test('6. a reload rebuilds the same truth from HQ, not from saved animation', () => {
  const s = running();
  const a = live(s).store.world.agents, b = live(s).store.world.agents;
  for (const id of Object.keys(a)) { assert.equal(a[id].truth.state, b[id].truth.state, id); assert.equal(a[id].activity, b[id].activity, id); }
  assert.equal(b.claude.truth.state, 'WORKING');
});

test('10. an agent with no runtime connected in HQ is shown as not connected, never operational', () => {
  const { store } = live(idle());
  store.dispatch(hqEv('AGENT_STARTED_WORK', { agentId: 'chatgpt' })); store.flush();
  const g = store.world.agents.chatgpt;
  assert.equal(g.truth.state, 'NOT_CONNECTED');
  assert.equal(g.activity, 'offline');
  const html = inspectHTML({ type: 'agent', id: 'chatgpt' }, store.world, 10_000, null, {}, { command: COMMANDABLE.chatgpt ?? null, commands: [] });
  assert.match(html, /Not connected/); assert.doesNotMatch(html, /cmd-text/, 'no command box for an unconnected agent');
  assert.equal(explainAgent(store.world, 'chatgpt').basis, 'hq');
});

test('simulated agents keep their scripted activity and say so', () => {
  const store = new WorldStore(emptyWorld());
  store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'Builder' }, { source: 'sim', at: 1 }));
  store.dispatch(makeEvent('AGENT_STARTED_WORK', { agentId: 'claude' }, { source: 'sim', at: 2 })); store.flush();
  const t = deriveAgentState(store.world, store.world.agents.claude);
  assert.equal(t.basis, 'simulation'); assert.equal(t.state, 'WORKING'); assert.match(t.reason, /Simulated/);
});

// --- The command loop -------------------------------------------------------------------------------------
const tmpJournal = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-cmd-')), 'commands.jsonl');
function fakeHq() {
  const created = [];
  return { created, createTask: async input => { created.push(input); await new Promise(r => setTimeout(r, 5)); return `task-${created.length}`; } };
}

test('7. a World command becomes exactly one HQ read-only review task for Claude', async () => {
  const hq = fakeHq(), submit = commandHandler({ hq, journal: createJournal(tmpJournal()), now: () => 42 });
  const r = await submit({ commandId: 'cmd-00000001', agentId: 'claude', instruction: '  Where are payouts calculated?  ' });
  assert.equal(r.code, 201); assert.equal(r.body.taskId, 'task-1');
  assert.deepEqual(hq.created, [{ title: 'World request: Where are payouts calculated?', description: 'Where are payouts calculated?', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: 'claude' }]);
  assert.equal((await submit({ commandId: 'cmd-00000002', agentId: 'codex', instruction: 'x' })).code, 400, 'only commandable agents');
  assert.equal((await submit({ commandId: 'cmd-00000003', agentId: 'claude', instruction: '' })).code, 400);
  assert.equal((await submit({ agentId: 'claude', instruction: 'x' })).code, 400, 'an id is required');
  assert.equal(hq.created.length, 1);
});

test('9. repeated submissions of one command never create a second HQ task, even after a restart', async () => {
  const file = tmpJournal(), hq = fakeHq();
  const submit = commandHandler({ hq, journal: createJournal(file) });
  const input = { commandId: 'cmd-dup-0001', agentId: 'claude', instruction: 'Summarize the payout flow' };
  const [a, b] = await Promise.all([submit(input), submit(input)]); // double click
  const c = await submit(input); // retry
  const d = await commandHandler({ hq, journal: createJournal(file) })(input); // World server restarted
  assert.equal(hq.created.length, 1);
  assert.deepEqual([a, b, c, d].map(x => x.body.taskId), ['task-1', 'task-1', 'task-1', 'task-1']);
  assert.equal([a, b].filter(x => x.body.duplicate).length, 1);
});

test('8. the real outcome comes back: HQ task result joins the command history', () => {
  const record = { id: 'cmd-1', at: 1, agentId: 'claude', instruction: 'Where are payouts calculated?', taskId: 't1', error: null };
  const running = commandView(record, [task('t1', 'IMPLEMENTING', { runId: 'r1', evidence: [{ kind: 'ACK', summary: 'started', at: 2 }] })]);
  assert.equal(commandStatus(running).text, 'In HQ: implementing');
  const done = commandView(record, [task('t1', 'DONE', { runId: 'r1', endedAt: 9, evidence: [{ kind: 'MODEL_RESULT', summary: 'In lib/payouts.ts:42', at: 8 }, { kind: 'COMPLETED', summary: 'finished', at: 9 }] })]);
  assert.equal(done.hq.result, 'In lib/payouts.ts:42'); assert.equal(commandStatus(done).text, 'Done');
  const blocked = commandView(record, [task('t1', 'BLOCKED', { blocker: 'Claude Code exited 1: 401', evidence: [{ kind: 'FAILED', summary: 'exited 1', at: 9 }] })]);
  assert.match(commandStatus(blocked).text, /^Blocked: Claude Code exited 1/);
  assert.match(commandStatus({ ...record, taskId: null, error: 'Operation is not allowlisted' }).text, /refused/);
});

test('world server: the command route accepts only same-origin JSON and journals history', async () => {
  const hq = Object.assign(async () => ({ seq: 1 }), fakeHq(), { raw: async () => ({ tasks: [task('task-1', 'READY')] }) });
  const server = createServer({ hq, commands: createJournal(tmpJournal()) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/commands`, body = JSON.stringify({ commandId: 'cmd-http-001', agentId: 'claude', instruction: 'hi' });
  try {
    assert.equal((await fetch(base, { method: 'POST', body, headers: { 'content-type': 'application/json' } })).status, 403, 'no same-origin marker');
    assert.equal((await fetch(base, { method: 'POST', body, headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' } })).status, 403, 'form-encodable bodies refused');
    assert.equal((await fetch(base, { method: 'POST', body, headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' } })).status, 403);
    const ok = await fetch(base, { method: 'POST', body, headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } });
    assert.equal(ok.status, 201);
    const list = await (await fetch(base)).json();
    assert.deepEqual(Object.keys(list.commandable), ['claude', 'chatgpt']);
    assert.equal(list.commands[0].taskId, 'task-1'); assert.equal(list.commands[0].hq.stage, 'READY');
    assert.equal(hq.created.length, 1);
  } finally { server.close(); }
});
