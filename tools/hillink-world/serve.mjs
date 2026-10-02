// Local server for Hillink World. Loopback only, allowlisted static files, and these routes:
// GET /api/hq relays a trimmed HQ snapshot; GET /api/construction serves construction evidence read from
// the local git clone and the `gh` CLI (adapters/git.mjs), journaled so accepted work survives restarts.
// /api/commands (Pass 1) is the one write: a same-origin POST becomes an HQ task through HQ's own validation,
// limited to COMMANDABLE agents and operations, and journaled in commands.jsonl; GET returns that history
// joined with HQ's task outcome. GET /api/site (Pass 5A) serves the persisted canonical procedural world, read-only.
// The World server holds the HQ session server-side (the same local handshake
// HQ's own page uses); the browser never receives the HQ token.
// GET /assets/characters/index.json (Art Factory Step 1) lists the generated character sheets; only sheet.json and
// sheet.png under assets/characters/<agent>/<theme>/x<scale>/ are served (data, never code).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createConstructionSource } from './adapters/git.mjs';
import { hqDefinitions } from './adapters/hq.mjs';
import { DEFAULT_DEFINITIONS } from './core/agents.mjs';
import { openWorldFile } from './procgen/persist.mjs';
import { applyHqEvent, fromHqActivity } from './procgen/contract.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const listed = (dir, exts) => { try { return fs.readdirSync(path.join(root, dir)).filter(f => exts.includes(path.extname(f))).map(f => `${dir}/${f}`); } catch { return []; } };
const allowed = new Set(['index.html', 'style.css', 'main.mjs', 'site.html', 'site.mjs', 'site.css', 'lineup.html', ...['core', 'engine', 'render', 'render/art5d', 'render/art', 'render/px', 'ui', 'sim', 'adapters', 'themes', 'themes/fantasy', 'world', 'procgen'].flatMap(dir => listed(dir, ['.mjs']))]);
for (const f of ['procgen/persist.mjs', 'procgen/evidence.mjs', 'render/px/png.mjs']) allowed.delete(f); // server side only (file system)
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" };

