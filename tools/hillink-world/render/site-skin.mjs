// Pass 5B: the renderer for generated sites (a skin for render/canvas2d.mjs). It draws the canonical procedural
// world through the generated layout (world/generated-layout.mjs), in the same object-built cutaway style as the
// old World and with the same pieces: its furniture props, wall decor, character figures, labels and cars.
//
// Walls come from the geometry, not from a drawing: every edge between two spaces, or between a space and the
// outside, is a wall, cut by the doors on it. Walls facing the camera stay low (the cutaway), walls running into
// the picture are glass partitions above a solid base, the back of the building is solid. Storeys are drawn
// bottom up as an exploded stack (layout.pitch), each in depth order.
//
// Construction is drawn from canonical state only (procgen/construction.mjs): a project's structures look like
// their stage (survey tape, cleared ground, slab, frame, walls, services, fit-out, inspection) and never like a
// finished room until HQ has reported them complete.
import { depthSort, boxBounds } from '../engine/iso.mjs';
import { AGENT, ARCH, STREET_SCALE, SIZES } from '../world/scale.mjs';
import { drawFigure } from './figure.mjs';
import { PROPS, chairBack, DECOR, prism, poly, glow, shade, INK } from './props.mjs';
import { MATERIALS, lookFor } from './looks.mjs';
import { vehiclesAt, hash, smoothPolyline } from '../engine/ambience.mjs';
import { PRODUCTIVE_STATES, SITE_STATES, actionText } from '../engine/iso-view.mjs';
import { blendOf } from '../engine/animation.mjs';
import { rigFor, dress } from './rigs.mjs';
import { jobOf } from '../core/job.mjs';
import { PRODUCTIVE_ACTIVITIES as WORKING } from '../core/truth.mjs';
import { placeLabel } from './iso-skin.mjs';
import { STAGE_LABEL, stageIndex } from '../procgen/construction.mjs';
import { represent } from '../procgen/themes.mjs';
import { frames } from '../procgen/camera.mjs';
import { terrainOf } from '../procgen/world.mjs';

const TAU = Math.PI * 2;
const LABEL_PX = 11;
const STATUS = { coding: '#34d27b', thinking: '#34d27b', researching: '#34d27b', testing: '#34d27b', reviewing: '#34d27b', communicating: '#34d27b', waiting: '#f4a23b', idle: '#8aa0b8', completed: '#5cc98a', error: '#ef4b4b', offline: '#59616d' };
const font = (px, weight = 600) => `${weight} ${px}px ui-sans-serif, system-ui, sans-serif`;
const FLOOR_MAT = { lobby: 'tile', passage: 'tile', lounge: 'wood', comms: 'wood', 'comms-like': 'wood', development: 'carpet', workshop: 'carpet', office: 'carpet', command: 'carpet', testing: 'tile', servers: 'tile', 'servers-like': 'tile', archive: 'wood', storage: 'tile', spare: 'tile' };
const WALL_TONE = { lounge: 'lounge', comms: 'lounge', 'comms-like': 'lounge', lobby: 'hall', passage: 'hall', spare: 'hall', storage: 'hall' };
const LOW = ARCH.partitionWainscot; // height of the cut-away walls and of a partition's solid base

function dotColor(e, a) {
  if (PRODUCTIVE_STATES.has(e.anim?.state)) return STATUS.coding;
  if (WORKING.has(a.activity)) return e.moving || e.ride ? '#4aa3ff' : STATUS.idle;
  return STATUS[a.activity] ?? STATUS.idle;
}
function text(ctx, str, x, y, px, color, { align = 'center', weight = 600 } = {}) { ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y); }
function pill(ctx, x, y, lines, { dot, px = 9, pad = 5, bg = '#0b1018e6', border = '#ffffff22' } = {}) {
  const widths = lines.map((l, i) => { ctx.font = font(i ? px - 1.5 : px, i ? 500 : 700); return ctx.measureText(l).width; });
  const w = Math.max(...widths) + pad * 2 + (dot ? 9 : 0), h = lines.length * (px + 3) + pad;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w, h, 5); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = border; ctx.stroke();
  const left = x - w / 2 + pad + (dot ? 9 : 0);
  if (dot) { ctx.beginPath(); ctx.arc(x - w / 2 + pad + 3, y + pad / 2 + (px + 3) / 2, 3, 0, TAU); ctx.fillStyle = dot; ctx.fill(); }
  lines.forEach((l, i) => text(ctx, l, left, y + pad / 2 + (px + 3) * (i + 0.5), i ? px - 1.5 : px, i ? '#b9c3d1' : '#f3f6fa', { align: 'left', weight: i ? 500 : 700 }));
  return { w, h };
}
export function statusLine(e, world, layout) { const job = jobOf(world, e.agent), action = actionText(e, layout); return job?.stage ? `${action} · ${job.stage}` : action; }

// Vehicles drive the built roads of the generated world, one lane each way (plan units: [x, z] polylines).
export function vehicleRoutesOf(layout) {
  const { world, view, U } = layout, lane = STREET_SCALE.lane * 0.5;
  const offset = (pts, k) => pts.map(([x, z], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [x - ((b[1] - a[1]) / L) * k, z + ((b[0] - a[0]) / L) * k]; });
  return Object.values(world.roads).filter(r => r.status === 'built' && r.points.length > 1).map(r => r.points.map(p => { const v = view.toView(p.x, p.y); return [v.x * U, v.z * U]; }))
    .flatMap(pts => [{ points: offset(pts, lane), speed: STREET_SCALE.carSpeed, every: 11, chance: 0.75 }, { points: offset([...pts].reverse(), lane), speed: STREET_SCALE.carSpeed * 0.9, every: 13, chance: 0.65 }])
    // Pass 5C: bends rounded (cars turn through them), slowing in them; faded in and out at the map edge.
    .map(r => ({ ...r, points: smoothPolyline(r.points, STREET_SCALE.car.length * 1.6), bendWindow: STREET_SCALE.car.length * 1.2, fade: STREET_SCALE.car.length * 2.5 }));
}

