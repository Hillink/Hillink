// Pass 5F: agents Kyle creates in HQ. Creation is validated and bounded; provisioning advances only on real checks;
// only an ACTIVE agent takes work; disabling or retiring it releases its work; everything survives a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine, emptyState, reduce } from '../engine.mjs';
import { MemoryStore, FileStore } from '../store.mjs';
import { createHQ } from '../server.mjs';
import { validateAgentInput, TRANSITIONS, isWorking } from '../agents.mjs';

const tick = async (engine, n = 1) => { for (let i = 0; i < n; i++) { await engine.tick(); await engine.provisioningIdle(); } };
// A local-checks stand-in whose runs finish when the test says so (trials finish at once).
function localAdapter({ trial = 'pass', hold = true } = {}) {
  const runs = new Map(), cancelled = [];
  const adapter = {
    health: async () => ({ status: 'IDLE', detail: 'Local launcher available.' }),
    async start({ task, runId, emit }) {
      runs.set(runId, { task, emit });
      if (runId.startsWith('trial-')) {
        setImmediate(() => { emit({ kind: 'ACK', summary: 'trial worker up' }); if (trial === 'pass') { emit({ kind: 'FINDING', summary: 'Inspected 12 source paths.' }); emit({ kind: 'COMPLETED', summary: 'exit 0' }); } else emit({ kind: 'FAILED', summary: 'Local process exited 1: worker crashed' }); });
      } else if (!hold) setImmediate(() => { emit({ kind: 'ACK', summary: 'up' }); emit({ kind: 'COMPLETED', summary: 'done' }); });
    },
    cancel: async runId => { cancelled.push(runId); const r = runs.get(runId); return Boolean(r); },
    runs, cancelled,
  };
  return adapter;
}
function setup({ adapters = {}, ollama = null, config = {} } = {}) {
  let clock = 10_000;
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': localAdapter(), ...adapters }, now: () => clock, config: { heartbeatMs: 60_000, provisionRecheckMs: 1000, ...config } });
  engine.initialize();
  engine.provisioning = { ollama };
  return { engine, advance: ms => { clock += ms; } };
}
const scout = (x = {}) => ({ id: 'agent-5f-unknown-927', name: 'Scout 927', backend: 'local-checks', role: 'Repository inspector', capabilities: ['inspect-repo'], ...x });
const states = (engine, id) => engine.state.agents[id].lifecycle.history.map(h => h.state);

test('the HQ lifecycle table is the World registry\'s table (checked again in the World suite)', () => {
  assert.deepEqual(TRANSITIONS.READY, ['ACTIVE', 'ERROR', 'DISABLED', 'RETIRED']);
  assert.deepEqual(TRANSITIONS.RETIRED, []);
  assert.ok(!TRANSITIONS.REQUESTED.includes('READY') && !TRANSITIONS.WAITING.includes('READY'), 'READY only after a stage');
});

test('A, B, D: an unknown agent is created, provisioned stage by stage on real checks, READY, then ACTIVE only when Kyle activates it', async () => {
  const { engine } = setup();
  assert.throws(() => engine.createAgent(scout(), { by: 'hq-verifier' }), /Only Kyle/);
  const id = engine.createAgent(scout(), { by: 'kyle' });
  assert.equal(id, 'agent-5f-unknown-927');
  assert.equal(engine.state.agents[id].lifecycle.state, 'REQUESTED');
  assert.equal(engine.state.agents[id].executionAdapter, null, 'no execution binding before READY');
  await tick(engine, 6);
  assert.deepEqual(states(engine, id), ['REQUESTED', 'CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING', 'READY']);
  const a = engine.state.agents[id];
  assert.match(a.lifecycle.history[4].detail, /Bound inspect-repo -> inspect-repo \(LOCAL\)/);
  assert.match(a.lifecycle.detail, /Trial inspect-repo passed: Inspected 12 source paths/);
  assert.equal(a.executionAdapter, 'local-checks');
  assert.deepEqual(a.bindings.map(b => [b.capability, b.operation, b.computeClass]), [['inspect-repo', 'inspect-repo', 'LOCAL']]);
  // READY is not ACTIVE: no work, no observation, not a dispatch candidate.
  assert.equal(isWorking(a), false);
  assert.throws(() => engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id }), /not an active agent \(READY\)/);
  await tick(engine, 3);
  assert.equal(engine.state.agents[id].lifecycle.state, 'READY', 'nothing advances READY on its own');
  engine.activateAgent(id, { by: 'kyle' });
  assert.equal(engine.state.agents[id].lifecycle.state, 'ACTIVE');
  // F: real work through HQ's queue, only for this agent.
  const t = engine.createTask({ title: 'Inspect', description: 'Inventory', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await tick(engine);
  assert.equal(engine.state.tasks[t].agentId, id);
  assert.equal(engine.state.runs[engine.state.tasks[t].runId].compute.computeClass, 'LOCAL');
});

