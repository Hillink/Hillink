// Pass 5D-A: light and materials for the Real World visual prototype.
//
// One directional sun (from the front left, high), one sky ambient, and a small set of named materials. Every surface
// is shaded from its orientation to that sun (tops brightest, faces toward the viewer lit, right-hand faces in shade),
// so objects read as volumes without the black outlines of the old art. Edges get a thin catch-light on top and a
// soft darkening where they meet the ground (ambient occlusion). Shadows fall back and to the right (SUN below) and are
// baked once for everything that does not move (see shadows.mjs). The same numbers would drive other times of day.

// Plan-space shadow offset per unit of height: shadows fall toward +x (right) and +z (into the picture).
export const SUN = { sx: 0.62, sz: 0.46 };
// Brightness of each visible face under the sun, and the sky's cool fill in the shade.
export const FACE = { top: 1.06, front: 0.92, side: 0.74 };
export const SHADOW = 'rgba(28,44,74,0.30)';

// The material vocabulary: [base colour, grain/texture colour]. Cool, clean daylight; Hillink blue as the accent.
export const MAT = {
  sky: ['#cfe3f4', '#eef5fb'],
  grass: ['#78a453', '#6a9749'], grassDry: ['#a4ad69', '#8ea456'], lawn: ['#82b35b', '#75a852'], meadow: ['#66924a', '#94b865'],
  soil: ['#a88965', '#8f7152'], mulch: ['#6f5543', '#5b4535'], gravel: ['#b9b3a7', '#a39d91'],
  asphalt: ['#4b525c', '#434951'], asphaltEdge: ['#5a626c', '#525962'], lineWhite: ['#eef1f4', '#dfe3e8'], lineYellow: ['#f2c94c', '#e0b73e'],
  concrete: ['#d9dbdc', '#c9cccd'], concreteDark: ['#b7babd', '#a7abaf'], paver: ['#d4cfc6', '#c2bcb2'], curb: ['#eceeef', '#d9dcde'],
  facade: ['#eef0f1', '#e2e5e7'], facadeWarm: ['#e9e4dc', '#ddd6cc'], plaster: ['#f3f1ec', '#e7e3db'],
  steel: ['#2f3844', '#262e38'], steelLight: ['#8a96a4', '#7a8694'], aluminium: ['#c5ccd4', '#b3bbc4'],
  glass: ['#9cc6e2', '#cfe6f5'], glassDark: ['#5f86a6', '#7fa4c2'],
  wood: ['#c19566', '#a97f55'], woodDark: ['#8a6242', '#74513a'], oak: ['#d2ab7a', '#bd9463'],
  carpet: ['#a9b4c2', '#9ba7b6'], carpetBlue: ['#7f96b8', '#7289ad'], tile: ['#e4e6e8', '#d3d6d9'], polished: ['#cfd2d4', '#c3c6c9'],
  fabric: ['#5d7896', '#4f6886'], fabricWarm: ['#c7a07a', '#b38c66'], fabricGrey: ['#8e969f', '#7f8790'], leather: ['#7a5a44', '#664a38'],
  white: ['#f6f7f8', '#e9ebed'], screen: ['#1c2733', '#2b3a4a'], brand: ['#2f7df6', '#1e63d6'], brandSoft: ['#9cc2fb', '#7fb0fa'],
  foliage: ['#5f9a45', '#4c8538'], foliageLight: ['#86bd57', '#73aa48'], foliageDark: ['#3f7a3a', '#346a31'], conifer: ['#3f7a55', '#326a47'],
  bark: ['#7a5b43', '#654a36'], birch: ['#ece8df', '#d9d3c7'], water: ['#6aa8d0', '#8fc1e0'], rock: ['#a9a8a2', '#94938d'],
};
export const colorOf = c => (Array.isArray(c) ? c[0] : MAT[c]?.[0] ?? c);

