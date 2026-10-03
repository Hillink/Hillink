// Dependency-free, fail-closed ZIP inspection for the Hillink World asset intake.
//
// The archive is read entirely from a Buffer. Nothing here touches the network,
// the filesystem or child processes. inspectZip() walks the central directory
// (and cross-checks every local header) BEFORE anything is extracted, and throws
// a ZipIntakeError listing every problem if the archive uses any feature that is
// not explicitly supported. readMember() decompresses one inspected member in
// memory with a hard output cap and verifies its size, CRC-32 and content type.

import zlib from 'node:zlib';

export class ZipIntakeError extends Error {
  constructor(message, problems = []) {
    super(problems.length ? `${message}:\n  - ${problems.join('\n  - ')}` : message);
    this.name = 'ZipIntakeError';
    this.problems = problems.length ? problems : [message];
  }
}

export const DEFAULT_LIMITS = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024, // whole archive
  maxEntries: 5000, // central directory records
  maxMemberBytes: 64 * 1024 * 1024, // uncompressed size of one member
  maxTotalBytes: 512 * 1024 * 1024, // uncompressed size of all members
  maxRatio: 100, // uncompressed / compressed, checked once a member is >= ratioFloorBytes
  ratioFloorBytes: 64 * 1024,
  maxNameLength: 200, // bytes in a member name
  maxDepth: 8, // path segments in a member name
});

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_PATCHED = 0x0020;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_UTF8 = 0x0800;
const FLAG_MASKED_CD = 0x2000;
// Bits we understand and accept: 1/2 (deflate level hints), 3 (data descriptor), 11 (UTF-8).
const FLAGS_ALLOWED = 0x0002 | 0x0004 | FLAG_DATA_DESCRIPTOR | FLAG_UTF8;

const EXTRA_ZIP64 = 0x0001;
const EXTRA_STRONG_ENCRYPTION = 0x0017;
const EXTRA_AES = 0x9901;

const HOSTS_UNIX = new Set([3, 19]); // Unix, OS X
const HOSTS_DOS = new Set([0, 10, 11, 14]); // MS-DOS/FAT, NTFS, VFAT, VFAT

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

const DOS_ATTR_DIRECTORY = 0x10;
const DOS_ATTR_REPARSE_POINT = 0x400; // Windows symlinks / junctions

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Allowlist: PNG images anywhere in the tree, plus license/readme text in TXT or MD.
const PNG_RE = /\.png$/i;
const TEXT_RE = /^(?:license|licence|readme)(?:[ ._-][A-Za-z0-9 ._-]*)?\.(?:txt|md)$/i;
// Conservative member-name charset (ASCII only). Anything else fails closed.
const NAME_CHARSET_RE = /^[A-Za-z0-9 ._()+,@\/-]+$/;
const WINDOWS_RESERVED_RE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/i;

// ---------------------------------------------------------------- CRC-32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- names
/**
 * True if Win32 would map this path segment to a device. Win32 matches the part
 * before the first dot after dropping trailing spaces and dots, so "nul .png",
 * "com1 .png", "CON..png" and "lpt1 . .txt" are all devices, as well as "con".
 */
export function isWindowsReservedSegment(segment) {
  const stem = segment.split('.')[0].replace(/[ .]+$/, '');
  return WINDOWS_RESERVED_RE.test(stem);
}

/** Problems with a member name as a safe relative POSIX path (empty array = ok). */
export function memberNameProblems(name, limits = DEFAULT_LIMITS) {
  const p = [];
  if (typeof name !== 'string' || name.length === 0) return ['empty member name'];
  if (name.length > limits.maxNameLength) p.push(`name longer than ${limits.maxNameLength} bytes`);
  if (name.includes('\\')) p.push('backslash in name');
  if (name.startsWith('/')) p.push('absolute path');
  if (/^[A-Za-z]:/.test(name) || name.includes(':')) p.push('drive letter or colon in name');
  if (/[\x00-\x1f\x7f]/.test(name)) p.push('control character in name');
  if (!NAME_CHARSET_RE.test(name)) p.push('characters outside the allowed ASCII set');
  const body = name.endsWith('/') ? name.slice(0, -1) : name;
  const segs = body.split('/');
  if (segs.length > limits.maxDepth) p.push(`deeper than ${limits.maxDepth} path segments`);
  for (const s of segs) {
    if (s === '') { p.push('empty path segment'); continue; }
    if (s === '..') p.push('parent traversal (..)');
    else if (s === '.') p.push('current-directory segment (.)');
    else if (/[. ]$/.test(s)) p.push(`segment "${s}" ends with a dot or space`);
    else if (/^ /.test(s)) p.push(`segment "${s}" starts with a space`);
    if (isWindowsReservedSegment(s)) p.push(`Windows reserved device name "${s}"`);
  }
  return [...new Set(p)];
}

