// Watchdog false-stall regression, implementation runs (objective 96ab7690, killed at 120.9 s of silence with the
// process alive). Two implement-only quiet periods: Claude Code's auto-compaction of a large context (prints
// status "compacting", then nothing until it ends) and HQ's own bounded sandbox operations while Claude waits
// (run_tests up to 330 s, acceptance tests up to 5.5 min, diff/stage/teardown). The engine below runs with the
// production thresholds and receives exactly the evidence the real components produce: the Claude adapter configured
// as the implementation runner builds it, its 5 s pulse, and whileRunning(). A genuinely silent or hung worker must
// still go STALLED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CliAgentAdapter, cliAgents, COMPACTION_MAX_MS, STREAM_PROGRESS_MS } from '../cli-agent-adapter.mjs';
import { whileRunning, INFLIGHT_PROGRESS_MS } from '../inflight.mjs';
import { CLAUDE_TOOL_NAMES, BROKER_SERVER } from '../broker/policy.mjs';
import { brokerArgs } from '../subscription-implementer.mjs';
import { Engine, defaults } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 5151; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { end() {} });
  child.signals = [];
  child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close', null, signal)); return true; };
  child.lines = (...objects) => child.stdout.emit('data', Buffer.from(objects.map(o => JSON.stringify(o)).join('\n') + '\n'));
  return child;
}
const delta = size => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{'.repeat(size) } } });
const compacting = { type: 'system', subtype: 'status', status: 'compacting' };
const compacted = [{ type: 'system', subtype: 'status', status: null, compact_result: 'success' }, { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 180_000, post_tokens: 4_000 } }];

// An engine at production thresholds with one worker whose run hands its emit() to the real components under test.
function setup() {
  const clock = { t: 5_000_000 };
  const runs = [];
  const worker = { health: async () => ({ status: 'IDLE' }), start: async run => { runs.push(run); }, cancel: async () => true };
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': worker }, now: () => clock.t });
  engine.initialize();
  const status = () => engine.status(engine.state.agents['hq-verifier']);
  const begin = async () => {
    const id = engine.createTask({ title: 'Implementation run', description: 'x', operation: 'verify-hq', safety: 'local-read-only', priority: 50 });
    await engine.tick();
    return { id, run: runs.at(-1), task: () => engine.state.tasks[id] };
  };
  return { clock, engine, status, begin };
}

// The Claude adapter exactly as the subscription implementer configures it (implement-repo, broker tools only).
function implementClaude(s, emit) {
  const spawned = [];
  const adapter = new CliAgentAdapter(cliAgents.claude, { spawn: () => { const c = fakeChild(); spawned.push(c); return c; }, platform: 'linux', graceMs: 10, operation: 'implement-repo', safety: 'local-worktree-write', billing: 'subscription', now: () => s.clock.t });
  adapter.spec = { ...cliAgents.claude, args: () => brokerArgs('/tmp/hq-broker/mcp.json'), expectTools: CLAUDE_TOOL_NAMES, expectServer: BROKER_SERVER };
  adapter.healthCache = { at: Date.now(), result: { status: 'IDLE', auth: 'subscription' } };
  const start = async () => {
    await adapter.start({ task: { operation: 'implement-repo', safety: 'local-worktree-write', description: 'Build the harness.' }, runId: 'impl-run', emit });
    const child = spawned.at(-1);
    child.lines({ type: 'system', subtype: 'init', apiKeySource: 'none', tools: [...CLAUDE_TOOL_NAMES].map(t => t), mcp_servers: [{ name: BROKER_SERVER, status: 'connected' }] });
    return child;
  };
  // One tick of the adapter's 5 s pulse at the fake clock.
  const pulse = () => adapter.pulse(adapter.runs.get('impl-run'));
  return { adapter, start, pulse };
}

test('the implementation route streams tokens and its keepalives sit well inside the stall window', () => {
  assert.equal(defaults.progressMs, 120_000);
  assert.ok(brokerArgs('/tmp/x/mcp.json').includes('--include-partial-messages'));
  assert.ok(STREAM_PROGRESS_MS < defaults.progressMs / 2 && INFLIGHT_PROGRESS_MS < defaults.progressMs / 2);
  assert.ok(COMPACTION_MAX_MS > defaults.progressMs && COMPACTION_MAX_MS <= 10 * 60_000, 'compaction is bounded, not open-ended');
});

