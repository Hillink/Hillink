// Art Factory Step 1: HQ's deterministic verification of an asset commit. Like CommitVerifier it trusts no field of
// the handoff it can re-derive: the commit, its parent, its files, the sheet bytes and the metadata come from git.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ASSET_DIR = /^tools\/hillink-world\/assets\/characters\/[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}\/x[1-4]$/;

export class AssetVerifier {
  constructor({ repoRoot, execFileImpl = execFile } = {}) { Object.assign(this, { repoRoot, execFileImpl }); }
  git(args, { buffer = false } = {}) {
    const noHooks = this.noHooks ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hq-verify-hooks-'));
    return new Promise((resolve, reject) => this.execFileImpl('git', ['-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', ...args], { cwd: this.repoRoot, windowsHide: true, maxBuffer: 64e6, timeout: 60_000, encoding: buffer ? 'buffer' : 'utf8' }, (error, stdout) => (error ? reject(error) : resolve(buffer ? stdout : String(stdout)))));
  }
  async verify(task, handoff) {
    const checks = [];
    const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '').slice(0, 300) }); return ok; };
    const run = task.evidence;
    const sha = handoff?.commit;
    if (!check('handoff built by HQ from its own evidence', handoff?.source === 'hq-evidence' && handoff?.kind === 'asset', handoff?.source)) return { ok: false, checks };
    if (!check('commit id is a full hex sha', /^[0-9a-f]{40}$/.test(sha ?? ''), sha)) return { ok: false, checks };
    if (!check('asset folder is a character sheet folder', ASSET_DIR.test(handoff.outDir ?? ''), handoff.outDir)) return { ok: false, checks };
    let branchHead, parent, files, message, png, meta;
    try {
      branchHead = (await this.git(['rev-parse', '--verify', `refs/heads/${handoff.branch}^{commit}`])).trim();
      parent = (await this.git(['rev-parse', '--verify', `${sha}^1`])).trim();
      files = (await this.git(['diff', '--name-only', '-z', '--no-renames', `${sha}^1`, sha])).split('\0').filter(Boolean).sort();
      message = await this.git(['log', '-1', '--format=%B', sha]);
      png = await this.git(['show', `${sha}:${handoff.outDir}/sheet.png`], { buffer: true });
      meta = JSON.parse(await this.git(['show', `${sha}:${handoff.outDir}/sheet.json`]));
    } catch (error) { check('commit and sheet exist in the repository', false, error.message); return { ok: false, checks }; }
    check('commit exists and is the head of the task branch', branchHead === sha, `${handoff.branch} -> ${branchHead}`);
    check('commit sits directly on the recorded base', parent === handoff.base, `parent ${parent}, base ${handoff.base}`);
    check('commit is the one HQ reported (COMMIT evidence)', run.some(e => e.kind === 'COMMIT' && e.sha === sha), sha);
    check('commit message carries this task id', message.includes(`HQ-Task: ${task.id}`), 'HQ-Task trailer');
    check('the commit changes only sheet.png and sheet.json in the asset folder', JSON.stringify(files) === JSON.stringify([`${handoff.outDir}/sheet.json`, `${handoff.outDir}/sheet.png`]), files.join(', '));
    const pngSha = crypto.createHash('sha256').update(png).digest('hex');
    check('committed sheet.png matches the sha256 in sheet.json', meta?.sheet?.sha256 === pngSha, pngSha.slice(0, 16));
    check('committed sheet.png is the one both renders produced', pngSha === handoff.determinism?.run1?.['sheet.png'] && pngSha === handoff.determinism?.run2?.['sheet.png'], handoff.determinism?.identical);
    check('metadata is a v1 hillink.character-sheet for the recipe\'s agent and theme', meta?.v === 1 && meta?.kind === 'hillink.character-sheet' && meta.agent === handoff.agent && meta.theme === handoff.theme && meta.scale === handoff.scale && `${handoff.agent}/${handoff.theme}/x${handoff.scale}` === handoff.outDir.split('/').slice(-3).join('/'), `${meta?.agent}/${meta?.theme} x${meta?.scale}`);
    check('a stand-in stays a candidate (never approved art)', !meta?.standIn || meta.status === 'candidate', `${meta?.status}${meta?.standIn ? ' stand-in' : ''}`);
    check('the sheet checks passed', handoff.check?.ok === true && Object.values(handoff.check?.checks ?? {}).every(Boolean), Object.keys(handoff.check?.checks ?? {}).join(', '));
    const result = run.filter(e => e.kind === 'TEST_RESULT').at(-1), started = run.some(e => e.kind === 'TEST_STARTED');
    check('HQ ran the World tests (TEST_STARTED then TEST_RESULT)', started && result?.result === 'passed', result?.summary);
    check('World tests passed with at least one test and none failing', handoff.results.passed > 0 && handoff.results.failed === 0, `${handoff.results.passed} passed, ${handoff.results.failed} failed`);
    return { ok: checks.every(c => c.ok), checks, files };
  }
  diff(sha) { return this.git(['show', '--no-color', '--stat', '--format=%H%n%s%n%n%b', sha]); }
}
