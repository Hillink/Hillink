// Procedural 2.5D characters: one figure system for every agent and every skin. No image files.
// drawFigure(ctx, { x, y, h, dir, posture, state, t, time, stride, look, use }) draws a character whose
// feet touch (x, y). `state` is the controller's semantic animation state; `t` is seconds since it began.
// Directions: left, right (profile), back (walking into a room, or seated at a desk), front.
const TAU = Math.PI * 2;
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
function prop(ctx, kind, hx, hy, s, look, T, lw) {
  if (kind === 'tablet') {
    shape(ctx, round(hx - s * 0.1, hy - s * 0.13, s * 0.2, s * 0.14, s * 0.02), '#1d2431', lw);
    ctx.fillStyle = look.screen ?? '#5ee1ff'; ctx.fillRect(hx - s * 0.085, hy - s * 0.118, s * 0.17, s * 0.115);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(hx - s * 0.085, hy - s * 0.118 + ((T * 0.8) % 1) * s * 0.11, s * 0.17, s * 0.012);
  } else if (kind === 'cup') {
    shape(ctx, round(hx - s * 0.035, hy - s * 0.07, s * 0.07, s * 0.08, s * 0.012), look.cup ?? '#f4f1ea', lw * 0.7);
  } else if (kind === 'book') {
    shape(ctx, round(hx - s * 0.12, hy - s * 0.1, s * 0.24, s * 0.12, s * 0.01), '#f2ead8', lw * 0.7);
    ctx.fillStyle = look.bookColor ?? '#8b3a3a'; ctx.fillRect(hx - s * 0.008, hy - s * 0.1, s * 0.016, s * 0.12);
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
  if (state === 'sit') sit = ease(t / 0.48);
  if (state === 'stand') sit = 1 - ease(t / 0.52);
  const walking = state === 'walk' || (state === 'carry' && o.moving);
  const phase = walking ? (stride / (h * 0.42)) * Math.PI : 0;
  const legLen = h * 0.26, torsoH = h * 0.3, r = h * 0.2 * (L.headScale ?? 1);
  const seatY = y - h * 0.3;
  let bob = walking ? -Math.abs(Math.sin(phase)) * h * 0.04 : wave(T, 2.2, x) * h * 0.007;
  if (state === 'celebrate') bob -= Math.max(0, Math.sin(t * 7)) * h * 0.06 * Math.max(0, 1 - t / 2.6);
  if (state === 'react') bob -= Math.sin(Math.min(1, t / 0.25) * Math.PI) * h * 0.05;
  if (state === 'offline') bob += h * 0.02;
  const hipY = (y - legLen) * (1 - sit) + seatY * sit + bob;
  const tw = side ? h * 0.25 : h * 0.34 * (L.wide ?? 1);
  const lean = state === 'type' ? h * 0.02 : state === 'offline' ? h * 0.03 : state === 'blocked' ? -h * 0.01 : 0;
  const shY = hipY - torsoH + lean;
  let headX = x, headY = shY - r * 0.82;
  if (state === 'offline') { headY += r * 0.35; headX += (f || 0.4) * r * 0.25; }
  if (state === 'type') headY += Math.abs(wave(T, 9)) * h * 0.006;
  if (state === 'work' && !side) headX += wave(T, 0.9) * r * 0.08;
  if (state === 'idle' && Math.sin(T * 0.37 + x) > 0.93) headX += (f || 1) * r * 0.12; // a glance
  const blink = (T * 0.31 + x * 0.013) % 1 < 0.035;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  // Contact shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, h * (side ? 0.2 : 0.22), h * 0.06, 0, 0, TAU); ctx.fill();
  if (L.cape) shape(ctx, c => { c.moveTo(x - tw * 0.55, shY + h * 0.02); c.lineTo(x + tw * 0.55, shY + h * 0.02); c.lineTo(x + tw * 0.75 - f * h * 0.08, Math.min(y - h * 0.02, hipY + h * 0.24)); c.lineTo(x - tw * 0.75 - f * h * 0.08, Math.min(y - h * 0.02, hipY + h * 0.24)); c.closePath(); }, L.cape, lw);

  // Legs (a robe hides them). Seated: thighs toward the facing direction.
  const legW = h * 0.1, footY = y;
  const legs = [];
  if (L.robe) legs.push('robe');
  else if (side) {
    const swing = walking ? Math.sin(phase) * h * 0.1 : 0;
    const tap = state === 'waiting' && sit < 0.5 ? Math.max(0, Math.sin(T * 7)) * h * 0.03 : 0;
    for (const [k, s] of [[0, -1], [1, 1]]) {
      const kneeX = x + f * h * 0.17 * sit + s * swing * (1 - sit), footX = x + f * h * 0.17 * sit + s * swing * (1 - sit);
      const kneeY = hipY * (1 - sit) * 0 + (sit ? hipY : hipY + legLen * 0.5);
      legs.push(() => { limb(ctx, x, hipY, kneeX, sit ? hipY : kneeY, legW, shade(L.pants, k ? 1 : 0.82), lw); limb(ctx, kneeX, sit ? hipY : kneeY, footX, footY - (k ? tap : 0), legW, shade(L.pants, k ? 1 : 0.82), lw); shape(ctx, round(footX - h * 0.045 + f * h * 0.02, footY - h * 0.045 - (k ? tap : 0), h * 0.09, h * 0.05, h * 0.02), L.shoes, lw * 0.6); });
    }
  } else if (dir === 'front' || sit < 0.5) {
    const kneeDrop = sit * h * 0.05;
    for (const s of [-1, 1]) {
      const lift = walking ? Math.max(0, Math.sin(phase + (s > 0 ? Math.PI : 0))) * h * 0.05 : 0;
      const swingSit = state === 'waiting' && sit > 0.5 ? Math.max(0, Math.sin(T * 5 + s)) * h * 0.02 : 0;
      const lx = x + s * h * 0.075;
      legs.push(() => { limb(ctx, lx, hipY, lx, footY - lift - swingSit - kneeDrop * 0, legW, L.pants, lw); shape(ctx, round(lx - h * 0.05, footY - h * 0.045 - lift - swingSit, h * 0.1, h * 0.05, h * 0.02), L.shoes, lw * 0.6); });
    }
  }
  for (const l of legs) if (l !== 'robe') l();
  if (legs[0] === 'robe') shape(ctx, c => { c.moveTo(x - tw * 0.5, hipY - h * 0.02); c.lineTo(x + tw * 0.5, hipY - h * 0.02); c.lineTo(x + tw * 0.62, y - h * 0.01); c.lineTo(x - tw * 0.62, y - h * 0.01); c.closePath(); }, L.shirt, lw);

  // Arms: targets relative to the shoulder, per state.
  const sw = walking ? Math.sin(phase) * h * 0.1 : 0;
  const reach = side ? f : 0;
  let arms; // [ [dx, dy] far/left, [dx, dy] near/right ] offsets of the hands from the shoulder line
  let held = null;
  switch (state) {
    case 'walk': arms = side ? [[-sw * f, h * 0.22], [sw * f, h * 0.22]] : [[-h * 0.2, h * 0.2 + sw * 0.3], [h * 0.2, h * 0.2 - sw * 0.3]]; break;
    case 'carry': arms = side ? [[f * h * 0.16, h * 0.14], [f * h * 0.2, h * 0.15]] : [[-h * 0.1, h * 0.14], [h * 0.1, h * 0.14]]; held = 'package'; break;
    case 'type': { const a = wave(T, 24) * h * 0.012, b = wave(T, 21, 1) * h * 0.012; arms = dir === 'back' ? [[-h * 0.1, h * 0.03 + a], [h * 0.1, h * 0.03 + b]] : [[reach * h * 0.2 - h * 0.05, h * 0.13 + a], [reach * h * 0.24 + h * 0.05, h * 0.14 + b]]; break; }
    case 'work': arms = dir === 'back' ? [[-h * 0.12, h * 0.08], [h * 0.06, -h * 0.02 + wave(T, 0.7) * h * 0.01]] : [[-h * 0.17, h * 0.2], [h * 0.04, h * 0.0]]; break;
    case 'inspect': arms = dir === 'back' ? [[-h * 0.06, h * 0.02], [h * 0.2, h * 0.0 + wave(T, 1.6) * h * 0.02]] : [[reach * h * 0.14 - h * 0.07, h * 0.1], [reach * h * 0.2 + h * 0.07, h * 0.08 + wave(T, 1.6) * h * 0.02]]; held = 'tablet'; break;
    case 'read': arms = [[reach * h * 0.14 - h * 0.09, h * 0.12], [reach * h * 0.14 + h * 0.09, h * 0.12]]; held = 'book'; break;
    case 'talk': case 'meeting': { const speak = state === 'talk' || Math.sin(T * 0.6 + x * 0.05) > 0.2; arms = [[-h * 0.2, h * 0.2], [h * 0.14 + (speak ? wave(T, 3.2) * h * 0.06 : 0), speak ? h * 0.06 + wave(T, 4.1) * h * 0.05 : h * 0.2]]; break; }
    case 'blocked': arms = [[-h * 0.12, -h * 0.2], [h * 0.12, -h * 0.2]]; break;
    case 'waiting': arms = Math.sin(T * 0.5 + x) > 0.75 ? [[-h * 0.2, h * 0.2], [h * 0.04, h * 0.02]] : [[-h * 0.2, h * 0.19], [h * 0.2, h * 0.19]]; break;
    case 'celebrate': arms = [[-h * 0.2, h * 0.18], [h * 0.14, -h * 0.26 + Math.sin(t * 7) * h * 0.03]]; break;
    case 'offline': arms = [[-h * 0.14, h * 0.22], [h * 0.14, h * 0.22]]; break;
    default: {
      if (use === 'coffee') { const sip = Math.sin(T * 0.5 + x) > 0.8; arms = [[-h * 0.2, h * 0.2], [h * 0.06, sip ? -h * 0.02 : h * 0.1]]; held = 'cup'; }
      else if (use === 'relax' && sit > 0.5) arms = [[-h * 0.24, h * 0.14], [h * 0.24, h * 0.14]];
      else if (use === 'snack' && Math.sin(T * 0.4 + x) > 0.85) arms = [[-h * 0.2, h * 0.2], [h * 0.05, -h * 0.03]];
      else arms = [[-h * 0.19 + wave(T, 0.9) * h * 0.004, h * 0.21], [h * 0.19 - wave(T, 0.9) * h * 0.004, h * 0.21]];
    }
  }
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
  } else if (held === 'tablet' || held === 'package') prop(ctx, held, handR[0] + h * 0.05, handR[1], h, L, T, lw);
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
