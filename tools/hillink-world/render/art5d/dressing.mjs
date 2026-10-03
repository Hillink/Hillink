// Pass 5H: Real HQ set dressing. The generated furnishing (procgen/furnish.mjs) places what a room needs to work; this
// adds what makes it look lived in (plants, boxes, bins, printers, lamps, cabinets, coats, a coffee station, cable
// trays, spare parts) along its quiet walls. COSMETIC and static: computed once from the layout (room rectangle,
// furniture, keep-outs, nav nodes and edges), never from World state, never on a walk and never in a door's zone.
import { MAT, litBox, lit } from './light.mjs';

const TAU = Math.PI * 2;
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
// Footprints in plan units (a character is 50 tall; a desk top is ~30).
export const RPROP_SIZE = {
  'floor-plant': [16, 16, 44], 'plant-small': [12, 12, 24], boxes: [22, 18, 24], bin: [9, 9, 12], printer: [24, 18, 26], 'file-cabinet': [16, 20, 40],
  'floor-lamp': [10, 10, 60], 'coat-rack': [12, 12, 56], 'coffee-station': [40, 16, 34], 'cable-tray': [30, 10, 8], 'spare-parts': [24, 18, 18],
  extinguisher: [7, 7, 18], beanbag: [22, 20, 14], 'magazine-rack': [16, 10, 22], trophies: [30, 10, 46], 'easel-board': [30, 8, 58], 'sofa-side': [14, 14, 22],
};
export const ROOM_DRESSING = {
  development: ['floor-plant', 'boxes', 'bin', 'printer', 'cable-tray', 'plant-small', 'file-cabinet', 'bin', 'floor-lamp', 'boxes'],
  testing: ['easel-board', 'bin', 'floor-plant', 'boxes', 'cable-tray', 'plant-small', 'extinguisher', 'file-cabinet'],
  command: ['floor-plant', 'trophies', 'floor-lamp', 'plant-small', 'coat-rack', 'bin', 'file-cabinet'],
  comms: ['floor-plant', 'easel-board', 'floor-lamp', 'plant-small', 'bin', 'coat-rack'],
  lounge: ['coffee-station', 'floor-plant', 'beanbag', 'magazine-rack', 'floor-lamp', 'plant-small', 'beanbag', 'bin', 'sofa-side'],
  servers: ['spare-parts', 'cable-tray', 'extinguisher', 'boxes', 'spare-parts', 'bin'],
  queue: ['floor-plant', 'coat-rack', 'magazine-rack', 'floor-plant', 'plant-small', 'bin'],
  lobby: ['floor-plant', 'coat-rack', 'floor-plant', 'plant-small', 'bin'],
  archive: ['boxes', 'file-cabinet', 'boxes', 'bin', 'file-cabinet', 'plant-small'],
  storage: ['boxes', 'boxes', 'spare-parts', 'boxes', 'bin'],
  office: ['floor-plant', 'bin', 'file-cabinet', 'plant-small', 'floor-lamp', 'boxes'],
  passage: ['floor-plant', 'extinguisher', 'bin'],
};

const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
const segHits = (r, [a, b], m) => { const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4)); for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true; } return false; };
// Pure and deterministic. r: the room (plan units); avoid: rectangles; nodes: plan points; walks: [a, b] plan segments.
export function dressRoom(kind, r, { avoid = [], nodes = [], walks = [], seed = 0 } = {}) {
  const list = ROOM_DRESSING[kind] ?? ROOM_DRESSING.office, W = r.x1 - r.x0, D = r.z1 - r.z0, inset = 11, out = [];
  if (W < 60 || D < 60) return out;
  const cands = [];
  for (let fx = 0.05; fx <= 0.95; fx += 0.06) cands.push({ x: r.x0 + W * fx, z: r.z1 - inset, band: 0 });
  for (let k = 0.4; k <= 0.92; k += 0.08) for (const x of [r.x0 + inset, r.x1 - inset]) cands.push({ x, z: r.z0 + D * k, band: 1 });
  cands.forEach((c, i) => (c.r = hash(i * 1.37 + seed)));
  cands.sort((a, b) => a.band - b.band || a.r - b.r);
  list.forEach((kind, n) => {
    const [w, dd, h] = RPROP_SIZE[kind] ?? [16, 16, 20];
    for (const c of cands) {
      if (c.used) continue;
      const turned = c.band === 1, q = { x0: c.x - (turned ? dd : w) / 2, x1: c.x + (turned ? dd : w) / 2, z0: c.z - (turned ? w : dd) / 2, z1: c.z + (turned ? w : dd) / 2 };
      if (q.x0 < r.x0 + 3 || q.x1 > r.x1 - 3 || q.z0 < r.z0 + 3 || q.z1 > r.z1 - 3) continue;
      if (avoid.some(o => overlap(q, o, 6)) || out.some(o => overlap(q, o, 4))) continue;
      if (nodes.some(p => p.x > q.x0 - 22 && p.x < q.x1 + 22 && p.z > q.z0 - 22 && p.z < q.z1 + 22)) continue;
      if (walks.some(wk => segHits(q, wk, 14))) continue;
      c.used = true; out.push({ kind, ...q, h, turned, seed: n + c.r }); break;
    }
  });
  return out;
}

