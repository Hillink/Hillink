// Pass 2.5: ChatGPT as the OpenAI-backed HQ orchestrator. A fake OpenAI (no network, no real key) streams
// scripted Responses API events; everything else is the real engine, tools and adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { connectOrchestrator, OrchestratorAdapter, LIMITS } from '../orchestrator-adapter.mjs';
import { TOOL_NAMES, TOOL_DEFINITIONS, validateArgs, createToolbox } from '../orchestrator-tools.mjs';

const KEY = 'sk-test-DO-NOT-LEAK-1234567890';
const sse = events => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const final = (id, output, usage = { input_tokens: 100, output_tokens: 20 }) => [{ type: 'response.created', response: { id } }, { type: 'response.completed', response: { id, status: 'completed', output, usage } }];
const call = (name, args, id = `call_${name}`) => ({ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) });
const say = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });

// A fake OpenAI: `script` is a list of Responses API outputs, one per /responses request.
function fakeOpenAI(script, { models = 200, responses = null } = {}) {
  const calls = [];
  const request = async (url, init = {}) => {
    const route = new URL(url).pathname.replace('/v1', ''), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ route, body, auth: init.headers?.Authorization });
    if (route.startsWith('/models/')) return new Response('{}', { status: models });
    if (route === '/conversations') return new Response(JSON.stringify({ id: 'conv_test' }), { status: 200 });
    if (route === '/responses') {
      if (responses) return responses(calls);
      const out = script.shift();
      if (!out) throw Error('fake OpenAI ran out of script');
      return sse(final(`resp_${calls.length}`, out));
    }
    return new Response('{}', { status: 404 });
  };
  return { request, calls };
}

function setup({ key = KEY, script = [], openai = {}, claudeConnected = true } = {}) {
  let clock = 1_000_000;
  const store = new MemoryStore(), local = [];
  const localAdapter = { health: async () => ({ status: 'IDLE', detail: 'fake local worker' }), start: async run => { local.push(run); }, cancel: async () => true };
  const engine = new Engine({ store, adapters: { 'local-checks': localAdapter }, now: () => clock, config: { heartbeatMs: 60_000, progressMs: 600_000 } });
  engine.initialize();
  if (claudeConnected) { engine.adapters['cli-claude'] = { ...localAdapter }; engine.configureAgent('claude', { capabilities: ['implement', 'review', 'review-repo'], executionAdapter: 'cli-claude' }); }
  const fake = fakeOpenAI(script, openai);
  const status = connectOrchestrator(engine, { env: key ? { OPENAI_API_KEY: key } : {}, request: fake.request });
  const ask = text => engine.createTask({ title: `Kyle asks ChatGPT: ${text}`.slice(0, 200), description: text, operation: 'orchestrate', safety: 'local-read-only', priority: 50, preferredAgentId: 'chatgpt' });
  const settle = async () => { for (let i = 0; i < 50; i++) { await new Promise(r => setImmediate(r)); } };
  const adapter = engine.adapters['openai-orchestrator'];
  return { engine, store, fake, status, ask, settle, adapter, local, advance: ms => { clock += ms; }, chatgpt: () => engine.snapshot().agents.find(a => a.id === 'chatgpt') };
}

test('1. no OpenAI key: ChatGPT is not connected, and says so without secrets', () => {
  const s = setup({ key: null });
  assert.equal(s.status, 'NOT_CONFIGURED');
  const g = s.chatgpt();
  assert.equal(g.adapterAvailable, false);
  assert.match(g.detail, /OpenAI runtime not configured/);
  assert.equal(s.engine.adapters['openai-orchestrator'], undefined);
});

test('2. a healthy key and model: ChatGPT is connected and IDLE; a rejected key is OFFLINE without echoing it', async () => {
  const s = setup(); await s.engine.tick();
  assert.equal(s.status, 'CONFIGURED'); assert.equal(s.chatgpt().status, 'IDLE'); assert.equal(s.chatgpt().adapterAvailable, true);
  const bad = setup({ openai: { models: 401 } }); await bad.engine.tick();
  assert.equal(bad.chatgpt().status, 'OFFLINE'); assert.match(bad.chatgpt().detail, /rejected the API key/);
  assert.ok(!JSON.stringify(bad.store.read()).includes(KEY), 'the key is never journaled');
});

