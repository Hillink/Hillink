// Pass 5H: the kingdom's set dressing. Small props (barrels, crates, torches, banners, books, candles, potions, chests,
// crystals, statues, plants...) drawn in the shared visual rules (one ink outline, light from the upper left, warm light
// sources that glow), and a deterministic placer that fills each district's quiet edges with the props of its trade.
//
// Dressing is COSMETIC and static: it is computed once from the layout (district rectangles, solids, stations, doors) and
// never from World state, and it never moves. It only goes where no walk goes: the band along a district's far wall and
// the strips along its side walls (world/kingdom-layout.mjs keeps every station and every entry-to-station walk nearer the
// door than its solids), keeping clear of solids, stations, doors, construction plots and each other.
import { prism, poly, glow, shade, INK } from '../props.mjs';

const TAU = Math.PI * 2;
export const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const col = c => ({ front: c, side: shade(c, 0.78), top: shade(c, 1.12) });

// Footprints (plan units: w across, d deep, h tall). A character is 50 tall.
export const KPROP_SIZE = {
  barrel: [16, 16, 22], crate: [18, 16, 16], crates: [26, 20, 28], sack: [14, 11, 11], 'torch-stand': [8, 8, 44], lantern: [8, 8, 52],
  'banner-pole': [10, 6, 64], candles: [12, 9, 9], books: [16, 11, 10], 'potion-shelf': [42, 10, 48], 'scroll-rack': [34, 10, 42],
  'weapon-rack': [38, 10, 40], 'tool-rack': [34, 10, 40], chest: [24, 15, 15], coins: [18, 12, 7], 'gold-bars': [16, 10, 8], statue: [22, 22, 62],
  crystals: [16, 14, 26], plant: [14, 14, 22], bush: [26, 18, 18], flowers: [24, 12, 8], cauldron: [20, 20, 16], hay: [24, 15, 14], logs: [32, 14, 13],
  stones: [24, 20, 16], globe: [16, 16, 28], 'star-chart': [26, 8, 40], bench: [36, 11, 11], grindstone: [18, 12, 20], bucket: [9, 9, 9], 'rune-stone': [11, 9, 26],
  pipes: [40, 12, 34], 'lumber': [40, 16, 10], anvil: [20, 12, 16], 'ale-keg': [20, 14, 18], armor: [16, 12, 50],
};

// Props a district's trade calls for, most characteristic first (the placer takes as many as fit).
export const DISTRICT_DRESSING = {
  gatehouse: ['weapon-rack', 'torch-stand', 'barrel', 'hay', 'crate', 'torch-stand', 'banner-pole', 'barrel', 'armor', 'bucket', 'sack', 'flowers'],
  circle: ['rune-stone', 'candles', 'rune-stone', 'crystals', 'candles', 'torch-stand', 'rune-stone', 'candles'],
  forge: ['tool-rack', 'barrel', 'crates', 'logs', 'grindstone', 'torch-stand', 'weapon-rack', 'sack', 'bucket', 'anvil', 'crate', 'barrel', 'armor', 'sack'],
  commons: ['bench', 'ale-keg', 'flowers', 'lantern', 'barrel', 'bench', 'hay', 'plant', 'crate', 'flowers', 'bush', 'bucket'],
  academy: ['scroll-rack', 'books', 'banner-pole', 'globe', 'bench', 'candles', 'books', 'plant', 'crate', 'torch-stand', 'books'],
  yard: ['stones', 'lumber', 'crates', 'logs', 'sack', 'barrel', 'stones', 'crate', 'hay', 'lumber', 'bucket', 'sack'],
  library: ['books', 'candles', 'scroll-rack', 'globe', 'books', 'plant', 'statue', 'candles', 'books', 'crate', 'books'],
  tower: ['potion-shelf', 'candles', 'crystals', 'books', 'cauldron', 'rune-stone', 'candles', 'crystals', 'books', 'plant'],
  keep: ['statue', 'statue', 'plant', 'chest', 'torch-stand', 'torch-stand', 'plant', 'armor', 'armor', 'candles'],
  vault: ['chest', 'coins', 'chest', 'gold-bars', 'crates', 'coins', 'chest', 'torch-stand', 'sack', 'coins', 'gold-bars'],
  dome: ['globe', 'star-chart', 'books', 'candles', 'crystals', 'scroll-rack', 'books', 'plant'],
  engine: ['pipes', 'crystals', 'rune-stone', 'crates', 'pipes', 'lantern', 'crystals', 'barrel', 'bucket'],
};
// Wall pieces for roofed halls (back row): hung on the far wall.
export const WALL_DRESSING = {
  library: ['banner', 'torch', 'window', 'torch'], tower: ['torch', 'window', 'banner', 'torch'], keep: ['banner', 'torch', 'banner', 'torch', 'banner', 'window'],
  vault: ['torch', 'banner', 'torch'], dome: ['window', 'torch', 'window'], engine: ['torch', 'window', 'torch'],
};
const BANNER_COLORS = { library: '#2a4f8e', tower: '#5b2a86', keep: '#8e2a2a', vault: '#2f5e39', dome: '#2a4f8e', engine: '#3f4250' };

