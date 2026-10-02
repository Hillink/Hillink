// Art Factory Step 1: HQ's 'asset' objective. Real engine, conductor, Art Factory adapter (real git worktree, real
// processes, real node --test) and asset verifier, with a stand-in factory script in place of Blender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { LocalAdapter } from '../local-adapter.mjs';
import { ArtFactoryAdapter, LocalChecksRouter } from '../art-factory-adapter.mjs';
import { Conductor } from '../orchestration/conductor.mjs';
import { AssetVerifier } from '../orchestration/asset-verify.mjs';
import { CommitVerifier } from '../orchestration/verify.mjs';
import { validateObjectiveInput, validateAssetRequest } from '../orchestration/policy.mjs';
import { planObjective } from '../orchestration/planner.mjs';
import { git, tempRepo } from './orchestration-harness.mjs';

const PY = (() => { try { return execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim(); } catch { return null; } })();
const FAKE_FACTORY = `import argparse, hashlib, json, os, sys
ap = argparse.ArgumentParser(); ap.add_argument('--recipe'); ap.add_argument('--out'); ap.add_argument('--scale', type=int); ap.add_argument('--evidence')
a = ap.parse_args()
r = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'recipes.json')))['recipes'][a.recipe]
os.makedirs(a.out, exist_ok=True); os.makedirs(a.evidence, exist_ok=True)
png = (b'PNG-standin-' + a.recipe.encode() + bytes([a.scale])) if a.recipe != 'flaky' else os.urandom(16)
open(os.path.join(a.out, 'sheet.png'), 'wb').write(png)
meta = {'v': 1, 'kind': 'hillink.character-sheet', 'agent': r['agent'], 'theme': r['theme'], 'status': r['status'], 'standIn': r.get('standIn', False), 'scale': a.scale, 'sheet': {'file': 'sheet.png', 'sha256': hashlib.sha256(png).hexdigest()}}
json.dump(meta, open(os.path.join(a.out, 'sheet.json'), 'w'), sort_keys=True)
if a.recipe == 'stray': open(os.path.join(a.out, '..', 'extra.txt'), 'w').write('x')
print('HQ-ART ' + json.dumps({'renders': 3, 'seconds': 0.1, 'blender': 'fake', 'engine': 'fake', 'clips': {'idle': 'Idle'}}))
`;
const FAKE_VERIFY = `import json, sys
print('HQ-ART-VERIFY ' + json.dumps({'ok': True, 'checks': {'alpha': True, 'anchor': True, 'sha': True}}))
`;
const RECIPES = { recipes: Object.fromEntries(['standin-robot', 'flaky', 'stray'].map(id => [id, { agent: 'claude', theme: 'fantasy', status: 'candidate', standIn: true, input: { sha256: '0'.repeat(64) } }])) };

function artRepo({ worldTest = "import test from 'node:test';\ntest('world ok', () => {});\n" } = {}) {
  const repo = tempRepo();
  const put = (rel, text) => { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  put('tools/hillink-art-factory/factory.py', FAKE_FACTORY); put('tools/hillink-art-factory/verify.py', FAKE_VERIFY);
  put('tools/hillink-art-factory/recipes.json', JSON.stringify(RECIPES)); put('tools/hillink-world/tests/ok.test.mjs', worldTest);
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'factory'); git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return repo;
}
function hqWith(repo) {
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-art-wt-'));
  const art = new ArtFactoryAdapter({ repoRoot: repo, python: PY, worktreeRoot, env: { PATH: process.env.PATH, HOME: os.tmpdir() }, heartbeatMs: 50 });
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': new LocalChecksRouter(new LocalAdapter(), art) }, config: { heartbeatMs: 600_000, progressMs: 600_000 } });
  engine.initialize();
  engine.configureAgent('hq-verifier', { capabilities: [...engine.state.agents['hq-verifier'].capabilities, 'produce-asset'] });
  const conductor = new Conductor(engine, { verifier: new CommitVerifier({ repoRoot: repo }), assetVerifier: new AssetVerifier({ repoRoot: repo }) });
  engine.conductor = conductor;
  const run = async (asset, max = 2000) => {
    const id = conductor.submit({ type: 'asset', title: 'Stand-in sheet', objective: 'Produce the stand-in character sheet for the Fantasy World.', asset });
    for (let i = 0; i < max; i++) {
      await engine.tick(); await conductor.tick();
      if (['COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED', 'AWAITING_DECISION', 'AWAITING_APPROVAL'].includes(engine.state.objectives[id].status)) break;
      await new Promise(r => setTimeout(r, 10));
    }
    return engine.state.objectives[id];
  };
  return { engine, conductor, art, run, worktreeRoot };
}
const evidenceOf = (engine, o) => Object.values(engine.state.tasks).filter(t => t.link?.objectiveId === o.id).flatMap(t => t.evidence.map(e => `${e.kind}: ${e.summary}`));

