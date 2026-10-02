// Pass 4.5: the disposable sandbox on a Linux host (the WSL2 backend in sandbox.mjs is the Windows one). Same interface
// as WslSandbox for the steps the subscription split broker uses: create, stage, the diff, the tests and broker file
// operations, destroy. Each step runs in fresh namespaces (no network interface up, own PID/IPC/UTS/mounts) inside a
// minimal chroot that contains only read-only system directories, Node, HQ's guest scripts and the instance's tree
// (hq-linux.sh). There is no credential, no Claude process and no host home directory inside.
//
// Claude-in-the-sandbox (the metered direct-sandbox variant) is WSL-only: hq-key.sh and claudeCommand are refused here.
import { spawn as nodeSpawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUEST_DIR, INSTANCE_PREFIX } from '../sandbox.mjs';
import { MIN_NODE_MAJOR, nodeMajor } from '../node-version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEP = { 'hq-stage.sh': 'stage', 'hq-diff.sh': 'diff', 'hq-test.sh': 'test', 'hq-broker.sh': 'broker' };

export class LinuxSandbox {
  constructor({ spawn = nodeSpawn, home = '/var/lib/hq-sandbox', stepTimeoutMs = 10 * 60_000, nodeDir = path.dirname(path.dirname(process.execPath)), guestDir = GUEST_DIR, nodeVersionOf = dir => execFileSync(path.join(dir, 'bin', 'node'), ['--version'], { encoding: 'utf8', timeout: 10_000, env: {} }).trim() } = {}) {
    Object.assign(this, { spawn, home, stepTimeoutMs, nodeDir, guestDir, nodeVersionOf, script: path.join(HERE, 'linux', 'hq-linux.sh') });
    this.instances = path.join(home, 'instances');
  }
  available() {
    if (process.platform !== 'linux') return { ok: false, reason: 'the Linux sandbox runs on Linux hosts only' };
    if (typeof process.getuid === 'function' && process.getuid() !== 0) return { ok: false, reason: 'the Linux sandbox needs HQ to run as root (namespaces and chroot)' };
    for (const bin of ['/usr/bin/unshare', '/usr/bin/setpriv', '/usr/sbin/chroot']) if (!fs.existsSync(bin) && !fs.existsSync(bin.replace('/usr/sbin/', '/usr/bin/'))) return { ok: false, reason: `${path.basename(bin)} not installed` };
    // The tests run on the Node mounted from nodeDir (the host's by default), so it must be a supported version too.
    let version = null; try { version = this.nodeVersionOf(this.nodeDir); } catch { /* reported below */ }
    if (!(nodeMajor(version) >= MIN_NODE_MAJOR)) return { ok: false, reason: `the sandbox Node at ${this.nodeDir} is ${version ?? 'unreadable'}; Node ${MIN_NODE_MAJOR}+ is required` };
    return { ok: true, info: { backend: 'linux-namespaces', node: this.nodeDir, nodeVersion: version } };
  }
  brokerSupport() { return this.available(); }
  async verifyBase() { return this.available().info; }
  dir(name) {
    if (!name.startsWith(INSTANCE_PREFIX) || !/^[a-z0-9-]{8,60}$/.test(name)) throw Error('invalid sandbox name');
    return path.join(this.instances, name);
  }
  run(args, { input, timeoutMs = this.stepTimeoutMs, maxBytes = 16 * 1024 * 1024, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Error('cancelled'));
      // A minimal environment: nothing of HQ's own (no API keys, no tokens) reaches a sandbox step.
      const child = this.spawn('/bin/bash', [this.script, ...args], { shell: false, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', HQ_NODE_DIR: this.nodeDir, HQ_GUEST_DIR: this.guestDir }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
      const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
      let out = [], err = '', size = 0, done = false;
      signal?.addEventListener('abort', () => { if (!done) { kill(); reject(Error('cancelled')); } }, { once: true });
      const timer = setTimeout(() => { if (!done) { kill(); reject(Error(`sandbox step ${args[1]} timed out`)); } }, timeoutMs);
      timer.unref?.();
      child.stdout.on('data', d => { size += d.length; if (size <= maxBytes) out.push(d); });
      child.stderr.on('data', d => { err = (err + d.toString()).slice(-2000); });
      child.on('error', e => { done = true; clearTimeout(timer); reject(e); });
      child.on('close', code => {
        done = true; clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        if (size > maxBytes) return reject(Error('sandbox output exceeded its limit'));
        if (code !== 0) return reject(Object.assign(Error(`sandbox step ${args[1]} exited ${code}: ${err.trim().slice(0, 400)}`), { code, stdout, stderr: err }));
        resolve({ stdout, stderr: err });
      });
      if (input && typeof input.pipe === 'function') input.pipe(child.stdin); else child.stdin.end(input ?? '');
      child.stdin.on('error', () => {});
    });
  }
  async create(name) {
    const dir = this.dir(name);
    fs.mkdirSync(this.instances, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.home, 0o700);
    fs.mkdirSync(dir, { mode: 0o700 });
    fs.mkdirSync(path.join(dir, 'work'), { mode: 0o755 });
    fs.mkdirSync(path.join(dir, 'base.git'), { mode: 0o700 });
    return { name, dir };
  }
  async stage(name, { repo, commit, git = [], signal }) {
    const archive = this.spawn('git', [...git, 'archive', '--format=tar', commit], { cwd: repo, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const failed = new Promise((_, reject) => { archive.on('error', reject); archive.on('close', code => { if (code) reject(Error(`git archive exited ${code}`)); }); });
    failed.catch(() => {});
    await Promise.race([this.exec(name, 'hq-stage.sh', [], { input: archive.stdout, timeoutMs: 5 * 60_000, signal }), failed]);
  }
  exec(name, script, args = [], opts) {
    const step = STEP[script];
    if (!step) return Promise.reject(Error(`${script} is not available in the Linux sandbox (the metered in-sandbox Claude is WSL-only)`));
    return this.run([this.dir(name), step, ...args], opts);
  }
  claudeCommand() { throw Error('Claude never runs inside the Linux sandbox; it is the split-broker backend only.'); }
  async destroy(name) {
    const dir = this.dir(name);
    // Every step ran in its own PID namespace, which ends with the step, so no process of this instance outlives it.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* reported below */ }
    return !fs.existsSync(dir);
  }
  async list({ strict = false } = {}) {
    try { return fs.existsSync(this.instances) ? fs.readdirSync(this.instances).filter(n => n.startsWith(INSTANCE_PREFIX)) : []; }
    catch (error) { if (strict) throw error; return []; }
  }
  async cleanupStale() { const stale = await this.list(); for (const n of stale) await this.destroy(n); return stale; }
}