// ---- Placement (pure, deterministic). ----
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
// Does a walk (a straight nav edge, plan units) pass within m of the rectangle?
const segHits = (r, [a, b], m) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4)); for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true; } return false; };
export function dressDistrict(D, { solids = [], stations = [], plots = [], zones = [], walks = [] } = {}) {
  const list = DISTRICT_DRESSING[D.structure] ?? [];
  const W = D.x1 - D.x0, Dp = D.z1 - D.z0, far = D.inward > 0 ? D.z1 : D.z0, door = D.inward > 0 ? D.z0 : D.z1, s = D.inward;
  const pad = 10, inset = D.row === 'back' ? 14 : 12; // clear of the wall or fence
  // Candidate anchor points: the far band (two rows) and the two side strips (back 70%).
  const cands = [];
  for (let fx = 0.04; fx <= 0.96; fx += 0.055) cands.push({ x: D.x0 + W * fx, z: far - s * inset, band: 'far' });
  for (let fx = 0.06; fx <= 0.94; fx += 0.08) cands.push({ x: D.x0 + W * fx, z: far - s * (inset + 26), band: 'far2' });
  for (let k = 0.3; k <= 0.92; k += 0.07) for (const x of [D.x0 + inset, D.x1 - inset]) cands.push({ x, z: door + s * Dp * k, band: 'side' });
  cands.forEach((c, i) => (c.r = hash(i * 1.37 + W * 0.01 + D.x0 * 0.003)));
  cands.sort((a, b) => (a.band === 'far' ? 0 : a.band === 'side' ? 1 : 2) - (b.band === 'far' ? 0 : b.band === 'side' ? 1 : 2) || a.r - b.r);
  const out = [];
  const inside = r => r.x0 >= D.x0 + 4 && r.x1 <= D.x1 - 4 && r.z0 >= D.z0 + 4 && r.z1 <= D.z1 - 4;
  const doorGap = { x0: (D.x0 + D.x1) / 2 - 44, x1: (D.x0 + D.x1) / 2 + 44, z0: Math.min(door, door + s * 90), z1: Math.max(door, door + s * 90) };
  list.forEach((kind, n) => {
    const [w, dd, h] = KPROP_SIZE[kind] ?? [16, 16, 16];
    for (const c of cands) {
      if (c.used) continue;
      const along = c.band === 'side' ? { w: dd, d: w } : { w, d: dd }; // side strips turn props to face inward
      const r = { x0: c.x - along.w / 2, x1: c.x + along.w / 2, z0: c.z - along.d / 2, z1: c.z + along.d / 2 };
      if (!inside(r) || overlap(r, doorGap)) continue;
      if (solids.some(o => overlap(r, o, 8)) || plots.some(o => overlap(r, o, 10)) || zones.some(o => overlap(r, o, 2))) continue;
      if (walks.some(w => segHits(r, w, 16))) continue;
      if (stations.some(p => p.x > r.x0 - 26 && p.x < r.x1 + 26 && p.z > r.z0 - 26 && p.z < r.z1 + 26)) continue;
      if (out.some(o => overlap(r, o, pad * 0.4))) continue;
      c.used = true; out.push({ kind, ...r, h, turned: c.band === 'side', seed: n + c.r, district: D.id });
      break;
    }
  });
  return out;
}

