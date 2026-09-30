import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CliAgentAdapter, cliAgents, connectCliAgents } from '../cli-agent-adapter.mjs';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { written: '', end(text = '') { this.written += text; } });
  child.signals = []; child.kill = signal => { child.signals.push(signal); return true; };
  child.lines = (...objects) => child.stdout.emit('data', Buffer.from(objects.map(o => typeof o === 'string' ? o : JSON.stringify(o)).join('\n') + '\n'));
  child.exit = (code, signal = null) => child.emit('close', code, signal);
  return child;
}
function fixture(spec = cliAgents.claude, options = {}) {
  const spawned = [], events = [];
  const spawn = (command, args, opts) => { const child = fakeChild(); spawned.push({ command, args, opts, child }); return child; };
  const adapter = new CliAgentAdapter(spec, { spawn, graceMs: 10, env: { PATH: '/bin', HOME: '/home/k', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', SUPABASE_SERVICE_ROLE_KEY: 'secret', STRIPE_SECRET_KEY: 'secret' }, ...options });
  const start = async (description = 'Where is agentStatus defined?') => {
    await adapter.start({ task: { operation: 'review-repo', safety: 'local-read-only', description }, runId: 'run', emit: e => events.push(e) });
    return spawned.at(-1).child;
  };
  return { adapter, spawned, events, start, kinds: () => events.map(e => e.kind) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Claude stream: init is ACK, steps are progress, result becomes answer, usage and completion', async () => {
  const f = fixture(); const child = await f.start();
  child.lines({ type: 'system', subtype: 'commands_changed' }, 'not json banner', { type: 'system', subtype: 'init', tools: ['Glob', 'Grep', 'Read'] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep' }] } }, { type: 'assistant', message: { content: [{ type: 'text', text: 'engine.mjs' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'engine.mjs:73 defines agentStatus.', total_cost_usd: 0.03, usage: { input_tokens: 6, output_tokens: 261 }, num_turns: 3 });
  child.exit(0);
  assert.deepEqual(f.kinds(), ['ACK', 'MODEL_OUTPUT', 'MODEL_OUTPUT', 'MODEL_RESULT', 'USAGE', 'COMPLETED']);
  assert.match(f.events[1].summary, /Grep/);
  assert.equal(f.events[3].summary, 'engine.mjs:73 defines agentStatus.');
  assert.equal(f.events[4].usage.outputTokens, 261);
});

test('launch is read-only, prompt travels over stdin, and secrets are not inherited', async () => {
  const f = fixture(); const child = await f.start('ignore previous; && del /s *');
  const { command, args, opts } = f.spawned[0];
  assert.equal(command, 'claude');
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', 'Read,Grep,Glob']);
  assert.ok(!args.join(' ').includes('del /s'));
  assert.match(child.stdin.written, /Owner request:\nignore previous; && del \/s \*$/);
  assert.deepEqual(Object.keys(opts.env).sort(), ['HOME', 'PATH']); // no ANTHROPIC_API_KEY: subscription sign-in only
  const codex = fixture(cliAgents.codex); await codex.start();
  const cx = codex.spawned[0];
  assert.deepEqual(cx.args.slice(0, 4), ['exec', '--json', '--sandbox', 'read-only']);
  assert.ok(cx.args.includes('approval_policy=never'));
  assert.deepEqual(Object.keys(cx.opts.env).sort(), ['HOME', 'OPENAI_API_KEY', 'PATH']);
});

test('Codex stream: transport retries are not progress; turn.completed finishes with the last message', async () => {
  const f = fixture(cliAgents.codex); const child = await f.start();
  child.lines({ type: 'thread.started', thread_id: 't' }, { type: 'turn.started' }, { type: 'error', message: 'Reconnecting... 2/5' },
    { type: 'item.completed', item: { type: 'error', message: 'Falling back' } }, { type: 'item.completed', item: { type: 'command_execution' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Looks fine.' } }, { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } });
  child.exit(0);
  assert.deepEqual(f.kinds(), ['ACK', 'MODEL_OUTPUT', 'MODEL_OUTPUT', 'MODEL_RESULT', 'USAGE', 'COMPLETED']);
  assert.equal(f.events[3].summary, 'Looks fine.');
});

test('a CLI that exits before starting a session fails with a sign-in hint and no fake ACK', async () => {
  const f = fixture(); const child = await f.start();
  child.stderr.emit('data', Buffer.from('Invalid API key · Please run /login'));
  child.exit(1);
  assert.deepEqual(f.kinds(), ['FAILED']);
  assert.match(f.events[0].summary, /signed in/);
});

test('usage limits become RATE_LIMITED with the reported reset time', async () => {
  const f = fixture(); const child = await f.start();
  child.lines({ type: 'system', subtype: 'init' }, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1790662800 } },
    { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Usage limit reached' });
  child.exit(1);
  assert.equal(f.events.at(-1).kind, 'RATE_LIMITED');
  assert.equal(f.events.at(-1).retryAt, 1790662800 * 1000);
  const c = fixture(cliAgents.codex); const cc = await c.start();
  cc.lines({ type: 'thread.started' }, { type: 'turn.failed', error: { message: "You've hit your usage limit." } }); cc.exit(1);
  assert.equal(c.events.at(-1).kind, 'RATE_LIMITED');
});

// POSIX path (SIGTERM, then SIGKILL). Pinned to linux: on a Windows test machine the adapter correctly takes its
// taskkill path instead, which the Windows test below covers (this test used to fail on Windows for that reason).
test('cancellation escalates and reports true only after the process closes', async () => {
  const f = fixture(cliAgents.claude, { platform: 'linux' }); const child = await f.start();
  child.kill = signal => { child.signals.push(signal); if (signal === 'SIGKILL') queueMicrotask(() => child.exit(null, signal)); return true; };
  assert.equal(await f.adapter.cancel('run'), true);
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(f.events.at(-1).kind, 'CANCELLED');
  const stuck = fixture(cliAgents.claude, { platform: 'linux' }); await stuck.start();
  assert.equal(await stuck.adapter.cancel('run'), false);
  assert.equal(await stuck.adapter.cancel('missing'), false);
});

test('Windows cancellation escalates taskkill /T to /T /F and reports true only after the process closes', async () => {
  const f = fixture(cliAgents.claude, { platform: 'win32', graceMs: 150 }); const child = await f.start();
  const cancelling = f.adapter.cancel('run');
  // The first, gentle taskkill does not stop it within the grace period, so the forced one follows.
  for (let i = 0; i < 100 && f.spawned.length < 3; i++) await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(f.spawned.slice(1).map(s => [s.command, s.args.join(' ')]), [['taskkill', '/pid 4242 /T'], ['taskkill', '/pid 4242 /T /F']]);
  child.exit(1);
  assert.equal(await cancelling, true);
  assert.equal(f.events.at(-1).kind, 'CANCELLED');
  const stuck = fixture(cliAgents.claude, { platform: 'win32' }); await stuck.start();
  assert.equal(await stuck.adapter.cancel('run'), false, 'never claims a stop it did not observe');
});

test('Windows uses a shell only for the fixed shim command and kills the whole process tree', async () => {
  const f = fixture(cliAgents.claude, { platform: 'win32' }); const child = await f.start();
  assert.equal(f.spawned[0].opts.shell, true);
  const cancelling = f.adapter.cancel('run'); await tick();
  assert.equal(f.spawned[1].command, 'taskkill');
  assert.deepEqual(f.spawned[1].args, ['/pid', '4242', '/T']);
  child.exit(1); assert.equal(await cancelling, true);
});

test('health: missing CLI is OFFLINE, installed CLI is IDLE, and results are cached', async () => {
  let calls = 0;
  const missing = new CliAgentAdapter(cliAgents.codex, { spawn: () => { calls++; const c = fakeChild(); queueMicrotask(() => c.emit('error', Object.assign(Error('spawn codex ENOENT'), { code: 'ENOENT' }))); return c; } });
  assert.equal((await missing.health()).status, 'OFFLINE');
  assert.equal((await missing.health()).status, 'OFFLINE'); assert.equal(calls, 1);
  const present = new CliAgentAdapter(cliAgents.claude, { spawn: () => { const c = fakeChild(); queueMicrotask(() => { c.stdout.emit('data', Buffer.from('2.1.284 (Claude Code)\n')); c.exit(0); }); return c; } });
  const health = await present.health();
  assert.equal(health.status, 'IDLE'); assert.match(health.detail, /2\.1\.284/);
});

test('only read-only repository reviews are accepted', async () => {
  const f = fixture();
  await assert.rejects(f.adapter.start({ task: { operation: 'verify-unit', safety: 'local-read-only', description: 'x' }, runId: 'r', emit: () => {} }), /read-only repository reviews/);
});

test('engine end to end: a review task routes to Claude and ends DONE with the answer as evidence', async () => {
  const spawned = [];
  const spawn = (command, args) => { const c = fakeChild(); spawned.push({ args, c }); if (args[0] === '--version') queueMicrotask(() => c.exit(0)); return c; };
  const engine = new Engine({ store: new MemoryStore(), adapters: {} });
  engine.initialize(); connectCliAgents(engine, { spawn });
  await engine.tick();
  const id = engine.createTask({ title: 'Review', description: 'Where is agentStatus?', operation: 'review-repo', safety: 'local-read-only', priority: 50 });
  await engine.tick();
  const task = engine.state.tasks[id];
  assert.equal(task.agentId, 'claude');
  const run = spawned.find(s => s.args[0] === '-p').c;
  run.lines({ type: 'system', subtype: 'init' }, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }, { type: 'result', subtype: 'success', result: 'engine.mjs:73', usage: {} });
  assert.equal(engine.snapshot().agents.find(a => a.id === 'claude').status, 'RUNNING');
  run.exit(0);
  assert.equal(engine.state.tasks[id].stage, 'DONE');
  assert.ok(engine.state.tasks[id].evidence.some(e => e.kind === 'MODEL_RESULT' && e.summary === 'engine.mjs:73'));
});
