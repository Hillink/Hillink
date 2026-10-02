// Shared building blocks for the HQ styles: plan-space material patterns, the island ground (grass, roads, paths,
// forecourts clipped to the island top), face painting helpers, furniture geometry that both styles dress
// differently (tables, cabinets, chairs, screens), the construction-site stages and the window/door bookkeeping.
// A style picks materials and props; the geometry of a semantic object is shared so Modern and Fantasy always
// describe the same World.
import { planMatrix } from '../../art5d/textures.mjs';
import { stageIndex } from '../../../procgen/construction.mjs';
import { shade, mix, poly, glow, h1, texture } from '../prims.mjs';
import { HT, LOW } from '../model.mjs';
import { hash2 } from '../color.mjs';

export const TAU = Math.PI * 2;
export { shade, mix, poly, glow, h1, texture, HT, LOW };

// ---- Patterns (painted once, 2 px per world unit, repeated in plan or face space). ----
const pats = new Map();
export function pattern(ctx, key, w, h, paint, px = 2) {
  let p = pats.get(key);
  if (!p) {
    const c = texture(w * px, h * px, (g, W, H) => { g.scale(px, px); paint(g, w, h); });
    p = ctx.createPattern(c, 'repeat');
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(1 / px));
    pats.set(key, p);
  }
  return p;
}
// Fills a plan rectangle on storey f at height h with a fill (colour or pattern), in plan space.
export function fillPlan(d, f, r, fill, h = 0, inset = 0) {
  const { ctx, P } = d;
  ctx.save(); if (h) ctx.translate(0, -h); ctx.transform(...planMatrix(P, f));
  ctx.fillStyle = fill; ctx.fillRect(r.x0 + inset, r.z0 + inset, r.x1 - r.x0 - 2 * inset, r.z1 - r.z0 - 2 * inset);
  ctx.restore();
}
// Runs fn(ctx) in plan space of storey f (x right, z away; units).
export function inPlan(d, f, fn) { const { ctx, P } = d; ctx.save(); ctx.transform(...planMatrix(P, f)); fn(ctx); ctx.restore(); }

export const noise = (i, j, s = 0) => h1(i, j, s);

// Common texture painters (sizes in world units).
export const TEX = {
  planks(base, { w = 72, h = 30, plank = 5, joint = 'rgba(40,24,10,0.28)' } = {}) {
    return (g) => { for (let j = 0; j * plank < h; j++) { const off = (j * 23) % w; for (let i = -1; i < 2; i++) { const x = i * w + off, c = shade(base, 0.9 + noise(i, j, 3) * 0.2); g.fillStyle = c; g.fillRect(x, j * plank, w, plank); g.fillStyle = joint; g.fillRect(x, j * plank, 0.5, plank); } g.fillStyle = joint; g.fillRect(0, j * plank + plank - 0.4, w, 0.4); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let k = 0; k < 4; k++) g.fillRect(noise(j, k, 9) * w, j * plank + 1 + noise(k, j, 2) * 3, 8 + noise(k, j) * 14, 0.35); } };
  },
  stone(base, { w = 60, h = 40, row = 10, joint = 'rgba(30,26,22,0.35)' } = {}) {
    return (g) => { g.fillStyle = joint; g.fillRect(0, 0, w, h); for (let j = 0; j * row < h; j++) { let x = -((j * 17) % 20); while (x < w) { const L = 12 + noise(x, j, 4) * 14, c = shade(base, 0.86 + noise(x, j, 5) * 0.24); g.fillStyle = c; g.fillRect(x + 0.6, j * row + 0.6, L - 1.2, row - 1.2); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 0.6, j * row + 0.6, L - 1.2, 1); x += L; } } };
  },
  tiles(base, { s = 17, joint = 'rgba(0,0,0,0.25)', dots = false } = {}) {
    return (g) => { g.fillStyle = base; g.fillRect(0, 0, s, s); g.fillStyle = joint; g.fillRect(0, 0, s, 0.5); g.fillRect(0, 0, 0.5, s); if (dots) { g.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 2; i < s - 1; i += 2.4) for (let j = 2; j < s - 1; j += 2.4) g.fillRect(i, j, 0.6, 0.6); } };
  },
  speckle(base, { w = 40, h = 40, n = 120, k = 0.12, seam = 0 } = {}) {
    return (g) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = noise(i, 1, 7) > 0.5 ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${k})`; g.fillRect(noise(i, 2, 7) * w, noise(i, 3, 7) * h, 0.6 + noise(i, 4) * 1.2, 0.6 + noise(i, 5) * 1.2); } for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${k * 0.25})`; g.beginPath(); g.ellipse(noise(i, 8) * w, noise(i, 9) * h, 6 + noise(i, 10) * 8, 3 + noise(i, 11) * 4, 0, 0, TAU); g.fill(); } if (seam) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 0.4); g.fillRect(0, 0, 0.4, h); } };
  },
  grass(base, { w = 50, h = 50 } = {}) {
    return (g) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const x = noise(i, 1, 13) * w, y = noise(i, 2, 13) * h, k = noise(i, 3, 13); g.fillStyle = k > 0.55 ? shade(base, 1.12 + k * 0.08) : shade(base, 0.82 + k * 0.1); g.fillRect(x, y, 0.5, 1.4 + k * 1.6); } };
  },
  flagstones(base, { w = 48, h = 48, joint = 'rgba(30,28,26,0.4)' } = {}) {
    return (g) => { g.fillStyle = joint; g.fillRect(0, 0, w, h); const cells = [[0, 0, 20, 14], [20, 0, 16, 18], [36, 0, 12, 12], [0, 14, 12, 18], [12, 14, 8, 10], [36, 12, 12, 16], [12, 24, 24, 12], [20, 18, 16, 6], [0, 32, 18, 16], [18, 36, 14, 12], [32, 28, 16, 20]];
      cells.forEach(([x, y, cw, ch], i) => { g.fillStyle = shade(base, 0.84 + noise(i, 1, 21) * 0.26); g.beginPath(); g.roundRect(x + 0.7, y + 0.7, cw - 1.4, ch - 1.4, 1.5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 1.2, y + 1, cw - 2.4, 0.8); }); };
  },
};

