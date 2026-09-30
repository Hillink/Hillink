// Pass 5H: the unified character renderer for Real and Fantasy. Same interface as render/figure.mjs drawFigure(ctx, o)
// (feet at (x, y), height h, the controller's clip, blend, props and look), so the 5C animation intents, rigs,
// sitting, walking and every skin drive it unchanged. What is new:
//   - compact game proportions (render/art/tokens.mjs PROPORTIONS): a ~1/3-height head, short blocky torso, short
//     separated legs, small arms, one outline weight and one grounding shadow for everyone;
//   - five authored views (front, three-quarter front, side, three-quarter back, back), mirrored for the left, chosen
//     from the character's smoothed heading;
//   - hair, headwear, face features, garments and body parts are sprite DATA (render/art/parts.mjs) selected by the
//     look and by named parts, so a new agent is dressed by its definition and never by code keyed to its id.
import { AGENT } from '../../world/scale.mjs';
import { poseFor, prop } from '../figure.mjs';
import { PROPORTIONS as PR, OUTLINE, SHADOW } from './tokens.mjs';
import { drawShapes, shade, toHex } from './sprites.mjs';
import { HAIR, HEADWEAR, HEAD_ACCESSORIES, FACE, HEAD_BACK, GARMENTS, BODY, PART_NAMES } from './parts.mjs';

const TAU = Math.PI * 2;
const HIP = AGENT.hip / AGENT.height, SEAT = AGENT.seat / AGENT.height;
const ease = p => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const wave = (T, rate, seed = 0) => Math.sin(T * rate + seed);
const mixN = (a, b, k) => a + (b - a) * k;

// The view for a heading (screen radians; +y is toward the viewer) or, without one, a four-way facing.
export function viewOf(heading, dir = 'front') {
  if (typeof heading === 'number' && Number.isFinite(heading)) {
    const dx = Math.cos(heading), dy = Math.sin(heading), m = dx < -1e-6 ? -1 : 1, e = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    return { view: e > 67.5 ? 'front' : e > 22.5 ? 'fdiag' : e > -22.5 ? 'side' : e > -67.5 ? 'bdiag' : 'back', m };
  }
  if (dir === 'left') return { view: 'side', m: -1 };
  if (dir === 'right') return { view: 'side', m: 1 };
  return { view: dir === 'back' ? 'back' : 'front', m: 1 };
}
// Which authored variant a view uses for head and torso sprites.
const HEAD_VIEW = { front: 'front', fdiag: 'side', side: 'side', bdiag: 'back', back: 'back' };
const FACE_X = { front: 0, fdiag: 0.34, side: 0.58 };
const pick = (part, view) => part?.[HEAD_VIEW[view]] ?? (view === 'fdiag' ? part?.front : null) ?? null;

// Named parts a definition may select (validated against the registries; anything else is dropped).
export function characterParts(resolved = {}, extra = []) {
  const names = new Set([...(resolved.effects ?? []), ...(resolved.equipment ?? []), ...(resolved.accessories ?? []), ...(resolved.clothing ?? []), ...extra].map(String));
  const style = typeof resolved?.hair?.style === 'string' && PART_NAMES.hair.includes(resolved.hair.style) ? resolved.hair.style : null;
  const known = new Set([...PART_NAMES.face, ...PART_NAMES.headBack, ...PART_NAMES.garment, ...PART_NAMES.body, ...PART_NAMES.headAccessory]);
  return { hair: style, overlays: [...names].filter(n => known.has(n)).sort() };
}

