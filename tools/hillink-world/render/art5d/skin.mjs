// Pass 5D-A: the Real World visual prototype (opt-in: ?art=5d). A fork of render/site-skin.mjs that keeps every
// piece of generated geometry and truth it draws from (walls cut from spaces and doors, furnishing, anchors, depth
// order, the lift, construction stages, agents and their 5C animation) and replaces the presentation:
//   light.mjs      one sun, face shading, soft baked shadows, ambient occlusion, a cool daylight material palette;
//   textures.mjs   procedural patterns mapped onto the floor plane (oak, carpet tiles, polished concrete, pavers...);
//   ground.mjs     baked terrain, landscaped lawns and beds, roads with shoulders, curbs and markings, vegetation;
//   furniture.mjs  the furniture set, rebuilt; figure.mjs the new characters (same poses and rigs as 5C);
//   this file      architecture (facade, glazing, slabs, parapets, entrance canopy), interior light, vehicles.
// It is a prototype of the art direction, deliberately not yet the default renderer.
import { depthSort, boxBounds } from '../../engine/iso.mjs';
import { AGENT, ARCH, STREET_SCALE, SIZES } from '../../world/scale.mjs';
import { drawFigure5d as drawFigure } from './figure.mjs';
import { MAT, SUN, SHADOW, lit, mix, litBox, litBlob, softShadow } from './light.mjs';
import { TEX, planMatrix, makeCanvas, hash2 } from './textures.mjs';
import { createGround, drawPlant, plantHeight } from './ground.mjs';
import { FURN5 } from './furniture.mjs';
import { PROPS, chairBack, DECOR, prism, poly, glow, shade, INK } from '../props.mjs';
import { MATERIALS, lookFor } from '../looks.mjs';
import { vehiclesAt, hash, smoothPolyline } from '../../engine/ambience.mjs';
import { PRODUCTIVE_STATES, SITE_STATES, actionText } from '../../engine/iso-view.mjs';
import { blendOf } from '../../engine/animation.mjs';
import { rigFor, dress } from '../rigs.mjs';
import { lookOfNpc } from '../../engine/npcs.mjs';
import { jobOf } from '../../core/job.mjs';
import { PRODUCTIVE_ACTIVITIES as WORKING } from '../../core/truth.mjs';
import { placeLabel } from '../iso-skin.mjs';
import { STAGE_LABEL, stageIndex } from '../../procgen/construction.mjs';
import { wind, flutter, cloudShadows, siteMachinery } from '../../engine/environment.mjs';
import { represent } from '../../procgen/themes.mjs';
import { frames } from '../../procgen/camera.mjs';
import { terrainOf } from '../../procgen/world.mjs';

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
function statusLine(e, world, layout) { const job = jobOf(world, e.agent), action = actionText(e, layout); return job?.stage ? `${action} · ${job.stage}` : action; }

// Vehicles drive the built roads of the generated world, one lane each way (plan units: [x, z] polylines).
function vehicleRoutesOf(layout) {
  const { world, view, U } = layout, lane = STREET_SCALE.lane * 0.5;
  const offset = (pts, k) => pts.map(([x, z], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [x - ((b[1] - a[1]) / L) * k, z + ((b[0] - a[0]) / L) * k]; });
  return Object.values(world.roads).filter(r => r.status === 'built' && r.points.length > 1).map(r => r.points.map(p => { const v = view.toView(p.x, p.y); return [v.x * U, v.z * U]; }))
    .flatMap(pts => [{ points: offset(pts, lane), speed: STREET_SCALE.carSpeed, every: 11, chance: 0.75 }, { points: offset([...pts].reverse(), lane), speed: STREET_SCALE.carSpeed * 0.9, every: 13, chance: 0.65 }])
    // Pass 5C: bends rounded (cars turn through them), slowing in them; faded in and out at the map edge.
    .map(r => ({ ...r, points: smoothPolyline(r.points, STREET_SCALE.car.length * 1.6), bendWindow: STREET_SCALE.car.length * 1.2, fade: STREET_SCALE.car.length * 2.5, colors: ['#eef0f2', '#c3cad3', '#2f7df6', '#c9503f', '#3a4555', '#e8b93f', '#f7f7f5'] }));
}

export const STATE_COLOR = { working: '#35c486', travelling: '#4aa3ff', waiting: '#f4a23b', blocked: '#e5484d', done: '#5cc98a', idle: null, offline: '#6b7380' };
// Pass 5E: bodies by rig profile (render/appearance.mjs RIG_PROFILES[].body). Only the humanoid figure exists today; a new
// rig adds its drawer here (same interface as drawFigure) and every agent whose appearance names that rig uses it.
const BODIES = { figure: drawFigure };
export function stateOf(e, a) {
  const st = e.anim?.state, intent = e.anim?.intent;
  if (st === 'frustrated' || intent === 'blocked' || intent === 'recovering' || a.activity === 'error') return 'blocked';
  if (a.activity === 'waiting' || intent === 'attention' || intent === 'waiting') return 'waiting';
  if (a.activity === 'completed' || st === 'file' || st === 'celebrate') return 'done';
  if (e.moving && (e.carrying || e.journey || e.agent?.taskId)) return 'travelling';
  if (['working', 'building', 'investigating', 'testing', 'reviewing', 'meeting'].includes(intent)) return 'working';
  if (a.activity === 'offline') return 'offline';
  return 'idle';
}
// Label level of detail: zoomed out an agent shows only a status pip (the ring and the body carry the rest); closer in
// a compact name chip; its status line only on hover or selection.
export const labelModeOf = (zoom, hovered, selected) => (hovered || selected ? 'full' : zoom < 0.95 ? 'pip' : 'name');

