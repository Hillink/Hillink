// Procedural 2.5D characters: one figure system for every agent and every skin. No image files.
// drawFigure(ctx, { x, y, h, dir, posture, state, t, time, stride, look, use }) draws a character whose
// feet touch (x, y). `state` is the controller's semantic animation state; `t` is seconds since it began.
// Directions: left, right (profile), back (walking into a room, or seated at a desk), front.
import { AGENT } from '../world/scale.mjs';
const TAU = Math.PI * 2;
// Body landmarks as fractions of height, shared with world/scale.mjs so seats and desks meet the body.
const HIP = AGENT.hip / AGENT.height, SEAT = AGENT.seat / AGENT.height, TORSO = AGENT.torso / AGENT.height;
const INK = 'rgba(22,24,31,0.92)';

const shade = (hex, k) => {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1, 7), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const ease = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const wave = (T, rate, seed = 0) => Math.sin(T * rate + seed);

function shape(ctx, path, fill, lw) {
  ctx.beginPath(); path(ctx); ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
}
function limb(ctx, x0, y0, x1, y1, w, color, lw) {
  ctx.lineCap = 'round';
  if (lw) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w + lw * 2; ctx.strokeStyle = INK; ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
}
const round = (x, y, w, h, r) => c => c.roundRect(x, y, w, h, r);
const circle = (x, y, r) => c => c.arc(x, y, r, 0, TAU);