// Colour arithmetic: scale brightness, mix two colours (hex or rgb()).
const parse = c => { if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; } const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2]]; };
const hex = ([r, g, b]) => `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;
const cache = new Map();
export function lit(c, k) {
  const key = `${c}|${k}`; let v = cache.get(key); if (v) return v;
  const [r, g, b] = parse(c);
  // Shade toward a cool sky blue rather than black; light toward warm white: daylight, not a flat multiply.
  v = k >= 1 ? hex([r + (255 - r) * (k - 1) * 1.4, g + (250 - g) * (k - 1) * 1.4, b + (240 - b) * (k - 1) * 1.2]) : hex([r * k + 18 * (1 - k), g * k + 26 * (1 - k), b * k + 48 * (1 - k)]);
  cache.set(key, v); if (cache.size > 4000) cache.clear();
  return v;
}
export function mix(a, b, k) { const A = parse(a), B = parse(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); }

function path(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
export function fillPoly(ctx, pts, fill) { path(ctx, pts); ctx.fillStyle = fill; ctx.fill(); }

// A lit box on a floor. c: a colour or material name, or { front, side, top } colours (each lit by its face).
// Draws the three faces the camera sees, a catch-light on the top edges, and ground occlusion at the foot of the
// vertical faces (only when the box stands on the floor).
export function litBox(d, f, { x0, x1, z0, z1, h0 = 0, h1 }, c, { alpha = 1, ao = true, edge = true, top: withTop = true } = {}) {
  const { ctx, P } = d, p = (x, z, h) => P.at(x, z, f, h);
  const base = typeof c === 'string' ? colorOf(c) : null;
  // One base colour is shaded per face by the sun; a { front, top } pair keeps a different top material (a desk top).
  const fr = base ?? colorOf(c.front), col = { front: lit(fr, FACE.front), side: lit(fr, FACE.side), top: base ? lit(base, FACE.top) : c.top ? lit(colorOf(c.top), 1) : lit(fr, FACE.top) };
  const h = h1 - h0;
  ctx.save(); if (alpha !== 1) ctx.globalAlpha *= alpha;
  const side = [p(x1, z0, h0), p(x1, z1, h0), p(x1, z1, h1), p(x1, z0, h1)], top = [p(x0, z0, h1), p(x1, z0, h1), p(x1, z1, h1), p(x0, z1, h1)], front = [p(x0, z0, h0), p(x1, z0, h0), p(x1, z0, h1), p(x0, z0, h1)];
  if (h > 0.01) fillPoly(ctx, side, col.side);
  if (withTop) fillPoly(ctx, top, col.top);
  if (h > 0.01) fillPoly(ctx, front, col.front);
  if (ao && h0 === 0 && h > 3 && !d.reduced) {
    // Contact darkening at the foot of each face: a short gradient, strongest where the box meets the floor.
    const k = Math.min(h, 10);
    for (const face of [front, side]) {
      const [a, b] = [face[0], face[1]], g = ctx.createLinearGradient(a[0], a[1], a[0], a[1] - k);
      g.addColorStop(0, 'rgba(20,30,50,0.22)'); g.addColorStop(1, 'rgba(20,30,50,0)');
      ctx.fillStyle = g; path(ctx, [a, b, [b[0], b[1] - k], [a[0], a[1] - k]]); ctx.fill();
    }
  }
  if (edge && h > 0.5) {
    ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath(); ctx.moveTo(...p(x0, z0, h1)); ctx.lineTo(...p(x1, z0, h1)); ctx.lineTo(...p(x1, z1, h1)); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,28,45,0.18)'; ctx.beginPath(); ctx.moveTo(...p(x1, z0, h0)); ctx.lineTo(...p(x1, z0, h1)); ctx.stroke();
  }
  ctx.restore();
}
// A lit sphere-ish blob (canopies, cushions): a soft radial gradient from the sun-facing side.
export function litBlob(ctx, x, y, r, base, { alpha = 1, squash = 1 } = {}) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4 * squash, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, lit(base, 1.12)); g.addColorStop(0.55, base); g.addColorStop(1, lit(base, 0.72));
  ctx.save(); if (alpha !== 1) ctx.globalAlpha *= alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * squash, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
// A soft elliptical shadow on the ground (for things that move: people, cars), offset away from the sun.
export function softShadow(ctx, x, y, rx, ry, { alpha = 0.26, dx = 0, dy = 0 } = {}) {
  ctx.save(); ctx.translate(x + dx, y + dy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(24,38,64,${alpha})`); g.addColorStop(0.6, `rgba(24,38,64,${alpha * 0.6})`); g.addColorStop(1, 'rgba(24,38,64,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
