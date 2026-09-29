import test from 'node:test';
import assert from 'node:assert/strict';
import { HqTranslator, activityForCapability, parseTestCounts } from '../adapters/hq.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { validateEvent } from '../core/events.mjs';
import { trimSnapshot, createServer } from '../serve.mjs';

const agent = (id, status, extra = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), role: 'Worker', real: 'Engineer', fantasy: 'Dwarf', status, assignment: null, ...extra });
let n = 0;
const hqEvent = (seq, type, data) => ({ seq, id: `e${++n}`, at: 1_000 + seq, type, data });
function base() {
  return {
    seq: 2, now: 2_000, health: { controller: 'ONLINE' },
    agents: [agent('claude', 'IDLE'), agent('codex', 'UNKNOWN')],
    tasks: [{ id: 't0', title: 'Old check', stage: 'DONE', capability: 'verify-unit', operation: 'verify-unit', createdAt: 900, endedAt: 950 }],
    runs: {}, alerts: {}, events: [hqEvent(1, 'AGENT_REGISTERED', {}), hqEvent(2, 'TASK_CREATED', { id: 't0' })],
  };
}
function apply(store, out) { if (out.reset) store.replace(emptyWorld()); store.dispatchAll(out.events); store.flush(); }

test('hq adapter: first poll rebuilds the World from the snapshot with only valid hq events', () => {
  const tr = new HqTranslator(), store = new WorldStore();
  const out = tr.ingest(base());
  assert.equal(out.reset, true);
  for (const e of out.events) { assert.equal(validateEvent(e), null, e.type); assert.equal(e.source, 'hq'); }
  apply(store, out);
  assert.equal(store.world.agents.claude.activity, 'idle');
  assert.equal(store.world.agents.codex.activity, 'offline', 'UNKNOWN is not shown as present');
  assert.equal(store.world.tasks.t0.status, 'done');
  assert.equal(store.world.systems.hq.state, 'ok');
});

test('hq adapter: a live review run walks through claimed, reviewing and done', () => {
  const tr = new HqTranslator(), store = new WorldStore();
  const snap = base(); apply(store, tr.ingest(snap));
  const events = [
    hqEvent(3, 'TASK_CREATED', { id: 't1', title: 'Review payouts', operation: 'review-repo', capability: 'review-repo', safety: 'local-read-only' }),
    hqEvent(4, 'DISPATCHED', { taskId: 't1', agentId: 'claude', runId: 'r1' }),
  ];
  apply(store, tr.ingest({ ...snap, seq: 4, events: [...snap.events, ...events] }));
  assert.equal(store.world.tasks.t1.status, 'active');
  assert.equal(store.world.agents.claude.activity, 'thinking');
  const more = [hqEvent(5, 'WORKER_EVENT', { runId: 'r1', kind: 'ACK', summary: 'Claude Code session started' }), hqEvent(6, 'WORKER_EVENT', { runId: 'r1', kind: 'HEARTBEAT', summary: 'alive' })];
  apply(store, tr.ingest({ ...snap, seq: 6, events: [...snap.events, ...events, ...more] }));
  assert.equal(store.world.agents.claude.activity, 'reviewing');
  const done = [hqEvent(7, 'WORKER_EVENT', { runId: 'r1', kind: 'COMPLETED', summary: 'finished' }), hqEvent(8, 'AGENT_OBSERVED', { agentId: 'claude', status: 'IDLE' })];
  const out = tr.ingest({ ...snap, seq: 8, events: [...snap.events, ...events, ...more, ...done] });
  assert.equal(out.reset, false);
  apply(store, out);
  assert.equal(store.world.tasks.t1.status, 'done');
  assert.equal(store.world.agents.claude.activity, 'idle');
});

