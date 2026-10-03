// Fantasy HQ exterior: the guild hall as a small castle. How the building's corners, battlements, chimney and dressed
// grounds look. Positions all come from skin.mjs (the World's buildings, walls, doors, forecourts, paths and roads);
// this file only draws them.
//   corners     round stone towers with arrow slits, a corbelled crown, a slate cone, a gold finial and a pennant;
//               a low bastion with a brazier at the near corner
//   roofline    battlements along the far walls, a chimney stack over the hearth with drifting smoke
//   grounds     a tiered fountain, a herb garden with a wattle fence and a beehive, a smithy yard (lean-to, woodpile,
//               anvil, furnace), a hitching rail with barrels and hay, dry-stone walls with ivy, carts, a stone gate
//               arch with a lantern, and a tavern courtyard with trestle tables, a well and lantern strings
import { TAU, HT, LOW, shade, glow, h1, poly, inPlan, pattern, TEX, orientedBox } from './common.mjs';

export function fantasySite({ K, U, model, C, flame, candle, crystal, hearthSpots = [] }) {
  const tt = d => (d.reduced ? 0 : d.T);
  const rectOf = ex => ({ x0: ex.x - ex.w / 2, x1: ex.x + ex.w / 2, z0: ex.z - ex.d / 2, z1: ex.z + ex.d / 2 });
  const topOf = b => Math.max(...b.levels);
  const ell = (d, r) => { const k = d.P.g?.sxx || 1; return [r * k * 1.06, r * 0.5 * 1.06]; };

  // ---- Towers. ----
  // A round stone tower section from h0 to h1: dressed courses, staggered joints, an arrow slit lit from inside at night.
  function towerBody(d, f, cx, cz, r, h0, h1, seed, slit = true) {
    const { ctx, K } = d, [rx, ry] = ell(d, r);
    K.cylinder(ctx, f, cx, cz, h0, h1, r, C.stone, { top: '#a3967f' });
    const [sx] = K.at(cx, cz, f, h0);
    ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(50,40,30,0.32)';
    for (let h = h0 + 6, k = 0; h < h1 - 1; h += 6, k++) {
      const [, y] = K.at(cx, cz, f, h); ctx.beginPath(); ctx.ellipse(sx, y, rx, ry, 0, 0.05, Math.PI - 0.05); ctx.stroke();
      ctx.beginPath(); for (let j = 0; j < 7; j++) { const t = ((j + (k % 2) * 0.5 + 0.25) / 7) * Math.PI, x = sx + Math.cos(t) * rx, yy = y + Math.sin(t) * ry; ctx.moveTo(x, yy); ctx.lineTo(x, yy + 6); } ctx.stroke();
    }
    if (slit) for (const t of [0.62, 0.3]) {
      const hm = h0 + (h1 - h0) * 0.55, [, y] = K.at(cx, cz, f, hm), x = sx + Math.cos(t * Math.PI) * rx * 0.92, yy = y + Math.sin(t * Math.PI) * ry * 0.92;
      ctx.fillStyle = '#2a2420'; ctx.fillRect(x - 1.6, yy - 7, 3.2, 12); ctx.fillStyle = d.night > 0.25 ? `rgba(255,190,90,${0.5 + 0.5 * d.night})` : 'rgba(20,16,12,0.9)'; ctx.fillRect(x - 0.8, yy - 6, 1.6, 10);
      if (d.night > 0.25) glow(ctx, x, yy - 1, 10, '#ffb347', 0.4 * d.night);
    }
  }
  // Battlements round a tower top (merlons on the visible half).
  function crown(d, f, cx, cz, r, h) {
    const { ctx, K } = d, [rx, ry] = ell(d, r);
    K.cylinder(ctx, f, cx, cz, h, h + 4, r, '#c2b59c', { top: '#8c806c' });
    const [sx, sy] = K.at(cx, cz, f, h + 4);
    for (let j = 0; j <= 8; j++) { const t = Math.PI * (1 + j / 8), x = sx + Math.cos(t) * rx * 0.94, y = sy + Math.sin(t) * ry * 0.94; ctx.fillStyle = shade('#c2b59c', 0.8); ctx.fillRect(x - 2.2, y - 6, 4.4, 6); }
    for (let j = 0; j <= 8; j++) { const t = Math.PI * (j / 8), x = sx + Math.cos(t) * rx * 0.96, y = sy + Math.sin(t) * ry * 0.96; ctx.fillStyle = shade('#c2b59c', 0.95 - 0.25 * (Math.cos(t) < 0 ? 0 : Math.cos(t))); ctx.fillRect(x - 2.4, y - 6.5, 4.8, 6.5); ctx.fillStyle = 'rgba(255,240,210,0.35)'; ctx.fillRect(x - 2.4, y - 6.5, 4.8, 0.8); }
  }
  // A conical slate roof with a gold finial and a pennant in the guild's green.
  function cone(d, f, cx, cz, r, h, H, seed) {
    const { ctx, K } = d, T = tt(d), [rx, ry] = ell(d, r), [sx, sy] = K.at(cx, cz, f, h), ax = sx, ay = sy - H;
    ctx.fillStyle = 'rgba(30,24,20,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, rx, ry, 0, 0, TAU); ctx.fill();
    const gr = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0); gr.addColorStop(0, '#6f7f9c'); gr.addColorStop(0.45, '#4d5b78'); gr.addColorStop(1, '#2e374c');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx - rx, sy); ctx.lineTo(ax, ay); ctx.lineTo(sx + rx, sy); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,36,0.4)'; ctx.lineWidth = 0.5;
    for (let k = 1; k < 7; k++) { const q = k / 7, cy = sy - H * (1 - q) * 0 , yy = ay + (sy - ay) * q; ctx.beginPath(); ctx.ellipse(ax, yy, rx * q, ry * q, 0, 0, Math.PI); ctx.stroke(); }
    ctx.beginPath(); for (let j = 1; j < 8; j++) { const t = (j / 8) * Math.PI; ctx.moveTo(ax, ay); ctx.lineTo(sx + Math.cos(t) * rx, sy + Math.sin(t) * ry); } ctx.strokeStyle = 'rgba(20,24,36,0.18)'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx - rx * 0.6, sy + ry * 0.4); ctx.lineTo(ax - 0.5, ay + 2); ctx.stroke();
    // Finial and pennant.
    ctx.strokeStyle = C.brass; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 14); ctx.stroke();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(ax, ay - 2, 1.8, 0, TAU); ctx.fill();
    const L = 16, py = ay - 14; ctx.fillStyle = C.emerald; ctx.beginPath(); ctx.moveTo(ax, py);
    for (let k = 0; k <= 8; k++) ctx.lineTo(ax + (k / 8) * L, py + 2.5 * (k / 8) + Math.sin(T * 3 + k * 0.8 + seed) * 1.2 * (k / 8));
    ctx.lineTo(ax, py + 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.gold; ctx.fillRect(ax, py + 2.4, 5, 0.8);
  }
  function corner(d, o) {
    const { ctx, K } = d, f = o.f, T = tt(d);
    const sx = o.which[1] === 'l' ? -1 : 1, sz = o.back ? 1 : -1;
    if (o.which === 'fr') {
      // A low bastion at the near corner, with a brazier: it never hides the hall.
      const r = 15, cx = o.x + sx * (r - 5), cz = o.z + sz * (r - 5), H = LOW + 10;
      towerBody(d, f, cx, cz, r, 0, H, 1, false); crown(d, f, cx, cz, r, H);
      const [bx, by] = K.at(cx, cz, f, H + 4); ctx.fillStyle = C.iron; ctx.beginPath(); ctx.moveTo(bx - 4, by - 3); ctx.lineTo(bx + 4, by - 3); ctx.lineTo(bx + 2.5, by + 1); ctx.lineTo(bx - 2.5, by + 1); ctx.closePath(); ctx.fill(); flame(ctx, bx, by - 3, 2.6, T, o.x);
      return;
    }
    const r = 22, cx = o.x + sx * (r - 8), cz = o.z + sz * (r - 8);
    towerBody(d, f, cx, cz, r, 0, HT, o.x + o.z + f);
    if (!o.top) return;
    const r2 = r + 3, top = HT + 22;
    towerBody(d, f, cx, cz, r, HT, top, o.x + 1, true);
    // Corbels under the crown.
    const [rx, ry] = ell(d, r), [sx0, sy0] = K.at(cx, cz, f, top); for (let j = 0; j <= 7; j++) { const t = (j / 7) * Math.PI, x = sx0 + Math.cos(t) * rx, y = sy0 + Math.sin(t) * ry; ctx.fillStyle = '#9d907a'; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill(); }
    K.cylinder(ctx, f, cx, cz, top, top + 6, r2, '#c2b59c', { top: '#8c806c' });
    cone(d, f, cx, cz, r2 + 2, top + 6, 64 + (o.which === 'bl' ? 18 : 0), o.x);
  }

  // ---- Roofline: battlements on the far walls and the hearth's chimney. ----
  const hearths = [...model.items.filter(it => it.type === 'counter'), ...hearthSpots.map(h => { const [x, z] = h.axis === 'x' ? [h.at + 12, h.c] : [h.c, h.at - 12]; return { x, z, f: h.f }; })];
  function levelTop(d, f, b, top) {
    const { ctx, K } = d, T = tt(d);
    if (!top) return;
    for (const w of model.walls) {
      if (w.f !== f || !w.far || w.h0 > 0) continue;
      const box = { ...w.box, h0: HT, h1: HT + 3 }; const g = 1.2;
      K.box(ctx, f, { x0: box.x0 - g, x1: box.x1 + g, z0: box.z0 - g, z1: box.z1 + g, h0: HT, h1: HT + 3 }, '#c2b59c', { edge: 'rgba(255,240,210,0.3)' });
      for (let s = w.s + 3; s + 7 <= w.e - 2; s += 14) K.box(ctx, f, w.axis === 'z' ? { x0: s, x1: s + 7, z0: box.z0 - 0.5, z1: box.z1 + 0.5, h0: HT + 3, h1: HT + 12 } : { x0: box.x0 - 0.5, x1: box.x1 + 0.5, z0: s, z1: s + 7, h0: HT + 3, h1: HT + 12 }, '#bdb098', { edge: 'rgba(255,240,210,0.35)' });
    }
    // Chimney: on the far wall nearest each hearth of this building.
    for (const it of hearths) {
      if (!b.levels.includes(it.f)) continue;
      const r = b.r, back = r.z1 - it.z <= it.x - r.x0, x = back ? it.x : r.x0 - 3, z = back ? r.z1 + 3 : it.z;
      const sb = { x0: x - 8, x1: x + 8, z0: z - 6, z1: z + 8 }, H0 = HT - 20, H1 = HT + 44;
      K.box(ctx, f, { ...sb, h0: H0, h1: H1 }, C.stone, { edge: 'rgba(255,240,210,0.25)' });
      K.onFace(ctx, f, 'front', sb.z0, sb.x0, sb.x1, H0, H1, 16, H1 - H0, g => TEX.stone(C.stone, { w: 16, h: H1 - H0, row: 5 })(g));
      K.onFace(ctx, f, 'right', sb.x1, sb.z0, sb.z1, H0, H1, 14, H1 - H0, g => { TEX.stone(C.stone, { w: 14, h: H1 - H0, row: 5 })(g); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 14, H1 - H0); });
      K.box(ctx, f, { x0: sb.x0 - 1.5, x1: sb.x1 + 1.5, z0: sb.z0 - 1.5, z1: sb.z1 + 1.5, h0: H1, h1: H1 + 3 }, '#a3967f');
      for (const dx of [-3.5, 3.5]) K.cylinder(ctx, f, x + dx, z + 1, H1 + 3, H1 + 9, 2.2, '#9a5a3a', { top: '#2a1a14' });
      const [cx, cy] = K.at(x, z + 1, f, H1 + 9);
      for (let i = 0; i < 9; i++) { const k = (T * 0.16 + i / 9) % 1, a = (1 - k) * 0.42; ctx.fillStyle = `rgba(${200 - d.night * 120},${200 - d.night * 120},${205 - d.night * 110},${a})`; ctx.beginPath(); ctx.arc(cx + k * 34 + Math.sin(T * 0.8 + i * 1.7) * 4 * k, cy - k * 60, 2.5 + k * 9, 0, TAU); ctx.fill(); }
      if (d.night > 0.2) glow(ctx, cx, cy, 12, '#ff9a4a', 0.35 * d.night);
    }
  }

  // ---- Grounds. ----
  const stoneFaces = (d, b, h0, h1, col = C.stone, row = 4.5) => {
    K.onFace(d.ctx, 0, 'front', b.z0, b.x0, b.x1, h0, h1, b.x1 - b.x0, h1 - h0, g => TEX.stone(col, { w: b.x1 - b.x0, h: h1 - h0, row })(g));
    K.onFace(d.ctx, 0, 'right', b.x1, b.z0, b.z1, h0, h1, b.z1 - b.z0, h1 - h0, g => { TEX.stone(col, { w: b.z1 - b.z0, h: h1 - h0, row })(g); g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(0, 0, b.z1 - b.z0, h1 - h0); });
  };
  function barrel(d, x, z, h0 = 0, H = 9, r = 3.2) { const { ctx, K } = d; K.cylinder(ctx, 0, x, z, h0, h0 + H, r, '#8a5a34', { top: '#6b4426' }); const [sx] = K.at(x, z, 0, h0), [rx, ry] = ell(d, r); ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.8; for (const q of [0.2, 0.8]) { const [, y] = K.at(x, z, 0, h0 + H * q); ctx.beginPath(); ctx.ellipse(sx, y, rx, ry, 0, 0, Math.PI); ctx.stroke(); } }
  function crate(d, x, z, h0, s, col = '#a8784a') { const { ctx, K } = d, b = { x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2, h0, h1: h0 + s }; K.box(ctx, 0, b, col, { edge: 'rgba(40,20,10,0.4)' }); K.onFace(ctx, 0, 'front', b.z0, b.x0, b.x1, h0, h0 + s, s, s, g => { g.strokeStyle = 'rgba(40,20,10,0.45)'; g.lineWidth = 0.6; g.strokeRect(0.6, 0.6, s - 1.2, s - 1.2); g.beginPath(); g.moveTo(0.6, 0.6); g.lineTo(s - 0.6, s - 0.6); g.stroke(); }); }
  function lantern(d, x, y, T, seed) { const { ctx } = d; ctx.fillStyle = C.iron; ctx.fillRect(x - 2, y - 1, 4, 1); ctx.fillStyle = d.night > 0.2 ? '#ffd27a' : '#e8d9a8'; ctx.fillRect(x - 1.5, y, 3, 4); ctx.fillStyle = C.iron; ctx.fillRect(x - 2, y + 4, 4, 1); if (d.night > 0.2) glow(ctx, x, y + 2, 12, '#ffb347', 0.55 * d.night * (0.9 + 0.1 * Math.sin(T * 7 + seed))); }
  const extras = {
    // A tiered stone fountain: a round basin with lily pads, a pedestal, an upper bowl spilling water, a gold orb.
    pool(d, ex) {
      const { ctx, K } = d, T = tt(d), r = Math.min(ex.w, ex.d) * 0.48, x = ex.x, z = ex.z, [rx, ry] = ell(d, r);
      K.ellipseShadow(ctx, ...K.at(x + 3, z + 2, 0, 0), rx * 1.05, ry * 1.05, 0.2);
      K.cylinder(ctx, 0, x, z, 0, 9, r, C.stone, { top: '#c2b59c' });
      K.disc(ctx, 0, x, z, 9.1, r * 0.86, d.night > 0.4 ? '#1e4a66' : '#3d7fa8');
      const [bx, by] = K.at(x, z, 0, 9.2);
      ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 0.6; for (let i = 0; i < 3; i++) { const k = (T * 0.4 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(bx, by, rx * (0.25 + 0.6 * k), ry * (0.25 + 0.6 * k), 0, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) { const t = h1(i, x) * TAU, px = bx + Math.cos(t) * rx * 0.62, py = by + Math.sin(t) * ry * 0.62; ctx.fillStyle = '#4f9a4a'; ctx.beginPath(); ctx.ellipse(px, py, 3, 1.4, 0, 0.3, TAU - 0.1); ctx.fill(); if (i % 2) { ctx.fillStyle = '#f2b8d0'; ctx.beginPath(); ctx.arc(px, py - 1, 1, 0, TAU); ctx.fill(); } }
      K.cylinder(ctx, 0, x, z, 9, 26, 2.6, '#c2b59c');
      K.cylinder(ctx, 0, x, z, 26, 29, 9, C.stone, { top: '#c2b59c' }); K.disc(ctx, 0, x, z, 29.1, 7.4, '#5a9cc4');
      K.cylinder(ctx, 0, x, z, 29, 36, 1.4, '#c2b59c');
      const [ox, oy] = K.at(x, z, 0, 38); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(ox - 0.7, oy - 0.7, 0.7, 0, TAU); ctx.fill();
      // Water spilling from the upper bowl's rim in four streams, and drops in the air.
      const [, uy] = K.at(x, z, 0, 29), [urx, ury] = ell(d, 9);
      ctx.strokeStyle = 'rgba(200,232,255,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); for (const t of [0.15, 0.4, 0.62, 0.88]) { const px = bx + Math.cos(t * Math.PI) * urx, py = uy + Math.sin(t * Math.PI) * ury; ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.cos(t * Math.PI) * 4, py + 4, px + Math.cos(t * Math.PI) * 6, by + Math.sin(t * Math.PI) * ry * 0.4); } ctx.stroke();
      for (let i = 0; i < 10; i++) { const k = (T * 1.1 + i / 10) % 1, t = h1(i, 'fd') * Math.PI; ctx.fillStyle = `rgba(230,245,255,${0.8 * (1 - k)})`; ctx.fillRect(bx + Math.cos(t) * (urx + k * 5), uy + Math.sin(t) * ury + k * 16, 0.9, 1.6); }
      if (d.night > 0.3) glow(ctx, bx, by - 8, 30, '#8fd0ff', 0.25 * d.night);
    },
    // A herb garden: two timber beds of herbs and flowers behind a woven wattle fence, and a straw beehive with bees.
    garden(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0;
      inPlan(d, 0, g => { g.fillStyle = 'rgba(120,90,55,0.55)'; g.fillRect(b.x0, b.z0, W, D); });
      for (let k = 0; k < 2; k++) {
        const bb = { x0: b.x0 + 4, x1: b.x1 - 14, z0: b.z0 + 6 + k * (D - 12) / 2, z1: b.z0 + 4 + (k + 1) * (D - 12) / 2 };
        K.box(ctx, 0, { ...bb, h0: 0, h1: 5 }, C.timberLight, { top: '#4a3020', edge: 'rgba(255,220,160,0.3)' });
        for (let i = 0; i < 9; i++) { const x = bb.x0 + 3 + (i / 8) * (bb.x1 - bb.x0 - 6), z = (bb.z0 + bb.z1) / 2 + (h1(i, k, ex.x) - 0.5) * 4, [sx, sy] = K.at(x, z, 0, 5), kind = (i + k) % 3, sw = Math.sin(T * 1.3 + i) * 0.6;
          if (kind === 0) { ctx.fillStyle = '#4f8a3a'; for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(sx + (j - 1.5) * 1.6 + sw, sy - 2 - (j % 2) * 1.5, 1.6, 2.6, (j - 1.5) * 0.4, 0, TAU); ctx.fill(); } }
          else if (kind === 1) { ctx.strokeStyle = '#6a7f4a'; ctx.lineWidth = 0.6; ctx.fillStyle = '#9c7fd0'; for (let j = 0; j < 4; j++) { const tx = sx + (j - 1.5) * 1.5 + sw, ty = sy - 6 - h1(j, i) * 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.fillRect(tx - 0.6, ty - 2.5, 1.2, 2.5); } }
          else { ctx.fillStyle = '#3f7a3a'; ctx.beginPath(); ctx.arc(sx, sy - 2.5, 2.8, 0, TAU); ctx.fill(); ctx.fillStyle = ['#f29a2e', '#f2d24b'][i % 2]; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(sx + (j - 1) * 2 + sw * 0.5, sy - 4 - (j % 2), 1.1, 0, TAU); ctx.fill(); } }
        }
      }
      // The beehive (a straw skep on a stump) and a few bees.
      const hx = b.x1 - 7, hz = b.z0 + D * 0.5; K.cylinder(ctx, 0, hx, hz, 0, 6, 3.2, '#6b4426', { top: '#8a5a34' });
      const [kx, ky] = K.at(hx, hz, 0, 6); ctx.fillStyle = '#d9a845'; ctx.beginPath(); ctx.ellipse(kx, ky - 5, 4.6, 6, 0, Math.PI, 0); ctx.lineTo(kx + 4.6, ky); ctx.lineTo(kx - 4.6, ky); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,20,0.6)'; ctx.lineWidth = 0.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.ellipse(kx, ky - 5 + i * 1.5, 4.6 - i * 0.2, 1.2, 0, 0, Math.PI); ctx.stroke(); } ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(kx, ky - 1, 1, Math.PI, 0); ctx.fill();
      if (d.night < 0.5) for (let i = 0; i < 4; i++) { const a = T * (1.5 + i * 0.3) + i * 2; ctx.fillStyle = '#2a2010'; ctx.fillRect(kx + Math.cos(a) * (8 + i * 2), ky - 8 + Math.sin(a * 1.7) * 4, 1.2, 1); }
      // Wattle fence on the near sides.
      const fence = (pts) => { for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i]; K.box(ctx, 0, { x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, h0: 0, h1: 9 }, C.timber); } ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = 1; for (const hh of [3, 5.5, 8]) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = K.at(x, z, 0, hh + (i % 2) * 0.6); if (i) ctx.lineTo(...p); else ctx.moveTo(...p); }); ctx.stroke(); } };
      const fp = []; for (let x = b.x0; x <= b.x1 + 0.1; x += W / 6) fp.push([x, b.z0]); fence(fp);
      const rp = []; for (let z = b.z0; z <= b.z1 + 0.1; z += D / 5) rp.push([b.x1, z]); fence(rp);
    },
    // The smithy yard: packed earth, a lean-to over a woodpile, an anvil on a stump, a stone furnace, barrels.
    yard(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0;
      inPlan(d, 0, g => { g.fillStyle = 'rgba(128,96,62,0.6)'; g.beginPath(); g.roundRect(b.x0 - 4, b.z0 - 4, W + 8, D + 8, 10); g.fill(); g.fillStyle = 'rgba(60,40,20,0.2)'; for (let i = 0; i < 50; i++) g.fillRect(b.x0 + h1(i, 'yd') * W, b.z0 + h1('yd', i) * D, 1.5, 1); });
      // Lean-to along the back: posts, a sloping plank roof, logs stacked beneath.
      const z1 = b.z1 - 2, z0 = b.z1 - 22, x0 = b.x0 + 4, x1 = b.x1 - 6;
      for (let i = 0; i < 40; i++) { const r = 2.2, row = Math.floor(i / 10), x = x0 + 3 + (i % 10) * ((x1 - x0 - 6) / 9) + (row % 2) * 1.5, h = 2.2 + row * 3.8; if (row > 3) break; const [sx, sy] = K.at(x, z0 + 6, 0, h); ctx.fillStyle = '#7a4e2c'; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.9, r, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#d8b07a'; ctx.beginPath(); ctx.ellipse(sx - 0.3, sy, r * 0.65, r * 0.75, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(120,70,30,0.5)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.ellipse(sx - 0.3, sy, r * 0.3, r * 0.35, 0, 0, TAU); ctx.stroke(); }
      for (const [x, z] of [[x0, z0], [x1, z0]]) K.box(ctx, 0, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, h0: 0, h1: 22 }, C.timber);
      poly(ctx, [K.at(x0 - 3, z0 - 4, 0, 22), K.at(x1 + 3, z0 - 4, 0, 22), K.at(x1 + 3, z1, 0, 30), K.at(x0 - 3, z1, 0, 30)], '#6b4a2e', 'rgba(255,220,160,0.25)', 0.6);
      ctx.strokeStyle = 'rgba(30,18,8,0.35)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let k = 1; k < 8; k++) { const x = x0 - 3 + (k / 8) * (x1 - x0 + 6); ctx.moveTo(...K.at(x, z0 - 4, 0, 22)); ctx.lineTo(...K.at(x, z1, 0, 30)); } ctx.stroke();
      // Anvil on its stump, with sparks when the hammer falls.
      const ax = b.x0 + W * 0.35, az = b.z0 + D * 0.32; K.cylinder(ctx, 0, ax, az, 0, 7, 3.6, '#6b4426', { top: '#b58a55' });
      K.box(ctx, 0, { x0: ax - 4.5, x1: ax + 4.5, z0: az - 1.8, z1: az + 1.8, h0: 7, h1: 10.5 }, '#3a3a40', { edge: 'rgba(255,255,255,0.3)' }); K.box(ctx, 0, { x0: ax - 1.5, x1: ax + 1.5, z0: az - 1.2, z1: az + 1.2, h0: 10.5, h1: 12 }, '#4a4a52');
      const beat = (T * 0.7) % 1; if (beat < 0.25) { const [sx, sy] = K.at(ax, az, 0, 12); for (let i = 0; i < 8; i++) { const k = beat / 0.25, a = h1(i, 'sp') * Math.PI - Math.PI; ctx.fillStyle = `rgba(255,200,90,${1 - k})`; ctx.fillRect(sx + Math.cos(a) * k * 12, sy + Math.sin(a) * k * 9 + k * k * 6, 1, 1); } }
      // The furnace: stone, glowing mouth, smoke from its flue.
      const fx = b.x1 - 10, fz = b.z0 + 12, fb = { x0: fx - 7, x1: fx + 7, z0: fz - 6, z1: fz + 6, h0: 0, h1: 16 };
      K.box(ctx, 0, fb, C.stoneDark, { edge: 'rgba(255,240,210,0.25)' }); stoneFaces(d, fb, 0, 16, C.stoneDark, 4);
      const [mx, my] = K.at(fx, fb.z0, 0, 5); ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.arc(mx, my, 3.6, Math.PI, 0); ctx.lineTo(mx + 3.6, my + 3); ctx.lineTo(mx - 3.6, my + 3); ctx.fill(); const heat = 0.75 + 0.25 * Math.sin(T * 5); ctx.fillStyle = `rgba(255,${140 + 60 * heat},40,0.95)`; ctx.beginPath(); ctx.arc(mx, my + 1, 2.4, Math.PI, 0); ctx.lineTo(mx + 2.4, my + 3); ctx.lineTo(mx - 2.4, my + 3); ctx.fill(); glow(ctx, mx, my, 16, '#ff7a2a', 0.45 * heat);
      K.cylinder(ctx, 0, fx + 3, fz + 2, 16, 26, 2.2, C.stoneDark); const [cx, cy] = K.at(fx + 3, fz + 2, 0, 26); for (let i = 0; i < 5; i++) { const k = (T * 0.25 + i / 5) % 1; ctx.fillStyle = `rgba(120,115,110,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + k * 10, cy - k * 30, 2 + k * 5, 0, TAU); ctx.fill(); }
      barrel(d, b.x0 + 6, b.z0 + 6); barrel(d, b.x0 + 13, b.z0 + 4, 0, 8, 2.8);
      // A grindstone and a cart wheel leaning on the lean-to post.
      const [wx, wy] = K.at(x1 + 2, z0 - 3, 0, 8); ctx.strokeStyle = C.timber; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(wx, wy, 5, 7.5, 0.25, 0, TAU); ctx.stroke(); ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(wx - Math.cos(a) * 5, wy - Math.sin(a) * 7.5); ctx.lineTo(wx + Math.cos(a) * 5, wy + Math.sin(a) * 7.5); } ctx.stroke();
    },
    // A hitching rail with two barrels and a hay bale.
    rack(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), W = b.x1 - b.x0;
      for (const x of [b.x0 + 2, b.x1 - 2]) K.box(ctx, 0, { x0: x - 1, x1: x + 1, z0: ex.z - 1, z1: ex.z + 1, h0: 0, h1: 13 }, C.timber, { edge: 'rgba(255,220,160,0.3)' });
      K.box(ctx, 0, { x0: b.x0 + 1, x1: b.x1 - 1, z0: ex.z - 0.8, z1: ex.z + 0.8, h0: 11, h1: 13 }, C.timberLight, { edge: 'rgba(255,220,160,0.3)' });
      barrel(d, b.x1 + 6, ex.z - 2); barrel(d, b.x1 + 9, ex.z + 5, 0, 8, 2.8);
      const hb = { x0: b.x0 - 14, x1: b.x0 - 3, z0: ex.z - 4, z1: ex.z + 4, h0: 0, h1: 7 }; K.box(ctx, 0, hb, '#d9b860', { top: '#e8c870' });
      K.onFace(ctx, 0, 'front', hb.z0, hb.x0, hb.x1, 0, 7, 11, 7, g => { g.strokeStyle = 'rgba(140,100,30,0.6)'; g.lineWidth = 0.4; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(h1(i, 'hb') * 11, 0); g.lineTo(h1(i, 'hb') * 11 + 1, 7); g.stroke(); } g.fillStyle = '#8a6a42'; g.fillRect(2.5, 0, 0.6, 7); g.fillRect(8, 0, 0.6, 7); });
    },
    // A dry-stone wall with cap stones and ivy.
    hedge(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), H = ex.h * 0.8, ib = ex.axis === 'z' ? { ...b, x0: ex.x - ex.w * 0.35, x1: ex.x + ex.w * 0.35 } : { ...b, z0: ex.z - ex.d * 0.35, z1: ex.z + ex.d * 0.35 };
      K.box(ctx, 0, { ...ib, h0: 0, h1: H }, '#a89c86'); stoneFaces(d, ib, 0, H, '#a89c86', 4);
      const n = Math.round((ex.axis === 'z' ? ib.z1 - ib.z0 : ib.x1 - ib.x0) / 5);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = ex.axis === 'z' ? ex.x : ib.x0 + t * (ib.x1 - ib.x0), z = ex.axis === 'z' ? ib.z0 + t * (ib.z1 - ib.z0) : ex.z; K.box(ctx, 0, { x0: x - (ex.axis === 'z' ? ex.w * 0.38 : 2.4), x1: x + (ex.axis === 'z' ? ex.w * 0.38 : 2.4), z0: z - (ex.axis === 'z' ? 2.4 : ex.d * 0.38), z1: z + (ex.axis === 'z' ? 2.4 : ex.d * 0.38), h0: H, h1: H + 2 + h1(i, ex.x) * 1.5 }, '#bdb098', { edge: 'rgba(255,240,210,0.3)' }); }
      for (let i = 0; i < 14; i++) { const k = h1(i, ex.x, ex.z), u = h1(ex.z, i, 'iv'); if (k > 0.55) continue; const p = ex.axis === 'z' ? K.at(ib.x1, ib.z0 + u * (ib.z1 - ib.z0), 0, H * (0.3 + k)) : K.at(ib.x0 + u * (ib.x1 - ib.x0), ib.z0, 0, H * (0.3 + k)); ctx.fillStyle = ['#3f7a3a', '#2e6a32', '#5a9a46'][i % 3]; ctx.beginPath(); ctx.arc(p[0], p[1], 1.8 + k * 2, 0, TAU); ctx.fill(); }
    },
    // A two-wheeled cart with barrels and a crate, its shafts resting on the ground.
    parked(d, ex) {
      const { ctx, K } = d, a = ex.angle ?? 0, c = Math.cos(a), s = Math.sin(a), L = 34, W = 20;
      K.ellipseShadow(ctx, ...K.at(ex.x + 3, ex.z + 2, 0, 0), L * 0.55, W * 0.4, 0.2);
      ctx.strokeStyle = C.timber; ctx.lineWidth = 1.4; ctx.beginPath(); for (const sg of [-1, 1]) { const px = ex.x + c * L * 0.45 - s * sg * W * 0.35, pz = ex.z + s * L * 0.45 + c * sg * W * 0.35; ctx.moveTo(...K.at(px, pz, 0, 8)); ctx.lineTo(...K.at(px + c * 22, pz + s * 22, 0, 0.5)); } ctx.stroke();
      const wheel = sg => { const [wx, wy] = K.at(ex.x - s * sg * (W / 2 + 1), ex.z + c * sg * (W / 2 + 1), 0, 8); ctx.strokeStyle = '#4a2f1c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(wx, wy, 6.5 * Math.abs(c) + 2.5, 8, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < 4; i++) { const t = i * Math.PI / 4; ctx.moveTo(wx - Math.cos(t) * (6.5 * Math.abs(c) + 2.5), wy - Math.sin(t) * 8); ctx.lineTo(wx + Math.cos(t) * (6.5 * Math.abs(c) + 2.5), wy + Math.sin(t) * 8); } ctx.stroke(); };
      const nearSg = (-s - c) > 0 ? -1 : 1; wheel(-nearSg);
      orientedBox(d, 0, ex.x, ex.z, L, W, 6, 13, a, '#8a5a34', { edge: 'rgba(255,220,160,0.35)' });
      const [tx, ty] = K.at(ex.x, ex.z, 0, 13); ctx.strokeStyle = 'rgba(40,20,8,0.35)'; ctx.lineWidth = 0.5;
      barrel(d, ex.x - c * 6 + s * 3, ex.z - s * 6 - c * 3, 13, 9, 3); barrel(d, ex.x - c * 6 - s * 4, ex.z - s * 6 + c * 4, 13, 9, 3);
      crate(d, ex.x + c * 8, ex.z + s * 8, 13, 8, ex.seed % 2 ? '#a8784a' : '#8f6a3e');
      wheel(nearSg);
    },
    // The gate arch where the road's path reaches the forecourt: stone piers, a voussoir arch, banners and a lantern.
    gate(d, ex) {
      const { ctx, K } = d, T = tt(d), half = (ex.axis === 'z' ? ex.d : ex.w) / 2, H = ex.h * 0.82, pw = 6;
      const at = (u, h) => (ex.axis === 'z' ? K.at(ex.x, ex.z + u, 0, h) : K.at(ex.x + u, ex.z, 0, h));
      // The far pier first, then the arch, then the near pier.
      const pier = sg => { const c = sg * half, b = ex.axis === 'z' ? { x0: ex.x - pw / 2, x1: ex.x + pw / 2, z0: ex.z + c - pw / 2, z1: ex.z + c + pw / 2 } : { x0: ex.x + c - pw / 2, x1: ex.x + c + pw / 2, z0: ex.z - pw / 2, z1: ex.z + pw / 2 }; K.shadow(ctx, 0, b, H, 0.18); K.box(ctx, 0, { ...b, h0: 0, h1: H }, C.stone, { edge: 'rgba(255,240,210,0.3)' }); stoneFaces(d, b, 0, H, C.stone, 5); K.box(ctx, 0, { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1, h0: H, h1: H + 3 }, '#c2b59c');
        // A banner on the pier's camera-facing side.
        const [bx, by] = ex.axis === 'z' ? K.at(b.x1 + 0.3, (b.z0 + b.z1) / 2, 0, H - 4) : K.at((b.x0 + b.x1) / 2, b.z0 - 0.3, 0, H - 4); const sw = Math.sin(T * 1.5 + sg) * 0.8; ctx.fillStyle = C.emerald; ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx + 3, by); ctx.lineTo(bx + 3 + sw, by + 20); ctx.lineTo(bx + sw, by + 16); ctx.lineTo(bx - 3 + sw, by + 20); ctx.closePath(); ctx.fill(); ctx.fillStyle = C.gold; ctx.fillRect(bx - 2.4, by + 1.5, 4.8, 0.8); ctx.beginPath(); ctx.arc(bx + sw * 0.4, by + 8, 1.6, 0, TAU); ctx.fill(); };
      const farSg = ex.axis === 'z' ? 1 : -1; pier(farSg);
      // Arch: a thick band of stone following a half circle between the piers, a keystone, a lantern hanging below.
      const pts = []; for (let k = 0; k <= 16; k++) { const t = Math.PI * (k / 16), u = -Math.cos(t) * half, h = H + 2 + Math.sin(t) * half * 0.55; pts.push(at(u, h)); }
      ctx.lineCap = 'butt'; ctx.strokeStyle = '#8c806c'; ctx.lineWidth = 8; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + 1.5) : ctx.moveTo(p[0], p[1] + 1.5))); ctx.stroke();
      ctx.strokeStyle = C.stone; ctx.lineWidth = 6.5; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
      ctx.strokeStyle = 'rgba(50,40,30,0.4)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let k = 1; k < 16; k += 2) { const p = pts[k], q = pts[k + 1], nx = -(q[1] - p[1]), ny = q[0] - p[0], L = Math.hypot(nx, ny) || 1; ctx.moveTo(p[0] - nx / L * 3.2, p[1] - ny / L * 3.2); ctx.lineTo(p[0] + nx / L * 3.2, p[1] + ny / L * 3.2); } ctx.stroke();
      const top = pts[8]; ctx.fillStyle = '#c2b59c'; ctx.fillRect(top[0] - 3, top[1] - 5, 6, 9); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(top[0], top[1] - 0.5, 1.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.iron; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(top[0], top[1] + 4); ctx.lineTo(top[0], top[1] + 9); ctx.stroke(); lantern(d, top[0], top[1] + 9, T, ex.x);
      pier(-farSg);
    },
    // The tavern courtyard: flagstones, trestle tables with benches and tankards, barrels, a roofed well, lanterns on a
    // string between two poles.
    terrace(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0;
      inPlan(d, 0, g => { g.fillStyle = pattern(g, 'f:court', 48, 48, TEX.flagstones('#b9a888')); g.beginPath(); g.roundRect(b.x0, b.z0, W, D, 8); g.fill(); g.strokeStyle = '#8c806c'; g.lineWidth = 1.4; g.stroke(); });
      // The well: a round stone wall, two posts, a little gable roof, a bucket on its rope.
      const wx = b.x0 + W * 0.78, wz = b.z0 + D * 0.66; towerBody(d, 0, wx, wz, 8, 0, 9, 3, false); K.disc(ctx, 0, wx, wz, 9.1, 6.5, '#1d2a3a');
      for (const dx of [-7, 7]) K.box(ctx, 0, { x0: wx + dx - 0.8, x1: wx + dx + 0.8, z0: wz - 0.8, z1: wz + 0.8, h0: 9, h1: 28 }, C.timber);
      K.box(ctx, 0, { x0: wx - 8, x1: wx + 8, z0: wz - 0.6, z1: wz + 0.6, h0: 24, h1: 25.4 }, C.timberLight);
      poly(ctx, [K.at(wx - 10, wz - 7, 0, 26), K.at(wx + 10, wz - 7, 0, 26), K.at(wx + 10, wz, 0, 33), K.at(wx - 10, wz, 0, 33)], '#8e4a32', 'rgba(255,220,160,0.25)', 0.6);
      poly(ctx, [K.at(wx + 10, wz - 7, 0, 26), K.at(wx + 10, wz + 7, 0, 26), K.at(wx + 10, wz, 0, 33)], '#5a2e20');
      const [rx, ry] = K.at(wx, wz, 0, 24); ctx.strokeStyle = '#c8a26a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + 9); ctx.stroke(); ctx.fillStyle = '#6b4426'; ctx.fillRect(rx - 2, ry + 9, 4, 3.5);
      // Trestle tables with benches and tankards.
      for (const [tx, tz] of [[b.x0 + W * 0.3, b.z0 + D * 0.62], [b.x0 + W * 0.4, b.z0 + D * 0.28]]) {
        for (const dz of [-7, 7]) K.box(ctx, 0, { x0: tx - 13, x1: tx + 13, z0: tz + dz - 1.6, z1: tz + dz + 1.6, h0: 5, h1: 6.5 }, C.timberLight, { edge: 'rgba(255,220,160,0.3)' });
        for (const dx of [-10, 10]) K.box(ctx, 0, { x0: tx + dx - 1, x1: tx + dx + 1, z0: tz - 3, z1: tz + 3, h0: 0, h1: 10 }, C.timber);
        K.box(ctx, 0, { x0: tx - 14, x1: tx + 14, z0: tz - 4, z1: tz + 4, h0: 10, h1: 11.5 }, C.oak, { edge: 'rgba(255,220,160,0.35)' });
        for (const [dx, dz] of [[-7, 1], [3, -1.5], [9, 2]]) K.cylinder(ctx, 0, tx + dx, tz + dz, 11.5, 14.5, 1.3, '#9a9aa4', { top: '#f2e6c8' });
      }
      barrel(d, b.x0 + 6, b.z1 - 8); barrel(d, b.x0 + 12, b.z1 - 5, 0, 8, 2.8); barrel(d, b.x0 + 8, b.z1 - 7, 9, 7, 2.6);
      // Lantern string between two poles along the near edge.
      const p0 = [b.x0 + 2, b.z0 + 2], p1 = [b.x1 - 2, b.z0 + 2];
      for (const [x, z] of [p0, p1]) K.box(ctx, 0, { x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, h0: 0, h1: 34 }, C.timber);
      const a = K.at(p0[0], p0[1], 0, 34), c = K.at(p1[0], p1[1], 0, 34); ctx.strokeStyle = 'rgba(40,30,20,0.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 12, ...c); ctx.stroke();
      for (let k = 1; k < 6; k++) { const t = k / 6, x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * (a[0] + c[0]) / 2 + t * t * c[0], y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * ((a[1] + c[1]) / 2 + 12) + t * t * c[1]; ctx.fillStyle = d.night > 0.2 ? ['#ffd27a', '#ff9a6a', '#c9f27a'][k % 3] : '#e8d9a8'; ctx.beginPath(); ctx.arc(x, y + 2, 1.4, 0, TAU); ctx.fill(); if (d.night > 0.2) glow(ctx, x, y + 2, 9, '#ffc46a', 0.5 * d.night); }
    },
  };
  function extraLight(ex, d) {
    if (ex.type === 'gate') return { r: 46, col: '#ffb347', i: 0.7, h: ex.h * 0.9 };
    if (ex.type === 'yard') return { r: 40, col: '#ff7a2a', i: 0.6, h: 6 };
    if (ex.type === 'terrace') return { r: 64, col: '#ffc46a', i: 0.6, h: 26 };
    if (ex.type === 'pool') return { r: 40, col: '#8fd0ff', i: 0.35, h: 12 };
    return null;
  }
  // Lights on the building itself: torch-lit arrow slits in the towers, the bastion brazier, the chimney's glow.
  function buildingLights(b, d) {
    const out = [], r = b.r, top = topOf(b), n = b.levels.length;
    for (const [x, z, sx, sz] of [[r.x0, r.z1, -1, 1], [r.x1, r.z1, 1, 1], [r.x0, r.z0, -1, -1]]) out.push({ x: x + sx * 14, z: z + sz * 14, f: top, h: HT * 0.6, r: 46, col: '#ffb347', i: 0.55 });
    out.push({ x: r.x1 + 10, z: r.z0 - 10, f: b.levels[0], h: LOW + 16, r: 54, col: '#ff9a3a', i: 0.8 });
    for (const it of hearths) if (b.levels.includes(it.f)) out.push({ x: it.x, z: r.z1, f: top, h: HT + 50, r: 30, col: '#ff8a3a', i: 0.35 });
    for (const hs of hearthSpots) if (b.levels.includes(hs.f)) { const [x, z] = hs.axis === 'x' ? [hs.at + 16, hs.c] : [hs.c, hs.at - 16]; out.push({ x, z, f: hs.f, h: 10, r: 96, col: '#ff8a2a', i: 0.95 }); }
    return out;
  }
  return { corner, levelTop, extras, extraLight, buildingLights };
}
