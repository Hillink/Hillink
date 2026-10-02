// Reviewer access to the exact HQ-verified implementation commit (review-snapshot.mjs). Implementation commits live in
// isolated task worktrees a read-only reviewer cannot reach; HQ gives the reviewer a read-only snapshot of exactly the
// verified SHA instead, records which commit it was, and removes it afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReviewSnapshots, validReviewSource, safeSegments, REVIEW_META_DIR } from '../review-snapshot.mjs';
import { CliAgentAdapter, cliAgents } from '../cli-agent-adapter.mjs';
import { harness, tempRepo, git, handoffText, investigation, review, role, scriptedAgent } from './orchestration-harness.mjs';

const VERIFIED = `export const state = 'verified';\n${'// full file, far longer than any quoted excerpt\n'.repeat(1200)}export const last = 'end of the verified file';\n`;
// A repository like HQ's: the live checkout on main, and an implementation commit made in a separate task worktree,
// which then moves on (a later commit and an uncommitted edit) after HQ verified it.
function implRepo() {
  const repo = tempRepo(), wt = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-review-wt-'));
  fs.rmSync(wt, { recursive: true });
  git(repo, 'worktree', 'add', '-q', '-b', 'hq/impl/test-1', wt, 'main');
  const base = git(repo, 'rev-parse', 'main').trim();
  fs.mkdirSync(path.join(wt, 'src'));
  fs.writeFileSync(path.join(wt, 'src', 'feature.mjs'), VERIFIED);
  fs.writeFileSync(path.join(wt, 'README.md'), '# repo\nverified readme\n');
  git(wt, 'add', '.'); git(wt, 'commit', '-q', '-m', 'implementation');
  const sha = git(wt, 'rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(wt, 'src', 'feature.mjs'), "export const state = 'later';\n");
  git(wt, 'commit', '-q', '-am', 'later work');
  const later = git(wt, 'rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(wt, 'src', 'feature.mjs'), "export const state = 'dirty';\n");
  return { repo, wt, base, sha, later, branch: 'hq/impl/test-1' };
}
const snapRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hq-review-root-'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? [path.join(dir, d.name), ...walk(path.join(dir, d.name))] : [path.join(dir, d.name)]));
const until = async (cond, ms = 15_000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw Error('timed out'); await new Promise(r => setTimeout(r, 10)); } };

function fakeSpawn() {
  const spawned = [];
  const spawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.pid = 5151; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { written: '', end(text = '') { this.written += text; } });
    let closed = false;
    child.exit = (code, signal = null) => { if (!closed) { closed = true; child.emit('close', code, signal); } };
    child.kill = () => { setImmediate(() => child.exit(null, 'SIGTERM')); return true; };
    child.lines = (...objects) => child.stdout.emit('data', Buffer.from(objects.map(o => JSON.stringify(o)).join('\n') + '\n'));
    // What the reviewer process would see when it starts: its working directory.
    child.sawFeature = fs.existsSync(path.join(opts.cwd, 'src', 'feature.mjs')) ? fs.readFileSync(path.join(opts.cwd, 'src', 'feature.mjs'), 'utf8') : null;
    spawned.push({ command, args, opts, child });
    return child;
  };
  return { spawn, spawned };
}
function reviewAdapter({ spec = cliAgents.claude, repo, snapshots, ...rest } = {}) {
  const f = fakeSpawn(), events = [];
  // platform pinned like cli-agent.test: on win32 cancel() kills through taskkill, which this fake spawn cannot model.
  const adapter = new CliAgentAdapter(spec, { spawn: f.spawn, platform: 'linux', cwd: repo, graceMs: 20, env: { PATH: '/bin', HOME: '/home/k' }, reviewSnapshots: snapshots, ...rest });
  adapter.healthCache = { at: Date.now(), result: { status: 'IDLE', detail: 'verified', auth: 'subscription' } };
  const task = (over = {}) => ({ id: 'task-0001', operation: 'review-repo', safety: 'local-read-only', description: 'Review the change.', ...over });
  return { adapter, events, spawned: f.spawned, task, emit: e => events.push(e), kinds: () => events.map(e => e.kind) };
}

