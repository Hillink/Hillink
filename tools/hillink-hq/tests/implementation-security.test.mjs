// Pass 2.6 adversarial review: each test reproduces an attack on the implementation path. Real git, real
// node --test, a fake Claude that performs the hostile file operations a compromised or misled Claude could.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { CliAgentAdapter, cliAgents } from '../cli-agent-adapter.mjs';
import { ClaudeImplementer, ClaudeRouter } from '../implementation-runner.mjs';
import { checkPath, validateImplementation } from '../implementation-policy.mjs';
import { allowMetered, testGrant, subscriptionProbe } from './compute-helpers.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
function tempRepo(extra = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sec-repo-'));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'hq@test'); git(dir, 'config', 'user.name', 'HQ Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n'); fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.env\n.env.local\n*.log\n');
  extra(dir);
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}
// ops: [['write', rel, content] | ['delete', rel]] performed in Claude's working directory.
function fakeClaude(ops, { holdMs = 0 } = {}) {
  const spawned = [];
  const spawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.pid = 99; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
    child.stdin = Object.assign(new EventEmitter(), { end() {
      setTimeout(() => {
        for (const [op, rel, content] of ops) { const f = path.join(opts.cwd, rel); if (op === 'delete') fs.rmSync(f, { force: true }); else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); } }
        const line = o => child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n'));
        line({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'] });
        line({ type: 'result', subtype: 'success', is_error: false, result: 'Done.', usage: { input_tokens: 1, output_tokens: 1 }, num_turns: 1 });
        child.emit('close', 0, null);
      }, holdMs);
    } });
    spawned.push({ command, args, opts, child });
    return child;
  };
  return { spawn, spawned };
}
const PASSING = "import test from 'node:test';\ntest('ok', () => {});\n";
const CONTRACT = { objective: 'Add a module.', scope: ['sandbox/hq-implementation/'], acceptanceCriteria: 'Test passes.', constraints: 'Nothing else.', tests: ['sandbox/hq-implementation/a.test.mjs'] };
const inScope = [['write', 'sandbox/hq-implementation/a.mjs', 'export const a = 1;\n'], ['write', 'sandbox/hq-implementation/a.test.mjs', PASSING]];

function setup(ops, { repoExtra, holdMs, contract = CONTRACT, implementer: opts = {} } = {}) {
  const repo = tempRepo(repoExtra), worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sec-wt-'));
  const fake = fakeClaude(ops, { holdMs });
  const review = new CliAgentAdapter(cliAgents.claude, { spawn: fake.spawn, env: { PATH: process.env.PATH }, cwd: repo, graceMs: 10 });
  review.healthCache = { at: Date.now(), result: { status: 'IDLE', detail: 'fake Claude', auth: 'subscription' } }; // Pass 4: sign-in verified
  const implementer = new ClaudeImplementer({ repoRoot: repo, worktreeRoot, claudeBin: 'claude-test.exe', spawn: fake.spawn, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() }, pulseMs: 50, unsandboxed: true, ...opts });
  const engine = new Engine({ store: new MemoryStore(), adapters: { 'local-checks': { health: async () => ({ status: 'IDLE' }), start: async () => {}, cancel: async () => true }, 'cli-claude': new ClaudeRouter({ health: async () => ({ status: 'IDLE' }), start: r => review.start(r), cancel: id => review.cancel(id), close: () => {} }, implementer) }, config: { heartbeatMs: 600_000, progressMs: 600_000 } });
  engine.initialize();
  engine.configureAgent('claude', { capabilities: ['implement', 'review', 'review-repo', 'implement-repo'], executionAdapter: 'cli-claude' });
  allowMetered(engine); // Pass 4: sandboxed implementation is metered; these tests run with Kyle's authorization
  const create = () => engine.createTask({ title: 'impl', description: contract.objective, operation: 'implement-repo', safety: 'local-worktree-write', priority: 50, preferredAgentId: 'claude', implementation: contract });
  const settle = async id => { for (let i = 0; i < 600; i++) { await new Promise(r => setTimeout(r, 25)); const t = engine.state.tasks[id]; if (['DONE', 'BLOCKED'].includes(t.stage) || Object.values(engine.state.runs).some(r => r.taskId === id && r.endedAt)) return t; } throw Error('stuck'); };
  const branches = () => git(repo, 'branch', '--list', 'hq/impl/*', '--format=%(refname:short) %(objectname)').trim().split('\n').filter(Boolean);
  const mainSha = git(repo, 'rev-parse', 'main').trim();
  const commitsBeyondBase = () => branches().filter(b => !b.endsWith(mainSha));
  return { engine, repo, worktreeRoot, fake, implementer, create, settle, branches, commitsBeyondBase, run: async () => { const id = create(); await engine.tick(); return settle(id); } };
}

