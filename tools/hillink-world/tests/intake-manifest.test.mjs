// Intake manifest validation: required fields, CC0-1.0 only, Kyle acceptance,
// and cross-checking against a real (in-memory) archive.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateManifest, crossCheckManifest, isIsoUtcTimestamp } from '../intake/manifest.mjs';
import { inspectZip } from '../intake/zip.mjs';
import { buildZip, samplePack } from '../intake/test-zip-builder.mjs';

const HEX = 'a'.repeat(64);
const good = () => ({
  sourcePageUrl: 'https://example.org/assets/pack',
  downloadUrl: 'https://example.org/assets/pack.zip',
  author: 'Example Author',
  license: 'CC0-1.0',
  filename: 'pack.zip',
  byteSize: 1234,
  sha256: HEX,
  retrievedAt: '2026-09-30T12:00:00Z',
  inspectedMembers: [{ name: 'pack/tile_0001.png', size: 10 }, { name: 'License.txt', size: 5, sha256: 'b'.repeat(64) }],
  kyleAcceptance: { accepted: true, acceptedBy: 'Kyle', acceptedAt: '2026-10-01T09:00:00Z' },
});
const errs = (m) => validateManifest(m).errors.join('\n');

test('a complete manifest validates', () => {
  assert.deepEqual(validateManifest(good()), { ok: true, errors: [] });
  assert.equal(validateManifest({ ...good(), schema: 'hillink-intake-manifest/1', title: 't', notes: '' }).ok, true);
});

test('every required field is enforced', () => {
  for (const k of ['sourcePageUrl', 'downloadUrl', 'author', 'license', 'filename', 'byteSize', 'sha256', 'retrievedAt', 'inspectedMembers', 'kyleAcceptance']) {
    const m = good(); delete m[k];
    assert.match(errs(m), new RegExp(`missing required field "${k}"`), k);
  }
  assert.equal(validateManifest(null).ok, false);
  assert.equal(validateManifest([]).ok, false);
  assert.match(errs({ ...good(), extra: 1 }), /unknown field "extra"/);
});

test('license must be exactly CC0-1.0', () => {
  for (const l of ['CC0', 'cc0-1.0', 'CC0-1.0 ', 'CC-BY-4.0', 'MIT', '', null]) assert.match(errs({ ...good(), license: l }), /license must be exactly "CC0-1.0"/, String(l));
});

test('URLs must be https without credentials', () => {
  assert.match(errs({ ...good(), sourcePageUrl: 'http://example.org/' }), /sourcePageUrl must use https/);
  assert.match(errs({ ...good(), downloadUrl: 'ftp://example.org/x.zip' }), /downloadUrl must use https/);
  assert.match(errs({ ...good(), downloadUrl: 'not a url' }), /downloadUrl is not a valid URL/);
  assert.match(errs({ ...good(), downloadUrl: 'https://u:p@example.org/x.zip' }), /credentials/);
  assert.match(errs({ ...good(), author: '  ' }), /author/);
});

test('sha256 must be lowercase 64-hex; byteSize a positive integer; filename a bare .zip name', () => {
  for (const s of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 123]) assert.match(errs({ ...good(), sha256: s }), /sha256 must be 64 lowercase hex/);
  for (const b of [0, -1, 1.5, '12', null]) assert.match(errs({ ...good(), byteSize: b }), /byteSize/);
  for (const f of ['dir/pack.zip', '..\\pack.zip', 'C:pack.zip', 'pack.tar', '.zip', 'pack .zip']) assert.match(errs({ ...good(), filename: f }), /filename/, f);
});

test('retrievedAt must be a real ISO-8601 UTC timestamp', () => {
  assert.equal(isIsoUtcTimestamp('2026-02-28T23:59:59.123Z'), true);
  for (const t of ['2026-02-30T00:00:00Z', '2026-09-30', '2026-09-30T12:00:00+02:00', '2026-09-30 12:00:00Z', 1700000000000]) assert.match(errs({ ...good(), retrievedAt: t }), /retrievedAt/, String(t));
});

