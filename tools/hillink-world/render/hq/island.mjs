// The settlement as a floating island. Its top is the land the World has developed plus a margin, so the island grows
// when the settlement does (procgen frames(world).settlement); below its two near edges hangs a rock underside with a
// soil band, strata and a tapering, ragged keel, lit by the time of day.
import { frames } from '../../procgen/camera.mjs';
import { union } from '../../procgen/geom.mjs';
import { mixA, css, hash2, glow } from './color.mjs';

export const ISLAND_MARGIN_M = 7;

// The island's plan rectangle (plan units, the layout's view frame): the developed land (parcels in use, buildings,
// construction sites) plus a margin, so it starts small around the T0 HQ and grows when the settlement does.
export function islandRect(layout, margin = ISLAND_MARGIN_M) {
  const { world, view, U } = layout;
  const rects = [...Object.values(world.parcels).filter(p => p.status !== 'vacant').map(p => p.rect), ...Object.values(world.buildings).map(b => b.footprint), ...Object.values(world.spaces).filter(s => s.project).map(s => s.rect)];
  const s = rects.length ? union(rects) : frames(world).settlement;
  const r = view.rectToView({ x: s.x - margin, y: s.y - margin, w: s.w + 2 * margin, h: s.h + 2 * margin });
  return { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U };
}

export function createIsland(layout) {
  const { P, U } = layout, R = islandRect(layout);
  const W = R.x1 - R.x0, D = R.z1 - R.z0, depth = Math.max(140, Math.min(W, D) * 0.32);
  // The two near edges, sampled: front (z = z0, x0 -> x1) then right (x = x1, z0 -> z1).
  const N = 28, front = [], right = [];
  for (let i = 0; i <= N; i++) front.push([R.x0 + (W * i) / N, R.z0]);
  for (let i = 0; i <= N; i++) right.push([R.x1, R.z0 + (D * i) / N]);
  // Keel depth along an edge: deepest towards the near corner, ragged.
  const drop = (u, k, seed) => depth * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * u * k)), 1.4)) * (0.82 + 0.3 * hash2(Math.round(u * 997), seed));
  const frontDrop = front.map((_, i) => drop(i / N, 1, 1)), rightDrop = right.map((_, i) => drop(1 - i / N, 1, 2));
  const top = (x, z) => P.at(x, z, 0, 0);
  const corners = [top(R.x0, R.z0), top(R.x1, R.z0), top(R.x1, R.z1), top(R.x0, R.z1)];
  function face(ctx, pts, drops, light, day) {
    const rock = mixA(mixA([118, 104, 96], [52, 50, 78], day.night * 0.85), [150, 92, 84], day.dusk * 0.25);
    const tops = pts.map(([x, z]) => top(x, z)), bots = pts.map(([x, z], i) => top(x, z).map((v, j) => (j ? v + drops[i] : v)));
    const y0 = Math.min(...tops.map(p => p[1])), y1 = Math.max(...bots.map(p => p[1]));
    const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, css(rock.map(c => c * light))); gr.addColorStop(1, css(rock.map(c => c * light * 0.45)));
    ctx.beginPath(); tops.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = bots.length - 1; i >= 0; i--) ctx.lineTo(...bots[i]); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    // Strata: a few soft bands following the edge.
    ctx.strokeStyle = css(rock.map(c => c * light * 0.7), 0.5); ctx.lineWidth = 2;
    for (const k of [0.22, 0.42, 0.63]) { ctx.beginPath(); tops.forEach(([x, y], i) => { const yy = y + drops[i] * k * (0.9 + 0.2 * hash2(i, k * 100)); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }); ctx.stroke(); }
    // Soil band under the grass.
    const soil = mixA([92, 68, 46], [40, 34, 52], day.night * 0.8);
    ctx.beginPath(); tops.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = tops.length - 1; i >= 0; i--) ctx.lineTo(tops[i][0], tops[i][1] + 12 + 4 * hash2(i, 7)); ctx.closePath(); ctx.fillStyle = css(soil.map(c => c * light)); ctx.fill();
  }
  return {
    rect: R, corners, at: (x, z, h = 0) => P.at(x, z, 0, h),
    underside(ctx, day, T) {
      // A soft glow and mist under the island (stronger at night: the island hovers on light).
      const c = top(R.x1, R.z0), cx = c[0], cy = c[1] + depth * 0.9;
      glow(ctx, cx, cy, depth * 2.2, day.night > 0.5 ? '#3a6dff' : '#ffffff', 0.12 + 0.12 * day.night);
      face(ctx, front, frontDrop, 0.95, day);
      face(ctx, right, rightDrop, 0.7, day);
      // Hanging roots and small floating rocks under the keel.
      for (let i = 0; i < 5; i++) {
        const u = 0.15 + 0.17 * i, p = top(R.x0 + W * u, R.z0), y = p[1] + frontDrop[Math.round(u * N)] + 30 + 14 * Math.sin(T * 0.6 + i * 1.7), s = 6 + 6 * hash2(i, 3);
        ctx.fillStyle = css(mixA([96, 88, 84], [44, 44, 70], day.night * 0.85)); ctx.beginPath(); ctx.moveTo(p[0] - s, y); ctx.lineTo(p[0] + s, y); ctx.lineTo(p[0] + s * 0.3, y + s * 1.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(mixA([96, 150, 80], [40, 70, 60], day.night * 0.7)); ctx.beginPath(); ctx.ellipse(p[0], y, s, s * 0.35, 0, 0, 7); ctx.fill();
      }
    },
    rim(ctx, day) {
      // A light grass lip along the near edges.
      ctx.strokeStyle = css(mixA([168, 214, 110], [70, 100, 90], day.night * 0.8), 0.9); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); [...front, ...right.slice(1)].forEach(([x, z], i) => { const [sx, sy] = top(x, z); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.stroke();
    },
  };
}
