// Art Factory Step 1: HQ's 'produce-asset' operation. One task, unattended, no model and no network:
//   1. a fresh git worktree on a new branch hq/asset/<task>-<run> from the implementation base (HQ_IMPL_BASE rules)
//   2. the factory (tools/hillink-art-factory/factory.py, from that worktree's commit) renders the allowlisted recipe
//      with headless Blender (bpy) into tools/hillink-world/assets/characters/<agent>/<theme>/x<scale>/
//   3. a second render into a scratch folder: the sheet and its metadata must be byte-identical (determinism)
//   4. verify.py checks the sheet (cell, anchor, binary alpha, one palette, four facings, nothing cut off)
//   5. HQ runs the World tests in the worktree, which load the generated sheet through the World's authored loader
//   6. only the generated files are committed, with an HQ-Task trailer. Nothing is pushed or merged.
// The task carries only { recipe, scale }. Every path, command and environment variable is decided here.
import { execFile as nodeExecFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateAssetRequest } from './orchestration/policy.mjs';
import { changedFiles, testCounts, DEFAULT_IMPL_BASE } from './implementation-runner.mjs';

const FACTORY = 'tools/hillink-art-factory';
const ASSET_ROOT = 'tools/hillink-world/assets/characters';
const WORLD_TESTS = 'tools/hillink-world/tests';
// The only environment the factory and the tests see: no tokens, keys or HQ settings.
const CHILD_ENV = ['PATH', 'HOME', 'LANG', 'TMPDIR', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'];
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED']);

export class ArtFactoryAdapter {
  constructor({ repoRoot, python, base = DEFAULT_IMPL_BASE, worktreeRoot = path.join(os.homedir(), '.hillink-hq', 'worktrees'), env = process.env, execFile = nodeExecFile, nodeBin = process.execPath, heartbeatMs = 5000, factoryTimeoutMs = 30 * 60_000 } = {}) {
    Object.assign(this, { repoRoot, python, base, worktreeRoot, env, execFileImpl: execFile, nodeBin, heartbeatMs, factoryTimeoutMs, runs: new Map() });
  }
  // Whether this machine can run the factory: a Python with the pinned bpy. Checked once at HQ start (server.mjs).
  available() {
    if (!this.python || !fs.existsSync(this.python)) return { ok: false, reason: 'HQ_ART_PYTHON is not set to a Python with the Art Factory requirements' };
    return { ok: true };
  }
  async health() { const a = this.available(); return { status: a.ok ? 'IDLE' : 'UNKNOWN', detail: a.ok ? 'Art Factory ready (local Blender, no network).' : a.reason }; }
  childEnv() { return Object.fromEntries(CHILD_ENV.filter(k => this.env[k]).map(k => [k, this.env[k]])); }
  exec(cmd, args, { signal, timeout = 120_000, cwd = this.repoRoot, env } = {}) {
    return new Promise((resolve, reject) => {
      this.execFileImpl(cmd, args, { cwd, env, signal, windowsHide: true, maxBuffer: 32e6, timeout }, (error, stdout, stderr) => {
        if (error) reject(Object.assign(Error(`${path.basename(cmd)} ${args.find(a => !a.startsWith('-')) ?? ''} failed: ${String(stderr || error.message).trim().slice(-600)}`), { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
        else resolve(String(stdout));
      });
    });
  }
  hardening() {
    const noHooks = this.noHooksDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hq-no-hooks-'));
    return ['-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
  }
  git(args, cwd = this.repoRoot) { return this.exec('git', [...this.hardening(), ...args], { cwd }); }

  async start({ task, runId, emit }) {
    if (task.operation !== 'produce-asset' || task.safety !== 'local-artifact-write') throw Error('Art Factory accepts produce-asset tasks only');
    const asset = validateAssetRequest(task.asset); // re-checked at execution
    const a = this.available(); if (!a.ok) throw Error(`Art Factory unavailable: ${a.reason}`);
    if (this.runs.size) throw Error('Art Factory already has a run in progress');
    const entry = { cancelled: false, abort: new AbortController(), done: null };
    this.runs.set(runId, entry);
    let held = null;
    const out = ev => { if (TERMINAL.has(ev.kind)) { held ??= ev; return; } emit(ev); };
    const beat = setInterval(() => { try { emit({ kind: 'HEARTBEAT', summary: 'Art Factory working.' }); } catch { /* run closed */ } }, this.heartbeatMs);
    entry.done = this.execute(task, runId, asset, entry, out)
      .catch(error => { held ??= { kind: entry.cancelled ? 'CANCELLED' : 'FAILED', summary: (entry.cancelled ? 'Art Factory run cancelled.' : `Art Factory failed: ${error.message}`).slice(0, 1900) }; })
      .finally(() => { clearInterval(beat); this.runs.delete(runId); try { emit(held ?? { kind: 'FAILED', summary: 'Art Factory ended without a result.' }); } catch { /* run closed */ } });
  }

  async execute(task, runId, asset, entry, emit) {
    const stop = () => { if (entry.cancelled) throw Error('cancelled'); };
    const name = `${task.id.slice(0, 8)}-${runId.replace(/[^0-9a-f]/gi, '').slice(0, 6)}`, branch = `hq/asset/${name}`;
    const dir = path.join(this.worktreeRoot, `asset-${name}`), evidenceDir = path.join(this.worktreeRoot, `asset-${name}-evidence`);
    emit({ kind: 'ACK', summary: `HQ Art Factory started run ${runId.slice(0, 8)}: recipe ${asset.recipe} at ${asset.scale}x.`, pid: process.pid });
    const base = (await this.git(['rev-parse', '--verify', `${this.base}^{commit}`])).trim();
    fs.mkdirSync(this.worktreeRoot, { recursive: true });
    await this.git(['worktree', 'add', '-q', '-b', branch, dir, base]); stop();
    const where = { branch, base, baseRef: this.base, worktree: dir };
    emit({ kind: 'PROGRESS', summary: `Worktree ${branch} created from ${this.base} (${base.slice(0, 10)}).` });
    // The recipe must be allowlisted in the committed recipes.json; agent and theme come from it, never from the task.
    const recipes = JSON.parse(fs.readFileSync(path.join(dir, FACTORY, 'recipes.json'), 'utf8')).recipes ?? {};
    const r = Object.hasOwn(recipes, asset.recipe) ? recipes[asset.recipe] : null;
    if (!r) { emit({ kind: 'BLOCKED', summary: `Recipe "${asset.recipe}" is not allowlisted in ${FACTORY}/recipes.json at ${base.slice(0, 10)}. Nothing produced.`, asset: where }); return; }
    if (!/^[a-z0-9-]{1,40}$/.test(r.agent) || !/^[a-z0-9-]{1,40}$/.test(r.theme)) { emit({ kind: 'BLOCKED', summary: 'Recipe agent/theme are not plain ids. Nothing produced.', asset: where }); return; }
    const outRel = `${ASSET_ROOT}/${r.agent}/${r.theme}/x${asset.scale}`, outDir = path.join(dir, outRel);
    const py = [path.join(dir, FACTORY, 'factory.py'), '--recipe', asset.recipe, '--scale', String(asset.scale)];
    const opts = { signal: entry.abort.signal, timeout: this.factoryTimeoutMs, cwd: path.join(dir, FACTORY), env: this.childEnv() };
    // 2. Render (evidence, raw frames and the contact sheet stay outside the repository).
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    emit({ kind: 'PROGRESS', summary: `Rendering ${asset.recipe} with headless Blender (run 1 of 2).` });
    const t0 = Date.now();
    const run1 = await this.exec(this.python, [...py, '--out', outDir, '--evidence', path.join(evidenceDir, 'run1')], opts); stop();
    const report = JSON.parse(run1.split('\n').find(l => l.startsWith('HQ-ART '))?.slice(7) ?? 'null');
    if (!report) throw Error('factory printed no HQ-ART report');
    // 3. Determinism: a second, independent render must produce the same bytes.
    emit({ kind: 'PROGRESS', summary: `Run 1 done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${report.renders} renders). Rendering again to prove determinism.` });
    const again = path.join(evidenceDir, 'run2-out');
    await this.exec(this.python, [...py, '--out', again, '--evidence', path.join(evidenceDir, 'run2')], opts); stop();
    const files = ['sheet.png', 'sheet.json'];
    const run1Sha = Object.fromEntries(files.map(f => [f, sha256(path.join(outDir, f))])), run2Sha = Object.fromEntries(files.map(f => [f, sha256(path.join(again, f))]));
    const determinism = { identical: files.every(f => run1Sha[f] === run2Sha[f]), run1: run1Sha, run2: run2Sha };
    if (!determinism.identical) { emit({ kind: 'BLOCKED', summary: `Not deterministic: two renders differ (${files.filter(f => run1Sha[f] !== run2Sha[f]).join(', ')}). Nothing committed; worktree kept at ${dir}.`, asset: { ...where, determinism } }); return; }
    // 4. Sheet checks.
    let check;
    try { check = JSON.parse((await this.exec(this.python, [path.join(dir, FACTORY, 'verify.py'), outDir, '--expect-scale', String(asset.scale)], opts)).split('\n').find(l => l.startsWith('HQ-ART-VERIFY '))?.slice(14)); }
    catch (error) { check = JSON.parse(String(error.stdout ?? '').split('\n').find(l => l.startsWith('HQ-ART-VERIFY '))?.slice(14) ?? '{"ok":false}'); }
    stop();
    if (!check?.ok) { emit({ kind: 'BLOCKED', summary: `Sheet checks failed: ${Object.entries(check?.checks ?? {}).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'no report'}. Nothing committed; worktree kept at ${dir}.`, asset: { ...where, check } }); return; }
    emit({ kind: 'PROGRESS', summary: `Deterministic (sheet ${run1Sha['sheet.png'].slice(0, 12)} twice); sheet checks passed (${Object.keys(check.checks).length}).` });
    // 5. World tests in the asset worktree (they include the authored loader reading this sheet).
    const tests = fs.readdirSync(path.join(dir, WORLD_TESTS)).filter(f => f.endsWith('.test.mjs')).sort().map(f => `${WORLD_TESTS}/${f}`);
    emit({ kind: 'TEST_STARTED', summary: `HQ running the World tests (${tests.length} files) in the asset worktree.` });
    let testOut = '', failedRun = false;
    try { testOut = await this.exec(this.nodeBin, ['--test', '--test-reporter=spec', ...tests], { signal: entry.abort.signal, timeout: 10 * 60_000, cwd: dir, env: { ...this.childEnv(), HILLINK_WORLD_ASSET_CHECK: outRel } }); }
    catch (error) { testOut = `${error.stdout ?? ''}\n${error.stderr ?? ''}`; failedRun = true; }
    stop();
    const counts = testCounts(testOut);
    const green = !failedRun && counts.passed > 0 && counts.failed === 0;
    emit({ kind: 'TEST_RESULT', result: green ? 'passed' : 'failed', summary: `World tests: ${counts.passed ?? 0} passed, ${counts.failed ?? '?'} failed.` });
    if (!green) { emit({ kind: 'BLOCKED', summary: `World tests failed in the asset worktree (${counts.passed ?? 0} passed, ${counts.failed ?? '?'} failed). Nothing committed; worktree kept at ${dir}.`, asset: { ...where, testOutput: testOut.slice(-1500) } }); return; }
    // 6. Commit only the generated files.
    const changed = changedFiles(await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], dir));
    const expected = files.map(f => `${outRel}/${f}`).sort();
    const outside = changed.filter(f => !expected.includes(f));
    if (outside.length || !changed.length) { emit({ kind: 'BLOCKED', summary: `Unexpected changes in the asset worktree: ${outside.join(', ') || 'none'}. Nothing committed.`, asset: { ...where, changed } }); return; }
    await this.git(['add', '--', ...changed], dir);
    const subject = `Art Factory: ${r.agent}/${r.theme} sheet from ${asset.recipe} at ${asset.scale}x${r.standIn ? ' (STAND-IN, not shipping art)' : ''}`;
    await this.git(['-c', 'user.name=Hillink HQ', '-c', 'user.email=hq@hillink.local', 'commit', '-q', '--no-verify', '-m', subject, '-m', `HQ-Task: ${task.id}\nHQ-Asset: ${asset.recipe}@${asset.scale}x\nInput-Sha256: ${r.input.sha256}\nSheet-Sha256: ${run1Sha['sheet.png']}\nVerified-By: HQ (two identical renders; verify.py ${Object.keys(check.checks).length} checks; World tests ${counts.passed} passed, 0 failed)\nStatus: ${r.status}${r.standIn ? ' (stand-in)' : ''}`], dir);
    const sha = (await this.git(['rev-parse', 'HEAD'], dir)).trim();
    emit({ kind: 'COMMIT', summary: `Committed ${sha.slice(0, 10)} on ${branch} (local only: not pushed, not merged).`, sha });
    emit({ kind: 'COMPLETED', summary: `Sheet for ${r.agent}/${r.theme} committed on ${branch} (${sha.slice(0, 10)}); deterministic, checked, World tests ${counts.passed} passed.`,
      asset: { ...where, commit: sha, recipe: asset.recipe, scale: asset.scale, agent: r.agent, theme: r.theme, status: r.status, standIn: r.standIn === true, outDir: outRel, files: changed, sheetSha256: run1Sha['sheet.png'], input: r.input, clips: report.clips, determinism, check, worldTests: { files: tests, passed: counts.passed, failed: 0 }, evidenceDir, factory: { renders: report.renders, seconds: report.seconds, blender: report.blender, engine: report.engine } } });
  }
  async cancel(runId) {
    const entry = this.runs.get(runId);
    if (!entry) return false;
    entry.cancelled = true; entry.abort.abort();
    await entry.done;
    return true;
  }
  async close() { await Promise.all([...this.runs.keys()].map(id => this.cancel(id))); }
}

// local-checks serves HQ's allowlisted Node checks and, when configured, the Art Factory. One adapter id, so routing,
// compute class (LOCAL) and the hq-verifier agent stay as they are; dispatch is by operation only.
export class LocalChecksRouter {
  constructor(local, art) { Object.assign(this, { local, art, owner: new Map() }); }
  health() { return this.local.health(); }
  async start(args) {
    const target = args.task.operation === 'produce-asset' ? this.art : this.local;
    this.owner.set(args.runId, target);
    return target.start(args);
  }
  async cancel(runId) { const t = this.owner.get(runId); if (t) return t.cancel(runId); return (await this.local.cancel(runId)) || (await this.art.cancel(runId)); }
  async close() { await Promise.allSettled([this.local.close(), this.art.close()]); }
}
