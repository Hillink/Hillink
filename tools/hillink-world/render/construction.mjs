// Construction sites: a development pass drawn as a structure being built on its planned footprint.
// What is drawn comes only from the pass's derived state (core/construction.mjs): installed pieces are real
// commits, the test rig lights only while CI really runs, the stop sign means the head commit's CI failed,
// the red tag means a review asked for changes, and the finished, lit structure means the pass merged.
import { prism, poly, shade, glow } from './props.mjs';
import { PIECES, STAGE_LABEL } from '../core/construction.mjs';

const TAU = Math.PI * 2;
const has = (pass, piece) => PIECES.indexOf(piece) < pass.pieces;
const font = (px, w = 700) => `${w} ${px}px ui-sans-serif, system-ui, sans-serif`;

// The screen bounds and plan box of a structure (for depth sorting and picking).
export function siteBox(P, s) {
  const [l] = P.at(s.x0, s.z0, s.floor), [r] = P.at(s.x1, s.z1, s.floor);
  const [, b] = P.at(s.x0, s.z0, s.floor, 0), [, t] = P.at(s.x0, s.z1, s.floor, s.h + 40);
  return { x0: s.x0 - 12, x1: s.x1 + 26, z0: s.z0, z1: s.z1, sb: { l: l - 30, r: r + 40, t, b: b + 10 } };
}