// Art Factory Step 1: the generated sheets on disk, as { agent, theme, scale }. Folder names are checked; contents are
// validated by the browser loader (render/px/authored.mjs) before use.
export function characterSheets(dir = path.join(root, 'assets', 'characters')) {
  const out = [], ids = d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-z0-9-]{1,40}$/.test(e.name)).map(e => e.name).sort(); } catch { return []; } };
  for (const agent of ids(dir)) for (const theme of ids(path.join(dir, agent))) {
    for (const s of [1, 2, 3, 4]) if (fs.existsSync(path.join(dir, agent, theme, `x${s}`, 'sheet.json'))) out.push({ agent, theme, scale: s });
  }
  return out;
}
// Pass 5F: the part of an HQ-created agent's definition the World may see: no instructions, no custom metadata.
export const publicDefinition = d => (d && typeof d === 'object' ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'instructions' && k !== 'meta')) : null);
// Only what the World draws. Task descriptions, evidence bodies and usage stay in HQ.
export function trimSnapshot(s) {
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  const data = e => {
    const d = e.data ?? {};
    if (e.type === 'TASK_CREATED') return pick(d, ['id', 'title', 'operation', 'capability', 'safety', 'ownerAction']);
    if (e.type === 'WORKER_EVENT') return pick(d, ['runId', 'kind', 'summary', 'result', 'completedTests', 'url', 'toAgentId', 'retryAt', 'requeue']);
    // Pass 5F: agent creation and lifecycle. The definition is HQ-validated; HQ-only fields stay in HQ.
    if (e.type === 'AGENT_CREATED') return { id: d.id, definition: publicDefinition(d.definition), detail: d.detail ?? null };
    if (e.type === 'AGENT_LIFECYCLE') return pick(d, ['agentId', 'to', 'stage', 'detail']);
    if (e.type === 'AGENT_REGISTERED') return pick(d, ['id', 'name', 'role', 'real', 'fantasy', 'provider', 'model', 'team', 'description', 'capabilities', 'tools', 'attribution']);
    return pick(d, ['agentId', 'taskId', 'runId', 'status', 'detail', 'retryAt', 'reason', 'key', 'kind', 'ownerMustAct', 'ownerAction']);
  };
  return {
    seq: s.seq, now: s.now,
    health: { controller: s.health?.controller ?? null, lastError: s.health?.lastError ?? null },
    agents: (s.agents ?? []).map(a => ({
      ...pick(a, ['id', 'name', 'role', 'real', 'fantasy', 'status', 'assignment', 'detail', 'retryAt', 'executionAdapter', 'adapterAvailable', 'attribution', 'provider', 'model', 'capabilities']),
      ...(a.lifecycle ? { lifecycle: { state: a.lifecycle.state, since: a.lifecycle.since, detail: a.lifecycle.detail ?? null, readied: Boolean(a.lifecycle.readied), history: (a.lifecycle.history ?? []).map(h => ({ state: h.state, at: h.at, detail: typeof h.detail === 'string' ? h.detail.slice(0, 300) : null })) }, definition: publicDefinition(a.definition) } : {}),
    })),
    tasks: (s.tasks ?? []).map(t => ({
      ...pick(t, ['id', 'title', 'stage', 'agentId', 'runId', 'capability', 'operation', 'safety', 'preferredAgentId', 'requestedBy', 'blocker', 'ownerAction', 'createdAt', 'claimedAt', 'endedAt']),
      // The last few evidence lines (kind, short summary, time) so a reload keeps the task's story; raw payloads stay in HQ.
      ...(Array.isArray(t.evidence) && t.evidence.length ? { evidence: t.evidence.slice(-6).map(e => ({ kind: String(e.kind ?? ''), summary: typeof e.summary === 'string' ? e.summary.slice(0, 200) : null, at: e.at ?? null, ...(typeof e.delegatedTaskId === 'string' ? { delegatedTaskId: e.delegatedTaskId } : {}) })) } : {}),
    })),
    runs: Object.fromEntries(Object.entries(s.runs ?? {}).map(([id, r]) => [id, pick(r, ['taskId', 'agentId', 'endedAt', 'acknowledgedAt', 'heartbeatAt', 'lastMeaningfulAt', 'terminal'])])),
    alerts: Object.fromEntries(Object.entries(s.alerts ?? {}).map(([k, a]) => [k, pick(a, ['key', 'kind', 'agentId', 'taskId', 'ownerMustAct', 'ownerAction', 'detail', 'active', 'openedAt'])])),
    events: (s.events ?? []).map(e => ({ seq: e.seq, id: e.id, at: e.at, type: e.type, data: data(e) })),
  };
}

export function hqClient(base = 'http://127.0.0.1:4312', { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  let token = null;
  const call = (p, { auth, method = 'GET', body } = {}) => fetchImpl(new URL(p, base), {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'x-hq-client': 'command-center', ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // One authenticated request, opening a new session once if HQ restarted.
  async function authed(p, opts) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!token) { const r = await call('/api/session'); if (!r.ok) throw Error(`HQ session refused (${r.status})`); token = (await r.json()).token; }
      const r = await call(p, { ...opts, auth: true });
      if (r.status === 401) { token = null; continue; } // HQ restarted: new session
      return r;
    }
    throw Error('HQ session rejected');
  }
  async function raw() { const r = await authed('/api/state'); if (!r.ok) throw Error(`HQ state failed (${r.status})`); return r.json(); }
  const state = async () => trimSnapshot(await raw());
  state.raw = raw;
  // The only write: a task through HQ's own validated POST /api/tasks (allowlisted operations, explicit safety
  // class, capability check). HQ, not the World, decides whether, when and how it runs.
  state.createTask = async input => {
    const r = await authed('/api/tasks', { method: 'POST', body: input });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(body.error ?? `HQ refused the task (${r.status})`);
    return body.id;
  };
  // Pass 5B: HQ's World contract feed (GET /api/world, read-only): activity items since a journal sequence number.
  state.activity = async since => { const r = await authed(`/api/world?since=${Number(since) || 0}`); if (!r.ok) throw Error(`HQ world feed failed (${r.status})`); return r.json(); };
  return state;
}