// ---- The island ground: grass top, lawn around buildings, roads, paths and forecourts from the World. ----
export function drawGround(d, R, o) {
  const { ctx, P, model } = d;
  const c = [P.at(R.x0, R.z0, 0), P.at(R.x1, R.z0, 0), P.at(R.x1, R.z1, 0), P.at(R.x0, R.z1, 0)];
  ctx.save(); ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.clip();
  inPlan(d, 0, g => {
    g.fillStyle = o.grass; g.fillRect(R.x0, R.z0, R.x1 - R.x0, R.z1 - R.z0);
    g.fillStyle = pattern(g, o.key + ':grass', 50, 50, TEX.grass(o.grass)); g.globalAlpha = 0.8; g.fillRect(R.x0, R.z0, R.x1 - R.x0, R.z1 - R.z0); g.globalAlpha = 1;
    // Soft lawn halo round each building, and darker grass near the island edge.
    for (const b of model.buildings) { const m = 5 * d.layout.U; g.fillStyle = o.lawn; g.globalAlpha = 0.55; g.beginPath(); g.roundRect(b.r.x0 - m, b.r.z0 - m, b.r.x1 - b.r.x0 + 2 * m, b.r.z1 - b.r.z0 + 2 * m, m); g.fill(); g.globalAlpha = 1; }
    const e = 2.2 * d.layout.U, gr = g.createLinearGradient(0, R.z0, 0, R.z0 + e); gr.addColorStop(0, o.edge); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(R.x0, R.z0, R.x1 - R.x0, e);
    const gr2 = g.createLinearGradient(R.x1, 0, R.x1 - e, 0); gr2.addColorStop(0, o.edge); gr2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr2; g.fillRect(R.x1 - e, R.z0, e, R.z1 - R.z0);
    o.under?.(g);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const w of model.ways) {
      if (w.kind === 'road') { stroke(g, w.pts, w.W + 1.2 * d.layout.U, o.roadEdge); stroke(g, w.pts, w.W, o.road(g)); o.roadMarks?.(g, w); }
      else if (!w.built) { stroke(g, w.pts, w.W, o.dirt); }
      else { stroke(g, w.pts, w.W + 0.35 * d.layout.U, o.pathEdge); stroke(g, w.pts, w.W, o.path(g)); }
    }
    for (const f of model.forecourts) { const U = d.layout.U; g.fillStyle = o.pathEdge; g.fillRect(f.x0 - 0.2 * U, f.z0 - 0.2 * U, f.x1 - f.x0 + 0.4 * U, f.z1 - f.z0 + 0.2 * U); g.fillStyle = o.path(g); g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0); }
    o.extra?.(g);
  });
  // Grass tufts and small flowers on open land, deterministic.
  if (o.tufts) {
    const U = d.layout.U, n = Math.floor(((R.x1 - R.x0) * (R.z1 - R.z0)) / (U * U * 3));
    for (let i = 0; i < n; i++) {
      const x = R.x0 + hash2(i, 101) * (R.x1 - R.x0), z = R.z0 + hash2(i, 202) * (R.z1 - R.z0);
      if (!clearGround(model, x, z, U * 0.5)) continue;
      const [sx, sy] = P.at(x, z, 0), w = d.reduced ? 0 : Math.sin(d.T * 1.3 + x * 0.02 + z * 0.03) * 1.2, k = hash2(i, 303);
      if (k > 0.82) { ctx.strokeStyle = o.tufts[0]; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + w * 0.6, sy - 5); ctx.stroke(); ctx.fillStyle = o.flowers[Math.floor(hash2(i, 404) * o.flowers.length)]; ctx.beginPath(); ctx.arc(sx + w * 0.6, sy - 5.5, 1.5, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = o.tufts[k > 0.4 ? 1 : 0]; ctx.lineWidth = 1; ctx.beginPath(); for (const q of [-2, 0, 2]) { ctx.moveTo(sx + q, sy); ctx.quadraticCurveTo(sx + q + w * 0.5, sy - 3, sx + q * 1.5 + w, sy - 4.5 - k * 2); } ctx.stroke(); }
    }
  }
  ctx.restore();
}
function stroke(g, pts, W, style) { g.strokeStyle = style; g.lineWidth = W; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.stroke(); }
export function clearGround(model, x, z, m) {
  if (model.buildings.some(b => x > b.r.x0 - m && x < b.r.x1 + m && z > b.r.z0 - m && z < b.r.z1 + m)) return false;
  if (model.forecourts.some(f => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m)) return false;
  for (const w of model.ways) for (let i = 1; i < w.pts.length; i++) { const a = w.pts[i - 1], b = w.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); if (Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < w.W / 2 + m) return false; }
  return true;
}

