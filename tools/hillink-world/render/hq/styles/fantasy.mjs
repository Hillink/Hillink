// Fantasy HQ (theme 'fantasy' under ?art=hq): a living guild hall. Stonework and timber framing, carved wood, brass,
// banners (green and gold first), stained glass, runes, crystals, books and scrolls, candles and lanterns, a hearth,
// a forge and an arcane core. Magic is selective: it shows where the World has work (screens become scrying mirrors
// and rune slates that wake only while someone is really working there). The same semantic objects as Modern:
//   workstation -> scribe's desk with a rune slate     monitor -> scrying mirror / rune slate
//   server rack -> crystal vault (arcane archive)      ops/command -> war room      meeting -> council chamber
//   lounge counter -> hearth with the kettle           printer -> artificer's forge   status light -> crystal/flame
import { plantHeight } from '../../art5d/ground.mjs';
import { skyColors } from '../sky.mjs';
import { css } from '../color.mjs';
import { TAU, HT, LOW, shade, mix, poly, glow, h1, texture, pattern, TEX, fillPlan, inPlan, drawGround, ib, baseH, frontFace, paintFront, table, chair, screen, glyphRows, drawSite, drawRefit, decorSpans, tallSpans, windowsOf, wallOfDoor, wallFace, orientedBox } from './common.mjs';

const C = {
  stone: '#b5a891', stoneDark: '#8c806c', plaster: '#e8dcbf', timber: '#5b3a22', timberLight: '#8a5a34', oak: '#7a4e2c', brass: '#c9a24a', gold: '#e8b832',
  emerald: '#2e8b57', emeraldDark: '#1f5e3c', blue: '#27407a', violet: '#6b4aa0', crimson: '#8e2f3a', parchment: '#efe2bf', iron: '#3a3a40', cut: '#4f4132',
};
const AGENT_COLOR = { claude: '#ff9a4a', codex: '#8f7bff', chatgpt: '#3ddc84' };
const RUNES = ['#9fe7ff', '#c9a7ff', '#ffd27a'];
const FLOORS = {
  lobby: ['flag', '#aaa08c'], passage: ['flag', '#a39985'], command: ['herring', '#6e4a2c'], development: ['flag', '#8f8676'], workshop: ['flag', '#8f8676'], office: ['planks', '#7d5534'],
  servers: ['arcane', '#2a3560'], 'servers-like': ['arcane', '#2a3560'], testing: ['checker', '#cfc5ae'], lounge: ['planks', '#86593a'], 'lounge-like': ['planks', '#86593a'], comms: ['herring', '#6e4a2c'], 'comms-like': ['herring', '#6e4a2c'],
};
const RUG = { command: [C.blue, C.gold], lounge: [C.crimson, '#e0b85a'], 'lounge-like': [C.crimson, '#e0b85a'], comms: [C.emeraldDark, C.gold], lobby: [C.emeraldDark, C.gold] };
const WALL_TINT = { servers: '#4a4f74', 'servers-like': '#4a4f74' };

