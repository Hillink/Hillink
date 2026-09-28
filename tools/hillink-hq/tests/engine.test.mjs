import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, agentStatus, emptyState, reduce } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { deliverNotifications } from '../notifications.mjs';

function setup(overrides = {}) {
  let clock = 1000;
  const started = [];
  const adapter = { health: async () => ({ status: 'IDLE' }), start: async run => { started.push(run); }, cancel: async () => true, ...overrides };
  const store = new MemoryStore();
  const engine = new Engine({ store, adapters: { 'local-checks': adapter }, now: () => clock, config: { heartbeatMs: 100, progressMs: 500 } });
  engine.initialize();
  return { engine, store, adapter, started, advance: ms => { clock += ms; }, task: (input = {}) => engine.createTask({ title: 'Check HQ', description: 'Run isolated checks', operation: 'verify-hq', safety: 'local-read-only', priority: 50, ...input }) };
}

test('assignment is UNKNOWN until ACK; heartbeat renews execution but not meaningful progress', async () => {
  const s = setup(); s.task(); await s.engine.tick();
  assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'UNKNOWN');
  const run = s.started[0]; run.emit({ kind: 'ACK', summary: 'Process started' });
  assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'RUNNING');
  s.advance(501); run.emit({ kind: 'HEARTBEAT', summary: 'Still alive' });
  assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'STALLED');
  assert.equal(s.engine.state.agents['hq-verifier'].lastMeaningfulAt, null);
});
test('unconnected agents and provider credits stay UNKNOWN', () => {
  const s = setup(); const agent = s.engine.snapshot().agents.find(a => a.id === 'codex');
  assert.equal(agent.status, 'UNKNOWN'); assert.equal(agent.usage, null); assert.equal(agent.adapterAvailable, false);
});
test('worker events require acknowledgement and reject forged/stale run ids', async () => {
  const s = setup(); s.task(); await s.engine.tick(); const run = s.started[0];
  assert.throws(() => run.emit({ kind: 'COMPLETED', summary: 'Done' }), /acknowledgement/);
  assert.throws(() => s.engine.workerEvent('invented', { kind: 'ACK', summary: 'Go' }), /unknown/);
  run.emit({ kind: 'ACK', summary: 'Started' }); run.emit({ kind: 'COMPLETED', summary: 'Done' });
  assert.throws(() => run.emit({ kind: 'HEARTBEAT', summary: 'Old process' }), /Stale/);
});
test('priority dispatch is serialized and owner-only work is never executed', async () => {
  const s = setup(); s.task({ priority: 1 }); const high = s.task({ priority: 100 });
  const owner = s.task({ safety: 'owner-required', ownerAction: 'Kyle must decide retention policy.' });
  await Promise.all([s.engine.tick(), s.engine.tick()]);
  assert.equal(s.started.length, 1); assert.equal(s.started[0].task.id, high);
  assert.equal(s.engine.state.tasks[owner].stage, 'BLOCKED');
});
test('uncertain termination retains lease, parks exact blocker, and never falsely completes', async () => {
  const s = setup({ cancel: async () => false }); const id = s.task(); s.task(); await s.engine.tick();
  s.advance(101); await s.engine.tick();
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED'); assert.match(s.engine.state.tasks[id].ownerAction, /stop/);
  assert.equal(s.started.length, 1); assert.equal(s.engine.snapshot().unresolvedRuns, 1); assert.equal(s.engine.snapshot().cycleComplete, false);
});
test('confirmed stop parks when no different worker is available, then continues safe queue', async () => {
  const s = setup(); const first = s.task(); const second = s.task(); await s.engine.tick();
  s.advance(101); await s.engine.tick();
  assert.equal(s.engine.state.tasks[first].stage, 'BLOCKED'); assert.equal(s.started[1].task.id, second);
  assert.match(s.engine.state.tasks[first].blocker, /no alternate/);
});
test('watchdog hands off to a different capable worker without overlapping execution', async () => {
  const s = setup();
  s.engine.register({ ...s.engine.state.agents['hq-verifier'], id: 'alternate', name: 'Alternate' });
  const id = s.task(); await s.engine.tick(); s.advance(101); await s.engine.tick();
  assert.equal(s.engine.state.tasks[id].agentId, 'alternate'); assert.equal(s.engine.state.tasks[id].attempts, 2);
  assert.equal(Object.values(s.engine.state.runs).filter(r => !r.endedAt).length, 1);
  s.advance(101); await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
  assert.match(s.engine.state.tasks[id].blocker, /attempt budget/);
});
test('restart fences unresolved work instead of automatically relaunching it', async () => {
  const s = setup(); const id = s.task(); await s.engine.tick();
  const restored = new Engine({ store: s.store, adapters: { 'local-checks': s.adapter }, now: () => 5000 }); restored.initialize(); await restored.tick();
  assert.equal(restored.state.tasks[id].stage, 'BLOCKED'); assert.equal(s.started.length, 1);
  assert.match(restored.state.tasks[id].blocker, /restarted/);
});
test('progress events remain inspectable and replay produces identical state', async () => {
  const s = setup(); s.task(); await s.engine.tick(); const r = s.started[0]; r.emit({ kind: 'ACK', summary: 'Started' });
  r.emit({ kind: 'TEST_RESULT', result: 'passed', summary: '10 pass', files: ['engine.mjs'] });
  r.emit({ kind: 'COMPLETED', summary: 'Done' }); s.engine.watchdog();
  assert.deepEqual(s.store.read().reduce(reduce, emptyState()), s.engine.state);
  assert.equal(s.engine.snapshot().cycleComplete, true);
});
test('material alerts deduplicate, delivery retries, and acknowledgement is not delivery', async () => {
  const s = setup(); const id = s.task({ safety: 'owner-required', ownerAction: 'Decide scope.' }); s.engine.watchdog();
  const key = `blocked:${id}`; const first = s.engine.state.seq; s.engine.watchdog(); assert.equal(s.engine.state.seq, first);
  s.engine.acknowledgeAlert(key); assert.equal(s.engine.state.alerts[key].deliveredAt, null);
  await deliverNotifications(s.engine, null); assert.equal(s.engine.state.alerts[key].deliveredAt, null);
  await deliverNotifications(s.engine, async () => { throw Error('offline'); }); assert.equal(s.engine.state.alerts[key].deliveryError, 'offline');
  s.advance(60_001); await deliverNotifications(s.engine, async () => {}); assert.ok(s.engine.state.alerts[key].deliveredAt);
});
test('rate limited adapter cannot consume tasks until real capacity observation after retry time', async () => {
  const s = setup(); s.task(); await s.engine.tick(); const r = s.started[0];
  r.emit({ kind: 'ACK', summary: 'Started' }); r.emit({ kind: 'RATE_LIMITED', summary: 'Provider capacity exhausted', retryAt: 2000 });
  s.task(); await s.engine.tick(); assert.equal(s.started.length, 1);
  assert.equal(agentStatus(s.engine.state, s.engine.state.agents['hq-verifier'], 1000, s.engine.config), 'RATE_LIMITED');
  s.advance(1001); await s.engine.tick(); assert.equal(s.started.length, 2);
});
test('durable append failure prevents dispatch and side effects', async () => {
  const s = setup(); s.task(); s.store.append = () => { throw Error('disk full'); };
  await assert.rejects(s.engine.tick(), /disk full/); assert.equal(s.started.length, 0);
});
test('task input cannot smuggle shell commands or implicit safety', () => {
  const s = setup(); assert.throws(() => s.task({ operation: 'rm -rf /' }), /allowlisted/);
  assert.throws(() => s.task({ safety: 'production' }), /safety/);
  assert.throws(() => s.task({ safety: 'owner-required', ownerAction: '' }), /owner action/);
});
test('partially launched adapter failure does not release an unconfirmed worker lease', async () => {
  const s = setup({ start: async () => { throw Error('Lost launch response'); }, cancel: async () => false });
  const id = s.task(); s.task(); await s.engine.tick();
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
  assert.equal(s.engine.snapshot().unresolvedRuns, 1);
  assert.equal(s.engine.snapshot().counts.ready, 1);
});