/** True only for file members (not directories) on the PNG + license/readme TXT/MD allowlist. */
export function isAllowlistedFile(name) {
  if (typeof name !== 'string' || name.endsWith('/')) return false;
  const base = name.slice(name.lastIndexOf('/') + 1);
  return PNG_RE.test(base) || TEXT_RE.test(base);
}

export function memberKind(name) {
  const base = name.slice(name.lastIndexOf('/') + 1);
  return PNG_RE.test(base) ? 'png' : 'text';
}

// ---------------------------------------------------------------- inspection
function findEocd(buf) {
  if (buf.length < 22) throw new ZipIntakeError('archive is too small to be a ZIP');
  const min = Math.max(0, buf.length - 22 - 0xffff);
  const found = [];
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD && i + 22 + buf.readUInt16LE(i + 20) === buf.length) found.push(i);
  }
  if (found.length === 0) throw new ZipIntakeError('no valid end-of-central-directory record');
  if (found.length > 1) throw new ZipIntakeError('ambiguous end-of-central-directory record');
  return found[0];
}

function parseExtra(extra, problems, label) {
  let p = 0;
  while (p < extra.length) {
    if (p + 4 > extra.length) { problems.push(`${label}: truncated extra field`); return; }
    const tag = extra.readUInt16LE(p);
    const len = extra.readUInt16LE(p + 2);
    if (p + 4 + len > extra.length) { problems.push(`${label}: extra field overruns its record`); return; }
    if (tag === EXTRA_ZIP64) problems.push(`${label}: ZIP64 is not supported`);
    if (tag === EXTRA_STRONG_ENCRYPTION || tag === EXTRA_AES) problems.push(`${label}: encryption extra field`);
    p += 4 + len;
  }
}

/**
 * Inspect a ZIP held in memory without extracting anything.
 * Returns { archiveBytes, entryCount, files, directories, totalUncompressedBytes } or
 * throws ZipIntakeError listing every problem found.
 */