test('reviewer access 1: the snapshot holds every full file of exactly the verified commit, not the live checkout, a later commit or the dirty worktree', async () => {
  const r = implRepo(), root = snapRoot();
  const s = new ReviewSnapshots({ repoRoot: r.repo, root });
  const before = { head: git(r.repo, 'rev-parse', r.branch).trim(), status: git(r.wt, 'status', '--porcelain'), file: fs.readFileSync(path.join(r.wt, 'src', 'feature.mjs'), 'utf8') };
  const snap = await s.create({ commit: r.sha, base: r.base, branch: r.branch }, { label: 'test' });
  assert.equal(path.dirname(snap.dir), root);
  assert.equal(snap.commit, r.sha);
  assert.equal(snap.tree, git(r.repo, 'rev-parse', `${r.sha}^{tree}`).trim());
  // Full content of the verified commit (about 60 KB; the old quoted diff was clipped at 9,000 characters).
  const feature = fs.readFileSync(path.join(snap.dir, 'src', 'feature.mjs'), 'utf8');
  assert.equal(feature, VERIFIED);
  assert.ok(feature.length > 50_000);
  assert.equal(fs.readFileSync(path.join(snap.dir, 'README.md'), 'utf8'), '# repo\nverified readme\n');
  // Not the live checkout (main has no such file), not the later commit, not the uncommitted edit.
  assert.equal(fs.existsSync(path.join(r.repo, 'src', 'feature.mjs')), false);
  assert.notEqual(feature, git(r.repo, 'show', `${r.later}:src/feature.mjs`));
  assert.notEqual(feature, before.file);
  // Every file is byte-identical to the commit's blob (HQ re-hashed them; this checks against git independently).
  const files = walk(snap.dir).filter(f => fs.lstatSync(f).isFile() && !path.relative(snap.dir, f).startsWith(REVIEW_META_DIR));
  assert.deepEqual(files.map(f => path.relative(snap.dir, f).split(path.sep).join('/')).sort(), git(r.repo, 'ls-tree', '-r', '--name-only', r.sha).trim().split('\n').sort());
  for (const f of files) assert.equal(git(r.repo, 'hash-object', f).trim(), git(r.repo, 'rev-parse', `${r.sha}:${path.relative(snap.dir, f).split(path.sep).join('/')}`).trim());
  // The full diff and the manifest that records which commit this is.
  const diff = fs.readFileSync(path.join(snap.dir, REVIEW_META_DIR, 'diff.patch'), 'utf8');
  assert.equal(diff, git(r.repo, 'diff', '--no-color', '--full-index', '--no-renames', r.base, r.sha));
  assert.match(diff, /end of the verified file/);
  const manifest = JSON.parse(fs.readFileSync(path.join(snap.dir, REVIEW_META_DIR, 'manifest.json'), 'utf8'));
  assert.deepEqual([manifest.commit, manifest.base, manifest.branch, manifest.tree], [r.sha, r.base, r.branch, snap.tree]);
  assert.deepEqual(manifest.changedFiles, ['README.md', 'src/feature.mjs']);
  // No link back to any repository or worktree, and nothing in it is writable.
  assert.equal(fs.existsSync(path.join(snap.dir, '.git')), false);
  for (const f of [snap.dir, ...walk(snap.dir)]) assert.equal(fs.statSync(f).mode & 0o222, 0, `${f} is read-only`);
  // The implementation is untouched: its branch head, worktree status and files are as they were.
  assert.equal(git(r.repo, 'rev-parse', r.branch).trim(), before.head);
  assert.equal(git(r.wt, 'status', '--porcelain'), before.status);
  assert.equal(fs.readFileSync(path.join(r.wt, 'src', 'feature.mjs'), 'utf8'), before.file);
  // Cleanup removes it completely, and only paths HQ made can be removed.
  assert.equal(await s.remove(snap.dir), true);
  assert.deepEqual(fs.readdirSync(root), []);
  await assert.rejects(s.remove(r.wt), /outside the review snapshot root/);
  assert.ok(fs.existsSync(r.wt));
});

