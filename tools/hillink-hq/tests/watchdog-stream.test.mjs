// Watchdog false-stall regression (Claude subscription runs). Claude Code writes an assistant message to stream-json
// only when it is complete, so a long final answer used to be 2+ minutes of silence: the engine saw only heartbeats
// (liveness, deliberately not progress), declared the run STALLED at progressMs and stopped a healthy worker. With
// --include-partial-messages the model's token deltas are progress evidence; a worker that stops producing them is
// still caught. Real adapter, real engine, fake clock and a fake Claude process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CliAgentAdapter, cliAgents, STREAM_PROGRESS_MS } from '../cli-agent-adapter.mjs';
import { brokerArgs } from '../subscription-implementer.mjs';
import { Engine, defaults } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { subscriptionProbe } from './compute-helpers.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { end() {} });
  child.signals = [];
  child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close', null, signal)); return true; };
  child.lines = (...objects) => child.stdout.emit('data', Buffer.from(objects.map(o => JSON.stringify(o)).join('\n') + '\n'));
  return child;
}
const delta = (kind, size) => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: kind === 'text' ? { type: 'text_delta', text: 'x'.repeat(size) } : kind === 'thinking' ? { type: 'thinking_delta', thinking: 'y'.repeat(size) } : { type: 'input_json_delta', partial_json: '{'.repeat(size) } } });

// Production watchdog thresholds (heartbeatMs 15 s, progressMs 120 s): the bug only shows with the real values.
function setup() {
  const clock = { t: 1_000_000 };
  const spawned = [];
  const spawn = (command, args) => { const c = fakeChild(); spawned.push({ args, c }); if (!subscriptionProbe(args, c) && args[0] === '--version') queueMicrotask(() => c.emit('close', 0, null)); return c; };
  const engine = new Engine({ store: new MemoryStore(), adapters: {}, now: () => clock.t });
  engine.initialize();
  const adapter = new CliAgentAdapter(cliAgents.claude, { spawn, platform: 'linux', graceMs: 10, now: () => clock.t });
  engine.adapters['cli-claude'] = adapter;
  engine.configureAgent('claude', { capabilities: ['review-repo'], executionAdapter: 'cli-claude', telemetryAdapter: 'cli-json-stream', usageSource: 'cli-claude-stream', ackTimeoutMs: 90_000 });
  const status = () => engine.status(engine.state.agents.claude);
  // Starts one review task and returns its fake Claude process, acknowledged.
  const begin = async () => {
    await engine.tick(); // health first: the engine dispatches only to a verified subscription sign-in
    const id = engine.createTask({ title: 'Long review', description: 'Survey the repository and write a long answer.', operation: 'review-repo', safety: 'local-read-only', priority: 50 });
    await engine.tick();
    const child = spawned.find(s => s.args[0] === '-p').c;
    child.lines({ type: 'system', subtype: 'init', apiKeySource: 'none', tools: ['Glob', 'Grep', 'Read'] });
    return { id, child, runId: engine.state.tasks[id].runId };
  };
  // What the adapter's 5 s liveness pulse sends while the process exists (journaled at the engine's clock).
  const heartbeat = runId => engine.workerEvent(runId, { kind: 'HEARTBEAT', summary: 'Claude Code process alive.' });
  return { clock, engine, adapter, spawned, status, begin, heartbeat };
}

test('the watchdog thresholds this regression is about are the production ones', () => {
  assert.equal(defaults.progressMs, 120_000);
  assert.ok(STREAM_PROGRESS_MS < defaults.progressMs / 2, 'streaming progress is reported well inside the stall window');
  assert.ok(cliAgents.claude.args().includes('--include-partial-messages'), 'review runs stream token deltas');
  assert.ok(brokerArgs('/tmp/x/mcp.json').includes('--include-partial-messages'), 'subscription implementation runs stream token deltas');
});