// ---- Drawers: (d, p) with p = { x0, x1, z0, z1, h, turned, seed }. d = { ctx, P, T, reduced }. ----
const cx = p => (p.x0 + p.x1) / 2, cz = p => (p.z0 + p.z1) / 2;
function cyl(d, x, z, r, h0, h1, c, { top, bands } = {}) {
  const { ctx, P } = d, [ax, ay] = P.at(x, z, 0, h0), [, by] = P.at(x, z, 0, h1), ry = r * 0.42;
  ctx.beginPath(); ctx.moveTo(ax - r, by); ctx.lineTo(ax - r, ay); ctx.ellipse(ax, ay, r, ry, 0, Math.PI, 0, true); ctx.lineTo(ax + r, by); ctx.closePath();
  const g = ctx.createLinearGradient(ax - r, 0, ax + r, 0); g.addColorStop(0, shade(c, 1.1)); g.addColorStop(0.5, c); g.addColorStop(1, shade(c, 0.7)); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  for (const k of bands ?? []) { const [, yy] = P.at(x, z, 0, h0 + (h1 - h0) * k); ctx.beginPath(); ctx.ellipse(ax, yy, r, ry, 0, 0, Math.PI); ctx.strokeStyle = 'rgba(40,30,20,0.8)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(ax, by, r, ry, 0, 0, TAU); ctx.fillStyle = top ?? shade(c, 1.15); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
}
export function flame(d, x, y, s, t = 0) {
  const { ctx } = d, k = d.reduced ? 1 : 1 + 0.18 * Math.sin(d.T * 11 + x + t);
  ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.quadraticCurveTo(x - s * 0.5, y - s * 1.2 * k, x, y - s * 1.9 * k); ctx.quadraticCurveTo(x + s * 0.5, y - s * 1.2 * k, x + s * 0.6, y); ctx.fill();
  ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.quadraticCurveTo(x, y - s * 1.2 * k, x + s * 0.3, y); ctx.fill();
}
const warm = (d, x, y, r, a = 0.35) => glow(d, x, y, r * (d.reduced ? 1 : 1 + 0.05 * Math.sin(d.T * 7 + x)), `rgba(255,170,70,${a})`);
const at = (d, x, z, h) => d.P.at(x, z, 0, h);

export const KPROPS = {
  barrel(d, p) { cyl(d, cx(p), cz(p), (p.x1 - p.x0) / 2, 0, p.h, '#8a5530', { top: '#a86f40', bands: [0.18, 0.82] }); },
  'ale-keg'(d, p) { prism(d, 0, { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, h1: 6 }, col('#5b3a22')); cyl(d, cx(p), cz(p), (p.x1 - p.x0) / 2.4, 6, p.h, '#9b6232', { bands: [0.2, 0.8] }); const [sx, sy] = at(d, cx(p), p.z0, p.h * 0.5); d.ctx.fillStyle = '#c8a24a'; d.ctx.fillRect(sx - 1.5, sy - 1, 3, 4); },
  bucket(d, p) { cyl(d, cx(p), cz(p), 4.5, 0, p.h, '#7a5534', { top: '#3f6f8f', bands: [0.5] }); },
  crate(d, p) { crate(d, p.x0, p.x1, p.z0, p.z1, 0, p.h); },
  crates(d, p) { const mx = cx(p); crate(d, p.x0, mx + 2, p.z0, p.z1, 0, p.h * 0.55); crate(d, mx - 1, p.x1, p.z0 + 2, p.z1, 0, p.h * 0.5); crate(d, p.x0 + 4, mx + 6, p.z0 + 3, p.z1 - 2, p.h * 0.55, p.h); },
  sack(d, p) { const [sx, sy] = at(d, cx(p), cz(p), 0), w = (p.x1 - p.x0) / 2; poly(d.ctx, [[sx - w, sy], [sx - w * 0.9, sy - p.h * 0.7], [sx - w * 0.3, sy - p.h * 1.05], [sx + w * 0.3, sy - p.h * 1.05], [sx + w * 0.9, sy - p.h * 0.7], [sx + w, sy]], '#c9ad7a', INK, 0.8); d.ctx.strokeStyle = '#7a5534'; d.ctx.lineWidth = 1; d.ctx.beginPath(); d.ctx.moveTo(sx - w * 0.35, sy - p.h * 0.9); d.ctx.lineTo(sx + w * 0.35, sy - p.h * 0.9); d.ctx.stroke(); },
  hay(d, p) { prism(d, 0, { ...p, h1: p.h }, col('#d6b25e')); d.ctx.strokeStyle = 'rgba(120,90,30,0.55)'; d.ctx.lineWidth = 0.7; for (let k = 1; k < 5; k++) { const x = p.x0 + (p.x1 - p.x0) * k / 5; d.ctx.beginPath(); d.ctx.moveTo(...at(d, x, p.z0, 1)); d.ctx.lineTo(...at(d, x, p.z0, p.h - 1)); d.ctx.stroke(); } },
  logs(d, p) { const n = 3; for (let k = 0; k < n; k++) { const z = p.z0 + (p.z1 - p.z0) * (k + 0.5) / n, h = k === 1 ? 4.5 : 4.5; lying(d, p.x0, p.x1, z, h + (k === 1 ? 7 : 0), 4.5, '#7a4a26', '#c99a64'); } },
  lumber(d, p) { for (let k = 0; k < 3; k++) prism(d, 0, { x0: p.x0, x1: p.x1, z0: p.z0 + k * 4, z1: p.z0 + k * 4 + 12, h0: k * 3.3, h1: k * 3.3 + 3.3 }, col(k % 2 ? '#c99a64' : '#b8864f')); },
  stones(d, p) { prism(d, 0, { x0: p.x0, x1: cx(p) + 1, z0: p.z0, z1: p.z1, h1: p.h * 0.55 }, col('#a9a293')); prism(d, 0, { x0: cx(p) - 1, x1: p.x1, z0: p.z0 + 2, z1: p.z1, h1: p.h * 0.5 }, col('#9a9384')); prism(d, 0, { x0: p.x0 + 5, x1: cx(p) + 5, z0: p.z0 + 4, z1: p.z1 - 3, h0: p.h * 0.55, h1: p.h }, col('#b3ad9f')); },
  'torch-stand'(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: x - 1.6, x1: x + 1.6, z0: z - 1.6, z1: z + 1.6, h1: p.h - 6 }, col('#4a3220')); cyl(d, x, z, 3.5, p.h - 8, p.h - 4, '#5a5f69'); const [sx, sy] = at(d, x, z, p.h - 4); warm(d, sx, sy - 4, 34, 0.4); flame(d, sx, sy, 4.5, p.seed); },
  lantern(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4, h1: p.h }, col('#2f2f35')); const [sx, sy] = at(d, x + 5, z, p.h - 4); d.ctx.strokeStyle = '#2f2f35'; d.ctx.lineWidth = 1.2; d.ctx.beginPath(); d.ctx.moveTo(...at(d, x, z, p.h - 1)); d.ctx.lineTo(sx, sy - 5); d.ctx.stroke(); warm(d, sx, sy, 26, 0.45); d.ctx.fillStyle = '#ffd98a'; d.ctx.beginPath(); d.ctx.roundRect(sx - 3, sy - 5, 6, 8, 1.5); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.8; d.ctx.stroke(); },
  'banner-pole'(d, p) { const x = cx(p), z = cz(p), c = ['#8e2a2a', '#2a4f8e', '#2f5e39', '#5b2a86'][Math.floor(hash(p.seed) * 4)]; prism(d, 0, { x0: x - 1.2, x1: x + 1.2, z0: z - 1.2, z1: z + 1.2, h1: p.h }, col('#5b3a22')); const [sx, sy] = at(d, x, z, p.h - 2), wv = d.reduced ? 0 : Math.sin(d.T * 2.4 + p.seed) * 1.5; poly(d.ctx, [[sx, sy], [sx + 14, sy + wv], [sx + 14, sy + 22 + wv], [sx + 7, sy + 17 + wv * 0.5], [sx, sy + 22]], c, INK, 0.8); d.ctx.fillStyle = '#d9b44a'; d.ctx.beginPath(); d.ctx.arc(sx + 7, sy + 9 + wv * 0.5, 2.6, 0, TAU); d.ctx.fill(); },
  candles(d, p) { for (let k = 0; k < 4; k++) { const x = p.x0 + 2 + (k % 2) * 6 + (k > 1 ? 2 : 0), z = p.z0 + (k > 1 ? 6 : 2), h = 4 + hash(p.seed + k) * 5; prism(d, 0, { x0: x - 1.3, x1: x + 1.3, z0: z - 1.3, z1: z + 1.3, h1: h }, col('#efe6cf'), { outline: false }); const [sx, sy] = at(d, x, z, h); flame(d, sx, sy, 1.6, k); } const [gx, gy] = at(d, cx(p), cz(p), 8); warm(d, gx, gy, 22, 0.35); },
  books(d, p) { let h = 0; for (let k = 0; k < 4; k++) { const t = 2 + hash(p.seed + k) * 1.5, o = (hash(p.seed * 3 + k) - 0.5) * 3; prism(d, 0, { x0: p.x0 + 1 + o, x1: p.x1 - 1 + o, z0: p.z0 + 1, z1: p.z1 - 1, h0: h, h1: h + t }, col(['#8e2a2a', '#2f5e39', '#2a4f8e', '#b38a4a', '#5b2a86'][(k + Math.floor(p.seed * 7)) % 5])); h += t; } },
  'potion-shelf'(d, p) { shelf(d, p, '#5b3a22', (x, h, k) => { const c = ['#b58cff', '#7fe3ff', '#ff6b8a', '#8ae36b', '#ffd36b'][k % 5], [sx, sy] = at(d, x, p.z0 + 2, h); d.ctx.fillStyle = c; d.ctx.beginPath(); d.ctx.arc(sx, sy - 3, 2.8, 0, TAU); d.ctx.fill(); d.ctx.fillRect(sx - 1, sy - 8, 2, 3); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.5; d.ctx.stroke(); if (k % 3 === 0) glow(d, sx, sy - 3, 7, `${c}55`); }); },
  'scroll-rack'(d, p) { shelf(d, p, '#6b4226', (x, h, k) => { const [sx, sy] = at(d, x, p.z0 + 2, h); d.ctx.fillStyle = '#f0e0b8'; d.ctx.beginPath(); d.ctx.arc(sx, sy - 2.5, 2.5, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = '#a0845a'; d.ctx.lineWidth = 0.6; d.ctx.stroke(); if (k % 4 === 1) { d.ctx.fillStyle = '#b3262c'; d.ctx.fillRect(sx - 0.8, sy - 3.3, 1.6, 1.6); } }); },
  'weapon-rack'(d, p) { rack(d, p, (sx, sy, k) => { d.ctx.strokeStyle = k % 2 ? '#c9ccd2' : '#8a6a44'; d.ctx.lineWidth = k % 2 ? 2 : 1.6; d.ctx.beginPath(); d.ctx.moveTo(sx, sy); d.ctx.lineTo(sx, sy - 30); d.ctx.stroke(); if (k % 2) poly(d.ctx, [[sx - 3, sy - 24], [sx + 3, sy - 24], [sx, sy - 33]], '#dfe3e8', INK, 0.5); else poly(d.ctx, [[sx - 3.5, sy - 30], [sx, sy - 36], [sx + 3.5, sy - 30], [sx, sy - 27]], '#aab0b8', INK, 0.5); }); },
  'tool-rack'(d, p) { rack(d, p, (sx, sy, k) => { d.ctx.strokeStyle = '#8a6a44'; d.ctx.lineWidth = 1.5; d.ctx.beginPath(); d.ctx.moveTo(sx, sy - 4); d.ctx.lineTo(sx, sy - 28); d.ctx.stroke(); if (k % 3 === 0) { d.ctx.fillStyle = '#7d838c'; d.ctx.fillRect(sx - 4, sy - 32, 8, 5); } else if (k % 3 === 1) { poly(d.ctx, [[sx - 4, sy - 4], [sx + 4, sy - 4], [sx + 3, sy + 3], [sx - 3, sy + 3]], '#8d929c', INK, 0.5); } else { d.ctx.strokeStyle = '#9aa3ad'; d.ctx.lineWidth = 1.2; d.ctx.beginPath(); d.ctx.arc(sx, sy - 30, 4, Math.PI, 0); d.ctx.stroke(); } }); },
  armor(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: x - 1.2, x1: x + 1.2, z0: z - 1.2, z1: z + 1.2, h1: p.h - 14 }, col('#5b3a22')); const [sx, sy] = at(d, x, z, p.h - 14); poly(d.ctx, [[sx - 8, sy - 14], [sx + 8, sy - 14], [sx + 6, sy + 6], [sx - 6, sy + 6]], '#aab0b8', INK, 0.8); d.ctx.fillStyle = '#c9ccd2'; d.ctx.beginPath(); d.ctx.arc(sx, sy - 19, 5.5, Math.PI, 0); d.ctx.lineTo(sx + 5.5, sy - 15); d.ctx.lineTo(sx - 5.5, sy - 15); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.8; d.ctx.stroke(); d.ctx.fillStyle = '#2a2d33'; d.ctx.fillRect(sx - 3.5, sy - 18, 7, 1.5); },
  chest(d, p) { prism(d, 0, { ...p, h1: p.h * 0.65 }, col('#7a4a26')); const r = { ...p, h0: p.h * 0.65, h1: p.h }; prism(d, 0, r, col('#8a5530')); for (const x of [p.x0 + 3, p.x1 - 5]) prism(d, 0, { x0: x, x1: x + 2, z0: p.z0 - 0.3, z1: p.z1, h1: p.h + 0.3 }, col('#d9b44a'), { outline: false }); const [sx, sy] = at(d, cx(p), p.z0, p.h * 0.6); d.ctx.fillStyle = '#f2c94c'; d.ctx.fillRect(sx - 2, sy - 2, 4, 4); },
  coins(d, p) { for (let k = 0; k < 7; k++) { const x = p.x0 + 3 + hash(p.seed + k) * (p.x1 - p.x0 - 6), z = p.z0 + 2 + hash(p.seed * 2 + k) * (p.z1 - p.z0 - 4), n = 1 + Math.floor(hash(k + p.seed * 5) * 4); for (let j = 0; j < n; j++) { const [sx, sy] = at(d, x, z, j * 1.6); d.ctx.fillStyle = j === n - 1 ? '#ffe07a' : '#c89b2c'; d.ctx.beginPath(); d.ctx.ellipse(sx, sy, 3.4, 1.6, 0, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = 'rgba(90,60,10,0.8)'; d.ctx.lineWidth = 0.5; d.ctx.stroke(); } } const [gx, gy] = at(d, cx(p), cz(p), 3); glow(d, gx, gy, 16, 'rgba(255,215,90,0.25)'); },
  'gold-bars'(d, p) { for (const [k, h] of [[0, 0], [1, 0], [0.5, 3]]) prism(d, 0, { x0: p.x0 + k * 7, x1: p.x0 + k * 7 + 8, z0: p.z0 + 1, z1: p.z1 - 1, h0: h, h1: h + 3 }, col('#f2c94c')); },
  statue(d, p) { prism(d, 0, { ...p, h1: 12 }, col('#9a968e')); const x = cx(p), [sx, sy] = at(d, x, cz(p), 12), s = p.h - 12; poly(d.ctx, [[sx - 6, sy], [sx - 7, sy - s * 0.55], [sx - 4, sy - s * 0.7], [sx + 4, sy - s * 0.7], [sx + 7, sy - s * 0.55], [sx + 6, sy]], '#c9c4b8', INK, 0.8); d.ctx.fillStyle = '#d6d1c5'; d.ctx.beginPath(); d.ctx.arc(sx, sy - s * 0.82, 5.5, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.8; d.ctx.stroke(); d.ctx.strokeStyle = '#b8b2a4'; d.ctx.lineWidth = 2.2; d.ctx.beginPath(); d.ctx.moveTo(sx + 6, sy - s * 0.6); d.ctx.lineTo(sx + 10, sy - s); d.ctx.stroke(); },
  crystals(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: p.x0 + 2, x1: p.x1 - 2, z0: p.z0 + 2, z1: p.z1 - 2, h1: 4 }, col('#6d6a7e')); const [sx, sy] = at(d, x, z, 4), c = hash(p.seed) > 0.5 ? '#b58cff' : '#7fe3ff'; glow(d, sx, sy - 10, 24, `${c}55`); for (const [dx, hh, w] of [[-5, 14, 3.5], [0, p.h - 4, 4.5], [5, 11, 3]]) poly(d.ctx, [[sx + dx - w, sy], [sx + dx - w * 0.7, sy - hh * 0.8], [sx + dx, sy - hh], [sx + dx + w * 0.7, sy - hh * 0.8], [sx + dx + w, sy]], c, INK, 0.7); d.ctx.fillStyle = 'rgba(255,255,255,0.6)'; d.ctx.fillRect(sx - 1.5, sy - p.h + 8, 1.2, 8); },
  'rune-stone'(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: x - 4.5, x1: x + 4.5, z0: z - 3.5, z1: z + 3.5, h1: p.h }, col('#77746f')); const [sx, sy] = at(d, x, z - 3.5, p.h * 0.55), a = d.reduced ? 0.8 : 0.55 + 0.35 * Math.sin(d.T * 1.7 + p.seed * 9); d.ctx.save(); d.ctx.globalAlpha = a; d.ctx.strokeStyle = '#b58cff'; d.ctx.lineWidth = 1.2; d.ctx.beginPath(); d.ctx.moveTo(sx - 2.5, sy - 5); d.ctx.lineTo(sx + 2.5, sy); d.ctx.lineTo(sx - 2.5, sy + 5); d.ctx.moveTo(sx + 2, sy - 5); d.ctx.lineTo(sx + 2, sy - 1); d.ctx.stroke(); d.ctx.restore(); glow(d, sx, sy, 12, `rgba(181,140,255,${0.3 * a})`); },
  plant(d, p) { const x = cx(p), z = cz(p); cyl(d, x, z, 5.5, 0, 8, '#b5553a', { top: '#5a3a22' }); leafy(d, x, z, 10, 8, 9, '#4f8f3f', p.seed); },
  bush(d, p) { leafy(d, cx(p), cz(p), 0, 12, p.h, '#467c33', p.seed); },
  flowers(d, p) { prism(d, 0, { ...p, h1: 4 }, col('#6b4a2e')); for (let k = 0; k < 9; k++) { const x = p.x0 + 3 + hash(p.seed + k) * (p.x1 - p.x0 - 6), z = p.z0 + 2 + hash(p.seed + k * 3) * (p.z1 - p.z0 - 4), [sx, sy] = at(d, x, z, 4); d.ctx.strokeStyle = '#3f7a2f'; d.ctx.lineWidth = 0.8; d.ctx.beginPath(); d.ctx.moveTo(sx, sy); d.ctx.lineTo(sx, sy - 4); d.ctx.stroke(); d.ctx.fillStyle = ['#ff6b8a', '#ffd36b', '#ffffff', '#b58cff'][k % 4]; d.ctx.beginPath(); d.ctx.arc(sx, sy - 5, 1.8, 0, TAU); d.ctx.fill(); } },
  cauldron(d, p) { const x = cx(p), z = cz(p); cyl(d, x, z, 9, 1, p.h, '#2f3036', { top: '#5fd08a' }); const [sx, sy] = at(d, x, z, p.h); for (let k = 0; k < 3; k++) { const t = d.reduced ? 0.3 : (d.T * 0.8 + k / 3) % 1; d.ctx.fillStyle = `rgba(150,240,170,${0.6 * (1 - t)})`; d.ctx.beginPath(); d.ctx.arc(sx - 3 + k * 3, sy - t * 14, 1.6 + t * 2, 0, TAU); d.ctx.fill(); } glow(d, sx, sy, 18, 'rgba(95,208,138,0.35)'); const [fx, fy] = at(d, x, z - 9, 1); flame(d, fx, fy + 2, 3, p.seed); },
  globe(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: x - 5, x1: x + 5, z0: z - 4, z1: z + 4, h1: 4 }, col('#6b4226')); prism(d, 0, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, h0: 4, h1: 14 }, col('#8a6a44'), { outline: false }); const [sx, sy] = at(d, x, z, 21); d.ctx.fillStyle = '#4f7fb8'; d.ctx.beginPath(); d.ctx.arc(sx, sy, 7.5, 0, TAU); d.ctx.fill(); d.ctx.fillStyle = '#6fae4f'; d.ctx.beginPath(); d.ctx.ellipse(sx - 2, sy - 1, 3, 4, 0.4, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.8; d.ctx.beginPath(); d.ctx.arc(sx, sy, 7.5, 0, TAU); d.ctx.stroke(); d.ctx.strokeStyle = '#c8a24a'; d.ctx.lineWidth = 1.2; d.ctx.beginPath(); d.ctx.arc(sx, sy, 9.5, -2.2, 1.2); d.ctx.stroke(); },
  'star-chart'(d, p) { const x = cx(p), z = cz(p); for (const dx of [-8, 8]) prism(d, 0, { x0: x + dx - 1, x1: x + dx + 1, z0: z - 1, z1: z + 1, h1: p.h - 6 }, col('#6b4226'), { outline: false }); poly(d.ctx, [at(d, p.x0, z, 12), at(d, p.x1, z, 12), at(d, p.x1, z, p.h), at(d, p.x0, z, p.h)], '#1f2a4a', INK, 0.8); for (let k = 0; k < 9; k++) { const [sx, sy] = at(d, p.x0 + 3 + hash(k + p.seed) * (p.x1 - p.x0 - 6), z, 14 + hash(k * 7 + p.seed) * (p.h - 16)); d.ctx.fillStyle = '#fff3b0'; d.ctx.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6); } },
  bench(d, p) { const t = p.turned; for (const k of [0.15, 0.85]) { const x = t ? cx(p) : p.x0 + (p.x1 - p.x0) * k, z = t ? p.z0 + (p.z1 - p.z0) * k : cz(p); prism(d, 0, { x0: x - 1.5, x1: x + 1.5, z0: z - 3, z1: z + 3, h1: p.h - 3 }, col('#5b3a22')); } prism(d, 0, { ...p, h0: p.h - 3, h1: p.h }, col('#9b6b3f')); },
  grindstone(d, p) { const x = cx(p), z = cz(p); prism(d, 0, { x0: p.x0, x1: p.x1, z0: p.z0 + 2, z1: p.z1 - 2, h1: 8 }, col('#6b4226')); const [sx, sy] = at(d, x, p.z0, 13), a = d.reduced ? 0 : d.T * 2; d.ctx.fillStyle = '#9a968e'; d.ctx.beginPath(); d.ctx.arc(sx, sy, 7, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = 0.8; d.ctx.stroke(); d.ctx.strokeStyle = '#6f6b64'; d.ctx.beginPath(); d.ctx.moveTo(sx, sy); d.ctx.lineTo(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6); d.ctx.stroke(); },
  anvil(d, p) { prism(d, 0, { x0: p.x0 + 5, x1: p.x1 - 5, z0: p.z0 + 2, z1: p.z1 - 2, h1: p.h - 5 }, col('#5b3a22')); prism(d, 0, { ...p, h0: p.h - 5, h1: p.h }, col('#4a4f58')); },
  pipes(d, p) { for (let k = 0; k < 3; k++) { const x = p.x0 + 6 + k * ((p.x1 - p.x0 - 12) / 2); cyl(d, x, cz(p), 3.5, 0, p.h - k * 6, '#6b6f7a', { bands: [0.3, 0.7] }); } const [ax, ay] = at(d, p.x0 + 6, cz(p), p.h - 4), [bx, by] = at(d, p.x1 - 6, cz(p), p.h - 16); d.ctx.strokeStyle = '#7fe3ff'; d.ctx.lineWidth = 2; d.ctx.globalAlpha = d.reduced ? 0.7 : 0.5 + 0.4 * Math.sin(d.T * 3 + p.seed); d.ctx.beginPath(); d.ctx.moveTo(ax, ay); d.ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 10, bx, by); d.ctx.stroke(); d.ctx.globalAlpha = 1; glow(d, (ax + bx) / 2, Math.min(ay, by) - 6, 18, 'rgba(127,227,255,0.3)'); },
};
function crate(d, x0, x1, z0, z1, h0, h1) {
  prism(d, 0, { x0, x1, z0, z1, h0, h1 }, col('#a8733f'));
  const { ctx } = d; ctx.strokeStyle = 'rgba(70,45,20,0.7)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(...at(d, x0 + 1, z0, h0 + 1)); ctx.lineTo(...at(d, x1 - 1, z0, h1 - 1)); ctx.moveTo(...at(d, x0 + 1, z0, h1 - 1)); ctx.lineTo(...at(d, x1 - 1, z0, h0 + 1)); ctx.stroke();
}
function lying(d, x0, x1, z, h, r, bark, cut) { const { ctx } = d, [ax, ay] = at(d, x0, z, h), [bx, by] = at(d, x1, z, h); ctx.fillStyle = bark; ctx.beginPath(); ctx.moveTo(ax, ay - r); ctx.lineTo(bx, by - r); ctx.lineTo(bx, by + r); ctx.lineTo(ax, ay + r); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = cut; ctx.beginPath(); ctx.ellipse(bx, by, r * 0.55, r, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
function shelf(d, p, wood, item) {
  prism(d, 0, { ...p, h1: p.h }, col(wood));
  const rows = 3; for (let r = 1; r <= rows; r++) { const h = (p.h / (rows + 0.4)) * r; prism(d, 0, { x0: p.x0 + 1, x1: p.x1 - 1, z0: p.z0 - 0.5, z1: p.z0 + 1, h0: h - 1, h1: h }, col(shade(wood, 1.2)), { outline: false }); for (let k = 0; k < 5; k++) item(p.x0 + 5 + k * ((p.x1 - p.x0 - 10) / 4), h, k + r * 5); }
}
function rack(d, p, item) {
  const { ctx } = d, t = p.turned, x = cx(p), z = cz(p);
  for (const k of [0, 1]) { const px = t ? x : k ? p.x1 - 2 : p.x0 + 2, pz = t ? (k ? p.z1 - 2 : p.z0 + 2) : z; prism(d, 0, { x0: px - 1.2, x1: px + 1.2, z0: pz - 1.2, z1: pz + 1.2, h1: p.h }, col('#5b3a22')); }
  const a = t ? at(d, x, p.z0 + 2, p.h - 4) : at(d, p.x0 + 2, z, p.h - 4), b = t ? at(d, x, p.z1 - 2, p.h - 4) : at(d, p.x1 - 2, z, p.h - 4);
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  for (let k = 0; k < 5; k++) { const f = (k + 0.5) / 5, sx = a[0] + (b[0] - a[0]) * f, sy = a[1] + (b[1] - a[1]) * f + p.h - 8; item(sx, sy, k); }
}
function leafy(d, x, z, h0, r, h, c, seed) {
  const { ctx } = d, [sx, sy] = at(d, x, z, h0);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + seed, rx = sx + Math.cos(a) * r * 0.5, ry = sy - h * 0.55 + Math.sin(a) * r * 0.25; ctx.fillStyle = shade(c, 0.85 + 0.3 * hash(seed + k)); ctx.beginPath(); ctx.arc(rx, ry, r * 0.55, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke(); }
  ctx.fillStyle = shade(c, 1.2); ctx.beginPath(); ctx.arc(sx - r * 0.15, sy - h * 0.75, r * 0.5, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
}

// ---- Wall pieces on a hall's far wall (z = the wall plane). ----
export function drawWallPiece(d, kind, x, z, h, structure, seed = 0) {
  const { ctx } = d;
  if (kind === 'torch') {
    const [sx, sy] = at(d, x, z, h * 0.62); ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.moveTo(sx - 2, sy); ctx.lineTo(sx + 2, sy); ctx.lineTo(sx + 1, sy + 9); ctx.lineTo(sx - 1, sy + 9); ctx.fill();
    ctx.fillStyle = '#5a5f69'; ctx.fillRect(sx - 3.5, sy - 2, 7, 3); warm(d, sx, sy - 4, 40, 0.42); flame(d, sx, sy - 1, 4.5, seed);
  } else if (kind === 'banner') {
    const c = BANNER_COLORS[structure] ?? '#8e2a2a', [sx, sy] = at(d, x, z, h * 0.86), wv = d.reduced ? 0 : Math.sin(d.T * 1.6 + seed) * 1.2;
    ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 14, sy); ctx.lineTo(sx + 14, sy); ctx.stroke();
    poly(ctx, [[sx - 11, sy], [sx + 11, sy], [sx + 11 + wv, sy + 40], [sx, sy + 48], [sx - 11 + wv, sy + 40]], c, INK, 0.9);
    ctx.fillStyle = '#d9b44a'; ctx.fillRect(sx - 11, sy + 2, 22, 2.5);
    ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx + 6, sy + 20); ctx.lineTo(sx, sy + 30); ctx.lineTo(sx - 6, sy + 20); ctx.closePath(); ctx.fill();
  } else if (kind === 'window') {
    const [ax, ay] = at(d, x - 12, z, h * 0.45), [bx, by] = at(d, x + 12, z, h * 0.82), w = bx - ax;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, by + w * 0.5); ctx.arc(ax + w / 2, by + w * 0.5, w / 2, Math.PI, 0); ctx.lineTo(bx, ay); ctx.closePath();
    const g = ctx.createLinearGradient(0, by, 0, ay); g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#f2b25a'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax + w / 2, ay); ctx.lineTo(ax + w / 2, by); ctx.moveTo(ax, (ay + by) / 2 + w * 0.2); ctx.lineTo(bx, (ay + by) / 2 + w * 0.2); ctx.stroke();
    glow(d, ax + w / 2, (ay + by) / 2, 30, 'rgba(255,210,120,0.18)');
  }
}