test('reviewer access 2: malformed, unknown or unverifiable commits fail closed and leave nothing behind', async () => {
  const r = implRepo(), root = snapRoot();
  const s = new ReviewSnapshots({ repoRoot: r.repo, root });
  for (const bad of [null, 'abc', [], { commit: r.sha.slice(0, 12), base: r.base }, { commit: r.sha.toUpperCase(), base: r.base }, { commit: r.sha }, { commit: r.sha, base: r.sha }, { commit: `${r.sha} `, base: r.base }, { commit: r.sha, base: r.base, branch: '../../etc' }, { commit: r.sha, base: r.base, branch: 'a b' }]) {
    assert.throws(() => validReviewSource(bad), /Review source/);
    await assert.rejects(s.create(bad), /Review source/);
  }
  await assert.rejects(s.create({ commit: 'a'.repeat(40), base: r.base }), /does not exist/);
  await assert.rejects(s.create({ commit: r.later, base: r.base }), /does not sit directly on base/, 'base must be the verified parent');
  assert.throws(() => new ReviewSnapshots({ repoRoot: r.repo, root: path.join(r.repo, 'snapshots') }), /outside the repository/);
  // Paths that could escape the snapshot or alias another file are refused; the whole commit then fails closed.
  for (const p of ['../x', 'a/../b', '/abs', 'a\\b', 'C:x', 'a//b', '.git/config', 'src/.GIT/x', 'CON', 'x/aux.txt', 'trailing.', 'sp ', 'q?', '.hq-review/manifest.json']) assert.throws(() => safeSegments(p), /Unsafe path|reserves/, p);
  assert.deepEqual(safeSegments('.github/workflows/ci.yml'), ['.github', 'workflows', 'ci.yml']);
  // A commit that tries to plant its own review evidence is refused.
  fs.mkdirSync(path.join(r.wt, REVIEW_META_DIR));
  fs.writeFileSync(path.join(r.wt, REVIEW_META_DIR, 'manifest.json'), '{"commit":"forged"}');
  git(r.wt, 'add', '.'); git(r.wt, 'commit', '-q', '-m', 'forge');
  const forged = git(r.wt, 'rev-parse', 'HEAD').trim();
  await assert.rejects(s.create({ commit: forged, base: r.later }), /reserves for review evidence/);
  // A symlink in the commit is never created (so never followed); the manifest lists it.
  git(r.wt, 'rm', '-q', '-r', REVIEW_META_DIR);
  // Planted as a git symlink entry (mode 120000) directly, so the case runs where the filesystem refuses symlinks
  // (Windows without Developer Mode); the snapshot reads git objects, not the worktree.
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hq-review-link-')), 'target');
  fs.writeFileSync(target, '/etc/passwd');
  const blob = git(r.wt, 'hash-object', '-w', target).trim();
  git(r.wt, 'update-index', '--add', '--cacheinfo', `120000,${blob},leak`);
  git(r.wt, 'commit', '-q', '-m', 'link');
  const linked = git(r.wt, 'rev-parse', 'HEAD').trim();
  const snap = await s.create({ commit: linked, base: forged });
  assert.equal(fs.existsSync(path.join(snap.dir, 'leak')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snap.dir, REVIEW_META_DIR, 'manifest.json'), 'utf8')).symlinksNotCreated.map(x => x.path), ['leak']);
  await s.remove(snap.dir);
  assert.deepEqual(fs.readdirSync(root), [], 'failed attempts left nothing behind');
});