test('3-5, 11. one request = one orchestration run; STARTING then WORKING from OpenAI evidence; real HQ state is read; completion returns IDLE', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const s = setup({ openai: { responses: async calls => {
    const n = calls.filter(c => c.route === '/responses').length;
    if (n === 1) { await gate; return sse(final('resp_1', [call('get_hq_state', {})])); }
    return sse(final('resp_2', [say('Claude is idle; nobody is working right now.')]));
  } } });
  await s.engine.tick();
  const id = s.ask('What is everyone working on?');
  await s.engine.tick();
  const task = s.engine.state.tasks[id];
  assert.equal(task.stage, 'CLAIMED'); assert.equal(task.agentId, 'chatgpt');
  assert.equal(Object.values(s.engine.state.runs).filter(r => r.taskId === id).length, 1, 'exactly one run');
  assert.equal(s.chatgpt().status, 'UNKNOWN', 'dispatched, not yet accepted by OpenAI: STARTING in the World');
  release(); await s.settle();
  assert.equal(task.stage, 'DONE');
  assert.equal(s.chatgpt().status, 'IDLE');
  const kinds = task.evidence.map(e => e.kind);
  assert.deepEqual(kinds.filter(k => k !== 'HEARTBEAT'), ['ACK', 'MODEL_OUTPUT', 'MODEL_RESULT', 'USAGE', 'COMPLETED']);
  assert.match(task.evidence.find(e => e.kind === 'MODEL_RESULT').summary, /nobody is working/);
  // The tool output the model received is HQ's real state, not an injected summary.
  const toolOut = JSON.parse(s.fake.calls.filter(c => c.route === '/responses')[1].body.input[0].output);
  assert.ok(toolOut.agents.some(a => a.id === 'claude' && a.status === 'IDLE' && a.connected), `real Claude status: ${JSON.stringify(toolOut.agents.find(a => a.id === 'claude'))}`);
  assert.ok(toolOut.recent_tasks.some(t => t.id === id && t.stage === 'IMPLEMENTING'), 'its own live task, from HQ');
  // Persistent context: both requests used the same stored conversation; instructions are sent from one file.
  const reqs = s.fake.calls.filter(c => c.route === '/responses');
  assert.ok(reqs.every(r => r.body.conversation === 'conv_test' && /You are ChatGPT, the Hillink Orchestrator/.test(r.body.instructions)));
  assert.ok(reqs.every(r => r.body.max_output_tokens === LIMITS.maxOutputTokens && r.body.stream === true));
  assert.equal(task.evidence.find(e => e.kind === 'USAGE').usage.inputTokens, 200);
});

test('7, 12, 13. delegation creates one real Claude task linked to the orchestration; ChatGPT can read its result later', async () => {
  const s = setup({ script: [[call('request_repo_review', { agent_id: 'claude', title: 'Find agentStatus', instruction: 'Where is agentStatus defined?' })], [say('I asked Claude (task queued).')]] });
  await s.engine.tick();
  const id = s.ask('Ask Claude to investigate where agentStatus is defined.');
  await s.engine.tick(); await s.settle();
  const orch = s.engine.state.tasks[id];
  assert.equal(orch.stage, 'DONE');
  const handoff = orch.evidence.find(e => e.kind === 'HANDOFF');
  const delegated = s.engine.state.tasks[handoff.delegatedTaskId];
  assert.ok(delegated, 'the delegated task id is recorded on the orchestration');
  assert.deepEqual(delegated.requestedBy, { agentId: 'chatgpt', taskId: id }, 'and the new task records who asked');
  assert.equal(delegated.operation, 'review-repo'); assert.equal(delegated.safety, 'local-read-only'); assert.equal(delegated.preferredAgentId, 'claude');
  assert.equal(Object.values(s.engine.state.tasks).filter(t => t.requestedBy).length, 1, 'exactly one task');
  // Claude runs it (fake local CLI), and the orchestrator's read tool sees the real result.
  await s.engine.tick();
  const run = s.local.find(r => r.task.id === delegated.id);
  run.emit({ kind: 'ACK', summary: 'Claude started' }); run.emit({ kind: 'MODEL_RESULT', summary: 'tools/hillink-hq/engine.mjs:73' }); run.emit({ kind: 'COMPLETED', summary: 'done' });
  const view = JSON.parse(createToolbox(s.engine, { taskId: id }).call('get_task', JSON.stringify({ task_id: delegated.id })).output);
  assert.equal(view.stage, 'DONE'); assert.equal(view.result, 'tools/hillink-hq/engine.mjs:73');
});

test('8-10. no shell, no file writes, no unknown tools; arguments are validated server-side', () => {
  assert.deepEqual(TOOL_NAMES, ['get_hq_state', 'get_task', 'request_repo_review', 'request_implementation', 'submit_objective', 'get_objective', 'resolve_objective_decision', 'cancel_objective', 'request_kyle_approval']);
  assert.ok(!TOOL_NAMES.some(n => /shell|exec|command|write|file|edit|patch|env|config|http|fetch/i.test(n)));
  assert.ok(TOOL_DEFINITIONS.every(t => t.strict && t.parameters.additionalProperties === false));
  const s = setup(), tb = createToolbox(s.engine, { taskId: s.ask('x') });
  const before = Object.keys(s.engine.state.tasks).length;
  for (const [name, args] of [['run_shell', { command: 'rm -rf /' }], ['write_file', { path: 'a', contents: 'b' }]]) {
    const r = tb.call(name, JSON.stringify(args));
    assert.equal(r.ok, false); assert.match(r.output, /Unknown tool/);
  }
  assert.throws(() => validateArgs('request_repo_review', JSON.stringify({ agent_id: 'root', title: 't', instruction: 'i' })), /must be one of/);
  assert.throws(() => validateArgs('request_repo_review', JSON.stringify({ agent_id: 'claude', title: 't', instruction: 'i', operation: 'deploy' })), /Unexpected argument/);
  assert.throws(() => validateArgs('request_repo_review', JSON.stringify({ agent_id: 'claude', title: 'x'.repeat(500), instruction: 'i' })), /longer than/);
  assert.throws(() => validateArgs('get_task', 'not json'), /JSON object/);
  assert.equal(Object.keys(s.engine.state.tasks).length, before, 'rejected calls change nothing');
});

