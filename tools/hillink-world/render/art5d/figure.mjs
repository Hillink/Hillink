// Pass 5D-A: the new character art. Same interface as render/figure.mjs drawFigure(ctx, o), and the same poses: it
// reads the clip pose (hands, crouch, lean, held prop) from poseFor(), so the 5C animation intents, rigs, blending,
// sitting and walking all drive it unchanged. Only the drawing is new:
//   - proportions of a stylized management-sim character (a slightly large head for readability at gameplay zoom);
//   - volumes shaded from the sun (light from the upper left), coloured edges instead of black outlines;
//   - clothing as layers (shirt, jacket, vest, hoodie, overalls, belt, badge) and role accessories (glasses,
//     headset, hard hat, cap) from the character's look, so identities stay distinct;
//   - a face (eyes with a catch-light, brows, nose shade, mouth), ears and shaped hair.
import { AGENT } from '../../world/scale.mjs';
import { poseFor, prop } from '../figure.mjs';
import { lit, mix } from './light.mjs';

const TAU = Math.PI * 2;
const HIP = AGENT.hip / AGENT.height, SEAT = AGENT.seat / AGENT.height;
const ease = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const wave = (T, rate, seed = 0) => Math.sin(T * rate + seed);
const toHex = c => (c?.[0] === '#' ? c : '#888888');
const edge = c => lit(toHex(c), 0.55);

// A limb: a tapered capsule from (x0, y0) to (x1, y1) with widths w0 -> w1, lit along its left edge.
function capsule(ctx, x0, y0, x1, y1, w0, w1, color, shadeSide = false) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const base = shadeSide ? lit(toHex(color), 0.8) : toHex(color);
  const g = ctx.createLinearGradient(x0 + nx * w0, y0 + ny * w0, x0 - nx * w0, y0 - ny * w0);
  g.addColorStop(0, lit(base, 0.82)); g.addColorStop(0.45, base); g.addColorStop(1, lit(base, 1.1));
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  ctx.arc(x1, y1, w1 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, false);
  ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  ctx.arc(x0, y0, w0 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, false);
  ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(0.5, w1 * 0.12); ctx.strokeStyle = edge(base); ctx.stroke();
}
function roundedShape(ctx, pts, fill, stroke, lw) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } }
const shadedFill = (ctx, x0, x1, base) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, lit(base, 1.12)); g.addColorStop(0.5, base); g.addColorStop(1, lit(base, 0.78)); return g; };