export function inspectZip(buf, limitsIn = {}) {
  if (!Buffer.isBuffer(buf)) throw new ZipIntakeError('inspectZip expects a Buffer');
  const limits = { ...DEFAULT_LIMITS, ...limitsIn };
  if (buf.length > limits.maxArchiveBytes) throw new ZipIntakeError(`archive exceeds ${limits.maxArchiveBytes} bytes`);

  const eocd = findEocd(buf);
  const diskNo = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const entriesDisk = buf.readUInt16LE(eocd + 8);
  const entriesTotal = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const fatal = [];
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) fatal.push('ZIP64 archives are not supported');
  if (entriesTotal === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fatal.push('ZIP64 sentinel values are not supported');
  if (diskNo !== 0 || cdDisk !== 0 || entriesDisk !== entriesTotal) fatal.push('multi-disk (spanned) archives are not supported');
  if (entriesTotal === 0) fatal.push('archive has no entries');
  if (entriesTotal > limits.maxEntries) fatal.push(`archive has ${entriesTotal} entries (limit ${limits.maxEntries})`);
  if (cdOffset + cdSize !== eocd) fatal.push('central directory does not end at the end-of-central-directory record (prepended/appended data or corruption)');
  if (fatal.length) throw new ZipIntakeError('unsupported or malformed ZIP', fatal);

  const problems = [];
  const files = [];
  const directories = [];
  const ranges = [];
  const seen = new Map(); // case-folded name -> original
  let total = 0;
  let p = cdOffset;
  const cdEnd = cdOffset + cdSize;

  for (let i = 0; i < entriesTotal; i++) {
    if (p + 46 > cdEnd) throw new ZipIntakeError('unsupported or malformed ZIP', [...problems, 'central directory is truncated']);
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new ZipIntakeError('unsupported or malformed ZIP', [...problems, `bad central directory signature at entry ${i}`]);
    const versionMadeBy = buf.readUInt16LE(p + 4);
    const versionNeeded = buf.readUInt16LE(p + 6);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const diskStart = buf.readUInt16LE(p + 34);
    const externalAttr = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const recEnd = p + 46 + nameLen + extraLen + commentLen;
    if (recEnd > cdEnd) throw new ZipIntakeError('unsupported or malformed ZIP', [...problems, `central directory entry ${i} overruns the directory`]);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const extra = buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
    p = recEnd;

    // Names: ASCII only, so the UTF-8 flag and CP437 decode identically.
    let ascii = true;
    for (const b of nameBytes) if (b >= 0x80) ascii = false;
    const name = nameBytes.toString('latin1');
    const label = `"${name.replace(/[\x00-\x1f\x7f-\xff]/g, '?')}"`;
    const before = problems.length;
    if (!ascii) problems.push(`${label}: non-ASCII member name`);
    for (const np of memberNameProblems(name, limits)) problems.push(`${label}: ${np}`);

    // Flags / method / version.
    if (flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_CD)) problems.push(`${label}: encrypted member`);
    if (flags & FLAG_PATCHED) problems.push(`${label}: patched-data member`);
    if (flags & ~(FLAGS_ALLOWED | FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_CD | FLAG_PATCHED)) problems.push(`${label}: unknown general-purpose flags 0x${flags.toString(16)}`);
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) problems.push(`${label}: unsupported compression method ${method}`);
    if ((versionNeeded & 0xff) > 45) problems.push(`${label}: requires ZIP feature version ${versionNeeded & 0xff}`);
    if (diskStart !== 0) problems.push(`${label}: member on another disk`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) problems.push(`${label}: ZIP64 sizes are not supported`);
    parseExtra(extra, problems, label);

    // Attributes: no symlinks, devices, special bits or executables.
    const isDir = name.endsWith('/');
    const host = versionMadeBy >>> 8;
    if (HOSTS_UNIX.has(host)) {
      const mode = externalAttr >>> 16;
      const type = mode & S_IFMT;
      if (type === S_IFLNK) problems.push(`${label}: symbolic link`);
      else if (isDir ? type !== 0 && type !== S_IFDIR : type !== 0 && type !== S_IFREG) problems.push(`${label}: special file type 0o${type.toString(8)}`);
      if (mode & 0o7000) problems.push(`${label}: setuid/setgid/sticky bits`);
      if (!isDir && mode & 0o111) problems.push(`${label}: executable permission bits`);
    } else if (!HOSTS_DOS.has(host)) {
      problems.push(`${label}: unsupported "made by" host system ${host}`);
    }
    if (externalAttr & DOS_ATTR_REPARSE_POINT) problems.push(`${label}: reparse point (symlink/junction) attribute`);
    if (!isDir && externalAttr & DOS_ATTR_DIRECTORY) problems.push(`${label}: directory attribute on a file member`);

    // Duplicates (case-insensitive, like Windows/macOS filesystems).
    const key = (isDir ? name.slice(0, -1) : name).toLowerCase();
    if (seen.has(key)) problems.push(`${label}: duplicate of "${seen.get(key)}" (case-insensitive)`);
    else seen.set(key, name);

    // Sizes.
    if (isDir) {
      if (uncompressedSize !== 0 || compressedSize > 2) problems.push(`${label}: directory entry carries data`);
    } else {
      if (!isAllowlistedFile(name)) problems.push(`${label}: not on the allowlist (PNG, or license/readme TXT/MD)`);
      if (method === METHOD_STORED && compressedSize !== uncompressedSize) problems.push(`${label}: stored member with mismatched sizes`);
      if (uncompressedSize > limits.maxMemberBytes) problems.push(`${label}: ${uncompressedSize} bytes exceeds the member limit ${limits.maxMemberBytes}`);
      if (uncompressedSize >= limits.ratioFloorBytes && uncompressedSize / Math.max(compressedSize, 1) > limits.maxRatio) problems.push(`${label}: compression ratio exceeds ${limits.maxRatio}:1`);
      total += uncompressedSize;
    }

    // Local header must agree with the central directory and lie before it.
    if (problems.length === before) {
      if (localOffset + 30 > cdOffset) problems.push(`${label}: local header outside the data area`);
      else if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) problems.push(`${label}: bad local header signature`);
      else {
        const lFlags = buf.readUInt16LE(localOffset + 6);
        const lMethod = buf.readUInt16LE(localOffset + 8);
        const lNameLen = buf.readUInt16LE(localOffset + 26);
        const lExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > cdOffset) problems.push(`${label}: member data overruns the data area`);
        else {
          const lName = buf.subarray(localOffset + 30, localOffset + 30 + lNameLen);
          if (!lName.equals(nameBytes)) problems.push(`${label}: local header name differs from central directory`);
          if (lMethod !== method) problems.push(`${label}: local header method differs from central directory`);
          if (lFlags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) problems.push(`${label}: local header marks the member encrypted`);
          if (!(lFlags & FLAG_DATA_DESCRIPTOR)) {
            const lCrc = buf.readUInt32LE(localOffset + 14);
            const lComp = buf.readUInt32LE(localOffset + 18);
            const lUncomp = buf.readUInt32LE(localOffset + 22);
            if (lCrc !== crc || lComp !== compressedSize || lUncomp !== uncompressedSize) problems.push(`${label}: local header sizes/CRC differ from central directory`);
          }
          parseExtra(buf.subarray(localOffset + 30 + lNameLen, dataStart), problems, `${label} (local)`);
          ranges.push({ start: localOffset, end: dataEnd, name, dataDescriptor: Boolean(lFlags & FLAG_DATA_DESCRIPTOR), crc, compressedSize, uncompressedSize });
          const entry = Object.freeze({ name, method, flags, crc32: crc, compressedSize, uncompressedSize, localHeaderOffset: localOffset, dataStart, externalAttr, versionMadeBy });
          if (isDir) directories.push(name);
          else files.push(entry);
        }
      }
    }
  }
  if (p !== cdEnd) problems.push('central directory size does not match its entries');
  if (total > limits.maxTotalBytes) problems.push(`total uncompressed size ${total} exceeds ${limits.maxTotalBytes}`);

  // Overlapping member data (a classic zip-bomb construction) fails closed.
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) problems.push(`"${ranges[i].name}" overlaps "${ranges[i - 1].name}"`);
  }
  // Every byte before the central directory must belong to a member (no
  // prepended stubs, hidden payloads or gaps). Data descriptors are accounted for.
  if (problems.length === 0) {
    let cursor = 0;
    for (const r of ranges) {
      if (r.start !== cursor) { problems.push(`unaccounted bytes before "${r.name}" (prepended or hidden data)`); break; }
      cursor = r.end;
      if (r.dataDescriptor) {
        const hasSig = cursor + 4 <= cdOffset && buf.readUInt32LE(cursor) === 0x08074b50;
        const base = hasSig ? cursor + 4 : cursor;
        if (base + 12 > cdOffset || buf.readUInt32LE(base) !== r.crc || buf.readUInt32LE(base + 4) !== r.compressedSize || buf.readUInt32LE(base + 8) !== r.uncompressedSize) {
          problems.push(`"${r.name}": data descriptor missing or inconsistent`);
          break;
        }
        cursor = base + 12;
      }
    }
    if (problems.length === 0 && cursor !== cdOffset) problems.push('unaccounted bytes between the last member and the central directory');
  }
  // A file whose path is also used as a directory prefix would collide on disk.
  const fileKeys = new Set(files.map((f) => f.name.toLowerCase()));
  for (const f of files) {
    const segs = f.name.toLowerCase().split('/');
    for (let i = 1; i < segs.length; i++) {
      const prefix = segs.slice(0, i).join('/');
      if (fileKeys.has(prefix)) problems.push(`"${f.name}" is nested under file member "${prefix}"`);
    }
  }
  if (files.length === 0 && problems.length === 0) problems.push('archive contains no allowlisted files');
  if (problems.length) throw new ZipIntakeError('ZIP rejected', problems);

  return Object.freeze({
    archiveBytes: buf.length,
    entryCount: entriesTotal,
    files: Object.freeze(files),
    directories: Object.freeze(directories),
    totalUncompressedBytes: total,
  });
}