// Pass 5B: the live bridge. HQ's facts (its World contract feed) are applied to the persisted canonical world through
// the contract (procgen/contract.mjs): only HQ events, each once, recorded in history. The cursor (the last HQ journal
// sequence applied) lives beside the world file, so a restart continues where it stopped. Never writes to HQ.
//
// Durability (Pass 5B correction): the durable cursor never runs ahead of the durably saved world. Applying a batch
// marks the world dirty; the cursor file is written only after the world holding those facts has been saved. A failed
// save leaves the world dirty and the durable cursor where it was, and every later tick retries the save first, even
// when HQ has nothing new. A restart after a failed save reloads the older world with the older cursor, so HQ delivers
// the lost facts again; a crash between the two writes leaves the cursor behind, and the applied-id set makes the
// redelivered facts no-ops. Each fact ends up in the durable world exactly once.
const writeCursorFile = (cursorFile, seq) => { fs.mkdirSync(path.dirname(cursorFile), { recursive: true }); const tmp = `${cursorFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ seq })); fs.renameSync(tmp, cursorFile); };
export function siteFeed({ hq, site, cursorFile, intervalMs = 15000, writeCursor = seq => writeCursorFile(cursorFile, seq), autostart = true }) {
  let durable = 0, busy = false;
  try { durable = Number(JSON.parse(fs.readFileSync(cursorFile, 'utf8')).seq) || 0; } catch { /* first run */ }
  let cursor = durable, dirty = false;
  const status = { cursor, durableCursor: durable, dirty, applied: 0, refused: 0, error: null };
  const persist = () => {
    try { if (dirty) { site.save(); dirty = false; } } catch (error) { throw Error(`world save failed (will retry): ${error.message}`); }
    if (cursor !== durable) { writeCursor(cursor); durable = cursor; }
  };
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      persist(); // an earlier failed save is retried before anything else
      const body = await hq.activity(cursor);
      for (const item of body.activity ?? []) {
        const ev = fromHqActivity(item);
        if (ev) { const r = applyHqEvent(site.world, ev); if (r.applied) { dirty = true; status.applied++; } else if (r.reason !== 'already applied') status.refused++; }
        cursor = Math.max(cursor, Number(item.seq) || 0);
      }
      persist();
      status.error = null;
    } catch (error) { status.error = String(error.cause?.code ?? error.message).slice(0, 200); } finally { Object.assign(status, { cursor, durableCursor: durable, dirty }); busy = false; }
  };
  let timer = null;
  if (autostart) { tick(); timer = setInterval(tick, intervalMs); timer.unref?.(); }
  return { tick, status, stop: () => clearInterval(timer) };
}

// The HQ operations a World command may become (all read-only), in preference order, each keyed by the HQ capability
// that performs it. Pass 5F: which agents take commands, and which operation, follows from HQ's agent configuration
// (capabilities and lifecycle), never from an agent's id; a new agent HQ activates with a capability here is
// commandable with no change to this file. Whether its backend can actually run is HQ's call: HQ queues the task for
// that agent only (preferredAgentId), so a command never quietly moves to another agent.
export const COMMAND_OPERATIONS = [
  // Pass 2.5: the orchestrator. HQ runs it through its adapter with narrow HQ tools.
  { capability: 'coordinate', operation: 'orchestrate', priority: 60, label: n => `Ask ${n}, the orchestrator`, limits: n => `${n} reads HQ and can queue read-only reviews or ask you to decide. It cannot edit code or run commands.` },
  // Pass 1: a read-only repository review (a signed-in CLI with Read, Grep and Glob only).
  { capability: 'review-repo', operation: 'review-repo', priority: 50, label: n => `Ask ${n} a read-only question about the repository`, limits: n => `${n} can only read files for this: no edits, shell, deploys or database access.` },
  { capability: 'summarize', operation: 'summarize-local', priority: 50, label: n => `Ask ${n} to summarize text (local model)`, limits: n => `${n} summarizes only the text you send: no tools, files or network.` },
  { capability: 'inspect-repo', operation: 'inspect-repo', priority: 50, label: n => `Ask ${n} to inventory the repository source`, limits: n => `${n} lists source files in app/ and lib/; your text is recorded with the task but does not change the check.` },
  { capability: 'verify-unit', operation: 'verify-unit', priority: 50, label: n => `Ask ${n} to run the Hillink unit tests`, limits: n => `${n} runs the existing unit tests locally; no edits, network or credentials.` },
  { capability: 'verify-hq', operation: 'verify-hq', priority: 50, label: n => `Ask ${n} to run the HQ foundation tests`, limits: n => `${n} runs HQ's engine and store tests locally; no edits, network or credentials.` },
];
// agentId -> command spec, from HQ's agent list. Only working members: an HQ-created agent must be ACTIVE.
export function commandableOf(agents) {
  const out = {};
  for (const a of Array.isArray(agents) ? agents : []) {
    if (!a || typeof a.id !== 'string' || !Array.isArray(a.capabilities)) continue;
    if (a.lifecycle && a.lifecycle.state !== 'ACTIVE') continue;
    const op = COMMAND_OPERATIONS.find(o => a.capabilities.includes(o.capability));
    const name = typeof a.name === 'string' ? a.name.slice(0, 60) : a.id;
    if (op) out[a.id] = { operation: op.operation, safety: 'local-read-only', priority: op.priority, label: op.label(name), limits: op.limits(name) };
  }
  return out;
}
const COMMAND_ID = /^[A-Za-z0-9-]{8,64}$/;
const TERMINAL_KINDS = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'RATE_LIMITED', 'BLOCKED', 'UNCERTAIN']);

