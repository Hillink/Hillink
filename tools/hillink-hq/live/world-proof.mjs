// Consolidation autonomy proof (2026-10-01): ONE HQ objective for a tiny World change, end to end with no relay.
//   HQ_IMPL_BASE=origin/claude/dev-baseline node live/world-proof.mjs     (from tools/hillink-hq; Node 24; Linux, root)
// HQ plans and routes the objective; Claude implements on this machine's subscription sign-in through the split broker
// (ZERO_CREDIT: metered credentials are fakes that would fail if used; OpenAI requests are counted and must be 0);
// HQ runs the acceptance tests in the sandbox, verifies the commit and reviews; the commit stays on a local hq/impl/
// branch. Nothing is pushed, merged or deployed. Evidence is written to PROOF_OUT (default docs/world-proof-results.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHQ } from '../server.mjs';
import { LinuxSandbox } from '../sandbox/linux.mjs';
import { worldActivity } from '../orchestration/activity.mjs';

const OUT = process.env.PROOF_OUT || path.join(import.meta.dirname, '..', 'docs', 'world-proof-results.json');
const BASE = process.env.HQ_IMPL_BASE;
if (!BASE) throw Error('set HQ_IMPL_BASE (e.g. origin/claude/dev-baseline)');
const FAKE = { OPENAI_API_KEY: 'sk-proj-FAKE-world-proof-never-valid', ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-world-proof-never-valid', CODEX_API_KEY: 'sk-proj-FAKE-codex-world-proof-never-valid', HQ_SANDBOX_ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-world-proof-sandbox-never-valid-0' };
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-world-proof-'));
const streamLog = path.join(work, 'claude-stream.jsonl'), wrapper = path.join(work, 'claude-wrapped.sh');
fs.writeFileSync(wrapper, `#!/bin/bash\nclaude "$@" | tee -a "${streamLog}"\nexit \${PIPESTATUS[0]}\n`, { mode: 0o700 });
const env = { ...process.env, ...FAKE, HQ_CLAUDE_BIN: wrapper, HQ_WORKTREE_DIR: path.join(work, 'worktrees'), HQ_SANDBOX_HOME: path.join(work, 'sandbox'), HQ_IMPL_BASE: BASE };
delete env.HQ_COMPUTE_MODE; // the default must be ZERO_CREDIT
const openaiCalls = [];
const request = async (url, init) => { openaiCalls.push(String(url)); return fetch(url, init); };
const hillink = path.resolve(import.meta.dirname, '..', '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: hillink, encoding: 'utf8' }).trim();
const wait = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise(r => setTimeout(r, 500)); } return false; };
const sandboxes = { created: 0, destroyed: 0 };
const sandboxFactory = ({ env: e }) => {
  const s = new LinuxSandbox({ home: e.HQ_SANDBOX_HOME });
  const create = s.create.bind(s), destroy = s.destroy.bind(s);
  s.create = async n => { sandboxes.created++; return create(n); };
  s.destroy = async n => { sandboxes.destroyed++; return destroy(n); };
  return s;
};
const LEAKS = [...Object.values(FAKE), '"accessToken"', '"refreshToken"', 'sk-ant-oat'];
const leaks = text => LEAKS.filter(m => text.includes(m));
const baseCommit = git('rev-parse', `${BASE}^{commit}`);

