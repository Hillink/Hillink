// Pass 5G: the kingdom skin (a skin for render/canvas2d.mjs). It draws the kingdom layout (world/kingdom-layout.mjs):
// structural, chunky and deliberately unfinished art (5H is the art pass), in explicit 2.5D layers:
//
//   farBackground  mountains and sky (never occlude anything)
//   background     the curtain wall and the trees behind the back row
//   ground         grass, the road, district floors, flat marks (rune circle, plot outlines)
//   building       walls, roofs, furniture, construction          } one plane, depth-sorted together, so a character
//   agent          heroes, candidates, the Giant, workers, portals } passes in front of and behind objects
//   foreground     the front fences, hedges and signposts (always in front: nothing walks nearer the camera)
//   overlay        plaques, badges and labels
//
// It reads only what it is handed (the layout, the read-only World, scene entities) and never writes: construction
// looks like its project's canonical stage, a district looks established only when a usable canonical capability backs
// it, and a hero's look comes from its definition (explicit Fantasy appearance first, else the archetype its role maps
// to in themes/fantasy/metaphor.mjs). Nothing here is keyed by an agent id.
import { depthSort, boxBounds } from '../engine/iso.mjs';
import { AGENT } from '../world/scale.mjs';
import { drawCharacter } from './art/character.mjs';
import { dressFor, npcLook } from './art/dress.mjs';
import { statusOf, workChipOf, drawStatusRing, drawEmblem, drawWorkChip, drawCeremony } from './art/status.mjs';
import { prism, poly, shade, glow, INK } from './props.mjs';
import { MATERIALS } from './looks.mjs';
import { rigFor, dress } from './rigs.mjs';
import { blendOf } from '../engine/animation.mjs';
import { PRODUCTIVE_STATES, SITE_STATES, actionText } from '../engine/iso-view.mjs';
import { lookOfNpc } from '../engine/npcs.mjs';
import { hash } from '../engine/ambience.mjs';
import { placeLabel } from './iso-skin.mjs';
import { jobOf } from '../core/job.mjs';
import { PRODUCTIVE_ACTIVITIES as WORKING } from '../core/truth.mjs';
import { definitionOf } from '../core/agents.mjs';
import { resolveAppearance, figureLookOf } from './appearance.mjs';
import { stageIndex } from '../procgen/construction.mjs';
import { ARCHETYPES, CONSTRUCTION_PHASES } from '../themes/fantasy/metaphor.mjs';
import { kingdomLook } from './art/dress.mjs';
import { dressDistrict, KPROPS, WALL_DRESSING, drawWallPiece, tree, tuft, hash as h2 } from './art/kingdom-props.mjs';

const TAU = Math.PI * 2;
// Pass 5H: theme creatures dressed through the shared character rig (not agents: no status, no badge).
const GIANT_LOOK = { skin: '#c9955e', shirt: '#7a6a4a', sleeve: '#c9955e', pants: '#4a3a24', shoes: '#3a2a1a', hair: '#5a3a22', beard: '#5a3a22', beardLong: true, wide: 1.4, belt: '#3a2618' };
const GIANT_PARTS = { hair: 'shaggy', overlays: ['apron'] };
const RANGER_PARTS = { hair: 'short', overlays: ['bow', 'elf-ears', 'quiver'] };
export const KINGDOM_LAYERS = ['farBackground', 'background', 'ground', 'building', 'agent', 'foreground', 'overlay'];
const RANK = { farBackground: 0, background: 1, ground: 2, building: 3, agent: 3, foreground: 4, overlay: 5 };
// Painter's order for the kingdom (pure; tested): layers in order; the building and agent planes are one depth-sorted
// band (engine/iso.mjs depthSort) so characters are occluded by what stands in front of them and occlude what stands
// behind. Items: { layer, x0, x1, z0, z1, sb?, bias? }.
export function depthOrder(items) {
  const bands = new Map();
  for (const it of items) { const r = RANK[it.layer] ?? RANK.building; (bands.get(r) ?? bands.set(r, []).get(r)).push(it); }
  return [...bands.keys()].sort((a, b) => a - b).flatMap(r => (r === RANK.building ? depthSort(bands.get(r)) : bands.get(r)));
}

export { kingdomLook };

