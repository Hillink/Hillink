// Art Factory Step 1 proof: ONE HQ asset objective, end to end, with nobody in the loop after it is submitted.
//   HQ_IMPL_BASE=origin/claude/art-factory-step1 HQ_ART_PYTHON=/path/to/python3.11-with-bpy node live/art-factory-proof.mjs
// HQ plans the objective, then routes produce-asset to its local verifier process (LOCAL compute). The Art Factory
// adapter creates a worktree, renders the stand-in with headless Blender twice (the bytes must match), runs verify.py
// and the World tests, and commits the sheet to a local hq/asset/ branch. HQ then verifies that commit from git.
// Nothing is pushed, merged or deployed. Metered credentials are fakes, so any use of them would fail.
// Evidence goes to PROOF_OUT (default docs/art-factory-proof-results.json), and the factory evidence is copied to PROOF_EVIDENCE.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHQ } from '../server.mjs';
import { worldActivity } from '../orchestration/activity.mjs';

const OUT = process.env.PROOF_OUT || path.join(import.meta.dirname, '..', 'docs', 'art-factory-proof-results.json');
const EVIDENCE = process.env.PROOF_EVIDENCE || null;
const BASE = process.env.HQ_IMPL_BASE, PY = process.env.HQ_ART_PYTHON;
const RECIPE = process.env.PROOF_RECIPE || 'standin-robot', SCALE = Number(process.env.PROOF_SCALE || 1);
if (!BASE || !PY) throw Error('set HQ_IMPL_BASE (e.g. origin/claude/art-factory-step1) and HQ_ART_PYTHON');
const FAKE = { OPENAI_API_KEY: 'sk-proj-FAKE-art-proof-never-valid', ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE-art-proof-never-valid', CODEX_API_KEY: 'sk-proj-FAKE-codex-art-proof-never-valid' };
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-art-proof-'));
const env = { ...process.env, ...FAKE, HQ_ART_FACTORY: '1', HQ_ART_PYTHON: PY, HQ_IMPL_BASE: BASE, HQ_WORKTREE_DIR: path.join(work, 'worktrees') };
delete env.HQ_COMPUTE_MODE; // the default must be ZERO_CREDIT
const outbound = [];
const request = async (url, init) => { outbound.push(String(url)); return fetch(url, init); };
const hillink = path.resolve(import.meta.dirname, '..', '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: hillink, encoding: 'utf8' }).trim();
const wait = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };
const baseCommit = git('rev-parse', `${BASE}^{commit}`);

const results = { startedAt: new Date().toISOString(), machine: { platform: process.platform, node: process.version, python: execFileSync(PY, ['-c', 'import bpy,sys;print(sys.version.split()[0], "bpy", bpy.app.version_string)'], { encoding: 'utf8' }).trim() }, base: { ref: BASE, commit: baseCommit } };
const hq = await createHQ({ port: 0, directory: path.join(work, 'state'), env, request, artFactory: true, intervalMs: 250 });
let oid = null;
try {
  const headers = { 'X-HQ-Client': 'command-center' };
  const { token } = await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json());
  const auth = { ...headers, Authorization: `Bearer ${token}` };
  const h = (await fetch(`${hq.origin}/api/state`, { headers: auth }).then(r => r.json())).health;
  results.health = { artFactory: h.artFactory, artFactoryBase: h.artFactoryBase, computeMode: h.computeMode, implementation: h.implementation, cliAgents: h.cliAgents, orchestrator: h.orchestrator };
  // The ONE objective. After this POST, nothing in this script writes to HQ: it only waits and reads state.
  const objective = { type: 'asset', title: `Art Factory: ${RECIPE} sheet @${SCALE}x`, objective: `Produce the Fantasy Claude character sheet from the ${RECIPE} recipe at ${SCALE}x with the Art Factory, prove it is deterministic, and verify it loads in the World.`, asset: { recipe: RECIPE, scale: SCALE } };
  results.request = { method: 'POST', path: '/api/objectives', headers: ['X-HQ-Client: command-center', 'Authorization: Bearer <HQ session token from GET /api/session>', 'Content-Type: application/json'], body: objective };
  results.submittedAt = new Date().toISOString();
  const res = await fetch(`${hq.origin}/api/objectives`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(objective) }).then(r => r.json());
  oid = res.id; results.submitResponse = res;
  if (oid) await wait(() => ['COMPLETE', 'FAILED', 'BLOCKED', 'CANCELLED', 'AWAITING_DECISION', 'AWAITING_APPROVAL'].includes(hq.engine.state.objectives[oid]?.status), 60 * 60_000);
  results.finishedAt = new Date().toISOString();
  results.seconds = (Date.parse(results.finishedAt) - Date.parse(results.submittedAt)) / 1000;
  const o = oid ? hq.engine.state.objectives[oid] : null;
  if (o) {
    results.objective = { id: oid, status: o.status, reason: o.statusReason, history: o.history.map(x => `${x.to}: ${x.reason}`.slice(0, 200)), plan: { steps: o.plan.steps.map(s => s.kind), risk: o.plan.risk, gates: o.plan.gates, compute: o.plan.compute }, decisions: Object.keys(o.decisions), approvals: Object.keys(o.approvals) };
    results.steps = o.order.map(sid => {
      const st = o.steps[sid], t = st.taskId ? hq.engine.state.tasks[st.taskId] : null, run = t?.runId ? hq.engine.state.compute.runs[t.runId] : null;
      return { kind: st.kind, status: st.status, agentId: st.agentId, operation: t?.operation ?? null, safety: t?.safety ?? null, taskAsset: t?.asset ?? null, computeClass: run?.computeClass ?? (st.kind === 'verify' ? 'LOCAL (HQ)' : null), meteredCostUsd: run?.meteredCostUsd ?? 0, evidence: (t?.evidence ?? []).filter(e => e.kind !== 'HEARTBEAT').map(e => `${e.kind}: ${String(e.summary ?? '').slice(0, 300)}`) };
    });
    const a = o.result?.asset;
    results.asset = a ? { ...a } : null;
    results.verification = o.result?.verification?.checks?.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`) ?? null;
    if (a?.commit) {
      results.git = {
        branch: a.branch, commit: a.commit, parent: git('rev-parse', `${a.commit}^`), parentIsBase: git('rev-parse', `${a.commit}^`) === baseCommit,
        files: git('show', '--name-status', '--format=', a.commit).split('\n').filter(Boolean),
        message: git('log', '-1', '--format=%B', a.commit),
        onRemote: git('branch', '-r', '--contains', a.commit) || 'not on any remote branch',
      };
      if (EVIDENCE) {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        for (const f of ['sheet.png', 'sheet.json']) fs.writeFileSync(path.join(EVIDENCE, f), execFileSync('git', ['show', `${a.commit}:${a.outDir}/${f}`], { cwd: hillink }));
        for (const f of ['factory-report.json', 'raw-contact.png']) fs.copyFileSync(path.join(a.evidenceDir, 'run1', f), path.join(EVIDENCE, f));
        fs.copyFileSync(path.join(a.evidenceDir, 'run2', 'factory-report.json'), path.join(EVIDENCE, 'factory-report-run2.json'));
        results.evidenceCopiedTo = EVIDENCE;
      }
    }
    results.worldActivity = [...new Set(worldActivity(hq.engine.state.events, { limit: 5000 }).map(i => i.type))];
  }
  results.ledger = hq.engine.snapshot().compute.ledger;
  results.leaks = { journal: Object.values(FAKE).filter(v => JSON.stringify(hq.engine.state.events).includes(v)) };
} finally { await hq.close(); }
results.outboundRequestsFromHQ = outbound.length;
results.manualStepsAfterSubmission = 0; // this script performs none: it only waits and reads state after the POST
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ status: results.objective?.status, reason: results.objective?.reason, seconds: results.seconds, git: results.git && { branch: results.git.branch, commit: results.git.commit, parentIsBase: results.git.parentIsBase, files: results.git.files }, verification: results.verification, outbound: results.outboundRequestsFromHQ }, null, 2));
