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
  assert.equal(s.engine.snapshot().counts.working, 0);
  assert.equal(s.engine.snapshot().counts.assigned, 1);
  const run = s.started[0]; run.emit({ kind: 'ACK', summary: 'Process started' });
  assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'RUNNING');
  assert.equal(s.engine.snapshot().counts.working, 1);
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
  assert.equal(s.engine.state.tasks[first].stage, 'BLOCKED'); assert.equal(s.started.length, 1);
  assert.match(s.engine.state.tasks[first].blocker, /no alternate/);
  s.advance(s.engine.config.quarantineMs + 1); await s.engine.tick();
  assert.equal(s.started[1].task.id, second);
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
test('hung health adapter cannot stop a different capable worker', async () => {
  const s = setup({ health: () => new Promise(() => {}) }); s.engine.config.adapterTimeoutMs = 15;
  s.engine.adapters.healthy = { health: async () => ({ status: 'IDLE' }), start: async r => s.started.push(r), cancel: async () => true };
  s.engine.register({ ...s.engine.state.agents['hq-verifier'], id: 'healthy', name: 'Healthy', executionAdapter: 'healthy' });
  s.task(); await s.engine.tick();
  assert.equal(s.started.length, 1); assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'UNKNOWN');
  assert.equal(s.started[0].task.agentId, 'healthy');
});
test('hung launch/cancellation are bounded and retain the uncertain lease', async () => {
  const s = setup({ start: () => new Promise(() => {}), cancel: () => new Promise(() => {}) });
  s.engine.config.adapterTimeoutMs = 15; const id = s.task(); await s.engine.tick();
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED'); assert.equal(s.engine.snapshot().unresolvedRuns, 1);
});
test('completion elapsed time is frozen at the terminal event', async () => {
  const s = setup(); const id = s.task(); await s.engine.tick(); s.started[0].emit({ kind: 'ACK', summary: 'Started' });
  s.advance(25); s.started[0].emit({ kind: 'COMPLETED', summary: 'Finished' }); s.advance(1000);
  assert.equal(s.engine.state.tasks[id].endedAt - s.engine.state.tasks[id].claimedAt, 25);
});
test('owner reconciliation requires exact evidence and never marks unfinished work DONE', async () => {
  const s = setup({ cancel: async () => false }); const id = s.task(); await s.engine.tick(); s.advance(101); await s.engine.tick();
  const runId = s.engine.state.tasks[id].runId;
  assert.throws(() => s.engine.reconcileStoppedRun(runId, false, 'Stopped'), /confirmation/);
  assert.throws(() => s.engine.reconcileStoppedRun(runId, true, ''), /evidence/);
  s.engine.reconcileStoppedRun(runId, true, 'Verified process 123 is no longer running in Task Manager.');
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED'); assert.equal(s.engine.snapshot().unresolvedRuns, 0);
  assert.throws(() => s.engine.workerEvent(runId, { kind: 'ACK', summary: 'Late' }), /Stale/);
});
test('unknown journal event types fail replay instead of dropping state silently', () => {
  assert.throws(() => new Engine({ store: new MemoryStore([{ seq: 1, id: 'bad', at: 1, type: 'FUTURE_EVENT', data: {} }]) }), /Unsupported/);
});
test('new work immediately resolves the old handoff-ready notification', async () => {
  const s = setup(); s.task(); await s.engine.tick(); s.started[0].emit({ kind: 'ACK', summary: 'Started' }); s.started[0].emit({ kind: 'COMPLETED', summary: 'Finished' });
  s.engine.watchdog(); assert.equal(s.engine.state.alerts['cycle:complete'].active, true);
  s.task(); assert.equal(s.engine.state.alerts['cycle:complete'].active, false);
});
test('intentional serial local execution does not raise idle alerts for spare workers', async () => {
  const s = setup(); s.engine.register({ ...s.engine.state.agents['hq-verifier'], id: 'spare', name: 'Spare' });
  s.task(); s.task(); await s.engine.tick(); s.started[0].emit({ kind: 'ACK', summary: 'Started' }); s.engine.watchdog();
  assert.equal(s.engine.snapshot().counts.ready, 1); assert.equal(Object.values(s.engine.state.alerts).filter(a => a.active).length, 0);
});