test('asset objectives: a recipe id and a scale, nothing else', () => {
  const ok = validateObjectiveInput({ type: 'asset', objective: 'Produce the stand-in sheet.', asset: { recipe: 'standin-robot', scale: 2 } });
  assert.deepEqual(ok.asset, { recipe: 'standin-robot', scale: 2 });
  assert.deepEqual(validateObjectiveInput({ type: 'asset', objective: 'x', asset: { recipe: 'standin-robot' } }).asset.scale, 1);
  for (const [asset, re] of [[{ recipe: '../../etc' }, /recipe id/], [{ recipe: 'a', scale: 5 }, /scale/], [{ recipe: 'a', python: '/bin/sh' }, /Unexpected asset field/], [null, /asset must be an object/], [{ recipe: 'a; rm -rf /' }, /recipe id/]]) {
    assert.throws(() => validateObjectiveInput({ type: 'asset', objective: 'x', asset }), re);
  }
  assert.throws(() => validateObjectiveInput({ type: 'asset', objective: 'x', asset: { recipe: 'a' }, scope: ['tools/hillink-world/'] }), /no scope or tests/);
  assert.throws(() => validateObjectiveInput({ type: 'investigate', objective: 'x', asset: { recipe: 'a' } }), /only valid for type "asset"/);
  assert.throws(() => validateAssetRequest({ recipe: 'A' }), /recipe id/);
});

test('asset objectives: planned as produce (local) then HQ verify, $0, low risk', () => {
  const input = validateObjectiveInput({ type: 'asset', objective: 'Produce the stand-in sheet.', asset: { recipe: 'standin-robot', scale: 1 } });
  const plan = planObjective({ input });
  assert.deepEqual(plan.steps.map(s => s.kind), ['produce', 'verify']);
  assert.equal(plan.risk, 'low');
  assert.deepEqual(plan.compute.steps.map(s => [s.kind, s.computeClass]), [['produce', 'LOCAL'], ['verify', 'LOCAL']]);
  assert.equal(plan.compute.expectedMeteredSpendUsd, 0);
});

test('engine: produce-asset is its own write class, for the local verifier only', () => {
  const engine = new Engine({ store: new MemoryStore(), adapters: {} }); engine.initialize();
  engine.configureAgent('hq-verifier', { capabilities: [...engine.state.agents['hq-verifier'].capabilities, 'produce-asset'] });
  const base = { title: 't', description: 'd', priority: 50 };
  assert.throws(() => engine.createTask({ ...base, operation: 'produce-asset', safety: 'local-read-only', preferredAgentId: 'hq-verifier', asset: { recipe: 'a' } }), /only they, use local-artifact-write/);
  assert.throws(() => engine.createTask({ ...base, operation: 'inspect-repo', safety: 'local-artifact-write' }), /only they, use local-artifact-write/);
  assert.throws(() => engine.createTask({ ...base, operation: 'produce-asset', safety: 'local-artifact-write', preferredAgentId: 'hq-verifier', asset: { recipe: 'a', cmd: 'x' } }), /Unexpected asset field/);
  assert.throws(() => engine.createTask({ ...base, operation: 'produce-asset', safety: 'local-artifact-write', asset: { recipe: 'a' } }), /local verifier process only/);
  const id = engine.createTask({ ...base, operation: 'produce-asset', safety: 'local-artifact-write', preferredAgentId: 'hq-verifier', asset: { recipe: 'standin-robot', scale: 2 } });
  assert.deepEqual(engine.state.tasks[id].asset, { recipe: 'standin-robot', scale: 2 });
});

test('one asset objective runs unattended: worktree, two identical renders, checks, World tests, verified commit', { skip: !PY && 'python3 not available' }, async () => {
  const repo = artRepo(), base = git(repo, 'rev-parse', 'HEAD').trim(), hq = hqWith(repo);
  const o = await hq.run({ recipe: 'standin-robot', scale: 2 });
  assert.equal(o.status, 'COMPLETE', `${o.statusReason}\n${evidenceOf(hq.engine, o).join('\n')}`);
  assert.match(o.statusReason, /candidate art until Kyle approves/);
  const a = o.result.asset;
  assert.equal(a.outDir, 'tools/hillink-world/assets/characters/claude/fantasy/x2');
  assert.deepEqual(a.filesChanged, ['tools/hillink-world/assets/characters/claude/fantasy/x2/sheet.json', 'tools/hillink-world/assets/characters/claude/fantasy/x2/sheet.png']);
  assert.equal(a.determinism.identical, true); assert.equal(a.standIn, true); assert.equal(a.base, base);
  assert.match(a.branch, /^hq\/asset\/[0-9a-f]{8}-[0-9a-f]{6}$/);
  assert.equal(git(repo, 'rev-parse', `refs/heads/${a.branch}`).trim(), a.commit);
  assert.match(git(repo, 'log', '-1', '--format=%B', a.commit), /HQ-Task: .*\nHQ-Asset: standin-robot@2x/);
  assert.equal(git(repo, 'rev-parse', 'main').trim(), base, 'main is untouched');
  const v = o.result.verification;
  assert.equal(v.ok, true); assert.ok(v.checks.length >= 12 && v.checks.every(c => c.ok), JSON.stringify(v.checks.filter(c => !c.ok)));
  const steps = o.order.map(id => o.steps[id]);
  assert.deepEqual(steps.map(s => [s.kind, s.status, s.agentId]), [['produce', 'DONE', 'hq-verifier'], ['verify', 'DONE', 'hq']]);
  const run = Object.values(hq.engine.state.compute.runs).find(r => r.operation === 'produce-asset');
  assert.equal(run.computeClass, 'LOCAL');
  assert.ok(!fs.readdirSync(path.join(repo)).includes('tools') || !fs.existsSync(path.join(repo, a.outDir)), 'nothing is written to the main checkout');
});

