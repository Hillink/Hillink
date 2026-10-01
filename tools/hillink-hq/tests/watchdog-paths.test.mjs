// Watchdog durability across every worker path (objectives 96ab7690 and cdecc7d0: healthy Claude runs killed as
// STALLED). The model under test (engine.mjs quietState): heartbeats prove a process is alive, progress evidence
// proves it is working, and legitimately quiet states are DECLARED by HQ code from the worker's own protocol (a tool
// call, the wait for the model's first token, a compaction, an HQ-owned sandbox step, a test run), each with a hard
// bound. Real engine at production thresholds, real adapters, fake processes and a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CliAgentAdapter, cliAgents, QUIET_BOUNDS, COMPACTION_MAX_MS } from '../cli-agent-adapter.mjs';
import { LocalAdapter } from '../local-adapter.mjs';
import { whileRunning, PHASE_MARGIN_MS } from '../inflight.mjs';
import { CLAUDE_TOOL_NAMES, BROKER_SERVER } from '../broker/policy.mjs';
import { brokerArgs } from '../subscription-implementer.mjs';
import { Engine, defaults, PHASE_LIMITS, quietState } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { subscriptionProbe } from './compute-helpers.mjs';

function fakeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { end() {} });
  child.signals = [];
  child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close', null, signal)); return true; };
  child.lines = (...objects) => child.stdout.emit('data', Buffer.from(objects.map(o => JSON.stringify(o)).join('\n') + '\n'));
  return child;
}
// Claude Code stream-json records (--verbose --include-partial-messages), as Claude Code 2.x prints them.
const msgStart = { type: 'stream_event', event: { type: 'message_start', message: { id: 'm' } } };
const delta = (n, kind = 'text') => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: kind === 'text' ? { type: 'text_delta', text: 'x'.repeat(n) } : { type: 'input_json_delta', partial_json: '{'.repeat(n) } } });
const toolUse = (id, name) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: {} }] } });
const toolResult = id => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const compacting = { type: 'system', subtype: 'status', status: 'compacting' };
const compacted = { type: 'system', subtype: 'status', status: null, compact_result: 'success' };
const answer = text => [{ type: 'assistant', message: { content: [{ type: 'text', text }] } }, { type: 'result', subtype: 'success', is_error: false, result: text, usage: {}, num_turns: 4 }];

// HQ with Claude (and Codex) connected through the real CLI adapters, as server.mjs wires them for review-repo, which
// is what the conductor's investigate and review steps dispatch.
function hq() {
  const clock = { t: 9_000_000 };
  const spawned = [];
  const spawn = (command, args) => { const c = fakeChild(); spawned.push({ command, args, c }); if (!subscriptionProbe(args, c) && args[0] === '--version') queueMicrotask(() => c.emit('close', 0, null)); return c; };
  const engine = new Engine({ store: new MemoryStore(), adapters: {}, now: () => clock.t });
  engine.initialize();
  const claude = engine.adapters['cli-claude'] = new CliAgentAdapter(cliAgents.claude, { spawn, platform: 'linux', graceMs: 10, now: () => clock.t });
  const codex = engine.adapters['cli-codex'] = new CliAgentAdapter(cliAgents.codex, { spawn, platform: 'linux', graceMs: 10, now: () => clock.t });
  engine.configureAgent('claude', { capabilities: ['review-repo'], executionAdapter: 'cli-claude', telemetryAdapter: 'cli-json-stream', usageSource: 'cli-claude-stream', ackTimeoutMs: 90_000 });
  engine.configureAgent('codex', { capabilities: ['review-repo'], executionAdapter: 'cli-codex', telemetryAdapter: 'cli-json-stream', usageSource: 'cli-codex-stream', ackTimeoutMs: 90_000 });
  const adapters = { claude, codex };
  const start = async (agentId, title) => {
    await engine.tick(); // health first: subscription sign-in verified
    const id = engine.createTask({ title, description: 'Read the repository and answer.', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: agentId });
    await engine.tick();
    const child = spawned.filter(s => (agentId === 'claude' ? s.args[0] === '-p' : s.args[0] === 'exec')).at(-1).c;
    const runId = engine.state.tasks[id].runId;
    const adapter = adapters[agentId];
    if (agentId === 'claude') child.lines({ type: 'system', subtype: 'init', apiKeySource: 'none', tools: ['Glob', 'Grep', 'Read'] });
    else child.lines({ type: 'thread.started', thread_id: 't' }, { type: 'turn.started' });
    // One tick of the adapter's 5 s liveness pulse (the process exists), journaled at the engine clock.
    const pulse = () => adapter.pulse(adapter.runs.get(runId));
    const status = () => engine.status(engine.state.agents[agentId]);
    const task = () => engine.state.tasks[id];
    // Advance the clock in 5 s pulses, asserting a status at every step and letting the watchdog run.
    const quiet = async (ms, expect = 'RUNNING') => { for (let e = 0; e < ms; e += 5_000) { clock.t += 5_000; pulse(); assert.equal(status(), expect, `${title}: ${expect} at ${(e + 5_000) / 1000} s quiet`); await engine.tick(); } };
    return { id, runId, child, adapter, pulse, status, task, quiet };
  };
  return { clock, engine, start };
}