export function createSiteSkin(layout, skinId = 'real') {
  const rig = rigFor(skinId);
  const debug = skinId === 'blueprint', M = MATERIALS[debug ? 'real' : skinId], B = MATERIALS.blueprint;
  const { P, world, view, U, furnishing } = layout, HT = ARCH.floorHeight, g = P.g;
  const labelOf = new Map(represent(world, debug ? 'real' : skinId).items.map(i => [`${i.primitive}:${i.canonicalId}`, i.label]));
  const rp = s => { const r = view.rectToView(s.rect); return { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U }; };
  const projects = world.projects ?? {};
  const activeProject = s => (s.project && projects[s.project] && !projects[s.project].completed ? projects[s.project] : null);
  const spaces = Object.values(world.spaces);
  // A space is drawn as finished only when it is built and no unfinished project owns it.
  const finished = s => s.status === 'built' && !activeProject(s);

  // ---- Static items per storey (built once per layout). ----
  const staticItems = {}, flats = {};
  const add = (f, item) => (staticItems[f] ||= []).push(item);
  const flat = (f, fn) => (flats[f] ||= []).push(fn);
  for (const s of spaces.filter(s => finished(s) && furnishing[s.id])) {
    const F = furnishing[s.id], f = s.level, r = rp(s), kind = F.kind, locId = Object.values(layout.locations).find(l => l.spaceId === s.id)?.id ?? s.id;
    flat(f, d => floorOf(d, f, r, FLOOR_MAT[kind] ?? 'tile'));
    for (const it0 of F.items) {
      const it = { ...it0, floor: f, x: it0.x * U, z: it0.z * U, w: it0.w * U, d: it0.d * U, h: it0.h * U, room: locId };
      if (it.type === 'rug' || it.type === 'mat') { flat(f, d => PROPS[it.type](d, it)); continue; }
      const b = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 };
      if (it.on) { const base = F.items.find(o => o.id === it.on); if (base) { b.z0 = (base.z - base.d / 2) * U + 0.2; b.z1 = (base.z + base.d / 2) * U; b.bias = 1; } }
      const h = it.h + 30;
      if (it.type === 'chair' || it.type === 'officeChair') {
        const back = chairBack(it);
        add(f, { ...b, sb: boxBounds(P, { ...b, h1: h }, f), draw: d => PROPS[it.type](d, it, 'seat') });
        add(f, { ...back, sb: boxBounds(P, { ...back, h1: h }, f), draw: d => PROPS[it.type](d, it, 'back') });
        continue;
      }
      add(f, { ...b, sb: boxBounds(P, { ...b, h1: h }, f), draw: d => PROPS[it.type]?.(d, it) });
    }
    // Wall decor hangs on this room's back wall.
    for (const w0 of F.decor) {
      const w = { ...w0, floor: f, x0: w0.x0 * U, x1: w0.x1 * U };
      flat(f, d => { const dd = Object.create(d); dd.P = { ...P, g: { ...g, depth: r.z1 } }; DECOR[w.type]?.(dd, w); });
    }
  }
  // Stairs and the elevator shaft (built: a flight and a glass shaft; reserved: a marked-out slot for the future).
  for (const s of spaces.filter(s => s.primitive === 'staircase' || s.primitive === 'elevator')) {
    if (!spaces.find(h => h.id === s.inside && finished(h))) continue;
    const f = s.level, r = rp(s);
    if (s.status !== 'built') { flat(f, d => reserved(d, f, r, s.primitive === 'elevator' ? 'lift' : 'stair')); continue; }
    if (s.primitive === 'staircase') add(f, { ...r, sb: boxBounds(P, { ...r, h1: HT + 10 }, f), draw: d => stair(d, f, r) });
  }
  // Walls, from the finished spaces of each storey.
  for (const f of layout.levels) for (const w of wallsOf(f)) add(f, { ...w.box, bias: w.bias ?? 0, sb: boxBounds(P, { ...w.box, h1: w.h1 }, f), draw: d => wall(d, f, w) });

  function wallsOf(f) {
    const rects = spaces.filter(s => s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    // Where a construction project adjoins the building, the wall it will join through is opened (drawn low).
    const siteRects = spaces.filter(s => s.level === f && activeProject(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const doors = Object.values(world.doors).filter(d => (d.level ?? 0) === f && d.status === 'built').map(d => { const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2); return { a: { x: a.x * U, z: a.z * U }, b: { x: b.x * U, z: b.z * U }, h: (d.height ?? 2.2) * U, kind: d.kind }; });
    const out = [], eq = (a, b) => Math.abs(a - b) < 0.5;
    // Walls across the picture (constant z) and into it (constant x).
    for (const axis of ['z', 'x']) {
      const lines = [...new Set(rects.flatMap(r => (axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1]).map(v => Math.round(v * 2) / 2)))];
      for (const at of lines) {
        const lo = axis === 'z' ? 'x' : 'z';
        const after = rects.filter(r => eq(axis === 'z' ? r.z0 : r.x0, at)), before = rects.filter(r => eq(axis === 'z' ? r.z1 : r.x1, at));
        const cuts = [...new Set([...after, ...before].flatMap(r => [r[`${lo}0`], r[`${lo}1`]]))].sort((a, b) => a - b);
        const lineDoors = doors.filter(d => (axis === 'z' ? eq(d.a.z, at) && eq(d.b.z, at) : eq(d.a.x, at) && eq(d.b.x, at))).map(d => ({ s: Math.min(d.a[lo], d.b[lo]), e: Math.max(d.a[lo], d.b[lo]), h: d.h, kind: d.kind }));
        let run = null;
        const flush = () => { if (run) out.push(run); run = null; };
        for (let k = 0; k < cuts.length - 1; k++) {
          const s = cuts[k], e = cuts[k + 1], mid = (s + e) / 2;
          const hasAfter = after.some(r => r[`${lo}0`] <= mid && r[`${lo}1`] >= mid), hasBefore = before.some(r => r[`${lo}0`] <= mid && r[`${lo}1`] >= mid);
          if (!hasAfter && !hasBefore) { flush(); continue; }
          const opened = siteRects.some(r => (axis === 'z' ? eq(r.z0, at) || eq(r.z1, at) : eq(r.x0, at) || eq(r.x1, at)) && r[`${lo}0`] <= mid && r[`${lo}1`] >= mid);
          const type = axis === 'z' ? (hasAfter && hasBefore ? 'low' : hasBefore ? (opened ? 'low' : 'back') : 'front') : (hasAfter && hasBefore ? 'partition' : hasAfter ? (opened ? 'partition' : 'left') : 'right');
          if (run && run.type === type && eq(run.e, s)) run.e = e; else { flush(); run = { axis, at, type, s, e }; }
        }
        flush();
        for (const w of out.filter(w => w.axis === axis && w.at === at && !w.doors)) w.doors = lineDoors.filter(d => d.e > w.s && d.s < w.e);
      }
    }
    // Break each wall around its doors into pieces, and give each piece its plan box.
    const pieces = [];
    for (const w of out) {
      const full = w.type === 'back' || w.type === 'left', h1 = w.type === 'back' || w.type === 'left' || w.type === 'partition' || w.type === 'right' ? HT : LOW;
      const t = w.type === 'back' ? 6 : w.type === 'left' ? 6 : 3;
      let cur = w.s;
      const openings = [...(w.doors ?? [])].sort((a, b) => a.s - b.s);
      const piece = (s, e, h0 = 0) => {
        if (e - s < 0.5) return;
        const box = w.axis === 'z' ? { x0: s, x1: e, z0: w.type === 'back' ? w.at : w.at - t / 2, z1: w.type === 'back' ? w.at + t : w.at + t / 2 } : { x0: w.type === 'left' ? w.at - t : w.at - t / 2, x1: w.type === 'left' ? w.at : w.at + t / 2, z0: s, z1: e };
        pieces.push({ ...w, box, h0, h1, full, bias: h0 > 0 ? -1 : 0 });
      };
      for (const o of openings) { piece(cur, o.s); if (h1 > o.h && o.kind !== 'opening') piece(o.s, o.e, o.h); cur = o.e; }
      piece(cur, w.e);
    }
    return pieces;
  }
  function wall(d, f, w) {
    const b = w.box, kindTone = M.wallBack.hall;
    if (w.type === 'back') { prism(d, f, { ...b, h0: w.h0, h1: HT }, { front: M.wallBack[wallToneAt(f, b)] ?? kindTone, side: M.wallSide, top: shade(M.wallSide, 0.85) }); if (!w.h0) prism(d, f, { ...b, h1: 5 }, M.wallTrim); return; }
    if (w.type === 'left') { prism(d, f, { ...b, h0: w.h0, h1: HT }, { front: M.exterior, side: M.wallSide, top: M.exteriorDark }); return; }
    if (w.type === 'low' || w.type === 'front') { prism(d, f, { ...b, h0: w.h0, h1: w.h0 ? HT : LOW }, w.type === 'front' ? M.facadeFrame : M.partitionLow); return; }
    // Glass on a solid base: partitions and the right-hand facade.
    if (w.h0 > 0) { prism(d, f, { ...b, h0: w.h0, h1: HT }, M.partitionLow); return; }
    prism(d, f, { ...b, h1: LOW }, w.type === 'right' ? M.facadeFrame : M.partitionLow);
    const p = (x, z, h) => P.at(x, z, f, h);
    poly(d.ctx, [p(b.x1, b.z0, LOW), p(b.x1, b.z1, LOW), p(b.x1, b.z1, HT), p(b.x1, b.z0, HT)], w.type === 'right' ? M.facade : M.glass, M.glassEdge, 0.8);
    d.ctx.strokeStyle = M.frame; d.ctx.lineWidth = 1.1;
    for (let z = b.z0; z <= b.z1 + 0.1; z += Math.max(14, (b.z1 - b.z0) / Math.max(1, Math.round((b.z1 - b.z0) / 30)))) { const a = p(b.x1, z, LOW), c = p(b.x1, z, HT); d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...c); d.ctx.stroke(); }
    const a = p(b.x1, b.z0, HT - 1), c = p(b.x1, b.z1, HT - 1); d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...c); d.ctx.stroke();
  }
  function wallToneAt(f, b) {
    const s = spaces.find(q => q.level === f && finished(q) && furnishing[q.id] && Math.abs(rp(q).z1 - b.z0) < 1 && rp(q).x0 <= (b.x0 + b.x1) / 2 && rp(q).x1 >= (b.x0 + b.x1) / 2);
    return (s && WALL_TONE[furnishing[s.id].kind]) ?? 'eng';
  }
  function floorOf(d, f, r, mat) {
    const { ctx } = d, [c1, c2] = M.floor[mat] ?? M.floor.tile, p = (x, z) => P.at(x, z, f, 0);
    poly(ctx, [p(r.x0, r.z0), p(r.x1, r.z0), p(r.x1, r.z1), p(r.x0, r.z1)], c1);
    ctx.save(); ctx.beginPath(); [p(r.x0, r.z0), p(r.x1, r.z0), p(r.x1, r.z1), p(r.x0, r.z1)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.clip();
    ctx.strokeStyle = c2; ctx.lineWidth = mat === 'carpet' ? 0.5 : 0.9;
    const step = mat === 'wood' ? 7 : mat === 'tile' ? 20 : 10;
    for (let z = r.z0; z <= r.z1; z += step) { ctx.beginPath(); ctx.moveTo(...p(r.x0, z)); ctx.lineTo(...p(r.x1, z)); ctx.stroke(); }
    if (mat === 'tile') for (let x = r.x0; x <= r.x1; x += 20) { ctx.beginPath(); ctx.moveTo(...p(x, r.z0)); ctx.lineTo(...p(x, r.z1)); ctx.stroke(); }
    ctx.restore();
  }
  function reserved(d, f, r, what) {
    const { ctx } = d, p = (x, z) => P.at(x, z, f, 0.3);
    ctx.save(); ctx.setLineDash([5, 4]); poly(ctx, [p(r.x0, r.z0), p(r.x1, r.z0), p(r.x1, r.z1), p(r.x0, r.z1)], 'rgba(0,0,0,0.06)', 'rgba(60,70,85,0.55)', 1); ctx.restore();
    const [x, y] = p((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); text(ctx, what === 'lift' ? 'lift (reserved)' : 'stair (reserved)', x, y, 5.5, 'rgba(40,48,60,0.7)', { weight: 700 });
  }
  function stair(d, f, r) {
    // A flight rising into the picture, drawn as open treads with a slim handrail so the hall behind stays readable.
    const n = 10, depth = (r.z1 - r.z0) / n, top = HT * 0.7, tread = M.fantasy ? '#9c8a70' : '#c9ccd1';
    for (let k = 0; k < n; k++) prism(d, f, { x0: r.x0 + 3, x1: r.x1 - 3, z0: r.z0 + k * depth, z1: r.z0 + (k + 1) * depth, h0: (k / n) * top, h1: ((k + 1) / n) * top }, { front: shade(tread, 0.85), side: shade(tread, 0.7), top: tread });
    const rail = (x, h0) => { const a = P.at(x, r.z0, f, h0 + 26), b = P.at(x, r.z1, f, top + 26); d.ctx.strokeStyle = M.frame; d.ctx.lineWidth = 1.4; d.ctx.beginPath(); d.ctx.moveTo(...a); d.ctx.lineTo(...b); d.ctx.stroke(); };
    rail(r.x1 - 3, 0);
  }

  // ---- Ground: terrain tiles around the settlement, roads, paths, trees. ----
  const t = terrainOf(world), settle = frames(world).settlement, pad = 90, TILE = 8;
  const region = { x0: settle.x - pad, y0: settle.y - pad, x1: settle.x + settle.w + pad, y1: settle.y + settle.h + pad };
  const tiles = [];
  for (let y = Math.max(0, region.y0); y < Math.min(t.size, region.y1); y += TILE) for (let x = Math.max(0, region.x0); x < Math.min(t.size, region.x1); x += TILE) {
    const i = Math.min(t.n - 1, Math.floor(x / t.cell)), j = Math.min(t.n - 1, Math.floor(y / t.cell)), h = t.heights[j * t.n + i];
    const corners = [[x, y], [x + TILE, y], [x + TILE, y + TILE], [x, y + TILE]].map(([X, Y]) => view.toView(X, Y)).map(v => [v.x * U, v.z * U]);
    tiles.push({ pts: corners, water: h <= t.waterLevel, k: Math.max(0, Math.min(1, (h - t.waterLevel) / (t.relief * 0.8))) });
  }
  const wayPts = w => w.points.map(p => { const v = view.toView(p.x, p.y); return [v.x * U, v.z * U]; });
  const strip = (pts, width) => { const out = []; for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * width / 2, nz = (bx - ax) / L * width / 2; out.push([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]); } return out; };
  const roads = Object.values(world.roads).map(r => ({ r, pts: wayPts(r), W: r.width * U })), paths = Object.values(world.paths).map(p => ({ p, pts: wayPts(p), W: p.width * U }));
  const trees = world.environment.filter(e => e.x >= region.x0 && e.x <= region.x1 && e.y >= region.y0 && e.y <= region.y1).map(e => { const v = view.toView(e.x, e.y), hh = SIZES.tree.range[0] + hash(e.x * 7.1 + e.y) * (SIZES.tree.range[1] - SIZES.tree.range[0]); return { e, x: v.x * U, z: v.z * U, h: hh }; });
  for (const tr of trees) {
    const it = { id: tr.e.id, type: tr.e.kind === 'rock' ? 'rock' : tr.e.kind === 'shrub' ? 'shrub' : 'tree', floor: 0, x: tr.x, z: tr.z, w: SIZES.tree.w, d: SIZES.tree.d, h: tr.e.kind === 'shrub' ? 22 : tr.e.kind === 'rock' ? 14 : tr.h };
    const b = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 };
    add(0, { ...b, sb: boxBounds(P, { ...b, h1: it.h + 40 }, 0), tree: true, draw: d => (it.type === 'tree' ? PROPS.tree(d, it) : it.type === 'rock' ? prism(d, 0, { ...b, h1: it.h }, { front: '#8d8a84', side: '#77746f', top: '#a4a19a' }) : PROPS.hedge(d, { ...it, w: 26, d: 18 })) });
  }
  function drawGround(d) {
    const { ctx } = d;
    poly(ctx, [P.at(-2e4, 2e4, 0), P.at(2e4, 2e4, 0), P.at(2e4, -2e4, 0), P.at(-2e4, -2e4, 0)], M.ground);
    for (const tl of tiles) { const c = tl.water ? (M.fantasy ? '#3f6f8f' : '#5b93c0') : shade(M.ground, 0.9 + tl.k * 0.3); poly(ctx, tl.pts.map(([x, z]) => P.at(x, z, 0)), c); }
    for (const { pts, W } of roads) { for (const q of strip(pts, W + 10)) poly(ctx, q.map(([x, z]) => P.at(x, z, 0)), M.pavement); }
    for (const { pts, W } of roads) { for (const q of strip(pts, W)) poly(ctx, q.map(([x, z]) => P.at(x, z, 0)), M.road); ctx.strokeStyle = M.roadLine; ctx.lineWidth = 1.6; ctx.setLineDash([30, 24]); ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(...P.at(x, z, 0)) : ctx.moveTo(...P.at(x, z, 0)))); ctx.stroke(); ctx.setLineDash([]); }
    for (const { pts, W, p } of paths) for (const q of strip(pts, W)) poly(ctx, q.map(([x, z]) => P.at(x, z, 0)), p.status === 'built' ? M.pavement : 'rgba(150,120,80,0.35)');
  }
  const vehicleRoutes = vehicleRoutesOf(layout);
  const CAR = STREET_SCALE.car;
  // Pass 5C: vehicles are oriented boxes that turn with the road (no snapping between two axis-aligned shapes), fade
  // in and out where they enter and leave the map, and show brake lights while slowing to a stop.
  function orientedBox(d, cx, cz, L, W, angle, h0, h1, colors, alpha) {
    const { ctx } = d, fx = Math.cos(angle), fz = Math.sin(angle), sx = -fz, sz = fx;
    const c = [[L, W], [L, -W], [-L, -W], [-L, W]].map(([a, b]) => [cx + fx * a + sx * b, cz + fz * a + sz * b]);
    const faces = [0, 1, 2, 3].map(i => { const a = c[i], b = c[(i + 1) % 4]; return { a, b, z: (a[1] + b[1]) / 2, x: (a[0] + b[0]) / 2 }; });
    faces.sort((p, q) => q.z - p.z || p.x - q.x); // far faces first
    ctx.save(); ctx.globalAlpha *= alpha;
    for (const fc of faces) {
      poly(ctx, [P.at(fc.a[0], fc.a[1], 0, h0), P.at(fc.b[0], fc.b[1], 0, h0), P.at(fc.b[0], fc.b[1], 0, h1), P.at(fc.a[0], fc.a[1], 0, h1)], Math.abs(fc.b[1] - fc.a[1]) > Math.abs(fc.b[0] - fc.a[0]) ? colors.side : colors.front, INK, d.lw * 0.8);
    }
    poly(ctx, c.map(([x, z]) => P.at(x, z, 0, h1)), colors.top, INK, d.lw * 0.8);
    ctx.restore();
    return c;
  }
  function drawVehicle(d, v) {
    const { ctx } = d, L = CAR.length / 2, W = CAR.width / 2, alpha = v.alpha ?? 1;
    if (alpha <= 0.01) return;
    const body = M.fantasy ? '#7a5534' : v.color, fx = Math.cos(v.angle), fz = Math.sin(v.angle);
    ctx.save(); ctx.globalAlpha *= alpha * 0.28;
    const sh = [[L, W], [L, -W], [-L, -W], [-L, W]].map(([a, b]) => P.at(v.x + fx * a - fz * b, v.y + fz * a + fx * b, 0));
    poly(ctx, sh, '#000'); ctx.restore();
    orientedBox(d, v.x, v.y, L, W, v.angle, CAR.wheel * 0.9, CAR.body, { front: shade(body, 0.95), side: shade(body, 0.8), top: shade(body, 1.08) }, alpha);
    if (M.fantasy) { const [lx, ly] = P.at(v.x + fx * L * 0.9, v.y + fz * L * 0.9, 0, CAR.body + 4); ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, TAU); ctx.fill(); ctx.restore(); return; }
    orientedBox(d, v.x - fx * L * 0.08, v.y - fz * L * 0.08, L * 0.58, W * 0.86, v.angle, CAR.body, CAR.height, { front: 'rgba(160,200,235,0.9)', side: 'rgba(120,160,200,0.9)', top: shade(body, 1.12) }, alpha);
    // Lights: headlights ahead, tail lights behind (brighter while stopped).
    ctx.save(); ctx.globalAlpha *= alpha;
    for (const [k, c, r] of [[1, '#fff6c8', 1.6], [-1, v.stopped ? '#ff3b30' : '#b3261e', v.stopped ? 2 : 1.4]]) for (const s of [-1, 1]) {
      const [lx, ly] = P.at(v.x + fx * L * k - fz * W * 0.6 * s, v.y + fz * L * k + fx * W * 0.6 * s, 0, CAR.body * 0.75);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx, ly, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---- Construction sites, drawn from their project's canonical stage. ----
  const sites = [];
  for (const p of Object.values(projects)) {
    if (p.completed && p.stage === 'operational') continue;
    const parts = spaces.filter(s => s.project === p.id && s.primitive !== 'staircase' && s.primitive !== 'elevator' && !finished(s));
    for (const f of [...new Set(parts.map(s => s.level))]) {
      const rs = parts.filter(s => s.level === f).map(s => ({ s, r: rp(s) }));
      const u = { x0: Math.min(...rs.map(q => q.r.x0)), x1: Math.max(...rs.map(q => q.r.x1)), z0: Math.min(...rs.map(q => q.r.z0)), z1: Math.max(...rs.map(q => q.r.z1)) };
      const cap = world.capabilities[p.id], label = `${labelOf.get(`room:${cap?.placement?.spaceId}`) ?? p.id}`;
      sites.push({ p, f, u, rs, label });
    }
  }
  for (const site of sites) add(site.f, { x0: site.u.x0 - 6, x1: site.u.x1 + 6, z0: site.u.z0, z1: site.u.z1, sb: boxBounds(P, { ...site.u, x0: site.u.x0 - 30, x1: site.u.x1 + 30, h1: HT + 60 }, site.f), draw: d => drawSite(d, site) });
  function drawSite(d, { p, f, u, rs, label }) {
    const { ctx } = d, st = stageIndex(p.stage), at = k => st >= stageIndex(k), pp = (x, z, h = 0) => P.at(x, z, f, h), T = d.T;
    const tape = () => { ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 1.6; ctx.beginPath(); [[u.x0 - 6, u.z0 - 6], [u.x1 + 6, u.z0 - 6], [u.x1 + 6, u.z1 + 6], [u.x0 - 6, u.z1 + 6], [u.x0 - 6, u.z0 - 6]].forEach(([x, z], i) => (i ? ctx.lineTo(...pp(x, z, 8)) : ctx.moveTo(...pp(x, z, 8)))); ctx.stroke(); ctx.restore(); for (const [x, z] of [[u.x0 - 6, u.z0 - 6], [u.x1 + 6, u.z0 - 6], [u.x1 + 6, u.z1 + 6], [u.x0 - 6, u.z1 + 6]]) prism(d, f, { x0: x - 1, x1: x + 1, z0: z - 1, z1: z + 1, h1: 10 }, '#c98a2b', { outline: false }); };
    // Ground work.
    if (!at('foundation')) {
      poly(ctx, [pp(u.x0, u.z0), pp(u.x1, u.z0), pp(u.x1, u.z1), pp(u.x0, u.z1)], at('site-preparation') ? (M.fantasy ? '#6b5236' : '#8a7458') : 'rgba(0,0,0,0.05)');
      tape();
      if (!at('site-preparation')) { const [sx, sy] = pp((u.x0 + u.x1) / 2, (u.z0 + u.z1) / 2, 0); ctx.strokeStyle = '#39414b'; ctx.lineWidth = 1; for (const a of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx + a * 14, sy); ctx.stroke(); } prism(d, f, { x0: (u.x0 + u.x1) / 2 - 2, x1: (u.x0 + u.x1) / 2 + 2, z0: (u.z0 + u.z1) / 2 - 2, z1: (u.z0 + u.z1) / 2 + 2, h0: 16, h1: 20 }, '#f2c230'); }
      else { for (const k of [0, 1, 2]) prism(d, f, { x0: u.x0 + 8 + k * 7, x1: u.x0 + 13 + k * 7, z0: u.z0 + 4, z1: u.z0 + 9, h1: 9 }, '#ff7a1a', { outline: false }); pallet(d, f, u.x1 - 34, u.z0 + 8); }
    } else {
      prism(d, f, { ...u, h0: -3, h1: 2 }, { front: '#9aa0a6', side: '#858b91', top: at('exterior') ? shade(M.floor.tile[0], 0.95) : '#b8bcc0' });
      if (!at('structure')) { ctx.strokeStyle = 'rgba(120,70,40,0.6)'; ctx.lineWidth = 0.7; for (let x = u.x0 + 8; x < u.x1; x += 12) { ctx.beginPath(); ctx.moveTo(...pp(x, u.z0, 2.2)); ctx.lineTo(...pp(x, u.z1, 2.2)); ctx.stroke(); } for (let z = u.z0 + 8; z < u.z1; z += 12) { ctx.beginPath(); ctx.moveTo(...pp(u.x0, z, 2.2)); ctx.lineTo(...pp(u.x1, z, 2.2)); ctx.stroke(); } tape(); pallet(d, f, u.x1 - 30, u.z0 + 6); }
    }
    // Frame: columns and beams; then walls; then services; then fit-out.
    if (at('structure')) {
      const cols = []; for (let x = u.x0; x <= u.x1 + 0.1; x += Math.max(40, (u.x1 - u.x0) / Math.max(1, Math.round((u.x1 - u.x0) / 90)))) for (const z of [u.z0, u.z1]) cols.push([x, z]);
      const steel = M.fantasy ? '#6b4a2e' : '#4b5561';
      if (at('exterior')) {
        const wallC = M.fantasy ? '#a58f70' : '#c9cdd2';
        prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z1, z1: u.z1 + 5, h1: HT }, { front: wallC, side: shade(wallC, 0.85), top: shade(wallC, 0.75) });
        prism(d, f, { x0: u.x0 - 5, x1: u.x0, z0: u.z0, z1: u.z1 + 5, h1: HT }, { front: wallC, side: shade(wallC, 0.85), top: shade(wallC, 0.75) });
        prism(d, f, { x0: u.x1, x1: u.x1 + 4, z0: u.z0, z1: u.z1, h1: at('systems') ? LOW : HT * 0.66 }, wallC);
        prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z0 - 2, z1: u.z0 + 2, h1: LOW }, wallC);
        if (at('systems')) for (const { r } of rs) prism(d, f, { x0: r.x0 - 2, x1: r.x0 + 2, z0: r.z0, z1: r.z1, h1: at('furnishing') ? LOW : HT * 0.6 }, M.partitionLow);
      }
      for (const [x, z] of cols) prism(d, f, { x0: x - 2, x1: x + 2, z0: z - 2, z1: z + 2, h1: HT }, steel);
      if (!at('exterior') || !at('furnishing')) prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z0 - 2, z1: u.z0 + 2, h0: HT - 5, h1: HT }, steel);
      if (at('systems') && !at('furnishing')) { ctx.strokeStyle = M.fantasy ? '#b38a4a' : '#8fa3b8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pp(u.x0 + 6, (u.z0 + u.z1) / 2, HT - 12)); ctx.lineTo(...pp(u.x1 - 6, (u.z0 + u.z1) / 2, HT - 12)); ctx.stroke(); ctx.strokeStyle = '#e0a030'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...pp(u.x0 + 10, u.z1 - 4, HT - 20)); ctx.lineTo(...pp(u.x1 - 10, u.z1 - 4, HT - 20)); ctx.stroke(); }
      if (!at('furnishing')) scaffold(d, f, u);
    }
    // Furnishing and inspection: the rooms' furniture, first still crated, then in place.
    if (at('furnishing')) for (const { s } of rs) {
      const F = furnishing[s.id]; if (!F) continue;
      for (const it0 of F.items) {
        const it = { ...it0, floor: f, x: it0.x * U, z: it0.z * U, w: it0.w * U, d: it0.d * U, h: it0.h * U, room: s.id };
        if (!at('inspection') && hash(it0.x * 13 + it0.z) > 0.5) { prism(d, f, { x0: it.x - 8, x1: it.x + 8, z0: it.z - 6, z1: it.z + 6, h1: 12 }, M.fantasy ? '#8a6a44' : '#c8a26a'); continue; }
        if (it.type === 'chair' || it.type === 'officeChair') { PROPS[it.type](d, it, 'seat'); PROPS[it.type](d, it, 'back'); } else PROPS[it.type]?.(d, it);
      }
    }
    // Status: stage plaque, and the facts that stop work.
    const [lx, ly] = pp((u.x0 + u.x1) / 2, u.z0, HT + 16);
    d.late.push(() => {
      const lines = [`${label}: construction`, STAGE_LABEL[p.stage] + (p.approved && p.stage === 'inspection' ? ' · review approved' : '')];
      const dot = p.blocked ? '#ef4b4b' : p.waiting ? '#f4a23b' : p.rework ? '#ff9f43' : p.stage === 'inspection' ? '#5ec8ff' : '#f2c230';
      if (p.blocked) lines.push(`Blocked: ${p.blocked}`); else if (p.waiting) lines.push(`Waiting: ${p.waiting}`); else if (p.rework) lines.push('Rework requested by review');
      if (world.simulated) lines.push('SIMULATED HQ EVENTS');
      pill(ctx, lx, ly - 14 * lines.length, lines.map(l => l.slice(0, 60)), { dot, px: 8.5 });
    });
    if (p.blocked) { const [sx, sy] = pp(u.x0 + 12, u.z0 - 4, 30); ctx.fillStyle = '#e5484d'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; ctx.lineTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8); } ctx.closePath(); ctx.fill(); text(ctx, 'STOP', sx, sy, 4.5, '#fff', { weight: 800 }); }
    if (p.stage === 'inspection') { const [sx, sy] = pp(u.x1 - 14, u.z0 - 4, 26); ctx.fillStyle = '#f5f0e0'; ctx.fillRect(sx - 7, sy - 9, 14, 18); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.strokeRect(sx - 7, sy - 9, 14, 18); for (let k = 0; k < 3; k++) { ctx.fillStyle = p.approved || k < 2 ? '#3ddc84' : '#b9c3d1'; ctx.fillRect(sx - 5, sy - 6 + k * 5, 3, 3); } }
    // Builders at work: sparks where one is assembling.
    if (!p.blocked && !d.reduced && st < stageIndex('inspection') && st >= stageIndex('site-preparation')) { const busy = (d.env.scene ? [...d.env.scene.entities.values()] : []).filter(e => e.kind === 'agent' && e.anim?.state === 'assemble' && !e.moving); for (const e of busy) if (Math.sin(T * 9 + e.x) > 0.6) { ctx.fillStyle = '#ffd36b'; for (let k = 0; k < 3; k++) ctx.fillRect(e.x + 8 + Math.sin(T * 30 + k) * 4, e.y - 26 + Math.cos(T * 25 + k) * 3, 1.6, 1.6); } }
  }
  function pallet(d, f, x, z) { prism(d, f, { x0: x, x1: x + 22, z0: z, z1: z + 14, h1: 3 }, '#9b7442'); prism(d, f, { x0: x + 2, x1: x + 20, z0: z + 2, z1: z + 12, h0: 3, h1: 13 }, M.fantasy ? '#8f8f8f' : '#b5b9be'); }
  function scaffold(d, f, u) { const c = '#c98a2b'; for (let x = u.x0; x <= u.x1 + 0.1; x += Math.max(30, (u.x1 - u.x0) / 4)) prism(d, f, { x0: x - 1, x1: x + 1, z0: u.z0 - 12, z1: u.z0 - 10, h1: HT + 6 }, c, { outline: false }); for (const h of [HT * 0.45, HT]) prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z0 - 13, z1: u.z0 - 9, h0: h - 2, h1: h }, '#9b7442', { outline: false }); }

  // ---- Slabs and plinths: each storey's edge, so the stack reads as one building. ----
  function drawSlabs(d, f) {
    for (const b of Object.values(world.buildings).filter(b => b.levels.includes(f))) {
      const rs = spaces.filter(s => s.buildingId === b.id && s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
      if (!rs.length) continue;
      const x0 = Math.min(...rs.map(r => r.x0)), x1 = Math.max(...rs.map(r => r.x1)), z0 = Math.min(...rs.map(r => r.z0)), z1 = Math.max(...rs.map(r => r.z1));
      const p = (x, z, h) => P.at(x, z, f, h);
      poly(d.ctx, [p(x0 - 6, z0, -g.slab), p(x1 + 4, z0, -g.slab), p(x1 + 4, z0, 0), p(x0 - 6, z0, 0)], M.slab, INK, d.lw);
      poly(d.ctx, [p(x1 + 4, z0, -g.slab), p(x1 + 4, z1 + 6, -g.slab), p(x1 + 4, z1 + 6, 0), p(x1 + 4, z0, 0)], shade(M.slab, 0.8), INK, d.lw);
      // Ceiling light pools.
      for (const r of rs) { const n = Math.max(1, Math.round((r.x1 - r.x0) / 130)); for (let i = 0; i < n; i++) { const [lx, ly] = P.at(r.x0 + (i + 0.5) * (r.x1 - r.x0) / n, (r.z0 + r.z1) / 2, f, 0); glow(d, lx, ly, 60, M.light); } }
    }
  }

  // ---- The elevator car (moves with the lift the WorldView runs). ----
  function carFloor(l, lift) { let best = l.floors[0]; l.floors.forEach((f, i) => { if (lift.y <= l.stops[i] + 0.5) best = f; }); return best; }
  function drawShaft(d, l, f, lift, withCar, riders) {
    const s = l.shaft, p = (x, z, h) => P.at(x, z, f, h), { ctx } = d;
    ctx.strokeStyle = M.liftFrame; ctx.lineWidth = 2;
    for (const x of [s.x0 + 3, s.x1 - 3]) { ctx.beginPath(); ctx.moveTo(...p(x, s.z1 - 2, 0)); ctx.lineTo(...p(x, s.z1 - 2, HT)); ctx.stroke(); }
    if (withCar) drawCar(d, l, lift, riders);
    poly(ctx, [p(s.x1, s.z0, 0), p(s.x1, s.z1, 0), p(s.x1, s.z1, HT), p(s.x1, s.z0, HT)], M.liftGlass, M.glassEdge, 0.8);
    const here = Math.abs(lift.y - l.stops[l.floors.indexOf(f)]) < 1, open = here ? lift.doors : 0, cx = (s.x0 + s.x1) / 2, dw = (s.x1 - s.x0 - 10) / 2;
    for (const side of [-1, 1]) { const a = cx + side * (1 + open * dw), b = a + side * dw; poly(ctx, [p(Math.min(a, b), s.z0, 0), p(Math.max(a, b), s.z0, 0), p(Math.max(a, b), s.z0, 76), p(Math.min(a, b), s.z0, 76)], M.liftGlass, M.liftFrame, 1); }
    poly(ctx, [p(s.x0, s.z0, 76), p(s.x1, s.z0, 76), p(s.x1, s.z0, 82), p(s.x0, s.z0, 82)], M.liftFrame);
    const st = lift.status(), [ix, iy] = p(cx, s.z0, 90); ctx.fillStyle = '#10151f'; ctx.fillRect(ix - 7, iy - 4, 14, 8);
    text(ctx, st.moving ? (lift.target < lift.y ? '▲' : '▼') : String(st.currentFloor ?? ''), ix, iy + 0.5, 6, here ? M.liftAccent : '#6b7a90', { weight: 800 });
  }
  function drawCar(d, l, lift, riders) {
    const { ctx } = d, c = l.car, hc = g.base - c.z * g.sky - lift.y, x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.z - c.d / 2, z1 = c.z + c.d / 2, p = (x, z, h) => P.at(x, z, 0, hc + h);
    poly(ctx, [p(x0, z1, 0), p(x1, z1, 0), p(x1, z1, ARCH.elevator.h), p(x0, z1, ARCH.elevator.h)], shade(M.liftCar, 0.85), INK, d.lw);
    poly(ctx, [p(x0, z0, 0), p(x1, z0, 0), p(x1, z1, 0), p(x0, z1, 0)], shade(M.liftCar, 0.6), INK, d.lw);
    riders.forEach((e, i) => drawAgent(d, e, { dx: (i - (riders.length - 1) / 2) * 10 }));
    poly(ctx, [p(x0, z0, ARCH.elevator.h), p(x1, z0, ARCH.elevator.h), p(x1, z1, ARCH.elevator.h), p(x0, z1, ARCH.elevator.h)], shade(M.liftCar, 1.05), INK, d.lw);
    poly(ctx, [p(x0, z0, ARCH.elevator.h - 4), p(x1, z0, ARCH.elevator.h - 4), p(x1, z0, ARCH.elevator.h), p(x0, z0, ARCH.elevator.h)], M.liftAccent);
  }

  // ---- Characters (the old World's figures, badges and labels). ----
  function drawAgent(d, e, { dx = 0 } = {}) {
    const a = e.agent; if (!a) return;
    const { ctx, env } = d, st = e.anim?.state ?? 'idle', t = (d.now - (e.anim?.since ?? d.now)) / 1000, look = lookFor(skinId, a);
    const x = e.x + dx, y = e.y, hovered = env.hoverId === e.id, selected = env.selectedId === e.id;
    if (hovered || selected) { ctx.beginPath(); ctx.ellipse(x, y + 0.5, e.h * 0.34, e.h * 0.1, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = selected ? '#e21b23' : '#ffffff'; ctx.stroke(); }
    // Pass 5C: the rig dresses the intent (clip and props); the previous clip blends out over BLEND_MS.
    const dressed = dress(rig, e.anim);
    const fig = { x, y, h: e.h, dir: e.dir ?? 'front', posture: e.posture, state: dressed.clip, prev: d.reduced ? null : dressed.prev, blend: blendOf(e.anim, d.now), props: dressed.props, gait: e.gaitAmount ?? 1, t, time: d.reduced ? 0 : d.T + hash(e.id.length), stride: e.stride ?? 0, look, use: e.spotInfo?.use, moving: e.moving, alpha: a.activity === 'offline' ? 0.82 : 1 };
    const head = drawFigure(ctx, fig);
    if (selected || hovered || PRODUCTIVE_STATES.has(st) || SITE_STATES.has(st)) d.late.unshift(() => drawFigure(ctx, { ...fig, alpha: selected ? 0.45 : 0.3 }));
    d.late.push(() => badge(d, e, a, x, head.top, hovered, selected));
  }
  function badge(d, e, a, x, top, hovered, selected) {
    const { ctx, env } = d, zoom = env.zoom, k = Math.min(1.8, Math.max(0.7, 1 / zoom)), cy = top - 4 * k, ring = dotColor(e, a);
    if (a.activity === 'error') { ctx.beginPath(); ctx.arc(x, cy - 8 * k, 5 * k, 0, TAU); ctx.fillStyle = '#e5484d'; ctx.fill(); text(ctx, '!', x, cy - 7.5 * k, 7.5 * k, '#fff', { weight: 800 }); }
    else if (a.activity === 'waiting') { ctx.beginPath(); ctx.arc(x, cy - 8 * k, 5 * k, 0, TAU); ctx.fillStyle = '#f4a23b'; ctx.fill(); }
    if (zoom < 0.7 && !(hovered || selected)) return;
    const lines = hovered || selected ? [a.name, statusLine(e, env.world, layout)] : [a.name];
    const s = LABEL_PX / 8 / zoom;
    ctx.font = font(8, 700); const w0 = ctx.measureText(lines[0]).width; ctx.font = font(6.5, 500);
    const w = (Math.max(w0, lines[1] ? ctx.measureText(lines[1]).width : 0) + 19) * s, h = (lines.length * 11 + 5) * s;
    const base = cy - 16 * k - lines.length * 11 * s, ly = placeLabel(env.claimLabel, x, base, w, h, hovered || selected, 2 * s);
    if (ly !== base) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 0.8 / zoom; ctx.beginPath(); ctx.moveTo(x, ly + h); ctx.lineTo(x, base + h * 0.4); ctx.stroke(); }
    ctx.save(); ctx.translate(x, ly); ctx.scale(s, s); pill(ctx, 0, 0, lines, { dot: ring, px: 8 }); ctx.restore();
  }

  // ---- Per frame. ----
  function frame(ctx, env) {
    const now = env.time, T = env.reducedMotion ? 0 : now / 1000, world0 = env.world ?? { agents: {}, tasks: {}, prs: {}, testRuns: {}, systems: {}, issues: {} };
    const agents = [...env.scene.entities.values()].filter(e => e.kind === 'agent');
    const systems = Object.values(world0.systems ?? {}), sysState = kind => systems.find(s => s.kind === kind)?.state ?? 'unknown';
    const tasks = Object.values(world0.tasks ?? {});
    const d = {
      ctx, P, M, T, now, env, lw: 1, reduced: env.reducedMotion, late: env.late, clock: Date.now(),
      room: id => env.activity?.rooms?.[id] ?? 0, stationActive: key => !!env.activity?.stations?.[key],
      pointBusy: key => agents.some(a => a.spot === key && !a.moving), systemState: sysState, systemColor: () => '#7c8594',
      lastTests: Object.values(world0.testRuns ?? {}).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null,
      openPrs: Object.values(world0.prs ?? {}).filter(p => p.state !== 'merged'), queued: tasks.filter(t => t.status === 'queued' || t.status === 'blocked'), archived: tasks.filter(t => t.status === 'done').length,
      construction: !!env.activity?.construction, meeting: agents.some(a => a.agent?.meetingId && !a.moving),
      counts: { total: agents.length, working: agents.filter(a => WORKING.has(a.agent?.activity)).length, issues: 0 },
      modeLabel: (env.modeLabel ?? '').split(':')[0], modeColor: env.modeLabel?.startsWith('LIVE') ? '#3ddc84' : '#ffb020',
    };
    // What is on screen (world units), so only visible pieces are depth-sorted and drawn.
    const m = ctx.getTransform().inverse(), c = ctx.canvas, corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const vx0 = Math.min(...corners.map(q => q[0])) - 60, vx1 = Math.max(...corners.map(q => q[0])) + 60, vy0 = Math.min(...corners.map(q => q[1])) - 120, vy1 = Math.max(...corners.map(q => q[1])) + 60;
    const onScreen = it => !it.sb || (it.sb.r >= vx0 && it.sb.l <= vx1 && it.sb.b >= vy0 && it.sb.t <= vy1);
    if (debug) return blueprint(d, agents);
    drawGround(d);
    const lifts = Object.values(layout.lifts), inCar = e => (e.ride && ['board', 'ride', 'exit'].includes(e.ride.request.phase)) || e.gait === 'ride';
    const cars = d.reduced ? [] : vehiclesAt(T, vehicleRoutes);
    const fw = AGENT.footprint.w / 2, fd = AGENT.footprint.d / 2;
    const charBox = (e, x, z) => ({ x0: x - fw, x1: x + fw, z0: z - fd, z1: z + fd, bias: e.posture === 'sit' ? 1 : 0, sb: { l: e.x - AGENT.height * 0.45, r: e.x + AGENT.height * 0.45, t: e.y - AGENT.height * 1.5, b: e.y + 4 } });
    for (const f of layout.levels) {
      for (const fn of flats[f] ?? []) fn(d);
      if (f !== 0 || true) drawSlabs(d, f);
      const items = (staticItems[f] ?? []).filter(onScreen);
      for (const e of agents) { if (inCar(e)) continue; const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue; items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAgent(d, e) }); }
      if (f === 0) for (const v of cars) { const L = STREET_SCALE.car.length / 2; const box = { x0: v.x - L, x1: v.x + L, z0: v.y - L, z1: v.y + L }; items.push({ ...box, sb: boxBounds(P, { ...box, h1: STREET_SCALE.car.height + 4 }, 0), draw: () => drawVehicle(d, v) }); }
      for (const l of lifts) if (l.floors.includes(f)) {
        const lift = env.scene.get(`lift:${l.id}:back`)?.lift; if (!lift) continue;
        const withCar = carFloor(l, lift) === f, s = l.shaft;
        items.push({ ...s, sb: boxBounds(P, { ...s, h1: HT + 90 }, f), draw: () => drawShaft(d, l, f, lift, withCar, withCar ? agents.filter(inCar) : []) });
      }
      for (const it of depthSort(items)) it.draw(d);
    }
    for (const id of [env.hoverId, env.selectedId]) {
      const room = id?.startsWith('room:') ? layout.locationById[id.slice(5)] : null;
      if (room) d.late.push(() => { poly(ctx, room.poly, id === env.selectedId ? 'rgba(226,27,35,0.07)' : 'rgba(255,255,255,0.05)', id === env.selectedId ? '#e21b23' : '#ffffffaa', 1.5); pill(ctx, room.x + room.w / 2, room.y + 4, [room.name], { px: 10 }); });
    }
    for (const e of env.scene.entities.values()) if (e.kind === 'meeting' && e.meeting) { const { x: mx, y: my } = e; d.late.push(() => { ctx.beginPath(); ctx.roundRect(mx - 11, my - 9, 22, 14, 5); ctx.fillStyle = '#2f6fd6'; ctx.fill(); for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(mx + i * 5, my - 2, 1.6, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); } }); }
  }

  // ---- Blueprint: the generated geometry and navigation as a debug drawing. ----
  function blueprint(d, agents) {
    const { ctx } = d, line = (pts, c, w = 1, close = true) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
    for (const s of spaces) { const r = rp(s), f = s.level, p = (x, z) => P.at(x, z, f, 0); line([p(r.x0, r.z0), p(r.x1, r.z0), p(r.x1, r.z1), p(r.x0, r.z1)], s.status === 'built' ? B.line : B.lift, s.primitive === 'room' ? 1.2 : 0.7); if (s.primitive === 'room') { const [lx, ly] = p(r.x0 + 6, r.z0 + 6); text(ctx, `${labelOf.get(`room:${s.id}`) ?? s.id} (${s.id}, ${s.status})`, lx, ly, 6.5, B.text, { align: 'left', weight: 700 }); } }
    for (const [a, b] of layout.navEdges) { const A = layout.navNodes[a], Bn = layout.navNodes[b]; line([A, Bn], layout.liftOf[a] && layout.liftOf[b] ? B.lift : B.edge, 1, false); }
    for (const [id, [x, y]] of Object.entries(layout.navNodes)) { const st = Object.values(layout.stationInfo).find(s => s.id === id); ctx.beginPath(); ctx.arc(x, y, st ? 3 : 1.6, 0, TAU); ctx.fillStyle = st ? B.point : B.node; ctx.fill(); if (st) text(ctx, `${st.use} ${st.pose}`, x + 4, y - 5, 5.5, B.point, { align: 'left' }); }
    for (const e of agents) { if (e.path?.length) line([[e.x, e.y], ...e.path], '#ff7ab6', 1.2, false); drawFigure(ctx, { x: e.x, y: e.y, h: e.h, dir: e.dir ?? 'front', posture: e.posture, state: e.anim?.state ?? 'idle', t: 0, time: d.T, look: { shirt: '#9ecbff', pants: '#6b8fbf', hair: '#e6f1ff', skin: '#cfe3ff' }, alpha: 0.9 }); pill(ctx, e.x, e.y - e.h - 30, [`${e.ref.id}: ${e.anim?.state ?? '?'}`, `${e.agent?.activity ?? '?'} · ${e.spot || 'moving'}`], { dot: STATUS[e.agent?.activity] ?? '#888', px: 7 }); }
  }

  return {
    id: skinId, lod: [0.55, 1.35],
    background(ctx, camera) {
      if (debug) { ctx.fillStyle = B.sky[0]; ctx.fillRect(0, 0, camera.width, camera.height); return; }
      const gr = ctx.createLinearGradient(0, 0, 0, camera.height); M.sky.forEach((c, i) => gr.addColorStop(i / (M.sky.length - 1), c));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, camera.width, camera.height);
    },
    frame,
  };
}
