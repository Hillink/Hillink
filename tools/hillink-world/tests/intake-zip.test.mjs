// ZIP intake: fail-closed central-directory inspection on in-memory archives, plus
// stage/extract/CLI exercised on REAL disk under the OS temp folder.
//
// HQ's sandbox runs node with the permission model and NO writable path, so there
// (and only there) the stage/extract/CLI tests run the identical code against a
// strict in-memory fs instead; each test reports which backend it used. Run
// `node --test tools/hillink-world/tests/intake-zip.test.mjs` on the host to
// exercise real disk (Windows read-only attribute, exclusive create, cleanup...).
import test from 'node:test';
import assert from 'node:assert/strict';
import realFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { inspectZip, readMember, isAllowlistedFile, ZipIntakeError, crc32 } from '../intake/zip.mjs';
import { stageZip, extractZip, resolveQuarantineDir, assertOutsideRepo, isInside, IntakeError, RECEIPT_NAME, findGitRoot } from '../intake/host.mjs';
import { run, parseArgs } from '../intake/cli.mjs';
import { buildZip, samplePack, png } from '../intake/test-zip-builder.mjs';
import { createMemFs } from '../intake/test-memfs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTAKE_DIR = path.join(HERE, '..', 'intake');
const FALLBACK_REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const REPO_ROOT = (() => { try { return findGitRoot(HERE) || FALLBACK_REPO_ROOT; } catch { return FALLBACK_REPO_ROOT; } })();
const perm = process.permission;
const REAL_DISK = !perm || (perm.has('fs.read', os.tmpdir()) && perm.has('fs.write', os.tmpdir()));
// `fs` is the backend for the host tests: real node:fs whenever the temp folder is usable.
const fs = REAL_DISK ? realFs : createMemFs();
const TMP = REAL_DISK ? os.tmpdir() : path.resolve('/memfs-tmp');
const BACKEND = REAL_DISK ? `real disk (${TMP})` : 'in-memory fs (Node permission model forbids disk here)';
const READ_OK = !perm || perm.has('fs.read', INTAKE_DIR);
const diskTest = (name, fn) => test(name, (t) => { t.diagnostic(`backend: ${BACKEND}`); return fn(t); });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const rejects = (entries, re, opts) => {
  const buf = Buffer.isBuffer(entries) ? entries : buildZip(entries, opts);
  assert.throws(() => inspectZip(buf), (err) => {
    assert.ok(err instanceof ZipIntakeError, `expected ZipIntakeError, got ${err}`);
    assert.match(err.message, re);
    return true;
  });
};

// ------------------------------------------------------------------ inspection
test('a well-formed pack inspects cleanly and members read back verified', () => {
  const buf = buildZip(samplePack());
  const ins = inspectZip(buf);
  assert.deepEqual(ins.files.map((f) => f.name), ['pack/tile_0001.png', 'pack/tile_0002.png', 'License.txt']);
  assert.deepEqual(ins.directories, ['pack/']);
  for (const f of ins.files) assert.equal(readMember(buf, f).length, f.uncompressedSize);
  assert.ok(readMember(buf, ins.files[0]).equals(png('a')));
});

test('allowlist: PNG plus license/readme TXT/MD only', () => {
  for (const ok of ['a.png', 'dir/B.PNG', 'LICENSE.txt', 'license.md', 'Licence.txt', 'README.md', 'readme-pack.txt', 'License (CC0).txt'.replace(/[()]/g, '') ]) assert.equal(isAllowlistedFile(ok), true, ok);
  for (const bad of ['a.jpg', 'notes.txt', 'run.exe', 'a.png.exe', 'script.js', 'index.html', 'a.svg', 'dir/', 'LICENSE', 'credits.md']) assert.equal(isAllowlistedFile(bad), false, bad);
  rejects([{ name: 'evil.exe', data: 'MZ' }], /not on the allowlist/);
  rejects([{ name: 'notes.txt', data: 'hi' }], /not on the allowlist/);
});