// Palette slots for the part sprites, from the look.
function paletteOf(L) {
  const hair = toHex(L.hair) ?? '#3b2a20';
  return {
    skin: toHex(L.skin) ?? '#f0c49b', hair, beard: toHex(L.beard) ?? hair, hat: toHex(L.hatColor) ?? toHex(L.hat === 'crown' ? '#f2c94c' : L.hat === 'hardhat' ? '#f2b01e' : L.hat === 'hood' ? L.shirt : '#9aa6b4') ?? '#9aa6b4',
    shirt: toHex(L.shirt) ?? '#5b6b82', sleeve: toHex(L.sleeve) ?? toHex(L.shirt) ?? '#5b6b82', pants: toHex(L.pants) ?? '#2c3340', jacket: toHex(L.jacket) ?? '#2a2f3a', vest: toHex(L.vest) ?? '#f2b01e',
    tie: toHex(L.tie) ?? '#7c4dff', belt: toHex(L.belt) ?? '#3a2a1c', buckle: '#d9b44a', cape: toHex(L.cape) ?? '#8e2a2a', overalls: toHex(L.overalls) ?? '#2f8f6b', badge: toHex(L.badge) ?? '#e8f1ff',
    metal: toHex(L.metal) ?? '#a9b8cc', glove: toHex(L.glove) ?? toHex(L.skin) ?? '#f0c49b', glow: toHex(L.visor) ?? toHex(L.screen) ?? '#5ee1ff', accent: toHex(L.accent) ?? '#ff7a1a', horn: '#efe6cf', wing: '#fbf3ff', apron: '#6b4a2b',
    shoes: toHex(L.shoes) ?? '#2a2226', fallback: '#888888',
  };
}

// Draw sprite shapes in a local frame: origin (ox, oy), scale k (units -> px), mirrored when m < 0.
function stamp(ctx, shapes, pal, ox, oy, k, m, lw, time, wk = 1) {
  if (!shapes?.length) return;
  ctx.save(); ctx.translate(ox, oy); ctx.scale(k * wk * (m < 0 ? -1 : 1), k);
  drawShapes(ctx, shapes, pal, { lw: lw / k, time });
  ctx.restore();
}
function capsule(ctx, x0, y0, x1, y1, w, color, lw) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w + lw * 2; ctx.strokeStyle = OUTLINE.ink; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
}
function block(ctx, x, y, w, h, r, fill, lw, shadeSide = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  // Colour-blocked light: a flat shade band on the side away from the light (upper left).
  ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(20,12,30,0.16)';
  if (shadeSide > 0) ctx.fillRect(x + w * 0.68, y, w * 0.4, h); else ctx.fillRect(x - w * 0.08, y, w * 0.3, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, h * 0.12);
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE.ink; ctx.lineJoin = 'round'; ctx.stroke();
}

