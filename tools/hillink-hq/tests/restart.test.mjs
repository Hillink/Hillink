// restart_hq: the external supervisor (supervisor.mjs) and HQ's side (restart.mjs, server.mjs, the connector).
// Supervisor tests drive the real Supervisor class with fake HQ processes, health and clock; HQ-side tests use real
// createHQ instances on a real journal directory, closed and reopened the way a restart does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor, SUPERVISOR_LIMITS, STRIPPED_ENV } from '../supervisor.mjs';
import { requestRestart, RESTART_LIMITS } from '../restart.mjs';
import { createHQ, METERED_CREDENTIALS } from '../server.mjs';
import { startIngress, INGRESS_TOOLS, INGRESS_TOOL_DEFINITIONS } from '../ingress/mcp-ingress.mjs';
import { Engine, reduce, emptyState } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';

// ---------------------------------------------------------------- fake HQ processes
let nextPid = 7000;
function harness({ healthy = () => true, stopsOnShutdown = () => true, dies = () => true, limits = {} } = {}) {
  const clock = { t: 1_000_000 };
  const alive = new Set(), children = [], logs = [], statuses = [], killed = [], downs = [];
  let lockOwner = null;
  const launch = () => {
    const child = new EventEmitter();
    child.pid = nextPid++; child.exitCode = null; child.sent = [];
    child.send = msg => {
      child.sent.push(msg);
      if (msg.type === 'shutdown' && stopsOnShutdown(child)) queueMicrotask(() => exit(child, 0));
    };
    alive.add(child.pid); lockOwner = child.pid; children.push(child);
    return child;
  };
  const exit = (child, code) => { if (!alive.has(child.pid)) return; alive.delete(child.pid); if (lockOwner === child.pid && code === 0) lockOwner = null; child.exitCode = code; child.emit('exit', code, null); };
  const sup = new Supervisor({
    launch,
    killTree: pid => { killed.push(pid); const c = children.find(x => x.pid === pid); if (c && dies(c)) exit(c, 1); },
    isAlive: pid => alive.has(pid),
    health: async ({ child }) => (healthy(child, children.indexOf(child)) ? { ok: true, eventCount: 10, detail: 'ok' } : { ok: false, detail: 'connector port not answering yet' }),
    lock: { owner: () => lockOwner, release: () => { lockOwner = null; } },
    log: e => logs.push(e), status: s => statuses.push(s),
    gitHead: () => 'abc1234', now: () => clock.t, sleep: async ms => { clock.t += ms; await new Promise(r => setImmediate(r)); },
    limits: { ...SUPERVISOR_LIMITS, ...limits },
    down: { open: async r => { downs.push(r); }, close: async () => {} },
  });
  const request = (child, id = `r-${Math.random()}`, reason = 'connector stopped answering', by = 'chatgpt') => {
    const acks = []; const before = child.sent.length;
    child.emit('message', { type: 'restart-request', id, reason, by });
    acks.push(...child.sent.slice(before).filter(m => m.type === 'restart-ack'));
    return acks[0];
  };
  const settle = async () => { for (let i = 0; i < 200 && (sup.restarting || sup.state === 'STARTING' || sup.state === 'STOPPING'); i++) await new Promise(r => setImmediate(r)); };
  return { sup, clock, alive, children, logs, statuses, killed, downs, request, settle, lock: { get: () => lockOwner, set: v => { lockOwner = v; } }, exit };
}

