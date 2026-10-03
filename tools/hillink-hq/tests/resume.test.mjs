// Resuming preserved implementation work (resume.mjs, ClaudeImplementer.verifyPreserved). Real git in a temporary
// repository, the unsandboxed test runner, and a fake Claude whose edits can change between attempts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { CliAgentAdapter, cliAgents } from '../cli-agent-adapter.mjs';
import { ClaudeImplementer, ClaudeRouter, DIFF_CACHED } from '../implementation-runner.mjs';
import { validateImplementation, implementationBrief } from '../implementation-policy.mjs';
import { resolveResume } from '../resume.mjs';
import { validateObjectiveInput } from '../orchestration/policy.mjs';
import { TOOL_DEFINITIONS } from '../orchestrator-tools.mjs';
import { allowMetered } from './compute-helpers.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-resume-repo-'));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'hq@test'); git(dir, 'config', 'user.name', 'HQ Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}
// A fake Claude that writes holder.files (read when it starts, so a test can change them between attempts).
function fakeClaude(holder) {
  const briefs = [];
  const spawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.pid = 99; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
    child.stdin = Object.assign(new EventEmitter(), { written: '', end(text = '') {
      this.written += text; briefs.push(this.written);
      setImmediate(() => {
        for (const [rel, content] of Object.entries(holder.files)) { const f = path.join(opts.cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
        const line = o => child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n'));
        line({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'] });
        line({ type: 'result', subtype: 'success', is_error: false, result: 'Done.', usage: { input_tokens: 10, output_tokens: 20 }, num_turns: 2 });
        child.emit('close', 0, null);
      });
    } });
    return child;
  };
  return { spawn, briefs };
}
const DIR = 'sandbox/hq-implementation/';
const TEST_FILE = `${DIR}greeting.test.mjs`;
const TESTS = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from './greeting.mjs';\ntest('greets', () => assert.equal(greet('Kyle'), 'Hello, Kyle!'));\n";
const BROKEN = { [`${DIR}greeting.mjs`]: 'export const greet = name => `Hi ${name}`;\n', [TEST_FILE]: TESTS, [`${DIR}notes.md`]: 'first attempt notes\n' };
const FIX = { [`${DIR}greeting.mjs`]: "export const greet = name => `Hello, ${name}!`;\n" };
const CONTRACT = { objective: 'Add greet(name) returning "Hello, <name>!" with a test.', scope: [DIR], acceptanceCriteria: 'greet("Kyle") === "Hello, Kyle!".', constraints: 'Change nothing outside the sandbox directory.', tests: [TEST_FILE] };

function setup() {
  const repo = tempRepo(), worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-resume-wt-'));
  const holder = { files: BROKEN }, fake = fakeClaude(holder);
  const review = new CliAgentAdapter(cliAgents.claude, { spawn: fake.spawn, env: { PATH: process.env.PATH }, cwd: repo, graceMs: 10 });
  const implementer = new ClaudeImplementer({ repoRoot: repo, worktreeRoot, claudeBin: 'claude-test.exe', spawn: fake.spawn, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir() }, pulseMs: 50, unsandboxed: true });
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async () => {}, cancel: async () => true }, 'cli-claude': new ClaudeRouter({ ...review, health: async () => ({ status: 'IDLE', detail: 'fake Claude' }), start: r => review.start(r), cancel: id => review.cancel(id), close: () => {} }, implementer) }, now: () => 1_000_000, config: { heartbeatMs: 600_000, progressMs: 600_000 } });
  engine.initialize();
  engine.configureAgent('claude', { capabilities: ['implement', 'review', 'review-repo', 'implement-repo'], executionAdapter: 'cli-claude' });
  allowMetered(engine);
  const done = async id => { for (let i = 0; i < 400; i++) { await new Promise(r => setTimeout(r, 25)); if (['DONE', 'BLOCKED'].includes(engine.state.tasks[id].stage)) return engine.state.tasks[id]; } throw Error(`task stuck at ${engine.state.tasks[id].stage}`); };
  const run = async (implementation) => { const id = engine.createTask({ title: 'Implement greeting', description: implementation.objective, operation: 'implement-repo', safety: 'local-worktree-write', priority: 50, preferredAgentId: 'claude', implementation }); await engine.tick(); await engine.tick(); return done(id); };
  return { engine, repo, worktreeRoot, holder, fake, run };
}
// A first attempt that ends BLOCKED on a failing test, keeping its worktree: the preserved work to resume.
async function preserved(s) {
  const t = await s.run(CONTRACT);
  assert.equal(t.stage, 'BLOCKED'); assert.match(t.blocker, /Acceptance tests failed/);
  const impl = t.evidence.find(e => e.kind === 'BLOCKED').implementation;
  return { task: t, impl, name: path.basename(impl.worktree) };
}
// Everything about a worktree a resume must not change: HEAD, branch, index, staged patch, every file's bytes.
function fingerprint(dir) {
  const files = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === '.git') { files['.git'] = fs.readFileSync(p, 'utf8'); continue; } if (e.isDirectory()) walk(p); else files[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } };
  walk(dir);
  const gitDir = git(dir, 'rev-parse', '--git-dir').trim(), index = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(dir, gitDir, 'index'))).digest('hex');
  return { head: git(dir, 'rev-parse', 'HEAD').trim(), branch: git(dir, 'branch', '--show-current').trim(), index, staged: git(dir, ...DIFF_CACHED), status: git(dir, 'status', '--porcelain=v1'), files };
}
const resumed = (s, name, scope = CONTRACT.scope, owner = false) => ({ ...CONTRACT, scope, resume: resolveResume(s.engine.state, name, { scope, owner }) });

