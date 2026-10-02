// Pass 5H: sprite definitions as data. A sprite is a list of primitive shapes in its own unit space; drawShapes
// interprets them. Character parts (render/art/parts.mjs) and props (render/art/props.mjs) are authored this way, so art
// is added by writing data, not by growing one-off canvas functions, and appearance metadata can only *select* sprites
// and colours: it never reaches this interpreter as code.
//
// Primitives (arrays; numbers are in the sprite's units):
//   ['e', cx, cy, rx, ry, fill, opt?]     ellipse            ['c', cx, cy, r, fill, opt?]        circle
//   ['r', x, y, w, h, radius, fill, opt?] rounded rectangle  ['p', [x0,y0, x1,y1, ...], fill, opt?] polygon
//   ['a', cx, cy, r, a0, a1, fill, opt?]  closed arc (radians, chord closes it)
//   ['l', [x0,y0, x1,y1, ...], color, width, opt?]           stroked polyline (width in units)
// fill: a palette slot ('hair', 'hat', 'metal') or a literal colour ('#aabbcc'); 'slot*0.8' shades it; 'none' skips.
// opt: { ink: false } no outline · { alpha } · { glow: radius } soft glow behind · { add: true } additive light.
import { OUTLINE } from './tokens.mjs';

const TAU = Math.PI * 2;
const HEX = /^#[0-9a-f]{6}$/i;
export function shade(hex, k) {
  if (!HEX.test(hex ?? '')) return hex;
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(k > 1 ? c + (255 - c) * (k - 1) * 1.4 : c * k)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('')}`;
}
export const toHex = c => { if (HEX.test(c ?? '')) return c; if (/^#[0-9a-f]{3}$/i.test(c ?? '')) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`; return null; };
// A palette slot or literal colour, optionally shaded ('shirt*0.8').
export function resolveFill(fill, pal) {
  if (!fill || fill === 'none') return null;
  const [key, k] = String(fill).split('*');
  const base = key.startsWith('#') || key.startsWith('rgb') ? key : pal?.[key] ?? pal?.fallback ?? '#888888';
  if (!k) return base;
  const hx = toHex(base); return hx ? shade(hx, Number(k)) : base;
}

// Draw a sprite. The caller has already translated/scaled so the sprite's units are the current canvas units;
// `lw` is the outline width in those units.
export function drawShapes(ctx, shapes, pal, { lw = 0.1, time = 0 } = {}) {
  for (const s of shapes ?? []) {
    const kind = s[0];
    if (kind === 'l') {
      const [, pts, color, width, opt = {}] = s, c = resolveFill(color, pal); if (!c) continue;
      ctx.save(); if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
      ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (opt.ink !== false) { ctx.lineWidth = width + lw * 2; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); }
      ctx.lineWidth = width; ctx.strokeStyle = c; ctx.stroke(); ctx.restore();
      continue;
    }
    const opt = (kind === 'e' ? s[6] : kind === 'c' ? s[5] : kind === 'r' ? s[7] : kind === 'p' ? s[3] : kind === 'a' ? s[7] : null) ?? {};
    const fill = resolveFill(kind === 'e' ? s[5] : kind === 'c' ? s[4] : kind === 'r' ? s[6] : kind === 'p' ? s[2] : s[6], pal);
    if (!fill) continue;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= typeof opt.alpha === 'number' ? opt.alpha : 1;
    if (opt.pulse) ctx.globalAlpha *= 0.7 + 0.3 * Math.sin(time * opt.pulse);
    if (opt.add) ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    if (kind === 'e') ctx.ellipse(s[1], s[2], Math.abs(s[3]), Math.abs(s[4]), 0, 0, TAU);
    else if (kind === 'c') ctx.arc(s[1], s[2], Math.abs(s[3]), 0, TAU);
    else if (kind === 'r') { const [, x, y, w, h, rad] = s; if (ctx.roundRect) ctx.roundRect(Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h), Math.min(Math.abs(rad), Math.abs(w) / 2, Math.abs(h) / 2)); else ctx.rect(x, y, w, h); }
    else if (kind === 'p') { const pts = s[1]; for (let i = 0; i < pts.length; i += 2) (i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1])); ctx.closePath(); }
    else if (kind === 'a') { ctx.arc(s[1], s[2], s[3], s[4], s[5]); ctx.closePath(); }
    if (opt.glow) { ctx.shadowColor = fill; ctx.shadowBlur = opt.glow * (Math.abs(ctx.getTransform?.()?.a) || 1) * 3; }
    ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0;
    if (opt.ink !== false && !opt.add) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); }
    ctx.restore();
  }
}

// Mirror a sprite horizontally (for left-facing views authored facing right).
export const mirror = shapes => shapes.map(s => {
  const k = s[0], o = [...s];
  if (k === 'e' || k === 'c') o[1] = -s[1];
  else if (k === 'r') o[1] = -s[1] - s[3];
  else if (k === 'p' || k === 'l') o[1] = s[1].map((v, i) => (i % 2 ? v : -v));
  else if (k === 'a') { o[1] = -s[1]; o[4] = Math.PI - s[5]; o[5] = Math.PI - s[4]; }
  return o;
});

// Validate sprite data (used by tests and by any future data-loaded sprite): primitives only, finite numbers, and fills
// that are palette slot names or colour literals. Returns a list of problems (empty = valid).
export function validateShapes(shapes, where = 'sprite') {
  const out = [], num = v => typeof v === 'number' && Number.isFinite(v), fillOk = f => typeof f === 'string' && /^(none|[a-zA-Z][\w-]*(\*[\d.]+)?|#[0-9a-fA-F]{3,8}(\*[\d.]+)?|rgba?\([\d\s.,%]+\))$/.test(f);
  if (!Array.isArray(shapes)) return [`${where}: not a list`];
  shapes.forEach((s, i) => {
    const at = `${where}[${i}]`;
    if (!Array.isArray(s)) return out.push(`${at}: not a primitive`);
    const [k] = s;
    const nums = k === 'e' ? s.slice(1, 5) : k === 'c' ? s.slice(1, 4) : k === 'r' ? s.slice(1, 6) : k === 'a' ? s.slice(1, 6) : k === 'p' || k === 'l' ? s[1] : null;
    if (!nums) return out.push(`${at}: unknown primitive ${String(k).slice(0, 8)}`);
    if (!Array.isArray(nums) || !nums.every(num)) out.push(`${at}: non-numeric geometry`);
    const f = k === 'e' ? s[5] : k === 'c' ? s[4] : k === 'r' ? s[6] : k === 'p' ? s[2] : k === 'l' ? s[2] : s[6];
    if (!fillOk(f)) out.push(`${at}: bad fill`);
    const opt = k === 'e' ? s[6] : k === 'c' ? s[5] : k === 'r' ? s[7] : k === 'p' ? s[3] : k === 'l' ? s[4] : s[7];
    if (opt != null && (typeof opt !== 'object' || Object.values(opt).some(v => typeof v === 'function' || (typeof v === 'object' && v !== null)))) out.push(`${at}: bad options`);
  });
  return out;
}