// A command joined with HQ's task record: what was asked, which HQ task it became, and what actually happened.
export function commandView(record, hqTasks) {
  const t = record.taskId && hqTasks ? hqTasks.find(x => x.id === record.taskId) : null;
  const ev = t?.evidence ?? [], result = ev.filter(e => e.kind === 'MODEL_RESULT').at(-1), terminal = ev.filter(e => TERMINAL_KINDS.has(e.kind)).at(-1);
  return {
    ...record,
    hq: t ? {
      stage: t.stage, agentId: t.agentId ?? null, runId: t.runId ?? null, blocker: t.blocker ?? null, claimedAt: t.claimedAt ?? null, endedAt: t.endedAt ?? null,
      result: typeof result?.summary === 'string' ? result.summary.slice(0, 1900) : null,
      outcome: terminal ? { kind: terminal.kind, summary: String(terminal.summary ?? '').slice(0, 400), at: terminal.at ?? null } : null,
    } : null,
  };
}

// POST /api/commands. Idempotent by commandId: a repeat (double click, retry, reload) returns the first
// record and never creates a second HQ task.
export function commandHandler({ hq, journal, now = Date.now }) {
  const inflight = new Map();
  return async function submit(input) {
    const commandId = String(input?.commandId ?? ''), agentId = String(input?.agentId ?? ''), instruction = typeof input?.instruction === 'string' ? input.instruction.trim() : '';
    if (!COMMAND_ID.test(commandId)) return { code: 400, body: { error: 'commandId required' } };
    const existing = journal.get(commandId);
    if (existing) return { code: 200, body: { ...existing, duplicate: true } };
    if (inflight.has(commandId)) return { code: 200, body: { ...(await inflight.get(commandId)), duplicate: true } };
    if (!instruction || instruction.length > 2000) return { code: 400, body: { error: 'The instruction must be 1 to 2000 characters.' } };
    // HQ's current agent list decides who is commandable (Pass 5F); unknown means nobody.
    let agents;
    try { agents = hq.raw ? (await hq.raw()).agents ?? [] : []; } catch (error) { return { code: 502, body: { error: `HQ is not reachable: ${String(error.cause?.code ?? error.message).slice(0, 160)}` } }; }
    const spec = commandableOf(agents)[agentId];
    if (!spec) return { code: 400, body: { error: `${agentId || 'That agent'} cannot take commands from the World (it is not an active HQ agent with a command capability).` } };
    if (journal.get(commandId)) return { code: 200, body: { ...journal.get(commandId), duplicate: true } };
    if (inflight.has(commandId)) return { code: 200, body: { ...(await inflight.get(commandId)), duplicate: true } };
    const work = (async () => {
      const record = { id: commandId, at: now(), agentId, instruction, operation: spec.operation, taskId: null, error: null };
      try {
        // Never queue work for an agent HQ says is not connected: it would sit there looking accepted.
        const a = agents.find(x => x.id === agentId); if (a && a.adapterAvailable === false) throw Error(`${a.name} is not connected in HQ: ${String(a.detail ?? 'no runtime').slice(0, 160)}`);
        record.taskId = await hq.createTask({ title: `World request: ${instruction.replace(/\s+/g, ' ').slice(0, 120)}`, description: instruction, operation: spec.operation, safety: spec.safety, priority: spec.priority, preferredAgentId: agentId });
      } catch (error) { record.error = String(error.cause?.code ?? error.message).slice(0, 300); }
      journal.add([record]); // refusals are history too
      return record;
    })();
    inflight.set(commandId, work);
    try { const record = await work; return { code: record.taskId ? 201 : 502, body: record }; } finally { inflight.delete(commandId); }
  };
}