export function drawCharacter(ctx, o) {
  const { x, y, look = {}, time: T = 0, stride = 0, use } = o;
  const L = { skin: '#f0c49b', hair: '#3b2a20', shirt: '#5b6b82', pants: '#2c3340', shoes: '#2a2226', ...look };
  // Proportions from data are clamped: appearance metadata can reshape a character only within the art bible's range.
  const clampN = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  L.scale = clampN(L.scale, 0.6, 1.5, 1); L.wide = clampN(L.wide, 0.6, 1.6, 1); L.headScale = clampN(L.headScale, 0.75, 1.35, 1);
  const pal = paletteOf(L), parts = o.parts ?? { hair: null, overlays: [] }, over = new Set(parts.overlays ?? []);
  for (const k of ['armor', 'core']) if (L[k === 'core' ? 'core' : 'armor']) over.add(k);
  const s = o.h * (L.scale ?? 1), t = o.t ?? 0, state = o.state ?? 'idle';
  const lw = Math.max(OUTLINE.min, Math.min(OUTLINE.max, s * OUTLINE.weight));
  const { view, m } = viewOf(o.heading, o.dir ?? 'front');
  const profile = view === 'side' || view === 'fdiag' || view === 'bdiag', backish = view === 'back' || view === 'bdiag';
  // Sitting 0..1, walking, gait: as in the 5C figure, so every controller clip keeps its timing.
  let sit = o.posture === 'sit' ? 1 : 0;
  if (state === 'sit') sit = ease(t / AGENT.sitSeconds);
  if (state === 'stand') sit = 1 - ease(t / AGENT.standSeconds);
  const walking = state === 'walk' || (state === 'carry' && o.moving);
  const gait = walking ? Math.max(0.25, Math.min(1, o.gait ?? 1)) : 0;
  const phase = walking ? (stride / (s * 0.42)) * Math.PI : 0;
  const legLen = s * HIP, torsoH = s * PR.torso, r = s * PR.head * (L.headScale ?? 1), seatY = y - s * SEAT;
  const sw = walking ? Math.sin(phase) * s * 0.1 * gait : 0;
  // The clip's pose from poseFor (hands relative to the shoulders), authored for the right-facing view when in profile.
  const pdir = profile ? 'right' : view;
  const PP = { h: s * 0.9, T, t, x, dir: pdir, side: profile, f: profile ? 1 : 0, reach: profile ? 1 : 0, sw, use, sit, g: gait };
  let pose = poseFor(state, PP);
  const blend = o.prev && o.prev !== state ? Math.max(0, Math.min(1, o.blend ?? 1)) : 1;
  if (blend < 1) {
    const from = poseFor(o.prev, { ...PP, t: t + 1 });
    pose = { arms: pose.arms.map((hand, i) => [mixN(from.arms[i][0], hand[0], blend), mixN(from.arms[i][1], hand[1], blend)]), held: blend > 0.5 ? pose.held : from.held, crouch: mixN(from.crouch, pose.crouch, blend), lean: mixN(from.lean, pose.lean, blend) };
  }
  let bob = walking ? -Math.abs(Math.sin(phase)) * s * 0.035 * gait : wave(T, 2.2, x) * s * 0.006;
  if (state === 'celebrate') bob -= Math.max(0, Math.sin(t * 7)) * s * 0.07 * Math.max(0, 1 - t / 2.6);
  if (state === 'react') bob -= Math.sin(Math.min(1, t / 0.25) * Math.PI) * s * 0.05;
  if (state === 'offline') bob += s * 0.015;
  const crouchDrop = pose.crouch * legLen * 0.42 * (1 - sit);
  const hipY = (y - legLen) * (1 - sit) + seatY * sit + bob + crouchDrop;
  const wide = L.wide ?? 1, tw = s * (view === 'front' || view === 'back' ? PR.torsoWidth.front * wide : profile && view !== 'side' ? PR.torsoWidth.diag * (0.6 + 0.4 * wide) : PR.torsoWidth.side * (0.7 + 0.3 * wide));
  const shY = hipY - torsoH + pose.lean;
  let headX = x, headY = shY - r * PR.neckOverlap;
  if (state === 'offline') { headY += r * 0.3; headX += m * r * 0.2; }
  if (state === 'type') headY += Math.abs(wave(T, 9)) * s * 0.005;
  if (state === 'idle' && Math.sin(T * 0.37 + x) > 0.93) headX += m * r * 0.1;
  const blink = (T * 0.31 + x * 0.013) % 1 < 0.035;
  const ox = profile ? m : 1; // x-mirror for authored-right sprites

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  // Grounding: a contact shadow and a soft cast shadow toward the lower right.
  ctx.fillStyle = SHADOW.cast; ctx.beginPath(); ctx.ellipse(x + s * SHADOW.castOffset[0], y + s * SHADOW.castOffset[1], s * 0.3, s * 0.06, -0.12, 0, TAU); ctx.fill();
  ctx.fillStyle = SHADOW.contact; ctx.beginPath(); ctx.ellipse(x, y + 0.5, s * SHADOW.contactSize[0] * (0.7 + 0.3 * wide), s * SHADOW.contactSize[1], 0, 0, TAU); ctx.fill();

  const bodyPart = (name, layer) => { const p = BODY[name]?.[layer]; if (!p) return; let shapes = pick(p, view) ?? p.front; if (!shapes) return; const flap = p.flap && !o.reduced ? Math.sin(T * 9) * 0.25 : 0; ctx.save(); ctx.translate(x, shY); if (flap) { ctx.scale(1 + flap * 0.4, 1 - flap * 0.2); } stamp(ctx, shapes, pal, 0, 0, s, ox, lw, T); ctx.restore(); };
  const behind = [...over].filter(n => BODY[n]?.behind);
  // Behind the body (a cape, wings, a bow or hammer on the back); seen from behind they cover the body instead.
  if (!backish) for (const n of behind) bodyPart(n, 'behind');
  else if (over.has('regal-glow')) bodyPart('regal-glow', 'behind');
  // Long hair and hoods hang behind the shoulders when seen from the front.
  const hairStyle = L.bald ? 'bald' : parts.hair ?? (L.beardLong ? 'shaggy' : 'short');
  const hairDef = L.hat === 'hood' ? null : HAIR[hairStyle] ?? HAIR.short;
  const headBack = () => {
    if (hairDef?.back) stamp(ctx, pick(hairDef.back, view), pal, headX, headY, r, ox, lw, T, PR.headWidth);
    if (L.hat === 'hood') stamp(ctx, pick(HEADWEAR.hood.back, view), pal, headX, headY, r, ox, lw, T, PR.headWidth);
    for (const n of Object.keys(HEAD_BACK)) if (over.has(n)) stamp(ctx, pick(HEAD_BACK[n], view), pal, headX, headY, r, ox, lw, T, PR.headWidth);
  };
  if (!backish) headBack();

  // Arms and legs.
  const arms = pose.arms.map(([dx, dy]) => [dx, dy]);
  const aw = s * PR.arm.width, hand = s * PR.hand, held = pose.held ? (o.props?.[pose.held] ?? pose.held) : null;
  const sleeve = pal.sleeve, sleeveNear = L.metalArm ? pal.metal : sleeve;
  const shL = [x - tw * 0.46, shY + s * 0.04], shR = [x + tw * 0.46, shY + s * 0.04];
  // In profile a front-view 'hanging' hand (far out to the side) would read as reaching forward: hang it at the hip.
  const hangs = i => profile && arms[i][1] >= s * 0.15 && Math.abs(arms[i][0]) >= s * 0.13;
  const handAt = i => [x + (hangs(i) ? (i ? 0.035 : -0.035) * s : arms[i][0]) * (profile ? m : 1), shY + arms[i][1]];
  const arm = (sh, hd, c, glove) => { capsule(ctx, sh[0], sh[1], hd[0], hd[1], aw, c, lw); ctx.beginPath(); ctx.arc(hd[0], hd[1], hand, 0, TAU); ctx.fillStyle = glove; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); };
  if (profile) arm([x - m * s * 0.03, shY + s * 0.04], handAt(0), shade(sleeve, 0.78), shade(pal.glove, 0.85));
  if (backish && !profile) { arm(shL, handAt(0), sleeve, pal.glove); arm(shR, handAt(1), sleeveNear, L.metalArm ? pal.metal : pal.glove); }

  const legW = s * PR.leg.width, footW = s * PR.foot.w, footH = s * PR.foot.h;
  const shoe = (fx, fy, dirx) => { ctx.beginPath(); ctx.roundRect(fx - footW / 2 + dirx * s * 0.02, fy - footH, footW, footH, footH * 0.45); ctx.fillStyle = pal.shoes; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); };
  if (!L.robe) {
    if (profile) {
      const swing = walking ? Math.sin(phase) * s * 0.09 * gait : 0, tap = state === 'waiting' && sit < 0.5 ? Math.max(0, Math.sin(T * 7)) * s * 0.025 : 0;
      const spread = view === 'side' ? 0 : s * 0.035;
      for (const [k, sg] of [[0, -1], [1, 1]]) {
        const lx = x + sg * spread * m, footX = lx + m * s * 0.17 * sit + sg * swing * (1 - sit) * m, kneeX = lx + m * (s * 0.17 * sit + crouchDrop * 0.7) + sg * swing * 0.5 * (1 - sit) * m;
        const kneeY = sit ? hipY + s * 0.01 : hipY + (y - hipY) * 0.5, c = shade(pal.pants, k ? 1 : 0.8);
        capsule(ctx, lx, hipY, kneeX, kneeY, legW, c, lw); capsule(ctx, kneeX, kneeY, footX, y - footH * 0.6 - (k ? tap : 0), legW, c, lw);
        shoe(footX, y - (k ? tap : 0), m);
      }
    } else {
      for (const sg of [-1, 1]) {
        const lift = walking ? Math.max(0, Math.sin(phase + (sg > 0 ? Math.PI : 0))) * s * 0.05 * gait : 0;
        const swingSit = state === 'waiting' && sit > 0.5 ? Math.max(0, Math.sin(T * 5 + sg)) * s * 0.02 : 0;
        const lx = x + sg * (PR.leg.gap / 2 + PR.leg.width / 2) * s * (0.8 + 0.2 * wide), spread = crouchDrop * 0.5 * sg, fy = y - lift - swingSit;
        const c = view === 'back' ? pal.pants : shade(pal.pants, sg > 0 ? 0.88 : 1);
        if (spread) { capsule(ctx, lx, hipY, lx + spread, (hipY + fy) / 2, legW, c, lw); capsule(ctx, lx + spread, (hipY + fy) / 2, lx, fy - footH * 0.6, legW, c, lw); }
        else capsule(ctx, lx, hipY, lx, fy - footH * 0.6, legW, c, lw);
        shoe(lx, fy, 0);
      }
    }
  }

  // Torso (a robe continues to the floor).
  const th = hipY - shY + s * 0.03;
  if (L.robe) { ctx.beginPath(); ctx.moveTo(x - tw * 0.5, shY + th * 0.4); ctx.lineTo(x + tw * 0.5, shY + th * 0.4); ctx.lineTo(x + tw * 0.62, y - s * 0.005); ctx.lineTo(x - tw * 0.62, y - s * 0.005); ctx.closePath(); ctx.fillStyle = pal.shirt; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); ctx.fillStyle = 'rgba(20,12,30,0.14)'; ctx.fillRect(x + tw * 0.2 * ox, hipY, tw * 0.3 * ox, y - hipY - s * 0.01); ctx.fillStyle = shade(pal.pants, 1); ctx.fillRect(x - tw * 0.6, y - s * 0.05, tw * 1.2, s * 0.03); }
  block(ctx, x - tw / 2, shY, tw, th, Math.min(tw, th) * 0.28, pal.shirt, lw, ox);
  const torsoView = HEAD_VIEW[view] === 'side' ? 'side' : HEAD_VIEW[view];
  const garment = (name, slotPal = pal) => { const g = GARMENTS[name]; if (!g) return; const shapes = g[torsoView] ?? (torsoView === 'side' ? null : g.front); if (!shapes) return; ctx.save(); ctx.beginPath(); ctx.roundRect(x - tw / 2 - lw, shY - s * 0.05, tw + lw * 2, th + s * 0.1, Math.min(tw, th) * 0.28); ctx.clip(); ctx.translate(x, shY); ctx.scale(tw * ox, th); drawShapes(ctx, shapes, slotPal, { lw: lw / Math.min(tw, th), time: T }); ctx.restore(); };
  for (const g of ['overalls', 'vest', 'jacket', 'hoodie', 'tie', 'badge']) if (L[g]) garment(g);
  for (const g of ['armor', 'apron', 'core', 'rune-core', 'shaggy']) if (over.has(g)) garment(g);
  if (L.belt) garment('belt');
  // From behind, back-worn parts cover the body.
  if (backish) for (const n of behind) if (n !== 'regal-glow') bodyPart(n, 'behind');
  if (backish) headBack();

  // Head.
  const hk = r * PR.headWidth;
  ctx.beginPath(); ctx.ellipse(headX, headY, hk, r, 0, 0, TAU); ctx.fillStyle = pal.skin; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(20,12,30,0.12)'; ctx.beginPath(); ctx.ellipse(headX + ox * hk * 0.55, headY + r * 0.35, hk * 0.7, r * 0.9, 0, 0, TAU); ctx.fill();
  if (L.skinTone2 && !over.has('bionic-eye')) { ctx.fillStyle = L.skinTone2; ctx.fillRect(headX + (ox > 0 ? r * 0.2 : -hk), headY - r, hk * 0.8, r * 2); }
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE.ink; ctx.beginPath(); ctx.ellipse(headX, headY, hk, r, 0, 0, TAU); ctx.stroke();
  const fx = FACE_X[view];
  if (fx != null) {
    // Ears, eyes, mouth: minimal, readable at gameplay zoom.
    if (!over.has('goblin-ears') && !over.has('elf-ears') && L.hat !== 'hood') { const ex = view === 'front' ? [-1, 1] : [-1]; for (const sg of ex) { const earX = headX + ox * (view === 'front' ? sg * hk * 0.98 : -hk * 0.15); ctx.beginPath(); ctx.ellipse(earX, headY + r * 0.1, r * 0.17, r * 0.23, 0, 0, TAU); ctx.fillStyle = shade(pal.skin, 0.92); ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = OUTLINE.ink; ctx.stroke(); } }
    const cx = headX + ox * fx * r, ey = headY + r * 0.1;
    const oneEye = over.has('cyclops-eye'), hooded = L.hat === 'hood' && over.has('hood-glow');
    if (!oneEye && !hooded) {
      const eyes = view === 'front' ? [[-0.36, 1], [0.36, 1]] : view === 'fdiag' ? [[-0.3, 0.8], [0.26, 1]] : [[0, 1]];
      for (const [dxE, k] of eyes) {
        if (over.has('bionic-eye') && (view === 'front' ? dxE > 0 : dxE >= 0 || view === 'side')) continue; // the machine eye replaces the near one
        const exX = cx + ox * dxE * r;
        if (blink || state === 'offline') { ctx.fillStyle = OUTLINE.ink; ctx.fillRect(exX - r * 0.13, ey, r * 0.26, r * 0.06); continue; }
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(exX, ey, r * 0.15 * k, r * 0.19, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = L.eye ?? '#1d1a22'; ctx.beginPath(); ctx.ellipse(exX + ox * r * 0.04 * (profile ? 1 : 0), ey + r * 0.02, r * 0.09 * k, r * 0.13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(exX - r * 0.03, ey - r * 0.05, r * 0.035, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = shade(pal.skin, 0.55); ctx.lineWidth = Math.max(0.5, r * 0.07); ctx.lineCap = 'round';
      if (!(L.beard && view === 'front')) { ctx.beginPath(); const my = headY + r * 0.52; if (state === 'celebrate') ctx.arc(cx, my - r * 0.06, r * 0.14, 0.2, Math.PI - 0.2); else if (state === 'blocked' || state === 'frustrated') { ctx.moveTo(cx - r * 0.12, my + r * 0.04); ctx.quadraticCurveTo(cx, my - r * 0.06, cx + r * 0.12, my + r * 0.04); } else { ctx.moveTo(cx - r * 0.1, my); ctx.lineTo(cx + r * 0.1, my); } ctx.stroke(); }
      if (view === 'front') { ctx.fillStyle = 'rgba(235,110,120,0.28)'; ctx.beginPath(); ctx.arc(cx - r * 0.6, headY + r * 0.42, r * 0.13, 0, TAU); ctx.arc(cx + r * 0.6, headY + r * 0.42, r * 0.13, 0, TAU); ctx.fill(); }
    }
    const faceStamp = name => { const f = FACE[name]; if (!f) return; const shapes = view === 'front' ? f.front : f.side ?? null; if (shapes) stamp(ctx, shapes, pal, view === 'front' ? headX : headX + ox * (fx - (view === 'side' ? 0.58 : 0.34)) * r * 0.5, headY, r, ox, lw, T); };
    if (L.beard) faceStamp(L.beardLong ? 'beardLong' : 'beard');
    if (oneEye) faceStamp('cyclops-eye');
    if (hooded) faceStamp('hood-glow');
  }
  // Hair (none under a hood), then face gear, headwear and head accessories.
  if (hairDef?.top) stamp(ctx, pick(hairDef.top, view), pal, headX, headY, r, ox, lw, T, PR.headWidth);
  if (fx != null) {
    if (over.has('bionic-eye')) stamp(ctx, view === 'front' ? FACE['bionic-eye'].front : FACE['bionic-eye'].side, pal, headX, headY, r, ox, lw, T);
    if (L.glasses) stamp(ctx, view === 'front' ? FACE.glasses.front : FACE.glasses.side, pal, headX, headY, r, ox, lw, T);
    if (L.visor) stamp(ctx, view === 'front' ? FACE.visor.front : FACE.visor.side, { ...pal, glow: toHex(L.visor) ?? pal.glow }, headX, headY, r, ox, lw, T);
  } else if (over.has('bionic-eye') && view === 'bdiag') stamp(ctx, FACE['bionic-eye'].back, pal, headX, headY, r, ox, lw, T);
  const hat = HEADWEAR[L.hat];
  if (hat) stamp(ctx, pick(hat, view), pal, headX, headY, r, ox, lw, T);
  if (L.horns) stamp(ctx, pick(HEADWEAR.horns, view), pal, headX, headY, r, ox, lw, T);
  for (const k of ['headset', 'goggles', 'antenna']) if (L[k]) stamp(ctx, pick(HEAD_ACCESSORIES[k], view), pal, headX, headY, r, ox, lw, T);

  // Near arm(s) in front, with the held prop.
  if (profile) { if (held) prop(ctx, held, handAt(1)[0], handAt(1)[1], s, L, T, lw); arm([x + m * s * 0.03, shY + s * 0.04], handAt(1), sleeveNear, L.metalArm ? pal.metal : pal.glove); }
  else if (!backish) { if (held) prop(ctx, held, (handAt(0)[0] + handAt(1)[0]) / 2, Math.min(handAt(0)[1], handAt(1)[1]) + s * 0.04, s, L, T, lw); arm(shL, handAt(0), sleeve, pal.glove); arm(shR, handAt(1), sleeveNear, L.metalArm ? pal.metal : pal.glove); }
  else if (held && held !== 'cup' && held !== 'book') prop(ctx, held, handAt(1)[0] + s * 0.05, handAt(1)[1], s, L, T, lw);
  if (!backish) for (const n of over) if (BODY[n]?.front) bodyPart(n, 'front');
  if (state === 'react') {
    const k = Math.min(1, t / 0.18), bx = headX + r * 0.9, by = headY - r * 1.8 - k * s * 0.05;
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = OUTLINE.ink; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.roundRect(bx - s * 0.06, by - s * 0.13, s * 0.12, s * 0.16, s * 0.03); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUTLINE.ink; ctx.fillRect(bx - s * 0.012, by - s * 0.11, s * 0.024, s * 0.08); ctx.fillRect(bx - s * 0.012, by - s * 0.02, s * 0.024, s * 0.022);
  }
  ctx.restore();
  const hatTop = L.hat === 'wizard' ? 2.6 : L.hat === 'crown' || L.horns ? 1.7 : L.hat ? 1.45 : 1.25;
  return { top: headY - r * hatTop, headX, headY, r, view, mirror: m };
}

// A head-and-shoulders portrait for the roster, drawn with the same character code.
export function drawCharacterPortrait(ctx, size, look, parts) {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createLinearGradient(0, 0, 0, size); g.addColorStop(0, look.bg1 ?? '#2a3346'); g.addColorStop(1, look.bg2 ?? '#141a26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  drawCharacter(ctx, { x: size / 2, y: size * 1.28, h: size * 1.45, dir: 'front', state: 'idle', look, parts, time: 0 });
}