// ---- Geometry shared by both styles. ----
export const ib = it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 });
export const baseH = it => (it.base ? it.base.h : 0);
// Which visible face an item's front is on ('front' | 'right' | null when it faces away from the camera).
// Items facing away (back or left) show their contents on the front face so they stay readable from the camera.
export const frontFace = it => (it.facing === 'right' ? 'right' : 'front');
// Paints fn(ctx, w, h) on the item's front face if visible, between heights h0..h1, inset by m units.
export function paintFront(d, it, b, h0, h1, fn, m = 0) {
  const F = frontFace(it); if (!F) return false;
  if (F === 'front') d.K.onFace(d.ctx, it.f, 'front', b.z0, b.x0 + m, b.x1 - m, h0, h1, b.x1 - b.x0 - 2 * m, h1 - h0, g => fn(g, b.x1 - b.x0 - 2 * m, h1 - h0));
  else d.K.onFace(d.ctx, it.f, 'right', b.x1, b.z0 + m, b.z1 - m, h0, h1, b.z1 - b.z0 - 2 * m, h1 - h0, g => fn(g, b.z1 - b.z0 - 2 * m, h1 - h0));
  return true;
}
// A table: four legs and a top (o: { top, leg, th (top thickness), legW, panel (a modesty panel colour) }).
export function table(d, f, b, h, o) {
  const { ctx, K } = d, lw = o.legW ?? 1.6, th = o.th ?? 2, i = o.inset ?? 1;
  const legs = [[b.x0 + i, b.z1 - i - lw], [b.x1 - i - lw, b.z1 - i - lw], [b.x0 + i, b.z0 + i], [b.x1 - i - lw, b.z0 + i]];
  if (o.slab) { for (const x of [b.x0 + i, b.x1 - i - lw * 1.6]) K.box(ctx, f, { x0: x, x1: x + lw * 1.6, z0: b.z0 + i, z1: b.z1 - i, h0: 0, h1: h - th }, o.leg); }
  else for (const [x, z] of legs) K.box(ctx, f, { x0: x, x1: x + lw, z0: z, z1: z + lw, h0: 0, h1: h - th }, o.leg);
  if (o.panel) K.box(ctx, f, { x0: b.x0 + i + lw, x1: b.x1 - i - lw, z0: b.z1 - i - 1.2, z1: b.z1 - i, h0: h * 0.35, h1: h - th }, o.panel);
  K.box(ctx, f, { ...b, h0: h - th, h1: h }, o.top, { edge: o.edge ?? 'rgba(255,255,255,0.18)' });
}
// A chair: seat, back on the side behind the sitter, legs or a pedestal (o: { seat, back, leg, pedestal, backH }).
export function chair(d, it, o) {
  const { ctx, K } = d, b = ib(it), f = it.f, s = o.seatH ?? it.h * 0.48, bh0 = o.backH ?? it.h, t = o.backT ?? 2.2, i = 1.2;
  const back = { back: { x0: b.x0 + i, x1: b.x1 - i, z0: b.z0, z1: b.z0 + t }, front: { x0: b.x0 + i, x1: b.x1 - i, z0: b.z1 - t, z1: b.z1 }, left: { x0: b.x1 - t, x1: b.x1, z0: b.z0 + i, z1: b.z1 - i }, right: { x0: b.x0, x1: b.x0 + t, z0: b.z0 + i, z1: b.z1 - i } }[it.facing] ?? { x0: b.x0 + i, x1: b.x1 - i, z0: b.z1 - t, z1: b.z1 };
  const nearBack = it.facing === 'back' || it.facing === 'left';
  // A back between the camera and the sitter stays low, so a seated agent is never hidden behind it.
  const bh = nearBack ? Math.min(bh0, s + 7) : bh0;
  const drawBack = () => K.box(ctx, f, { ...back, h0: s, h1: bh }, o.back, { edge: 'rgba(255,255,255,0.12)' });
  if (!nearBack) drawBack();
  if (o.pedestal) { const cx = it.x, cz = it.z; K.box(ctx, f, { x0: cx - 0.8, x1: cx + 0.8, z0: cz - 0.8, z1: cz + 0.8, h0: 1.5, h1: s }, o.leg); poly(ctx, [K.at(cx - it.w * 0.4, cz, f, 1), K.at(cx, cz - it.d * 0.4, f, 1), K.at(cx + it.w * 0.4, cz, f, 1), K.at(cx, cz + it.d * 0.4, f, 1)], null, o.leg, 1.6); }
  else for (const [x, z] of [[b.x0 + 2, b.z1 - 3], [b.x1 - 3, b.z1 - 3], [b.x0 + 2, b.z0 + 2], [b.x1 - 3, b.z0 + 2]]) K.box(ctx, f, { x0: x, x1: x + 1, z0: z, z1: z + 1, h0: 0, h1: s }, o.leg);
  K.box(ctx, f, { x0: b.x0 + i, x1: b.x1 - i, z0: b.z0 + i, z1: b.z1 - i, h0: s - 2.4, h1: s }, o.seat, { edge: 'rgba(255,255,255,0.14)' });
  if (nearBack) drawBack();
}
// A thin screen standing on a surface (h0..h1) at plan centre (x, z), facing the camera (front) or right.
export function screen(d, f, x, z, w, h0, h1, frame, content, faceRight = false) {
  const { ctx, K } = d;
  const b = faceRight ? { x0: x - 0.8, x1: x + 0.8, z0: z - w / 2, z1: z + w / 2 } : { x0: x - w / 2, x1: x + w / 2, z0: z - 0.8, z1: z + 0.8 };
  K.box(ctx, f, { x0: x - 0.6, x1: x + 0.6, z0: z - 0.2, z1: z + 1.4, h0: h0, h1: h0 + (h1 - h0) * 0.3 }, frame);
  K.box(ctx, f, { ...b, h0: h0 + (h1 - h0) * 0.22, h1 }, frame);
  const H0 = h0 + (h1 - h0) * 0.22 + 1, H1 = h1 - 1;
  if (faceRight) K.onFace(ctx, f, 'right', b.x1, b.z0 + 1, b.z1 - 1, H0, H1, w - 2, H1 - H0, g => content(g, w - 2, H1 - H0));
  else K.onFace(ctx, f, 'front', b.z0, b.x0 + 1, b.x1 - 1, H0, H1, w - 2, H1 - H0, g => content(g, w - 2, H1 - H0));
}
// Glyph rows on a screen (code, runes): deterministic, scrolling when live.
export function glyphRows(g, w, h, T, seed, cols, o = {}) {
  const lh = o.lh ?? 2.2, rows = Math.floor(h / lh), sc = o.scroll ? Math.floor(T * (o.speed ?? 2)) : 0;
  for (let r = 0; r < rows; r++) { const k = r + sc, ind = Math.floor(h1(k, seed, 'i') * 3) * 2, len = (0.25 + h1(k, seed, 'l') * 0.6) * (w - ind - 2); g.fillStyle = cols[Math.floor(h1(k, seed, 'c') * cols.length)]; g.fillRect(1 + ind, 1 + r * lh, len, lh * 0.5); }
}

