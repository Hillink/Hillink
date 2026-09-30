// The object-built World renderer (a skin for render/canvas2d.mjs). It draws the building from its
// definition (rooms, walls, floors, furniture, elevator, street) and the live characters, in depth
// order, with the active skin's materials. No image is loaded; every pixel comes from scene objects.
// Skins: 'real' (Realistic), 'fantasy' (Fantasy): same simulation, different materials and looks.
// 'blueprint' is the debug view: rooms, nav graph, interaction points, ids, states and paths.
import { depthSort, boxBounds } from '../engine/iso.mjs';
import { AGENT, ARCH, STREET_SCALE } from '../world/scale.mjs';
import { drawFigure } from './figure.mjs';
import { PROPS, chairBack, DECOR, prism, poly, glow, shade, INK } from './props.mjs';
import { MATERIALS, lookFor } from './looks.mjs';
import { vehiclesAt, hash } from '../engine/ambience.mjs';
import { PRODUCTIVE_STATES, actionText } from '../engine/iso-view.mjs';
import { jobOf } from '../core/job.mjs';
import { drawSite, siteBox } from './construction.mjs';

const TAU = Math.PI * 2;
const LABEL_PX = 11; // on-screen size of agent name labels
const STATUS = { coding: '#34d27b', thinking: '#34d27b', researching: '#34d27b', testing: '#34d27b', reviewing: '#34d27b', communicating: '#34d27b', waiting: '#f4a23b', idle: '#8aa0b8', completed: '#5cc98a', error: '#ef4b4b', offline: '#59616d' };
const SYSTEM_COLOR = { ok: '#3ddc84', busy: '#4aa3ff', degraded: '#ffb020', down: '#ff4d4d', unknown: '#7c8594' };
const font = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, sans-serif`;
import { PRODUCTIVE_ACTIVITIES as WORKING } from '../core/truth.mjs';
// Status dot: green only while the body is actually doing the work; blue while on the way to it.
function dotColor(e, a) {
  if (PRODUCTIVE_STATES.has(e.anim?.state)) return STATUS.coding;
  if (WORKING.has(a.activity)) return e.moving || e.ride ? '#4aa3ff' : STATUS.idle;
  return STATUS[a.activity] ?? STATUS.idle;
}
// The label's second line: what the body is doing, then the job's stage ("Walking to Engineering · Implementing").
export function statusLine(e, world, layout) {
  const job = jobOf(world, e.agent), action = actionText(e, layout);
  return job?.stage ? `${action} · ${job.stage}` : action;
}

function text(ctx, str, x, y, px, color, { align = 'center', weight = 600 } = {}) { ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y); }
function pill(ctx, x, y, lines, { dot, px = 9, pad = 5, bg = '#0b1018e6', border = '#ffffff22' } = {}) {
  const widths = lines.map((l, i) => { ctx.font = font(i ? px - 1.5 : px, i ? 500 : 700); return ctx.measureText(l).width; });
  const w = Math.max(...widths) + pad * 2 + (dot ? 9 : 0), h = lines.length * (px + 3) + pad;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w, h, 5); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = border; ctx.stroke();
  const left = x - w / 2 + pad + (dot ? 9 : 0);
  if (dot) { ctx.beginPath(); ctx.arc(x - w / 2 + pad + 3, y + pad / 2 + (px + 3) / 2, 3, 0, TAU); ctx.fillStyle = dot; ctx.fill(); }
  lines.forEach((l, i) => text(ctx, l, left, y + pad / 2 + (px + 3) * (i + 0.5), i ? px - 1.5 : px, i ? '#b9c3d1' : '#f3f6fa', { align: 'left', weight: i ? 500 : 700 }));
  return { w, h };
}

// Where a label goes: its own spot, or stepped up above labels already placed this frame (never hidden).
export function placeLabel(claim, x, base, w, h, force = false, gap = 2) {
  for (let i = 0; i < 4; i++) {
    const ly = base - i * (h + gap);
    if (claim(x, ly + h / 2, w, h, force || i === 3)) return ly;
  }
  return base;
}

const PEDESTRIANS = [
  { shirt: '#8a6f9e', pants: '#262c36', hair: '#2b211b' }, { shirt: '#6f7f99', pants: '#2c3340', hair: '#c9a36b', hat: 'cap', hatColor: '#a0525e' },
  { shirt: '#7b8a6a', pants: '#2c3340', hair: '#16110d' }, { shirt: '#a0525e', pants: '#2b2f38', hair: '#5a3b24' },
];

export function createIsoSkin(layout, skinId = 'real') {
  const debug = skinId === 'blueprint';
  const M = MATERIALS[debug ? 'real' : skinId], B = MATERIALS.blueprint;
  const { P, def } = layout, g = P.g, D = g.depth, HT = g.height;
  const E = def.ELEVATOR;
  const floorsWithRooms = [...new Set(def.ROOMS.map(r => r.floor))].sort();
  const liftStops = layout.lifts[E.id];
  const stopOf = f => P.at(E.car.x, E.car.z, f)[1]; // where the car floor sits when it stops at floor f

  // Static drawables per floor: furniture and walls (characters and the elevator are added per frame).
  const staticItems = {};
  const add = (f, item) => (staticItems[f] ||= []).push(item);
  for (const it of def.FURNITURE) {
    if (it.type === 'rug' || it.type === 'mat') continue; // flat on the floor: drawn with the floor
    const b = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 };
    if (it.on) { const base = def.FURNITURE.find(o => o.id === it.on); b.z0 = base.z - base.d / 2 + 0.2; b.z1 = base.z + base.d / 2; b.bias = 1; }
    const h = it.type === 'crane' ? it.h + 20 : it.h + 30;
    // A chair is two depth pieces, seat and backrest, so a sitter lands between them: a desk chair's
    // backrest (toward the camera) covers the sitter's back; a chair facing the camera stays behind them.
    if (it.type === 'chair' || it.type === 'officeChair') {
      const back = chairBack(it);
      add(it.floor, { ...b, sb: boxBounds(P, { ...b, h1: h }, it.floor), kind: 'furniture', it, draw: d => PROPS[it.type](d, it, 'seat') });
      add(it.floor, { ...back, sb: boxBounds(P, { ...back, h1: h }, it.floor), kind: 'furniture', it, draw: d => PROPS[it.type](d, it, 'back') });
      continue;
    }
    add(it.floor, { ...b, sb: boxBounds(P, { ...b, h1: h }, it.floor), kind: 'furniture', it, draw: d => PROPS[it.type]?.(d, it) });
  }
  for (const w of def.WALLS) {
    if (w.door) {
      add(w.floor, { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.door[0], sb: boxBounds(P, { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.door[0], h1: HT }, w.floor), kind: 'wall', draw: d => wall(d, w, w.z0, w.door[0], 0) });
      add(w.floor, { x0: w.x0, x1: w.x1, z0: w.door[1], z1: w.z1, sb: boxBounds(P, { x0: w.x0, x1: w.x1, z0: w.door[1], z1: w.z1, h1: HT }, w.floor), kind: 'wall', draw: d => wall(d, w, w.door[1], w.z1, 0) });
      add(w.floor, { x0: w.x0, x1: w.x1, z0: w.door[0], z1: w.door[1], bias: -1, sb: boxBounds(P, { x0: w.x0, x1: w.x1, z0: w.door[0], z1: w.door[1], h0: w.doorH, h1: HT }, w.floor), kind: 'lintel', draw: d => wall(d, w, w.door[0], w.door[1], w.doorH) });
    } else add(w.floor, { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, sb: boxBounds(P, { ...w, h1: HT }, w.floor), kind: 'wall', draw: d => wall(d, w, w.z0, w.z1, 0) });
  }
  // Roof parapet (front) sits in front of everything up there.
  add(2, { x0: -8, x1: 668, z0: -2, z1: 2, sb: boxBounds(P, { x0: -8, x1: 668, z0: -2, z1: 2, h1: 12 }, 2), kind: 'wall', draw: d => prism(d, 2, { x0: -8, x1: 668, z0: -2, z1: 2, h1: 10 }, M.parapet) });

  // A partition is a low solid wainscot with glass above; the facade is glass with a frame.
  function wall(d, w, z0, z1, h0) {
    const glassy = w.kind === 'facade' || w.kind === 'partition';
    const low = w.kind === 'partition' ? ARCH.partitionWainscot : 6;
    if (h0 > 0) { prism(d, w.floor, { x0: w.x0, x1: w.x1, z0, z1, h0, h1: HT }, glassy ? M.partitionLow : M.wallSide); return; }
    prism(d, w.floor, { x0: w.x0, x1: w.x1, z0, z1, h1: low }, w.kind === 'facade' ? M.facadeFrame : M.partitionLow);
    const p = (x, z, h) => P.at(x, z, w.floor, h);
    poly(d.ctx, [p(w.x1, z0, low), p(w.x1, z1, low), p(w.x1, z1, HT), p(w.x1, z0, HT)], w.kind === 'facade' ? M.facade : M.glass, M.glassEdge, 0.8);
    // The cut end of a glass wall: glass with a slim post, so nobody vanishes behind it.
    poly(d.ctx, [p(w.x0, z0, low), p(w.x1, z0, low), p(w.x1, z0, HT), p(w.x0, z0, HT)], w.kind === 'facade' ? M.facade : M.glass, M.glassEdge, 0.8);
    poly(d.ctx, [p(w.x1 - 3, z0, low), p(w.x1, z0, low), p(w.x1, z0, HT), p(w.x1 - 3, z0, HT)], M.frame, INK, d.lw * 0.5);
    d.ctx.strokeStyle = M.frame; d.ctx.lineWidth = 1.2;
    for (let z = z0; z <= z1 + 0.1; z += Math.max(12, (z1 - z0) / Math.max(1, Math.round((z1 - z0) / 26)))) { const a = p(w.x1, z, low), b = p(w.x1, z, HT); d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...b); d.ctx.stroke(); }
    const a = p(w.x1, z0, HT - 1), b = p(w.x1, z1, HT - 1); d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...b); d.ctx.stroke();
    // Reflection streak.
    const r0 = p(w.x1, z0 + (z1 - z0) * 0.2, HT * 0.9), r1 = p(w.x1, z0 + (z1 - z0) * 0.5, low + 6);
    d.ctx.strokeStyle = 'rgba(255,255,255,0.12)'; d.ctx.lineWidth = 4; d.ctx.beginPath(); d.ctx.moveTo(...r0); d.ctx.lineTo(...r1); d.ctx.stroke();
  }

  // ---- Static shell (pass A): sky-side ground, street, back walls, floors, slabs, roof. ----
  function drawGround(d) {
    const { ctx } = d;
    const b = layout.bounds, horizon = P.at(0, 900, 0)[1];
    // Distant skyline and the ground receding to it.
    ctx.fillStyle = M.skyline;
    for (let i = 0; i < 26; i++) {
      const x = b.x - 60 + i * 52 + hash(i) * 20, w = 30 + hash(i + 3) * 30, h = 40 + hash(i + 7) * 110;
      ctx.fillRect(x, horizon - h, w, h + 2);
      if (!d.reduced) for (let k = 0; k < 6; k++) if (hash(i * 13 + k) > 0.45) { ctx.fillStyle = M.skylineLit; ctx.globalAlpha = 0.35 + 0.3 * hash(i + k * 5); ctx.fillRect(x + 4 + (k % 3) * 8, horizon - h + 8 + Math.floor(k / 3) * 12, 3, 4); ctx.globalAlpha = 1; ctx.fillStyle = M.skyline; }
    }
    const gr = ctx.createLinearGradient(0, horizon, 0, P.at(0, 0, 0)[1]); gr.addColorStop(0, shade(M.ground, 0.7)); gr.addColorStop(1, M.ground);
    poly(ctx, [P.at(-3000, 900, 0), P.at(3000, 900, 0), P.at(3000, -900, 0), P.at(-3000, -900, 0)], gr);
    // Plaza paving outside the entrance.
    poly(ctx, [P.at(668, 0, 0), P.at(990, 0, 0), P.at(990, 100, 0), P.at(668, 100, 0)], M.pavement);
    ctx.strokeStyle = M.pavementEdge; ctx.lineWidth = 0.6;
    for (let x = 680; x < 990; x += 22) { ctx.beginPath(); ctx.moveTo(...P.at(x, 0, 0)); ctx.lineTo(...P.at(x, 100, 0)); ctx.stroke(); }
    for (let z = 0; z <= 100; z += 20) { ctx.beginPath(); ctx.moveTo(...P.at(668, z, 0)); ctx.lineTo(...P.at(990, z, 0)); ctx.stroke(); }
    // Pavement and road in front of the building.
    const S = def.STREET;
    poly(ctx, [P.at(S.road.x0, S.pavement.z0, 0), P.at(S.road.x1, S.pavement.z0, 0), P.at(S.road.x1, S.pavement.z1, 0), P.at(S.road.x0, S.pavement.z1, 0)], M.pavement);
    poly(ctx, [P.at(S.road.x0, S.pavement.z0, 0), P.at(S.road.x1, S.pavement.z0, 0), P.at(S.road.x1, S.pavement.z0 - 2, 0), P.at(S.road.x0, S.pavement.z0 - 2, 0)], M.pavementEdge);
    poly(ctx, [P.at(S.road.x0, S.road.z0, 0), P.at(S.road.x1, S.road.z0, 0), P.at(S.road.x1, S.road.z1 - 2, 0), P.at(S.road.x0, S.road.z1 - 2, 0)], M.road);
    ctx.strokeStyle = M.roadLine; ctx.lineWidth = 2; ctx.setLineDash([36, 28]);
    const mid = (S.road.z0 + S.road.z1) / 2; // the centre line between the two lanes
    ctx.beginPath(); ctx.moveTo(...P.at(S.road.x0, mid, 0)); ctx.lineTo(...P.at(S.road.x1, mid, 0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = M.pavementEdge; ctx.lineWidth = 0.5;
    for (let x = S.road.x0; x < S.road.x1; x += 26) { ctx.beginPath(); ctx.moveTo(...P.at(x, S.pavement.z0, 0)); ctx.lineTo(...P.at(x, 0, 0)); ctx.stroke(); }
  }
  function floorPattern(d, room) {
    const { ctx } = d, f = room.floor, [c1, c2] = M.floor[room.floorMat] ?? M.floor.tile;
    const p = (x, z) => P.at(x, z, f, 0);
    poly(ctx, [p(room.x0, 0), p(room.x1, 0), p(room.x1, D), p(room.x0, D)], c1);
    ctx.save(); ctx.beginPath(); [p(room.x0, 0), p(room.x1, 0), p(room.x1, D), p(room.x0, D)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.clip();
    ctx.strokeStyle = c2; ctx.lineWidth = room.floorMat === 'carpet' ? 0.5 : 0.9;
    if (room.floorMat === 'wood') for (let z = 0; z <= D; z += 7) { ctx.beginPath(); ctx.moveTo(...p(room.x0, z)); ctx.lineTo(...p(room.x1, z)); ctx.stroke(); for (let x = room.x0 + ((z / 7) % 2) * 20; x < room.x1; x += 40) { ctx.beginPath(); ctx.moveTo(...p(x, z)); ctx.lineTo(...p(x, z + 7)); ctx.stroke(); } }
    else if (room.floorMat === 'tile') { for (let z = 0; z <= D; z += 20) { ctx.beginPath(); ctx.moveTo(...p(room.x0, z)); ctx.lineTo(...p(room.x1, z)); ctx.stroke(); } for (let x = room.x0; x <= room.x1; x += 20) { ctx.beginPath(); ctx.moveTo(...p(x, 0)); ctx.lineTo(...p(x, D)); ctx.stroke(); } }
    else for (let z = 0; z <= D; z += 10) { ctx.beginPath(); ctx.moveTo(...p(room.x0, z)); ctx.lineTo(...p(room.x1, z)); ctx.stroke(); }
    ctx.restore();
    for (const it of def.FURNITURE) if (it.floor === f && (it.type === 'rug' || it.type === 'mat') && it.x >= room.x0 && it.x <= room.x1) PROPS[it.type](d, it);
  }
  function drawShell(d, f) {
    const { ctx } = d;
    const rooms = def.ROOMS.filter(r => r.floor === f && !r.exterior && !r.roof);
    if (!rooms.length) return;
    const x0 = Math.min(...rooms.map(r => r.x0)), x1 = Math.max(...rooms.map(r => r.x1)) + 8;
    // Back wall (with thickness showing on top), per room colour.
    for (const r of rooms) {
      const p = (x, h) => P.at(x, D, f, h), ex = r.x1 + (r.x1 === 660 ? 8 : 20);
      poly(ctx, [p(r.x0, 0), p(ex, 0), p(ex, HT), p(r.x0, HT)], M.wallBack[r.wall] ?? M.wallBack.hall);
      poly(ctx, [p(r.x0, 0), p(ex, 0), p(ex, 5), p(r.x0, 5)], M.wallTrim);
      if (M.banners && r.id !== 'queue') for (const bx of [r.x0 + 30, r.x1 - 40]) { const q = (x, h) => P.at(x, D - 0.3, f, h); poly(ctx, [q(bx, HT - 8), q(bx + 14, HT - 8), q(bx + 14, HT - 40), q(bx + 7, HT - 34), q(bx, HT - 40)], '#8a1c2b', INK, 0.6); }
      floorPattern(d, r);
    }
    // Partition floor strips (thresholds).
    for (const w of def.WALLS) if (w.floor === f && w.kind === 'partition') poly(ctx, [P.at(w.x0, 0, f), P.at(w.x1, 0, f), P.at(w.x1, D, f), P.at(w.x0, D, f)], shade(M.floor.tile[1], 0.9));
    // Outer left wall: its inside face and its cut edge.
    prism(d, f, { x0: -8, x1: 0, z0: 0, z1: D + 8, h1: HT }, { front: M.exterior, side: M.wallSide, top: M.exteriorDark });
    for (const w of def.WALL_DECOR) if (w.floor === f) DECOR[w.type]?.(d, w);
    // Elevator pit where the shaft passes through this floor.
    const p = (x, z) => P.at(x, z, f, 0.2);
    poly(ctx, [p(E.x0, E.z0), p(E.x1, E.z0), p(E.x1, E.z1), p(E.x0, E.z1)], '#1a1e25');
    // Ceiling light pools; brighter where real work is happening.
    for (const r of rooms) {
      const act = d.room(r.id), n = Math.max(2, Math.round((r.x1 - r.x0) / 130));
      for (let i = 0; i < n; i++) { const [lx, ly] = P.at(r.x0 + (i + 0.5) * (r.x1 - r.x0) / n, D * 0.55, f, 0); glow(d, lx, ly, 70, act ? 'rgba(255,244,214,0.22)' : M.light); }
      if (M.torches) for (const tx of [r.x0 + 12, r.x1 - 12]) { const [sx, sy] = P.at(tx, D - 1, f, HT * 0.62), fl = 1 + Math.sin(d.T * 10 + tx) * 0.12; ctx.fillStyle = '#5a4432'; ctx.fillRect(sx - 1.5, sy, 3, 8); ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.ellipse(sx, sy - 3, 2.6 * fl, 5 * fl, 0, 0, TAU); ctx.fill(); glow(d, sx, sy - 3, 34, 'rgba(255,170,60,0.25)'); }
    }
    void x0; void x1;
  }
  function drawSlabs(d) {
    const W1 = 668;
    for (const f of [1, 2]) {
      // Only the slab's cut edge and end show; its top is the floor above (drawn by that floor's shell).
      const p = (x, z, h) => P.at(x, z, f, h);
      poly(d.ctx, [p(W1, 0, -g.slab), p(W1, D + 8, -g.slab), p(W1, D + 8, 0), p(W1, 0, 0)], shade(M.slab, 0.8), INK, d.lw);
      poly(d.ctx, [p(-8, 0, -g.slab), p(W1, 0, -g.slab), p(W1, 0, 0), p(-8, 0, 0)], M.slab, INK, d.lw);
      if (f < 2) { // the floor surface above the slab edge is drawn by that floor's shell; add the slab's face detail
        const a = P.at(-8, 0, f, -g.slab / 2), b = P.at(W1, 0, f, -g.slab / 2); d.ctx.strokeStyle = 'rgba(255,255,255,0.08)'; d.ctx.lineWidth = 1; d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...b); d.ctx.stroke();
      }
    }
    // Ground-floor plinth.
    prism(d, 0, { x0: -8, x1: W1, z0: -2, z1: 0, h0: -4, h1: 1 }, M.slab);
    // Roof deck.
    const p = (x, z) => P.at(x, z, 2, 0);
    poly(d.ctx, [p(-8, 0), p(W1, 0), p(W1, D + 8), p(-8, D + 8)], M.roof, INK, d.lw);
    d.ctx.strokeStyle = 'rgba(0,0,0,0.12)'; d.ctx.lineWidth = 0.8; for (let z = 10; z < D; z += 12) { d.ctx.beginPath(); d.ctx.moveTo(...p(-8, z)); d.ctx.lineTo(...p(W1, z)); d.ctx.stroke(); }
    prism(d, 2, { x0: -8, x1: W1, z0: D + 2, z1: D + 8, h1: 10 }, M.parapet);
  }

  // ---- The elevator: shaft glass and landing doors per floor, the car with its riders. ----
  function carFloor(lift) { let best = floorsWithRooms[0]; for (const f of liftStops.floors) if (lift.y <= stopOf(f) + 0.5) best = f; return best; }
  function drawShaft(d, f, lift, withCar, riders) {
    const { ctx } = d, p = (x, z, h) => P.at(x, z, f, h);
    // Rails and cables at the back.
    ctx.strokeStyle = M.liftFrame; ctx.lineWidth = 2;
    for (const x of [E.x0 + 3, E.x1 - 3]) { ctx.beginPath(); ctx.moveTo(...p(x, E.z1 - 2, 0)); ctx.lineTo(...p(x, E.z1 - 2, HT + g.slab)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(40,44,52,0.6)'; ctx.lineWidth = 0.8;
    for (const dx of [-4, 4]) { ctx.beginPath(); ctx.moveTo(...p(E.car.x + dx, E.car.z + 4, 0)); ctx.lineTo(...p(E.car.x + dx, E.car.z + 4, HT + g.slab)); ctx.stroke(); }
    if (withCar) drawCar(d, lift, riders);
    // Glass front with landing doors, and the glass side.
    const here = Math.abs(lift.y - stopOf(f)) < 1, open = here ? lift.doors : 0;
    const dw = (E.car.w - 8) / 2, cx = E.car.x;
    poly(ctx, [p(E.x1, E.z0, 0), p(E.x1, E.z1, 0), p(E.x1, E.z1, HT), p(E.x1, E.z0, HT)], M.liftGlass, M.glassEdge, 0.8);
    for (const [s, k] of [[-1, 1], [1, 1]]) {
      const inner = cx + s * (4 + open * (dw - 2)) * 0 + s * open * dw, a = cx + s * 1 + s * open * dw, b = a + s * dw;
      void inner; void k;
      poly(ctx, [p(Math.min(a, b), E.z0, 0), p(Math.max(a, b), E.z0, 0), p(Math.max(a, b), E.z0, 80), p(Math.min(a, b), E.z0, 80)], M.liftGlass, M.liftFrame, 1);
    }
    poly(ctx, [p(E.x0, E.z0, 80), p(E.x1, E.z0, 80), p(E.x1, E.z0, 86), p(E.x0, E.z0, 86)], M.liftFrame);
    // Floor indicator above the landing: lit when the car is here, arrow when it is coming.
    const st = lift.status(), [ix, iy] = p(cx, E.z0, 94);
    ctx.fillStyle = '#10151f'; ctx.fillRect(ix - 7, iy - 4, 14, 8);
    text(ctx, st.moving ? (lift.target < lift.y ? '▲' : '▼') : String(st.currentFloor ?? ''), ix, iy + 0.5, 6, here ? M.liftAccent : '#6b7a90', { weight: 800 });
    for (const x of [E.x0, E.x1]) { ctx.strokeStyle = M.liftFrame; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...p(x, E.z0, 0)); ctx.lineTo(...p(x, E.z0, HT)); ctx.stroke(); }
  }
  function drawCar(d, lift, riders) {
    const { ctx } = d, hc = g.base - E.car.z * g.sky - lift.y, c = E.car;
    const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.z - c.d / 2, z1 = c.z + c.d / 2, p = (x, z, h) => P.at(x, z, 0, hc + h);
    // Hide the car where it passes behind a floor slab's front.
    ctx.save();
    ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4, 2e4);
    for (const f of liftStops.floors) if (f > 0) { const base = P.baseOf(f); ctx.rect(-1e4, base - E.z0 * g.sky, 2e4, E.z0 * g.sky + g.slab); }
    ctx.clip('evenodd');
    poly(ctx, [p(x0, z1, 0), p(x1, z1, 0), p(x1, z1, c.h), p(x0, z1, c.h)], shade(M.liftCar, 0.85), INK, d.lw);
    poly(ctx, [p(x0, z0, 0), p(x0, z1, 0), p(x0, z1, c.h), p(x0, z0, c.h)], shade(M.liftCar, 0.75), INK, d.lw);
    poly(ctx, [p(x0, z0, 0), p(x1, z0, 0), p(x1, z1, 0), p(x0, z1, 0)], shade(M.liftCar, 0.6), INK, d.lw);
    const [lx, ly] = p(c.x, z1 - 1, c.h - 6); glow(d, lx, ly, 28, 'rgba(255,250,230,0.35)');
    ctx.restore();
    riders.forEach((e, i) => drawAgent(d, e, { dx: (i - (riders.length - 1) / 2) * 10 }));
    ctx.save(); ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4, 2e4);
    for (const f of liftStops.floors) if (f > 0) { const base = P.baseOf(f); ctx.rect(-1e4, base - E.z0 * g.sky, 2e4, E.z0 * g.sky + g.slab); }
    ctx.clip('evenodd');
    poly(ctx, [p(x1, z0, 0), p(x1, z1, 0), p(x1, z1, c.h), p(x1, z0, c.h)], M.liftGlass, M.glassEdge, 0.8);
    poly(ctx, [p(x0, z0, c.h), p(x1, z0, c.h), p(x1, z1, c.h), p(x0, z1, c.h)], shade(M.liftCar, 1.05), INK, d.lw);
    for (const [a, b] of [[x0, x0 + 3], [x1 - 3, x1]]) poly(ctx, [p(a, z0, 0), p(b, z0, 0), p(b, z0, c.h), p(a, z0, c.h)], M.liftFrame);
    poly(ctx, [p(x0, z0, c.h - 4), p(x1, z0, c.h - 4), p(x1, z0, c.h), p(x0, z0, c.h)], M.liftAccent);
    ctx.restore();
  }

  // ---- Characters. ----
  function drawAgent(d, e, { dx = 0 } = {}) {
    const a = e.agent; if (!a) return;
    const { ctx, env } = d, T = d.T, st = e.anim?.state ?? 'idle';
    const t = (d.now - (e.anim?.since ?? d.now)) / 1000, look = lookFor(skinId, a);
    const x = e.x + dx, y = e.y;
    const hovered = env.hoverId === e.id, selected = env.selectedId === e.id;
    if (hovered || selected) { ctx.beginPath(); ctx.ellipse(x, y + 0.5, e.h * 0.34, e.h * 0.1, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = selected ? '#e21b23' : '#ffffff'; ctx.stroke(); }
    const fig = { x, y, h: e.h, dir: e.moving || e.ride ? e.dir ?? 'front' : e.dir ?? 'front', posture: e.posture, state: st, t, time: d.reduced ? 0 : T + hash(e.id.length), stride: e.stride ?? 0, look, use: e.spotInfo?.use, moving: e.moving, alpha: a.activity === 'offline' ? 0.82 : 1 };
    const head = drawFigure(ctx, fig);
    // X-ray: a selected agent, or one doing real work, stays readable through glass, walls and furniture in
    // front of it: a faint copy drawn above the scene (invisible where nothing covers it).
    if (selected || hovered || PRODUCTIVE_STATES.has(st) || st === 'assemble' || st === 'survey') d.late.unshift(() => drawFigure(ctx, { ...fig, alpha: selected ? 0.45 : 0.3 }));
    d.late.push(() => badge(d, e, a, x, head.top, hovered, selected));
  }
  function badge(d, e, a, x, top, hovered, selected) {
    const { ctx, env } = d, zoom = env.zoom, k = Math.min(1.8, Math.max(0.7, 1 / zoom)), time = d.now;
    const ring = dotColor(e, a), cy = top - 4 * k;
    const pulse = d.reduced ? 1 : 0.75 + 0.25 * Math.sin(time / 380);
    const owner = Object.values(env.world?.issues ?? {}).some(i => i.open && i.agentId === a.id && i.owner);
    if (owner) { ctx.beginPath(); ctx.roundRect(x - 16 * k, cy - 14 * k, 32 * k, 11 * k, 5 * k); ctx.fillStyle = '#7b3fe4'; ctx.globalAlpha = pulse; ctx.fill(); ctx.globalAlpha = 1; text(ctx, 'Needs you', x, cy - 8.5 * k, 6 * k, '#fff', { weight: 800 }); }
    else if (a.activity === 'error') { ctx.beginPath(); ctx.arc(x, cy - 8 * k, 5 * k, 0, TAU); ctx.fillStyle = '#e5484d'; ctx.globalAlpha = pulse; ctx.fill(); ctx.globalAlpha = 1; text(ctx, '!', x, cy - 7.5 * k, 7.5 * k, '#fff', { weight: 800 }); }
    else if (a.activity === 'waiting') { ctx.beginPath(); ctx.arc(x, cy - 8 * k, 5 * k, 0, TAU); ctx.fillStyle = '#f4a23b'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = k; ctx.beginPath(); ctx.moveTo(x, cy - 11 * k); ctx.lineTo(x, cy - 8 * k); ctx.lineTo(x + 2 * k, cy - 7 * k); ctx.stroke(); }
    else if (a.activity === 'offline' && !d.reduced) text(ctx, 'z', x + 5, cy - 6 - ((time / 900) % 1) * 6, 7 * k, '#dfe7f2', { weight: 700 });
    if (zoom < 0.7 && !(hovered || selected)) return;
    // Compact by default (dot + name); the action and stage show on hover or selection.
    const lines = hovered || selected ? [a.name, statusLine(e, env.world, layout)] : [a.name];
    // Labels keep a constant size on screen (about 11px) at any zoom. When two would overlap, the later one
    // steps up above the other (with a thin leader line) instead of disappearing.
    const s = LABEL_PX / 8 / zoom;
    ctx.font = font(8, 700); const w0 = ctx.measureText(lines[0]).width; ctx.font = font(6.5, 500);
    const w = (Math.max(w0, lines[1] ? ctx.measureText(lines[1]).width : 0) + 19) * s, h = (lines.length * 11 + 5) * s;
    const base = cy - 16 * k - lines.length * 11 * s;
    const ly = placeLabel(env.claimLabel, x, base, w, h, hovered || selected, 2 * s);
    if (ly !== base) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 0.8 / zoom; ctx.beginPath(); ctx.moveTo(x, ly + h); ctx.lineTo(x, base + h * 0.4); ctx.stroke(); }
    ctx.save(); ctx.translate(x, ly); ctx.scale(s, s); pill(ctx, 0, 0, lines, { dot: ring, px: 8 }); ctx.restore();
  }
  function drawNpc(d, e) {
    drawFigure(d.ctx, { x: e.x, y: e.y, h: e.h, dir: e.moving === false ? 'front' : e.facing < 0 ? 'left' : 'right', state: e.pose === 'walk' ? 'walk' : 'idle', t: 0, time: d.reduced ? 0 : d.T + e.index, stride: e.stride ?? 0, look: PEDESTRIANS[e.index % PEDESTRIANS.length], moving: e.pose === 'walk', alpha: 0.95 });
  }
  // Cars are sized to people (world/scale.mjs STREET_SCALE): about 2.4 agents long and 0.8 tall.
  const CAR = STREET_SCALE.car, carL = CAR.length / 2, carW = CAR.width / 2;
  function drawVehicle(d, v) {
    const { ctx } = d, x0 = v.x - carL, x1 = v.x + carL, z = v.y, f = 0, wr = CAR.wheel, bh = CAR.body;
    const body = M.fantasy ? '#7a5534' : v.color, nose = v.dx > 0 ? 1 : -1;
    poly(ctx, [P.at(x0, z - carW, 0), P.at(x1, z - carW, 0), P.at(x1, z + carW, 0), P.at(x0, z + carW, 0)], 'rgba(0,0,0,0.28)');
    for (const wx of [x0 + wr * 2.2, x1 - wr * 2.2]) { const [sx, sy] = P.at(wx, z - carW, f, wr); ctx.beginPath(); ctx.arc(sx, sy, wr, 0, TAU); ctx.fillStyle = '#16181d'; ctx.fill(); ctx.beginPath(); ctx.arc(sx, sy, wr * 0.45, 0, TAU); ctx.fillStyle = '#8a9099'; ctx.fill(); }
    prism(d, f, { x0, x1, z0: z - carW, z1: z + carW, h0: wr * 0.9, h1: bh }, body);
    if (M.fantasy) { const [lx, ly] = P.at(nose > 0 ? x1 : x0, z - carW, f, bh + 4); ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, TAU); ctx.fill(); glow(d, lx, ly, 20, 'rgba(255,200,90,0.3)'); return; }
    // Cabin set back from the bonnet, windows all round.
    const c0 = nose > 0 ? x0 + CAR.length * 0.18 : x0 + CAR.length * 0.3, c1 = nose > 0 ? x1 - CAR.length * 0.3 : x1 - CAR.length * 0.18;
    prism(d, f, { x0: c0, x1: c1, z0: z - carW + 3, z1: z + carW - 3, h0: bh, h1: CAR.height }, { front: 'rgba(160,200,235,0.85)', side: 'rgba(120,160,200,0.85)', top: shade(body, 1.1) });
    const [hx, hy] = P.at(nose > 0 ? x1 : x0, z - carW, f, bh * 0.7); ctx.fillStyle = '#fff5c8'; ctx.fillRect(hx - 2, hy - 2, 4, 3); glow(d, hx, hy, 16, 'rgba(255,245,200,0.25)');
  }

  // ---- Per-frame. ----
  let vehicleRoutes = null;
  function frame(ctx, env, entities) {
    const now = env.time, T = env.reducedMotion ? 0 : now / 1000, world = env.world ?? { agents: {}, tasks: {}, prs: {}, testRuns: {}, systems: {}, issues: {} };
    const agents = [], npcs = [];
    for (const e of env.scene.entities.values()) if (e.kind === 'agent') agents.push(e); else if (e.kind === 'npc') npcs.push(e);
    const systems = Object.values(world.systems ?? {});
    const sysState = kind => systems.find(s => s.kind === kind)?.state ?? 'unknown';
    const tasks = Object.values(world.tasks ?? {});
    const lastTests = Object.values(world.testRuns ?? {}).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
    const d = {
      ctx, P, M, T, now, env, lw: 1, reduced: env.reducedMotion, late: env.late, clock: Date.now(),
      room: id => env.activity?.rooms?.[id] ?? 0,
      stationActive: key => !!env.activity?.stations?.[key],
      pointBusy: key => agents.some(a => a.spot === key && !a.moving),
      systemState: sysState, systemColor: kind => SYSTEM_COLOR[sysState(kind)] ?? SYSTEM_COLOR.unknown,
      lastTests, openPrs: Object.values(world.prs ?? {}).filter(p => p.state !== 'merged').sort((a, b) => a.createdAt - b.createdAt),
      queued: tasks.filter(t => t.status === 'queued' || t.status === 'blocked'), archived: tasks.filter(t => t.status === 'done').length,
      construction: !!env.activity?.construction, meeting: agents.some(a => a.agent?.meetingId && !a.moving),
      counts: { total: agents.length, working: agents.filter(a => WORKING.has(a.agent?.activity)).length, issues: Object.values(world.issues ?? {}).filter(i => i.open).length },
      modeLabel: (env.modeLabel ?? '').split(':')[0], modeColor: env.modeLabel?.startsWith('LIVE') ? '#3ddc84' : '#ffb020',
    };
    // Construction: in LIVE only real passes (git/GitHub evidence); in simulation only simulated ones.
    const live = !env.modeLabel?.startsWith('SIMULATION'); // LIVE, or HQ offline showing the last known state
    const passes = Object.values(world.passes ?? {}).filter(p => (live ? p.source !== 'sim' : p.source === 'sim') && p.structures?.length);
    d.passCounts = { accepted: passes.filter(p => p.stage === 'accepted').length, active: passes.filter(p => p.stage !== 'accepted').length };
    if (debug) return blueprint(d, agents);
    drawGround(d);
    for (const f of floorsWithRooms) drawShell(d, f);
    drawSlabs(d);
    // Pass B: each floor's objects and characters in depth order, bottom floor first.
    const lift = env.scene.get(`lift:${E.id}:back`)?.lift;
    const cf = lift ? carFloor(lift) : null;
    const inCar = e => e.ride && ['board', 'ride', 'exit'].includes(e.ride.request.phase) || e.gait === 'ride';
    const riders = agents.filter(inCar);
    vehicleRoutes ||= def.STREET.lanes.map(l => ({ points: l.dir > 0 ? [[def.STREET.road.x0, l.z], [def.STREET.road.x1, l.z]] : [[def.STREET.road.x1, l.z], [def.STREET.road.x0, l.z]], speed: l.speed, every: l.every, chance: l.chance }));
    const cars = d.reduced ? [] : vehiclesAt(T, vehicleRoutes);
    for (const f of [0, 1, 2]) {
      const items = [...(staticItems[f] ?? [])];
      // A character's depth box is its footprint on the floor (world/scale.mjs), not its drawing. Seated, it
      // wins ties with the seat it is sitting on (it is on top of the cushion).
      const fw = AGENT.footprint.w / 2, fd = AGENT.footprint.d / 2;
      const charBox = (e, x, z) => ({ x0: x - fw, x1: x + fw, z0: z - fd, z1: z + fd, bias: e.posture === 'sit' ? 1 : 0, sb: { l: e.x - AGENT.height * 0.45, r: e.x + AGENT.height * 0.45, t: e.y - AGENT.height * 1.5, b: e.y + 4 } });
      for (const e of agents) {
        if (inCar(e)) continue;
        const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue;
        items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAgent(d, e) });
      }
      if (f === 0) {
        for (const e of npcs) { const pl = layout.planAt(e.x, e.y); if (pl) items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawNpc(d, e) }); }
        for (const v of cars) { const box = { x0: v.x - carL, x1: v.x + carL, z0: v.y - carW, z1: v.y + carW }; items.push({ ...box, sb: boxBounds(P, { ...box, h1: CAR.height + 4 }, 0), draw: () => drawVehicle(d, v) }); }
      }
      for (const pass of passes) for (const s of pass.structures) if (s.floor === f) {
        const builders = agents.filter(a => (s.sitePoints ?? []).includes(a.spot) && !a.moving).length;
        items.push({ ...siteBox(P, s), draw: () => drawSite(d, pass, s, { builders, sim: pass.source === 'sim' }) });
      }
      if (lift && liftStops.floors.includes(f)) {
        const withCar = cf === f;
        items.push({ x0: E.x0, x1: E.x1, z0: E.z0, z1: E.z1, sb: boxBounds(P, { x0: E.x0, x1: E.x1, z0: E.z0, z1: E.z1, h1: HT + 90 }, f), draw: () => drawShaft(d, f, lift, withCar, withCar ? riders : []) });
      }
      for (const it of depthSort(items)) it.draw(d);
      // Rooms at rest are a touch dimmer than rooms where real work is happening.
      for (const r of def.ROOMS) if (r.floor === f && !r.exterior && !r.roof) {
        const dim = (r.id === 'development' ? 0.12 : 0.05) * (1 - d.room(r.id));
        if (dim > 0.01) { const p = (x, z, h) => P.at(x, z, f, h); poly(ctx, [p(r.x0, 0, 0), p(r.x1, 0, 0), p(r.x1, D, 0), [p(r.x1, D, 0)[0], p(0, 0, HT)[1]], p(r.x0, 0, HT)], `rgba(8,12,24,${dim})`); }
      }
    }
    effects(d);
    // Hovered or selected room outline.
    for (const id of [env.hoverId, env.selectedId]) {
      const room = id?.startsWith('room:') ? layout.locationById[id.slice(5)] : null;
      if (room) d.late.push(() => { poly(ctx, room.poly, id === env.selectedId ? 'rgba(226,27,35,0.07)' : 'rgba(255,255,255,0.05)', id === env.selectedId ? '#e21b23' : '#ffffffaa', 1.5); pill(ctx, room.x + room.w / 2, room.y + 4, [room.name], { px: 10 }); });
    }
    // Live meetings: a speech marker over the meeting table; click it for topic, decision and evidence.
    for (const e of env.scene.entities.values()) if (e.kind === 'meeting' && e.meeting) {
      const { x: mx, y: my } = e, hot = env.hoverId === e.id || env.selectedId === e.id, bob = d.reduced ? 0 : Math.sin(now / 420) * 1.5;
      d.late.push(() => {
        ctx.beginPath(); ctx.roundRect(mx - 11, my - 9 + bob, 22, 14, 5); ctx.fillStyle = hot ? '#e21b23' : '#2f6fd6'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx - 3, my + 5 + bob); ctx.lineTo(mx, my + 10 + bob); ctx.lineTo(mx + 3, my + 5 + bob); ctx.fillStyle = hot ? '#e21b23' : '#2f6fd6'; ctx.fill();
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(mx + i * 5, my - 2 + bob, 1.6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
        if (hot) pill(ctx, mx, my - 30, [e.meeting.topic ?? 'Meeting', e.meeting.decision ? `Decide: ${e.meeting.decision}` : `${e.meeting.agentIds.length} agents`], { px: 8.5 });
      });
    }
    // Open issues: a warning sign in the room they belong to.
    for (const e of env.scene.entities.values()) if (e.kind === 'issue' && e.issue) {
      const room = layout.locationById[e.issue.location] ?? layout.locationById.command, [sx, sy] = room ? P.at(room.room.x0 + 30 + (hash(e.id.length) * 40), 10, room.floor, 60) : [e.x, e.y];
      e.x = sx; e.y = sy; env.scene.moved(e);
      d.late.push(() => { const k = d.reduced ? 1 : 1 + 0.1 * Math.sin(now / 180); ctx.save(); ctx.translate(sx, sy); ctx.scale(k, k); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fillStyle = e.issue.owner ? '#7b3fe4' : e.issue.severity === 'low' ? '#f4b942' : '#ef4b4b'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke(); text(ctx, '!', 0, 1.5, 10, '#fff', { weight: 800 }); ctx.restore(); if (env.hoverId === e.id || env.selectedId === e.id) pill(ctx, sx, sy + 12, [e.issue.title.slice(0, 48)], { px: 8.5 }); });
    }
  }

  // Completion feedback: a PR the reviewer approved gets a soft ring and a small chip at the console. No fireworks.
  function effects(d) {
    const { ctx, clock } = d, con = def.FURNITURE.find(f => f.id === 'console');
    for (const pr of d.openPrs) {
      const age = clock - (pr.updatedAt ?? 0);
      if (age < 0 || age > 3200) continue;
      const [sx, sy] = P.at(con.x, con.z - con.d / 2, con.floor, 34), k = age / 3200;
      if (pr.state === 'reviewed') {
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 20 + k * 40, 7 + k * 14, 0, 0, TAU); ctx.stroke(); ctx.restore();
        d.late.push(() => { ctx.save(); ctx.globalAlpha = Math.min(1, (1 - k) * 2); pill(ctx, sx, sy - 58 - k * 6, [pr.verdict === 'changes' ? 'Changes requested' : 'Review passed'], { dot: pr.verdict === 'changes' ? '#ff9f43' : '#3ddc84', px: 8.5 }); ctx.restore(); });
      } else if (pr.state === 'open' && age < 1200) {
        ctx.save(); ctx.globalAlpha = 1 - age / 1200; glow(d, sx, sy, 24 + age / 30, 'rgba(255,220,120,0.5)'); ctx.restore();
        d.late.push(() => { ctx.save(); ctx.globalAlpha = 1 - age / 1200; pill(ctx, sx, sy - 58, ['Ready for review'], { dot: '#f2d47a', px: 8.5 }); ctx.restore(); });
      }
    }
  }

  // ---- Blueprint: the same world as a debug drawing. ----
  function blueprint(d, agents) {
    const { ctx } = d, line = (pts, c, w = 1, close = true) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
    const zoom = d.env.zoom;
    for (const r of def.ROOMS) {
      const f = r.floor, z0 = r.z0 ?? 0, z1 = r.z1 ?? D, p = (x, z, h = 0) => P.at(x, z, f, h);
      line([p(r.x0, z0), p(r.x1, z0), p(r.x1, z1), p(r.x0, z1)], B.line, 1.2);
      if (!r.exterior && !r.roof) line([p(r.x0, D), p(r.x1, D), p(r.x1, D, HT), p(r.x0, D, HT)], B.lineDim, 0.8);
      const [lx, ly] = p(r.x0 + 6, z0 + 4); text(ctx, `${r.name} (${r.id})`, lx, ly + 6, 8, B.text, { align: 'left', weight: 700 });
      const act = d.room(r.id); if (act) text(ctx, `activity ${act.toFixed(1)}`, lx, ly + 16, 6.5, '#7ee787', { align: 'left' });
    }
    for (const w of def.WALLS) { const p = (x, z) => P.at(x, z, w.floor, 0); line([p(w.x0, w.z0), p(w.x1, w.z0), p(w.x1, w.z1), p(w.x0, w.z1)], B.line, 2); if (w.door) line([p(w.x0 - 3, w.door[0]), p(w.x1 + 3, w.door[0]), p(w.x1 + 3, w.door[1]), p(w.x0 - 3, w.door[1])], '#ffd23f', 1); }
    for (const it of def.FURNITURE) {
      const p = (x, z) => P.at(x, z, it.floor, 0), b = [p(it.x - it.w / 2, it.z - it.d / 2), p(it.x + it.w / 2, it.z - it.d / 2), p(it.x + it.w / 2, it.z + it.d / 2), p(it.x - it.w / 2, it.z + it.d / 2)];
      line(b, it.solid ? B.line : B.lineDim, it.solid ? 1 : 0.6);
      if (zoom > 1.1) { const [sx, sy] = p(it.x, it.z); text(ctx, it.id, sx, sy, 5.5, B.lineDim); }
    }
    for (const [a, b] of layout.navEdges) { const A = layout.navNodes[a], Bn = layout.navNodes[b]; ctx.setLineDash(layout.liftOf[a] && layout.liftOf[b] ? [4, 3] : []); line([A, Bn], layout.liftOf[a] && layout.liftOf[b] ? B.lift : B.edge, 1, false); }
    ctx.setLineDash([]);
    for (const [id, [x, y]] of Object.entries(layout.navNodes)) {
      const info = Object.values(layout.stationInfo).find(s => s.id === id);
      ctx.beginPath(); ctx.arc(x, y, info ? 3 : 2, 0, TAU); ctx.fillStyle = info ? B.point : B.node; ctx.fill();
      if (info) { const v = { front: [0, 6], back: [3, -5], left: [-6, 0], right: [6, 0] }[info.facing]; line([[x, y], [x + v[0], y + v[1]]], B.point, 1, false); }
      if (zoom > 0.9 || info) text(ctx, info ? `${id} ${info.pose}` : id, x + 4, y - 5, info ? 6 : 5, info ? B.point : B.node, { align: 'left' });
    }
    const lift = d.env.scene.get(`lift:${E.id}:back`)?.lift;
    if (lift) {
      const [cx] = P.at(E.car.x, E.car.z, 0); line([[cx - 24, lift.y - E.car.h], [cx + 24, lift.y - E.car.h], [cx + 24, lift.y], [cx - 24, lift.y]], B.lift, 1.5);
      const s = lift.status();
      pill(ctx, cx + 60, lift.y - 64, [`lift ${E.id}`, `floor ${s.currentFloor ?? '…'} → ${s.targetFloor} · doors ${s.doorState}`, `riders ${s.occupants.join(', ') || 'none'} · requests ${s.requestedFloors.join(', ') || 'none'}`], { dot: B.lift, px: 7.5 });
    }
    for (const e of agents) {
      if (e.path?.length) { line([[e.x, e.y], ...e.path], '#ff7ab6', 1.2, false); }
      drawFigure(ctx, { x: e.x, y: e.y, h: e.h, dir: e.dir ?? 'front', posture: e.posture, state: e.anim?.state ?? 'idle', t: (d.now - (e.anim?.since ?? d.now)) / 1000, time: d.T, stride: e.stride ?? 0, look: { shirt: '#9ecbff', pants: '#6b8fbf', hair: '#e6f1ff', skin: '#cfe3ff' }, alpha: 0.9 });
      const productive = PRODUCTIVE_STATES.has(e.anim?.state);
      pill(ctx, e.x, e.y - e.h - 36, [`${e.ref.id}: ${e.anim?.state ?? '?'}${productive ? ' (work)' : ''}`, `${e.agent?.activity ?? '?'} · ${e.spot || 'moving'} · ${e.posture ?? 'stand'}`], { dot: STATUS[e.agent?.activity] ?? '#888', px: 7 });
    }
  }

  return {
    id: skinId, lod: [0.55, 1.35],
    background(ctx, camera) {
      if (debug) { ctx.fillStyle = B.sky[0]; ctx.fillRect(0, 0, camera.width, camera.height); return; }
      const gr = ctx.createLinearGradient(0, 0, 0, camera.height); M.sky.forEach((c, i) => gr.addColorStop(i / (M.sky.length - 1), c));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, camera.width, camera.height);
    },
    frame,
  };
}