test('resume: a preserved attempt is verified, imported into a fresh worktree, finished there and committed; the preserved worktree is untouched', async () => {
  const s = setup();
  const p = await preserved(s);
  const before = fingerprint(p.impl.worktree);
  const contract = resumed(s, p.name);
  assert.equal(contract.resume.source, 'hq-evidence'); assert.equal(contract.resume.patchHash, p.impl.patchHash); assert.equal(contract.resume.fromTaskId, p.task.id);
  s.holder.files = FIX; // the second attempt fixes greeting.mjs only; the test file and notes come from the import
  const t = await s.run(contract);
  assert.equal(t.stage, 'DONE', t.blocker ?? '');
  const ev = t.evidence.find(e => e.resume);
  assert.equal(ev.kind, 'PROGRESS'); assert.equal(ev.resume.worktree, p.name); assert.equal(ev.resume.patchHash, p.impl.patchHash);
  const done = t.evidence.find(e => e.kind === 'COMPLETED').implementation;
  assert.notEqual(done.worktree, p.impl.worktree, 'a fresh worktree'); assert.notEqual(done.branch, p.impl.branch, 'a fresh branch');
  assert.equal(done.base, p.impl.base); assert.equal(done.resumedFrom.worktree, p.name); assert.equal(done.stageCommit, undefined);
  assert.deepEqual(done.files, [`${DIR}greeting.mjs`, TEST_FILE, `${DIR}notes.md`], 'scope check, hash and commit cover the imported files too');
  // One commit on the base: the import commit was only for staging.
  assert.equal(git(s.repo, 'rev-parse', `${done.commit}^`).trim(), p.impl.base);
  assert.match(git(s.repo, 'log', '-1', '--format=%B', done.commit), new RegExp(`Resumed-From: ${p.name} \\(patch sha256 ${p.impl.patchHash}, hq-evidence\\)`));
  assert.equal(git(s.repo, 'show', `${done.commit}:${DIR}notes.md`), 'first attempt notes\n');
  assert.equal(git(s.repo, 'show', `${done.commit}:${DIR}greeting.mjs`), FIX[`${DIR}greeting.mjs`]);
  // Claude was told it is continuing, with HQ's record of where the attempt stopped quoted as data.
  assert.match(s.fake.briefs.at(-1), /HQ resumed a preserved earlier attempt/); assert.match(s.fake.briefs.at(-1), /quoted data from an earlier run/);
  assert.deepEqual(fingerprint(p.impl.worktree), before, 'the preserved worktree is byte-for-byte unchanged');
});