// ---- Construction stages: the same semantic stage geometry, dressed by the style's materials. ----
// m: { stake, string, dirt, slab, rebar, frame, scaffold, plank, wall, roof, crate, cone, tarp, accent }
export function drawSite(d, site, m) {
  const { ctx, K } = d, u = site.u, f = site.f, si = stageIndex(site.p.stage), T = d.reduced ? 0 : d.T;
  const W = u.x1 - u.x0, D = u.z1 - u.z0;
  // Planning: stakes and string lines at the corners, a plan table.
  if (si >= stageIndex('site-preparation')) inPlan(d, f, g => { g.fillStyle = m.dirt; g.fillRect(u.x0 - 4, u.z0 - 4, W + 8, D + 8); g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 40; i++) g.fillRect(u.x0 + h1(i, site.p.id, 'dx') * W, u.z0 + h1(i, site.p.id, 'dz') * D, 2, 1); });
  const corners = [[u.x0, u.z1], [u.x1, u.z1], [u.x0, u.z0], [u.x1, u.z0]];
  if (si <= stageIndex('site-preparation')) {
    ctx.strokeStyle = m.string; ctx.lineWidth = 0.8; ctx.setLineDash([3, 2]); ctx.beginPath(); for (const [x, z] of [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1], [u.x0, u.z0]]) ctx.lineTo(...K.at(x, z, f, 4)); ctx.stroke(); ctx.setLineDash([]);
    for (const [x, z] of corners) K.box(ctx, f, { x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, h0: 0, h1: 8 }, m.stake);
  }
  if (si >= stageIndex('foundation')) K.box(ctx, f, { ...u, h0: 0, h1: 3 }, m.slab, { edge: 'rgba(255,255,255,0.25)' });
  if (si === stageIndex('foundation')) for (let x = u.x0 + 6; x < u.x1; x += 8) { const [a, b] = [K.at(x, u.z0 + 2, f, 4), K.at(x, u.z1 - 2, f, 4)]; ctx.strokeStyle = m.rebar; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  const top = si >= stageIndex('exterior') ? HT : HT * Math.min(1, 0.4 + 0.3 * (si - stageIndex('structure') + 1));
  // Back and left walls rise from exterior on; the frame and scaffold stand from structure on.
  if (si >= stageIndex('exterior')) {
    K.box(ctx, f, { x0: u.x0, x1: u.x1, z0: u.z1 - 3, z1: u.z1, h0: 3, h1: si >= stageIndex('systems') ? HT : HT * 0.7 }, m.wall);
    K.box(ctx, f, { x0: u.x0, x1: u.x0 + 3, z0: u.z0, z1: u.z1 - 3, h0: 3, h1: si >= stageIndex('systems') ? HT : HT * 0.7 }, m.wall);
  }
  if (si >= stageIndex('structure') && si < stageIndex('inspection')) {
    for (const [x, z] of corners) K.box(ctx, f, { x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5, h0: 3, h1: top }, m.frame);
    for (const z of [u.z0, u.z1]) K.box(ctx, f, { x0: u.x0, x1: u.x1, z0: z - 1, z1: z + 1, h0: top - 3, h1: top }, m.frame);
    for (const x of [u.x0, u.x1]) K.box(ctx, f, { x0: x - 1, x1: x + 1, z0: u.z0, z1: u.z1, h0: top - 3, h1: top }, m.frame);
    // Scaffold along the front: poles, two plank decks and cross braces.
    const z = u.z0 - 5;
    for (let x = u.x0; x <= u.x1 + 0.1; x += Math.max(16, W / 4)) K.box(ctx, f, { x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, h0: 0, h1: top + 8 }, m.scaffold);
    for (const hh of [top * 0.45, top * 0.9]) K.box(ctx, f, { x0: u.x0 - 1, x1: u.x1 + 1, z0: z - 2.5, z1: z + 2.5, h0: hh, h1: hh + 1.4 }, m.plank);
    ctx.strokeStyle = m.scaffold; ctx.lineWidth = 0.7; ctx.beginPath(); for (let x = u.x0; x + 16 <= u.x1 + 0.1; x += Math.max(16, W / 4)) { ctx.moveTo(...K.at(x, z, f, 0)); ctx.lineTo(...K.at(x + Math.max(16, W / 4), z, f, top * 0.45)); } ctx.stroke();
  }
  if (si >= stageIndex('systems') && si < stageIndex('inspection')) { ctx.strokeStyle = m.accent; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...K.at(u.x0 + 3, u.z1 - 3, f, HT * 0.82)); ctx.lineTo(...K.at(u.x1, u.z1 - 3, f, HT * 0.82)); ctx.stroke(); }
  // Materials: stacked crates/blocks and a tarp near the site (from site preparation through furnishing).
  if (si >= stageIndex('site-preparation') && si < stageIndex('inspection')) {
    const x = u.x1 + 6, z = u.z0 + 4;
    K.box(ctx, f, { x0: x, x1: x + 10, z0: z, z1: z + 8, h0: 0, h1: 6 }, m.crate, { edge: 'rgba(0,0,0,0.2)' });
    K.box(ctx, f, { x0: x + 1, x1: x + 9, z0: z + 1, z1: z + 7, h0: 6, h1: 11 }, m.crate, { edge: 'rgba(0,0,0,0.2)' });
    K.box(ctx, f, { x0: x, x1: x + 12, z0: z + 10, z1: z + 16, h0: 0, h1: 3 }, m.plank);
    for (const [cx, cz] of [[u.x0 - 3, u.z0 - 3], [u.x1 + 3, u.z0 - 3]]) m.cone(ctx, K.at(cx, cz, f, 0));
  }
  // Inspection: a checked flag on the slab.
  // The style's own vocabulary for this stage (its crews, machines and materials) over the shared geometry.
  m.stage?.(d, site, si, { top, W, D });
  if (si === stageIndex('inspection')) { const [px, py] = K.at(u.x1 - 4, u.z0 + 4, f, 0); ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 26); ctx.stroke(); ctx.fillStyle = m.accent; ctx.beginPath(); ctx.moveTo(px, py - 26); ctx.lineTo(px + 10 + Math.sin(T * 3) * 1.5, py - 22); ctx.lineTo(px, py - 18); ctx.fill(); }
}
// A small refit inside a working room: barrier, a crate and the thing being fitted (outline).
export function drawRefit(d, site, m) {
  const { ctx, K } = d, u = site.u, f = site.f;
  ctx.strokeStyle = m.tape; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); for (const [x, z] of [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1], [u.x0, u.z0]]) ctx.lineTo(...K.at(x, z, f, 10)); ctx.stroke(); ctx.setLineDash([]);
  for (const [x, z] of [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1]]) K.box(ctx, f, { x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, h0: 0, h1: 11 }, m.stake);
  const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2;
  K.box(ctx, f, { x0: cx - 6, x1: cx + 6, z0: cz - 4, z1: cz + 4, h0: 0, h1: 8 }, m.crate, { edge: 'rgba(0,0,0,0.2)' });
}

