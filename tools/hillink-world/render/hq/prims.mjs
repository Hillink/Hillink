// Drawing primitives for the HQ look, in plan space through the layout's projector P (P.at(x, z, floor, h)).
// Plan boxes are { x0, x1, z0, z1, h0, h1 } in world units on a storey f. In both projections the visible faces of a box
// are its top, its front (z = z0) and its right side (x = x1); light comes from the front-left, so the front face is
// brighter than the right one. Everything a style draws is built from these: boxes with an edge highlight, faces with
// painted textures mapped onto them, floor-plane painting, soft contact shadows and glows.
import { glowCol } from './color.mjs';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cache = new Map();
export function rgb(c) {
  let v = cache.get(c); if (v) return v;
  if (c[0] === '#') { let s = c.slice(1); if (s.length === 3) s = s.replace(/./g, ch => ch + ch); v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 1]; }
  else { const m = c.match(/[\d.]+/g).map(Number); v = [m[0], m[1], m[2], m[3] ?? 1]; }
  cache.set(c, v); return v;
}
// A colour scaled in brightness (k < 1 darker, > 1 lighter towards white), optionally with alpha.
export function shade(c, k, a) {
  const [r, g, b, a0] = rgb(c), al = a ?? a0;
  if (k <= 1) return `rgba(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0},${al})`;
  const t = clamp(k - 1, 0, 1); return `rgba(${(r + (255 - r) * t) | 0},${(g + (255 - g) * t) | 0},${(b + (255 - b) * t) | 0},${al})`;
}
export function mix(c1, c2, t) { const a = rgb(c1), b = rgb(c2); return `rgba(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0},${a[3] + (b[3] - a[3]) * t})`; }

export function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
export function line(ctx, a, b, color, lw = 1) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

