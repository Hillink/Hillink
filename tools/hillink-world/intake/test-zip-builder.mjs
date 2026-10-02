// In-memory ZIP builder used ONLY by the intake tests. It can produce well-formed
// archives and deliberately hostile ones (bad names, attributes, flags, sizes...).

import zlib from 'node:zlib';
import { crc32, PNG_SIGNATURE } from './zip.mjs';

const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export const png = (tag = 'x') => Buffer.concat([PNG_SIGNATURE, Buffer.from(`IHDR-fake-${tag}`)]);

/**
 * entries: [{ name, data, method=8, flags, localFlags, localMethod, localName,
 *   versionMadeBy, versionNeeded, externalAttr, extra, crc, compressedSize,
 *   uncompressedSize, compressed, localOffset }]
 * options: { comment, prefix, suffix, eocd: { diskNo, cdDisk, entriesDisk, entriesTotal, cdSize, cdOffset } }
 */
export function buildZip(entries, options = {}) {
  const prefix = options.prefix || Buffer.alloc(0);
  const locals = [];
  const centrals = [];
  let offset = prefix.length;
  for (const e of entries) {
    const nameBuf = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, 'utf8');
    const localName = e.localName === undefined ? nameBuf : Buffer.from(e.localName, 'utf8');
    const data = e.data === undefined ? Buffer.alloc(0) : Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const method = e.method ?? 8;
    const comp = e.compressed ?? (method === 8 ? zlib.deflateRawSync(data) : data);
    const crc = (e.crc ?? crc32(data)) >>> 0;
    const flags = e.flags ?? 0;
    const compressedSize = e.compressedSize ?? comp.length;
    const uncompressedSize = e.uncompressedSize ?? data.length;
    const extra = e.extra || Buffer.alloc(0);
    const isDir = nameBuf.toString('latin1').endsWith('/');
    const externalAttr = (e.externalAttr ?? (isDir ? ((0o040755 << 16) | 0x10) : (0o100644 << 16))) >>> 0;
    const versionNeeded = e.versionNeeded ?? 20;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(versionNeeded, 4);
    local.writeUInt16LE(e.localFlags ?? flags, 6);
    local.writeUInt16LE(e.localMethod ?? method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedSize >>> 0, 18);
    local.writeUInt32LE(uncompressedSize >>> 0, 22);
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(extra.length, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.versionMadeBy ?? ((3 << 8) | 20), 4);
    central.writeUInt16LE(versionNeeded, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedSize >>> 0, 20);
    central.writeUInt32LE(uncompressedSize >>> 0, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(externalAttr, 38);
    central.writeUInt32LE((e.localOffset ?? offset) >>> 0, 42);

    locals.push(local, localName, extra, comp);
    centrals.push(central, nameBuf, extra);
    offset += 30 + localName.length + extra.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const comment = Buffer.from(options.comment || '', 'latin1');
  const o = options.eocd || {};
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(o.diskNo ?? 0, 4);
  eocd.writeUInt16LE(o.cdDisk ?? 0, 6);
  eocd.writeUInt16LE(o.entriesDisk ?? entries.length, 8);
  eocd.writeUInt16LE(o.entriesTotal ?? entries.length, 10);
  eocd.writeUInt32LE((o.cdSize ?? cd.length) >>> 0, 12);
  eocd.writeUInt32LE((o.cdOffset ?? offset) >>> 0, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([prefix, ...locals, cd, eocd, comment, options.suffix || Buffer.alloc(0)]);
}

/** A small, valid CC0-style pack: two PNGs in a folder plus a license file. */
export function samplePack() {
  return [
    { name: 'pack/' },
    { name: 'pack/tile_0001.png', data: png('a') },
    { name: 'pack/tile_0002.png', data: png('b'), method: 0 },
    { name: 'License.txt', data: 'Creative Commons Zero, CC0 1.0 Universal\n' },
  ];
}