// Back-wall spans taken by decor (windows avoid them), per storey and wall line.
export function decorSpans(model) { const out = []; for (const dc of model.decor) out.push({ f: dc.f, z: dc.z, s: dc.x0 - 4, e: dc.x1 + 4 }); return out; }
// Tall items standing against a wall line (windows avoid them).
export function tallSpans(model) { return model.items.filter(it => it.h > 40).map(it => ({ f: it.f, x0: it.x - it.w / 2 - 3, x1: it.x + it.w / 2 + 3, z0: it.z - it.d / 2 - 3, z1: it.z + it.d / 2 + 3 })); }
// Window positions along a far wall piece: evenly spaced, clear of doors, decor and tall furniture.
export function windowsOf(w, decor, tall, width, gap) {
  if (!w.far || w.h0 > 0) return [];
  const out = [], L = w.e - w.s, n = Math.floor((L - gap) / (width + gap));
  if (n < 1) return out;
  const pad = (L - n * width - (n - 1) * gap) / 2;
  for (let k = 0; k < n; k++) {
    const s = w.s + pad + k * (width + gap), e = s + width;
    if ((w.doors ?? []).some(o => o.e > s - 4 && o.s < e + 4)) continue;
    if (w.axis === 'z' && decor.some(q => q.f === w.f && Math.abs(q.z - w.at) < 2 && q.e > s && q.s < e)) continue;
    if (tall.some(t => t.f === w.f && (w.axis === 'z' ? t.z1 > w.at - 20 && t.z0 < w.at + 4 && t.x1 > s && t.x0 < e : t.x0 < w.at + 20 && t.x1 > w.at - 4 && t.z1 > s && t.z0 < e))) continue;
    out.push([s, e]);
  }
  return out;
}
// The wall a door is cut into (its type decides how the frame is drawn).
export function wallOfDoor(model, dr) {
  const at = dr.axis === 'z' ? dr.a.z : dr.a.x, lo = dr.axis === 'z' ? 'x' : 'z', s = Math.min(dr.a[lo], dr.b[lo]), e = Math.max(dr.a[lo], dr.b[lo]);
  return model.walls.find(w => w.f === dr.f && w.axis === dr.axis && Math.abs(w.at - at) < 1 && w.s <= s + 1 && w.e >= e - 1) ?? model.walls.find(w => w.f === dr.f && w.axis === dr.axis && Math.abs(w.at - at) < 1) ?? null;
}
// Face of a wall piece the viewer sees (the inside face for far walls, the outside face for near walls).
export function wallFace(w) {
  const b = w.box;
  if (w.axis === 'z') return { kind: 'front', c: b.z0, a: w.s, b: w.e };
  return { kind: 'right', c: b.x1, a: w.s, b: w.e };
}