test('rejects absolute paths, traversal, backslashes, drive paths and unsafe names', () => {
  rejects([{ name: '/etc/x.png', data: png() }], /absolute path/);
  rejects([{ name: '../x.png', data: png() }], /parent traversal/);
  rejects([{ name: 'a/../../x.png', data: png() }], /parent traversal/);
  rejects([{ name: 'a\\x.png', data: png() }], /backslash/);
  rejects([{ name: '..\\x.png', data: png() }], /backslash/);
  rejects([{ name: 'C:/x.png', data: png() }], /drive letter/);
  rejects([{ name: 'C:x.png', data: png() }], /drive letter/);
  rejects([{ name: 'x.png:ads', data: png() }], /colon/);
  rejects([{ name: 'a//x.png', data: png() }], /empty path segment/);
  rejects([{ name: './x.png', data: png() }], /current-directory/);
  rejects([{ name: 'con.png', data: png() }], /reserved device name/);
  rejects([{ name: 'dir./x.png', data: png() }], /ends with a dot or space/);
  rejects([{ name: 'a\u0000.png', data: png() }], /control character/);
  rejects([{ name: 'caf\u00e9.png', data: png() }], /non-ASCII/);
});

test('rejects symlinks, executables, special files and reparse points', () => {
  rejects([{ name: 'link.png', data: 'target', externalAttr: (0o120777 << 16) >>> 0 }], /symbolic link/);
  rejects([{ name: 'x.png', data: png(), externalAttr: (0o100755 << 16) >>> 0 }], /executable/);
  rejects([{ name: 'x.png', data: png(), externalAttr: (0o104644 << 16) >>> 0 }], /setuid/);
  rejects([{ name: 'x.png', data: png(), externalAttr: (0o060644 << 16) >>> 0 }], /special file type/);
  rejects([{ name: 'x.png', data: png(), versionMadeBy: (10 << 8) | 20, externalAttr: 0x400 }], /reparse point/);
  rejects([{ name: 'x.png', data: png(), versionMadeBy: (10 << 8) | 20, externalAttr: 0x10 }], /directory attribute/);
  rejects([{ name: 'x.png', data: png(), versionMadeBy: (6 << 8) | 20 }], /host system/);
  // Windows-made archive with a plain archive attribute is fine.
  assert.equal(inspectZip(buildZip([{ name: 'x.png', data: png(), versionMadeBy: 20, externalAttr: 0x20 }])).files.length, 1);
});

test('rejects encryption, unsupported compression and ZIP64', () => {
  rejects([{ name: 'x.png', data: png(), flags: 0x1 }], /encrypted/);
  rejects([{ name: 'x.png', data: png(), flags: 0x40 }], /encrypted/);
  rejects([{ name: 'x.png', data: png(), localFlags: 0x1 }], /local header marks the member encrypted/);
  rejects([{ name: 'x.png', data: png(), method: 12, compressed: Buffer.from('bz') }], /unsupported compression method 12/);
  rejects([{ name: 'x.png', data: png(), method: 99, compressed: Buffer.from('aes') }], /unsupported compression method 99/);
  const aes = Buffer.alloc(11); aes.writeUInt16LE(0x9901, 0); aes.writeUInt16LE(7, 2);
  rejects([{ name: 'x.png', data: png(), extra: aes }], /encryption extra field/);
  const z64 = Buffer.alloc(4); z64.writeUInt16LE(0x0001, 0);
  rejects([{ name: 'x.png', data: png(), extra: z64 }], /ZIP64/);
  rejects([{ name: 'x.png', data: png() }], /ZIP64/, { eocd: { entriesTotal: 0xffff, entriesDisk: 0xffff } });
  rejects([{ name: 'x.png', data: png(), flags: 0x20 }], /patched/);
});

test('rejects excessive sizes and compression ratios', () => {
  const zeros = Buffer.alloc(2 * 1024 * 1024);
  rejects([{ name: 'bomb.png', data: zeros }], /compression ratio/);
  const buf = buildZip([{ name: 'big.png', data: png() }]);
  assert.throws(() => inspectZip(buf, { maxMemberBytes: 4 }), /exceeds the member limit/);
  assert.throws(() => inspectZip(buildZip([{ name: 'a.png', data: png('a') }, { name: 'b.png', data: png('b') }]), { maxTotalBytes: 30 }), /total uncompressed size/);
  assert.throws(() => inspectZip(buf, { maxArchiveBytes: 10 }), /archive exceeds/);
  assert.throws(() => inspectZip(buildZip([{ name: 'a.png', data: png('a') }, { name: 'b.png', data: png('b') }]), { maxEntries: 1 }), /entries \(limit 1\)/);
  // A member that inflates past its declared size is caught by the output cap on read.
  const lying = buildZip([{ name: 'x.png', data: Buffer.concat([png(), Buffer.alloc(5000)]), uncompressedSize: 20, crc: crc32(png()) }]);
  const ins = inspectZip(lying);
  assert.throws(() => readMember(lying, ins.files[0]), ZipIntakeError);
});

