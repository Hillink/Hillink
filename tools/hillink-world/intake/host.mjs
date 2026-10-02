// Host-side intake operations on disk: stage a local ZIP into an out-of-repo
// quarantine (named by SHA-256, read-only, never overwritten) and extract only
// allowlisted members from a hash-verified archive into a NEW directory.
// Only node:fs/path/os/crypto are used: no network, no child processes, nothing
// from the archive is ever executed. Source files are only ever read.
//
// Every function takes an optional `fs` (default: node:fs). Production always uses
// the real node:fs; the tests pass an in-memory fs only when the environment
// forbids touching disk (HQ's sandbox), and use real temp folders otherwise.

import nodeFs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { inspectZip, readMember, DEFAULT_LIMITS } from './zip.mjs';
import { validateManifest, crossCheckManifest, SHA256_RE } from './manifest.mjs';

export const QUARANTINE_ENV = 'HILLINK_INTAKE_QUARANTINE';
export const RECEIPT_NAME = '_intake-receipt.json';

export class IntakeError extends Error {
  constructor(message, details = []) {
    super(details.length ? `${message}:\n  - ${details.join('\n  - ')}` : message);
    this.name = 'IntakeError';
    this.details = details;
  }
}

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';
const fold = (p) => (CASE_INSENSITIVE_FS ? p.toLowerCase() : p);

/** True when `child` is `parent` or lies inside it (case-insensitive on Windows/macOS). */
export function isInside(child, parent) {
  const rel = path.relative(fold(path.resolve(parent)), fold(path.resolve(child)));
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/** Resolve symlinks/junctions/8.3 names through the nearest existing ancestor. */
export function realResolve(p, fs = nodeFs) {
  let cur = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    rest.unshift(path.basename(cur));
    cur = parent;
  }
  let base = cur;
  try { base = fs.realpathSync.native(cur); } catch { /* keep the resolved path */ }
  return path.join(base, ...rest);
}

/** Nearest ancestor (including p) that contains a .git directory OR .git file (worktrees). */
export function findGitRoot(p, fs = nodeFs) {
  let cur = path.resolve(p);
  for (;;) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function expandHome(p, homedir = os.homedir()) {
  if (p === '~') return homedir;
  if (/^~[\\/]/.test(p)) return path.join(homedir, p.slice(2));
  if (p.startsWith('~')) throw new IntakeError(`unsupported "~user" path: ${p}`);
  return p;
}

/** Quarantine directory: explicit option > $HILLINK_INTAKE_QUARANTINE > ~/.hillink/intake-quarantine. */
export function resolveQuarantineDir({ quarantine, env = process.env, homedir = os.homedir() } = {}) {
  let raw = quarantine;
  if (raw === undefined && env && Object.prototype.hasOwnProperty.call(env, QUARANTINE_ENV)) raw = env[QUARANTINE_ENV];
  if (raw === undefined) raw = path.join(homedir, '.hillink', 'intake-quarantine');
  if (typeof raw !== 'string' || raw.trim() === '') throw new IntakeError('quarantine path is empty');
  const expanded = expandHome(raw.trim(), homedir);
  if (!path.isAbsolute(expanded)) throw new IntakeError(`quarantine path must be absolute or start with ~: ${raw}`);
  return path.resolve(expanded);
}

/** Refuse a quarantine path that lies inside the given repo or inside any git checkout. */
export function assertOutsideRepo(target, { repoRoot, detectGitAncestors = true, fs = nodeFs } = {}) {
  const real = realResolve(target, fs);
  const roots = [];
  if (repoRoot) roots.push(path.resolve(repoRoot), realResolve(repoRoot, fs));
  if (detectGitAncestors) {
    const g = findGitRoot(real, fs);
    if (g) roots.push(g);
  }
  for (const r of roots) {
    if (isInside(real, r) || isInside(path.resolve(target), r)) throw new IntakeError(`quarantine path ${real} is inside the repository ${r}; choose a location outside any repo (set ${QUARANTINE_ENV})`);
  }
  return real;
}

function readRegularFile(fs, p, maxBytes, what) {
  let st;
  try { st = fs.lstatSync(p); } catch (err) { throw new IntakeError(`${what} not readable: ${p} (${err.code || err.message})`); }
  if (st.isSymbolicLink()) throw new IntakeError(`${what} is a symbolic link; refusing: ${p}`);
  if (!st.isFile()) throw new IntakeError(`${what} is not a regular file: ${p}`);
  if (st.size > maxBytes) throw new IntakeError(`${what} is ${st.size} bytes (limit ${maxBytes}): ${p}`);
  const buf = fs.readFileSync(p);
  if (buf.length !== st.size) throw new IntakeError(`${what} changed while being read: ${p}`);
  return buf;
}

function requireValidManifest(manifest) {
  const v = validateManifest(manifest);
  if (!v.ok) throw new IntakeError('manifest is invalid', v.errors);
}

/**
 * Copy a local ZIP into the quarantine as <sha256>.zip, read-only.
 * Inspects the ZIP first (fail closed). If a manifest is given it must validate
 * and match the file's name, size, hash and members. An identical file already
 * in quarantine is reported as already staged; any different file is a conflict.
 */
export function stageZip(srcPath, opts = {}) {
  const fs = opts.fs || nodeFs;
  const limits = { ...DEFAULT_LIMITS, ...(opts.limits || {}) };
  const qdir = resolveQuarantineDir(opts);
  assertOutsideRepo(qdir, { ...opts, fs });

  const buf = readRegularFile(fs, path.resolve(srcPath), limits.maxArchiveBytes, 'source ZIP');
  const sha256 = sha256Hex(buf);
  const inspection = inspectZip(buf, limits);
  if (opts.manifest !== undefined) {
    requireValidManifest(opts.manifest);
    const x = crossCheckManifest(opts.manifest, { sha256, byteSize: buf.length, files: inspection.files, filename: path.basename(srcPath) });
    if (!x.ok) throw new IntakeError('manifest does not match the source ZIP', x.errors);
  }

  fs.mkdirSync(qdir, { recursive: true });
  const realQ = assertOutsideRepo(qdir, { ...opts, fs }); // re-check after creation (links/junctions)
  const dest = path.join(realQ, `${sha256}.zip`);

  let existing = null;
  try { existing = fs.lstatSync(dest); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw new IntakeError(`conflict: ${dest} exists and is not a regular file`);
    const have = fs.readFileSync(dest);
    if (have.length !== buf.length || sha256Hex(have) !== sha256) throw new IntakeError(`conflict: ${dest} exists with different content; refusing to overwrite`);
    fs.chmodSync(dest, 0o444);
    return { status: 'already-staged', path: dest, sha256, byteSize: buf.length, quarantineDir: realQ, members: inspection.files.map((f) => f.name) };
  }

  let fd;
  try {
    fd = fs.openSync(dest, 'wx', 0o600); // exclusive create: never overwrites
  } catch (err) {
    if (err.code === 'EEXIST') throw new IntakeError(`conflict: ${dest} appeared while staging; refusing to overwrite`);
    throw err;
  }
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const check = fs.readFileSync(dest);
    if (sha256Hex(check) !== sha256) throw new IntakeError(`staged copy hash mismatch at ${dest}`);
    fs.chmodSync(dest, 0o444);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { fs.chmodSync(dest, 0o600); fs.unlinkSync(dest); } catch { /* ignore */ }
    throw err;
  }
  return { status: 'staged', path: dest, sha256, byteSize: buf.length, quarantineDir: realQ, members: inspection.files.map((f) => f.name) };
}