test('1-2, 5, 8-9. an accepted restart is logged with reason and requester, shuts HQ down gracefully, relaunches and health-checks it', async () => {
  const h = harness(); assert.equal(await h.sup.start(), true);
  const old = h.children[0];
  const ack = h.request(old, 'R1', 'connector stopped answering', 'chatgpt');
  assert.deepEqual([ack.accepted, ack.id], [true, 'R1']);
  assert.ok(h.logs.some(l => l.event === 'restart-accepted' && l.reason === 'connector stopped answering' && l.by === 'chatgpt' && l.pid === old.pid));
  await h.settle();
  assert.ok(old.sent.some(m => m.type === 'shutdown' && m.id === 'R1'), 'graceful shutdown requested over IPC');
  assert.deepEqual(h.killed, [], 'no force needed');
  assert.equal(h.children.length, 2, 'HQ relaunched');
  const fresh = h.children[1], record = fresh.sent.find(m => m.type === 'restart-record')?.record;
  assert.equal(h.sup.child, fresh);
  assert.deepEqual({ phase: record.phase, id: record.id, oldPid: record.oldPid, newPid: record.newPid, attempts: record.attempts, forced: record.forced, by: record.by }, { phase: 'completed', id: 'R1', oldPid: old.pid, newPid: fresh.pid, attempts: 1, forced: false, by: 'chatgpt' });
  assert.equal(record.gitHeadBefore, record.gitHeadAfter, 'same code: a restart never changes it');
  assert.equal(h.statuses.at(-1).state, 'RUNNING');
});

test('3. a second request during a restart is answered as a duplicate and starts nothing', async () => {
  const h = harness({ stopsOnShutdown: () => false, dies: () => true }); await h.sup.start();
  const old = h.children[0];
  assert.equal(h.request(old, 'R1').accepted, true);
  const dup = h.request(old, 'R2');
  assert.deepEqual([dup.accepted, dup.duplicate, dup.activeId], [false, true, 'R1']);
  await h.settle();
  assert.equal(h.children.length, 2, 'exactly one relaunch');
});

test('4. cooldown and hourly cap: refused with a retry time, accepted again once it has passed', async () => {
  const h = harness(); await h.sup.start();
  h.request(h.children[0], 'R1'); await h.settle();
  const tooSoon = h.request(h.sup.child, 'R2');
  assert.equal(tooSoon.accepted, false); assert.match(tooSoon.reason, /cooldown/); assert.ok(tooSoon.retryAfterSeconds > 0);
  h.clock.t += SUPERVISOR_LIMITS.cooldownMs; assert.equal(h.request(h.sup.child, 'R3').accepted, true); await h.settle();
  const capped = harness({ limits: { cooldownMs: 0, maxPerHour: 2 } }); await capped.sup.start();
  capped.request(capped.sup.child, 'A'); await capped.settle(); capped.request(capped.sup.child, 'B'); await capped.settle();
  const third = capped.request(capped.sup.child, 'C');
  assert.equal(third.accepted, false); assert.match(third.reason, /rate limit/);
});

test('6. a graceful timeout escalates to a forced tree kill; the lock is released only once that pid is proven gone', async () => {
  const h = harness({ stopsOnShutdown: () => false }); await h.sup.start();
  const old = h.children[0];
  h.request(old, 'R1'); await h.settle();
  assert.deepEqual(h.killed, [old.pid]);
  assert.ok(h.logs.some(l => l.event === 'graceful-timeout') && h.logs.some(l => l.event === 'lock-released' && l.pid === old.pid));
  assert.equal(h.children[1].sent.find(m => m.type === 'restart-record').record.forced, true);
});

test('an HQ that cannot be proven stopped is never joined by a second HQ; it resumes and records the failure', async () => {
  const h = harness({ stopsOnShutdown: () => false, dies: () => false }); await h.sup.start();
  const old = h.children[0];
  h.request(old, 'R1'); await h.settle();
  assert.equal(h.children.length, 1, 'no second controller');
  assert.ok(old.sent.some(m => m.type === 'restart-aborted'));
  assert.equal(old.sent.find(m => m.type === 'restart-record').record.phase, 'failed');
  const other = harness(); await other.sup.start();
  other.lock.set(424242); other.alive.add(424242); // a live foreign controller owns the lock
  other.request(other.children[0], 'X'); await other.settle();
  assert.equal(other.children.length, 1, 'never starts beside a lock held by another live process');
});

