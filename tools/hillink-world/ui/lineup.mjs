// Pass 5H: the character lineup (a development and review page, not part of the World). It draws every known agent and
// a set of agents the World has never seen (defined only by role and colour) through the same dressing and character
// code the World uses, in both themes: ?theme=real|fantasy&mode=lineup|views|states&zoom=1..
import { DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { dressFor } from '../render/art/dress.mjs';
import { drawCharacter } from '../render/art/character.mjs';
import { STATUS } from '../render/art/tokens.mjs';
import { drawEmblem, drawStatusRing, drawWorkChip, drawCeremony } from '../render/art/status.mjs';

const q = new URLSearchParams(location.search), theme = q.get('theme') === 'fantasy' ? 'fantasy' : 'real', mode = q.get('mode') ?? 'lineup', zoom = Number(q.get('zoom') ?? 1) || 1;
const DYNAMIC = [
  { id: 'dyn-scout', name: 'Scout', role: 'Scout (outreach)', definition: { id: 'dyn-scout', name: 'Scout', role: 'Scout', team: 'Outreach', appearance: { palette: { primary: '#e56b9f' } } } },
  { id: 'dyn-treasurer', name: 'Treasurer', role: 'Treasurer', definition: { id: 'dyn-treasurer', name: 'Treasurer', role: 'Treasurer', team: 'Finance', appearance: { palette: { primary: '#c9a227' } } } },
  { id: 'dyn-oracle', name: 'Oracle', role: 'Reviewer', definition: { id: 'dyn-oracle', name: 'Oracle', role: 'Reviewer', capabilities: ['review-repo'], appearance: { palette: { primary: '#7a4cc2' } } } },
  { id: 'dyn-cyclops', name: 'Cyclops', role: 'Metrics analyst', definition: { id: 'dyn-cyclops', name: 'Cyclops', role: 'Metrics analyst', team: 'Analytics', appearance: { palette: { primary: '#c46a2b' } } } },
  { id: 'agent-5h-unknown-417', name: 'Unknown 417', role: 'Repository inspector', definition: { id: 'agent-5h-unknown-417', name: 'Unknown 417', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#2a9d8f' }, accessories: ['cap'], themes: { fantasy: { archetype: 'elf', palette: { primary: '#2a9d8f' } } } } } },
];
const KNOWN = Object.values(DEFAULT_DEFINITIONS).map(d => ({ id: d.id, name: d.name, role: d.role, kind: d.kind }));
const ROSTER = [...KNOWN, ...DYNAMIC];
Object.assign(document.body.style, { margin: '0', background: '#1b1f2a', overflow: 'hidden' });
const cv = document.getElementById('c'), ctx = cv.getContext('2d'); cv.style.display = 'block';
const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
const BG = theme === 'fantasy' ? ['#7fb069', '#5a9640'] : ['#e8e4dc', '#d6d0c4'];
const label = (s, x, y, px = 13, c = '#1b1f2a') => { ctx.font = `700 ${px}px ui-sans-serif, system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = c; ctx.fillText(s, x, y); };
let time = 0;
function frame() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, BG[0]); g.addColorStop(1, BG[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let yy = 0; yy < H; yy += 40) ctx.fillRect(0, yy, W, 1);
  label(`Hillink World 5H: ${theme === 'fantasy' ? 'Fantasy' : 'Real'} ${mode}`, W / 2, 28, 16);
  if (mode === 'lineup') {
    const h = 150 * zoom, cols = Math.min(ROSTER.length, Math.floor(W / (h * 0.62))), gap = W / (cols + 0.5);
    ROSTER.forEach((a, i) => {
      const row = Math.floor(i / cols), col = i % cols, x = gap * (col + 0.75), y = 90 + h + row * (h + 70);
      const d = dressFor(a, theme);
      drawCharacter(ctx, { x, y, h, dir: 'front', state: 'idle', look: d.look, parts: d.parts, time: 0.2 + i * 0.37, t: 1 });
      label(a.name, x, y + 26, 13); label(a.definition ? `dynamic: ${a.definition.team ?? a.definition.role}` : a.role ?? "", x, y + 42, 10, "#3a4050");
    });
  } else if (mode === 'views') {
    const who = ROSTER.filter(a => (q.get('ids') ?? 'claude,codex,chatgpt,kyle,dyn-treasurer,dyn-cyclops').split(',').includes(a.id)), h = 110 * zoom;
    const headings = [['front', Math.PI / 2], ['3/4 front', Math.PI / 4], ['side', 0], ['3/4 back', -Math.PI / 4], ['back', -Math.PI / 2], ['side (mirrored)', Math.PI]];
    who.forEach((a, r) => { const d = dressFor(a, theme); label(a.name, 60, 90 + r * (h + 40) + h * 0.6, 13); headings.forEach(([n, hd], c) => { const x = 170 + c * (h * 0.9), y = 90 + r * (h + 40) + h; drawCharacter(ctx, { x, y, h, heading: hd, state: 'idle', look: d.look, parts: d.parts, time: 0.3, t: 1 }); if (r === 0) label(n, x, 70, 11); }); });
  } else if (mode === 'states') {
    const who = ROSTER.filter(a => (q.get('ids') ?? 'claude,codex').split(',').includes(a.id)), h = 110 * zoom;
    const states = [['idle', 'idle'], ['walk', 'walk'], ['work', 'assemble'], ['carry', 'carry'], ['talk', 'talk'], ['think', 'watch'], ['inspect', 'inspect'], ['waiting', 'waiting'], ['blocked', 'blocked'], ['celebrate', 'celebrate']];
    who.forEach((a, r) => { const d = dressFor(a, theme); label(a.name, 50, 90 + r * (h + 50) + h * 0.6, 13); states.forEach(([n, clip], c) => { const x = 150 + c * (h * 0.85), y = 90 + r * (h + 50) + h; drawCharacter(ctx, { x, y, h, heading: clip === 'walk' || clip === 'carry' ? 0 : Math.PI / 4, state: clip, moving: clip === 'carry', look: d.look, parts: d.parts, time: time + c, t: (time % 2) + 0.4, stride: time * 40, props: theme === 'fantasy' ? { hammer: 'mallet', tablet: 'scroll' } : {} }); if (r === 0) label(n, x, 70, 11); }); });
  }
  else if (mode === 'status') {
    // One character per status, in both themes: same colour, same pose, the theme's own emblem frame.
    const keys = ['working', 'travelling', 'waiting', 'blocked', 'completed', 'idle', 'offline', 'candidate', 'needs-owner'], h = 90 * zoom, who = ROSTER.find(a => a.id === (q.get('ids') ?? 'claude')) ?? ROSTER[0];
    ['real', 'fantasy'].forEach((th, r) => {
      const D = dressFor(who, th), y = 90 + h * 1.6 + r * (h * 1.6 + 110);
      ctx.fillStyle = th === 'fantasy' ? 'rgba(90,150,64,0.55)' : 'rgba(232,228,220,0.9)'; ctx.fillRect(20, y - h - 60, W - 40, h + 110);
      label(th === 'fantasy' ? 'Fantasy' : 'Real', 60, y - h / 2, 14);
      keys.forEach((k, c) => {
        const x = 170 + c * ((W - 220) / keys.length), S = STATUS[k], clip = { working: 'assemble', travelling: 'walk', waiting: 'waiting', blocked: 'blocked', completed: 'celebrate', idle: 'idle', offline: 'offline', candidate: 'waiting', 'needs-owner': 'waiting' }[k];
        drawStatusRing(ctx, x, y, h, k, time);
        drawCharacter(ctx, { x, y, h, heading: k === 'travelling' ? 0 : Math.PI / 2, state: clip, look: D.look, parts: D.parts, time: 0.4 + c, t: 0.35, stride: 12, moving: k === 'travelling', alpha: k === 'candidate' ? 0.75 : k === 'offline' ? 0.82 : 1 });
        if (k === 'completed') drawCeremony(ctx, x, y, h, 0.45, th);
        drawEmblem(ctx, x, y - h * 1.12, k, th, zoom * 1.1, 0);
        if (k === 'working') drawWorkChip(ctx, x + 18 * zoom, y - h * 1.12, { prId: 'pr', state: 'open' }, th, zoom * 1.1);
        label(S.label, x, y + 24, 11); if (r === 0) label(k, x, y - h - 38, 10, '#3a4050');
      });
    });
  }
  if (q.get('animate')) { time += 1 / 60; requestAnimationFrame(frame); }
}
frame();
window.lineupReady = true;