export function createFantasyStyle({ K, U, model }) {
  const decor = decorSpans(model), tall = tallSpans(model), sprites = new Map();
  const winOf = new Map(model.walls.map(w => [w, windowsOf(w, decor, tall, 24, 30)]));
  const doorWall = new Map(model.doors.map(dr => [dr, wallOfDoor(model, dr)]));

  const floorFill = (ctx, kind) => {
    const [mat, base] = FLOORS[kind] ?? ['planks', '#7d5534'];
    if (mat === 'planks') return pattern(ctx, 'f:planks:' + base, 90, 36, TEX.planks(base, { w: 90, h: 36, plank: 6, joint: 'rgba(30,16,6,0.4)' }));
    if (mat === 'herring') return pattern(ctx, 'f:herring:' + base, 24, 24, g => { g.fillStyle = 'rgba(30,16,6,0.5)'; g.fillRect(0, 0, 24, 24); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = shade(base, 0.85 + h1(i, j, 'hb') * 0.3); if ((i + j) % 2) g.fillRect(i * 6 + 0.4, j * 6 + 0.4, 5.2, 11.2 > 24 - j * 6 ? 5.2 : 5.2); else g.fillRect(i * 6 + 0.4, j * 6 + 0.4, 5.2, 5.2); g.fillStyle = 'rgba(30,16,6,0.35)'; if ((i + j) % 2) g.fillRect(i * 6 + 0.4, j * 6 + 3, 5.2, 0.4); else g.fillRect(i * 6 + 3, j * 6 + 0.4, 0.4, 5.2); } });
    if (mat === 'checker') return pattern(ctx, 'f:checker', 24, 24, g => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#9d927d' : base; g.fillRect(i * 12, j * 12, 12, 12); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * 12, j * 12, 12, 0.4); g.fillRect(i * 12, j * 12, 0.4, 12); } });
    if (mat === 'arcane') return pattern(ctx, 'f:arcane', 20, 20, TEX.tiles(base, { s: 20, joint: 'rgba(201,162,74,0.45)' }));
    return pattern(ctx, 'f:flag:' + base, 48, 48, TEX.flagstones(base));
  };
  const runes = (state, seed, T) => (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b2140'); gr.addColorStop(1, '#0e1226'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (!state) { g.fillStyle = 'rgba(200,220,255,0.10)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.35, 0); g.lineTo(0, h * 0.7); g.fill(); return; }
    if (state === 'present') { g.fillStyle = 'rgba(160,140,255,0.35)'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.28, 0, TAU); g.fill(); return; }
    runeRows(g, w, h, T, seed, true);
    if (state === 'blocked') { g.fillStyle = 'rgba(230,80,70,0.35)'; g.fillRect(0, h - 3, w, 3); }
  };
  // Runes: small angular glyphs in rows, drifting upward while live.
  function runeRows(g, w, h, T, seed, live, cols = RUNES) {
    const lh = 3, rows = Math.floor((h - 1) / lh), sc = live ? Math.floor(T * 1.2) : 0;
    g.lineWidth = 0.45; g.lineCap = 'round';
    for (let r = 0; r < rows; r++) { const k = r + sc, n = 2 + Math.floor(h1(k, seed, 'n') * Math.max(1, (w - 4) / 3.2)); g.strokeStyle = cols[Math.floor(h1(k, seed, 'c') * cols.length)]; g.beginPath(); for (let i = 0; i < n && 2 + i * 3.2 < w - 2; i++) { const x = 2 + i * 3.2, y = 1.2 + r * lh, v = Math.floor(h1(k, i, seed) * 6); g.moveTo(x, y); if (v === 0) { g.lineTo(x + 2, y + 2); g.moveTo(x + 2, y); g.lineTo(x, y + 2); } else if (v === 1) { g.lineTo(x, y + 2); g.lineTo(x + 2, y + 1); } else if (v === 2) { g.lineTo(x + 2, y); g.lineTo(x + 1, y + 2); } else if (v === 3) { g.moveTo(x + 1, y); g.lineTo(x + 1, y + 2); g.moveTo(x, y + 1); g.lineTo(x + 2, y + 1); } else if (v === 4) { g.lineTo(x + 1, y + 2); g.lineTo(x + 2, y); } else { g.moveTo(x + 2, y); g.lineTo(x, y + 1); g.lineTo(x + 2, y + 2); } } g.stroke(); }
  }
  function flame(ctx, x, y, s, T, seed = 0) {
    const f = 1 + Math.sin(T * 9 + seed * 7) * 0.12 + Math.sin(T * 13 + seed) * 0.08;
    glow(ctx, x, y - s, s * 5, '#ffb347', 0.35);
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(x - s * 0.7, y); ctx.quadraticCurveTo(x - s * 0.8, y - s * 1.4 * f, x + Math.sin(T * 6 + seed) * s * 0.3, y - s * 2.4 * f); ctx.quadraticCurveTo(x + s * 0.8, y - s * 1.4 * f, x + s * 0.7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(x, y - s * 0.7, s * 0.35, s * 0.7 * f, 0, 0, TAU); ctx.fill();
  }
  function candle(d, f, x, z, h, T, seed) { const { ctx, K } = d; K.cylinder(ctx, f, x, z, h, h + 4, 0.8, '#f3ead2'); const [sx, sy] = K.at(x, z, f, h + 4); flame(ctx, sx, sy, 1.3, d.reduced ? 0 : T, seed); }
  function book(d, f, x, z, h, col, open) { const { ctx, K } = d; if (open) { K.box(ctx, f, { x0: x - 4, x1: x + 4, z0: z - 2.5, z1: z + 2.5, h0: h, h1: h + 0.8 }, col); K.box(ctx, f, { x0: x - 3.6, x1: x - 0.2, z0: z - 2.2, z1: z + 2.2, h0: h + 0.8, h1: h + 1.2 }, C.parchment); K.box(ctx, f, { x0: x + 0.2, x1: x + 3.6, z0: z - 2.2, z1: z + 2.2, h0: h + 0.8, h1: h + 1.2 }, '#f4ead0'); } else K.box(ctx, f, { x0: x - 2.5, x1: x + 2.5, z0: z - 1.8, z1: z + 1.8, h0: h, h1: h + 1.6 }, col, { edge: 'rgba(255,230,160,0.4)' }); }
  function crystal(ctx, x, y, s, col, T, seed) { const p = 0.75 + 0.25 * Math.sin(T * 2 + seed); glow(ctx, x, y - s, s * 4, col, 0.3 * p); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.lineTo(x + s * 0.7, y - s * 0.8); ctx.lineTo(x, y); ctx.lineTo(x - s * 0.7, y - s * 0.8); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.lineTo(x - s * 0.7, y - s * 0.8); ctx.lineTo(x - s * 0.15, y - s * 0.9); ctx.closePath(); ctx.fill(); }

  const items = {
    desk(d, it) {
      const b = ib(it), f = it.f, h = it.h, T = d.T, st = d.stationState(it.station) ?? d.near?.(it);
      table(d, f, b, h, { top: C.oak, leg: C.timber, legW: 2, th: 2.4, panel: shade(C.timber, 0.9), edge: 'rgba(255,220,160,0.25)' });
      // A rune slate in a brass frame (the workstation's screen), a book, a quill in its inkpot, a candle.
      screen(d, f, it.x + it.w * 0.12, it.z + it.d * 0.2, it.w * 0.3, h, h + it.w * 0.22, C.brass, runes(st, it.id, T));
      book(d, f, it.x - it.w * 0.22, it.z - it.d * 0.05, h, ['#7a2e2e', '#2c4a7a', '#2e6b45'][Math.floor(h1(it.id) * 3)], true);
      const [qx, qy] = d.K.at(b.x1 - 6, it.z + 2, f, h); d.K.cylinder(d.ctx, f, b.x1 - 6, it.z + 2, h, h + 2, 1, '#1d1d24'); d.ctx.strokeStyle = '#f2efe6'; d.ctx.lineWidth = 0.9; d.ctx.beginPath(); d.ctx.moveTo(qx, qy - 2); d.ctx.quadraticCurveTo(qx + 3, qy - 7, qx + 5, qy - 11); d.ctx.stroke();
      candle(d, f, b.x0 + 4, it.z + 4, h, T, h1(it.id, 'c') * 9);
      if (h1(it.id, 'scroll') > 0.5) { d.K.cylinder(d.ctx, f, it.x + 2, b.z0 + 3, h, h + 1.6, 1.6, C.parchment); }
    },
    officeChair(d, it) { chair(d, it, { seat: C.crimson, back: C.timber, leg: C.timber, seatH: it.h * 0.45, backH: it.h * 0.9 }); },
    chair(d, it) { chair(d, it, { seat: C.oak, back: C.timber, leg: C.timber, seatH: it.h * 0.5, backH: it.h * 1.05 }); },
    roundTable(d, it) {
      const { ctx, K } = d, f = it.f, h = it.h, r = Math.min(it.w, it.d) * 0.5;
      K.cylinder(ctx, f, it.x, it.z, 0, h - 2.5, 2.4, C.timber);
      K.cylinder(ctx, f, it.x, it.z, h - 2.5, h, r, C.oak, { edge: 'rgba(255,220,160,0.3)' });
      K.disc(ctx, f, it.x, it.z, h + 0.1, r * 0.6, null, 'rgba(232,184,50,0.5)');
      // Candelabra and two tankards.
      const [cx, cy] = K.at(it.x, it.z, f, h); ctx.strokeStyle = C.brass; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 8); ctx.moveTo(cx - 4, cy - 8); ctx.lineTo(cx + 4, cy - 8); ctx.stroke();
      for (const k of [-4, 0, 4]) { ctx.fillStyle = '#f3ead2'; ctx.fillRect(cx + k - 0.6, cy - 11 - (k ? 0 : 2), 1.2, 3); flame(ctx, cx + k, cy - 11 - (k ? 0 : 2), 0.9, d.reduced ? 0 : d.T, k); }
      K.cylinder(ctx, f, it.x - r * 0.5, it.z + 3, h, h + 3, 1.3, '#9a9aa4'); K.cylinder(ctx, f, it.x + r * 0.45, it.z - 4, h, h + 3, 1.3, '#9a9aa4');
    },
    bookshelf(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f;
      K.box(ctx, f, { ...b, h1: it.h }, C.timber, { edge: 'rgba(255,220,160,0.2)' });
      K.box(ctx, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1, h0: it.h, h1: it.h + 2 }, shade(C.timber, 1.15));
      paintFront(d, it, b, 0, it.h, (g, w, h) => {
        g.fillStyle = '#2a1a10'; g.fillRect(1.5, 1.5, w - 3, h - 3);
        const rows = 4, rh = (h - 3) / rows;
        for (let r = 0; r < rows; r++) { let x = 2; while (x < w - 3) { if (h1(r, x, it.id, 's') > 0.9) { g.fillStyle = C.parchment; g.beginPath(); g.arc(x + 1.5, 1.5 + (r + 1) * rh - 2, 1.5, 0, TAU); g.fill(); x += 3.5; continue; } const bw = 1.4 + h1(it.id, r, x) * 1.6, bh = rh * (0.55 + h1(x, r, it.id) * 0.35); g.fillStyle = ['#7a2e2e', '#2c4a7a', '#2e6b45', '#6b4a2e', '#4a2f5e', '#8a6a2a'][Math.floor(h1(r, x, 'c') * 6)]; g.fillRect(x, 1.5 + r * rh + rh - bh, bw, bh); g.fillStyle = 'rgba(232,184,50,0.6)'; g.fillRect(x, 1.5 + r * rh + rh - bh + 1, bw, 0.4); x += bw + 0.3; } g.fillStyle = C.timberLight; g.fillRect(1.5, 1.5 + (r + 1) * rh - 0.9, w - 3, 0.9); }
      });
    },
    // The artificer's forge (the printer: where things get made): a stone hearth with glowing coals, an anvil, sparks.
    printer(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, T = d.reduced ? 0 : d.T, busy = d.near?.(it);
      K.box(ctx, f, { ...b, h1: it.h * 0.55 }, C.stoneDark, { edge: 'rgba(255,255,255,0.15)' });
      K.box(ctx, f, { x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0 + 2, z1: b.z1 - 2, h0: it.h * 0.55, h1: it.h * 0.58 }, '#2a2020');
      const [cx, cy] = K.at(it.x, it.z, f, it.h * 0.58), heat = busy ? 1 : 0.55 + 0.1 * Math.sin(T * 2);
      glow(ctx, cx, cy, 16, '#ff6a2a', 0.45 * heat); ctx.fillStyle = `rgba(255,${120 + 60 * heat},40,${0.8})`; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(cx + (h1(i, it.id) - 0.5) * 8, cy + (h1(it.id, i) - 0.5) * 3, 1.2, 0, TAU); ctx.fill(); }
      K.box(ctx, f, { x0: b.x0 + 3, x1: b.x0 + 6, z0: b.z1 - 3, z1: b.z1, h0: it.h * 0.55, h1: it.h * 1.25 }, C.stone);
      if (busy) for (let i = 0; i < 6; i++) { const k = (T * 1.4 + i / 6) % 1; ctx.fillStyle = `rgba(255,210,120,${1 - k})`; ctx.fillRect(cx + Math.sin(i * 2.3) * k * 10, cy - k * 16, 1, 1); }
    },
    plant(d, it) { urnPlant(d, it.f, it.x, it.z, baseH(it), it.h, it.id); },
    // Artificer's bench (review console): tools, a brass astrolabe that turns while inspection runs, crystals and lenses.
    reviewConsole(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h = it.h, T = d.reduced ? 0 : d.T, st = d.near?.(it);
      table(d, f, b, h, { top: C.oak, leg: C.timber, legW: 2.2, th: 2.6, panel: shade(C.timber, 0.85) });
      const [ax, ay] = K.at(it.x - it.w * 0.15, it.z + 2, f, h + 12), a = st ? T * 0.8 : 0.4;
      K.cylinder(ctx, f, it.x - it.w * 0.15, it.z + 2, h, h + 3, 2.5, C.brass);
      ctx.strokeStyle = C.brass; ctx.lineWidth = 1; for (const [rx, ry, rot] of [[9, 9, 0], [9, 3.5, a], [3.5, 9, -a * 1.3]]) { ctx.beginPath(); ctx.ellipse(ax, ay, rx, ry, rot, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = st ? '#9fe7ff' : '#7a8aa0'; ctx.beginPath(); ctx.arc(ax, ay, 2, 0, TAU); ctx.fill(); if (st) glow(ctx, ax, ay, 12, '#9fe7ff', 0.35);
      screen(d, f, it.x + it.w * 0.22, it.z + it.d * 0.18, it.w * 0.22, h, h + it.w * 0.16, C.brass, runes(st, it.id, T));
      const [cx, cy] = K.at(b.x0 + 6, it.z - 2, f, h); crystal(ctx, cx, cy, 2.2, '#9fe7ff', T, 1); crystal(ctx, cx + 4, cy + 1, 1.6, '#c9a7ff', T, 2);
      book(d, f, it.x + 2, b.z0 + 4, h, '#4a2f5e', false);
    },
    // Crystal vault (server rack): a dark carved cabinet of glowing crystal cells, pulsing with the World's clock.
    serverRack(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, H = it.h, T = d.reduced ? 0 : d.T;
      K.box(ctx, f, { ...b, h1: H }, '#2c2440', { edge: 'rgba(232,184,50,0.45)' });
      K.box(ctx, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1, h0: H, h1: H + 2 }, C.brass);
      const F = frontFace(it);
      const paint = (g, w, h) => {
        g.fillStyle = '#16122a'; g.fillRect(1.2, 1.2, w - 2.4, h - 2.4);
        const rows = 6, cols = 2, cw = (w - 4) / cols, rh = (h - 4) / rows;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = 2 + c * cw, y = 2 + r * rh, k = 0.45 + 0.55 * Math.max(0, Math.sin(T * (0.8 + h1(r, c, it.id) * 1.6) + r + c * 2)), col = RUNES[(r + c + Math.floor(h1(it.id) * 3)) % 3]; g.strokeStyle = 'rgba(232,184,50,0.5)'; g.lineWidth = 0.4; g.strokeRect(x + 0.3, y + 0.3, cw - 0.6, rh - 0.6); g.globalAlpha = k; g.fillStyle = col; g.beginPath(); g.moveTo(x + cw / 2, y + 1); g.lineTo(x + cw * 0.72, y + rh / 2); g.lineTo(x + cw / 2, y + rh - 1); g.lineTo(x + cw * 0.28, y + rh / 2); g.closePath(); g.fill(); g.globalAlpha = 1; }
      };
      if (F === 'front') K.onFace(ctx, f, 'front', b.z0, b.x0, b.x1, 0, H, b.x1 - b.x0, H, g => paint(g, b.x1 - b.x0, H));
      else K.onFace(ctx, f, 'right', b.x1, b.z0, b.z1, 0, H, b.z1 - b.z0, H, g => paint(g, b.z1 - b.z0, H));
      const [tx, ty] = K.at(it.x, it.z, f, H + 2 + 3 + Math.sin(T * 1.2 + it.x) * 1.5); crystal(ctx, tx, ty, 2.4, RUNES[Math.floor(h1(it.id, 't') * 3)], T, it.x);
    },
    couch(d, it) {
      // A fireside settle: a high-backed timber bench with cushions.
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.5;
      K.box(ctx, f, { x0: b.x0, x1: b.x1, z0: b.z1 - 3, z1: b.z1, h0: 0, h1: it.h * 1.25 }, C.timber, { edge: 'rgba(255,220,160,0.25)' });
      paintFront(d, { ...it, facing: 'front' }, { ...b, z0: b.z1 - 3 }, s, it.h * 1.25, (g, w, h) => { g.strokeStyle = 'rgba(232,184,50,0.4)'; g.lineWidth = 0.5; for (let x = w / 6; x < w; x += w / 6) { g.beginPath(); g.arc(x, h * 0.4, 2, Math.PI, 0); g.stroke(); } });
      K.box(ctx, f, { x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0, z1: b.z1 - 3, h0: 0, h1: s - 2 }, C.timberLight);
      for (const k of [0, 1]) K.box(ctx, f, { x0: b.x0 + 3 + k * (b.x1 - b.x0 - 6) / 2, x1: b.x0 + 2 + (k + 1) * (b.x1 - b.x0 - 6) / 2, z0: b.z0 + 1, z1: b.z1 - 3, h0: s - 2, h1: s + 1 }, k ? C.emerald : C.crimson, { edge: 'rgba(255,255,255,0.15)' });
      for (const x of [b.x0, b.x1 - 2.5]) K.box(ctx, f, { x0: x, x1: x + 2.5, z0: b.z0, z1: b.z1, h0: 0, h1: it.h * 0.75 }, C.timber);
    },
    // The hearth (lounge counter): a stone fireplace with a living fire, a mantel, a cauldron hook.
    counter(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h = it.h, T = d.reduced ? 0 : d.T;
      K.box(ctx, f, { ...b, h1: h * 1.6 }, C.stone, { edge: 'rgba(255,255,255,0.18)' });
      paintFront(d, { ...it, facing: 'front' }, b, 0, h * 1.6, (g, w, hh) => { TEX.stone(C.stone, { w, h: hh, row: 6 })(g); g.fillStyle = '#1c1414'; g.beginPath(); g.moveTo(w * 0.25, hh); g.lineTo(w * 0.25, hh * 0.5); g.quadraticCurveTo(w * 0.5, hh * 0.22, w * 0.75, hh * 0.5); g.lineTo(w * 0.75, hh); g.fill(); });
      K.box(ctx, f, { x0: b.x0 - 2, x1: b.x1 + 2, z0: b.z0 - 2, z1: b.z1, h0: h * 1.6, h1: h * 1.6 + 2.5 }, C.timber);
      const [fx, fy] = K.at(it.x, b.z0, f, 1.5);
      glow(ctx, fx, fy - 6, 34, '#ff8a2a', 0.4 + 0.08 * Math.sin(T * 7));
      for (const [dx, s, sd] of [[-5, 2.4, 1], [0, 3.2, 2], [5, 2.2, 3]]) flame(ctx, fx + dx, fy, s, T, sd);
      ctx.fillStyle = '#4a2a1a'; ctx.fillRect(fx - 8, fy - 1, 16, 2);
      // Mantel: candles and a tankard.
      for (const k of [-0.32, 0.32]) candle(d, f, it.x + k * it.w, it.z, h * 1.6 + 2.5, T, k * 10);
    },
    coffeeMachine(d, it) {
      // A copper kettle on the mantel, steaming.
      const { ctx, K } = d, f = it.f, h0 = (it.base ? it.base.h * 1.6 + 2.5 : 0), T = d.reduced ? 0 : d.T;
      K.cylinder(ctx, f, it.x, it.z, h0, h0 + 5, 3, '#b8693a', { top: '#d08a50' });
      const [sx, sy] = K.at(it.x, it.z, f, h0 + 5); ctx.strokeStyle = '#8a4a2a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(sx, sy - 1, 3, Math.PI, 0); ctx.stroke();
      for (let i = 0; i < 3; i++) { const k = ((T * 0.35 + i / 3) % 1); ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx + 4 + Math.sin(T * 2 + i * 2) * 2 * k, sy - 2 - k * 14, 1.5 + k * 2.5, 0, TAU); ctx.fill(); }
    },
    // Potion cabinet (vending): carved timber with glass doors over rows of glowing bottles.
    vending(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, H = it.h, T = d.reduced ? 0 : d.T;
      K.box(ctx, f, { ...b, h1: H }, C.timber, { edge: 'rgba(232,184,50,0.4)' });
      K.box(ctx, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1, h0: H, h1: H + 2.5 }, shade(C.timber, 1.2));
      paintFront(d, it, b, 2, H - 2, (g, w, h) => { g.fillStyle = '#1a1420'; g.fillRect(1.5, 1, w - 3, h - 2); for (let r = 0; r < 4; r++) { g.fillStyle = C.timberLight; g.fillRect(1.5, 1 + (r + 1) * (h - 2) / 4 - 0.8, w - 3, 0.8); for (let c = 0; c < 4; c++) { const x = 3 + c * (w - 6) / 4, y = 1 + (r + 1) * (h - 2) / 4 - 0.8, col = ['#e0446a', '#46c0e0', '#8fe05a', '#c9a7ff', '#ffd27a'][(r * 3 + c) % 5], k = 0.7 + 0.3 * Math.sin(T * 1.5 + r + c); g.globalAlpha = k; g.fillStyle = col; g.beginPath(); g.ellipse(x + 1.6, y - 2, 1.5, 2, 0, 0, TAU); g.fill(); g.fillRect(x + 1.1, y - 5, 1, 2); g.globalAlpha = 1; } } g.strokeStyle = 'rgba(232,184,50,0.6)'; g.lineWidth = 0.6; g.strokeRect(1.5, 1, w / 2 - 1.5, h - 2); g.strokeRect(w / 2, 1, w / 2 - 1.5, h - 2); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(2, 1, w * 0.15, h - 2); });
    },
    armchair(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.5, c = C.emerald;
      const backSide = { left: { x0: b.x1 - 4, x1: b.x1, z0: b.z0, z1: b.z1 }, right: { x0: b.x0, x1: b.x0 + 4, z0: b.z0, z1: b.z1 }, front: { x0: b.x0, x1: b.x1, z0: b.z1 - 4, z1: b.z1 }, back: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + 4 } }[it.facing] ?? { x0: b.x0, x1: b.x1, z0: b.z1 - 4, z1: b.z1 };
      const near = it.facing === 'left' || it.facing === 'back', bk = () => { K.box(ctx, f, { ...backSide, h0: 0, h1: it.h * 1.35 }, shade(c, 0.85), { edge: 'rgba(232,184,50,0.6)' }); };
      if (!near) bk();
      K.box(ctx, f, { ...b, h0: 0, h1: s - 3 }, C.timber); K.box(ctx, f, { ...b, h0: s - 3, h1: s }, c, { edge: 'rgba(255,255,255,0.18)' });
      if (near) bk();
    },
    bench(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, s = it.h * 0.55, out = !it.id || it.id === 'bench';
      for (const x of [b.x0 + 2, b.x1 - 5]) K.box(ctx, f, { x0: x, x1: x + 3, z0: b.z0 + 1, z1: b.z1 - 1, h0: 0, h1: s - 2 }, out ? C.stoneDark : C.timber);
      K.box(ctx, f, { ...b, h0: s - 2, h1: s }, out ? C.stone : C.oak, { edge: 'rgba(255,230,180,0.25)' });
    },
    // The guild desk (reception): a ledger, a candle and the guild's sigil on deep blue.
    reception(d, it) {
      const { ctx, K } = d, b = ib(it), f = it.f, h = it.h, T = d.T;
      K.box(ctx, f, { ...b, h1: h - 2 }, C.timber, { edge: 'rgba(232,184,50,0.4)' });
      paintFront(d, it, b, 0, h - 2, (g, w, hh) => { g.fillStyle = C.blue; g.fillRect(w / 2 - 8, 1.5, 16, hh - 3); g.fillStyle = C.gold; sigil(g, w / 2, hh * 0.45, Math.min(6, hh * 0.3)); g.strokeStyle = 'rgba(232,184,50,0.6)'; g.lineWidth = 0.5; g.strokeRect(w / 2 - 8, 1.5, 16, hh - 3); g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let x = 3; x < w; x += 6) if (Math.abs(x - w / 2) > 9) { g.beginPath(); g.moveTo(x, 1); g.lineTo(x, hh - 1); g.stroke(); } });
      K.box(ctx, f, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1, h0: h - 2, h1: h }, C.oak);
      book(d, f, it.x + it.w * 0.15, it.z, h, '#7a2e2e', true); candle(d, f, b.x0 + 6, it.z + 2, h, T, 3);
      const [px, py] = K.at(it.x - it.w * 0.15, it.z + 2, f, h); crystal(ctx, px, py, 1.6, d.near?.(it) ? '#3ddc84' : '#9fe7ff', T, 5);
    },
    // A stone basin with a small spout (the water cooler): water rings ripple.
    waterCooler(d, it) {
      const { ctx, K } = d, f = it.f, T = d.reduced ? 0 : d.T, r = Math.min(it.w, it.d) * 0.55;
      K.cylinder(ctx, f, it.x, it.z, 0, it.h * 0.45, r, C.stone);
      K.disc(ctx, f, it.x, it.z, it.h * 0.45 + 0.1, r * 0.8, '#3d7fa8');
      const [sx, sy] = K.at(it.x, it.z, f, it.h * 0.45); for (let i = 0; i < 2; i++) { const k = (T * 0.5 + i / 2) % 1; ctx.strokeStyle = `rgba(220,240,255,${0.6 * (1 - k)})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.8 * k, r * 0.4 * k, 0, 0, TAU); ctx.stroke(); }
      K.box(ctx, f, { x0: it.x - 1, x1: it.x + 1, z0: it.z + r * 0.6, z1: it.z + r * 0.6 + 2, h0: it.h * 0.45, h1: it.h }, C.stoneDark);
      const [px, py] = K.at(it.x, it.z + r * 0.6, f, it.h * 0.9); ctx.strokeStyle = 'rgba(160,210,240,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - 1, py + 6, sx, sy); ctx.stroke();
    },
  };
  function sigil(g, x, y, s) { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.8, y - s * 0.2); g.lineTo(x + s * 0.5, y + s); g.lineTo(x, y + s * 0.6); g.lineTo(x - s * 0.5, y + s); g.lineTo(x - s * 0.8, y - s * 0.2); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 0.4, y - s * 0.6, 0.8, s * 1.2); }
  function urnPlant(d, f, x, z, h0, H, seed) {
    const { ctx, K } = d, r = 4;
    K.cylinder(ctx, f, x, z, h0, h0 + H * 0.3, r, '#a8603a', { top: '#5a3a22' });
    const [sx, sy] = K.at(x, z, f, h0 + H * 0.3), T = d.reduced ? 0 : d.T, top = H * 0.7;
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (h1(seed, i) - 0.5) * 2.6 + Math.sin(T * 0.7 + i) * 0.05, L = top * (0.4 + h1(i, seed) * 0.35); ctx.strokeStyle = ['#2e7a48', '#3f9a58', '#256a3c'][i % 3]; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + Math.cos(a) * L * 0.4, sy - L * 0.7, sx + Math.cos(a) * L, sy + Math.sin(a) * L * 0.6); ctx.stroke(); }
    if (h1(seed, 'fl') > 0.4) for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#e8b832', '#c9a7ff'][i % 2]; ctx.beginPath(); ctx.arc(sx + (h1(i, seed, 'x') - 0.5) * top * 0.8, sy - top * (0.3 + h1(i, seed, 'y') * 0.4), 1.3, 0, TAU); ctx.fill(); }
  }

  // Decor on a room's back wall.
  const decorDraw = {
    // The scrying mirror (status screen): the World's real counts, written in light.
    statusScreen(d, dc, g, w, h) {
      g.fillStyle = '#121833'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(120,160,255,0.35)'); gr.addColorStop(1, 'rgba(120,160,255,0)'); g.fillStyle = gr; g.fill();
      g.fillStyle = '#bfe8ff'; g.font = 'bold 3.2px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${d.counts.working} of ${d.counts.total} at work`, w / 2, h * 0.38); g.fillStyle = '#ffd27a'; g.fillText(`${d.queued.length} quests waiting`, w / 2, h * 0.58); g.fillStyle = '#c9a7ff'; g.fillText(`${d.archived} done`, w / 2, h * 0.76);
      g.strokeStyle = C.gold; g.lineWidth = 1.2; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 0.6, h / 2 - 0.6, 0, 0, TAU); g.stroke();
    },
    // The quest board (task board): parchment notes pinned to timber, one per real task in each state.
    taskBoard(d, dc, g, w, h) {
      g.fillStyle = C.timberLight; g.fillRect(0, 0, w, h); g.strokeStyle = C.timber; g.lineWidth = 1.2; g.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
      g.fillStyle = 'rgba(0,0,0,0.15)'; for (let y = 4; y < h; y += 5) g.fillRect(1, y, w - 2, 0.4);
      const cols = [['Waiting', d.queued.length], ['Afoot', d.counts.working], ['Done', Math.min(9, d.archived)]];
      cols.forEach(([name, n], i) => { const x = 1.6 + i * (w / 3); g.fillStyle = C.parchment; g.font = 'bold 2.6px Georgia, serif'; g.textBaseline = 'top'; g.fillText(name, x, 1.3); for (let k = 0; k < Math.min(n, 6); k++) { const px = x + (k % 2) * (w / 6.5), py = 5 + Math.floor(k / 2) * 5.2; g.save(); g.translate(px + 2.5, py + 2); g.rotate((h1(i, k) - 0.5) * 0.3); g.fillStyle = C.parchment; g.fillRect(-2.5, -2, w / 7.5, 4.2); g.fillStyle = 'rgba(80,50,20,0.5)'; g.fillRect(-1.8, -0.8, w / 10, 0.4); g.fillRect(-1.8, 0.6, w / 13, 0.4); g.fillStyle = '#8e2f3a'; g.beginPath(); g.arc(0, -1.6, 0.5, 0, TAU); g.fill(); g.restore(); } });
    },
    // The rune wall (code wall): carved stone whose runes glow and drift while work is under way.
    codeWall(d, dc, g, w, h) { TEX.stone('#5a5870', { w, h, row: 6 })(g); g.fillStyle = 'rgba(10,12,30,0.55)'; g.fillRect(1.5, 1.5, w - 3, h - 3); runeRows(g, w, h, d.T, dc.room, d.counts.working > 0); },
    // A war map on parchment (whiteboard).
    whiteboard(d, dc, g, w, h) {
      g.fillStyle = C.parchment; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a6a3a'; g.lineWidth = 0.8; g.strokeRect(0.4, 0.4, w - 0.8, h - 0.8);
      g.strokeStyle = 'rgba(80,60,30,0.55)'; g.lineWidth = 0.5; g.beginPath(); for (let i = 0; i < 3; i++) { const y = h * (0.3 + i * 0.2); g.moveTo(2, y); for (let x = 2; x < w - 2; x += 2) g.lineTo(x, y + Math.sin(x * 0.3 + i * 2) * 1.5); } g.stroke();
      g.fillStyle = 'rgba(46,139,87,0.5)'; g.beginPath(); g.ellipse(w * 0.3, h * 0.45, w * 0.12, h * 0.18, 0.3, 0, TAU); g.fill(); g.fillStyle = 'rgba(39,64,122,0.45)'; g.beginPath(); g.ellipse(w * 0.72, h * 0.6, w * 0.1, h * 0.14, -0.4, 0, TAU); g.fill();
      g.fillStyle = '#8e2f3a'; for (const [x, y] of [[0.3, 0.4], [0.55, 0.6], [0.72, 0.55]]) { g.beginPath(); g.arc(w * x, h * y, 0.9, 0, TAU); g.fill(); }
    },
    window(d, dc, g, w, h) { stained(g, w, h, d.day, dc.room); },
    // The astronomical clock: the real hour on a brass ring, sun by day and moon by night.
    clock(d, dc, g, w, h) { const now = new Date(), r = Math.min(w, h) / 2 - 0.4; g.fillStyle = C.blue; g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.fill(); g.strokeStyle = C.gold; g.lineWidth = 0.9; g.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = C.gold; g.fillRect(w / 2 + Math.sin(a) * r * 0.8 - 0.3, h / 2 - Math.cos(a) * r * 0.8 - 0.3, 0.6, 0.6); } const a = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU; g.strokeStyle = C.gold; g.lineWidth = 0.6; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.sin(a) * r * 0.55, h / 2 - Math.cos(a) * r * 0.55); g.stroke(); g.fillStyle = d.day.night > 0.5 ? '#e6eeff' : '#ffd27a'; g.beginPath(); g.arc(w / 2 + Math.sin(now.getMinutes() / 60 * TAU) * r * 0.75, h / 2 - Math.cos(now.getMinutes() / 60 * TAU) * r * 0.75, 0.9, 0, TAU); g.fill(); },
  };
  // A stained-glass window: lead lines over coloured panes, lit by the sky by day and from inside by night.
  function stained(g, w, h, day, seed) {
    const [top, bot] = skyColors(day), lit = 1 - day.night * 0.55;
    g.save(); g.beginPath(); g.moveTo(0, h); g.lineTo(0, w / 2); g.arc(w / 2, w / 2, w / 2, Math.PI, 0); g.lineTo(w, h); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const panes = ['#2b5fae', '#2e8b57', '#e8b832', '#6b4aa0', '#3a7fbf', '#c0533d'], n = 4, ph = h / 5;
    for (let j = 0; j < 5; j++) for (let i = 0; i < n; i++) { g.globalAlpha = 0.55 * lit + 0.15; g.fillStyle = panes[Math.floor(h1(i, j, seed) * panes.length)]; g.fillRect(i * w / n, j * ph, w / n, ph); }
    g.globalAlpha = 1; g.strokeStyle = '#2a2420'; g.lineWidth = 0.7; for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n, h); g.stroke(); } for (let j = 1; j < 5; j++) { g.beginPath(); g.moveTo(0, j * ph); g.lineTo(w, j * ph); g.stroke(); }
    g.fillStyle = 'rgba(255,240,200,0.35)'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.18, 0, TAU); g.fill();
    g.restore(); g.strokeStyle = C.stoneDark; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, h); g.lineTo(0, w / 2); g.arc(w / 2, w / 2, w / 2, Math.PI, 0); g.lineTo(w, h); g.stroke();
  }
  // A banner hanging on a far wall between windows (green and gold first).
  function banner(g, x, y, w, h, i, T) {
    const cols = [[C.emerald, C.gold], [C.blue, C.gold], [C.emerald, C.gold], [C.crimson, C.gold]][i % 4], sw = Math.sin(T * 1.2 + i) * 0.6;
    g.fillStyle = C.timber; g.fillRect(x - 1, y - 1, w + 2, 1.4);
    g.fillStyle = cols[0]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + sw, y + h); g.lineTo(x + w / 2 + sw, y + h - w * 0.45); g.lineTo(x + sw, y + h); g.closePath(); g.fill();
    g.fillStyle = cols[1]; g.fillRect(x + 0.8, y + 1, w - 1.6, 0.8); g.fillRect(x + 0.8 + sw * 0.5, y + h - w * 0.6, w - 1.6, 0.6); sigil(g, x + w / 2 + sw * 0.4, y + h * 0.38, w * 0.26);
  }

  return {
    sky: null, island: null, accent: C.gold, tagBg: 'rgba(28,20,14,0.86)', tagText: '#f6ead0', tagSub: '#d8c49a',
    vehicleColors: ['#8a5a34', '#6b4a2e', '#7a4e2c', '#5b3a22'], siteLight: '#ffc46a',
    // What this style can draw (the compatibility test checks every World type has a look).
    kinds: { items: Object.keys(items), decor: Object.keys(decorDraw) },
    agentColor: a => AGENT_COLOR[a.id] ?? '#e6d8b8',
    floor(d, room) {
      const kind = room.kind, r = room.r;
      fillPlan(d, room.level, r, floorFill(d.ctx, kind));
      inPlan(d, room.level, g => {
        let gr = g.createLinearGradient(0, r.z1, 0, r.z1 - 14); gr.addColorStop(0, 'rgba(30,18,10,0.28)'); gr.addColorStop(1, 'rgba(30,18,10,0)'); g.fillStyle = gr; g.fillRect(r.x0, r.z1 - 14, r.x1 - r.x0, 14);
        gr = g.createLinearGradient(r.x0, 0, r.x0 + 12, 0); gr.addColorStop(0, 'rgba(30,18,10,0.2)'); gr.addColorStop(1, 'rgba(30,18,10,0)'); g.fillStyle = gr; g.fillRect(r.x0, r.z0, 12, r.z1 - r.z0);
        const rug = RUG[kind], cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        if (rug && room.primitive === 'room') { const w = (r.x1 - r.x0) * 0.52, dd = (r.z1 - r.z0) * 0.44; g.fillStyle = rug[0]; g.fillRect(cx - w / 2, cz - dd / 2, w, dd); g.strokeStyle = rug[1]; g.lineWidth = 1.2; g.strokeRect(cx - w / 2 + 2.5, cz - dd / 2 + 2.5, w - 5, dd - 5); g.lineWidth = 0.5; g.strokeRect(cx - w / 2 + 5, cz - dd / 2 + 5, w - 10, dd - 10); g.fillStyle = rug[1]; for (let x = cx - w / 2; x < cx + w / 2; x += 2.5) { g.fillRect(x, cz - dd / 2 - 1.5, 0.6, 1.5); g.fillRect(x, cz + dd / 2, 0.6, 1.5); } }
        // The arcane core's rune circle (glows at night) and the gate hall's mosaic compass.
        if (kind === 'servers' || kind === 'servers-like' || kind === 'lobby') { const R0 = Math.min(r.x1 - r.x0, r.z1 - r.z0) * (kind === 'lobby' ? 0.2 : 0.3), T = d.reduced ? 0 : d.T; g.strokeStyle = kind === 'lobby' ? 'rgba(232,184,50,0.75)' : `rgba(160,140,255,${0.55 + 0.25 * Math.sin(T * 1.5)})`; g.lineWidth = 1; g.beginPath(); g.arc(cx, cz, R0, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cz, R0 * 0.75, 0, TAU); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + (kind === 'lobby' ? 0 : T * 0.1); g.beginPath(); g.moveTo(cx + Math.cos(a) * R0 * 0.75, cz + Math.sin(a) * R0 * 0.75); g.lineTo(cx + Math.cos(a) * R0, cz + Math.sin(a) * R0); g.stroke(); } if (kind === 'lobby') { g.fillStyle = 'rgba(46,139,87,0.55)'; g.beginPath(); g.moveTo(cx, cz + R0 * 0.7); g.lineTo(cx + R0 * 0.2, cz); g.lineTo(cx, cz - R0 * 0.7); g.lineTo(cx - R0 * 0.2, cz); g.fill(); } }
        if (kind === 'development' || kind === 'workshop') { g.fillStyle = 'rgba(30,20,10,0.12)'; for (let i = 0; i < 18; i++) g.fillRect(r.x0 + h1(i, 'soot') * (r.x1 - r.x0), r.z0 + h1('soot', i) * (r.z1 - r.z0), 3, 2); }
      });
    },
    slab(d, f, b) {
      const r = b.r, m = 3;
      d.K.box(d.ctx, f, { x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m, h0: f === 0 ? -7 : -10, h1: 0 }, f === 0 ? C.stoneDark : C.timber, { edge: 'rgba(255,230,180,0.3)', top: f === 0 ? '#a99d86' : '#7a5a3a' });
      if (f === 0) { const F = d.K; F.onFace(d.ctx, f, 'front', r.z0 - m, r.x0 - m, r.x1 + m, -7, 0, r.x1 - r.x0 + 2 * m, 7, g => TEX.stone(C.stoneDark, { w: r.x1 - r.x0 + 2 * m, h: 7, row: 3.5 })(g)); F.onFace(d.ctx, f, 'right', r.x1 + m, r.z0 - m, r.z1 + m, -7, 0, r.z1 - r.z0 + 2 * m, 7, g => { TEX.stone(C.stoneDark, { w: r.z1 - r.z0 + 2 * m, h: 7, row: 3.5 })(g); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, r.z1 - r.z0 + 2 * m, 7); }); }
    },
    wall(d, w) {
      const { ctx, K } = d, f = w.f, b = { ...w.box, h0: w.h0, h1: w.h1 }, kind = w.room, F = wallFace(w), L = F.b - F.a, T = d.reduced ? 0 : d.T;
      if (w.near) {
        // A stone parapet with cap stones and small merlons.
        K.box(ctx, f, b, C.stone, { top: '#a3967f' });
        K.onFace(ctx, f, F.kind, F.c, F.a, F.b, w.h0, w.h1, L, w.h1 - w.h0, g => { TEX.stone(C.stone, { w: L, h: w.h1 - w.h0, row: 5.5 })(g); if (F.kind === 'right') { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, L, w.h1 - w.h0); } });
        const step = 16; for (let s = w.s + 4; s + 6 <= w.e; s += step) K.box(ctx, f, w.axis === 'z' ? { x0: s, x1: s + 6, z0: b.z0 - 0.5, z1: b.z1 + 0.5, h0: w.h1, h1: w.h1 + 5 } : { x0: b.x0 - 0.5, x1: b.x1 + 0.5, z0: s, z1: s + 6, h0: w.h1, h1: w.h1 + 5 }, '#c2b59c', { edge: 'rgba(255,240,210,0.3)' });
        return;
      }
      if (w.type === 'low' || w.type === 'partition') {
        if (w.h0 > 0) { K.box(ctx, f, b, C.timber, { top: shade(C.timber, 1.2) }); return; }
        // Interior: a stone sill wall and timber posts carrying a beam (open between, so the rooms read).
        K.box(ctx, f, { ...b, h1: LOW }, C.stone, { top: '#a3967f' });
        K.onFace(ctx, f, F.kind, F.c, F.a, F.b, 0, LOW, L, LOW, g => TEX.stone(C.stone, { w: L, h: LOW, row: 5.5 })(g));
        const n = Math.max(1, Math.round(L / 28)), posts = []; for (let k = 0; k <= n; k++) posts.push(w.s + (L * k) / n);
        for (const s of posts) { const p = Math.min(Math.max(s, w.s + 1.4), w.e - 1.4); K.box(ctx, f, w.axis === 'z' ? { x0: p - 1.4, x1: p + 1.4, z0: b.z0, z1: b.z1, h0: LOW, h1: w.h1 } : { x0: b.x0, x1: b.x1, z0: p - 1.4, z1: p + 1.4, h0: LOW, h1: w.h1 }, C.timber, { edge: 'rgba(255,220,160,0.18)' }); }
        K.box(ctx, f, { ...b, h0: w.h1 - 3, h1: w.h1 }, C.timber, { edge: 'rgba(255,220,160,0.22)' });
        return;
      }
      // Far walls: a stone base, timber-framed plaster above, stained glass, banners between the windows.
      const tint = WALL_TINT[kind], plaster = tint ? shade(tint, 1.25) : C.plaster;
      K.box(ctx, f, b, plaster, { top: C.cut, right: shade(C.stone, 0.72) });
      const H = w.h1 - w.h0, wins = winOf.get(w) ?? [];
      K.onFace(ctx, f, F.kind, F.c, F.a, F.b, w.h0, w.h1, L, H, g => {
        const base = w.h0 === 0 ? 30 : 0;
        if (base) { g.save(); g.translate(0, H - base); TEX.stone(tint ?? C.stone, { w: L, h: base, row: 6 })(g); g.restore(); g.fillStyle = C.timber; g.fillRect(0, H - base - 1.5, L, 2); }
        // Timber frame: posts, a head beam and braces.
        g.fillStyle = C.timber; const n = Math.max(1, Math.round(L / 36)); for (let k = 0; k <= n; k++) { const x = Math.min(L - 2.4, (L * k) / n); if (wins.some(([s, e]) => x + F.a > s - 3 && x + F.a < e + 3)) continue; g.fillRect(x, 0, 2.4, H - base); }
        g.fillRect(0, 0, L, 3);
        if (tint) runeRows(g, L, 8, T, 'band', false, ['rgba(160,140,255,0.6)']);
        for (const [s, e] of wins) { const x = s - F.a, ww = e - s, y0 = 8, y1 = H - 34; g.fillStyle = C.stoneDark; g.fillRect(x - 2, y0 - 2, ww + 4, y1 - y0 + 3); g.save(); g.translate(x, y0); stained(g, ww, y1 - y0, d.day, `${w.at}:${s}`); g.restore(); g.fillStyle = '#c2b59c'; g.fillRect(x - 3, y1, ww + 6, 2); }
        // Banners where there is room between windows (deterministic).
        let i = 0; for (let x = 10; x + 10 < L; x += 46) { const X = x + F.a; if (wins.some(([s, e]) => X + 10 > s - 4 && X < e + 4)) continue; if ((w.doors ?? []).some(o => X + 10 > o.s - 4 && X < o.e + 4)) continue; if (h1(w.at, x, 'ban') > 0.55) banner(g, x, 5, 9, H - base - 18, i++ + Math.floor(h1(w.at) * 4), T); }
        // Sconce torches on the stone base line.
        for (let x = 24; x < L - 10; x += 72) { const X = x + F.a; if (wins.some(([s, e]) => X > s - 4 && X < e + 4)) continue; g.fillStyle = C.iron; g.fillRect(x - 0.8, H - base - 14, 1.6, 6); g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(x, H - base - 16 - Math.sin(T * 9 + x) * 0.4, 1.3, 2.2, 0, 0, TAU); g.fill(); }
      });
    },
    door(d, dr) {
      const { ctx, K } = d, f = dr.f, w = doorWall.get(dr), a = dr.axis === 'z' ? Math.min(dr.a.x, dr.b.x) : Math.min(dr.a.z, dr.b.z), e = dr.axis === 'z' ? Math.max(dr.a.x, dr.b.x) : Math.max(dr.a.z, dr.b.z), at = dr.axis === 'z' ? dr.a.z : dr.a.x;
      const R = (s0, s1, c0, c1) => (dr.axis === 'z' ? { x0: s0, x1: s1, z0: at + c0, z1: at + c1 } : { x0: at + c0, x1: at + c1, z0: s0, z1: s1 });
      inPlan(d, f, g => { g.fillStyle = '#8c806c'; const r = R(a, e, -2.5, 2.5); g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); });
      if (dr.outside) {
        // The gate: a woven mat, and two iron braziers on stone posts outside.
        inPlan(d, f, g => { g.fillStyle = '#7a3a2a'; const r = R(a + 2, e - 2, -12, -3); g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); g.strokeStyle = C.gold; g.lineWidth = 0.6; g.strokeRect(r.x0 + 1, r.z0 + 1, r.x1 - r.x0 - 2, r.z1 - r.z0 - 2); });
        for (const s of [a - 5, e + 5]) { const c = dr.axis === 'z' ? [s, at - 10] : [at - 10, s]; K.box(ctx, f, { x0: c[0] - 2, x1: c[0] + 2, z0: c[1] - 2, z1: c[1] + 2, h0: 0, h1: 22 }, C.stone, { edge: 'rgba(255,240,210,0.3)' }); const [x, y] = K.at(c[0], c[1], f, 22); ctx.fillStyle = C.iron; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 2.5, y + 3); ctx.lineTo(x - 2.5, y + 3); ctx.closePath(); ctx.fill(); flame(ctx, x, y, 2.4, d.reduced ? 0 : d.T, s); }
        if (w?.far) { for (const s of [a - 2, e]) K.box(ctx, f, { ...R(s, s + 2, -1.5, 1.5), h0: 0, h1: dr.h + 2 }, C.stone); K.box(ctx, f, { ...R(a - 2, e + 2, -1.5, 1.5), h0: dr.h, h1: dr.h + 4 }, C.stone); }
        return;
      }
      if (!w || dr.kind === 'opening') return;
      const top = Math.min(dr.h, w.h1);
      for (const s of [a - 1.2, e - 0.8]) K.box(ctx, f, { ...R(s, s + 2, -1.6, 1.6), h0: 0, h1: top }, w.far ? C.stone : C.timber);
      if (w.far) { K.box(ctx, f, { ...R(a - 1.2, e + 1.2, -1.6, 1.6), h0: top - 3, h1: top }, C.timber); const L = e - a; K.box(ctx, f, { ...(dr.axis === 'z' ? { x0: a + 0.5, x1: a + 2.2, z0: at - L * 0.85, z1: at } : { x0: at, x1: at + L * 0.85, z0: a + 0.5, z1: a + 2.2 }), h0: 0, h1: top - 3.5 }, C.timberLight, { edge: 'rgba(232,184,50,0.4)' }); }
    },
    flatItem: () => false,
    item(d, it) { (items[it.type] ?? generic)(d, it); },
    shadow(d, it) { if (it.h > 4) d.K.shadow(d.ctx, it.f, ib(it), it.h, 0.2); },
    decor(d, dc) {
      const { ctx, K } = d, f = dc.f, z = dc.z - 1.5, W = dc.x1 - dc.x0, H = dc.h1 - dc.h0;
      if (dc.type === 'clock' || dc.type === 'window' || dc.type === 'statusScreen') {
        if (dc.type === 'window') K.box(ctx, f, { x0: dc.x0 - 2, x1: dc.x1 + 2, z0: z - 3, z1: z, h0: dc.h0 - 2, h1: dc.h0 }, '#c2b59c');
        K.onFace(ctx, f, 'front', z - (dc.type === 'statusScreen' ? 1 : 0), dc.x0, dc.x1, dc.h0, dc.h1, W, H, g => decorDraw[dc.type](d, dc, g, W, H));
        return;
      }
      K.box(ctx, f, { x0: dc.x0 - 1, x1: dc.x1 + 1, z0: z - 1.2, z1: z + 1, h0: dc.h0 - 1, h1: dc.h1 + 1 }, dc.type === 'codeWall' ? C.stoneDark : C.timber);
      K.onFace(ctx, f, 'front', z - 1.2, dc.x0, dc.x1, dc.h0, dc.h1, W, H, g => (decorDraw[dc.type] ?? (() => {}))(d, dc, g, W, H));
    },
    slot(d, sl) {
      const { ctx, K } = d, r = sl.r, f = sl.f, T = d.reduced ? 0 : d.T;
      if (sl.what === 'lift') {
        // A hoist: a timber frame with a rope, a pulley wheel and a wooden platform.
        K.box(ctx, f, { ...r, h1: 2 }, C.timberLight, { edge: 'rgba(255,220,160,0.3)' });
        for (const [x, z] of [[r.x0, r.z1], [r.x1, r.z1], [r.x0, r.z0], [r.x1, r.z0]]) K.box(ctx, f, { x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4, h0: 0, h1: HT - 6 }, C.timber);
        for (const z of [r.z0, r.z1]) K.box(ctx, f, { x0: r.x0, x1: r.x1, z0: z - 1.2, z1: z + 1.2, h0: HT - 9, h1: HT - 6 }, C.timber);
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, [wx, wy] = K.at(cx, cz, f, HT - 10);
        ctx.strokeStyle = C.iron; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, TAU); ctx.stroke(); ctx.save(); ctx.translate(wx, wy); ctx.rotate(T * 0.3); ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * 2.1) * 5, Math.sin(i * 2.1) * 5); } ctx.stroke(); ctx.restore();
        const [px, py] = K.at(cx, cz, f, 2); ctx.strokeStyle = '#c8a26a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(wx - 5, wy); ctx.lineTo(px - 5, py); ctx.moveTo(wx + 5, wy); ctx.lineTo(px + 5, py); ctx.stroke();
        return;
      }
      const n = 10, D = r.z1 - r.z0, W = r.x1 - r.x0, sw = W * 0.55;
      K.box(ctx, f, { x0: r.x0 + 2 + sw - 2, x1: r.x0 + 2 + sw, z0: r.z0, z1: r.z1, h0: 0, h1: HT * 0.9 }, null, { front: 'rgba(0,0,0,0)', right: C.timber, top: C.timber });
      for (let i = 0; i < n; i++) { const h = ((i + 1) * HT * 0.9) / n; K.box(ctx, f, { x0: r.x0 + 2, x1: r.x0 + 2 + sw, z0: r.z0 + (D * i) / n, z1: r.z0 + (D * (i + 1)) / n, h0: i ? h - 3 : 0, h1: h }, i % 3 ? C.timberLight : C.stone, { edge: 'rgba(255,230,180,0.25)' }); }
      for (let i = 2; i < n; i += 3) { const h = ((i + 1) * HT * 0.9) / n, [x, y] = K.at(r.x0 + 2 + sw, r.z0 + (D * (i + 0.5)) / n, f, h + 10); ctx.strokeStyle = C.iron; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y); ctx.stroke(); }
    },
    site(d, site) {
      const cone = (ctx, [x, y]) => { ctx.strokeStyle = C.timber; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.stroke(); ctx.fillStyle = C.crimson; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 5, y - 7.5); ctx.lineTo(x, y - 6); ctx.fill(); };
      if (site.kind === 'refit') drawRefit(d, site, { tape: C.gold, stake: C.timber, crate: '#a8784a' });
      else drawSite(d, site, { stake: C.timber, string: '#e8d9a8', dirt: '#9a7a52', slab: '#a99d86', rebar: C.timber, frame: C.timber, scaffold: '#8a5a34', plank: '#b58a55', wall: C.stone, crate: '#a8784a', accent: C.gold, cone });
    },
    plantHeight: pl => plantHeight(pl, U) * 0.85,
    plant(d, pl) { fantasyPlant(d, pl); },
    extra(d, ex) {
      const { ctx, K } = d, f = 0, T = d.reduced ? 0 : d.T;
      if (ex.type === 'lamp') { K.box(ctx, f, { x0: ex.x - 0.8, x1: ex.x + 0.8, z0: ex.z - 0.8, z1: ex.z + 0.8, h0: 0, h1: ex.h }, C.iron); const [x, y] = K.at(ex.x, ex.z, f, ex.h); ctx.strokeStyle = C.iron; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 2); ctx.stroke(); ctx.fillStyle = C.iron; ctx.fillRect(x + 4, y - 1, 4, 1); ctx.fillStyle = d.night > 0.2 ? '#ffd27a' : '#e8d9a8'; ctx.fillRect(x + 4.6, y, 2.8, 4); ctx.fillStyle = C.iron; ctx.fillRect(x + 4, y + 4, 4, 1); if (d.night > 0.2) glow(ctx, x + 6, y + 2, 10, '#ffb347', 0.5 * d.night); return; }
      if (ex.type === 'planter') { K.cylinder(ctx, f, ex.x, ex.z, 0, ex.h, ex.w * 0.45, C.stone, { top: '#5a3a22' }); urnPlant(d, f, ex.x, ex.z, ex.h - 3, 20, ex.x); return; }
      if (ex.type === 'bench') { items.bench(d, { ...ex, f, id: 'bench', facing: 'front' }); return; }
      if (ex.type === 'flag') { K.cylinder(ctx, f, ex.x, ex.z, 0, ex.h, 0.7, C.timber); const [x, y] = K.at(ex.x, ex.z, f, ex.h); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y - 1, 1.4, 0, TAU); ctx.fill(); ctx.fillStyle = C.emerald; ctx.beginPath(); ctx.moveTo(x, y + 2); for (let k = 0; k <= 8; k++) ctx.lineTo(x + k * 2.4, y + 2 + Math.sin(T * 2.6 + k * 0.7) * 1.3 * (k / 8)); ctx.lineTo(x + 16, y + 9); for (let k = 8; k >= 0; k--) ctx.lineTo(x + k * 2.4, y + 15 + Math.sin(T * 2.6 + k * 0.7) * 1.3 * (k / 8)); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.gold; ctx.fillRect(x, y + 6, 14, 1); return; }
      if (ex.type === 'sign') {
        // A timber signpost with a hanging shield: the guild's name.
        const p0 = K.at(ex.x - ex.w * 0.35, ex.z, f, 0), p1 = K.at(ex.x + ex.w * 0.35, ex.z, f, 0), H = ex.h * 1.3;
        for (const [x, y] of [p0, p1]) { ctx.fillStyle = C.timber; ctx.fillRect(x - 1.2, y - H, 2.4, H); }
        ctx.fillStyle = C.timber; ctx.fillRect(p0[0] - 2, p0[1] - H, p1[0] - p0[0] + 4, 2.4);
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2 - H + 4, sw = Math.sin(T * 1.4) * 0.04;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(sw); ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(16, 2); ctx.lineTo(16, 12); ctx.quadraticCurveTo(0, 22, -16, 12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = C.gold; ctx.font = 'bold 6px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HILLINK', 0, 9); ctx.restore();
      }
    },
    ground(d, R) { drawGround(d, R, { key: 'fantasy', grass: '#6aa54c', lawn: '#7ab65a', edge: 'rgba(40,80,40,0.4)', roadEdge: '#7d7466', road: g => pattern(g, 'f:cobble', 30, 30, TEX.flagstones('#8f877a', { w: 30, h: 30 })), pathEdge: '#9c8f72', path: g => pattern(g, 'f:path', 48, 48, TEX.flagstones('#c8b48a')), dirt: 'rgba(150,110,70,0.5)', tufts: ['#4f8a3a', '#6fae4e'], flowers: ['#f4f1e6', '#f2d24b', '#c9a7ff', '#ef8fb0', '#8fd0ff'] }); },
    vehicle(d, v) {
      // A covered wagon.
      const L = 2.4 * U * 0.42, W = 0.96 * U * 0.42, a = v.angle ?? 0, f = 0;
      d.ctx.save(); d.ctx.globalAlpha *= v.alpha ?? 1;
      orientedBox(d, f, v.x, v.y, L * 2, W * 2, 4, 9, a, v.color, { edge: 'rgba(255,220,160,0.3)' });
      orientedBox(d, f, v.x - Math.cos(a) * 2, v.y - Math.sin(a) * 2, L * 1.4, W * 1.9, 9, 18, a, '#efe2bf', { top: '#f4ead0' });
      d.ctx.restore();
    },
    agentLook(a) {
      if (a.id === 'claude') return { scale: 0.86, girth: 1.28, legs: 0.8, skin: '#efc29a', hair: '#a04a22', hairStyle: 'swept', beard: '#b0562a', hat: 'leathercap', hatColor: '#6b3f22', goggles: '#9fe7ff', top: '#b5652e', top2: '#9a5226', apron: '#4a2f1c', belt: '#2a1a10', buckle: C.brass, bottom: '#5a3d2a', shoes: '#2a1a10', tool: 'hammer', holdItem: 'scroll', carryColor: '#a8784a', accent: AGENT_COLOR.claude };
      if (a.id === 'codex') return { skin: '#d9b08e', hair: '#1d1f2a', hat: 'hood', hatColor: '#2c3466', top: '#33416e', top2: '#2c3466', cape: '#232a52', bottom: '#232a52', shoes: '#1a1a22', cyborg: '#9aa3ad', eyeRed: '#ff3b30', chestLight: '#9fe7ff', belt: C.brass, tool: 'staff', holdItem: 'lens', accent: '#9fe7ff' };
      if (a.id === 'chatgpt') return { skin: '#c99a76', hair: '#3a2a1c', hairStyle: 'swept', beard: '#4a3424', hat: 'crown', hatColor: C.gold, gem: '#3ddc84', top: '#2e8b57', top2: '#2e8b57', cape: '#1f5e3c', sash: C.gold, belt: '#5a3a1c', buckle: C.gold, bottom: '#1f3a2a', shoes: '#2a1a10', holdItem: 'scroll', accent: AGENT_COLOR.chatgpt };
      return { skin: '#e0b896', hair: '#3a2a20', top: '#6b4a2e', bottom: '#3b3f46' };
    },
    ambientLook(i) {
      const L = [
        { skin: '#f0c8a0', hair: '#c79b5a', hairStyle: 'long', top: '#7a5a8a', bottom: '#4a3a2a', apron: '#e8dcc0' },
        { skin: '#8d5a3c', hair: '#1a1a1e', hat: 'hood', hatColor: '#5a6a3a', top: '#6a7a4a', bottom: '#3a3020', holdItem: 'scroll' },
        { skin: '#e2b48e', hair: '#6b4a2e', hairStyle: 'long', top: '#a0523a', bottom: '#3a2a20', belt: '#2a1a10' },
        { skin: '#c99a76', hair: '#2b2b2b', top: '#3a5a7a', bottom: '#3a3020', hat: 'cap', hatColor: '#6b4a2e' },
        { skin: '#f3d2b5', hair: '#9a6b3a', top: '#8a7a4a', bottom: '#5a4a3a', apron: '#6b4a2e' },
      ];
      return L[i % L.length];
    },
    roomLight: kind => ({ servers: { col: '#a68bff', i: 0.8 }, 'servers-like': { col: '#a68bff', i: 0.8 }, command: { col: '#ffc46a', i: 0.85 }, testing: { col: '#ffd9a0', i: 0.8 }, development: { col: '#ff9a4a', i: 0.9 }, lounge: { col: '#ffa14a', i: 0.95 }, lobby: { col: '#ffc46a', i: 0.85 } }[kind] ?? { col: '#ffc46a', i: 0.8 }),
    itemLight(it, d) {
      if (it.type === 'desk') return { r: 30, col: '#ffcf7a', i: 0.55, h: it.h + 6 };
      if (it.type === 'serverRack') return { r: 40, col: '#a68bff', i: 0.55, h: it.h * 0.7 };
      if (it.type === 'vending') return { r: 34, col: '#c9a7ff', i: 0.45, h: it.h * 0.6 };
      if (it.type === 'counter') return { r: 80, col: '#ff8a2a', i: 0.95, h: 8 };
      if (it.type === 'printer') return { r: 46, col: '#ff6a2a', i: 0.7, h: it.h * 0.6 };
      if (it.type === 'reception' || it.type === 'roundTable') return { r: 36, col: '#ffcf7a', i: 0.55, h: it.h + 8 };
      return null;
    },
    decorLight(dc) { return dc.type === 'statusScreen' || dc.type === 'codeWall' ? { r: 44, col: '#9fb8ff', i: 0.45 } : dc.type === 'window' ? { r: 30, col: '#ffd27a', i: 0.35 } : null; },
    extraLight(ex) { if (ex.type === 'lamp') return { r: 60, col: '#ffb347', i: 0.9, h: ex.h }; return null; },
    meetingMarker(d, x, y) { const ctx = d.ctx; ctx.beginPath(); ctx.roundRect(x - 11, y - 9, 22, 14, 5); ctx.fillStyle = C.crimson; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = C.gold; sigil(ctx, x, y - 2, 4); },
    // Selective magic: motes rising in the arcane core, and chimney smoke over the hearth.
    atmosphere(d) {
      const { ctx, K } = d, T = d.reduced ? 0 : d.T;
      for (const room of model.rooms) {
        if (room.kind !== 'servers' && room.kind !== 'servers-like') continue;
        const r = room.r;
        for (let i = 0; i < 10; i++) { const k = (T * 0.12 + h1(i, room.id)) % 1, x = r.x0 + (r.x1 - r.x0) * h1(room.id, i, 'x'), z = r.z0 + (r.z1 - r.z0) * h1(room.id, i, 'z'), [sx, sy] = K.at(x + Math.sin(T + i) * 3, z, room.level, 6 + k * 60), a = Math.sin(k * Math.PI); ctx.fillStyle = `rgba(200,180,255,${0.8 * a})`; ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, TAU); ctx.fill(); glow(ctx, sx, sy, 6, '#b79cff', 0.35 * a); }
      }
    },
  };
  function generic(d, it) { d.K.box(d.ctx, it.f, { ...ib(it), h0: baseH(it), h1: baseH(it) + it.h }, C.timberLight, { edge: 'rgba(255,220,160,0.3)' }); }
  // Trees and shrubs in the guild's palette: emerald oaks, silver birches, dark pines, flowering shrubs, mossy rocks
  // (a few with a crystal growing from them). Cached sprites with a gentle sway.
  function fantasyPlant(d, p) {
    const H = plantHeight(p, U) * 0.85, key = `${p.kind}:${Math.floor(p.seed * 5)}:${Math.round(p.s * 4)}`;
    let s = sprites.get(key);
    if (!s) {
      const R = H * (p.kind === 'conifer' ? 0.22 : p.kind === 'broadleaf' || p.kind === 'birch' ? 0.36 : 0.7), w = Math.ceil(R * 2.6 + 10), h = Math.ceil(H + R * 0.5 + 10), sc = 2, v = Math.floor(p.seed * 5);
      const c = texture(w * sc, h * sc, g => {
        g.scale(sc, sc); const bx = w / 2, by = h - 4, rnd = k => h1(v, k, p.kind);
        const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, shade(col, 1.25)); gr.addColorStop(0.7, col); gr.addColorStop(1, shade(col, 0.7)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
        if (p.kind === 'broadleaf' || p.kind === 'birch') {
          const birch = p.kind === 'birch', tt = by - H * (birch ? 0.55 : 0.42), tw = birch ? 1.5 : 2.6;
          g.fillStyle = birch ? '#e9e4da' : '#5a3a22'; g.beginPath(); g.moveTo(bx - tw, by); g.lineTo(bx - tw * 0.5, tt); g.lineTo(bx + tw * 0.5, tt); g.lineTo(bx + tw, by); g.fill();
          const base = birch ? '#9cc77a' : ['#2f8a4a', '#3a9a52', '#2a7a44', '#c8a43a'][v % 4], cy = by - H * 0.7;
          blob(bx, cy + R * 0.2, R * 0.95, shade(base, 0.8));
          for (let k = 0; k < 6; k++) blob(bx + (rnd(k) - 0.5) * R * 1.2, cy + (rnd(k + 9) - 0.5) * R * 0.9 - (k % 2) * R * 0.25, R * (0.45 + rnd(k + 19) * 0.3), base);
          if (!birch && v % 2) for (let k = 0; k < 10; k++) { g.fillStyle = ['#f2d24b', '#ef8fb0'][k % 2]; g.beginPath(); g.arc(bx + (rnd(k + 40) - 0.5) * R * 1.5, cy + (rnd(k + 60) - 0.5) * R, 0.9, 0, TAU); g.fill(); }
        } else if (p.kind === 'conifer') {
          g.fillStyle = '#4a2f1c'; g.fillRect(bx - 1.3, by - H * 0.2, 2.6, H * 0.2);
          for (let k = 0; k < 4; k++) { const y0 = by - H * 0.14 - k * H * 0.2, y1 = y0 - H * 0.36, r = R * (1 - k * 0.2), gr = g.createLinearGradient(bx - r, 0, bx + r, 0); gr.addColorStop(0, '#3f7a5a'); gr.addColorStop(0.55, '#24543e'); gr.addColorStop(1, '#173a2a'); g.fillStyle = gr; g.beginPath(); g.moveTo(bx - r, y0); g.quadraticCurveTo(bx, y0 + 2.5, bx + r, y0); g.lineTo(bx, y1); g.closePath(); g.fill(); }
        } else if (p.kind === 'rock') {
          blob(bx, by - R * 0.35, R * 0.75, '#8c8578'); g.fillStyle = 'rgba(80,140,70,0.6)'; g.beginPath(); g.ellipse(bx - R * 0.1, by - R * 0.85, R * 0.5, R * 0.18, 0, 0, TAU); g.fill();
        } else {
          const base = p.kind === 'grassClump' ? '#7ab65a' : '#2e7a48';
          if (p.kind === 'grassClump') { g.strokeStyle = base; g.lineWidth = 1.2; for (let k = 0; k < 12; k++) { const a = -Math.PI / 2 + (rnd(k) - 0.5) * 1.6; g.beginPath(); g.moveTo(bx + (rnd(k + 3) - 0.5) * R * 0.6, by); g.quadraticCurveTo(bx + Math.cos(a) * R * 0.3, by - H * 0.5, bx + Math.cos(a) * R * 0.6, by - H * (0.7 + rnd(k + 5) * 0.4)); g.stroke(); } }
          else { for (let k = 0; k < 4; k++) blob(bx + (rnd(k) - 0.5) * R * 0.7, by - H * 0.45 - rnd(k + 7) * H * 0.2, R * (0.45 + rnd(k + 13) * 0.2), base); if (p.kind === 'flowerShrub') for (let k = 0; k < 12; k++) { g.fillStyle = ['#f2d24b', '#c9a7ff', '#ef8fb0'][v % 3]; g.beginPath(); g.arc(bx + (rnd(k + 30) - 0.5) * R * 1.1, by - H * 0.35 - rnd(k + 50) * H * 0.5, 1.1, 0, TAU); g.fill(); } }
        }
      });
      s = { c, w, h, bx: w / 2, by: h - 4 }; sprites.set(key, s);
    }
    const { ctx, P } = d, [x, y] = P.at(p.x, p.z, 0, 0), sway = d.reduced || p.kind === 'rock' ? 0 : Math.sin(d.T * 0.9 + p.x * 0.01 + p.z * 0.013) * (p.kind === 'conifer' ? 0.015 : 0.03);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -sway, 1, 0, 0); ctx.drawImage(s.c, -s.bx, -s.by, s.w, s.h); ctx.restore();
    if (p.kind === 'rock' && p.seed > 0.6) { const [cx, cy] = P.at(p.x + 3, p.z, 0, 4); crystal(ctx, cx, cy, 2.6, '#c9a7ff', d.reduced ? 0 : d.T, p.x); }
  }
}