// Hand-held props. (hx, hy) is the hand position; s is character height.
export function prop(ctx, kind, hx, hy, s, look, T, lw) {
  if (kind === 'tablet') {
    shape(ctx, round(hx - s * 0.1, hy - s * 0.13, s * 0.2, s * 0.14, s * 0.02), '#1d2431', lw);
    ctx.fillStyle = look.screen ?? '#5ee1ff'; ctx.fillRect(hx - s * 0.085, hy - s * 0.118, s * 0.17, s * 0.115);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(hx - s * 0.085, hy - s * 0.118 + ((T * 0.8) % 1) * s * 0.11, s * 0.17, s * 0.012);
  } else if (kind === 'cup') {
    shape(ctx, round(hx - s * 0.035, hy - s * 0.07, s * 0.07, s * 0.08, s * 0.012), look.cup ?? '#f4f1ea', lw * 0.7);
  } else if (kind === 'book') {
    shape(ctx, round(hx - s * 0.12, hy - s * 0.1, s * 0.24, s * 0.12, s * 0.01), '#f2ead8', lw * 0.7);
    ctx.fillStyle = look.bookColor ?? '#8b3a3a'; ctx.fillRect(hx - s * 0.008, hy - s * 0.1, s * 0.016, s * 0.12);
  } else if (kind === 'hammer') {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.6 + Math.max(0, Math.sin(T * 5)) * 0.9);
    shape(ctx, round(-s * 0.012, -s * 0.16, s * 0.024, s * 0.16, s * 0.006), '#8a5a2b', lw * 0.6);
    shape(ctx, round(-s * 0.05, -s * 0.18, s * 0.1, s * 0.04, s * 0.008), '#6b7280', lw * 0.6);
    ctx.restore();
  } else if (kind === 'shovel' || kind === 'spade') {
    // Handle from the hands down to a blade on the ground in front.
    const wood = kind === 'spade' ? '#7a5534' : '#9a6b3a', blade = kind === 'spade' ? '#8a8f96' : '#6b7280';
    limb(ctx, hx, hy - s * 0.06, hx + s * 0.06, hy + s * 0.34, s * 0.022, wood, lw * 0.5);
    shape(ctx, c => { c.moveTo(hx + s * 0.02, hy + s * 0.32); c.lineTo(hx + s * 0.11, hy + s * 0.32); c.lineTo(hx + s * 0.1, hy + s * 0.44); c.lineTo(hx + s * 0.03, hy + s * 0.44); c.closePath(); }, blade, lw * 0.6);
  } else if (kind === 'roller' || kind === 'brush') {
    // A pole up from the hand to a roller (Real) or a broad brush (Fantasy) against the wall.
    limb(ctx, hx, hy, hx + s * 0.04, hy - s * 0.3, s * 0.018, '#9aa0a8', lw * 0.4);
    if (kind === 'roller') shape(ctx, round(hx - s * 0.06, hy - s * 0.36, s * 0.2, s * 0.06, s * 0.03), look.paint ?? '#f2f0ea', lw * 0.6);
    else shape(ctx, round(hx - s * 0.02, hy - s * 0.38, s * 0.12, s * 0.1, s * 0.02), '#c9a46a', lw * 0.6);
  } else if (kind === 'wrench') {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.5 + Math.sin(T * 3.4) * 0.35);
    shape(ctx, round(-s * 0.012, -s * 0.13, s * 0.024, s * 0.13, s * 0.008), '#8d949c', lw * 0.6);
    shape(ctx, c => { c.arc(0, -s * 0.14, s * 0.035, 0, TAU); }, '#8d949c', lw * 0.6);
    ctx.restore();
  } else if (kind === 'staff') {
    // Fantasy: a rune staff whose tip glows while it works.
    limb(ctx, hx, hy + s * 0.12, hx + s * 0.03, hy - s * 0.3, s * 0.024, '#6b4a2b', lw * 0.5);
    ctx.fillStyle = '#9ef0ff'; ctx.globalAlpha *= 0.6 + 0.4 * Math.max(0, Math.sin(T * 4)); ctx.beginPath(); ctx.arc(hx + s * 0.03, hy - s * 0.32, s * 0.035, 0, TAU); ctx.fill(); ctx.globalAlpha = Math.min(1, ctx.globalAlpha / Math.max(0.2, 0.6 + 0.4 * Math.max(0, Math.sin(T * 4))));
  } else if (kind === 'mallet') {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.6 + Math.max(0, Math.sin(T * 5)) * 0.9);
    shape(ctx, round(-s * 0.012, -s * 0.16, s * 0.024, s * 0.16, s * 0.006), '#7a5534', lw * 0.6);
    shape(ctx, round(-s * 0.06, -s * 0.2, s * 0.12, s * 0.06, s * 0.012), '#8b6a45', lw * 0.6);
    ctx.restore();
  } else if (kind === 'scroll') {
    shape(ctx, round(hx - s * 0.1, hy - s * 0.12, s * 0.2, s * 0.13, s * 0.03), '#ecdcae', lw * 0.7);
    ctx.fillStyle = 'rgba(90,60,30,0.6)'; for (let i = 0; i < 3; i++) ctx.fillRect(hx - s * 0.07, hy - s * 0.09 + i * s * 0.03, s * 0.14, s * 0.008);
  } else if (kind === 'crate') {
    shape(ctx, round(hx - s * 0.13, hy - s * 0.15, s * 0.26, s * 0.17, s * 0.012), look.crate ?? '#b58a52', lw);
    ctx.strokeStyle = 'rgba(60,40,20,0.55)'; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.moveTo(hx - s * 0.13, hy - s * 0.15); ctx.lineTo(hx + s * 0.13, hy + s * 0.02); ctx.moveTo(hx + s * 0.13, hy - s * 0.15); ctx.lineTo(hx - s * 0.13, hy + s * 0.02); ctx.stroke();
  } else if (kind === 'package') {
    if (look.package === 'scroll') {
      shape(ctx, round(hx - s * 0.13, hy - s * 0.1, s * 0.26, s * 0.1, s * 0.04), '#ecdcae', lw);
      ctx.fillStyle = '#b3261e'; ctx.fillRect(hx - s * 0.02, hy - s * 0.1, s * 0.04, s * 0.1);
    } else {
      shape(ctx, round(hx - s * 0.12, hy - s * 0.16, s * 0.24, s * 0.17, s * 0.015), '#d9a55b', lw);
      ctx.fillStyle = '#b07a36'; ctx.fillRect(hx - s * 0.12, hy - s * 0.09, s * 0.24, s * 0.025);
      ctx.fillStyle = '#63b3ff'; ctx.fillRect(hx - s * 0.05, hy - s * 0.145, s * 0.1, s * 0.04);
    }
  }
}

