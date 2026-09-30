// Pass 2.7: OS-level containment for Claude implementation runs (worker plane), controlled by HQ (control plane).
//
// Each implementation run gets its own disposable WSL2 distribution imported from a verified base image and
// unregistered afterwards (success, failure, cancellation or timeout). Inside it:
//   - no Windows drives (automount off), no Windows program interop, WSL's shared mounts hidden, no sudo
//   - the task's base tree only (git archive of the host worktree), under /work
//   - Claude as an unprivileged user in its own network namespace whose only route is an allowlist proxy to
//     api.anthropic.com; its key arrives on stdin and is readable only by root, then only in Claude's process env
//   - tests as a second unprivileged user with no network at all and Node's permission model
// The only thing that returns to the host is a patch, which HQ validates (checkPatch) and applies itself before
// all Pass 2.6 checks. HQ never executes anything produced in the sandbox.
import { spawn as nodeSpawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SANDBOX_HOME = path.join(os.homedir(), '.hillink-hq', 'sandbox');
export const INSTANCE_PREFIX = 'hq-sbx-';
export const GUEST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sandbox', 'guest');
const MAX_PATCH = 8 * 1024 * 1024;

// Patterns that must never be committed by an implementation (API keys and private keys).
export const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{20,}/, /sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/, /\bsk-[A-Za-z0-9]{32,}\b/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /xox[baprs]-[A-Za-z0-9-]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJhbGciOi[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./];

// Validates a patch produced in the sandbox before HQ lets git touch it. Returns the list of paths it affects.
export function checkPatch(patch) {
  if (typeof patch !== 'string') throw Error('patch must be text');
  if (patch.length > MAX_PATCH) throw Error(`patch is larger than ${MAX_PATCH} bytes`);
  if (!patch.trim()) return [];
  const paths = new Set();
  for (const line of patch.split('\n')) {
    let m;
    if ((m = /^diff --git a\/(.+) b\/(.+)$/.exec(line))) { paths.add(m[1]); paths.add(m[2]); continue; }
    if (/^(new file mode|deleted file mode|old mode|new mode) (120000|160000)\b/.test(line) || /^index [0-9a-f]+\.\.[0-9a-f]+ (120000|160000)$/.test(line)) throw Error('patch contains a symbolic link or submodule');
    if (/^[+ -]?Subproject commit /.test(line)) throw Error('patch contains a submodule');
    if ((m = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line))) paths.add(m[1]);
    if (line.startsWith('+') && !line.startsWith('+++')) for (const re of SECRET_PATTERNS) if (re.test(line)) throw Error('patch adds something that looks like a secret (API key, token or private key)');
  }
  for (const p of paths) if (p.includes('..') || p.startsWith('/') || /(^|\/)\.git(\/|$)/i.test(p) || /[\\:]/.test(p)) throw Error(`patch touches an unsafe path: ${p.slice(0, 120)}`);
  return [...paths].sort();
}

const hostEnv = () => Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));