test('10b. a model asked to edit code has no way to: implementation is not a tool, and an unavailable reviewer is refused truthfully', async () => {
  const s = setup({ claudeConnected: true });
  const tb = createToolbox(s.engine, { taskId: s.ask('Modify engine.mjs yourself') });
  assert.equal(tb.call('edit_file', JSON.stringify({ path: 'engine.mjs' })).ok, false);
  const codex = JSON.parse(tb.call('request_repo_review', JSON.stringify({ agent_id: 'codex', title: 'Review', instruction: 'Review engine.mjs' })).output);
  assert.match(codex.refused, /Codex is not connected/);
  assert.equal(Object.values(s.engine.state.tasks).filter(t => t.requestedBy).length, 0, 'no pretend review');
});

test('6. OpenAI failures become truthful HQ outcomes: rejected key, tool loops, rate limits', async () => {
  const rejected = setup({ openai: { responses: async () => new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: `Incorrect API key provided: ${KEY}` } }), { status: 401 }) } });
  await rejected.engine.tick(); const a = rejected.ask('hi'); await rejected.engine.tick(); await rejected.settle();
  const failed = rejected.engine.state.tasks[a].evidence.find(e => e.kind === 'FAILED');
  assert.match(failed.summary, /rejected the API key/);
  assert.ok(!JSON.stringify(rejected.store.read()).includes(KEY), 'OpenAI echoing the key is redacted');
  assert.equal(Object.values(rejected.engine.state.runs).find(r => r.taskId === a).terminal, 'FAILED');
  const loop = setup({ script: Array.from({ length: LIMITS.toolRounds + 1 }, () => [call('get_hq_state', {})]) });
  await loop.engine.tick(); const b = loop.ask('loop forever'); await loop.engine.tick(); await loop.settle();
  assert.match(loop.engine.state.tasks[b].evidence.find(e => e.kind === 'FAILED').summary, new RegExp(`stopped after ${LIMITS.toolRounds} tool rounds`));
  const limited = setup({ openai: { responses: async () => new Response('{"error":{"code":"rate_limit_exceeded"}}', { status: 429 }) } });
  await limited.engine.tick(); const c = limited.ask('hi'); await limited.engine.tick(); await limited.settle();
  assert.equal(Object.values(limited.engine.state.runs).find(r => r.taskId === c).terminal, 'RATE_LIMITED');
});

test('approval requests create an owner-required task that nothing runs', async () => {
  const s = setup({ script: [[call('request_kyle_approval', { summary: 'Spend on a paid API', decision: 'Approve $20/month for X?' })], [say('Asked Kyle.')]] });
  await s.engine.tick(); const id = s.ask('Should we buy X?'); await s.engine.tick(); await s.settle();
  const approval = Object.values(s.engine.state.tasks).find(t => t.safety === 'owner-required');
  assert.equal(approval.stage, 'BLOCKED'); assert.deepEqual(approval.requestedBy, { agentId: 'chatgpt', taskId: id });
  await s.engine.tick(); assert.equal(approval.runId, null, 'never dispatched');
});

test('the HTTP task API cannot forge requestedBy; a local run does not block ChatGPT', async () => {
  const s = setup(); await s.engine.tick();
  const id = s.engine.createTask({ title: 'x', description: 'y', operation: 'verify-hq', safety: 'local-read-only', priority: 50, requestedBy: { agentId: 'chatgpt', taskId: 'z' } });
  assert.equal(s.engine.state.tasks[id].requestedBy, undefined, 'only the orchestrator tools can set it');
  await s.engine.tick(); assert.equal(s.engine.state.tasks[id].stage, 'CLAIMED', 'a local run holds the one local slot');
  s.fake.calls.length = 0;
  const q = s.ask('What is everyone working on?'); await s.engine.tick();
  assert.equal(s.engine.state.tasks[q].stage, 'CLAIMED', 'ChatGPT (a remote API adapter) still starts');
});

test('adapter refuses anything but orchestration, and needs a key to exist', async () => {
  assert.throws(() => new OrchestratorAdapter({}, {}), /not configured/);
  const s = setup();
  await assert.rejects(s.adapter.start({ task: { operation: 'review-repo', safety: 'local-read-only' }, runId: 'r', emit: () => {} }), /orchestration requests only/);
  assert.ok(!Object.values(s.adapter).some(v => typeof v === 'string' && v.includes(KEY)), 'the key is not stored as a property');
});
