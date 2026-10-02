// Pass 5D-A: procedural textures. Small tileable patterns (planks, carpet tiles, pavers, asphalt grain, grass blades)
// generated once from code, never loaded from files, and drawn on the floor plane through planMatrix(), so a plank
// runs along the floor in perspective instead of lying flat on the screen. Everything is created lazily in the browser;
// under Node (tests) nothing here runs.
import { MAT, lit, mix } from './light.mjs';

export const makeCanvas = (w, h) => { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// Deterministic value noise in [0, 1).
export const hash2 = (x, y, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
export function noise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, s = 0, oct = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += a * noise(x * f, y * f, s + i * 13); f *= 2; a *= 0.5; } return v / (1 - 0.5 ** oct); };

// The affine map from plan (x, z) on storey f to the screen (P.at with h = 0 is affine): ctx.transform(...planMatrix).
export function planMatrix(P, f = 0) { const g = P.g; return P.m ? [...P.m, 0, P.baseOf(f)] : [1, 0, g.skx, -g.sky, 0, P.baseOf(f)]; }

const cache = new Map();
function pattern(ctx, key, size, paint, scale = 0.5) {
  let e = cache.get(key);
  if (!e) { const c = makeCanvas(size, size), g = c.getContext('2d'); paint(g, size); e = { c }; cache.set(key, e); }
  const p = ctx.createPattern(e.c, 'repeat');
  if (p && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(scale));
  return p;
}
const speckle = (g, size, n, colors, r = 1, s = 0) => { for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.globalAlpha = 0.25 + hash2(i, 3, s) * 0.35; g.fillRect(hash2(i, 1, s) * size, hash2(i, 2, s) * size, r, r); } g.globalAlpha = 1; };

// Each returns a pattern for plan space (1 pattern pixel = `scale` plan units).
export const TEX = {
  oak(ctx) {
    return pattern(ctx, 'oak', 128, (g, S) => {
      const plank = 16; // 0.28 m boards (at 0.5 units per pixel)
      for (let y = 0, row = 0; y < S; y += plank, row++) {
        const off = (row * 47) % S;
        for (let x = -off; x < S; x += 96) {
          const tone = mix(MAT.oak[0], MAT.oak[1], hash2(x, row, 1) * 0.8);
          g.fillStyle = tone; g.fillRect(x, y, 96, plank);
          g.globalAlpha = 0.18; g.strokeStyle = MAT.woodDark[0]; g.lineWidth = 1;
          for (let k = 0; k < 3; k++) { g.beginPath(); const yy = y + 3 + k * 4 + hash2(x, k, row) * 2; g.moveTo(x, yy); g.bezierCurveTo(x + 30, yy + 1, x + 60, yy - 1, x + 96, yy); g.stroke(); }
          g.globalAlpha = 1; g.fillStyle = 'rgba(90,60,35,0.35)'; g.fillRect(x, y, 1, plank);
        }
        g.fillStyle = 'rgba(90,60,35,0.3)'; g.fillRect(0, y + plank - 1, S, 1);
      }
    });
  },
  carpet(ctx, tone = 'carpet') {
    return pattern(ctx, `carpet-${tone}`, 128, (g, S) => {
      const t = 32; // 0.55 m carpet tiles
      for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) { g.fillStyle = ((x + y) / t) % 2 ? MAT[tone][0] : mix(MAT[tone][0], MAT[tone][1], 0.6); g.fillRect(x, y, t, t); }
      speckle(g, S, 900, [lit(MAT[tone][0], 1.15), lit(MAT[tone][0], 0.85)], 1, 7);
      g.fillStyle = 'rgba(40,50,70,0.10)'; for (let k = 0; k < S; k += t) { g.fillRect(k, 0, 1, S); g.fillRect(0, k, S, 1); }
    });
  },
  polished(ctx) {
    return pattern(ctx, 'polished', 256, (g, S) => {
      const img = g.createImageData(S, S), [r, gg, b] = [207, 210, 212];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const n = (fbm(x / 40, y / 40, 5, 3) - 0.5) * 22 + (hash2(x, y, 9) - 0.5) * 6, i = (y * S + x) * 4; img.data[i] = r + n; img.data[i + 1] = gg + n; img.data[i + 2] = b + n; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(80,90,100,0.12)'; for (let k = 0; k < S; k += 128) { g.fillRect(k, 0, 1, S); g.fillRect(0, k, S, 1); } // saw cuts
    });
  },
  tile(ctx) {
    return pattern(ctx, 'tile', 128, (g, S) => {
      const t = 32;
      for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) { g.fillStyle = mix(MAT.tile[0], MAT.tile[1], hash2(x, y, 2) * 0.5); g.fillRect(x, y, t, t); }
      g.fillStyle = 'rgba(120,128,138,0.35)'; for (let k = 0; k < S; k += t) { g.fillRect(k, 0, 1, S); g.fillRect(0, k, S, 1); }
    });
  },
  pavers(ctx) {
    return pattern(ctx, 'pavers', 128, (g, S) => {
      const w = 32, h = 16;
      for (let y = 0, row = 0; y < S; y += h, row++) for (let x = (row % 2) * (w / 2) - w; x < S; x += w) { g.fillStyle = mix(MAT.paver[0], MAT.paver[1], hash2(x, row, 4) * 0.8); g.fillRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      g.fillStyle = 'rgba(110,100,88,0.35)'; for (let y = 0; y < S; y += h) g.fillRect(0, y, S, 1);
    });
  },
  asphalt(ctx) {
    return pattern(ctx, 'asphalt', 128, (g, S) => { g.fillStyle = MAT.asphalt[0]; g.fillRect(0, 0, S, S); speckle(g, S, 1400, ['#5d646e', '#3d434b', '#6a717b'], 1, 11); });
  },
  gravel(ctx) {
    return pattern(ctx, 'gravel', 96, (g, S) => { g.fillStyle = MAT.gravel[0]; g.fillRect(0, 0, S, S); speckle(g, S, 900, ['#d0cbc0', '#948e83', '#aaa498'], 2, 13); });
  },
  grass(ctx) {
    // Fine blades over the baked ground colour (drawn with low alpha, so the base variation shows through).
    return pattern(ctx, 'grass', 128, (g, S) => {
      g.clearRect(0, 0, S, S);
      for (let i = 0; i < 700; i++) { const x = hash2(i, 1, 21) * S, y = hash2(i, 2, 21) * S, l = 2 + hash2(i, 3, 21) * 4; g.strokeStyle = hash2(i, 4, 21) > 0.5 ? 'rgba(40,80,25,0.5)' : 'rgba(190,225,140,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash2(i, 5, 21) - 0.5) * 2, y - l); g.stroke(); }
    }, 0.6);
  },
};
