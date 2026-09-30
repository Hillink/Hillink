// Pass 5H: the status language, one meaning in both themes. Colour and pose never change between Real and Fantasy; only
// the small emblem's frame does (a rounded monitor chip in Real, a heraldic seal in Fantasy). Everything here reads the
// canonical agent (activity, taskId, prId, lastTask) and the scene entity's clip/intent, and draws. Nothing here writes.
//
// NEEDS KYLE comes from one canonical field only: an open issue with owner === true on this agent (core/state.mjs
// ISSUE_FOUND; HQ sets it from its own alert.ownerMustAct, adapters/hq.mjs). Free text (a blocker's detail, a title) is
// never read for it. Owner approvals that name no agent (HQ's owner-required tasks) stay on the HUD, not on a character.
import { STATUS, OUTLINE } from './tokens.mjs';

const TAU = Math.PI * 2;

// Canonical status of one agent entity. Same precedence as the Living HQ state ring (render/art5d/skin.mjs stateOf),
// plus 'candidate' (a provisioned agent that HQ has not activated: READY is never shown as working).
export const needsOwner = (world, a) => !!a && Object.values(world?.issues ?? {}).some(i => i && i.open === true && i.owner === true && i.agentId === a.id);
export function statusOf(e, a, world = null) {
  if (!a) return 'idle';
  if (e?.staging?.presence === 'candidate') return 'candidate';
  if (needsOwner(world, a)) return 'needs-owner';
  const st = e?.anim?.state, intent = e?.anim?.intent;
  if (st === 'frustrated' || intent === 'blocked' || intent === 'recovering' || a.activity === 'error') return 'blocked';
  if (a.activity === 'waiting') return a.lastTask?.outcome === 'blocked' ? 'blocked' : 'waiting';
  if (intent === 'attention' || intent === 'waiting') return 'waiting';
  if (a.activity === 'completed') return 'completed'; // only TASK_COMPLETED sets this (core/state.mjs)
  if (e?.moving && (e.carrying || e.journey || a.taskId)) return 'travelling';
  if (['working', 'building', 'investigating', 'testing', 'reviewing', 'meeting'].includes(intent)) return 'working';
  if (a.activity === 'offline') return 'offline';
  return 'idle';
}

// The work an agent is carrying, from canonical ids only: an open pull request (Real: a PR chip; Fantasy: a sealed quest
// order). Returns null when the agent has none. No GitHub call, no inference from names or text.
export function workChipOf(world, a) {
  if (!a) return null;
  const task = a.taskId ? world?.tasks?.[a.taskId] ?? null : null;
  const prId = a.prId ?? task?.prId ?? null;
  if (!prId) return null;
  const pr = world?.prs?.[prId] ?? null;
  return { prId, state: pr?.state ?? (pr?.verdict ? 'reviewed' : 'open'), reviewing: !!a.prId };
}

// Glyphs (unit box −1..1), shared by both themes.
function glyph(ctx, key, s, c) {
  ctx.save(); ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = s * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.stroke(); };
  const F = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s))); ctx.closePath(); ctx.fill(); };
  switch (key) {
    case 'working': F([[-0.45, -0.6], [0.65, 0], [-0.45, 0.6]]); break; // play / spark
    case 'travelling': L([[-0.6, 0], [0.5, 0]]); L([[0.1, -0.45], [0.55, 0], [0.1, 0.45]]); break;
    case 'waiting': ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, TAU); ctx.lineWidth = s * 0.2; ctx.stroke(); L([[0, -0.38], [0, 0], [0.3, 0.18]]); break;
    case 'blocked': ctx.fillRect(-s * 0.13, -s * 0.7, s * 0.26, s * 0.9); ctx.beginPath(); ctx.arc(0, s * 0.52, s * 0.15, 0, TAU); ctx.fill(); break;
    case 'completed': { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.32 : s * 0.75, an = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); break; }
    case 'offline': ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0.6, TAU - 0.6 + 0.001); ctx.arc(s * 0.3, -s * 0.12, s * 0.45, TAU - 0.9, 0.9, true); ctx.fill(); break;
    case 'candidate': ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, TAU); ctx.lineWidth = s * 0.2; ctx.setLineDash([s * 0.3, s * 0.22]); ctx.stroke(); break;
    case 'needs-owner': F([[-0.5, 0.65], [-0.5, -0.2], [-0.3, -0.35], [-0.3, -0.7], [-0.05, -0.7], [-0.05, -0.15], [0.1, -0.15], [0.1, -0.6], [0.35, -0.6], [0.35, 0.05], [0.55, -0.1], [0.62, 0.2], [0.35, 0.65]]); break;
    case 'pr': ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.5, s * 0.18, 0, TAU); ctx.arc(-s * 0.35, s * 0.5, s * 0.18, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(s * 0.4, s * 0.5, s * 0.18, 0, TAU); ctx.fill(); ctx.lineWidth = s * 0.16; L([[-0.35, -0.5], [-0.35, 0.5]]); L([[0.4, 0.5], [0.4, -0.2], [0.1, -0.5]]); break;
    default: break;
  }
  ctx.restore();
}