// A box turned by angle a (plan radians) about its centre: the faces turned towards the camera, then the top.
export function orientedBox(d, f, cx, cz, L, W, h0, h1, a, col, o = {}) {
  const { ctx, K } = d, c = Math.cos(a), s = Math.sin(a), pts = [[L / 2, W / 2], [L / 2, -W / 2], [-L / 2, -W / 2], [-L / 2, W / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
  const faces = [];
  for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4], nx = -(q[1] - p[1]), nz = q[0] - p[0], L2 = Math.hypot(nx, nz) || 1, vis = (nx - nz) / L2; if (vis > 0.02) faces.push({ p, q, vis, k: 0.62 + 0.3 * (nx / L2 < 0 ? 1 : 0.5) * Math.abs(nz / L2) + 0.12 * vis }); }
  for (const fc of faces.sort((A, B) => A.vis - B.vis)) poly(ctx, [K.at(fc.p[0], fc.p[1], f, h0), K.at(fc.q[0], fc.q[1], f, h0), K.at(fc.q[0], fc.q[1], f, h1), K.at(fc.p[0], fc.p[1], f, h1)], o.side ?? shade(col, Math.min(0.95, fc.k)));
  poly(ctx, pts.map(([x, z]) => K.at(x, z, f, h1)), o.top ?? shade(col, 1.05), o.edge, 0.7);
  return pts;
}