test('rejects duplicate names (case-insensitive) and file/directory collisions', () => {
  rejects([{ name: 'a.png', data: png() }, { name: 'a.png', data: png() }], /duplicate/);
  rejects([{ name: 'a.png', data: png() }, { name: 'A.PNG', data: png() }], /duplicate/);
  rejects([{ name: 'x.png', data: png() }, { name: 'x.png/y.png', data: png() }], /nested under file member/);
});

test('fails closed on malformed structure', () => {
  rejects(Buffer.from('not a zip at all, definitely not'), /end-of-central-directory/);
  rejects(Buffer.alloc(5), /too small/);
  rejects([], /no entries/);
  const good = buildZip(samplePack());
  rejects(good.subarray(0, good.length - 5), /end-of-central-directory/);
  rejects(Buffer.concat([Buffer.from('MZ-stub-prepended'), good]), /central directory does not end|unaccounted/);
  rejects(samplePack(), /unaccounted bytes/, { prefix: Buffer.from('hidden payload') });
  rejects([{ name: 'x.png', data: png() }], /multi-disk/, { eocd: { diskNo: 1 } });
  rejects([{ name: 'x.png', data: png(), localName: 'y.png' }], /local header name differs/);
  rejects([{ name: 'x.png', data: png(), localMethod: 0 }], /local header method differs/);
  rejects([{ name: 'x.png', data: png(), localOffset: 3 }], /local header|overlaps|unaccounted/);
  rejects([{ name: 'x.png', data: png(), method: 0, compressedSize: 3 }], /stored member with mismatched sizes|local header sizes/);
  rejects([{ name: 'a.png', data: png('a') }, { name: 'b.png', data: png('b'), localOffset: 0 }], /overlaps|local header name differs/);
  rejects([{ name: 'dir/', data: 'payload' }], /directory entry carries data/);
  rejects([{ name: 'pack/' }], /no allowlisted files/);
  // CRC and content checks happen on read.
  const badCrc = buildZip([{ name: 'x.png', data: png(), crc: 1234 }]);
  assert.throws(() => readMember(badCrc, inspectZip(badCrc).files[0]), /CRC-32 mismatch/);
  const notPng = buildZip([{ name: 'x.png', data: 'GIF89a' }]);
  assert.throws(() => readMember(notPng, inspectZip(notPng).files[0]), /not a PNG/);
  const binText = buildZip([{ name: 'README.md', data: Buffer.from([0x41, 0x00, 0x42]) }]);
  assert.throws(() => readMember(binText, inspectZip(binText).files[0]), /NUL/);
  const badDeflate = buildZip([{ name: 'x.png', data: png(), compressed: Buffer.from([0xff, 0xff, 0xff]) }]);
  assert.throws(() => readMember(badDeflate, inspectZip(badDeflate).files[0]), /deflate stream/);
});

test('data descriptors are accepted only when consistent', () => {
  const data = png();
  const comp = zlib.deflateRawSync(data);
  const dd = Buffer.alloc(16);
  dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc32(data), 4); dd.writeUInt32LE(comp.length, 8); dd.writeUInt32LE(data.length, 12);
  // Build with the descriptor appended to the compressed data, then fix sizes.
  const withDd = buildZip([{ name: 'x.png', data, flags: 0x8, compressed: Buffer.concat([comp, dd]), compressedSize: comp.length }]);
  // The central directory offset in the built EOCD already covers the descriptor bytes.
  assert.equal(inspectZip(withDd).files.length, 1);
  const badDd = Buffer.from(withDd); badDd.writeUInt32LE(0, 30 + 5 + comp.length + 4);
  rejects(badDd, /data descriptor/);
});

// ------------------------------------------------------------------ host (real disk where allowed)
function tmpRoot(t) {
  const dir = fs.mkdtempSync(path.join(TMP, 'hillink-intake-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function manifestFor(buf, ins, extra = {}) {
  return {
    sourcePageUrl: 'https://example.org/pack', downloadUrl: 'https://example.org/pack.zip', author: 'Example', license: 'CC0-1.0',
    filename: 'pack.zip', byteSize: buf.length, sha256: sha(buf), retrievedAt: '2026-09-30T12:00:00Z',
    inspectedMembers: ins.files.map((f) => ({ name: f.name, size: f.uncompressedSize })),
    kyleAcceptance: { accepted: true, acceptedBy: 'Kyle', acceptedAt: '2026-10-01T09:00:00Z' },
    ...extra,
  };
}
const hostOpts = (quarantine) => ({ quarantine, repoRoot: REPO_ROOT, detectGitAncestors: false, env: {}, fs });
const ex = (archive, opts) => extractZip(archive, { ...opts, fs });
// Read-only means no write permission bits (Windows maps the read-only attribute to this).
const writable = (p) => (fs.statSync(p).mode & 0o222) !== 0;
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0; // root ignores file modes
const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const rel = prefix ? `${prefix}/${d.name}` : d.name;
  return d.isDirectory() ? [rel, ...walk(path.join(dir, d.name), rel)] : [rel];
});

