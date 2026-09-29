// Local server for Hillink World. Loopback only, allowlisted static files, and two read-only data routes:
// GET /api/hq relays a trimmed HQ snapshot; GET /api/construction serves construction evidence read from
// the local git clone and the `gh` CLI (adapters/git.mjs), journaled so accepted work survives restarts. The World server holds the HQ session server-side (the same
// local handshake HQ's own page uses); the browser never receives the HQ token and there are no writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createConstructionSource } from './adapters/git.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const listed = (dir, exts) => { try { return fs.readdirSync(path.join(root, dir)).filter(f => exts.includes(path.extname(f))).map(f => `${dir}/${f}`); } catch { return []; } };
const allowed = new Set(['index.html', 'style.css', 'main.mjs', ...['core', 'engine', 'render', 'ui', 'sim', 'adapters', 'themes', 'world'].flatMap(dir => listed(dir, ['.mjs']))]);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" };

// Only what the World draws. Task descriptions, evidence bodies and usage stay in HQ.
export function trimSnapshot(s) {
  const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  const data = e => {
    const d = e.data ?? {};
    if (e.type === 'TASK_CREATED') return pick(d, ['id', 'title', 'operation', 'capability', 'safety', 'ownerAction']);
    if (e.type === 'WORKER_EVENT') return pick(d, ['runId', 'kind', 'summary', 'result', 'completedTests', 'url', 'toAgentId', 'retryAt']);
    if (e.type === 'AGENT_REGISTERED') return pick(d, ['id', 'name', 'role', 'real', 'fantasy']);
    return pick(d, ['agentId', 'taskId', 'runId', 'status', 'detail', 'retryAt', 'reason', 'key', 'kind', 'ownerMustAct', 'ownerAction']);
  };
  return {
    seq: s.seq, now: s.now,
    health: { controller: s.health?.controller ?? null, lastError: s.health?.lastError ?? null },
    agents: (s.agents ?? []).map(a => pick(a, ['id', 'name', 'role', 'real', 'fantasy', 'status', 'assignment', 'detail', 'retryAt'])),
    tasks: (s.tasks ?? []).map(t => ({
      ...pick(t, ['id', 'title', 'stage', 'agentId', 'runId', 'capability', 'operation', 'blocker', 'ownerAction', 'createdAt', 'claimedAt', 'endedAt']),
      // The last few evidence lines (kind, short summary, time) so a reload keeps the task's story; raw payloads stay in HQ.
      ...(Array.isArray(t.evidence) && t.evidence.length ? { evidence: t.evidence.slice(-6).map(e => ({ kind: String(e.kind ?? ''), summary: typeof e.summary === 'string' ? e.summary.slice(0, 200) : null, at: e.at ?? null })) } : {}),
    })),
    runs: Object.fromEntries(Object.entries(s.runs ?? {}).map(([id, r]) => [id, pick(r, ['taskId', 'agentId', 'endedAt'])])),
    alerts: Object.fromEntries(Object.entries(s.alerts ?? {}).map(([k, a]) => [k, pick(a, ['key', 'kind', 'agentId', 'taskId', 'ownerMustAct', 'ownerAction', 'detail', 'active', 'openedAt'])])),
    events: (s.events ?? []).map(e => ({ seq: e.seq, id: e.id, at: e.at, type: e.type, data: data(e) })),
  };
}

export function hqClient(base = 'http://127.0.0.1:4312', { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  let token = null;
  const get = (p, auth) => fetchImpl(new URL(p, base), { headers: { 'x-hq-client': 'command-center', ...(auth ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(timeoutMs) });
  return async function state() {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!token) { const r = await get('/api/session'); if (!r.ok) throw Error(`HQ session refused (${r.status})`); token = (await r.json()).token; }
      const r = await get('/api/state', true);
      if (r.status === 401) { token = null; continue; } // HQ restarted: new session
      if (!r.ok) throw Error(`HQ state failed (${r.status})`);
      return trimSnapshot(await r.json());
    }
    throw Error('HQ session rejected');
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
  };
}

// Polls the construction source on an interval and keeps the journal; get() is what /api/construction serves.
export function constructionFeed({ source, journal, intervalMs = 60000 }) {
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { journal.add(await source.poll()); } catch (e) { source.status.error = String(e.message).slice(0, 200); } finally { busy = false; } };
  tick(); const timer = setInterval(tick, intervalMs); timer.unref?.();
  return { get: () => ({ events: journal.all(), status: { ...source.status } }), tick, stop: () => clearInterval(timer) };
}

export function createServer({ hq = process.env.WORLD_HQ === '0' ? null : hqClient(process.env.HQ_URL || 'http://127.0.0.1:4312'), construction = null } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const host = req.headers.host ?? '', port = req.socket.localPort;
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { ...headers, 'Content-Type': type }); res.end(body); };
    // Exact loopback Host defeats DNS rebinding; the data route also refuses cross-site browser requests.
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(403, '{"error":"Invalid host"}');
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
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (!allowed.has(file)) return send(404, 'Not found', 'text/plain');
    send(200, fs.readFileSync(path.join(root, file)), types[path.extname(file)]);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORLD_PORT || 4320);
  const repo = path.resolve(root, '../..');
  const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { cwd: repo, timeout: 30000, maxBuffer: 8e6, windowsHide: true }, (e, out) => (e ? reject(e) : resolve(out))));
  const construction = process.env.WORLD_GIT === '0' ? null : constructionFeed({
    source: createConstructionSource({ run }),
    journal: createJournal(path.join(process.env.WORLD_STATE_DIR || path.join(os.homedir(), '.hillink-world'), 'construction.jsonl')),
    intervalMs: Number(process.env.WORLD_GIT_INTERVAL_MS || 60000),
  });
  createServer({ construction }).listen(port, '127.0.0.1', () => console.log(`Hillink World: http://127.0.0.1:${port} (live from HQ at ${process.env.HQ_URL || 'http://127.0.0.1:4312'} when it is running, otherwise simulation)`));
}
