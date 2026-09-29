// Scenery renderer: the animation layers that turn a painted base plate into a living HQ.
//   base plate -> room light -> water / machinery / screens / lights -> vehicles -> (entities: NPCs,
//   agents, lift car, foreground occluders, sorted by depth) -> sparks and particles -> UI.
// Three levels (brief §8): MICRO runs constantly (LEDs, screens, water, fans, signs), AMBIENT happens
// now and then on independent timers (cars, lift trips, crane moves, rotor idle, staff walks), and
// SEMANTIC comes only from real World state via `env.activity` (rooms, workstations, construction).
import { hash, occasional, vehiclesAt } from '../engine/ambience.mjs';
import { drawCharacter } from './character.mjs';

const TAU = Math.PI * 2;
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function path(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
const bbox = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
// Crane moves between randomly chosen targets in windows; `period` seconds per move, `move` of which are motion.
function keyed(t, period, move, seed, lo, hi) {
  const k = Math.floor(t / period), v = i => lo + hash(i * 3.3 + seed) * (hi - lo);
  return v(k - 1) + (v(k) - v(k - 1)) * smooth((t - k * period) / move);
}

export function createScenery(sc, plate) {
  const drawPlateClip = (ctx, shapes) => {
    if (!plate.ready()) return;
    ctx.save(); ctx.beginPath();
    for (const s of shapes) {
      if (s.poly) s.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))), ctx.closePath();
      if (s.circle) { ctx.moveTo(s.circle[0] + s.circle[2], s.circle[1]); ctx.arc(s.circle[0], s.circle[1], s.circle[2], 0, TAU); }
      if (s.ellipse) { ctx.moveTo(s.ellipse[0] + s.ellipse[2], s.ellipse[1]); ctx.ellipse(s.ellipse[0], s.ellipse[1], s.ellipse[2], s.ellipse[3], 0, 0, TAU); }
    }
    ctx.clip(); ctx.drawImage(plate.img, plate.origin[0], plate.origin[1], plate.size[0], plate.size[1]); ctx.restore();
  };

  function roomLight(ctx, t, activity) {
    for (const [room, [x, y, w, h]] of Object.entries(sc.rooms ?? {})) {
      const level = activity?.rooms?.[room] ?? 0; if (level <= 0) continue;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 4, x + w / 2, y + h * 0.55, Math.max(w, h) * 0.6);
      g.addColorStop(0, room === 'testing' ? '#4fa8ff' : room === 'deploy' ? '#ffb347' : '#ffcf8a'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (0.1 + 0.03 * Math.sin(t * 1.3)) * level; ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  function water(ctx, t, motion) {
    for (const wv of sc.water ?? []) {
      const [x0, y0, x1, y1] = bbox(wv.poly), w = x1 - x0, h = y1 - y0;
      ctx.save(); path(ctx, wv.poly); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      // Falling sheets: many thin streaks at different speeds.
      const n = Math.round(w / 1.6);
      for (let i = 0; i < n; i++) {
        const sx = x0 + (i + hash(i)) * (w / n), speed = 55 + hash(i * 1.7) * 45, len = 22 + hash(i * 2.3) * 40;
        for (let k = 0; k < 2; k++) {
          const yy = y0 - len + (((motion ? t : 0) * speed + hash(i * 9 + k) * (h + len) + k * (h + len) / 2) % (h + len));
          const g = ctx.createLinearGradient(sx, yy, sx, yy + len); g.addColorStop(0, 'rgba(160,215,255,0)'); g.addColorStop(0.8, 'rgba(200,235,255,0.22)'); g.addColorStop(1, 'rgba(235,248,255,0.32)');
          ctx.strokeStyle = g; ctx.lineWidth = 0.6 + hash(i * 3.1) * 0.9; ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx, yy + len); ctx.stroke();
        }
      }
      // A slow shimmer band travelling down the wall.
      const band = y0 + (((motion ? t : 0) * 22) % (h + 40)) - 20;
      const g = ctx.createLinearGradient(0, band - 14, 0, band + 14); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(210,240,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, band - 14, w, 28);
      ctx.restore();
      // Foam where the sheet hits the pool.
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const [a, b] = [wv.poly[3], wv.poly[2]];
      for (let i = 0; i < 46; i++) {
        const k = (i + hash(i * 5.5)) / 46, fx = a[0] + (b[0] - a[0]) * k, fy = a[1] + (b[1] - a[1]) * k;
        const j = motion ? Math.sin(t * (6 + hash(i) * 5) + i) : 0;
        ctx.globalAlpha = 0.12 + 0.1 * j; ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.ellipse(fx, fy - 1 - Math.abs(j) * 2, 2.5 + hash(i * 2) * 2, 1.2 + Math.abs(j), 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (wv.pool) {
        ctx.save(); path(ctx, wv.pool); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
        const [px0, py0, px1, py1] = bbox(wv.pool);
        for (let i = 0; i < 9; i++) {
          const life = 3.5, age = ((motion ? t : 0) + hash(i * 4.4) * life) % life, cx = px0 + hash(i * 7.7 + Math.floor((t + hash(i * 4.4) * life) / life)) * (px1 - px0), cy = py0 + 6 + hash(i * 2.9) * (py1 - py0 - 12);
          ctx.globalAlpha = 0.22 * (1 - age / life); ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(cx, cy, 3 + age * 7, 1 + age * 2, 0, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // Fountains: rippling pool, drifting highlights and a sparkling jet.
  function fountains(ctx, t, motion) {
    for (const f of sc.fountains ?? []) {
      const [x0, y0, x1, y1] = bbox(f.pool), tt = motion ? t : 0;
      ctx.save(); path(ctx, f.pool); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const y = y0 + ((hash(i * 3.3) * (y1 - y0) + tt * (4 + hash(i) * 5)) % (y1 - y0)), x = x0 + hash(i * 1.9) * (x1 - x0);
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(tt * 2 + i); ctx.strokeStyle = '#d8f3ff'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let k = 0; k <= 8; k++) { const px = x - 22 + k * 5.5, py = y + Math.sin(k * 1.3 + tt * 3 + i) * 1.4; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
      }
      for (let i = 0; i < 10; i++) {
        const life = 3, age = (tt + hash(i * 4.4) * life) % life, n = Math.floor((tt + hash(i * 4.4) * life) / life);
        const cx = f.jet[0] + (hash(i * 7.7 + n) - 0.5) * 120, cy = f.jet[1] + 10 + hash(i * 2.9 + n) * 50;
        ctx.globalAlpha = 0.3 * (1 - age / life); ctx.strokeStyle = '#bfe6ff'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.ellipse(cx, cy, 3 + age * 9, 1.2 + age * 2.6, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, f.jet[0], f.jet[1], 26, '#9fd8ff', 0.35);
      for (let i = 0; i < 46; i++) {
        const u = ((tt * 0.8 + hash(i)) % 1), spread = (hash(i * 2.2) - 0.5) * 22;
        const x = f.jet[0] + spread * u, y = f.jet[1] - f.height * 4 * u * (1 - u) * (0.7 + hash(i * 3) * 0.3);
        ctx.globalAlpha = 0.65 * (1 - u * 0.6); ctx.fillStyle = i % 4 ? '#e6f7ff' : '#ffffff'; ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
      ctx.restore();
    }
  }
  function magic(ctx, t, motion) {
    if (!motion) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    (sc.magic ?? []).forEach((m, mi) => {
      for (let i = 0; i < 16; i++) {
        const a = t * (0.4 + hash(i + mi) * 0.5) + i * 1.7, rr = m.r * (0.3 + 0.7 * hash(i * 2.7 + mi)), y = m.at[1] + Math.sin(a) * rr * 0.35 - ((t * 6 + hash(i) * 40) % 40);
        glow(ctx, m.at[0] + Math.cos(a) * rr, y, 3, m.color, 0.45 + 0.3 * Math.sin(t * 3 + i));
      }
    });
    ctx.restore();
  }

  // Monitors: faint flicker when their room is quiet, bright and busy when real work happens there.
  function screens(ctx, t, activity, motion) {
    sc.screens?.forEach((s, i) => {
      const [x, y, w, h] = s.rect, room = activity?.rooms?.[s.room] ?? 0;
      const hot = s.station ? activity?.stations?.[`${s.room}:${s.station}`] : null;
      const meetingOff = s.meeting && room <= 0;
      let level = hot ? 1 : room > 0 ? 0.6 : 0.22;
      if (meetingOff) level = 0.08;
      const tt = motion ? t : 0, speed = hot ? 26 : room > 0 ? 12 : 3;
      // Content "changes" now and then even when idle.
      const flash = occasional(tt, { every: 7 + hash(i) * 9, duration: 0.35, seed: i * 13 });
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      const col = hot?.color ?? (s.holo ? (i % 2 ? '#b58cff' : '#7fd4ff') : s.room === 'testing' ? '#5ee1ff' : s.room === 'operations' ? '#8fd0ff' : '#9fd3ff');
      ctx.globalAlpha = 0.12 * level; ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = Math.min(1, 0.55 * level + (flash >= 0 ? 0.25 : 0));
      if (s.kind === 'code' || s.kind === 'log') {
        const lh = Math.max(2, h / 9), off = (tt * speed) % lh;
        for (let k = -1; k < h / lh + 1; k++) {
          const row = Math.floor(tt * speed / lh) + k, len = 0.25 + hash(row * 1.3 + i) * 0.65, ind = s.kind === 'code' ? hash(row * 0.7 + i) * 0.3 : 0;
          ctx.fillStyle = s.kind === 'log' && hash(row * 2.1 + i) > 0.85 ? '#ffb347' : col;
          ctx.fillRect(x + 2 + ind * w, y + h - (k * lh) + off - lh, (w - 4) * len * (1 - ind), lh * 0.45);
        }
        if (hot && Math.floor(tt * 2) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w * 0.6, y + h - lh * 1.4, lh * 0.5, lh * 0.6); }
      } else if (s.kind === 'graph') {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k <= 12; k++) { const gx = x + (k / 12) * w, gy = y + h * (0.55 + 0.3 * Math.sin(k * 0.9 + tt * speed * 0.08 + i)); k ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy); }
        ctx.stroke();
        for (let k = 0; k < 5; k++) { const bh = h * 0.35 * (0.3 + 0.7 * Math.abs(Math.sin(tt * speed * 0.05 + k + i))); ctx.fillRect(x + 2 + k * (w - 4) / 5, y + h - bh - 1, (w - 4) / 5 - 1, bh); }
      } else if (s.kind === 'radar') {
        const cx = x + w / 2, cy = y + h / 2, rr = Math.min(w, h) * 0.45, a = tt * (hot || room > 0 ? 2.4 : 0.8);
        ctx.strokeStyle = col; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, rr * 0.5, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, a, a + 0.7); ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha *= 0.6; ctx.fill();
        for (let k = 0; k < 3; k++) { const ba = hash(k + Math.floor(tt / 3)) * TAU, br = rr * (0.3 + hash(k * 2 + Math.floor(tt / 3)) * 0.6); ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 1.5, 1.5); }
      } else {
        const cols = 3, rows = 3;
        for (let k = 0; k < cols * rows; k++) {
          const on = hash(k + i * 9 + Math.floor(tt * (speed * 0.08 + 0.2) + k * 0.37)) > 0.35;
          if (!on) continue;
          ctx.fillStyle = hash(k * 3 + i) > 0.8 ? '#ffd166' : col;
          ctx.fillRect(x + 1 + (k % cols) * (w - 2) / cols, y + 1 + Math.floor(k / cols) * (h - 2) / rows, (w - 2) / cols - 1, (h - 2) / rows - 1);
        }
      }
      ctx.restore();
      if (hot) glow(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 1.3, col, 0.18 + 0.05 * Math.sin(tt * 3));
    });
  }

  function leds(ctx, t, activity, motion) {
    const busy = (activity?.rooms?.servers ?? 0) > 0;
    sc.leds?.forEach((l, li) => {
      const [x, y, w, h] = l.rect;
      for (let c = 0; c < l.cols; c++) for (let r = 0; r < l.rows; r++) {
        const n = li * 100 + c * 17 + r, rate = (busy ? 6 : 1.6) + hash(n) * 3;
        const on = hash(n * 1.3 + Math.floor((motion ? t : 0) * rate + hash(n) * 10)) > 0.35;
        if (!on) continue;
        const lx = x + (c + 0.5) * w / l.cols, ly = y + (r + 0.5) * h / l.rows, col = l.colors[n % l.colors.length];
        ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fillRect(lx - 0.8, ly - 0.6, 1.6, 1.2);
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, lx, ly, 3, col, 0.35); ctx.globalCompositeOperation = 'source-over';
      }
    });
    ctx.globalAlpha = 1;
  }

  function fans(ctx, t, activity, motion) {
    const busy = (activity?.rooms?.servers ?? 0) > 0;
    sc.fans?.forEach((f, i) => {
      const [x, y] = f.at, r = f.r, a = motion ? t * (busy ? 9 : 4.5) + i : i;
      ctx.fillStyle = '#1a2230'; ctx.beginPath(); ctx.ellipse(x, y, r + 1.5, (r + 1.5) * 0.45, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6d7b8f'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = '#aab6c6'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { const b = a + k * TAU / 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r * 0.45); ctx.stroke(); }
      ctx.fillStyle = '#d7dde6'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 0.8, 0, 0, TAU); ctx.fill();
    });
  }

  function crane(ctx, t, activity, motion) {
    const c = sc.crane; if (!c) return;
    const tt = motion ? t : 0, busy = (activity?.construction ?? 0) > 0;
    const theta = keyed(tt, busy ? 16 : 26, busy ? 7 : 11, 1, -0.75, 0.35);
    const along = keyed(tt + 5, busy ? 11 : 19, 6, 2, 0.4, 0.95), drop = keyed(tt + 9, busy ? 9 : 15, 5, 3, c.drop[0], c.drop[1]);
    const [px, py] = c.pivot, [ax, ay] = c.apex, cos = Math.cos(theta), sin = Math.sin(theta);
    const tip = [px + c.jib * cos, py + c.jib * sin * 0.28], back = [px - c.counter * cos, py - c.counter * sin * 0.28];
    const col = c.color, dark = '#9a6212';
    ctx.lineCap = 'round';
    // Counter-jib and weight.
    ctx.strokeStyle = sin < 0 ? dark : col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(...back); ctx.stroke();
    ctx.fillStyle = '#5b6270'; ctx.fillRect(back[0] - 8, back[1] - 4, 16, 12); ctx.fillStyle = '#7b8392'; ctx.fillRect(back[0] - 8, back[1] - 4, 16, 3);
    // Ties from the apex.
    ctx.strokeStyle = '#d9c9a8'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px + (tip[0] - px) * 0.62, py + (tip[1] - py) * 0.62 - 3); ctx.moveTo(ax, ay); ctx.lineTo(...back); ctx.stroke();
    // Lattice jib: two chords with a zigzag.
    const top0 = [px, py - 7], top1 = [tip[0], tip[1] - 2.5], bot0 = [px, py + 5], bot1 = [tip[0], tip[1] + 2];
    ctx.fillStyle = 'rgba(240,162,30,0.18)'; ctx.beginPath(); ctx.moveTo(...top0); ctx.lineTo(...top1); ctx.lineTo(...bot1); ctx.lineTo(...bot0); ctx.fill();
    ctx.strokeStyle = sin > 0.15 ? '#ffc04d' : col; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(...top0); ctx.lineTo(...top1); ctx.moveTo(...bot0); ctx.lineTo(...bot1); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath();
    const n = Math.max(3, Math.round(Math.abs(c.jib * cos) / 8));
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = [top0[0] + (top1[0] - top0[0]) * k, top0[1] + (top1[1] - top0[1]) * k], b = [bot0[0] + (bot1[0] - bot0[0]) * k, bot0[1] + (bot1[1] - bot0[1]) * k];
      i % 2 ? ctx.moveTo(...a) : ctx.moveTo(...b); i % 2 ? ctx.lineTo(...b) : ctx.lineTo(...a);
      if (i < n) { const k2 = (i + 1) / n, a2 = [top0[0] + (top1[0] - top0[0]) * k2, top0[1] + (top1[1] - top0[1]) * k2]; ctx.moveTo(...b); ctx.lineTo(...a2); }
    }
    ctx.stroke();
    ctx.fillStyle = '#2a2f38'; ctx.fillRect(px - 5, py - 7, 10, 9); // slewing cab
    // Trolley, cable, hook and (sometimes) a steel beam load.
    const tr = [px + (tip[0] - px) * along, py + (tip[1] - py) * along + 3.5];
    const swing = motion ? Math.sin(t * 1.3) * 1.5 : 0, hook = [tr[0] + swing, tr[1] + drop];
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(tr[0] - 3, tr[1] - 1, 6, 3);
    ctx.strokeStyle = '#1e2126'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(tr[0] - 1, tr[1]); ctx.lineTo(hook[0] - 1, hook[1]); ctx.moveTo(tr[0] + 1, tr[1]); ctx.lineTo(hook[0] + 1, hook[1]); ctx.stroke();
    ctx.fillStyle = '#f2b01e'; ctx.fillRect(hook[0] - 2.5, hook[1], 5, 4);
    if (hash(Math.floor((tt + 9) / (busy ? 9 : 15)) * 1.9) > 0.35) {
      ctx.save(); ctx.translate(hook[0], hook[1] + 9); ctx.rotate(swing * 0.04 + 0.08);
      ctx.strokeStyle = '#1e2126'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-12, 0); ctx.moveTo(0, -5); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-16, 0, 32, 3.5); ctx.fillStyle = '#b87333'; ctx.fillRect(-16, 0, 32, 1.2);
      ctx.restore();
    }
  }

  function heli(ctx, t, motion) {
    const h = sc.heli; if (!h) return;
    const D = 18, p = motion ? occasional(t, { every: 75, duration: D, chance: 0.75, seed: 4 }) : -1;
    const w = p >= 0 ? Math.sin(Math.PI * p) : 0;
    const angle = 0.35 + (p >= 0 ? 34 * D / Math.PI * (1 - Math.cos(Math.PI * p)) : 0);
    const [x, y] = h.hub, R = h.radius;
    if (w > 0.45) { ctx.fillStyle = '#c8d2de'; ctx.globalAlpha = 0.1 * w; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.2, -0.06, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#111519'; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const a = angle + k * Math.PI / 2, dx = Math.cos(a) * R, dy = Math.sin(a) * R * 0.2;
      ctx.globalAlpha = w > 0.45 ? 0.35 : 1; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy - 0.06 * dx); ctx.lineTo(x + dx, y + dy + 0.06 * -dx); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#1b2027'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill();
    const ta = angle * 1.7, [tx, ty] = h.tail;
    ctx.strokeStyle = '#15191e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tx - Math.cos(ta) * h.tailR, ty - Math.sin(ta) * h.tailR); ctx.lineTo(tx + Math.cos(ta) * h.tailR, ty + Math.sin(ta) * h.tailR); ctx.stroke();
    if (w > 0.2) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + 55, y + 28, 6, Math.floor(t * 2) % 2 ? '#ff4040' : '#40ff70', 0.9 * w); ctx.globalCompositeOperation = 'source-over'; }
  }

  function vehicle(ctx, v) {
    const dims = { car: [30, 14], suv: [33, 15.5], van: [37, 16], truck: [50, 19] }[v.kind] ?? [30, 14];
    const [L, W] = [dims[0] * v.scale * 1.55, dims[1] * v.scale * 1.3];
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle);
    // Headlight beams ahead.
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(L / 2, 0, 2, L / 2 + 40, 0, 46); g.addColorStop(0, 'rgba(255,240,200,0.35)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(L / 2, -W * 0.3); ctx.lineTo(L / 2 + 70, -W * 1.2); ctx.lineTo(L / 2 + 70, W * 1.2); ctx.lineTo(L / 2, W * 0.3); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(-L / 2 + 1, -W / 2 + 3, L, W, 4); ctx.fill(); // shadow
    ctx.fillStyle = v.color; ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.35); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-L / 2 + 2, W * 0.15, L - 4, W * 0.3);
    if (v.kind === 'truck') { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-L / 2, -W / 2, L * 0.68, W); ctx.fillStyle = '#1c2533'; ctx.fillRect(L * 0.24, -W / 2 + 2, L * 0.12, W - 4); }
    else { ctx.fillStyle = '#16202c'; ctx.beginPath(); ctx.roundRect(-L * 0.18, -W / 2 + 2, L * 0.46, W - 4, 3); ctx.fill(); ctx.fillStyle = 'rgba(160,200,255,0.35)'; ctx.fillRect(L * 0.16, -W / 2 + 2.5, L * 0.1, W - 5); }
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(L / 2 - 2, -W / 2 + 1.5, 2, 3); ctx.fillRect(L / 2 - 2, W / 2 - 4.5, 2, 3);
    ctx.fillStyle = '#ff2a2a'; ctx.fillRect(-L / 2, -W / 2 + 1.5, 1.8, 3); ctx.fillRect(-L / 2, W / 2 - 4.5, 1.8, 3);
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, -L / 2 - 2, 0, 9, '#ff2020', v.stopped ? 0.7 : 0.35); ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function blinkers(ctx, t, motion) {
    sc.blinkers?.forEach((b, i) => {
      const u = ((motion ? t : 0) + (b.phase ?? hash(i) * b.period)) % b.period, on = u < b.period * 0.3;
      if (!on && motion) return;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, b.at[0], b.at[1], b.r * 5, b.color, 0.8); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.at[0], b.at[1], b.r * 0.6, 0, TAU); ctx.fill();
    });
  }

  function signs(ctx, t, motion) {
    sc.signs?.forEach((s, i) => {
      const [x, y, w, h] = s.rect, a = 0.06 + 0.05 * Math.sin((motion ? t : 0) * 0.6 + i * 2);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
  }

  function twinkle(ctx, t, motion) {
    sc.twinkle?.forEach((z, zi) => {
      const [x, y, w, h] = z.rect;
      for (let i = 0; i < z.count; i++) {
        const n = zi * 100 + i, on = occasional(motion ? t : 0, { every: 3 + hash(n) * 6, duration: 1.5 + hash(n * 2) * 3, chance: 0.6, seed: n });
        if (on < 0) continue;
        const a = Math.sin(Math.PI * on);
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + hash(n * 3.1) * w, y + hash(n * 4.7) * h, 3, hash(n) > 0.5 ? '#ffe0a0' : '#cfe3ff', 0.8 * a); ctx.globalCompositeOperation = 'source-over';
      }
    });
  }

  // Welding sparks at the construction site: occasional; frequent while real work is in progress.
  function sparks(ctx, t, activity, motion) {
    if (!motion) return;
    const busy = (activity?.construction ?? 0) > 0;
    (sc.sparks ?? []).forEach((s, si) => {
      const p = occasional(t, { every: busy ? 1.6 + hash(si) : 3.5 + hash(si) * 3, duration: 1.1, chance: busy ? 0.95 : 0.55, seed: si * 5 });
      if (p < 0) return;
      const tau = p * 1.1;
      ctx.globalCompositeOperation = 'lighter';
      if (p < 0.6) glow(ctx, s[0], s[1], 7 + Math.random() * 2, '#fff2c0', 0.9);
      for (let k = 0; k < 14; k++) {
        const vx = (hash(k * 1.1 + si * 7) - 0.5) * 60, vy = -hash(k * 2.3 + si) * 40, x = s[0] + vx * tau, y = s[1] + vy * tau + 90 * tau * tau;
        ctx.globalAlpha = Math.max(0, 1 - p * 1.1); ctx.fillStyle = k % 3 ? '#ffd27a' : '#ffffff'; ctx.fillRect(x, y, 1.3, 1.3);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
  }

  function motes(ctx, t, motion) {
    const m = sc.motes; if (!m || !motion) return;
    const [x, y, w, h] = m.rect;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < m.count; i++) {
      const px = x + ((hash(i) * w + t * (3 + hash(i * 2) * 5)) % w), py = y + ((hash(i * 3) * h - t * (2 + hash(i * 4) * 3)) % h + h) % h;
      glow(ctx, px, py, 2.2, m.color, 0.35 + 0.3 * Math.sin(t * 1.5 + i));
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Lift car in two halves so riders appear inside it: back (light, floor ring) and front (glass, doors).
  function liftBack(ctx, lift, t, motion) {
    const d = lift.dims ?? sc.lift, x = lift.x, y = lift.y, w = d.w, h = d.h;
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y - h / 2, h * 0.9, '#5fb0ff', 0.22); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, y - h, 0, y); g.addColorStop(0, 'rgba(255,240,215,0.55)'); g.addColorStop(0.5, 'rgba(150,200,255,0.25)'); g.addColorStop(1, 'rgba(90,160,255,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = '#fff6e0'; ctx.fillRect(x - w * 0.32, y - h + 2, w * 0.64, 2.2);
    ctx.fillStyle = '#1d2733'; ctx.fillRect(x - w / 2 - 1.5, y - h - 4, w + 3, 4); ctx.fillRect(x - w / 2 - 1.5, y - 1, w + 3, 3); // roof and floor slab
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(x, y, w / 2, 4.5, 0, 0, TAU); ctx.stroke();
    glow(ctx, x, y, w * 0.7, '#2f8cff', 0.35);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (lift.passenger && lift.moving) drawCharacter(ctx, { x: x + 5, y: y - 1, h: sc.npcHeight ?? 30, facing: -1, pose: 'ride', t, look: { shirt: '#56657a', pants: '#252a33' } });
  }
  function liftFront(ctx, lift) {
    const d = lift.dims ?? sc.lift, x = lift.x, y = lift.y, w = d.w, h = d.h, open = lift.doors;
    ctx.fillStyle = 'rgba(170,215,255,0.13)';
    const half = (w / 2) * (1 - open * 0.92);
    ctx.fillRect(x - w / 2, y - h, half, h); ctx.fillRect(x + w / 2 - half, y - h, half, h);
    ctx.strokeStyle = 'rgba(40,52,66,0.95)'; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, y - h, w, h); // frame posts
    ctx.strokeStyle = 'rgba(220,235,255,0.7)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + half, y - h); ctx.lineTo(x - w / 2 + half, y); ctx.moveTo(x + w / 2 - half, y - h); ctx.lineTo(x + w / 2 - half, y); ctx.stroke();
    ctx.strokeStyle = '#3aa0ff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y - h, w / 2, 3.5, 0, 0, TAU); ctx.stroke();
  }

  return {
    under(ctx, env) {
      const t = env.time / 1000, motion = !env.reducedMotion, act = env.activity;
      ctx.save(); ctx.beginPath(); ctx.rect(plate.origin[0], plate.origin[1], plate.size[0], plate.size[1]); ctx.clip(); // nothing spills past the art
      roomLight(ctx, t, act);
      twinkle(ctx, t, motion);
      signs(ctx, t, motion);
      water(ctx, t, motion);
      fountains(ctx, t, motion);
      if (sc.patches) drawPlateClip(ctx, sc.patches);
      screens(ctx, t, act, motion);
      leds(ctx, t, act, motion);
      fans(ctx, t, act, motion);
      heli(ctx, t, motion);
      for (const v of vehiclesAt(motion ? t : 0, sc.vehicles ?? [])) vehicle(ctx, v);
      crane(ctx, t, act, motion);
      blinkers(ctx, t, motion);
      ctx.restore();
    },
    over(ctx, env) {
      const t = env.time / 1000, motion = !env.reducedMotion;
      ctx.save(); ctx.beginPath(); ctx.rect(plate.origin[0], plate.origin[1], plate.size[0], plate.size[1]); ctx.clip();
      sparks(ctx, t, env.activity, motion); motes(ctx, t, motion); magic(ctx, t, motion);
      ctx.restore();
    },
    occluder(ctx, shapes) { drawPlateClip(ctx, shapes); },
    liftBack, liftFront,
  };
}