diskTest('stage: copies to <sha256>.zip in quarantine, read-only, original untouched, no overwrite', (t) => {
  const root = tmpRoot(t);
  const buf = buildZip(samplePack());
  const src = path.join(root, 'downloads', 'pack.zip');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, buf);
  const before = fs.statSync(src);
  const q = path.join(root, 'quarantine');

  const r = stageZip(src, { ...hostOpts(q), manifest: manifestFor(buf, inspectZip(buf)) });
  assert.equal(r.status, 'staged');
  assert.equal(path.basename(r.path), `${sha(buf)}.zip`);
  assert.ok(fs.readFileSync(r.path).equals(buf));
  assert.equal(writable(r.path), false, 'staged copy is read-only');
  if (!isRoot || !REAL_DISK) assert.throws(() => fs.writeFileSync(r.path, 'tamper'));

  const after = fs.statSync(src);
  assert.ok(fs.readFileSync(src).equals(buf), 'original bytes unchanged');
  assert.equal(after.mode, before.mode);
  assert.equal(after.mtimeMs, before.mtimeMs);

  // Same content again: idempotent. Different content at that name: refused.
  assert.equal(stageZip(src, hostOpts(q)).status, 'already-staged');
  fs.chmodSync(r.path, 0o644);
  fs.writeFileSync(r.path, buildZip([{ name: 'other.png', data: png('z') }]));
  fs.chmodSync(r.path, 0o444);
  assert.throws(() => stageZip(src, hostOpts(q)), /conflict/);
  assert.ok(!fs.readFileSync(r.path).equals(buf), 'conflicting file was not overwritten');
  fs.chmodSync(r.path, 0o644);
});

diskTest('stage: refuses bad ZIPs, mismatched manifests and in-repo quarantine before writing', (t) => {
  const root = tmpRoot(t);
  const q = path.join(root, 'q');
  const bad = path.join(root, 'bad.zip');
  fs.writeFileSync(bad, buildZip([{ name: '../evil.png', data: png() }]));
  assert.throws(() => stageZip(bad, hostOpts(q)), ZipIntakeError);
  assert.equal(fs.existsSync(q), false, 'nothing created for a rejected ZIP');

  const buf = buildZip(samplePack());
  const src = path.join(root, 'pack.zip');
  fs.writeFileSync(src, buf);
  assert.throws(() => stageZip(src, { ...hostOpts(q), manifest: manifestFor(buf, inspectZip(buf), { sha256: 'f'.repeat(64) }) }), /does not match/);
  assert.throws(() => stageZip(src, { ...hostOpts(q), manifest: manifestFor(buf, inspectZip(buf), { license: 'MIT' }) }), /manifest is invalid/);
  assert.equal(fs.existsSync(q), false);

  // Quarantine inside the repo (any case on Windows) is refused without creating it.
  const inRepo = path.join(REPO_ROOT, 'tools', 'hillink-world', 'intake', 'quarantine-should-not-exist');
  assert.throws(() => stageZip(src, hostOpts(inRepo)), /inside the repository/);
  if (process.platform === 'win32') assert.throws(() => stageZip(src, hostOpts(inRepo.toUpperCase())), /inside the repository/);
  assert.equal(fs.existsSync(inRepo), false);

  // A .git FILE (worktree) marks a repo too.
  const fakeRepo = path.join(root, 'fake-worktree');
  fs.mkdirSync(fakeRepo);
  fs.writeFileSync(path.join(fakeRepo, '.git'), 'gitdir: elsewhere\n');
  assert.throws(() => assertOutsideRepo(path.join(fakeRepo, 'q'), { fs }), /inside the repository/);

  // Symlinked source is refused (where the platform lets us create one).
  const link = path.join(root, 'link.zip');
  let linked = false;
  try { fs.symlinkSync(src, link, 'file'); linked = true; } catch { /* no symlink privilege */ }
  if (linked) assert.throws(() => stageZip(link, hostOpts(q)), /symbolic link/);
});

