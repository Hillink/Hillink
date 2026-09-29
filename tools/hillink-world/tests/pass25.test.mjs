// Pass 2.5 (World side): ChatGPT's truthful state as the orchestrator, from HQ facts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HqTranslator } from '../adapters/hq.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { PRODUCTIVE_ACTIVITIES } from '../core/truth.mjs';
import { loadTheme } from '../themes/index.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { createServer, createJournal } from '../serve.mjs';
import { inspectHTML } from '../ui/inspect.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const agent = (id, status, extra = {}) => ({ id, name: { chatgpt: 'ChatGPT', claude: 'Claude', codex: 'Codex' }[id] ?? id, role: 'r', real: 'x', fantasy: 'y', status, assignment: null, executionAdapter: `a-${id}`, adapterAvailable: true, ...extra });
const task = (id, stage, extra = {}) => ({ id, title: `Task ${id}`, stage, capability: 'review-repo', operation: 'review-repo', safety: 'local-read-only', createdAt: 1000, ...extra });
const snap = (agents, tasks = [], runs = {}) => ({ seq: 1, now: 9000, health: { controller: 'ONLINE' }, agents, tasks, runs, alerts: {}, events: [] });
const live = s => { const store = new WorldStore(); store.reset(new HqTranslator().ingest(s).events); return store.world; };
const orch = (stage, extra = {}) => task('o1', stage, { operation: 'orchestrate', capability: 'coordinate', agentId: 'chatgpt', ...extra });

test('ChatGPT without an OpenAI runtime is Not connected, with HQ\'s safe reason and no command box', () => {
  const w = live(snap([agent('chatgpt', 'UNKNOWN', { executionAdapter: null, adapterAvailable: false, detail: 'OpenAI runtime not configured (no OPENAI_API_KEY for HQ).' })]));
  const g = w.agents.chatgpt;
  assert.equal(g.truth.state, 'NOT_CONNECTED'); assert.match(g.truth.reason, /OpenAI runtime not configured/);
  const html = inspectHTML({ type: 'agent', id: 'chatgpt' }, w, 10_000, null, {}, { command: { label: 'Ask ChatGPT', limits: '' }, commands: [] });
  assert.doesNotMatch(html, /cmd-text/); assert.match(html, /Not accepting requests/);
});

test('a connected, idle orchestrator is IDLE; a live turn is WORKING and coordinates in place', () => {
  assert.equal(live(snap([agent('chatgpt', 'IDLE')])).agents.chatgpt.truth.state, 'IDLE');
  const w = live(snap([agent('chatgpt', 'RUNNING', { assignment: 'o1' })], [orch('IMPLEMENTING', { runId: 'r1' })], { r1: { taskId: 'o1', agentId: 'chatgpt', acknowledgedAt: 8000, heartbeatAt: 8900 } }));
  assert.equal(w.agents.chatgpt.truth.state, 'WORKING'); assert.equal(w.agents.chatgpt.activity, 'coordinating');
  assert.ok(PRODUCTIVE_ACTIVITIES.has('coordinating'));
  const starting = live(snap([agent('chatgpt', 'UNKNOWN', { assignment: 'o1' })], [orch('CLAIMED', { runId: 'r1' })], { r1: { taskId: 'o1', agentId: 'chatgpt' } }));
  assert.equal(starting.agents.chatgpt.truth.state, 'STARTING', 'sent to OpenAI but not yet accepted');
});