// ---------------------------------------------------------------------------------------------------------
test('ATTACK 1: HQ runs Claude-written tests; they must not read, write or spawn outside the worktree', async () => {
  const marker = path.join(os.tmpdir(), `hq-escape-${process.pid}-${Date.now()}.txt`);
  const hostile = `import test from 'node:test';\nimport fs from 'node:fs';\nimport cp from 'node:child_process';\ntest('escape', () => {\n  try { fs.writeFileSync(${JSON.stringify(marker)}, 'escaped'); } catch {}\n  try { cp.execSync('echo pwned > ${marker.replace(/\\/g, '/')}.spawn'); } catch {}\n  try { fs.readFileSync(${JSON.stringify(path.join(os.homedir(), '.gitconfig'))}); fs.writeFileSync(${JSON.stringify(marker)} + '.read', 'read'); } catch {}\n});\n`;
  const s = setup([['write', 'sandbox/hq-implementation/a.mjs', 'export const a = 1;\n'], ['write', 'sandbox/hq-implementation/a.test.mjs', hostile]]);
  await s.run();
  for (const f of [marker, `${marker}.spawn`, `${marker}.read`]) assert.equal(fs.existsSync(f), false, `test code escaped: ${path.basename(f)}`);
});

test('ATTACK 2: an out-of-scope gitignored file (.env.local, node_modules) is still a scope violation', async () => {
  for (const hidden of ['.env.local', 'node_modules/evil/index.js', 'debug.log']) {
    const s = setup([...inScope, ['write', hidden, 'x']]);
    const t = await s.run();
    assert.equal(t.stage, 'BLOCKED', `${hidden} went unnoticed`); assert.match(t.blocker ?? '', /Scope violation/);
    assert.equal(s.commitsBeyondBase().length, 0);
  }
});

test('ATTACK 3: Windows aliases of protected paths (trailing dots/spaces, nested .git, device names) are refused', () => {
  for (const bad of ['.git.', '.git./config', '.GIT', 'sandbox/x/.git/config', 'sandbox/x/.git', 'tools/hillink-hq./engine.mjs', 'tools/hillink-hq /engine.mjs', 'supabase./migrations/x.sql', 'sandbox/hq./x.mjs', 'sandbox/x/CON', 'sandbox/x/nul.txt', 'sandbox/x/com1.mjs', 'CLAUDE.md', 'sandbox/x/AGENTS.md', 'sandbox/x/.claude/settings.json'])
    assert.throws(() => checkPath(bad), Error, bad);
});

test('ATTACK 4: out-of-scope deletion and in-scope-looking siblings are caught', async () => {
  const del = setup([...inScope, ['delete', 'README.md']]);
  assert.match((await del.run()).blocker ?? '', /Scope violation: README\.md/);
  const sib = setup([...inScope, ['write', 'sandbox/hq-implementation-evil/x.mjs', 'x']]);
  assert.match((await sib.run()).blocker ?? '', /Scope violation: sandbox\/hq-implementation-evil\/x\.mjs/);
});

test('ATTACK 5: a hooks path in repo config cannot make HQ execute Claude-written hooks during its git commands', async () => {
  const marker = path.join(os.tmpdir(), `hq-hook-${process.pid}-${Date.now()}.txt`);
  const hook = `#!/bin/sh\necho hooked > "${marker.replace(/\\/g, '/')}"\n`;
  const s = setup([...inScope, ['write', 'sandbox/hq-implementation/hooks/pre-commit', hook], ['write', 'sandbox/hq-implementation/hooks/post-commit', hook]], { repoExtra: dir => git(dir, 'config', 'core.hooksPath', 'sandbox/hq-implementation/hooks') });
  const t = await s.run();
  assert.equal(t.stage, 'DONE', t.blocker ?? '');
  assert.equal(fs.existsSync(marker), false, 'a Claude-written hook ran');
});

test('ATTACK 6: a symlink in the base inside the scope is refused before Claude runs', async () => {
  const s = setup(inScope, { repoExtra: dir => { fs.mkdirSync(path.join(dir, 'sandbox/hq-implementation'), { recursive: true }); fs.writeFileSync(path.join(dir, 'sandbox/hq-implementation/link'), '../../../outside'); git(dir, 'add', '-A'); const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: '../../../outside', encoding: 'utf8' }).trim(); git(dir, 'update-index', '--add', '--cacheinfo', `120000,${blob},sandbox/hq-implementation/link`); git(dir, 'config', 'core.symlinks', 'false'); } });
  const t = await s.run();
  assert.equal(t.stage, 'BLOCKED'); assert.match(t.blocker ?? '', /symbolic link/);
  assert.equal(s.fake.spawned.length, 0, 'Claude never started');
});

