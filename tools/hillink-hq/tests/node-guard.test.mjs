// Consolidation pass (2026-10-01): HQ refuses to run on Node < 24, an empty acceptance file is never green on any
// Node version, and the implementation base is explicit (origin/main unless HQ_IMPL_BASE names one origin/<branch>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertSupportedNode, nodeMajor } from '../node-version.mjs';
import { resolveImplementationBase, DEFAULT_IMPL_BASE } from '../implementation-runner.mjs';
import { LinuxSandbox } from '../sandbox/linux.mjs';
import { GUEST_DIR } from '../sandbox.mjs';
import { testVerdict, newRunKey } from '../test-verdict.mjs';
import { MemoryStore } from '../store.mjs';

const RUNNER = path.join(GUEST_DIR, 'hq-test-runner.mjs'), CHILD = path.join(GUEST_DIR, 'hq-test-child.mjs');
const NODE22 = ['/opt/node22/bin/node', '/usr/local/n/versions/node/22/bin/node'].find(p => fs.existsSync(p)) ?? null;
const PASSING = "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('adds', () => assert.equal(1 + 1, 2));\n";

function work(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-node-guard-'));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  return dir;
}
// The real controller, as the sandbox runs it (permission model, one isolated child per file).
function runRunner(dir, files, node = process.execPath) {
  const key = newRunKey();
  const r = spawnSync(node, ['--frozen-intrinsics', '--no-warnings', '--permission', '--allow-child-process', `--allow-fs-read=${dir}`, `--allow-fs-read=${RUNNER}`, RUNNER, ...files], { cwd: dir, input: `${key}\n`, encoding: 'utf8', env: { PATH: process.env.PATH } });
  return { ...r, verdict: testVerdict(r.stdout, { key, tests: files, exitedOk: r.status === 0 }) };
}

