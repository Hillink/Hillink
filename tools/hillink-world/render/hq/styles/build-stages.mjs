// Construction vocabularies: what each style builds WITH at each construction stage. The stage, the site rectangle
// and the shared geometry (slab, frame, scaffold, rising walls) come from common.drawSite, so both styles show the
// same state over the same footprint; these drawers only add the style's own crews, machines and materials.
//   Modern   survey station -> excavator -> formwork and mixer -> tower crane with steel -> glass curtain panels ->
//            ducts, cable trays and conduit -> equipment pallets -> activation (a light sweep and status beacons)
//   Fantasy  surveyor's staff and chalk runes -> earth mounds and barrow -> dressed stone footing -> treadwheel crane
//            and timber -> masonry courses -> roof rafters and slates -> crated artifacts and crystals -> a rune circle
//            that wakes the room (magical activation)
import { TAU, HT, glow, h1, inPlan } from './common.mjs';
import { stageIndex as S } from '../../../procgen/construction.mjs';

const tt = d => (d.reduced ? 0 : d.T);
const line = (ctx, a, b, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
const between = (si, a, b) => si >= S(a) && si <= S(b);

// Course lines and staggered joints painted over the two rising walls (back wall front face, left wall right face).
function courses(d, site, hw, col, step, joint) {
  const { ctx, K } = d, u = site.u, f = site.f, zb = u.z1 - 3, xl = u.x0 + 3;
  ctx.strokeStyle = col; ctx.lineWidth = 0.5; ctx.beginPath();
  for (let h = 3 + step, k = 0; h < hw - 0.5; h += step, k++) {
    ctx.moveTo(...K.at(xl, zb, f, h)); ctx.lineTo(...K.at(u.x1, zb, f, h));
    ctx.moveTo(...K.at(xl, u.z0, f, h)); ctx.lineTo(...K.at(xl, zb, f, h));
    if (joint) {
      for (let x = xl + (k % 2 ? joint / 2 : 0) + joint; x < u.x1; x += joint) { ctx.moveTo(...K.at(x, zb, f, h)); ctx.lineTo(...K.at(x, zb, f, h - step)); }
      for (let z = u.z0 + (k % 2 ? joint / 2 : 0) + joint; z < zb; z += joint) { ctx.moveTo(...K.at(xl, z, f, h)); ctx.lineTo(...K.at(xl, z, f, h - step)); }
    }
  }
  ctx.stroke();
}

export function modernStage() {
  return function stage(d, site, si, { top, W, D }) {
    const { ctx, K } = d, u = site.u, f = site.f, T = tt(d), hw = si >= S('systems') ? HT : HT * 0.7;
    // Survey: a total station on a tripod off the open side, a red laser ticking along the string line.
    if (si <= S('site-preparation')) {
      const [x, y] = K.at(u.x1 - 24, u.z1 + 20, f, 0);
      for (const dx of [-6, 0, 6]) line(ctx, [x + dx, y + (dx ? 1 : 4)], [x, y - 24], '#3a3f4a', 1.2);
      ctx.fillStyle = '#f2b630'; ctx.fillRect(x - 5, y - 32, 10, 8); ctx.fillStyle = '#1d2230'; ctx.fillRect(x - 2, y - 30, 4, 3);
      const t = (T * 0.4) % 1, [lx, ly] = K.at(u.x1 - t * W, u.z1, f, 4); ctx.strokeStyle = 'rgba(255,60,60,0.55)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + 5, y - 29); ctx.lineTo(lx, ly); ctx.stroke(); glow(ctx, lx, ly, 6, '#ff3c3c', 0.5);
    }
    // Site preparation: a compact excavator digging, a spoil heap beside it.
    if (si === S('site-preparation')) {
      const cx = u.x0 + W * 0.7, cz = u.z0 + D * 0.55, s = 2.6;
      inPlan(d, f, g => { g.fillStyle = '#7d6346'; g.beginPath(); g.ellipse(cx + 26 * s, cz + 10 * s, 14 * s, 10 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#5c4632'; g.beginPath(); g.ellipse(cx - 20 * s, cz - 2 * s, 14 * s, 8 * s, 0, 0, TAU); g.fill(); });
      K.box(ctx, f, { x0: cx + 18 * s, x1: cx + 34 * s, z0: cz + 2 * s, z1: cz + 18 * s, h0: 0, h1: 6 * s }, '#8a6c4c');
      for (const z of [cz - 5 * s, cz + 3 * s]) K.box(ctx, f, { x0: cx - 9 * s, x1: cx + 9 * s, z0: z, z1: z + 2.4 * s, h0: 0, h1: 3.5 * s }, '#2a2d33', { edge: 'rgba(255,255,255,0.15)' });
      K.box(ctx, f, { x0: cx - 7 * s, x1: cx + 7 * s, z0: cz - 4.5 * s, z1: cz + 4.5 * s, h0: 3.5 * s, h1: 11 * s }, '#f2b630', { edge: 'rgba(0,0,0,0.25)' });
      K.box(ctx, f, { x0: cx - 7 * s, x1: cx - 0.5 * s, z0: cz - 4.5 * s, z1: cz + 1 * s, h0: 11 * s, h1: 19 * s }, '#2a2d33', { front: 'rgba(150,195,230,0.85)', right: 'rgba(120,170,210,0.85)', top: '#f2b630' });
      K.box(ctx, f, { x0: cx + 2 * s, x1: cx + 7 * s, z0: cz - 4.5 * s, z1: cz + 4.5 * s, h0: 11 * s, h1: 13 * s }, '#3a3f4a');
      const a = Math.sin(T * 1.1) * 0.25, [bx, by] = K.at(cx - 7 * s, cz - 2 * s, f, 8 * s), [ex, ey] = [bx - 24 * s * 0.6 + a * 10, by - 12 * s * 0.6 + a * 10], [kx, ky] = [ex - 6 * s * 0.6, ey + 18 * s * 0.6 - a * 6];
      line(ctx, [bx, by], [ex, ey], '#e0a020', 5); line(ctx, [ex, ey], [kx, ky], '#e0a020', 3.6); line(ctx, [bx + 2, by - 6], [ex + 2, ey - 2], '#6b7280', 1.2);
      ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.moveTo(kx - 7, ky - 4); ctx.lineTo(kx + 6, ky); ctx.lineTo(kx, ky + 8); ctx.closePath(); ctx.fill();
    }
    // Foundation: plywood formwork along the slab edges, a concrete mixer with a turning drum.
    if (si === S('foundation')) {
      for (const z of [u.z0 - 1, u.z1]) K.box(ctx, f, { x0: u.x0 - 1, x1: u.x1 + 1, z0: z, z1: z + 1, h0: 0, h1: 5 }, '#d9b47a');
      for (const x of [u.x0 - 1, u.x1]) K.box(ctx, f, { x0: x, x1: x + 1, z0: u.z0, z1: u.z1, h0: 0, h1: 5 }, '#d9b47a');
      const mx = u.x0 + W * 0.55, mz = u.z1 + 34, s = 2;
      K.box(ctx, f, { x0: mx - 20 * s, x1: mx + 20 * s, z0: mz - 7 * s, z1: mz + 7 * s, h0: 3 * s, h1: 6 * s }, '#3a3f4a');
      K.box(ctx, f, { x0: mx + 10 * s, x1: mx + 22 * s, z0: mz - 7 * s, z1: mz + 7 * s, h0: 6 * s, h1: 18 * s }, '#e8ecef', { edge: 'rgba(0,0,0,0.15)' });
      K.box(ctx, f, { x0: mx + 16 * s, x1: mx + 22.2 * s, z0: mz - 6 * s, z1: mz + 6 * s, h0: 12 * s, h1: 17 * s }, '#9fc7e6');
      const [dx, dy] = K.at(mx - 4 * s, mz, f, 14 * s); ctx.save(); ctx.translate(dx, dy); ctx.rotate(-0.38);
      ctx.fillStyle = '#d24a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 16 * s, 8 * s, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.ellipse(0, -3 * s, 14 * s, 3 * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const p = ((T * 0.6 + i / 3) % 1) * 2 - 1; ctx.beginPath(); ctx.ellipse(p * 12 * s, 0, 2 * s, 7.5 * s * Math.sqrt(1 - p * p * 0.7), 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
      for (const wx of [mx - 14 * s, mx + 14 * s]) { const [x, y] = K.at(wx, mz - 7 * s, f, 3 * s); ctx.fillStyle = '#1b1e24'; ctx.beginPath(); ctx.ellipse(x, y, 3.6 * s, 3.6 * s, 0, 0, TAU); ctx.fill(); }
      const [cx, cy] = K.at(mx - 20 * s, mz, f, 10 * s), [sx, sy] = K.at(mx - 34 * s, u.z1 - 8, f, 3); line(ctx, [cx, cy], [sx, sy], '#9aa0a6', 2);
    }
    // Structure to systems: a tower crane over the back corner; its hook carries the stage's material.
    if (between(si, 'structure', 'systems')) {
      const cx = u.x1 - 10, cz = u.z1 - 10, Hm = HT + 90, [bx, by] = K.at(cx, cz, f, 0), [, ty] = K.at(cx, cz, f, Hm);
      ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx - 3, ty); ctx.moveTo(bx + 3, by); ctx.lineTo(bx + 3, ty);
      for (let y = by, k = 0; y > ty; y -= 6, k++) { ctx.moveTo(bx + (k % 2 ? 3 : -3), y); ctx.lineTo(bx + (k % 2 ? -3 : 3), y - 6); } ctx.stroke();
      const L = Math.min(W * 0.9, 260), j0 = K.at(cx + 34, cz, f, Hm), j1 = K.at(cx - L, cz, f, Hm);
      line(ctx, j0, j1, '#e0a020', 2.2); line(ctx, [j1[0], j1[1] - 4], [j0[0], j0[1] - 4], '#e0a020', 0.8);
      ctx.strokeStyle = '#e0a020'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let i = 0; i <= 20; i++) { const x = cx + 34 - ((L + 34) * i) / 20, p = K.at(x, cz, f, Hm); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (i % 2 ? 3 : -3), p[1] - 4); } ctx.stroke();
      const [px, py] = K.at(cx, cz, f, Hm + 16); line(ctx, [px, py], j1, '#c9ced4', 0.6); line(ctx, [px, py], j0, '#c9ced4', 0.6); line(ctx, [bx, ty], [px, py], '#e0a020', 1.4);
      K.box(ctx, f, { x0: cx + 22, x1: cx + 34, z0: cz - 5, z1: cz + 5, h0: Hm - 9, h1: Hm }, '#9aa0a6');
      K.box(ctx, f, { x0: cx - 6, x1: cx + 2, z0: cz - 5, z1: cz + 5, h0: Hm - 8, h1: Hm }, '#3a3f4a', { front: 'rgba(120,170,210,0.9)' });
      const tr = 0.45 + 0.35 * Math.sin(T * 0.25), hx = cx - 20 - (L - 30) * tr, hh = top + 34 + Math.sin(T * 0.5) * 6, [hx1, hy1] = K.at(hx, cz, f, Hm), [hx2, hy2] = K.at(hx, cz, f, hh);
      line(ctx, [hx1, hy1], [hx2, hy2], '#2a2d33', 0.6); glow(ctx, bx, ty - 4, 5, '#ff3c3c', 0.5 + 0.5 * Math.sin(T * 3));
      if (si === S('structure')) K.box(ctx, f, { x0: hx - 22, x1: hx + 22, z0: cz - 2, z1: cz + 2, h0: hh - 6, h1: hh - 2 }, '#5e6672', { edge: 'rgba(255,255,255,0.3)' });
      else if (si === S('exterior')) K.box(ctx, f, { x0: hx - 14, x1: hx + 14, z0: cz - 0.6, z1: cz + 0.6, h0: hh - 30, h1: hh - 2 }, null, { front: 'rgba(120,180,230,0.6)', right: '#5e6672', top: '#5e6672' });
      else K.box(ctx, f, { x0: hx - 8, x1: hx + 8, z0: cz - 6, z1: cz + 6, h0: hh - 14, h1: hh - 2 }, '#c9ced4', { edge: 'rgba(0,0,0,0.2)' });
    }
    // Structure: a stack of I-beams on the ground, cross bracing in the back bay.
    if (si === S('structure')) {
      for (let i = 0; i < 4; i++) K.box(ctx, f, { x0: u.x0 + W * 0.2, x1: u.x0 + W * 0.2 + 70, z0: u.z1 + 14 + (i % 2) * 5, z1: u.z1 + 19 + (i % 2) * 5, h0: i * 2.5, h1: i * 2.5 + 2.5 }, '#5e6672', { edge: 'rgba(255,255,255,0.3)' });
      const zb = u.z1 - 1, a = K.at(u.x0, zb, f, 3), b = K.at(u.x0 + W / 2, zb, f, top), c = K.at(u.x0 + W / 2, zb, f, 3), e = K.at(u.x0, zb, f, top);
      line(ctx, a, b, '#5e6672', 1); line(ctx, c, e, '#5e6672', 1);
    }
    // Exterior: glass curtain panels clipped onto the rising walls, mullions over them.
    if (si >= S('exterior')) {
      const zb = u.z1 - 3, xl = u.x0 + 3, n = Math.max(3, Math.round(W / 34)), done = si >= S('systems') ? n : Math.ceil(n * 0.6);
      for (let i = 0; i < done; i++) { const a = xl + ((u.x1 - xl) * i) / n, b = xl + ((u.x1 - xl) * (i + 1)) / n; ctx.fillStyle = 'rgba(140,190,230,0.55)'; ctx.beginPath(); for (const p of K.faceQuad(f, 'front', zb, a + 1, b - 1, hw * 0.25, hw - 4)) ctx.lineTo(...p); ctx.closePath(); ctx.fill(); line(ctx, K.at(b, zb, f, 3), K.at(b, zb, f, hw), '#3a3f4a', 1); }
      line(ctx, K.at(xl, zb, f, hw * 0.25), K.at(u.x1, zb, f, hw * 0.25), '#3a3f4a', 1);
    }
    // Systems: silver ductwork and an orange cable tray under the ceiling line, conduit drops.
    if (si === S('systems')) {
      const zb = u.z1 - 8, hd = HT * 0.86;
      K.box(ctx, f, { x0: u.x0 + 6, x1: u.x1 - 6, z0: zb - 6, z1: zb, h0: hd - 6, h1: hd }, '#c9ced4', { edge: 'rgba(255,255,255,0.4)' });
      for (let x = u.x0 + 30; x < u.x1 - 10; x += 40) K.box(ctx, f, { x0: x - 4, x1: x + 4, z0: zb - 14, z1: zb - 6, h0: hd - 4, h1: hd - 1 }, '#aab0b6');
      K.box(ctx, f, { x0: u.x0 + 6, x1: u.x0 + 9, z0: u.z0 + 6, z1: u.z1 - 8, h0: hd - 10, h1: hd - 8 }, '#ff7a2f');
      for (let z = u.z0 + 20; z < u.z1 - 10; z += 36) line(ctx, K.at(u.x0 + 4, z, f, hd - 9), K.at(u.x0 + 4, z, f, 8), '#ff7a2f', 0.8);
      for (let x = u.x0 + 24; x < u.x1 - 10; x += 52) { const [lx, ly] = K.at(x, u.z0 + D / 2, f, hd - 2); ctx.fillStyle = 'rgba(255,248,225,0.9)'; ctx.fillRect(lx - 8, ly - 1, 16, 2); }
    }
    // Furnishing: equipment pallets in protective wrap, a pallet jack, screens leaning ready to mount.
    if (si === S('furnishing')) {
      for (let i = 0; i < 3; i++) { const x = u.x0 + W * (0.25 + i * 0.22), z = u.z0 + D * 0.4; K.box(ctx, f, { x0: x - 9, x1: x + 9, z0: z - 7, z1: z + 7, h0: 0, h1: 2 }, '#c8a26a'); K.box(ctx, f, { x0: x - 8, x1: x + 8, z0: z - 6, z1: z + 6, h0: 2, h1: i === 1 ? 22 : 12 }, i === 1 ? '#2a2f3a' : '#e8e4da', { edge: 'rgba(255,255,255,0.35)' }); }
      const [jx, jy] = K.at(u.x0 + W * 0.85, u.z0 + D * 0.3, f, 0); ctx.fillStyle = '#d24a3a'; ctx.fillRect(jx - 7, jy - 3, 14, 3); line(ctx, [jx - 7, jy - 3], [jx - 11, jy - 14], '#2a2d33', 1.2);
      for (let i = 0; i < 2; i++) K.box(ctx, f, { x0: u.x0 + 12 + i * 4, x1: u.x0 + 14 + i * 4, z0: u.z1 - 40, z1: u.z1 - 14, h0: 0, h1: 16 }, '#1d2230', { right: '#4aa3ff' });
    }
    // Inspection = activation: a scan line sweeps the slab, beacons turn green one by one.
    if (si === S('inspection')) {
      const t = (T * 0.25) % 1;
      inPlan(d, f, g => { const x = u.x0 + t * W, gr = g.createLinearGradient(x - 30, 0, x + 4, 0); gr.addColorStop(0, 'rgba(74,163,255,0)'); gr.addColorStop(1, 'rgba(74,163,255,0.7)'); g.fillStyle = gr; g.fillRect(Math.max(u.x0, x - 30), u.z0, Math.min(34, x - u.x0 + 4), D); });
      const pts = [[u.x0 + 6, u.z0 + 6], [u.x1 - 6, u.z0 + 6], [u.x1 - 6, u.z1 - 8], [u.x0 + 6, u.z1 - 8]];
      pts.forEach(([x, z], i) => { const on = t > i / 4, [px, py] = K.at(x, z, f, 0); line(ctx, [px, py], [px, py - 14], '#3a3f4a', 1); glow(ctx, px, py - 15, 7, on ? '#2fbf71' : '#f2b630', 0.9); ctx.fillStyle = on ? '#2fbf71' : '#f2b630'; ctx.beginPath(); ctx.arc(px, py - 15, 1.8, 0, TAU); ctx.fill(); });
    }
  };
}

export function fantasyStage({ C, flame, crystal }) {
  return function stage(d, site, si, { top, W, D }) {
    const { ctx, K } = d, u = site.u, f = site.f, T = tt(d), hw = si >= S('systems') ? HT : HT * 0.7, id = site.p.id;
    // Survey: a surveyor's staff with a plumb line, chalk runes at the corners.
    if (si <= S('site-preparation')) {
      const [x, y] = K.at(u.x1 - 24, u.z1 + 20, f, 0); line(ctx, [x, y], [x, y - 24], C.timber, 1.4); ctx.fillStyle = C.gold; ctx.fillRect(x - 3, y - 25, 6, 2);
      const sw = Math.sin(T * 1.2) * 2; line(ctx, [x + 3, y - 24], [x + 3 + sw, y - 12], '#e8d9a8', 0.5); ctx.fillStyle = C.brass; ctx.beginPath(); ctx.moveTo(x + 1.5 + sw, y - 12); ctx.lineTo(x + 4.5 + sw, y - 12); ctx.lineTo(x + 3 + sw, y - 9); ctx.fill();
      for (const [cx, cz] of [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1]]) inPlan(d, f, g => { g.strokeStyle = 'rgba(240,235,215,0.8)'; g.lineWidth = 0.8; g.beginPath(); g.arc(cx, cz, 7, 0, TAU); g.moveTo(cx - 5, cz); g.lineTo(cx + 5, cz); g.moveTo(cx, cz - 5); g.lineTo(cx, cz + 5); g.stroke(); });
    }
    // Site preparation: earth mounds, a wheelbarrow and spades stuck in the ground.
    if (si === S('site-preparation')) {
      const cx = u.x0 + W * 0.6, cz = u.z0 + D * 0.45;
      inPlan(d, f, g => { for (const [dx, dz, r] of [[22, 14, 14], [-20, -6, 11], [4, 26, 9]]) { g.fillStyle = '#6e5538'; g.beginPath(); g.ellipse(cx + dx, cz + dz, r, r * 0.7, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,200,0.12)'; g.beginPath(); g.ellipse(cx + dx - 2, cz + dz + 2, r * 0.5, r * 0.3, 0, 0, TAU); g.fill(); } });
      const [bx, by] = K.at(cx - 4, cz - 14, f, 0); ctx.fillStyle = C.timberLight; ctx.beginPath(); ctx.moveTo(bx - 8, by - 8); ctx.lineTo(bx + 6, by - 8); ctx.lineTo(bx + 3, by - 3); ctx.lineTo(bx - 6, by - 3); ctx.fill(); ctx.fillStyle = '#5c4632'; ctx.beginPath(); ctx.ellipse(bx - 1, by - 8, 7, 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.iron; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx + 7, by - 3, 2.5, 0, TAU); ctx.stroke(); line(ctx, [bx - 6, by - 4], [bx - 14, by - 1], C.timber, 1);
      for (const [dx, dz] of [[30, 2], [-26, 10]]) { const [sx, sy] = K.at(cx + dx, cz + dz, f, 0); line(ctx, [sx, sy], [sx + 2, sy - 13], C.timber, 1); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(sx - 1.5, sy - 2, 3, 4); }
    }
    // Foundation: a footing of dressed stone along the slab edges, a mason's stack of cut blocks and a mallet.
    if (si >= S('foundation')) {
      for (const z of [u.z0, u.z1 - 6]) K.box(ctx, f, { x0: u.x0, x1: u.x1, z0: z, z1: z + 6, h0: 3, h1: 9 }, '#a3967f', { edge: 'rgba(60,45,30,0.3)' });
      for (const x of [u.x0, u.x1 - 6]) K.box(ctx, f, { x0: x, x1: x + 6, z0: u.z0 + 6, z1: u.z1 - 6, h0: 3, h1: 9 }, '#a3967f', { edge: 'rgba(60,45,30,0.3)' });
      ctx.strokeStyle = 'rgba(60,45,30,0.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let x = u.x0 + 9; x < u.x1; x += 12) { const a = K.at(x, u.z0, f, 3), b = K.at(x, u.z0, f, 9); ctx.moveTo(...a); ctx.lineTo(...b); } for (let z = u.z0 + 9; z < u.z1; z += 12) { const a = K.at(u.x1, z, f, 3), b = K.at(u.x1, z, f, 9); ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke();
    }
    if (between(si, 'foundation', 'structure')) {
      const x = u.x0 + W * 0.4, z = u.z1 + 14;
      for (let i = 0; i < 5; i++) K.box(ctx, f, { x0: x + (i % 3) * 11, x1: x + (i % 3) * 11 + 10, z0: z, z1: z + 7, h0: i < 3 ? 0 : 6, h1: i < 3 ? 6 : 12 }, '#b5a891', { edge: 'rgba(60,45,30,0.35)' });
      const [mx, my] = K.at(x + 38, z + 4, f, 0); line(ctx, [mx, my], [mx + 7, my - 4], C.timber, 1.2); ctx.fillStyle = C.timberLight; ctx.fillRect(mx + 5, my - 7, 5, 4);
    }
    // Structure to roof: a treadwheel crane at the back corner, its rope lifting the stage's load.
    if (between(si, 'structure', 'systems')) {
      const cx = u.x1 - 24, cz = u.z1 - 26, R = 24, [wx, wy] = K.at(cx, cz, f, R + 2), k = d.P.g?.sxx || 1, rx = R * k, a = T * 0.8;
      K.box(ctx, f, { x0: cx - 10, x1: cx + 10, z0: cz - 3, z1: cz + 3, h0: 0, h1: 3 }, C.timber);
      ctx.strokeStyle = C.timber; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(wx, wy, rx, R * 1.05, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(wx, wy, rx * 0.86, R * 0.9, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.9; ctx.beginPath(); for (let i = 0; i < 8; i++) { const t = a + (i * TAU) / 8; ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(t) * rx * 0.86, wy + Math.sin(t) * R * 0.9); } ctx.stroke();
      ctx.fillStyle = C.iron; ctx.beginPath(); ctx.arc(wx, wy, 2, 0, TAU); ctx.fill();
      const jt = K.at(cx - 70, cz, f, top + 46), [mx, my] = K.at(cx + 6, cz, f, 0);
      line(ctx, [mx, my], [wx + 2, wy - R - 30], C.timber, 2.4); line(ctx, [wx + 2, wy - R - 30], jt, C.timber, 2);
      line(ctx, [mx - 20, my + 4], [wx + 2, wy - R - 30], C.timberLight, 1.2);
      const hh = top + 10 + (Math.sin(a * 0.5) * 0.5 + 0.5) * 20, [lx, ly] = K.at(cx - 70, cz, f, hh); line(ctx, jt, [lx, ly], '#e8d9a8', 0.6); line(ctx, [wx, wy], [wx + 2, wy - R - 30], '#e8d9a8', 0.5);
      if (si === S('structure')) K.box(ctx, f, { x0: cx - 92, x1: cx - 48, z0: cz - 2, z1: cz + 2, h0: hh - 6, h1: hh - 2 }, C.timberLight, { edge: 'rgba(0,0,0,0.2)' });
      else if (si === S('exterior')) K.box(ctx, f, { x0: cx - 76, x1: cx - 64, z0: cz - 4, z1: cz + 4, h0: hh - 10, h1: hh - 2 }, '#b5a891', { edge: 'rgba(60,45,30,0.4)' });
      else K.box(ctx, f, { x0: cx - 80, x1: cx - 60, z0: cz - 5, z1: cz + 5, h0: hh - 4, h1: hh - 1 }, '#4a5a68', { edge: 'rgba(255,255,255,0.2)' });
    }
    // Exterior = masonry: courses and joints over the rising walls, a mortar tub and a stepped, unfinished wall top.
    if (si >= S('exterior')) {
      courses(d, site, hw, 'rgba(60,45,30,0.35)', 6, 14);
      if (si === S('exterior')) {
        for (let x = u.x0 + 3, i = 0; x < u.x1 - 8; x += 14, i++) if (h1(i, id, 'step') > 0.45) K.box(ctx, f, { x0: x, x1: x + 12, z0: u.z1 - 3, z1: u.z1, h0: hw, h1: hw + 6 }, C.stone, { edge: 'rgba(60,45,30,0.35)' });
        const [tx, ty] = K.at(u.x0 + W * 0.45, u.z0 + D * 0.35, f, 0); ctx.fillStyle = C.timber; ctx.fillRect(tx - 7, ty - 5, 14, 5); ctx.fillStyle = '#d9d2c2'; ctx.beginPath(); ctx.ellipse(tx, ty - 5, 7, 2, 0, 0, TAU); ctx.fill();
      }
    }
    // Systems = roof: rafter pairs rising to a ridge beam over the frame, a pile of slates waiting.
    if (si === S('systems')) {
      const zm = (u.z0 + u.z1) / 2, rh = top + 46;
      for (let x = u.x0 + 4; x <= u.x1 - 4; x += 24) { line(ctx, K.at(x, u.z0, f, top), K.at(x, zm, f, rh), C.timberLight, 1.6); line(ctx, K.at(x, u.z1, f, top), K.at(x, zm, f, rh), C.timberLight, 1.6); }
      line(ctx, K.at(u.x0 + 4, zm, f, rh), K.at(u.x1 - 4, zm, f, rh), C.timber, 2.4);
      const sl = Math.ceil(((u.x1 - u.x0) / 24) * 0.4);
      for (let i = 0; i < sl; i++) { const x0 = u.x0 + 4 + i * 24; ctx.fillStyle = '#4a5a68'; ctx.beginPath(); for (const p of [K.at(x0, u.z1, f, top), K.at(x0 + 24, u.z1, f, top), K.at(x0 + 24, zm, f, rh), K.at(x0, zm, f, rh)]) ctx.lineTo(...p); ctx.closePath(); ctx.fill(); }
      for (let i = 0; i < 4; i++) K.box(ctx, f, { x0: u.x0 + W * 0.7, x1: u.x0 + W * 0.7 + 14, z0: u.z0 + 14, z1: u.z0 + 24, h0: i * 1.6, h1: i * 1.6 + 1.6 }, '#4a5a68', { edge: 'rgba(255,255,255,0.2)' });
    }
    // Furnishing = artifacts: straw-packed crates, a crystal being set on its plinth, a rolled banner.
    if (si === S('furnishing')) {
      for (let i = 0; i < 3; i++) { const x = u.x0 + W * (0.25 + i * 0.22), z = u.z0 + D * 0.4; K.box(ctx, f, { x0: x - 8, x1: x + 8, z0: z - 6, z1: z + 6, h0: 0, h1: 10 }, '#a8784a', { edge: 'rgba(60,40,20,0.4)' }); const [sx, sy] = K.at(x, z, f, 10); ctx.fillStyle = '#e8cf7a'; ctx.fillRect(sx - 6, sy - 2, 12, 2); if (i === 1) crystal(ctx, sx, sy - 2, 4, '#9fe7ff', T, i); }
      const px = u.x0 + W * 0.8, pz = u.z0 + D * 0.55; K.box(ctx, f, { x0: px - 5, x1: px + 5, z0: pz - 5, z1: pz + 5, h0: 0, h1: 12 }, C.stone, { edge: 'rgba(60,45,30,0.35)' }); const [cx, cy] = K.at(px, pz, f, 12); crystal(ctx, cx, cy - 2 - Math.sin(T) * 2, 5, '#c9a7ff', T, 3);
      const [bx, by] = K.at(u.x0 + 14, u.z1 - 30, f, 0); ctx.fillStyle = C.emerald; ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.4); ctx.fillRect(-14, -4, 28, 5); ctx.fillStyle = C.gold; ctx.fillRect(-14, -4, 2, 5); ctx.fillRect(12, -4, 2, 5); ctx.restore();
    }
    // Inspection = magical activation: a rune circle wakes on the floor, motes rise and the corner stones light.
    if (si === S('inspection')) {
      const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2, r = Math.min(W, D) * 0.36, p = 0.7 + 0.3 * Math.sin(T * 2);
      inPlan(d, f, g => {
        const gr = g.createRadialGradient(cx, cz, 0, cx, cz, r); gr.addColorStop(0, `rgba(159,231,255,${0.28 * p})`); gr.addColorStop(1, 'rgba(159,231,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cz, r, 0, TAU); g.fill();
        g.strokeStyle = `rgba(110,220,255,${0.95 * p})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, cz, r, 0, TAU); g.stroke(); g.lineWidth = 1.8; g.beginPath(); g.arc(cx, cz, r * 0.78, 0, TAU); g.stroke();
        g.beginPath(); for (let i = 0; i <= 6; i++) { const t = T * 0.2 + (i * TAU * 2) / 6 * 1.0; g.lineTo(cx + Math.cos(t) * r * 0.78, cz + Math.sin(t) * r * 0.78); } g.stroke();
        g.fillStyle = `rgba(180,140,255,${0.95 * p})`; for (let i = 0; i < 16; i++) { const t = -T * 0.3 + (i * TAU) / 16; g.save(); g.translate(cx + Math.cos(t) * r * 0.89, cz + Math.sin(t) * r * 0.89); g.rotate(t); g.fillRect(-3, -1, 6, 2); g.fillRect(-1, -3, 2, 6); g.restore(); }
      });
      const [gx, gy] = K.at(cx, cz, f, 0); glow(ctx, gx, gy, r * 0.9, '#9fe7ff', 0.25 * p);
      for (let i = 0; i < 10; i++) { const ph = (T * 0.3 + h1(i, id, 'mote')) % 1, t = h1(i, id, 'a') * TAU, [mx, my] = K.at(cx + Math.cos(t) * r * 0.8, cz + Math.sin(t) * r * 0.8, f, ph * 60); glow(ctx, mx, my, 4, '#c9a7ff', 0.8 * (1 - ph)); }
      for (const [x, z] of [[u.x0 + 3, u.z0 + 3], [u.x1 - 3, u.z0 + 3], [u.x1 - 3, u.z1 - 3], [u.x0 + 3, u.z1 - 3]]) { const [sx, sy] = K.at(x, z, f, 9); glow(ctx, sx, sy, 8, '#ffd27a', 0.8 * p); }
      const [fx, fy] = K.at(u.x0 + 8, u.z0 + 8, f, 9); flame(ctx, fx, fy, 1.4, T, 1);
    }
  };
}
