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
import { connectOrchestrator } from './orchestrator-adapter.mjs';
import { ClaudeImplementer, ClaudeRouter, findClaudeBinary, resolveImplementationBase } from './implementation-runner.mjs';
import { WslSandbox } from './sandbox.mjs';
import { LinuxSandbox } from './sandbox/linux.mjs';
import { BrokerServer } from './broker/mcp-server.mjs';
import { SubscriptionImplementer } from './subscription-implementer.mjs';
import { execFileSync } from 'node:child_process';
import { assertSupportedNode } from './node-version.mjs';
import { Conductor } from './orchestration/conductor.mjs';
import { CommitVerifier } from './orchestration/verify.mjs';
import { AssetVerifier } from './orchestration/asset-verify.mjs';
import { ArtFactoryAdapter, LocalChecksRouter } from './art-factory-adapter.mjs';
import { reconcileInterrupted } from './orchestration/recovery.mjs';
import { worldActivity, worldSnapshot, WORLD_CONTRACT_VERSION } from './orchestration/activity.mjs';
import { resolveMode } from './compute/policy.mjs';
import { computeLedger } from './compute/state.mjs';
import { allRoutes, agentProfiles } from './compute/registry.mjs';
import { catalog, rebindAdapters } from './agents.mjs';

// Metered credentials HQ knows about. Only their presence is ever reported, never a value.
export const METERED_CREDENTIALS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'HQ_SANDBOX_ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

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

