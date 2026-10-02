// Small colour helpers shared by the HQ look.
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const cache = {};
export function rgbOf(h) {
  if (cache[h]) return cache[h];
  let s = h.replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return (cache[h] = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]);
}
export const glowCol = (h, a) => { const c = rgbOf(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
export function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function glow(ctx, x, y, r, col, a = 1) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, glowCol(col, a)); gr.addColorStop(1, glowCol(col, 0));
  ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