export function drawSite(d, pass, s, { builders = 0, sim = false } = {}) {
  const { ctx, P, M } = d, f = s.floor, p = (x, z, h = 0) => P.at(x, z, f, h);
  const { x0, x1, z0, z1, h } = s, accepted = pass.stage === 'accepted';
  const lastPiece = PIECES[Math.max(0, pass.pieces - 1)];
  const frameCol = M.fantasy ? '#6b4a2e' : '#39414b', glassFill = M.fantasy ? 'rgba(255,215,150,0.20)' : 'rgba(170,215,255,0.22)';
  const T = d.reduced ? 0 : d.T;

  // 0 site: survey tape on the ground (only while unfinished).
  if (!accepted) {
    ctx.save(); ctx.setLineDash([5, 4]); ctx.lineDashOffset = -T * 6;
    poly(ctx, [p(x0 - 6, z0 - 6), p(x1 + 6, z0 - 6), p(x1 + 6, z1 + 2), p(x0 - 6, z1 + 2)], 'rgba(255,196,0,0.06)', '#ffc400', 1.4);
    ctx.restore();
  }
  // 1 slab.
  if (has(pass, 'slab')) prism(d, f, { x0, x1, z0, z1, h1: 5 }, M.fantasy ? '#8a7a64' : '#9aa1a8');
  // 4 walls: a low back wall and side walls (drawn early; the front stays open like the rest of the HQ).
  if (has(pass, 'walls')) {
    prism(d, f, { x0, x1, z0: z1 - 5, z1, h0: 5, h1: h - 6 }, M.fantasy ? '#b9a488' : '#d9dde2');
    prism(d, f, { x0, x1: x0 + 5, z0, z1, h0: 5, h1: h - 6 }, M.fantasy ? '#a8977c' : '#c9ced4');
  }
  // 7 fit-out: status boards on the back wall. They show real counts only once the annex is active.
  if (has(pass, 'fit-out')) {
    const board = (bx0, bx1, lines) => {
      poly(ctx, [p(bx0, z1 - 6, 30), p(bx1, z1 - 6, 30), p(bx1, z1 - 6, 62), p(bx0, z1 - 6, 62)], accepted ? (M.fantasy ? '#2a1d4a' : '#10243d') : '#1b2230', '#0a0d12', 0.8);
      if (!accepted) return;
      ctx.font = font(5.5); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((ln, i) => { const [tx, ty] = p(bx0 + 3, z1 - 6, 55 - i * 8); ctx.fillStyle = i ? '#9fd3ff' : '#ffffff'; ctx.fillText(ln, tx, ty); });
    };
    board(x0 + 12, x0 + 50, ['PASSES', `${d.passCounts.accepted} accepted`, `${d.passCounts.active} building`]);
    board(x0 + 56, x1 - 12, ['TEAM', `${d.counts.working} working`, `${d.counts.issues} issues`]);
  }
  // 2 frame: corner columns. 3 beams: the top ring.
  const col = (x, z) => prism(d, f, { x0: x - 2.5, x1: x + 2.5, z0: z - 2.5, z1: z + 2.5, h0: 5, h1: h }, frameCol);
  if (has(pass, 'frame')) { col(x0 + 3, z1 - 3); col(x1 - 3, z1 - 3); col(x0 + 3, z0 + 3); col(x1 - 3, z0 + 3); }
  if (has(pass, 'beams')) {
    prism(d, f, { x0, x1, z0: z1 - 5, z1, h0: h - 5, h1: h }, frameCol);
    prism(d, f, { x0: x1 - 5, x1, z0, z1, h0: h - 5, h1: h }, frameCol);
    prism(d, f, { x0, x1, z0, z1: z0 + 5, h0: h - 5, h1: h }, frameCol);
  }
  // 6 roof.
  if (has(pass, 'roof')) prism(d, f, { x0: x0 - 3, x1: x1 + 3, z0: z0 - 3, z1: z1 + 3, h0: h, h1: h + 6 }, M.fantasy ? '#7a4a3a' : '#5f666f');
  // 5 glass: the east side and the front, drawn last so everything inside reads through it.
  if (has(pass, 'glass')) {
    poly(ctx, [p(x1, z0, 5), p(x1, z1, 5), p(x1, z1, h - 5), p(x1, z0, h - 5)], glassFill, 'rgba(230,245,255,0.5)', 0.8);
    poly(ctx, [p(x0, z0, 5), p(x1, z0, 5), p(x1, z0, h - 5), p(x0, z0, h - 5)], 'rgba(170,215,255,0.10)', 'rgba(230,245,255,0.45)', 0.8);
  }
  // 8 active: the name sign lights up. Only a merge puts this piece in.
  if (accepted) {
    const [sx, sy] = p((x0 + x1) / 2, z0, h + 16);
    poly(ctx, [p(x0 + 16, z0, h + 8), p(x1 - 16, z0, h + 8), p(x1 - 16, z0, h + 22), p(x0 + 16, z0, h + 22)], M.fantasy ? '#3a2b1e' : '#1c2430', '#0a0d12', 0.8);
    ctx.font = font(7.5, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = M.fantasy ? '#ffcf6b' : '#ffffff';
    ctx.fillText(M.fantasy ? 'WAR ROOM' : 'OPERATIONS', sx, sy); glow(d, sx, sy, 34, M.fantasy ? 'rgba(255,190,90,0.25)' : 'rgba(120,190,255,0.22)');
    return;
  }

  // Work in progress: the last installed piece is marked when a review asked for changes or it is being reworked.
  if (pass.stage === 'changes-requested' || pass.stage === 'rework') {
    const [tx, ty] = p(x1 - 10, z0, Math.min(h, 12 + PIECES.indexOf(lastPiece) * 10));
    ctx.fillStyle = pass.stage === 'rework' ? '#ffc400' : '#e5484d'; ctx.beginPath(); ctx.roundRect(tx - 2, ty - 5, 26, 10, 3); ctx.fill();
    ctx.font = font(5.5); ctx.fillStyle = pass.stage === 'rework' ? '#1b1b1b' : '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(pass.stage === 'rework' ? 'REWORK' : 'FIX', tx + 1, ty);
  }
  // Test rig: lights while CI runs; its lamp shows the last result.
  const [rx, ry] = p(x1 + 12, z0 + 8, 0);
  prism(d, f, { x0: x1 + 6, x1: x1 + 18, z0: z0 + 2, z1: z0 + 14, h1: 18 }, M.fantasy ? '#6b5640' : '#59616b');
  const lamp = pass.ci === 'failed' ? '#ef4b4b' : pass.ci === 'passed' ? '#3ddc84' : pass.ci === 'running' ? (Math.sin(T * 6) > 0 ? '#4aa3ff' : '#1f3a66') : '#3a414b';
  ctx.beginPath(); ctx.arc(rx + 3, ry - 22, 3, 0, TAU); ctx.fillStyle = lamp; ctx.fill();
  if (pass.ci === 'running' || pass.ci === 'failed') glow(d, rx + 3, ry - 22, 12, pass.ci === 'failed' ? 'rgba(239,75,75,0.35)' : 'rgba(74,163,255,0.35)');
  // Blocked: a stop sign at the front; nothing is removed.
  if (pass.stage === 'blocked') {
    const [bx, by] = p(x0 - 2, z0 - 8, 0);
    ctx.fillStyle = '#6b6f76'; ctx.fillRect(bx - 0.8, by - 26, 1.6, 26);
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = TAU * (i + 0.5) / 8; ctx.lineTo(bx + Math.cos(a) * 8, by - 30 + Math.sin(a) * 8); } ctx.closePath();
    ctx.fillStyle = '#d93636'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.font = font(4.5, 800); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STOP', bx, by - 30);
  }
  if (pass.stage === 'approved') {
    const [fx, fy] = p(x1 - 4, z1 - 4, h + 2);
    ctx.fillStyle = '#6b6f76'; ctx.fillRect(fx - 0.6, fy - 16, 1.2, 16);
    ctx.beginPath(); ctx.moveTo(fx, fy - 16); ctx.lineTo(fx + 10, fy - 13); ctx.lineTo(fx, fy - 10); ctx.fillStyle = '#3ddc84'; ctx.fill();
  }
  // A small mobile crane, swinging only while a builder is actually on site.
  if (has(pass, 'frame')) {
    const cx = x0 - 4, cz = z1 - 6, [bx, by] = p(cx, cz, h + 34);
    prism(d, f, { x0: cx - 3, x1: cx + 3, z0: cz - 3, z1: cz + 3, h0: 0, h1: h + 34 }, '#e0a526');
    const swing = builders ? Math.sin(T * 0.6) * 0.35 : 0.1, len = 44;
    ctx.strokeStyle = '#e0a526'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(swing) * len, by + Math.sin(swing) * 6); ctx.stroke();
    const hx = bx + Math.cos(swing) * len * 0.8, hy = by + Math.sin(swing) * 5;
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + 18 + (builders ? Math.sin(T * 1.3) * 4 : 0)); ctx.stroke();
  }
  // Plaque at the front corner: the pass, its real stage and its evidence counts.
  const [px, py] = p(x0 - 14, z0 - 30, 0); // left of the builders' spots, clear of the path
  ctx.fillStyle = '#6b6f76'; ctx.fillRect(px - 0.8, py - 14, 1.6, 14);
  const lines = [`${sim ? 'SIMULATED ' : ''}${pass.title?.split(':')[0] ?? pass.id}`, STAGE_LABEL[pass.stage] ?? pass.stage, `${pass.commits} commit${pass.commits === 1 ? '' : 's'}${pass.ci ? ` · CI ${pass.ci}` : ''}`];
  ctx.font = font(5.5); const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 8;
  ctx.fillStyle = sim ? '#4a3a12' : '#16324f'; ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.roundRect(px - 4, py - 16 - lines.length * 7, w, lines.length * 7 + 3, 2); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => { ctx.fillStyle = i ? (i === 1 ? stageColor(pass.stage) : '#cfe3f7') : '#fff'; ctx.font = font(5.5, i ? 600 : 800); ctx.fillText(l, px, py - 13 - (lines.length - i) * 7 + 3.5); });
}

export function stageColor(stage) {
  return { blocked: '#ff8a8a', 'changes-requested': '#ff8a8a', rework: '#ffd34d', approved: '#7ee787', testing: '#9fd3ff', accepted: '#7ee787' }[stage] ?? '#ffe08a';
}