test('7, 10-11. failed health checks retry a bounded number of times with backoff, then stop, stay alive and leave a diagnostic', async () => {
  const h = harness({ healthy: (child, index) => index === 0 }); await h.sup.start();
  const t0 = h.clock.t;
  h.request(h.children[0], 'R1'); await h.settle();
  assert.equal(h.children.length, 1 + SUPERVISOR_LIMITS.maxAttempts, 'exactly maxAttempts relaunches');
  assert.ok(h.clock.t - t0 >= SUPERVISOR_LIMITS.backoffMs[0] + SUPERVISOR_LIMITS.backoffMs[1], 'backoff between attempts');
  assert.equal(h.sup.state, 'DOWN'); assert.equal(h.statuses.at(-1).state, 'DOWN');
  assert.match(h.statuses.at(-1).diagnostic, /health check/);
  assert.equal(h.downs.length, 1, 'the connector port answers "HQ is down" with the diagnostic');
  assert.equal(h.alive.size, 0, 'no failed HQ left running');
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  assert.equal(h.children.length, 1 + SUPERVISOR_LIMITS.maxAttempts, 'no restart loop');
  // The failure is handed to the next HQ that does come up.
  const ok = harness({ healthy: (c, i) => i !== 1 }); await ok.sup.start();
  ok.request(ok.children[0], 'F1'); await ok.settle();
  assert.equal(ok.sup.child.sent.find(m => m.type === 'restart-record').record.attempts, 2);
});

test('7. the supervisor survives an HQ crash and recovers it, rate-limited; worker problems never trigger it', async () => {
  const h = harness(); await h.sup.start();
  for (let i = 0; i < SUPERVISOR_LIMITS.autoRecoverPerHour; i++) { h.exit(h.sup.child, 3); await h.settle(); }
  assert.equal(h.children.length, 1 + SUPERVISOR_LIMITS.autoRecoverPerHour);
  assert.equal(h.sup.child.sent.find(m => m.type === 'restart-record').record.by, 'supervisor');
  h.exit(h.sup.child, 3); await h.settle();
  assert.equal(h.children.length, 1 + SUPERVISOR_LIMITS.autoRecoverPerHour, 'cap reached: no further recovery');
  assert.equal(h.sup.state, 'DOWN');
  assert.ok(!Object.getOwnPropertyNames(Supervisor.prototype).some(m => /agent|worker|quarantine/i.test(m)), 'nothing in the supervisor reacts to agent or worker status');
});

test('an HQ that dies while the supervisor is still bringing it up is retried by that launch loop only, never by a parallel recovery', async () => {
  const h = harness();
  h.sup.health = async ({ child }) => { if (h.children.indexOf(child) === 0) { h.exit(child, 1); return { ok: false, detail: 'crashed on boot' }; } return { ok: true, eventCount: 10, detail: 'ok' }; };
  assert.equal(await h.sup.start(), true);
  for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
  await h.settle();
  assert.equal(h.children.length, 2, 'one retry, no second competing launch');
  assert.equal(h.alive.size, 1, 'exactly one HQ running');
  assert.ok(!h.logs.some(l => l.event === 'hq-exited'), 'the boot crash was not treated as a runtime exit');
});

test('boot after an unclean death: a lock whose pid is gone is released; a live or unreadable lock blocks the launch', async () => {
  // On Windows an HQ child dies with a killed supervisor and leaves controller.lock behind.
  const stale = harness(); stale.lock.set(31337);
  assert.equal(await stale.sup.start(), true, 'the next supervisor starts HQ');
  assert.ok(stale.logs.some(l => l.event === 'stale-lock-released' && l.pid === 31337));
  const live = harness(); live.lock.set(424243); live.alive.add(424243);
  assert.equal(await live.sup.start(), false);
  assert.equal(live.children.length, 0, 'never starts beside a live controller');
  assert.match(live.statuses.at(-1).diagnostic, /another HQ is running/);
  const unreadable = harness(); unreadable.lock.set(-1);
  assert.equal(await unreadable.sup.start(), false);
  assert.equal(unreadable.children.length, 0);
  assert.match(unreadable.statuses.at(-1).diagnostic, /unreadable/);
});

// ---------------------------------------------------------------- HQ side
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hq-restart-'));
const fakeSupervisor = (ack = { accepted: true }) => ({ calls: [], async request(r) { this.calls.push(r); return { id: r.id, ...ack }; } });

