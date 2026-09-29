// Placeholder skin (brief §2): agents are colored squares, rooms rectangles, the database a cylinder, tasks dots.
// A final-art skin implements the same functions (room, agent, task, system, issue, effect) with sprites.
const palette = ['#e2711d', '#3a86ff', '#8338ec', '#2a9d8f', '#e63946', '#f4a261', '#06d6a0', '#118ab2', '#ef476f', '#8d99ae'];
const colorFor = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length]; };
const STATE_COLOR = { ok: '#5cc98a', busy: '#4aa3ff', degraded: '#f4b942', down: '#ef4b4b', unknown: '#7c8594', running: '#4aa3ff', success: '#5cc98a', passed: '#5cc98a', failed: '#ef4b4b' };
const TASK_COLOR = { queued: '#aab4c3', active: '#4aa3ff', done: '#5cc98a', failed: '#ef4b4b' };
const font = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, sans-serif`;

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function label(ctx, text, x, y, px, color, align = 'center') { ctx.font = font(px); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); }

export const placeholderSkin = {
  background(ctx, camera, theme) { ctx.fillStyle = theme.ground; ctx.fillRect(0, 0, camera.width, camera.height); },
  ground(ctx, { theme }) {
    ctx.strokeStyle = theme.corridor; ctx.lineWidth = 60; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(90, 530); ctx.lineTo(2310, 530); ctx.moveTo(90, 1050); ctx.lineTo(2310, 1050);
    for (const x of [90, 830, 1570, 2310]) { ctx.moveTo(x, 530); ctx.lineTo(x, 1050); }
    ctx.stroke();
  },
  room(e, { ctx, lod, theme, signals, time, reducedMotion }, { hovered, selected }) {
    const l = e.location, x = l.x, y = l.y;
    roundRect(ctx, x, y, l.w, l.h, 18); ctx.fillStyle = theme.room; ctx.fill();
    ctx.lineWidth = selected ? 6 : hovered ? 4 : 2; ctx.strokeStyle = selected ? theme.accent : hovered ? theme.accentSoft : theme.roomEdge; ctx.stroke();
    // Stations as simple furniture.
    for (const [name, [sx, sy]] of Object.entries(l.stations)) {
      ctx.fillStyle = theme.furniture;
      if (name.startsWith('desk') || name.startsWith('bench') || name.startsWith('console') || name === 'terminal') { roundRect(ctx, sx - 40, sy - 58, 80, 18, 4); ctx.fill(); }
      else if (name.startsWith('table')) { ctx.beginPath(); ctx.arc(sx, sy - 10, 26, 0, Math.PI * 2); ctx.fill(); }
    }
    // Room equipment reflects real signals only.
    if (l.id === 'testing' && signals?.testing) {
      const r = signals.testing, c = STATE_COLOR[r.state] ?? theme.muted;
      roundRect(ctx, 1950, 100, 270, 44, 8); ctx.fillStyle = c; ctx.globalAlpha = r.state === 'running' && !reducedMotion ? 0.55 + 0.35 * Math.sin(time / 250) : 0.85; ctx.fill(); ctx.globalAlpha = 1;
      if (lod !== 'far') label(ctx, r.state === 'running' ? 'TESTS RUNNING' : `${r.passed} passed · ${r.failed} failed`, 2085, 122, 16, '#0b0f14');
    }
    if (l.id === 'deploy' && signals?.deploy) {
      const d = signals.deploy, c = STATE_COLOR[d.state] ?? theme.muted;
      ctx.beginPath(); ctx.arc(460, 760, 70, 0, Math.PI * 2); ctx.strokeStyle = c; ctx.lineWidth = 10;
      if (d.state === 'running' && !reducedMotion) { ctx.setLineDash([30, 20]); ctx.lineDashOffset = -time / 20; }
      ctx.stroke(); ctx.setLineDash([]);
      if (lod !== 'far') label(ctx, d.state.toUpperCase(), 460, 760, 14, c);
    }
    if (l.id === 'development' && signals?.development?.length) {
      signals.development.slice(0, 8).forEach((pr, i) => { roundRect(ctx, 200 + i * 30, 110, 22, 28, 3); ctx.fillStyle = pr.state === 'reviewed' ? '#5cc98a' : '#d7dde6'; ctx.fill(); });
      if (lod === 'near') label(ctx, `${signals.development.length} open PR${signals.development.length > 1 ? 's' : ''}`, 200, 152, 12, theme.muted, 'left');
    }
    const titlePx = lod === 'far' ? 34 : 22;
    label(ctx, l.name.toUpperCase(), x + 24, y + 32, titlePx, theme.title, 'left');
  },
  agent(e, { ctx, time, lod, reducedMotion, theme, claimLabel }, { hovered, selected }) {
    const a = e.agent, t = (time - (e.clipStart ?? 0)) / 1000, anim = !reducedMotion;
    let dx = 0, dy = 0, scale = 1;
    const clip = e.moving ? 'walk' : e.clip;
    if (anim) {
      if (clip === 'walk') dy = -Math.abs(Math.sin(time / 90)) * 6;
      else if (clip === 'work') dy = Math.sin(time / 70) * 1.5;
      else if (clip === 'idle') scale = 1 + Math.sin(time / 900) * 0.03;
      else if (clip === 'error') dx = t < 1.2 ? Math.sin(time / 30) * 4 : 0;
      else if (clip === 'success') dy = t < 1 ? -Math.abs(Math.sin(t * Math.PI * 2)) * 14 : 0;
    }
    const size = 40 * scale, x = e.x + dx, y = e.y + dy;
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = clip === 'offline' ? 0.35 : 1;
    roundRect(ctx, x - size / 2, y - size - 4, size, size, 8); ctx.fillStyle = a.appearance?.color ?? colorFor(a.id); ctx.fill();
    if (selected || hovered) { ctx.lineWidth = selected ? 5 : 3; ctx.strokeStyle = theme.accent; ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = font(18, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.name[0].toUpperCase(), x, y - size / 2 - 4);
    ctx.globalAlpha = 1;
    // Activity marker: small and iconic, no paragraphs.
    const glyph = { work: '⌨', think: '…', review: '👁', read: '📖', test: '🧪', talk: '💬', wait: '⏳', success: '✓', error: '!', offline: '⏻' }[clip];
    if (glyph && (lod !== 'far' || clip === 'error')) {
      const by = y - size - 26 + (anim && clip === 'think' ? Math.sin(time / 300) * 3 : 0);
      ctx.beginPath(); ctx.arc(x + 20, by, 14, 0, Math.PI * 2); ctx.fillStyle = clip === 'error' ? '#ef4b4b' : clip === 'success' ? '#5cc98a' : '#f1f4f8'; ctx.fill();
      label(ctx, glyph, x + 20, by + 1, 15, clip === 'error' || clip === 'success' ? '#fff' : '#1a202c');
    }
    if (clip === 'work' && anim) { ctx.fillStyle = theme.screenGlow; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time / 180); roundRect(ctx, e.x - 30, e.y - 96 - 18, 60, 8, 3); ctx.globalAlpha = 1; }
    const showLabel = lod !== 'far' && (!claimLabel || claimLabel(e.x, e.y + 30, a.name.length * 8 + 16, 38, hovered || selected));
    if (showLabel) label(ctx, a.name, e.x, e.y + 22, 15, theme.title);
    if (showLabel && lod === 'near') label(ctx, a.activity, e.x, e.y + 40, 12, theme.muted);
  },
  task(e, { ctx, lod }, { hovered, selected }) {
    const t = e.task;
    ctx.beginPath(); ctx.arc(e.x, e.y, selected || hovered ? 9 : 7, 0, Math.PI * 2); ctx.fillStyle = TASK_COLOR[t.status] ?? '#aab4c3'; ctx.fill();
    if (selected) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (lod === 'near' && (hovered || selected)) label(ctx, t.title.slice(0, 40), e.x, e.y - 16, 12, '#e6ebf2');
  },
  system(e, { ctx, time, lod, reducedMotion, theme }, { hovered, selected }) {
    const s = e.system, c = STATE_COLOR[s.state] ?? theme.muted, x = e.x, y = e.y;
    if (s.kind === 'database') {
      // Cylinder.
      ctx.fillStyle = theme.furniture; ctx.fillRect(x - 40, y - 30, 80, 60);
      ctx.beginPath(); ctx.ellipse(x, y + 30, 40, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - 30, 40, 12, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    } else { roundRect(ctx, x - 40, y - 34, 80, 68, 10); ctx.fillStyle = theme.furniture; ctx.fill(); ctx.fillStyle = c; ctx.fillRect(x - 30, y - 24, 60, 10); }
    if (s.state === 'busy' && !reducedMotion) { ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time / 200); ctx.beginPath(); ctx.arc(x + 44, y - 36, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; }
    if (hovered || selected) { roundRect(ctx, x - 50, y - 50, 100, 100, 12); ctx.lineWidth = 3; ctx.strokeStyle = theme.accent; ctx.stroke(); }
    if (lod !== 'far') label(ctx, s.name, x, y + 60, 13, theme.title);
  },
  issue(e, { ctx, time, reducedMotion }, { hovered }) {
    const pulse = reducedMotion ? 1 : 1 + 0.12 * Math.sin(time / 180);
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(pulse, pulse);
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(16, 14); ctx.lineTo(-16, 14); ctx.closePath();
    ctx.fillStyle = e.issue.severity === 'low' ? '#f4b942' : '#ef4b4b'; ctx.fill();
    if (hovered) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    label(ctx, '!', 0, 3, 18, '#fff'); ctx.restore();
  },
  effect(fx, { ctx, time, scene }) {
    if (fx.kind !== 'message') return;
    const a = scene.get(fx.from), b = scene.get(fx.to); if (!a || !b) return;
    const k = Math.min(1, (time - fx.start) / fx.duration);
    const x = a.x + (b.x - a.x) * k, y = a.y - 70 + (b.y - a.y) * k - Math.sin(k * Math.PI) * 80;
    roundRect(ctx, x - 14, y - 10, 28, 20, 3); ctx.fillStyle = '#f1f4f8'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 14, y - 10); ctx.lineTo(x, y + 2); ctx.lineTo(x + 14, y - 10); ctx.strokeStyle = '#5b6576'; ctx.lineWidth = 2; ctx.stroke();
  },
};

export const themes = {
  day: { ground: '#1b2230', corridor: '#262f3f', room: '#222b3a', roomEdge: '#3a465a', furniture: '#323d50', title: '#e6ebf2', muted: '#9aa6b8', accent: '#e21b23', accentSoft: '#ff6b6b', screenGlow: '#7fd1ff' },
};