test('ATTACK 7: cancelling during verification can never be followed by a commit', async () => {
  const s = setup(inScope);
  const id = s.create(); await s.engine.tick();
  const run = Object.values(s.engine.state.runs).find(r => r.taskId === id);
  // Cancel as soon as HQ starts its checks (after Claude finished).
  for (let i = 0; i < 400 && !s.engine.state.tasks[id].evidence.some(e => e.kind === 'FINDING' || e.kind === 'TEST_STARTED'); i++) await new Promise(r => setTimeout(r, 5));
  await s.engine.adapters['cli-claude'].cancel(run.runId);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(s.commitsBeyondBase().length, 0, 'committed after cancellation');
});

test('ATTACK 8: re-running the same task never reuses or collides with an earlier worktree or branch', async () => {
  const s = setup(inScope);
  const id = s.create(); await s.engine.tick(); await s.settle(id);
  // Simulate HQ re-dispatching the same task (requeue after a rate limit) by starting it again directly.
  const task = s.engine.state.tasks[id];
  const events = [];
  await s.implementer.start({ task: { ...task, stage: 'READY' }, runId: '22222222-aaaa-bbbb-cccc-000000000000', emit: e => events.push(e), compute: testGrant(task.id, '22222222-aaaa-bbbb-cccc-000000000000') });
  for (let i = 0; i < 400 && !events.some(e => ['COMPLETED', 'FAILED', 'BLOCKED'].includes(e.kind)); i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(events.at(-1).kind, 'COMPLETED', events.at(-1).summary);
  const names = s.branches().map(b => b.split(' ')[0]);
  assert.equal(new Set(names).size, 2, `two distinct branches: ${names.join(', ')}`);
});

test('permission isolation: R → I → R → I(fail) → R, repeatedly; reviews never carry Edit/Write', async () => {
  const s = setup(inScope);
  const review = async () => { const id = s.engine.createTask({ title: 'r', description: 'q', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: 'claude' }); await s.engine.tick(); await s.settle(id); return s.fake.spawned.at(-1); };
  const impl = async () => { const id = s.create(); await s.engine.tick(); await s.settle(id); return s.fake.spawned.at(-1); };
  const seen = [];
  for (const step of ['R', 'I', 'R', 'I', 'R', 'I', 'R']) { const r = step === 'R' ? await review() : await impl(); seen.push([step, r]); }
  for (const [step, r] of seen) {
    const tools = r.args[r.args.indexOf('--tools') + 1], writes = r.args.filter(a => /^(Edit|Write)(\(|$)/.test(a));
    if (step === 'R') { assert.equal(tools, 'Read,Grep,Glob'); assert.deepEqual(writes, []); assert.ok(!r.args.includes('--permission-mode')); assert.equal(path.resolve(r.opts.cwd), path.resolve(s.repo)); }
    else { assert.equal(tools, 'Read,Grep,Glob,Edit,Write'); assert.ok(writes.length > 0); assert.ok(!r.args.some(a => /Bash/.test(a))); assert.notEqual(path.resolve(r.opts.cwd), path.resolve(s.repo)); }
  }
  assert.deepEqual(cliAgents.claude.args(), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', 'Read,Grep,Glob', '--setting-sources', 'user', '--strict-mcp-config', '--no-session-persistence', '--max-turns', '40'], 'the shared review spec was never mutated');
});

test('contract abuse: duplicates collapse, overlapping scopes stay within their union, limits hold', () => {
  const c = validateImplementation({ ...CONTRACT, scope: ['sandbox/a/', './sandbox/a/', 'sandbox/a/b.mjs'] });
  assert.deepEqual(c.scope, ['sandbox/a/', 'sandbox/a/b.mjs']);
  assert.throws(() => validateImplementation({ ...CONTRACT, scope: ['a/b/', 'a/c/', 'a/d/', 'a/e/', 'a/f/', 'a/g/'] }), /1 to 5/);
  assert.throws(() => validateImplementation({ ...CONTRACT, tests: ['a/1.test.mjs', 'a/2.test.mjs', 'a/3.test.mjs', 'a/4.test.mjs'] }), /1 to 3/);
  assert.throws(() => validateImplementation({ ...CONTRACT, objective: 'x'.repeat(1201) }), /longer/);
  assert.throws(() => validateImplementation({ ...CONTRACT, tests: ['tools/hillink-hq/tests/engine.test.mjs'] }), /protected/);
  assert.throws(() => validateImplementation({ ...CONTRACT, scope: ['sandbox/a/%2e%2e/'] }), Error, 'percent-encoding is refused outright');
});
