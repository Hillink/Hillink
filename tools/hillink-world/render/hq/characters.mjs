// Code-drawn characters for the HQ look (Kyle 2026-10-02: draw the three agents in code for this visual proof).
// One small iso figure, anchored at its feet, drawn from a look (what it wears, chosen by the style) and the body clip
// the World's controller resolved (engine/iso-view.mjs; this file never decides what an agent does). Four facings
// (front, back, left, right), sitting and standing, and a pose per clip family:
//   idle / waiting / watch       weight shift, breathing, crossed arms or a foot tap
//   walk / carry                 stride and arm swing; a crate in both hands while carrying
//   type / work                  hands forward at a desk or bench
//   inspect / survey / measure / read / file   a tablet or scroll held up, head tilted to it
//   assemble / install / lift / dig / paint / pickup   a tool swing (hammer, spade, roller) from the look's tool
//   talk / meeting / chat / phone   hand gestures
//   celebrate / stretch          arms up;  blocked / frustrated   hand to the head;  offline   slumped, dimmed
const TAU = Math.PI * 2;
const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function shade(c, k) {
  const n = parseInt(c.slice(1, 7), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k <= 1) return `rgb(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0})`;
  const t = Math.min(1, k - 1); return `rgb(${(r + (255 - r) * t) | 0},${(g + (255 - g) * t) | 0},${(b + (255 - b) * t) | 0})`;
}
const BUILD = new Set(['assemble', 'install', 'lift', 'dig', 'paint', 'pickup']);
const HOLD = new Set(['inspect', 'survey', 'measure', 'read', 'file']);
const TALK = new Set(['talk', 'meeting', 'chat', 'phone']);
const WORK = new Set(['type', 'work']);

