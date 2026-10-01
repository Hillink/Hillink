// HQ supervisor: the small, long-lived parent process that owns HQ's lifecycle, one level above HQ.
//
//   start-hillink-hq.ps1 -> node supervisor.mjs -> node server.mjs (child, with an IPC channel)
//
// restart_hq (restart.mjs) records the request in HQ's journal and asks the supervisor over IPC. The supervisor:
//   1. accepts at most one restart at a time (a second request is answered as a duplicate), with a cooldown and an
//      hourly cap, and acknowledges before doing anything so the caller gets an answer;
//   2. asks HQ to shut down gracefully (HQ stops dispatching, closes its adapters, journal and lock, then exits);
//   3. after a bounded wait force-kills the process tree (taskkill /T /F on Windows), and releases controller.lock
//      only when the pid it names is proven gone; if the old HQ cannot be proven stopped, no second HQ is started;
//   4. relaunches the same code from disk (it never pulls or changes code) and health-checks the new HQ: process
//      alive, /api/state answering with a journal at least as long as before, agents registered, ingress listening;
//   5. retries a bounded number of times with backoff, then stops and leaves a diagnostic (status file, log, and a
//      minimal "HQ is down" answer on the connector port) instead of looping;
//   6. hands the outcome to the new HQ, which journals it (HQ_RESTART completed / failed).
// It also recovers an HQ process that exits unexpectedly, rate-limited. It never restarts HQ because of a worker or
// agent problem (Claude offline, Codex usage limit, ...): those are HQ's business, not a sign HQ is unhealthy.
import { fork, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const SUPERVISOR_LIMITS = Object.freeze({
  cooldownMs: 120_000, // between accepted restarts
  maxPerHour: 6,
  ackGraceMs: 1_500, // lets the acknowledgement reach the caller before HQ starts shutting down
  gracefulMs: 30_000, // HQ's own graceful close
  forceWaitMs: 15_000, // after taskkill /T /F
  healthTimeoutMs: 90_000,
  healthPollMs: 2_000,
  maxAttempts: 3,
  backoffMs: [5_000, 15_000, 45_000],
  autoRecoverPerHour: 3,
});

export class Supervisor {
  // launch() -> child { pid, send(msg), on('message'|'exit') }; killTree(pid); isAlive(pid); health({ child, minEvents })
  // -> { ok, detail, eventCount }; lock: { owner() -> pid|null, release() }; log(entry); status(record).
  constructor({ launch, killTree, isAlive, health, lock, log = () => {}, status = () => {}, gitHead = () => null, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), limits = SUPERVISOR_LIMITS, down = null }) {
    Object.assign(this, { launch, killTree, isAlive, health, lock, log, writeStatus: status, gitHead, now, sleep, limits, down });
    this.child = null; this.restarting = null; this.accepted = []; this.recoveries = []; this.lastEventCount = 0; this.pending = []; this.stopping = false; this.state = 'IDLE';
  }

  // Boot: start HQ (with the same bounded retries). Any outcome that HQ has not journaled yet is handed to it.
  async start() {
    const ok = await this.bring({ id: null, kind: 'start' });
    return ok;
  }

  attach(child) {
    this.child = child;
    child.on('message', msg => this.onMessage(child, msg));
    child.once('exit', (code, signal) => this.onExit(child, code, signal));
  }

  onMessage(child, msg) {
    if (msg?.type !== 'restart-request' || child !== this.child) return;
    const answer = ack => { try { child.send({ type: 'restart-ack', id: msg.id, ...ack }); } catch { /* HQ gone */ } };
    const decision = this.decide(msg);
    answer(decision);
    if (!decision.accepted) { this.log({ event: 'restart-refused', id: msg.id, by: msg.by, reason: decision.reason }); return; }
    this.log({ event: 'restart-accepted', id: msg.id, by: msg.by, reason: msg.reason, pid: child.pid });
    void this.restart({ id: msg.id, reason: msg.reason, by: msg.by });
  }

  decide({ id, reason, by }) {
    if (typeof id !== 'string' || typeof reason !== 'string' || !reason.trim() || typeof by !== 'string') return { accepted: false, reason: 'malformed restart request' };
    if (this.restarting) return { accepted: false, duplicate: true, activeId: this.restarting.id, reason: `restart ${this.restarting.id} is already in progress` };
    const now = this.now();
    this.accepted = this.accepted.filter(t => now - t < 3_600_000);
    const last = this.accepted.at(-1);
    if (last != null && now - last < this.limits.cooldownMs) { const wait = Math.ceil((this.limits.cooldownMs - (now - last)) / 1000); return { accepted: false, reason: `cooldown: the last restart was ${Math.round((now - last) / 1000)} s ago; try again in ${wait} s`, retryAfterSeconds: wait }; }
    if (this.accepted.length >= this.limits.maxPerHour) return { accepted: false, reason: `rate limit: ${this.limits.maxPerHour} restarts in the last hour`, retryAfterSeconds: Math.ceil((this.accepted[0] + 3_600_000 - now) / 1000) };
    this.accepted.push(now);
    this.restarting = { id, startedAt: now };
    return { accepted: true, id };
  }

  async restart({ id, reason, by }) {
    const startedAt = this.now(), headBefore = this.gitHead();
    const old = this.child;
    let forced = false;
    try {
      await this.sleep(this.limits.ackGraceMs);
      this.state = 'STOPPING';
      const stopped = await this.stop(old, id);
      forced = stopped.forced;
      if (!stopped.ok) {
        // Never start a second controller beside one that may still be alive.
        const record = { id, phase: 'failed', by, reason, oldPid: old?.pid ?? null, diagnostic: stopped.diagnostic, durationMs: this.now() - startedAt };
        this.log({ event: 'restart-failed', ...record });
        this.writeStatus({ state: 'FAILED', ...record });
        if (old && this.isAlive(old.pid)) {
          // The old HQ is still running: it resumes work and journals the failed restart itself.
          this.expectExit = null; this.state = 'RUNNING';
          try { old.send({ type: 'restart-aborted', id }); old.send({ type: 'restart-record', record }); } catch { this.pending.push(record); }
        } else { this.pending.push(record); this.child = null; this.state = 'DOWN'; if (this.down) await this.down.open(record).catch(() => {}); }
        return false;
      }
      return await this.bring({ id, kind: 'restart', reason, by, oldPid: old?.pid ?? null, forced, startedAt, headBefore });
    } finally { this.restarting = null; }
  }

  // Graceful, then forced. ok only when the old pid is proven gone and its lock (if any) released.
  async stop(child, id) {
    if (!child) return { ok: true, forced: false };
    const exited = new Promise(resolve => { if (child.exitCode != null || child.signalCode != null) resolve(true); else child.once('exit', () => resolve(true)); });
    const within = ms => Promise.race([exited, this.sleep(ms).then(() => false)]);
    this.expectExit = child;
    try { child.send({ type: 'shutdown', id }); } catch { /* channel closed: the force path decides */ }
    let forced = false;
    if (!(await within(this.limits.gracefulMs))) {
      forced = true;
      this.log({ event: 'graceful-timeout', id, pid: child.pid });
      try { this.killTree(child.pid); } catch (error) { this.log({ event: 'kill-error', id, pid: child.pid, error: String(error.message).slice(0, 200) }); }
      await within(this.limits.forceWaitMs);
    }
    if (this.isAlive(child.pid)) return { ok: false, forced, diagnostic: `HQ process ${child.pid} did not stop (graceful ${this.limits.gracefulMs / 1000} s, then taskkill /T /F); no new HQ was started.` };
    const owner = this.lock.owner();
    if (owner != null && owner !== child.pid && this.isAlive(owner)) return { ok: false, forced, diagnostic: `controller.lock belongs to another live process (${owner}); no new HQ was started.` };
    if (owner != null && !this.isAlive(owner)) { this.lock.release(); this.log({ event: 'lock-released', id, pid: owner }); }
    return { ok: true, forced };
  }

  // Launch + health check, bounded attempts with backoff. Never loops forever.
  async bring({ id, kind, reason = null, by = null, oldPid = null, forced = false, startedAt = this.now(), headBefore = this.gitHead() }) {
    this.state = 'STARTING';
    let diagnostic = null;
    for (let attempt = 1; attempt <= this.limits.maxAttempts; attempt++) {
      if (this.down) await this.down.close().catch(() => {});
      let child;
      try { child = this.launch(); } catch (error) { diagnostic = `launch failed: ${String(error.message).slice(0, 300)}`; child = null; }
      if (child) {
        this.attach(child);
        this.log({ event: 'launched', id, kind, attempt, pid: child.pid });
        const h = await this.waitHealthy(child);
        if (h.ok) {
          this.lastEventCount = Math.max(this.lastEventCount, h.eventCount ?? 0);
          const record = { id, phase: kind === 'restart' ? 'completed' : 'started', by, reason, oldPid, newPid: child.pid, attempts: attempt, forced, durationMs: this.now() - startedAt, gitHeadBefore: headBefore, gitHeadAfter: this.gitHead() };
          this.log({ event: kind === 'restart' ? 'restart-completed' : `${kind}-completed`, ...record });
          this.writeStatus({ state: 'RUNNING', ...record });
          this.state = 'RUNNING';
          // HQ journals what it has not seen: this outcome, and any failure recorded while it was down.
          for (const r of [...this.pending, ...(kind === 'restart' || kind === 'recover' ? [record] : [])]) try { child.send({ type: 'restart-record', record: r }); } catch { /* journaled on the next start */ }
          this.pending = [];
          return true;
        }
        diagnostic = h.detail;
        this.log({ event: 'health-failed', id, attempt, pid: child.pid, detail: h.detail });
        const stopped = await this.stop(child, id);
        if (!stopped.ok) { diagnostic = `${h.detail}; then ${stopped.diagnostic}`; break; }
      }
      if (attempt < this.limits.maxAttempts) await this.sleep(this.limits.backoffMs[attempt - 1] ?? this.limits.backoffMs.at(-1));
    }
    this.child = null; this.state = 'DOWN';
    const record = { id, phase: 'failed', by, reason, oldPid, attempts: this.limits.maxAttempts, diagnostic: String(diagnostic ?? 'unknown').slice(0, 600), durationMs: this.now() - startedAt };
    this.log({ event: `${kind}-failed`, ...record });
    this.pending.push(record);
    this.writeStatus({ state: 'DOWN', ...record, next: 'HQ is down. Kyle: check the supervisor log and the HQ logs, fix the cause, then run start-hillink-hq.ps1 (or restart the supervisor). Nothing was deleted.' });
    if (this.down) await this.down.open({ ...record }).catch(error => this.log({ event: 'down-responder-error', error: String(error.message).slice(0, 200) }));
    return false;
  }

  async waitHealthy(child) {
    const deadline = this.now() + this.limits.healthTimeoutMs;
    let last = 'no health answer yet';
    while (this.now() < deadline) {
      if (!this.isAlive(child.pid) || child.exitCode != null) return { ok: false, detail: `HQ process ${child.pid} exited during startup (code ${child.exitCode ?? 'unknown'}); see the HQ logs` };
      try { const h = await this.health({ child, minEvents: this.lastEventCount }); if (h.ok) return h; last = h.detail; } catch (error) { last = String(error.message).slice(0, 200); }
      await this.sleep(this.limits.healthPollMs);
    }
    return { ok: false, detail: `HQ did not pass its health check within ${this.limits.healthTimeoutMs / 1000} s: ${last}` };
  }

  // An HQ that exits on its own (not during a restart or supervisor shutdown) is recovered, rate-limited.
  onExit(child, code, signal) {
    if (child !== this.child || this.stopping || this.restarting || this.expectExit === child) return;
    this.child = null;
    const now = this.now();
    this.recoveries = this.recoveries.filter(t => now - t < 3_600_000);
    this.log({ event: 'hq-exited', pid: child.pid, code, signal });
    if (this.recoveries.length >= this.limits.autoRecoverPerHour) {
      const record = { id: null, phase: 'failed', by: 'supervisor', reason: 'HQ exited unexpectedly', oldPid: child.pid, diagnostic: `HQ exited (code ${code ?? signal}) and ${this.limits.autoRecoverPerHour} automatic recoveries were already used in the last hour; not restarting again.` };
      this.pending.push(record); this.state = 'DOWN';
      this.writeStatus({ state: 'DOWN', ...record });
      if (this.down) void this.down.open(record).catch(() => {});
      return;
    }
    this.recoveries.push(now);
    this.restarting = { id: `recover-${now}`, startedAt: now };
    void (async () => {
      try {
        await this.sleep(this.limits.backoffMs[0]);
        const owner = this.lock.owner();
        if (owner != null && owner !== child.pid && this.isAlive(owner)) { this.log({ event: 'recover-refused', reason: `controller.lock held by live process ${owner}` }); return; }
        if (owner != null && !this.isAlive(owner)) this.lock.release();
        await this.bring({ id: this.restarting.id, kind: 'recover', by: 'supervisor', reason: `HQ exited unexpectedly (code ${code ?? signal})`, oldPid: child.pid });
      } finally { this.restarting = null; }
    })();
  }

  // Supervisor shutdown (Ctrl+C, window closed): stop HQ gracefully, then exit.
  async shutdown() {
    this.stopping = true;
    if (this.down) await this.down.close().catch(() => {});
    if (this.child) await this.stop(this.child, 'supervisor-shutdown');
  }
}

