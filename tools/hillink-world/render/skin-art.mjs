// Art skin: draws a theme's painted base plate, its animation layer (scenery), and live entities as
// animated characters with a small portrait badge (the UI identifier), plus orbs, beacons and plaques.
// Same draw contract as the placeholder skin; it only reads the frame.
import { drawCharacter, agentPose } from './character.mjs';
import { createScenery } from './scenery.mjs';
import { hash } from '../engine/ambience.mjs';
const STATUS = {
  coding: '#34d27b', thinking: '#34d27b', researching: '#34d27b', testing: '#34d27b', reviewing: '#34d27b', communicating: '#34d27b',
  waiting: '#f4a23b', idle: '#8aa0b8', completed: '#5cc98a', error: '#ef4b4b', offline: '#59616d',
};
const STATE_COLOR = { ok: '#34d27b', busy: '#4aa3ff', degraded: '#f4b942', down: '#ef4b4b', unknown: '#7c8594', running: '#4aa3ff', success: '#34d27b', passed: '#34d27b', failed: '#ef4b4b' };
const TASK_COLOR = { queued: '#d6dde8', active: '#4aa3ff', done: '#34d27b', failed: '#ef4b4b', blocked: '#f4a23b' };
const SYSTEM_GLYPH = { database: 'DB', tests: 'QA', deploy: 'CD', build: 'CI', platform: 'APP', hq: 'HQ' };
const palette = ['#e2711d', '#3a86ff', '#8338ec', '#2a9d8f', '#e63946', '#f4a261', '#06d6a0', '#118ab2', '#ef476f', '#8d99ae'];
const colorFor = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length]; };
const font = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, sans-serif`;
const activityText = a => (a.activity === 'completed' ? 'finished' : a.activity);

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function text(ctx, str, x, y, px, color, { align = 'center', weight = 600 } = {}) {
  ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y);
}
function pill(ctx, x, y, lines, { dot, px = 9, pad = 5, bg = '#0b1018e6', border = '#ffffff22' } = {}) {
  ctx.font = font(px, 700);
  const w = Math.max(...lines.map((l, i) => { ctx.font = font(i ? px - 1.5 : px, i ? 500 : 700); return ctx.measureText(l).width; })) + pad * 2 + (dot ? 9 : 0);
  const h = lines.length * (px + 3) + pad;
  roundRect(ctx, x - w / 2, y, w, h, 5); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = border; ctx.stroke();
  const left = x - w / 2 + pad + (dot ? 9 : 0);
  if (dot) { ctx.beginPath(); ctx.arc(x - w / 2 + pad + 3, y + pad / 2 + (px + 3) / 2, 3, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); }
  lines.forEach((l, i) => text(ctx, l, left, y + pad / 2 + (px + 3) * (i + 0.5), i ? px - 1.5 : px, i ? '#b9c3d1' : '#f3f6fa', { align: 'left', weight: i ? 500 : 700 }));
  return { w, h };
}

export function createArtSkin(theme, onLoaded = () => {}) {
  const load = src => { const img = new Image(); img.decoding = 'async'; img.onload = () => onLoaded(); img.src = src; return img; };
  const backdrop = load(theme.art.src), portraits = load(theme.art.portraits);
  const ready = img => img.complete && img.naturalWidth > 0;
  const [ox, oy] = theme.art.origin, [aw, ah] = theme.art.size;
  const scenery = theme.scenery ? createScenery(theme.scenery, { img: backdrop, ready: () => ready(backdrop), origin: theme.art.origin, size: theme.art.size }) : null;
  const idHash = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
  // Idle agents are allowed to look alive (coffee, a stretch, glancing around) but never to look productive.
  const idleVariant = (id, t) => {
    const w = Math.floor((t + idHash(id) * 20) / 9), r = hash(w * 1.7 + idHash(id) * 50), into = (t + idHash(id) * 20) % 9;
    return r < 0.3 ? 'coffee' : r < 0.4 && into < 2.5 ? 'stretch' : 'idle';
  };
  const lookFor = a => {
    const key = theme.avatars?.[a.id];
    return { ...(theme.looks?.[key] ?? { shirt: a.appearance?.color ?? colorFor(a.id) }), package: theme.package };
  };
  const ownerAction = (world, id) => Object.values(world?.issues ?? {}).some(i => i.open && i.agentId === id && i.owner);

  function portrait(ctx, agent, cx, cy, r) {
    const key = theme.avatars?.[agent.id] ?? agent.appearance?.[`${theme.id}Portrait`];
    const index = key != null ? theme.art.portraitIndex[key] : undefined;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (index !== undefined && ready(portraits)) ctx.drawImage(portraits, index * 96, 0, 96, 96, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = agent.appearance?.color ?? colorFor(agent.id); ctx.fillRect(cx - r, cy - r, r * 2, r * 2); text(ctx, agent.name[0].toUpperCase(), cx, cy + 1, r, '#fff', { weight: 800 }); }
    ctx.restore();
  }

  return {
    lod: [0.55, 1.35],
    background(ctx, camera) { ctx.fillStyle = '#0b0f16'; ctx.fillRect(0, 0, camera.width, camera.height); },
    ground(ctx, env) {
      const { world, time, reducedMotion } = env;
      if (ready(backdrop)) ctx.drawImage(backdrop, ox, oy, aw, ah);
      else { ctx.fillStyle = '#141a24'; ctx.fillRect(ox, oy, aw, ah); text(ctx, 'Loading art…', ox + aw / 2, oy + ah / 2, 24, '#9aa6b8'); }
      if (ready(backdrop)) scenery?.under(ctx, env);
      // Painted name cards become live plaques bound to real agents.
      for (const p of theme.plaques ?? []) {
        const [x0, y0, x1, y1] = p.rect, a = p.agentIds.map(id => world?.agents?.[id]).find(Boolean) ?? null;
        roundRect(ctx, x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, 7); ctx.fillStyle = '#0b1018f2'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = a ? '#ffffff2a' : '#ffffff14'; ctx.stroke();
        const dot = a ? STATUS[a.activity] ?? STATUS.idle : '#59616d', h = y1 - y0;
        const pulse = a && a.activity === 'error' && !reducedMotion ? 0.6 + 0.4 * Math.sin(time / 160) : 1;
        ctx.globalAlpha = pulse; ctx.beginPath(); ctx.arc(x0 + 12, y0 + h * 0.32, 4.5, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill(); ctx.globalAlpha = 1;
        text(ctx, p.title, x0 + 22, y0 + h * 0.32, 11, '#f3f6fa', { align: 'left', weight: 700 });
        text(ctx, a ? `${a.name} · ${activityText(a)}` : 'No agent connected', x0 + 22, y0 + h * 0.72, 9, a ? '#c9d2de' : '#7d8795', { align: 'left', weight: 500 });
      }
    },
    room(e, { ctx, lod, signals, time, reducedMotion, layout }, { hovered, selected }) {
      const l = e.location, sig = layout?.signals ?? {};
      if (hovered || selected) {
        roundRect(ctx, l.x, l.y, l.w, l.h, 10);
        ctx.fillStyle = selected ? '#e21b2318' : '#ffffff10'; ctx.fill();
        ctx.lineWidth = selected ? 2.5 : 1.5; ctx.strokeStyle = selected ? '#e21b23' : '#ffffffaa'; ctx.stroke();
        pill(ctx, l.x + 8 + 50, l.y + 6, [l.name], { px: 10 });
      }
      // Real signals only: latest test run, latest deploy/build, open PRs.
      if (l.id === 'testing' && signals?.testing && sig.tests) {
        const r = signals.testing, c = STATE_COLOR[r.state] ?? '#7c8594';
        const alpha = r.state === 'running' && !reducedMotion ? 0.65 + 0.35 * Math.sin(time / 250) : 1;
        ctx.globalAlpha = alpha; pill(ctx, sig.tests[0], sig.tests[1], [r.state === 'running' ? 'Tests running' : `${r.passed} passed · ${r.failed} failed`], { dot: c, px: 9, bg: '#0b1018f0', border: c }); ctx.globalAlpha = 1;
      }
      if (l.id === 'deploy' && signals?.deploy && sig.deploy) {
        const d = signals.deploy, c = STATE_COLOR[d.state] ?? '#7c8594';
        pill(ctx, sig.deploy[0], sig.deploy[1], [`${d.target ? `Deploy (${d.target})` : 'Build'}: ${d.state}`], { dot: c, px: 9, border: c });
      }
      if (l.id === 'development' && signals?.development?.length && sig.prs && lod !== 'far') {
        pill(ctx, sig.prs[0], sig.prs[1], [`${signals.development.length} open PR${signals.development.length > 1 ? 's' : ''}`], { dot: '#d7dde6', px: 9 });
      }
    },
    agent(e, env, { hovered, selected }) {
      const a = e.agent; if (!a) return;
      const { ctx, time, lod, zoom, reducedMotion, claimLabel, world } = env, t = reducedMotion ? 0 : time / 1000;
      const gait = e.gait ?? (e.moving ? 'walk' : null);
      let pose = agentPose({ activity: a.activity, clip: e.clip, gait, carrying: e.carrying, receiving: e.receiving, arrived: !e.moving }, idleVariant(a.id, t));
      if (pose === 'celebrating' && time - (e.clipStart ?? 0) > 3500) pose = 'idle';
      let facing = e.facing ?? 1;
      if (pose === 'idle' && hash(Math.floor((t + idHash(a.id) * 7) / 4) + idHash(a.id) * 9) > 0.72) facing = -facing; // glance around
      if (gait === 'wait-lift' || gait === 'ride') facing = -1;
      const ring = STATUS[a.activity] ?? STATUS.idle;
      // Floor ring: marks a real, telemetry-bound agent (NPCs have none).
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 0.5, e.h * 0.27, e.h * 0.08, 0, 0, Math.PI * 2);
      ctx.lineWidth = selected || hovered ? 2 : 1.2; ctx.strokeStyle = selected ? '#e21b23' : hovered ? '#ffffff' : ring; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
      const head = drawCharacter(ctx, { x: e.x, y: e.y, h: e.h, facing, pose, t, stride: e.stride ?? 0, look: lookFor(a), alpha: a.activity === 'offline' ? 0.6 : 1 });
      // UI layer (badge, label, attention marker) draws after everything else so foreground objects never hide it.
      env.late.push(() => {
        const k = Math.min(1.8, Math.max(0.8, 1 / zoom)), r = 6.5 * k, cx = e.x, cy = head.top - r - 3;
        ctx.globalAlpha = a.activity === 'offline' ? 0.55 : 1;
        if (selected || hovered) { ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.fillStyle = selected ? '#e21b23' : '#ffffffcc'; ctx.fill(); }
        ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
        portrait(ctx, a, cx, cy, r);
        ctx.globalAlpha = 1;
        // Attention in the world: restrained markers; owner action looks different from a generic blocker.
        const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time / 380);
        if (ownerAction(world, a.id)) { roundRect(ctx, cx + r - 1, cy - r - 9, 30, 12, 6); ctx.fillStyle = '#7b3fe4'; ctx.globalAlpha = pulse; ctx.fill(); ctx.globalAlpha = 1; text(ctx, 'You', cx + r + 14, cy - r - 3, 7.5, '#fff', { weight: 800 }); }
        else if (a.activity === 'error') { ctx.beginPath(); ctx.arc(cx + r + 2, cy - r + 1, 5, 0, Math.PI * 2); ctx.fillStyle = '#e5484d'; ctx.globalAlpha = pulse; ctx.fill(); ctx.globalAlpha = 1; text(ctx, '!', cx + r + 2, cy - r + 1.5, 7.5, '#fff', { weight: 800 }); }
        else if (a.activity === 'waiting') { ctx.beginPath(); ctx.arc(cx + r + 2, cy - r + 1, 5, 0, Math.PI * 2); ctx.fillStyle = '#f4a23b'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + r + 2, cy - r - 1.5); ctx.lineTo(cx + r + 2, cy - r + 1.5); ctx.lineTo(cx + r + 4, cy - r + 2.5); ctx.stroke(); }
        if (a.activity === 'offline' && !reducedMotion) text(ctx, 'z', cx + r + 3, cy - r - 2 - ((time / 900) % 1) * 5, 7, '#c9d2de', { weight: 700 });
        if (lod === 'far' && !(hovered || selected)) return;
        const lines = lod === 'near' || hovered || selected ? [a.name, activityText(a)] : [a.name];
        const ly = cy - r - 6 - lines.length * 11;
        if (claimLabel(cx, ly + lines.length * 5, (a.name.length * 6 + 24) * k, lines.length * 12 + 6, hovered || selected)) pill(ctx, cx, ly, lines, { dot: ring, px: 8.5 });
      });
    },
    npc(e, { ctx, time, reducedMotion }) {
      drawCharacter(ctx, { x: e.x, y: e.y, h: e.h, facing: e.facing, pose: e.pose, t: reducedMotion ? 0 : time / 1000 + e.index, stride: e.stride ?? 0, look: e.npc.look, alpha: 0.93, npc: true });
    },
    occluder(e, { ctx }) { scenery?.occluder(ctx, e.shapes); },
    liftBack(e, { ctx, time, reducedMotion }) { scenery?.liftBack(ctx, e.lift, time / 1000, !reducedMotion); },
    liftFront(e, { ctx }) { scenery?.liftFront(ctx, e.lift); },
    overlay(ctx, env) { scenery?.over(ctx, env); },
    task(e, { ctx, time, reducedMotion }, { hovered, selected }) {
      const c = TASK_COLOR[e.task.status] ?? '#d6dde8', r = selected || hovered ? 5.5 : 4;
      const glow = e.task.status === 'active' && !reducedMotion ? 0.4 + 0.3 * Math.sin(time / 300) : 0.3;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, Math.PI * 2); ctx.fillStyle = c; ctx.globalAlpha = glow; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      if (selected || hovered) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); pill(ctx, e.x, e.y - 22, [e.task.title.slice(0, 40)], { px: 9 }); }
    },
    system(e, { ctx, time, lod, reducedMotion }, { hovered, selected }) {
      const s = e.system, c = STATE_COLOR[s.state] ?? '#7c8594', x = e.x, y = e.y;
      const pulse = (s.state === 'busy' || s.state === 'down') && !reducedMotion ? 0.5 + 0.5 * Math.sin(time / 220) : 0;
      if (pulse) { ctx.beginPath(); ctx.arc(x, y, 16 + pulse * 5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
      if (s.kind === 'database') {
        ctx.fillStyle = '#1b2433'; ctx.fillRect(x - 11, y - 8, 22, 16);
        ctx.beginPath(); ctx.ellipse(x, y + 8, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y - 8, 11, 4, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      } else {
        roundRect(ctx, x - 13, y - 11, 26, 22, 5); ctx.fillStyle = '#0b1018ee'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke();
        text(ctx, SYSTEM_GLYPH[s.kind] ?? 'SYS', x, y + 0.5, 8, '#f3f6fa', { weight: 800 });
      }
      if (hovered || selected) { roundRect(ctx, x - 18, y - 16, 36, 32, 7); ctx.lineWidth = 2; ctx.strokeStyle = '#e21b23'; ctx.stroke(); }
      if (lod === 'near' || hovered || selected) pill(ctx, x, y + 14, [s.name], { dot: c, px: 8 });
    },
    issue(e, { ctx, time, reducedMotion }, { hovered }) {
      const k = reducedMotion ? 1 : 1 + 0.12 * Math.sin(time / 180);
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(k, k);
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath();
      ctx.fillStyle = e.issue.severity === 'low' ? '#f4b942' : '#ef4b4b'; ctx.fill();
      ctx.lineWidth = hovered ? 2 : 1; ctx.strokeStyle = '#fff'; ctx.stroke();
      text(ctx, '!', 0, 2, 10, '#fff', { weight: 800 }); ctx.restore();
    },
    effect(fx, { ctx, time, scene }) {
      if (fx.kind !== 'message') return;
      const a = scene.get(fx.from), b = scene.get(fx.to); if (!a || !b || a.errand) return; // a physical handoff replaces the envelope
      const k = Math.min(1, (time - fx.start) / fx.duration);
      const x = a.x + (b.x - a.x) * k, y = a.y - 34 + (b.y - a.y) * k - Math.sin(k * Math.PI) * 50;
      roundRect(ctx, x - 8, y - 6, 16, 12, 2); ctx.fillStyle = '#f1f4f8'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x, y + 1); ctx.lineTo(x + 8, y - 6); ctx.strokeStyle = '#5b6576'; ctx.lineWidth = 1.2; ctx.stroke();
    },
  };
}