// Append-only construction journal (outside the repo). Each line is one evidence event with its source time,
// so a restart, a reload or HQ reconnecting never resets the building; replay is the file in order.
export function createJournal(file) {
  const events = new Map();
  try { for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line.trim()) { try { const e = JSON.parse(line); if (e?.id) events.set(e.id, e); } catch { /* skip a torn line */ } } } catch { /* first run */ }
  return {
    add(list) {
      const fresh = list.filter(e => e?.id && !events.has(e.id));
      if (!fresh.length) return 0;
      for (const e of fresh) events.set(e.id, e);
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, fresh.map(e => JSON.stringify(e)).join('\n') + '\n'); } catch { /* still served from memory */ }
      return fresh.length;
    },
    all: () => [...events.values()].sort((a, b) => a.at - b.at),
    get: id => events.get(id) ?? null,
  };
}

// Polls the construction source on an interval and keeps the journal; get() is what /api/construction serves.
export function constructionFeed({ source, journal, intervalMs = 60000 }) {
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { journal.add(await source.poll()); } catch (e) { source.status.error = String(e.message).slice(0, 200); } finally { busy = false; } };
  tick(); const timer = setInterval(tick, intervalMs); timer.unref?.();
  return { get: () => ({ events: journal.all(), status: { ...source.status } }), tick, stop: () => clearInterval(timer) };
}

