// Pass 5H vertical slice: the pixel pipeline's raster. A PixelBuffer is a low-resolution art buffer of 32-bit RGBA
// pixels (Uint32Array, byte order R,G,B,A, so it maps straight onto ImageData). Everything the slice draws in the
// World is rasterized here, in pure JavaScript, with integer coordinates and no anti-aliasing, so the same state gives
// the same pixels in a browser and in node (the harness, the determinism hashes). The screen shows the buffer
// upscaled by an integer factor with nearest-neighbour sampling.
//
// Pixel rules: a pixel belongs to a shape when its centre (x + 0.5, y + 0.5) is inside it. Sprites have binary alpha
// (0 or 255); light is added with addGlow (additive, clamped). No primitive here reads time or randomness.

export const TRANSPARENT = 0;
export const rgba = (r, g, b, a = 255) => ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
export const hex = h => { const n = parseInt(h.slice(1, 7), 16); return rgba(n >> 16, (n >> 8) & 255, n & 255, 255); };
export const R = c => c & 255, G = c => (c >>> 8) & 255, B = c => (c >>> 16) & 255, A = c => c >>> 24;
export const toHex = c => `#${[R(c), G(c), B(c)].map(v => v.toString(16).padStart(2, '0')).join('')}`;

export class PixelBuffer {
  constructor(w, h) { this.w = Math.max(1, w | 0); this.h = Math.max(1, h | 0); this.data = new Uint32Array(this.w * this.h); }
  clear(c = TRANSPARENT) { this.data.fill(c); return this; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? TRANSPARENT : this.data[y * this.w + x]; }
  set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) this.data[y * this.w + x] = c; }
  rect(x, y, w, h, c) {
    if (!c) return;
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let j = y0; j < y1; j++) this.data.fill(c, j * this.w + x0, j * this.w + Math.max(x0, x1));
  }
  hline(x0, x1, y, c) { this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c); }
  // Bresenham line, inclusive ends.
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Filled ellipse by pixel centres.
  ellipse(cx, cy, rx, ry, c) {
    if (!c || rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = (y + 0.5 - cy) / ry; if (Math.abs(t) > 1) continue;
      const half = rx * Math.sqrt(1 - t * t), x0 = Math.ceil(cx - half - 0.5), x1 = Math.floor(cx + half - 0.5);
      for (let x = x0; x <= x1; x++) this.set(x, y, c);
    }
  }
  // Filled polygon (any simple polygon) by pixel centres, even-odd.
  poly(pts, c, shader = null) {
    if (!c && !shader) return;
    const ys = pts.map(p => p[1]), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + (sy - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) { const col = shader ? shader(x, y) : c; if (col) this.data[y * this.w + x] = col; }
      }
    }
  }
  // Copy another buffer in (binary alpha: transparent source pixels are skipped). flip mirrors it horizontally.
  blit(src, dx, dy, { flip = false, map = null } = {}) {
    dx = Math.round(dx); dy = Math.round(dy);
    const sw = src.w, x0 = Math.max(0, -dx), x1 = Math.min(sw, this.w - dx), y0 = Math.max(0, -dy), y1 = Math.min(src.h, this.h - dy);
    for (let y = y0; y < y1; y++) {
      const so = y * sw, d = (y + dy) * this.w + dx;
      for (let x = x0; x < x1; x++) { let c = src.data[so + (flip ? sw - 1 - x : x)]; if (!c) continue; if (map) c = map(c); this.data[d + x] = c; }
    }
  }
  // Additive light: each source pixel's RGB (times k) is added to the destination, clamped.
  addGlow(src, dx, dy, k = 1) {
    dx = Math.round(dx); dy = Math.round(dy);
    const x0 = Math.max(0, -dx), x1 = Math.min(src.w, this.w - dx), y0 = Math.max(0, -dy), y1 = Math.min(src.h, this.h - dy);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const s = src.data[y * src.w + x]; if (!s) continue;
      const i = (y + dy) * this.w + dx + x, d = this.data[i];
      this.data[i] = rgba(Math.min(255, R(d) + R(s) * k), Math.min(255, G(d) + G(s) * k), Math.min(255, B(d) + B(s) * k), 255);
    }
  }
  // Copy a window of this buffer into dst at (dx, dy) (opaque copy, used for the cached static ground).
  copyTo(dst, sx, sy, w, h, dx = 0, dy = 0) {
    for (let y = 0; y < h; y++) {
      const ty = dy + y, fy = sy + y; if (ty < 0 || ty >= dst.h || fy < 0 || fy >= this.h) continue;
      const a = Math.max(0, -sx, -dx), b = Math.min(w, this.w - sx, dst.w - dx); if (b <= a) continue;
      dst.data.set(this.data.subarray(fy * this.w + sx + a, fy * this.w + sx + b), ty * dst.w + dx + a);
    }
  }
  // Selective outline ("selout"): every transparent pixel touching an opaque one (4-neighbour) becomes a darker
  // version of that neighbour, darkest under the shape. Returns a new, 2 px larger buffer.
  outlined({ dark = 0.38, bottom = 0.26, ink = null } = {}) {
    const o = new PixelBuffer(this.w + 2, this.h + 2);
    o.blit(this, 1, 1);
    const src = o.data.slice();
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (src[y * o.w + x]) continue;
      const up = y > 0 ? src[(y - 1) * o.w + x] : 0, dn = y < o.h - 1 ? src[(y + 1) * o.w + x] : 0, lf = x > 0 ? src[y * o.w + x - 1] : 0, rt = x < o.w - 1 ? src[y * o.w + x + 1] : 0;
      const n = up || lf || rt || dn; if (!n) continue;
      o.data[y * o.w + x] = ink ?? scale(n, up ? bottom : dark);
    }
    return o;
  }
  // A stable fingerprint of the pixels (FNV-1a over the words), for determinism tests.
  hash() { let h = 0x811c9dc5; for (let i = 0; i < this.data.length; i++) { h ^= this.data[i]; h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0') + `:${this.w}x${this.h}`; }
  // Opaque pixel bounds (or null).
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.data[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
}
export const scale = (c, k) => rgba(Math.min(255, R(c) * k), Math.min(255, G(c) * k), Math.min(255, B(c) * k), A(c));
export const mixc = (a, b, t) => rgba(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, B(a) + (B(b) - B(a)) * t, 255);
// Deterministic hash noise in [0, 1) for integer coordinates and a salt.
export function noise(x, y, salt = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// An ordered 4x4 Bayer threshold in [0, 1), for dithered light falloff.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