// ---------------------------------------------------------------- real wiring (Windows laptop, also POSIX)
const here = path.dirname(fileURLToPath(import.meta.url));
// Mirrors start-hillink-hq.ps1: paid credentials never reach HQ (ZERO_CREDIT; no metered fallback).
export const STRIPPED_ENV = ['OPENAI_API_KEY', 'HQ_SANDBOX_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
export function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}
export function fileLock(dir) {
  const file = path.join(dir, 'controller.lock');
  return {
    owner() { try { const pid = JSON.parse(fs.readFileSync(file, 'utf8')).pid; return Number.isInteger(pid) ? pid : -1; } catch (error) { return error.code === 'ENOENT' ? null : -1; } },
    release() { fs.rmSync(file, { force: true }); },
  };
}
// Health of a freshly started HQ: answering on its own port with its journal, agents registered, ingress listening.
export function httpHealth({ port, ingressPort = null, request = fetch }) {
  return async ({ minEvents }) => {
    const base = `http://127.0.0.1:${port}`, headers = { 'X-HQ-Client': 'command-center' };
    const session = await request(`${base}/api/session`, { headers, signal: AbortSignal.timeout(5_000) });
    if (!session.ok) return { ok: false, detail: `/api/session answered ${session.status}` };
    const { token } = await session.json();
    const r = await request(`${base}/api/state`, { headers: { ...headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, detail: `/api/state answered ${r.status}` };
    const s = await r.json();
    if (!Number.isInteger(s.eventCount) || s.eventCount < minEvents) return { ok: false, detail: `journal has ${s.eventCount} events, expected at least ${minEvents}` };
    if (!Array.isArray(s.agents) || !s.agents.length) return { ok: false, detail: 'no agents registered yet' };
    if (s.health?.controller !== 'ONLINE' && s.health?.controller !== 'DEGRADED') return { ok: false, detail: `controller ${s.health?.controller}` };
    if (ingressPort) {
      const ing = await request(`http://127.0.0.1:${ingressPort}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5_000) }).catch(() => null);
      if (!ing || ing.status !== 404) return { ok: false, detail: 'connector port not answering yet' };
    }
    return { ok: true, eventCount: s.eventCount, detail: `HQ ONLINE with ${s.eventCount} events and ${s.agents.length} agents` };
  };
}
// While HQ is down after failed retries: the connector URL still answers, token-checked, with get_hq_state = DOWN.
export function downResponder({ port, tokenFile }) {
  let server = null;
  return {
    async open(record) {
      if (server) return;
      let token; try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch { return; }
      const expected = Buffer.from(`/mcp/${token}`);
      const body = { hq: 'DOWN', diagnostic: record.diagnostic, restart_id: record.id, at: new Date().toISOString(), next: 'HQ is down after bounded restart attempts. Kyle must check the logs and start it with start-hillink-hq.ps1. Nothing was deleted.' };
      server = http.createServer(async (req, res) => {
        const p = Buffer.from((req.url ?? '').split('?')[0]);
        const send = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(v)); };
        if (p.length !== expected.length || !timingSafeEqual(p, expected) || req.method !== 'POST') return send(404, { error: 'Not found' });
        let raw = ''; for await (const c of req) { raw += c; if (raw.length > 65_536) return send(413, { error: 'Request too large' }); }
        let m; try { m = JSON.parse(raw); } catch { return send(400, { error: 'Parse error' }); }
        if (m?.id === undefined) { res.writeHead(202); return res.end(); }
        const reply = result => send(200, { jsonrpc: '2.0', id: m.id, result });
        if (m.method === 'initialize') return reply({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'hillink-hq-supervisor', version: '1.0.0' }, instructions: 'Hillink HQ is DOWN. Only get_hq_state is available; it returns the diagnostic.' });
        if (m.method === 'tools/list') return reply({ tools: [{ name: 'get_hq_state', description: 'Hillink HQ is down: returns the supervisor diagnostic.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }] });
        if (m.method === 'tools/call' && m.params?.name === 'get_hq_state') return reply({ content: [{ type: 'text', text: JSON.stringify(body) }] });
        return send(200, { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'HQ is down: only get_hq_state is available.' } });
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    },
    async close() { if (!server) return; const s = server; server = null; await new Promise(resolve => s.close(resolve)); },
  };
}

async function main() {
  const stateDir = process.env.HQ_STATE_DIR || path.join(here, '.state');
  const port = Number(process.env.HQ_PORT || 4312), ingressPort = process.env.HQ_INGRESS_ENABLED === '1' ? Number(process.env.HQ_INGRESS_PORT || 4313) : null;
  fs.mkdirSync(stateDir, { recursive: true });
  // One supervisor per state directory.
  const own = path.join(stateDir, 'supervisor.lock');
  try { const pid = JSON.parse(fs.readFileSync(own, 'utf8')).pid; if (isAlive(pid) && pid !== process.pid) { console.error(`A supervisor (pid ${pid}) already runs for ${stateDir}.`); process.exit(1); } } catch { /* none */ }
  fs.writeFileSync(own, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const logFile = path.join(stateDir, 'supervisor.log'), statusFile = path.join(stateDir, 'supervisor-status.json');
  const log = entry => { const line = JSON.stringify({ at: new Date().toISOString(), ...entry }); fs.appendFileSync(logFile, line + '\n'); console.log(`[supervisor] ${line}`); };
  const env = { ...process.env }; for (const k of STRIPPED_ENV) delete env[k];
  const out = path.join(here, 'hq-supervised.out.log'), err = path.join(here, 'hq-supervised.err.log');
  const sup = new Supervisor({
    launch: () => {
      const header = `\n===== HQ launch ${new Date().toISOString()} =====\n`;
      fs.appendFileSync(out, header); fs.appendFileSync(err, header);
      return fork(path.join(here, 'server.mjs'), [], { cwd: here, env, windowsHide: true, stdio: ['ignore', fs.openSync(out, 'a'), fs.openSync(err, 'a'), 'ipc'] });
    },
    killTree, isAlive, lock: fileLock(stateDir), log,
    status: record => fs.writeFileSync(statusFile, JSON.stringify({ supervisorPid: process.pid, at: new Date().toISOString(), ...record }, null, 2)),
    health: httpHealth({ port, ingressPort }),
    gitHead: () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: here, encoding: 'utf8', windowsHide: true }).trim(); } catch { return null; } },
    down: ingressPort ? downResponder({ port: ingressPort, tokenFile: path.join(stateDir, 'ingress-token') }) : null,
  });
  log({ event: 'supervisor-started', pid: process.pid, stateDir });
  const quit = async () => { log({ event: 'supervisor-stopping' }); await sup.shutdown(); fs.rmSync(own, { force: true }); process.exit(0); };
  process.once('SIGINT', quit); process.once('SIGTERM', quit); process.once('SIGBREAK', quit);
  await sup.start();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