// The lounge's fireplace: a lounge with no counter of its own gets a fireplace on its outer left (or back) wall, at the
// clear span nearest the wall's middle, in place of any window there. Both styles use the same spot (a look for the
// room, like its rug), so Modern and Fantasy agree where it is. Returns [{ w, c (centre along the wall), f, room }].
export function hearthSpots(model, winOf) {
  const out = [];
  for (const room of model.rooms) {
    const r = room.r, inRoom = it => it.f === room.level && it.x > r.x0 && it.x < r.x1 && it.z > r.z0 && it.z < r.z1;
    if (!/lounge/.test(room.kind) || model.items.some(it => it.type === 'counter' && inRoom(it))) continue;
    for (const type of ['left', 'back']) {
      const w = model.walls.find(q => q.f === room.level && q.type === type && q.h0 === 0 && Math.abs(q.at - (type === 'left' ? r.x0 : r.z1)) < 1); if (!w) continue;
      const a = Math.max(w.s, type === 'left' ? r.z0 : r.x0) + 28, b = Math.min(w.e, type === 'left' ? r.z1 : r.x1) - 28; if (b < a) continue;
      const near = it => (type === 'left' ? it.x - it.w / 2 < w.at + 34 : it.z + it.d / 2 > w.at - 34);
      const clear = c => !model.items.some(it => inRoom(it) && near(it) && (type === 'left' ? it.z + it.d / 2 > c - 28 && it.z - it.d / 2 < c + 28 : it.x + it.w / 2 > c - 28 && it.x - it.w / 2 < c + 28))
        && !(type === 'back' && model.decor.some(q => q.f === w.f && Math.abs(q.z - w.at) < 2 && q.x1 > c - 30 && q.x0 < c + 30));
      const mid = (a + b) / 2, cs = []; for (let c = a; c <= b; c += 4) cs.push(c);
      const c = cs.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid)).find(clear); if (c === undefined) continue;
      winOf.set(w, (winOf.get(w) ?? []).filter(([s, e]) => e < c - 30 || s > c + 30));
      out.push({ w, c, f: w.f, room, axis: w.axis, at: w.at }); break;
    }
  }
  return out;
}
// A plan box standing against a hearth spot's wall: d0..d1 out from the wall into the room, s0..s1 along it.
export function spotBox(sp, d0, d1, s0, s1) { return sp.axis === 'x' ? { x0: sp.at + d0, x1: sp.at + d1, z0: sp.c + s0, z1: sp.c + s1 } : { x0: sp.c + s0, x1: sp.c + s1, z0: sp.at - d1, z1: sp.at - d0 }; }
// The camera-facing face of such a box: [kind, c, a, b] for K.onFace.
export function spotFace(sp, b) { return sp.axis === 'x' ? ['right', b.x1, b.z0, b.z1] : ['front', b.z0, b.x0, b.x1]; }
// A plan point d out from the wall at offset s along it.
export function spotAt(sp, d, s = 0) { return sp.axis === 'x' ? [sp.at + d, sp.c + s] : [sp.c + s, sp.at - d]; }

