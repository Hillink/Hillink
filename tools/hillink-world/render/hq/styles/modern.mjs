// Modern HQ (theme 'real' under ?art=hq): a stylised, warm contemporary office. Concrete, glass, steel, oak and dark
// metal; warm interior light, live screens, servers, plants, landscaping and signs. Accents are used sparingly
// (Hillink blue, agent colours); the palette is not neon. Every function here only decides how a semantic object
// from model.mjs looks; nothing here decides what exists.
import { drawPlant, plantHeight } from '../../art5d/ground.mjs';
import { skyColors } from '../sky.mjs';
import { css } from '../color.mjs';
import { TAU, HT, LOW, shade, mix, poly, glow, h1, pattern, TEX, fillPlan, inPlan, drawGround, ib, baseH, frontFace, paintFront, table, chair, screen, glyphRows, drawSite, drawRefit, decorSpans, tallSpans, windowsOf, wallOfDoor, wallFace, orientedBox, hearthSpots as hearthSpotsOf, spotBox, spotFace, spotAt } from './common.mjs';
import { modernSite } from './modern-site.mjs';

const C = {
  plaster: '#ebe5da', cut: '#3a3e46', concrete: '#a4a8ae', concreteDark: '#7e838b', oak: '#c99a62', oakDark: '#9c7244', steel: '#2c3038', alu: '#b9bec5',
  glass: 'rgba(170,215,235,0.22)', glassEdge: 'rgba(230,245,255,0.55)', fabric: '#56707c', fabric2: '#3f4a5a', leather: '#9a5a32', white: '#f1efea', blue: '#3a7bd5',
};
const AGENT_COLOR = { claude: '#ff8a3d', codex: '#4aa3ff', chatgpt: '#2fbf71' };
const FLOORS = {
  lobby: ['concrete', '#cbc7bf'], passage: ['concrete', '#c4c0b8'], command: ['carpet', '#414b5a'], development: ['oak', '#c99d6b'], workshop: ['oak', '#c99d6b'], office: ['oak', '#c99d6b'],
  servers: ['raised', '#b9bfc7'], 'servers-like': ['raised', '#b9bfc7'], testing: ['epoxy', '#d3d8db'], lounge: ['oak', '#b98756'], 'lounge-like': ['oak', '#b98756'], comms: ['carpet', '#5a5f6e'], 'comms-like': ['carpet', '#5a5f6e'],
};
const WALLS = { lobby: '#e9e3d7', passage: '#e6e0d4', command: '#dfe3ea', development: '#ece6db', servers: '#39404b', 'servers-like': '#39404b', testing: '#e3e7e9', lounge: '#efe2cf', comms: '#e6e2ea' };
const RUG = { command: ['#2c3a52', '#c9a45c'], lounge: ['#a8634a', '#e9d6b4'], 'lounge-like': ['#a8634a', '#e9d6b4'], comms: ['#38506a', '#d9c49a'], lobby: ['#2e3644', '#3a7bd5'] };

