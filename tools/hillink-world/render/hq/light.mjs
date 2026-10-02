// Day, dusk and night for the HQ look: a half-resolution darkness layer over the World with light cut out where the
// World is really lit, plus an additive glow in each light's colour. Lights come from World facts only: every finished
// room has its ceiling light on, every agent carries a small light (its state colour), the entrance has its lamps.
import { mixA, css, glowCol, hash2, glow } from './color.mjs';
import { ARCH } from '../../world/scale.mjs';

const ROOM_LIGHT = { servers: '#6fd0ff', 'servers-like': '#6fd0ff', command: '#8fb8ff', testing: '#bfe6ff', development: '#ffd9a0', lounge: '#ffc078', comms: '#ffc078', 'comms-like': '#ffc078', lobby: '#ffe2b0' };
const AGENT_LIGHT = { claude: '#ff9a4a', codex: '#58b0ff', chatgpt: '#3ddc84' };

export function lightsOf(layout, env, T) {
  const { P, U, world, view, furnishing } = layout, out = [];
  for (const s of Object.values(world.spaces)) {
    if (s.status !== 'built' || !furnishing[s.id] || (s.primitive !== 'room' && s.primitive !== 'hallway')) continue;
    const r = view.rectToView(s.rect), kind = furnishing[s.id].kind, [x, y] = P.at((r.x0 + r.x1) / 2 * U, (r.z0 + r.z1) / 2 * U, s.level, ARCH.floorHeight * 0.4);
    out.push({ x, y, r: Math.max(r.x1 - r.x0, r.z1 - r.z0) * U * 0.62, col: ROOM_LIGHT[kind] ?? '#ffe2b0', i: s.primitive === 'hallway' ? 0.5 : 0.75 });
  }
  for (const d of Object.values(world.doors)) {
    if (d.status !== 'built' || (d.a !== 'outside' && d.b !== 'outside')) continue;
    const c = view.toView((d.seg.x1 + d.seg.x2) / 2, (d.seg.y1 + d.seg.y2) / 2), [x, y] = P.at(c.x * U, c.z * U - 2 * U, 0, 20);
    out.push({ x, y, r: 3.5 * U, col: '#ffd59a', i: 0.8 });
  }
  for (const e of env.scene.entities.values()) {
    if (e.kind !== 'agent' || !e.agent) continue;
    out.push({ x: e.x, y: e.y - e.h * 0.5, r: e.h * 1.1, col: AGENT_LIGHT[e.agent.id] ?? '#ffffff', i: 0.45 });
  }
  return out;
}

export function createLighting({ scale = 0.5 } = {}) {
  let oc = null, ac = null;
  const canvas = (c, w, h) => { if (!c) { c = document.createElement('canvas'); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; };
  return {
    draw(ctx, day, lights, T, island) {
      const n = day.night, dk = day.dusk * (1 - n), alpha = Math.max(n * 0.74, dk * 0.26 + n * 0.74);
      if (alpha < 0.02) return;
      const W = Math.ceil(ctx.canvas.width * scale), H = Math.ceil(ctx.canvas.height * scale);
      oc = canvas(oc, W, H); ac = canvas(ac, W, H);
      const og = oc.getContext('2d'), ag = ac.getContext('2d'), m = ctx.getTransform();
      const M = [m.a * scale, m.b * scale, m.c * scale, m.d * scale, m.e * scale, m.f * scale];
      og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'source-over'; og.clearRect(0, 0, W, H);
      og.fillStyle = css(mixA([90, 44, 96], [8, 14, 46], n), alpha); og.fillRect(0, 0, W, H);
      og.setTransform(...M); og.globalCompositeOperation = 'destination-out';
      ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, W, H); ag.setTransform(...M); ag.globalCompositeOperation = 'lighter';
      const gl = 0.06 + n * 0.22;
      for (const l of lights) {
        const k = Math.min(1, l.i * 1.15);
        let gr = og.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r); gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(0.45, `rgba(0,0,0,${k * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); og.fillStyle = gr; og.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        gr = ag.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8); gr.addColorStop(0, glowCol(l.col, gl * l.i)); gr.addColorStop(1, glowCol(l.col, 0)); ag.fillStyle = gr; ag.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(oc, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(ac, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
      // Fireflies over the island at night.
      if (n > 0.2 && island) {
        const R = island.rect, P0 = island.at;
        for (let i = 0; i < 30; i++) {
          const a = T * (0.15 + hash2(i, 1) * 0.25) + i * 1.7, x = R.x0 + (R.x1 - R.x0) * hash2(i, 7) + Math.cos(a) * 40, z = R.z0 + (R.z1 - R.z0) * hash2(i, 8) + Math.sin(a * 1.3) * 30;
          const [px, py] = P0(x, z, 14 + 18 * (0.5 + 0.5 * Math.sin(T * 0.9 + i))), k = n * (0.4 + 0.6 * Math.sin(T * 3 + i * 5) ** 2);
          ctx.fillStyle = `rgba(210,255,140,${k})`; ctx.beginPath(); ctx.arc(px, py, 1.5, 0, 7); ctx.fill(); glow(ctx, px, py, 10, '#d6ff80', k * 0.6);
        }
      }
    },
  };
}
