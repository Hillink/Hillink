// Intake manifest validation for Kyle-approved CC0 asset ZIPs. Pure functions:
// no filesystem, no network. validateManifest() checks the manifest on its own;
// crossCheckManifest() checks it against a real archive's hash, size and members.

import { memberNameProblems, isAllowlistedFile } from './zip.mjs';

export const MANIFEST_SCHEMA = 'hillink-intake-manifest/1';
export const REQUIRED_LICENSE = 'CC0-1.0';
export const ACCEPTOR = 'Kyle';

const REQUIRED_FIELDS = ['sourcePageUrl', 'downloadUrl', 'author', 'license', 'filename', 'byteSize', 'sha256', 'retrievedAt', 'inspectedMembers', 'kyleAcceptance'];
const OPTIONAL_FIELDS = ['schema', 'title', 'notes'];
const MEMBER_FIELDS = ['name', 'size', 'sha256'];
const ACCEPTANCE_FIELDS = ['accepted', 'acceptedBy', 'acceptedAt', 'note'];

export const SHA256_RE = /^[0-9a-f]{64}$/;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
const ZIP_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._()+,@-]*\.zip$/i;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const nonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;

export function isIsoUtcTimestamp(v) {
  if (typeof v !== 'string') return false;
  const m = ISO_UTC_RE.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s;
}

function httpsUrlProblem(v) {
  if (!nonEmptyString(v)) return 'must be a non-empty string';
  let u;
  try { u = new URL(v); } catch { return 'is not a valid URL'; }
  if (u.protocol !== 'https:') return 'must use https';
  if (u.username || u.password) return 'must not embed credentials';
  if (!u.hostname) return 'must have a host';
  return null;
}

function unknownKeys(obj, allowed) {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

/** Validate a parsed manifest object. Returns { ok, errors }. Never throws. */
export function validateManifest(m) {
  const errors = [];
  if (!isPlainObject(m)) return { ok: false, errors: ['manifest must be a JSON object'] };

  for (const k of REQUIRED_FIELDS) if (!(k in m)) errors.push(`missing required field "${k}"`);
  for (const k of unknownKeys(m, [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])) errors.push(`unknown field "${k}"`);
  if ('schema' in m && m.schema !== MANIFEST_SCHEMA) errors.push(`schema must be "${MANIFEST_SCHEMA}"`);
  if ('title' in m && !nonEmptyString(m.title)) errors.push('title must be a non-empty string');
  if ('notes' in m && typeof m.notes !== 'string') errors.push('notes must be a string');

  if ('sourcePageUrl' in m) { const e = httpsUrlProblem(m.sourcePageUrl); if (e) errors.push(`sourcePageUrl ${e}`); }
  if ('downloadUrl' in m) { const e = httpsUrlProblem(m.downloadUrl); if (e) errors.push(`downloadUrl ${e}`); }
  if ('author' in m && !nonEmptyString(m.author)) errors.push('author must be a non-empty string');
  if ('license' in m && m.license !== REQUIRED_LICENSE) errors.push(`license must be exactly "${REQUIRED_LICENSE}"`);
  if ('filename' in m && (typeof m.filename !== 'string' || !ZIP_FILENAME_RE.test(m.filename) || /[. ]$/.test(m.filename.slice(0, -4)))) errors.push('filename must be a plain .zip file name with no path');
  if ('byteSize' in m && !(Number.isSafeInteger(m.byteSize) && m.byteSize > 0)) errors.push('byteSize must be a positive integer');
  if ('sha256' in m && !(typeof m.sha256 === 'string' && SHA256_RE.test(m.sha256))) errors.push('sha256 must be 64 lowercase hex characters');
  if ('retrievedAt' in m && !isIsoUtcTimestamp(m.retrievedAt)) errors.push('retrievedAt must be an ISO-8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)');

  if ('inspectedMembers' in m) {
    const list = m.inspectedMembers;
    if (!Array.isArray(list) || list.length === 0) errors.push('inspectedMembers must be a non-empty array');
    else {
      const seen = new Set();
      list.forEach((mem, i) => {
        const at = `inspectedMembers[${i}]`;
        if (!isPlainObject(mem)) { errors.push(`${at} must be an object`); return; }
        for (const k of unknownKeys(mem, MEMBER_FIELDS)) errors.push(`${at} has unknown field "${k}"`);
        if (typeof mem.name !== 'string') errors.push(`${at}.name must be a string`);
        else {
          for (const p of memberNameProblems(mem.name)) errors.push(`${at}.name ${p}`);
          if (!isAllowlistedFile(mem.name)) errors.push(`${at}.name is not on the allowlist (PNG, or license/readme TXT/MD)`);
          const key = mem.name.toLowerCase();
          if (seen.has(key)) errors.push(`${at}.name duplicates an earlier member`);
          seen.add(key);
        }
        if (!(Number.isSafeInteger(mem.size) && mem.size >= 0)) errors.push(`${at}.size must be a non-negative integer`);
        if ('sha256' in mem && !(typeof mem.sha256 === 'string' && SHA256_RE.test(mem.sha256))) errors.push(`${at}.sha256 must be 64 lowercase hex characters`);
      });
    }
  }

  if ('kyleAcceptance' in m) {
    const a = m.kyleAcceptance;
    if (!isPlainObject(a)) errors.push('kyleAcceptance must be an object');
    else {
      for (const k of unknownKeys(a, ACCEPTANCE_FIELDS)) errors.push(`kyleAcceptance has unknown field "${k}"`);
      if (a.accepted !== true) errors.push('kyleAcceptance.accepted must be true');
      if (a.acceptedBy !== ACCEPTOR) errors.push(`kyleAcceptance.acceptedBy must be "${ACCEPTOR}"`);
      if (!isIsoUtcTimestamp(a.acceptedAt)) errors.push('kyleAcceptance.acceptedAt must be an ISO-8601 UTC timestamp');
      if ('note' in a && typeof a.note !== 'string') errors.push('kyleAcceptance.note must be a string');
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Cross-check a manifest against a real archive.
 * actual: { sha256, byteSize, files: [{ name, uncompressedSize }], memberSha256?: { [name]: hex }, filename? }
 */
export function crossCheckManifest(m, actual) {
  const errors = [];
  if (m.sha256 !== actual.sha256) errors.push(`archive SHA-256 ${actual.sha256} does not match manifest ${m.sha256}`);
  if (m.byteSize !== actual.byteSize) errors.push(`archive size ${actual.byteSize} does not match manifest ${m.byteSize}`);
  if (actual.filename !== undefined && actual.filename !== m.filename) errors.push(`archive file name "${actual.filename}" does not match manifest "${m.filename}"`);
  const declared = new Map((m.inspectedMembers || []).map((x) => [x.name, x]));
  const real = new Map(actual.files.map((f) => [f.name, f]));
  for (const [name, f] of real) {
    const d = declared.get(name);
    if (!d) { errors.push(`archive member "${name}" is not in the manifest's inspectedMembers`); continue; }
    if (d.size !== f.uncompressedSize) errors.push(`member "${name}" is ${f.uncompressedSize} bytes, manifest says ${d.size}`);
    if (d.sha256 && actual.memberSha256 && actual.memberSha256[name] !== d.sha256) errors.push(`member "${name}" SHA-256 does not match the manifest`);
  }
  for (const name of declared.keys()) if (!real.has(name)) errors.push(`manifest member "${name}" is not in the archive`);
  return { ok: errors.length === 0, errors };
}
