// Reviewer access to an implementation commit. Implementation commits live in isolated task worktrees a read-only
// reviewer cannot (and must not) reach, so a reviewer launched in the live checkout only ever saw HQ's clipped diff.
// HQ instead materializes the exact HQ-verified commit, by SHA, from the repository's object database into a fresh
// directory the reviewer is launched in: every file of that commit as git stores it (no worktree, no .git link, no
// checkout filters or attributes, symlinks and submodules never followed), plus the full diff against its base. The
// files are re-hashed from disk and must equal the commit's blob ids, then made read-only; the directory is removed
// when the review ends. Nothing is read from any worktree, so a later edit there can never be what gets reviewed.
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
export const REVIEW_META_DIR = '.hq-review';
export const REVIEW_SNAPSHOT_EVIDENCE = 'hq-review-snapshot';
// A blob above this size (videos, build caches committed by mistake) is listed in the manifest, not written, unless the
// commit changed it; a changed file is always written up to the larger cap. Reviewable source is far below both.
export const SNAPSHOT_LIMITS = Object.freeze({ maxFileBytes: 2_000_000, maxChangedFileBytes: 32_000_000, maxTotalBytes: 400_000_000, maxFiles: 50_000, maxDiffBytes: 64_000_000 });
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)(\..*)?$/i;

// The only shape HQ accepts for "review this commit". Anything else fails closed.
export function validReviewSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('Review source must be an object');
  const { commit, base, branch = null } = source;
  if (!SHA.test(String(commit ?? ''))) throw Error('Review source commit must be a full 40-character lowercase hex sha');
  if (!SHA.test(String(base ?? ''))) throw Error('Review source base must be a full 40-character lowercase hex sha');
  if (commit === base) throw Error('Review source commit equals its base; there is no change to review');
  if (branch != null && (typeof branch !== 'string' || !/^[A-Za-z0-9._\/-]{1,200}$/.test(branch) || branch.includes('..'))) throw Error('Review source branch is not a valid branch name');
  return { commit, base, branch };
}

