// Watchdog durability smoke (2026-10-01): REAL HQ, REAL Claude Code on this machine's subscription sign-in, production
// watchdog thresholds (heartbeat 15 s, progress 120 s), ZERO_CREDIT. Every objective below is forced to be
// legitimately quiet for at least 150 s, on each worker path, and must COMPLETE; then a genuine stall is created and
// HQ must kill it.
//   HQ_IMPL_BASE=origin/claude/dev-baseline node live/watchdog-smoke.mjs     (from tools/hillink-hq; Node 24; Linux root)
//
// How quiet is forced, legitimately:
//   investigate / review: the brief asks Claude to read an evidence feed that is a slow source (a named pipe whose
//     writer delivers its content after 160 s, like a slow network share). Claude Code's Read tool waits for it and
//     prints nothing meanwhile; the tool is not hung, it returns real content.
//   implement: the acceptance test Claude writes awaits a 155 s timer, so HQ's own acceptance-test step in the sandbox
//     is silent for 155 s.
//   genuine stall: Claude is frozen with SIGSTOP while it is answering (process alive, no output, nothing declared).
// Nothing is pushed, merged or deployed. Results: PROOF_OUT (default docs/watchdog-smoke-results.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHQ } from '../server.mjs';
import { LinuxSandbox } from '../sandbox/linux.mjs';

const OUT = process.env.PROOF_OUT || path.join(import.meta.dirname, '..', 'docs', 'watchdog-smoke-results.json');
const BASE = process.env.HQ_IMPL_BASE;
if (!BASE) throw Error('set HQ_IMPL_BASE (e.g. origin/claude/dev-baseline)');
const ONLY = (process.env.SMOKE_ONLY || 'investigate,review,implement,stall').split(',');
const FAKE = { OPENAI_API_KEY: 'sk-proj-FAKE-watchdog-smoke-never-valid', ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-watchdog-smoke-never-valid', CODEX_API_KEY: 'sk-proj-FAKE-codex-watchdog-smoke-never-valid', HQ_SANDBOX_ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-watchdog-smoke-sandbox-never-valid-0' };
const realClaude = execFileSync('bash', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-watchdog-smoke-'));
const bin = path.join(work, 'bin'), streamLog = path.join(work, 'claude-stream.jsonl'), pidFile = path.join(work, 'claude.pid');
fs.mkdirSync(bin);
// `claude` on HQ's PATH: records its pid, tees its stream for the evidence, and execs the real CLI (same process).
const wrapper = `#!/bin/bash\necho $$ > "${pidFile}"\nexec "${realClaude}" "$@" > >(tee -a "${streamLog}")\n`;
fs.writeFileSync(path.join(bin, 'claude'), wrapper, { mode: 0o700 });
const env = { ...process.env, ...FAKE, PATH: `${bin}:${process.env.PATH}`, HQ_CLAUDE_BIN: path.join(bin, 'claude'), HQ_WORKTREE_DIR: path.join(work, 'worktrees'), HQ_SANDBOX_HOME: path.join(work, 'sandbox'), HQ_IMPL_BASE: BASE };
delete env.HQ_COMPUTE_MODE; // ZERO_CREDIT
// The read-only CLI adapters read process.env: give them the same PATH (the wrapper) and the same fake metered keys.
Object.assign(process.env, FAKE, { PATH: env.PATH }); delete process.env.HQ_COMPUTE_MODE;
const openaiCalls = [];
const request = async (url, init) => { openaiCalls.push(String(url)); return fetch(url, init); };
const repo = path.resolve(import.meta.dirname, '..', '..', '..');
const feedDir = path.join(repo, '.hq-smoke');
const wait = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise(r => setTimeout(r, 500)); } return false; };
const LEAKS = [...Object.values(FAKE), '"accessToken"', '"refreshToken"', 'sk-ant-oat'];