test('hq adapter: tests, rate limits, requeues and alerts map to World signals', () => {
  const tr = new HqTranslator(), store = new WorldStore(), snap = base();
  apply(store, tr.ingest(snap));
  const ev = [
    hqEvent(3, 'TASK_CREATED', { id: 't2', title: 'Unit tests', operation: 'verify-unit', capability: 'verify-unit', safety: 'local-read-only' }),
    hqEvent(4, 'DISPATCHED', { taskId: 't2', agentId: 'codex', runId: 'r2' }),
    hqEvent(5, 'WORKER_EVENT', { runId: 'r2', kind: 'ACK', summary: 'ack' }),
    hqEvent(6, 'WORKER_EVENT', { runId: 'r2', kind: 'TEST_STARTED', summary: 'Running 9 files' }),
    hqEvent(7, 'WORKER_EVENT', { runId: 'r2', kind: 'TEST_RESULT', result: 'failed', summary: '69 passed; 2 failed.' }),
    hqEvent(8, 'ALERT_OPENED', { key: 'verification:t2', kind: 'VERIFICATION_FAILED', agentId: 'codex', ownerMustAct: true, ownerAction: 'Inspect the failing assertions' }),
    hqEvent(9, 'WORKER_EVENT', { runId: 'r2', kind: 'RATE_LIMITED', summary: 'limit', retryAt: 99_999 }),
    hqEvent(10, 'TASK_REQUEUED', { taskId: 't2' }),
    hqEvent(11, 'ALERT_RESOLVED', { key: 'verification:t2' }),
  ];
  const out = tr.ingest({ ...snap, seq: 11, events: [...snap.events, ...ev] });
  for (const e of out.events) assert.equal(validateEvent(e), null, e.type);
  store.dispatchAll(out.events.slice(0, 8)); store.flush();
  assert.deepEqual(Object.values(store.world.testRuns).map(r => [r.state, r.passed, r.failed]), [['failed', 69, 2]]);
  assert.equal(store.world.issues['hq-alert:verification:t2'].location, 'testing');
  store.dispatchAll(out.events.slice(8)); store.flush();
  assert.equal(store.world.tasks.t2.status, 'queued');
  assert.equal(store.world.issues['hq-alert:verification:t2'].open, false);
  assert.equal(store.world.agents.codex.activity, 'waiting');
});

test('hq adapter: redelivery is idempotent and a sequence gap forces a rebuild', () => {
  const tr = new HqTranslator(), snap = base();
  tr.ingest(snap);
  assert.deepEqual(tr.ingest(snap).events.filter(e => e.type !== 'SYSTEM_STATUS'), []);
  const far = { ...snap, seq: 500, events: [hqEvent(400, 'TASK_CREATED', { id: 'x', title: 'x' })] };
  assert.equal(tr.ingest(far).reset, true);
  const replayed = new HqTranslator().ingest(snap).events.map(e => e.id);
  assert.deepEqual(new HqTranslator().ingest(snap).events.map(e => e.id), replayed, 'ids are deterministic');
});

test('hq adapter helpers', () => {
  assert.equal(activityForCapability('review-repo'), 'reviewing');
  assert.equal(activityForCapability('verify-hq'), 'testing');
  assert.equal(activityForCapability('summarize'), 'researching');
  assert.equal(activityForCapability('implement'), 'coding');
  assert.deepEqual(parseTestCounts('71 passed; 0 failed.'), { passed: 71, failed: 0 });
  assert.equal(parseTestCounts('no counts'), null);
});

test('world server: trims HQ data and serves the feed only to its own loopback origin', async () => {
  const trimmed = trimSnapshot({ seq: 1, now: 1, health: { controller: 'ONLINE', ollama: 'x' }, agents: [{ id: 'a', name: 'A', role: 'r', status: 'IDLE', usage: { cost: 1 }, capabilities: [] }], tasks: [{ id: 't', title: 'T', description: 'secret-ish', stage: 'READY', evidence: [{ summary: 's' }] }], runs: {}, alerts: {}, events: [{ seq: 1, id: 'e', at: 1, type: 'TASK_CREATED', data: { id: 't', title: 'T', description: 'long' } }] });
  assert.equal(trimmed.agents[0].usage, undefined);
  assert.equal(trimmed.tasks[0].description, undefined);
  assert.equal(trimmed.tasks[0].evidence, undefined);
  assert.equal(trimmed.events[0].data.description, undefined);
  const server = createServer({ hq: async () => ({ seq: 1 }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/api/hq`)).status, 200);
    assert.equal((await fetch(`${base}/api/hq`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(`${base}/api/hq`, { headers: { origin: 'http://evil.test' } })).status, 403);
    assert.equal((await fetch(`${base}/api/hq`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/../serve.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/art/real.jpg`)).status, 404, 'no background art is served');
    assert.equal((await fetch(`${base}/world/building.mjs`)).status, 200);
  } finally { server.close(); }
});
