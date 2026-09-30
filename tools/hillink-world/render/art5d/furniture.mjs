// Pass 5D-A: furniture and fixtures, redrawn in the new visual language. Each piece is still placed, sized and faced
// by the generated furnishing (procgen/furnish.mjs) and keeps the interaction anchors of 5C; only its construction
// changes: lit volumes (render/art5d/light.mjs), real materials (oak tops, steel frames, fabric, glass), and the
// small parts that make a room read as used (keyboards, mugs, books, cables, screens that glow when a real agent is
// working there). Types this module does not know fall back to the older props drawn with the new lighting.
import { SIZES } from '../../world/scale.mjs';
import { MAT, lit, litBox, litBlob, mix } from './light.mjs';
import { wind } from '../../engine/environment.mjs';

const S = SIZES, TAU = Math.PI * 2;
const box = (it, dx0 = 0, dx1 = 0, dz0 = 0, dz1 = 0) => ({ x0: it.x - it.w / 2 + dx0, x1: it.x + it.w / 2 + dx1, z0: it.z - it.d / 2 + dz0, z1: it.z + it.d / 2 + dz1 });
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const quad = (ctx, pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
// A vertical panel on the plane z (screens, doors, fronts), and a flat patch at height h.
const panel = (d, f, x0, x1, z, h0, h1, fill) => quad(d.ctx, [d.P.at(x0, z, f, h0), d.P.at(x1, z, f, h0), d.P.at(x1, z, f, h1), d.P.at(x0, z, f, h1)], fill);
const patch = (d, f, x0, x1, z0, z1, h, fill) => quad(d.ctx, [d.P.at(x0, z0, f, h), d.P.at(x1, z0, f, h), d.P.at(x1, z1, f, h), d.P.at(x0, z1, f, h)], fill);
// A cylinder standing on the floor (table tops, pedestals, pots): lit side band and top ellipse.
function cylinder(d, f, cx, cz, r, h0, h1, color, { top = null } = {}) {
  const { ctx, P } = d, n = 28, ring = h => Array.from({ length: n }, (_, k) => { const a = (k / n) * TAU; return P.at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, f, h); });
  const lo = ring(h0), hi = ring(h1), [lx] = P.at(cx - r, cz, f, h0), [rx] = P.at(cx + r, cz, f, h0);
  const g = ctx.createLinearGradient(lx, 0, rx, 0); g.addColorStop(0, lit(color, 1.08)); g.addColorStop(0.45, lit(color, 0.95)); g.addColorStop(1, lit(color, 0.7));
  // Front half of the band: angles pi..2pi are toward the camera (z below the centre).
  const front = [...Array(n / 2 + 1).keys()].map(k => (n / 2 + k) % n);
  quad(ctx, [...front.map(k => lo[k]), ...front.reverse().map(k => hi[k])], g);
  quad(ctx, hi, top ?? lit(color, 1.06));
}
// Screens: dark glass with a soft glow; live code lines only while a real agent works at the station.
function screen(d, f, x0, x1, z, h0, h1, live, seed) {
  const { ctx, T } = d, [ax, ay] = d.P.at(x0, z, f, h1), [bx, by] = d.P.at(x1, z, f, h0);
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  if (live) { g.addColorStop(0, '#1d3b5c'); g.addColorStop(1, '#0f2238'); } else { g.addColorStop(0, '#2a3440'); g.addColorStop(1, '#161c24'); }
  panel(d, f, x0, x1, z, h0, h1, g);
  if (live) {
    const rows = 6, rh = (h1 - h0) / (rows + 1), cols = ['#7ee0a8', '#8fc4ff', '#ffd08a', '#c9b3ff'];
    for (let i = 0; i < rows; i++) { const k = Math.floor(T * 2.5 + seed) + i, w = (0.25 + hash(k + seed) * 0.6) * (x1 - x0 - 3), xs = x0 + 1.5 + (k % 3) * 1.5; ctx.strokeStyle = cols[k % 4]; ctx.lineWidth = Math.max(0.6, rh * 0.4); ctx.beginPath(); ctx.moveTo(...d.P.at(xs, z - 0.05, f, h1 - rh * (i + 1))); ctx.lineTo(...d.P.at(xs + w, z - 0.05, f, h1 - rh * (i + 1))); ctx.stroke(); }
  } else { ctx.fillStyle = 'rgba(255,255,255,0.06)'; quad(ctx, [d.P.at(x0, z - 0.05, f, h1), d.P.at(x0 + (x1 - x0) * 0.4, z - 0.05, f, h1), d.P.at(x0 + (x1 - x0) * 0.1, z - 0.05, f, h0), d.P.at(x0, z - 0.05, f, h0)], 'rgba(255,255,255,0.07)'); }
}
const glowAt = (d, x, y, r, c) => { const g = d.ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); d.ctx.fillStyle = g; d.ctx.beginPath(); d.ctx.arc(x, y, r, 0, TAU); d.ctx.fill(); };

