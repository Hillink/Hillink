// Pass 3 final deterministic verification, by HQ itself. It trusts no agent claim and no handoff field: every
// check re-derives the fact from git (hardened: no hooks, no fsmonitor) or from HQ's own runner evidence.
// Claude-written code is never executed here; tests ran inside the sandbox, and this checks their HQ evidence.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inScope } from '../implementation-policy.mjs';

export class CommitVerifier {
  constructor({ repoRoot, execFileImpl = execFile, requireSandbox = true } = {}) { Object.assign(this, { repoRoot, execFileImpl, requireSandbox }); }
  git(args) {
    const noHooks = this.noHooks ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hq-verify-hooks-'));
    return new Promise((resolve, reject) => this.execFileImpl('git', ['-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', ...args], { cwd: this.repoRoot, windowsHide: true, maxBuffer: 16e6, timeout: 60_000 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout)))));
  }
  // task: the implement-repo task (HQ state); handoff: HQ's implementation handoff built from that task.
  async verify(task, handoff) {
    const checks = [];
    const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '').slice(0, 300) }); return ok; };
    const run = task.evidence;
    const sha = handoff?.commit;
    if (!check('handoff built by HQ from its own evidence', handoff?.source === 'hq-evidence', handoff?.source)) return { ok: false, checks };
    if (!check('commit id is a full hex sha', /^[0-9a-f]{40}$/.test(sha ?? ''), sha)) return { ok: false, checks };
    let branchHead = null, parent = null, files = [], message = '';
    try {
      branchHead = (await this.git(['rev-parse', '--verify', `refs/heads/${handoff.branch}^{commit}`])).trim();
      parent = (await this.git(['rev-parse', '--verify', `${sha}^1`])).trim();
      files = (await this.git(['diff', '--name-only', '-z', '--no-renames', `${sha}^1`, sha])).split('\0').filter(Boolean).sort();
      message = await this.git(['log', '-1', '--format=%B', sha]);
    } catch (error) { check('commit exists in the repository', false, error.message); return { ok: false, checks }; }
    check('commit exists and is the head of the task branch', branchHead === sha, `${handoff.branch} -> ${branchHead}`);
    check('commit sits directly on the recorded base', parent === handoff.base, `parent ${parent}, base ${handoff.base}`);
    check('commit is the one HQ reported (COMMIT evidence)', run.some(e => e.kind === 'COMMIT' && e.sha === sha), sha);
    check('commit message carries this task id', message.includes(`HQ-Task: ${task.id}`), 'HQ-Task trailer');
    check('every changed file is inside the approved scope', files.length > 0 && files.every(f => inScope(f, task.implementation.scope)), files.join(', '));
    check('git\'s changed files match the runner\'s evidence', JSON.stringify(files) === JSON.stringify([...handoff.filesChanged].sort()), `${files.length} vs ${handoff.filesChanged.length}`);
    check('every acceptance test file is in the committed tree', await this.present(sha, task.implementation.tests), task.implementation.tests.join(', '));
    const result = run.filter(e => e.kind === 'TEST_RESULT').at(-1), started = run.some(e => e.kind === 'TEST_STARTED');
    check('HQ ran the tests (TEST_STARTED then TEST_RESULT from the runner)', started && result?.result === 'passed', result?.summary);
    check('tests passed with at least one test and none failing', handoff.results.passed > 0 && handoff.results.failed === 0, `${handoff.results.passed} passed, ${handoff.results.failed} failed`);
    if (this.requireSandbox) check('the sandbox was confirmed destroyed', handoff.sandbox?.destroyed === true, handoff.sandbox?.name);
    return { ok: checks.every(c => c.ok), checks, files };
  }
  async present(sha, tests) {
    try { const listed = (await this.git(['ls-tree', '-r', '--name-only', '-z', sha, '--', ...tests])).split('\0').filter(Boolean); return tests.every(t => listed.includes(t)); }
    catch { return false; }
  }
}