test('the model: every quiet phase HQ code can declare is bounded, and the stall window is the production one', () => {
  assert.equal(defaults.progressMs, 120_000); assert.equal(defaults.heartbeatMs, 15_000);
  for (const [name, ms] of Object.entries(QUIET_BOUNDS)) assert.ok(ms > defaults.progressMs && ms <= PHASE_LIMITS.maxBoundMs, `${name} bound ${ms}`);
  assert.equal(QUIET_BOUNDS.compactionMs, COMPACTION_MAX_MS);
  assert.ok(330_000 + PHASE_MARGIN_MS <= PHASE_LIMITS.maxBoundMs, 'the longest HQ step fits the engine cap');
});

// ------------------------------------------------------------------ quiet but healthy, every worker path
test('quiet investigation > 120 s: Claude waiting 150 s on a slow Grep stays RUNNING, then completes with no quarantine', async () => {
  const h = hq(); const r = await h.start('claude', 'Investigate: where is the stall rule?');
  r.child.lines(msgStart, delta(300, 'json'), toolUse('toolu_01Grep', 'Grep'));
  assert.deepEqual(quietState(h.engine.state.runs[r.runId], h.clock.t).open.map(p => p.id), ['tool:toolu_01Grep']);
  await r.quiet(150_000);
  r.child.lines(toolResult('toolu_01Grep'), msgStart, delta(400), ...answer('engine.mjs:108 holds the stall rule.'));
  r.child.emit('close', 0, null);
  assert.equal(r.task().stage, 'DONE');
  assert.equal(h.engine.state.runs[r.runId].terminal, 'COMPLETED');
  assert.deepEqual(h.engine.state.runs[r.runId].phases, {}, 'phases cleared at the end');
  await h.engine.tick();
  assert.equal(h.engine.state.agents.claude.quarantineUntil ?? 0, 0);
  assert.equal(h.engine.status(h.engine.state.agents.claude), 'IDLE');
});

test('quiet review > 120 s: Claude\'s model taking 150 s for its first token after a tool result stays RUNNING, then completes', async () => {
  const h = hq(); const r = await h.start('claude', 'Review the committed change');
  r.child.lines(msgStart, toolUse('toolu_02Read', 'Read'), toolResult('toolu_02Read'));
  assert.deepEqual(quietState(h.engine.state.runs[r.runId], h.clock.t).open.map(p => p.id), ['model'], 'waiting on the model');
  await r.quiet(150_000);
  r.child.lines(msgStart, delta(500), ...answer('Approve: no regressions.'));
  r.child.emit('close', 0, null);
  assert.equal(r.task().stage, 'DONE');
});

