// Procedural animated characters (temporary art until sprite sheets exist). One draw call per
// character per frame; the pose and its timing come from the caller, so the same figure serves
// named agents and ambient NPCs. Feet are at (x, y); `h` is standing height in world units.
//
// Poses: idle, walk, typing, think, inspecting, reading, carrying, meeting, blocked, waiting,
// celebrating, offline, ride, board, wait-lift, receive.
const TAU = Math.PI * 2;

function limb(ctx, x0, y0, x1, y1, w, color) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke();
}
function dot(ctx, x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = color; ctx.fill(); }
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1, 7), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// Arm target offsets (relative to the shoulder, in units of h) per pose; f = facing (+1 right).
function armTargets(pose, f, t, phase, h) {
  const s = Math.sin, sw = s(phase) * 0.16;
  switch (pose) {
    case 'walk': return [[-sw * f * 0.9, 0.33], [sw * f * 0.9, 0.33]];
    case 'typing': { const j = s(t * 26) * 0.012, k = s(t * 23 + 1) * 0.012; return [[f * 0.2, 0.16 + j], [f * 0.25, 0.17 + k]]; }
    case 'think': return [[f * 0.06, 0.02 + s(t * 0.8) * 0.01], [f * 0.2, 0.18]];
    case 'inspecting': return [[f * 0.24, 0.12], [f * (0.2 + s(t * 1.7) * 0.05), 0.08 + s(t * 2.3) * 0.03]];
    case 'reading': return [[f * 0.2, 0.14], [f * 0.24, 0.15]];
    case 'carrying': case 'receive': return [[f * 0.22, 0.17], [f * 0.26, 0.18]];
    case 'meeting': return [[-f * 0.03, 0.33], [f * (0.2 + s(t * 3) * 0.06), 0.1 + s(t * 4.1) * 0.08]];
    case 'blocked': return [[-0.1, -0.2], [0.1, -0.2]];
    case 'waiting': case 'wait-lift': return [[f * 0.12, 0.15], [f * 0.1, 0.13]];
    case 'celebrating': return [[-0.16, -0.3 + s(t * 9) * 0.03], [0.16, -0.3 - s(t * 9) * 0.03]];
    case 'coffee': return [[-f * 0.03, 0.33], [f * 0.1, (s(t * 0.7) > 0.8 ? 0.0 : 0.14)]];
    case 'stretch': return [[-0.12, -0.32], [0.12, -0.32]];
    case 'offline': return [[-0.04, 0.3], [0.04, 0.3]];
    default: return [[-0.03 + s(t * 0.9) * 0.01, 0.33], [0.03 - s(t * 0.9) * 0.01, 0.33]];
  }
}