function chairBackBox(it) {
  const s = Math.min(it.w, it.d), cx = it.x, cz = it.z, t = 2.5, dir = it.facing;
  return dir === 'right' ? { x0: cx - s / 2, x1: cx - s / 2 + t, z0: cz - s / 2, z1: cz + s / 2 } : dir === 'left' ? { x0: cx + s / 2 - t, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2 }
    : dir === 'front' ? { x0: cx - s / 2, x1: cx + s / 2, z0: cz + s / 2 - t, z1: cz + s / 2 } : { x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz - s / 2 + t };
}

export const FURN5 = {
  desk(d, it) {
    const b = box(it), f = it.floor, top = S.desk.surface, active = d.stationActive(`development:${it.station}`), seed = it.x * 0.37;
    // A-frame steel legs, a modesty panel, an oak top with a dark edge band.
    for (const x of [b.x0 + 1.5, b.x1 - 3]) litBox(d, f, { x0: x, x1: x + 1.5, z0: b.z0 + 1.5, z1: b.z1 - 1.5, h1: top - 2 }, MAT.steel[0], { edge: false });
    litBox(d, f, { x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z1 - 3, z1: b.z1 - 2, h0: top - 12, h1: top - 2 }, MAT.steel[0], { ao: false, edge: false });
    litBox(d, f, { ...b, h0: top - 2.2, h1: top }, { front: MAT.woodDark[0], top: MAT.oak[0] });
    // Keyboard, mouse, a mug (colour by seat), a notebook.
    patch(d, f, it.x - 8, it.x + 8, b.z0 + 2, b.z0 + 5.5, top + 0.3, '#2b3038'); patch(d, f, it.x - 7.5, it.x + 7.5, b.z0 + 2.4, b.z0 + 5, top + 0.4, '#3a404a');
    litBox(d, f, { x0: it.x + 10, x1: it.x + 12, z0: b.z0 + 3, z1: b.z0 + 4.8, h0: top, h1: top + 0.8 }, '#2b3038', { ao: false, edge: false });
    litBox(d, f, { x0: b.x1 - 9, x1: b.x1 - 6, z0: b.z0 + 3, z1: b.z0 + 6, h0: top, h1: top + 4.5 }, ['#f4f1ea', '#2f7df6', '#e0e6ec'][Math.floor(hash(seed) * 3)], { ao: false });
    if (hash(seed + 1) > 0.5) litBox(d, f, { x0: b.x0 + 4, x1: b.x0 + 11, z0: b.z0 + 3, z1: b.z0 + 8, h0: top, h1: top + 0.8 }, '#e8e4da', { ao: false, edge: false });
    // Monitor on an arm, facing the seat (toward the camera).
    const mz = it.z + 1.5, m0 = top + 5, m1 = top + 20;
    litBox(d, f, { x0: it.x - 1.2, x1: it.x + 1.2, z0: mz + 1, z1: mz + 3, h0: top, h1: m0 + 2 }, MAT.aluminium[0], { ao: false, edge: false });
    litBox(d, f, { x0: it.x - 13, x1: it.x + 13, z0: mz - 0.6, z1: mz + 0.8, h0: m0, h1: m1 }, '#1d2229', { ao: false });
    screen(d, f, it.x - 12, it.x + 12, mz - 0.7, m0 + 1, m1 - 1, active, seed);
    if (active) glowAt(d, ...d.P.at(it.x, mz - 3, f, (m0 + m1) / 2), 26, 'rgba(120,190,255,0.22)');
  },
  officeChair(d, it, part = 'all') {
    const f = it.floor, s = Math.min(it.w, it.d), k = S.officeChair ?? S.chair, sh = k.seat, cx = it.x, cz = it.z;
    if (part !== 'back') {
      // Five-star base on castors, gas lift, a contoured seat.
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3, ex = cx + Math.cos(a) * s * 0.42, ez = cz + Math.sin(a) * s * 0.42; d.ctx.strokeStyle = '#23282f'; d.ctx.lineWidth = 1.4; d.ctx.beginPath(); d.ctx.moveTo(...d.P.at(cx, cz, f, 2)); d.ctx.lineTo(...d.P.at(ex, ez, f, 1)); d.ctx.stroke(); d.ctx.fillStyle = '#15181d'; d.ctx.beginPath(); d.ctx.arc(...d.P.at(ex, ez, f, 0.6), 0.9, 0, TAU); d.ctx.fill(); }
      litBox(d, f, { x0: cx - 0.8, x1: cx + 0.8, z0: cz - 0.8, z1: cz + 0.8, h0: 2, h1: sh - 3 }, MAT.steelLight[0], { ao: false, edge: false });
      litBox(d, f, { x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2, h0: sh - 3, h1: sh }, '#2e3a4a');
    }
    if (part !== 'seat') { const bk = chairBackBox(it); litBox(d, f, { ...bk, h0: sh + 1, h1: it.h }, '#2a3542'); const mid = { ...bk }; d.ctx.globalAlpha = 0.25; litBox(d, f, { ...mid, h0: sh + 4, h1: it.h - 3 }, '#51647a', { ao: false, edge: false }); d.ctx.globalAlpha = 1; }
  },
  chair(d, it, part = 'all') {
    const f = it.floor, s = Math.min(it.w, it.d), sh = S.chair.seat, cx = it.x, cz = it.z;
    if (part !== 'back') {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ox = dx * (s / 2 - 1.2), oz = dz * (s / 2 - 1.2); litBox(d, f, { x0: cx + ox - 0.6, x1: cx + ox + 0.6, z0: cz + oz - 0.6, z1: cz + oz + 0.6, h1: sh - 2 }, MAT.steel[0], { ao: false, edge: false }); }
      litBox(d, f, { x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2, h0: sh - 2, h1: sh }, MAT.oak[0]);
    }
    if (part !== 'seat') litBox(d, f, { ...chairBackBox(it), h0: sh + 2, h1: it.h }, MAT.oak[0]);
  },
  roundTable(d, it) {
    const f = it.floor, r = Math.min(it.w, it.d) / 2, top = it.h;
    cylinder(d, f, it.x, it.z, r * 0.12, 0, top - 2, MAT.steel[0]);
    cylinder(d, f, it.x, it.z, r * 0.45, 0, 1, MAT.steel[0]);
    cylinder(d, f, it.x, it.z, r, top - 2, top, MAT.woodDark[0], { top: lit(MAT.oak[0], 1.04) });
    if (hash(it.x) > 0.4) { litBox(d, f, { x0: it.x - 3, x1: it.x + 3, z0: it.z - 2, z1: it.z + 2, h0: top, h1: top + 0.6 }, '#f2efe6', { ao: false, edge: false }); cylinder(d, f, it.x + r * 0.45, it.z + r * 0.2, 1.4, top, top + 4, '#e7ecf2'); }
  },
  table(d, it) {
    const b = box(it), f = it.floor, top = it.h;
    for (const [x, z] of [[b.x0 + 1.5, b.z0 + 1.5], [b.x1 - 3, b.z0 + 1.5], [b.x0 + 1.5, b.z1 - 3], [b.x1 - 3, b.z1 - 3]]) litBox(d, f, { x0: x, x1: x + 1.5, z0: z, z1: z + 1.5, h1: top - 2 }, MAT.steel[0], { ao: false, edge: false });
    litBox(d, f, { ...b, h0: top - 2, h1: top }, { front: MAT.woodDark[0], top: MAT.oak[0] });
  },
  bookshelf(d, it) {
    const b = box(it), f = it.floor, h = it.h, shelves = 4, seed = it.x * 0.13 + it.z;
    litBox(d, f, { ...b, h1: h }, MAT.white[0]);
    const inset = { x0: b.x0 + 1.2, x1: b.x1 - 1.2, z: b.z0 - 0.05 };
    for (let s = 0; s < shelves; s++) {
      const h0 = 2 + s * (h - 4) / shelves, h1 = h0 + (h - 4) / shelves - 1.2;
      panel(d, f, inset.x0, inset.x1, inset.z, h0, h1, lit(MAT.white[0], 0.78));
      // Books: runs of spines of varied height and colour, sometimes a box or a plant instead.
      let x = inset.x0 + 0.4, k = 0;
      while (x < inset.x1 - 1) {
        const r = hash(seed + s * 17 + k++), w = 1 + r * 1.6;
        if (r > 0.9 && x < inset.x1 - 6) { litBox(d, f, { x0: x, x1: x + 5, z0: b.z0 + 1, z1: b.z0 + 5, h0, h1: h0 + (h1 - h0) * 0.6 }, '#c8a57a', { ao: false, edge: false }); x += 6; continue; }
        const c = ['#2f7df6', '#c9503f', '#3f7a55', '#e3b341', '#6b4fb8', '#3a4555', '#e8e2d6'][Math.floor(hash(seed + k * 3 + s) * 7)];
        panel(d, f, x, Math.min(inset.x1 - 0.4, x + w), inset.z - 0.1, h0, h0 + (h1 - h0) * (0.7 + r * 0.28), lit(c, 0.95)); x += w + 0.25;
      }
    }
  },
  serverRack(d, it) {
    const b = box(it), f = it.floor, h = it.h, T = d.T;
    litBox(d, f, { ...b, h1: h }, '#232a33');
    panel(d, f, b.x0 + 1, b.x1 - 1, b.z0 - 0.05, 2, h - 2, '#1a1f26');
    for (let u = 0; u < 12; u++) { const hh = 4 + u * (h - 8) / 12; panel(d, f, b.x0 + 2, b.x1 - 2, b.z0 - 0.1, hh, hh + (h - 8) / 12 - 0.8, u % 3 ? '#2c343f' : '#343e4b'); const on = hash(u * 3.1 + it.x + Math.floor(T * (1.5 + (u % 3)))) > 0.4; const [lx, ly] = d.P.at(b.x1 - 3.5, b.z0 - 0.2, f, hh + 1.2); d.ctx.fillStyle = on ? (u % 4 ? '#6be58b' : '#5ab8ff') : '#2a4a38'; d.ctx.fillRect(lx, ly, 1.3, 1.3); }
  },
  printer(d, it) {
    const b = box(it), f = it.floor, h = it.h;
    litBox(d, f, { ...b, h1: h * 0.55 }, '#dfe3e7');
    litBox(d, f, { x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0 + 1, z1: b.z1 - 1, h0: h * 0.55, h1: h }, '#eceff2');
    litBox(d, f, { x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z1 - 5, z1: b.z1 - 1, h0: h, h1: h + 1.2 }, '#3a414b', { ao: false });
    patch(d, f, b.x0 + 3, b.x1 - 3, b.z0 + 2, b.z0 + 7, h * 0.55 + 0.2, '#fbfbf8');
    const [lx, ly] = d.P.at(b.x1 - 3, b.z0 - 0.1, f, h * 0.8); d.ctx.fillStyle = '#5ab8ff'; d.ctx.fillRect(lx, ly, 1.4, 1.4);
  },
  plant(d, it) {
    const f = it.floor, r = Math.min(it.w, it.d) / 2, h = it.h, sway = d.reduced ? 0 : wind(d.T * 0.4, it.x, it.z) * 1.2;
    cylinder(d, f, it.x, it.z, r * 0.7, 0, h * 0.3, hash(it.x) > 0.5 ? '#e9e6df' : '#b8764e');
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + hash(it.z) * 3, rr = r * (0.5 + hash(k + it.x) * 0.5); const [x, y] = d.P.at(it.x + Math.cos(a) * rr * 0.6 + sway * (k % 2), it.z + Math.sin(a) * rr * 0.5, f, h * (0.5 + hash(k * 7 + it.x) * 0.45)); litBlob(d.ctx, x, y, r * 0.55, k % 2 ? MAT.foliage[0] : MAT.foliageLight[0], { squash: 0.85 }); }
  },
  waterCooler(d, it) {
    const b = box(it, 1, -1, 1, -1), f = it.floor, h = it.h;
    litBox(d, f, { ...b, h1: h * 0.62 }, '#e9edf1');
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; d.ctx.globalAlpha = 0.8; cylinder(d, f, cx, cz, (b.x1 - b.x0) * 0.42, h * 0.62, h, '#8fc6ee'); d.ctx.globalAlpha = 1;
  },
  vending(d, it) {
    const b = box(it), f = it.floor, h = it.h, T = d.T;
    litBox(d, f, { ...b, h1: h }, '#2f7df6');
    panel(d, f, b.x0 + 2, b.x1 - 6, b.z0 - 0.05, 8, h - 4, '#cfe6f7');
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { const [x, y] = d.P.at(b.x0 + 3.5 + c * (b.x1 - b.x0 - 10) / 4, b.z0 - 0.1, f, 10 + r * (h - 16) / 5); d.ctx.fillStyle = ['#e0533f', '#f2c94c', '#3f7a55', '#6b4fb8'][(r + c) % 4]; d.ctx.fillRect(x, y - 3, 2.6, 3); }
    glowAt(d, ...d.P.at((b.x0 + b.x1) / 2, b.z0 - 2, f, h * 0.6), 18 + Math.sin(T * 2) * 0.5, 'rgba(170,215,255,0.18)');
  },
  reviewConsole(d, it) {
    const b = box(it), f = it.floor, top = S.desk?.surface ?? it.h * 0.6, active = d.stationActive(`testing:${it.station}`) || d.room('testing') > 0;
    for (const x of [b.x0 + 1.5, b.x1 - 3]) litBox(d, f, { x0: x, x1: x + 1.5, z0: b.z0 + 1.5, z1: b.z1 - 1.5, h1: top - 2 }, MAT.steel[0], { edge: false });
    litBox(d, f, { ...b, h0: top - 2.2, h1: top }, { front: MAT.steel[0], top: '#dfe3e7' });
    const n = Math.max(2, Math.round((b.x1 - b.x0) / 26)), w = (b.x1 - b.x0 - 4) / n;
    for (let k = 0; k < n; k++) { const x0 = b.x0 + 2 + k * w, mz = it.z + 1.5; litBox(d, f, { x0: x0 + 0.5, x1: x0 + w - 0.5, z0: mz - 0.6, z1: mz + 0.8, h0: top + 4, h1: top + 18 }, '#1d2229', { ao: false }); screen(d, f, x0 + 1.2, x0 + w - 1.2, mz - 0.7, top + 5, top + 17, active, it.x + k * 11); }
    // A test rig: a small board with a status light that follows the latest real test run.
    litBox(d, f, { x0: b.x0 + 3, x1: b.x0 + 12, z0: b.z0 + 2, z1: b.z0 + 8, h0: top, h1: top + 1.5 }, '#1e6b4a', { ao: false });
    const tr = d.lastTests, [lx, ly] = d.P.at(b.x0 + 10, b.z0 + 3, f, top + 1.6); d.ctx.fillStyle = !tr ? '#556' : tr.state === 'running' ? (Math.sin(d.T * 6) > 0 ? '#f2c94c' : '#6b5a20') : tr.failed ? '#e5484d' : '#5be38b'; d.ctx.beginPath(); d.ctx.arc(lx, ly, 1.3, 0, TAU); d.ctx.fill();
  },
  reception(d, it) {
    const b = box(it), f = it.floor, h = it.h;
    litBox(d, f, { ...b, h1: h - 2 }, MAT.oak[0]);
    for (let x = b.x0 + 2; x < b.x1 - 1; x += 3) panel(d, f, x, x + 1.4, b.z0 - 0.05, 1, h - 3, lit(MAT.woodDark[0], 1));
    litBox(d, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1, h0: h - 2, h1: h }, MAT.white[0]);
    panel(d, f, (b.x0 + b.x1) / 2 - 12, (b.x0 + b.x1) / 2 + 12, b.z0 - 0.2, h * 0.45, h * 0.62, MAT.brand[0]); // the Hillink blue band
    const [tx, ty] = d.P.at((b.x0 + b.x1) / 2, b.z0 - 0.3, f, h * 0.535); d.ctx.fillStyle = '#fff'; d.ctx.font = '700 4px ui-sans-serif, system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle'; d.ctx.fillText('HILLINK', tx, ty);
    litBox(d, f, { x0: b.x1 - 12, x1: b.x1 - 3, z0: b.z1 - 3, z1: b.z1 - 2, h0: h, h1: h + 8 }, '#1d2229', { ao: false });
  },
  counter(d, it) {
    const b = box(it), f = it.floor, h = it.h;
    litBox(d, f, { ...b, h1: h - 2 }, MAT.white[0]);
    for (let x = b.x0 + 1; x < b.x1 - 4; x += (b.x1 - b.x0) / 3) { panel(d, f, x + 0.6, x + (b.x1 - b.x0) / 3 - 0.6, b.z0 - 0.05, 2, h - 4, lit(MAT.white[0], 0.95)); const [kx, ky] = d.P.at(x + (b.x1 - b.x0) / 6, b.z0 - 0.1, f, h - 7); d.ctx.fillStyle = MAT.steelLight[0]; d.ctx.fillRect(kx - 2, ky, 4, 0.8); }
    litBox(d, f, { x0: b.x0 - 0.5, x1: b.x1 + 0.5, z0: b.z0 - 0.5, z1: b.z1 + 0.5, h0: h - 2, h1: h }, '#3d434b');
  },
  coffeeMachine(d, it) {
    const b = box(it), f = it.floor, h = it.h, base = it.on ? (S.counter?.surface ?? 0) : 0, T = d.T;
    litBox(d, f, { ...b, h0: base, h1: base + h }, '#2a2f37');
    litBox(d, f, { x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0 - 0.5, z1: b.z0 + 1, h0: base + h * 0.2, h1: base + h * 0.35 }, MAT.aluminium[0], { ao: false, edge: false });
    const [lx, ly] = d.P.at(b.x1 - 2, b.z0 - 0.1, f, base + h * 0.8); d.ctx.fillStyle = Math.sin(T * 1.5 + it.x) > 0 ? '#5be38b' : '#2b5e3b'; d.ctx.fillRect(lx, ly, 1.2, 1.2);
  },
  couch(d, it) {
    const b = box(it), f = it.floor, k = S.couch, arm = 5, c = hash(it.x) > 0.5 ? MAT.fabric[0] : MAT.fabricGrey[0];
    for (const [x, z] of [[b.x0 + 2, b.z0 + 1.5], [b.x1 - 3, b.z0 + 1.5]]) litBox(d, f, { x0: x, x1: x + 1, z0: z, z1: z + 1, h1: 2 }, MAT.woodDark[0], { ao: false, edge: false });
    litBox(d, f, { ...b, h0: 2, h1: k.seat - 3 }, lit(c, 0.9));
    litBox(d, f, { ...b, z0: b.z1 - k.back, h0: 2, h1: it.h }, c);
    const seats = Math.max(2, Math.round((b.x1 - b.x0 - 2 * arm) / 26)), w = (b.x1 - b.x0 - 2 * arm) / seats;
    for (let s = 0; s < seats; s++) { const x0 = b.x0 + arm + s * w; litBox(d, f, { x0: x0 + 0.4, x1: x0 + w - 0.4, z0: b.z0 + 0.5, z1: b.z1 - k.back, h0: k.seat - 3, h1: k.seat }, lit(c, 1.05)); litBox(d, f, { x0: x0 + 0.6, x1: x0 + w - 0.6, z0: b.z1 - k.back - 3, z1: b.z1 - k.back, h0: k.seat, h1: it.h - 3 }, lit(c, 1.02), { ao: false }); }
    for (const x of [b.x0, b.x1 - arm]) litBox(d, f, { x0: x, x1: x + arm, z0: b.z0, z1: b.z1, h0: 2, h1: k.seat + 4 }, c);
    const [px, py] = d.P.at(b.x0 + arm + 5, b.z1 - k.back - 1, f, k.seat + 5); litBlob(d.ctx, px, py, 3.5, hash(it.z) > 0.5 ? '#f2c94c' : '#e8e2d6', { squash: 0.8 });
  },
  armchair(d, it) {
    const b = box(it), f = it.floor, k = S.armchair ?? S.couch, c = MAT.fabricWarm[0];
    litBox(d, f, { ...b, h0: 2, h1: (k.seat ?? 18) }, c);
    litBox(d, f, { ...b, z0: b.z1 - (k.back ?? 6), h0: 2, h1: it.h }, c);
    for (const x of [b.x0, b.x1 - 4]) litBox(d, f, { x0: x, x1: x + 4, z0: b.z0, z1: b.z1, h0: 2, h1: (k.seat ?? 18) + 4 }, lit(c, 0.95));
  },
  bench(d, it) {
    const b = box(it), f = it.floor, k = S.bench ?? { seat: it.h * 0.55 };
    for (const x of [b.x0 + 2, b.x1 - 3.5]) litBox(d, f, { x0: x, x1: x + 1.5, z0: b.z0 + 1, z1: b.z1 - 1, h1: k.seat - 2 }, MAT.steel[0], { edge: false });
    const slats = 4, dz = (b.z1 - b.z0) / slats;
    for (let s = 0; s < slats; s++) litBox(d, f, { x0: b.x0, x1: b.x1, z0: b.z0 + s * dz + 0.3, z1: b.z0 + (s + 1) * dz - 0.3, h0: k.seat - 2, h1: k.seat }, MAT.oak[0], { ao: false });
  },
};
export { mix };