test('quiet review > 120 s on Codex: a 150 s read-only command stays RUNNING, then completes', async () => {
  const h = hq(); const r = await h.start('codex', 'Codex review');
  r.child.lines({ type: 'item.started', item: { id: 'item_3', type: 'command_execution' } });
  await r.quiet(150_000);
  r.child.lines({ type: 'item.completed', item: { id: 'item_3', type: 'command_execution' } }, { type: 'item.completed', item: { id: 'item_4', type: 'agent_message', text: 'Looks fine.' } }, { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
  r.child.emit('close', 0, null);
  assert.equal(r.task().stage, 'DONE');
});

test('context compaction > 120 s in an investigation: 4 minutes of compaction stays RUNNING, then the answer arrives', async () => {
  const h = hq(); const r = await h.start('claude', 'Investigate a large area');
  r.child.lines(msgStart, delta(100), compacting);
  await r.quiet(240_000);
  r.child.lines(compacted, msgStart, delta(200), ...answer('Done after compaction.'));
  assert.ok(r.task().evidence.some(e => /finished compacting its context \(240 s\)/.test(e.summary)));
  r.child.emit('close', 0, null);
  assert.equal(r.task().stage, 'DONE');
});

test('quiet implementation > 120 s: broker run_tests for 5.5 min and HQ\'s own acceptance tests for 5 min stay RUNNING', async () => {
  // The implement-repo shape: HQ's runner holds the run (its own ACK and pulse); Claude's adapter and HQ's bounded
  // steps feed it, exactly as ClaudeImplementer/SubscriptionImplementer wire them.
  const clock = { t: 7_000_000 }; const runs = [];
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async run => { runs.push(run); }, cancel: async () => true } }, now: () => clock.t });
  engine.initialize();
  const id = engine.createTask({ title: 'Implementation', description: 'x', operation: 'verify-hq', safety: 'local-read-only', priority: 50 });
  await engine.tick(); const run = runs.at(-1);
  run.emit({ kind: 'ACK', summary: 'HQ implementation runner started.' });
  const status = () => engine.status(engine.state.agents['hq-verifier']);
  const runnerPulse = () => run.emit({ kind: 'HEARTBEAT', summary: 'HQ implementation runner alive.' });
  const spawned = [];
  const claude = new CliAgentAdapter(cliAgents.claude, { spawn: () => { const c = fakeChild(5151); spawned.push(c); return c; }, platform: 'linux', graceMs: 10, operation: 'implement-repo', safety: 'local-worktree-write', now: () => clock.t });
  claude.spec = { ...cliAgents.claude, args: () => brokerArgs('/tmp/hq-broker/mcp.json'), expectTools: CLAUDE_TOOL_NAMES, expectServer: BROKER_SERVER };
  claude.healthCache = { at: Date.now(), result: { status: 'IDLE', auth: 'subscription' } };
  let claudeEnd = null;
  await claude.start({ task: { operation: 'implement-repo', safety: 'local-worktree-write', description: 'Build it.' }, runId: 'c', emit: e => { if (['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(e.kind)) claudeEnd = e; else if (e.kind === 'ACK') run.emit({ kind: 'MODEL_OUTPUT', summary: e.summary }); else if (e.kind !== 'HEARTBEAT') run.emit(e); } });
  const child = spawned.at(-1);
  child.lines({ type: 'system', subtype: 'init', apiKeySource: 'none', tools: [...CLAUDE_TOOL_NAMES], mcp_servers: [{ name: BROKER_SERVER, status: 'connected' }] });
  child.lines(msgStart, delta(200, 'json'), toolUse('toolu_09Tests', 'mcp__hq__run_tests'));
  let finishTests; const brokerTests = whileRunning(e => run.emit(e), 'Sandbox test run (run_tests)', new Promise(r => { finishTests = r; }), { boundMs: 330_000 });
  for (let e = 0; e < 330_000; e += 5_000) { clock.t += 5_000; runnerPulse(); assert.equal(status(), 'RUNNING', `run_tests at ${(e + 5_000) / 1000} s`); await engine.tick(); }
  finishTests({ stdout: '' }); await brokerTests;
  child.lines(toolResult('toolu_09Tests'), msgStart, delta(100), ...answer('Implemented.'));
  child.emit('close', 0, null);
  assert.equal(claudeEnd?.kind, 'COMPLETED');
  let finishAcceptance; const acceptance = whileRunning(e => run.emit(e), 'HQ acceptance tests in the sandbox', new Promise(r => { finishAcceptance = r; }), { boundMs: 330_000 });
  for (let e = 0; e < 300_000; e += 5_000) { clock.t += 5_000; runnerPulse(); assert.equal(status(), 'RUNNING', `acceptance tests at ${(e + 5_000) / 1000} s`); await engine.tick(); }
  finishAcceptance({ stdout: '' }); await acceptance;
  run.emit({ kind: 'TEST_RESULT', result: 'passed', summary: '3 passed; 0 failed.' }); run.emit({ kind: 'COMMIT', summary: 'Committed.', sha: 'a'.repeat(40) });
  let finishTeardown; const teardown = whileRunning(e => run.emit(e), 'Sandbox teardown', new Promise(r => { finishTeardown = r; }), { boundMs: 180_000 });
  for (let e = 0; e < 170_000; e += 5_000) { clock.t += 5_000; runnerPulse(); assert.equal(status(), 'RUNNING'); await engine.tick(); }
  finishTeardown(true); await teardown;
  run.emit({ kind: 'COMPLETED', summary: 'Implementation committed.' });
  assert.equal(engine.state.tasks[id].stage, 'DONE');
  assert.equal(engine.state.agents['hq-verifier'].quarantineUntil ?? 0, 0);
});

test('long HQ-owned verification: the local verifier running one 4-minute test stays RUNNING on process liveness, then completes', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const clock = { t: 3_000_000 }; const children = [];
  const local = new LocalAdapter({ spawnWorker: () => { const c = fakeChild(6161); c.send = () => {}; children.push(c); return c; } });
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': local }, now: () => clock.t });
  engine.initialize();
  const id = engine.createTask({ title: 'Verify HQ', description: 'x', operation: 'verify-hq', safety: 'local-read-only', priority: 50 });
  await engine.tick();
  const child = children.at(-1), status = () => engine.status(engine.state.agents['hq-verifier']);
  child.emit('message', { kind: 'ACK', summary: 'Worker acknowledged verify-hq.' });
  child.emit('message', { kind: 'TEST_STARTED', summary: 'Running 2 test files.', phases: [{ id: 'tests', state: 'begin', reason: 'Node test run', boundMs: 10 * 60_000 }] });
  // The worker's own event loop is busy inside one long test: it sends nothing. The adapter's pulse is the liveness.
  for (let e = 0; e < 240_000; e += 5_000) { clock.t += 5_000; t.mock.timers.tick(5_000); assert.equal(status(), 'RUNNING', `verifier at ${(e + 5_000) / 1000} s`); await engine.tick(); }
  child.emit('message', { kind: 'TEST_RESULT', result: 'passed', summary: '40 passed; 0 failed.', phases: [{ id: 'tests', state: 'end' }] });
  child.emit('close', 0, null);
  assert.equal(engine.state.tasks[id].stage, 'DONE');
});

// ------------------------------------------------------------------ genuine failures are still caught
test('genuine silent hung worker: a live Claude with no declared phase is STALLED at 120 s, terminated, parked and quarantined', async () => {
  const h = hq(); const r = await h.start('claude', 'Investigation that hangs');
  r.child.lines(msgStart, delta(50)); // answering, then nothing at all: not a tool, not a compaction, not a model wait
  await r.quiet(115_000);
  h.clock.t += 10_000; r.pulse();
  assert.equal(r.status(), 'STALLED', 'heartbeats from a live but silent process are not progress');
  await h.engine.tick();
  assert.deepEqual(r.child.signals, ['SIGTERM'], 'the process was terminated');
  assert.equal(h.engine.state.runs[r.runId].terminal, 'CANCELLED');
  assert.equal(r.task().stage, 'BLOCKED');
  const recovery = h.engine.state.events.filter(e => e.type === 'RECOVERY' && e.data.taskId === r.id).at(0);
  assert.match(recovery.data.reason, /^STALLED: no progress evidence for 12\d s and no declared quiet phase/);
  assert.ok(h.engine.state.agents.claude.quarantineUntil > h.clock.t, 'quarantined');
  assert.equal(r.adapter.runs.size, 0, 'no process left tracked');
});

test('genuine hang inside a quiet phase: a tool that never returns is STALLED at its bound, not before, and the reason names it', async () => {
  const h = hq(); const r = await h.start('claude', 'Investigation with a wedged tool');
  r.child.lines(msgStart, toolUse('toolu_05Glob', 'Glob'));
  await r.quiet(QUIET_BOUNDS.toolMs);
  h.clock.t += 5_000; r.pulse();
  assert.equal(r.status(), 'STALLED');
  await h.engine.tick();
  assert.equal(h.engine.state.runs[r.runId].terminal, 'CANCELLED');
  assert.match(h.engine.state.events.filter(e => e.type === 'RECOVERY').at(0).data.reason, /Claude Code running the Glob tool ran 30\d s, past its 300 s bound/);
});

test('genuine hang: a model that never sends its first token, and a compaction that never ends, are STALLED at their bounds', async () => {
  const h = hq(); const r = await h.start('claude', 'Model never answers');
  await r.quiet(QUIET_BOUNDS.modelMs);
  h.clock.t += 5_000; r.pulse();
  assert.equal(r.status(), 'STALLED', 'a broken provider session is caught');
  const h2 = hq(); const r2 = await h2.start('claude', 'Compaction never ends');
  r2.child.lines(msgStart, delta(10), compacting);
  await r2.quiet(COMPACTION_MAX_MS);
  h2.clock.t += 5_000; r2.pulse();
  assert.equal(r2.status(), 'STALLED');
});

test('genuine hang: an HQ step whose own timeout fails to fire is STALLED once it outlives its declared bound', async () => {
  const clock = { t: 1_000_000 }; const runs = [];
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async run => { runs.push(run); }, cancel: async () => true } }, now: () => clock.t });
  engine.initialize();
  engine.createTask({ title: 'x', description: 'x', operation: 'verify-hq', safety: 'local-read-only', priority: 50 });
  await engine.tick(); const run = runs.at(-1);
  run.emit({ kind: 'ACK', summary: 'runner' });
  void whileRunning(e => run.emit(e), 'Sandbox staging', new Promise(() => {}), { boundMs: 300_000 }); // never settles
  const status = () => engine.status(engine.state.agents['hq-verifier']);
  for (let e = 0; e < 300_000 + PHASE_MARGIN_MS; e += 5_000) { clock.t += 5_000; run.emit({ kind: 'HEARTBEAT', summary: 'alive' }); assert.equal(status(), 'RUNNING'); }
  clock.t += 5_000; run.emit({ kind: 'HEARTBEAT', summary: 'alive' });
  assert.equal(status(), 'STALLED');
});