// A repository path HQ will write under the snapshot root, as path segments. Refuses anything that could escape the
// directory or alias another file on Windows; the commit then fails closed rather than being reviewed partially.
export function safeSegments(p) {
  if (typeof p !== 'string' || !p || p.length > 4096 || p.startsWith('/') || /[\\:\0]/.test(p)) throw Error(`Unsafe path in commit: ${JSON.stringify(String(p).slice(0, 200))}`);
  const parts = p.split('/');
  for (const s of parts) {
    if (!s || s === '.' || s === '..' || /[<>"|?*\x01-\x1f]/.test(s) || /[. ]$/.test(s) || WINDOWS_RESERVED.test(s) || s.toLowerCase() === '.git') throw Error(`Unsafe path in commit: ${JSON.stringify(p.slice(0, 200))}`);
  }
  if (parts[0].toLowerCase() === REVIEW_META_DIR) throw Error(`The commit contains ${REVIEW_META_DIR}/, which HQ reserves for review evidence`);
  return parts;
}

const blobId = data => createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
const abortError = signal => Object.assign(Error(`Snapshot preparation stopped: ${signal.reason?.message ?? 'aborted'}`), { aborted: true });

export class ReviewSnapshots {
  constructor({ repoRoot, root = path.join(os.homedir(), '.hillink-hq', 'review-snapshots'), limits = {}, staleMs = 2 * 60 * 60_000, now = Date.now, execFileImpl = execFile, spawnImpl = spawn } = {}) {
    if (!repoRoot) throw Error('ReviewSnapshots needs the repository root');
    Object.assign(this, { repoRoot: path.resolve(repoRoot), root: path.resolve(root), limits: { ...SNAPSHOT_LIMITS, ...limits }, staleMs, now, execFileImpl, spawnImpl });
    const rel = path.relative(this.repoRoot, this.root);
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw Error('The review snapshot root must be outside the repository checkout');
  }
  hardening() {
    this.noHooks ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hq-review-hooks-'));
    return ['-c', `core.hooksPath=${this.noHooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];
  }
  git(args, { signal, encoding = 'utf8', maxBuffer = 16e6 } = {}) {
    return new Promise((resolve, reject) => this.execFileImpl('git', [...this.hardening(), ...args], { cwd: this.repoRoot, windowsHide: true, maxBuffer, timeout: 120_000, encoding, signal }, (error, stdout) => (error ? reject(error) : resolve(stdout))));
  }
  // Raw blob contents, in request order, from one `git cat-file --batch` (no filters, no textconv, no attributes).
  async *blobs(oids, signal) {
    const child = this.spawnImpl('git', [...this.hardening(), 'cat-file', '--batch'], { cwd: this.repoRoot, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let stderr = '';
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-500); });
    const closed = new Promise(resolve => child.once('close', code => resolve(code)));
    child.once('error', () => {});
    child.stdin.on('error', () => {});
    child.stdin.end(oids.map(o => `${o}\n`).join(''));
    // Each record is "<oid> blob <size>\n<content>\n". A large blob's chunks are collected, then joined once.
    let header = Buffer.alloc(0), body = null, index = 0;
    try {
      for await (let chunk of child.stdout) {
        while (chunk.length && index < oids.length) {
          if (!body) {
            header = Buffer.concat([header, chunk]); chunk = Buffer.alloc(0);
            const nl = header.indexOf(10);
            if (nl < 0) { if (header.length > 200) throw Error('git cat-file returned an oversized record header'); break; }
            const [oid, type, size] = header.subarray(0, nl).toString().split(' ');
            if (oid !== oids[index] || type !== 'blob' || !/^\d+$/.test(size ?? '')) throw Error(`git cat-file returned an unexpected record for ${oids[index]}`);
            body = { n: Number(size), parts: [], got: 0 };
            chunk = header.subarray(nl + 1); header = Buffer.alloc(0);
            continue;
          }
          const take = Math.min(chunk.length, body.n + 1 - body.got);
          body.parts.push(chunk.subarray(0, take)); body.got += take; chunk = chunk.subarray(take);
          if (body.got === body.n + 1) {
            const data = Buffer.concat(body.parts, body.n + 1);
            if (data[body.n] !== 10) throw Error(`git cat-file record for ${oids[index]} is not terminated`);
            body = null; index += 1;
            yield data.subarray(0, data.length - 1);
          }
        }
        if (signal?.aborted) throw abortError(signal);
      }
    } finally { try { child.kill(); } catch { /* gone */ } }
    if (index !== oids.length) throw Error(`git cat-file ended after ${index} of ${oids.length} blobs (exit ${await closed}): ${stderr.trim()}`);
  }

  // Materializes `source` (validReviewSource) and returns what was made available. On any failure nothing is left behind.
  async create(source, { label = 'review', signal } = {}) {
    const { commit, base, branch } = validReviewSource(source);
    const check = () => { if (signal?.aborted) throw abortError(signal); };
    // The commit must exist as exactly this object, and sit directly on the base HQ recorded and verified.
    const resolved = (await this.git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], { signal }).catch(() => '')).trim();
    if (resolved !== commit) throw Error(`Commit ${commit} does not exist in the repository`);
    const parent = (await this.git(['rev-parse', '--verify', '--quiet', `${commit}^1`], { signal }).catch(() => '')).trim();
    if (parent !== base) throw Error(`Commit ${commit.slice(0, 12)} does not sit directly on base ${base.slice(0, 12)} (parent ${parent.slice(0, 12) || 'none'})`);
    const tree = (await this.git(['rev-parse', '--verify', `${commit}^{tree}`], { signal })).trim();
    const changed = new Set((await this.git(['diff-tree', '-r', '-z', '--no-renames', '--name-only', '--no-commit-id', base, commit], { signal })).split('\0').filter(Boolean));
    const listing = await this.git(['ls-tree', '-r', '-z', '-l', '--full-tree', commit], { signal, maxBuffer: 64e6 });
    const entries = [];
    for (const record of listing.split('\0').filter(Boolean)) {
      const tab = record.indexOf('\t');
      const [mode, type, oid, size] = record.slice(0, tab).trim().split(/\s+/);
      entries.push({ mode, type, oid, size: size === '-' ? null : Number(size), path: record.slice(tab + 1) });
    }
    if (entries.length > this.limits.maxFiles) throw Error(`Commit has ${entries.length} entries, above the snapshot limit of ${this.limits.maxFiles}`);
    const seen = new Set();
    for (const e of entries) {
      e.segments = safeSegments(e.path);
      const key = e.path.toLowerCase(); // a case-insensitive filesystem would merge these: refuse rather than guess
      if (seen.has(key)) throw Error(`Commit has two paths that differ only by case: ${e.path.slice(0, 200)}`);
      seen.add(key);
    }
    const write = [], omitted = [], symlinks = [], submodules = [];
    let total = 0;
    for (const e of entries) {
      if (e.type === 'commit') { submodules.push({ path: e.path, commit: e.oid }); continue; }
      if (e.type !== 'blob' || !/^[0-9a-f]{40}$/.test(e.oid)) throw Error(`Unexpected tree entry ${e.type} at ${e.path.slice(0, 200)}`);
      if (e.mode === '120000') { symlinks.push({ path: e.path, oid: e.oid }); continue; } // never created, so never followed
      if (!['100644', '100755'].includes(e.mode)) throw Error(`Unexpected file mode ${e.mode} at ${e.path.slice(0, 200)}`);
      const cap = changed.has(e.path) ? this.limits.maxChangedFileBytes : this.limits.maxFileBytes;
      if (e.size > cap) { omitted.push({ path: e.path, oid: e.oid, size: e.size, changed: changed.has(e.path) }); continue; }
      total += e.size;
      write.push(e);
    }
    if (total > this.limits.maxTotalBytes) throw Error(`Snapshot would be ${total} bytes, above the limit of ${this.limits.maxTotalBytes}`);
    const diff = await this.git(['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--full-index', '--no-renames', base, commit], { signal, maxBuffer: this.limits.maxDiffBytes });
    check();

    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const dir = path.join(this.root, `${String(label).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'review'}-${commit.slice(0, 12)}-${randomBytes(4).toString('hex')}`);
    fs.mkdirSync(dir, { mode: 0o700 }); // fails if it exists: a snapshot directory is never reused
    try {
      const target = e => {
        const full = path.join(dir, ...e.segments), rel = path.relative(dir, full);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error(`Path escapes the snapshot: ${e.path.slice(0, 200)}`);
        return full;
      };
      let i = 0;
      for await (const data of this.blobs(write.map(e => e.oid), signal)) {
        const e = write[i++], full = target(e);
        fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
        fs.writeFileSync(full, data, { flag: 'wx', mode: 0o600 }); // wx: never overwrite, never follow an existing link
      }
      check();
      // Proof the directory holds exactly the commit: every file read back from disk hashes to its blob id in the commit.
      for (const e of write) {
        const full = target(e), st = fs.lstatSync(full);
        if (!st.isFile() || blobId(fs.readFileSync(full)) !== e.oid) throw Error(`Snapshot file ${e.path.slice(0, 200)} does not match blob ${e.oid}`);
      }
      const meta = path.join(dir, REVIEW_META_DIR);
      fs.mkdirSync(meta, { mode: 0o700 });
      const manifest = { source: REVIEW_SNAPSHOT_EVIDENCE, commit, base, branch, tree, files: write.length, bytes: total, changedFiles: [...changed].sort(), omittedLargeFiles: omitted, symlinksNotCreated: symlinks, submodulesNotIncluded: submodules, diff: `${REVIEW_META_DIR}/diff.patch`, createdAt: new Date(this.now()).toISOString(), note: 'Read-only snapshot of exactly this commit, written by HQ from the git object database and re-hashed against its blob ids. It is not a worktree and has no link to one.' };
      fs.writeFileSync(path.join(meta, 'diff.patch'), diff, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(meta, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
      setReadOnly(dir);
      check();
      return { dir, commit, base, branch, tree, files: write.length, bytes: total, diffBytes: Buffer.byteLength(diff), changedFiles: manifest.changedFiles, omitted: omitted.length, symlinks: symlinks.length, submodules: submodules.length };
    } catch (error) {
      await this.remove(dir).catch(() => {});
      throw error;
    }
  }
  // Removes one snapshot. Only a direct child of the snapshot root is ever removed (never a path HQ did not create).
  async remove(dir) {
    const full = path.resolve(dir);
    if (path.dirname(full) !== this.root) throw Error('Refusing to remove a path outside the review snapshot root');
    if (!fs.existsSync(full)) return true;
    setWritable(full);
    await fs.promises.rm(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return !fs.existsSync(full);
  }
  // At start: snapshots left by a crashed HQ (older than staleMs, longer than any review may run) are removed.
  async sweep() {
    let names = [];
    try { names = fs.readdirSync(this.root); } catch { return []; }
    const removed = [];
    for (const name of names) {
      const full = path.join(this.root, name);
      try {
        const st = fs.lstatSync(full);
        if (st.isDirectory() && this.now() - st.mtimeMs > this.staleMs && await this.remove(full)) removed.push(name);
      } catch { /* left for the next sweep */ }
    }
    return removed;
  }
}

function walk(dir, visit) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full, visit);
    visit(full, d);
  }
}
// Files 0444, directories 0555 (on Windows: the read-only attribute on files). Bottom-up, root last.
function setReadOnly(dir) {
  walk(dir, (full, d) => { if (d.isDirectory()) fs.chmodSync(full, 0o555); else if (d.isFile()) fs.chmodSync(full, 0o444); });
  fs.chmodSync(dir, 0o555);
}
function setWritable(dir) {
  try { fs.chmodSync(dir, 0o700); } catch { /* rm reports it */ }
  const fix = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, e.name); try { fs.chmodSync(full, e.isDirectory() ? 0o700 : 0o600); } catch { /* rm reports it */ } if (e.isDirectory()) fix(full); } };
  try { fix(dir); } catch { /* rm reports it */ }
}