test('N1. an empty acceptance file is not green through the real runner (control: a genuine test is)', () => {
  const dir = work({ 'a/empty.test.mjs': '// no tests here\n', 'a/real.test.mjs': PASSING });
  try {
    const good = runRunner(dir, ['a/real.test.mjs']);
    assert.equal(good.verdict.green, true, good.stdout);
    assert.equal(good.verdict.passed, 1);
    const empty = runRunner(dir, ['a/empty.test.mjs']);
    assert.equal(empty.verdict.green, false, empty.stdout);
    assert.equal(empty.verdict.passed, 0);
    assert.match(empty.stdout, /defines no tests/);
    const mixed = runRunner(dir, ['a/real.test.mjs', 'a/empty.test.mjs']);
    assert.equal(mixed.verdict.green, false, 'one empty file fails the whole run');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N2. passes reported for another file (a helper that defines tests) never pass the launched file', () => {
  const dir = work({ 'a/helper.mjs': "import test from 'node:test';\ntest('from the helper', () => {});\n", 'a/only-helper.test.mjs': "import './helper.mjs';\n" });
  try {
    const r = runRunner(dir, ['a/only-helper.test.mjs']);
    assert.equal(r.verdict.green, false, r.stdout);
    assert.equal(r.verdict.passed, 0);
    assert.match(r.stdout, /ignored pass outside a\/only-helper\.test\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N3. on Node 22 the runner and the per-file child refuse to run (exit 99), so nothing can be green', { skip: NODE22 ? false : 'no Node 22 binary on this machine' }, () => {
  const dir = work({ 'a/empty.test.mjs': '// no tests here\n', 'a/real.test.mjs': PASSING });
  try {
    for (const f of ['a/empty.test.mjs', 'a/real.test.mjs']) {
      const r = runRunner(dir, [f], NODE22);
      assert.equal(r.status, 99, r.stdout);
      assert.match(r.stdout, /HQ-RUNNER: Node 22\.[\d.]+ is not supported/);
      assert.equal(r.verdict.green, false);
    }
    const child = spawnSync(NODE22, [CHILD, 'a/real.test.mjs'], { cwd: dir, input: `${crypto.randomBytes(32).toString('hex')}\n`, encoding: 'utf8' });
    assert.equal(child.status, 99, child.stdout);
    assert.match(child.stdout, /HQ-CHILD-ERROR: Node 22\.[\d.]+ is not supported/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('N4. HQ itself refuses to start below Node 24', async () => {
  assert.equal(nodeMajor('v24.14.1'), 24); assert.equal(nodeMajor('22.22.2'), 22); assert.ok(Number.isNaN(nodeMajor('banana')));
  for (const v of ['22.22.2', '23.11.0', '20.1.0', '', 'banana']) assert.throws(() => assertSupportedNode(v), /requires Node 24 or newer/, v);
  for (const v of ['24.0.0', '24.21.0', '25.1.0']) assert.doesNotThrow(() => assertSupportedNode(v));
  const { createHQ } = await import('../server.mjs');
  await assert.rejects(createHQ({ port: 0, store: new MemoryStore(), nodeVersion: '22.22.2' }), /requires Node 24 or newer/);
});

test('N5. the Linux sandbox is unavailable when the Node it would mount is older than 24', { skip: process.platform === 'linux' && process.getuid?.() === 0 ? false : 'Linux sandbox checks need Linux as root' }, () => {
  const old = new LinuxSandbox({ home: os.tmpdir(), nodeVersionOf: () => 'v22.22.2' });
  const a = old.available();
  assert.equal(a.ok, false); assert.match(a.reason, /v22\.22\.2; Node 24\+ is required/);
  assert.equal(new LinuxSandbox({ home: os.tmpdir(), nodeVersionOf: () => { throw Error('missing'); } }).available().ok, false, 'an unreadable Node is refused');
  const cur = new LinuxSandbox({ home: os.tmpdir() }).available();
  if (cur.ok) assert.equal(cur.info.nodeVersion, process.version);
});

test('B1. the implementation base is explicit: default origin/main, one origin/<branch> by HQ_IMPL_BASE, anything else refused', () => {
  assert.equal(DEFAULT_IMPL_BASE, 'origin/main');
  assert.deepEqual(resolveImplementationBase({}), { base: 'origin/main', source: 'default' });
  assert.deepEqual(resolveImplementationBase({ HQ_IMPL_BASE: '' }), { base: 'origin/main', source: 'default' });
  assert.deepEqual(resolveImplementationBase({ HQ_IMPL_BASE: 'origin/claude/dev-baseline' }), { base: 'origin/claude/dev-baseline', source: 'HQ_IMPL_BASE' });
  for (const bad of ['main', 'claude/dev-baseline', 'HEAD', 'origin/HEAD', 'origin/', 'origin/a..b', 'origin//x', 'origin/x/', 'origin/x.lock', 'origin/-x', 'origin/x@{1}', 'origin/x~1', 'origin/x^', 'origin/x y', '52d1516', 'refs/heads/main', '--upload-pack=x', 'origin/x:y', 'origin/.hidden'])
    assert.throws(() => resolveImplementationBase({ HQ_IMPL_BASE: bad }), /HQ_IMPL_BASE must name a remote-tracking branch/, bad);
});

test('B2. HQ passes the configured base to both implementation routes, and disables implementation when it is invalid or missing', async () => {
  const { createHQ } = await import('../server.mjs');
  const fake = { health: async () => ({ status: 'IDLE' }), start: async () => {}, cancel: async () => true };
  const sandboxFactory = () => ({ available: () => ({ ok: true }), brokerSupport: () => ({ ok: true }), cleanupStale: async () => [] });
  const start = env => createHQ({ port: 0, store: new MemoryStore(), intervalMs: 50, adapters: { 'local-checks': fake, 'cli-claude': fake }, implementation: true, env: { HQ_CLAUDE_BIN: 'claude.exe', ...env }, sandboxFactory });
  const state = async hq => {
    const { token } = await fetch(`${hq.origin}/api/session`, { headers: { 'x-hq-client': 'command-center' } }).then(r => r.json());
    return fetch(`${hq.origin}/api/state`, { headers: { 'x-hq-client': 'command-center', authorization: `Bearer ${token}` } }).then(r => r.json());
  };
  // The base must resolve in this checkout; HEAD's own remote-tracking branch is used when there is one.
  const has = ref => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: path.resolve(import.meta.dirname, '../../..') }).status === 0;
  const configured = has('origin/claude/dev-baseline') ? 'origin/claude/dev-baseline' : has('origin/main') ? 'origin/main' : null;
  if (configured) {
    const hq = await start({ HQ_IMPL_BASE: configured });
    try {
      const s = await state(hq);
      assert.equal(s.health.implementation, 'CONFIGURED');
      assert.equal(s.health.implementationRoutes.base.ref, configured);
      assert.match(s.health.implementationRoutes.base.commit, /^[0-9a-f]{40}$/);
      const router = hq.engine.adapters['cli-claude'];
      assert.equal(router.implement.base, configured, 'direct route');
      assert.equal(router.broker.base, configured, 'subscription split broker route');
    } finally { await hq.close(); }
  }
  for (const [env, why] of [[{ HQ_IMPL_BASE: 'main' }, /HQ_IMPL_BASE must name/], [{ HQ_IMPL_BASE: 'origin/no-such-branch-hq-test' }, /does not resolve/]]) {
    const hq = await start(env);
    try {
      const s = await state(hq);
      assert.match(s.health.implementation, /^UNAVAILABLE: /);
      assert.match(s.health.implementation, why);
      assert.ok(!hq.engine.state.agents.claude.capabilities.includes('implement-repo'), 'no implement-repo capability without a valid base');
    } finally { await hq.close(); }
  }
});
