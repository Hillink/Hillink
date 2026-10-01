// Pass 5H vertical slice: the pixel stage. Turns a composed scene (compose.mjs) into frames, in pure JavaScript, so the
// browser skin and the node harness draw the same pixels for the same inputs.
//
//   bake     once per scene and lighting: every object is depth-ordered once; objects no character can ever pass in
//            front of or behind (outside the walkable zone, and not in front of anything that moves) are baked with the
//            ground into two lit layers (vegetation sway frames A and B). The rest stay dynamic.
//   render   per frame: copy the layer window, depth-sort the visible dynamic objects with the characters, blit them lit
//            (the lightmap multiplies every pixel except emissive ones), then add the glows (flicker, pulse).
//
// Inputs are read only. No clock: the caller passes the time in seconds; the same time gives the same frame.
import { PixelBuffer, rgba, R, G, B, scale } from './buffer.mjs';
import { composeScene, lightmapOf, glowSprite } from './compose.mjs';
import { LIGHTING } from './palette.mjs';
import { GLOWS } from './kit.mjs';
import { inFront } from '../../engine/iso.mjs';
import { spriteOf, CANVAS } from './character.mjs';
import { noise } from './buffer.mjs';

const CELL = 48;
const mul = (c, l) => rgba(R(c) * R(l) / 255, G(c) * G(l) / 255, B(c) * B(l) / 255, 255);
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
// Draw order between two pieces: a higher storey is in front; on one storey, the plan rule (engine/iso.mjs).
export const before = (a, b) => (a.floor !== b.floor ? (a.floor ?? 0) - (b.floor ?? 0) : inFront(a, b));

// A uniform grid over screen bounds, for overlap queries.
function gridOf(items) {
  const g = new Map();
  items.forEach((it0, i) => { const it = { sb: it0.sb ?? it0 }; for (let cy = Math.floor(it.sb.t / CELL); cy <= Math.floor(it.sb.b / CELL); cy++) for (let cx = Math.floor(it.sb.l / CELL); cx <= Math.floor(it.sb.r / CELL); cx++) { const k = cx * 100003 + cy; let a = g.get(k); if (!a) g.set(k, a = []); a.push(i); } });
  return { near(sb) { const out = new Set(); for (let cy = Math.floor(sb.t / CELL); cy <= Math.floor(sb.b / CELL); cy++) for (let cx = Math.floor(sb.l / CELL); cx <= Math.floor(sb.r / CELL); cx++) for (const i of g.get(cx * 100003 + cy) ?? []) out.add(i); return out; } };
}
// Painter's order (topological over overlapping pairs), with a stable deterministic base order.
export function paintOrder(items) {
  const n = items.length, grid = gridOf(items), after = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (const j of grid.near(items[i].sb)) {
    if (j <= i || !overlaps(items[i].sb, items[j].sb)) continue;
    const c = before(items[i], items[j]);
    if (c > 0) after[i].push(j); else if (c < 0) after[j].push(i);
  }
  const base = [...items.keys()].sort((a, b) => (items[a].floor ?? 0) - (items[b].floor ?? 0) || (items[b].z0 + items[b].z1) - (items[a].z0 + items[a].z1) || items[a].x0 - items[b].x0 || (items[a].id < items[b].id ? -1 : 1));
  const state = new Uint8Array(n), out = [];
  const visit = i => { if (state[i]) return; state[i] = 1; for (const j of after[i]) visit(j); state[i] = 2; out.push(i); };
  for (const i of base) visit(i);
  return out;
}

// The screen area a character can occupy: around every navigation node and along every edge (art px).
function walkZone(layout, A) {
  const rects = [], add = (x, y) => rects.push({ l: x / A - 16, r: x / A + 16, t: y / A - 40, b: y / A + 6 });
  for (const [x, y] of Object.values(layout.navNodes)) add(x, y);
  for (const [a, b] of layout.navEdges) {
    const p = layout.navNodes[a], q = layout.navNodes[b]; if (!p || !q) continue;
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / A / 10);
    for (let k = 1; k < n; k++) add(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n);
  }
  return rects;
}