export async function createHQ({ port = 4312, directory = path.join(here, '.state'), store, adapters, sink, intervalMs = 1000, ollama = false, cliAgents = false, orchestrator = false, implementation = false, env = process.env, request = fetch, sandboxFactory = ({ env: e }) => (process.platform === 'win32' ? new WslSandbox({ home: e.HQ_SANDBOX_HOME || undefined }) : new LinuxSandbox({ home: e.HQ_SANDBOX_HOME || undefined })), brokerOptions = {}, conductorOptions = {}, verifier = null, computeMode = null, nodeVersion = process.versions.node, artFactory = false } = {}) {
  assertSupportedNode(nodeVersion); // fail closed before any state, sandbox or agent is touched
  const journal = store ?? new FileStore(directory);
  const local = new LocalAdapter();
  // Pass 4: ZERO_CREDIT unless HQ's own environment says BUDGETED. Requests, agents and tasks cannot change it.
  const mode = computeMode ? resolveMode(computeMode) : resolveMode(env.HQ_COMPUTE_MODE);
  const engine = new Engine({ store: journal, adapters: adapters ?? { 'local-checks': local }, config: { computeMode: mode.mode } });
  engine.initialize({ modeSource: computeMode ? 'createHQ option' : env.HQ_COMPUTE_MODE ? 'HQ_COMPUTE_MODE' : 'default', modeWarning: mode.warning });
  let agentsStatus = 'DISABLED';
  if (cliAgents) {
    try { connectCliAgents(engine); agentsStatus = 'CONFIGURED'; }
    catch (error) { agentsStatus = `UNAVAILABLE: ${error.message}`; }
  }
  // Pass 2.6: Claude may take bounded implementation tasks (implement-repo) through a separate runtime with
  // task-specific permissions. Its review adapter is unchanged; a router picks the runtime per task.
  let implementationStatus = 'DISABLED', implementationRoutes = null, sandboxRef = null, brokerServer = null;
  // A restart can find Claude still holding a crashed run (parked until HQ proves it stopped). The sandbox handle,
  // stale-instance cleanup and the runner are wired regardless, so recovery can prove termination and the retry can
  // run; only the capability change waits for an unassigned agent (found in the first real crash test).
  if (implementation && engine.adapters['cli-claude']) {
    const claudeBin = findClaudeBinary({ env, execFileSync });
    // Pass 2.7: implementation exists only with the OS sandbox. No sandbox image, no implement-repo capability.
    const sandbox = sandboxFactory({ env });
    sandboxRef = sandbox;
    const box = sandbox.available();
    const repoRoot = path.resolve(here, '../..');
    // The implementation base: explicit and verified at start, or no implementation at all (fail closed).
    let implBase = null, baseProblem = null;
    try {
      implBase = resolveImplementationBase(env);
      implBase.commit = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${implBase.base}^{commit}`], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (error) { baseProblem = implBase ? `implementation base ${implBase.base} does not resolve in this repository (git fetch origin first)` : error.message; }
    if (baseProblem) implementationStatus = `UNAVAILABLE: ${baseProblem}`;
    else if (!claudeBin) implementationStatus = 'UNAVAILABLE: Claude Code binary not found (set HQ_CLAUDE_BIN)';
    else if (!box.ok) implementationStatus = `UNAVAILABLE: ${box.reason}`;
    else {
      sandbox.cleanupStale().catch(() => {}); // instances left by a crash are disposable
      const worktreeRoot = env.HQ_WORKTREE_DIR || undefined, base = implBase.base;
      // Pass 2.7 direct-sandbox runner (metered key; BUDGETED + authorization only). Kept as the optional paid path.
      const implementer = new ClaudeImplementer({ repoRoot, worktreeRoot, claudeBin, env, sandbox, base });
      // Pass 4.5 split broker (subscription). Needs a sandbox that supports broker operations.
      let subscription = null;
      const brokerReady = sandbox.brokerSupport?.() ?? { ok: false, reason: 'sandbox has no broker support' };
      if (brokerReady.ok) {
        brokerServer = await new BrokerServer().start();
        subscription = new SubscriptionImplementer({ repoRoot, worktreeRoot, claudeBin, env, sandbox, base, broker: brokerServer, ...brokerOptions });
      }
      engine.adapters['cli-claude'] = new ClaudeRouter(engine.adapters['cli-claude'], implementer, subscription);
      if (!engine.state.agents.claude.assignment) engine.configureAgent('claude', { capabilities: [...new Set([...engine.state.agents.claude.capabilities, 'implement-repo'])] });
      const direct = implementer.available();
      implementationStatus = 'CONFIGURED';
      implementationRoutes = { base: { ref: implBase.base, commit: implBase.commit, source: implBase.source }, subscriptionSplitBroker: brokerReady.ok ? 'READY' : `UNAVAILABLE: ${brokerReady.reason}`, apiKeySandbox: direct.ok ? 'AVAILABLE (METERED: BUDGETED mode + Kyle authorization only)' : `UNAVAILABLE: ${direct.reason}` };
    }
  }
  // A capability recorded by an earlier start does not survive a start without the sandbox (fail closed).
  if (implementationStatus !== 'CONFIGURED' && engine.state.agents.claude?.capabilities?.includes('implement-repo') && !engine.state.agents.claude.assignment) {
    engine.configureAgent('claude', { capabilities: engine.state.agents.claude.capabilities.filter(c => c !== 'implement-repo') });
  }
  // Art Factory Step 1: produce-asset on HQ's local verifier process (LOCAL compute, no model, no network). Opt-in
  // (HQ_ART_FACTORY=1) and only with a Python that has the pinned bpy (HQ_ART_PYTHON). Same base rule as implementation.
  let artFactoryStatus = 'DISABLED', artFactoryBase = null;
  if (artFactory && engine.adapters['local-checks']) {
    const repoRoot = path.resolve(here, '../..');
    try {
      const b = resolveImplementationBase(env);
      b.commit = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${b.base}^{commit}`], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const art = new ArtFactoryAdapter({ repoRoot, python: env.HQ_ART_PYTHON, base: b.base, worktreeRoot: env.HQ_WORKTREE_DIR || undefined, env });
      const ok = art.available();
      if (!ok.ok) artFactoryStatus = `UNAVAILABLE: ${ok.reason}`;
      else {
        engine.adapters['local-checks'] = new LocalChecksRouter(engine.adapters['local-checks'], art);
        artFactoryStatus = 'CONFIGURED'; artFactoryBase = { ref: b.base, commit: b.commit, source: b.source };
      }
    } catch (error) { artFactoryStatus = `UNAVAILABLE: ${String(error.message).includes('HQ_IMPL_BASE') ? error.message : 'implementation base does not resolve in this repository (git fetch origin first)'}`; }
  }
  const verifierAgent = engine.state.agents['hq-verifier'];
  if (verifierAgent && !verifierAgent.assignment) {
    const has = verifierAgent.capabilities.includes('produce-asset');
    if (artFactoryStatus === 'CONFIGURED' && !has) engine.configureAgent('hq-verifier', { capabilities: [...verifierAgent.capabilities, 'produce-asset'] });
    if (artFactoryStatus !== 'CONFIGURED' && has) engine.configureAgent('hq-verifier', { capabilities: verifierAgent.capabilities.filter(c => c !== 'produce-asset') });
  }
  // ChatGPT orchestrator (Pass 4): optional METERED_API. Normal operation is Kyle -> ChatGPT (his subscription) -> HQ,
  // so HQ does not run a second, API-billed ChatGPT. It connects only when explicitly enabled AND HQ runs BUDGETED;
  // even then every turn needs a Kyle spend authorization. In ZERO_CREDIT the key is never read or sent anywhere.
  let orchestratorStatus = 'DISABLED';
  if (orchestrator && engine.config.computeMode !== 'BUDGETED') {
    orchestratorStatus = 'DISABLED: metered OpenAI API; HQ is in ZERO_CREDIT mode';
    const detail = 'Optional metered orchestrator is off (ZERO_CREDIT mode). Orchestrate through ChatGPT (subscription) and HQ.';
    if (engine.state.agents.chatgpt && engine.state.agents.chatgpt.detail !== detail) engine.emit('AGENT_OBSERVED', { agentId: 'chatgpt', status: 'UNKNOWN', detail });
  } else if (orchestrator) {
    try { orchestratorStatus = connectOrchestrator(engine, { env, request, stateDir: store ? null : directory }); }
    catch (error) { orchestratorStatus = `UNAVAILABLE: ${String(error.message).slice(0, 120)}`; }
  }
  let ollamaStatus = 'DISABLED';
  if (ollama) {
    try { await connectOllama(engine); ollamaStatus = 'DISCOVERED'; }
    catch (error) { ollamaStatus = `UNAVAILABLE: ${error.message}`; }
  }
  // Pass 5F: provisioning checks for agents Kyle creates here use the same opt-in bridges; an agent whose backend bridge
  // is off waits (WAITING) for it. Adapters HQ created during an earlier provisioning are created again after a restart.
  engine.provisioning = { ollama: { enabled: Boolean(ollama), request } };
  rebindAdapters(engine, engine.provisioning);
  // Pass 3: the conductor turns objectives into planned, routed, verified work. HQ verifies every commit itself from
  // git and requires the sandbox to have been destroyed. After a restart it proves interrupted runs stopped (pids
  // gone, sandbox unregistered) before any step is retried; what it cannot prove stays parked.
  let lastProbe = 0;
  const recovery = async () => {
    const parked = Object.values(engine.state.runs).some(r => !r.endedAt && ['BLOCKED', 'CANCELLED'].includes(engine.state.tasks[r.taskId]?.stage));
    if (!parked || engine.now() - lastProbe < 10_000) return;
    lastProbe = engine.now();
    // A sandbox listing that fails throws, so the probe proves nothing and the run stays parked.
    await reconcileInterrupted(engine, { sandboxes: async () => { if (!sandboxRef) throw Error('implementation sandbox not configured in this HQ'); return sandboxRef.list({ strict: true }); } }).catch(() => []);
  };
  const conductor = new Conductor(engine, { verifier: verifier ?? new CommitVerifier({ repoRoot: path.resolve(here, '../..') }), assetVerifier: new AssetVerifier({ repoRoot: path.resolve(here, '../..') }), recovery, ...conductorOptions });
  engine.conductor = conductor;
  const credentials = Object.fromEntries(METERED_CREDENTIALS.map(k => [k, Boolean(env[k])]));
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
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...engine.snapshot(), events: engine.state.events.slice(-recentEvents), eventCount: engine.state.events.length, operations, health: { controller: lastError ? 'DEGRADED' : 'ONLINE', lastError, externalNotifications: sink ? 'CONFIGURED' : 'UNCONFIGURED', ollama: ollamaStatus, cliAgents: agentsStatus, orchestrator: orchestratorStatus, implementation: implementationStatus, implementationRoutes, artFactory: artFactoryStatus, artFactoryBase, localOnly: true, computeMode: engine.config.computeMode, meteredCredentialsPresent: credentials } });
      // Pass 4: compute policy, ledger and spend authorization. Owner API only (loopback, same-origin, session token);
      // nothing here is reachable from agent output, handoffs or the orchestrator's tools.
      if (req.method === 'GET' && url.pathname === '/api/compute') return json(200, { mode: engine.config.computeMode, ledger: computeLedger(engine.state, { now: engine.now(), taskId: url.searchParams.get('task') || null }), routes: allRoutes(), agents: agentProfiles(), meteredCredentialsPresent: credentials });
      if (req.method === 'POST' && url.pathname === '/api/spend/authorize') return json(201, { id: engine.authorizeSpend(await body(req), { by: 'kyle' }) });
      if (req.method === 'POST' && url.pathname === '/api/spend/revoke') { const b = await body(req); return json(200, engine.revokeSpend(String(b.id), { by: 'kyle', reason: b.reason })); }
      if (req.method === 'POST' && url.pathname === '/api/spend/retry') { const b = await body(req); return json(200, engine.retrySpendBlocked(String(b.taskId), { by: 'kyle' })); }
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
      // Pass 3 objectives. Kyle is the only caller of this API (loopback, same-origin, session token); approval gates
      // are decided here and nowhere else.
      if (req.method === 'POST' && url.pathname === '/api/objectives') { const id = conductor.submit(await body(req)); return json(201, { id }); }
      if (req.method === 'POST' && url.pathname === '/api/objectives/cancel') { const b = await body(req); return json(200, await conductor.cancel(String(b.id), { by: 'kyle', reason: typeof b.reason === 'string' ? b.reason : 'Cancelled by Kyle.' })); }
      if (req.method === 'POST' && url.pathname === '/api/objectives/approve') { const b = await body(req); return json(200, conductor.approve(String(b.id), String(b.gate), b.decision, { by: 'kyle', note: typeof b.note === 'string' ? b.note : null })); }
      if (req.method === 'POST' && url.pathname === '/api/objectives/decide') { const b = await body(req); return json(200, conductor.decide(String(b.id), String(b.decisionId), String(b.choice), { by: 'kyle', rationale: typeof b.rationale === 'string' ? b.rationale : '' })); }
      // The World contract: a truthful snapshot plus activity since a journal sequence number.
      if (req.method === 'GET' && url.pathname === '/api/world') {
        const since = Number(url.searchParams.get('since') ?? 0);
        if (!Number.isSafeInteger(since) || since < 0) throw Error('Invalid since');
        return json(200, { contract: WORLD_CONTRACT_VERSION, snapshot: worldSnapshot(engine.snapshot()), activity: worldActivity(engine.state.events, { since }) });
      }
      // Pass 5F: agent creation and lifecycle. Owner API only (loopback, same-origin, session token), like spend.
      if (req.method === 'GET' && url.pathname === '/api/agents/catalog') return json(200, catalog());
      if (req.method === 'POST' && url.pathname === '/api/agents') return json(201, { id: engine.createAgent(await body(req), { by: 'kyle' }) });
      if (req.method === 'POST' && /^\/api\/agents\/(activate|retry|disable|retire)$/.test(url.pathname)) {
        const b = await body(req), id = String(b?.id ?? ''), op = url.pathname.split('/').pop(), reason = typeof b?.reason === 'string' ? b.reason : null;
        if (op === 'activate') return json(200, engine.activateAgent(id, { by: 'kyle' }));
        if (op === 'retry') return json(200, engine.retryAgent(id, { by: 'kyle' }));
        return json(200, await (op === 'disable' ? engine.disableAgent(id, { by: 'kyle', reason }) : engine.retireAgent(id, { by: 'kyle', reason })));
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
      try { await engine.tick(); await conductor.tick(); await deliverNotifications(engine, sink); lastError = conductor.lastError ?? null; conductor.lastError = null; }
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
    await brokerServer?.close();
    await new Promise(resolve => server.close(resolve));
    journal.close();
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sink = process.env.HQ_NOTIFICATION_WEBHOOK ? webhookSink(process.env.HQ_NOTIFICATION_WEBHOOK) : null;
  const hq = await createHQ({ port: Number(process.env.HQ_PORT || 4312), directory: process.env.HQ_STATE_DIR || path.join(here, '.state'), sink, ollama: process.env.HQ_OLLAMA_ENABLED === '1', cliAgents: process.env.HQ_AGENTS_ENABLED === '1', orchestrator: process.env.HQ_ORCHESTRATOR_ENABLED === '1', implementation: (process.env.HQ_IMPLEMENTATION_ENABLED ?? process.env.HQ_AGENTS_ENABLED) === '1', artFactory: process.env.HQ_ART_FACTORY === '1' });
  console.log(`Hillink HQ: ${hq.origin} (local control service; compute mode ${hq.engine.config.computeMode})`);
  if (!sink) console.log('External notifications unconfigured. Enable browser notifications or configure HQ_NOTIFICATION_WEBHOOK for delivery when the browser is closed.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await hq.close(); process.exit(0); });
}