// Ambient life shared by both styles (each passes its own palette): a small flock wheeling over the island by day
// and butterflies around flowering shrubs. Quiet, few and slow, so they never read as activity.
export function ambientLife(d, model, o = {}) {
  const { ctx, K } = d, T = d.reduced ? 0 : d.T, day = 1 - (d.night ?? 0);
  if (day < 0.2) return;
  const b = model.buildings[0]?.r; if (!b) return;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, R = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.7;
  ctx.strokeStyle = o.bird ?? '#2a2d33'; ctx.lineWidth = 1.1; ctx.globalAlpha = day;
  for (let i = 0; i < 5; i++) {
    const a = T * 0.12 + i * 0.22, r = R + (i % 2) * 24, [x, y] = K.at(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0, HT + 150 + i * 6 + Math.sin(T * 0.7 + i) * 6), fl = Math.sin(T * 7 + i * 1.7) * 2.5;
    ctx.beginPath(); ctx.moveTo(x - 4, y - fl); ctx.quadraticCurveTo(x - 2, y - 1.5, x, y); ctx.quadraticCurveTo(x + 2, y - 1.5, x + 4, y - fl); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const shrubs = model.plants.filter(p => p.kind === 'flowerShrub').slice(0, 8);
  shrubs.forEach((p, i) => {
    const ph = T * 0.8 + i * 2.1, [x, y] = K.at(p.x + Math.sin(ph) * 12, p.z + Math.cos(ph * 0.7) * 10, 0, 14 + Math.sin(ph * 2.3) * 5), w = 2.2 * Math.abs(Math.sin(T * 9 + i));
    ctx.fillStyle = (o.butterflies ?? ['#f2d24b', '#ffffff', '#ef8fb0'])[i % 3]; ctx.globalAlpha = day;
    ctx.beginPath(); ctx.ellipse(x - w * 0.6, y, w, 1.6, 0, 0, TAU); ctx.ellipse(x + w * 0.6, y, w, 1.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  });
}