// ---- Terrain scatter (ground plane): grass tufts, flowers, pebbles; and scenery trees. Deterministic. ----
export function tuft(d, sx, sy, s, k) {
  const { ctx } = d; ctx.strokeStyle = k % 3 ? '#4f8f3f' : '#6fae4f'; ctx.lineWidth = 1;
  ctx.beginPath(); for (const a of [-0.5, 0, 0.5]) { ctx.moveTo(sx, sy); ctx.lineTo(sx + a * s * 1.6, sy - s * (1.2 - Math.abs(a) * 0.4)); } ctx.stroke();
}
export function tree(d, sx, sy, s, seed, kind = 'round') {
  const { ctx } = d;
  ctx.fillStyle = 'rgba(20,30,15,0.25)'; ctx.beginPath(); ctx.ellipse(sx + s * 0.25, sy + 1, s * 0.7, s * 0.2, 0, 0, TAU); ctx.fill();
  if (kind === 'pine') {
    ctx.fillStyle = '#5b3a22'; ctx.fillRect(sx - s * 0.08, sy - s * 0.4, s * 0.16, s * 0.4);
    for (let k = 0; k < 3; k++) { const y = sy - s * (0.3 + k * 0.45), w = s * (0.75 - k * 0.18); poly(ctx, [[sx - w, y], [sx, y - s * 0.75], [sx + w, y]], k % 2 ? '#2f6b3a' : '#357a40', INK, 0.8); }
    return;
  }
  ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.moveTo(sx - s * 0.1, sy); ctx.lineTo(sx - s * 0.06, sy - s * 0.8); ctx.lineTo(sx + s * 0.06, sy - s * 0.8); ctx.lineTo(sx + s * 0.1, sy); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + seed, r = s * (0.38 + 0.1 * hash(seed + k)); ctx.fillStyle = shade(['#4f8f3f', '#5a9a45', '#467c33'][k % 3], 0.95 + 0.2 * hash(k + seed)); ctx.beginPath(); ctx.arc(sx + Math.cos(a) * s * 0.35, sy - s * 1.15 + Math.sin(a) * s * 0.22, r, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#72b35a'; ctx.beginPath(); ctx.arc(sx - s * 0.12, sy - s * 1.3, s * 0.32, 0, TAU); ctx.fill(); ctx.stroke();
  if (hash(seed * 3) > 0.6) for (let k = 0; k < 4; k++) { ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(sx + (hash(k + seed) - 0.5) * s * 0.8, sy - s * (1 + hash(k * 3 + seed) * 0.4), s * 0.05, 0, TAU); ctx.fill(); }
}
