// ChatGPT as HQ's orchestrator: an execution adapter over OpenAI's Responses API (REST, no SDK, so HQ keeps
// zero dependencies). One HQ 'orchestrate' task = one turn: Kyle's request goes in, the model may call the
// narrow HQ tools in orchestrator-tools.mjs, and its answer comes back as HQ evidence.
//
// Truth: ACK only once OpenAI has accepted the request (a response object came back), HEARTBEAT only while a
// request is actually in flight, MODEL_RESULT/COMPLETED only from a finished response. Missing key = the
// adapter is never connected (ChatGPT shows Not connected). The key is read from the environment on the
// server, sent only in the Authorization header to api.openai.com, and never logged, stored or returned.
//
// Context: one OpenAI Conversation per HQ, id kept in <state dir>/orchestrator.json (no secrets in it). HQ
// stays the source of truth: the instructions tell the model to re-read HQ, not trust conversation memory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_DEFINITIONS, createToolbox } from './orchestrator-tools.mjs';

const API = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-6.1-sol'; // OpenAI's balance of capability and cost (docs, 2026-09); OPENAI_ORCHESTRATOR_MODEL overrides.
export const LIMITS = { toolRounds: 6, maxOutputTokens: 1500, requestTimeoutMs: 60_000, healthCacheMs: 5 * 60_000 };
const here = path.dirname(fileURLToPath(import.meta.url));
export const INSTRUCTIONS_FILE = path.join(here, 'prompts', 'orchestrator.md');

// An error we can describe without echoing anything secret: status and OpenAI's own error code/message.
async function apiError(response) {
  let code = null, message = null;
  try { const body = await response.json(); code = body?.error?.code ?? body?.error?.type ?? null; message = body?.error?.message ?? null; } catch { /* not JSON */ }
  const safe = typeof message === 'string' ? message.replace(/sk-[A-Za-z0-9_-]{6,}/g, '[redacted]').slice(0, 300) : null;
  return Object.assign(Error(`OpenAI HTTP ${response.status}${code ? ` (${code})` : ''}${safe ? `: ${safe}` : ''}`), { status: response.status, code });
}
// Reads a streamed response (server-sent events). onCreated fires when OpenAI has accepted the request
// (response.created); onEvent on every event (liveness). Resolves with the final response object.
export async function readStream(r, { onCreated, onEvent }) {
  if (!r.body) throw Error('OpenAI returned no stream');
  const decoder = new TextDecoder(); let pending = '', final = null;
  const handle = block => {
    const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let ev; try { ev = JSON.parse(data); } catch { return; }
    onEvent?.(ev.type);
    if (ev.type === 'response.created') onCreated?.(ev.response);
    else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') final = ev.response;
    else if (ev.type === 'response.failed') throw Error(`OpenAI response failed: ${String(ev.response?.error?.message ?? ev.response?.error?.code ?? 'unknown').slice(0, 300)}`);
    else if (ev.type === 'error') throw Error(`OpenAI stream error: ${String(ev.message ?? ev.code ?? 'unknown').slice(0, 300)}`);
  };
  for await (const bytes of r.body) {
    pending += decoder.decode(bytes, { stream: true });
    if (pending.length > 4_000_000) throw Error('OpenAI stream too large');
    const blocks = pending.split(/\r?\n\r?\n/); pending = blocks.pop();
    for (const b of blocks) handle(b);
  }
  pending += decoder.decode(); if (pending.trim()) handle(pending);
  if (!final) throw Error('OpenAI stream ended without a final response');
  return final;
}
const textOf = output => output.filter(i => i.type === 'message').flatMap(i => i.content ?? []).filter(c => c.type === 'output_text' && typeof c.text === 'string').map(c => c.text).join('\n').trim();