// look: { shirt, pants, skin, hair, hat, beard, cape, visor, glow }
export function drawCharacter(ctx, { x, y, h, facing = 1, pose = 'idle', t = 0, stride = 0, look = {}, alpha = 1, npc = false, prop }) {
  const f = facing < 0 ? -1 : 1;
  const L = { shirt: '#5b6b82', pants: '#262c36', skin: '#e0b08a', hair: '#2b211b', ...look };
  const walking = pose === 'walk';
  const phase = walking ? (stride / (h * 0.52)) * Math.PI : 0;
  const breathe = Math.sin(t * 2.1) * h * 0.008;
  let bob = walking ? -Math.abs(Math.sin(phase)) * h * 0.035 : breathe;
  if (pose === 'celebrating') bob -= Math.max(0, Math.sin(t * 9)) * h * 0.08;
  if (pose === 'blocked') bob += h * 0.01;
  const lean = pose === 'typing' ? f * h * 0.025 : pose === 'offline' ? f * h * 0.02 : 0;
  const hipY = y - h * 0.45 + bob, shY = y - h * 0.76 + bob, headR = h * 0.125, headY = y - h + headR + bob + (pose === 'offline' ? h * 0.04 : 0);
  const hipX = x, shX = x + lean, headX = x + lean * 1.4 + (pose === 'blocked' ? Math.sin(t * 7) * h * 0.012 : 0);

  ctx.save();
  ctx.globalAlpha *= alpha;
  // Contact shadow keeps feet on the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, h * 0.2, h * 0.055, 0, 0, TAU); ctx.fill();
  if (L.cape) { ctx.beginPath(); ctx.moveTo(shX - h * 0.13, shY); ctx.lineTo(shX + h * 0.13, shY); ctx.lineTo(x - f * h * 0.05 + h * 0.17, y - h * 0.12); ctx.lineTo(x - f * h * 0.05 - h * 0.17, y - h * 0.12); ctx.closePath(); ctx.fillStyle = L.cape; ctx.fill(); }

  // Legs.
  const legW = h * 0.1, legL = h * 0.44;
  const legAngle = walking ? Math.sin(phase) * 0.42 : 0;
  const tap = pose === 'waiting' ? Math.max(0, Math.sin(t * 7)) * 0.18 : 0;
  const legs = [[-h * 0.05, legAngle], [h * 0.05, -legAngle - tap * f]];
  for (const [dx, a] of legs) {
    const fx = hipX + dx + Math.sin(a) * legL, fy = hipY + Math.cos(a) * legL;
    limb(ctx, hipX + dx, hipY, fx, fy, legW, L.pants);
    ctx.fillStyle = '#15181d'; ctx.beginPath(); ctx.ellipse(fx + f * h * 0.025, fy, h * 0.055, h * 0.03, 0, 0, TAU); ctx.fill();
  }

  // Torso.
  const tw = h * 0.27;
  ctx.beginPath(); ctx.roundRect(shX - tw / 2, shY - h * 0.02, tw, hipY - shY + h * 0.06, h * 0.07); ctx.fillStyle = L.shirt; ctx.fill();
  ctx.fillStyle = shade(L.shirt, 0.72); ctx.fillRect(shX - tw / 2 + (f > 0 ? 0 : tw * 0.72), shY + h * 0.02, tw * 0.28, hipY - shY); // side shading
  if (L.vest) { ctx.fillStyle = L.vest; ctx.fillRect(shX - tw * 0.35, shY + h * 0.02, tw * 0.7, hipY - shY - h * 0.02); ctx.fillStyle = '#ffffffaa'; ctx.fillRect(shX - tw * 0.35, shY + h * 0.14, tw * 0.7, h * 0.025); }
  if (L.tie) { ctx.fillStyle = L.tie; ctx.fillRect(shX + f * h * 0.02 - h * 0.012, shY, h * 0.024, h * 0.16); }

  // Props held in front (drawn before the near arm).
  const handY = shY + h * 0.17, px = shX + f * h * 0.26;
  if (prop === 'laptop' || pose === 'typing') {
    ctx.fillStyle = '#20252d'; ctx.fillRect(px - h * 0.11, handY + h * 0.005, h * 0.22, h * 0.03);
    ctx.save(); ctx.translate(px + f * h * 0.08, handY); ctx.rotate(-f * 0.35);
    ctx.fillStyle = '#20252d'; ctx.fillRect(-h * 0.02, -h * 0.17, h * 0.03, h * 0.17);
    ctx.restore();
    ctx.fillStyle = L.screen ?? '#63b3ff'; ctx.globalAlpha *= 0.55 + 0.35 * Math.abs(Math.sin(t * 3.1));
    ctx.beginPath(); ctx.arc(px, handY - h * 0.06, h * 0.12, 0, TAU); ctx.fill(); // screen glow on the face
    ctx.globalAlpha = alpha;
  }
  if (pose === 'inspecting') {
    ctx.save(); ctx.translate(shX + f * h * 0.26, shY + h * 0.1); ctx.rotate(f * -0.25);
    ctx.fillStyle = '#1b2230'; ctx.fillRect(-h * 0.08, -h * 0.1, h * 0.16, h * 0.13);
    ctx.fillStyle = L.screen ?? '#5ee1ff'; ctx.fillRect(-h * 0.065, -h * 0.087, h * 0.13, h * 0.1);
    ctx.fillStyle = '#ffffffcc'; ctx.fillRect(-h * 0.065, -h * 0.087 + ((t * 0.9) % 1) * h * 0.1, h * 0.13, h * 0.012); // scan line
    ctx.restore();
  }
  if (pose === 'reading') {
    const open = 0.1 + Math.abs(Math.sin(t * 0.6)) * 0.02;
    ctx.fillStyle = '#f2ead8'; ctx.fillRect(px - h * open, handY - h * 0.1, h * open * 2, h * 0.12);
    ctx.fillStyle = '#8b5e34'; ctx.fillRect(px - h * 0.005, handY - h * 0.1, h * 0.01, h * 0.12);
  }
  if (pose === 'carrying' || pose === 'receive') {
    const pkg = L.package ?? 'box';
    if (pkg === 'scroll') { ctx.fillStyle = '#e9d9a8'; ctx.fillRect(px - h * 0.13, handY - h * 0.07, h * 0.26, h * 0.09); dot(ctx, px - h * 0.13, handY - h * 0.025, h * 0.05, '#c9ad6a'); dot(ctx, px + h * 0.13, handY - h * 0.025, h * 0.05, '#c9ad6a'); ctx.fillStyle = '#b3261e'; ctx.fillRect(px - h * 0.015, handY - h * 0.07, h * 0.03, h * 0.09); }
    else { ctx.fillStyle = '#d9a55b'; ctx.fillRect(px - h * 0.12, handY - h * 0.12, h * 0.24, h * 0.16); ctx.fillStyle = '#b07a36'; ctx.fillRect(px - h * 0.12, handY - h * 0.05, h * 0.24, h * 0.025); ctx.fillStyle = '#63b3ff'; ctx.fillRect(px - h * 0.04, handY - h * 0.1, h * 0.08, h * 0.05); }
  }
  if (pose === 'coffee' || prop === 'coffee') { const [, ay] = armTargets('coffee', f, t, phase, h)[1]; ctx.fillStyle = '#f4f1ea'; ctx.fillRect(shX + f * h * 0.1 - h * 0.035, shY + ay * h - h * 0.07, h * 0.07, h * 0.08); }

  // Arms.
  const armW = h * 0.085;
  const targets = armTargets(pose, f, t, phase, h);
  targets.forEach(([ax, ay], i) => {
    const sx = shX + (i ? 1 : -1) * h * 0.12 * (pose === 'walk' ? 0.85 : 1), sy = shY + h * 0.03;
    const hx = shX + ax * h + (i ? h * 0.02 : -h * 0.02), hy = shY + ay * h;
    limb(ctx, sx, sy, hx, hy, armW, shade(L.shirt, i ? 1 : 0.85));
    dot(ctx, hx, hy, h * 0.04, L.skin);
  });

  // Head.
  dot(ctx, headX, headY, headR, L.skin);
  if (L.beard) { ctx.beginPath(); ctx.arc(headX + f * headR * 0.15, headY + headR * 0.35, headR * 0.85, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fillStyle = L.beard; ctx.fill(); }
  ctx.beginPath(); ctx.arc(headX, headY - headR * 0.1, headR * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fillStyle = L.hair; ctx.fill(); // hair cap
  ctx.fillStyle = L.hair; ctx.fillRect(headX - f * headR * 1.0, headY - headR * 0.3, headR * 0.45 * f, headR * 0.7); // back of head
  const eyeX = headX + f * headR * 0.45, eyeY = headY - headR * 0.05;
  if (pose !== 'offline') dot(ctx, eyeX, eyeY, headR * 0.13, '#1a1a1a'); else limb(ctx, eyeX - headR * 0.15, eyeY, eyeX + headR * 0.15, eyeY, headR * 0.1, '#1a1a1a');
  if (L.visor) { ctx.fillStyle = L.visor; ctx.fillRect(headX - headR * 0.2 * f - headR * 0.4, headY - headR * 0.3, headR * 1.4, headR * 0.4); }
  if (L.hat === 'hardhat') { ctx.beginPath(); ctx.arc(headX, headY - headR * 0.15, headR * 1.1, Math.PI, TAU); ctx.fillStyle = L.hatColor ?? '#f2b01e'; ctx.fill(); ctx.fillRect(headX - headR * 1.3, headY - headR * 0.2, headR * 2.6, headR * 0.22); }
  if (L.hat === 'crown') { ctx.beginPath(); const cy = headY - headR * 0.8; ctx.moveTo(headX - headR * 0.8, cy + headR * 0.3); for (let i = 0; i <= 4; i++) ctx.lineTo(headX - headR * 0.8 + i * headR * 0.4, cy - (i % 2 ? 0 : headR * 0.55)); ctx.lineTo(headX + headR * 0.8, cy + headR * 0.3); ctx.closePath(); ctx.fillStyle = '#f5c542'; ctx.fill(); }
  if (L.hat === 'helmet') { ctx.beginPath(); ctx.arc(headX, headY - headR * 0.05, headR * 1.12, Math.PI * 0.95, Math.PI * 2.05); ctx.fillStyle = L.hatColor ?? '#b8c2cf'; ctx.fill(); }
  if (L.hat === 'hood') { ctx.beginPath(); ctx.arc(headX, headY, headR * 1.3, Math.PI * 0.9, Math.PI * 2.1); ctx.fillStyle = L.hatColor ?? L.shirt; ctx.fill(); }
  if (L.hat === 'cap') { ctx.beginPath(); ctx.arc(headX, headY - headR * 0.2, headR * 1.02, Math.PI, TAU); ctx.fillStyle = L.hatColor ?? '#223'; ctx.fill(); ctx.fillRect(headX, headY - headR * 0.3, f * headR * 1.3, headR * 0.2); }
  if (L.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (0.25 + 0.1 * Math.sin(t * 2)); dot(ctx, headX, headY + h * 0.3, h * 0.45, L.glow); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  return { headX, headY, headR, top: headY - headR * (L.hat ? 2 : 1.2) };
}

// Which pose an agent shows. Productive poses only for productive, arrived agents (never inferred from presence).
export function agentPose({ activity, clip, gait, carrying, receiving, arrived }, idleVariant) {
  if (gait === 'walk') return carrying ? 'carrying' : 'walk';
  if (gait === 'ride' || gait === 'board') return carrying ? 'carrying' : 'ride';
  if (gait === 'wait-lift') return carrying ? 'carrying' : 'wait-lift';
  if (receiving) return 'receive';
  if (carrying) return 'carrying';
  switch (activity) {
    case 'coding': return arrived ? 'typing' : 'idle';
    case 'thinking': return arrived ? 'think' : 'idle';
    case 'reviewing': case 'testing': return arrived ? 'inspecting' : 'idle';
    case 'researching': return arrived ? 'reading' : 'idle';
    case 'communicating': return 'meeting';
    case 'waiting': return 'waiting';
    case 'error': return 'blocked';
    case 'completed': return clip === 'success' ? 'celebrating' : 'idle';
    case 'offline': return 'offline';
    default: return idleVariant ?? 'idle';
  }
}
export const PRODUCTIVE_POSES = new Set(['typing', 'think', 'inspecting', 'reading']);