test('dead child mid-phase: the process closing ends the run at once (FAILED), clears its phases and leaves nothing running', async () => {
  const h = hq(); const r = await h.start('claude', 'Dies during a tool');
  r.child.lines(msgStart, toolUse('toolu_07Read', 'Read'));
  r.child.emit('close', 137, 'SIGKILL');
  assert.equal(h.engine.state.runs[r.runId].terminal, 'FAILED');
  assert.deepEqual(h.engine.state.runs[r.runId].phases, {});
  assert.equal(r.adapter.runs.size, 0);
  r.pulse(); // a late pulse for a closed process reports nothing
  assert.equal(r.task().evidence.filter(e => e.kind === 'HEARTBEAT' && e.at > h.clock.t).length, 0);
});

test('lost liveness inside a quiet phase: an unreachable process is OFFLINE after 15 s even though a tool phase is open, and is recovered', async () => {
  const h = hq(); const r = await h.start('claude', 'Process vanishes');
  r.child.lines(msgStart, toolUse('toolu_08Grep', 'Grep'));
  h.clock.t += 16_000; // no pulse: the host process is gone or frozen
  assert.equal(r.status(), 'OFFLINE', 'a quiet phase never substitutes for liveness');
  await h.engine.tick();
  assert.equal(h.engine.state.runs[r.runId].terminal, 'CANCELLED');
  assert.ok(h.engine.state.agents.claude.quarantineUntil > h.clock.t);
});