// ---------------------------------------------------------------- reading
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

/** Decompress one inspected member in memory and verify size, CRC-32 and content type. */
export function readMember(buf, entry) {
  const raw = buf.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  let out;
  if (entry.method === METHOD_STORED) {
    out = Buffer.from(raw); // copy, never a view into the archive
  } else if (entry.method === METHOD_DEFLATE) {
    try {
      out = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
    } catch (err) {
      throw new ZipIntakeError(`"${entry.name}": deflate stream is invalid or larger than declared (${err.code || err.message})`);
    }
  } else {
    throw new ZipIntakeError(`"${entry.name}": unsupported compression method ${entry.method}`);
  }
  if (out.length !== entry.uncompressedSize) throw new ZipIntakeError(`"${entry.name}": decompressed size ${out.length} != declared ${entry.uncompressedSize}`);
  if (crc32(out) !== entry.crc32) throw new ZipIntakeError(`"${entry.name}": CRC-32 mismatch`);
  if (memberKind(entry.name) === 'png') {
    if (out.length < PNG_SIGNATURE.length || !out.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new ZipIntakeError(`"${entry.name}": not a PNG (bad signature)`);
  } else {
    if (out.includes(0)) throw new ZipIntakeError(`"${entry.name}": text member contains NUL bytes`);
    try { UTF8_FATAL.decode(out); } catch { throw new ZipIntakeError(`"${entry.name}": text member is not valid UTF-8`); }
  }
  return out;
}