// The emblem above a character's head. Real: a rounded chip with a light face (a small screen). Fantasy: a round seal
// with a ribbon tail (heraldry). Same colour, same glyph. `k` is the on-screen scale (1 = 7px radius).
export function drawEmblem(ctx, x, y, key, theme, k = 1, time = 0) {
  const S = STATUS[key]; if (!S || key === 'idle') return;
  const r = 7 * k, pulse = key === 'blocked' || key === 'needs-owner' ? 1 + 0.08 * Math.sin(time * 5) : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse); ctx.lineWidth = Math.max(0.8, r * 0.16); ctx.strokeStyle = OUTLINE.ink;
  if (theme === 'fantasy') {
    ctx.fillStyle = S.color; ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.4); ctx.lineTo(-r * 0.75, r * 1.45); ctx.lineTo(-r * 0.3, r * 1.15); ctx.lineTo(0, r * 1.5); ctx.lineTo(r * 0.3, r * 1.15); ctx.lineTo(r * 0.75, r * 1.45); ctx.lineTo(r * 0.55, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 12; i++) { const rr = i % 2 ? r * 0.9 : r, an = (i * Math.PI) / 6; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fillStyle = S.color; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    glyph(ctx, key, r * 0.55, '#fff8e6');
  } else {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.45); ctx.fill(); ctx.stroke();
    ctx.fillStyle = S.color; ctx.beginPath(); ctx.roundRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 0.25, r); ctx.lineTo(0, r * 1.4); ctx.lineTo(r * 0.25, r); ctx.fillStyle = '#ffffff'; ctx.fill();
    glyph(ctx, key, r * 0.5, '#ffffff');
  }
  ctx.restore();
}

// The ground ring at a character's feet (both themes): a soft ellipse in the status colour. Idle draws nothing.
export function drawStatusRing(ctx, x, y, h, key, time = 0, reduced = false) {
  const S = STATUS[key]; if (!S || key === 'idle') return;
  const pulse = (key === 'blocked' || key === 'needs-owner') && !reduced ? 0.55 + 0.35 * Math.sin(time * 5) : 0.7;
  ctx.save(); ctx.globalAlpha *= pulse; ctx.strokeStyle = S.color; ctx.lineWidth = Math.max(1, h * 0.03); ctx.beginPath(); ctx.ellipse(x, y + 0.5, h * 0.32, h * 0.1, 0, 0, TAU);
  if (key === 'candidate') ctx.setLineDash([h * 0.06, h * 0.04]);
  ctx.stroke(); ctx.globalAlpha *= 0.25; ctx.fillStyle = S.color; ctx.fill(); ctx.restore();
}

// The work chip (canonical PR only): Real, a small white card with the pull-request glyph; Fantasy, a rolled quest order
// with a wax seal. Sits beside the emblem.
export function drawWorkChip(ctx, x, y, chip, theme, k = 1) {
  if (!chip) return;
  const r = 6 * k, c = chip.state === 'merged' ? '#8b5cf6' : chip.reviewing ? '#b58cff' : '#2f7df6';
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = Math.max(0.7, r * 0.15); ctx.strokeStyle = OUTLINE.ink;
  if (theme === 'fantasy') {
    ctx.fillStyle = '#f3e3bf'; ctx.beginPath(); ctx.roundRect(-r * 1.1, -r * 0.8, r * 2.2, r * 1.6, r * 0.2); ctx.fill(); ctx.stroke();
    for (const s of [-1, 1]) { ctx.fillStyle = '#d9c28f'; ctx.beginPath(); ctx.ellipse(s * r * 1.1, 0, r * 0.25, r * 0.85, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(90,60,30,0.6)'; ctx.lineWidth = r * 0.12; for (const yy of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.moveTo(-r * 0.7, yy * r); ctx.lineTo(r * 0.3, yy * r); ctx.stroke(); }
    ctx.fillStyle = chip.reviewing ? '#7a4cc2' : '#b3262c'; ctx.beginPath(); ctx.arc(r * 0.6, r * 0.45, r * 0.42, 0, TAU); ctx.fill(); ctx.strokeStyle = OUTLINE.ink; ctx.lineWidth = r * 0.12; ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.35); ctx.fill(); ctx.stroke();
    glyph(ctx, 'pr', r * 0.62, c);
  }
  ctx.restore();
}

// The completion ceremony: only when statusOf is 'completed' (a canonical TASK_COMPLETED), for its first seconds.
// Real: a short confetti burst. Fantasy: rising golden sparks and stars. t = seconds since the clip began.
export const CEREMONY_S = 2.6;
export function drawCeremony(ctx, x, y, h, t, theme, reduced = false) {
  if (reduced || !(t >= 0 && t < CEREMONY_S)) return;
  const k = t / CEREMONY_S, n = 12;
  ctx.save(); ctx.globalAlpha *= 1 - k;
  for (let i = 0; i < n; i++) {
    const an = -Math.PI / 2 + (i - n / 2) * 0.22, sp = h * (0.55 + (i % 3) * 0.12), px = x + Math.cos(an) * sp * k * 1.2, py = y - h * 0.9 + Math.sin(an) * sp * k + h * 0.9 * k * k;
    if (theme === 'fantasy') { ctx.fillStyle = i % 2 ? '#ffd23f' : '#fff3b0'; ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? h * 0.012 : h * 0.035, a2 = (j * Math.PI) / 4 + t * 3; ctx.lineTo(px + Math.cos(a2) * rr, py + Math.sin(a2) * rr); } ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = ['#ff7a1a', '#2f7df6', '#34d27b', '#ffd23f', '#e5484d'][i % 5]; ctx.save(); ctx.translate(px, py); ctx.rotate(t * 6 + i); ctx.fillRect(-h * 0.018, -h * 0.03, h * 0.036, h * 0.06); ctx.restore(); }
  }
  ctx.restore();
}