export class OrchestratorAdapter {
  constructor(engine, { apiKey, model = DEFAULT_MODEL, request = fetch, stateFile = null, instructions = null, now = Date.now, pulseMs = 5000 } = {}) {
    if (!apiKey) throw Error('OpenAI runtime not configured');
    // The key lives only in this closure; it is not a property anyone can serialize.
    const key = apiKey;
    this.call = (method, route, body, signal) => request(`${API}${route}`, { method, signal, redirect: 'error', headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    Object.assign(this, { engine, model, stateFile, now, pulseMs, remote: true, runs: new Map(), healthCache: null });
    this.instructions = instructions ?? fs.readFileSync(INSTRUCTIONS_FILE, 'utf8');
  }
  // Connection health: can this key see the configured model? Cached; a failure says why, never the key.
  async health() {
    if (this.runs.size) return { status: 'IDLE', detail: `OpenAI orchestrator (${this.model}) connected.` };
    if (this.healthCache && this.now() - this.healthCache.at < LIMITS.healthCacheMs) return this.healthCache.result;
    let result;
    try {
      const r = await this.call('GET', `/models/${encodeURIComponent(this.model)}`, null, AbortSignal.timeout(2500));
      if (r.ok) result = { status: 'IDLE', detail: `OpenAI orchestrator (${this.model}) connected.` };
      else if (r.status === 401) result = { status: 'OFFLINE', detail: 'OpenAI rejected the API key (HTTP 401). Replace OPENAI_API_KEY for HQ.' };
      else if (r.status === 404) result = { status: 'OFFLINE', detail: `OpenAI model ${this.model} is not available to this key. Set OPENAI_ORCHESTRATOR_MODEL.` };
      else if (r.status === 429) result = { status: 'RATE_LIMITED', detail: 'OpenAI is rate limiting this key.', retryAt: this.now() + 60_000 };
      else result = { status: 'UNKNOWN', detail: `OpenAI health check returned HTTP ${r.status}.` };
    } catch (error) { result = { status: 'UNKNOWN', detail: `OpenAI unreachable: ${String(error.cause?.code ?? error.name ?? 'error').slice(0, 60)}.` }; }
    this.healthCache = { at: this.now(), result };
    return result;
  }
  readConversation() { try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')).conversationId ?? null; } catch { return null; } }
  async conversation(signal) {
    const known = this.conversationId ?? (this.stateFile ? this.readConversation() : null);
    if (known) return (this.conversationId = known);
    const r = await this.call('POST', '/conversations', { metadata: { app: 'hillink-hq', role: 'orchestrator' } }, signal);
    if (!r.ok) throw await apiError(r);
    const body = await r.json();
    if (typeof body?.id !== 'string') throw Error('OpenAI returned no conversation id');
    this.conversationId = body.id;
    if (this.stateFile) { try { fs.mkdirSync(path.dirname(this.stateFile), { recursive: true }); fs.writeFileSync(this.stateFile, JSON.stringify({ conversationId: body.id, model: this.model, createdAt: new Date(this.now()).toISOString() }, null, 2)); } catch { /* context is a convenience */ } }
    return body.id;
  }
  async start({ task, runId, emit }) {
    if (task.operation !== 'orchestrate' || task.safety !== 'local-read-only') throw Error('Orchestrator adapter accepts orchestration requests only');
    if (this.runs.size) throw Error('Orchestrator already has an unresolved request');
    const entry = { abort: new AbortController(), inFlight: false, done: false };
    this.runs.set(runId, entry);
    // Liveness: only while an OpenAI request is actually in flight.
    const pulse = setInterval(() => { if (entry.acknowledged && entry.inFlight && !entry.done) { try { emit({ kind: 'HEARTBEAT', summary: 'OpenAI request in flight.' }); } catch { /* run ended */ } } }, this.pulseMs);
    pulse.unref?.();
    entry.promise = this.execute(task, runId, entry, emit).catch(error => {
      if (entry.done) return;
      entry.done = true;
      const aborted = entry.abort.signal.aborted;
      const summary = aborted ? 'Orchestration cancelled.' : error.status === 401 ? 'OpenAI rejected the API key (HTTP 401).' : error.name === 'TimeoutError' ? `OpenAI did not answer within ${LIMITS.requestTimeoutMs / 1000}s.` : `Orchestration failed: ${error.message}`.slice(0, 600);
      try {
        if (error.status === 429) emit({ kind: 'RATE_LIMITED', summary: 'OpenAI rate limited the orchestrator.', retryAt: this.now() + 60_000 });
        else emit({ kind: aborted ? 'CANCELLED' : 'FAILED', summary });
      } catch { /* the run may already be closed */ }
    }).finally(() => { clearInterval(pulse); this.runs.delete(runId); });
  }
  async execute(task, runId, entry, emit) {
    const started = this.now(), signal = () => AbortSignal.any([entry.abort.signal, AbortSignal.timeout(LIMITS.requestTimeoutMs)]);
    const toolbox = createToolbox(this.engine, { taskId: task.id, now: this.now });
    const usage = { inputTokens: 0, outputTokens: 0, rounds: 0, toolCalls: 0 };
    const conversation = await this.conversation(signal());
    let input = [{ role: 'user', content: task.description }];
    for (let round = 0; ; round++) {
      if (round >= LIMITS.toolRounds) throw Error(`stopped after ${LIMITS.toolRounds} tool rounds without an answer`);
      entry.inFlight = true;
      const r = await this.call('POST', '/responses', { model: this.model, conversation, instructions: this.instructions, input, tools: TOOL_DEFINITIONS, tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: LIMITS.maxOutputTokens, store: true, stream: true, metadata: { hq_task: task.id, hq_run: runId } }, signal());
      if (!r.ok) { entry.inFlight = false; throw await apiError(r); }
      // WORKING starts when OpenAI says it has created the response, not when HQ sent the request.
      const response = await readStream(r, { onCreated: created => { if (!entry.acknowledged) { entry.acknowledged = true; emit({ kind: 'ACK', summary: `OpenAI accepted the request (${this.model}, response ${String(created?.id ?? '').slice(0, 40)}).` }); } } });
      entry.inFlight = false;
      usage.rounds += 1; usage.inputTokens += response.usage?.input_tokens ?? 0; usage.outputTokens += response.usage?.output_tokens ?? 0;
      if (!entry.acknowledged) { entry.acknowledged = true; emit({ kind: 'ACK', summary: `OpenAI answered (${this.model}, response ${String(response.id ?? '').slice(0, 40)}).` }); }
      if (response.error) throw Error(`OpenAI response error: ${String(response.error.message ?? response.error.code ?? 'unknown').slice(0, 300)}`);
      const output = Array.isArray(response.output) ? response.output : [];
      const calls = output.filter(i => i.type === 'function_call');
      if (!calls.length) {
        const answer = textOf(output);
        if (!answer) throw Error(response.status === 'incomplete' ? `response incomplete (${response.incomplete_details?.reason ?? 'unknown reason'})` : 'OpenAI finished without an answer');
        entry.done = true;
        emit({ kind: 'MODEL_RESULT', summary: answer.slice(0, 1900), truncated: answer.length > 1900, outputCharacters: answer.length });
        emit({ kind: 'USAGE', summary: `Counters reported by OpenAI for ${usage.rounds} request(s) and ${usage.toolCalls} tool call(s). Cost is not computed here.`, usage: { source: 'openai-responses', elapsedMs: this.now() - started, model: this.model, ...usage } });
        emit({ kind: 'COMPLETED', summary: toolbox.delegated.length ? `ChatGPT answered and queued ${toolbox.delegated.map(d => `HQ task ${d.taskId}`).join(', ')}. Queued work is done only when HQ shows it DONE.` : 'ChatGPT answered from HQ state. The answer is model output, not verified work.' });
        return;
      }
      input = [];
      for (const c of calls) {
        usage.toolCalls += 1;
        const res = toolbox.call(c.name, c.arguments);
        // Delegations are handoffs in HQ's own evidence vocabulary: they name the new task and its agent.
        if (res.taskId && res.ok) emit({ kind: 'HANDOFF', summary: res.summary, toAgentId: toolbox.delegated.at(-1).agentId === 'kyle' ? null : toolbox.delegated.at(-1).agentId, delegatedTaskId: res.taskId });
        else emit({ kind: 'MODEL_OUTPUT', summary: `ChatGPT tool ${res.name}: ${res.summary}`.slice(0, 600) });
        input.push({ type: 'function_call_output', call_id: c.call_id, output: res.output });
      }
    }
  }
  async cancel(runId) {
    const entry = this.runs.get(runId);
    if (!entry) return false; // absence is not proof a pre-restart request stopped
    entry.abort.abort();
    try { await entry.promise; } catch { /* reported by start */ }
    return true; // our side issues no further requests or tool calls once aborted
  }
  async close() { await Promise.all([...this.runs.keys()].map(id => this.cancel(id))); }
}

// Connects ChatGPT to HQ when a key is configured; otherwise records why it is not connected.
export function connectOrchestrator(engine, { env = process.env, request = fetch, stateDir = null } = {}) {
  const agent = engine.state.agents.chatgpt;
  if (!agent) return 'UNAVAILABLE: no chatgpt agent';
  if (!env.OPENAI_API_KEY) {
    const detail = 'OpenAI runtime not configured (no OPENAI_API_KEY for HQ).';
    if (agent.detail !== detail) engine.emit('AGENT_OBSERVED', { agentId: 'chatgpt', status: 'UNKNOWN', detail });
    return 'NOT_CONFIGURED';
  }
  if (agent.assignment) return 'UNAVAILABLE: chatgpt has an unresolved run';
  const model = env.OPENAI_ORCHESTRATOR_MODEL || DEFAULT_MODEL;
  engine.adapters['openai-orchestrator'] = new OrchestratorAdapter(engine, { apiKey: env.OPENAI_API_KEY, model, request, now: () => engine.now(), stateFile: stateDir ? path.join(stateDir, 'orchestrator.json') : null });
  engine.configureAgent('chatgpt', { model, capabilities: [...new Set([...agent.capabilities, 'coordinate'])], executionAdapter: 'openai-orchestrator', telemetryAdapter: 'openai-responses', usageSource: 'openai-responses', ackTimeoutMs: 90_000 });
  return 'CONFIGURED';
}