/**
 * Extract allowlisted members of a hash-verified archive into a NEW directory.
 * Requires a valid manifest with Kyle's acceptance. Everything is decompressed and
 * verified in memory before the first byte is written; on any failure the output
 * directory created by this call is removed. The archive is never modified.
 */
export function extractZip(archivePath, { manifest, outDir, expectedSha256, limits: limitsIn, fs = nodeFs } = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(limitsIn || {}) };
  if (manifest === undefined) throw new IntakeError('extract requires a manifest');
  requireValidManifest(manifest);
  if (expectedSha256 !== undefined && !(typeof expectedSha256 === 'string' && SHA256_RE.test(expectedSha256))) throw new IntakeError('expected SHA-256 must be 64 lowercase hex characters');
  if (expectedSha256 !== undefined && expectedSha256 !== manifest.sha256) throw new IntakeError('expected SHA-256 differs from the manifest');
  if (typeof outDir !== 'string' || outDir.trim() === '') throw new IntakeError('extract requires an output directory');

  const archive = path.resolve(archivePath);
  const buf = readRegularFile(fs, archive, limits.maxArchiveBytes, 'archive');
  const sha256 = sha256Hex(buf);
  if (sha256 !== manifest.sha256) throw new IntakeError(`archive SHA-256 ${sha256} does not match the approved ${manifest.sha256}`);

  const inspection = inspectZip(buf, limits);
  const outputs = inspection.files.map((f) => {
    const data = readMember(buf, f);
    return { entry: f, data, sha256: sha256Hex(data) };
  });
  const memberSha256 = Object.fromEntries(outputs.map((o) => [o.entry.name, o.sha256]));
  const x = crossCheckManifest(manifest, { sha256, byteSize: buf.length, files: inspection.files, memberSha256 });
  if (!x.ok) throw new IntakeError('manifest does not match the archive', x.errors);

  const out = path.resolve(outDir);
  if (exists(fs, out)) throw new IntakeError(`output directory already exists: ${out}`);
  if (isInside(archive, out)) throw new IntakeError('output directory would contain the archive');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out); // throws EEXIST if something raced us; never reuses a directory

  try {
    const realOut = fs.realpathSync.native(out);
    const records = [];
    for (const o of outputs) {
      const target = path.resolve(realOut, ...o.entry.name.split('/'));
      if (target === realOut || !isInside(target, realOut)) throw new IntakeError(`member escapes the output directory: ${o.entry.name}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!isInside(fs.realpathSync.native(path.dirname(target)), realOut)) throw new IntakeError(`member directory escapes the output directory: ${o.entry.name}`);
      fs.writeFileSync(target, o.data, { flag: 'wx', mode: 0o644 });
      fs.chmodSync(target, 0o644);
      const written = sha256Hex(fs.readFileSync(target));
      if (written !== o.sha256) throw new IntakeError(`written file hash mismatch: ${o.entry.name}`);
      records.push({ name: o.entry.name, bytes: o.data.length, sha256: written });
    }
    const receipt = {
      tool: 'hillink-world/intake',
      archive: { path: archive, sha256, byteSize: buf.length },
      source: { filename: manifest.filename, sourcePageUrl: manifest.sourcePageUrl, downloadUrl: manifest.downloadUrl, author: manifest.author, license: manifest.license, retrievedAt: manifest.retrievedAt },
      kyleAcceptance: manifest.kyleAcceptance,
      outDir: realOut,
      outputs: records,
      skippedDirectoryEntries: [...inspection.directories],
    };
    fs.writeFileSync(path.join(realOut, RECEIPT_NAME), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    return receipt;
  } catch (err) {
    try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* best effort */ }
    throw err;
  }
}

function exists(fs, p) {
  try { fs.lstatSync(p); return true; } catch { return false; }
}