test('WAITING names the real dependency; a pending decision for Kyle is NEEDS_ATTENTION', () => {
  const delegated = task('t9', 'READY', { preferredAgentId: 'claude', requestedBy: { agentId: 'chatgpt', taskId: 'o1' }, title: 'ChatGPT → Claude: Find agentStatus' });
  const w = live(snap([agent('chatgpt', 'IDLE'), agent('claude', 'RUNNING', { assignment: 'x' })], [orch('DONE', { endedAt: 5000 }), delegated]));
  assert.equal(w.agents.chatgpt.truth.state, 'WAITING');
  assert.match(w.agents.chatgpt.truth.reason, /Waiting for Claude task t9 \(ready\): ChatGPT → Claude: Find agentStatus/);
  const done = live(snap([agent('chatgpt', 'IDLE')], [orch('DONE', { endedAt: 5000 }), { ...delegated, stage: 'DONE', endedAt: 7000 }]));
  assert.equal(done.agents.chatgpt.truth.state, 'IDLE', 'the dependency finished: no longer waiting');
  const ask = task('k1', 'BLOCKED', { safety: 'owner-required', operation: 'owner-decision', requestedBy: { agentId: 'chatgpt', taskId: 'o1' }, title: 'Approval needed: paid API' });
  const w2 = live(snap([agent('chatgpt', 'IDLE')], [orch('DONE', { endedAt: 5000 }), ask]));
  assert.equal(w2.agents.chatgpt.truth.state, 'NEEDS_ATTENTION'); assert.match(w2.agents.chatgpt.truth.reason, /Waiting for Kyle to decide: Approval needed: paid API/);
});

test('an OpenAI failure is FAILED (HQ parks it, the run\'s terminal says FAILED); HQ unreachable is UNKNOWN', () => {
  const failed = live(snap([agent('chatgpt', 'IDLE')], [orch('BLOCKED', { runId: 'r1', endedAt: 5000, blocker: 'OpenAI rejected the API key (HTTP 401).' })], { r1: { taskId: 'o1', agentId: 'chatgpt', endedAt: 5000, terminal: 'FAILED' } }));
  assert.equal(failed.agents.chatgpt.truth.state, 'FAILED'); assert.match(failed.agents.chatgpt.truth.reason, /rejected the API key/);
  const store = new WorldStore();
  store.reset(new HqTranslator().ingest(snap([agent('chatgpt', 'RUNNING', { assignment: 'o1' })], [orch('IMPLEMENTING', { runId: 'r1' })], { r1: { taskId: 'o1', agentId: 'chatgpt', acknowledgedAt: 1, heartbeatAt: 1 } })).events);
  store.dispatch({ v: 1, id: 'down', type: 'SYSTEM_STATUS', at: 99_999, source: 'hq', systemId: 'hq', state: 'down' }); store.flush();
  assert.equal(store.world.agents.chatgpt.truth.state, 'UNKNOWN'); assert.equal(store.world.agents.chatgpt.activity, 'offline');
});

test('coordinating never sends the orchestrator on a trip: it works where it stands', () => {
  const theme = loadTheme('real'), scene = new Scene(), view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery), store = new WorldStore();
  store.subscribe((c, w) => view.sync(w, c, 0));
  store.reset(new HqTranslator().ingest(snap([agent('chatgpt', 'IDLE')])).events); store.flush();
  const e = scene.get('agent:chatgpt');
  for (let t = 0; t < 400 && (e.moving || e.departAt); t++) view.step(0.05, t * 50, { instant: false }, stepPath);
  const at = [e.x, e.y];
  store.reset(new HqTranslator().ingest(snap([agent('chatgpt', 'RUNNING', { assignment: 'o1' })], [orch('IMPLEMENTING', { runId: 'r1' })], { r1: { taskId: 'o1', agentId: 'chatgpt', acknowledgedAt: 8000, heartbeatAt: 8900 } })).events);
  for (let t = 0; t < 40; t++) view.step(0.05, 30_000 + t * 50, { instant: false }, stepPath);
  assert.deepEqual([e.x, e.y], at, 'no walk'); assert.equal(e.anim.state, 'inspect');
});

test('the World server refuses a command for an agent HQ says is not connected', async () => {
  const created = [];
  const hq = Object.assign(async () => ({ seq: 1 }), { createTask: async i => { created.push(i); return 't'; }, raw: async () => ({ agents: [{ id: 'chatgpt', name: 'ChatGPT', adapterAvailable: false, detail: 'OpenAI runtime not configured' }], tasks: [] }) });
  const server = createServer({ hq, commands: createJournal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-')), 'c.jsonl')) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ commandId: 'cmd-chatgpt-1', agentId: 'chatgpt', instruction: 'What is everyone working on?' }) });
    const body = await r.json();
    assert.equal(r.status, 502); assert.match(body.error, /not connected in HQ: OpenAI runtime not configured/); assert.equal(created.length, 0);
  } finally { server.close(); }
});