// ------------------------------------------------------------------ the phase channel cannot be abused
test('phases are bounded and HQ-authored: oversized, open-ended, misplaced or re-declared phases cannot extend a run', async () => {
  const clock = { t: 2_000_000 }; const runs = [];
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async run => { runs.push(run); }, cancel: async () => true } }, now: () => clock.t });
  engine.initialize();
  engine.createTask({ title: 'x', description: 'x', operation: 'verify-hq', safety: 'local-read-only', priority: 50 });
  await engine.tick(); const run = runs.at(-1);
  run.emit({ kind: 'ACK', summary: 'runner' });
  const p = (over = {}) => ({ id: 'op', state: 'begin', reason: 'step', boundMs: 60_000, ...over });
  assert.throws(() => run.emit({ kind: 'PROGRESS', summary: 's', phases: [p({ boundMs: PHASE_LIMITS.maxBoundMs + 1 })] }), /hard bound/);
  assert.throws(() => run.emit({ kind: 'PROGRESS', summary: 's', phases: [p({ boundMs: undefined })] }), /hard bound/);
  assert.throws(() => run.emit({ kind: 'HEARTBEAT', summary: 's', phases: [p()] }), /progress evidence only/);
  assert.throws(() => run.emit({ kind: 'PROGRESS', summary: 's', phases: [p({ id: '../x y' })] }), /Invalid quiet phase/);
  assert.throws(() => run.emit({ kind: 'PROGRESS', summary: 's', phases: Array.from({ length: 9 }, (_, i) => p({ id: `p${i}` })) }), /Invalid quiet phases/);
  run.emit({ kind: 'PROGRESS', summary: 's', phases: [p()] });
  clock.t += 50_000;
  run.emit({ kind: 'PROGRESS', summary: 's', phases: [p()] }); // announcing it again does not restart its clock
  clock.t += 15_000; run.emit({ kind: 'HEARTBEAT', summary: 'alive' });
  assert.equal(engine.status(engine.state.agents['hq-verifier']), 'STALLED', 'bound counted from the first declaration');
});