test('a generic task never goes to an agent that is still provisioning or READY', async () => {
  const { engine } = setup();
  const id = engine.createAgent(scout(), { by: 'kyle' });
  await tick(engine, 6); // READY
  const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50 });
  await tick(engine);
  assert.equal(engine.state.tasks[t].agentId, 'hq-verifier', 'the built-in verifier took it; the READY candidate did not');
  assert.equal(engine.state.agents[id].assignment, null);
});

test('14. creation refuses malformed, duplicate, unsupported, escalating and hostile definitions; nothing is journaled', () => {
  const { engine } = setup();
  const before = engine.state.seq;
  const bad = [
    [null, /JSON object/], [[], /JSON object/], ['x', /JSON object/],
    [scout({ id: 'claude' }), /already taken/], [scout({ id: 'kyle' }), /already taken/], [scout({ name: 'Claude' }), /already exists/],
    [scout({ id: 'Bad Id' }), /not allowed/], [scout({ name: '<img src=x onerror=alert(1)>' }), /not allowed/], [scout({ name: 'a\u0007b' }), /control characters/],
    [scout({ backend: 'openai-api' }), /Unsupported backend/], [scout({ backend: 'local-checks', provider: 'anthropic' }), /is provider local/],
    [scout({ capabilities: ['implement-repo'] }), /Claude's alone/], [scout({ capabilities: ['coordinate'] }), /orchestrat/], [scout({ capabilities: ['launch-missiles'] }), /Unsupported capability/], [scout({ capabilities: [] }), /At least one/],
    [scout({ tools: ['shell'] }), /Unsupported tool/], [scout({ permissions: ['write-repo'] }), /refused/], [scout({ permissions: ['deploy'] }), /refused/], [scout({ permissions: ['run-local-checks'] }), /not used by any/],
    [scout({ model: 'x; rm -rf /' }), /not allowed/], [scout({ secretKey: 'sk-live' }), /unknown field "secretKey"/], [JSON.parse('{"__proto__":{"admin":true},"name":"P","backend":"local-checks","role":"r","capabilities":["inspect-repo"]}'), /unknown field "__proto__"/],
    [scout({ appearance: { palette: { primary: 'url(javascript:alert(1))' } } }), /#rrggbb/], [scout({ appearance: { palette: { primary: 'expression(alert(1))' } } }), /#rrggbb/],
    [scout({ appearance: { script: 'alert(1)' } }), /unknown field "script"/], [scout({ appearance: { themes: { evil: {} } } }), /unknown field "evil"/], [scout({ appearance: { accessories: ['<svg onload=1>'] } }), /not supported/],
    [scout({ appearance: { body: { scale: 50 } } }), /from 0.6 to 1.4/], [scout({ appearance: { rig: 'dragon' } }), /rig is not supported/],
    [scout({ attribution: { tokens: ['.*'] } }), /not allowed/], [scout({ attribution: { pattern: '/claude/i' } }), /unknown field "pattern"/],
    [scout({ meta: { run: () => 1 } }), /only text/], [scout({ meta: { 'bad key!': 1 } }), /not allowed/], [scout({ meta: { a: { b: { c: { d: { e: 1 } } } } } }), /too deeply/],
    [scout({ reportsTo: 'nobody' }), /unknown agent/], [scout({ workstation: { kind: 'throne' } }), /workstation.kind/],
    [scout({ description: 'x'.repeat(9000) }), /too large/],
  ];
  for (const [input, error] of bad) assert.throws(() => engine.createAgent(input, { by: 'kyle' }), error, JSON.stringify(input)?.slice(0, 120));
  assert.equal(engine.state.seq, before, 'a refused definition journals nothing');
  const id = engine.createAgent(scout(), { by: 'kyle' });
  assert.throws(() => engine.createAgent(scout({ name: 'Other Name' }), { by: 'kyle' }), /already taken/, 'duplicate id');
  assert.throws(() => engine.createAgent(scout({ id: undefined }), { by: 'kyle' }), /already exists/, 'duplicate name');
  // A generated id when none is asked for; defaults are derived, never granted beyond need.
  const gen = engine.createAgent({ name: 'Second Scout', backend: 'local-checks', role: 'r', capabilities: ['verify-unit'] }, { by: 'kyle' });
  assert.match(gen, /^second-scout-[0-9a-f]{6}$/);
  assert.deepEqual([engine.state.agents[gen].tools, engine.state.agents[gen].permissions], [['node-test-runner'], ['run-local-checks']]);
  assert.ok(engine.state.agents[gen].definition.appearance.palette.primary.match(/^#[0-9a-f]{6}$/), 'a default look so it is distinguishable');
  assert.ok(engine.state.agents[id]);
  // Built-in agents have no lifecycle here.
  assert.throws(() => engine.activateAgent('claude', { by: 'kyle' }), /built-in/);
});

test('C, 15: a definition the backend cannot serve fails at CONFIGURING and never reaches READY or work', async () => {
  const { engine } = setup();
  const id = engine.createAgent(scout({ id: 'cfg-fail', name: 'Cfg', backend: 'claude-cli', model: 'claude-opus-custom', capabilities: ['review-repo'] }), { by: 'kyle' });
  await tick(engine, 5);
  assert.deepEqual(states(engine, id), ['REQUESTED', 'CONFIGURING', 'ERROR']);
  assert.match(engine.state.agents[id].lifecycle.detail, /CONFIGURING failed: .*cannot select model claude-opus-custom/);
  assert.throws(() => engine.activateAgent(id, { by: 'kyle' }), /cannot go from ERROR to ACTIVE/);
  assert.throws(() => engine.createTask({ title: 't', description: 'd', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id }), /not an active agent \(ERROR\)/);
});

test('15: missing sign-in or bridge is WAITING (never an API-key fallback); it resumes when authorization appears', async () => {
  let auth = false, started = 0;
  const cli = { health: async () => (auth ? { status: 'IDLE', detail: 'Claude Code 2.x: signed in with the subscription', auth: 'subscription' } : { status: 'OFFLINE', detail: 'AUTH_REQUIRED: Claude Code is not signed in.', auth: 'refused' }), start: async () => { started++; }, cancel: async () => true };
  const { engine, advance } = setup({ adapters: { 'cli-claude': cli } });
  const id = engine.createAgent({ id: 'reviewer-5f', name: 'Reviewer', backend: 'claude-cli', role: 'Read-only reviewer', capabilities: ['review-repo'] }, { by: 'kyle' });
  await tick(engine, 4);
  assert.deepEqual(states(engine, id), ['REQUESTED', 'CONFIGURING', 'CONNECTING_PROVIDER', 'WAITING']);
  assert.match(engine.state.agents[id].lifecycle.detail, /Waiting for authorization: AUTH_REQUIRED/);
  assert.match(engine.state.agents[id].lifecycle.ownerAction, /never falls back to an API key/);
  const seq = engine.state.seq;
  advance(2000); await tick(engine, 2);
  assert.equal(engine.state.agents[id].lifecycle.state, 'WAITING', 'still waiting');
  assert.ok(engine.state.events.slice(seq).every(e => e.type !== 'AGENT_LIFECYCLE'), 'an unchanged wait journals nothing');
  auth = true; advance(2000); await tick(engine, 5);
  assert.deepEqual(states(engine, id).slice(3), ['WAITING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING', 'READY']);
  assert.match(engine.state.agents[id].lifecycle.detail, /No model call was made/);
  assert.equal(started, 0, 'provisioning never ran a model call on the subscription');
  assert.equal(engine.state.agents[id].executionAdapter, 'cli-claude');
  // With the bridge off entirely, it waits for the bridge.
  const off = setup();
  const x = off.engine.createAgent({ id: 'reviewer-off', name: 'Reviewer Off', backend: 'codex-cli', role: 'r', capabilities: ['review-repo'] }, { by: 'kyle' });
  await tick(off.engine, 4);
  assert.equal(off.engine.state.agents[x].lifecycle.state, 'WAITING');
  assert.match(off.engine.state.agents[x].lifecycle.ownerAction, /HQ_AGENTS_ENABLED=1/);
});

test('15: Ollama: bridge off or daemon down is WAITING; a model that is not installed is never downloaded; installed model gets a LOCAL adapter and a real trial', async () => {
  let models = [], generated = 0;
  const request = async (url, opts) => {
    if (url.endsWith('/api/tags')) { if (models === null) throw Error('ECONNREFUSED'); return { ok: true, json: async () => ({ models }) }; }
    generated++;
    const body = JSON.parse(opts.body);
    const lines = [JSON.stringify({ model: body.model, response: 'Provisioning check ok.', done: false }), JSON.stringify({ model: body.model, response: '', done: true, done_reason: 'stop', eval_count: 5 })];
    return { ok: true, body: (async function* () { yield new TextEncoder().encode(lines.join('\n') + '\n'); })() };
  };
  const { engine, advance } = setup({ ollama: { enabled: true, request } });
  models = null;
  const id = engine.createAgent({ id: 'summarizer-5f', name: 'Summarizer', backend: 'ollama', model: 'llama3.2:1b', role: 'Local summaries', capabilities: ['summarize'] }, { by: 'kyle' });
  await tick(engine, 4);
  assert.equal(engine.state.agents[id].lifecycle.state, 'WAITING');
  assert.match(engine.state.agents[id].lifecycle.detail, /not reachable/);
  models = [{ name: 'gemma3:4b', details: { family: 'gemma3' }, size: 1 }];
  advance(2000); await tick(engine, 2);
  assert.match(engine.state.agents[id].lifecycle.detail, /not installed/, 'the wait now names the missing model');
  assert.equal(engine.state.agents[id].lifecycle.state, 'WAITING');
  models = [{ name: 'llama3.2:1b', details: { family: 'llama' }, size: 1 }];
  advance(2000); await tick(engine, 6);
  assert.equal(engine.state.agents[id].lifecycle.state, 'READY');
  assert.equal(engine.state.agents[id].executionAdapter, 'ollama-model-llama3-2-1b');
  assert.ok(generated >= 1, 'TESTING made a real (local) generation');
  assert.equal((await import('../compute/registry.mjs')).routeFor('ollama-model-llama3-2-1b', 'summarize-local').computeClass, 'LOCAL');
  // An Ollama cloud model is refused at CONFIGURING.
  const c = engine.createAgent({ id: 'cloudy', name: 'Cloudy', backend: 'ollama', model: 'gpt-oss:120b-cloud', role: 'r', capabilities: ['summarize'] }, { by: 'kyle' });
  await tick(engine, 3);
  assert.equal(engine.state.agents[c].lifecycle.state, 'ERROR');
  assert.match(engine.state.agents[c].lifecycle.detail, /cloud model/);
});

test('15: tools the backend does not provide, or permissions not granted, fail at CONNECTING_TOOLS; a failed trial fails TESTING; retry recovers', async () => {
  const { engine } = setup();
  const t1 = engine.createAgent(scout({ id: 'tools-fail', name: 'Tools Fail', tools: ['file-inventory', 'repo-read'] }), { by: 'kyle' });
  const t2 = engine.createAgent(scout({ id: 'perm-fail', name: 'Perm Fail', permissions: [] }), { by: 'kyle' });
  await tick(engine, 5);
  assert.deepEqual(states(engine, t1).slice(-2), ['CONNECTING_TOOLS', 'ERROR']);
  assert.match(engine.state.agents[t1].lifecycle.detail, /Tool repo-read is not available on Local Node\.js/);
  assert.deepEqual(states(engine, t2).slice(-2), ['CONNECTING_TOOLS', 'ERROR']);
  assert.match(engine.state.agents[t2].lifecycle.detail, /needs permission read-repo, which was not granted/);
  // TESTING: a real trial that fails.
  const failing = setup({ adapters: { 'local-checks': localAdapter({ trial: 'fail' }) } });
  const t3 = failing.engine.createAgent(scout({ id: 'trial-fail', name: 'Trial Fail' }), { by: 'kyle' });
  await tick(failing.engine, 6);
  assert.deepEqual(states(failing.engine, t3).slice(-2), ['TESTING', 'ERROR']);
  assert.match(failing.engine.state.agents[t3].lifecycle.detail, /TESTING failed: Trial inspect-repo failed: Local process exited 1/);
  assert.equal(failing.engine.state.agents[t3].executionAdapter, null);
  assert.throws(() => failing.engine.activateAgent(t3, { by: 'kyle' }), /ERROR to ACTIVE/);
  // Retry after the environment is fixed: provisioning runs again from the start, with fresh checks.
  failing.engine.adapters['local-checks'] = localAdapter();
  failing.engine.retryAgent(t3, { by: 'kyle' });
  await tick(failing.engine, 6);
  assert.equal(failing.engine.state.agents[t3].lifecycle.state, 'READY');
  assert.equal(failing.engine.state.agents[t3].lifecycle.attempts, 2);
  assert.throws(() => failing.engine.retryAgent(t3, { by: 'kyle' }), /only a failed or disabled agent/);
});

test('H: disabling a working agent stops its run, requeues the task for someone else and releases everything; re-enable and retire follow the rules', async () => {
  const { engine } = setup();
  const id = engine.createAgent(scout(), { by: 'kyle' });
  await tick(engine, 6); engine.activateAgent(id, { by: 'kyle' });
  const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await tick(engine);
  const runId = engine.state.tasks[t].runId;
  engine.adapters['local-checks'].runs.get(runId).emit({ kind: 'ACK', summary: 'up' });
  const r = await engine.disableAgent(id, { by: 'kyle' });
  assert.deepEqual(r, { state: 'DISABLED', requeued: t, parked: null });
  const a = engine.state.agents[id], task = engine.state.tasks[t];
  assert.deepEqual(engine.adapters['local-checks'].cancelled, [runId]);
  assert.equal(a.assignment, null); assert.equal(a.lifecycle.state, 'DISABLED');
  assert.equal(task.stage, 'READY'); assert.equal(task.agentId, null); assert.equal(task.preferredAgentId, null, 'no stale ownership');
  assert.ok(engine.state.runs[runId].endedAt && engine.state.runs[runId].terminal === 'CANCELLED');
  assert.ok(task.evidence.some(e => e.kind === 'CANCELLED' && e.requeue === true));
  await tick(engine);
  assert.equal(engine.state.tasks[t].agentId, 'hq-verifier', 'another capable active agent took the requeued task');
  assert.throws(() => engine.createTask({ title: 't', description: 'd', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id }), /DISABLED/);
  // Re-enable (it was READY before), then retire; a retired agent never returns.
  engine.activateAgent(id, { by: 'kyle' });
  assert.equal(engine.state.agents[id].lifecycle.state, 'ACTIVE');
  await engine.retireAgent(id, { by: 'kyle' });
  assert.equal(engine.state.agents[id].lifecycle.state, 'RETIRED');
  assert.throws(() => engine.activateAgent(id, { by: 'kyle' }), /RETIRED to ACTIVE/);
  assert.throws(() => engine.retryAgent(id, { by: 'kyle' }), /only a failed or disabled/);
  // An agent disabled before it was ever READY cannot be switched straight back on.
  const y = engine.createAgent(scout({ id: 'never-ready', name: 'Never Ready' }), { by: 'kyle' });
  await tick(engine, 1);
  await engine.disableAgent(y, { by: 'kyle' });
  assert.throws(() => engine.activateAgent(y, { by: 'kyle' }), /never READY/);
  engine.retryAgent(y, { by: 'kyle' });
  assert.equal(engine.state.agents[y].lifecycle.state, 'REQUESTED');
});

test('H: a run whose stop is not confirmed is parked, never requeued (no double execution)', async () => {
  const { engine } = setup({ adapters: { 'local-checks': Object.assign(localAdapter(), { cancel: async () => false }) } });
  const id = engine.createAgent(scout(), { by: 'kyle' });
  await tick(engine, 6); engine.activateAgent(id, { by: 'kyle' });
  const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await tick(engine);
  const r = await engine.disableAgent(id, { by: 'kyle' });
  assert.deepEqual(r, { state: 'DISABLED', requeued: null, parked: t });
  assert.equal(engine.state.tasks[t].stage, 'BLOCKED');
  assert.match(engine.state.tasks[t].ownerAction, /Confirm the previous worker has stopped/);
});

test('B1: the adapter\'s own terminal CANCELLED is tagged as the leave requeue; unconfirmed stops, completed work and other cancellations are not', async () => {
  // Like the real adapters: a confirmed stop emits the adapter's own CANCELLED (on process close) before cancel() resolves.
  const realistic = (mode = 'close') => { const a = localAdapter(); a.cancel = async runId => { a.cancelled.push(runId); const r = a.runs.get(runId); if (mode === 'false') return false; if (mode === 'throw') throw Error('kill failed'); if (mode === 'complete') { r.emit({ kind: 'COMPLETED', summary: 'exit 0 just before the stop' }); return true; } r.emit({ kind: 'CANCELLED', summary: 'Worker termination confirmed by process close.' }); return true; }; return a; };
  const run = async (mode, leave = 'disableAgent') => {
    const { engine } = setup({ adapters: { 'local-checks': realistic(mode) } });
    const id = engine.createAgent(scout(), { by: 'kyle' });
    await tick(engine, 6); engine.activateAgent(id, { by: 'kyle' });
    const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
    await tick(engine);
    const runId = engine.state.tasks[t].runId;
    engine.adapters['local-checks'].runs.get(runId).emit({ kind: 'ACK', summary: 'up' });
    const r = await engine[leave](id, { by: 'kyle' });
    return { engine, id, t, runId, r, task: engine.state.tasks[t], evidence: engine.state.tasks[t].evidence.filter(e => ['CANCELLED', 'COMPLETED'].includes(e.kind)) };
  };
  for (const leave of ['disableAgent', 'retireAgent']) {
    const { r, t, task, evidence, engine } = await run('close', leave);
    assert.equal(r.requeued, t); assert.equal(task.stage, 'READY');
    assert.deepEqual(evidence.map(e => [e.summary, e.requeue]), [['Worker termination confirmed by process close.', true]], 'one CANCELLED: the adapter\'s own, tagged');
    assert.equal(engine.leaving.size, 0, 'the tag is released once the stop is settled');
  }
  for (const mode of ['false', 'throw']) {
    const { r, t, task, evidence, engine } = await run(mode);
    assert.deepEqual(r, { state: 'DISABLED', requeued: null, parked: t }, `${mode}: unconfirmed stop is parked`);
    assert.equal(task.stage, 'BLOCKED'); assert.deepEqual(evidence, [], 'no CANCELLED, no requeue tag');
    assert.ok(!engine.state.events.some(e => e.type === 'TASK_REQUEUED'));
    assert.equal(engine.leaving.size, 0);
  }
  { // The run completes in the race with the stop: the task stays DONE and is never requeued.
    const { r, task, evidence, engine } = await run('complete');
    assert.deepEqual(r, { state: 'DISABLED', requeued: null, parked: null });
    assert.equal(task.stage, 'DONE'); assert.deepEqual(evidence.map(e => e.kind), ['COMPLETED']);
    assert.ok(!engine.state.events.some(e => e.type === 'TASK_REQUEUED'));
  }
  { // A cancellation that is not an agent leaving (Kyle cancels the task) is never tagged as a requeue.
    const { engine } = setup({ adapters: { 'local-checks': realistic('close') } });
    const id = engine.createAgent(scout(), { by: 'kyle' });
    await tick(engine, 6); engine.activateAgent(id, { by: 'kyle' });
    const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
    await tick(engine);
    engine.adapters['local-checks'].runs.get(engine.state.tasks[t].runId).emit({ kind: 'ACK', summary: 'up' });
    await engine.cancelTask(t, { by: 'kyle' });
    assert.equal(engine.state.tasks[t].stage, 'CANCELLED');
    assert.ok(engine.state.tasks[t].evidence.filter(e => e.kind === 'CANCELLED').every(e => !e.requeue));
  }
});

test('J: two HQ-created agents on different backends coexist, both ACTIVE, each getting its own kind of work; a shared adapter never runs two at once', async () => {
  const request = async (url, opts) => url.endsWith('/api/tags') ? { ok: true, json: async () => ({ models: [{ name: 'qwen3:4b', details: { family: 'qwen3' }, size: 1 }] }) } : { ok: true, body: (async function* () { const m = JSON.parse(opts.body).model; yield new TextEncoder().encode(`${JSON.stringify({ model: m, response: 'ok', done: false })}\n${JSON.stringify({ model: m, response: '', done: true })}\n`); })() };
  const { engine } = setup({ ollama: { enabled: true, request } });
  const a = engine.createAgent(scout({ appearance: { palette: { primary: '#e76f51' }, accessories: ['hardhat'], themes: { fantasy: { archetype: 'dwarf', accessories: ['helmet', 'beard'] } } } }), { by: 'kyle' });
  const b = engine.createAgent({ id: 'agent-5f-scribe-414', name: 'Scribe 414', backend: 'ollama', model: 'qwen3:4b', role: 'Local summarizer', team: 'Research', capabilities: ['summarize'], appearance: { palette: { primary: '#3a86ff' }, accessories: ['glasses'] } }, { by: 'kyle' });
  await tick(engine, 7);
  for (const x of [a, b]) { assert.equal(engine.state.agents[x].lifecycle.state, 'READY'); engine.activateAgent(x, { by: 'kyle' }); }
  const t1 = engine.createTask({ title: 'Inventory', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: a });
  const t2 = engine.createTask({ title: 'Summarize', description: 'Summarize this.', operation: 'summarize-local', safety: 'local-read-only', priority: 40, preferredAgentId: b });
  await tick(engine);
  assert.equal(engine.state.tasks[t1].agentId, a);
  assert.equal(engine.state.runs[engine.state.tasks[t1].runId].compute.adapterId, 'local-checks');
  engine.adapters['local-checks'].runs.get(engine.state.tasks[t1].runId).emit({ kind: 'ACK', summary: 'up' });
  engine.adapters['local-checks'].runs.get(engine.state.tasks[t1].runId).emit({ kind: 'COMPLETED', summary: 'done' });
  await tick(engine); await new Promise(r => setTimeout(r, 20));
  assert.equal(engine.state.tasks[t2].agentId, b);
  assert.equal(engine.state.runs[engine.state.tasks[t2].runId].compute.adapterId, 'ollama-model-qwen3-4b');
  assert.notEqual(engine.state.agents[a].definition.appearance.palette.primary, engine.state.agents[b].definition.appearance.palette.primary);
  // Shared adapter: a second reviewer on the same CLI waits while the first is busy.
  const cli = { health: async () => ({ status: 'IDLE', detail: 'signed in', auth: 'subscription' }), start: async () => {}, cancel: async () => true, supports: () => true };
  const s = setup({ adapters: { 'cli-claude': cli } });
  s.engine.configureAgent('claude', { capabilities: ['review', 'review-repo'], executionAdapter: 'cli-claude' });
  const r = s.engine.createAgent({ id: 'second-reviewer', name: 'Second Reviewer', backend: 'claude-cli', role: 'r', capabilities: ['review-repo'] }, { by: 'kyle' });
  await tick(s.engine, 6); s.engine.activateAgent(r, { by: 'kyle' });
  const q1 = s.engine.createTask({ title: 'r1', description: 'd', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: 'claude' });
  const q2 = s.engine.createTask({ title: 'r2', description: 'd', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: r });
  await tick(s.engine, 2);
  assert.equal(s.engine.state.tasks[q1].stage, 'CLAIMED');
  assert.equal(s.engine.state.tasks[q2].stage, 'READY', 'the same CLI adapter is busy; the second waits');
});

test('I: the agent, its definition, lifecycle and work survive an HQ restart and replay (file journal)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq5f-'));
  const adapters = () => ({ 'local-checks': localAdapter({ hold: false }) });
  let clock = 10_000;
  const open = () => { const e = new Engine({ store: new FileStore(dir), adapters: adapters(), now: () => clock++, config: { heartbeatMs: 60_000 } }); e.initialize(); return e; };
  let engine = open();
  const id = engine.createAgent(scout({ appearance: { palette: { primary: '#e76f51' } } }), { by: 'kyle' });
  await tick(engine, 6); engine.activateAgent(id, { by: 'kyle' });
  const t = engine.createTask({ title: 'Inspect', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await tick(engine); await new Promise(r => setTimeout(r, 20));
  assert.equal(engine.state.tasks[t].stage, 'DONE');
  const before = JSON.parse(JSON.stringify(engine.state.agents[id]));
  engine.store.close();
  engine = open(); // restart: no source edit, no default list; the journal is the only input
  const after = engine.state.agents[id];
  for (const k of ['id', 'name', 'provider', 'model', 'role', 'capabilities', 'tools', 'permissions', 'definition', 'lifecycle', 'executionAdapter']) assert.deepEqual(after[k], before[k], k);
  assert.equal(after.lifecycle.state, 'ACTIVE');
  const t2 = engine.createTask({ title: 'Again', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
  await tick(engine); await new Promise(r => setTimeout(r, 20));
  assert.equal(engine.state.tasks[t2].stage, 'DONE');
  // Replay from the journal alone gives the same lifecycle.
  const replayed = engine.store.read().reduce(reduce, emptyState());
  assert.deepEqual(replayed.agents[id].lifecycle, engine.state.agents[id].lifecycle);
  engine.store.close();
});

test('A, E, I over HTTP: owner-only API creates an unknown agent, a real local trial provisions it, and it works and persists across an HQ restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq5f-http-'));
  let hq = await createHQ({ port: 0, directory: dir, intervalMs: 20 });
  const call = async (origin, p, body) => {
    const headers = { 'X-HQ-Client': 'command-center' };
    headers.Authorization = `Bearer ${(await fetch(`${origin}/api/session`, { headers }).then(r => r.json())).token}`;
    const r = await fetch(`${origin}${p}`, body === undefined ? { headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const waitFor = async (pred, ms = 15_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise(r => setTimeout(r, 25)); } return false; };
  try {
    const noToken = await fetch(`${hq.origin}/api/agents`, { method: 'POST', headers: { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(noToken.status, 401, 'creation is a privileged owner operation');
    const catalog = await call(hq.origin, '/api/agents/catalog');
    assert.deepEqual(Object.keys(catalog.body.backends), ['local-checks', 'ollama', 'claude-cli', 'codex-cli']);
    assert.equal((await call(hq.origin, '/api/agents', { name: 'X', backend: 'local-checks', role: 'r', capabilities: ['inspect-repo'], permissions: ['admin'] })).status, 400);
    const created = await call(hq.origin, '/api/agents', scout());
    assert.equal(created.status, 201); const id = created.body.id;
    assert.ok(await waitFor(() => hq.engine.state.agents[id].lifecycle.state === 'READY'), `stuck at ${hq.engine.state.agents[id].lifecycle.state}: ${hq.engine.state.agents[id].lifecycle.detail}`);
    assert.match(hq.engine.state.agents[id].lifecycle.detail, /Trial inspect-repo passed: Inspected \d+ repository source paths/, 'a real process ran the trial');
    assert.equal((await call(hq.origin, '/api/agents/activate', { id })).status, 200);
    const task = await call(hq.origin, '/api/tasks', { title: 'Inventory', description: 'Count source files', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
    assert.equal(task.status, 201);
    assert.ok(await waitFor(() => hq.engine.state.tasks[task.body.id].stage === 'DONE'));
    assert.equal(hq.engine.state.tasks[task.body.id].agentId, id);
    const state = await call(hq.origin, '/api/state');
    assert.equal(state.body.agents.find(a => a.id === id).lifecycle.state, 'ACTIVE');
    await hq.close();
    hq = await createHQ({ port: 0, directory: dir, intervalMs: 20 });
    assert.equal(hq.engine.state.agents[id].lifecycle.state, 'ACTIVE', 'restart keeps it active');
    const again = await call(hq.origin, '/api/tasks', { title: 'Again', description: 'x', operation: 'inspect-repo', safety: 'local-read-only', priority: 50, preferredAgentId: id });
    assert.ok(await waitFor(() => hq.engine.state.tasks[again.body.id].stage === 'DONE'));
    const off = await call(hq.origin, '/api/agents/disable', { id });
    assert.equal(off.status, 200); assert.equal(off.body.state, 'DISABLED');
  } finally { await hq.close(); }
});
