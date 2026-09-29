import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaAdapter, connectOllama } from '../ollama-adapter.mjs';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';

const model = 'gemma3:4b';
const task = { operation: 'summarize-local', safety: 'local-read-only', description: 'Summarize this text.' };
const streamResponse = chunks => new Response(chunks.map(c => JSON.stringify({ model, ...c })).join('\n') + '\n');
test('request submission and HTTP headers do not imply model execution; tokens do', async () => {
  let controller; const events = [];
  const adapter = new OllamaAdapter(model, { request: async () => new Response(new ReadableStream({ start(c) { controller = c; } })) });
  await adapter.start({ task, runId: 'r', emit: e => events.push(e) });
  const done = adapter.runs.get('r').promise;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(events.length, 0);
  controller.enqueue(new TextEncoder().encode(JSON.stringify({ model, response: 'A concise summary.', done: false }) + '\n'));
  controller.enqueue(new TextEncoder().encode(JSON.stringify({ model, done: true, eval_count: 4, prompt_eval_count: 20, total_duration: 99 }) + '\n')); controller.close();
  await done;
  assert.equal(events[0].kind, 'ACK'); assert.ok(events.some(e => e.kind === 'MODEL_RESULT' && e.summary === 'A concise summary.'));
  assert.equal(events.find(e => e.kind === 'USAGE').usage.outputTokens, 4);
  assert.equal(events.at(-1).kind, 'COMPLETED');
});
test('interrupted stream retains unknown execution and cancellation never fabricates stop proof', async () => {
  const events = [];
  const adapter = new OllamaAdapter(model, { request: async () => streamResponse([{ response: 'Partial', done: false }]) });
  await adapter.start({ task, runId: 'r', emit: e => events.push(e) }); await adapter.runs.get('r').promise;
  assert.equal(events.at(-1).kind, 'UNCERTAIN'); assert.equal(await adapter.cancel('r'), false);
  assert.equal(adapter.runs.size, 1);
});
test('explicit server rejection is distinguished from ambiguous transport/server error', async () => {
  for (const [status, kind] of [[404, 'FAILED'], [429, 'RATE_LIMITED'], [500, 'UNCERTAIN']]) {
    const events = []; const adapter = new OllamaAdapter(model, { request: async () => new Response('', { status }) });
    await adapter.start({ task, runId: 'r', emit: e => events.push(e) }); await adapter.runs.get('r').promise;
    assert.equal(events.at(-1).kind, kind); assert.equal(events.some(e => e.kind === 'ACK'), false);
  }
});
test('empty completed model response is a failure, not fake useful work', async () => {
  const events = []; const adapter = new OllamaAdapter(model, { request: async () => streamResponse([{ done: true }]) });
  await adapter.start({ task, runId: 'r', emit: e => events.push(e) }); await adapter.runs.get('r').promise;
  assert.equal(events.at(-1).kind, 'FAILED');
});
test('installed model discovery configures actual identities and prefers Gemma for summaries', async () => {
  const engine = new Engine({ store: new MemoryStore() }); engine.initialize();
  const request = async url => url.endsWith('/api/tags') ? Response.json({ models: [{ name: 'qwen3.5:9b', size: 9, details: { family: 'qwen35' } }, { name: model, size: 4, details: { family: 'gemma3' } }] }) : streamResponse([{ response: 'Summary', done: true }]);
  await connectOllama(engine, request);
  const id = engine.createTask({ title: 'Summary', description: 'Source text', operation: 'summarize-local', safety: 'local-read-only', priority: 50 });
  await engine.tick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(engine.state.tasks[id].agentId, 'gemma'); assert.equal(engine.state.agents.gemma.model, model);
  assert.equal(engine.state.tasks[id].stage, 'DONE'); assert.equal(engine.state.agents.codex.observedStatus, 'UNKNOWN');
});
test('preferred worker is enforced and missing adapter causes an explicit blocked-capacity alert', async () => {
  const engine = new Engine({ store: new MemoryStore() }); engine.initialize();
  engine.createTask({ title: 'Summary', description: 'Source text', operation: 'summarize-local', safety: 'local-read-only', priority: 50, preferredAgentId: 'gemma' });
  await engine.tick(); assert.equal(engine.snapshot().counts.ready, 1);
  assert.ok(Object.values(engine.state.alerts).some(a => a.kind === 'ADAPTER_UNAVAILABLE'));
});
