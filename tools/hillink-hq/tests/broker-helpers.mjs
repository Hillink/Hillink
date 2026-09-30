// Pass 4.5 test helpers for the split broker.
import { EventEmitter } from 'node:events';
import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GUEST_DIR, INSTANCE_PREFIX } from '../sandbox.mjs';
import { LinuxSandbox } from '../sandbox/linux.mjs';
import { CLAUDE_TOOL_NAMES, TOOL_NAMES } from '../broker/policy.mjs';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
export function tempRepo(files = {}, { links = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-brk-repo-'));
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'hq@test'); git(dir, 'config', 'user.name', 'HQ Test'); git(dir, 'config', 'core.symlinks', 'true');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  for (const [rel, content] of Object.entries(files)) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
  for (const [rel, target] of Object.entries(links)) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.symlinkSync(target, f); }
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base'); git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}

const runNode = (args, { cwd, env, input }) => new Promise((resolve, reject) => {
  const child = nodeSpawn(process.execPath, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  child.on('close', code => (code === 0 ? resolve({ stdout: out, stderr: err }) : reject(Object.assign(Error(`exited ${code}: ${err.slice(0, 300)}`), { code, stdout: out, stderr: err }))));
  child.stdin.end(input ?? '');
});
// A portable stand-in for the OS sandbox (no namespaces): the same guest broker program on a private directory, the
// same diff and test steps. It proves the broker's logic on every platform; the isolation itself is proven with the
// real LinuxSandbox (realSandbox()) and, on Windows, the WSL attack suite.
export class DirSandbox {
  constructor() { this.home = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-brk-sbx-')); this.execs = []; this.destroyed = []; }
  available() { return { ok: true, info: { backend: 'test-dir' } }; }
  brokerSupport() { return { ok: true }; }
  async verifyBase() { return {}; }
  dir(name) { if (!name.startsWith(INSTANCE_PREFIX)) throw Error('invalid sandbox name'); return path.join(this.home, name); }
  async create(name) { fs.mkdirSync(path.join(this.dir(name), 'work'), { recursive: true }); return { name }; }
  async stage(name, { repo, commit }) {
    const work = path.join(this.dir(name), 'work'), gd = path.join(this.dir(name), 'base.git');
    const tar = execFileSync('git', ['archive', '--format=tar', commit], { cwd: repo, maxBuffer: 64e6 });
    execFileSync('tar', ['-x', '-C', work, '-f', '-'], { input: tar });
    const g = (...a) => execFileSync('git', ['-c', 'safe.directory=*', `--git-dir=${gd}`, `--work-tree=${work}`, '-c', 'user.name=hq', '-c', 'user.email=hq@t', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8' });
    g('init', '-q'); g('add', '-A', '-f'); g('commit', '-q', '--allow-empty', '-m', 'base');
  }
  async exec(name, script, args = [], { input, signal } = {}) {
    if (signal?.aborted) throw Error('cancelled');
    this.execs.push({ name, script, args });
    const work = path.join(this.dir(name), 'work'), gd = path.join(this.dir(name), 'base.git');
    if (script === 'hq-broker.sh') return runNode([path.join(GUEST_DIR, 'hq-broker.mjs')], { cwd: work, env: { PATH: process.env.PATH, HQ_BROKER_ROOT: work }, input });
    if (script === 'hq-test.sh') {
      const runner = path.join(GUEST_DIR, 'hq-test-runner.mjs'), flags = args.filter(a => a === '--experimental-strip-types'), files = args.filter(a => !a.startsWith('-'));
      return runNode(['--frozen-intrinsics', '--no-warnings', ...flags, '--permission', `--allow-fs-read=${work}`, `--allow-fs-read=${runner}`, runner, ...files], { cwd: work, env: { PATH: process.env.PATH }, input });
    }
    if (script === 'hq-diff.sh') {
      const g = (...a) => execFileSync('git', ['-c', 'safe.directory=*', `--git-dir=${gd}`, `--work-tree=${work}`, '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8', maxBuffer: 64e6 });
      g('add', '-A', '-f');
      return { stdout: g('diff', '--cached', '--binary', '--no-color', '--no-ext-diff', '--no-textconv', '--full-index', 'HEAD'), stderr: '' };
    }
    throw Error(`${script} not available in the test sandbox`);
  }
  async destroy(name) { fs.rmSync(this.dir(name), { recursive: true, force: true }); this.destroyed.push(name); return true; }
  async list() { return fs.existsSync(this.home) ? fs.readdirSync(this.home).filter(n => n.startsWith(INSTANCE_PREFIX)) : []; }
  async cleanupStale() { const l = await this.list(); for (const n of l) await this.destroy(n); return l; }
}
// The real Linux namespace sandbox when this machine can run it (Linux, root), else null (tests skip with a reason).
export function realSandbox() {
  const s = new LinuxSandbox({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'hq-brk-linux-')) });
  return s.available().ok ? s : null;
}

// JSON-RPC client for the broker endpoint, as Claude Code's MCP client calls it.
export async function mcpCall(url, token, method, params, { headers = {}, id = 1 } = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}
export const toolCall = async (url, token, name, args) => {
  let r; try { r = await mcpCall(url, token, 'tools/call', { name, arguments: args }); } catch (error) { return { text: '', isError: true, status: undefined, error: error.cause?.code ?? error.message }; }
  return r.body?.result ? { text: r.body.result.content?.[0]?.text ?? '', isError: r.body.result.isError, status: r.status } : { text: '', isError: true, status: r.status };
};

// A fake Claude Code binary for the broker runner. It answers the preflight (--version, auth status), then, for the
// session, reads HQ's MCP config and runs `plan(call)` against the broker over HTTP exactly as Claude's MCP client
// would, then reports a result. Options let a test forge what a compromised or misconfigured Claude would report.
export function brokerClaude(plan = async () => {}, { tools = CLAUDE_TOOL_NAMES, servers = [{ name: 'hq', status: 'connected' }], apiKeySource = 'none', auth = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }, rateLimit = null, extraToolUse = null, result = 'Done.', pid = 424242 } = {}) {
  const spawned = [], calls = [];
  const spawn = (command, args, opts) => {
    const child = new EventEmitter();
    child.pid = pid; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    let closed = false;
    const close = (code, signal = null) => { if (!closed) { closed = true; child.emit('close', code, signal); } };
    child.kill = () => { setImmediate(() => close(null, 'SIGTERM')); return true; };
    const line = o => { if (!closed) child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n')); };
    spawned.push({ command, args, opts, child });
    child.stdin = Object.assign(new EventEmitter(), { end(prompt) {
      if (args[0] === '--version') return setImmediate(() => { child.stdout.emit('data', Buffer.from('2.1.285 (Claude Code)\n')); close(0); });
      if (args[0] === 'auth') return setImmediate(() => { child.stdout.emit('data', Buffer.from(JSON.stringify(auth))); close(0); });
      setImmediate(async () => {
        const cfg = JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8')).mcpServers.hq;
        const token = cfg.headers.Authorization.replace('Bearer ', '');
        child.prompt = prompt; child.mcp = { url: cfg.url, token };
        line({ type: 'system', subtype: 'init', tools, mcp_servers: servers, apiKeySource });
        await new Promise(r => setImmediate(r));
        if (closed) return;
        // Tools Claude Code does not list can only be called by a compromised client straight over HTTP, so only listed
        // tool names appear in the stream (an unlisted one there is a separate attack, see extraToolUse).
        const call = async (name, a) => { const r = await toolCall(cfg.url, token, name, a); calls.push({ name, args: a, ...r }); if (TOOL_NAMES.includes(name)) line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: `mcp__hq__${name}`, input: a }] } }); return r; };
        if (extraToolUse) line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: extraToolUse, input: {} }] } });
        try { await plan(call, { child, url: cfg.url, token }); } catch (error) { calls.push({ error: error.message }); }
        if (rateLimit) line({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: rateLimit, resetsAt: Math.floor(Date.now() / 1000) + 3600 } });
        line({ type: 'result', subtype: rateLimit ? 'error' : 'success', is_error: Boolean(rateLimit), result: rateLimit ? 'Claude usage limit reached' : result, total_cost_usd: 0.05, usage: { input_tokens: 10, output_tokens: 10 }, num_turns: 3 });
        close(0);
      });
    } });
    return child;
  };
  return { spawn, spawned, calls, sessions: () => spawned.filter(s => s.args.includes('--mcp-config')) };
}