test('worker failure cannot complete the cycle before diagnosed alternate retry and bounded parking', async () => {
  const s = setup(); s.engine.register({ ...s.engine.state.agents['hq-verifier'], id: 'alternate', name: 'Alternate' });
  const id = s.task(); await s.engine.tick();
  s.started[0].emit({ kind: 'ACK', summary: 'Started' }); s.started[0].emit({ kind: 'FAILED', summary: 'Worker exited unexpectedly' });
  s.engine.watchdog(); assert.equal(s.engine.snapshot().cycleComplete, false);
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].agentId, 'alternate');
  s.started[1].emit({ kind: 'FAILED', summary: 'Alternate failed before ACK' });
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
  assert.match(s.engine.state.tasks[id].blocker, /attempt budget/);
  assert.ok(s.engine.state.tasks[id].ownerAction);
  assert.equal(s.started.length, 2);
  assert.deepEqual(s.store.read().reduce(reduce, emptyState()), s.engine.state);
});

test('rate limited task waits until retry time and resumes itself, then parks repeated rejection', async () => {
  const s = setup(); const id = s.task(); await s.engine.tick();
  s.started[0].emit({ kind: 'RATE_LIMITED', summary: 'Rejected without execution', retryAt: 2000 });
  assert.equal(s.engine.snapshot().cycleComplete, false);
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'READY');
  s.advance(999); await s.engine.tick(); assert.equal(s.started.length, 1);
  s.advance(2); await s.engine.tick(); assert.equal(s.started[1].task.id, id);
  s.started[1].emit({ kind: 'RATE_LIMITED', summary: 'Rejected again', retryAt: 3000 });
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
  assert.match(s.engine.state.tasks[id].blocker, /budget/);
});

test('measured test progress keeps long verification alive; heartbeats alone eventually stall', async () => {
  const s = setup(); s.task(); await s.engine.tick(); const run = s.started[0];
  run.emit({ kind: 'ACK', summary: 'Started' }); run.emit({ kind: 'TEST_STARTED', summary: 'Test suite running' });
  for (let n = 1; n <= 20; n++) {
    s.advance(90); run.emit({ kind: 'HEARTBEAT', summary: 'Alive' });
    run.emit({ kind: 'TEST_PROGRESS', completedTests: n, summary: `${n} tests completed` });
    await s.engine.tick(); assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'RUNNING');
  }
  assert.throws(() => run.emit({ kind: 'TEST_PROGRESS', completedTests: 20, summary: 'Repeated count' }), /Increasing/);
  for (let n = 0; n < 6; n++) { s.advance(90); run.emit({ kind: 'HEARTBEAT', summary: 'Alive without results' }); }
  assert.equal(s.engine.snapshot().agents.find(a => a.id === 'hq-verifier').status, 'STALLED');
});

test('quarantine survives health polls and replay until cooldown then fresh health', async () => {
  const s = setup(); s.task(); await s.engine.tick(); s.started[0].emit({ kind: 'FAILED', summary: 'Process crashed' });
  await s.engine.tick(); s.task(); await s.engine.tick(); assert.equal(s.started.length, 1);
  const restored = new Engine({ store: s.store, adapters: { 'local-checks': s.adapter }, now: s.engine.now, config: s.engine.config });
  restored.initialize(); await restored.tick(); assert.equal(s.started.length, 1);
  s.advance(s.engine.config.quarantineMs + 1); await restored.tick(); assert.equal(s.started.length, 2);
});

test('completed verification may contain failed assertions without retrying the worker', async () => {
  const s = setup(); const id = s.task(); await s.engine.tick(); const run = s.started[0];
  run.emit({ kind: 'ACK', summary: 'Started' }); run.emit({ kind: 'TEST_RESULT', result: 'failed', summary: 'One assertion failed' });
  run.emit({ kind: 'COMPLETED', summary: 'Verification finished; inspect failing assertions' });
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'DONE'); assert.equal(s.started.length, 1);
  assert.equal(s.engine.state.tasks[id].evidence.find(e => e.kind === 'TEST_RESULT').result, 'failed');
  assert.equal(s.engine.state.alerts[`verification:${id}`].kind, 'VERIFICATION_FAILED');
  assert.equal(s.engine.state.tasks[id].verificationResult, 'failed');
});