export function createModernStyle({ K, U, model }) {
  const decor = decorSpans(model), tall = tallSpans(model);
  const winOf = new Map(model.walls.map(w => [w, windowsOf(w, decor, tall, 30, 20)]));
  const doorWall = new Map(model.doors.map(dr => [dr, wallOfDoor(model, dr)]));
  // The lounge's fireplace spot (shared with Fantasy): a walnut feature wall with a linear fireplace and a canvas.
  const hearthSpots = hearthSpotsOf(model, winOf);
  const ext = modernSite({ K, U, model, C, hearthSpots });
  function fireplace(d, sp) {
    const { ctx, K } = d, f = sp.f, T = d.reduced ? 0 : d.T, face = (b, h0, h1, fn) => { const [kind, c, a, e] = spotFace(sp, b); K.onFace(ctx, f, kind, c, a, e, h0, h1, e - a, h1 - h0, g => fn(g, e - a, h1 - h0)); };
    const pb = { ...spotBox(sp, 0, 3, -30, 30), h0: 0, h1: HT - 8 };
    K.box(ctx, f, pb, '#5a4637', { top: '#3a2e25' });
    face(pb, 0, HT - 8, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 2; x < w; x += 3) g.fillRect(x, 0, 0.6, h);
      // A canvas above the fire.
      g.fillStyle = '#f1efea'; g.fillRect(w * 0.18, 10, w * 0.64, 30); const cols = ['#3a7bd5', '#e0b85a', '#c0533d', '#2b2f36']; for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(w * (0.3 + i * 0.13), 18 + (i % 2) * 10, 5 + (i % 3) * 2, 0, TAU); g.fill(); } g.strokeStyle = '#2b2f36'; g.lineWidth = 0.6; g.strokeRect(w * 0.18, 10, w * 0.64, 30);
      // The firebox: a black slot with a low flame line over pale stones.
      const y = h - 26; g.fillStyle = '#121418'; g.fillRect(w * 0.12, y, w * 0.76, 12); g.fillStyle = '#d9d4ca'; for (let x = w * 0.14; x < w * 0.86; x += 3.2) { g.beginPath(); g.ellipse(x, y + 10.5, 1.5, 0.9, 0, 0, TAU); g.fill(); }
      const gr = g.createLinearGradient(0, y + 10, 0, y + 2); gr.addColorStop(0, '#ffd27a'); gr.addColorStop(0.6, '#ff8a3a'); gr.addColorStop(1, 'rgba(255,100,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(w * 0.14, y + 10); for (let x = w * 0.14; x <= w * 0.86; x += 1.4) g.lineTo(x, y + 10 - 2.5 - 4 * Math.abs(Math.sin(x * 0.6 + T * 6)) * (0.6 + 0.4 * Math.sin(T * 2.3 + x * 0.2))); g.lineTo(w * 0.86, y + 10); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(w * 0.12, y, w * 0.2, 12);
    });
    K.box(ctx, f, { ...spotBox(sp, 0, 9, -34, 34), h0: 0, h1: 5 }, '#d9d4ca', { edge: 'rgba(255,255,255,0.5)' });
    const [lx, lz] = spotAt(sp, 6, 0), [gx, gy] = K.at(lx, lz, f, 14); glow(ctx, gx, gy, 30, '#ffb060', 0.35 + 0.05 * Math.sin(T * 5));
    for (const k of [-26, 24]) { const [vx, vz] = spotAt(sp, 5, k); K.cylinder(ctx, f, vx, vz, 5, 12, 2, k < 0 ? '#e9e6df' : '#3a3e46'); }
  }

  const floorFill = (ctx, kind) => {
    const [mat, base] = FLOORS[kind] ?? ['oak', '#c99d6b'];
    if (mat === 'oak') return pattern(ctx, 'm:oak:' + base, 72, 30, TEX.planks(base));
    if (mat === 'carpet') return pattern(ctx, 'm:carpet:' + base, 40, 40, TEX.speckle(base, { n: 300, k: 0.06 }));
    if (mat === 'raised') return pattern(ctx, 'm:raised', 17, 17, TEX.tiles(base, { dots: true }));
    if (mat === 'epoxy') return pattern(ctx, 'm:epoxy', 40, 40, TEX.speckle(base, { n: 160, k: 0.08 }));
    return pattern(ctx, 'm:concrete:' + base, 40, 40, TEX.speckle(base, { n: 90, k: 0.07, seam: 1 }));
  };

  // Screen contents (decorative glyphs; live while someone is really working there).
  const code = (state, seed, T) => (g, w, h) => {
    g.fillStyle = state ? '#0f1722' : '#141920'; g.fillRect(0, 0, w, h);
    if (!state) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.4, 0); g.lineTo(0, h * 0.8); g.fill(); return; }
    if (state === 'present') { g.fillStyle = '#1d3350'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(w * 0.42, h * 0.38, w * 0.16, h * 0.24); return; }
    glyphRows(g, w, h, T, seed, ['#7fb7ff', '#f2c879', '#9be39b', '#d3d9e2', '#c9a0ff'], { scroll: true, speed: 1.5, lh: 2 });
    if (state === 'blocked') { g.fillStyle = 'rgba(230,80,70,0.35)'; g.fillRect(0, h - 3, w, 3); }
  };

  function monitor(d, it, x, z, h0, w, seed) { const st = d.stationState(it.station) ?? d.near?.(it); screen(d, it.f, x, z, w, h0, h0 + w * 0.62 + 4, C.steel, code(st, seed, d.T)); }

  const items = {
    desk(d, it) {
      const b = ib(it), f = it.f, h = it.h;
      table(d, f, b, h, { top: C.oak, leg: C.steel, slab: true, legW: 1.4, panel: shade(C.steel, 1.2) });
      monitor(d, it, it.x - it.w * 0.14, it.z + it.d * 0.18, h, it.w * 0.3, it.id);
      monitor(d, it, it.x + it.w * 0.18, it.z + it.d * 0.18, h, it.w * 0.26, it.id + 'b');
      d.K.box(d.ctx, f, { x0: it.x - 6, x1: it.x + 6, z0: it.z - it.d * 0.3, z1: it.z - it.d * 0.3 + 3, h0: h, h1: h + 0.6 }, '#d7dade');
      if (h1(it.id, 'mug') > 0.4) d.K.cylinder(d.ctx, f, b.x1 - 4, it.z - 2, h, h + 3, 1.3, h1(it.id, 'mc') > 0.5 ? '#e9e6df' : '#3a7bd5');
      if (h1(it.id, 'lamp') > 0.55) { const [x, y] = d.K.at(b.x0 + 4, it.z + 4, f, h); d.ctx.strokeStyle = C.steel; d.ctx.lineWidth = 1; d.ctx.beginPath(); d.ctx.moveTo(x, y); d.ctx.lineTo(x + 2, y - 12); d.ctx.lineTo(x + 7, y - 10); d.ctx.stroke(); d.ctx.fillStyle = '#ffe6b0'; d.ctx.beginPath(); d.ctx.arc(x + 7, y - 9, 1.6, 0, TAU); d.ctx.fill(); }
    },
    officeChair(d, it) { chair(d, it, { seat: '#30353f', back: '#2a2f38', leg: '#1d2026', pedestal: true, seatH: it.h * 0.45, backH: it.h * 0.95 }); },
    chair(d, it) { chair(d, it, { seat: C.oak, back: C.oakDark, leg: C.steel, seatH: it.h * 0.5, backH: it.h * 0.95 }); },
    roundTable(d, it) {
      const { ctx, K } = d, f = it.f, h = it.h;
      K.cylinder(ctx, f, it.x, it.z, 0, h - 2, 1.6, C.steel);
      K.cylinder(ctx, f, it.x, it.z, h - 2, h, Math.min(it.w, it.d) * 0.5, C.white, { edge: 'rgba(0,0,0,0.12)' });
      K.cylinder(ctx, f, it.x - 3, it.z + 2, h, h + 3, 1.2, '#e9e6df'); K.cylinder(ctx, f, it.x + 4, it.z - 1, h, h + 0.6, 2.6, '#3a7bd5');
    },
    bookshelf(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f;
      K.box(ctx, f, { ...b, h1: it.h }, C.oak, { edge: 'rgba(255,255,255,0.2)' });
      paintFront(d, it, b, 0, it.h, (g, w, h) => {
        g.fillStyle = '#3b2c1f'; g.fillRect(1.5, 1.5, w - 3, h - 3);
        const rows = 4, rh = (h - 3) / rows;
        for (let r = 0; r < rows; r++) { let x = 2; while (x < w - 3) { const bw = 1.4 + h1(it.id, r, x) * 1.8, bh = rh * (0.6 + h1(x, r, it.id) * 0.32); g.fillStyle = ['#c0533d', '#3a6fb0', '#e1b84b', '#5b8f5a', '#e9e3d4', '#41444d'][Math.floor(h1(r, x, 'c') * 6)]; if (h1(r, x, 'gap') > 0.88) { x += 3; continue; } g.fillRect(x, 1.5 + r * rh + rh - bh, bw, bh); x += bw + 0.3; } g.fillStyle = C.oak; g.fillRect(1.5, 1.5 + (r + 1) * rh - 0.8, w - 3, 0.8); }
      }, 0);
    },
    printer(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f;
      K.box(ctx, f, { ...b, h1: it.h * 0.7 }, '#d9dbdf', { edge: 'rgba(255,255,255,0.4)' });
      K.box(ctx, f, { x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0 + 1, z1: b.z1 - 1, h0: it.h * 0.7, h1: it.h }, '#5a5f68');
      K.box(ctx, f, { x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0 + 2, z1: b.z0 + 6, h0: it.h, h1: it.h + 0.8 }, '#ffffff');
      paintFront(d, it, b, it.h * 0.45, it.h * 0.68, (g, w, h) => { g.fillStyle = '#1e2229'; g.fillRect(w * 0.6, 1, w * 0.3, h * 0.5); g.fillStyle = (Math.floor(d.T) % 4) ? '#39d47a' : '#2a8f55'; g.fillRect(w * 0.15, h * 0.3, 1.4, 1.4); });
    },
    plant(d, it) { pottedPlant(d, it.f, it.x, it.z, baseH(it), it.h, it.id); },
    reviewConsole(d, it) {
      const b = ib(it), f = it.f, h = it.h, st = d.near?.(it);
      table(d, f, b, h, { top: '#e9e7e2', leg: C.steel, slab: true, panel: '#4a505b' });
      for (const k of [-1, 0, 1]) screen(d, f, it.x + k * it.w * 0.28, it.z + it.d * 0.15, it.w * 0.24, h, h + it.w * 0.18, C.steel, (g, w, hh) => {
        g.fillStyle = '#10161f'; g.fillRect(0, 0, w, hh); if (!st) return;
        if (k === 0) { for (let i = 0; i < 6; i++) { g.fillStyle = h1(i, Math.floor(d.T / 3)) > 0.15 ? '#3ccf7a' : '#e0b040'; g.fillRect(2, 2 + i * 2.2, 1.4, 1.4); g.fillStyle = '#7d8896'; g.fillRect(5, 2.2 + i * 2.2, w * 0.6 * h1(i, 'w'), 1); } }
        else glyphRows(g, w, hh, d.T, it.id + k, ['#7fb7ff', '#d3d9e2', '#9be39b'], { scroll: true, lh: 2 });
      });
    },
    serverRack(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, H = it.h;
      K.box(ctx, f, { ...b, h1: H }, '#22262e', { edge: 'rgba(160,190,220,0.25)' });
      const F = frontFace(it) ?? 'front', T = d.reduced ? 0 : d.T;
      const paint = (g, w, h) => {
        g.fillStyle = '#15181e'; g.fillRect(1, 1, w - 2, h - 2);
        const n = 12, rh = (h - 4) / n;
        for (let i = 0; i < n; i++) { g.fillStyle = i % 4 === 3 ? '#2b3039' : '#1f232a'; g.fillRect(2, 2 + i * rh, w - 4, rh - 0.5); for (let k = 0; k < 4; k++) { const on = h1(i, k, it.id) + 0.5 * Math.sin(T * (2 + h1(k, i) * 5) + i + k) > 0.6; g.fillStyle = on ? (h1(i, k) > 0.85 ? '#ffb347' : '#46e08a') : '#1d3b2a'; g.fillRect(w - 4 - k * 2, 2.6 + i * rh, 1, 1); } g.fillStyle = 'rgba(120,170,255,0.25)'; g.fillRect(3, 2.8 + i * rh, w * 0.4, 0.5); }
      };
      if (F === 'front') K.onFace(ctx, f, 'front', b.z0, b.x0, b.x1, 0, H, b.x1 - b.x0, H, g => paint(g, b.x1 - b.x0, H));
      else K.onFace(ctx, f, 'right', b.x1, b.z0, b.z1, 0, H, b.z1 - b.z0, H, g => paint(g, b.z1 - b.z0, H));
    },
    couch(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.5, c = C.fabric;
      K.box(ctx, f, { x0: b.x0, x1: b.x1, z0: b.z1 - 4, z1: b.z1, h0: 0, h1: it.h }, shade(c, 0.9));
      K.box(ctx, f, { x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0, z1: b.z1 - 4, h0: 1.5, h1: s }, c, { edge: 'rgba(255,255,255,0.15)' });
      for (const x of [b.x0, b.x1 - 3]) K.box(ctx, f, { x0: x, x1: x + 3, z0: b.z0, z1: b.z1, h0: 1.5, h1: it.h * 0.72 }, shade(c, 0.95));
      const mid = (b.x0 + b.x1) / 2; poly(ctx, [K.at(mid, b.z0 + 1, f, s), K.at(mid, b.z1 - 4, f, s)], null, 'rgba(0,0,0,0.25)');
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(...K.at(mid, b.z0 + 1, f, s)); ctx.lineTo(...K.at(mid, b.z1 - 4, f, s)); ctx.stroke();
      K.box(ctx, f, { x0: b.x0 + 5, x1: b.x0 + 12, z0: b.z1 - 7, z1: b.z1 - 4, h0: s, h1: s + 7 }, '#e0b85a');
    },
    counter(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h = it.h;
      K.box(ctx, f, { ...b, h1: h - 1.5 }, C.white, { edge: 'rgba(0,0,0,0.08)' });
      paintFront(d, it, b, 2, h - 2, (g, w, hh) => { g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 0.4; for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); } g.fillStyle = C.steel; for (let x = w / 8; x < w; x += w / 4) g.fillRect(x - 2, 2, 4, 0.6); });
      K.box(ctx, f, { x0: b.x0 - 0.5, x1: b.x1 + 0.5, z0: b.z0 - 0.5, z1: b.z1, h0: h - 1.5, h1: h }, '#3b3f46');
      K.box(ctx, f, { x0: b.x1 - 10, x1: b.x1 - 3, z0: it.z, z1: b.z1 - 2, h0: h, h1: h + 1 }, '#8fa2b0');
      for (let k = 0; k < 3; k++) K.cylinder(ctx, f, b.x0 + 4 + k * 3, b.z1 - 4, h, h + 2.6, 1, ['#e9e6df', '#3a7bd5', '#d26f4b'][k]);
    },
    coffeeMachine(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h0 = baseH(it), T = d.reduced ? 0 : d.T;
      K.box(ctx, f, { ...b, h0, h1: h0 + it.h }, '#2a2d33', { edge: 'rgba(255,255,255,0.2)' });
      K.box(ctx, f, { x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0 - 0.5, z1: b.z0 + 2, h0: h0 + it.h * 0.3, h1: h0 + it.h * 0.42 }, '#b9bec5');
      const [sx, sy] = K.at(it.x, b.z0 + 1, f, h0 + it.h);
      // Steam: a few soft wisps rising and fading.
      for (let i = 0; i < 3; i++) { const k = ((T * 0.35 + i / 3) % 1); ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx + Math.sin(T * 2 + i * 2) * 2 * k, sy - 3 - k * 14, 1.5 + k * 2.5, 0, TAU); ctx.fill(); }
    },
    vending(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, H = it.h;
      K.box(ctx, f, { ...b, h1: H }, '#c43b3b', { edge: 'rgba(255,255,255,0.25)' });
      paintFront(d, it, b, 2, H - 2, (g, w, h) => { g.fillStyle = '#1b2230'; g.fillRect(1, 1, w * 0.72, h - 8); for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { g.fillStyle = ['#f2c14e', '#4aa3ff', '#e86b5a', '#76d48b', '#f2efe6'][(r + c) % 5]; g.fillRect(2.5 + c * (w * 0.17), 2 + r * ((h - 10) / 5), w * 0.1, 2.4); } g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(1, 1, w * 0.2, h - 8); g.fillStyle = '#dfe3e8'; g.fillRect(w * 0.78, h * 0.2, w * 0.15, h * 0.18); g.fillStyle = '#111'; g.fillRect(2, h - 6, w * 0.6, 4); });
    },
    armchair(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.5, c = C.leather;
      const backSide = { left: { x0: b.x1 - 4, x1: b.x1, z0: b.z0, z1: b.z1 }, right: { x0: b.x0, x1: b.x0 + 4, z0: b.z0, z1: b.z1 }, front: { x0: b.x0, x1: b.x1, z0: b.z1 - 4, z1: b.z1 }, back: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + 4 } }[it.facing] ?? { x0: b.x0, x1: b.x1, z0: b.z1 - 4, z1: b.z1 };
      const near = it.facing === 'left' || it.facing === 'back';
      if (!near) K.box(ctx, f, { ...backSide, h0: 0, h1: it.h }, shade(c, 0.9));
      K.box(ctx, f, { ...b, h0: 2, h1: s }, c, { edge: 'rgba(255,255,255,0.18)' });
      if (near) K.box(ctx, f, { ...backSide, h0: 0, h1: it.h }, shade(c, 0.9));
    },
    bench(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.55;
      for (const x of [b.x0 + 2, b.x1 - 4]) K.box(ctx, f, { x0: x, x1: x + 2, z0: b.z0 + 1, z1: b.z1 - 1, h0: 0, h1: s - 1.5 }, C.steel);
      K.box(ctx, f, { ...b, h0: s - 1.5, h1: s }, C.oak, { edge: 'rgba(255,255,255,0.2)' });
      paintTop(d, f, b, s, (g, w, h) => { g.fillStyle = 'rgba(60,35,15,0.35)'; for (let z = h / 4; z < h; z += h / 4) g.fillRect(0, z, w, 0.4); });
    },
    reception(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h = it.h;
      K.box(ctx, f, { ...b, h1: h - 1.5 }, C.oak, { edge: 'rgba(255,255,255,0.2)' });
      paintFront(d, it, b, 0, h - 1.5, (g, w, hh) => { g.fillStyle = 'rgba(60,35,15,0.28)'; for (let x = 1.5; x < w; x += 2.2) g.fillRect(x, 0, 0.5, hh); g.fillStyle = '#ffe1a8'; g.fillRect(0, hh - 1.2, w, 1.2); g.fillStyle = '#20252d'; g.fillRect(w / 2 - 9, hh * 0.3, 18, hh * 0.32); g.fillStyle = '#e9edf2'; g.font = 'bold 4px ui-sans-serif, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HILLINK', w / 2, hh * 0.46); });
      K.box(ctx, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1, h0: h - 1.5, h1: h }, C.white);
      screen(d, f, it.x + it.w * 0.2, it.z + it.d * 0.1, it.w * 0.18, h, h + 12, C.steel, code(d.near?.(it) ? 'present' : null, it.id, d.T));
      K.cylinder(ctx, f, b.x0 + 6, it.z, h, h + 4, 2, '#f1efea'); pottedLeaves(d, f, b.x0 + 6, it.z, h + 4, 8, it.id);
    },
    waterCooler(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f;
      K.box(ctx, f, { ...b, h1: it.h * 0.62 }, '#e6e8ea', { edge: 'rgba(0,0,0,0.08)' });
      K.cylinder(ctx, f, it.x, it.z, it.h * 0.62, it.h, Math.min(it.w, it.d) * 0.38, '#7fc4ea', { top: 'rgba(200,235,255,0.9)' });
      paintFront(d, it, b, it.h * 0.3, it.h * 0.45, (g, w, h) => { g.fillStyle = '#3a7bd5'; g.fillRect(w * 0.3, 1, 1.5, 1.5); g.fillStyle = '#d24b4b'; g.fillRect(w * 0.6, 1, 1.5, 1.5); });
    },
  };
  function paintTop(d, f, b, h, fn) { d.K.onFloor(d.ctx, f, b, h, b.x1 - b.x0, b.z1 - b.z0, g => fn(g, b.x1 - b.x0, b.z1 - b.z0)); }
  function pottedLeaves(d, f, x, z, h, size, seed) {
    const { ctx, K } = d, [sx, sy] = K.at(x, z, f, h), T = d.reduced ? 0 : d.T;
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (h1(seed, i) - 0.5) * 2.4 + Math.sin(T * 0.8 + i) * 0.04, L = size * (0.6 + h1(i, seed) * 0.5); ctx.fillStyle = i % 2 ? '#3f7d4a' : '#58a05c'; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * L * 0.5, sy + Math.sin(a) * L * 0.5, L * 0.5, L * 0.2, a, 0, TAU); ctx.fill(); }
  }
  function pottedPlant(d, f, x, z, h0, H, seed) {
    const { ctx, K } = d, r = 4.2;
    K.cylinder(ctx, f, x, z, h0, h0 + H * 0.28, r, h1(seed, 'pot') > 0.5 ? '#e8e4dc' : '#c56d43');
    const [sx, sy] = K.at(x, z, f, h0 + H * 0.28), T = d.reduced ? 0 : d.T, top = H * 0.72;
    ctx.strokeStyle = '#5b4632'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 1, sy - top * 0.6); ctx.stroke();
    for (let i = 0; i < 11; i++) { const a = -Math.PI / 2 + (h1(seed, i) - 0.5) * 2.8 + Math.sin(T * 0.7 + i) * 0.05, L = top * (0.35 + h1(i, seed) * 0.3), y0 = sy - top * (0.35 + h1(i, 'y', seed) * 0.5); ctx.fillStyle = ['#3f7d4a', '#58a05c', '#2f6a3c'][i % 3]; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * L * 0.45, y0 + Math.sin(a) * L * 0.3, L * 0.42, L * 0.2, a, 0, TAU); ctx.fill(); }
  }

  // Decor on a room's back wall.
  const decorDraw = {
    statusScreen(d, dc, g, w, h) {
      g.fillStyle = '#0d131c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7fb7ff'; g.font = 'bold 3.6px ui-sans-serif, system-ui'; g.textBaseline = 'top'; g.fillText((d.modeLabel || 'HQ').slice(0, 14), 2, 1.5);
      const c = d.counts, bars = [[c.working, '#3ccf7a'], [Math.max(0, c.total - c.working), '#7d8896'], [d.queued.length, '#e0b040']];
      g.font = '3px ui-sans-serif, system-ui'; g.fillStyle = '#d3d9e2'; g.fillText(`${c.working}/${c.total} working`, 2, 7); g.fillText(`${d.queued.length} queued · ${d.archived} done`, 2, 11.5);
      let x = 2; for (const [n, col] of bars) { g.fillStyle = col; const bw = Math.min(w - 4, n * 6); g.fillRect(x, h - 4, bw, 2); x += bw + 1; }
    },
    taskBoard(d, dc, g, w, h) {
      g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8c939c'; g.lineWidth = 0.6; g.strokeRect(0.3, 0.3, w - 0.6, h - 0.6);
      const cols = [['Queued', d.queued.length, '#f2d36b'], ['Working', d.counts.working, '#8cc8ff'], ['Done', Math.min(9, d.archived), '#a8e0a0']];
      cols.forEach(([name, n, col], i) => { const x = 1.5 + i * (w / 3); g.fillStyle = '#4b525c'; g.font = 'bold 2.6px ui-sans-serif, system-ui'; g.textBaseline = 'top'; g.fillText(name, x, 1.2); for (let k = 0; k < Math.min(n, 6); k++) { g.fillStyle = col; g.fillRect(x + (k % 2) * (w / 6.5), 5 + Math.floor(k / 2) * 5, w / 7.5, 4); } if (i) { g.fillStyle = '#cfd3d8'; g.fillRect(i * (w / 3) - 0.3, 1, 0.4, h - 2); } });
    },
    codeWall(d, dc, g, w, h) { g.fillStyle = '#0d131c'; g.fillRect(0, 0, w, h); glyphRows(g, w, h, d.T, dc.room, ['#7fb7ff', '#f2c879', '#9be39b', '#d3d9e2'], { scroll: d.counts.working > 0, speed: 1, lh: 2.2 }); },
    whiteboard(d, dc, g, w, h) { g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9bec5'; g.lineWidth = 0.8; g.strokeRect(0.4, 0.4, w - 0.8, h - 0.8); g.lineWidth = 0.5; for (let i = 0; i < 6; i++) { g.strokeStyle = ['#2f6fd6', '#d24b4b', '#2b2f36'][i % 3]; g.beginPath(); const y = 3 + i * (h - 6) / 6; g.moveTo(3, y); for (let x = 3; x < w * (0.4 + h1(i, dc.room) * 0.5); x += 2) g.lineTo(x, y + Math.sin(x * 0.9 + i) * 0.5); g.stroke(); } g.strokeStyle = '#2f6fd6'; g.strokeRect(w * 0.65, h * 0.25, w * 0.25, h * 0.4); },
    window(d, dc, g, w, h) { glass(g, w, h, d.day); },
    clock(d, dc, g, w, h) { const now = new Date(), r = Math.min(w, h) / 2 - 0.5; g.fillStyle = '#fafafa'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.fill(); g.strokeStyle = '#2b2f36'; g.lineWidth = 0.8; g.stroke(); const hand = (a, L, lw) => { g.lineWidth = lw; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.sin(a) * L, h / 2 - Math.cos(a) * L); g.stroke(); }; hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU, r * 0.5, 0.8); hand(now.getMinutes() / 60 * TAU, r * 0.8, 0.5); },
  };
  function glass(g, w, h, day) {
    const [top, bot] = skyColors(day), gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(w * 0.15, 0); g.lineTo(w * 0.4, 0); g.lineTo(w * 0.1, h); g.lineTo(0, h); g.lineTo(0, h * 0.6); g.fill();
    // Distant treeline silhouette.
    g.fillStyle = `rgba(40,70,60,${0.5 - day.night * 0.2})`; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 2) g.lineTo(x, h * 0.78 - Math.abs(Math.sin(x * 0.7)) * h * 0.08); g.lineTo(w, h); g.fill();
  }

  return {
    sky: null, island: null, accent: C.blue, tagBg: 'rgba(16,20,28,0.84)', tagText: '#f4f6f8', tagSub: '#aeb8c6',
    vehicleColors: ['#e9ecef', '#2b2f36', '#b33a3a', '#3a6fb0', '#9aa3ad', '#d8b24a'], siteLight: '#ffd27a',
    // What this style can draw (the compatibility test checks every World type has a look).
    kinds: { items: Object.keys(items), decor: Object.keys(decorDraw) },
    agentColor: a => AGENT_COLOR[a.id] ?? '#cfd6df',
    floor(d, room) {
      const kind = room.kind, r = room.r;
      fillPlan(d, room.level, r, floorFill(d.ctx, kind));
      inPlan(d, room.level, g => {
        // Ambient occlusion along the back and left walls; a rug in rooms that have one; lobby inlay.
        let gr = g.createLinearGradient(0, r.z1, 0, r.z1 - 14); gr.addColorStop(0, 'rgba(20,24,32,0.22)'); gr.addColorStop(1, 'rgba(20,24,32,0)'); g.fillStyle = gr; g.fillRect(r.x0, r.z1 - 14, r.x1 - r.x0, 14);
        gr = g.createLinearGradient(r.x0, 0, r.x0 + 12, 0); gr.addColorStop(0, 'rgba(20,24,32,0.16)'); gr.addColorStop(1, 'rgba(20,24,32,0)'); g.fillStyle = gr; g.fillRect(r.x0, r.z0, 12, r.z1 - r.z0);
        const rug = RUG[kind];
        if (rug && room.primitive === 'room') { const w = (r.x1 - r.x0) * 0.5, dd = (r.z1 - r.z0) * 0.42, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2 - (kind === 'lounge' ? 4 : 0); g.fillStyle = rug[0]; g.fillRect(cx - w / 2, cz - dd / 2, w, dd); g.strokeStyle = rug[1]; g.lineWidth = 1; g.strokeRect(cx - w / 2 + 2.5, cz - dd / 2 + 2.5, w - 5, dd - 5); }
        if (kind === 'lobby') { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; g.strokeStyle = 'rgba(58,123,213,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cz, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.22, 0, TAU); g.stroke(); g.fillStyle = 'rgba(58,123,213,0.18)'; g.beginPath(); g.arc(cx, cz, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.12, 0, TAU); g.fill(); }
        if (kind === 'servers' || kind === 'servers-like') { g.fillStyle = 'rgba(80,170,255,0.08)'; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); }
      });
    },
    slab(d, f, b) {
      const r = b.r, m = 3;
      d.K.box(d.ctx, f, { x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m, h0: f === 0 ? -6 : -10, h1: 0 }, f === 0 ? '#8d9199' : '#9aa0a8', { edge: 'rgba(255,255,255,0.35)', top: f === 0 ? '#b8bbc0' : '#b0b4ba' });
    },
    wall(d, w) {
      const { ctx, K } = d, f = w.f, b = { ...w.box, h0: w.h0, h1: w.h1 }, kind = w.room;
      if (w.near) { ext.nearWall(d, w); return; }
      if (w.type === 'low' || w.type === 'partition') {
        if (w.h0 > 0) { K.box(ctx, f, b, WALLS[kind] ?? C.plaster, { top: C.cut }); return; }
        K.box(ctx, f, { ...b, h1: LOW }, WALLS[kind] ?? C.plaster, { top: C.cut });
        K.box(ctx, f, { ...b, h0: LOW, h1: w.h1 }, null, { front: C.glass, right: C.glass, top: 'rgba(60,66,76,0.9)' });
        const F = wallFace(w);
        K.onFace(ctx, f, F.kind, F.c, F.a, F.b, LOW, w.h1, F.b - F.a, w.h1 - LOW, (g, ww = F.b - F.a, hh = w.h1 - LOW) => { g.fillStyle = 'rgba(255,255,255,0.22)'; for (let x = 0; x < ww; x += 26) g.fillRect(x, 0, 0.8, hh); g.fillStyle = C.glassEdge; g.fillRect(0, 0, ww, 0.8); g.fillStyle = 'rgba(255,255,255,0.1)'; for (let x = 6; x < ww; x += 26) { g.beginPath(); g.moveTo(x, hh); g.lineTo(x + 6, hh); g.lineTo(x + 14, 0); g.lineTo(x + 8, 0); g.fill(); } g.fillStyle = 'rgba(58,123,213,0.5)'; g.fillRect(0, hh * 0.45, ww, 0.8); });
        return;
      }
      // Far walls: plaster (or panelling) inside, a dark cut on top, skirting, windows with the real sky.
      const col = WALLS[kind] ?? C.plaster;
      K.box(ctx, f, b, col, { top: C.cut, right: shade(col, 0.72) });
      const F = wallFace(w), H = w.h1 - w.h0, L = F.b - F.a;
      K.onFace(ctx, f, F.kind, F.c, F.a, F.b, w.h0, w.h1, L, H, g => {
        if (w.h0 === 0) { g.fillStyle = 'rgba(30,30,36,0.55)'; g.fillRect(0, H - 2.5, L, 2.5); }
        if (kind === 'development' || kind === 'lounge') { const s = L * 0.3, e = L * 0.7; g.fillStyle = C.oak; g.fillRect(s, 6, e - s, H - 8.5); g.fillStyle = 'rgba(60,35,15,0.35)'; for (let x = s + 1.5; x < e; x += 2.4) g.fillRect(x, 6, 0.6, H - 8.5); }
        // The lounge's linear fireplace set into its oak wall: a black firebox with a low, living flame line.
        if ((kind === 'lounge' || kind === 'lounge-like') && w.h0 === 0 && w.type === 'back') { const s = L * 0.36, e = L * 0.64, y = H - 26, T = d.reduced ? 0 : d.T; g.fillStyle = '#16181c'; g.fillRect(s, y, e - s, 11); g.fillStyle = '#2b2f36'; g.fillRect(s - 2, y + 11, e - s + 4, 1.6); const gr = g.createLinearGradient(0, y + 9, 0, y + 3); gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(s + 2, y + 9.5); for (let x = s + 2; x <= e - 2; x += 1.5) g.lineTo(x, y + 9.5 - 3 - 2.5 * Math.abs(Math.sin(x * 0.7 + T * 6)) * (0.6 + 0.4 * Math.sin(T * 3 + x))); g.lineTo(e - 2, y + 9.5); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(s, y, (e - s) * 0.3, 11); }
        if (kind === 'command') { g.fillStyle = '#34405a'; g.fillRect(0, H * 0.62, L, H * 0.38 - 2.5); }
        if (kind === 'servers' || kind === 'servers-like') { g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < L; x += 8) g.fillRect(x, 0, 0.6, H); g.fillStyle = 'rgba(80,170,255,0.5)'; g.fillRect(0, H * 0.18, L, 0.8); }
        for (const [s, e] of winOf.get(w) ?? []) {
          const x = s - F.a, ww = e - s, y0 = H - (HT - 12) + 0, y1 = H - 30;
          g.fillStyle = '#2b2f36'; g.fillRect(x - 1, y0 - 1, ww + 2, y1 - y0 + 2);
          g.save(); g.translate(x, y0); glass(g, ww, y1 - y0, d.day); g.restore();
          g.fillStyle = '#2b2f36'; g.fillRect(x + ww / 2 - 0.5, y0, 1, y1 - y0); g.fillRect(x, y0 + (y1 - y0) * 0.62, ww, 0.8);
          g.fillStyle = '#d9d6cf'; g.fillRect(x - 2, y1, ww + 4, 1.6);
        }
      });
      for (const sp of hearthSpots) if (sp.w === w) fireplace(d, sp);
    },
    door(d, dr) {
      const { ctx, K } = d, f = dr.f, w = doorWall.get(dr), a = dr.axis === 'z' ? Math.min(dr.a.x, dr.b.x) : Math.min(dr.a.z, dr.b.z), e = dr.axis === 'z' ? Math.max(dr.a.x, dr.b.x) : Math.max(dr.a.z, dr.b.z), at = dr.axis === 'z' ? dr.a.z : dr.a.x;
      const R = (s0, s1, c0, c1) => (dr.axis === 'z' ? { x0: s0, x1: s1, z0: at + c0, z1: at + c1 } : { x0: at + c0, x1: at + c1, z0: s0, z1: s1 });
      inPlan(d, f, g => { g.fillStyle = '#6d727a'; const r = R(a, e, -2.5, 2.5); g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); });
      if (dr.outside) {
        // Entrance: a dark mat inside and out, glass doors standing open, two bollard lights.
        inPlan(d, f, g => { g.fillStyle = '#2f343c'; const r = R(a + 2, e - 2, -14, -3); g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); });
        if (w?.far) { for (const s of [a, e - 1.6]) K.box(ctx, f, { ...R(s, s + 1.6, -1, 1), h0: 0, h1: dr.h }, C.steel); K.box(ctx, f, { ...R(a, e, -1, 1), h0: dr.h - 3, h1: dr.h }, C.steel); }
        return;
      }
      if (!w || dr.kind === 'opening') return;
      const top = Math.min(dr.h, w.h1);
      for (const s of [a - 1, e - 0.6]) K.box(ctx, f, { ...R(s, s + 1.6, -1.2, 1.2), h0: 0, h1: top }, C.steel);
      if (w.far) { K.box(ctx, f, { ...R(a, e, -1.2, 1.2), h0: top - 2, h1: top }, C.steel); const L = e - a; K.box(ctx, f, { ...(dr.axis === 'z' ? { x0: a + 0.5, x1: a + 2, z0: at - L * 0.85, z1: at } : { x0: at, x1: at + L * 0.85, z0: a + 0.5, z1: a + 2 }), h0: 0, h1: top - 2.5 }, C.oak, { edge: 'rgba(255,255,255,0.2)' }); }
    },
    flatItem: () => false,
    item(d, it) { (items[it.type] ?? generic)(d, it); },
    shadow(d, it) { if (it.h > 4) d.K.shadow(d.ctx, it.f, ib(it), it.h, 0.16); },
    decor(d, dc) {
      const { ctx, K } = d, f = dc.f, z = dc.z - 1.5, frame = dc.type === 'whiteboard' || dc.type === 'taskBoard' ? '#b9bec5' : '#1d2127';
      if (dc.type === 'clock') { K.onFace(ctx, f, 'front', z, dc.x0, dc.x1, dc.h0, dc.h1, dc.x1 - dc.x0, dc.h1 - dc.h0, g => decorDraw.clock(d, dc, g, dc.x1 - dc.x0, dc.h1 - dc.h0)); return; }
      K.box(ctx, f, { x0: dc.x0 - 1, x1: dc.x1 + 1, z0: z - 1.2, z1: z + 1, h0: dc.h0 - 1, h1: dc.h1 + 1 }, frame);
      const W = dc.x1 - dc.x0, H = dc.h1 - dc.h0;
      K.onFace(ctx, f, 'front', z - 1.2, dc.x0, dc.x1, dc.h0, dc.h1, W, H, g => (decorDraw[dc.type] ?? (() => {}))(d, dc, g, W, H));
      if (dc.type === 'window') K.box(ctx, f, { x0: dc.x0 - 2, x1: dc.x1 + 2, z0: z - 3, z1: z, h0: dc.h0 - 2, h1: dc.h0 }, '#d9d6cf');
    },
    slot(d, sl) {
      const { ctx, K } = d, r = sl.r, f = sl.f;
      if (sl.what === 'lift') {
        // A glass lift shaft: steel corner posts, clear glass, the cab waiting at this floor.
        K.box(ctx, f, { ...r, h1: 1.5 }, '#5e646d');
        const cab = { x0: r.x0 + 3, x1: r.x1 - 3, z0: r.z0 + 3, z1: r.z1 - 3, h0: 1.5, h1: 58 };
        K.box(ctx, f, cab, '#c9ced5', { front: 'rgba(190,215,230,0.35)', right: 'rgba(160,180,195,0.45)', top: '#8e959e', edge: 'rgba(255,255,255,0.5)' });
        for (const [x, z] of [[r.x0, r.z1], [r.x1, r.z1], [r.x0, r.z0], [r.x1, r.z0]]) K.box(ctx, f, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, h0: 0, h1: HT - 6 }, C.steel);
        for (const z of [r.z0, r.z1]) K.box(ctx, f, { x0: r.x0, x1: r.x1, z0: z - 1, z1: z + 1, h0: HT - 8, h1: HT - 6 }, C.steel);
        for (const x of [r.x0, r.x1]) K.box(ctx, f, { x0: x - 1, x1: x + 1, z0: r.z0, z1: r.z1, h0: HT - 8, h1: HT - 6 }, C.steel);
        K.box(ctx, f, { ...r, h0: 0, h1: HT - 8 }, null, { front: 'rgba(170,215,235,0.12)', right: 'rgba(170,215,235,0.16)', top: 'rgba(0,0,0,0)' });
        return;
      }
      // Stairs: treads rising away from the camera, a steel stringer and a glass balustrade.
      const n = 10, D = r.z1 - r.z0, W = r.x1 - r.x0, sw = W * 0.55;
      K.box(ctx, f, { x0: r.x0 + 2 + sw - 1.5, x1: r.x0 + 2 + sw, z0: r.z0, z1: r.z1, h0: 0, h1: HT * 0.9 }, null, { front: 'rgba(0,0,0,0)', right: C.steel, top: C.steel });
      for (let i = 0; i < n; i++) { const h = ((i + 1) * HT * 0.9) / n; K.box(ctx, f, { x0: r.x0 + 2, x1: r.x0 + 2 + sw, z0: r.z0 + (D * i) / n, z1: r.z0 + (D * (i + 1)) / n, h0: h - 2, h1: h }, C.oak, { edge: 'rgba(255,255,255,0.25)' }); }
      K.box(ctx, f, { x0: r.x0 + 2 + sw, x1: r.x0 + 3 + sw, z0: r.z0, z1: r.z1, h0: 0, h1: HT * 0.9 }, null, { front: C.glass, right: C.glass, top: C.steel });
    },
    site(d, site) {
      const cone = (ctx, [x, y]) => { ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.lineTo(x, y - 7); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.2, y - 4, 2.4, 0.9); };
      if (site.kind === 'refit') drawRefit(d, site, { tape: '#f2b630', stake: '#ff7a2f', crate: '#c8a26a' });
      else drawSite(d, site, { stake: '#ff7a2f', string: '#f2b630', dirt: '#a88b67', slab: '#b9bcc1', rebar: '#7a4a32', frame: '#5e6672', scaffold: '#d9a33a', plank: '#b58a55', wall: '#cfcac0', crate: '#c8a26a', accent: '#f2b630', cone });
    },
    plantHeight: pl => plantHeight(pl, U),
    plant(d, pl) { drawPlant(d, pl, U); },
    corner: ext.corner,
    levelTop: ext.levelTop,
    buildingLights: ext.buildingLights,
    extra(d, ex) {
      const { ctx, K } = d, f = 0, T = d.reduced ? 0 : d.T;
      if (ext.extras[ex.type]) { ext.extras[ex.type](d, ex); return; }
      if (ex.type === 'lamp') { K.box(ctx, f, { x0: ex.x - 0.6, x1: ex.x + 0.6, z0: ex.z - 0.6, z1: ex.z + 0.6, h0: 0, h1: ex.h }, C.steel); K.box(ctx, f, { x0: ex.x - 2.5, x1: ex.x + 2.5, z0: ex.z - 1.2, z1: ex.z + 1.2, h0: ex.h, h1: ex.h + 1.6 }, C.steel); const [x, y] = K.at(ex.x, ex.z, f, ex.h - 0.2); ctx.fillStyle = d.night > 0.2 ? '#ffe2a8' : '#d6d0c2'; ctx.fillRect(x - 3, y, 6, 1); return; }
      if (ex.type === 'planter') { const b = { x0: ex.x - ex.w / 2, x1: ex.x + ex.w / 2, z0: ex.z - ex.d / 2, z1: ex.z + ex.d / 2 }; K.box(ctx, f, { ...b, h1: ex.h }, C.concreteDark, { top: '#5a4632' }); pottedLeaves(d, f, ex.x, ex.z, ex.h, 18, ex.x); return; }
      if (ex.type === 'bench') { items.bench(d, { ...ex, f, id: 'bench', facing: 'front' }); return; }
      if (ex.type === 'flag') { K.cylinder(ctx, f, ex.x, ex.z, 0, ex.h, 0.6, '#d9dce0'); const [x, y] = K.at(ex.x, ex.z, f, ex.h - 2); ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k <= 8; k++) ctx.lineTo(x + k * 2.6, y + Math.sin(T * 3 + k * 0.7) * 1.4 * (k / 8)); for (let k = 8; k >= 0; k--) ctx.lineTo(x + k * 2.6, y + 13 + Math.sin(T * 3 + k * 0.7) * 1.4 * (k / 8)); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 6px ui-sans-serif, system-ui'; ctx.fillText('H', x + 8, y + 9); return; }
      if (ex.type === 'sign') {
        const b = { x0: ex.x - ex.w / 2, x1: ex.x + ex.w / 2, z0: ex.z - ex.d / 2, z1: ex.z + ex.d / 2 };
        K.box(ctx, f, { ...b, h1: ex.h }, '#2b2f36', { edge: 'rgba(255,255,255,0.25)' });
        K.onFace(ctx, f, 'front', b.z0, b.x0, b.x1, 0, ex.h, ex.w, ex.h, g => { g.fillStyle = '#f4f6f8'; g.font = 'bold 9px ui-sans-serif, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HILLINK', ex.w / 2, ex.h * 0.42); g.fillStyle = C.blue; g.fillRect(ex.w * 0.2, ex.h * 0.68, ex.w * 0.6, 1.4); g.font = '4px ui-sans-serif, system-ui'; g.fillStyle = '#aeb8c6'; g.fillText('HQ', ex.w / 2, ex.h * 0.84); });
      }
    },
    ground(d, R) { drawGround(d, R, { key: 'modern', under: g => { for (const b of model.buildings) { const m = 0.55 * U, r = b.r; g.fillStyle = pattern(g, 'm:gravel', 30, 30, TEX.speckle('#c9c4b8', { n: 260, k: 0.14 })); g.fillRect(r.x0 - m, r.z0 - m, r.x1 - r.x0 + 2 * m, r.z1 - r.z0 + 2 * m); g.strokeStyle = '#8f8c86'; g.lineWidth = 1.2; g.strokeRect(r.x0 - m, r.z0 - m, r.x1 - r.x0 + 2 * m, r.z1 - r.z0 + 2 * m); } }, grass: '#7fae58', lawn: '#8dbc62', edge: 'rgba(60,90,40,0.35)', roadEdge: '#9b9a94', road: () => '#4a4f57', roadMarks: (g, w) => { g.setLineDash([2.2 * U, 2.6 * U]); g.strokeStyle = 'rgba(242,242,236,0.75)'; g.lineWidth = 0.14 * U; g.beginPath(); w.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke(); g.setLineDash([]); }, pathEdge: '#9c9a93', path: g => pattern(g, 'm:pavers', 17, 17, TEX.tiles('#cfcac0', { s: 17 / 2 })), dirt: 'rgba(150,120,80,0.45)', tufts: ['#5f8f3f', '#7aa850'], flowers: ['#f4f1e6', '#f2d24b', '#b99cf0', '#ef8f8f'] }); },
    vehicle(d, v) {
      const L = 2.4 * U * 0.42, W = 0.96 * U * 0.42, a = v.angle ?? 0, f = 0;
      d.ctx.save(); d.ctx.globalAlpha *= v.alpha ?? 1;
      orientedBox(d, f, v.x, v.y, L * 2, W * 2, 2, 10, a, v.color, { edge: 'rgba(255,255,255,0.25)' });
      orientedBox(d, f, v.x - Math.cos(a) * 2, v.y - Math.sin(a) * 2, L * 1.1, W * 1.7, 10, 16, a, '#2c3640', { top: shade(v.color, 1.05) });
      d.ctx.restore();
    },
    agentLook(a, e) {
      if (a.id === 'claude') return { skin: '#f0c8a0', hair: '#5a3a24', hairStyle: 'swept', hat: 'hardhat', hatColor: '#ff9a3d', top: '#3d5a80', top2: '#3d5a80', vest: '#ff8a3d', vestStripe: '#f4f6f0', bottom: '#4a4f57', shoes: '#5a3d2a', belt: '#2b2f36', toolbelt: '#7a5532', gloves: '#e0a640', tool: 'hammer', screen: '#ffd9a8', carryColor: '#c8a26a', accent: AGENT_COLOR.claude };
      if (a.id === 'codex') return { skin: '#e2b48e', hair: '#1f2328', hairStyle: 'swept', top: '#2e4e7a', top2: '#2e4e7a', bottom: '#2a2f38', shoes: '#e9e6df', glasses: '#1d1f26', headset: true, lanyard: '#4aa3ff', pack: '#3a3f4a', packTrim: '#4aa3ff', holdItem: 'tablet', screen: '#8fd0ff', accent: AGENT_COLOR.codex };
      if (a.id === 'chatgpt') return { scale: 1.06, skin: '#c99a76', hair: '#1a1a1e', hairStyle: 'swept', top: '#17191e', top2: '#17191e', jacketOpen: true, shirt: '#f2f2f2', tie: '#2fbf71', lapels: '#050608', pocketSquare: '#2fbf71', bottom: '#17191e', shoes: '#0d0e10', holdItem: 'tablet', screen: '#9be39b', accent: AGENT_COLOR.chatgpt };
      return { skin: '#e0b896', hair: '#3a2a20', top: '#6b7480', bottom: '#3b3f46' };
    },
    ambientLook(i) {
      const L = [
        { skin: '#f0c8a0', hair: '#c79b5a', hairStyle: 'long', top: '#b5634a', bottom: '#3b4250', shoes: '#e9e6df' },
        { skin: '#8d5a3c', hair: '#1a1a1e', top: '#e2d7c2', bottom: '#5a6270', shoes: '#2a2a30', holdItem: 'tablet' },
        { skin: '#e2b48e', hair: '#6b4a2e', hairStyle: 'long', top: '#5d7f6a', bottom: '#2a2f38' },
        { skin: '#c99a76', hair: '#2b2b2b', top: '#7d6aa8', bottom: '#3a3f4a', glasses: '#333' },
        { skin: '#f3d2b5', hair: '#9a6b3a', top: '#4d6f96', bottom: '#d8d2c4', shoes: '#5a3d2a' },
      ];
      return L[i % L.length];
    },
    roomLight: kind => ({ servers: { col: '#7cc8ff', i: 0.75 }, 'servers-like': { col: '#7cc8ff', i: 0.75 }, command: { col: '#ffe0b0', i: 0.8 }, testing: { col: '#e6f2ff', i: 0.75 }, development: { col: '#ffd9a0', i: 0.85 }, lounge: { col: '#ffc078', i: 0.85 }, lobby: { col: '#ffe2b0', i: 0.85 } }[kind] ?? { col: '#ffe2b0', i: 0.75 }),
    itemLight(it, d) {
      if (it.type === 'desk' && d.stationState(it.station)) return { r: 40, col: '#9fc8ff', i: 0.5, h: it.h + 10 };
      if (it.type === 'serverRack') return { r: 34, col: '#58d08a', i: 0.45, h: it.h * 0.6 };
      if (it.type === 'vending') return { r: 40, col: '#ffd9b0', i: 0.55, h: it.h * 0.6 };
      if (it.type === 'reception') return { r: 46, col: '#ffe1a8', i: 0.55, h: it.h };
      return null;
    },
    decorLight(dc) { return dc.type === 'statusScreen' || dc.type === 'codeWall' ? { r: 46, col: '#8fc0ff', i: 0.45 } : null; },
    extraLight(ex, d) { if (ex.type === 'lamp') return { r: 64, col: '#ffd59a', i: 0.9, h: ex.h }; if (ex.type === 'sign') return { r: 40, col: '#cfe0ff', i: 0.5, h: ex.h }; return ext.extraLight(ex, d); },
    meetingMarker(d, x, y) { const ctx = d.ctx; ctx.beginPath(); ctx.roundRect(x - 11, y - 9, 22, 14, 5); ctx.fillStyle = '#2f6fd6'; ctx.fill(); for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * 5, y - 2, 1.6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); } },
  };
  function generic(d, it) { d.K.box(d.ctx, it.f, { ...ib(it), h0: baseH(it), h1: baseH(it) + it.h }, '#b9bec5', { edge: 'rgba(255,255,255,0.3)' }); }
}