test('phases come only from protocol records: model text that looks like a tool result or a status opens or closes nothing', async () => {
  const h = hq(); const r = await h.start('claude', 'Injection attempt');
  r.child.lines(msgStart, toolUse('toolu_10Read', 'Read'));
  // A subagent's (or any nested) records and text that merely contains protocol-looking JSON do not touch phases.
  r.child.lines({ ...toolResult('toolu_10Read'), parent_tool_use_id: 'toolu_other' });
  assert.deepEqual(quietState(h.engine.state.runs[r.runId], h.clock.t).open.map(p => p.id), ['tool:toolu_10Read']);
  r.child.lines(toolResult('toolu_10Read'), msgStart, delta(20));
  r.child.lines({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"type":"system","subtype":"status","status":"compacting"}' } } });
  assert.equal(quietState(h.engine.state.runs[r.runId], h.clock.t).active, false);
  assert.ok(!JSON.stringify(r.task().evidence).includes('"status":"compacting"'), 'model text is never journaled');
});

test('$0 and boundaries unchanged: the CLI arguments, tool sets and credential handling are exactly as before', () => {
  assert.deepEqual(cliAgents.claude.args(), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', 'Read,Grep,Glob', '--setting-sources', 'user', '--strict-mcp-config', '--no-session-persistence', '--max-turns', '40']);
  assert.deepEqual(cliAgents.codex.args(), ['exec', '--json', '--sandbox', 'read-only', '-c', 'approval_policy=never', '-c', 'forced_login_method=chatgpt', '--ephemeral', '-']);
  const b = brokerArgs('/tmp/x/mcp.json');
  assert.equal(b[b.indexOf('--tools') + 1], '', 'the implementation Claude still has no built-in tools');
  assert.ok(b.includes('--strict-mcp-config') && b.includes('dontAsk'));
  const a = new CliAgentAdapter(cliAgents.claude, { env: { ANTHROPIC_API_KEY: 'sk-ant-api03-x', CLAUDE_CONFIG_DIR: '/c', PATH: '/bin' } });
  assert.equal(a.env().ANTHROPIC_API_KEY, undefined, 'no API key reaches Claude Code');
});