function head(ctx, hx, hy, r, face, L, T, { eyesClosed, blink }) {
  const f = face === 'left' ? -1 : face === 'right' ? 1 : 0, skin = toHex(L.skin), hair = toHex(L.hair);
  // Ears (behind the head outline), then the head with light from the upper left.
  if (face !== 'back') for (const s of f ? [-f] : [-1, 1]) { ctx.fillStyle = lit(skin, 0.92); ctx.beginPath(); ctx.ellipse(hx + s * r * 0.95, hy + r * 0.08, r * 0.2, r * 0.26, 0, 0, TAU); ctx.fill(); }
  const g = ctx.createRadialGradient(hx - r * 0.35, hy - r * 0.4, r * 0.1, hx, hy, r * 1.05);
  g.addColorStop(0, lit(skin, 1.12)); g.addColorStop(0.6, skin); g.addColorStop(1, lit(skin, 0.8));
  ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.98, r, 0, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = r * 0.07; ctx.strokeStyle = edge(skin); ctx.stroke();
  // Hair: a shaped crop (fuller from the back), with a sheen.
  if (!L.bald) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(hx, hy, r * 1.02, r * 1.04, 0, 0, TAU); ctx.clip();
    const hg = ctx.createLinearGradient(hx - r, hy - r, hx + r, hy + r * 0.2); hg.addColorStop(0, lit(hair, 1.25)); hg.addColorStop(0.5, hair); hg.addColorStop(1, lit(hair, 0.75));
    ctx.fillStyle = hg; ctx.beginPath();
    if (face === 'back') ctx.rect(hx - r * 1.1, hy - r * 1.1, r * 2.2, r * 1.75);
    else { ctx.ellipse(hx - f * r * 0.15, hy - r * 0.62, r * 1.12, r * 0.62, 0, 0, TAU); if (f) ctx.rect(hx - f * r * 1.05 - (f > 0 ? 0 : -r * 0.0), hy - r * 0.6, -f * r * 0.55, r * 1.05); }
    ctx.fill(); ctx.restore();
  }
  if (face !== 'back') {
    const ex = hx + f * r * 0.45, ey = hy + r * 0.08, gap = f ? 0 : r * 0.36;
    const eye = x => { if (eyesClosed || blink) { ctx.fillStyle = '#2a2a33'; ctx.fillRect(x - r * 0.13, ey, r * 0.26, r * 0.06); return; } ctx.fillStyle = '#23252e'; ctx.beginPath(); ctx.ellipse(x, ey, r * 0.1, r * 0.14, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x - r * 0.03, ey - r * 0.05, r * 0.035, 0, TAU); ctx.fill(); };
    if (f) eye(ex); else { eye(hx - gap); eye(hx + gap); }
    ctx.strokeStyle = lit(hair, 0.9); ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
    for (const x of f ? [ex] : [hx - gap, hx + gap]) { ctx.beginPath(); ctx.moveTo(x - r * 0.13, ey - r * 0.24); ctx.lineTo(x + r * 0.13, ey - r * 0.27); ctx.stroke(); }
    ctx.fillStyle = 'rgba(160,80,60,0.22)'; ctx.beginPath(); ctx.ellipse(hx + f * r * 0.62, hy + r * 0.3, r * 0.1, r * 0.08, 0, 0, TAU); ctx.fill(); // nose shade
    ctx.strokeStyle = 'rgba(120,50,50,0.7)'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(hx + f * r * 0.35, hy + r * 0.42, r * 0.16, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); // mouth
    if (L.glasses) { ctx.strokeStyle = '#1f2430'; ctx.lineWidth = r * 0.07; ctx.beginPath(); if (f) ctx.arc(ex, ey, r * 0.2, 0, TAU); else { ctx.arc(hx - gap, ey, r * 0.2, 0, TAU); ctx.moveTo(hx + gap + r * 0.2, ey); ctx.arc(hx + gap, ey, r * 0.2, 0, TAU); ctx.moveTo(hx - gap + r * 0.2, ey); ctx.lineTo(hx + gap - r * 0.2, ey); } ctx.stroke(); }
    if (L.beard) { ctx.fillStyle = toHex(L.beard); ctx.beginPath(); ctx.ellipse(hx + f * r * 0.2, hy + r * 0.62, r * (f ? 0.5 : 0.7), r * 0.42, 0, 0, Math.PI); ctx.fill(); }
  }
  const hc = toHex(L.hatColor ?? '#f2b01e');
  if (L.hat === 'hardhat') { const hg2 = ctx.createLinearGradient(hx - r, 0, hx + r, 0); hg2.addColorStop(0, lit(hc, 1.15)); hg2.addColorStop(1, lit(hc, 0.8)); ctx.fillStyle = hg2; ctx.beginPath(); ctx.arc(hx, hy - r * 0.2, r * 1.04, Math.PI, TAU); ctx.fill(); ctx.fillRect(hx - r * 1.25, hy - r * 0.26, r * 2.5, r * 0.16); }
  else if (L.hat === 'cap') { ctx.fillStyle = toHex(L.hatColor ?? '#2b3a4f'); ctx.beginPath(); ctx.arc(hx, hy - r * 0.28, r, Math.PI, TAU); ctx.fill(); if (face !== 'back') { ctx.beginPath(); ctx.ellipse(hx + (f || 0.001) * r * 0.75, hy - r * 0.3, r * (f ? 0.6 : 0.8), r * 0.14, 0, 0, TAU); ctx.fill(); } }
  if (L.headset && face !== 'back') { ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(hx, hy - r * 0.05, r * 1.05, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = '#2a2f38'; ctx.beginPath(); ctx.ellipse(hx + (f || -1) * r * 0.98, hy + r * 0.05, r * 0.16, r * 0.24, 0, 0, TAU); ctx.fill(); if (!f) { ctx.beginPath(); ctx.ellipse(hx + r * 0.98, hy + r * 0.05, r * 0.16, r * 0.24, 0, 0, TAU); ctx.fill(); } }
}