const results = { startedAt: new Date().toISOString(), machine: { platform: process.platform, node: process.version, claude: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim() }, base: { ref: BASE, commit: baseCommit, originMain: git('rev-parse', 'origin/main') } };
const hq = await createHQ({ port: 0, directory: path.join(work, 'state'), env, request, cliAgents: true, implementation: true, sandboxFactory, intervalMs: 250 });
let oid = null;
try {
  await wait(() => hq.engine.state.agents.claude.observedStatus !== 'UNKNOWN', 60_000);
  const headers = { 'X-HQ-Client': 'command-center' };
  const { token } = await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json());
  const auth = { ...headers, Authorization: `Bearer ${token}` };
  results.health = (await fetch(`${hq.origin}/api/state`, { headers: auth }).then(r => r.json())).health;
  // The ONE objective. After this POST, nothing in this script touches HQ: it only waits and reads state.
  const objective = {
    type: 'implement',
    title: 'World: agent name initials helper',
    objective: 'Add a tiny pure helper tools/hillink-world/core/initials.mjs exporting initials(name) that returns the uppercase first letter of each whitespace-separated word, at most 2 letters (initials("hillink world") === "HW", initials("claude") === "C", initials("  ") === ""), with a node:test file tools/hillink-world/tests/initials.test.mjs that imports it from ../core/initials.mjs.',
    scope: ['tools/hillink-world/core/initials.mjs', 'tools/hillink-world/tests/initials.test.mjs'],
    tests: ['tools/hillink-world/tests/initials.test.mjs'],
    acceptanceCriteria: 'initials("hillink world") is "HW", initials("claude") is "C", initials("a b c") is "AB", initials("  ") is "", and the test file passes.',
    constraints: 'Only these two new files. No dependencies. Do not modify any existing file.',
  };
  results.objectiveSubmitted = objective;
  results.submittedAt = new Date().toISOString();
  const res = await fetch(`${hq.origin}/api/objectives`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(objective) }).then(r => r.json());
  oid = res.id; results.submitResponse = { id: res.id, status: res.status ?? null, error: res.error ?? null };
  const end = ['COMPLETE', 'FAILED', 'BLOCKED', 'CANCELLED', 'AWAITING_DECISION', 'AWAITING_APPROVAL'];
  if (oid) await wait(() => end.includes(hq.engine.state.objectives[oid]?.status), 30 * 60_000);
  results.finishedAt = new Date().toISOString();
  const o = oid ? hq.engine.state.objectives[oid] : null;
  if (o) {
    results.objective = { id: oid, status: o.status, reason: o.statusReason ?? null, plan: o.plan ?? null, result: o.result ?? null, decisions: Object.values(o.decisions ?? {}).map(d => ({ status: d.status, question: d.question?.slice(0, 300) })) };
    results.steps = o.order.map(sid => {
      const st = o.steps[sid], t = st.taskId ? hq.engine.state.tasks[st.taskId] : null, run = t?.runId ? hq.engine.state.compute.runs[t.runId] : null;
      return { kind: st.kind, status: st.status, agentId: st.agentId, taskStage: t?.stage ?? null, operation: t?.operation ?? null, computeClass: run?.computeClass ?? null, variant: run?.variant ?? null, routeId: run?.routeId ?? null, meteredCostUsd: run?.meteredCostUsd ?? 0,
        evidence: (t?.evidence ?? []).filter(e => e.kind !== 'HEARTBEAT' && e.kind !== 'BROKER').map(e => `${e.kind}: ${String(e.summary ?? '').slice(0, 300)}`) };
    });
    const impl = Object.values(hq.engine.state.tasks).find(t => t.operation === 'implement-repo' && t.link?.objectiveId === oid);
    if (impl) {
      const b = impl.evidence.filter(e => e.kind === 'BROKER').map(e => e.broker);
      results.broker = { events: [...new Set(b.map(x => x.event))], allowedWrites: b.filter(x => x.event === 'BROKER_WRITE_ALLOWED').map(x => x.path), refusals: b.filter(x => /REFUSED/.test(x.event)).map(x => `${x.op ?? ''} ${x.path ?? ''}: ${x.reason ?? x.outcome}`.slice(0, 160)), testRuns: b.filter(x => x.event === 'SANDBOX_TEST_STARTED').length };
      results.implementationWhere = impl.evidence.find(e => e.implementation?.branch)?.implementation ?? null;
    }
    results.journal = hq.engine.state.events.filter(e => JSON.stringify(e.data ?? {}).includes(oid) || (results.implementationWhere && JSON.stringify(e.data ?? {}).includes(results.implementationWhere.branch ?? '#none#'))).map(e => ({ at: e.at ?? e.ts ?? null, type: e.type, summary: String(e.data?.summary ?? e.data?.status ?? '').slice(0, 200) }));
    // Independent git checks on the result (this script, after HQ is done).
    const commit = o.result?.commit ?? null, branch = results.implementationWhere?.branch ?? null;
    if (commit) {
      const parent = git('rev-parse', `${commit}^`);
      results.git = {
        branch, commit, parent,
        parentIsDevBaseline: parent === baseCommit,
        descendsFromDevBaseline: (() => { try { git('merge-base', '--is-ancestor', baseCommit, commit); return true; } catch { return false; } })(),
        parentIsOriginMain: parent === results.base.originMain,
        files: git('show', '--name-status', '--format=', commit).split('\n').filter(Boolean),
        message: git('log', '-1', '--format=%B', commit),
        onRemote: git('branch', '-r', '--contains', commit) || 'not on any remote branch',
        branchTip: branch ? git('rev-parse', branch) : null,
      };
      results.git.content = execFileSync('git', ['show', commit, '--format=', '--', ...objective.scope], { cwd: hillink, encoding: 'utf8' }).slice(0, 4000);
    }
    results.worldActivity = [...new Set(worldActivity(hq.engine.state.events, { limit: 5000 }).map(i => i.type))];
  }
  const stream = fs.existsSync(streamLog) ? fs.readFileSync(streamLog, 'utf8') : '';
  results.claudeSessions = stream.split('\n').filter(l => l.includes('"subtype":"init"')).map(l => { try { const m = JSON.parse(l); return { apiKeySource: m.apiKeySource, tools: m.tools, mcp: m.mcp_servers?.map(s => `${s.name}:${s.status}`) }; } catch { return null; } });
  results.leaks = { journal: leaks(JSON.stringify(hq.engine.state.events)), claudeStream: leaks(stream) };
  results.ledger = hq.engine.snapshot().compute.ledger;
  results.computeModeAfter = hq.engine.config.computeMode;
} finally { await hq.close(); }
results.openAiRequests = openaiCalls.length;
results.sandboxes = sandboxes;
results.sandboxLeftovers = fs.existsSync(path.join(work, 'sandbox', 'instances')) ? fs.readdirSync(path.join(work, 'sandbox', 'instances')) : [];
results.manualStepsAfterSubmission = 0; // this script performs none: it only waits and reads state after the POST
fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ status: results.objective?.status, reason: results.objective?.reason, git: results.git && { ...results.git, content: undefined }, openAiRequests: results.openAiRequests, sandboxes, leaks: results.leaks }, null, 2));