export function createArtSkin(layout, skinId = 'real') {
  const rig = rigFor(skinId);
  const debug = false, B = MATERIALS.blueprint;
  // The daylight palette: the old keys, remapped to the new material vocabulary.
  const M = { ...MATERIALS.real, sky: ['#9ec9ea', '#d7e9f6', '#eef4f8'], wallBack: { lounge: '#f1ebe1', hall: '#eff1f3', eng: '#e7ecf1' }, wallTrim: '#c3c9d0', wallSide: '#dfe3e7',
    slab: '#c7cbcf', slabTop: '#dcdfe2', facade: 'rgba(150,196,228,0.30)', facadeFrame: '#2f3844', frame: '#2f3844', partitionLow: '#d9dee4', glass: 'rgba(190,222,245,0.22)', glassEdge: 'rgba(255,255,255,0.55)',
    exterior: '#eef0f1', exteriorDark: '#c9cdd1', parapet: '#d9dcdf', wood: MAT.woodDark[0], woodLight: MAT.oak[0], metal: MAT.aluminium[0], metalDark: MAT.steel[0], fabric: MAT.fabric[0], leaf: MAT.foliage[0], leafLight: MAT.foliageLight[0], pot: '#e7e3dc',
    screenIdle: '#26323f', screenOn: '#6fb6ff', light: 'rgba(255,252,240,0.16)', lamp: '#fffbea', liftFrame: '#2f3844', liftGlass: 'rgba(190,225,250,0.26)', liftCar: '#eef1f4', liftAccent: '#2f7df6' };
  const ground = createGround(layout);
  // The art hooks the shared props call (render/props.mjs): lit boxes and lit blobs instead of outlined ones.
  const art = { prism: (d, f, b, c, o) => litBox(d, f, b, typeof c === 'string' ? c : { front: c.front, top: c.top }, { alpha: o.alpha }), blob: (d, f, x, z, h, r, fill) => { const [sx, sy] = d.P.at(x, z, f, h); litBlob(d.ctx, sx, sy, r, fill.startsWith('#') ? fill : MAT.foliage[0]); } };
  // Static shadows per storey: every fixed box that stands on a floor casts one, baked once (soft) in plan space.
  const shadowBoxes = {};
  const castShadow = (f, b, h) => { if (h > 1) (shadowBoxes[f] ||= []).push({ ...b, h }); };
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
    flat(f, d => floorOf(d, f, r, null, kind));
    flat(f, d => roomIdentity(d, f, r, kind, s));
    for (const it0 of F.items) {
      const it = { ...it0, floor: f, x: it0.x * U, z: it0.z * U, w: it0.w * U, d: it0.d * U, h: it0.h * U, room: locId };
      if (it.type === 'rug' || it.type === 'mat') { flat(f, d => PROPS[it.type](d, it)); continue; }
      const b = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 };
      if (it.on) { const base = F.items.find(o => o.id === it.on); if (base) { b.z0 = (base.z - base.d / 2) * U + 0.2; b.z1 = (base.z + base.d / 2) * U; b.bias = 1; } }
      const h = it.h + 30;
      if (it.type === 'chair' || it.type === 'officeChair') {
        const back = chairBack(it);
        const draw5 = FURN5[it.type] ?? PROPS[it.type];
        add(f, { ...b, sb: boxBounds(P, { ...b, h1: h }, f), draw: d => draw5(d, it, 'seat') });
        add(f, { ...back, sb: boxBounds(P, { ...back, h1: h }, f), draw: d => draw5(d, it, 'back') });
        castShadow(f, b, (SIZES[it.type]?.seat ?? it.h * 0.5)); castShadow(f, back, it.h);
        continue;
      }
      add(f, { ...b, sb: boxBounds(P, { ...b, h1: h }, f), draw: d => (FURN5[it.type] ?? PROPS[it.type])?.(d, it) });
      if (!it.on) castShadow(f, b, it.type === 'plant' ? it.h * 0.6 : it.h);
    }
    // Wall decor hangs on this room's back wall.
    // Pass 5D-A: decor hangs only on a real full-height wall (a room whose rear edge is the building's back wall);
    // a room whose rear is a cut-away low wall has nothing to hang it on.
    const tallBack = wallsOf(f).some(w => w.type === 'back' && Math.abs(w.at - r.z1) < 1 && w.s <= (r.x0 + r.x1) / 2 && w.e >= (r.x0 + r.x1) / 2);
    if (!tallBack) for (const w0 of F.decor.filter(dd => ['taskBoard', 'statusScreen', 'whiteboard'].includes(dd.type))) {
      const w = { ...w0, floor: f, x0: w0.x0 * U, x1: w0.x1 * U }, zb = r.z1 - 5;
      const fb = { x0: w.x0, x1: w.x1, z0: zb - 2, z1: zb + 2 };
      add(f, { ...fb, sb: boxBounds(P, { ...fb, h1: w.h1 + 6 }, f), draw: d => { for (const x of [w.x0 + 3, w.x1 - 5]) litBox(d, f, { x0: x, x1: x + 2, z0: zb - 1, z1: zb + 1, h1: w.h0 + 2 }, MAT.steel[0], { edge: false }); const dd = Object.create(d); dd.P = { ...P, g: { ...g, depth: zb + 0.2 } }; (DECOR5[w.type] ?? DECOR[w.type])?.(dd, w); } });
      castShadow(f, fb, w.h1);
    }
    if (tallBack) for (const w0 of F.decor) {
      const w = { ...w0, floor: f, x0: w0.x0 * U, x1: w0.x1 * U };
      flat(f, d => { const dd = Object.create(d); dd.P = { ...P, g: { ...g, depth: r.z1 } }; (DECOR5[w.type] ?? DECOR[w.type])?.(dd, w); });
    }
  }
  // Pass 5C: a flag by each building's entrance, waving in the same wind as the trees.
  for (const door of Object.values(world.doors).filter(dr => dr.status === 'built' && (dr.a === 'outside' || dr.b === 'outside'))) {
    const c = view.toView((door.seg.x1 + door.seg.x2) / 2, (door.seg.y1 + door.seg.y2) / 2), fx = c.x * U - 230, fz = c.z * U - 150, poleH = HT * 0.95;
    const b = { x0: fx - 3, x1: fx + 3, z0: fz - 3, z1: fz + 3 };
    add(0, { ...b, sb: boxBounds(P, { ...b, h1: poleH + 10 }, 0), draw: d => drawFlag5(d, fx, fz, poleH) });
  }
  // Stairs and the elevator shaft (built: a flight and a glass shaft; reserved: a marked-out slot for the future).
  for (const s of spaces.filter(s => s.primitive === 'staircase' || s.primitive === 'elevator')) {
    if (!spaces.find(h => h.id === s.inside && finished(h))) continue;
    const f = s.level, r = rp(s);
    if (s.status !== 'built') { flat(f, d => reserved(d, f, r, s.primitive === 'elevator' ? 'lift' : 'stair')); continue; }
    if (s.primitive === 'staircase') add(f, { ...r, sb: boxBounds(P, { ...r, h1: HT + 10 }, f), draw: d => stair(d, f, r) });
  }
  // Walls, from the finished spaces of each storey.
  for (const f of layout.levels) for (const w of wallsOf(f)) { add(f, { ...w.box, bias: w.bias ?? 0, sb: boxBounds(P, { ...w.box, h1: w.h1 }, f), draw: d => wall(d, f, w) }); if (!w.h0) castShadow(f, w.box, w.h1); }

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
  // ---- Pass 5D-A architecture: every wall piece keeps its generated box and type; its construction is the new part. ----
  //   back     interior face: painted plaster with a skirting board and a shadow line under the next slab;
  //   left     the exterior side the camera sees: white composite panels in a rhythm of vertical fins, a ribbon of
  //            glazing at desk height (sky reflected), a dark steel coping;
  //   right    curtain wall: mullions and transoms on a dark frame, glass with a sky reflection gradient;
  //   front / low   the cut-away: a low wall with a stone-grey cap, so rooms stay readable;
  //   partition     glass above a solid base, frameless with a thin aluminium head.
  function wall(d, f, w) {
    const b = w.box, { ctx } = d, p = (x, z, h) => P.at(x, z, f, h), h0 = w.h0 ?? 0;
    if (w.type === 'back') {
      litBox(d, f, { ...b, h0, h1: HT }, { front: FINISH.passage.tone, top: MAT.concreteDark[0] });
      // A long wall run spans several rooms: each room's stretch gets that room's finish.
      if (!h0) for (const seg of roomsAlong(f, b)) { panel5(d, f, seg.x0, seg.x1, b.z0 - 0.08, 0, HT, lit(FINISH[seg.kind]?.tone ?? FINISH.passage.tone, FACE_FRONT)); panel5(d, f, seg.x0, seg.x1, b.z0 - 0.1, 0, 4, lit(FINISH[seg.kind]?.tone ?? FINISH.passage.tone, 0.78)); wallFinish(d, f, { ...b, x0: seg.x0, x1: seg.x1 }, seg.kind); }
      const g = ctx.createLinearGradient(0, p(b.x0, b.z0, HT)[1], 0, p(b.x0, b.z0, HT - 22)[1]); g.addColorStop(0, 'rgba(30,40,60,0.18)'); g.addColorStop(1, 'rgba(30,40,60,0)');
      quad5(ctx, [p(b.x0, b.z0 - 0.1, HT), p(b.x1, b.z0 - 0.1, HT), p(b.x1, b.z0 - 0.1, HT - 22), p(b.x0, b.z0 - 0.1, HT - 22)], g);
      return;
    }
    if (w.type === 'left') {
      // The camera sees this wall from inside (its x1 face): plaster, a skirting, and a ribbon window onto the sky.
      const q = spaces.find(q => q.level === f && finished(q) && furnishing[q.id] && Math.abs(rp(q).x0 - b.x1) < 1 && rp(q).z0 < b.z1 && rp(q).z1 > b.z0), tone = FINISH[q ? furnishing[q.id].kind : 'passage']?.tone ?? FINISH.passage.tone, X = b.x1 + 0.15;
      litBox(d, f, { ...b, h0, h1: HT }, { front: tone, top: MAT.concreteDark[0] });
      quad5(ctx, [p(X, b.z0, h0), p(X, b.z1, h0), p(X, b.z1, HT), p(X, b.z0, HT)], lit(tone, 0.96));
      if (!h0) {
        quad5(ctx, [p(X, b.z0, 0), p(X, b.z1, 0), p(X, b.z1, 4), p(X, b.z0, 4)], lit(tone, 0.8));
        const sill = 30, head = HT - 16, n = Math.max(1, Math.round((b.z1 - b.z0 - 16) / 70));
        for (let k = 0; k < n; k++) { const za = b.z0 + 8 + k * (b.z1 - b.z0 - 16) / n + 3, zb = b.z0 + 8 + (k + 1) * (b.z1 - b.z0 - 16) / n - 3; windowPane(d, f, X, za, zb, sill, head); }
      }
      return;
    }
    if (w.type === 'low' || w.type === 'front') {
      litBox(d, f, { ...b, h0, h1: h0 ? HT : LOW }, w.type === 'front' ? { front: MAT.facade[0], top: MAT.concreteDark[0] } : { front: M.partitionLow, top: '#c9ced4' });
      return;
    }
    if (h0 > 0) { if (w.type === 'back' || w.type === 'left') { litBox(d, f, { ...b, h0, h1: HT }, M.wallBack.hall); return; } litBox(d, f, { ...b, h0: HT - 4, h1: HT }, MAT.aluminium[0], { ao: false }); const pp = (x, z, h) => P.at(x, z, f, h); quad5(d.ctx, [pp(b.x1, b.z0, h0), pp(b.x1, b.z1, h0), pp(b.x1, b.z1, HT - 4), pp(b.x1, b.z0, HT - 4)], 'rgba(200,228,248,0.22)'); return; }
    litBox(d, f, { ...b, h1: LOW }, w.type === 'right' ? { front: MAT.steel[0], top: MAT.steelLight[0] } : { front: M.partitionLow, top: '#c9ced4' });
    if (w.type === 'right') { curtainWall(d, f, b.x1, b.z0, b.z1, LOW, HT); return; }
    // Glass partition: a pale pane, catching a little light, with an aluminium head and a slim post at each end.
    const pane = [p(b.x1, b.z0, LOW), p(b.x1, b.z1, LOW), p(b.x1, b.z1, HT - 2), p(b.x1, b.z0, HT - 2)];
    const gg = ctx.createLinearGradient(pane[0][0], pane[3][1], pane[1][0], pane[1][1]); gg.addColorStop(0, 'rgba(210,235,250,0.30)'); gg.addColorStop(0.5, 'rgba(235,246,255,0.12)'); gg.addColorStop(1, 'rgba(190,220,245,0.26)');
    quad5(ctx, pane, gg);
    ctx.strokeStyle = MAT.aluminium[0]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...p(b.x1, b.z0, HT - 2)); ctx.lineTo(...p(b.x1, b.z1, HT - 2)); ctx.stroke();
    for (const z of [b.z0, b.z1]) { ctx.beginPath(); ctx.moveTo(...p(b.x1, z, LOW)); ctx.lineTo(...p(b.x1, z, HT - 2)); ctx.stroke(); }
  }
  // A curtain wall on the plane x = X between z0 and z1: frame, mullions, transom, sky-reflecting glass.
  function curtainWall(d, f, X, z0, z1, h0, h1) {
    const { ctx } = d, p = (z, h) => P.at(X, z, f, h), pane = [p(z0, h0), p(z1, h0), p(z1, h1), p(z0, h1)];
    const g = ctx.createLinearGradient(pane[0][0], pane[2][1], pane[1][0], pane[0][1]);
    g.addColorStop(0, 'rgba(200,228,248,0.55)'); g.addColorStop(0.35, 'rgba(150,196,228,0.38)'); g.addColorStop(0.7, 'rgba(120,170,210,0.30)'); g.addColorStop(1, 'rgba(200,228,248,0.45)');
    quad5(ctx, pane, g);
    // A soft diagonal reflection.
    const a = p(z0 + (z1 - z0) * 0.25, h1), b2 = p(z0 + (z1 - z0) * 0.45, h1), c = p(z0 + (z1 - z0) * 0.15, h0), e = p(z0 + (z1 - z0) * -0.05, h0);
    quad5(ctx, [a, b2, c, e], 'rgba(255,255,255,0.16)');
    ctx.strokeStyle = MAT.steel[0]; ctx.lineWidth = 1.6;
    const n = Math.max(1, Math.round((z1 - z0) / 38));
    for (let k = 0; k <= n; k++) { const z = z0 + (k / n) * (z1 - z0); ctx.beginPath(); ctx.moveTo(...p(z, h0)); ctx.lineTo(...p(z, h1)); ctx.stroke(); }
    for (const h of [h0, h0 + (h1 - h0) * 0.62, h1]) { ctx.lineWidth = h === h1 ? 2.4 : 1.2; ctx.beginPath(); ctx.moveTo(...p(z0, h)); ctx.lineTo(...p(z1, h)); ctx.stroke(); }
  }
  // A window seen from inside on the plane x = X: sky and a far tree line through the glass, a slim frame, a sill.
  function windowPane(d, f, X, z0, z1, h0, h1) {
    const { ctx } = d, p = (z, h) => P.at(X, z, f, h), pane = [p(z0, h0), p(z1, h0), p(z1, h1), p(z0, h1)];
    const g = ctx.createLinearGradient(0, pane[3][1], 0, pane[0][1]); g.addColorStop(0, '#a8d0ee'); g.addColorStop(0.7, '#d9ecf8'); g.addColorStop(0.72, '#8fb870'); g.addColorStop(1, '#7aa55e');
    quad5(ctx, pane, g);
    quad5(ctx, [p(z0 + (z1 - z0) * 0.2, h1), p(z0 + (z1 - z0) * 0.35, h1), p(z0 + (z1 - z0) * 0.15, h0), p(z0, h0)], 'rgba(255,255,255,0.22)');
    ctx.strokeStyle = MAT.steel[0]; ctx.lineWidth = 1.4; ctx.beginPath(); pane.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...p((z0 + z1) / 2, h0)); ctx.lineTo(...p((z0 + z1) / 2, h1)); ctx.stroke();
    ctx.strokeStyle = '#f4f5f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...p(z0 - 1, h0 - 1)); ctx.lineTo(...p(z1 + 1, h0 - 1)); ctx.stroke();
  }
  const quad5 = (ctx, pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const panel5 = (d, f, x0, x1, z, h0, h1, fill) => quad5(d.ctx, [P.at(x0, z, f, h0), P.at(x1, z, f, h0), P.at(x1, z, f, h1), P.at(x0, z, f, h1)], fill);
  // Wall finishes by the room's purpose (rules, so every generated room of a kind gets the same treatment):
  //   lounge / meeting: warm oak slats; workspace: pale grey with a Hillink-blue band at desk height;
  //   lobby / halls: large concrete panels; servers: dark acoustic panels; review / testing: white with a grid.
  // Wall decor in the new style (drawn on the room's back wall plane, d.P.g.depth).
  const DECOR5 = {
    window(d, w) {
      const f = w.floor, z = d.P.g.depth - 0.2, pp = (x, h) => d.P.at(x, z, f, h), pane = [pp(w.x0, w.h0), pp(w.x1, w.h0), pp(w.x1, w.h1), pp(w.x0, w.h1)];
      const gr = d.ctx.createLinearGradient(0, pane[3][1], 0, pane[0][1]); gr.addColorStop(0, '#a8d0ee'); gr.addColorStop(0.68, '#d9ecf8'); gr.addColorStop(0.7, '#8fb870'); gr.addColorStop(1, '#6f9a55');
      quad5(d.ctx, pane, gr);
      for (let i = 0; i < 4; i++) { const x = w.x0 + 6 + i * (w.x1 - w.x0 - 12) / 4, [tx, ty] = pp(x, w.h0 + (w.h1 - w.h0) * 0.36); litBlob(d.ctx, tx, ty, 5 + (i % 2) * 2, MAT.foliage[0], { squash: 0.9 }); }
      quad5(d.ctx, [pp(w.x0 + (w.x1 - w.x0) * 0.2, w.h1), pp(w.x0 + (w.x1 - w.x0) * 0.32, w.h1), pp(w.x0 + (w.x1 - w.x0) * 0.12, w.h0), pp(w.x0, w.h0)], 'rgba(255,255,255,0.2)');
      d.ctx.strokeStyle = MAT.steel[0]; d.ctx.lineWidth = 1.6; d.ctx.beginPath(); pane.forEach(([x, y], i) => (i ? d.ctx.lineTo(x, y) : d.ctx.moveTo(x, y))); d.ctx.closePath(); d.ctx.stroke();
      const [a0] = pp((w.x0 + w.x1) / 2, 0); d.ctx.beginPath(); d.ctx.moveTo(a0, pane[0][1]); d.ctx.lineTo(a0 + (pane[3][0] - pane[0][0]), pane[3][1]); d.ctx.stroke();
      d.ctx.strokeStyle = '#f5f6f7'; d.ctx.lineWidth = 2.2; d.ctx.beginPath(); d.ctx.moveTo(...pp(w.x0 - 1, w.h0 - 1)); d.ctx.lineTo(...pp(w.x1 + 1, w.h0 - 1)); d.ctx.stroke();
    },
    whiteboard(d, w) {
      const f = w.floor, z = d.P.g.depth - 0.2, pp = (x, h) => d.P.at(x, z, f, h);
      quad5(d.ctx, [pp(w.x0 - 1, w.h0 - 1), pp(w.x1 + 1, w.h0 - 1), pp(w.x1 + 1, w.h1 + 1), pp(w.x0 - 1, w.h1 + 1)], MAT.aluminium[0]);
      quad5(d.ctx, [pp(w.x0, w.h0), pp(w.x1, w.h0), pp(w.x1, w.h1), pp(w.x0, w.h1)], '#fbfcfd');
      const cols = ['#2f7df6', '#e0533f', '#2b3038'];
      for (let k = 0; k < 5; k++) { d.ctx.strokeStyle = cols[k % 3]; d.ctx.lineWidth = 0.8; d.ctx.beginPath(); const y = w.h1 - 5 - k * (w.h1 - w.h0 - 8) / 5; d.ctx.moveTo(...pp(w.x0 + 4, y)); d.ctx.lineTo(...pp(w.x0 + 4 + (0.3 + hash2(k, w.x0) * 0.5) * (w.x1 - w.x0 - 8), y)); d.ctx.stroke(); }
      d.ctx.strokeStyle = '#2f7df6'; d.ctx.lineWidth = 0.9; d.ctx.beginPath(); d.ctx.arc(...pp(w.x1 - 12, (w.h0 + w.h1) / 2), 4, 0, TAU); d.ctx.stroke();
    },
    poster(d, w) {
      const f = w.floor, z = d.P.g.depth - 0.2, pp = (x, h) => d.P.at(x, z, f, h);
      quad5(d.ctx, [pp(w.x0 - 1, w.h0 - 1), pp(w.x1 + 1, w.h0 - 1), pp(w.x1 + 1, w.h1 + 1), pp(w.x0 - 1, w.h1 + 1)], '#2b3038');
      const gr = d.ctx.createLinearGradient(...pp(w.x0, w.h1), ...pp(w.x1, w.h0)); gr.addColorStop(0, '#9cc2fb'); gr.addColorStop(1, '#2f7df6');
      quad5(d.ctx, [pp(w.x0, w.h0), pp(w.x1, w.h0), pp(w.x1, w.h1), pp(w.x0, w.h1)], gr);
      quad5(d.ctx, [pp(w.x0 + 3, w.h0 + 3), pp(w.x1 - 3, w.h0 + 3), pp(w.x0 + (w.x1 - w.x0) * 0.55, w.h1 - 5)], 'rgba(255,255,255,0.55)');
    },
    logo(d, w) { const f = w.floor, z = d.P.g.depth - 0.2, [sx, sy] = d.P.at((w.x0 + w.x1) / 2, z, f, (w.h0 + w.h1) / 2); d.ctx.save(); d.ctx.font = '800 11px ui-sans-serif, system-ui, sans-serif'; d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle'; d.ctx.fillStyle = MAT.brand[0]; d.ctx.fillText('HILLINK', sx, sy); d.ctx.restore(); },
    taskBoard(d, w) {
      // Truth: one card per real queued or blocked task, as before; only the look is new.
      const f = w.floor, z = d.P.g.depth - 0.2, pp = (x, h) => d.P.at(x, z, f, h);
      quad5(d.ctx, [pp(w.x0 - 1, w.h0 - 1), pp(w.x1 + 1, w.h0 - 1), pp(w.x1 + 1, w.h1 + 1), pp(w.x0 - 1, w.h1 + 1)], MAT.steel[0]);
      quad5(d.ctx, [pp(w.x0, w.h0), pp(w.x1, w.h0), pp(w.x1, w.h1), pp(w.x0, w.h1)], '#f4f6f8');
      const [hx, hy] = pp(w.x0 + 4, w.h1 - 4); d.ctx.save(); d.ctx.font = '700 5px ui-sans-serif, system-ui, sans-serif'; d.ctx.textAlign = 'left'; d.ctx.fillStyle = '#2f3844'; d.ctx.fillText('TASKS', hx, hy); d.ctx.restore();
      const q = d.queued ?? [], cols = 6;
      q.slice(0, 24).forEach((t, i) => { const x = w.x0 + 5 + (i % cols) * 13, h = w.h1 - 12 - Math.floor(i / cols) * 11; quad5(d.ctx, [pp(x, h - 8), pp(x + 10, h - 8), pp(x + 10, h), pp(x, h)], t.status === 'blocked' ? '#ffb4a8' : '#fff1b8'); });
    },
    statusScreen(d, w) {
      const f = w.floor, z = d.P.g.depth - 0.2, pp = (x, h) => d.P.at(x, z, f, h);
      quad5(d.ctx, [pp(w.x0 - 1, w.h0 - 1), pp(w.x1 + 1, w.h0 - 1), pp(w.x1 + 1, w.h1 + 1), pp(w.x0 - 1, w.h1 + 1)], '#1d2229');
      const gr = d.ctx.createLinearGradient(0, pp(0, w.h1)[1], 0, pp(0, w.h0)[1]); gr.addColorStop(0, '#16324f'); gr.addColorStop(1, '#0d1c2e');
      quad5(d.ctx, [pp(w.x0, w.h0), pp(w.x1, w.h0), pp(w.x1, w.h1), pp(w.x0, w.h1)], gr);
      const [sx, sy] = pp((w.x0 + w.x1) / 2, (w.h0 + w.h1) / 2);
      d.ctx.save(); d.ctx.textAlign = 'center'; d.ctx.textBaseline = 'middle'; d.ctx.font = '700 5px ui-sans-serif, system-ui, sans-serif'; d.ctx.fillStyle = d.modeColor; d.ctx.fillText(d.modeLabel, sx, sy - 7);
      d.ctx.font = '800 9px ui-sans-serif, system-ui, sans-serif'; d.ctx.fillStyle = '#e6f1ff'; d.ctx.fillText(`${d.counts.working}/${d.counts.total}`, sx, sy + 2); d.ctx.font = '600 4.5px ui-sans-serif, system-ui, sans-serif'; d.ctx.fillStyle = '#8fb3d8'; d.ctx.fillText('WORKING', sx, sy + 9); d.ctx.restore();
    },
  };
  const FINISH = { lounge: { tone: '#efe7dc', slats: true }, comms: { tone: '#efe7dc', slats: true }, 'comms-like': { tone: '#efe7dc', slats: true }, development: { tone: '#e9edf1', band: true }, command: { tone: '#e3e8ef', band: true }, office: { tone: '#e9edf1', band: true },
    lobby: { tone: '#dfe2e4', panels: true }, passage: { tone: '#e6e8ea', panels: true }, spare: { tone: '#e6e8ea', panels: true }, servers: { tone: '#3a4250', acoustic: true }, 'servers-like': { tone: '#3a4250', acoustic: true }, testing: { tone: '#f1f3f5', grid: true } };
  const FACE_FRONT = 0.92;
  function roomsAlong(f, b) {
    const out = [];
    for (const q of spaces) { if (q.level !== f || !finished(q) || !furnishing[q.id]) continue; const r = rp(q); if (Math.abs(r.z1 - b.z0) > 1) continue; const x0 = Math.max(b.x0, r.x0), x1 = Math.min(b.x1, r.x1); if (x1 - x0 > 2) out.push({ x0, x1, kind: furnishing[q.id].kind }); }
    return out;
  }
  function roomKindAt(f, b) {
    const s = spaces.find(q => q.level === f && finished(q) && furnishing[q.id] && Math.abs(rp(q).z1 - b.z0) < 1 && rp(q).x0 <= (b.x0 + b.x1) / 2 && rp(q).x1 >= (b.x0 + b.x1) / 2);
    return s ? furnishing[s.id].kind : 'passage';
  }
  function wallFinish(d, f, b, kind) {
    const F = FINISH[kind] ?? {}, { ctx } = d, z = b.z0 - 0.15, p = (x, h) => P.at(x, z, f, h);
    if (F.slats) { for (let x = b.x0 + 3; x < b.x1 - 2; x += 5) quad5(ctx, [p(x, 6), p(x + 3, 6), p(x + 3, HT - 6), p(x, HT - 6)], x % 10 < 5 ? MAT.oak[0] : lit(MAT.oak[0], 0.9)); }
    if (F.band) quad5(ctx, [p(b.x0, 34), p(b.x1, 34), p(b.x1, 38), p(b.x0, 38)], MAT.brand[0]);
    if (F.panels) { ctx.strokeStyle = 'rgba(80,90,100,0.25)'; ctx.lineWidth = 0.7; for (let x = b.x0 + 40; x < b.x1; x += 40) { ctx.beginPath(); ctx.moveTo(...p(x, 4)); ctx.lineTo(...p(x, HT)); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(...p(b.x0, HT * 0.5)); ctx.lineTo(...p(b.x1, HT * 0.5)); ctx.stroke(); }
    if (F.acoustic) for (let x = b.x0 + 3; x < b.x1 - 12; x += 14) quad5(ctx, [p(x, 10), p(x + 12, 10), p(x + 12, HT - 10), p(x, HT - 10)], '#454e5d');
    if (F.grid) { ctx.strokeStyle = 'rgba(120,130,140,0.18)'; ctx.lineWidth = 0.6; for (let x = b.x0 + 12; x < b.x1; x += 12) { ctx.beginPath(); ctx.moveTo(...p(x, 4)); ctx.lineTo(...p(x, HT)); ctx.stroke(); } }
  }
  function wallToneAt(f, b) {
    const s = spaces.find(q => q.level === f && finished(q) && furnishing[q.id] && Math.abs(rp(q).z1 - b.z0) < 1 && rp(q).x0 <= (b.x0 + b.x1) / 2 && rp(q).x1 >= (b.x0 + b.x1) / 2);
    return (s && WALL_TONE[furnishing[s.id].kind]) ?? 'eng';
  }
  // Floors: materials by the room's purpose, textured on the floor plane, with daylight from the facade side and
  // soft pools under the ceiling lights.
  const FLOOR5 = { lobby: 'polished', passage: 'polished', lounge: 'oak', comms: 'oak', 'comms-like': 'oak', development: 'carpet', workshop: 'polished', office: 'carpet', command: 'carpetBlue', testing: 'tile', servers: 'tile', 'servers-like': 'tile', archive: 'oak', storage: 'polished', spare: 'polished' };
  function floorOf(d, f, r, _mat, kind) {
    const { ctx } = d, mat = FLOOR5[kind] ?? 'polished';
    ctx.save(); ctx.transform(...planMatrix(P, f));
    ctx.fillStyle = mat === 'oak' ? TEX.oak(ctx) : mat === 'carpet' ? TEX.carpet(ctx, 'carpet') : mat === 'carpetBlue' ? TEX.carpet(ctx, 'carpetBlue') : mat === 'tile' ? TEX.tile(ctx) : TEX.polished(ctx);
    ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    // Daylight falls in from the glazed right-hand side and the open front: a gentle gradient across the room.
    const g = ctx.createLinearGradient(r.x0, 0, r.x1, 0); g.addColorStop(0, 'rgba(20,30,50,0.10)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,250,235,0.10)');
    ctx.fillStyle = g; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    ctx.restore();
  }
  // Living HQ: each room's purpose reads from its floor and light, physically (no panels): a rug zone in the lounge and
  // meeting room, a runner in corridors, the Hillink inlay in the lobby, a cool glow in the server room, warm pools in
  // the lounge, bright task light in the lab. Wall lettering names rooms that have a tall wall.
  const ROOM_NAME = { lounge: 'LOUNGE', comms: 'MEETING', development: 'ENGINEERING', testing: 'TEST LAB', command: 'OPERATIONS', servers: 'SERVERS', lobby: 'HILLINK' };
  function roomIdentity(d, f, r, kind, space) {
    const { ctx } = d;
    ctx.save(); ctx.transform(...planMatrix(P, f));
    const inset = (k, x = 0.25) => ({ x0: r.x0 + (r.x1 - r.x0) * x * k, x1: r.x1 - (r.x1 - r.x0) * x * k, z0: r.z0 + (r.z1 - r.z0) * x * k, z1: r.z1 - (r.z1 - r.z0) * x * k });
    const rug = (b, c1, c2) => { ctx.fillStyle = c1; ctx.beginPath(); ctx.roundRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0, 6); ctx.fill(); ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(b.x0 + 5, b.z0 + 5, b.x1 - b.x0 - 10, b.z1 - b.z0 - 10, 4); ctx.stroke(); };
    if (kind === 'lounge') rug(inset(1, 0.14), '#c8a483', '#e9dcc6');
    else if (kind === 'comms') rug(inset(1, 0.18), '#5d7896', '#9cb3cc');
    else if (kind === 'passage') { const along = r.x1 - r.x0 < r.z1 - r.z0; ctx.fillStyle = 'rgba(70,90,120,0.35)'; if (along) ctx.fillRect((r.x0 + r.x1) / 2 - 12, r.z0 + 10, 24, r.z1 - r.z0 - 20); else ctx.fillRect(r.x0 + 10, (r.z0 + r.z1) / 2 - 12, r.x1 - r.x0 - 20, 24); }
    else if (kind === 'lobby') { const cx = (r.x0 + r.x1) / 2 - (r.x1 - r.x0) * 0.18, cz = (r.z0 + r.z1) / 2; ctx.fillStyle = 'rgba(47,125,246,0.16)'; ctx.beginPath(); ctx.ellipse(cx, cz, 70, 45, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(47,125,246,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cz, 60, 38, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // Accent light by purpose.
    const [cx, cy] = P.at((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, f, 0), tone = { servers: 'rgba(80,150,255,0.16)', lounge: 'rgba(255,214,160,0.14)', testing: 'rgba(235,245,255,0.16)', comms: 'rgba(200,220,255,0.10)' }[kind];
    if (tone) { const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r.x1 - r.x0, r.z1 - r.z0) * 0.8); gr.addColorStop(0, tone); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(cx, cy, (r.x1 - r.x0) * 0.8, (r.z1 - r.z0) * 0.45, 0, 0, TAU); ctx.fill(); }
    // Wall lettering on the room's tall back wall.
    const name = ROOM_NAME[kind];
    if (name && wallsOf(f).some(w => w.type === 'back' && Math.abs(w.at - r.z1) < 1 && w.s <= (r.x0 + r.x1) / 2 && w.e >= (r.x0 + r.x1) / 2)) {
      const [tx, ty] = P.at(r.x0 + 14, r.z1 - 0.4, f, HT - 16); ctx.save(); ctx.font = '800 9px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = kind === 'servers' ? 'rgba(160,200,255,0.9)' : 'rgba(47,125,246,0.85)'; ctx.fillText(name, tx, ty); ctx.restore();
    }
  }
  // Soft light pools from the ceiling fittings (drawn after the floors, before furniture).
  function lightPools(d, f) {
    const { ctx } = d;
    for (const s of spaces.filter(q => q.level === f && finished(q) && furnishing[q.id] && q.primitive === 'room')) {
      const r = rp(s), n = Math.max(1, Math.round((r.x1 - r.x0) / 110)), m = Math.max(1, Math.round((r.z1 - r.z0) / 110));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const [x, y] = P.at(r.x0 + (i + 0.5) * (r.x1 - r.x0) / n, r.z0 + (j + 0.5) * (r.z1 - r.z0) / m, f, 0); const g = ctx.createRadialGradient(x, y, 0, x, y, 55); g.addColorStop(0, 'rgba(255,252,238,0.12)'); g.addColorStop(1, 'rgba(255,252,238,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 60, 30, 0, 0, TAU); ctx.fill(); }
    }
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
  // Pass 5D-A vegetation (render/art5d/ground.mjs): species, size and placement from rules; standing sprites with sway.
  for (const pl of ground.plants) {
    const r0 = Math.max(4, plantHeight(pl, U) * 0.08), b = { x0: pl.x - r0, x1: pl.x + r0, z0: pl.z - r0, z1: pl.z + r0 }, H = plantHeight(pl, U);
    add(0, { ...b, sb: { l: P.at(pl.x, pl.z, 0, 0)[0] - H * 0.5, r: P.at(pl.x, pl.z, 0, 0)[0] + H * 0.5, t: P.at(pl.x, pl.z, 0, H)[1] - 20, b: P.at(pl.x, pl.z, 0, 0)[1] + 4 }, tree: true, draw: d => drawPlant(d, pl, U) });
  }
  function drawGround(d) {
    const { ctx } = d;
    ground.drawTerrain(d);
    // Pass 5C cloud shadows, softer, on the new ground.
    if (!d.reduced) for (const c of cloudShadows(d.T, groundBox)) { const [x, y] = P.at(c.x, c.z, 0); ctx.save(); ctx.globalAlpha = c.alpha * 0.9; ctx.translate(x, y); ctx.scale(1, c.rz * g.sky / c.rx); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx); gr.addColorStop(0, 'rgba(20,40,70,0.9)'); gr.addColorStop(1, 'rgba(20,40,70,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, c.rx, 0, TAU); ctx.fill(); ctx.restore(); }
  }
  // The ground the clouds drift over: the settlement's roads and spaces, generously padded.
  const groundBox = (() => { const xs = [], zs = []; for (const s of spaces) { const r = rp(s); xs.push(r.x0, r.x1); zs.push(r.z0, r.z1); } for (const r of roads) for (const [x, z] of r.pts) { xs.push(x); zs.push(z); } return { x0: Math.min(...xs) - 900, x1: Math.max(...xs) + 900, z0: Math.min(...zs) - 600, z1: Math.max(...zs) + 600 }; })();
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
      poly(ctx, [P.at(fc.a[0], fc.a[1], 0, h0), P.at(fc.b[0], fc.b[1], 0, h0), P.at(fc.b[0], fc.b[1], 0, h1), P.at(fc.a[0], fc.a[1], 0, h1)], Math.abs(fc.b[1] - fc.a[1]) > Math.abs(fc.b[0] - fc.a[0]) ? colors.side : colors.front, 'rgba(20,28,40,0.25)', 0.6);
    }
    poly(ctx, c.map(([x, z]) => P.at(x, z, 0, h1)), colors.top, 'rgba(255,255,255,0.35)', 0.6);
    ctx.restore();
    return c;
  }
  function drawVehicle(d, v) {
    const { ctx } = d, L = CAR.length / 2, W = CAR.width / 2, alpha = v.alpha ?? 1;
    if (alpha <= 0.01) return;
    const body = v.color, fx = Math.cos(v.angle), fz = Math.sin(v.angle), at = (a, b, h) => P.at(v.x + fx * a - fz * b, v.y + fz * a + fx * b, 0, h);
    ctx.save(); ctx.globalAlpha *= alpha;
    const [sx, sy] = at(0, 0, 0); softShadow(ctx, sx, sy, L * 1.25, L * 0.55, { alpha: 0.32, dx: 3, dy: -2 });
    // Wheels (dark, with a hub), seen under the body on the near side.
    for (const a of [-L * 0.62, L * 0.62]) for (const b of [-W * 0.92, W * 0.92]) { const [wx, wy] = at(a, b, CAR.wheel); ctx.fillStyle = '#16191e'; ctx.beginPath(); ctx.ellipse(wx, wy, CAR.wheel * 1.05, CAR.wheel * 0.95, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(wx, wy, CAR.wheel * 0.4, 0, TAU); ctx.fill(); }
    orientedBox(d, v.x, v.y, L, W, v.angle, CAR.wheel * 0.7, CAR.body * 0.78, { front: lit(body, 0.9), side: lit(body, 0.72), top: lit(body, 1.08) }, 1);
    orientedBox(d, v.x, v.y, L * 0.98, W * 0.98, v.angle, CAR.wheel * 0.55, CAR.wheel * 0.95, { front: '#2a2f36', side: '#23272d', top: '#30353c' }, 1); // bumper and sill line
    // Cabin set back from the hood: glass all round, a roof in the body colour.
    orientedBox(d, v.x - fx * L * 0.12, v.y - fz * L * 0.12, L * 0.5, W * 0.86, v.angle, CAR.body * 0.78, CAR.height * 0.96, { front: 'rgba(78,110,140,0.96)', side: 'rgba(60,92,124,0.96)', top: lit(body, 1.12) }, 1);
    orientedBox(d, v.x - fx * L * 0.12, v.y - fz * L * 0.12, L * 0.46, W * 0.8, v.angle, CAR.height * 0.9, CAR.height, { front: lit(body, 1.0), side: lit(body, 0.8), top: lit(body, 1.15) }, 1);
    for (const [a, c, rr] of [[L, '#fff8d8', 1.7], [-L, v.stopped ? '#ff3b30' : '#c0392b', v.stopped ? 2 : 1.4]]) for (const b of [-W * 0.62, W * 0.62]) { const [lx, ly] = at(a, b, CAR.body * 0.72); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx, ly, rr, 0, TAU); ctx.fill(); }
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
  // Living HQ: refits. A capability placed into a room that already exists is built inside that room, step by step
  // with its project's canonical stage (the room keeps working around it until the capability is complete). The work
  // zone is the capability's area, in the room's back corner away from its door.
  for (const p of Object.values(projects)) {
    if (p.completed || spaces.some(s => s.project === p.id && s.primitive !== 'staircase' && s.primitive !== 'elevator')) continue;
    const cap = world.capabilities[p.id], room = cap && world.spaces[cap.placement?.spaceId];
    if (!room || room.status !== 'built' || stageIndex(p.stage) < stageIndex('site-preparation')) continue;
    const r = rp(room), side = Math.sqrt(Math.max(4, cap.area ?? 9)) * U, w = Math.min(side * 1.25, (r.x1 - r.x0) * 0.6), dz = Math.min(side * 0.8, (r.z1 - r.z0) * 0.5);
    const u = { x0: r.x1 - 24 - w, x1: r.x1 - 24, z0: r.z1 - 30 - dz, z1: r.z1 - 30 }; // the back corner away from the door, seen through the glass
    const refit = { p, f: room.level, u, label: labelOf.get(`room:${room.id}`) ?? room.id, name: cap.spec?.name ?? String(p.id).replace(/-/g, ' ') };
    add(refit.f, { ...u, sb: boxBounds(P, { ...u, x0: u.x0 - 20, x1: u.x1 + 20, h1: HT }, refit.f), draw: d => drawRefit(d, refit) });
  }
  function drawRefit(d, { p, f, u, label, name }) {
    const { ctx } = d, at = k => stageIndex(p.stage) >= stageIndex(k), pp = (x, z, h = 0) => P.at(x, z, f, h), done = at('inspection'), stopped = p.blocked || p.waiting;
    const H1 = LOW * 1.6;
    // Site preparation: drop cloths over the floor and tape round the work zone.
    if (!at('furnishing')) poly(ctx, [pp(u.x0 - 8, u.z0 - 8), pp(u.x1 + 8, u.z0 - 8), pp(u.x1 + 8, u.z1), pp(u.x0 - 8, u.z1)], 'rgba(226,214,188,0.78)');
    if (!done) { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = stopped ? '#e5484d' : '#f2c230'; ctx.lineWidth = 1.4; ctx.beginPath(); [[u.x0 - 10, u.z0 - 10], [u.x1 + 10, u.z0 - 10], [u.x1 + 10, u.z1], [u.x0 - 10, u.z1]].forEach(([x, z], i) => ctx[i ? 'lineTo' : 'moveTo'](...pp(x, z, 0.5))); ctx.stroke(); ctx.restore(); }
    // Foundation: tool crates and a ladder.
    if (at('foundation') && !done) {
      prism(d, f, { x0: u.x0 - 6, x1: u.x0 + 8, z0: u.z0 - 4, z1: u.z0 + 6, h1: 10 }, '#c8a26a');
      prism(d, f, { x0: u.x0 + 10, x1: u.x0 + 20, z0: u.z0 - 3, z1: u.z0 + 5, h1: 7 }, '#e07a2a');
      const a0 = pp(u.x1 - 10, u.z0 + 4, 0), b0 = pp(u.x1 - 16, u.z0 + 10, 44);
      ctx.strokeStyle = '#b0873a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...b0); ctx.moveTo(a0[0] + 5, a0[1]); ctx.lineTo(b0[0] + 5, b0[1]); ctx.stroke();
      for (let k = 1; k < 5; k++) { const t = k / 5; ctx.beginPath(); ctx.moveTo(a0[0] + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t); ctx.lineTo(a0[0] + 5 + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t); ctx.stroke(); }
    }
    // Structure: a stud frame for the new partition; exterior: its panels (half height until systems, glass once furnished).
    if (at('structure')) {
      const H = at('exterior') ? (at('systems') ? H1 : LOW) : 0;
      for (let x = u.x0; x <= u.x1 + 0.1; x += (u.x1 - u.x0) / 4) prism(d, f, { x0: x - 1, x1: x + 1, z0: u.z0 - 1, z1: u.z0 + 1, h1: H1 }, '#b5b9be', { outline: false });
      prism(d, f, { x0: u.x0 - 1, x1: u.x0 + 1, z0: u.z0, z1: u.z1, h1: H1 }, '#b5b9be', { outline: false });
      prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z0 - 1, z1: u.z0 + 1, h0: H1 - 2, h1: H1 }, '#9aa0a6', { outline: false });
      if (H) {
        const glass = at('furnishing'), c = glass ? { front: 'rgba(170,205,230,0.55)', side: 'rgba(150,185,210,0.55)', top: '#d8dde2' } : '#dcd6cc';
        prism(d, f, { x0: u.x0, x1: u.x1, z0: u.z0 - 1.5, z1: u.z0 + 1.5, h1: H }, c);
        prism(d, f, { x0: u.x0 - 1.5, x1: u.x0 + 1.5, z0: u.z0, z1: u.z1, h1: H }, c);
      }
      if (at('exterior') && !at('furnishing')) { ctx.strokeStyle = '#4f7cac'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...pp(u.x0 + 4, u.z0 - 2, LOW * 0.55)); ctx.lineTo(...pp(u.x0 + 4 + (u.x1 - u.x0 - 8) * (at('systems') ? 1 : 0.55), u.z0 - 2, LOW * 0.55)); ctx.stroke(); } // the paint stripe going on
    }
    // Systems: cable reels and a conduit run.
    if (at('systems') && !done) {
      for (const k of [0, 1]) { const [rx, ry] = pp(u.x1 + 6 + k * 10, u.z0 + 6 + k * 6, 6); ctx.fillStyle = '#2b3440'; ctx.beginPath(); ctx.ellipse(rx, ry, 6, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = k ? '#e0a030' : '#4f7cac'; ctx.beginPath(); ctx.ellipse(rx, ry, 3.6, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...pp(u.x0, u.z0, H1)); ctx.lineTo(...pp(u.x1, u.z0, H1)); ctx.stroke();
    }
    // Furnishing: the new furniture, crated until inspection, then in place.
    if (at('furnishing')) {
      const mx = (u.x0 + u.x1) / 2, mz = (u.z0 + u.z1) / 2;
      if (!done) for (const k of [-1, 1]) prism(d, f, { x0: mx + k * 14 - 8, x1: mx + k * 14 + 8, z0: mz - 6, z1: mz + 6, h1: 12 }, '#c8a26a');
      else { prism(d, f, { x0: mx - 2, x1: mx + 2, z0: mz - 2, z1: mz + 2, h1: 13 }, '#6b7280'); prism(d, f, { x0: mx - 14, x1: mx + 14, z0: mz - 8, z1: mz + 8, h0: 13, h1: 15 }, '#d9c7a4'); }
    }
    // Inspection: the clipboard on the frame. Stopped work: a barrier across the zone.
    if (done) { const [sx, sy] = pp(u.x1 - 8, u.z0 - 3, 30); ctx.fillStyle = '#f5f0e0'; ctx.fillRect(sx - 5, sy - 7, 10, 14); ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.strokeRect(sx - 5, sy - 7, 10, 14); }
    if (stopped) {
      const c = p.blocked ? '#e5484d' : '#f4a23b';
      for (const x of [u.x0 - 4, u.x1 + 4]) prism(d, f, { x0: x - 1.5, x1: x + 1.5, z0: u.z0 - 12, z1: u.z0 - 9, h1: 22 }, '#39414b', { outline: false });
      ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(...pp(u.x0 - 4, u.z0 - 10, 20)); ctx.lineTo(...pp(u.x1 + 4, u.z0 - 10, 20)); ctx.stroke(); ctx.restore();
    }
    const [lx, ly] = pp((u.x0 + u.x1) / 2, u.z0, H1 + 26);
    d.late.push(() => {
      const lines = [`${label}: refit for the ${name}`, STAGE_LABEL[p.stage]];
      if (p.blocked) lines.push(`Blocked: ${p.blocked}`); else if (p.waiting) lines.push(`Waiting: ${p.waiting}`); else if (p.rework) lines.push('Rework requested by review');
      if (world.simulated) lines.push('SIMULATED HQ EVENTS');
      pill(ctx, lx, ly - 14 * lines.length, lines.map(l => l.slice(0, 60)), { dot: p.blocked ? '#ef4b4b' : p.waiting ? '#f4a23b' : p.rework ? '#ff9f43' : done ? '#5ec8ff' : '#f2c230', px: 8.5 });
    });
  }
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
    // Pass 5C: machinery, moving only while the build is really under way (engine/environment.mjs siteMachinery).
    if (at('site-preparation') && !at('inspection')) {
      const mach = siteMachinery(d.reduced ? 0 : T, p), mx = u.x1 + 22, mz = u.z1 + 18, top = HT * 1.9;
      prism(d, f, { x0: mx - 4, x1: mx + 4, z0: mz - 4, z1: mz + 4, h1: 6 }, '#6b7280');
      prism(d, f, { x0: mx - 2, x1: mx + 2, z0: mz - 2, z1: mz + 2, h0: 6, h1: top }, M.fantasy ? '#7a5534' : '#e0a030', { outline: false });
      const jl = Math.min(140, (u.x1 - u.x0) * 0.8), ex = mx + Math.cos(Math.PI - mach.jib) * jl, ez = mz - Math.sin(mach.jib) * jl * 0.6;
      ctx.strokeStyle = M.fantasy ? '#7a5534' : '#d08a20'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...pp(mx - (ex - mx) * 0.3, mz - (ez - mz) * 0.3, top)); ctx.lineTo(...pp(ex, ez, top)); ctx.stroke();
      const hookH = top - 18 - mach.hook * (top - 40);
      ctx.strokeStyle = '#39414b'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(...pp(ex, ez, top)); ctx.lineTo(...pp(ex, ez, hookH)); ctx.stroke();
      prism(d, f, { x0: ex - 5, x1: ex + 5, z0: ez - 4, z1: ez + 4, h0: hookH - 8, h1: hookH }, M.fantasy ? '#8a6a44' : '#c8a26a');
      if (!at('structure')) {
        // Mixer: a drum that turns while the foundation is poured.
        const [cx, cy] = pp(u.x0 - 20, u.z0 + 14, 12), r = 9;
        ctx.fillStyle = M.fantasy ? '#6b5236' : '#9aa3ad'; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.3, r, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = '#4b5561'; ctx.lineWidth = 1.4; for (let k = 0; k < 3; k++) { const a = mach.drum + (k * TAU) / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 0.9); ctx.stroke(); }
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

  // ---- Slabs, plinth and roofline: each storey's edge as a crisp concrete band with a dark shadow gap, the ground
  // floor on a stone plinth, the top of the solid walls finished with a coping (the building reads as one volume). ----
  function drawSlabs(d, f) {
    for (const b of Object.values(world.buildings).filter(b => b.levels.includes(f))) {
      const rs = spaces.filter(s => s.buildingId === b.id && s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
      if (!rs.length) continue;
      const x0 = Math.min(...rs.map(r => r.x0)), x1 = Math.max(...rs.map(r => r.x1)), z0 = Math.min(...rs.map(r => r.z0)), z1 = Math.max(...rs.map(r => r.z1));
      if (f === 0) litBox(d, f, { x0: x0 - 4, x1: x1 + 4, z0: z0 - 4, z1: z1 + 2, h0: -g.slab - 6, h1: -g.slab }, MAT.concreteDark[0], { ao: false, top: false });
      litBox(d, f, { x0: x0 - 3, x1: x1 + 3, z0: z0 - 3, z1: z1 + 3, h0: -g.slab, h1: 0 }, { front: MAT.concrete[0] }, { ao: false, top: false, edge: false });
      const p = (x, z, h) => P.at(x, z, f, h), { ctx } = d;
      ctx.strokeStyle = 'rgba(30,38,52,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...p(x0 - 3, z0 - 3, -g.slab * 0.35)); ctx.lineTo(...p(x1 + 3, z0 - 3, -g.slab * 0.35)); ctx.lineTo(...p(x1 + 3, z1 + 3, -g.slab * 0.35)); ctx.stroke();
      lightPools(d, f);
    }
  }
  // The storeys are drawn apart (the cutaway's exploded stack); steel columns at the corners and along the open
  // sides carry each storey up to the next, so the stack reads as one structure rather than floating plates.
  function drawColumns(d, f) {
    if (!layout.levels.includes(f + 1)) return;
    for (const b of Object.values(world.buildings).filter(b => b.levels.includes(f) && b.levels.includes(f + 1))) {
      const rs = spaces.filter(s => s.buildingId === b.id && s.level === f + 1 && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp); if (!rs.length) continue;
      const x0 = Math.min(...rs.map(r => r.x0)), x1 = Math.max(...rs.map(r => r.x1)), z0 = Math.min(...rs.map(r => r.z0)), z1 = Math.max(...rs.map(r => r.z1));
      const top = layout.pitch - g.slab, pts = [];
      const nx = Math.max(1, Math.round((x1 - x0) / 115)), nz = Math.max(1, Math.round((z1 - z0) / 115));
      for (let k = 0; k <= nx; k++) pts.push([x0 + (k / nx) * (x1 - x0), z0]);
      for (let k = 1; k <= nz; k++) pts.push([x1, z0 + (k / nz) * (z1 - z0)]);
      pts.push([x0, z1]);
      for (const [x, z] of pts) litBox(d, f, { x0: x - 2.2, x1: x + 2.2, z0: z - 2.2, z1: z + 2.2, h0: HT + 2.5, h1: top }, MAT.steel[0], { ao: false });
    }
  }
  // Coping on the tall walls of every storey (a thin dark cap), drawn after the storey's contents.
  function drawCoping(d, f) {
    for (const w of copingOf[f] ?? []) litBox(d, f, { ...w, h0: HT, h1: HT + 2.5 }, { front: MAT.steel[0], top: MAT.steelLight[0] }, { ao: false, edge: true });
  }
  const copingOf = {};
  for (const f of layout.levels) copingOf[f] = wallsOf(f).filter(w => (w.type === 'back' || w.type === 'left') && !w.h0).map(w => ({ x0: w.box.x0 - 0.8, x1: w.box.x1 + 0.8, z0: w.box.z0 - 0.8, z1: w.box.z1 + 0.8 }));
  // The entrance: a steel-and-glass canopy over each outside door with the Hillink name in the brand blue, a pair of
  // planters and a doormat. Placed from the generated door, so every building's entrance gets one.
  const entrances = Object.values(world.doors).filter(dr => dr.status === 'built' && (dr.a === 'outside' || dr.b === 'outside')).map(dr => { const a = view.toView(dr.seg.x1, dr.seg.y1), b = view.toView(dr.seg.x2, dr.seg.y2); return { x0: Math.min(a.x, b.x) * U, x1: Math.max(a.x, b.x) * U, z: a.z * U, f: dr.level ?? 0 }; });
  for (const en of entrances) {
    const cx = (en.x0 + en.x1) / 2, w = en.x1 - en.x0 + 1.4 * U, depth = 1.5 * U, hC = 2.55 * U;
    const cb = { x0: cx - w / 2, x1: cx + w / 2, z0: en.z - depth, z1: en.z + 2 };
    add(en.f, { ...cb, bias: -1, sb: boxBounds(P, { ...cb, h1: hC + 16 }, en.f), draw: d => {
      for (const x of [cb.x0 + 3, cb.x1 - 5]) litBox(d, en.f, { x0: x, x1: x + 2, z0: cb.z0 + 2, z1: cb.z0 + 4, h1: hC }, MAT.steel[0], { edge: false });
      litBox(d, en.f, { ...cb, h0: hC, h1: hC + 3 }, { front: MAT.steel[0], top: '#d9e6f2' });
      const { ctx } = d, [lx, ly] = P.at(cx, cb.z0 - 0.4, en.f, hC + 9);
      ctx.fillStyle = MAT.brand[0]; ctx.font = '800 8px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HILLINK', lx, ly);
    } });
    castShadow(en.f, cb, hC + 3);
    for (const [dx, dz] of [[-w / 2 - 40, -70], [w / 2 + 40, -70]]) { const lx = cx + dx, lz = en.z + dz, lb = { x0: lx - 2, x1: lx + 2, z0: lz - 2, z1: lz + 2 }; add(en.f, { ...lb, sb: boxBounds(P, { ...lb, h1: 120 }, en.f), draw: d => { litBox(d, en.f, { ...lb, h1: 3 }, MAT.concreteDark[0]); const [bx, by] = P.at(lx, lz, en.f, 3), [tx, ty] = P.at(lx, lz, en.f, 105); d.ctx.strokeStyle = MAT.steel[0]; d.ctx.lineWidth = 2; d.ctx.beginPath(); d.ctx.moveTo(bx, by); d.ctx.lineTo(tx, ty); d.ctx.stroke(); d.ctx.fillStyle = MAT.steel[0]; d.ctx.fillRect(tx - 6, ty - 3, 12, 3); d.ctx.fillStyle = '#fffbe8'; d.ctx.fillRect(tx - 5, ty, 10, 1.2); } }); castShadow(en.f, lb, 100); }
    { const bx = cx + w / 2 + 70, bz = en.z - 30, bb = { x0: bx - 22, x1: bx + 22, z0: bz - 7, z1: bz + 7 }; add(en.f, { ...bb, sb: boxBounds(P, { ...bb, h1: 30 }, en.f), draw: d => FURN5.bench(d, { x: bx, z: bz, w: 44, d: 14, h: 22, floor: en.f }) }); castShadow(en.f, bb, 14); }
    { const rx = cx - w / 2 - 80, rz = en.z - 34, rb = { x0: rx - 18, x1: rx + 18, z0: rz - 5, z1: rz + 5 }; add(en.f, { ...rb, sb: boxBounds(P, { ...rb, h1: 30 }, en.f), draw: d => { for (let k = 0; k < 4; k++) { const x = rb.x0 + 4 + k * 9; d.ctx.strokeStyle = MAT.steelLight[0]; d.ctx.lineWidth = 1.6; d.ctx.beginPath(); d.ctx.moveTo(...P.at(x, rz, en.f, 0)); d.ctx.lineTo(...P.at(x, rz, en.f, 20)); d.ctx.lineTo(...P.at(x + 5, rz, en.f, 20)); d.ctx.lineTo(...P.at(x + 5, rz, en.f, 0)); d.ctx.stroke(); } } }); }
    for (const s of [-1, 1]) { const px = cx + s * (w / 2 + 14), pb = { x0: px - 9, x1: px + 9, z0: en.z - 14, z1: en.z - 4 }; add(en.f, { ...pb, sb: boxBounds(P, { ...pb, h1: 40 }, en.f), draw: d => { litBox(d, en.f, { ...pb, h1: 14 }, MAT.concreteDark[0]); for (let k = 0; k < 3; k++) { const [x, y] = P.at(pb.x0 + 4 + k * 5, (pb.z0 + pb.z1) / 2, en.f, 18 + (k % 2) * 4); litBlob(d.ctx, x, y, 6, k % 2 ? MAT.foliage[0] : MAT.foliageLight[0], { squash: 0.85 }); } } }); castShadow(en.f, pb, 22); }
  }
  // The flag by the entrance: a steel pole, a Hillink-blue flag waving in the shared wind.
  function drawFlag5(d, fx, fz, poleH) {
    const { ctx } = d, t = d.reduced ? 0 : d.T;
    litBox(d, 0, { x0: fx - 4, x1: fx + 4, z0: fz - 4, z1: fz + 4, h1: 3 }, MAT.concreteDark[0]);
    const [bx, by] = P.at(fx, fz, 0, 0), [tx, ty] = P.at(fx, fz, 0, poleH);
    ctx.strokeStyle = '#dfe4ea'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    const len = 32, hgt = 18, n = 10, top = [], bot = [];
    for (let k = 0; k <= n; k++) { const u = k / n, dz = flutter(t, u, fx * 0.01) * len, sag = u * u * 3; top.push(P.at(fx + u * len, fz + dz, 0, poleH - 2 - sag)); bot.push(P.at(fx + u * len, fz + dz, 0, poleH - 2 - hgt - sag)); }
    const gr = ctx.createLinearGradient(top[0][0], 0, top.at(-1)[0], 0); gr.addColorStop(0, '#2f7df6'); gr.addColorStop(0.5, '#3a86f7'); gr.addColorStop(1, '#1e63d6');
    ctx.beginPath(); [...top, ...bot.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
  }
  // ---- Baked soft shadows per storey (plan space): every fixed box, offset away from the sun. ----
  const shadowLayer = {};
  function bakeShadows(f) {
    const list = shadowBoxes[f] ?? []; if (!list.length) return null;
    const xs = list.flatMap(b => [b.x0, b.x1 + SUN.sx * b.h]), zs = list.flatMap(b => [b.z0, b.z1 + SUN.sz * b.h]);
    const bb = { x0: Math.min(...xs) - 20, x1: Math.max(...xs) + 20, z0: Math.min(...zs) - 20, z1: Math.max(...zs) + 20 }, res = 1;
    const c = makeCanvas(Math.ceil((bb.x1 - bb.x0) * res), Math.ceil((bb.z1 - bb.z0) * res)), gx = c.getContext('2d');
    gx.scale(res, res); gx.translate(-bb.x0, -bb.z0); if ('filter' in gx) gx.filter = 'blur(2.5px)';
    gx.fillStyle = '#000';
    for (const b of list) { const dx = SUN.sx * b.h, dz = SUN.sz * b.h; gx.beginPath(); gx.moveTo(b.x0, b.z0); gx.lineTo(b.x1, b.z0); gx.lineTo(b.x1 + dx, b.z0 + dz); gx.lineTo(b.x1 + dx, b.z1 + dz); gx.lineTo(b.x0 + dx, b.z1 + dz); gx.lineTo(b.x0, b.z1); gx.closePath(); gx.fill(); }
    return (shadowLayer[f] = { c, bb });
  }
  function drawShadows(d, f) {
    const L = shadowLayer[f] ?? (shadowLayer[f] === null ? null : bakeShadows(f)); if (!L) { shadowLayer[f] = null; return; }
    const { ctx } = d; ctx.save(); ctx.transform(...planMatrix(P, f)); ctx.globalAlpha = 0.34; ctx.imageSmoothingEnabled = true;
    if (f > 0) { ctx.beginPath(); for (const s of spaces.filter(q => q.level === f && finished(q) && furnishing[q.id])) { const r = rp(s); ctx.rect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); } ctx.clip(); } // no shadows in mid-air
    // The mask is black; tint it cool by drawing it through a colour fill (source-in on a scratch canvas would cost more).
    ctx.drawImage(L.c, L.bb.x0, L.bb.z0, L.bb.x1 - L.bb.x0, L.bb.z1 - L.bb.z0); ctx.restore();
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
    if (!e.ride) softShadow(ctx, x, y + 0.5, e.h * 0.2, e.h * 0.07, { alpha: 0.34 }), softShadow(ctx, x + e.h * 0.16, y - e.h * 0.05, e.h * 0.24, e.h * 0.07, { alpha: 0.14 });
    stateRing(d, e, a, x, y);
    const body = BODIES[e.rig?.body] ?? drawFigure, head = body(ctx, fig);
    if (selected || hovered || PRODUCTIVE_STATES.has(st) || SITE_STATES.has(st)) d.late.unshift(() => body(ctx, { ...fig, alpha: selected ? 0.45 : 0.3 }));
    d.late.push(() => badge(d, e, a, x, head.top, hovered, selected));
  }
  // Pass 5C: ambient people (engine/npcs.mjs): same figures and locomotion, muted clothes, no name or status badge.
  function drawAmbient(d, e) {
    const dressed = dress(rig, e.anim), t = (d.now - (e.anim?.since ?? d.now)) / 1000;
    softShadow(d.ctx, e.x, e.y + 0.5, e.h * 0.2, e.h * 0.07, { alpha: 0.3 * e.alpha });
    drawFigure(d.ctx, { x: e.x, y: e.y, h: e.h, dir: e.dir ?? 'front', posture: e.posture, state: dressed.clip, prev: d.reduced ? null : dressed.prev, blend: blendOf(e.anim, d.now), props: dressed.props, gait: e.gaitAmount ?? 1, t, time: d.reduced ? 0 : d.T + e.index * 1.7, stride: e.stride ?? 0, look: lookOfNpc(e.index, skinId), use: e.use, moving: e.moving, alpha: 0.92 * e.alpha });
  }
  // Living HQ: how an agent's real state reads at any zoom, without panels. A soft ring on the floor at its feet in the
  // state's colour (working, travelling with a task, waiting, blocked, done), a small status pip above the head when
  // zoomed out, and a compact name chip only when there is room for it (status text on hover or selection).
  function stateRing(d, e, a, x, y) {
    const c = STATE_COLOR[stateOf(e, a)]; if (!c || e.ride) return;
    const { ctx } = d, pulse = stateOf(e, a) === 'blocked' && !d.reduced ? 0.55 + 0.35 * Math.sin(d.T * 5) : 0.7;
    ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x, y + 0.5, e.h * 0.3, e.h * 0.1, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pulse * 0.25; ctx.fillStyle = c; ctx.fill(); ctx.restore();
  }
  function badge(d, e, a, x, top, hovered, selected) {
    const { ctx, env } = d, zoom = env.zoom, k = Math.min(2.2, Math.max(0.6, 1 / zoom)), cy = top - 3 * k, st = stateOf(e, a), c = STATE_COLOR[st];
    // Zoomed out: a status pip only (the ring and the body carry the rest).
    const mode = labelModeOf(zoom, hovered, selected);
    if (mode === 'pip') { if (c) { ctx.beginPath(); ctx.arc(x, cy - 4 * k, 3.2 * k, 0, TAU); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1.1 * k; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(); } return; }
    const lines = mode === 'full' ? [a.name, statusLine(e, env.world, layout)] : [a.name];
    const sc = (hovered || selected ? LABEL_PX : 8.5) / 8 / zoom;
    ctx.font = font(8, 700); const w0 = ctx.measureText(lines[0]).width; ctx.font = font(6.5, 500);
    const w = (Math.max(w0, lines[1] ? ctx.measureText(lines[1]).width : 0) + 19) * sc, h = (lines.length * 11 + 5) * sc;
    const base = cy - 10 * k - lines.length * 11 * sc, ly = placeLabel(env.claimLabel, x, base, w, h, hovered || selected, 2 * sc);
    if (ly !== base) { ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 0.8 / zoom; ctx.beginPath(); ctx.moveTo(x, ly + h); ctx.lineTo(x, base + h * 0.4); ctx.stroke(); }
    ctx.save(); ctx.translate(x, ly); ctx.scale(sc, sc); ctx.globalAlpha = hovered || selected ? 1 : 0.88; pill(ctx, 0, 0, lines, { dot: c ?? dotColor(e, a), px: 8, bg: 'rgba(15,22,34,0.78)' }); ctx.restore();
  }

  // ---- Per frame. ----
  function frame(ctx, env) {
    const now = env.time, T = env.reducedMotion ? 0 : now / 1000, world0 = env.world ?? { agents: {}, tasks: {}, prs: {}, testRuns: {}, systems: {}, issues: {} };
    const agents = [...env.scene.entities.values()].filter(e => e.kind === 'agent');
    const ambient = [...env.scene.entities.values()].filter(e => e.kind === 'ambient' && e.alpha > 0.01);
    const systems = Object.values(world0.systems ?? {}), sysState = kind => systems.find(s => s.kind === kind)?.state ?? 'unknown';
    const tasks = Object.values(world0.tasks ?? {});
    const d = {
      ctx, P, M, T, now, env, lw: 1, art, reduced: env.reducedMotion, late: env.late, clock: Date.now(),
      room: id => env.activity?.rooms?.[id] ?? 0, stationActive: key => !!env.activity?.stations?.[key],
      pointBusy: key => agents.some(a => a.spot === key && !a.moving), systemState: sysState, systemColor: () => '#7c8594',
      // The state of whoever sits at a station right now: 'working', 'blocked' (the frustrated beat before leaving) or null.
      stationState: key => { const a = agents.find(x => !x.moving && x.spot && x.spot.endsWith(':' + key)); if (!a) return null; if (a.anim?.state === 'frustrated') return 'blocked'; return PRODUCTIVE_STATES.has(a.anim?.state) ? 'working' : 'present'; },
      busyUse: use => agents.filter(a => !a.moving && a.spotInfo?.use === use),
      rushing: Object.values(world0.testRuns ?? {}).some(r => r.state === 'running') || Object.values(world0.deploys ?? {}).some(r => r.state === 'running') || Object.values(world0.builds ?? {}).some(r => r.state === 'running'),
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
    ground.drawDecals(d, (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1);
    const lifts = Object.values(layout.lifts), inCar = e => (e.ride && ['board', 'ride', 'exit'].includes(e.ride.request.phase)) || e.gait === 'ride';
    const cars = d.reduced ? [] : vehiclesAt(T, vehicleRoutes);
    const fw = AGENT.footprint.w / 2, fd = AGENT.footprint.d / 2;
    const charBox = (e, x, z) => ({ x0: x - fw, x1: x + fw, z0: z - fd, z1: z + fd, bias: e.posture === 'sit' ? 1 : 0, sb: { l: e.x - AGENT.height * 0.45, r: e.x + AGENT.height * 0.45, t: e.y - AGENT.height * 1.5, b: e.y + 4 } });
    for (const f of layout.levels) {
      for (const fn of flats[f] ?? []) fn(d);
      drawSlabs(d, f);
      drawShadows(d, f);
      const items = (staticItems[f] ?? []).filter(onScreen);
      for (const e of agents) { if (inCar(e)) continue; const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue; items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAgent(d, e) }); }
      for (const e of ambient) { const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue; items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAmbient(d, e) }); }
      if (f === 0) for (const v of cars) { const L = STREET_SCALE.car.length / 2; const box = { x0: v.x - L, x1: v.x + L, z0: v.y - L, z1: v.y + L }; items.push({ ...box, sb: boxBounds(P, { ...box, h1: STREET_SCALE.car.height + 4 }, 0), draw: () => drawVehicle(d, v) }); }
      for (const l of lifts) if (l.floors.includes(f)) {
        const lift = env.scene.get(`lift:${l.id}:back`)?.lift; if (!lift) continue;
        const withCar = carFloor(l, lift) === f, s = l.shaft;
        items.push({ ...s, sb: boxBounds(P, { ...s, h1: HT + 90 }, f), draw: () => drawShaft(d, l, f, lift, withCar, withCar ? agents.filter(inCar) : []) });
      }
      for (const it of depthSort(items)) it.draw(d);
      drawCoping(d, f);
      drawColumns(d, f);
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
      const gr = ctx.createLinearGradient(0, 0, 0, camera.height); gr.addColorStop(0, '#a9d0ee'); gr.addColorStop(0.55, '#d6e9f6'); gr.addColorStop(1, '#eef4f7');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, camera.width, camera.height);
    },
    frame,
  };
}