export function drawFigure5d(ctx, o) {
  const { x, y, look = {}, time: T = 0, stride = 0, use } = o;
  const L = { skin: '#f0c49b', hair: '#3b2a20', shirt: '#5b6b82', pants: '#2c3340', shoes: '#22252c', ...look };
  const h = o.h * (L.scale ?? 1), t = o.t ?? 0, state = o.state ?? 'idle', dir = o.dir ?? 'front';
  const f = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, side = f !== 0;
  let sit = o.posture === 'sit' ? 1 : 0;
  if (state === 'sit') sit = ease(t / AGENT.sitSeconds);
  if (state === 'stand') sit = 1 - ease(t / AGENT.standSeconds);
  const walking = state === 'walk' || (state === 'carry' && o.moving);
  const gait = walking ? Math.max(0.25, Math.min(1, o.gait ?? 1)) : 0, phase = walking ? (stride / (h * 0.42)) * Math.PI : 0;
  const sw = walking ? Math.sin(phase) * h * 0.1 * gait : 0, reach = side ? f : 0;
  const PP = { h, T, t, x, dir, side, f, reach, sw, use, sit, g: gait };
  let pose = poseFor(state, PP);
  const blend = o.prev && o.prev !== state ? Math.max(0, Math.min(1, o.blend ?? 1)) : 1;
  if (blend < 1) { const from = poseFor(o.prev, { ...PP, t: t + 1 }), m = (a, b) => a + (b - a) * blend; pose = { arms: pose.arms.map((hd, i) => [m(from.arms[i][0], hd[0]), m(from.arms[i][1], hd[1])]), held: blend > 0.5 ? pose.held : from.held, crouch: m(from.crouch, pose.crouch), lean: m(from.lean, pose.lean) }; }
  // Stylized proportions: legs 44% of height, torso 30%, a head a little larger than life for readability.
  const legLen = h * HIP, torsoH = h * 0.3, r = h * 0.135 * (L.headScale ?? 1), seatY = y - h * SEAT;
  let bob = walking ? -Math.abs(Math.sin(phase)) * h * 0.035 * gait : wave(T, 2.2, x) * h * 0.006;
  if (state === 'celebrate') bob -= Math.max(0, Math.sin(t * 7)) * h * 0.06 * Math.max(0, 1 - t / 2.6);
  if (state === 'react') bob -= Math.sin(Math.min(1, t / 0.25) * Math.PI) * h * 0.05;
  const crouchDrop = pose.crouch * legLen * 0.42 * (1 - sit);
  const hipY = (y - legLen) * (1 - sit) + seatY * sit + bob + crouchDrop;
  const shoulderW = side ? h * 0.2 : h * 0.3 * (L.wide ?? 1), hipW = side ? h * 0.17 : h * 0.24 * (L.wide ?? 1);
  const shY = hipY - torsoH + pose.lean;
  let headX = x, headY = shY - r * 1.05;
  if (state === 'type') headY += Math.abs(wave(T, 9)) * h * 0.005;
  if (state === 'offline') { headY += r * 0.3; headX += (f || 0.4) * r * 0.25; }
  if ((state === 'measure' || state === 'survey') && !side) headX += wave(T, 0.8, 1) * r * 0.1;
  const blink = (T * 0.31 + x * 0.013) % 1 < 0.035;
  const shirt = toHex(L.shirt), pants = toHex(L.pants), shoes = toHex(L.shoes), skin = toHex(L.skin);

  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.lineCap = 'round';
  // Legs: thigh and shin as capsules; knees forward when seated or crouching; shoes with a sole highlight.
  const legW = h * 0.095, footY = y;
  const drawLeg = (hx, footX, lift, far) => {
    const kneeX = side ? hx + f * (h * 0.16 * sit + crouchDrop * 0.8) + (footX - hx) * 0.5 * (1 - sit) : hx + (footX - hx) * 0.5, kneeY = sit ? hipY + h * 0.01 : (hipY + footY - lift) / 2 - crouchDrop * 0.1;
    const fx = side ? footX + f * h * 0.16 * sit : footX;
    capsule(ctx, hx, hipY, kneeX, kneeY, legW * 1.08, legW * 0.92, pants, far);
    capsule(ctx, kneeX, kneeY, fx, footY - lift - h * 0.02, legW * 0.92, legW * 0.78, pants, far);
    const sx = fx + (side ? f * h * 0.03 : 0);
    ctx.fillStyle = far ? lit(shoes, 0.8) : shoes; ctx.beginPath(); ctx.ellipse(sx, footY - lift - h * 0.015, h * (side ? 0.065 : 0.05), h * 0.03, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx - h * 0.04, footY - lift - h * 0.03, h * 0.05, h * 0.01);
  };
  if (!L.robe) {
    if (side) { const swing = walking ? Math.sin(phase) * h * 0.1 * gait : 0; drawLeg(x, x - swing * (1 - sit), 0, true); drawLeg(x, x + swing * (1 - sit), 0, false); }
    else for (const s of [-1, 1]) { const lift = walking ? Math.max(0, Math.sin(phase + (s > 0 ? Math.PI : 0))) * h * 0.045 * gait : 0; drawLeg(x + s * hipW * 0.3, x + s * hipW * 0.32 + s * crouchDrop * 0.3, lift, dir === 'back' ? s < 0 : s > 0); }
  }
  const arms = pose.arms, held = pose.held ? (o.props?.[pose.held] ?? pose.held) : null;
  const shL = [x - shoulderW * 0.46, shY + h * 0.04], shR = [x + shoulderW * 0.46, shY + h * 0.04];
  const handL = [x + arms[0][0], shY + arms[0][1]], handR = [x + arms[1][0], shY + arms[1][1]];
  const sleeve = toHex(L.sleeve ?? L.jacket ?? L.shirt), armW = h * 0.08;
  const drawArm = (sh, hd, far) => { const mx = (sh[0] + hd[0]) / 2 + (sh[0] < x ? -1 : 1) * h * 0.02, my = (sh[1] + hd[1]) / 2 + h * 0.01; capsule(ctx, sh[0], sh[1], mx, my, armW * 1.05, armW * 0.9, sleeve, far); capsule(ctx, mx, my, hd[0], hd[1], armW * 0.9, armW * 0.75, far ? lit(sleeve, 0.95) : sleeve, far); ctx.fillStyle = L.glove ? toHex(L.glove) : far ? lit(skin, 0.9) : skin; ctx.beginPath(); ctx.arc(hd[0], hd[1], h * 0.042, 0, TAU); ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = edge(skin); ctx.stroke(); };
  if (side) drawArm([x - f * h * 0.03, shL[1]], handL, true);
  if (dir === 'back') { drawArm(shL, handL, false); drawArm(shR, handR, false); }
  // Torso: a tapered, rounded body with light from the left; clothing layers over it.
  const hipLine = hipY + h * 0.05;
  const body = [[x - shoulderW / 2, shY + h * 0.03], [x - shoulderW / 2 + h * 0.025, shY - h * 0.005], [x + shoulderW / 2 - h * 0.025, shY - h * 0.005], [x + shoulderW / 2, shY + h * 0.03], [x + hipW / 2, hipLine], [x - hipW / 2, hipLine]];
  if (L.robe) body.splice(4, 2, [x + hipW * 0.75, y - h * 0.01], [x - hipW * 0.75, y - h * 0.01]);
  roundedShape(ctx, body, shadedFill(ctx, x - shoulderW / 2, x + shoulderW / 2, shirt), edge(shirt), h * 0.018);
  ctx.save(); ctx.beginPath(); body.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.clip();
  if (L.jacket && dir !== 'back') { const jc = toHex(L.jacket); ctx.fillStyle = shadedFill(ctx, x - shoulderW / 2, x + shoulderW / 2, jc); if (side) ctx.fillRect(x - shoulderW / 2, shY - h * 0.02, shoulderW * 0.75, hipLine - shY + h * 0.02); else { ctx.fillRect(x - shoulderW / 2, shY - h * 0.02, shoulderW * 0.36, hipLine - shY + 2); ctx.fillRect(x + shoulderW * 0.14, shY - h * 0.02, shoulderW * 0.36, hipLine - shY + 2); } }
  if (L.jacket && dir === 'back') { ctx.fillStyle = shadedFill(ctx, x - shoulderW / 2, x + shoulderW / 2, toHex(L.jacket)); ctx.fillRect(x - shoulderW, shY - h * 0.05, shoulderW * 2, hipLine - shY + h * 0.05); }
  if (L.vest) { ctx.fillStyle = toHex(L.vest); ctx.fillRect(x - shoulderW * 0.4, shY + h * 0.02, shoulderW * 0.8, hipLine - shY); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - shoulderW * 0.4, shY + h * 0.12, shoulderW * 0.8, h * 0.018); }
  if (L.overalls) { ctx.fillStyle = shadedFill(ctx, x - shoulderW / 2, x + shoulderW / 2, toHex(L.overalls)); ctx.fillRect(x - shoulderW * 0.36, shY + h * 0.1, shoulderW * 0.72, hipLine - shY); }
  if (L.tie && dir === 'front') { ctx.fillStyle = toHex(L.tie); ctx.beginPath(); ctx.moveTo(x - h * 0.018, shY + h * 0.01); ctx.lineTo(x + h * 0.018, shY + h * 0.01); ctx.lineTo(x + h * 0.022, shY + h * 0.14); ctx.lineTo(x, shY + h * 0.165); ctx.lineTo(x - h * 0.022, shY + h * 0.14); ctx.fill(); }
  if (L.belt) { ctx.fillStyle = toHex(L.belt); ctx.fillRect(x - shoulderW, hipLine - h * 0.035, shoulderW * 2, h * 0.03); }
  if (L.badge && dir === 'front') { ctx.fillStyle = toHex(L.badge); ctx.fillRect(x + shoulderW * 0.12, shY + h * 0.06, h * 0.045, h * 0.055); }
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x - shoulderW / 2, shY, shoulderW * 0.22, hipLine - shY); // rim of light
  ctx.restore();
  if (L.hoodie && dir !== 'front') { ctx.fillStyle = lit(shirt, 0.85); ctx.beginPath(); ctx.ellipse(x, shY + h * 0.005, shoulderW * 0.36, h * 0.035, 0, 0, TAU); ctx.fill(); }
  // Neck, head, near arms and props.
  ctx.fillStyle = lit(skin, 0.85); ctx.fillRect(x - h * 0.03, shY - h * 0.035, h * 0.06, h * 0.05);
  head(ctx, headX, headY, r, dir, L, T, { eyesClosed: state === 'offline', blink });
  const lw = Math.max(0.6, h * 0.025);
  if (side) { if (held) prop(ctx, held, handR[0], handR[1], h, L, T, lw); drawArm([x + f * h * 0.03, shR[1]], handR, false); }
  else if (dir === 'front') { if (held) prop(ctx, held, (handL[0] + handR[0]) / 2, Math.min(handL[1], handR[1]) + h * 0.04, h, L, T, lw); drawArm(shL, handL, false); drawArm(shR, handR, false); }
  else if (held && held !== 'cup' && held !== 'book') prop(ctx, held, handR[0] + h * 0.05, handR[1], h, L, T, lw);
  if (state === 'react') { const k = Math.min(1, t / 0.18), bx = headX + r * 1.1, by = headY - r * 2 - k * h * 0.05; ctx.fillStyle = '#2f7df6'; ctx.beginPath(); ctx.roundRect(bx - h * 0.06, by - h * 0.13, h * 0.12, h * 0.16, h * 0.04); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(bx - h * 0.012, by - h * 0.11, h * 0.024, h * 0.08); ctx.fillRect(bx - h * 0.012, by - h * 0.02, h * 0.024, h * 0.022); }
  ctx.restore();
  return { top: headY - r * (L.hat ? 1.9 : 1.3), headX, headY, r };
}
export { mix };
