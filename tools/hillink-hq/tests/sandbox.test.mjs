// Pass 2.7: the OS sandbox controller and its integration, with a fake wsl.exe. Real git, real patches, the real
// WslSandbox process handling; only the Linux side is simulated. The live attack tests run against the real
// sandbox (sandbox/attack-tests.mjs) once the base image is built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync, spawn as realSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WslSandbox, checkPatch, INSTANCE_PREFIX } from '../sandbox.mjs';
import { ClaudeImplementer } from '../implementation-runner.mjs';
import { validateImplementation } from '../implementation-policy.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
const FAKE_KEY = ['sk', 'ant', 'test'].join('-') + '-' + 'Q'.repeat(48); // assembled at runtime; not a real key
const CONTRACT = { objective: 'Add greet(name).', scope: ['sandbox/hq-implementation/'], acceptanceCriteria: 'greet works.', constraints: 'Scope only.', tests: ['sandbox/hq-implementation/greeting.test.mjs'] };
const GREETING = { 'sandbox/hq-implementation/greeting.mjs': 'export const greet = n => `Hello, ${n}!`;\n', 'sandbox/hq-implementation/greeting.test.mjs': "import test from 'node:test';\ntest('x', () => {});\n" };

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sbx-repo-'));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'hq@test'); git(dir, 'config', 'user.name', 'HQ Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}
// What Claude's edits look like when hq-diff.sh reports them: a real binary git patch against the base tree.
function patchFor(repo, files, extra = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sbx-claude-'));
  git(repo, 'worktree', 'add', '-q', '--detach', dir, 'HEAD');
  for (const [rel, content] of Object.entries(files)) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
  extra(dir);
  git(dir, 'add', '-A', '-f');
  const patch = git(dir, 'diff', '--cached', '--binary', '--full-index', 'HEAD');
  git(repo, 'worktree', 'remove', '--force', dir);
  return patch;
}
function baseImage() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sbx-home-'));
  fs.writeFileSync(path.join(home, 'base.tar'), 'fake base image');
  fs.writeFileSync(path.join(home, 'base.json'), JSON.stringify({ sha256: crypto.createHash('sha256').update('fake base image').digest('hex'), claudeCode: '2.1.138' }));
  return home;
}
// A fake wsl.exe: records every call and plays the guest scripts' part.
function fakeWsl({ patch = '', claudeExit = 0, testOut = 'ℹ tests 1\nℹ pass 1\nℹ fail 0\n', testExit = 0, hangClaude = false } = {}) {
  const calls = [], registered = new Set(), received = {};
  let hanging = null;
  const spawn = (command, args, opts = {}) => {
    if (command === 'git') return realSpawn(command, args, opts);
    if (command === 'taskkill') { const t = new EventEmitter(); setImmediate(() => { hanging?.kill(); t.emit('close', 0, null); }); return t; }
    calls.push({ command, args, env: opts.env ?? {} });
    const child = new EventEmitter();
    child.pid = 4242; child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const finish = (code, out = '') => setImmediate(() => { if (out) child.stdout.write(out); child.stdout.end(); child.stderr.end(); setImmediate(() => child.emit('close', code, null)); });
    child.kill = () => { finish(137); return true; };
    const chunks = [];
    child.stdin.on('data', d => chunks.push(d));
    child.stdin.on('finish', () => {
      const input = Buffer.concat(chunks);
      if (args[0] === '--import') { registered.add(args[1]); return finish(0); }
      if (args[0] === '--terminate') return finish(0);
      if (args[0] === '--unregister') { registered.delete(args[1]); return finish(0); }
      if (args[0] === '--list') return finish(0, [...registered].join('\r\n'));
      const script = args[args.indexOf('--exec') + 1];
      if (script === '/opt/hq/hq-stage.sh') { received.tar = input; return finish(0); }
      if (script === '/opt/hq/hq-key.sh') { received.key = input.toString(); return finish(0); }
      if (script === '/opt/hq/hq-claude.sh') {
        received.prompt = input.toString();
        if (hangClaude) { hanging = child; return; }
        const line = o => child.stdout.write(JSON.stringify(o) + '\n');
        line({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'] });
        line({ type: 'result', subtype: claudeExit ? 'error' : 'success', is_error: Boolean(claudeExit), result: 'Done.', usage: { input_tokens: 1, output_tokens: 1 }, num_turns: 1 });
        return finish(claudeExit);
      }
      if (script === '/opt/hq/hq-diff.sh') return finish(0, patch);
      if (script === '/opt/hq/hq-test.sh') { received.testArgs = args.slice(args.indexOf('--exec') + 2); return finish(testExit, testOut); }
      finish(127);
    });
    return child;
  };
  return { spawn, calls, registered, received };
}
async function run({ wsl = {}, patch, env = { HQ_SANDBOX_ANTHROPIC_API_KEY: FAKE_KEY, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, cancelAfter } = {}) {
  const repo = tempRepo(), worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sbx-wt-'));
  const fake = fakeWsl({ patch: patch ?? patchFor(repo, GREETING), ...wsl });
  const sandbox = new WslSandbox({ spawn: fake.spawn, home: baseImage() });
  const implementer = new ClaudeImplementer({ repoRoot: repo, worktreeRoot, claudeBin: 'claude-host.exe', spawn: fake.spawn, env, sandbox, pulseMs: 50, cliOptions: { graceMs: 10 } });
  const events = [], runId = 'run-abc123';
  const task = { id: 'a1b2c3d4-0000-0000-0000-000000000000', operation: 'implement-repo', safety: 'local-worktree-write', implementation: CONTRACT, description: 'x' };
  await implementer.start({ task, runId, emit: e => events.push(e) });
  const promise = implementer.runs.get(runId).promise;
  if (cancelAfter) { for (let i = 0; i < 200 && !fake.received.prompt; i++) await new Promise(r => setTimeout(r, 10)); assert.equal(await implementer.cancel(runId), true); }
  await promise;
  const last = events.filter(e => ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(e.kind)).at(-1);
  const branch = last?.implementation?.branch;
  return { repo, fake, events, last, branch, box: `${INSTANCE_PREFIX}a1b2c3d4-abc123` };
}
const unregistered = (fake, box) => fake.calls.some(c => c.args[0] === '--unregister' && c.args[1] === box) && !fake.registered.has(box);

test('patch checks: links, submodules, .git, traversal, secrets and oversize are refused; normal patches pass', () => {
  const repo = tempRepo();
  const ok = patchFor(repo, GREETING);
  assert.deepEqual(checkPatch(ok), ['sandbox/hq-implementation/greeting.mjs', 'sandbox/hq-implementation/greeting.test.mjs']);
  assert.deepEqual(checkPatch(''), []);
  const link = 'diff --git a/sandbox/x b/sandbox/x\nnew file mode 120000\nindex 0000000..1111111\n--- /dev/null\n+++ b/sandbox/x\n@@ -0,0 +1 @@\n+/home/claude\n\\ No newline at end of file\n';
  assert.throws(() => checkPatch(link), /symbolic link/);
  assert.throws(() => checkPatch('diff --git a/sub b/sub\nnew file mode 160000\n'), /symbolic link or submodule/);
  assert.throws(() => checkPatch('diff --git a/sub b/sub\n+Subproject commit 1234\n'), /submodule/);
  assert.throws(() => checkPatch('diff --git a/.git/hooks/pre-commit b/.git/hooks/pre-commit\nnew file mode 100755\n'), /unsafe path/);
  assert.throws(() => checkPatch('diff --git a/x/.GIT/config b/x/.GIT/config\n'), /unsafe path/);
  assert.throws(() => checkPatch('diff --git a/../../evil b/../../evil\n'), /unsafe path/);
  assert.throws(() => checkPatch('diff --git a/a b/a\nrename from a\nrename to ../a\n'), /unsafe path/);
  for (const secret of [FAKE_KEY, 'ghp_' + 'A'.repeat(36), 'github_pat_' + 'B'.repeat(40), 'AKIA' + 'C'.repeat(16), '-----BEGIN OPENSSH PRIVATE KEY-----', ['sk', 'svcacct'].join('-') + '-' + 'D'.repeat(40)])
    assert.throws(() => checkPatch(patchFor(repo, { 'sandbox/hq-implementation/leak.mjs': `export const k = '${secret}';\n` })), /secret/, secret.slice(0, 8));
  assert.throws(() => checkPatch('x'.repeat(9 * 1024 * 1024)), /larger/);
  assert.throws(() => validateImplementation({ ...CONTRACT, tests: ['--allow-child-process.test.mjs'] }), /starting with "-"/);
  assert.throws(() => validateImplementation({ ...CONTRACT, scope: ['sandbox/-x/'] }), /starting with "-"/);
});

test('fail closed: no sandbox, or a missing or tampered base image, means no implementation at all', async () => {
  const repo = tempRepo();
  const bare = new ClaudeImplementer({ repoRoot: repo, claudeBin: 'x' });
  await assert.rejects(bare.start({ task: { id: 'a1b2c3d4', operation: 'implement-repo', safety: 'local-worktree-write', implementation: CONTRACT }, runId: 'r', emit: () => {} }), /no OS sandbox/);
  const missing = new ClaudeImplementer({ repoRoot: repo, claudeBin: 'x', sandbox: new WslSandbox({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sbx-none-')) }) });
  await assert.rejects(missing.start({ task: { id: 'a1b2c3d4', operation: 'implement-repo', safety: 'local-worktree-write', implementation: CONTRACT }, runId: 'r', emit: () => {} }), /base image not built/);
  const home = baseImage(); fs.writeFileSync(path.join(home, 'base.tar'), 'tampered');
  await assert.rejects(new WslSandbox({ home }).verifyBase(), /checksum mismatch/);
});

test('sandboxed run: Claude only through wsl.exe, key only over stdin, patch applied by HQ, tests in the sandbox, commit on host, instance destroyed', async () => {
  const { repo, fake, events, last, branch, box } = await run();
  assert.equal(last.kind, 'COMPLETED', JSON.stringify(events.map(e => e.summary)));
  // Claude was launched through the sandbox, never on the host.
  const claude = fake.calls.find(c => c.args.includes('/opt/hq/hq-claude.sh'));
  assert.deepEqual(claude.args.slice(0, 6), ['-d', box, '-u', 'root', '--exec', '/opt/hq/hq-claude.sh']);
  assert.ok(claude.args.includes('dontAsk') && claude.args.includes('Edit(./sandbox/hq-implementation/**)'));
  assert.ok(!fake.calls.some(c => c.command === 'claude-host.exe'));
  // The key went in over stdin once; it is never in any argument list or any wsl.exe environment.
  assert.equal(fake.received.key, FAKE_KEY);
  for (const c of fake.calls) {
    assert.ok(!JSON.stringify(c.args).includes(FAKE_KEY), 'key in argv');
    assert.ok(!Object.values(c.env).some(v => String(v).includes(FAKE_KEY)), 'key in env');
    assert.ok(!('WSLENV' in c.env) && !('ANTHROPIC_API_KEY' in c.env) && !('OPENAI_API_KEY' in c.env));
  }
  assert.ok(!JSON.stringify(events).includes(FAKE_KEY), 'key in HQ evidence');
  // The base tree was streamed in (a tar), not mounted.
  assert.ok(fake.received.tar.includes(Buffer.from('README.md')));
  // Tests ran inside the sandbox with the validated test list only.
  assert.deepEqual(fake.received.testArgs.slice(-1), CONTRACT.tests);
  assert.ok(!fake.received.testArgs.some(a => /^--(allow|permission)/.test(a)), 'the guest script fixes the permission flags');
  // The commit is on the host task branch with exactly the patch's files; nothing pushed.
  assert.equal(git(repo, 'show', '--name-only', '--format=', branch).trim().split('\n').sort().join(','), Object.keys(GREETING).sort().join(','));
  assert.ok(unregistered(fake, box), 'instance unregistered');
  assert.ok(events.some(e => e.summary === `Sandbox ${box} destroyed.`));
});

test('teardown on failure, blocked output and cancellation', async () => {
  const failed = await run({ wsl: { claudeExit: 1 } });
  assert.equal(failed.last.kind, 'FAILED'); assert.ok(unregistered(failed.fake, failed.box));
  const testsRed = await run({ wsl: { testExit: 1, testOut: 'ℹ tests 1\nℹ pass 0\nℹ fail 1\n' } });
  assert.equal(testsRed.last.kind, 'BLOCKED'); assert.match(testsRed.last.summary, /tests failed/); assert.ok(unregistered(testsRed.fake, testsRed.box));
  assert.equal(git(testsRed.repo, 'rev-parse', testsRed.last.implementation.branch).trim(), git(testsRed.repo, 'rev-parse', 'main').trim(), 'nothing committed');
  const cancelled = await run({ wsl: { hangClaude: true }, cancelAfter: true });
  assert.equal(cancelled.last?.kind, 'CANCELLED'); assert.ok(unregistered(cancelled.fake, cancelled.box));
  assert.ok(!cancelled.fake.calls.some(c => c.args.includes('/opt/hq/hq-test.sh')), 'no tests after cancel');
});

test('hostile sandbox output: secrets, links, .git writes and out-of-scope files never reach a commit', async () => {
  const repo = tempRepo();
  const leak = await run({ patch: patchFor(repo, { 'sandbox/hq-implementation/greeting.mjs': `export const k = '${FAKE_KEY}';\n`, 'sandbox/hq-implementation/greeting.test.mjs': 'x\n' }) });
  assert.equal(leak.last.kind, 'BLOCKED'); assert.match(leak.last.summary, /secret/); assert.ok(!leak.last.summary.includes(FAKE_KEY)); assert.ok(unregistered(leak.fake, leak.box));
  const outside = await run({ patch: patchFor(repo, { ...GREETING, 'README.md': '# owned\n' }) });
  assert.equal(outside.last.kind, 'BLOCKED'); assert.match(outside.last.summary, /Scope violation: README\.md/);
  const hook = await run({ patch: 'diff --git a/.git/hooks/post-checkout b/.git/hooks/post-checkout\nnew file mode 100755\n--- /dev/null\n+++ b/.git/hooks/post-checkout\n@@ -0,0 +1 @@\n+calc.exe\n' });
  assert.equal(hook.last.kind, 'BLOCKED'); assert.match(hook.last.summary, /unsafe path/);
  const link = await run({ patch: 'diff --git a/sandbox/hq-implementation/l b/sandbox/hq-implementation/l\nnew file mode 120000\nindex 0000000000000000000000000000000000000000..1111111111111111111111111111111111111111\n--- /dev/null\n+++ b/sandbox/hq-implementation/l\n@@ -0,0 +1 @@\n+C:/Users\n\\ No newline at end of file\n' });
  assert.equal(link.last.kind, 'BLOCKED'); assert.match(link.last.summary, /symbolic link/);
  const garbage = await run({ patch: 'diff --git a/sandbox/hq-implementation/a b/sandbox/hq-implementation/a\n--- a/sandbox/hq-implementation/a\n+++ b/sandbox/hq-implementation/a\n@@ -1 +1 @@\n-nope\n+x\n' });
  assert.equal(garbage.last.kind, 'BLOCKED'); assert.match(garbage.last.summary, /did not apply/);
  for (const r of [outside, hook, link, garbage]) assert.ok(unregistered(r.fake, r.box));
});

test('no usable key means nothing runs and no instance is created', async () => {
  const r = await run({ env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.equal(r.last.kind, 'BLOCKED'); assert.match(r.last.summary, /No Anthropic API key/);
  assert.ok(!r.fake.calls.some(c => c.args[0] === '--import'));
});

test('only the dedicated sandbox key is used; ANTHROPIC_API_KEY is never forwarded', async () => {
  const dedicated = ['sk', 'ant', 'test'].join('-') + '-' + 'Z'.repeat(48);
  const r = await run({ env: { ANTHROPIC_API_KEY: FAKE_KEY, HQ_SANDBOX_ANTHROPIC_API_KEY: dedicated, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.equal(r.last.kind, 'COMPLETED'); assert.equal(r.fake.received.key, dedicated);
  const only = await run({ env: { ANTHROPIC_API_KEY: FAKE_KEY, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.equal(only.last.kind, 'BLOCKED'); assert.match(only.last.summary, /HQ_SANDBOX_ANTHROPIC_API_KEY is not set/);
  assert.ok(!only.fake.calls.some(c => c.args[0] === '--import'));
});

test('stale instances from a crash are removed; other distros are untouched', async () => {
  const fake = fakeWsl();
  ['Ubuntu', `${INSTANCE_PREFIX}dead0001-aaaaaa`, `${INSTANCE_PREFIX}dead0002-bbbbbb`].forEach(n => fake.registered.add(n));
  const removed = await new WslSandbox({ spawn: fake.spawn, home: baseImage() }).cleanupStale();
  assert.equal(removed.length, 2);
  assert.deepEqual([...fake.registered], ['Ubuntu']);
  await assert.rejects(new WslSandbox({ spawn: fake.spawn }).create('Ubuntu'), /invalid sandbox name/);
});

test('HQ offers implement-repo only when the sandbox image exists, and withdraws an old capability without it', async () => {
  const { createHQ } = await import('../server.mjs');
  const { MemoryStore } = await import('../store.mjs');
  const fakeClaudeAdapter = { health: async () => ({ status: 'IDLE' }), start: async () => {}, cancel: async () => true };
  const adapters = () => ({ 'local-checks': fakeClaudeAdapter, 'cli-claude': fakeClaudeAdapter });
  const store = new MemoryStore();
  const on = await createHQ({ port: 0, store, intervalMs: 50, adapters: adapters(), implementation: true, env: { HQ_CLAUDE_BIN: 'claude.exe' }, sandboxFactory: () => ({ available: () => ({ ok: true }), cleanupStale: async () => [] }) });
  on.engine.configureAgent('claude', { executionAdapter: 'cli-claude' });
  assert.ok(on.engine.state.agents.claude.capabilities.includes('implement-repo'));
  await on.close();
  const off = await createHQ({ port: 0, store, intervalMs: 50, adapters: adapters(), implementation: true, env: { HQ_CLAUDE_BIN: 'claude.exe' }, sandboxFactory: () => ({ available: () => ({ ok: false, reason: 'sandbox base image not built' }), cleanupStale: async () => [] }) });
  assert.ok(!off.engine.state.agents.claude.capabilities.includes('implement-repo'), 'capability withdrawn');
  const res = await fetch(`${off.origin}/api/session`, { headers: { 'x-hq-client': 'command-center' } }).then(r => r.json());
  const state = await fetch(`${off.origin}/api/state`, { headers: { 'x-hq-client': 'command-center', authorization: `Bearer ${res.token}` } }).then(r => r.json());
  assert.match(state.health.implementation, /^UNAVAILABLE: sandbox base image not built/);
  assert.throws(() => off.engine.createTask({ title: 't', description: 'd', operation: 'implement-repo', safety: 'local-worktree-write', priority: 50, preferredAgentId: 'claude', implementation: CONTRACT }), /cannot perform/);
  await off.close();
});