test('restart_hq validates its input, refuses without a supervisor or with work in flight, journals every request', async () => {
  const engine = new Engine({ store: new MemoryStore() }); engine.initialize();
  const sup = fakeSupervisor();
  assert.match((await requestRestart(engine, sup, { reason: 'x', merge: true }, { by: 'chatgpt' })).refused, /exactly one argument/);
  assert.match((await requestRestart(engine, sup, { reason: ' ' }, { by: 'chatgpt' })).refused, /non-empty/);
  assert.match((await requestRestart(engine, sup, { reason: 'x'.repeat(RESTART_LIMITS.reasonMax + 1) }, { by: 'chatgpt' })).refused, /at most/);
  assert.match((await requestRestart(engine, null, { reason: 'stuck' }, { by: 'chatgpt' })).refused, /not running under its supervisor/);
  assert.equal(sup.calls.length, 0);
  engine.state.runs.fake = { runId: 'fake', taskId: 'task-1234', agentId: 'claude', endedAt: null };
  assert.match((await requestRestart(engine, sup, { reason: 'stuck' }, { by: 'chatgpt' })).refused, /in progress/);
  delete engine.state.runs.fake;
  const ok = await requestRestart(engine, sup, { reason: 'connector stuck' }, { by: 'chatgpt', gitHead: 'abc1234' });
  assert.equal(ok.accepted, true); assert.equal(ok.status, 'RESTART_INITIATED'); assert.match(ok.note, /not healthy until/);
  assert.equal(engine.draining, true, 'no new work once accepted');
  const journal = engine.state.events.filter(e => e.type === 'HQ_RESTART').map(e => [e.data.phase, e.data.by, e.data.reason]);
  assert.deepEqual(journal, [['requested', 'chatgpt', 'connector stuck'], ['accepted', 'chatgpt', 'connector stuck']]);
  const refused = await requestRestart(new Engine({ store: new MemoryStore() }), fakeSupervisor({ accepted: false, duplicate: true, activeId: 'R0', reason: 'restart R0 is already in progress' }), { reason: 'again' }, { by: 'chatgpt' });
  assert.deepEqual([refused.duplicate, refused.restart_id], [true, 'R0']);
  const e2 = new Engine({ store: new MemoryStore() });
  await requestRestart(e2, fakeSupervisor({ accepted: false, reason: 'cooldown' }), { reason: 'again' }, { by: 'chatgpt' });
  assert.equal(e2.draining, false, 'a refused restart leaves HQ dispatching');
  const e3 = new Engine({ store: new MemoryStore() });
  let drainingWhileAsking = null;
  await requestRestart(e3, { async request() { drainingWhileAsking = e3.draining; return { accepted: true }; } }, { reason: 'x' }, { by: 'kyle' });
  assert.equal(drainingWhileAsking, true, 'dispatch stops before the supervisor is asked, so nothing starts in between');
});