test('reviewer access 3: the reviewer is launched inside the snapshot of the assigned commit, HQ records that commit, and the snapshot is removed when it finishes', async () => {
  const r = implRepo(), root = snapRoot();
  const f = reviewAdapter({ repo: r.repo, snapshots: new ReviewSnapshots({ repoRoot: r.repo, root }) });
  assert.equal(f.adapter.acceptsReviewSource(), true);
  const started = Date.now();
  await f.adapter.start({ task: f.task({ reviewSource: { commit: r.sha, base: r.base, branch: r.branch } }), runId: 'run-1', emit: f.emit });
  assert.ok(Date.now() - started < 1000, 'start returns at once; the snapshot is prepared in the background');
  await until(() => f.spawned.length === 1);
  const { opts, args, child } = f.spawned[0];
  assert.equal(path.dirname(opts.cwd), root, 'cwd is the snapshot, not the live checkout');
  assert.notEqual(opts.cwd, r.repo);
  assert.equal(child.sawFeature, VERIFIED, 'the reviewer sees the full verified file');
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', 'Read,Grep,Glob'], 'still read-only tools only');
  child.lines({ type: 'system', subtype: 'init', tools: ['Glob', 'Grep', 'Read'] });
  assert.equal(f.events[0].kind, 'ACK');
  assert.equal(f.events[1].kind, 'PROGRESS', 'the record of what the reviewer was given comes right after the ACK');
  assert.deepEqual(f.events[1].reviewSource, { source: 'hq-review-snapshot', commit: r.sha, base: r.base, branch: r.branch, tree: git(r.repo, 'rev-parse', `${r.sha}^{tree}`).trim(), files: 2, bytes: f.events[1].reviewSource.bytes, diffBytes: f.events[1].reviewSource.diffBytes, omittedLargeFiles: 0, verified: true });
  child.lines({ type: 'result', subtype: 'success', is_error: false, result: 'Reviewed.', usage: { input_tokens: 1, output_tokens: 1 }, num_turns: 1 });
  child.exit(0);
  await until(() => f.kinds().includes('COMPLETED'));
  assert.deepEqual(f.events.at(-1).reviewSnapshot, { commit: r.sha, removed: true });
  assert.equal(fs.existsSync(opts.cwd), false);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('reviewer access 4: cleanup on failure, on cancellation mid-review and during preparation; a snapshot that cannot be made never falls back to the live checkout', async () => {
  const r = implRepo(), root = snapRoot();
  const snapshots = new ReviewSnapshots({ repoRoot: r.repo, root });
  const source = { commit: r.sha, base: r.base, branch: r.branch };
  // The reviewer exits with an error.
  const a = reviewAdapter({ repo: r.repo, snapshots });
  await a.adapter.start({ task: a.task({ reviewSource: source }), runId: 'r-fail', emit: a.emit });
  await until(() => a.spawned.length === 1);
  a.spawned[0].child.exit(1);
  await until(() => a.kinds().includes('FAILED'));
  assert.equal(a.events.at(-1).reviewSnapshot.removed, true);
  assert.deepEqual(fs.readdirSync(root), []);
  // Cancelled while reviewing.
  const b = reviewAdapter({ repo: r.repo, snapshots });
  await b.adapter.start({ task: b.task({ reviewSource: source }), runId: 'r-cancel', emit: b.emit });
  await until(() => b.spawned.length === 1);
  b.spawned[0].child.lines({ type: 'system', subtype: 'init', tools: ['Glob', 'Grep', 'Read'] });
  assert.equal(await b.adapter.cancel('r-cancel'), true, 'termination is proven by the process exit, not by the cleanup');
  await until(() => b.kinds().includes('CANCELLED'));
  assert.equal(b.events.at(-1).kind, 'CANCELLED');
  assert.equal(b.events.at(-1).reviewSnapshot.removed, true);
  assert.deepEqual(fs.readdirSync(root), []);
  // Cancelled before the snapshot was ready: no reviewer process is ever started, and the adapter is free at once.
  const c = reviewAdapter({ repo: r.repo, snapshots });
  await c.adapter.start({ task: c.task({ reviewSource: source }), runId: 'r-early', emit: c.emit });
  assert.equal(await c.adapter.cancel('r-early'), true);
  assert.equal(c.adapter.runs.size, 0);
  await until(() => c.kinds().includes('CANCELLED'));
  await new Promise(res => setTimeout(res, 50));
  assert.equal(c.spawned.length, 0);
  assert.deepEqual(fs.readdirSync(root), []);
  // A valid-looking commit that does not exist: FAILED, nothing launched (not even in the live checkout).
  const d = reviewAdapter({ repo: r.repo, snapshots });
  await d.adapter.start({ task: d.task({ reviewSource: { commit: 'b'.repeat(40), base: r.base } }), runId: 'r-missing', emit: d.emit });
  await until(() => d.kinds().includes('FAILED'));
  assert.match(d.events[0].summary, /could not prepare a read-only snapshot of commit bbbbbbbbbbbb: .*does not exist.*never substitutes the live checkout/);
  assert.equal(d.spawned.length, 0);
  // Preparation that overruns its bound is stopped (it must finish well inside the engine's 90 s acknowledgement).
  const slow = { create: (src, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))), remove: async () => true };
  const e = reviewAdapter({ repo: r.repo, snapshots: slow, prepareMs: 30 });
  await e.adapter.start({ task: e.task({ reviewSource: source }), runId: 'r-slow', emit: e.emit });
  await until(() => e.kinds().includes('FAILED'));
  assert.match(e.events[0].summary, /not ready within/);
  assert.equal(e.spawned.length, 0);
  // No snapshot service, or a malformed source: the start is refused outright.
  const g = reviewAdapter({ repo: r.repo, snapshots: null });
  assert.equal(g.adapter.acceptsReviewSource(), false);
  await assert.rejects(g.adapter.start({ task: g.task({ reviewSource: source }), runId: 'r-none', emit: g.emit }), /will not review the live checkout/);
  const h = reviewAdapter({ repo: r.repo, snapshots });
  await assert.rejects(h.adapter.start({ task: h.task({ reviewSource: { commit: 'HEAD', base: r.base } }), runId: 'r-bad', emit: h.emit }), /Review source commit/);
  assert.equal(g.spawned.length + h.spawned.length, 0);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('reviewer access 5: reviews without a review source still run in the live checkout; Codex keeps its read-only sandbox in a snapshot', async () => {
  const r = implRepo(), root = snapRoot();
  const snapshots = new ReviewSnapshots({ repoRoot: r.repo, root });
  const a = reviewAdapter({ repo: r.repo, snapshots });
  await a.adapter.start({ task: a.task(), runId: 'plain', emit: a.emit });
  assert.equal(a.spawned.length, 1, 'launched synchronously, as before');
  assert.equal(a.spawned[0].opts.cwd, r.repo);
  a.spawned[0].child.lines({ type: 'system', subtype: 'init', tools: ['Glob', 'Grep', 'Read'] });
  assert.equal(a.kinds()[0], 'ACK');
  assert.ok(!a.events.some(e => e.reviewSource), 'no snapshot evidence for a live-checkout review');
  const c = reviewAdapter({ spec: cliAgents.codex, repo: r.repo, snapshots });
  await c.adapter.start({ task: c.task(), runId: 'plain-codex', emit: c.emit });
  assert.ok(!c.spawned[0].args.includes('--skip-git-repo-check'));
  c.spawned[0].child.exit(0);
  await until(() => c.kinds().includes('FAILED'));
  await c.adapter.start({ task: c.task({ reviewSource: { commit: r.sha, base: r.base } }), runId: 'snap-codex-2', emit: c.emit });
  await until(() => c.spawned.length === 2);
  const args = c.spawned[1].args;
  assert.deepEqual(args.slice(0, 4), ['exec', '--json', '--sandbox', 'read-only']);
  assert.ok(args.includes('approval_policy=never') && args.includes('forced_login_method=chatgpt') && args.includes('--skip-git-repo-check'));
  assert.equal(path.dirname(c.spawned[1].opts.cwd), root);
  c.spawned[1].child.exit(0);
  await until(() => fs.readdirSync(root).length === 0);
});

test('reviewer access 6: end to end, the independent reviewer reads the verified commit and the accepted review records it', async () => {
  const repo = tempRepo(), root = snapRoot();
  const codex = reviewAdapter({ spec: cliAgents.codex, repo, snapshots: new ReviewSnapshots({ repoRoot: repo, root }) });
  codex.adapter.healthCacheMs = 1e12;
  const seen = [];
  // The fake Codex process: answers its role, and as reviewer reads the implementation file from its working directory.
  const spawn = codex.adapter.spawn;
  codex.adapter.spawn = (command, args, opts) => {
    const child = spawn(command, args, opts);
    child.stdin.end = function (text = '') {
      const isReview = role({ description: text }) === 'review';
      const file = path.join(opts.cwd, 'sandbox', 'hq-implementation', 'greeting.mjs');
      seen.push({ cwd: opts.cwd, isReview, prompt: text, greeting: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, diff: fs.existsSync(path.join(opts.cwd, REVIEW_META_DIR, 'diff.patch')) ? fs.readFileSync(path.join(opts.cwd, REVIEW_META_DIR, 'diff.patch'), 'utf8') : null });
      setImmediate(() => {
        child.lines({ type: 'thread.started', thread_id: 't' }, { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: handoffText(isReview ? review() : investigation()) } }, { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
        child.exit(0);
      });
    };
    return child;
  };
  const h = harness({ repo, codex: codex.adapter });
  const id = h.conductor.submit({ objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] });
  await h.drive(h.settled(id));
  const o = h.objective(id), result = o.result;
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  const reviewTask = h.tasks(t => t.operation === 'review-repo' && t.reviewSource).at(-1);
  assert.deepEqual(reviewTask.reviewSource, { commit: result.commit, base: git(repo, 'rev-parse', `${result.commit}^1`).trim(), branch: result.branch });
  assert.equal(result.verification.commit, result.commit, 'HQ verification names the commit it verified');
  assert.equal(result.review.handoff.reviewedSource.commit, result.commit, 'the accepted review names the commit it read');
  assert.equal(result.review.handoff.reviewedSource.verifiedCommit, result.commit);
  assert.equal(result.review.handoff.reviewedSource.tree, git(repo, 'rev-parse', `${result.commit}^{tree}`).trim());
  const investigated = seen.find(s => !s.isReview), reviewed = seen.find(s => s.isReview);
  assert.equal(investigated.cwd, repo, 'investigation still reads the live checkout');
  assert.equal(path.dirname(reviewed.cwd), root);
  assert.equal(reviewed.greeting, git(repo, 'show', `${result.commit}:sandbox/hq-implementation/greeting.mjs`), 'the reviewer read the committed file in full');
  assert.equal(fs.existsSync(path.join(repo, 'sandbox', 'hq-implementation', 'greeting.mjs')), false, 'which the live checkout does not have');
  assert.match(reviewed.diff, /greeting\.test\.mjs/);
  assert.match(reviewed.prompt, new RegExp(`read-only snapshot of exactly commit ${result.commit}`));
  assert.match(reviewed.prompt, /\.hq-review\/diff\.patch/);
  assert.ok(reviewTask.evidence.some(e => e.kind === 'PROGRESS' && e.reviewSource?.commit === result.commit));
  assert.deepEqual(reviewTask.evidence.at(-1).reviewSnapshot, { commit: result.commit, removed: true });
  assert.deepEqual(fs.readdirSync(root), [], 'snapshot cleaned up');
});

test('reviewer access 7: a review with no HQ record of the verified commit, or a forged record, is never accepted', async () => {
  // The reviewer answers "approve" but HQ never recorded which commit it read: refused, objective does not complete.
  const silent = name => scriptedAgent(name, task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()), snapshot: null }));
  const h = harness({ codex: silent('Codex'), claudeReview: silent('Claude') });
  const id = h.conductor.submit({ objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] });
  await h.drive(h.settled(id));
  assert.notEqual(h.objective(id).status, 'COMPLETE');
  assert.ok(h.engine.state.events.some(e => e.type === 'HANDOFF_REJECTED' && /did not|No HQ evidence that the reviewer read the verified commit/.test(e.data?.reason ?? e.reason ?? JSON.stringify(e))));
  // A forged record (another commit) is rejected by the engine itself.
  const forgeries = [];
  const forger = name => {
    const agent = scriptedAgent(name, task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()), snapshot: null }));
    const start = agent.start;
    agent.start = async ({ task, runId, emit }) => start({ task, runId, emit: e => {
      if (e.kind === 'ACK' && task.reviewSource) { emit(e); try { emit({ kind: 'PROGRESS', summary: 'forged', reviewSource: { source: 'hq-review-snapshot', commit: 'c'.repeat(40), base: task.reviewSource.base, tree: 'f'.repeat(40), verified: true } }); } catch (error) { forgeries.push(error.message); } return; }
      return emit(e);
    } });
    return agent;
  };
  const f = harness({ codex: forger('Codex'), claudeReview: forger('Claude') });
  const fid = f.conductor.submit({ objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] });
  await f.drive(f.settled(fid));
  assert.notEqual(f.objective(fid).status, 'COMPLETE');
  assert.ok(forgeries.length > 0 && forgeries.every(m => /Invalid review source evidence/.test(m)));
});