export function glow(ctx, x, y, r, col, a = 1) {
  if (a <= 0.005 || r <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, glowCol(col, a)); gr.addColorStop(1, glowCol(col, 0));
  ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// The drawing context a style receives: d = { ctx, P, f (storey), T (seconds), day, ... } plus these helpers bound to it.
export function kit(P) {
  const at = (x, z, f, h = 0) => P.at(x, z, f, h);
  // A box: front, right and top faces. o: { top, front, right (colours, or brightness factors via l/r/t), edge, ew, alpha }.
  function box(ctx, f, b, c, o = {}) {
    const { x0, x1, z0, z1 } = b, h0 = b.h0 ?? 0, h1 = b.h1;
    const A = at(x0, z0, f, h1), B = at(x1, z0, f, h1), C = at(x1, z1, f, h1), D = at(x0, z1, f, h1), A0 = at(x0, z0, f, h0), B0 = at(x1, z0, f, h0), C0 = at(x1, z1, f, h0);
    if (o.alpha !== undefined) { ctx.save(); ctx.globalAlpha *= o.alpha; }
    if (h1 > h0) {
      poly(ctx, [A0, B0, B, A], o.front ?? shade(c, o.l ?? 0.86));
      poly(ctx, [B0, C0, C, B], o.right ?? shade(c, o.r ?? 0.66));
    }
    poly(ctx, [A, B, C, D], o.top ?? shade(c, o.t ?? 1.06));
    if (o.edge) { ctx.strokeStyle = o.edge; ctx.lineWidth = o.ew ?? 0.8; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.stroke(); if (h1 > h0) { ctx.beginPath(); ctx.moveTo(...B); ctx.lineTo(...B0); ctx.stroke(); } }
    if (o.outline) { ctx.strokeStyle = o.outline; ctx.lineWidth = o.ow ?? 0.6; ctx.beginPath(); ctx.moveTo(...A0); ctx.lineTo(...B0); ctx.lineTo(...C0); ctx.lineTo(...C); ctx.lineTo(...D); ctx.lineTo(...A); ctx.closePath(); ctx.stroke(); }
    if (o.alpha !== undefined) ctx.restore();
  }
  // A face quad: 'front' is the plane z = c (x from a to b), 'right' the plane x = c (z from a to b), heights h0..h1.
  const faceQuad = (f, kind, c, a, b, h0, h1) => (kind === 'front' ? [at(a, c, f, h0), at(b, c, f, h0), at(b, c, f, h1), at(a, c, f, h1)] : [at(c, a, f, h0), at(c, b, f, h0), at(c, b, f, h1), at(c, a, f, h1)]);
  // Paints fn(ctx) on a cw x ch virtual canvas mapped onto a face (u along the face, v downwards from h1).
  function onFace(ctx, f, kind, c, a, b, h0, h1, cw, ch, fn) {
    const o = kind === 'front' ? at(a, c, f, h1) : at(c, a, f, h1), u = kind === 'front' ? at(b, c, f, h1) : at(c, b, f, h1);
    ctx.save(); ctx.transform((u[0] - o[0]) / cw, (u[1] - o[1]) / cw, 0, (h1 - h0) / ch, o[0], o[1]); fn(ctx); ctx.restore();
  }
  // Paints fn(ctx) on a cw x ch canvas mapped onto the floor rectangle (x0..x1, z0..z1) at height h (u along x, v along -z
  // so the canvas's top edge is the far edge).
  function onFloor(ctx, f, r, h, cw, ch, fn) {
    const o = at(r.x0, r.z1, f, h), u = at(r.x1, r.z1, f, h), v = at(r.x0, r.z0, f, h);
    ctx.save(); ctx.transform((u[0] - o[0]) / cw, (u[1] - o[1]) / cw, (v[0] - o[0]) / ch, (v[1] - o[1]) / ch, o[0], o[1]); fn(ctx); ctx.restore();
  }
  // A soft contact shadow on the floor under a footprint (offset away from the light, back and to the right).
  function shadow(ctx, f, b, h, a = 0.22) {
    const k = Math.min(h * 0.35, 18), q = [at(b.x0, b.z0, f), at(b.x1, b.z0, f), at(b.x1 + k, b.z0 + k * 0.6, f), at(b.x1 + k, b.z1 + k, f), at(b.x0 + k * 0.4, b.z1 + k, f), at(b.x0, b.z1, f)];
    poly(ctx, q, `rgba(10,14,30,${a})`);
  }
  function ellipseShadow(ctx, x, y, rx, ry, a = 0.25) { ctx.fillStyle = `rgba(10,14,30,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  // A horizontal disc/cylinder top projected (approximated by an ellipse in screen space).
  function disc(ctx, f, x, z, h, r, fill, stroke) { const [sx, sy] = at(x, z, f, h), k = P.g.syx ? 0.5 : 0.45; ctx.beginPath(); ctx.ellipse(sx, sy, r * (P.g.sxx || 1) * 1.06, r * k * 1.06, 0, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function cylinder(ctx, f, x, z, h0, h1, r, c, o = {}) {
    const [sx, sy0] = at(x, z, f, h0), [, sy1] = at(x, z, f, h1), rx = r * (P.g.sxx || 1) * 1.06, ry = r * 0.5 * 1.06;
    const gr = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0); gr.addColorStop(0, shade(c, 0.95)); gr.addColorStop(0.45, shade(c, 0.85)); gr.addColorStop(1, shade(c, 0.55));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI); ctx.lineTo(sx - rx, sy1); ctx.ellipse(sx, sy1, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = o.top ?? shade(c, 1.08); ctx.beginPath(); ctx.ellipse(sx, sy1, rx, ry, 0, 0, TAU); ctx.fill();
    if (o.edge) { ctx.strokeStyle = o.edge; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  return { at, box, faceQuad, onFace, onFloor, shadow, ellipseShadow, disc, cylinder };
}

// Small deterministic hash for per-object variation.
export function h1(...xs) { let h = 2166136261; for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } } return ((h >>> 0) % 100000) / 100000; }

// Offscreen textures painted once (or on a slow tick) and drawn onto faces.
export function texture(w, h, paint) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(c.getContext('2d'), w, h); return c;
}
