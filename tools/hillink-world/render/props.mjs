// Furniture, fixtures and exterior pieces, each drawn from its own record (building.mjs) with the
// active skin's materials. Everything is vector drawing in plan space through the projection:
// no images. `d` is the draw context: { ctx, P, M, T (seconds), lw, room(id) -> activity, ... }.
import { SIZES } from '../world/scale.mjs';
const TAU = Math.PI * 2;
// Pass 2: every landmark a character meets (seat, surface, backrest, arm) comes from world/scale.mjs SIZES.
const S = SIZES;
export const INK = 'rgba(24,26,33,0.85)';

export const shade = (c, k) => {
  if (!c || c[0] !== '#') return c;
  const n = parseInt(c.slice(1, 7), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}

// A box on a floor: draws the three faces the camera sees (right side, top, front).
// c: a base colour, or { front, side, top }.
export function prism(d, f, { x0, x1, z0, z1, h0 = 0, h1 }, c, { outline = true, alpha = 1 } = {}) {
  const { ctx, P } = d, p = (x, z, h) => P.at(x, z, f, h);
  const col = typeof c === 'string' ? { front: c, side: shade(c, 0.78), top: shade(c, 1.14) } : c;
  const s = outline ? INK : null, lw = d.lw;
  ctx.save(); ctx.globalAlpha *= alpha;
  poly(ctx, [p(x1, z0, h0), p(x1, z1, h0), p(x1, z1, h1), p(x1, z0, h1)], col.side, s, lw);
  poly(ctx, [p(x0, z0, h1), p(x1, z0, h1), p(x1, z1, h1), p(x0, z1, h1)], col.top, s, lw);
  poly(ctx, [p(x0, z0, h0), p(x1, z0, h0), p(x1, z0, h1), p(x0, z0, h1)], col.front, s, lw);
  ctx.restore();
}
const box = (it, dx0 = 0, dx1 = 0, dz0 = 0, dz1 = 0) => ({ x0: it.x - it.w / 2 + dx0, x1: it.x + it.w / 2 + dx1, z0: it.z - it.d / 2 + dz0, z1: it.z + it.d / 2 + dz1 });
// A flat rectangle standing on a box's front face at height h (a screen, a door, a label).
function panel(d, f, x0, x1, z, h0, h1, fill, stroke) { const p = (x, h) => d.P.at(x, z, f, h); poly(d.ctx, [p(x0, h0), p(x1, h0), p(x1, h1), p(x0, h1)], fill, stroke, d.lw * 0.8); }
// A flat rectangle lying on a horizontal surface at height h.
function flat(d, f, x0, x1, z0, z1, h, fill, stroke) { const p = (x, z) => d.P.at(x, z, f, h); poly(d.ctx, [p(x0, z0), p(x1, z0), p(x1, z1), p(x0, z1)], fill, stroke, d.lw * 0.7); }
function blob(d, f, x, z, h, r, fill) { const [sx, sy] = d.P.at(x, z, f, h); d.ctx.beginPath(); d.ctx.arc(sx, sy, r, 0, TAU); d.ctx.fillStyle = fill; d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = d.lw; d.ctx.stroke(); }

// Code-like lines on a screen; `live` scrolls, otherwise a still idle frame.
function screenLines(d, f, x0, x1, z, h0, h1, live, seed = 0) {
  const { ctx, M, T } = d, rows = 5, rh = (h1 - h0) / (rows + 1);
  for (let i = 0; i < rows; i++) {
    const k = live ? Math.floor(T * 3 + seed) + i : i + seed;
    const w = (0.3 + ((Math.sin(k * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * 0.6) * (x1 - x0 - 4);
    const a = d.P.at(x0 + 2 + ((k % 3) * 2), z, f, h1 - rh * (i + 1)), b = d.P.at(x0 + 2 + ((k % 3) * 2) + w, z, f, h1 - rh * (i + 1));
    ctx.strokeStyle = live ? M.code[k % M.code.length] : 'rgba(160,190,230,0.35)'; ctx.lineWidth = Math.max(0.6, rh * 0.45);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}

export const PROPS = {
  rug(d, it) { const b = box(it); flat(d, it.floor, b.x0, b.x1, b.z0, b.z1, 0.3, d.M.fantasy ? '#7a3a48' : '#6f8fb0'); flat(d, it.floor, b.x0 + 5, b.x1 - 5, b.z0 + 4, b.z1 - 4, 0.4, d.M.torches ? '#9a5a4a' : '#88a7c4'); },
  mat(d, it) { const b = box(it); flat(d, it.floor, b.x0, b.x1, b.z0, b.z1, 0.3, '#3a3f47'); },
  couch(d, it) {
    const b = box(it), f = it.floor, c = d.M.fabric, k = S.couch, arm = 7;
    prism(d, f, { ...b, z0: b.z1 - k.back, h1: it.h }, shade(c, 0.92)); // backrest
    prism(d, f, { ...b, z1: b.z1 - k.back, h1: k.seat }, c); // cushions
    prism(d, f, { x0: b.x0, x1: b.x0 + arm, z0: b.z0, z1: b.z1, h1: k.arm }, shade(c, 0.95));
    prism(d, f, { x0: b.x1 - arm, x1: b.x1, z0: b.z0, z1: b.z1, h1: k.arm }, shade(c, 0.95));
    for (const [x, col] of [[b.x0 + arm + 6, d.M.accent], [b.x1 - arm - 6, d.M.fabric2]]) prism(d, f, { x0: x - 5, x1: x + 5, z0: b.z1 - k.back - 3, z1: b.z1 - k.back, h0: k.seat, h1: k.seat + 10 }, col);
  },
  sideTable(d, it) { const b = box(it), f = it.floor, top = S.sideTable.surface; prism(d, f, { ...b, h1: top }, d.M.woodLight); prism(d, f, { x0: it.x - 2, x1: it.x + 2, z0: it.z - 2, z1: it.z + 2, h0: top, h1: top + 10 }, d.M.metalDark); const [sx, sy] = d.P.at(it.x, it.z, f, top + 14); d.ctx.fillStyle = d.M.lamp; d.ctx.beginPath(); d.ctx.moveTo(sx - 7, sy + 5); d.ctx.lineTo(sx + 7, sy + 5); d.ctx.lineTo(sx + 4, sy - 4); d.ctx.lineTo(sx - 4, sy - 4); d.ctx.closePath(); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = d.lw; d.ctx.stroke(); glow(d, sx, sy + 2, 26, d.M.light); },
  armchair(d, it) { const b = box(it), f = it.floor, c = d.M.fabric2, k = S.armchair; prism(d, f, { ...b, z0: b.z1 - k.back, h1: it.h }, shade(c, 0.9)); prism(d, f, { ...b, z1: b.z1 - k.back, h1: k.seat }, c); prism(d, f, { x0: b.x0, x1: b.x0 + 6, z0: b.z0, z1: b.z1, h1: k.arm }, c); prism(d, f, { x0: b.x1 - 6, x1: b.x1, z0: b.z0, z1: b.z1, h1: k.arm }, c); },
  plant(d, it) {
    const f = it.floor, b = box(it, 2, -2, 2, -2);
    prism(d, f, { ...b, h1: 12 }, d.M.pot);
    const sway = Math.sin(d.T * 0.8 + it.x) * 1.2;
    for (const [dx, dz, h, r] of [[0, 0, it.h - 10, 9], [-5, 2, it.h - 18, 7], [5, -1, it.h - 20, 7], [sway, 0, it.h - 4, 6]]) blob(d, f, it.x + dx, it.z + dz, h, r, dx > 0 ? d.M.leafLight : d.M.leaf);
  },
  counter(d, it) {
    const b = box(it), f = it.floor;
    const top = S.counter.surface;
    prism(d, f, { ...b, h1: top - 3 }, d.M.wood);
    prism(d, f, { ...b, h0: top - 3, h1: top }, d.M.fantasy ? '#7d6a52' : '#e8e6e1');
    for (const x of [b.x0 + 12, b.x0 + 36, b.x0 + 58]) panel(d, f, x - 9, x + 9, b.z0, 4, top - 7, null, 'rgba(0,0,0,0.25)');
  },
  coffeeMachine(d, it) {
    const b = box(it), f = it.floor, base = S.counter.surface; // stands on the counter top
    prism(d, f, { ...b, h0: base, h1: base + it.h }, d.M.metalDark);
    panel(d, f, b.x0 + 3, b.x1 - 3, b.z0, base + 3, base + 8, '#20252d');
    const busy = d.pointBusy('lounge:coffeeMachine');
    if (busy) { const { ctx } = d; for (let i = 0; i < 3; i++) { const k = ((d.T * 0.6 + i / 3) % 1), [sx, sy] = d.P.at(it.x + Math.sin(k * 6 + i) * 2, b.z0, f, base + it.h + k * 18); ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx, sy, 2 + k * 3, 0, TAU); ctx.fill(); } }
    const [lx, ly] = d.P.at(b.x1 - 3, b.z0, f, base + it.h - 4); d.ctx.fillStyle = busy ? '#7ee787' : '#ff7a1a'; d.ctx.fillRect(lx - 1.2, ly - 1.2, 2.4, 2.4);
  },
  fridge(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: it.h }, d.M.fantasy ? '#7d6a52' : '#e9ecef'); panel(d, f, b.x0 + 2, b.x1 - 2, b.z0, it.h * 0.62, it.h * 0.64, INK); panel(d, f, b.x1 - 5, b.x1 - 3, b.z0, it.h * 0.4, it.h * 0.56, d.M.metalDark); },
  roundTable(d, it) {
    const { ctx, P } = d, f = it.floor, [cx, cy] = P.at(it.x, it.z, f, it.h), rx = it.w / 2 + it.d * 0.25, ry = it.d * 0.2 + 3;
    prism(d, f, { x0: it.x - 2, x1: it.x + 2, z0: it.z - 2, z1: it.z + 2, h1: it.h }, d.M.metalDark);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fillStyle = d.M.woodLight; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = d.lw; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, rx, ry, 0, 0, Math.PI); ctx.strokeStyle = shade(d.M.wood, 0.9); ctx.lineWidth = 3; ctx.stroke();
    if (d.meeting) { ctx.fillStyle = d.M.screenOn; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(d.T * 2); ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.6, ry * 0.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  },
  chair(d, it, part) { chairShape(d, it, d.M.wood, d.M.fabric2, false, part); },
  officeChair(d, it, part) { chairShape(d, it, d.M.metalDark, d.M.fantasy ? '#6b2f3a' : '#2f3a4a', true, part); },
  vending(d, it) {
    const b = box(it), f = it.floor;
    prism(d, f, { ...b, h1: it.h }, d.M.fantasy ? '#6b4226' : '#c0392b');
    // Its lit front faces right (toward the room).
    const p = (z, h) => d.P.at(b.x1, z, f, h);
    poly(d.ctx, [p(b.z0 + 3, it.h * 0.4), p(b.z1 - 3, it.h * 0.4), p(b.z1 - 3, it.h - 6), p(b.z0 + 3, it.h - 6)], d.M.fantasy ? '#ffcf6b' : '#ffe9b0', INK, d.lw * 0.7);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const q = p(b.z0 + 6 + c * 4.5, it.h - 12 - r * (it.h * 0.45 / 4)); d.ctx.fillStyle = d.M.code[(r + c) % 4]; d.ctx.fillRect(q[0] - 1.5, q[1] - 2, 3, 3); }
  },
  bench(d, it) { const b = box(it), f = it.floor, k = S[it.type] ?? S.bench; prism(d, f, { ...b, z0: b.z1 - k.back, h1: it.h }, d.M.woodLight); prism(d, f, { ...b, h0: k.seat - 3, h1: k.seat }, d.M.woodLight); for (const x of [b.x0 + 4, b.x1 - 6]) prism(d, f, { x0: x, x1: x + 2, z0: b.z0 + 1, z1: b.z0 + 3, h1: k.seat - 3 }, d.M.metalDark); },
  parkBench(d, it) { PROPS.bench(d, it); },
  reception(d, it) {
    const b = box(it), f = it.floor;
    const top = S.reception.surface;
    prism(d, f, { ...b, h1: top - 3 }, d.M.fantasy ? d.M.wood : '#f1f2f4');
    prism(d, f, { ...b, h0: top - 3, h1: top }, d.M.fantasy ? d.M.woodLight : '#2f3a4a');
    panel(d, f, b.x0 + 6, b.x1 - 6, b.z0, 8, top - 8, d.M.accent);
    const [sx, sy] = d.P.at(it.x + 10, it.z + 2, f, top + 1); d.ctx.fillStyle = '#1d2431'; d.ctx.fillRect(sx - 7, sy - 12, 14, 10); d.ctx.fillStyle = d.systemColor('platform'); d.ctx.fillRect(sx - 6, sy - 11, 12, 8);
  },
  desk(d, it) {
    const b = box(it), f = it.floor, active = d.stationActive(`development:${it.station}`), T = d.T, top = S.desk.surface;
    prism(d, f, { ...b, h0: top - 3, h1: top }, d.M.woodLight);
    for (const x of [b.x0 + 2, b.x1 - 4]) prism(d, f, { x0: x, x1: x + 2, z0: b.z0 + 2, z1: b.z1 - 2, h1: top - 3 }, d.M.metalDark);
    prism(d, f, { x0: b.x0 + 6, x1: b.x0 + 18, z0: b.z0 + 3, z1: b.z1 - 3, h1: top - 3 }, d.M.metal); // drawer unit
    // Keyboard at the front edge, a mug, and the monitor facing the chair (toward the camera).
    flat(d, f, it.x - 9, it.x + 9, b.z0 + 2, b.z0 + 6, top + 0.2, '#2a2f38');
    prism(d, f, { x0: b.x1 - 9, x1: b.x1 - 5, z0: b.z0 + 3, z1: b.z0 + 6, h0: top, h1: top + 5 }, '#e8e2d6', { outline: false });
    prism(d, f, { x0: it.x - 1.5, x1: it.x + 1.5, z0: it.z + 1, z1: it.z + 3, h0: top, h1: top + 5 }, d.M.metalDark, { outline: false });
    const mz = it.z + 1, m0 = top + 4, m1 = top + 20; // the screen sits at a seated agent's eye line
    prism(d, f, { x0: it.x - 13, x1: it.x + 13, z0: mz - 1, z1: mz + 1.5, h0: m0, h1: m1 }, '#1b1f27');
    panel(d, f, it.x - 11.5, it.x + 11.5, mz - 1, m0 + 1.5, m1 - 1.5, active ? d.M.screenOn : d.M.screenIdle);
    if (active) { screenLines(d, f, it.x - 11, it.x + 11, mz - 1, m0 + 2, m1 - 2, true, it.x); glow(d, ...d.P.at(it.x, mz - 2, f, (m0 + m1) / 2), 30, 'rgba(94,200,255,0.16)'); }
    else { const [sx, sy] = d.P.at(it.x + 9, mz - 1, f, m0 + 3); d.ctx.fillStyle = `rgba(126,231,135,${0.4 + 0.4 * Math.sin(T * 1.3 + it.x)})`; d.ctx.fillRect(sx, sy, 1.6, 1.6); }
  },
  serverRack(d, it) {
    const b = box(it), f = it.floor, st = d.systemState('database');
    prism(d, f, { ...b, h1: it.h }, '#2a2f38');
    // LEDs on the side facing the room (right face): blink with real database state.
    const rate = st === 'busy' ? 9 : st === 'down' ? 1.2 : 3, col = st === 'down' ? '#ff4d4d' : st === 'degraded' ? '#ffb020' : '#3ddc84';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) {
      const on = Math.sin(d.T * rate + r * 1.7 + c * 2.3) > (st === 'down' ? 0.6 : -0.2);
      const [sx, sy] = d.P.at(b.x1, b.z0 + 4 + c * 5, f, 8 + r * ((it.h - 14) / 9));
      d.ctx.fillStyle = on ? col : 'rgba(255,255,255,0.12)'; d.ctx.fillRect(sx - 1, sy - 1, 2.2, 2);
    }
  },
  bookshelf(d, it) {
    const b = box(it), f = it.floor;
    prism(d, f, { ...b, h1: it.h }, d.M.wood);
    const colors = ['#b5452b', '#2f6fb5', '#e0b04a', '#3f8f4f', '#7d4fb5', '#d98a3a'];
    const done = d.archived ?? 0;
    for (let shelfI = 0; shelfI < 4; shelfI++) {
      const h0 = 4 + shelfI * ((it.h - 6) / 4);
      panel(d, f, b.x0 + 2, b.x1 - 2, b.z0, h0 - 1, h0, shade(d.M.wood, 0.7));
      // The top shelf holds finished work: one folder per archived task (up to 10), real counts only.
      const n = shelfI === 3 ? Math.min(10, done) : 7;
      for (let i = 0; i < n; i++) { const x = b.x0 + 3 + i * 2.7; panel(d, f, x, x + 2.2, b.z0, h0, h0 + (shelfI === 3 ? 9 : 8 + (i * 7 % 4)), shelfI === 3 ? '#f2d47a' : colors[(i + shelfI * 2) % colors.length], null); }
    }
  },
  reviewConsole(d, it) {
    const b = box(it), f = it.floor, T = d.T, busy = d.stationActive('development:review') || d.stationActive('development:review2') || d.stationActive('development:rig');
    const top = S.reviewConsole.surface, scr = top + 32; // a standing reviewer's eye line
    prism(d, f, { ...b, h1: top - 3 }, d.M.fantasy ? d.M.wood : '#3a4452');
    prism(d, f, { ...b, h0: top - 3, h1: top }, d.M.fantasy ? d.M.woodLight : '#56657a');
    // Tall review screen at the back of the console, and the review tray on top.
    prism(d, f, { x0: b.x0 + 4, x1: b.x1 - 4, z0: b.z1 - 3, z1: b.z1 - 1, h0: top, h1: scr }, '#1b1f27');
    panel(d, f, b.x0 + 6, b.x1 - 6, b.z1 - 3, top + 2, scr - 2, busy ? d.M.screenOn : d.M.screenIdle);
    const tests = d.lastTests;
    if (tests) {
      const ok = tests.state === 'passed', run = tests.state === 'running';
      panel(d, f, b.x0 + 8, b.x1 - 8, b.z1 - 3.1, scr - 10, scr - 4, run ? '#ffb020' : ok ? '#3ddc84' : '#ff4d4d');
      if (run) { const k = (T * 0.7) % 1; panel(d, f, b.x0 + 8 + k * (it.w - 20), b.x0 + 12 + k * (it.w - 20), b.z1 - 3.2, scr - 10, scr - 4, 'rgba(255,255,255,0.6)'); }
    }
    if (busy) screenLines(d, f, b.x0 + 8, b.x1 - 8, b.z1 - 3.1, top + 4, scr - 12, true, 7);
    // Review tray: one folder per open pull request (the handoff artifact).
    const prs = d.openPrs ?? [];
    prs.slice(0, 4).forEach((pr, i) => {
      const x = b.x0 + 3 + i * 13, z = b.z0 + 4;
      const col = pr.state === 'reviewed' ? (pr.verdict === 'changes' ? '#ff9f43' : '#3ddc84') : '#f2d47a';
      prism(d, f, { x0: x, x1: x + 11, z0: z, z1: z + 7, h0: top, h1: top + 3 }, col);
      if (pr.state !== 'reviewed') { const [sx, sy] = d.P.at(x + 4.5, z + 3, f, top + 5); glow(d, sx, sy, 10, `rgba(255,220,120,${0.25 + 0.15 * Math.sin(T * 3)})`); }
      else { const [sx, sy] = d.P.at(x + 4.5, z + 3, f, top + 5); d.ctx.strokeStyle = '#1f7a3f'; d.ctx.lineWidth = 1.4; d.ctx.beginPath(); d.ctx.moveTo(sx - 2.5, sy); d.ctx.lineTo(sx - 0.5, sy + 2); d.ctx.lineTo(sx + 3, sy - 2.5); d.ctx.stroke(); }
    });
  },
  waterCooler(d, it) { const b = box(it, 1, -1, 1, -1), f = it.floor; prism(d, f, { ...b, h1: it.h - 12 }, '#e9ecef'); const [sx, sy] = d.P.at(it.x, it.z, f, it.h - 5); d.ctx.fillStyle = 'rgba(120,190,255,0.75)'; d.ctx.beginPath(); d.ctx.ellipse(sx, sy, 6, 9, 0, 0, TAU); d.ctx.fill(); d.ctx.strokeStyle = INK; d.ctx.lineWidth = d.lw; d.ctx.stroke(); },
  roofSign(d, it) {
    const { ctx, P } = d, f = it.floor, b = box(it);
    for (const x of [b.x0 + 20, b.x1 - 20]) prism(d, f, { x0: x, x1: x + 3, z0: b.z0, z1: b.z1, h1: 14 }, d.M.metalDark);
    prism(d, f, { ...b, h0: 14, h1: it.h }, d.M.fantasy ? '#3a2a1c' : '#1e2633');
    const [sx, sy] = P.at(it.x, b.z0, f, (14 + it.h) / 2);
    ctx.save(); ctx.font = `800 ${it.h * 0.52}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = d.M.signGlow; ctx.shadowBlur = 14; ctx.fillStyle = d.M.sign; ctx.fillText('HILLINK', sx, sy + 1);
    ctx.restore();
  },
  acUnit(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: it.h }, d.M.metal); const [sx, sy] = d.P.at(it.x, it.z, f, it.h); const a = d.T * 5; d.ctx.strokeStyle = INK; d.ctx.lineWidth = 1; d.ctx.beginPath(); d.ctx.ellipse(sx, sy, 8, 3.2, 0, 0, TAU); d.ctx.stroke(); d.ctx.beginPath(); d.ctx.moveTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 3); d.ctx.lineTo(sx - Math.cos(a) * 8, sy - Math.sin(a) * 3); d.ctx.stroke(); },
  liftMotor(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: it.h }, d.M.exteriorDark); prism(d, f, { x0: it.x - 8, x1: it.x + 8, z0: it.z - 8, z1: it.z + 8, h0: it.h, h1: it.h + 6 }, d.M.metalDark); },
  scaffold(d, it) {
    // The next floor under construction. It works (hoist, sparks) only while builds, deploys or active tasks are real.
    const { ctx, P } = d, f = it.floor, b = box(it), active = d.construction;
    ctx.save(); ctx.strokeStyle = d.M.fantasy ? '#8a6a44' : '#c9a227'; ctx.lineWidth = 2;
    for (const x of [b.x0, (b.x0 + b.x1) / 2, b.x1]) for (const z of [b.z0 + 4, b.z1 - 4]) { const a = P.at(x, z, f, 0), c = P.at(x, z, f, it.h); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke(); }
    for (const h of [34, 68, it.h]) for (const z of [b.z0 + 4, b.z1 - 4]) { const a = P.at(b.x0, z, f, h), c = P.at(b.x1, z, f, h); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke(); }
    ctx.lineWidth = 1.2; for (const z of [b.z1 - 4, b.z0 + 4]) { const a = P.at(b.x0, z, f, 0), c = P.at((b.x0 + b.x1) / 2, z, f, 68); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke(); }
    ctx.restore();
    flat(d, f, b.x0, b.x1, b.z0 + 4, b.z1 - 4, 34, 'rgba(160,130,90,0.45)');
    prism(d, f, { x0: b.x0 + 16, x1: b.x0 + 60, z0: b.z0 + 12, z1: b.z0 + 30, h1: 10 }, d.M.fantasy ? '#8a6a44' : '#b98a5e'); // a stack of materials
    if (active) for (let i = 0; i < 5; i++) { const k = (d.T * 1.7 + i * 0.37) % 1, [sx, sy] = P.at(b.x0 + 90 + i * 9, b.z0 + 30, f, 34 + k * 8); ctx.fillStyle = `rgba(255,${190 + i * 10},90,${1 - k})`; ctx.fillRect(sx + Math.sin(i * 7 + k * 9) * 5, sy, 1.6, 1.6); }
  },
  crane(d, it) {
    const { ctx, P } = d, f = it.floor, active = d.construction, col = d.M.fantasy ? '#8a6a44' : '#f0a21e';
    const [bx, by] = P.at(it.x, it.z, f, 0), [tx, ty] = P.at(it.x, it.z, f, it.h);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.lineWidth = 1; for (let h = 10; h < it.h; h += 14) { const [ax, ay] = P.at(it.x - 3, it.z, f, h), [cx, cy] = P.at(it.x + 3, it.z, f, h + 14); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke(); }
    // The jib slews slowly while there is real building work, and rests otherwise.
    const ang = active ? Math.sin(d.T * 0.18) * 0.9 : 0.5, len = 120;
    const jx = it.x - Math.cos(ang) * len, jz = it.z + Math.sin(ang) * len * 0.6, cxz = [it.x + Math.cos(ang) * 30, it.z - Math.sin(ang) * 18];
    const [jsx, jsy] = P.at(jx, jz, f, it.h), [csx, csy] = P.at(cxz[0], cxz[1], f, it.h);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(csx, csy); ctx.lineTo(jsx, jsy); ctx.stroke();
    prism(d, f, { x0: cxz[0] - 5, x1: cxz[0] + 5, z0: cxz[1] - 4, z1: cxz[1] + 4, h0: it.h - 8, h1: it.h + 2 }, d.M.metalDark);
    const drop = active ? 50 + Math.sin(d.T * 0.5) * 30 : 40, hook = P.at(it.x - Math.cos(ang) * len * 0.7, it.z + Math.sin(ang) * len * 0.42, f, it.h), hy = hook[1] + drop;
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hook[0], hook[1]); ctx.lineTo(hook[0], hy); ctx.stroke();
    ctx.fillStyle = active ? '#d9a55b' : INK; ctx.fillRect(hook[0] - (active ? 6 : 2), hy, active ? 12 : 4, active ? 8 : 4);
    const blink = Math.sin(d.T * 4) > 0.3; ctx.fillStyle = blink ? '#ff3b30' : '#5a1510'; ctx.beginPath(); ctx.arc(tx, ty - 3, 2.2, 0, TAU); ctx.fill();
  },
  tree(d, it) {
    const f = it.floor, sway = Math.sin(d.T * 0.7 + it.x) * 1.5;
    prism(d, f, { x0: it.x - 3, x1: it.x + 3, z0: it.z - 3, z1: it.z + 3, h1: it.h * 0.45 }, '#6b4a2f');
    for (const [dx, dz, h, r, c] of [[0, 2, it.h * 0.55, 20, d.M.leaf], [-12, 0, it.h * 0.62, 15, d.M.leaf], [12, -2, it.h * 0.64, 15, d.M.leafLight], [sway, 0, it.h * 0.82, 17, d.M.leafLight], [-6 + sway, 4, it.h * 0.95, 11, d.M.leaf]]) blob(d, f, it.x + dx, it.z + dz, h, r, c);
  },
  hedge(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: it.h }, d.M.leaf); },
  planter(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: 10 }, d.M.exteriorDark); for (let i = 0; i < 4; i++) blob(d, f, b.x0 + 6 + i * 9, it.z, 14, 5, i % 2 ? d.M.leafLight : '#e76f51'); },
  lamp(d, it) {
    const f = it.floor, [bx, by] = d.P.at(it.x, it.z, f, 0), [tx, ty] = d.P.at(it.x, it.z, f, it.h);
    d.ctx.strokeStyle = d.M.metalDark; d.ctx.lineWidth = 2.2; d.ctx.beginPath(); d.ctx.moveTo(bx, by); d.ctx.lineTo(tx, ty); d.ctx.stroke();
    if (d.M.torches) { const fl = 1 + Math.sin(d.T * 11 + it.x) * 0.15; d.ctx.fillStyle = '#ff9f1c'; d.ctx.beginPath(); d.ctx.ellipse(tx, ty - 4, 3 * fl, 6 * fl, 0, 0, TAU); d.ctx.fill(); glow(d, tx, ty - 4, 34, 'rgba(255,170,60,0.28)'); }
    else { d.ctx.fillStyle = d.M.lamp; d.ctx.beginPath(); d.ctx.arc(tx, ty, 3.5, 0, TAU); d.ctx.fill(); glow(d, tx, ty, 36, 'rgba(255,230,160,0.22)'); }
  },
  monument(d, it) { const b = box(it), f = it.floor; prism(d, f, { ...b, h1: it.h }, d.M.exteriorDark); const [sx, sy] = d.P.at(it.x, b.z0, f, it.h * 0.55); d.ctx.save(); d.ctx.font = '700 7px system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.fillStyle = d.M.sign; d.ctx.fillText('HILLINK HQ', sx, sy); d.ctx.restore(); },
  bikeRack(d, it) { const f = it.floor; for (let i = 0; i < 3; i++) { const [sx, sy] = d.P.at(it.x - 12 + i * 12, it.z, f, 7); d.ctx.strokeStyle = d.M.metalDark; d.ctx.lineWidth = 1.2; d.ctx.beginPath(); d.ctx.arc(sx, sy, 6, Math.PI, TAU); d.ctx.stroke(); } },
};

// Pass 2: the seat is exactly where the anchor puts the sitter's hips: centred on the chair, at the
// type's seat height (the same height render/figure.mjs bends at). Only the backrest is off-centre.
// part: 'all', or 'seat' / 'back' when the depth sort draws them as two pieces (a sitter sits between them).
export function chairShape(d, it, frame, seat, swivel = false, part = 'all') {
  const f = it.floor, s = Math.min(it.w, it.d), k = S[it.type] ?? S.chair, sh = k.seat;
  const cx = it.x, cz = it.z;
  if (part === 'back') { prism(d, f, { ...chairBack(it), h0: sh, h1: it.h }, seat); return; }
  if (swivel) prism(d, f, { x0: cx - 1, x1: cx + 1, z0: cz - 1, z1: cz + 1, h1: sh - 3 }, frame, { outline: false });
  else for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ox = dx * (s / 2 - 1.5), oz = dz * (s / 2 - 1.5); prism(d, f, { x0: cx + ox - 0.7, x1: cx + ox + 0.7, z0: cz + oz - 0.7, z1: cz + oz + 0.7, h1: sh - 3 }, frame, { outline: false }); }
  prism(d, f, { x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2, h0: sh - 3, h1: sh }, seat);
  if (part === 'all') prism(d, f, { ...chairBack(it), h0: sh, h1: it.h }, seat);
}
// The backrest's footprint: the edge behind the sitter (used for drawing and for depth).
export function chairBack(it) {
  const s = Math.min(it.w, it.d), cx = it.x, cz = it.z, t = 2.5, dir = it.facing;
  return dir === 'right' ? { x0: cx - s / 2, x1: cx - s / 2 + t, z0: cz - s / 2, z1: cz + s / 2 } : dir === 'left' ? { x0: cx + s / 2 - t, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2 }
    : dir === 'front' ? { x0: cx - s / 2, x1: cx + s / 2, z0: cz + s / 2 - t, z1: cz + s / 2 } : { x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz - s / 2 + t };
}

export function glow(d, x, y, r, color) {
  const g = d.ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  d.ctx.fillStyle = g; d.ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Wall-mounted pieces on a room's back wall (z = depth).
export const DECOR = {
  window(d, w) {
    const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h);
    const [s0, s1] = d.M.sky; const g = d.ctx.createLinearGradient(0, p(0, w.h1)[1], 0, p(0, w.h0)[1]); g.addColorStop(0, s0); g.addColorStop(1, s1);
    poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], g, INK, d.lw);
    for (let i = 0; i < 5; i++) { const x = w.x0 + 4 + i * (w.x1 - w.x0 - 8) / 5, hh = 10 + ((i * 37) % 17); poly(d.ctx, [p(x, w.h0), p(x + (w.x1 - w.x0) / 6, w.h0), p(x + (w.x1 - w.x0) / 6, w.h0 + hh), p(x, w.h0 + hh)], d.M.skyline); }
    const [a] = p(w.x0, 0), [b] = p(w.x1, 0), [, y0] = p(0, w.h0), [, y1] = p(0, w.h1);
    d.ctx.strokeStyle = d.M.frame; d.ctx.lineWidth = 2; d.ctx.beginPath(); d.ctx.moveTo((a + b) / 2, y0); d.ctx.lineTo((a + b) / 2, y1); d.ctx.moveTo(a, (y0 + y1) / 2); d.ctx.lineTo(b, (y0 + y1) / 2); d.ctx.stroke();
  },
  poster(d, w) { const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h); poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], d.M.fantasy ? '#7a2f3a' : '#1f2f5a', INK, d.lw); const [sx, sy] = p((w.x0 + w.x1) / 2, (w.h0 + w.h1) / 2); d.ctx.save(); d.ctx.font = '800 8px system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle'; d.ctx.fillStyle = d.M.fantasy ? '#ffcf6b' : '#ffffff'; d.ctx.fillText(w.text ?? '', sx, sy); d.ctx.restore(); },
  logo(d, w) { const f = w.floor, z = d.P.g.depth - 0.2, [sx, sy] = d.P.at((w.x0 + w.x1) / 2, z, f, (w.h0 + w.h1) / 2); d.ctx.save(); d.ctx.font = '800 11px system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle'; d.ctx.fillStyle = d.M.fantasy ? 'rgba(255,207,107,0.8)' : 'rgba(40,60,90,0.55)'; d.ctx.fillText('ENGINEERING', sx, sy); d.ctx.restore(); },
  clock(d, w) { const f = w.floor, z = d.P.g.depth - 0.2, [sx, sy] = d.P.at((w.x0 + w.x1) / 2, z, f, (w.h0 + w.h1) / 2), r = (w.x1 - w.x0) / 2; const { ctx } = d; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fillStyle = '#fbfaf7'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = d.lw; ctx.stroke(); const now = new Date(d.clock), m = now.getMinutes() / 60 * TAU, hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * TAU; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(hr) * r * 0.5, sy - Math.cos(hr) * r * 0.5); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(m) * r * 0.8, sy - Math.cos(m) * r * 0.8); ctx.stroke(); },
  taskBoard(d, w) {
    const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h);
    poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], d.M.fantasy ? '#6b4a2f' : '#c9a77a', INK, d.lw);
    const [hx, hy] = p((w.x0 + w.x1) / 2, w.h1 - 5); d.ctx.save(); d.ctx.font = '700 6px system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.fillStyle = '#2a1d12'; d.ctx.fillText('TASK BOARD', hx, hy + 2); d.ctx.restore();
    // One card per real queued or blocked task.
    const q = d.queued ?? [], cols = 6;
    q.slice(0, 24).forEach((t, i) => { const x = w.x0 + 5 + (i % cols) * 13, h = w.h1 - 14 - Math.floor(i / cols) * 11; poly(d.ctx, [p(x, h - 8), p(x + 10, h - 8), p(x + 10, h), p(x, h)], t.status === 'blocked' ? '#ffb4a8' : '#fff4c2', 'rgba(0,0,0,0.35)', 0.6); });
    if (q.length > 24) { const [sx, sy] = p(w.x1 - 8, w.h0 + 4); d.ctx.fillStyle = '#2a1d12'; d.ctx.font = '700 6px system-ui'; d.ctx.fillText(`+${q.length - 24}`, sx - 6, sy); }
  },
  statusScreen(d, w) {
    const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h);
    poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], '#10151f', INK, d.lw);
    const [sx, sy] = p((w.x0 + w.x1) / 2, (w.h0 + w.h1) / 2);
    d.ctx.save(); d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle';
    d.ctx.font = '700 5.5px system-ui, sans-serif'; d.ctx.fillStyle = d.modeColor; d.ctx.fillText(d.modeLabel, sx, sy - 7);
    d.ctx.font = '800 9px system-ui, sans-serif'; d.ctx.fillStyle = '#e6f1ff'; d.ctx.fillText(`${d.counts.working}/${d.counts.total}`, sx, sy + 2);
    d.ctx.font = '600 4.5px system-ui, sans-serif'; d.ctx.fillStyle = '#9fb3c8'; d.ctx.fillText('WORKING', sx, sy + 9);
    d.ctx.restore();
  },
  codeWall(d, w) {
    const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h), on = d.room('development');
    poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], '#10151f', INK, d.lw);
    poly(d.ctx, [p(w.x0 + 2, w.h0 + 2), p(w.x1 - 2, w.h0 + 2), p(w.x1 - 2, w.h1 - 2), p(w.x0 + 2, w.h1 - 2)], on ? '#0f2640' : '#151c28');
    if (on) { screenLines(d, f, w.x0 + 4, (w.x0 + w.x1) / 2 - 2, z, w.h0 + 4, w.h1 - 4, true, 3); screenLines(d, f, (w.x0 + w.x1) / 2 + 2, w.x1 - 4, z, w.h0 + 4, w.h1 - 4, true, 11); glow(d, ...p((w.x0 + w.x1) / 2, (w.h0 + w.h1) / 2), 60, 'rgba(94,200,255,0.12)'); }
    else { const [sx, sy] = p((w.x0 + w.x1) / 2, (w.h0 + w.h1) / 2); d.ctx.save(); d.ctx.font = '700 6px system-ui'; d.ctx.textAlign = 'center'; d.ctx.fillStyle = 'rgba(160,190,230,0.35)'; d.ctx.fillText('HILLINK', sx, sy); d.ctx.restore(); }
  },
  whiteboard(d, w) { const f = w.floor, z = d.P.g.depth - 0.2, p = (x, h) => d.P.at(x, z, f, h); poly(d.ctx, [p(w.x0, w.h0), p(w.x1, w.h0), p(w.x1, w.h1), p(w.x0, w.h1)], d.M.fantasy ? '#e9dcb8' : '#f7f8fa', INK, d.lw); d.ctx.strokeStyle = 'rgba(47,111,237,0.6)'; d.ctx.lineWidth = 0.9; for (let i = 0; i < 4; i++) { const a = p(w.x0 + 6, w.h1 - 10 - i * 10), b = p(w.x0 + 20 + (i * 17) % 40, w.h1 - 10 - i * 10); d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...b); d.ctx.stroke(); } },
};