// ---- Drawers (lit volumes, no outlines: the Real environment's language). (d, f, p) ----
const cx = p => (p.x0 + p.x1) / 2, cz = p => (p.z0 + p.z1) / 2;
function pot(d, f, x, z, r, h, c = '#e7e3dc') { litBox(d, f, { x0: x - r, x1: x + r, z0: z - r, z1: z + r, h1: h }, c); }
function foliage(d, f, x, z, h, r, seed) {
  const { ctx, P } = d, [sx, sy] = P.at(x, z, f, h);
  for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + seed * 3, rr = r * (0.45 + 0.2 * hash(seed + k)); ctx.fillStyle = lit(k % 2 ? MAT.foliage[0] : MAT.foliageLight[0], 0.9 + 0.2 * hash(k + seed)); ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * r * 0.55, sy - r * 0.5 + Math.sin(a) * r * 0.45, rr, rr * 0.8, a, 0, TAU); ctx.fill(); }
  ctx.fillStyle = lit(MAT.foliageLight[0], 1.1); ctx.beginPath(); ctx.ellipse(sx - r * 0.1, sy - r * 0.8, r * 0.4, r * 0.32, 0, 0, TAU); ctx.fill();
}
export const RPROPS = {
  'floor-plant'(d, f, p) { const x = cx(p), z = cz(p); pot(d, f, x, z, 6, 12, '#d9d4cb'); foliage(d, f, x, z, 26, 16, p.seed); },
  'plant-small'(d, f, p) { const x = cx(p), z = cz(p); pot(d, f, x, z, 4.5, 9, '#c96b4a'); foliage(d, f, x, z, 16, 9, p.seed); },
  'sofa-side'(d, f, p) { litBox(d, f, { ...p, h1: p.h - 6 }, MAT.oak[0]); const x = cx(p), z = cz(p); pot(d, f, x, z, 3, p.h - 2, '#f6f7f8'); foliage(d, f, x, z, p.h + 4, 6, p.seed); },
  boxes(d, f, p) { const x = cx(p); litBox(d, f, { x0: p.x0, x1: x + 2, z0: p.z0, z1: p.z1, h1: p.h * 0.5 }, '#c9a16d'); litBox(d, f, { x0: x - 1, x1: p.x1, z0: p.z0 + 2, z1: p.z1, h1: p.h * 0.45 }, '#bf9660'); litBox(d, f, { x0: p.x0 + 3, x1: x + 5, z0: p.z0 + 2, z1: p.z1 - 2, h0: p.h * 0.5, h1: p.h }, '#d2ad7a'); const { ctx, P } = d; ctx.strokeStyle = 'rgba(90,70,40,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...P.at(p.x0 + 3, p.z0 + 2, f, p.h)); ctx.lineTo(...P.at(x + 5, p.z0 + 2, f, p.h)); ctx.stroke(); },
  bin(d, f, p) { litBox(d, f, { ...p, h1: p.h }, '#56606e'); litBox(d, f, { x0: p.x0 + 1, x1: p.x1 - 1, z0: p.z0 + 1, z1: p.z1 - 1, h0: p.h - 0.5, h1: p.h }, '#2c323a', { ao: false, edge: false }); },
  printer(d, f, p) { litBox(d, f, { ...p, h1: p.h - 10 }, '#dfe3e8'); litBox(d, f, { x0: p.x0 + 1, x1: p.x1 - 1, z0: p.z0 + 1, z1: p.z1 - 1, h0: p.h - 10, h1: p.h }, '#eef1f4'); litBox(d, f, { x0: p.x0 + 4, x1: p.x1 - 4, z0: p.z0 - 2, z1: p.z0 + 3, h0: p.h - 8, h1: p.h - 7 }, '#ffffff', { ao: false }); const [sx, sy] = d.P.at(p.x1 - 4, p.z0, f, p.h - 3); d.ctx.fillStyle = hash(Math.floor(d.T)) > 0.5 ? '#34d27b' : '#1f8a52'; d.ctx.fillRect(sx - 1, sy - 1, 2, 2); },
  'file-cabinet'(d, f, p) { litBox(d, f, { ...p, h1: p.h }, '#9aa4b0'); for (let k = 1; k < 4; k++) { const h = (p.h / 4) * k; litBox(d, f, { x0: p.x0 + 1, x1: p.x1 - 1, z0: p.z0 - 0.3, z1: p.z0, h0: h - 0.6, h1: h }, '#6f7a88', { ao: false, edge: false }); const [sx, sy] = d.P.at(cx(p), p.z0, f, h - p.h / 8); d.ctx.fillStyle = '#e0e4e9'; d.ctx.fillRect(sx - 3, sy - 0.8, 6, 1.6); } },
  'floor-lamp'(d, f, p) { const x = cx(p), z = cz(p); litBox(d, f, { x0: x - 4, x1: x + 4, z0: z - 4, z1: z + 4, h1: 1.5 }, MAT.steel[0], { edge: false }); litBox(d, f, { x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, h1: p.h - 10 }, MAT.steel[0], { ao: false, edge: false }); const [sx, sy] = d.P.at(x, z, f, p.h - 6); const g = d.ctx.createRadialGradient(sx, sy + 20, 0, sx, sy + 20, 42); g.addColorStop(0, 'rgba(255,236,190,0.28)'); g.addColorStop(1, 'rgba(255,236,190,0)'); d.ctx.fillStyle = g; d.ctx.beginPath(); d.ctx.arc(sx, sy + 20, 42, 0, TAU); d.ctx.fill(); d.ctx.fillStyle = '#f6efe0'; d.ctx.beginPath(); d.ctx.moveTo(sx - 6, sy + 4); d.ctx.lineTo(sx - 4, sy - 5); d.ctx.lineTo(sx + 4, sy - 5); d.ctx.lineTo(sx + 6, sy + 4); d.ctx.closePath(); d.ctx.fill(); },
  'coat-rack'(d, f, p) { const x = cx(p), z = cz(p), { ctx, P } = d; litBox(d, f, { x0: x - 5, x1: x + 5, z0: z - 5, z1: z + 5, h1: 1.5 }, MAT.woodDark[0], { edge: false }); litBox(d, f, { x0: x - 0.9, x1: x + 0.9, z0: z - 0.9, z1: z + 0.9, h1: p.h }, MAT.woodDark[0], { ao: false, edge: false }); const [sx, sy] = P.at(x, z, f, p.h - 6); for (const [dx, c] of [[-4, '#3a4250'], [4, '#b3262c']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(sx + dx - 3, sy); ctx.lineTo(sx + dx + 3, sy); ctx.lineTo(sx + dx + 4, sy + 20); ctx.lineTo(sx + dx - 4, sy + 20); ctx.closePath(); ctx.fill(); } },
  'coffee-station'(d, f, p) { litBox(d, f, { ...p, h1: p.h - 2 }, { front: '#e9e4dc', top: MAT.oak[0] }); const x = p.x0 + 10, { ctx, P } = d; litBox(d, f, { x0: x - 6, x1: x + 6, z0: p.z0 + 3, z1: p.z1 - 3, h0: p.h - 2, h1: p.h + 16 }, '#2b3038'); const [sx, sy] = P.at(x, p.z0 + 3, f, p.h + 8); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(sx - 1.5, sy - 1, 3, 2); for (let k = 0; k < 3; k++) litBox(d, f, { x0: p.x0 + 20 + k * 5, x1: p.x0 + 23.5 + k * 5, z0: p.z0 + 5, z1: p.z0 + 8.5, h0: p.h - 2, h1: p.h + 3 }, ['#f4f1ea', '#2f7df6', '#ff7a1a'][k], { ao: false }); if (!d.reduced) for (let k = 0; k < 2; k++) { const t = (d.T * 0.6 + k * 0.5) % 1; ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - t)})`; ctx.beginPath(); ctx.arc(sx + 2 + k * 2, sy - 12 - t * 14, 1.5 + t * 2, 0, TAU); ctx.fill(); } },
  'cable-tray'(d, f, p) { litBox(d, f, { ...p, h1: 3 }, '#56606e', { edge: false }); const { ctx, P } = d; for (const [k, c] of [[0.3, '#2f7df6'], [0.5, '#e8b93f'], [0.7, '#34d27b']]) { ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(...P.at(p.x0 + 1, p.z0 + (p.z1 - p.z0) * k, f, 3.5)); ctx.lineTo(...P.at(p.x1 - 1, p.z0 + (p.z1 - p.z0) * k, f, 3.5)); ctx.stroke(); } },
  'spare-parts'(d, f, p) { litBox(d, f, { ...p, h1: p.h * 0.6 }, '#3a4250'); litBox(d, f, { x0: p.x0 + 2, x1: p.x1 - 6, z0: p.z0 + 2, z1: p.z1 - 2, h0: p.h * 0.6, h1: p.h }, '#2b3038'); const [sx, sy] = d.P.at(p.x0 + 6, p.z0 + 2, f, p.h * 0.8); for (let k = 0; k < 3; k++) { d.ctx.fillStyle = hash(Math.floor(d.T * 2) + k + p.seed) > 0.4 ? '#34d27b' : '#1c5a3a'; d.ctx.fillRect(sx + k * 3, sy, 1.6, 1.6); } },
  extinguisher(d, f, p) { const x = cx(p), z = cz(p); litBox(d, f, { x0: x - 2.5, x1: x + 2.5, z0: z - 2.5, z1: z + 2.5, h1: p.h - 3 }, '#d33a2c'); litBox(d, f, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, h0: p.h - 3, h1: p.h }, '#2b3038', { ao: false }); },
  beanbag(d, f, p) { const [sx, sy] = d.P.at(cx(p), cz(p), f, 0), c = ['#2f7df6', '#ff7a1a', '#34d27b'][Math.floor(hash(p.seed) * 3)]; const g = d.ctx.createRadialGradient(sx - 4, sy - 10, 2, sx, sy - 6, 14); g.addColorStop(0, lit(c, 1.15)); g.addColorStop(1, lit(c, 0.75)); d.ctx.fillStyle = g; d.ctx.beginPath(); d.ctx.ellipse(sx, sy - 6, 12, 9, 0, 0, TAU); d.ctx.fill(); },
  'magazine-rack'(d, f, p) { litBox(d, f, { ...p, h1: p.h }, MAT.aluminium[0]); for (let k = 0; k < 3; k++) litBox(d, f, { x0: p.x0 + 2 + k * 4.5, x1: p.x0 + 5.5 + k * 4.5, z0: p.z0 - 0.5, z1: p.z0 + 1, h0: p.h - 12, h1: p.h - 1 }, ['#e5484d', '#2f7df6', '#f2c94c'][k], { ao: false, edge: false }); },
  trophies(d, f, p) { litBox(d, f, { ...p, h1: p.h }, MAT.woodDark[0]); for (const h of [p.h * 0.45, p.h * 0.85]) for (let k = 0; k < 3; k++) { const x = p.x0 + 6 + k * 9, [sx, sy] = d.P.at(x, p.z0 + 2, f, h); d.ctx.fillStyle = k === 1 ? '#f2c94c' : '#c5ccd4'; d.ctx.beginPath(); d.ctx.moveTo(sx - 3, sy - 8); d.ctx.lineTo(sx + 3, sy - 8); d.ctx.lineTo(sx + 1, sy - 3); d.ctx.lineTo(sx + 1, sy); d.ctx.lineTo(sx - 1, sy); d.ctx.lineTo(sx - 1, sy - 3); d.ctx.closePath(); d.ctx.fill(); } },
  'easel-board'(d, f, p) { const { ctx, P } = d, z = cz(p); for (const x of [p.x0 + 3, p.x1 - 3]) litBox(d, f, { x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, h1: p.h - 4 }, MAT.steel[0], { ao: false, edge: false }); const q = [P.at(p.x0, z, f, 18), P.at(p.x1, z, f, 18), P.at(p.x1, z, f, p.h), P.at(p.x0, z, f, p.h)]; ctx.fillStyle = '#fbfcfd'; ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#b9c0c8'; ctx.lineWidth = 1.2; ctx.stroke(); for (let k = 0; k < 4; k++) { const [ax, ay] = P.at(p.x0 + 4, z, f, p.h - 8 - k * 8), [bx, by] = P.at(p.x0 + 8 + hash(k + p.seed) * 16, z, f, p.h - 8 - k * 8); ctx.strokeStyle = ['#2f7df6', '#e5484d', '#34d27b', '#2b3038'][k]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); } },
};
