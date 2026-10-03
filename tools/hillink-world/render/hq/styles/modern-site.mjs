// Modern HQ exterior: how the building's corners, roofline, entrance and dressed grounds look. Positions all come from
// skin.mjs (the World's buildings, walls, doors, forecourts, paths and roads); this file only draws them.
//   corners     architectural concrete columns proud of the walls; a low steel post at the near corner
//   roofline    a dark coping on the far walls, HILLINK channel letters, solar panels, a rooftop plant unit, a mast
//   entrance    a steel portal with open glass doors, threshold downlights, brushed-steel lettering on the front wall
//   grounds     reflecting pool with a steel ring, corten gardens with grasses, a screened service yard (condensers,
//               generator, bins), a bike rack, clipped hedges, parked cars with a charger, a terrace, gateway pylons
import { TAU, HT, LOW, shade, glow, h1, poly, inPlan, orientedBox, wallOfDoor } from './common.mjs';

export function modernSite({ K, U, model, C, hearthSpots = [] }) {
  const tt = d => (d.reduced ? 0 : d.T);
  const rectOf = ex => ({ x0: ex.x - ex.w / 2, x1: ex.x + ex.w / 2, z0: ex.z - ex.d / 2, z1: ex.z + ex.d / 2 });
  const inset = (b, m) => ({ x0: b.x0 + m, x1: b.x1 - m, z0: b.z0 + m, z1: b.z1 - m });
  const outsideDoors = model.doors.filter(dr => dr.outside);
  // The front wall piece beside each entrance carries the lettering (the longest piece that ends at an outside door).
  const logoWalls = new Set();
  for (const dr of outsideDoors) {
    const lo = dr.axis === 'z' ? 'x' : 'z', s = Math.min(dr.a[lo], dr.b[lo]), e = Math.max(dr.a[lo], dr.b[lo]), at = dr.axis === 'z' ? dr.a.z : dr.a.x;
    const side = model.walls.filter(w => w.f === dr.f && w.near && w.axis === dr.axis && Math.abs(w.at - at) < 1 && (Math.abs(w.e - s) < 2 || Math.abs(w.s - e) < 2) && w.e - w.s > 70).sort((a, b) => (b.e - b.s) - (a.e - a.s));
    if (side[0]) logoWalls.add(side[0]);
  }
  // The longest far back wall on each building's top storey carries the rooftop letters.
  const topOf = b => Math.max(...b.levels);
  const roofWall = new Map(model.buildings.map(b => [b, model.walls.filter(w => w.f === topOf(b) && w.type === 'back' && w.h0 === 0).sort((a, c) => (c.e - c.s) - (a.e - a.s))[0]]));

  // ---- Corners. ----
  function corner(d, o) {
    const { ctx, K } = d, f = o.f;
    if (o.which === 'fr') {
      K.box(ctx, f, { x0: o.x - 2, x1: o.x + 6, z0: o.z - 6, z1: o.z + 2, h0: 0, h1: LOW + 3 }, C.steel, { edge: 'rgba(255,255,255,0.25)' });
      const [x, y] = K.at(o.x + 2, o.z - 2, f, LOW + 3); if (d.night > 0.2) glow(ctx, x, y, 14, '#ffe2b0', 0.6 * d.night);
      return;
    }
    const sx = o.which[1] === 'l' ? -1 : 1, sz = o.back ? 1 : -1, H = HT + (o.top ? 6 : 0);
    const b = { x0: sx < 0 ? o.x - 9 : o.x - 1, x1: sx < 0 ? o.x + 1 : o.x + 9, z0: sz > 0 ? o.z - 1 : o.z - 9, z1: sz > 0 ? o.z + 9 : o.z + 1, h0: 0, h1: H };
    K.box(ctx, f, b, '#d6d2ca', { edge: 'rgba(255,255,255,0.35)', r: 0.7 });
    // Board-formed concrete: faint horizontal lines and a dark shadow reveal at the foot.
    for (const [kind, c, a, e] of [['front', b.z0, b.x0, b.x1], ['right', b.x1, b.z0, b.z1]]) K.onFace(ctx, f, kind, c, a, e, 0, H, e - a, H, g => { g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 4; y < H; y += 7) g.fillRect(0, y, e - a, 0.5); g.fillStyle = 'rgba(30,32,38,0.5)'; g.fillRect(0, H - 2, e - a, 2); if (o.top) { g.fillStyle = C.steel; g.fillRect(0, 0, e - a, 2.5); } });
  }

  // ---- Roofline and entrance (drawn after a storey's contents). ----
  function levelTop(d, f, b, top) {
    const { ctx, K } = d, T = tt(d);
    for (const dr of outsideDoors) if (dr.f === f) portal(d, dr);
    if (!top) return;
    for (const w of model.walls) {
      if (w.f !== f || !w.far || w.h0 > 0) continue;
      const cap = w.axis === 'z' ? { x0: w.s - (Math.abs(w.s - b.r.x0) < 1 ? 9 : 0), x1: w.e + (Math.abs(w.e - b.r.x1) < 1 ? 9 : 0), z0: w.at - 1, z1: w.at + 9 } : { x0: w.at - 9, x1: w.at + 1, z0: w.s - (Math.abs(w.s - b.r.z0) < 1 ? 9 : 0), z1: w.e };
      K.box(ctx, f, { ...cap, h0: HT, h1: HT + 5 }, '#3a3e46', { edge: 'rgba(255,255,255,0.3)', top: '#4a4f58' });
    }
    const rw = roofWall.get(b);
    if (!rw) return;
    const L = rw.e - rw.s, z = rw.at + 4;
    // Solar panels behind the parapet, tilted to the sun, on the right half of the roof.
    for (let x = rw.s + L * 0.5; x + 26 < rw.e - L * 0.18; x += 30) {
      const q = [K.at(x, z + 6, f, HT + 6), K.at(x + 26, z + 6, f, HT + 6), K.at(x + 26, z + 22, f, HT + 18), K.at(x, z + 22, f, HT + 18)];
      poly(ctx, q, '#22344f', 'rgba(200,220,255,0.5)', 0.6);
      ctx.strokeStyle = 'rgba(150,180,220,0.35)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (let k = 1; k < 4; k++) { const a = q[0].map((v, i) => v + (q[1][i] - v) * k / 4), e = q[3].map((v, i) => v + (q[2][i] - v) * k / 4); ctx.moveTo(...a); ctx.lineTo(...e); } const m0 = q[0].map((v, i) => (v + q[3][i]) / 2), m1 = q[1].map((v, i) => (v + q[2][i]) / 2); ctx.moveTo(...m0); ctx.lineTo(...m1); ctx.stroke();
      if (d.day && d.night < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(...q[3]); ctx.lineTo(...q[2].map((v, i) => v + (q[3][i] - v) * 0.6)); ctx.lineTo(...q[1].map((v, i) => v + (q[0][i] - v) * 0.8)); ctx.closePath(); ctx.fill(); }
    }
    // A rooftop plant unit near the right end, its fan turning.
    const ux = rw.e - L * 0.15;
    K.box(ctx, f, { x0: ux - 22, x1: ux + 10, z0: z + 2, z1: z + 22, h0: HT + 5, h1: HT + 21 }, '#b9bec5', { edge: 'rgba(255,255,255,0.4)' });
    K.onFace(ctx, f, 'front', z + 2, ux - 22, ux + 10, HT + 5, HT + 21, 32, 16, g => { g.fillStyle = 'rgba(40,45,55,0.35)'; for (let y = 2; y < 15; y += 1.6) g.fillRect(2, y, 28, 0.6); });
    fan(d, f, ux - 6, z + 12, HT + 21, 6, T * 6);
    // A slim mast with an aviation light that blinks at night.
    const [mx, my] = K.at(rw.s + 10, z + 6, f, HT + 5); ctx.strokeStyle = C.steel; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - 46); ctx.stroke(); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(mx - 4, my - 30); ctx.lineTo(mx + 4, my - 30); ctx.moveTo(mx - 3, my - 38); ctx.lineTo(mx + 3, my - 38); ctx.stroke();
    const on = Math.sin(T * 3) > 0.6; ctx.fillStyle = on ? '#ff4a3a' : '#7a2a24'; ctx.beginPath(); ctx.arc(mx, my - 47, 1.4, 0, TAU); ctx.fill(); if (on && d.night > 0.2) glow(ctx, mx, my - 47, 10, '#ff4a3a', 0.6);
    // HILLINK channel letters standing on the coping, lit from within at night.
    const lw = Math.min(L * 0.36, 150), lx = rw.s + L * 0.08, lh = 22;
    for (const [dz, col] of [[2.5, '#1d2128'], [0, d.night > 0.2 ? '#f6f9ff' : '#eef1f4']]) K.onFace(ctx, f, 'front', z + dz, lx, lx + lw, HT + 5, HT + 5 + lh, lw, lh, g => { g.fillStyle = col; g.font = `800 ${lh * 0.92}px ui-sans-serif, system-ui, sans-serif`; g.textBaseline = 'bottom'; g.textAlign = 'left'; const m = g.measureText('HILLINK').width; g.save(); g.scale(lw / m, 1); g.fillText('HILLINK', 0, lh); g.restore(); });
    K.box(ctx, f, { x0: lx + lw + 4, x1: lx + lw + 10, z0: z, z1: z + 2, h0: HT + 6, h1: HT + 12 }, C.blue);
    if (d.night > 0.2) { const [gx, gy] = K.at(lx + lw / 2, z, f, HT + 16); glow(ctx, gx, gy, lw * 0.55, '#cfe0ff', 0.35 * d.night); }
  }
  function fan(d, f, x, z, h, r, a) {
    const { ctx, K } = d; K.disc(ctx, f, x, z, h + 0.2, r, '#2b2f36', 'rgba(255,255,255,0.3)');
    const [cx, cy] = K.at(x, z, f, h + 0.4); ctx.strokeStyle = '#8f969f'; ctx.lineWidth = 1.1; ctx.beginPath(); for (let i = 0; i < 4; i++) { const t = a + i * TAU / 4; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t) * r * 0.85, cy + Math.sin(t) * r * 0.42); } ctx.stroke();
    ctx.fillStyle = '#c9ced5'; ctx.beginPath(); ctx.arc(cx, cy, 1, 0, TAU); ctx.fill();
  }
  // The entrance portal in the low front wall: brushed-steel jambs as tall as the balustrade, glass doors standing
  // open, and warm downlights on the threshold at night (nothing tall, so the lobby stays in view).
  function portal(d, dr) {
    const { ctx, K } = d, f = dr.f, lo = dr.axis === 'z' ? 'x' : 'z', s = Math.min(dr.a[lo], dr.b[lo]), e = Math.max(dr.a[lo], dr.b[lo]), at = dr.axis === 'z' ? dr.a.z : dr.a.x;
    const R = (s0, s1, c0, c1) => (dr.axis === 'z' ? { x0: s0, x1: s1, z0: at + c0, z1: at + c1 } : { x0: at + c0, x1: at + c1, z0: s0, z1: s1 });
    const H = LOW + 12, w = wallOfDoor(model, dr), out = w?.type === 'back' || w?.type === 'right' ? 1 : -1;
    for (const [v, k] of [[s, -1], [e, 1]]) {
      K.box(ctx, f, { ...R(v - (k < 0 ? 2.4 : 0), v + (k > 0 ? 2.4 : 0), -3.5, 1), h0: 0, h1: H }, '#b9bec5', { edge: 'rgba(255,255,255,0.6)' });
      // An open glass leaf hinged on the jamb, swung outwards.
      const L = (e - s) * 0.5 - 1, th = 0.9, along = v - k * L * Math.cos(th), across = at + out * L * Math.sin(th);
      const [hx, hz] = dr.axis === 'z' ? [v, at] : [at, v], [px, pz] = dr.axis === 'z' ? [along, across] : [across, along];
      poly(ctx, [K.at(hx, hz, f, 1), K.at(px, pz, f, 1), K.at(px, pz, f, H - 2), K.at(hx, hz, f, H - 2)], 'rgba(185,220,235,0.3)', 'rgba(230,245,255,0.8)', 0.7);
    }
    K.box(ctx, f, { ...R(s - 2.4, e + 2.4, -3.5, 1), h0: H, h1: H + 1.8 }, '#b9bec5', { edge: 'rgba(255,255,255,0.6)' });
    if (d.night > 0.15) for (let k = 0; k < 2; k++) { const v = s + (e - s) * (k + 0.5) / 2, p = dr.axis === 'z' ? [v, at - 10] : [at + 10, v], [gx, gy] = K.at(p[0], p[1], f, 0); glow(ctx, gx, gy, 16, '#ffd59a', 0.55 * d.night); }
  }

  // ---- Near walls of the building (low, so the interior reads): a board-formed concrete upstand, a steel cap and a
  // clear glass balustrade; the piece beside the entrance carries the HILLINK lettering. ----
  function nearWall(d, w) {
    const { ctx, K } = d, f = w.f, b = { ...w.box, h0: w.h0, h1: w.h1 }, L = w.e - w.s, H = w.h1 - w.h0;
    K.box(ctx, f, b, '#c9c5bd', { top: '#9b9890' });
    const kind = w.axis === 'z' ? 'front' : 'right', c = w.axis === 'z' ? b.z0 : b.x1;
    K.onFace(ctx, f, kind, c, w.s, w.e, w.h0, w.h1, L, H, g => {
      g.fillStyle = 'rgba(0,0,0,0.07)'; for (let y = 3; y < H; y += 5.5) g.fillRect(0, y, L, 0.5); for (let x = 30; x < L; x += 60) g.fillRect(x, 0, 0.5, H);
      g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < L / 12; i++) g.fillRect(h1(i, w.at, 'tie') * L, 1 + h1(w.at, i) * (H - 2), 0.9, 0.9);
      if (kind === 'right') { g.fillStyle = 'rgba(0,0,10,0.12)'; g.fillRect(0, 0, L, H); }
      if (logoWalls.has(w)) {
        const tw = Math.min(L * 0.62, 110), x0 = L - tw - 10;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.font = `700 ${H * 0.52}px ui-sans-serif, system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
        const m = g.measureText('HILLINK').width; g.save(); g.translate(x0 + 0.8, H * 0.45 + 0.8); g.scale(tw / m, 1); g.fillText('HILLINK', 0, 0); g.restore();
        g.fillStyle = d.night > 0.2 ? '#fff6e0' : '#e9ecef'; g.save(); g.translate(x0, H * 0.45); g.scale(tw / m, 1); g.fillText('HILLINK', 0, 0); g.restore();
        g.fillStyle = C.blue; g.fillRect(x0, H * 0.78, tw * 0.28, 1); g.fillStyle = '#5d6470'; g.font = `600 ${H * 0.16}px ui-sans-serif, system-ui, sans-serif`; g.fillText('HEADQUARTERS', x0 + tw * 0.32, H * 0.8);
      }
    });
    if (logoWalls.has(w) && d.night > 0.2) { const p = w.axis === 'z' ? [w.e - 60, b.z0 - 6] : [b.x1 + 6, w.e - 60], [gx, gy] = K.at(p[0], p[1], f, H * 0.5); glow(ctx, gx, gy, 46, '#ffe9c0', 0.4 * d.night); }
    K.box(ctx, f, { x0: b.x0 - 0.4, x1: b.x1 + 0.4, z0: b.z0 - 0.4, z1: b.z1 + 0.4, h0: w.h1, h1: w.h1 + 1.4 }, C.steel, { edge: 'rgba(255,255,255,0.35)' });
    // Glass balustrade: clear panes between slim posts, a top rail.
    const g0 = w.h1 + 1.4, g1 = w.h1 + 10, mid = w.axis === 'z' ? { x0: b.x0, x1: b.x1, z0: (b.z0 + b.z1) / 2 - 0.4, z1: (b.z0 + b.z1) / 2 + 0.4 } : { x0: (b.x0 + b.x1) / 2 - 0.4, x1: (b.x0 + b.x1) / 2 + 0.4, z0: b.z0, z1: b.z1 };
    K.box(ctx, f, { ...mid, h0: g0, h1: g1 }, null, { front: 'rgba(190,225,240,0.2)', right: 'rgba(170,205,220,0.24)', top: 'rgba(0,0,0,0)' });
    K.box(ctx, f, { ...mid, h0: g1, h1: g1 + 0.8 }, C.alu, { edge: 'rgba(255,255,255,0.5)' });
  }

  // ---- Grounds. ----
  const extras = {
    // Reflecting pool: a pale stone rim, still dark water with the sky in it, rings from a jet, a steel ring sculpture.
    pool(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0, wb = inset(b, 3.5);
      K.box(ctx, 0, { ...b, h0: 0, h1: ex.h }, '#d9d4ca', { edge: 'rgba(255,255,255,0.5)' });
      K.onFloor(ctx, 0, wb, ex.h - 1.2, W - 7, D - 7, g => {
        const w = W - 7, h = D - 7, gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, d.night > 0.4 ? '#123a4a' : '#2d6f80'); gr.addColorStop(1, d.night > 0.4 ? '#1d5a6c' : '#58a9b8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.35, 0); g.lineTo(w * 0.15, h); g.lineTo(0, h); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(230,250,255,0.5)'; g.lineWidth = 0.5; for (let i = 0; i < 3; i++) { const k = (T * 0.25 + i / 3) % 1; g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(w * 0.3, h * 0.5, 2 + k * w * 0.22, 1 + k * h * 0.3, 0, 0, TAU); g.stroke(); } g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 18; i++) g.fillRect(h1(i, ex.x) * w, h1(ex.z, i) * h, 3 + h1(i, 'l') * 5, 0.4);
      });
      // A small jet (rising spray) and a brushed-steel ring on a plinth.
      const [jx, jy] = K.at(b.x0 + W * 0.3, b.z0 + D * 0.5, 0, ex.h); for (let i = 0; i < 8; i++) { const k = (T * 1.2 + i / 8) % 1, a = (h1(i, 'j') - 0.5) * 0.8; ctx.fillStyle = `rgba(235,250,255,${0.7 * (1 - k)})`; ctx.beginPath(); ctx.arc(jx + Math.sin(a) * k * 6, jy - Math.sin(k * Math.PI) * 12, 0.8, 0, TAU); ctx.fill(); }
      const rx = b.x0 + W * 0.72, rz = b.z0 + D * 0.5; K.box(ctx, 0, { x0: rx - 4, x1: rx + 4, z0: rz - 3, z1: rz + 3, h0: ex.h - 1, h1: ex.h + 3 }, '#3a3e46');
      const [sx, sy] = K.at(rx, rz, 0, ex.h + 3 + 13); ctx.strokeStyle = '#c9ced5'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(sx, sy, 7.5, 13, 0.35, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(sx - 0.8, sy - 0.5, 7.5, 13, 0.35, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
      if (d.night > 0.2) glow(ctx, sx, sy + 8, 26, '#7fe0ff', 0.45 * d.night);
    },
    // A corten-steel garden bed: ornamental grasses that sway, lavender, and a small multi-stem tree.
    garden(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0;
      K.box(ctx, 0, { ...b, h0: 0, h1: ex.h }, '#9a5a32', { top: '#4a3626', edge: 'rgba(255,200,160,0.3)' });
      K.onFloor(ctx, 0, inset(b, 1.6), ex.h, W - 3.2, D - 3.2, g => { g.fillStyle = '#5a4430'; g.fillRect(0, 0, W - 3.2, D - 3.2); g.fillStyle = 'rgba(200,190,170,0.35)'; for (let i = 0; i < 40; i++) g.fillRect(h1(i, ex.x, 'g') * (W - 4), h1(ex.z, i, 'g') * (D - 4), 1.2, 0.8); });
      const pts = []; for (let i = 0; i < 14; i++) pts.push([b.x0 + 4 + h1(i, ex.x, 'px') * (W - 8), b.z0 + 4 + h1(i, ex.z, 'pz') * (D - 8), i]);
      pts.sort((p, q) => (q[1] - p[1]) || (p[0] - q[0]));
      for (const [x, z, i] of pts) {
        const [sx, sy] = K.at(x, z, 0, ex.h), sw = Math.sin(T * 1.4 + x * 0.05 + i) * 1.4, k = h1(i, ex.x, 'k');
        if (k < 0.55) { ctx.strokeStyle = k < 0.3 ? '#c8b98a' : '#8fae6a'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let j = 0; j < 7; j++) { const a = (j - 3) * 0.22; ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + a * 6, sy - 7, sx + a * 9 + sw, sy - 11 - h1(i, j) * 4); } ctx.stroke(); if (k < 0.3) { ctx.fillStyle = '#e6dcb8'; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse(sx + (j - 1) * 3 + sw, sy - 14 - j, 0.9, 2.2, 0.2, 0, TAU); ctx.fill(); } } }
        else { ctx.strokeStyle = '#6a7f4a'; ctx.lineWidth = 0.6; ctx.fillStyle = '#9c7fd0'; for (let j = 0; j < 5; j++) { const tx = sx + (j - 2) * 1.6 + sw * 0.5, ty = sy - 7 - h1(j, i) * 3; ctx.beginPath(); ctx.moveTo(sx + (j - 2) * 0.6, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.fillRect(tx - 0.6, ty - 3, 1.2, 3); } }
      }
      // Multi-stem tree: pale stems, a light airy crown.
      const tx = b.x0 + W * 0.62, tz = b.z0 + D * 0.55, [bx, by] = K.at(tx, tz, 0, ex.h), H = 46, sw = Math.sin(T * 0.9 + ex.x) * 1.5;
      ctx.strokeStyle = '#e6e1d6'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const a of [-0.25, 0, 0.3]) { ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + a * 10, by - H * 0.4, bx + a * 18 + sw, by - H * 0.7); } ctx.stroke();
      for (let i = 0; i < 9; i++) { const ox = (h1(i, ex.x, 'cx') - 0.5) * 30 + sw, oy = -H * (0.62 + h1(i, ex.z, 'cy') * 0.32), r = 6 + h1(i, 'cr') * 5; ctx.fillStyle = ['#8fbf5a', '#a6cf6a', '#79a84c'][i % 3]; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(bx + ox, by + oy, r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
      if (d.night > 0.3) glow(ctx, bx, by - H * 0.5, 26, '#ffe0a8', 0.35 * d.night);
    },
    // Service yard: a concrete pad screened by aluminium louvres on its far sides; condensers with turning fans, a
    // generator with its exhaust, and three bins.
    yard(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0;
      K.box(ctx, 0, { ...b, h0: 0, h1: 2 }, '#bdbab3', { edge: 'rgba(255,255,255,0.4)' });
      inPlan(d, 0, g => { g.strokeStyle = 'rgba(220,180,40,0.7)'; g.lineWidth = 0.8; g.setLineDash([3, 2]); g.strokeRect(b.x0 + 3, b.z0 + 3, W - 6, D - 6); g.setLineDash([]); });
      const slats = (kind, c, a, e) => { for (let s = a; s < e - 1; s += 3) K.box(ctx, 0, kind === 'front' ? { x0: s, x1: s + 1.6, z0: c - 0.6, z1: c + 0.6, h0: 2, h1: 2 + ex.h * 1.05 } : { x0: c - 0.6, x1: c + 0.6, z0: s, z1: s + 1.6, h0: 2, h1: 2 + ex.h * 1.05 }, '#9aa1aa'); };
      slats('front', b.z1 - 1, b.x0, b.x1); slats('right', b.x0 + 1, b.z0, b.z1 - 1);
      for (let k = 0; k < 2; k++) { const x = b.x0 + 10 + k * 22, z = b.z1 - 16; K.box(ctx, 0, { x0: x - 9, x1: x + 9, z0: z - 7, z1: z + 7, h0: 2, h1: 18 }, '#d9dce0', { edge: 'rgba(255,255,255,0.5)' }); K.onFace(ctx, 0, 'front', z - 7, x - 9, x + 9, 2, 18, 18, 16, g => { g.fillStyle = 'rgba(40,45,55,0.3)'; for (let y = 2; y < 15; y += 1.5) g.fillRect(1.5, y, 15, 0.5); g.fillStyle = '#39d47a'; if (Math.sin(T * 2 + k) > 0) g.fillRect(15, 1.5, 1, 1); }); fan(d, 0, x, z, 18, 6, T * (5 + k)); }
      const gx = b.x1 - 14, gz = b.z0 + 14;
      K.box(ctx, 0, { x0: gx - 10, x1: gx + 10, z0: gz - 7, z1: gz + 7, h0: 2, h1: 20 }, '#5f6a62', { edge: 'rgba(255,255,255,0.3)' });
      K.onFace(ctx, 0, 'front', gz - 7, gx - 10, gx + 10, 2, 20, 20, 18, g => { g.fillStyle = '#f2b630'; g.fillRect(2, 2, 6, 3); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 10; x < 19; x += 1.6) g.fillRect(x, 3, 0.6, 12); });
      K.cylinder(ctx, 0, gx + 6, gz + 4, 20, 30, 1.2, '#3a3e46');
      const [ex0, ey0] = K.at(gx + 6, gz + 4, 0, 30); for (let i = 0; i < 3; i++) { const k = (T * 0.3 + i / 3) % 1; ctx.fillStyle = `rgba(200,205,210,${0.18 * (1 - k)})`; ctx.beginPath(); ctx.arc(ex0 + k * 6, ey0 - k * 16, 1.5 + k * 3, 0, TAU); ctx.fill(); }
      for (let k = 0; k < 3; k++) { const x = b.x0 + 8 + k * 9, z = b.z0 + 8; K.box(ctx, 0, { x0: x - 3.5, x1: x + 3.5, z0: z - 3.5, z1: z + 3.5, h0: 2, h1: 13 }, ['#2f6fd6', '#3c8f4a', '#5d6470'][k], { edge: 'rgba(255,255,255,0.3)' }); K.box(ctx, 0, { x0: x - 3.8, x1: x + 3.8, z0: z - 3.8, z1: z + 3.8, h0: 13, h1: 14 }, '#2b2f36'); }
    },
    // Bike rack: steel hoops and two bikes.
    rack(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), W = b.x1 - b.x0;
      inPlan(d, 0, g => { g.fillStyle = 'rgba(60,64,72,0.18)'; g.fillRect(b.x0 - 2, b.z0 - 2, W + 4, b.z1 - b.z0 + 4); });
      for (let k = 0; k < 4; k++) { const x = b.x0 + 6 + k * (W - 12) / 3, p0 = K.at(x, ex.z - 4, 0, 0), p1 = K.at(x, ex.z + 4, 0, 0); ctx.strokeStyle = '#4b525c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(p0[0], p0[1] - 10); ctx.quadraticCurveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 14, p1[0], p1[1] - 10); ctx.lineTo(...p1); ctx.stroke(); }
      for (const [k, col] of [[0.5, '#c0533d'], [2.5, '#2f6fd6']]) { const x = b.x0 + 6 + k * (W - 12) / 3, [cx, cy] = K.at(x, ex.z - 1, 0, 0), r = 4.2; ctx.strokeStyle = '#22252b'; ctx.lineWidth = 0.9; for (const dx of [-6, 6]) { ctx.beginPath(); ctx.ellipse(cx + dx, cy - r, r * 0.9, r, 0, 0, TAU); ctx.stroke(); } ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(cx - 6, cy - r); ctx.lineTo(cx - 1, cy - r * 2.1); ctx.lineTo(cx + 5, cy - r * 2.1); ctx.lineTo(cx + 6, cy - r); ctx.lineTo(cx, cy - r); ctx.lineTo(cx - 1, cy - r * 2.1); ctx.stroke(); ctx.strokeStyle = '#22252b'; ctx.beginPath(); ctx.moveTo(cx + 4, cy - r * 2.5); ctx.lineTo(cx + 7, cy - r * 2.4); ctx.stroke(); }
    },
    // A clipped box hedge (along a side of the building), soft-edged with leaf texture.
    hedge(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), H = ex.h;
      K.box(ctx, 0, { ...b, h0: 0, h1: H }, '#4f8a3c', { front: '#4a8238', right: '#3a6a2c', top: '#64a04a' });
      const pts = [];
      for (let i = 0; i < 46; i++) { const k = h1(i, ex.x, ex.z), u = h1(ex.z, i, 'u'), v = h1(i, 'v', ex.x); if (k < 0.4) pts.push([K.at(b.x0 + u * (b.x1 - b.x0), b.z0, 0, v * H), '#5c9a46']); else if (k < 0.7) pts.push([K.at(b.x1, b.z0 + u * (b.z1 - b.z0), 0, v * H), '#2f5a24']); else pts.push([K.at(b.x0 + u * (b.x1 - b.x0), b.z0 + v * (b.z1 - b.z0), 0, H), '#7ab85a']); }
      for (const [[x, y], c] of pts) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
    },
    // A parked car in its bay (bay lines on the ground); the first one is plugged into a charger.
    parked(d, ex) {
      const { ctx, K } = d, a = ex.angle ?? 0, c = Math.cos(a), sn = Math.sin(a), L = 26, W = 12, col = ['#e9ecef', '#2b2f36', '#3a6fb0'][ex.seed % 3];
      inPlan(d, 0, g => { g.save(); g.translate(ex.x, ex.z); g.rotate(a); g.strokeStyle = 'rgba(240,240,232,0.8)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-L * 1.2, -W * 1.55); g.lineTo(L * 1.2, -W * 1.55); g.moveTo(-L * 1.2, W * 1.55); g.lineTo(L * 1.2, W * 1.55); g.stroke(); g.restore(); });
      K.ellipseShadow(ctx, ...K.at(ex.x + 2, ex.z + 1, 0, 0), L * 0.95, W * 0.75, 0.25);
      const at = (u, v, h) => K.at(ex.x + c * u - sn * v, ex.z + sn * u + c * v, 0, h);
      for (const [u, v] of [[L * 0.62, W], [-L * 0.62, W], [L * 0.62, -W], [-L * 0.62, -W]]) { const [wx, wy] = at(u, v * 0.92, 3.2); ctx.fillStyle = '#1b1d22'; ctx.beginPath(); ctx.ellipse(wx, wy, 3.4, 3.2, 0, 0, TAU); ctx.fill(); }
      orientedBox(d, 0, ex.x, ex.z, L * 2, W * 2, 2.5, 9, a, col, { edge: 'rgba(255,255,255,0.35)' });
      orientedBox(d, 0, ex.x - c * 2, ex.z - sn * 2, L * 1.15, W * 1.7, 9, 15, a, '#2b3846', { top: shade(col, 1.03), edge: 'rgba(200,225,240,0.6)' });
      for (const sg of [-1, 1]) { const [hx, hy] = at(L * 0.99, sg * W * 0.6, 7); ctx.fillStyle = d.night > 0.3 ? '#fff3c4' : '#e6e9ec'; ctx.beginPath(); ctx.arc(hx, hy, 1.2, 0, TAU); ctx.fill(); if (d.night > 0.3) glow(ctx, hx, hy, 6, '#fff3c4', 0.4); const [tx, ty] = at(-L * 0.99, sg * W * 0.6, 7); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(tx, ty, 1, 0, TAU); ctx.fill(); }
      if (ex.seed === 0) { const [px, pz] = [ex.x - c * L * 1.45, ex.z - sn * L * 1.45]; K.box(ctx, 0, { x0: px - 2.5, x1: px + 2.5, z0: pz - 2, z1: pz + 2, h0: 0, h1: 24 }, '#e9ecef', { edge: 'rgba(255,255,255,0.5)' }); const [lx, ly] = K.at(px, pz - 2, 0, 20); ctx.fillStyle = '#39d47a'; ctx.fillRect(lx - 1.5, ly, 3, 1.2); const [qx, qy] = at(-L * 0.8, W * 0.4, 8); ctx.strokeStyle = '#1d2128'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(lx, ly + 3); ctx.quadraticCurveTo((lx + qx) / 2, Math.max(ly, qy) + 10, qx, qy); ctx.stroke(); if (d.night > 0.2) glow(ctx, lx, ly, 9, '#39d47a', 0.5 * d.night); }
    },
    // An outdoor terrace: an oak deck, two tables under cream parasols, chairs, a lounger and corner planters.
    terrace(d, ex) {
      const { ctx, K } = d, b = rectOf(ex), T = tt(d), W = b.x1 - b.x0, D = b.z1 - b.z0, h = ex.h;
      K.box(ctx, 0, { ...b, h0: 0, h1: h }, '#b98756', { edge: 'rgba(255,240,220,0.35)' });
      K.onFloor(ctx, 0, b, h, W, D, g => { g.fillStyle = 'rgba(60,35,15,0.28)'; for (let y = 3; y < D; y += 3.2) g.fillRect(0, y, W, 0.4); for (let i = 0; i < 30; i++) g.fillRect(h1(i, 'tj') * W, Math.floor(h1('tj', i) * D / 3.2) * 3.2, 0.4, 3.2); });
      for (const [px, pz] of [[b.x0 + 4, b.z1 - 4], [b.x1 - 4, b.z1 - 4]]) { K.box(ctx, 0, { x0: px - 3.5, x1: px + 3.5, z0: pz - 3.5, z1: pz + 3.5, h0: h, h1: h + 7 }, '#3a3e46'); const [sx, sy] = K.at(px, pz, 0, h + 7); for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#3f7d4a', '#58a05c'][i % 2]; ctx.beginPath(); ctx.ellipse(sx + (h1(i, px) - 0.5) * 7, sy - 3 - h1(px, i) * 6, 3, 1.6, (h1(i, 'a') - 0.5) * 2, 0, TAU); ctx.fill(); } }
      const tables = [[b.x0 + W * 0.3, b.z0 + D * 0.5], [b.x0 + W * 0.72, b.z0 + D * 0.42]];
      for (const [tx, tz] of tables) {
        for (const [cx, cz] of [[tx - 7, tz + 2], [tx + 7, tz + 3], [tx + 1, tz - 7]]) { K.box(ctx, 0, { x0: cx - 2.4, x1: cx + 2.4, z0: cz - 2.4, z1: cz + 2.4, h0: h + 6, h1: h + 7 }, '#e9e6df'); K.box(ctx, 0, { x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5, h0: h, h1: h + 6 }, C.steel); }
        K.cylinder(ctx, 0, tx, tz, h, h + 10, 0.7, C.steel); K.cylinder(ctx, 0, tx, tz, h + 10, h + 11, 5, '#f1efea', { edge: 'rgba(0,0,0,0.1)' });
        K.cylinder(ctx, 0, tx, tz, h + 11, h + 13, 1, '#e9e6df');
        // The parasol: a pole and a soft canopy.
        const [px, py] = K.at(tx, tz, 0, h + 11), top = py - 30, rx = 17, sw = Math.sin(T * 0.8 + tx) * 0.5;
        ctx.strokeStyle = '#8f969f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, top); ctx.stroke();
        ctx.fillStyle = '#efe9dc'; ctx.beginPath(); ctx.moveTo(px - rx, top + 7 + sw); ctx.quadraticCurveTo(px, top - 7, px + rx, top + 7 - sw); ctx.quadraticCurveTo(px, top + 11, px - rx, top + 7 + sw); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath(); ctx.moveTo(px, top - 3); ctx.quadraticCurveTo(px + rx * 0.5, top, px + rx, top + 7 - sw); ctx.quadraticCurveTo(px + rx * 0.4, top + 9, px, top + 9); ctx.fill();
        ctx.strokeStyle = 'rgba(160,150,130,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (const k of [-0.6, 0, 0.6]) { ctx.moveTo(px, top - 3); ctx.lineTo(px + rx * k, top + 8 + (k ? 0 : 1)); } ctx.stroke();
        if (d.night > 0.3) glow(ctx, px, top + 10, 24, '#ffd9a0', 0.45 * d.night);
      }
      // A lounger along the front edge.
      const lx = b.x0 + W * 0.5, lz = b.z0 + 5; K.box(ctx, 0, { x0: lx - 9, x1: lx + 9, z0: lz - 3, z1: lz + 3, h0: h + 2, h1: h + 4 }, '#d9d4c8', { edge: 'rgba(255,255,255,0.4)' }); K.box(ctx, 0, { x0: lx + 5, x1: lx + 9, z0: lz - 3, z1: lz + 3, h0: h + 4, h1: h + 9 }, '#d9d4c8');
    },
    // Gateway pylons where the path meets the forecourt: dark steel with a vertical light line, a brass name plate.
    gate(d, ex) {
      const { ctx, K } = d, T = tt(d), half = (ex.axis === 'z' ? ex.d : ex.w) / 2;
      for (const sg of [-1, 1]) {
        const [x, z] = ex.axis === 'z' ? [ex.x, ex.z + sg * half] : [ex.x + sg * half, ex.z], b = { x0: x - 4, x1: x + 4, z0: z - 4, z1: z + 4, h0: 0, h1: ex.h };
        K.shadow(ctx, 0, b, ex.h, 0.18);
        K.box(ctx, 0, b, '#2c3038', { edge: 'rgba(255,255,255,0.3)' });
        K.onFace(ctx, 0, 'front', b.z0, b.x0, b.x1, 0, ex.h, 8, ex.h, g => { g.fillStyle = d.night > 0.2 ? '#ffe6b8' : '#8f969f'; g.fillRect(3.4, 6, 1.2, ex.h - 14); if (sg < 0) { g.fillStyle = '#c9a45c'; g.fillRect(1, ex.h * 0.55, 6, 5); g.fillStyle = '#2c3038'; g.font = '700 1.6px ui-sans-serif, system-ui'; g.textAlign = 'center'; g.fillText('HILLINK', 4, ex.h * 0.55 + 3); } });
        K.box(ctx, 0, { ...b, x0: b.x0 - 0.6, x1: b.x1 + 0.6, z0: b.z0 - 0.6, z1: b.z1 + 0.6, h0: ex.h, h1: ex.h + 1.5 }, '#c9a45c');
        if (d.night > 0.2) { const [gx, gy] = K.at(x, b.z0, 0, ex.h * 0.5); glow(ctx, gx, gy, 22, '#ffe6b8', 0.4 * d.night * (0.9 + 0.1 * Math.sin(T))); }
      }
    },
  };
  function extraLight(ex, d) {
    if (ex.type === 'pool') return { r: 50, col: '#7fe0ff', i: 0.5, h: 6 };
    if (ex.type === 'gate') return { r: 46, col: '#ffe6b8', i: 0.6, h: ex.h * 0.6 };
    if (ex.type === 'garden') return { r: 30, col: '#ffe0a8', i: 0.35, h: 20 };
    return null;
  }
  // Lights on the building itself: the rooftop letters and the lettering beside the entrance.
  function buildingLights(b, d) {
    const out = [], rw = roofWall.get(b);
    if (rw) { const L = rw.e - rw.s, lw = Math.min(L * 0.36, 150); out.push({ x: rw.s + L * 0.08 + lw / 2, z: rw.at, f: rw.f, h: HT + 14, r: lw * 0.75, col: '#dbe8ff', i: 0.75 }); }
    for (const w of logoWalls) if (b.levels.includes(w.f)) out.push({ x: w.axis === 'z' ? w.e - 50 : w.at + 8, z: w.axis === 'z' ? w.at - 8 : w.e - 50, f: w.f, h: LOW * 0.5, r: 70, col: '#ffe9c0', i: 0.6 });
    for (const sp of hearthSpots) if (b.levels.includes(sp.f)) { const [x, z] = sp.axis === 'x' ? [sp.at + 14, sp.c] : [sp.c, sp.at - 14]; out.push({ x, z, f: sp.f, h: 12, r: 70, col: '#ffb060', i: 0.7 }); }
    return out;
  }
  return { corner, levelTop, nearWall, extras, extraLight, buildingLights };
}