const font = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, sans-serif`;
function text(ctx, s, x, y, px, color, { align = 'center', weight = 600 } = {}) { ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
function pill(ctx, x, y, lines, { dot, px = 9, pad = 5, bg = '#1a1208e6', border = '#e8c77a55' } = {}) {
  const widths = lines.map((l, i) => { ctx.font = font(i ? px - 1.5 : px, i ? 500 : 700); return ctx.measureText(l).width; });
  const w = Math.max(...widths) + pad * 2 + (dot ? 9 : 0), h = lines.length * (px + 3) + pad;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w, h, 4); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = border; ctx.stroke();
  const left = x - w / 2 + pad + (dot ? 9 : 0);
  if (dot) { ctx.beginPath(); ctx.arc(x - w / 2 + pad + 3, y + pad / 2 + (px + 3) / 2, 3, 0, TAU); ctx.fillStyle = dot; ctx.fill(); }
  lines.forEach((l, i) => text(ctx, l, left, y + pad / 2 + (px + 3) * (i + 0.5), i ? px - 1.5 : px, i ? '#d9c9a6' : '#fff4dc', { align: 'left', weight: i ? 500 : 700 }));
  return { w, h };
}
const STATUS = { waiting: '#f4a23b', idle: '#a9b48a', completed: '#5cc98a', error: '#ef4b4b', offline: '#59616d' };
const PORTAL = { kindling: ['#ffb347', 0.5], binding: ['#6fb4ff', 0.75], open: ['#7ff0ff', 0.9], dim: ['#8a8fa3', 0.35], unstable: ['#ff4b4b', 0.8], stable: ['#ffd76b', 1] };
const GROUND = { gatehouse: '#8f8472', circle: '#6d6a7e', forge: '#6b5a48', commons: '#7d8a4e', academy: '#8b8a6a', yard: '#8a7458', library: '#a39a8c', tower: '#8e84a0', keep: '#a8977c', vault: '#8f8a80', dome: '#8e9aa6', engine: '#7d7f8a' };
const WALL = { library: '#b9a784', tower: '#8f80a8', keep: '#c2ae86', vault: '#8d8a84', dome: '#a9b4c0', engine: '#7f8290' };
const ROOF = { library: '#7a4a3a', tower: '#4b3a78', keep: '#6b2f3a', vault: '#4f4b45', dome: '#5b7a9a', engine: '#3f4250' };

export function createKingdomSkin(layout) {
  const { P, districts, walls, solids, plots, road, world } = layout, M = MATERIALS.fantasy, rig = rigFor('fantasy');
  const H = AGENT.height, items = [];
  const add = it => items.push(it);
  const bb = (b, h) => boxBounds(P, { ...b, h1: h }, 0);

  // ---- Far background and background (static). ----
  const W0 = road.x0 - 400, W1 = road.x1 + 400;
  function farBackground(d) {
    const { ctx } = d;
    for (const [z, hMax, col, seed] of [[2600, 620, '#4a3f6e', 1], [2000, 430, '#5d5a86', 2]]) {
      const pts = [P.at(W0, z, 0, -200)];
      for (let x = W0; x <= W1; x += 140) pts.push(P.at(x, z, 0, hMax * (0.45 + 0.55 * hash(x * 0.013 + seed))));
      pts.push(P.at(W1, z, 0, -200)); poly(ctx, pts, col);
      if (z === 2600) for (let x = W0; x <= W1; x += 140) { const h = hMax * (0.45 + 0.55 * hash(x * 0.013 + seed)); if (h > hMax * 0.8) { const [sx, sy] = P.at(x, z, 0, h); poly(ctx, [[sx - 22, sy + 26], [sx, sy], [sx + 22, sy + 26]], '#e9e6f2'); } }
    }
  }
  function background(d) {
    const { ctx } = d;
    poly(ctx, [P.at(W0, 1500, 0, -20), ...Array.from({ length: 30 }, (_, k) => { const x = W0 + (W1 - W0) * k / 29; return P.at(x, 1500, 0, 120 + 90 * hash(k * 1.7)); }), P.at(W1, 1500, 0, -20)], '#4f6b3d');
    // The curtain wall behind the back row, with towers.
    const cz = 1010, top = 110;
    prism(d, 0, { x0: road.x0 + 60, x1: road.x1 - 60, z0: cz, z1: cz + 16, h1: top }, { front: '#8a7d68', side: '#6f6554', top: '#a09380' });
    for (let x = road.x0 + 60; x < road.x1 - 60; x += 26) prism(d, 0, { x0: x, x1: x + 13, z0: cz, z1: cz + 16, h0: top, h1: top + 12 }, { front: '#8a7d68', side: '#6f6554', top: '#a09380' }, { outline: false });
    for (let x = road.x0 + 60; x <= road.x1 - 60; x += 520) { prism(d, 0, { x0: x - 26, x1: x + 26, z0: cz - 10, z1: cz + 30, h1: top + 70 }, { front: '#7e725e', side: '#665d4d', top: '#978a74' }); const [tx, ty] = P.at(x, cz + 10, 0, top + 70); poly(ctx, [[tx - 30, ty], [tx, ty - 34], [tx + 30, ty]], '#6b2f3a', INK, 0.8); }
    for (let k = 0; k < 60; k++) { const x = W0 + 200 + (W1 - W0 - 400) * hash(k * 3.1), z = 1060 + 200 * hash(k * 7.7); const [sx, sy] = P.at(x, z, 0, 0); ctx.fillStyle = '#5b3a22'; ctx.fillRect(sx - 2, sy - 18, 4, 18); ctx.fillStyle = k % 3 ? '#2f5e2f' : '#3d7a3a'; ctx.beginPath(); ctx.arc(sx, sy - 26, 14, 0, TAU); ctx.fill(); }
  }

  // ---- Ground (static). ----
  const flat = (d, r, fill, stroke) => poly(d.ctx, [P.at(r.x0, r.z0, 0), P.at(r.x1, r.z0, 0), P.at(r.x1, r.z1, 0), P.at(r.x0, r.z1, 0)], fill, stroke, 0.8);
  function ground(d) {
    const { ctx } = d;
    poly(ctx, [P.at(W0, -300, 0), P.at(W1, -300, 0), P.at(W1, 1500, 0), P.at(W0, 1500, 0)], '#5a8a3e');
    flat(d, road, '#9c8f7a', '#7d7160');
    ctx.strokeStyle = 'rgba(80,66,50,0.35)'; ctx.lineWidth = 0.7;
    for (let x = road.x0; x < road.x1; x += 22) for (let z = road.z0 + 10; z < road.z1; z += 22) { const [a, b] = P.at(x + (z % 44 ? 11 : 0), z, 0); ctx.strokeRect(a, b - 3, 9, 4); }
    for (const D of Object.values(districts)) {
      flat(d, D, D.established || D.always ? GROUND[D.structure] : 'rgba(120,100,70,0.55)', INK);
      if (!D.established && !D.always) { ctx.save(); ctx.setLineDash([6, 5]); flat(d, { x0: D.x0 + 10, x1: D.x1 - 10, z0: D.z0 + 10, z1: D.z1 - 10 }, null, '#e8d9a8'); ctx.restore(); }
    }
    // Pass 5H: floors by trade (flagstones in the halls, planks in the Academy, cobbles at the Gate, packed earth with
    // soot in the Forge, a meadow with flowers in the Commons), carpets and rugs, and grass tufts on the lawns.
    for (const D of Object.values(districts)) if (D.established || D.always) floorOf(d, D);
    for (let k = 0; k < 420; k++) { const x = W0 + 250 + (W1 - W0 - 500) * h2(k * 1.91), z = -260 + 1480 * h2(k * 7.13); if ((z > road.z0 - 4 && z < road.z1 + 4 && x > road.x0 && x < road.x1) || Object.values(districts).some(D => x > D.x0 - 4 && x < D.x1 + 4 && z > D.z0 - 4 && z < D.z1 + 4)) continue; const [sx, sy] = P.at(x, z, 0); if (k % 9 === 0) { ctx.fillStyle = ['#ff6b8a', '#ffd36b', '#ffffff', '#b58cff'][k % 4]; ctx.beginPath(); ctx.arc(sx, sy - 2, 1.8, 0, TAU); ctx.fill(); } else if (k % 13 === 0) { ctx.fillStyle = '#8d8a84'; ctx.beginPath(); ctx.ellipse(sx, sy, 3.5, 2, 0, 0, TAU); ctx.fill(); } else tuft(d, sx, sy, 3 + h2(k) * 2, k); }
    // A stream across the front meadow (scenery; nobody walks there), with a plank bridge.
    { const pts = []; for (let x = W0; x <= W1; x += 40) pts.push([x, -150 + Math.sin(x * 0.004) * 30]); const up = pts.map(([x, z]) => P.at(x, z + 16, 0)), dn = pts.map(([x, z]) => P.at(x, z - 16, 0)).reverse();
      poly(ctx, [...up, ...dn], '#4f93c4', '#3a6f93', 1.2); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; for (let k = 0; k < 40; k++) { const x = W0 + (W1 - W0) * h2(k * 3.7), z = -150 + Math.sin(x * 0.004) * 30 + (h2(k) - 0.5) * 18, [sx, sy] = P.at(x + (d.reduced ? 0 : (d.T * 12) % 40), z, 0); ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.stroke(); }
      const bx = (road.x0 + road.x1) / 2 - 200, bz = -150 + Math.sin(bx * 0.004) * 30; for (let k = -3; k <= 3; k++) prism(d, 0, { x0: bx - 30, x1: bx + 30, z0: bz + k * 6 - 3, z1: bz + k * 6 + 3, h0: 3, h1: 6 }, col(k % 2 ? '#9b6b3f' : '#a8774a')); }
    // The summoning circle's runes, brighter while candidates are being summoned.
    const S = districts.summoning, cx = (S.x0 + S.x1) / 2, cz = S.z1 - (S.z1 - S.z0) * 0.55, live = [...(d.env.scene?.entities.values() ?? [])].filter(e => e.kind === 'portal').length;
    for (const [rr, col] of [[120, '#b58cff'], [90, '#7ff0ff'], [58, '#b58cff']]) { ctx.strokeStyle = col; ctx.globalAlpha = 0.35 + (live ? 0.35 + 0.2 * Math.sin(d.T * 2) : 0); ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k <= 48; k++) { const a = k / 48 * TAU, [sx, sy] = P.at(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr * 0.8, 0); k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); } ctx.stroke(); ctx.globalAlpha = 1; }
    for (const z of layout.locations.filter(l => l.zone)) { ctx.save(); ctx.setLineDash([3, 4]); flat(d, { x0: z.room.x0 + 3, x1: z.room.x1 - 3, z0: z.room.z0 + 3, z1: z.room.z1 - 3 }, 'rgba(181,140,255,0.08)', 'rgba(181,140,255,0.45)'); ctx.restore(); }
    for (const pl of plots) { ctx.save(); ctx.setLineDash([5, 4]); flat(d, pl.rect, pl.guild ? '#a39a8c' : '#7a6448', '#f2c230'); ctx.restore(); }
  }

  function floorOf(d, D) {
    const { ctx } = d, r = { x0: D.x0 + 2, x1: D.x1 - 2, z0: D.z0 + 2, z1: D.z1 - 2 }, st = D.structure, seed = D.x0 * 0.01;
    const line = (a, b, c, w = 0.8) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...P.at(a[0], a[1], 0)); ctx.lineTo(...P.at(b[0], b[1], 0)); ctx.stroke(); };
    if (D.row === 'back' || st === 'circle' || st === 'gatehouse') {
      const t = st === 'gatehouse' ? 16 : 28, dark = 'rgba(40,30,20,0.28)';
      for (let z = r.z0, row = 0; z < r.z1; z += t, row++) { line([r.x0, z], [r.x1, z], dark); for (let x = r.x0 + (row % 2 ? t / 2 : 0); x < r.x1; x += t) { line([x, z], [x, Math.min(r.z1, z + t)], dark, 0.6); const v = h2(x * 0.37 + z * 0.11 + seed); if (v > 0.8) flat(d, { x0: x + 1, x1: Math.min(r.x1, x + t - 1), z0: z + 1, z1: Math.min(r.z1, z + t - 1) }, v > 0.9 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'); } }
    } else if (st === 'academy') {
      for (let z = r.z0; z < r.z1; z += 12) line([r.x0, z], [r.x1, z], 'rgba(60,40,20,0.3)');
      for (let k = 0; k < 40; k++) { const z = r.z0 + Math.floor(h2(k + seed) * (r.z1 - r.z0) / 12) * 12, x = r.x0 + h2(k * 3 + seed) * (r.x1 - r.x0); line([x, z], [x, z + 12], 'rgba(60,40,20,0.3)', 0.6); }
    } else if (st === 'forge' || st === 'yard') {
      for (let k = 0; k < 90; k++) { const x = r.x0 + h2(k * 1.3 + seed) * (r.x1 - r.x0), z = r.z0 + h2(k * 2.9 + seed) * (r.z1 - r.z0), [sx, sy] = P.at(x, z, 0); ctx.fillStyle = k % 3 ? 'rgba(40,30,25,0.35)' : 'rgba(150,140,120,0.5)'; ctx.beginPath(); ctx.ellipse(sx, sy, 2 + h2(k) * 3, 1 + h2(k) * 1.4, 0, 0, TAU); ctx.fill(); }
      if (st === 'yard') for (const dz of [-8, 8]) { const z = (r.z0 + r.z1) / 2 + dz; line([r.x0, z], [r.x1, z], 'rgba(60,45,30,0.35)', 2); }
    } else if (st === 'commons') {
      for (let k = 0; k < 70; k++) { const x = r.x0 + h2(k * 1.7 + seed) * (r.x1 - r.x0), z = r.z0 + h2(k * 4.1 + seed) * (r.z1 - r.z0), [sx, sy] = P.at(x, z, 0); if (k % 4) tuft(d, sx, sy, 3, k); else { ctx.fillStyle = ['#ff6b8a', '#ffd36b', '#ffffff'][k % 3]; ctx.beginPath(); ctx.arc(sx, sy - 2, 1.6, 0, TAU); ctx.fill(); } }
    }
    // Carpets and rugs (flat, ground plane).
    const rug = (x0, x1, z0, z1, c, trim) => { flat(d, { x0, x1, z0, z1 }, trim); flat(d, { x0: x0 + 4, x1: x1 - 4, z0: z0 + 4, z1: z1 - 4 }, c); };
    const W = D.x1 - D.x0, Dp = D.z1 - D.z0;
    if (st === 'keep') { rug(D.x0 + W * 0.47, D.x0 + W * 0.53, D.z0 + 4, D.z0 + Dp * 0.62, '#8e2a2a', '#d9b44a'); rug(D.x0 + W * 0.58, D.x0 + W * 0.86, D.z0 + Dp * 0.62, D.z0 + Dp * 0.86, '#8e2a2a', '#d9b44a'); }
    if (st === 'library' || st === 'tower' || st === 'dome') { const c = st === 'tower' ? '#4b2f6e' : st === 'dome' ? '#2a3f6e' : '#6b2f2a'; rug(D.x0 + W * 0.3, D.x0 + W * 0.7, D.z0 + Dp * 0.3, D.z0 + Dp * 0.62, c, '#c8a24a'); }
  }

  // ---- Building plane (static pieces). ----
  const col = c => ({ front: c, side: shade(c, 0.8), top: shade(c, 1.1) });
  for (const w of walls) {
    const D = districts[w.district], back = D.row === 'back', est = D.established || D.always;
    if (!est && back) continue; // an unclaimed plot has no hall
    const t = back ? 8 : 4, h = back && (w.side === 'left' || w.side === 'right') ? 50 : w.h; // a hall's side walls are cut low so its interior reads
    const pieces = [];
    const along = w.a.z === w.b.z ? 'x' : 'z', s0 = Math.min(w.a[along], w.b[along]), s1 = Math.max(w.a[along], w.b[along]);
    let cur = s0; for (const o of [...w.openings].sort((a, b) => a.x0 - b.x0)) { pieces.push([cur, o.x0]); cur = o.x1; } pieces.push([cur, s1]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 1) continue;
      const b = along === 'x' ? { x0: p0, x1: p1, z0: w.a.z - (w.side === 'back' ? 0 : t / 2), z1: w.a.z + (w.side === 'back' ? t : t / 2) } : { x0: w.a.x - t / 2, x1: w.a.x + t / 2, z0: p0, z1: p1 };
      const front = !back && w.side === 'front';
      const fence = !back;
      add({ layer: front ? 'foreground' : 'building', ...b, sb: bb(b, h + 10), draw: d => (fence ? drawFence(d, b, h, along) : prism(d, 0, { ...b, h1: h }, col(WALL[D.structure] ?? '#a8977c'))) });
    }
    if (back && w.side === 'back') add({ layer: 'building', x0: D.x0, x1: D.x1, z0: D.z1, z1: D.z1 + t, sb: bb({ x0: D.x0, x1: D.x1, z0: D.z1, z1: D.z1 + t }, h + 140), draw: d => roof(d, D) });
  }
  function drawFence(d, b, h, along) {
    const { ctx } = d, c = '#7a5534';
    const posts = along === 'x' ? Math.max(2, Math.round((b.x1 - b.x0) / 30)) : Math.max(2, Math.round((b.z1 - b.z0) / 30));
    for (let k = 0; k <= posts; k++) { const x = along === 'x' ? b.x0 + (b.x1 - b.x0) * k / posts : (b.x0 + b.x1) / 2, z = along === 'x' ? (b.z0 + b.z1) / 2 : b.z0 + (b.z1 - b.z0) * k / posts; prism(d, 0, { x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2, h1: h }, col(c)); }
    for (const hh of [h * 0.45, h * 0.85]) prism(d, 0, { ...b, h0: hh - 3, h1: hh }, col('#9c6b3f'), { outline: false });
    void ctx;
  }
  function roof(d, D) {
    const { ctx } = d, z = D.z1 + 8, h = 150, x0 = D.x0, x1 = D.x1, cx = (x0 + x1) / 2, p = (x, hh) => P.at(x, z, 0, hh), R = ROOF[D.structure] ?? '#7a4a3a';
    switch (D.structure) {
      case 'keep': {
        poly(ctx, [p(x0, h), p(x0, h + 22), p(x1, h + 22), p(x1, h)], shade(WALL.keep, 0.9), INK, 1);
        for (let x = x0; x < x1; x += 24) poly(ctx, [p(x, h + 22), p(x, h + 34), p(x + 12, h + 34), p(x + 12, h + 22)], WALL.keep, INK, 0.7);
        for (const tx of [x0 + 30, x1 - 30]) { poly(ctx, [p(tx - 30, h), p(tx - 30, h + 90), p(tx + 30, h + 90), p(tx + 30, h)], shade(WALL.keep, 0.95), INK, 1); poly(ctx, [p(tx - 36, h + 90), p(tx, h + 140), p(tx + 36, h + 90)], R, INK, 1); }
        const [fx, fy] = p(cx, h + 34); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 50); ctx.stroke();
        poly(ctx, [[fx, fy - 50], [fx + 30 + Math.sin(d.T * 3) * 3, fy - 44], [fx, fy - 36]], '#1f6b3a', INK, 0.7); glow(d, fx + 8, fy - 44, 10, 'rgba(217,180,74,0.4)');
        break;
      }
      case 'tower': poly(ctx, [p(x0 + 30, h), p(x0 + 30, h + 70), p(x1 - 30, h + 70), p(x1 - 30, h)], shade(WALL.tower, 0.95), INK, 1); poly(ctx, [p(x0 + 20, h + 70), p(cx, h + 170), p(x1 - 20, h + 70)], R, INK, 1); glow(d, ...p(cx, h + 40), 26, 'rgba(181,140,255,0.45)'); break;
      case 'dome': { const pts = []; for (let k = 0; k <= 20; k++) { const a = Math.PI * k / 20; pts.push(p(cx - Math.cos(a) * (x1 - x0) * 0.42, h + Math.sin(a) * 90)); } poly(ctx, pts, R, INK, 1); const [sx, sy] = p(cx + 30, h + 60); ctx.strokeStyle = '#2f3a4a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 36, sy - 30); ctx.stroke(); break; }
      case 'vault': poly(ctx, [p(x0, h), p(x0 + 20, h + 36), p(x1 - 20, h + 36), p(x1, h)], R, INK, 1); for (const x of [x0 + 40, cx, x1 - 40]) poly(ctx, [p(x - 4, 0), p(x - 4, h), p(x + 4, h), p(x + 4, 0)], '#5a5650', null); break;
      case 'engine': poly(ctx, [p(x0, h), p(x0, h + 20), p(x1, h + 20), p(x1, h)], R, INK, 1); for (const x of [x0 + 50, cx, x1 - 50]) { poly(ctx, [p(x - 12, h + 20), p(x - 12, h + 80), p(x + 12, h + 80), p(x + 12, h + 20)], '#5a5c68', INK, 0.8); glow(d, ...p(x, h + 90 + Math.sin(d.T * 2 + x) * 4), 16, 'rgba(127,240,255,0.35)'); } break;
      default: poly(ctx, [p(x0 - 10, h), p(cx, h + 80), p(x1 + 10, h)], R, INK, 1); for (let x = x0 + 40; x < x1 - 30; x += 60) poly(ctx, [p(x, h * 0.55), p(x, h * 0.85), p(x + 18, h * 0.85), p(x + 18, h * 0.55)], '#ffd98a', INK, 0.6);
    }
    const [bx, by] = p(cx, h * 0.62);
    if (D.structure !== 'dome') { poly(ctx, [[bx - 14, by - 22], [bx + 14, by - 22], [bx + 14, by + 10], [bx, by + 18], [bx - 14, by + 10]], ROOF[D.structure] ?? '#6b2f3a', INK, 0.8); text(ctx, D.name[0] === 'T' ? D.name.split(' ')[1][0] : D.name[0], bx, by - 4, 10, '#ffd76b', { weight: 800 }); }
  }
  // Furniture and fixtures (solids), by type.
  const S = (b, c, h) => d => prism(d, 0, { ...b, h1: h }, col(c));
  const DRAW = {
    tower: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#8a7d68')); for (let x = b.x0; x < b.x1; x += 12) prism(d, 0, { x0: x, x1: x + 6, z0: b.z0, z1: b.z1, h0: b.h, h1: b.h + 9 }, col('#8a7d68'), { outline: false }); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h * 0.6); d.ctx.fillStyle = '#2a1d10'; d.ctx.fillRect(sx - 3, sy - 8, 6, 12); },
    beacon: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6f6554')); const alert = [...(d.env.scene?.entities.values() ?? [])].some(e => e.kind === 'golem' && e.derived?.alert); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, b.h + 6); if (alert) { glow(d, sx, sy, 40, 'rgba(255,90,40,0.6)'); flame(d, sx, sy, 10); } else { d.ctx.fillStyle = '#3a2a1a'; d.ctx.fillRect(sx - 6, sy - 2, 12, 4); } },
    anvil: (d, b) => { prism(d, 0, { x0: b.x0 + 8, x1: b.x1 - 8, z0: b.z0 + 4, z1: b.z1 - 4, h1: b.h - 6 }, col('#5b3a22')); prism(d, 0, { ...b, h0: b.h - 6, h1: b.h }, col('#4a4f58')); },
    furnace: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#7a5c48')); prism(d, 0, { x0: b.x0 + 16, x1: b.x0 + 30, z0: b.z0 + 10, z1: b.z0 + 24, h0: b.h, h1: b.h + 40 }, col('#6b4f3c')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h * 0.35); d.ctx.fillStyle = '#ff8a2a'; d.ctx.fillRect(sx - 12, sy - 8, 24, 14); glow(d, sx, sy, 40 + 6 * Math.sin(d.T * 5), 'rgba(255,140,40,0.45)'); },
    quench: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); flat(d, { x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0 + 3, z1: b.z1 - 3 }, '#3f6f8f'); },
    rack: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); for (let x = b.x0 + 10; x < b.x1; x += 16) { const [sx, sy] = P.at(x, b.z0, 0, b.h - 6); d.ctx.strokeStyle = '#9aa3ad'; d.ctx.lineWidth = 2; d.ctx.beginPath(); d.ctx.moveTo(sx, sy); d.ctx.lineTo(sx, sy + 20); d.ctx.stroke(); } },
    campfire: (d, b) => { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU, [sx, sy] = P.at((b.x0 + b.x1) / 2 + Math.cos(a) * 14, (b.z0 + b.z1) / 2 + Math.sin(a) * 10, 0, 2); d.ctx.fillStyle = '#8d8a84'; d.ctx.beginPath(); d.ctx.arc(sx, sy, 3.5, 0, TAU); d.ctx.fill(); } const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 4); flame(d, sx, sy, 12); glow(d, sx, sy - 6, 70, 'rgba(255,160,60,0.35)'); },
    'tavern-table': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#8a5a36')); const [sx, sy] = P.at(b.x0 + 12, (b.z0 + b.z1) / 2, 0, b.h + 4); d.ctx.fillStyle = '#e8c77a'; d.ctx.fillRect(sx - 2, sy - 4, 4, 5); },
    barrel: (d, b) => prism(d, 0, { ...b, h1: b.h }, col('#7a4a26')),
    lectern: (d, b) => { prism(d, 0, { x0: b.x0 + 6, x1: b.x1 - 6, z0: b.z0 + 3, z1: b.z1 - 3, h1: b.h - 6 }, col('#6b4226')); prism(d, 0, { ...b, h0: b.h - 6, h1: b.h }, col('#e9dcb8')); },
    slate: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#2f3a33')); for (let k = 0; k < 4; k++) { const a = P.at(b.x0 + 12, b.z0, 0, b.h - 10 - k * 9), c = P.at(b.x0 + 30 + (k * 23) % 70, b.z0, 0, b.h - 10 - k * 9); d.ctx.strokeStyle = '#e8e8d8'; d.ctx.lineWidth = 0.9; d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...c); d.ctx.stroke(); } },
    dummy: (d, b) => { prism(d, 0, { x0: b.x0 + 6, x1: b.x1 - 6, z0: b.z0 + 6, z1: b.z1 - 6, h1: b.h }, col('#8a6a44')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, b.h + 6); d.ctx.fillStyle = '#c9b27a'; d.ctx.beginPath(); d.ctx.arc(sx, sy, 7, 0, TAU); d.ctx.fill(); },
    shelf: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); for (let k = 1; k < 5; k++) for (let x = b.x0 + 3; x < b.x1 - 6; x += 7) prism(d, 0, { x0: x, x1: x + 5, z0: b.z0 - 1, z1: b.z0 + 2, h0: k * b.h / 5 - 13, h1: k * b.h / 5 - 2 }, col(['#8e2a2a', '#2f5e39', '#3a5a8a', '#b38a4a'][(x + k) % 4 | 0]), { outline: false }); },
    pedestal: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#8f80a8')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, b.h + 7); d.ctx.fillStyle = 'rgba(181,140,255,0.85)'; d.ctx.beginPath(); d.ctx.arc(sx, sy, 7, 0, TAU); d.ctx.fill(); glow(d, sx, sy, 18, 'rgba(181,140,255,0.4)'); },
    crystal: (d, b) => { prism(d, 0, { ...b, h1: 14 }, col('#6d6a7e')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 14); poly(d.ctx, [[sx, sy - 40 - 3 * Math.sin(d.T)], [sx + 12, sy - 14], [sx, sy], [sx - 12, sy - 14]], 'rgba(181,140,255,0.9)', INK, 0.8); glow(d, sx, sy - 20, 40, 'rgba(181,140,255,0.35)'); },
    'council-table': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); flat(d, { x0: b.x0 + 8, x1: b.x1 - 8, z0: b.z0 + 6, z1: b.z1 - 6 }, '#e9dcb8'); },
    throne: (d, b) => { prism(d, 0, { x0: b.x0 - 8, x1: b.x1 + 8, z0: b.z0 - 6, z1: b.z1, h1: 6 }, col('#a8977c')); prism(d, 0, { x0: b.x0 + 4, x1: b.x1 - 4, z0: b.z1 - 7, z1: b.z1, h0: 6, h1: b.h - 14 }, col('#c8a24a')); const [tx, ty] = P.at((b.x0 + b.x1) / 2, b.z1 - 7, 0, b.h - 14); poly(d.ctx, [[tx - 16, ty + 2], [tx - 16, ty - 6], [tx - 9, ty], [tx, ty - 12], [tx + 9, ty], [tx + 16, ty - 6], [tx + 16, ty + 2]], '#f2c94c', INK, 1); d.ctx.fillStyle = '#b3262c'; d.ctx.beginPath(); d.ctx.arc(tx, ty - 4, 2.5, 0, TAU); d.ctx.fill(); poly(d.ctx, [P.at(b.x0 + 8, b.z1 - 7.5, 0, 22), P.at(b.x1 - 8, b.z1 - 7.5, 0, 22), P.at(b.x1 - 8, b.z1 - 7.5, 0, b.h - 20), P.at(b.x0 + 8, b.z1 - 7.5, 0, b.h - 20)], '#8e2a2a', INK, 0.8); for (const x of [b.x0, b.x1 - 8]) prism(d, 0, { x0: x, x1: x + 8, z0: b.z0, z1: b.z1 - 2, h0: 6, h1: 30 }, col('#c8a24a')); prism(d, 0, { x0: b.x0 + 8, x1: b.x1 - 8, z0: b.z0, z1: b.z1 - 7, h0: 6, h1: 22 }, col('#8e2a2a')); glow(d, tx, ty - 4, 30, 'rgba(242,201,76,0.25)'); },
    'counting-table': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); for (let k = 0; k < 4; k++) { const [sx, sy] = P.at(b.x0 + 8 + k * 8, (b.z0 + b.z1) / 2, 0, b.h + 3); d.ctx.fillStyle = '#f5c542'; d.ctx.beginPath(); d.ctx.ellipse(sx, sy, 3.5, 2, 0, 0, TAU); d.ctx.fill(); } },
    'vault-door': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#4f4b45')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h / 2); d.ctx.strokeStyle = '#c8a24a'; d.ctx.lineWidth = 3; d.ctx.beginPath(); d.ctx.arc(sx, sy, 22, 0, TAU); d.ctx.stroke(); },
    telescope: (d, b) => { prism(d, 0, { x0: b.x0 + 8, x1: b.x1 - 8, z0: b.z0 + 8, z1: b.z1 - 8, h1: 20 }, col('#5a5650')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 20); d.ctx.strokeStyle = '#c8a24a'; d.ctx.lineWidth = 6; d.ctx.beginPath(); d.ctx.moveTo(sx - 10, sy + 6); d.ctx.lineTo(sx + 22, sy - 40); d.ctx.stroke(); },
    console: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#3f4250')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h - 6); d.ctx.fillStyle = '#7ff0ff'; d.ctx.fillRect(sx - 8, sy - 3, 16, 5); },
    'engine-core': (d, b) => { prism(d, 0, { ...b, h1: b.h * 0.5 }, col('#3f4250')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, b.h * 0.5); const busy = (d.room('arcane') ?? 0) > 0; for (let k = 0; k < 3; k++) { const a = d.T * (busy ? 3 : 0.6) + k * TAU / 3; d.ctx.fillStyle = '#7ff0ff'; d.ctx.beginPath(); d.ctx.arc(sx + Math.cos(a) * 24, sy - 20 + Math.sin(a) * 8, 4, 0, TAU); d.ctx.fill(); } glow(d, sx, sy - 20, 50, busy ? 'rgba(127,240,255,0.5)' : 'rgba(127,240,255,0.2)'); },
    'portal-arch': (d, b) => { const cx = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2; prism(d, 0, { x0: b.x0, x1: b.x0 + 12, z0: b.z0, z1: b.z1, h1: b.h }, col('#6d6a7e')); prism(d, 0, { x0: b.x1 - 12, x1: b.x1, z0: b.z0, z1: b.z1, h1: b.h }, col('#6d6a7e')); prism(d, 0, { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h0: b.h - 12, h1: b.h }, col('#6d6a7e')); const [sx, sy] = P.at(cx, z, 0, b.h / 2 - 4); d.ctx.fillStyle = 'rgba(127,240,255,0.18)'; d.ctx.beginPath(); d.ctx.ellipse(sx, sy, 16, 34, 0, 0, TAU); d.ctx.fill(); },
    'rune-table': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#5a4a6e')); for (let k = 0; k < 3; k++) { const [sx, sy] = P.at(b.x0 + 12 + k * 13, (b.z0 + b.z1) / 2, 0, b.h + 2); d.ctx.fillStyle = `rgba(181,140,255,${0.5 + 0.4 * Math.sin(d.T * 2 + k)})`; d.ctx.fillRect(sx - 3, sy - 3, 6, 5); } },
    'armoury-rack': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#6b4226')); for (let x = b.x0 + 8; x < b.x1 - 4; x += 12) { const [sx, sy] = P.at(x, b.z0, 0, b.h - 4); d.ctx.fillStyle = '#9aa3ad'; d.ctx.fillRect(sx - 2, sy, 4, 26); } },
    'proving-stone': (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#8d8a84')); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h * 0.6); text(d.ctx, '✦', sx, sy, 10, '#ffd76b', { weight: 800 }); },
    stockpile: (d, b) => { for (let k = 0; k < 6; k++) prism(d, 0, { x0: b.x0 + (k % 3) * 22, x1: b.x0 + (k % 3) * 22 + 20, z0: b.z0 + (k < 3 ? 0 : 18), z1: b.z0 + (k < 3 ? 16 : 34), h1: 10 + (k % 2) * 8 }, col(k % 2 ? '#8d8a84' : '#9c6b3f')); },
    'quest-board': (d, b) => { for (const x of [b.x0 + 4, b.x1 - 4]) prism(d, 0, { x0: x - 2, x1: x + 2, z0: b.z0, z1: b.z1, h1: b.h }, col('#6b4226')); poly(d.ctx, [P.at(b.x0, b.z0, 0, 26), P.at(b.x1, b.z0, 0, 26), P.at(b.x1, b.z0, 0, b.h), P.at(b.x0, b.z0, 0, b.h)], '#b08a5a', INK, 0.8); const [sx, sy] = P.at((b.x0 + b.x1) / 2, b.z0, 0, b.h + 7); text(d.ctx, 'QUESTS', sx, sy, 6.5, '#ffe6a8', { weight: 800 }); },
    well: (d, b) => { prism(d, 0, { ...b, h1: b.h }, col('#8d8a84')); flat(d, { x0: b.x0 + 4, x1: b.x1 - 4, z0: b.z0 + 4, z1: b.z1 - 4 }, '#3f6f8f'); },
  };
  for (const s of solids) add({ layer: 'building', x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, sb: bb(s, s.h + 60), draw: d => (DRAW[s.type] ?? S(s, '#8a7a60', s.h))(d, s) });
  // Pass 5H: set dressing (COSMETIC, static): each district's quiet edges filled with the props of its trade, never on a
  // walk (render/art/kingdom-props.mjs dressDistrict), and wall pieces (torches, banners, windows) on the halls' far walls.
  const nodes = Object.values(layout.nodePlan ?? {}), walks = (layout.navEdges ?? []).map(([a, b]) => [layout.nodePlan[a], layout.nodePlan[b]]).filter(([a, b]) => a && b);
  const zoneRects = layout.locations.filter(l => l.zone).map(l => l.room);
  for (const D of Object.values(districts)) {
    if (!D.established && !D.always) continue;
    const inD = q => q.x >= D.x0 - 2 && q.x <= D.x1 + 2 && q.z >= D.z0 - 2 && q.z <= D.z1 + 2;
    const dressing = dressDistrict(D, { solids: solids.filter(o => o.district === D.id), stations: nodes.filter(inD), plots: D.id === 'yard' ? plots.map(p => p.rect) : [], zones: D.id === 'summoning' ? zoneRects : [], walks: walks.filter(([a, b]) => inD(a) || inD(b)) });
    for (const q of dressing) add({ layer: 'building', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, sb: bb(q, q.h + 50), dressing: q.kind, draw: d => KPROPS[q.kind]?.(d, q) });
    if (D.row === 'back') {
      const pieces = WALL_DRESSING[D.structure] ?? [], n = pieces.length, zw = D.z1 + 0.5;
      pieces.forEach((kind, i) => { const x = D.x0 + (D.x1 - D.x0) * (i + 1) / (n + 1), b = { x0: x - 14, x1: x + 14, z0: zw - 1, z1: zw }; add({ layer: 'building', ...b, bias: -1, sb: bb(b, 150), dressing: `wall-${kind}`, draw: d => drawWallPiece(d, kind, x, zw, 150, D.structure, i) }); });
    }
  }
  // Scenery trees at the kingdom's flanks and along the front meadow (never where anyone walks).
  for (let k = 0; k < 26; k++) {
    const side = k % 2, x = side ? road.x1 + 60 + hash(k * 3.3) * 300 : road.x0 - 60 - hash(k * 3.3) * 300, z = 40 + hash(k * 5.1) * 900, b = { x0: x - 10, x1: x + 10, z0: z - 6, z1: z + 6 };
    add({ layer: 'building', ...b, sb: bb(b, 120), draw: d => { const [sx, sy] = P.at(x, z, 0, 0); tree(d, sx, sy, 34 + hash(k) * 18, k, k % 3 ? 'round' : 'pine'); } });
  }
  // Unclaimed plots: a tent and a sign, never a hall.
  for (const D of Object.values(districts)) if (!D.established && !D.always) {
    const cx = (D.x0 + D.x1) / 2, cz = D.inward > 0 ? D.z1 - 60 : D.z0 + 60, b = { x0: cx - 30, x1: cx + 30, z0: cz - 20, z1: cz + 20 };
    add({ layer: 'building', ...b, sb: bb(b, 60), draw: d => { const p = (x, z, h) => P.at(x, z, 0, h); poly(d.ctx, [p(b.x0, b.z0, 0), p(cx, b.z0, 44), p(b.x1, b.z0, 0)], '#c9b28f', INK, 0.8); poly(d.ctx, [p(b.x1, b.z0, 0), p(cx, b.z0, 44), p(cx, b.z1, 44), p(b.x1, b.z1, 0)], '#a8977c', INK, 0.8); } });
  }
  // Foreground: hedges and a signpost in front of each front-row district.
  for (const D of Object.values(districts).filter(D => D.row === 'front')) {
    for (let x = D.x0 + 10; x < D.x1 - 10; x += 70) { const b = { x0: x, x1: x + 24, z0: 22, z1: 38 }; add({ layer: 'foreground', ...b, sb: bb(b, 30), draw: d => KPROPS[hash(x) > 0.75 ? 'flowers' : 'bush']?.(d, { ...b, h: 16 + 8 * hash(x), seed: x * 0.1 }) }); }
    const sx = D.x0 + 26, b = { x0: sx - 3, x1: sx + 3, z0: 44, z1: 50 };
    add({ layer: 'foreground', ...b, sb: bb(b, 60), draw: d => { prism(d, 0, { ...b, h1: 44 }, col('#6b4226')); const [px, py] = P.at(sx, 44, 0, 44); d.late.push(() => pill(d.ctx, px + 30, py - 6, [D.name, D.established || D.always ? D.represents : 'Unclaimed plot: no such capability in HQ'].map(s => s.slice(0, 48)), { px: 7 })); } });
  }

  // ---- Construction (canonical stage), per plot. ----
  const plotItems = plots.map(pl => {
    const r = pl.rect, u = { x0: r.x0 + 16, x1: r.x1 - 16, z0: r.z0 + 10, z1: r.z0 + (r.z1 - r.z0) * 0.45 };
    return { layer: 'building', ...u, site: pl.project.id, sb: bb({ ...u, x0: u.x0 - 20, x1: u.x1 + 20 }, 200), draw: d => site(d, pl, u) };
  });
  items.push(...plotItems);
  function site(d, pl, u) {
    const { ctx } = d, p = pl.project, st = pl.guild ? stageIndex('operational') : stageIndex(p.stage), at = k => st >= stageIndex(k), pp = (x, z, h = 0) => P.at(x, z, 0, h), HT = 110;
    const stakes = () => { ctx.save(); ctx.strokeStyle = '#f2c230'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1], [u.x0, u.z0]].forEach(([x, z], i) => (i ? ctx.lineTo(...pp(x, z, 8)) : ctx.moveTo(...pp(x, z, 8)))); ctx.stroke(); ctx.restore(); for (const [x, z] of [[u.x0, u.z0], [u.x1, u.z0], [u.x1, u.z1], [u.x0, u.z1]]) prism(d, 0, { x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5, h1: 12 }, col('#c98a2b'), { outline: false }); };
    if (!at('foundation')) {
      flat(d, u, at('site-preparation') ? '#6b5236' : 'rgba(0,0,0,0.06)'); stakes();
      if (!at('site-preparation')) { const [sx, sy] = pp((u.x0 + u.x1) / 2, (u.z0 + u.z1) / 2, 0); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 28); ctx.stroke(); poly(ctx, [[sx, sy - 28], [sx + 16, sy - 23], [sx, sy - 18]], '#8e2a2a'); }
      else for (let k = 0; k < 5; k++) prism(d, 0, { x0: u.x0 + 10 + k * 18, x1: u.x0 + 24 + k * 18, z0: u.z1 - 20, z1: u.z1 - 8, h1: 6 + (k % 2) * 5 }, col('#8d8a84'));
    } else {
      prism(d, 0, { ...u, h0: -3, h1: 5 }, col('#9a958a'));
      if (!at('structure')) stakes();
    }
    if (at('structure') && !pl.guild) {
      const wood = '#7a5534';
      if (at('exterior')) { const stone = '#b0a488', wh = at('furnishing') ? HT : HT * 0.7; prism(d, 0, { x0: u.x0, x1: u.x1, z0: u.z1 - 6, z1: u.z1, h1: wh }, col(stone)); prism(d, 0, { x0: u.x0, x1: u.x0 + 6, z0: u.z0, z1: u.z1, h1: wh }, col(stone)); prism(d, 0, { x0: u.x1 - 6, x1: u.x1, z0: u.z0, z1: u.z1, h1: wh * 0.8 }, col(stone)); }
      for (const x of [u.x0 + 3, (u.x0 + u.x1) / 2, u.x1 - 3]) for (const z of [u.z0 + 3, u.z1 - 3]) prism(d, 0, { x0: x - 2.5, x1: x + 2.5, z0: z - 2.5, z1: z + 2.5, h1: HT }, col(wood));
      prism(d, 0, { x0: u.x0, x1: u.x1, z0: u.z0, z1: u.z0 + 5, h0: HT - 6, h1: HT }, col(wood));
      if (at('systems')) { const [ax, ay] = pp(u.x0, (u.z0 + u.z1) / 2, HT), [bx, by] = pp((u.x0 + u.x1) / 2, (u.z0 + u.z1) / 2, HT + 40), [cx, cy] = pp(u.x1, (u.z0 + u.z1) / 2, HT); ctx.strokeStyle = wood; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke(); for (let k = 0; k < 3; k++) { const [rx, ry] = pp(u.x0 + 20 + k * 30, u.z0 + 4, 40); ctx.fillStyle = `rgba(127,240,255,${0.4 + 0.3 * Math.sin(d.T * 2 + k)})`; ctx.fillRect(rx - 3, ry - 3, 6, 6); } }
      if (at('furnishing') && !at('inspection')) for (let k = 0; k < 3; k++) prism(d, 0, { x0: u.x0 + 12 + k * 26, x1: u.x0 + 30 + k * 26, z0: u.z0 + 10, z1: u.z0 + 24, h1: 14 }, col('#8a6a44'));
      if (!at('inspection')) for (const h of [HT * 0.45, HT * 0.9]) prism(d, 0, { x0: u.x0, x1: u.x1, z0: u.z0 - 12, z1: u.z0 - 8, h0: h - 2, h1: h }, col('#9b7442'), { outline: false });
      if (at('inspection')) { poly(ctx, [pp(u.x0 - 8, u.z1, HT), pp((u.x0 + u.x1) / 2, u.z1, HT + 50), pp(u.x1 + 8, u.z1, HT)], '#6b2f3a', INK, 1); const [sx, sy] = pp(u.x1 - 16, u.z0 - 4, 30); poly(ctx, [[sx - 8, sy - 12], [sx + 8, sy - 12], [sx + 8, sy + 8], [sx, sy + 14], [sx - 8, sy + 8]], '#5b2a86', INK, 0.8); text(ctx, p.approved ? '✓' : '?', sx, sy - 1, 9, '#ffd76b', { weight: 800 }); }
    }
    if (pl.guild) { prism(d, 0, { x0: u.x0, x1: u.x1, z0: u.z0, z1: u.z1, h1: HT }, col('#b0a488')); poly(ctx, [pp(u.x0 - 8, u.z1, HT), pp((u.x0 + u.x1) / 2, u.z1, HT + 50), pp(u.x1 + 8, u.z1, HT)], '#7a4a3a', INK, 1); }
    // Plaque: the canonical stage, in the kingdom's words, and the facts that stop work.
    const [lx, ly] = pp((u.x0 + u.x1) / 2, u.z0, HT + 70);
    d.late.push(() => {
      const ph = CONSTRUCTION_PHASES[pl.guild ? 'operational' : p.stage];
      const lines = [`${pl.guild ? 'Guild hall' : 'Construction'}: ${p.id}`, `${ph?.label ?? p.stage}${p.approved && p.stage === 'inspection' ? ' · approved' : ''}`];
      if (p.blocked) lines.push(`Halted: ${p.blocked}`); else if (p.waiting) lines.push(`Waiting: ${p.waiting}`); else if (p.rework) lines.push('Rework ordered by the Oracle');
      if (layout.world.simulated) lines.push('SIMULATED HQ EVENTS');
      pill(ctx, lx, ly - 12 * lines.length, lines.map(l => String(l).slice(0, 56)), { dot: p.blocked ? '#ef4b4b' : p.waiting ? '#f4a23b' : p.stage === 'inspection' ? '#b58cff' : '#f2c230', px: 8 });
    });
    if (p.blocked) { const [sx, sy] = pp(u.x0 + 10, u.z0 - 6, 34); poly(ctx, [[sx, sy], [sx + 18, sy + 4], [sx, sy + 10]], '#e5484d', INK, 0.8); ctx.strokeStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + 34); ctx.stroke(); }
  }

  // ---- Characters. ----
  function drawHero(d, e) {
    const a = e.agent; if (!a) return;
    const { ctx, env } = d, st = e.anim?.state ?? 'idle', t = (d.now - (e.anim?.since ?? d.now)) / 1000;
    const hovered = env.hoverId === e.id, selected = env.selectedId === e.id;
    if (hovered || selected) { ctx.beginPath(); ctx.ellipse(e.x, e.y + 0.5, e.h * 0.34, e.h * 0.1, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = selected ? '#ffd76b' : '#ffffff'; ctx.stroke(); }
    const dressed = dress(rig, e.anim), dir = e.dir ?? 'front';
    const fig = { x: e.x, y: e.y, h: e.h, dir, posture: e.posture, state: dressed.clip, prev: d.reduced ? null : dressed.prev, blend: blendOf(e.anim, d.now), props: dressed.props, gait: e.gaitAmount ?? 1, t, time: d.reduced ? 0 : d.T + hash(e.id.length), stride: e.stride ?? 0, look: null, use: e.spotInfo?.use, moving: e.moving, alpha: e.staging?.presence === 'candidate' ? 0.9 : a.activity === 'offline' ? 0.82 : 1 };
    // Pass 5H: the shared character rig (render/art/character.mjs), dressed from the same appearance data.
    const D = dressFor(a, 'fantasy'), st5 = statusOf(e, a);
    Object.assign(fig, { look: D.look, parts: D.parts, heading: e.heading });
    drawStatusRing(ctx, e.x, e.y, e.h, st5, d.T, d.reduced);
    const head = drawCharacter(ctx, fig);
    if (st5 === 'completed') drawCeremony(ctx, e.x, e.y, e.h, t, 'fantasy', d.reduced);
    if (selected || hovered || PRODUCTIVE_STATES.has(st) || SITE_STATES.has(st)) d.late.unshift(() => drawCharacter(ctx, { ...fig, alpha: selected ? 0.45 : 0.3 }));
    if (st === 'work' && e.spotInfo?.use === 'work' && !d.reduced && Math.sin(d.T * 8 + e.x) > 0.55) { ctx.fillStyle = '#ffd36b'; for (let k = 0; k < 4; k++) ctx.fillRect(e.x + (dir === 'left' ? -10 : 8) + Math.sin(d.T * 30 + k) * 5, e.y - e.h * 0.35 + Math.cos(d.T * 25 + k) * 4, 1.8, 1.8); }
    d.late.push(() => { const k = Math.min(1.6, Math.max(0.7, 1 / d.env.zoom)); drawEmblem(ctx, e.x, head.top - 9 * k, st5, 'fantasy', k, d.T); const chip = workChipOf(d.env.world, a); if (chip) drawWorkChip(ctx, e.x + 14 * k, head.top - 9 * k, chip, 'fantasy', k); });
    d.late.push(() => badge(d, e, a, head.top - 16 * Math.min(1.6, Math.max(0.7, 1 / d.env.zoom)), hovered, selected));
  }
  function badge(d, e, a, top, hovered, selected) {
    const { ctx, env } = d, zoom = env.zoom, k = Math.min(1.8, Math.max(0.7, 1 / zoom)), cy = top - 4 * k;
    const cand = e.staging?.presence === 'candidate';
    const ring = cand ? '#b58cff' : PRODUCTIVE_STATES.has(e.anim?.state) ? '#34d27b' : WORKING.has(a.activity) ? (e.moving ? '#4aa3ff' : STATUS.idle) : STATUS[a.activity] ?? STATUS.idle;
    if (zoom < 0.6 && !(hovered || selected || cand)) return;
    const job = jobOf(env.world, a), action = cand ? e.staging.caption : actionText(e, layout);
    const lines = hovered || selected || cand ? [a.name, job?.stage && !cand ? `${action} · ${job.stage}` : action] : [a.name];
    const s = 11 / 8 / zoom;
    ctx.font = font(8, 700); const w0 = ctx.measureText(lines[0]).width; ctx.font = font(6.5, 500);
    const w = (Math.max(w0, lines[1] ? ctx.measureText(lines[1]).width : 0) + 19) * s, h = (lines.length * 11 + 5) * s;
    const base = cy - 16 * k - lines.length * 11 * s, ly = placeLabel(env.claimLabel, e.x, base, w, h, hovered || selected, 2 * s);
    ctx.save(); ctx.translate(e.x, ly); ctx.scale(s, s); pill(ctx, 0, 0, lines, { dot: ring, px: 8 }); ctx.restore();
  }
  function drawAmbient(d, e) {
    const dressed = dress(rig, e.anim), t = (d.now - (e.anim?.since ?? d.now)) / 1000;
    const N = npcLook(e.index, 'fantasy', lookOfNpc(e.index, 'fantasy'));
    drawCharacter(d.ctx, { x: e.x, y: e.y, h: e.h, dir: e.dir ?? 'front', heading: e.heading, posture: e.posture, state: dressed.clip, prev: d.reduced ? null : dressed.prev, blend: blendOf(e.anim, d.now), props: dressed.props, gait: e.gaitAmount ?? 1, t, time: d.reduced ? 0 : d.T + e.index * 1.7, stride: e.stride ?? 0, look: N.look, parts: N.parts, use: e.use, moving: e.moving, alpha: 0.9 * e.alpha });
  }
  // Theme entities (DERIVED or COSMETIC): their motion is a function of time only, never a fact.
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
  function thingAt(e, T) {
    const s = e.derived;
    if (s.kind === 'worker') { const k = 0.5 - 0.5 * Math.cos(T * 0.5 + hash(s.project.length)), q = lerp(s.haul.from, s.haul.to, k); return { ...q, dir: Math.sin(T * 0.5 + hash(s.project.length)) > 0 ? 'right' : 'left', moving: true, carrying: Math.sin(T * 0.5) > 0 }; }
    if (s.kind === 'ranger') { const k = 0.5 - 0.5 * Math.cos(T * 0.15), x = s.patrol.x0 + (s.patrol.x1 - s.patrol.x0) * k; return { x, z: s.patrol.z, dir: Math.sin(T * 0.15) > 0 ? 'right' : 'left', moving: !s.alert }; }
    return { ...(s.plan ?? layout.planAt(e.x, e.y)), dir: 'front', moving: false };
  }
  function drawThing(d, e, q) {
    const { ctx } = d, s = e.derived, [x, y] = P.at(q.x, q.z, 0), T = d.reduced ? 0 : d.T;
    switch (s.kind) {
      case 'giant': { const clip = s.work === 'excavating' ? 'dig' : s.work === 'placing stones' ? 'lift' : 'assemble'; drawCharacter(ctx, { x, y, h: e.h, dir: 'left', state: clip, t: T, time: T, look: GIANT_LOOK, parts: GIANT_PARTS, props: rig.props, alpha: 1 }); if (clip === 'lift') { ctx.fillStyle = '#8d8a84'; ctx.beginPath(); ctx.arc(x - e.h * 0.2, y - e.h * 0.95 + Math.sin(T * 1.5) * 6, e.h * 0.12, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); } d.late.push(() => { if (d.env.zoom > 0.8) pill(ctx, x, y - e.h - 22, [`Giant: ${s.work}`], { px: 7 }); }); break; }
      case 'worker': { const N = npcLook(hash(e.id.length) * 97 | 0, 'fantasy', { shirt: '#6f7f5b', pants: '#3a2f22', hair: '#c9b27a', skin: '#e8b890', package: 'crate' }); drawCharacter(ctx, { x, y, h: e.h, dir: q.dir, state: q.carrying ? 'carry' : 'walk', stride: T * 30, gait: 0.8, t: T, time: T, look: N.look, parts: N.parts, alpha: 1, moving: true }); break; }
      case 'cart': { prism(d, 0, { x0: q.x - 18, x1: q.x + 18, z0: q.z - 9, z1: q.z + 9, h0: 6, h1: 16 }, col('#7a5534')); for (const sx of [-12, 12]) { const [wx, wy] = P.at(q.x + sx, q.z - 9, 0, 6); ctx.strokeStyle = INK; ctx.fillStyle = '#5b3a22'; ctx.beginPath(); ctx.arc(wx, wy, 6, 0, TAU); ctx.fill(); ctx.stroke(); } prism(d, 0, { x0: q.x - 14, x1: q.x + 8, z0: q.z - 6, z1: q.z + 6, h0: 16, h1: 24 }, col('#8d8a84')); break; }
      case 'portal': { const [c, a] = PORTAL[s.state] ?? PORTAL.kindling, flick = s.state === 'unstable' ? 0.5 + 0.5 * Math.abs(Math.sin(T * 13)) : 1; ctx.save(); ctx.globalAlpha = a * flick; ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - 30, 16, 28, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = `${c}33`; ctx.fill(); if (s.state !== 'dim') for (let k = 0; k < 3; k++) { const ang = T * 2 + k * TAU / 3; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 10, y - 30 + Math.sin(ang) * 20, 2, 0, TAU); ctx.fill(); } ctx.restore(); glow(d, x, y - 30, 40, `${c}44`); break; }
      case 'ranger': drawCharacter(ctx, { x, y, h: e.h, dir: q.dir, state: q.moving ? 'walk' : 'watch', stride: T * 40, gait: 0.7, t: T, time: T, look: ARCHETYPES.ranger.figure, parts: RANGER_PARTS, alpha: 1, moving: q.moving }); if (s.alert) d.late.push(() => pill(ctx, x, y - e.h - 20, ['Ranger: watching (open issue)'], { px: 7, dot: '#ef4b4b' })); break;
      case 'golem': drawGolem(d, x, y, e.h, s.alert, T); break;
      case 'creature': { ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 7, 4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 6, y - 7, 3, 0, TAU); ctx.fill(); poly(ctx, [[x + 4, y - 9], [x + 5, y - 13], [x + 7, y - 9]], '#3a2a1a'); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.quadraticCurveTo(x - 12, y - 10 + Math.sin(T * 2) * 2, x - 9, y - 13); ctx.stroke(); break; }
      default: break;
    }
  }

  // The Gate Golem (Pass 5H): stacked, rune-cut stone blocks, a glowing core and eyes (cyan at rest, red on a canonical
  // open-issue alert). Deliberately not humanoid-soft like the Giant: square, heavy, still.
  function drawGolem(d, x, y, h, alert, T) {
    const { ctx } = d, glowC = alert ? '#ff4b4b' : '#7ff0ff', sway = d.reduced ? 0 : Math.sin(T * 0.8) * h * 0.01, stone = '#8d8a84';
    const blk = (cx, cy, w, hh, c = stone) => { ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - hh, w, hh, Math.min(w, hh) * 0.18); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - w / 2 + 2, cy - hh + 2, w * 0.35, 2); };
    ctx.fillStyle = 'rgba(12,10,20,0.32)'; ctx.beginPath(); ctx.ellipse(x, y + 1, h * 0.36, h * 0.09, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) blk(x + s * h * 0.12, y, h * 0.17, h * 0.3, '#77746f');
    blk(x + sway, y - h * 0.28, h * 0.5, h * 0.36);
    for (const s of [-1, 1]) blk(x + s * h * 0.33 + sway, y - h * 0.2, h * 0.15, h * 0.4, '#9a968e');
    blk(x + sway * 1.4, y - h * 0.63, h * 0.3, h * 0.24, '#a4a19a');
    ctx.fillStyle = glowC; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sway * 1.4 + s * h * 0.06, y - h * 0.76, h * 0.025, 0, TAU); ctx.fill(); }
    glow(d, x + sway * 1.4, y - h * 0.76, h * 0.2, alert ? 'rgba(255,75,75,0.45)' : 'rgba(127,240,255,0.3)');
    ctx.strokeStyle = glowC; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + sway - h * 0.06, y - h * 0.5); ctx.lineTo(x + sway, y - h * 0.42); ctx.lineTo(x + sway + h * 0.06, y - h * 0.5); ctx.moveTo(x + sway, y - h * 0.42); ctx.lineTo(x + sway, y - h * 0.34); ctx.stroke();
    glow(d, x + sway, y - h * 0.44, h * 0.16, alert ? 'rgba(255,75,75,0.35)' : 'rgba(127,240,255,0.25)');
    for (const [dx, dy] of [[-0.14, -0.4], [0.16, -0.32], [-0.05, -0.2]]) { ctx.fillStyle = '#5d8a4a'; ctx.beginPath(); ctx.ellipse(x + sway + dx * h, y + dy * h, h * 0.04, h * 0.018, 0, 0, TAU); ctx.fill(); }
  }

  // ---- Per frame. ----
  function frame(ctx, env) {
    const now = env.time, T = env.reducedMotion ? 0 : now / 1000;
    const d = { ctx, P, M, T, now, env, lw: 1, reduced: env.reducedMotion, late: env.late, room: id => env.activity?.rooms?.[id] ?? 0 };
    const m = ctx.getTransform().inverse(), c = ctx.canvas, corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const vx0 = Math.min(...corners.map(q => q[0])) - 80, vx1 = Math.max(...corners.map(q => q[0])) + 80, vy0 = Math.min(...corners.map(q => q[1])) - 160, vy1 = Math.max(...corners.map(q => q[1])) + 80;
    const onScreen = it => !it.sb || (it.sb.r >= vx0 && it.sb.l <= vx1 && it.sb.b >= vy0 && it.sb.t <= vy1);
    const list = [{ layer: 'farBackground', draw: farBackground }, { layer: 'background', draw: background }, { layer: 'ground', draw: ground }, ...items.filter(onScreen)];
    const fw = AGENT.footprint.w / 2, fd = AGENT.footprint.d / 2;
    for (const e of env.scene.entities.values()) {
      if (e.kind === 'agent' || e.kind === 'ambient') {
        if (e.kind === 'ambient' && !(e.alpha > 0.01)) continue;
        const pl = layout.planAt(e.x, e.y);
        list.push({ layer: 'agent', x0: pl.x - fw, x1: pl.x + fw, z0: pl.z - fd, z1: pl.z + fd, bias: e.posture === 'sit' ? 1 : 0, sb: { l: e.x - e.h * 0.6, r: e.x + e.h * 0.6, t: e.y - e.h * 1.5, b: e.y + 4 }, entity: e.id, draw: () => (e.kind === 'agent' ? drawHero(d, e) : drawAmbient(d, e)) });
      } else if (e.derived) {
        const q = thingAt(e, T), [x, y] = P.at(q.x, q.z, 0), w = e.kind === 'giant' ? 22 : e.kind === 'cart' ? 20 : fw;
        list.push({ layer: 'agent', x0: q.x - w, x1: q.x + w, z0: q.z - fd, z1: q.z + fd, sb: { l: x - e.h, r: x + e.h, t: y - e.h * 1.3, b: y + 6 }, entity: e.id, draw: () => drawThing(d, e, q) });
      }
    }
    for (const it of depthOrder(list)) it.draw(d);
    for (const id of [env.hoverId, env.selectedId]) {
      const room = id?.startsWith('room:') ? layout.locationById[id.slice(5)] : null;
      if (room) d.late.push(() => { poly(ctx, room.poly, id === env.selectedId ? 'rgba(255,215,107,0.08)' : 'rgba(255,255,255,0.05)', id === env.selectedId ? '#ffd76b' : '#ffffffaa', 1.5); pill(ctx, room.x + room.w / 2, room.y + 4, [room.name, room.represents].map(s => String(s).slice(0, 70)), { px: 10 }); });
    }
    for (const e of env.scene.entities.values()) if (e.kind === 'meeting' && e.meeting) d.late.push(() => { ctx.beginPath(); ctx.roundRect(e.x - 11, e.y - 9, 22, 14, 5); ctx.fillStyle = '#6b2f3a'; ctx.fill(); text(ctx, '⚜', e.x, e.y - 2, 8, '#ffd76b'); });
    if (env.world?.simulated || layout.world.simulated) d.late.push(() => { const [sx, sy] = P.at((road.x0 + road.x1) / 2, KZ_TOP, 0, 0); pill(ctx, sx, sy, ['SIMULATED HQ EVENTS'], { px: 12, dot: '#ffb020' }); });
  }
  const KZ_TOP = 1000;
  function flame(d, x, y, s) { const { ctx } = d, k = d.reduced ? 1 : 1 + 0.15 * Math.sin(d.T * 11 + x); ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.quadraticCurveTo(x - s * 0.4, y - s * 1.2 * k, x, y - s * 1.8 * k); ctx.quadraticCurveTo(x + s * 0.4, y - s * 1.2 * k, x + s * 0.6, y); ctx.fill(); ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.quadraticCurveTo(x, y - s * 1.1 * k, x + s * 0.3, y); ctx.fill(); }

  // Messengers: a canonical agent-to-agent message (the view's message effect) is carried by a fairy.
  function effect(fx, env) {
    if (fx.kind !== 'message') return;
    const a = env.scene?.get(fx.from), b = env.scene?.get(fx.to); if (!a || !b) return;
    const k = Math.max(0, Math.min(1, (env.time - fx.start) / fx.duration)), x = a.x + (b.x - a.x) * k, y = a.y - a.h * 1.1 + (b.y - a.y) * k - Math.sin(k * Math.PI) * 60;
    const { ctx } = env, T = env.reducedMotion ? 0 : env.time / 1000;
    // Pass 5H fairy: a tiny glowing messenger (hair bun, leaf dress, four wings) with a sparkle trail, carrying a letter.
    glow({ ctx }, x, y, 22, 'rgba(159,232,255,0.5)');
    for (let k = 1; k <= 5; k++) { const kk = Math.max(0, k - k * 0.02), px = x - (b.x - a.x) * 0.02 * kk, py = y - (b.y - a.y) * 0.02 * kk + Math.sin(T * 6 + k) * 2; ctx.fillStyle = `rgba(255,243,176,${0.7 - k * 0.12})`; ctx.fillRect(px - 1, py - 1, 2, 2); }
    for (const [s, dy, r] of [[-1, -2, 6], [1, -2, 6], [-1, 3, 4], [1, 3, 4]]) { ctx.save(); ctx.translate(x, y + dy); ctx.rotate(s * (0.5 + Math.sin(T * 22) * 0.45)); ctx.fillStyle = 'rgba(220,245,255,0.8)'; ctx.strokeStyle = 'rgba(120,180,220,0.9)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(s * r, 0, r, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    poly(ctx, [[x - 3, y + 7], [x + 3, y + 7], [x + 1.5, y + 1], [x - 1.5, y + 1]], '#6fd08a', INK, 0.6);
    ctx.fillStyle = '#f6d2b0'; ctx.beginPath(); ctx.arc(x, y - 2, 2.8, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(x, y - 5, 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f3e3bf'; ctx.fillRect(x + 2, y + 1, 5, 3.5); ctx.strokeStyle = INK; ctx.strokeRect(x + 2, y + 1, 5, 3.5); ctx.fillStyle = '#b3262c'; ctx.fillRect(x + 4, y + 2, 1.4, 1.4);
  }

  return {
    id: 'fantasy', kingdom: true, lod: [0.55, 1.35],
    background(ctx, camera) { const gr = ctx.createLinearGradient(0, 0, 0, camera.height); ['#2a1d4a', '#6b4a9c', '#f4a261'].forEach((c, i) => gr.addColorStop(i / 2, c)); ctx.fillStyle = gr; ctx.fillRect(0, 0, camera.width, camera.height); },
    frame, effect,
    // For tests: the static items with their layer, and the per-frame draw list order.
    items,
  };
}
