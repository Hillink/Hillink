// Pass 5H vertical slice: a minimal PNG encoder for PixelBuffers (node only: the harness and its evidence). An integer
// upscale factor reproduces what the screen shows (nearest neighbour).
import zlib from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length), t = Buffer.from(type, 'ascii');
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
export function encodePNG(buf, scale = 1, background = 0xff000000) {
  const k = Math.max(1, scale | 0), W = buf.w * k, H = buf.h * k, raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 4 + 1); raw[row] = 0;
    for (let x = 0; x < W; x++) {
      const c = buf.data[Math.floor(y / k) * buf.w + Math.floor(x / k)] || background, o = row + 1 + x * 4;
      raw[o] = c & 255; raw[o + 1] = (c >>> 8) & 255; raw[o + 2] = (c >>> 16) & 255; raw[o + 3] = c >>> 24;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// Art Factory Step 1: a minimal PNG decoder (node only: tests and the harness read generated sheets). 8-bit RGBA or
// RGB, not interlaced: what the factory writes. Anything else is refused rather than guessed.
export function decodePNG(bytes) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('not a PNG');
  let o = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (crc32(b.subarray(o + 4, o + 8 + len)) !== b.readUInt32BE(o + 8 + len)) throw Error(`PNG chunk ${t} CRC mismatch`);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || ![2, 6].includes(type) || d[12] !== 0) throw Error('only 8-bit RGB/RGBA non-interlaced PNGs are supported'); }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * h) throw Error('PNG data length mismatch');
  const px = Buffer.alloc(stride * h), data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, up = y ? px[row - stride + x] : 0, c = y && x >= bpp ? px[row - stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? up : c) : NaN;
      if (Number.isNaN(pred)) throw Error(`PNG filter ${f}`);
      px[row + x] = (src[x] + pred) & 255;
    }
  }
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) { data[i * 4] = px[j]; data[i * 4 + 1] = px[j + 1]; data[i * 4 + 2] = px[j + 2]; data[i * 4 + 3] = bpp === 4 ? px[j + 3] : 255; }
  return { width: w, height: h, data };
}