test('A. a healthy worker writing a long answer for 10 minutes stays RUNNING and then completes normally', async () => {
  const s = setup(); const { id, child, runId } = await s.begin();
  child.lines({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } });
  // 10 minutes of a long final answer: tokens keep arriving, the process keeps pulsing. Old behavior: STALLED at 2 min.
  for (let elapsed = 0; elapsed < 10 * 60_000; elapsed += 5_000) {
    s.clock.t += 5_000; s.heartbeat(runId); child.lines(delta('text', 40));
    assert.equal(s.status(), 'RUNNING', `RUNNING at ${(elapsed + 5_000) / 1000}s`);
    await s.engine.tick();
  }
  assert.equal(s.engine.state.tasks[id].stage, 'IMPLEMENTING', 'never stopped, parked or handed off');
  assert.equal(s.engine.state.agents.claude.quarantineUntil ?? 0, 0, 'no recovery quarantine');
  const streaming = s.engine.state.tasks[id].evidence.filter(e => e.streaming);
  assert.ok(streaming.length >= 25 && streaming.length <= 31, `throttled progress reports (${streaming.length}), not one per token`);
  assert.ok(streaming.every(e => /^Claude is writing \(\d+ characters streamed so far\)\.$/.test(e.summary)), 'counts only, never model text');
  child.lines({ type: 'assistant', message: { content: [{ type: 'text', text: 'Long answer.' }] } }, { type: 'result', subtype: 'success', is_error: false, result: 'Long answer.', usage: {}, num_turns: 2 });
  child.emit('close', 0, null);
  assert.equal(s.engine.state.tasks[id].stage, 'DONE');
  assert.equal(s.engine.state.runs[runId].terminal, 'COMPLETED');
  await s.engine.tick();
  assert.equal(s.engine.state.agents.claude.assignment, null, 'Claude is free for the next task');
});

test('B. a quiet but healthy worker (thinking and tool-input deltas only, no visible text) is not killed', async () => {
  const s = setup(); const { id, child, runId } = await s.begin();
  for (let elapsed = 0; elapsed < 6 * 60_000; elapsed += 10_000) {
    s.clock.t += 10_000; s.heartbeat(runId); child.lines(delta(elapsed % 20_000 ? 'thinking' : 'json', 12));
    assert.equal(s.status(), 'RUNNING');
    await s.engine.tick();
  }
  assert.equal(s.engine.state.tasks[id].stage, 'IMPLEMENTING');
  assert.equal(s.engine.state.runs[runId].endedAt, null);
  assert.equal(s.engine.state.tasks[id].evidence.filter(e => e.kind === 'MODEL_OUTPUT' && !e.streaming).length, 0, 'no visible output was produced');
});

test('C. a genuine stall (process alive and heartbeating, but no tokens) is still detected, stopped, parked and quarantined', async () => {
  const s = setup(); const { id, child, runId } = await s.begin();
  child.lines(delta('text', 30));
  // The model stops producing anything; only the liveness pulse continues (a hung API call or a wedged process).
  for (let elapsed = 0; elapsed <= defaults.progressMs - 5_000; elapsed += 5_000) {
    s.clock.t += 5_000; s.heartbeat(runId);
    if (elapsed < defaults.progressMs - 10_000) assert.equal(s.status(), 'RUNNING', 'not declared stalled early');
  }
  s.clock.t += 10_000; s.heartbeat(runId);
  assert.equal(s.status(), 'STALLED', 'heartbeats alone are not progress');
  await s.engine.tick();
  assert.deepEqual(child.signals, ['SIGTERM'], 'the stalled process was terminated');
  assert.equal(s.engine.state.runs[runId].terminal, 'CANCELLED');
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
  assert.match(s.engine.state.tasks[id].blocker, /no alternate capable connected worker/);
  assert.ok(s.engine.state.agents.claude.quarantineUntil > s.clock.t, 'recovery quarantine still applies to a real stall');
  assert.equal(s.adapter.runs.size, 0, 'worker cleaned up');
});

test('C2. a worker whose process never produces a session is still caught by the acknowledgement timeout', async () => {
  const s = setup(); await s.engine.tick();
  const id = s.engine.createTask({ title: 'Review', description: 'x', operation: 'review-repo', safety: 'local-read-only', priority: 50 });
  await s.engine.tick();
  s.clock.t += 91_000; await s.engine.tick();
  assert.equal(s.engine.state.tasks[id].stage, 'BLOCKED');
});

test('stream events are evidence only after the session is acknowledged, and never carry model text', async () => {
  const s = setup(); await s.engine.tick();
  s.engine.createTask({ title: 'Review', description: 'x', operation: 'review-repo', safety: 'local-read-only', priority: 50 });
  await s.engine.tick();
  const child = s.spawned.find(x => x.args[0] === '-p').c;
  const before = s.engine.state.runs[Object.keys(s.engine.state.runs)[0]].lastMeaningfulAt;
  s.clock.t += 1_000; child.lines(delta('text', 10));
  assert.equal(s.engine.state.runs[Object.keys(s.engine.state.runs)[0]].lastMeaningfulAt, before, 'pre-ACK deltas ignored');
  child.lines({ type: 'system', subtype: 'init', apiKeySource: 'none' }, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'SECRET-LOOKING model text' } } }, { type: 'stream_event', event: { type: 'message_start' } });
  const ev = Object.values(s.engine.state.tasks)[0].evidence;
  assert.ok(!JSON.stringify(ev).includes('SECRET-LOOKING'));
  assert.equal(ev.filter(e => e.streaming).length, 1, 'message_start and other non-delta events are not progress');
});