test('reviewer access 8: HQ never sends an unverified commit for review and never dispatches one to an agent that cannot be given the commit', async () => {
  const h = harness();
  const sha = 'a'.repeat(40), base = 'b'.repeat(40);
  const o = { steps: {
    impl: { id: 'impl', kind: 'implement', handoff: { commit: sha, base, branch: 'hq/impl/x' } },
    ver: { id: 'ver', kind: 'verify', dependsOn: ['impl'], status: 'DONE', handoff: { source: 'hq', ok: true, commit: sha } },
  } };
  const rev = { kind: 'review', dependsOn: ['ver'] };
  assert.deepEqual(h.conductor.reviewSourceFor(o, rev), { commit: sha, base, branch: 'hq/impl/x' });
  assert.equal(h.conductor.reviewSourceFor(o, { kind: 'review', standalone: true, dependsOn: [] }), null, 'a standalone review reads the live repository');
  assert.equal(h.conductor.reviewSourceFor(o, { kind: 'investigate', dependsOn: [] }), null);
  const variant = patch => ({ steps: { impl: { ...o.steps.impl, ...patch.impl, handoff: { ...o.steps.impl.handoff, ...patch.implHandoff } }, ver: { ...o.steps.ver, ...patch.ver, handoff: { ...o.steps.ver.handoff, ...patch.verHandoff } } } });
  for (const [why, patch] of [['verify not done', { ver: { status: 'RUNNING' } }], ['verification failed', { verHandoff: { ok: false } }], ['not HQ verification', { verHandoff: { source: 'agent' } }], ['verified another commit', { verHandoff: { commit: 'c'.repeat(40) } }], ['short sha', { implHandoff: { commit: sha.slice(0, 12) } }], ['no base', { implHandoff: { base: null } }]]) {
    assert.ok(h.conductor.reviewSourceFor(variant(patch), rev)?.error, why);
  }
  assert.ok(h.conductor.reviewSourceFor(o, { kind: 'review', dependsOn: [] }).error, 'a review not tied to a verify step');
  // The engine accepts a review source only on an HQ-linked read-only review.
  assert.throws(() => h.engine.createTask({ title: 't', description: 'd', operation: 'review-repo', safety: 'local-read-only', priority: 50, reviewSource: { commit: sha, base } }), /HQ-linked read-only review/);
  assert.throws(() => h.engine.createTask({ title: 't', description: 'd', operation: 'review-repo', safety: 'local-read-only', priority: 50, reviewSource: { commit: 'HEAD', base } }), /Review source commit/);
  // An agent whose adapter cannot be given the commit is never dispatched the review (no live-checkout substitute).
  const blind = name => { const a = scriptedAgent(name, task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()) })); delete a.acceptsReviewSource; return a; };
  const b = harness({ codex: blind('Codex'), claudeReview: blind('Claude') });
  const id = b.conductor.submit({ objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] });
  await b.drive(b.settled(id));
  assert.notEqual(b.objective(id).status, 'COMPLETE');
  assert.equal([...b.codex.calls, ...b.claude.calls].filter(c => c.task.reviewSource).length, 0);
  assert.ok(b.tasks(t => t.reviewSource).every(t => /will not review the live checkout/.test(t.blocker ?? '')));
});