test('resume fails closed: a preserved patch changed since HQ recorded it is refused and nothing runs', async () => {
  const s = setup();
  const p = await preserved(s);
  fs.writeFileSync(path.join(p.impl.worktree, DIR, 'notes.md'), 'tampered\n'); git(p.impl.worktree, 'add', '-A');
  const before = fingerprint(p.impl.worktree), worktrees = fs.readdirSync(s.worktreeRoot).length, briefs = s.fake.briefs.length;
  const t = await s.run(resumed(s, p.name));
  assert.equal(t.stage, 'BLOCKED'); assert.match(t.blocker, /Resume refused: the preserved patch fingerprints as .* not the expected/);
  assert.equal(fs.readdirSync(s.worktreeRoot).length, worktrees, 'no fresh worktree was created');
  assert.equal(s.fake.briefs.length, briefs, 'Claude never started');
  assert.deepEqual(fingerprint(p.impl.worktree), before);
});

test('resume fails closed: wrong base, wrong branch, unregistered copy, symbolic link, missing worktree', async () => {
  const s = setup();
  const p = await preserved(s);
  const good = resumed(s, p.name);
  // Base: the preserved HEAD is not the expected base.
  const other = git(s.repo, 'commit-tree', `${p.impl.base}^{tree}`, '-p', p.impl.base, '-m', 'other').trim();
  let t = await s.run({ ...good, resume: { ...good.resume, base: other } });
  assert.match(t.blocker, /Resume refused: preserved worktree .* is at .* not the expected base/);
  // Branch: a worktree not on its own hq/impl branch.
  const name2 = 'aaaaaaaa-bbbbbb', dir2 = path.join(s.worktreeRoot, name2);
  git(s.repo, 'worktree', 'add', '-q', '-b', 'not-hq', dir2, p.impl.base);
  t = await s.run({ ...good, resume: { ...good.resume, worktree: name2, branch: `hq/impl/${name2}` } });
  assert.match(t.blocker, /Resume refused: .* is on refs\/heads\/not-hq, not hq\/impl\/aaaaaaaa-bbbbbb/);
  // A plain copy of the preserved files is not a registered worktree.
  const name3 = 'cccccccc-dddddd'; fs.cpSync(p.impl.worktree, path.join(s.worktreeRoot, name3), { recursive: true });
  t = await s.run({ ...good, resume: { ...good.resume, worktree: name3, branch: `hq/impl/${name3}` } });
  assert.match(t.blocker, /Resume refused: (cccccccc-dddddd is not a registered worktree|preserved worktree cccccccc-dddddd is on)/);
  // A link under the worktree root pointing at the preserved worktree.
  const name4 = 'eeeeeeee-ffffff';
  try { fs.symlinkSync(p.impl.worktree, path.join(s.worktreeRoot, name4), 'dir'); } catch { /* no symlink permission (Windows): skip this case */ }
  if (fs.existsSync(path.join(s.worktreeRoot, name4))) { t = await s.run({ ...good, resume: { ...good.resume, worktree: name4, branch: `hq/impl/${name4}` } }); assert.match(t.blocker, /Resume refused: preserved worktree eeeeeeee-ffffff is not a plain directory/); }
  // Missing.
  t = await s.run({ ...good, resume: { ...good.resume, worktree: '12345678-abcdef', branch: 'hq/impl/12345678-abcdef' } });
  assert.match(t.blocker, /Resume refused: preserved worktree 12345678-abcdef does not exist/);
});