test('quarantine path resolution: explicit > env > default, with ~ expansion', () => {
  const home = path.resolve(os.tmpdir(), 'fake-home');
  assert.equal(resolveQuarantineDir({ env: {}, homedir: home }), path.join(home, '.hillink', 'intake-quarantine'));
  assert.equal(resolveQuarantineDir({ env: { HILLINK_INTAKE_QUARANTINE: '~/q' }, homedir: home }), path.join(home, 'q'));
  assert.equal(resolveQuarantineDir({ env: { HILLINK_INTAKE_QUARANTINE: '~\\q2' }, homedir: home }), path.join(home, 'q2'));
  assert.equal(resolveQuarantineDir({ quarantine: '~', env: { HILLINK_INTAKE_QUARANTINE: '/ignored' }, homedir: home }), home);
  assert.throws(() => resolveQuarantineDir({ env: { HILLINK_INTAKE_QUARANTINE: '' }, homedir: home }), IntakeError);
  assert.throws(() => resolveQuarantineDir({ quarantine: 'relative/dir', env: {}, homedir: home }), /absolute/);
  assert.throws(() => resolveQuarantineDir({ quarantine: '~bob/q', env: {}, homedir: home }), /~user/);
  assert.equal(isInside(path.join(home, 'a', 'b'), home), true);
  assert.equal(isInside(path.join(home, '..', 'fake-home-2'), home), false);
  assert.equal(isInside(home + '..x', home), false);
});

diskTest('extract: verifies hash, writes only allowlisted members to a new dir, records SHA-256s', (t) => {
  const root = tmpRoot(t);
  const buf = buildZip(samplePack());
  const src = path.join(root, 'pack.zip');
  fs.writeFileSync(src, buf);
  const ins = inspectZip(buf);
  const manifest = manifestFor(buf, ins);
  const staged = stageZip(src, { ...hostOpts(path.join(root, 'q')), manifest });

  const out = path.join(root, 'out', 'pack-v1');
  const receipt = ex(staged.path, { manifest, outDir: out });
  assert.deepEqual(receipt.outputs.map((o) => o.name), ['pack/tile_0001.png', 'pack/tile_0002.png', 'License.txt']);
  for (const o of receipt.outputs) {
    const bytes = fs.readFileSync(path.join(out, ...o.name.split('/')));
    assert.equal(sha(bytes), o.sha256);
    assert.equal(bytes.length, o.bytes);
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(out, ...o.name.split('/'))).mode & 0o111, 0, 'no exec bits');
  }
  const listed = walk(out).sort();
  assert.deepEqual(listed, [RECEIPT_NAME, 'License.txt', 'pack', 'pack/tile_0001.png', 'pack/tile_0002.png'].sort());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, RECEIPT_NAME), 'utf8')).outputs, receipt.outputs);
  assert.ok(fs.readFileSync(staged.path).equals(buf), 'archive unchanged');
  assert.equal(writable(staged.path), false, 'archive still read-only');

  // Never reuses or overwrites an output directory.
  assert.throws(() => ex(staged.path, { manifest, outDir: out }), /already exists/);
  fs.chmodSync(staged.path, 0o644);
});

diskTest('extract: fails closed and leaves no output on hash, manifest or member problems', (t) => {
  const root = tmpRoot(t);
  const buf = buildZip(samplePack());
  const ins = inspectZip(buf);
  const archive = path.join(root, 'a.zip');
  fs.writeFileSync(archive, buf);
  const manifest = manifestFor(buf, ins);
  const out = path.join(root, 'out');

  assert.throws(() => ex(archive, { outDir: out }), /requires a manifest/);
  assert.throws(() => ex(archive, { manifest: { ...manifest, sha256: 'e'.repeat(64) }, outDir: out }), /does not match the approved/);
  assert.throws(() => ex(archive, { manifest, outDir: out, expectedSha256: 'e'.repeat(64) }), /differs from the manifest/);
  assert.throws(() => ex(archive, { manifest: { ...manifest, kyleAcceptance: { accepted: false, acceptedBy: 'Kyle', acceptedAt: '2026-10-01T09:00:00Z' } }, outDir: out }), /manifest is invalid/);
  assert.throws(() => ex(archive, { manifest: { ...manifest, inspectedMembers: manifest.inspectedMembers.slice(1) }, outDir: out }), /not in the manifest/);
  assert.equal(fs.existsSync(out), false);

  // A member whose CRC is wrong: rejected before any directory is created.
  const badBuf = buildZip([{ name: 'x.png', data: png(), crc: 42 }]);
  const badPath = path.join(root, 'bad.zip');
  fs.writeFileSync(badPath, badBuf);
  assert.throws(() => ex(badPath, { manifest: manifestFor(badBuf, inspectZip(badBuf)), outDir: out }), /CRC-32/);
  assert.equal(fs.existsSync(out), false);

  // Pre-existing output directory is never reused.
  fs.mkdirSync(out);
  assert.throws(() => ex(archive, { manifest, outDir: out }), /already exists/);
  assert.deepEqual(fs.readdirSync(out), []);
});