test('asset objectives stop truthfully: non-deterministic output, stray files, failing World tests, unknown recipe', { skip: !PY && 'python3 not available' }, async () => {
  const flaky = hqWith(artRepo());
  let o = await flaky.run({ recipe: 'flaky' });
  assert.equal(o.status, 'BLOCKED'); assert.ok(evidenceOf(flaky.engine, o).some(e => /Not deterministic/.test(e)), evidenceOf(flaky.engine, o).join('\n'));
  const stray = hqWith(artRepo());
  o = await stray.run({ recipe: 'stray' });
  assert.equal(o.status, 'BLOCKED'); assert.ok(evidenceOf(stray.engine, o).some(e => /Unexpected changes .*extra\.txt/.test(e)));
  const red = hqWith(artRepo({ worldTest: "import test from 'node:test';\nimport assert from 'node:assert';\ntest('world', () => assert.fail('broken'));\n" }));
  o = await red.run({ recipe: 'standin-robot' });
  assert.equal(o.status, 'BLOCKED'); assert.ok(evidenceOf(red.engine, o).some(e => /World tests failed/.test(e)));
  const unknown = hqWith(artRepo());
  o = await unknown.run({ recipe: 'not-a-recipe' });
  assert.equal(o.status, 'BLOCKED'); assert.ok(evidenceOf(unknown.engine, o).some(e => /not allowlisted/.test(e)));
  for (const h of [flaky, stray, red, unknown]) for (const t of Object.values(h.engine.state.tasks)) assert.ok(!t.evidence.some(e => e.kind === 'COMMIT'), 'nothing committed');
});

test('the asset verifier re-derives everything from git: a tampered sheet or a stray file fails', { skip: !PY && 'python3 not available' }, async () => {
  const repo = artRepo(), hq = hqWith(repo);
  const o = await hq.run({ recipe: 'standin-robot' });
  assert.equal(o.status, 'COMPLETE');
  const task = Object.values(hq.engine.state.tasks).find(t => t.operation === 'produce-asset'), h = o.steps[o.order[0]].handoff, v = new AssetVerifier({ repoRoot: repo });
  assert.equal((await v.verify(task, h)).ok, true);
  // A later commit that changes the sheet (or adds anything else) on the branch is not what HQ produced.
  const wt = task.evidence.find(e => e.asset?.worktree)?.asset.worktree;
  fs.writeFileSync(path.join(wt, h.outDir, 'sheet.png'), 'tampered'); git(wt, 'commit', '-qam', 'tamper');
  const r = await v.verify(task, h);
  assert.equal(r.ok, false);
  assert.ok(r.checks.some(c => !c.ok && /head of the task branch/.test(c.name)));
  assert.equal((await v.verify(task, { ...h, outDir: '../../etc' })).ok, false);
  assert.equal((await v.verify(task, { ...h, source: 'model' })).ok, false);
});

test('HQ offers produce-asset only when the Art Factory is enabled and its Python exists', async () => {
  const { createHQ } = await import('../server.mjs');
  const off = await createHQ({ port: 0, store: new MemoryStore(), env: { PATH: process.env.PATH }, intervalMs: 60_000 });
  try { assert.ok(!off.engine.state.agents['hq-verifier'].capabilities.includes('produce-asset')); } finally { await off.close(); }
  const store = new MemoryStore();
  const missing = await createHQ({ port: 0, store, env: { PATH: process.env.PATH, HQ_ART_PYTHON: '/nonexistent/python' }, artFactory: true, intervalMs: 60_000 });
  try {
    const headers = { 'X-HQ-Client': 'command-center' }, { token } = await fetch(`${missing.origin}/api/session`, { headers }).then(r => r.json());
    const health = (await fetch(`${missing.origin}/api/state`, { headers: { ...headers, Authorization: `Bearer ${token}` } }).then(r => r.json())).health;
    assert.match(health.artFactory, /^UNAVAILABLE: HQ_ART_PYTHON/);
    assert.ok(!missing.engine.state.agents['hq-verifier'].capabilities.includes('produce-asset'));
  } finally { await missing.close(); }
  if (!PY) return;
  const on = await createHQ({ port: 0, store: new MemoryStore(), env: { PATH: process.env.PATH, HQ_ART_PYTHON: PY, HQ_IMPL_BASE: 'origin/main' }, artFactory: true, intervalMs: 60_000 });
  try {
    assert.ok(on.engine.state.agents['hq-verifier'].capabilities.includes('produce-asset'));
    assert.ok(on.engine.adapters['local-checks'] instanceof LocalChecksRouter);
  } finally { await on.close(); }
});