test('inspectedMembers must be non-empty, allowlisted, safe and unique', () => {
  assert.match(errs({ ...good(), inspectedMembers: [] }), /non-empty array/);
  assert.match(errs({ ...good(), inspectedMembers: [{ name: 'run.exe', size: 1 }] }), /allowlist/);
  assert.match(errs({ ...good(), inspectedMembers: [{ name: '../x.png', size: 1 }] }), /parent traversal/);
  assert.match(errs({ ...good(), inspectedMembers: [{ name: 'a.png', size: 1 }, { name: 'A.PNG', size: 1 }] }), /duplicates/);
  assert.match(errs({ ...good(), inspectedMembers: [{ name: 'a.png', size: -1 }] }), /size/);
  assert.match(errs({ ...good(), inspectedMembers: [{ name: 'a.png', size: 1, sha256: 'XYZ' }] }), /sha256/);
  assert.match(errs({ ...good(), inspectedMembers: ['a.png'] }), /must be an object/);
});

test('inspectedMembers reject Windows device names, including trailing space/dot variants', () => {
  for (const name of ['nul .png', 'com1 .png', 'CON..png', 'pack/lpt9 .png', 'aux  .png', 'conout$ .png']) {
    assert.match(errs({ ...good(), inspectedMembers: [{ name, size: 1 }] }), /reserved device name/, name);
  }
  assert.equal(validateManifest({ ...good(), inspectedMembers: [{ name: 'console.png', size: 1 }, { name: 'com10.png', size: 1 }] }).ok, true);
});

test('Kyle acceptance is required and explicit', () => {
  assert.match(errs({ ...good(), kyleAcceptance: { ...good().kyleAcceptance, accepted: 'yes' } }), /accepted must be true/);
  assert.match(errs({ ...good(), kyleAcceptance: { ...good().kyleAcceptance, accepted: false } }), /accepted must be true/);
  assert.match(errs({ ...good(), kyleAcceptance: { ...good().kyleAcceptance, acceptedBy: 'ChatGPT' } }), /acceptedBy must be "Kyle"/);
  assert.match(errs({ ...good(), kyleAcceptance: { accepted: true, acceptedBy: 'Kyle' } }), /acceptedAt/);
  assert.match(errs({ ...good(), kyleAcceptance: true }), /kyleAcceptance must be an object/);
});

test('crossCheckManifest compares hash, size, filename and the exact member list', () => {
  const buf = buildZip(samplePack());
  const ins = inspectZip(buf);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const m = { ...good(), sha256, byteSize: buf.length, inspectedMembers: ins.files.map((f) => ({ name: f.name, size: f.uncompressedSize })) };
  assert.equal(validateManifest(m).ok, true);
  assert.deepEqual(crossCheckManifest(m, { sha256, byteSize: buf.length, files: ins.files, filename: 'pack.zip' }).errors, []);
  assert.match(crossCheckManifest({ ...m, sha256: HEX }, { sha256, byteSize: buf.length, files: ins.files }).errors.join(), /SHA-256/);
  assert.match(crossCheckManifest({ ...m, byteSize: 1 }, { sha256, byteSize: buf.length, files: ins.files }).errors.join(), /size/);
  assert.match(crossCheckManifest(m, { sha256, byteSize: buf.length, files: ins.files, filename: 'other.zip' }).errors.join(), /file name/);
  assert.match(crossCheckManifest({ ...m, inspectedMembers: m.inspectedMembers.slice(1) }, { sha256, byteSize: buf.length, files: ins.files }).errors.join(), /not in the manifest/);
  assert.match(crossCheckManifest({ ...m, inspectedMembers: [...m.inspectedMembers, { name: 'extra.png', size: 1 }] }, { sha256, byteSize: buf.length, files: ins.files }).errors.join(), /not in the archive/);
  const wrongSize = m.inspectedMembers.map((x, i) => (i === 0 ? { ...x, size: x.size + 1 } : x));
  assert.match(crossCheckManifest({ ...m, inspectedMembers: wrongSize }, { sha256, byteSize: buf.length, files: ins.files }).errors.join(), /manifest says/);
  const withHash = m.inspectedMembers.map((x, i) => (i === 0 ? { ...x, sha256: HEX } : x));
  const memberSha256 = Object.fromEntries(ins.files.map((f) => [f.name, 'c'.repeat(64)]));
  assert.match(crossCheckManifest({ ...m, inspectedMembers: withHash }, { sha256, byteSize: buf.length, files: ins.files, memberSha256 }).errors.join(), /SHA-256 does not match/);
});