// ------------------------------------------------------------------ CLI
const sink = () => { const s = { text: '', write: (x) => { s.text += x; return true; } }; return s; };

test('CLI rejects unknown, repeated and value-less flags (no silent defaults)', () => {
  assert.throws(() => parseArgs(['stage', 'a.zip', '--quarantin', '/tmp/q']), /unknown option "--quarantin"/);
  assert.throws(() => parseArgs(['stage', 'a.zip', '--quarantine']), /needs a value/);
  assert.throws(() => parseArgs(['stage', 'a.zip', '--quarantine=/a', '--quarantine=/b']), /more than once/);
  assert.throws(() => parseArgs(['extract', 'a.zip', '--manifest', 'm.json']), /requires --out/);
  assert.throws(() => parseArgs(['stage', 'a.zip', 'b.zip']), /exactly 1/);
  assert.throws(() => parseArgs(['stage', 'a.zip', '-q', 'x']), /unknown option/);
  assert.throws(() => parseArgs(['download', 'https://x']), /unknown command/);
  assert.deepEqual(parseArgs(['stage', 'a.zip', '--quarantine=/q']).flags, { quarantine: '/q' });
  const err = sink();
  assert.equal(run(['stage', 'a.zip', '--quarantin', '/tmp/q'], { stdout: sink(), stderr: err }), 2);
  assert.match(err.text, /unknown option/);
});

diskTest('CLI inspect / validate-manifest / stage / extract end to end on disk', (t) => {
  const root = tmpRoot(t);
  const buf = buildZip(samplePack());
  fs.writeFileSync(path.join(root, 'pack.zip'), buf);
  const io = () => ({ stdout: sink(), stderr: sink(), cwd: root, env: {}, repoRoot: REPO_ROOT, detectGitAncestors: false, fs });

  let s = io();
  assert.equal(run(['inspect', 'pack.zip'], s), 0, s.stderr.text);
  const info = JSON.parse(s.stdout.text);
  assert.equal(info.sha256, sha(buf));
  assert.equal(info.inspectedMembers.length, 3);

  const manifest = manifestFor(buf, inspectZip(buf));
  manifest.inspectedMembers = info.inspectedMembers;
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  s = io();
  assert.equal(run(['validate-manifest', 'manifest.json', '--zip', 'pack.zip'], s), 0, s.stdout.text + s.stderr.text);

  const q = path.join(root, 'quarantine');
  s = io();
  assert.equal(run(['stage', 'pack.zip', '--manifest', 'manifest.json', '--quarantine', q], s), 0, s.stderr.text);
  const staged = JSON.parse(s.stdout.text).path;

  s = io();
  assert.equal(run(['extract', staged, '--manifest', 'manifest.json', '--out', 'extracted'], s), 0, s.stderr.text);
  assert.ok(fs.existsSync(path.join(root, 'extracted', 'pack', 'tile_0001.png')));

  fs.writeFileSync(path.join(root, 'evil.zip'), buildZip([{ name: 'evil.exe', data: 'MZ' }]));
  s = io();
  assert.equal(run(['inspect', 'evil.zip'], s), 1);
  assert.match(s.stderr.text, /allowlist/);
  fs.chmodSync(staged, 0o644);
});

test('intake sources use no network, process or dependency modules', { skip: READ_OK ? false : 'fs read of the intake dir not permitted here' }, () => {
  for (const f of realFs.readdirSync(INTAKE_DIR).filter((n) => n.endsWith('.mjs'))) {
    const src = realFs.readFileSync(path.join(INTAKE_DIR, f), 'utf8');
    const imports = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of imports) assert.ok(/^node:(fs|path|os|crypto|zlib|url)$/.test(spec) || spec.startsWith('./'), `${f} imports ${spec}`);
    assert.doesNotMatch(src, /\bfetch\s*\(|child_process|node:net|node:http|\beval\s*\(|new Function/, f);
  }
});