// A slow evidence source: the first reader waits delayMs for the content; later readers get it at once.
function slowFeed(name, content, delayMs) {
  fs.mkdirSync(feedDir, { recursive: true });
  const file = path.join(feedDir, name);
  try { fs.rmSync(file); } catch { /* none */ }
  execFileSync('mkfifo', [file]);
  let stop = false, served = 0;
  (async () => {
    while (!stop && served < 20) {
      const fd = await new Promise((resolve, reject) => fs.open(file, 'w', (e, f) => (e ? reject(e) : resolve(f)))).catch(() => null); // blocks until a reader opens
      if (fd == null || stop) break;
      if (served === 0 && delayMs) await new Promise(r => setTimeout(r, delayMs));
      await new Promise(r => fs.write(fd, content, () => fs.close(fd, r)));
      served++;
    }
  })();
  return { file: path.relative(repo, file), close: () => { stop = true; try { fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); } catch { /* unblock */ } try { fs.rmSync(file); } catch { /* gone */ } }, served: () => served };
}

const results = { startedAt: new Date().toISOString(), machine: { platform: process.platform, node: process.version, claude: execFileSync(realClaude, ['--version'], { encoding: 'utf8' }).trim() }, base: BASE, smokes: {} };
const hq = await createHQ({ port: 0, directory: path.join(work, 'state'), env, request, cliAgents: true, implementation: true, sandboxFactory: ({ env: e }) => new LinuxSandbox({ home: e.HQ_SANDBOX_HOME }), intervalMs: 500 });
const E = hq.engine;
results.watchdog = { heartbeatMs: E.config.heartbeatMs, progressMs: E.config.progressMs, computeMode: E.config.computeMode };
const headers = { 'X-HQ-Client': 'command-center' };
const { token } = await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json());
const auth = { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const submit = body => fetch(`${hq.origin}/api/objectives`, { method: 'POST', headers: auth, body: JSON.stringify(body) }).then(r => r.json());
const FINAL = ['COMPLETE', 'FAILED', 'BLOCKED', 'CANCELLED', 'AWAITING_DECISION', 'AWAITING_APPROVAL'];

// Per objective: every task's run, the longest gap between non-heartbeat evidence, phases, and the terminal state.
function evidenceOf(oid) {
  const tasks = Object.values(E.state.tasks).filter(t => t.link?.objectiveId === oid);
  return tasks.map(t => {
    const ev = t.evidence.filter(e => e.kind !== 'HEARTBEAT');
    let gap = 0, gapEnd = null;
    for (let i = 1; i < ev.length; i++) { const g = ev[i].at - ev[i - 1].at; if (g > gap) { gap = g; gapEnd = `${ev[i - 1].kind} -> ${ev[i].kind}: ${String(ev[i].summary).slice(0, 120)}`; } }
    const phases = ev.flatMap(e => (e.phases ?? []).map(p => `${p.state} ${p.id}${p.reason ? ` (${p.reason}, ${Math.round(p.boundMs / 1000)} s)` : ''}`));
    const run = E.state.runs[t.runId], compute = E.state.compute.runs[t.runId];
    return { taskId: t.id, operation: t.operation, stage: t.stage, terminal: run?.terminal ?? null, computeClass: compute?.computeClass ?? null, variant: compute?.variant ?? null, longestQuietSeconds: Math.round(gap / 1000), longestQuietBetween: gapEnd, heartbeats: t.evidence.filter(e => e.kind === 'HEARTBEAT').length, phases, recovery: E.state.events.filter(e => e.type === 'RECOVERY' && e.data.taskId === t.id).map(e => e.data.reason) };
  });
}
async function smoke(name, body, { feed = null } = {}) {
  const started = Date.now();
  const { id } = await submit(body);
  await wait(() => FINAL.includes(E.state.objectives[id]?.status), 30 * 60_000);
  const o = E.state.objectives[id];
  results.smokes[name] = { objectiveId: id, status: o.status, reason: o.statusReason, seconds: Math.round((Date.now() - started) / 1000), feedServed: feed?.served() ?? null, claudeStatusAfter: E.status(E.state.agents.claude), quarantined: (E.state.agents.claude.quarantineUntil ?? 0) > E.now(), tasks: evidenceOf(id), commit: o.result?.commit ?? null };
  feed?.close();
  console.log(name, JSON.stringify({ status: o.status, seconds: results.smokes[name].seconds, quiet: results.smokes[name].tasks.map(t => t.longestQuietSeconds) }));
  await wait(() => !E.state.agents.claude.assignment, 60_000);
  return o;
}

try {
  await wait(() => E.state.agents.claude.observedStatus !== 'UNKNOWN', 60_000);
  results.health = (await fetch(`${hq.origin}/api/state`, { headers: auth }).then(r => r.json())).health;
  const FEED = 'Evidence feed (slow source). Incident 2026-10-01: a read-only Claude investigation was stopped as STALLED. Recorded cause: Claude Code streams no thinking text; thinking_delta records carry an empty string plus an estimated token count.\n';
  if (ONLY.includes('investigate')) {
    const feed = slowFeed('feed-investigate.log', FEED, 160_000);
    await smoke('investigate', { type: 'investigate', title: 'Watchdog smoke: quiet investigation', objective: `First, use the Read tool once on ${feed.file} (an evidence feed on a slow source: it takes about two and a half minutes to deliver; wait for it, read it only once). Then find where tools/hillink-hq/engine.mjs decides that a run is STALLED (function and line), and report what the feed says caused the incident. Read-only.`, scope: [], tests: [], acceptanceCriteria: null, constraints: 'Read-only. Read the feed file only once.', requestedActions: [] }, { feed });
  }
  if (ONLY.includes('review')) {
    const feed = slowFeed('feed-review.log', FEED, 160_000);
    await smoke('review', { type: 'review', title: 'Watchdog smoke: quiet review', objective: `First, use the Read tool once on ${feed.file} (a slow evidence source: about two and a half minutes; wait for it, read it once). Then review tools/hillink-hq/inflight.mjs: does whileRunning always close the quiet phase it opens, on success and on failure? Report findings with severity and file:line evidence.`, scope: [], tests: [], acceptanceCriteria: null, constraints: 'Read-only. Read the feed file only once.', requestedActions: [] }, { feed });
  }
  if (ONLY.includes('implement')) {
    await smoke('implement', { type: 'implement', title: 'Watchdog smoke: quiet implementation', objective: 'Create sandbox/hq-quiet-smoke/sum.mjs exporting sum(a, b) that returns a + b, and sandbox/hq-quiet-smoke/sum.test.mjs: a node:test file importing { sum } from ./sum.mjs with ONE test that first awaits a 155 second timer (await new Promise(r => setTimeout(r, 155_000))) and then asserts sum(2, 3) === 5. The long wait is deliberate (it exercises HQ\'s watchdog); keep it. Do not call run_tests: the test takes about 2.5 minutes and HQ runs it itself after you finish.', scope: ['sandbox/hq-quiet-smoke/'], tests: ['sandbox/hq-quiet-smoke/sum.test.mjs'], acceptanceCriteria: 'sum(2, 3) === 5 and the test file passes (it waits 155 s first, on purpose).', constraints: 'Only these two new files. No dependencies.', requestedActions: [] });
  }
  if (ONLY.includes('stall')) {
    // Genuine stall: Claude frozen (SIGSTOP) while answering. Alive (the process exists), silent, nothing declared.
    const started = Date.now();
    const { id } = await submit({ type: 'investigate', title: 'Watchdog smoke: genuine stall', objective: 'Without using any tools, write a long (about 1500 words) plain-text explanation of how a watchdog can tell a slow worker from a hung one. Answer directly; do not read files.', scope: [], tests: [], acceptanceCriteria: null, constraints: 'Read-only.', requestedActions: [] });
    const streaming = await wait(() => fs.existsSync(pidFile) && Object.values(E.state.tasks).some(t => t.link?.objectiveId === id && t.evidence.some(e => e.streaming)), 10 * 60_000);
    if (!streaming) { console.log('stall-debug', JSON.stringify({ objective: E.state.objectives[id], claude: E.status(E.state.agents.claude), tail: E.state.events.slice(-25).map(e => [e.type, e.data?.kind, String(e.data?.summary ?? e.data?.reason ?? '').slice(0, 160)]) }, null, 1)); throw Error('stall smoke: Claude never started streaming'); }
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    const task = Object.values(E.state.tasks).find(t => t.link?.objectiveId === id);
    // Freeze it between outputs: after its first streamed output and with no quiet phase open.
    // The process must still be alive and its run still open, or there is nothing to freeze.
    const isAlive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    await wait(() => !isAlive() || E.state.runs[task.runId]?.endedAt || !Object.keys(E.state.runs[task.runId]?.phases ?? {}).length, 60_000);
    if (!isAlive() || E.state.runs[task.runId]?.endedAt) throw Error('stall smoke: Claude finished before it could be frozen; make the answer longer');
    process.kill(pid, 'SIGSTOP');
    const frozenAt = Date.now();
    const openAtFreeze = Object.keys(E.state.runs[task.runId]?.phases ?? {});
    await wait(() => E.state.runs[task.runId]?.endedAt, 12 * 60_000);
    const run = E.state.runs[task.runId];
    let alive = true; try { process.kill(pid, 0); } catch { alive = false; }
    if (alive) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    results.smokes.stall = { objectiveId: id, frozenPid: pid, phasesOpenAtFreeze: openAtFreeze, secondsFrozenUntilStopped: Math.round((run.endedAt - frozenAt) / 1000), terminal: run.terminal, taskStage: E.state.tasks[task.id].stage, recovery: E.state.events.filter(e => e.type === 'RECOVERY' && e.data.taskId === task.id).map(e => e.data.reason), parked: E.state.tasks[task.id].blocker, processLeftAlive: alive, quarantinedAfter: (E.state.agents.claude.quarantineUntil ?? 0) > E.now(), seconds: Math.round((Date.now() - started) / 1000) };
    console.log('stall', JSON.stringify(results.smokes.stall));
    // Cooldown, then Claude is healthy again.
    await wait(() => E.status(E.state.agents.claude) === 'IDLE', 5 * 60_000);
    results.smokes.stall.claudeStatusAfterCooldown = E.status(E.state.agents.claude);
  }
  const stream = fs.existsSync(streamLog) ? fs.readFileSync(streamLog, 'utf8') : '';
  results.claudeSessions = stream.split('\n').filter(l => l.includes('"subtype":"init"')).map(l => { try { const m = JSON.parse(l); return { apiKeySource: m.apiKeySource, model: m.model, tools: m.tools?.length }; } catch { return null; } });
  results.leaks = { journal: LEAKS.filter(m => JSON.stringify(E.state.events).includes(m)), claudeStream: LEAKS.filter(m => stream.includes(m)) };
  results.ledger = E.snapshot().compute.ledger;
  results.alerts = Object.values(E.state.alerts).filter(a => a.active).map(a => `${a.kind}: ${String(a.detail ?? '').slice(0, 160)}`);
} finally { await hq.close(); try { fs.rmSync(feedDir, { recursive: true, force: true }); } catch { /* gone */ } }
results.openAiRequests = openaiCalls.length;
results.finishedAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ smokes: Object.fromEntries(Object.entries(results.smokes).map(([k, v]) => [k, v.status ?? v.terminal])), openAiRequests: results.openAiRequests, leaks: results.leaks, metered: results.ledger?.meteredSpendToday }, null, 2));
