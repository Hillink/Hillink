// The HQ sky, in screen space behind the World: a gradient by time of day, stars at night, the sun and the moon on one
// arc, distant floating rocks (slow parallax) and drifting clouds tinted by the hour.
import { mixA, css, hash2, glow } from './color.mjs';
import { sstep } from './time.mjs';

const NIGHT = [[6, 10, 31], [22, 34, 78]], DUSK = [[62, 42, 112], [255, 138, 92]], DAY = [[64, 146, 232], [190, 228, 255]];
const STARS = Array.from({ length: 160 }, (_, i) => [hash2(i, 1), hash2(i, 2) * 0.8, 0.5 + hash2(i, 3) * 1.4, hash2(i, 4) * 6]);
const CLOUDS = Array.from({ length: 14 }, (_, i) => ({ x: hash2(i, 9), y: 0.06 + hash2(i, 8) * 0.8, s: 0.6 + hash2(i, 7) * 1.4, v: 0.004 + hash2(i, 6) * 0.012, a: 0.5 + hash2(i, 5) * 0.5 }));
const FAR = [[0.1, 0.8, 1.0], [0.88, 0.3, 0.8], [0.72, 0.88, 0.9], [0.18, 0.24, 0.6]];

// The two sky colours (top, horizon) for a time of day.
export function skyColors({ sun }) {
  if (sun < 0) { const k = sstep(-0.35, 0, sun); return [mixA(NIGHT[0], DUSK[0], k), mixA(NIGHT[1], DUSK[1], k)]; }
  const k = sstep(0, 0.45, sun); return [mixA(DUSK[0], DAY[0], k), mixA(DUSK[1], DAY[1], k)];
}

export function createSky() {
  return {
    draw(ctx, W, H, t, day, camera) {
      const [top, bot] = skyColors(day);
      const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      if (day.night > 0.05) for (const s of STARS) { const tw = 0.6 + 0.4 * Math.sin(t * s[2] + s[3]); ctx.fillStyle = `rgba(255,255,255,${day.night * tw * 0.9})`; ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]); }
      const ang = day.phase * Math.PI * 2, sx = W / 2 - Math.cos(ang) * W * 0.44, sy = H * 0.6 - day.sun * H * 0.55, mx = W / 2 + Math.cos(ang) * W * 0.44, my = H * 0.6 + day.sun * H * 0.55;
      if (sy < H * 0.9) { glow(ctx, sx, sy, 160, '#ffcf8a', 0.55); ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(sx, sy, 24, 0, 7); ctx.fill(); }
      if (my < H * 0.9) {
        glow(ctx, mx, my, 120, '#b8d0ff', 0.35 * day.night); ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(mx, my, 20, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(150,170,210,.45)'; for (const [dx, dy, r] of [[-6, -4, 4], [5, 5, 3], [3, -8, 2.4]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill(); }
      }
      // Distant floating rocks: rough stone with a grassy cap, far behind (a little parallax with the camera).
      FAR.forEach(([fx, fy, s], i) => {
        const x = fx * W - (camera?.x ?? 0) * 0.03, y = fy * H + Math.sin(t * 0.4 + i) * 4, c = mixA(bot, [30, 30, 60], 0.4 + day.night * 0.2);
        ctx.fillStyle = css(c, 0.8); ctx.beginPath(); ctx.moveTo(x - 60 * s, y); ctx.quadraticCurveTo(x, y - 14 * s, x + 60 * s, y); ctx.lineTo(x + 34 * s, y + 22 * s); ctx.lineTo(x + 18 * s, y + 46 * s); ctx.lineTo(x + 2 * s, y + 70 * s); ctx.lineTo(x - 12 * s, y + 44 * s); ctx.lineTo(x - 36 * s, y + 26 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(mixA(c, [60, 160, 110], 0.5), 0.85); ctx.beginPath(); ctx.moveTo(x - 60 * s, y); ctx.quadraticCurveTo(x, y - 14 * s, x + 60 * s, y); ctx.quadraticCurveTo(x, y + 4 * s, x - 60 * s, y); ctx.fill();
        for (const [dx, dy] of [[-30, -8], [10, -10], [38, -5]]) { ctx.fillStyle = css(mixA(c, [30, 120, 80], 0.6), 0.9); ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s - 4, 7 * s, 0, 7); ctx.fill(); }
      });
      for (const c of CLOUDS) {
        const x = ((c.x + t * c.v) % 1.3 - 0.15) * W, y = c.y * H, col = mixA(mixA(mixA(bot, [255, 255, 255], 0.55), [40, 50, 90], day.night * 0.75), [255, 150, 110], day.dusk * 0.3), r = 38 * c.s;
        ctx.fillStyle = css(col, 0.55 * c.a);
        for (const [dx, dy, k] of [[0, 0, 1], [-r * 0.8, r * 0.2, 0.75], [r * 0.85, r * 0.25, 0.8], [r * 0.3, -r * 0.3, 0.7]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * k * 1.6, r * k * 0.7, 0, 0, 7); ctx.fill(); }
      }
    },
  };
}