export class WslSandbox {
  constructor({ spawn = nodeSpawn, home = SANDBOX_HOME, wsl = 'wsl.exe', stepTimeoutMs = 10 * 60_000 } = {}) {
    Object.assign(this, { spawn, home, wsl, stepTimeoutMs });
    this.baseTar = path.join(home, 'base.tar'); this.baseInfo = path.join(home, 'base.json');
  }
  // The base image exists and matches the checksum recorded when it was built (fail closed otherwise).
  available() {
    try {
      const info = JSON.parse(fs.readFileSync(this.baseInfo, 'utf8'));
      if (!fs.existsSync(this.baseTar)) return { ok: false, reason: 'sandbox base image not built' };
      return { ok: true, info };
    } catch { return { ok: false, reason: 'sandbox base image not built (run: node tools/hillink-hq/sandbox/build-base.mjs)' }; }
  }
  // Pass 4.5: the split broker needs the image's broker scripts, identical to the ones in this checkout. An image built
  // before Pass 4.5 (or from other scripts) does not support it: HQ then waits, it never falls back to paying.
  brokerSupport() {
    const a = this.available();
    if (!a.ok) return a;
    const want = ['hq-broker.sh', 'hq-broker.mjs', 'hq-diff.sh', 'hq-test.sh', 'hq-stage.sh', 'hq-harden.sh'];
    for (const f of want) {
      let local; try { local = crypto.createHash('sha256').update(fs.readFileSync(path.join(GUEST_DIR, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex'); } catch { return { ok: false, reason: `guest script ${f} missing from this checkout` }; }
      if (a.info?.scripts?.[f] !== local) return { ok: false, reason: `the sandbox base image predates the Pass 4.5 broker (${f} differs); rebuild it: node tools/hillink-hq/sandbox/build-base.mjs` };
    }
    return { ok: true };
  }
  async verifyBase() {
    const info = JSON.parse(fs.readFileSync(this.baseInfo, 'utf8'));
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => fs.createReadStream(this.baseTar).on('data', d => hash.update(d)).on('end', resolve).on('error', reject));
    if (hash.digest('hex') !== info.sha256) throw Error('sandbox base image checksum mismatch; refusing to use it');
    return info;
  }
  // Runs wsl.exe with fixed arguments (no shell). input: string/Buffer, or a readable stream to pipe in.
  // wsl.exe gets a minimal environment: no API keys, and no WSLENV, so nothing from Windows is forwarded inside.
  run(args, { input, timeoutMs = this.stepTimeoutMs, maxBytes = 16 * 1024 * 1024, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Error('cancelled'));
      const child = this.spawn(this.wsl, args, { windowsHide: true, shell: false, env: hostEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      signal?.addEventListener('abort', () => { if (!done) { child.kill(); reject(Error('cancelled')); } }, { once: true });
      let out = [], err = '', size = 0, done = false;
      const timer = setTimeout(() => { if (!done) { child.kill(); reject(Error(`wsl ${args.slice(0, 5).join(' ')} timed out`)); } }, timeoutMs);
      timer.unref?.();
      child.stdout.on('data', d => { size += d.length; if (size <= maxBytes) out.push(d); });
      child.stderr.on('data', d => { err = (err + d.toString().replace(/\0/g, '')).slice(-2000); });
      child.on('error', e => { done = true; clearTimeout(timer); reject(e); });
      child.on('close', code => {
        done = true; clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        if (size > maxBytes) return reject(Error('sandbox output exceeded its limit'));
        if (code !== 0) return reject(Object.assign(Error(`wsl ${args.slice(0, 5).join(' ')} exited ${code}: ${err.trim().slice(0, 400)}`), { code, stdout, stderr: err }));
        resolve({ stdout, stderr: err });
      });
      if (input && typeof input.pipe === 'function') input.pipe(child.stdin); else child.stdin.end(input ?? '');
      child.stdin.on('error', () => {});
    });
  }
  // The task's base tree, streamed from git archive on the host into /work (never a Windows path mount).
  async stage(name, { repo, commit, git = [], signal }) {
    const archive = this.spawn('git', [...git, 'archive', '--format=tar', commit], { cwd: repo, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const failed = new Promise((_, reject) => { archive.on('error', reject); archive.on('close', code => { if (code) reject(Error(`git archive exited ${code}`)); }); });
    failed.catch(() => {});
    await Promise.race([this.exec(name, 'hq-stage.sh', [], { input: archive.stdout, timeoutMs: 5 * 60_000, signal }), failed]);
  }
  // Claude's launch inside an instance: wsl.exe, no shell, fixed script; Claude's arguments follow verbatim.
  claudeCommand(name, claudeArgs) { return { command: this.wsl, args: ['-d', name, '-u', 'root', '--exec', '/opt/hq/hq-claude.sh', ...claudeArgs], env: hostEnv() }; }
  exec(name, script, args = [], opts) { return this.run(['-d', name, '-u', 'root', '--exec', `/opt/hq/${script}`, ...args], opts); }
  async create(name) {
    if (!name.startsWith(INSTANCE_PREFIX) || !/^[a-z0-9-]{8,60}$/.test(name)) throw Error('invalid sandbox name');
    const dir = path.join(this.home, 'instances', name);
    fs.mkdirSync(dir, { recursive: true });
    await this.run(['--import', name, dir, this.baseTar, '--version', '2'], { timeoutMs: 5 * 60_000 });
    // WSL stops an idle distribution, which would drop /run/hq and the staging mounts between steps. One idle
    // process keeps the instance up until destroy().
    (this.keepers ??= new Map()).set(name, this.spawn(this.wsl, ['-d', name, '-u', 'root', '--exec', '/bin/sleep', 'infinity'], { windowsHide: true, shell: false, env: hostEnv(), stdio: 'ignore' }));
    return { name, dir };
  }
  async destroy(name) {
    try { this.keepers?.get(name)?.kill(); } catch { /* gone */ }
    this.keepers?.delete(name);
    // Always attempted; each step tolerates "already gone". Unregister deletes the instance's disk entirely.
    try { await this.run(['--terminate', name], { timeoutMs: 60_000 }); } catch { /* not running */ }
    try { await this.run(['--unregister', name], { timeoutMs: 120_000 }); } catch { /* already gone */ }
    try { fs.rmSync(path.join(this.home, 'instances', name), { recursive: true, force: true }); } catch { /* best effort */ }
    return !(await this.list()).includes(name);
  }
  // strict: a failed listing throws instead of reading as "no instances" (restart recovery must never treat an
  // unanswered query as proof that a sandbox is gone).
  async list({ strict = false } = {}) {
    const { stdout } = await this.run(['--list', '--quiet'], { timeoutMs: 30_000 }).catch(error => { if (strict) throw error; return { stdout: '' }; });
    return stdout.replace(/\0/g, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  // Removes instances left behind by a crash or restart. They are disposable by design.
  async cleanupStale() { const stale = (await this.list()).filter(n => n.startsWith(INSTANCE_PREFIX)); for (const n of stale) await this.destroy(n); return stale; }
}