function capsule(ctx, x0, y0, x1, y1, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function rr(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }

// o: { x, y, h, dir, clip, t (s in clip), T (world s), moving, stride, posture, look, alpha, seed, carrying }
export function drawFigure(ctx, o) {
  const L = o.look, s = o.h, clip = o.clip ?? 'idle', T = o.T ?? 0, t = o.t ?? 0, seed = o.seed ?? 0;
  const dir = o.dir ?? 'front', side = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, back = dir === 'back';
  const sitting = o.posture === 'sit' || clip === 'sit' || ((WORK.has(clip) || clip === 'waiting' || clip === 'talk') && o.posture === 'sit');
  const walking = clip === 'walk' || ((clip === 'carry' || clip === 'file') && o.moving) || (o.moving && clip !== 'sit');
  const phase = (o.stride ?? T * 8) + seed;
  let sit = sitting ? 1 : 0;
  if (clip === 'sit') sit = ease(t / 0.48); if (clip === 'stand') sit = 1 - ease(t / 0.52);
  const offline = clip === 'offline';
  ctx.save(); if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const x = o.x, y = o.y;
  // Proportions (stylised: a big head and short legs, like the World's reference person).
  const legL = s * 0.27 * (L.legs ?? 1) * (1 - sit * 0.45), hipY = y - legL - s * 0.02, torsoH = s * 0.29, shoulderY = hipY - torsoH, headR = s * 0.155;
  let bob = walking ? -Math.abs(Math.sin(phase)) * s * 0.03 : Math.sin(T * 1.6 + seed) * s * 0.006;
  if (clip === 'celebrate') bob -= Math.max(0, Math.sin(t * 7)) * s * 0.06;
  if (offline) bob += s * 0.02;
  const hy = hipY + bob, sy = shoulderY + bob, headY = sy - headR * 0.92 + (offline ? headR * 0.25 : 0);
  const bw = s * 0.25 * (L.girth ?? 1), cx = x + side * s * 0.02;
  const skin = L.skin, top = L.top, top2 = L.top2 ?? L.top, bottom = L.bottom, shoe = L.shoes ?? '#2a2a30';
  // Legs.
  const legW = s * 0.085, swing = walking ? Math.sin(phase) * s * 0.07 : 0;
  if (sit > 0.5) {
    const kx = side ? side * s * 0.12 : 0, ky = hy + s * 0.02;
    for (const k of [-1, 1]) { capsule(ctx, cx + k * bw * 0.22, hy, cx + k * bw * 0.22 + kx, ky + s * 0.04, legW, bottom); capsule(ctx, cx + k * bw * 0.22 + kx, ky + s * 0.04, cx + k * bw * 0.22 + kx * 1.1, y - s * 0.01, legW * 0.9, bottom); rr(ctx, cx + k * bw * 0.22 + kx * 1.1 - legW * 0.6, y - s * 0.03, legW * 1.3, s * 0.035, 2, shoe); }
  } else {
    for (const k of [-1, 1]) {
      const lx = cx + (side ? 0 : k * bw * 0.22) + (side ? k * swing * 0.9 * side : 0), fy = y - (walking ? Math.max(0, Math.sin(phase + (k > 0 ? 0 : Math.PI))) * s * 0.03 : 0);
      const fx = lx + (side ? 0 : 0) + (!side && walking ? k * 0 : 0);
      capsule(ctx, cx + (side ? 0 : k * bw * 0.22), hy, fx, fy - s * 0.03, legW, k > 0 ? bottom : shade(bottom, 0.85));
      rr(ctx, fx - legW * 0.65 + side * legW * 0.3, fy - s * 0.045, legW * 1.3 + Math.abs(side) * legW * 0.4, s * 0.04, 2, shoe);
    }
  }
  // Arm targets by clip.
  let armL = null, armR = null; // [dx, dy] from the shoulder, in units of s
  const hammer = (clip === 'assemble' || clip === 'install') ? Math.sin(t * 9) : 0;
  if (walking && !o.carrying) { armL = [-0.05 - Math.sin(phase) * 0.06 * (side || 1), 0.22]; armR = [0.05 + Math.sin(phase) * 0.06 * (side || 1), 0.22]; }
  else if (o.carrying || clip === 'carry') { armL = [-0.03, 0.14]; armR = [0.03, 0.14]; }
  else if (WORK.has(clip)) { const k = Math.sin(T * 14 + seed) * 0.012; armL = [-0.08, 0.12 + k]; armR = [0.08, 0.12 - k]; }
  else if (HOLD.has(clip)) { armL = [-0.05, 0.12]; armR = [0.06, 0.1]; }
  else if (BUILD.has(clip)) { armL = [-0.07, 0.16]; armR = clip === 'dig' ? [0.05, 0.2 + Math.sin(t * 5) * 0.03] : [0.12, -0.02 + hammer * 0.12]; }
  else if (TALK.has(clip)) { const g = Math.sin(T * 4 + seed); armL = [-0.1, 0.18]; armR = [0.12 + g * 0.03, 0.08 + g * 0.04]; if (clip === 'phone') armR = [0.06, -0.08]; }
  else if (clip === 'celebrate' || clip === 'stretch') { armL = [-0.12, -0.18]; armR = [0.12, -0.18]; }
  else if (clip === 'frustrated' || clip === 'blocked') { armL = [-0.1, 0.2]; armR = [0.04, -0.12]; }
  else if (clip === 'waiting' || clip === 'watch') { armL = [0.05, 0.12]; armR = [-0.05, 0.13]; }
  else if (offline) { armL = [-0.07, 0.24]; armR = [0.07, 0.24]; }
  else { const b = Math.sin(T * 1.6 + seed) * 0.01; armL = [-0.08, 0.24 + b]; armR = [0.08, 0.24 - b]; }
  const armW = s * 0.07, shL = [cx - bw * 0.5, sy + s * 0.04], shR = [cx + bw * 0.5, sy + s * 0.04];
  const handOf = (sh, a) => [sh[0] + a[0] * s * (side ? 0.6 : 1) + side * s * 0.04, sh[1] + a[1] * s];
  const hL = handOf(shL, armL), hR = handOf(shR, armR);
  const drawArm = (sh, hand, far) => { capsule(ctx, sh[0], sh[1], hand[0], hand[1], armW, far ? shade(top2, 0.8) : top2); ctx.fillStyle = far ? shade(skin, 0.85) : skin; ctx.beginPath(); ctx.arc(hand[0], hand[1], armW * 0.55, 0, TAU); ctx.fill(); };
  // The far arm goes behind the body when seen from the side or the back.
  const farArm = side > 0 ? 'L' : side < 0 ? 'R' : null;
  if (farArm === 'L' || back) drawArm(shL, hL, true);
  if (farArm === 'R' || back) drawArm(shR, hR, true);
  // Cape (behind the torso).
  if (L.cape) { ctx.fillStyle = back ? L.cape : shade(L.cape, 0.75); ctx.beginPath(); ctx.moveTo(cx - bw * 0.62, sy + s * 0.02); ctx.lineTo(cx + bw * 0.62, sy + s * 0.02); ctx.lineTo(cx + bw * 0.78 + Math.sin(T * 2 + seed) * s * 0.01, hy + s * 0.12); ctx.lineTo(cx - bw * 0.78, hy + s * 0.12); ctx.closePath(); ctx.fill(); }
  // Torso.
  const tw = bw * (side ? 0.8 : 1);
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(cx - tw * 0.5, sy + s * 0.01); ctx.quadraticCurveTo(cx, sy - s * 0.02, cx + tw * 0.5, sy + s * 0.01); ctx.lineTo(cx + tw * 0.46, hy); ctx.quadraticCurveTo(cx, hy + s * 0.02, cx - tw * 0.46, hy); ctx.closePath(); ctx.fill();
  // Torso shading (the right side away from the light).
  ctx.fillStyle = 'rgba(0,0,20,0.14)'; ctx.beginPath(); ctx.moveTo(cx + tw * 0.12, sy); ctx.lineTo(cx + tw * 0.5, sy + s * 0.01); ctx.lineTo(cx + tw * 0.46, hy); ctx.lineTo(cx + tw * 0.12, hy); ctx.closePath(); ctx.fill();
  if (!back) {
    if (L.jacketOpen) { ctx.fillStyle = L.shirt ?? '#f2f2f2'; ctx.beginPath(); ctx.moveTo(cx - tw * 0.12 + side * tw * 0.2, sy + s * 0.01); ctx.lineTo(cx + tw * 0.12 + side * tw * 0.2, sy + s * 0.01); ctx.lineTo(cx + side * tw * 0.2, sy + torsoH * 0.62); ctx.closePath(); ctx.fill(); }
    if (L.tie) { ctx.fillStyle = L.tie; ctx.beginPath(); ctx.moveTo(cx - s * 0.012 + side * tw * 0.2, sy + s * 0.015); ctx.lineTo(cx + s * 0.012 + side * tw * 0.2, sy + s * 0.015); ctx.lineTo(cx + s * 0.016 + side * tw * 0.2, sy + torsoH * 0.55); ctx.lineTo(cx + side * tw * 0.2, sy + torsoH * 0.66); ctx.lineTo(cx - s * 0.016 + side * tw * 0.2, sy + torsoH * 0.55); ctx.closePath(); ctx.fill(); }
    if (L.vest) { ctx.fillStyle = L.vest; ctx.fillRect(cx - tw * 0.46, sy + torsoH * 0.18, tw * 0.92, torsoH * 0.62); ctx.fillStyle = L.vestStripe ?? '#e6f0f0'; ctx.fillRect(cx - tw * 0.46, sy + torsoH * 0.52, tw * 0.92, torsoH * 0.09); }
    if (L.apron) { ctx.fillStyle = L.apron; ctx.beginPath(); ctx.moveTo(cx - tw * 0.32, sy + torsoH * 0.25); ctx.lineTo(cx + tw * 0.32, sy + torsoH * 0.25); ctx.lineTo(cx + tw * 0.4, hy + s * 0.08); ctx.lineTo(cx - tw * 0.4, hy + s * 0.08); ctx.closePath(); ctx.fill(); }
    if (L.sash) { ctx.strokeStyle = L.sash; ctx.lineWidth = s * 0.035; ctx.beginPath(); ctx.moveTo(cx - tw * 0.45, sy + s * 0.01); ctx.lineTo(cx + tw * 0.42, hy - s * 0.01); ctx.stroke(); }
    if (L.chestLight) { ctx.fillStyle = L.chestLight; ctx.beginPath(); ctx.arc(cx + side * tw * 0.15, sy + torsoH * 0.35, s * 0.018, 0, TAU); ctx.fill(); }
  }
  if (L.belt) { ctx.fillStyle = L.belt; ctx.fillRect(cx - tw * 0.47, hy - s * 0.035, tw * 0.94, s * 0.03); if (L.buckle) { ctx.fillStyle = L.buckle; ctx.fillRect(cx - s * 0.012 + side * tw * 0.2, hy - s * 0.037, s * 0.024, s * 0.034); } }
  // Near arms.
  if (!back) { if (farArm !== 'L') drawArm(shL, hL, false); if (farArm !== 'R') drawArm(shR, hR, false); }
  // Held things.
  const hand = side < 0 ? hL : hR;
  if (o.carrying || clip === 'carry') { const c = L.carryColor ?? '#c8a26a'; rr(ctx, cx - s * 0.11, (hL[1] + hR[1]) / 2 - s * 0.07, s * 0.22, s * 0.11, 2, c); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.strokeRect(cx - s * 0.11, (hL[1] + hR[1]) / 2 - s * 0.07, s * 0.22, s * 0.11); }
  else if (HOLD.has(clip)) { const it = L.holdItem ?? 'tablet'; ctx.save(); ctx.translate(hand[0] - side * s * 0.03, hand[1] - s * 0.05); ctx.rotate(-0.2 + side * 0.15); if (it === 'scroll') { rr(ctx, -s * 0.06, -s * 0.05, s * 0.12, s * 0.1, 1.5, '#efe2bf'); ctx.fillStyle = '#b08a52'; ctx.fillRect(-s * 0.07, -s * 0.055, s * 0.14, s * 0.018); ctx.fillRect(-s * 0.07, s * 0.04, s * 0.14, s * 0.018); } else if (it === 'lens') { ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = s * 0.016; ctx.beginPath(); ctx.arc(0, 0, s * 0.045, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(180,230,255,0.5)'; ctx.fill(); } else { rr(ctx, -s * 0.055, -s * 0.07, s * 0.11, s * 0.13, 2, '#20262e'); ctx.fillStyle = L.screen ?? '#7fd3ff'; ctx.fillRect(-s * 0.042, -s * 0.058, s * 0.084, s * 0.1); } ctx.restore(); }
  else if (BUILD.has(clip) && clip !== 'pickup') { const tool = clip === 'dig' ? 'spade' : clip === 'paint' ? 'roller' : L.tool ?? 'hammer'; ctx.save(); ctx.translate(hR[0], hR[1]); ctx.rotate(clip === 'dig' ? 0.3 : -1.1 - hammer * 0.7); if (tool === 'spade') { capsule(ctx, 0, -s * 0.2, 0, s * 0.1, s * 0.02, '#8a6a42'); ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.moveTo(-s * 0.04, s * 0.1); ctx.lineTo(s * 0.04, s * 0.1); ctx.lineTo(0, s * 0.18); ctx.closePath(); ctx.fill(); } else if (tool === 'roller') { capsule(ctx, 0, 0, 0, -s * 0.16, s * 0.018, '#555'); rr(ctx, -s * 0.06, -s * 0.2, s * 0.12, s * 0.04, 2, '#f2efe6'); } else if (tool === 'staff') { capsule(ctx, 0, s * 0.06, 0, -s * 0.22, s * 0.022, '#6b4a2e'); ctx.fillStyle = L.accent ?? '#7ff'; ctx.beginPath(); ctx.arc(0, -s * 0.24, s * 0.03, 0, TAU); ctx.fill(); } else { capsule(ctx, 0, 0, 0, -s * 0.16, s * 0.022, tool === 'mallet' ? '#7a5532' : '#3b3f46'); rr(ctx, -s * 0.05, -s * 0.2, s * 0.1, s * 0.05, 1.5, tool === 'mallet' ? '#9b7044' : '#6b7480'); } ctx.restore(); }
  // Neck and head.
  ctx.fillStyle = shade(skin, 0.86); ctx.fillRect(cx - s * 0.025, sy - s * 0.03, s * 0.05, s * 0.04);
  const hx = cx + side * s * 0.015 + (clip === 'frustrated' ? Math.sin(T * 3) * s * 0.005 : 0);
  // Hair behind the head (long hair, or the back of the head).
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, headY, headR, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,30,0.10)'; ctx.beginPath(); ctx.arc(hx + headR * 0.25, headY + headR * 0.1, headR * 0.92, -0.9, 1.9); ctx.fill();
  if (L.cyborg && !back) { ctx.fillStyle = L.cyborg; ctx.beginPath(); ctx.arc(hx, headY, headR, side < 0 ? -Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI / 2, side < 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx + headR * 0.2, headY - headR * 0.6); ctx.lineTo(hx + headR * 0.7, headY - headR * 0.2); ctx.stroke(); }
  // Hair.
  const hair = L.hair;
  if (hair && L.hairStyle !== 'bald') {
    ctx.fillStyle = hair; ctx.beginPath();
    if (back) ctx.arc(hx, headY, headR * 1.02, 0, TAU);
    else { ctx.arc(hx, headY - headR * 0.08, headR * 1.04, Math.PI * 1.02, Math.PI * 1.98); if (L.hairStyle === 'long') { ctx.lineTo(hx + headR * 1.05, headY + headR * 0.9); ctx.lineTo(hx + headR * 0.7, headY + headR * 0.9); ctx.lineTo(hx + headR * 0.75, headY); ctx.lineTo(hx - headR * 0.75, headY); ctx.lineTo(hx - headR * 0.7, headY + headR * 0.9); ctx.lineTo(hx - headR * 1.05, headY + headR * 0.9); } }
    ctx.closePath(); ctx.fill();
    if (!back && L.hairStyle === 'swept') { ctx.beginPath(); ctx.moveTo(hx - headR * 0.9, headY - headR * 0.35); ctx.quadraticCurveTo(hx - headR * 0.2, headY - headR * 0.75, hx + headR * 0.6, headY - headR * 0.45); ctx.lineTo(hx + headR * 0.2, headY - headR * 0.85); ctx.closePath(); ctx.fill(); }
  }
  // Face.
  if (!back) {
    const ex = hx + side * headR * 0.35, ey = headY + headR * 0.08, gap = side ? headR * 0.28 : headR * 0.36;
    const blink = Math.sin(T * 0.9 + seed * 3) > 0.985 || offline;
    for (const k of side ? [side > 0 ? 1 : -1] : [-1, 1]) {
      const px = ex + k * gap * (side ? 0.6 : 0.5) - (side ? side * headR * 0.1 : 0);
      if (L.eyeRed && (k > 0 || side > 0)) { ctx.fillStyle = L.eyeRed; ctx.beginPath(); ctx.arc(px, ey, headR * 0.15, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,60,40,0.35)'; ctx.beginPath(); ctx.arc(px, ey, headR * 0.32, 0, TAU); ctx.fill(); continue; }
      ctx.fillStyle = '#1d1f26'; if (blink) ctx.fillRect(px - headR * 0.12, ey, headR * 0.24, headR * 0.06); else { ctx.beginPath(); ctx.ellipse(px, ey, headR * 0.09, headR * 0.12, 0, 0, TAU); ctx.fill(); }
    }
    if (L.glasses) { ctx.strokeStyle = L.glasses; ctx.lineWidth = s * 0.012; for (const k of side ? [side] : [-1, 1]) { ctx.beginPath(); ctx.arc(ex + k * gap * (side ? 0.6 : 0.5) - (side ? side * headR * 0.1 : 0), ey, headR * 0.2, 0, TAU); ctx.stroke(); } if (!side) { ctx.beginPath(); ctx.moveTo(ex - gap * 0.3, ey); ctx.lineTo(ex + gap * 0.3, ey); ctx.stroke(); } }
    if (!L.beard) { ctx.strokeStyle = 'rgba(80,40,30,0.7)'; ctx.lineWidth = s * 0.01; ctx.beginPath(); const my = headY + headR * 0.5; if (clip === 'celebrate') ctx.arc(ex, my - headR * 0.08, headR * 0.16, 0.2, Math.PI - 0.2); else if (clip === 'frustrated' || clip === 'blocked') { ctx.moveTo(ex - headR * 0.14, my + headR * 0.05); ctx.quadraticCurveTo(ex, my - headR * 0.06, ex + headR * 0.14, my + headR * 0.05); } else { ctx.moveTo(ex - headR * 0.1, my); ctx.lineTo(ex + headR * 0.1, my); } ctx.stroke(); }
    if (L.cheeks) { ctx.fillStyle = 'rgba(255,120,120,0.25)'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + k * headR * 0.45, headY + headR * 0.35, headR * 0.12, 0, TAU); ctx.fill(); } }
  }
  if (L.beard) { ctx.fillStyle = L.beard; ctx.beginPath(); const bx = hx + side * headR * 0.2; ctx.moveTo(bx - headR * 0.85, headY + headR * 0.15); ctx.quadraticCurveTo(bx - headR * 0.7, headY + headR * 1.5, bx, headY + headR * 1.75); ctx.quadraticCurveTo(bx + headR * 0.7, headY + headR * 1.5, bx + headR * 0.85, headY + headR * 0.15); ctx.quadraticCurveTo(bx, headY + headR * 0.55, bx - headR * 0.85, headY + headR * 0.15); ctx.fill(); if (!back) { ctx.fillStyle = shade(L.beard, 1.2); ctx.beginPath(); ctx.ellipse(bx, headY + headR * 0.5, headR * 0.3, headR * 0.1, 0, 0, TAU); ctx.fill(); } }
  // Headwear.
  const hat = L.hat;
  if (hat === 'hardhat') { ctx.fillStyle = L.hatColor ?? '#f2b630'; ctx.beginPath(); ctx.arc(hx, headY - headR * 0.18, headR * 1.05, Math.PI, 0); ctx.fill(); ctx.fillRect(hx - headR * 1.25, headY - headR * 0.22, headR * 2.5, headR * 0.2); ctx.fillStyle = shade(L.hatColor ?? '#f2b630', 1.25); ctx.fillRect(hx - headR * 0.12, headY - headR * 1.2, headR * 0.24, headR * 1.0); }
  else if (hat === 'crown') { const c = L.hatColor ?? '#e8b832'; ctx.fillStyle = c; ctx.beginPath(); const by = headY - headR * 0.75; ctx.moveTo(hx - headR * 0.75, by); for (let i = 0; i <= 4; i++) { const px = hx - headR * 0.75 + i * headR * 0.375; ctx.lineTo(px, by - (i % 2 ? headR * 0.35 : headR * 0.7)); } ctx.lineTo(hx + headR * 0.75, by + headR * 0.22); ctx.lineTo(hx - headR * 0.75, by + headR * 0.22); ctx.closePath(); ctx.fill(); ctx.fillStyle = L.gem ?? '#2fbf71'; ctx.beginPath(); ctx.arc(hx, by, headR * 0.12, 0, TAU); ctx.fill(); }
  else if (hat === 'leathercap') { ctx.fillStyle = L.hatColor ?? '#7a4e2c'; ctx.beginPath(); ctx.arc(hx, headY - headR * 0.15, headR * 1.03, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(hx + headR * 1.1, headY - headR * 0.05); ctx.lineTo(hx - headR * 1.1, headY - headR * 0.05); ctx.closePath(); ctx.fill(); ctx.strokeStyle = shade(L.hatColor ?? '#7a4e2c', 0.7); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx, headY - headR * 1.15); ctx.lineTo(hx, headY - headR * 0.1); ctx.stroke(); if (L.goggles) { ctx.fillStyle = L.goggles; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + k * headR * 0.38, headY - headR * 0.42, headR * 0.2, 0, TAU); ctx.fill(); } } }
  else if (hat === 'hood') { ctx.fillStyle = L.hatColor ?? '#3a3f5a'; ctx.beginPath(); ctx.arc(hx, headY - headR * 0.05, headR * 1.12, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill(); }
  else if (hat === 'cap') { ctx.fillStyle = L.hatColor ?? '#2f3a4a'; ctx.beginPath(); ctx.arc(hx, headY - headR * 0.2, headR * 1.0, Math.PI, 0); ctx.fill(); ctx.fillRect(hx + (side || 1) * headR * 0.2, headY - headR * 0.25, (side || 1) * headR * 0.9, headR * 0.16); }
  if (L.headset && !back) { ctx.strokeStyle = '#30353d'; ctx.lineWidth = s * 0.014; ctx.beginPath(); ctx.arc(hx, headY - headR * 0.1, headR * 1.08, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.fillStyle = '#30353d'; ctx.beginPath(); ctx.arc(hx - headR * 0.98, headY + headR * 0.05, headR * 0.2, 0, TAU); ctx.fill(); }
  if (offline) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(60,70,90,0.35)'; ctx.fillRect(x - s * 0.4, y - s * 1.1, s * 0.8, s * 1.1); }
  ctx.restore();
  return { top: headY - headR * (hat === 'crown' ? 1.6 : 1.3), head: [hx, headY] };
}