test('A. healthy long implementation: 6 minutes of auto-compaction on a large context stays RUNNING, then the run completes', async () => {
  const s = setup(); const { run, task } = await s.begin();
  // As in ClaudeImplementer: Claude's terminal event is held until HQ has verified the work.
  let claudeEnd = null;
  const claude = implementClaude(s, e => (['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED'].includes(e.kind) ? (claudeEnd = e) : run.emit(e))); const child = await claude.start();
  child.lines(delta(500)); // writing a tool call
  child.lines(compacting);
  for (let elapsed = 0; elapsed < 6 * 60_000; elapsed += 5_000) {
    s.clock.t += 5_000; claude.pulse();
    assert.equal(s.status(), 'RUNNING', `RUNNING during compaction at ${(elapsed + 5_000) / 1000}s`);
    await s.engine.tick();
  }
  child.lines(...compacted, delta(800), { type: 'assistant', message: { content: [{ type: 'tool_use', name: CLAUDE_TOOL_NAMES[3] }] } });
  assert.ok(task().evidence.some(e => /finished compacting its context \(360 s\)/.test(e.summary)));
  child.lines({ type: 'result', subtype: 'success', is_error: false, result: 'Implemented the harness.', usage: {}, num_turns: 9 });
  child.emit('close', 0, null);
  assert.equal(claudeEnd?.kind, 'COMPLETED');
  assert.equal(task().stage, 'IMPLEMENTING', 'Claude finished; the HQ pipeline (diff, tests, commit) continues');
  run.emit({ kind: 'TEST_RESULT', result: 'passed', summary: '3 passed; 0 failed.' }); run.emit({ kind: 'COMMIT', summary: 'Committed.', sha: 'a'.repeat(40) }); run.emit({ kind: 'COMPLETED', summary: 'Implementation committed.' });
  assert.equal(task().stage, 'DONE');
  assert.equal(s.engine.state.agents['hq-verifier'].quarantineUntil ?? 0, 0, 'no recovery quarantine');
});

test('B. quiet implementation: HQ-bounded sandbox work (run_tests 5 min, acceptance tests, teardown) with Claude silent is not killed', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const s = setup(); const { run, task } = await s.begin();
  run.emit({ kind: 'ACK', summary: 'HQ implementation runner started.' });
  const now = () => s.clock.t;
  for (const [label, minutes] of [['Sandbox test run (run_tests)', 5], ['HQ acceptance tests in the sandbox', 5], ['Sandbox teardown', 3]]) {
    let finish; const op = whileRunning(e => run.emit(e), label, new Promise(r => { finish = r; }), { now });
    for (let elapsed = 0; elapsed < minutes * 60_000; elapsed += 5_000) {
      s.clock.t += 5_000; t.mock.timers.tick(5_000); run.emit({ kind: 'HEARTBEAT', summary: 'HQ implementation runner alive.' });
      assert.equal(s.status(), 'RUNNING', `${label}: RUNNING at ${(elapsed + 5_000) / 1000}s`);
      await s.engine.tick();
    }
    finish({ stdout: '' }); await op;
  }
  assert.ok(task().evidence.filter(e => e.inFlight).length >= 35, 'bounded operations reported their progress');
  run.emit({ kind: 'COMPLETED', summary: 'Implementation committed.' });
  assert.equal(task().stage, 'DONE');
});

test('C1. genuine stall: a silent Claude with no compaction declared is STALLED at the old window and stopped', async () => {
  const s = setup(); const { run, task } = await s.begin();
  const claude = implementClaude(s, e => run.emit(e)); const child = await claude.start();
  child.lines(delta(200));
  for (let elapsed = 0; elapsed < defaults.progressMs - 10_000; elapsed += 5_000) { s.clock.t += 5_000; claude.pulse(); assert.equal(s.status(), 'RUNNING'); }
  s.clock.t += 15_000; claude.pulse();
  assert.equal(s.status(), 'STALLED', 'heartbeats from a live but silent process are not progress');
  await s.engine.tick();
  assert.equal(task().stage, 'BLOCKED');
  assert.match(task().blocker, /no alternate capable connected worker/);
  await claude.adapter.close(); assert.deepEqual(child.signals, ['SIGTERM']); assert.equal(claude.adapter.runs.size, 0, 'no process left running');
});

