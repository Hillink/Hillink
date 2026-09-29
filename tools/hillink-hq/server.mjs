import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Engine, emptyState, reduce } from './engine.mjs';
import { FileStore } from './store.mjs';
import { LocalAdapter } from './local-adapter.mjs';
import { deliverNotifications, webhookSink } from './notifications.mjs';
import { operations } from './registry.mjs';
import { connectOllama } from './ollama-adapter.mjs';
import { connectCliAgents } from './cli-agent-adapter.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
// Polls return recent events only; the full journal stays on disk and in /api/history replay.
const recentEvents = 300;
const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function body(req) {
  if (req.headers['content-type'] !== 'application/json') throw Error('JSON content type required');
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16_384) throw Error('Request too large'); }
  return JSON.parse(raw);
}

export async function createHQ({ port = 4312, directory = path.join(here, '.state'), store, adapters, sink, intervalMs = 1000, ollama = false, cliAgents = false } = {}) {
  const journal = store ?? new FileStore(directory);
  const local = new LocalAdapter();
  const engine = new Engine({ store: journal, adapters: adapters ?? { 'local-checks': local } });
  engine.initialize();
  let agentsStatus = 'DISABLED';
  if (cliAgents) {
    try { connectCliAgents(engine); agentsStatus = 'CONFIGURED'; }
    catch (error) { agentsStatus = `UNAVAILABLE: ${error.message}`; }
  }
  let ollamaStatus = 'DISABLED';
  if (ollama) {
    try { await connectOllama(engine); ollamaStatus = 'DISCOVERED'; }
    catch (error) { ollamaStatus = `UNAVAILABLE: ${error.message}`; }
  }
  const session = randomBytes(32).toString('hex');
  let origin, timer, closing = false, lastError = null, ticking = Promise.resolve();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      // Loopback binding + exact Host defeats DNS rebinding. Browser writes also need
      // same-origin checks and a per-controller token unavailable cross-origin.
      if (req.headers.host !== new URL(origin).host) return json(403, { error: 'Invalid host' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname]; res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(path.join(here, 'public', file))); return;
      }
      if (req.headers['x-hq-client'] !== 'command-center' || (req.headers.origin && req.headers.origin !== origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) return json(403, { error: 'Same-origin HQ client required' });
      if (req.method === 'GET' && url.pathname === '/api/session') return json(200, { token: session });
      if (!equal(req.headers.authorization, `Bearer ${session}`)) return json(401, { error: 'HQ session required' });
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...engine.snapshot(), events: engine.state.events.slice(-recentEvents), eventCount: engine.state.events.length, operations, health: { controller: lastError ? 'DEGRADED' : 'ONLINE', lastError, externalNotifications: sink ? 'CONFIGURED' : 'UNCONFIGURED', ollama: ollamaStatus, cliAgents: agentsStatus, localOnly: true } });
      if (req.method === 'GET' && url.pathname === '/api/history') {
        const seq = Number(url.searchParams.get('seq') ?? engine.state.seq);
        if (!Number.isSafeInteger(seq) || seq < 0 || seq > engine.state.seq) throw Error('Invalid replay sequence');
        const events = engine.state.events.filter(e => e.seq <= seq);
        const state = events.reduce(reduce, emptyState());
        const replay = new Engine({ store: { read: () => events } }); replay.state = state;
        return json(200, { ...replay.snapshot(events.at(-1)?.at ?? 0), events: events.slice(-recentEvents), eventCount: events.length, replay: true, operations });
      }
      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        const id = engine.createTask(await body(req)); return json(201, { id });
      }
      if (req.method === 'POST' && url.pathname === '/api/alerts/ack') { engine.acknowledgeAlert((await body(req)).key); return json(200, { ok: true }); }
      if (req.method === 'POST' && url.pathname === '/api/runs/reconcile') {
        const input = await body(req); engine.reconcileStoppedRun(input.runId, input.confirmedStopped, input.evidence); return json(200, { ok: true });
      }
      return json(404, { error: 'Not found' });
    } catch (error) { json(400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const tick = () => {
    if (closing) return;
    ticking = (async () => {
      try { await engine.tick(); await deliverNotifications(engine, sink); lastError = null; }
      catch (error) { lastError = error.message; }
      if (!closing) timer = setTimeout(tick, intervalMs);
    })();
    return ticking;
  };
  await tick();
  return { engine, origin, close: async () => {
    closing = true; clearTimeout(timer);
    await ticking;
    await Promise.allSettled([...new Set(Object.values(engine.adapters))].map(adapter => adapter.close?.()));
    await new Promise(resolve => server.close(resolve));
    journal.close();
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sink = process.env.HQ_NOTIFICATION_WEBHOOK ? webhookSink(process.env.HQ_NOTIFICATION_WEBHOOK) : null;
  const hq = await createHQ({ port: Number(process.env.HQ_PORT || 4312), directory: process.env.HQ_STATE_DIR || path.join(here, '.state'), sink, ollama: process.env.HQ_OLLAMA_ENABLED === '1', cliAgents: process.env.HQ_AGENTS_ENABLED === '1' });
  console.log(`Hillink HQ: ${hq.origin} (local control service; cloud execution adapters unavailable)`);
  if (!sink) console.log('External notifications unconfigured. Enable browser notifications or configure HQ_NOTIFICATION_WEBHOOK for delivery when the browser is closed.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await hq.close(); process.exit(0); });
}