export function createStage(layout, theme = 'real', { lighting = 'dusk' } = {}) {
  const scene = composeScene(layout, theme), { region, A } = scene, objects = scene.objects;
  const ordered = paintOrder(objects).map(i => objects[i]);
  ordered.forEach((o, i) => { o.order = i; });
  // Dynamic: animated non-plant pieces and everything a character can overlap, then anything static drawn in front
  // of a dynamic piece (it must be redrawn over it).
  const zone = walkZone(layout, A), zgrid = gridOf(zone), dyn = new Uint8Array(objects.length), idx = new Map(objects.map((o, i) => [o, i]));
  objects.forEach((o, i) => { if ((o.frames.length > 1 && o.kind !== 'veg') || o.altFrames || [...zgrid.near(o.sb)].some(k => overlaps(o.sb, zone[k]))) dyn[i] = 1; });
  const ogrid = gridOf(objects);
  for (const o of ordered) { const i = idx.get(o); if (!dyn[i]) continue; for (const j of ogrid.near(o.sb)) if (!dyn[j] && overlaps(o.sb, objects[j].sb) && before(objects[j], o) > 0) dyn[j] = 1; }
  // Second sweep in order: a static piece in front of a piece that became dynamic in the first sweep.
  for (const o of ordered) { const i = idx.get(o); if (!dyn[i]) continue; for (const j of ogrid.near(o.sb)) if (!dyn[j] && overlaps(o.sb, objects[j].sb) && before(objects[j], o) > 0) dyn[j] = 1; }
  const dynamic = ordered.filter(o => dyn[idx.get(o)]), statics = ordered.filter(o => !dyn[idx.get(o)]);
  const dgrid = gridOf(dynamic);

  let L = null, layers = null;
  function bake(id) {
    L = lightmapOf(scene, id);
    layers = [0, 1].map(k => {
      const buf = new PixelBuffer(region.w, region.h), em = new Uint8Array(region.w * region.h);
      scene.ground.copyTo(buf, 0, 0, region.w, region.h);
      for (const o of statics) {
        const fi = o.frames.length > 1 ? (k + (o.phase ?? 0)) % o.frames.length : 0, fr = o.frames[fi], m = o.masks[fi], dx = o.ox - region.x0, dy = o.oy - region.y0;
        for (let y = 0; y < fr.h; y++) { const Y = y + dy; if (Y < 0 || Y >= region.h) continue; for (let x = 0; x < fr.w; x++) { const c = fr.data[y * fr.w + x]; if (!c) continue; const X = x + dx; if (X < 0 || X >= region.w) continue; buf.data[Y * region.w + X] = c; em[Y * region.w + X] = m[y * fr.w + x]; } }
      }
      if (!L.skip) for (let i = 0; i < buf.data.length; i++) if (!em[i]) buf.data[i] = mul(buf.data[i], L.data[i]);
      return buf;
    });
  }
  bake(lighting);

  // Lit blit: a sprite multiplied by the lightmap at its destination, emissive pixels exempt.
  function litBlit(out, view, fr, mask, sx, sy, { flip = false, hole = null } = {}) {
    const dx = sx - view.x0, dy = sy - view.y0;
    for (let y = 0; y < fr.h; y++) {
      const Y = y + dy; if (Y < 0 || Y >= out.h) continue;
      const ry = sy + y - region.y0;
      for (let x = 0; x < fr.w; x++) {
        const c = fr.data[y * fr.w + (flip ? fr.w - 1 - x : x)]; if (!c) continue;
        const X = x + dx; if (X < 0 || X >= out.w) continue;
        if (hole && hole(sx + x, sy + y)) continue;
        const rx = sx + x - region.x0, e = mask?.[y * fr.w + x];
        out.data[Y * out.w + X] = e || L.skip ? c : rx >= 0 && ry >= 0 && rx < region.w && ry < region.h ? mul(c, L.data[ry * region.w + rx]) : mul(c, L.ambient);
      }
    }
  }
  const shade = (out, view, cx, cy, rx, ry, k) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const t = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (t > 1) continue; const X = x - view.x0, Y = y - view.y0; if (X < 0 || Y < 0 || X >= out.w || Y >= out.h) continue; out.data[Y * out.w + X] = scale(out.data[Y * out.w + X], k); } };
  // A one-pixel ellipse ring (selection gold, hover white), emissive so it reads at night.
  const ring = (out, view, cx, cy, rx, ry, c) => { for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2, X = Math.round(cx + Math.cos(t) * rx) - view.x0, Y = Math.round(cy + Math.sin(t) * ry) - view.y0; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.data[Y * out.w + X] = c; } };
  const GOLD = rgba(255, 210, 74), WHITE = rgba(240, 244, 250);

  // Intensity step (0..3) of a light loop at time t.
  const stepOf = (loop, t, phase = 0) => loop === 'flicker' ? [3, 2, 3, 3, 1, 3, 2, 3][(Math.floor(t * 9) + phase * 3 + (noise(Math.floor(t * 9), phase, 5) * 3 | 0)) % 8]
    : loop === 'flicker-soft' ? (noise(Math.floor(t * 4), phase, 6) > 0.85 ? 2 : 3) : loop === 'pulse' ? Math.round(1.5 + 1.5 * Math.sin(t * 2.2 + phase)) : 2;

  // actors: [{ id, look, lookKey, foot: [x, y] art px, plan: { x, z, floor }, facing, clip, frame, sitting, hovered, selected }]
  function render(out, view, t, actors = []) {
    const layer = layers[Math.floor(t * 1.5) % 2];
    out.clear(L.skip ? 0xff3d6a3f : mul(0xff3d6a3f, L.ambient));
    layer.copyTo(out, view.x0 - region.x0, view.y0 - region.y0, view.w, view.h);
    const vb = { l: view.x0 - 8, r: view.x0 + view.w + 8, t: view.y0 - 8, b: view.y0 + view.h + 48 };
    const items = [...dgrid.near(vb)].map(i => dynamic[i]).filter(o => overlaps(o.sb, vb));
    const chars = actors.map(a => {
      const sp = spriteOf(a.look, a.lookKey, a.facing, a.clip, a.frame), fx = Math.round(a.foot[0]), fy = Math.round(a.foot[1]);
      const sx = fx - sp.foot[0], sy = fy - sp.foot[1], half = 8;
      return { actor: a, sp, sx, sy, fx, fy, id: `actor:${a.id}`, floor: a.plan.floor, x0: a.plan.x - half, x1: a.plan.x + half, z0: a.plan.z - half * 0.6, z1: a.plan.z + half * 0.6, bias: a.sitting ? 1 : 0, sb: { l: sx, r: sx + sp.buf.w, t: sy, b: sy + sp.buf.h } };
    });
    // Screens follow canonical activity: on in a room where an agent is working (its clip says so), off elsewhere.
    const live = new Set();
    for (const a of actors) if (/^(work|sit\.work)/.test(a.clip ?? '')) { const r = scene.rooms.find(q => q.f === (a.plan.floor ?? 0) && a.plan.x >= q.x0 && a.plan.x <= q.x1 && a.plan.z >= q.z0 && a.plan.z <= q.z1); if (r) live.add(r.id); }
    const all = [...items, ...chars], order = paintOrder(all), drawn = [];
    // Occlusion: a prop drawn over an agent is dithered (every other pixel) where it covers the agent's figure, so the
    // agent stays readable behind tall furniture without floating over it. Seat backs are exempt (they hold a sitter).
    const holeFor = o => {
      if (o.kind !== 'prop' || o.id.endsWith(':back')) return null;
      const hit = drawn.filter(c => overlaps(o.sb, c.sb)); if (!hit.length) return null;
      return (X, Y) => ((X + Y) & 1) === 0 && hit.some(c => { const lx = X - c.sx, ly = Y - c.sy; return lx >= 0 && ly >= 0 && lx < c.sp.buf.w && ly < c.sp.buf.h && c.sp.buf.data[ly * c.sp.buf.w + lx] !== 0; });
    };
    for (const i of order) {
      const o = all[i];
      if (o.actor) {
        const a = o.actor;
        shade(out, view, o.fx, o.fy, 6, 2.2, 0.62);
        if (a.selected) ring(out, view, o.fx, o.fy, 9, 3.4, GOLD); else if (a.hovered) ring(out, view, o.fx, o.fy, 8, 3, WHITE);
        litBlit(out, view, o.sp.buf, null, o.sx, o.sy); drawn.push(o);
        for (const [lx, ly, lc] of o.sp.light) { const X = o.sx + lx - view.x0, Y = o.sy + ly - view.y0; if (X >= 0 && Y >= 0 && X < out.w && Y < out.h) out.data[Y * out.w + X] = lc; }
        continue;
      }
      const hole = drawn.length ? holeFor(o) : null;
      if (o.altFrames && !live.has(o.room)) { litBlit(out, view, o.altFrames[0], o.altMasks[0], o.ox, o.oy, { hole }); continue; }
      const fi = o.fps && o.frames.length > 1 ? (Math.floor(t * o.fps) + (o.phase ?? 0)) % o.frames.length : 0;
      litBlit(out, view, o.frames[fi], o.masks[fi], o.ox, o.oy, { hole });
    }
    // Glows (additive) for visible light sources.
    const gk = LIGHTING[L.lighting]?.glow ?? 0.7;
    for (const e of scene.emitters) {
      const g = GLOWS[e.kind]; if (!g || (e.room && !live.has(e.room))) continue;
      if (e.x < vb.l - 30 || e.x > vb.r + 30 || e.y < vb.t - 30 || e.y > vb.b + 30) continue;
      const s = stepOf(g.loop, t, e.phase ?? 0), sp = glowSprite(e.kind, s);
      out.addGlow(sp.buf, e.x - sp.r - view.x0, e.y - sp.r - view.y0, gk);
    }
    return out;
  }

  return {
    scene, region, A, theme, render, dynamic, statics,
    get lighting() { return L.lighting; },
    setLighting(id) { if (id !== L.lighting) bake(id); },
    stats: () => ({ objects: objects.length, dynamic: dynamic.length, static: statics.length, emitters: scene.emitters.length }),
  };
}
export { CANVAS };