// Head, hair, face and headwear. `face`: 'front' | 'left' | 'right' | 'back'.
function head(ctx, hx, hy, r, face, L, T, lw, { eyesClosed = false, blink = false } = {}) {
  const f = face === 'left' ? -1 : face === 'right' ? 1 : 0;
  if (L.cape && face !== 'back') { /* cape is drawn with the body */ }
  shape(ctx, circle(hx, hy, r), L.skin, lw);
  // Hair: a cap over the top; covers the whole head from behind.
  ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.clip();
  ctx.fillStyle = L.hair;
  if (face === 'back') ctx.fillRect(hx - r, hy - r, r * 2, r * (L.bald ? 0.8 : 1.75));
  else {
    ctx.beginPath(); ctx.ellipse(hx - f * r * 0.25, hy - r * 0.45, r * 1.15, r * 0.7, 0, 0, TAU); ctx.fill();
    if (f) { ctx.fillRect(hx - f * r * 1.0 - (f > 0 ? 0 : -0), hy - r * 0.5, f * -r * 0.55, r * 1.1); }
  }
  if (L.skinTone2 && face !== 'back') { ctx.fillStyle = L.skinTone2; ctx.fillRect(hx + (f >= 0 ? r * 0.2 : -r), hy - r, r * 0.8, r * 2); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  if (face !== 'back') {
    // Face.
    const ex = hx + f * r * 0.42, ey = hy + r * 0.12, gap = f ? 0 : r * 0.36;
    ctx.fillStyle = '#1a1a1a';
    const eye = x => { if (eyesClosed || blink) { ctx.fillRect(x - r * 0.12, ey, r * 0.24, r * 0.06); } else { ctx.beginPath(); ctx.ellipse(x, ey, r * 0.08, r * 0.12, 0, 0, TAU); ctx.fill(); } };
    if (f) eye(ex); else { eye(hx - gap); eye(hx + gap); }
    if (!f) { ctx.fillStyle = 'rgba(230,110,110,0.35)'; ctx.beginPath(); ctx.arc(hx - r * 0.55, hy + r * 0.38, r * 0.14, 0, TAU); ctx.arc(hx + r * 0.55, hy + r * 0.38, r * 0.14, 0, TAU); ctx.fill(); }
    if (L.glasses) { ctx.strokeStyle = '#20242c'; ctx.lineWidth = r * 0.09; ctx.beginPath(); if (f) ctx.arc(ex, ey, r * 0.2, 0, TAU); else { ctx.arc(hx - gap, ey, r * 0.2, 0, TAU); ctx.moveTo(hx + gap + r * 0.2, ey); ctx.arc(hx + gap, ey, r * 0.2, 0, TAU); } ctx.stroke(); }
    if (L.visor) { ctx.fillStyle = L.visor; ctx.globalAlpha *= 0.85 + 0.15 * wave(T, 3); ctx.fillRect(hx - r * 0.85 + f * r * 0.3, ey - r * 0.16, r * (f ? 1.3 : 1.7), r * 0.28); ctx.globalAlpha /= 0.85 + 0.15 * wave(T, 3); }
    if (L.beard) shape(ctx, c => { c.moveTo(hx - r * (f ? 0.5 - f * 0.4 : 0.85), hy + r * 0.25); c.quadraticCurveTo(hx + f * r * 0.3, hy + r * (L.beardLong ? 2.1 : 1.35), hx + r * (f ? 0.5 + f * 0.4 : 0.85), hy + r * 0.25); c.closePath(); }, L.beard, lw * 0.8);
  }
  // Headwear.
  const hat = L.hat, hc = L.hatColor;
  if (hat === 'hardhat') { shape(ctx, c => { c.arc(hx, hy - r * 0.25, r * 1.02, Math.PI, TAU); c.closePath(); }, hc ?? '#f2b01e', lw); shape(ctx, round(hx - r * 1.2 + f * r * 0.2, hy - r * 0.32, r * 2.4, r * 0.2, r * 0.08), hc ?? '#f2b01e', lw * 0.8); }
  else if (hat === 'cap') { shape(ctx, c => { c.arc(hx, hy - r * 0.3, r * 0.98, Math.PI, TAU); c.closePath(); }, hc ?? '#2b3a4f', lw); if (face !== 'back') shape(ctx, round(hx + (f || 1) * r * 0.2 - (f < 0 ? r * 1.1 : 0), hy - r * 0.38, r * (f ? 1.1 : 0.9), r * 0.16, r * 0.06), hc ?? '#2b3a4f', lw * 0.7); }
  else if (hat === 'crown') { shape(ctx, c => { const y0 = hy - r * 0.75; c.moveTo(hx - r * 0.75, y0); for (let i = 0; i <= 4; i++) c.lineTo(hx - r * 0.75 + i * r * 0.375, y0 - (i % 2 ? r * 0.3 : r * 0.72)); c.lineTo(hx + r * 0.75, y0); c.closePath(); }, '#f5c542', lw); ctx.fillStyle = '#d6336c'; ctx.beginPath(); ctx.arc(hx, hy - r * 0.95, r * 0.1, 0, TAU); ctx.fill(); }
  else if (hat === 'helmet') { shape(ctx, c => { c.arc(hx, hy - r * 0.15, r * 1.08, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); }, hc ?? '#9aa6b4', lw); if (L.horns) for (const s of [-1, 1]) shape(ctx, c => { c.moveTo(hx + s * r * 0.8, hy - r * 0.55); c.quadraticCurveTo(hx + s * r * 1.5, hy - r * 0.9, hx + s * r * 1.25, hy - r * 1.55); c.quadraticCurveTo(hx + s * r * 1.1, hy - r * 0.95, hx + s * r * 0.55, hy - r * 0.8); c.closePath(); }, '#efe6cf', lw * 0.7); }
  else if (hat === 'wizard') shape(ctx, c => { c.moveTo(hx - r * 1.15, hy - r * 0.45); c.quadraticCurveTo(hx + r * 0.3, hy - r * 1.2, hx + r * 0.55 + f * r * 0.2, hy - r * 2.3); c.lineTo(hx + r * 1.15, hy - r * 0.45); c.closePath(); }, hc ?? '#5b3fa8', lw);
  else if (hat === 'hood') shape(ctx, c => { c.arc(hx, hy - r * 0.05, r * 1.18, Math.PI * 0.92, Math.PI * 2.08); c.closePath(); }, hc ?? L.shirt, lw);
  if (L.goggles && face !== 'back') { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(hx - r, hy - r * 0.55, r * 2, r * 0.18); for (const s of f ? [f * 0.35] : [-0.4, 0.4]) { ctx.fillStyle = '#8fd3ff'; ctx.beginPath(); ctx.arc(hx + s * r, hy - r * 0.47, r * 0.22, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.6; ctx.stroke(); } }
  if (L.headset && face !== 'back') { ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(hx, hy - r * 0.05, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = '#2a2f38'; ctx.fillRect(hx + (f || -1) * r * 0.95 - r * 0.12, hy - r * 0.1, r * 0.24, r * 0.4); }
  if (L.antenna) { limb(ctx, hx, hy - r, hx + r * 0.2, hy - r * 1.55, r * 0.08, '#8894a3', 0); ctx.fillStyle = L.visor ?? '#5ee1ff'; ctx.globalAlpha *= 0.6 + 0.4 * Math.max(0, wave(T, 4)); ctx.beginPath(); ctx.arc(hx + r * 0.2, hy - r * 1.6, r * 0.16, 0, TAU); ctx.fill(); ctx.globalAlpha = Math.min(1, ctx.globalAlpha / Math.max(0.2, 0.6 + 0.4 * Math.max(0, wave(T, 4)))); }
}

// Pose for one clip: hand offsets from the shoulder line ([far/left, near/right]), a held prop, how far the body
// crouches (0..1 of the hip drop a deep squat takes) and how far the torso leans. Pure; used for the current clip and,
// while clips blend (Pass 5C), for the previous one too.
export function poseFor(state, P) {
  const { h, T, t, x, dir, side, f, reach, sw, use, sit, g } = P;
  let arms, held = null, crouch = 0, lean = 0;
  switch (state) {
    case 'walk': arms = side ? [[-sw * f, h * 0.22], [sw * f, h * 0.22]] : [[-h * 0.2, h * 0.2 + sw * 0.3], [h * 0.2, h * 0.2 - sw * 0.3]]; break;
    case 'carry': arms = side ? [[f * h * 0.16, h * 0.14], [f * h * 0.2, h * 0.15]] : [[-h * 0.1, h * 0.14], [h * 0.1, h * 0.14]]; held = 'package'; break;
    case 'type': { const a = wave(T, 24) * h * 0.012, b = wave(T, 21, 1) * h * 0.012; arms = dir === 'back' ? [[-h * 0.1, h * 0.03 + a], [h * 0.1, h * 0.03 + b]] : [[reach * h * 0.2 - h * 0.05, h * 0.13 + a], [reach * h * 0.24 + h * 0.05, h * 0.14 + b]]; lean = h * 0.02; break; }
    case 'work': arms = dir === 'back' ? [[-h * 0.12, h * 0.08], [h * 0.06, -h * 0.02 + wave(T, 0.7) * h * 0.01]] : [[-h * 0.17, h * 0.2], [h * 0.04, h * 0.0]]; break;
    case 'inspect': case 'survey': arms = dir === 'back' ? [[-h * 0.06, h * 0.02], [h * 0.2, h * 0.0 + wave(T, 1.6) * h * 0.02]] : [[reach * h * 0.14 - h * 0.07, h * 0.1], [reach * h * 0.2 + h * 0.07, h * 0.08 + wave(T, 1.6) * h * 0.02]]; held = 'tablet'; break;
    case 'assemble': { const k = Math.max(0, Math.sin(T * 5)); arms = [[-h * 0.1, h * 0.1], [h * 0.12, -h * 0.02 - k * h * 0.12]]; held = 'hammer'; crouch = 0.12; lean = h * 0.015; break; }
    // Pass 5C construction clips: each stage has its own work, all looping only while the stage is really active.
    case 'measure': { const point = Math.sin(T * 0.8 + x) > 0.35; arms = point ? [[reach * h * 0.12 - h * 0.08, h * 0.1], [(f || 1) * h * 0.3, -h * 0.02]] : [[reach * h * 0.14 - h * 0.07, h * 0.1], [reach * h * 0.2 + h * 0.07, h * 0.08]]; held = 'tablet'; break; }
    case 'dig': { const k = (Math.sin(T * 2.4) + 1) / 2; arms = [[(f || 1) * h * 0.06, h * 0.08 + k * h * 0.12], [(f || 1) * h * 0.14, h * 0.18 + k * h * 0.1]]; held = 'shovel'; crouch = 0.15 + k * 0.2; lean = h * (0.02 + k * 0.03); break; }
    case 'paint': { const k = Math.sin(T * 1.9); arms = [[-h * 0.12, h * 0.16], [(f || 1) * h * 0.14, -h * 0.06 + k * h * 0.16]]; held = 'roller'; break; }
    case 'install': { const k = wave(T, 3.4) * h * 0.02; arms = [[(f || 1) * h * 0.14 - h * 0.05, h * 0.16 + k], [(f || 1) * h * 0.2 + h * 0.03, h * 0.14 - k]]; held = 'wrench'; crouch = 0.55; lean = h * 0.04; break; }
    case 'lift': { const k = (Math.sin(T * 1.6) + 1) / 2; arms = [[-h * 0.1, h * 0.28 - k * h * 0.16], [h * 0.1, h * 0.28 - k * h * 0.16]]; held = 'crate'; crouch = (1 - k) * 0.45; lean = h * (1 - k) * 0.04; break; }
    case 'pickup': { const k = Math.min(1, t / 0.6), up = t > 0.9 ? Math.min(1, (t - 0.9) / 0.4) : 0; arms = [[-h * 0.1, h * (0.3 - up * 0.16)], [h * 0.1, h * (0.3 - up * 0.16)]]; held = up > 0 ? 'crate' : null; crouch = 0.6 * k * (1 - up); lean = h * 0.05 * k * (1 - up); break; }
    case 'read': arms = [[reach * h * 0.14 - h * 0.09, h * 0.12], [reach * h * 0.14 + h * 0.09, h * 0.12]]; held = 'book'; break;
    case 'talk': case 'meeting': { const speak = state === 'talk' || Math.sin(T * 0.6 + x * 0.05) > 0.2; arms = [[-h * 0.2, h * 0.2], [h * 0.14 + (speak ? wave(T, 3.2) * h * 0.06 : 0), speak ? h * 0.06 + wave(T, 4.1) * h * 0.05 : h * 0.2]]; break; }
    case 'blocked': arms = [[-h * 0.12, -h * 0.2], [h * 0.12, -h * 0.2]]; lean = -h * 0.01; break;
    case 'waiting': arms = Math.sin(T * 0.5 + x) > 0.75 ? [[-h * 0.2, h * 0.2], [h * 0.04, h * 0.02]] : [[-h * 0.2, h * 0.19], [h * 0.2, h * 0.19]]; break;
    case 'celebrate': arms = [[-h * 0.2, h * 0.18], [h * 0.14, -h * 0.26 + Math.sin(t * 7) * h * 0.03]]; break;
    case 'offline': arms = [[-h * 0.14, h * 0.22], [h * 0.14, h * 0.22]]; lean = h * 0.03; break;
    default: {
      if (use === 'coffee') { const sip = Math.sin(T * 0.5 + x) > 0.8; arms = [[-h * 0.2, h * 0.2], [h * 0.06, sip ? -h * 0.02 : h * 0.1]]; held = 'cup'; }
      else if (use === 'relax' && sit > 0.5) arms = [[-h * 0.24, h * 0.14], [h * 0.24, h * 0.14]];
      else if (use === 'snack' && Math.sin(T * 0.4 + x) > 0.85) arms = [[-h * 0.2, h * 0.2], [h * 0.05, -h * 0.03]];
      else arms = [[-h * 0.19 + wave(T, 0.9) * h * 0.004, h * 0.21], [h * 0.19 - wave(T, 0.9) * h * 0.004, h * 0.21]];
    }
  }
  void g;
  return { arms, held, crouch, lean };
}
const mix = (a, b, k) => a + (b - a) * k;

export function drawFigure(ctx, o) {
  const { x, y, look = {}, time: T = 0, stride = 0, use } = o;
  const L = { skin: '#f0c49b', hair: '#3b2a20', shirt: '#5b6b82', pants: '#2c3340', shoes: '#1d2027', ...look };
  const h = o.h * (L.scale ?? 1), t = o.t ?? 0, state = o.state ?? 'idle';
  const lw = Math.max(0.6, h * 0.032);
  let dir = o.dir ?? 'front';
  const f = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const side = f !== 0;
  // Sitting amount: 1 seated, 0 standing; transitions blend.
  let sit = o.posture === 'sit' ? 1 : 0;
  if (state === 'sit') sit = ease(t / AGENT.sitSeconds);
  if (state === 'stand') sit = 1 - ease(t / AGENT.standSeconds);
  const walking = state === 'walk' || (state === 'carry' && o.moving);
  // Pass 5C: stride length and arm swing scale with speed (gait 0..1), so starting and stopping read as such.
  const gait = walking ? Math.max(0.25, Math.min(1, o.gait ?? 1)) : 0;
  const phase = walking ? (stride / (h * 0.42)) * Math.PI : 0;
  const legLen = h * HIP, torsoH = h * TORSO, r = h * 0.2 * (L.headScale ?? 1);
  const seatY = y - h * SEAT; // hips rest on a seat of AGENT.seat, the height every chair is built to
  const sw = walking ? Math.sin(phase) * h * 0.1 * gait : 0;
  const reach = side ? f : 0;
  // The clip's pose, blended from the previous clip's over the first BLEND_MS (o.blend 0..1).
  const PP = { h, T, t, x, dir, side, f, reach, sw, use, sit, g: gait };
  let pose = poseFor(state, PP);
  const blend = o.prev && o.prev !== state ? Math.max(0, Math.min(1, o.blend ?? 1)) : 1;
  if (blend < 1) {
    const from = poseFor(o.prev, { ...PP, t: t + 1 });
    pose = { arms: pose.arms.map((hand, i) => [mix(from.arms[i][0], hand[0], blend), mix(from.arms[i][1], hand[1], blend)]), held: blend > 0.5 ? pose.held : from.held, crouch: mix(from.crouch, pose.crouch, blend), lean: mix(from.lean, pose.lean, blend) };
  }
  let bob = walking ? -Math.abs(Math.sin(phase)) * h * 0.04 * gait : wave(T, 2.2, x) * h * 0.007;
  if (state === 'celebrate') bob -= Math.max(0, Math.sin(t * 7)) * h * 0.06 * Math.max(0, 1 - t / 2.6);
  if (state === 'react') bob -= Math.sin(Math.min(1, t / 0.25) * Math.PI) * h * 0.05;
  if (state === 'offline') bob += h * 0.02;
  const crouchDrop = pose.crouch * legLen * 0.42 * (1 - sit);
  const hipY = (y - legLen) * (1 - sit) + seatY * sit + bob + crouchDrop;
  const tw = side ? h * 0.25 : h * 0.34 * (L.wide ?? 1);
  const lean = pose.lean;
  const shY = hipY - torsoH + lean;
  let headX = x, headY = shY - r * 0.82;
  if (state === 'offline') { headY += r * 0.35; headX += (f || 0.4) * r * 0.25; }
  if (state === 'type') headY += Math.abs(wave(T, 9)) * h * 0.006;
  if (state === 'work' && !side) headX += wave(T, 0.9) * r * 0.08;
  if ((state === 'measure' || state === 'survey') && !side) headX += wave(T, 0.8, 1) * r * 0.1; // looking over the site
  if (state === 'idle' && Math.sin(T * 0.37 + x) > 0.93) headX += (f || 1) * r * 0.12; // a glance
  const blink = (T * 0.31 + x * 0.013) % 1 < 0.035;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  // Contact shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, h * (side ? 0.2 : 0.22), h * 0.06, 0, 0, TAU); ctx.fill();
  if (L.cape) shape(ctx, c => { c.moveTo(x - tw * 0.55, shY + h * 0.02); c.lineTo(x + tw * 0.55, shY + h * 0.02); c.lineTo(x + tw * 0.75 - f * h * 0.08, Math.min(y - h * 0.02, hipY + h * 0.24)); c.lineTo(x - tw * 0.75 - f * h * 0.08, Math.min(y - h * 0.02, hipY + h * 0.24)); c.closePath(); }, L.cape, lw);

  // Legs (a robe hides them). Seated: thighs toward the facing direction. Crouched: knees forward.
  const legW = h * 0.1, footY = y;
  const legs = [];
  const knee = side ? f * (h * 0.17 * sit + crouchDrop * 0.8) : 0;
  if (L.robe) legs.push('robe');
  else if (side) {
    const swing = walking ? Math.sin(phase) * h * 0.1 * gait : 0;
    const tap = state === 'waiting' && sit < 0.5 ? Math.max(0, Math.sin(T * 7)) * h * 0.03 : 0;
    for (const [k, s] of [[0, -1], [1, 1]]) {
      const kneeX = x + knee + s * swing * (1 - sit), footX = x + f * h * 0.17 * sit + s * swing * (1 - sit);
      const kneeY = sit ? hipY : hipY + (footY - hipY) * 0.5;
      legs.push(() => { limb(ctx, x, hipY, kneeX, kneeY, legW, shade(L.pants, k ? 1 : 0.82), lw); limb(ctx, kneeX, kneeY, footX, footY - (k ? tap : 0), legW, shade(L.pants, k ? 1 : 0.82), lw); shape(ctx, round(footX - h * 0.045 + f * h * 0.02, footY - h * 0.045 - (k ? tap : 0), h * 0.09, h * 0.05, h * 0.02), L.shoes, lw * 0.6); });
    }
  } else if (dir === 'front' || sit < 0.5) {
    for (const s of [-1, 1]) {
      const lift = walking ? Math.max(0, Math.sin(phase + (s > 0 ? Math.PI : 0))) * h * 0.05 * gait : 0;
      const swingSit = state === 'waiting' && sit > 0.5 ? Math.max(0, Math.sin(T * 5 + s)) * h * 0.02 : 0;
      const lx = x + s * h * 0.075, spread = crouchDrop * 0.5 * s;
      legs.push(() => { if (spread) { limb(ctx, lx, hipY, lx + spread, (hipY + footY) / 2, legW, L.pants, lw); limb(ctx, lx + spread, (hipY + footY) / 2, lx, footY - lift, legW, L.pants, lw); } else limb(ctx, lx, hipY, lx, footY - lift - swingSit, legW, L.pants, lw); shape(ctx, round(lx - h * 0.05, footY - h * 0.045 - lift - swingSit, h * 0.1, h * 0.05, h * 0.02), L.shoes, lw * 0.6); });
    }
  }
  for (const l of legs) if (l !== 'robe') l();
  if (legs[0] === 'robe') shape(ctx, c => { c.moveTo(x - tw * 0.5, hipY - h * 0.02); c.lineTo(x + tw * 0.5, hipY - h * 0.02); c.lineTo(x + tw * 0.62, y - h * 0.01); c.lineTo(x - tw * 0.62, y - h * 0.01); c.closePath(); }, L.shirt, lw);

  // Arms: from the pose (blended), with a rig's prop in place of the clip's default when it gives one.
  const arms = pose.arms;
  const held = pose.held ? (o.props?.[pose.held] ?? pose.held) : null;
  const armW = h * 0.085;
  const shL = [x - tw * 0.48, shY + h * 0.035], shR = [x + tw * 0.48, shY + h * 0.035];
  const hand = (sh, [dx, dy]) => [side ? x + dx : sh[0] + dx - (sh === shL ? -tw * 0.48 : tw * 0.48) + (sh === shL ? -tw * 0.48 : tw * 0.48), shY + dy];
  const handL = side ? [x + arms[0][0], shY + arms[0][1]] : [x + arms[0][0], shY + arms[0][1]];
  const handR = side ? [x + arms[1][0], shY + arms[1][1]] : [x + arms[1][0], shY + arms[1][1]];
  void hand;
  const armColor = L.sleeve ?? L.shirt, armColor2 = L.metalArm ? '#9aa6b4' : armColor;
  const drawArm = (sh, hd, c) => { limb(ctx, sh[0], sh[1], hd[0], hd[1], armW, c, lw); shape(ctx, circle(hd[0], hd[1], h * 0.045), L.glove ?? L.skin, lw * 0.6); };

  // Far arm behind the body in profile, both arms behind the body when seen from the back.
  if (side) drawArm([x - f * h * 0.02, shL[1]], handL, shade(armColor, 0.8));
  if (dir === 'back') { drawArm(shL, handL, armColor); drawArm(shR, handR, armColor2); }
  // Torso.
  shape(ctx, round(x - tw / 2, shY, tw, hipY - shY + h * 0.05, h * 0.07), L.shirt, lw);
  ctx.save(); ctx.beginPath(); ctx.roundRect(x - tw / 2, shY, tw, hipY - shY + h * 0.05, h * 0.07); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(side ? x - f * tw * 0.5 - (f > 0 ? 0 : -tw * 0.25) - tw * 0.25 * (f > 0 ? 0 : 1) : x + tw * 0.2, shY, tw * 0.3, hipY - shY + h * 0.06);
  if (L.vest && dir !== 'back') { ctx.fillStyle = L.vest; ctx.fillRect(x - tw * 0.36, shY, tw * 0.72, hipY - shY + h * 0.05); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x - tw * 0.36, shY + h * 0.12, tw * 0.72, h * 0.02); }
  if (L.vest && dir === 'back') { ctx.fillStyle = L.vest; ctx.fillRect(x - tw / 2, shY, tw, hipY - shY + h * 0.05); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x - tw / 2, shY + h * 0.12, tw, h * 0.02); }
  if (L.overalls) { ctx.fillStyle = L.overalls; ctx.fillRect(x - tw * 0.38, shY + h * 0.1, tw * 0.76, hipY - shY); }
  if (L.jacket && dir === 'front') { ctx.fillStyle = L.jacket; ctx.fillRect(x - tw / 2, shY, tw * 0.3, hipY - shY + h * 0.06); ctx.fillRect(x + tw * 0.2, shY, tw * 0.3, hipY - shY + h * 0.06); }
  if (L.tie && dir === 'front') { ctx.fillStyle = L.tie; ctx.beginPath(); ctx.moveTo(x - h * 0.02, shY + h * 0.01); ctx.lineTo(x + h * 0.02, shY + h * 0.01); ctx.lineTo(x + h * 0.025, shY + h * 0.15); ctx.lineTo(x, shY + h * 0.18); ctx.lineTo(x - h * 0.025, shY + h * 0.15); ctx.fill(); }
  if (L.belt) { ctx.fillStyle = L.belt; ctx.fillRect(x - tw / 2, hipY - h * 0.02, tw, h * 0.035); if (dir !== 'back') { ctx.fillStyle = '#c8a24a'; ctx.fillRect(x - h * 0.02 + f * tw * 0.3, hipY - h * 0.025, h * 0.04, h * 0.045); } }
  if (L.badge && dir === 'front') { ctx.fillStyle = L.badge; ctx.fillRect(x + tw * 0.12, shY + h * 0.06, h * 0.05, h * 0.06); }
  if (L.core && dir !== 'back') { ctx.fillStyle = L.visor ?? '#5ee1ff'; ctx.globalAlpha *= 0.7 + 0.3 * wave(T, 2.5); ctx.beginPath(); ctx.arc(x + f * tw * 0.1, shY + h * 0.1, h * 0.03, 0, TAU); ctx.fill(); ctx.globalAlpha = o.alpha ?? 1; }
  ctx.restore();
  if (L.hoodie && dir !== 'front') shape(ctx, round(x - tw * 0.42, shY - h * 0.03, tw * 0.84, h * 0.08, h * 0.04), shade(L.shirt, 0.85), lw * 0.6);

  // Head (a beard sits over the chest, so it is drawn with the head).
  const faceDir = dir;
  head(ctx, headX, headY, r, faceDir, L, T, lw, { eyesClosed: state === 'offline', blink });
  // Near arm(s) in front of the body.
  if (side) {
    if (held) prop(ctx, held, handR[0], handR[1], h, L, T, lw);
    drawArm([x + f * h * 0.02, shR[1]], handR, armColor2);
  } else if (dir === 'front') {
    if (held) prop(ctx, held, (handL[0] + handR[0]) / 2, Math.min(handL[1], handR[1]) + h * 0.04, h, L, T, lw);
    drawArm(shL, handL, armColor); drawArm(shR, handR, armColor2);
  } else if (held && held !== 'cup' && held !== 'book') prop(ctx, held, handR[0] + h * 0.05, handR[1], h, L, T, lw);
  // A brief "!" when a character notices something that needs it.
  if (state === 'react') {
    const k = Math.min(1, t / 0.18);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = lw;
    const bx = headX + r * 0.9, by = headY - r * 1.7 - k * h * 0.05;
    ctx.beginPath(); ctx.roundRect(bx - h * 0.06, by - h * 0.13, h * 0.12, h * 0.16, h * 0.03); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(bx - h * 0.012, by - h * 0.11, h * 0.024, h * 0.08); ctx.fillRect(bx - h * 0.012, by - h * 0.02, h * 0.024, h * 0.022);
  }
  ctx.restore();
  return { top: headY - r * (L.hat ? 2 : 1.3), headX, headY, r };
}

// A head-and-shoulders portrait for the roster, drawn with the same figure code.
export function drawPortrait(ctx, size, look) {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, look.bg1 ?? '#2a3346'); g.addColorStop(1, look.bg2 ?? '#141a26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  drawFigure(ctx, { x: size / 2, y: size * 1.45, h: size * 1.55, dir: 'front', state: 'idle', look, time: 0 });
}