test('resume fails closed on scope: preserved work outside the new objective\'s scope is refused at submission and again at run time', async () => {
  const s = setup();
  const p = await preserved(s);
  const narrow = [`${DIR}greeting.mjs`, TEST_FILE];
  assert.throws(() => resolveResume(s.engine.state, p.name, { scope: narrow }), /changed sandbox\/hq-implementation\/notes\.md outside this objective's scope/);
  // Even with no recorded file list (an owner-stated resume), the runner checks the patch itself against the scope.
  const r = { ...resolveResume(s.engine.state, p.name, { scope: CONTRACT.scope }), files: null };
  const t = await s.run({ ...CONTRACT, scope: narrow, resume: r });
  assert.match(t.blocker, /Resume refused: the preserved patch changes sandbox\/hq-implementation\/notes\.md outside this objective's scope/);
});

test('resume: only Kyle can resume work HQ has no record of, and only with a matching hash and a base on the implementation branch', async () => {
  const s = setup();
  const p = await preserved(s);
  const fresh = setup(); // an HQ whose journal has no record of that worktree
  assert.throws(() => resolveResume(fresh.engine.state, p.name, { scope: CONTRACT.scope }), /only Kyle can resume it/);
  assert.throws(() => resolveResume(fresh.engine.state, p.name, { scope: CONTRACT.scope, owner: true }), /state its patchHash/);
  const owner = resolveResume(fresh.engine.state, { worktree: p.name, patchHash: p.impl.patchHash, base: p.impl.base }, { scope: CONTRACT.scope, owner: true });
  assert.equal(owner.source, 'owner'); assert.equal(owner.files, null);
  // HQ's own record wins: a restated hash or base that differs is a mismatch, not an override.
  assert.throws(() => resolveResume(s.engine.state, { worktree: p.name, patchHash: '0'.repeat(64) }, { scope: CONTRACT.scope, owner: true }), /does not match HQ's record/);
  assert.throws(() => resolveResume(s.engine.state, { worktree: p.name, base: 'f'.repeat(40) }, { scope: CONTRACT.scope, owner: true }), /does not match HQ's record/);
  assert.throws(() => resolveResume(s.engine.state, { worktree: p.name, extra: 1 }, { scope: CONTRACT.scope }), /Unexpected resumeFrom field/);
  assert.throws(() => resolveResume(s.engine.state, '../etc', { scope: CONTRACT.scope }), /must name an HQ implementation worktree/);
  // Owner-stated, run on the same HQ: verified on disk like any other; a wrong stated hash is refused there.
  s.holder.files = FIX;
  let t = await s.run({ ...CONTRACT, resume: { ...owner, patchHash: 'a'.repeat(64) } });
  assert.match(t.blocker, /Resume refused: the preserved patch fingerprints/);
  t = await s.run({ ...CONTRACT, resume: owner });
  assert.equal(t.stage, 'DONE', t.blocker ?? '');
});

test('resume: contract and objective validation, and the connector field', () => {
  const base = 'a'.repeat(40), patchHash = 'b'.repeat(64);
  const ok = { worktree: '6c5a1401-a81811', branch: 'hq/impl/6c5a1401-a81811', base, patchHash, source: 'hq-evidence' };
  assert.equal(validateImplementation({ ...CONTRACT, resume: ok }).resume.worktree, '6c5a1401-a81811');
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, branch: 'main' } }), /own hq\/impl/);
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, base: 'HEAD' } }), /40-character/);
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, patchHash: 'x' } }), /sha256/);
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, source: 'chatgpt' } }), /source/);
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, files: ['tools/hillink-hq/engine.mjs'] } }), /protected area/);
  assert.throws(() => validateImplementation({ ...CONTRACT, resume: { ...ok, files: ['README.md'] } }), /outside this objective's scope/);
  assert.doesNotMatch(implementationBrief(validateImplementation(CONTRACT)), /resumed/i);
  const input = { objective: CONTRACT.objective, type: 'implement', scope: CONTRACT.scope, tests: CONTRACT.tests, acceptanceCriteria: 'x', constraints: 'y' };
  assert.equal(validateObjectiveInput({ ...input, resumeFrom: '6c5a1401-a81811' }).resumeFrom, '6c5a1401-a81811');
  assert.throws(() => validateObjectiveInput({ ...input, type: 'investigate', resumeFrom: '6c5a1401-a81811' }), /only for implement/);
  const def = TOOL_DEFINITIONS.find(t => t.name === 'submit_objective');
  assert.deepEqual(def.parameters.properties.resume_from.type, ['string', 'null']);
});