test('C2. genuine stall: a compaction that never ends stops counting at its cap and goes STALLED', async () => {
  const s = setup(); const { run } = await s.begin();
  const claude = implementClaude(s, e => run.emit(e)); const child = await claude.start();
  child.lines(compacting);
  for (let elapsed = 0; elapsed < COMPACTION_MAX_MS; elapsed += 5_000) { s.clock.t += 5_000; claude.pulse(); assert.equal(s.status(), 'RUNNING'); }
  for (let elapsed = 0; elapsed < defaults.progressMs + 10_000; elapsed += 5_000) { s.clock.t += 5_000; claude.pulse(); }
  assert.equal(s.status(), 'STALLED', 'past the compaction cap only heartbeats remain');
  await claude.adapter.close();
});

test('C3. genuine stall: a hung bounded operation stops reporting when its own timeout fires, then goes STALLED', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const s = setup(); const { run, task } = await s.begin();
  run.emit({ kind: 'ACK', summary: 'HQ implementation runner started.' });
  let fail; const op = whileRunning(e => run.emit(e), 'Sandbox test run (run_tests)', new Promise((_, reject) => { fail = reject; }), { now: () => s.clock.t });
  for (let elapsed = 0; elapsed < 330_000; elapsed += 5_000) { s.clock.t += 5_000; t.mock.timers.tick(5_000); run.emit({ kind: 'HEARTBEAT', summary: 'alive' }); }
  fail(Error('timed out after 330000 ms')); await assert.rejects(op, /timed out/);
  const reports = task().evidence.filter(e => e.inFlight).length;
  for (let elapsed = 0; elapsed < defaults.progressMs + 10_000; elapsed += 5_000) { s.clock.t += 5_000; t.mock.timers.tick(5_000); run.emit({ kind: 'HEARTBEAT', summary: 'alive' }); }
  assert.equal(task().evidence.filter(e => e.inFlight).length, reports, 'no keepalive outlives its operation');
  assert.equal(s.status(), 'STALLED');
});

test('C4. dead process: closing without a result ends the run as FAILED (no stall needed)', async () => {
  const s = setup(); const { run, task } = await s.begin();
  const claude = implementClaude(s, e => run.emit(e)); const child = await claude.start();
  child.lines(compacting);
  child.emit('close', 1, null);
  assert.equal(task().stage, 'BLOCKED');
  assert.equal(claude.adapter.runs.size, 0, 'the closed process is no longer tracked, so nothing keeps reporting for it');
});

test('compaction status is honoured only after the session is acknowledged and only for "compacting"', async () => {
  const s = setup(); const { run, task } = await s.begin();
  const claude = implementClaude(s, e => run.emit(e));
  await claude.adapter.start({ task: { operation: 'implement-repo', safety: 'local-worktree-write', description: 'x' }, runId: 'impl-run', emit: e => run.emit(e) }).catch(() => {});
  const run2 = claude.adapter.runs.get('impl-run');
  claude.adapter.spec.parse(compacting, run2);
  assert.equal(run2.compactingSince ?? null, null, 'pre-ACK status ignored');
  run2.acknowledged = true;
  assert.deepEqual(claude.adapter.spec.parse({ type: 'system', subtype: 'status', status: 'requesting' }, run2), []);
  assert.equal(claude.adapter.spec.parse(compacting, run2)[0].kind, 'PROGRESS');
  assert.deepEqual(claude.adapter.spec.parse({ type: 'system', subtype: 'status', status: 'requesting' }, run2), [], '"requesting" does not end a compaction');
  assert.equal(claude.adapter.spec.parse(compacted[0], run2)[0].compacting, false);
  assert.deepEqual(claude.adapter.spec.parse(compacted[1], run2), [], 'the boundary after status null adds nothing');
  assert.ok(!task().evidence.some(e => /SECRET/.test(JSON.stringify(e))));
});