export function createServer({ hq = process.env.WORLD_HQ === '0' ? null : hqClient(process.env.HQ_URL || 'http://127.0.0.1:4312'), construction = null, commands = null, site = null } = {}) {
  const submit = commands && hq?.createTask ? commandHandler({ hq, journal: commands }) : null;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const host = req.headers.host ?? '', port = req.socket.localPort;
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { ...headers, 'Content-Type': type }); res.end(body); };
    // Exact loopback Host defeats DNS rebinding; the data route also refuses cross-site browser requests.
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(403, '{"error":"Invalid host"}');
    if (url.pathname === '/api/commands') {
      const site = req.headers['sec-fetch-site'];
      if ((site && site !== 'same-origin') || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, '{"error":"Same-origin only"}');
      if (req.method === 'POST') {
        // A write needs a browser same-origin fetch with a JSON body; a cross-site form or link cannot send one.
        if (!submit) return send(503, '{"error":"Commands disabled"}');
        if (site !== 'same-origin' || !/^application\/json\b/.test(req.headers['content-type'] ?? '')) return send(403, '{"error":"Same-origin JSON only"}');
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return send(413, '{"error":"Too large"}'); }
        let input; try { input = JSON.parse(raw); } catch { return send(400, '{"error":"Invalid JSON"}'); }
        const { code, body } = await submit(input);
        return send(code, JSON.stringify(body));
      }
      if (req.method !== 'GET') return send(405, '{"error":"GET or POST only"}');
      const list = commands ? commands.all().slice(-20) : [];
      let tasks = null, agents = [], hqError = null;
      if ((list.length || submit) && hq?.raw) { try { const raw = await hq.raw(); tasks = raw.tasks ?? []; agents = raw.agents ?? []; } catch (error) { hqError = String(error.cause?.code ?? error.message).slice(0, 200); } }
      return send(200, JSON.stringify({ commandable: submit ? commandableOf(agents) : {}, hqError, commands: list.map(r => commandView(r, tasks)).reverse() }));
    }
    if (req.method !== 'GET') return send(405, '{"error":"Read-only"}');
    if (url.pathname === '/api/hq') {
      const site = req.headers['sec-fetch-site'];
      if ((site && site !== 'same-origin') || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, '{"error":"Same-origin only"}');
      if (!hq) return send(404, '{"error":"HQ feed disabled"}');
      // HQ being down is a normal state for this page (it falls back to simulation), so it is data, not an HTTP error.
      try { return send(200, JSON.stringify(await hq())); } catch (error) { return send(200, JSON.stringify({ offline: true, error: String(error.cause?.code ?? error.message).slice(0, 200) })); }
    }
    if (url.pathname === '/api/construction') {
      const site = req.headers['sec-fetch-site'];
      if ((site && site !== 'same-origin') || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, '{"error":"Same-origin only"}');
      if (!construction) return send(200, JSON.stringify({ events: [], status: { disabled: true } }));
      return send(200, JSON.stringify(construction.get()));
    }
    if (url.pathname === '/api/site') {
      const fetchSite = req.headers['sec-fetch-site'];
      if ((fetchSite && fetchSite !== 'same-origin') || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, '{"error":"Same-origin only"}');
      if (!site) return send(404, '{"error":"Procedural world disabled"}');
      return send(200, JSON.stringify({ world: site.world }));
    }
    if (url.pathname === '/assets/characters/index.json') return send(200, JSON.stringify({ sheets: characterSheets() }));
    const sheet = /^\/assets\/characters\/([a-z0-9-]{1,40})\/([a-z0-9-]{1,40})\/x([1-4])\/(sheet\.json|sheet\.png)$/.exec(url.pathname);
    if (sheet) {
      const f = path.join(root, 'assets', 'characters', sheet[1], sheet[2], `x${sheet[3]}`, sheet[4]);
      if (!fs.existsSync(f) || fs.lstatSync(f).isSymbolicLink()) return send(404, 'Not found', 'text/plain');
      return send(200, fs.readFileSync(f), sheet[4].endsWith('.png') ? 'image/png' : 'application/json');
    }
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (!allowed.has(file)) return send(404, 'Not found', 'text/plain');
    send(200, fs.readFileSync(path.join(root, file)), types[path.extname(file)]);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORLD_PORT || 4320);
  const repo = path.resolve(root, '../..');
  const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { cwd: repo, timeout: 30000, maxBuffer: 8e6, windowsHide: true }, (e, out) => (e ? reject(e) : resolve(out))));
  // 5E correction (B6): commits and reviews are attributed from the live registry: the defaults plus the agents HQ defines.
  const registryHq = process.env.WORLD_HQ === '0' ? null : hqClient(process.env.HQ_URL || 'http://127.0.0.1:4312');
  const registry = async () => ({ ...DEFAULT_DEFINITIONS, ...(registryHq ? hqDefinitions(await registryHq().catch(() => null)) : {}) });
  const construction = process.env.WORLD_GIT === '0' ? null : constructionFeed({
    source: createConstructionSource({ run, registry }),
    journal: createJournal(path.join(process.env.WORLD_STATE_DIR || path.join(os.homedir(), '.hillink-world'), 'construction.jsonl')),
    intervalMs: Number(process.env.WORLD_GIT_INTERVAL_MS || 60000),
  });
  const commands = process.env.WORLD_HQ === '0' ? null : createJournal(path.join(process.env.WORLD_STATE_DIR || path.join(os.homedir(), '.hillink-world'), 'commands.jsonl'));
  // Pass 5A: the canonical procedural world, founded once from WORLD_SEED and then only ever loaded.
  const stateDir = process.env.WORLD_STATE_DIR || path.join(os.homedir(), '.hillink-world');
  const site = openWorldFile(path.join(stateDir, 'site.json'), { seed: process.env.WORLD_SEED || 'hillink' });
  if (process.env.WORLD_HQ !== '0') siteFeed({ hq: hqClient(process.env.HQ_URL || 'http://127.0.0.1:4312'), site, cursorFile: path.join(stateDir, 'site-hq-cursor.json'), intervalMs: Number(process.env.WORLD_SITE_INTERVAL_MS || 15000) });
  createServer({ construction, commands, site }).listen(port, '127.0.0.1', () => console.log(`Hillink World: http://127.0.0.1:${port} (live from HQ at ${process.env.HQ_URL || 'http://127.0.0.1:4312'} when it is running, otherwise simulation)`));
}