test('12-13. a restart replays every objective, decision, approval gate and note unchanged; nothing is cleared or approved', async () => {
  const dir = tmp();
  const env = { HQ_STATE_DIR: dir };
  let hq = await createHQ({ port: 0, directory: dir, intervalMs: 60_000, env, supervisor: fakeSupervisor() });
  const open = [hq];
  try {
  const c = hq.engine.conductor;
  const gated = c.submit({ objective: 'Deploy the World page.', type: 'implement', title: 'Gated', scope: ['sandbox/hq-smoke/gated/'], tests: ['sandbox/hq-smoke/gated/a.test.mjs'], acceptanceCriteria: 'The page is deployed.', constraints: 'Nothing else changes.', requestedActions: ['deploy'] });
  const cancelled = c.submit({ objective: 'Look into the renderer.', type: 'investigate', title: 'Cancelled' });
  await c.cancel(cancelled, { by: 'kyle', reason: 'test' });
  const note = c.postNote({ title: 'Resume plan', body: 'Three parts.' }, { by: 'kyle' });
  await hq.engine.tick(); await c.tick();
  const pick = s => ({ objectives: Object.fromEntries(Object.entries(s.objectives).map(([id, o]) => [id, { status: o.status, approvals: o.approvals, decisions: o.decisions }])), notes: s.notes ?? null, compute: s.compute.mode });
  const before = pick(hq.engine.state), beforeSeq = hq.engine.state.seq;
  assert.equal((await requestRestart(hq.engine, fakeSupervisor(), { reason: 'test restart' }, { by: 'chatgpt' })).accepted, true);
  hq.recordRestart({ id: 'R1', phase: 'completed', by: 'chatgpt', reason: 'test restart', oldPid: 1, newPid: 2, attempts: 1 });
  await hq.close(); open.length = 0; // what the graceful shutdown does: journal closed, controller.lock released
  assert.ok(!fs.existsSync(path.join(dir, 'controller.lock')));
  hq = await createHQ({ port: 0, directory: dir, intervalMs: 60_000, env }); open.push(hq);
  // The reopened journal, replayed up to the moment of the restart, is exactly the state HQ had (HQ then simply
  // carries on orchestrating from there).
  const replayed = hq.engine.state.events.filter(e => e.seq <= beforeSeq).reduce(reduce, emptyState());
  assert.deepEqual(pick(replayed), before, 'objectives, approvals, decisions, notes and compute mode replay unchanged');
  assert.ok(hq.engine.state.seq > beforeSeq && hq.engine.state.events.some(e => e.type === 'HQ_RESTART' && e.data.phase === 'completed'));
  assert.ok(hq.engine.state.objectives[gated].plan.gates.includes('deploy'), 'the deploy gate is still part of the plan');
  assert.ok(!Object.values(hq.engine.state.objectives[gated].approvals).some(a => a.status === 'APPROVED'), 'a restart approves nothing');
  assert.equal(hq.engine.state.objectives[cancelled].status, 'CANCELLED');
  assert.ok(note);
  assert.equal(hq.engine.state.restart.phase, 'completed');
  assert.equal(hq.engine.draining, undefined, 'a fresh HQ is not draining');
  } finally { for (const h of open) await h.close(); }
});

test('14. no paid inference: the supervisor strips every metered credential and a restart keeps ZERO_CREDIT', async () => {
  for (const k of METERED_CREDENTIALS) assert.ok(STRIPPED_ENV.includes(k), `${k} never reaches HQ`);
  const dir = tmp();
  const hq = await createHQ({ port: 0, directory: dir, intervalMs: 60_000, env: {}, supervisor: fakeSupervisor() });
  assert.equal(hq.engine.config.computeMode, 'ZERO_CREDIT');
  const out = await requestRestart(hq.engine, fakeSupervisor(), { reason: 'check' }, { by: 'chatgpt' });
  assert.ok(!JSON.stringify(out).match(/spend|authorize|BUDGETED/i));
  await hq.close();
});

test('the connector exposes restart_hq as its tenth tool and returns the acknowledgement, never "healthy"', async () => {
  assert.equal(INGRESS_TOOLS.length, 10); assert.ok(INGRESS_TOOLS.includes('restart_hq'));
  const def = INGRESS_TOOL_DEFINITIONS.find(t => t.name === 'restart_hq');
  assert.deepEqual(Object.keys(def.inputSchema.properties), ['reason']); assert.equal(def.inputSchema.additionalProperties, false);
  const engine = new Engine({ store: new MemoryStore() }); engine.initialize();
  const token = 'x'.repeat(43), calls = [];
  const ing = await startIngress({ engine, token, port: 0, restart: async args => { calls.push(args); return { accepted: true, restart_id: 'R9', status: 'RESTART_INITIATED' }; } });
  const call = async (name, args) => (await (await fetch(`${ing.base}/mcp/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const r = await call('restart_hq', { reason: 'connector reload' });
  assert.equal(r.isError, false); assert.equal(JSON.parse(r.content[0].text).status, 'RESTART_INITIATED');
  assert.deepEqual(calls, [{ reason: 'connector reload' }]);
  const list = await (await fetch(`${ing.base}/mcp/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })).json();
  assert.equal(list.result.tools.length, 10);
  await ing.close();
  const bare = await startIngress({ engine, token, port: 0 });
  const refused = (await (await fetch(`${bare.base}/mcp/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'restart_hq', arguments: { reason: 'x' } } }) })).json()).result;
  assert.equal(refused.isError, true); assert.match(refused.content[0].text, /without a supervisor/);
  await bare.close();
});
