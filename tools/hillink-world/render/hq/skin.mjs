// Art 'hq' (?art=hq): the HQ diorama look over the canonical World (Kyle chose it 2026-10-02: one style family, drawn
// in code, in two treatments: Modern (theme 'real') and Fantasy (theme 'fantasy')).
//
//   World (procgen + HQ truth) -> generated layout (diamond projection) -> model.mjs (semantic: rooms, walls, doors,
//   items, decor, sites, ways, plants) -> a style (styles/modern.mjs | styles/fantasy.mjs: how each semantic kind looks)
//   -> prims.mjs (iso boxes, faces, floor painting) -> canvas.
//
// The skin owns depth order, culling, lighting and labels; a style owns only looks. Agents are the World's scene
// entities (position, clip, facing, posture from engine/iso-view.mjs): drawn, never simulated here. Ambient people are
// the World's ambient entities, drawn unlabelled and unselectable. Nothing is invented: every room, piece of furniture,
// tree, path and construction stage comes from the World; the only additions are exterior dressing placed by rule from
// the World's own paths and doors (lamps along paths, a sign, planters, a bench and a flag at each entrance).
import { depthSort } from '../../engine/iso.mjs';
import { AGENT, STREET_SCALE } from '../../world/scale.mjs';
import { vehiclesAt, smoothPolyline } from '../../engine/ambience.mjs';
import { statusOf, workChipOf, drawStatusRing, drawEmblem, drawWorkChip, drawCeremony } from '../art/status.mjs';
import { actionText } from '../../engine/iso-view.mjs';
import { jobOf } from '../../core/job.mjs';
import { placeLabel } from '../iso-skin.mjs';
import { buildModel, HT } from './model.mjs';
import { kit, poly } from './prims.mjs';
import { drawFigure } from './characters.mjs';
import { createSky } from './sky.mjs';
import { createIsland } from './island.mjs';
import { createLighting } from './light.mjs';
import { dayPhase } from './time.mjs';
import { createModernStyle } from './styles/modern.mjs';
import { createFantasyStyle } from './styles/fantasy.mjs';

export { setHqLight, hqLight } from './time.mjs';
const TAU = Math.PI * 2;
const STYLES = { real: createModernStyle, fantasy: createFantasyStyle };
const WORKING = new Set(['coding', 'thinking', 'coordinating', 'researching', 'reviewing', 'testing', 'communicating']);

export function createHqSkin(layout, skinId = 'real') {
  const { P, U, world } = layout;
  const K = kit(P);
  const model = buildModel(layout, skinId);
  const style = (STYLES[skinId] ?? createModernStyle)({ K, P, U, layout, model });
  const theme = skinId === 'fantasy' ? 'fantasy' : 'real';
  const sky = createSky(), island = createIsland(layout, style.island), lighting = createLighting();
  const R = island.rect, inIsland = (x, z, m = 0) => x >= R.x0 + m && x <= R.x1 - m && z >= R.z0 + m && z <= R.z1 - m;

  // Screen bounds of a plan box (all eight corners: the diamond projection mixes x into screen y).
  const boundsOf = (b, f, h1) => { let l = 1e9, r = -1e9, t = 1e9, bt = -1e9; for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const h of [b.h0 ?? 0, h1]) { const [sx, sy] = P.at(x, z, f, h); if (sx < l) l = sx; if (sx > r) r = sx; if (sy < t) t = sy; if (sy > bt) bt = sy; } return { l, r, t, b: bt }; };

  const overlap = (a, b) => a.r > b.l && a.l < b.r && a.b > b.t && a.t < b.b;
  // ---- Static items per storey, built once per layout. ----
  const staticItems = {}, flats = {};
  const add = (f, item) => (staticItems[f] ||= []).push(item);
  const flat = (f, fn) => (flats[f] ||= []).push(fn);
  for (const room of model.rooms) flat(room.level, d => style.floor(d, room));
  for (const w of model.walls) add(w.f, { ...w.box, bias: w.bias, sb: boundsOf(w.box, w.f, w.h1 + 4), draw: d => style.wall(d, w) });
  for (const dr of model.doors) { const b = dr.axis === 'z' ? { x0: Math.min(dr.a.x, dr.b.x), x1: Math.max(dr.a.x, dr.b.x), z0: dr.a.z - 3, z1: dr.a.z + 3 } : { x0: dr.a.x - 3, x1: dr.a.x + 3, z0: Math.min(dr.a.z, dr.b.z), z1: Math.max(dr.a.z, dr.b.z) }; add(dr.f, { ...b, bias: 0.5, sb: boundsOf(b, dr.f, dr.h + 8), draw: d => style.door(d, dr) }); }
  const itemBox = it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 });
  for (const it of model.items) {
    if (style.flatItem?.(it)) { flat(it.f, d => style.item(d, it)); continue; }
    const b = itemBox(it);
    if (it.base) { const bb = itemBox(it.base); b.z0 = bb.z0 + 0.2; b.z1 = bb.z1; b.bias = 1; }
    add(it.f, { ...b, sb: boundsOf(b, it.f, (it.base ? it.base.h : 0) + it.h + 40), draw: d => style.item(d, it), it });
  }
  // Wall-mounted decor stands just in front of its back wall.
  for (const dc of model.decor) { const b = { x0: dc.x0, x1: dc.x1, z0: dc.z - 3, z1: dc.z - 0.5 }; add(dc.f, { ...b, bias: 2, sb: boundsOf(b, dc.f, dc.h1 + 6), draw: d => style.decor(d, dc) }); }
  for (const sl of model.slots) add(sl.f, { ...sl.r, bias: -1, sb: boundsOf(sl.r, sl.f, HT), draw: d => style.slot(d, sl) });
  for (const site of model.sites) { const b = { x0: site.u.x0 - 6, x1: site.u.x1 + 6, z0: site.u.z0, z1: site.u.z1 }; add(site.f, { ...b, sb: boundsOf({ ...b, x0: b.x0 - 40, x1: b.x1 + 40 }, site.f, HT + 120), draw: d => style.site(d, site) }); }
  // Vegetation on the island (the World's environment anchors and foundation beds), plus landscaping by rule.
  for (const pl of [...model.plants, ...landscaping(model, U, R)]) {
    if (!inIsland(pl.x, pl.z, 1.2 * U)) continue;
    const H = style.plantHeight(pl), r0 = Math.max(4, H * 0.1), b = { x0: pl.x - r0, x1: pl.x + r0, z0: pl.z - r0, z1: pl.z + r0 };
    const sb = boundsOf({ x0: pl.x - H * 0.6, x1: pl.x + H * 0.6, z0: pl.z - H * 0.3, z1: pl.z + H * 0.3 }, 0, H);
    // A tree standing between the camera and a building is drawn see-through, so it never hides the interior.
    const screens = model.buildings.some(bd => (pl.z < bd.r.z0 || pl.x > bd.r.x1) && H > 60 && overlap(sb, boundsOf(bd.r, 0, HT * bd.levels.length)));
    add(0, { ...b, sb, draw: d => { if (!screens) return style.plant(d, pl); d.ctx.save(); d.ctx.globalAlpha *= 0.42; style.plant(d, pl); d.ctx.restore(); }, plant: pl });
  }
  // Exterior dressing by rule from the World's paths and entrance doors.
  const extras = exteriorDressing(model, U, inIsland);
  for (const ex of extras) { const b = { x0: ex.x - ex.w / 2, x1: ex.x + ex.w / 2, z0: ex.z - ex.d / 2, z1: ex.z + ex.d / 2 }; add(0, { ...b, sb: boundsOf(b, 0, ex.h + 30), draw: d => style.extra(d, ex), ex }); }
  // Vehicle routes along the World's built roads (plan units); vehicles are drawn only on the island.
  const routes = Object.values(world.roads).filter(r => r.status === 'built' && r.points.length > 1).map(r => r.points.map(p => { const v = layout.view.toView(p.x, p.y); return [v.x * U, v.z * U]; }))
    .flatMap(pts => { const lane = STREET_SCALE.lane * 0.5, off = (q, k) => q.map(([x, z], i) => { const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [x - ((b[1] - a[1]) / L) * k, z + ((b[0] - a[0]) / L) * k]; }); return [{ points: off(pts, lane), speed: STREET_SCALE.carSpeed * 0.8, every: 13, chance: 0.6 }, { points: off([...pts].reverse(), lane), speed: STREET_SCALE.carSpeed * 0.7, every: 17, chance: 0.5 }]; })
    .map(r => ({ ...r, points: smoothPolyline(r.points, STREET_SCALE.car.length * 1.6), bendWindow: STREET_SCALE.car.length * 1.2, fade: STREET_SCALE.car.length * 2.5, colors: style.vehicleColors }));

  // ---- Agents and ambient people. ----
  function drawAgent(d, e) {
    const a = e.agent; if (!a) return;
    const { ctx, env } = d, hovered = env.hoverId === e.id, selected = env.selectedId === e.id, st = statusOf(e, a, env.world);
    const look = style.agentLook(a, e), clip = e.anim?.state ?? 'idle', t = (d.now - (e.anim?.since ?? d.now)) / 1000;
    if (!e.ride) { K.ellipseShadow(ctx, e.x + 2, e.y + 0.5, e.h * 0.22, e.h * 0.08, 0.3); drawStatusRing(ctx, e.x, e.y, e.h, st, d.T, d.reduced); }
    if (hovered || selected) { ctx.beginPath(); ctx.ellipse(e.x, e.y + 0.5, e.h * 0.36, e.h * 0.12, 0, 0, TAU); ctx.lineWidth = 1.6; ctx.strokeStyle = selected ? style.accent : '#ffffff'; ctx.stroke(); }
    const fig = drawFigure(ctx, { x: e.x, y: e.y, h: e.h * (look.scale ?? 1), dir: e.dir ?? 'front', clip, t, T: d.reduced ? 0 : d.T, moving: e.moving, stride: e.stride ? e.stride * 0.55 : undefined, posture: e.posture, look, alpha: a.activity === 'offline' ? 0.85 : 1, seed: (a.id.length * 1.7) % 6, carrying: e.carrying });
    if (st === 'completed') drawCeremony(ctx, e.x, e.y, e.h, t, theme, d.reduced);
    d.late.push(() => {
      if (e.ride) return;
      const k = Math.min(2, Math.max(0.7, 1 / env.zoom));
      if (st !== 'idle') drawEmblem(ctx, e.x, fig.top - 6 * k, st, theme, k, d.T);
      const chip = workChipOf(env.world, a); if (chip) drawWorkChip(ctx, e.x + 14 * k, fig.top - 6 * k, chip, theme, k);
      nameTag(d, e, a, fig.top - (st === 'idle' ? 2 : 16) * k, hovered, selected);
    });
  }
  function nameTag(d, e, a, top, hovered, selected) {
    const { ctx, env } = d, zoom = env.zoom;
    if (zoom < 0.5 && !hovered && !selected) return;
    const full = hovered || selected, sc = 1 / Math.max(0.8, zoom);
    const lines = full ? [a.name, statusLine(e, env.world)] : [a.name];
    ctx.save(); ctx.font = `700 ${9.5 * sc}px ui-sans-serif, system-ui, sans-serif`;
    const w0 = ctx.measureText(lines[0]).width; ctx.font = `500 ${8 * sc}px ui-sans-serif, system-ui, sans-serif`;
    const w = Math.max(w0, lines[1] ? ctx.measureText(lines[1].slice(0, 60)).width : 0) + 18 * sc, h = (lines.length * 11 + 4) * sc;
    const base = top - h - 4 * sc, ly = placeLabel(env.claimLabel, e.x, base, w, h, full, 2 * sc);
    const c = style.agentColor(a);
    ctx.globalAlpha = full ? 1 : 0.92; ctx.beginPath(); ctx.roundRect(e.x - w / 2, ly, w, h, 6 * sc); ctx.fillStyle = style.tagBg; ctx.fill();
    if (full) { ctx.strokeStyle = c; ctx.lineWidth = 1.2 * sc; ctx.stroke(); }
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(e.x - w / 2 + 7 * sc, ly + 7.5 * sc, 2.6 * sc, 0, TAU); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = style.tagText; ctx.font = `700 ${9.5 * sc}px ui-sans-serif, system-ui, sans-serif`; ctx.fillText(lines[0], e.x - w / 2 + 12 * sc, ly + 7.5 * sc);
    if (lines[1]) { ctx.font = `500 ${8 * sc}px ui-sans-serif, system-ui, sans-serif`; ctx.fillStyle = style.tagSub; ctx.fillText(lines[1].slice(0, 60), e.x - w / 2 + 12 * sc, ly + 18 * sc); }
    if (ly !== base) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.8 * sc; ctx.beginPath(); ctx.moveTo(e.x, ly + h); ctx.lineTo(e.x, base + h * 0.5); ctx.stroke(); }
    ctx.restore();
  }
  const statusLine = (e, w) => { const job = jobOf(w, e.agent), action = actionText(e, layout); return job?.stage ? `${action} · ${job.stage}` : action; };
  function drawAmbient(d, e) {
    const t = (d.now - (e.anim?.since ?? d.now)) / 1000;
    K.ellipseShadow(d.ctx, e.x + 2, e.y + 0.5, e.h * 0.2, e.h * 0.07, 0.25 * e.alpha);
    drawFigure(d.ctx, { x: e.x, y: e.y, h: e.h * 0.96, dir: e.dir ?? 'front', clip: e.anim?.state ?? 'idle', t, T: d.reduced ? 0 : d.T, moving: e.moving, posture: e.posture, look: style.ambientLook(e.index), alpha: 0.95 * e.alpha, seed: e.index * 1.3 });
  }

  // ---- Lights: from World facts only (rooms that exist, lamps the style places on real fixtures, agents). ----
  function lightsOf(d, agents) {
    const out = [];
    for (const room of model.rooms) { const r = room.r, [x, y] = P.at((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, room.level, HT * 0.45), L = style.roomLight(room.kind); if (L) out.push({ x, y, r: Math.max(r.x1 - r.x0, r.z1 - r.z0) * 0.62, col: L.col, i: room.primitive === 'hallway' ? L.i * 0.75 : L.i }); }
    for (const it of model.items) { const L = style.itemLight?.(it, d); if (L) { const [x, y] = P.at(it.x, it.z, it.f, L.h ?? it.h); out.push({ x, y, r: L.r, col: L.col, i: L.i }); } }
    for (const dc of model.decor) { const L = style.decorLight?.(dc, d); if (L) { const [x, y] = P.at((dc.x0 + dc.x1) / 2, dc.z - 4, dc.f, (dc.h0 + dc.h1) / 2); out.push({ x, y, r: L.r, col: L.col, i: L.i }); } }
    for (const ex of extras) { const L = style.extraLight?.(ex, d); if (L) { const [x, y] = P.at(ex.x, ex.z, 0, L.h ?? ex.h); out.push({ x, y, r: L.r, col: L.col, i: L.i }); } }
    for (const e of agents) out.push({ x: e.x, y: e.y - e.h * 0.5, r: e.h * 1.0, col: style.agentColor(e.agent), i: 0.35 });
    for (const site of model.sites) { const [x, y] = P.at((site.u.x0 + site.u.x1) / 2, (site.u.z0 + site.u.z1) / 2, site.f, 40); out.push({ x, y, r: 120, col: style.siteLight ?? '#ffd27a', i: 0.6 }); }
    return out;
  }

  // ---- Per frame. ----
  function frame(ctx, env) {
    const now = env.time, T = env.reducedMotion ? 0 : now / 1000, day = dayPhase();
    const world0 = env.world ?? { agents: {}, tasks: {} };
    const agents = [...env.scene.entities.values()].filter(e => e.kind === 'agent' && e.agent);
    const ambient = [...env.scene.entities.values()].filter(e => e.kind === 'ambient' && e.alpha > 0.01);
    const tasks = Object.values(world0.tasks ?? {});
    const d = {
      ctx, P, K, T, now, env, day, night: day.night, reduced: env.reducedMotion, late: env.late, world: world0, layout, model,
      // Live facts props may show: a station's screen is on only while someone there is really working.
      // Someone (not walking) standing or sitting at a piece of furniture right now: 'working' | 'present' | null.
      near: it => { let best = null; for (const a of agents) { if (a.moving) continue; const pl = layout.planAt(a.x, a.y); if (!pl || pl.floor !== it.f || Math.hypot(pl.x - it.x, pl.z - it.z) > Math.max(it.w, it.d) * 0.5 + 30) continue; const w = ['work', 'type', 'inspect', 'read', 'assemble', 'install'].includes(a.anim?.state); if (w) return 'working'; best = 'present'; } return best; },
      stationState: key => { const a = agents.find(x => !x.moving && x.spot && x.spot.endsWith(':' + key)); if (!a) return null; if (a.anim?.state === 'frustrated') return 'blocked'; return ['work', 'type', 'inspect', 'read'].includes(a.anim?.state) ? 'working' : 'present'; },
      queued: tasks.filter(t => t.status === 'queued' || t.status === 'blocked'), archived: tasks.filter(t => t.status === 'done').length,
      counts: { total: agents.length, working: agents.filter(a => WORKING.has(a.agent?.activity)).length },
      modeLabel: (env.modeLabel ?? '').split(':')[0], live: (env.modeLabel ?? '').startsWith('LIVE'),
    };
    // Visible world rectangle, so only on-screen pieces are sorted and drawn.
    const m = ctx.getTransform().inverse(), c = ctx.canvas, corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const vx0 = Math.min(...corners.map(q => q[0])) - 80, vx1 = Math.max(...corners.map(q => q[0])) + 80, vy0 = Math.min(...corners.map(q => q[1])) - 160, vy1 = Math.max(...corners.map(q => q[1])) + 80;
    const onScreen = it => !it.sb || (it.sb.r >= vx0 && it.sb.l <= vx1 && it.sb.b >= vy0 && it.sb.t <= vy1);
    island.underside(ctx, day, T);
    style.ground(d, R);
    island.rim(ctx, day);
    const cars = d.reduced ? [] : vehiclesAt(T, routes).filter(v => inIsland(v.x, v.y, STREET_SCALE.car.length));
    const fw = AGENT.footprint.w / 2, fd = AGENT.footprint.d / 2;
    const charBox = (e, x, z) => ({ x0: x - fw, x1: x + fw, z0: z - fd, z1: z + fd, bias: e.posture === 'sit' ? 1 : 0, sb: { l: e.x - AGENT.height * 0.5, r: e.x + AGENT.height * 0.5, t: e.y - AGENT.height * 1.5, b: e.y + 4 } });
    for (const f of layout.levels) {
      for (const b of model.buildings) if (b.levels.includes(f)) style.slab(d, f, b);
      for (const fn of flats[f] ?? []) fn(d);
      const items = (staticItems[f] ?? []).filter(onScreen);
      for (const it of items) if (it.it && !it.it.base) style.shadow?.(d, it.it);
      for (const e of agents) { if (e.ride && ['board', 'ride', 'exit'].includes(e.ride.request?.phase)) continue; const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue; items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAgent(d, e) }); }
      for (const e of ambient) { const pl = layout.planAt(e.x, e.y); if (!pl || pl.floor !== f) continue; items.push({ ...charBox(e, pl.x, pl.z), draw: () => drawAmbient(d, e) }); }
      if (f === 0) for (const v of cars) { const L = STREET_SCALE.car.length / 2, b = { x0: v.x - L, x1: v.x + L, z0: v.y - L, z1: v.y + L }; items.push({ ...b, sb: boundsOf(b, 0, STREET_SCALE.car.height + 6), draw: () => style.vehicle(d, v) }); }
      for (const it of depthSort(items)) it.draw(d);
    }
    // Hovered or selected room outline.
    for (const id of [env.hoverId, env.selectedId]) {
      const room = id?.startsWith('room:') ? layout.locationById[id.slice(5)] : null;
      if (room?.poly) d.late.push(() => { poly(ctx, room.poly, 'rgba(255,255,255,0.05)', id === env.selectedId ? style.accent : 'rgba(255,255,255,0.7)', 1.4); });
    }
    for (const e of env.scene.entities.values()) if (e.kind === 'meeting' && e.meeting) { const { x, y } = e; d.late.push(() => style.meetingMarker(d, x, y)); }
    style.atmosphere?.(d, R);
    lighting.draw(ctx, day, lightsOf(d, agents), T, island);
  }

  return {
    id: skinId, art: 'hq', lod: [0.55, 1.35],
    background(ctx, camera) { sky.draw(ctx, camera.width, camera.height, performance.now() / 1000, dayPhase(), camera, style.sky); },
    frame,
  };
}

// Landscaping placed by rule (not World state; it never blocks a way, a door or a building): trees along the far
// edges of the island, low shrubs and flowers along the near edges, and flower borders on both sides of built paths.
function landscaping(model, U, R) {
  const out = [], seen = [];
  const ok = (x, z, m) => !model.buildings.some(b => x > b.r.x0 - m && x < b.r.x1 + m && z > b.r.z0 - m && z < b.r.z1 + m)
    && !model.forecourts.some(f => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m)
    && !model.ways.some(w => w.pts.some((p, i) => i && segDist(x, z, w.pts[i - 1], p) < w.W / 2 + m))
    && !model.plants.some(p => Math.hypot(p.x - x, p.z - z) < 1.2 * U) && !seen.some(([a, b]) => Math.hypot(a - x, b - z) < 1.1 * U);
  const put = (kind, x, z, s, seed, m = 0.6 * U) => { if (!ok(x, z, m)) return; seen.push([x, z]); out.push({ kind, x, z, s, seed }); };
  const hs = (a, b) => { let h = Math.imul(Math.round(a) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(b) + 7, 0xc2b2ae35); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };
  const inset = 1.6 * U;
  // Far edges (z1 and x0): a loose row of trees with shrubs between.
  for (let x = R.x0 + inset; x < R.x1 - inset; x += 2.6 * U) { const r = hs(x, 1); put(r > 0.5 ? (r > 0.8 ? 'conifer' : 'broadleaf') : r > 0.25 ? 'flowerShrub' : 'shrub', x, R.z1 - inset - r * U, 0.7 + r * 0.5, r, 1.4 * U); }
  for (let z = R.z0 + inset; z < R.z1 - inset; z += 2.6 * U) { const r = hs(z, 2); put(r > 0.55 ? (r > 0.85 ? 'birch' : 'broadleaf') : r > 0.25 ? 'flowerShrub' : 'shrub', R.x0 + inset + r * U, z, 0.7 + r * 0.5, r, 1.4 * U); }
  // Near edges (z0 and x1): low planting only, so nothing hides the HQ.
  for (let x = R.x0 + inset; x < R.x1 - inset; x += 1.9 * U) { const r = hs(x, 3); put(r > 0.6 ? 'flowerShrub' : r > 0.3 ? 'grassClump' : 'shrub', x, R.z0 + 0.9 * U + r * 0.5 * U, 0.6 + r * 0.35, r); }
  for (let z = R.z0 + inset; z < R.z1 - inset; z += 1.9 * U) { const r = hs(z, 4); put(r > 0.6 ? 'flowerShrub' : r > 0.3 ? 'grassClump' : 'shrub', R.x1 - 0.9 * U - r * 0.5 * U, z, 0.6 + r * 0.35, r); }
  // Flower borders along built paths.
  for (const w of model.ways) {
    if (w.kind !== 'path' || !w.built) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const [ax, az] = w.pts[i - 1], [bx, bz] = w.pts[i], L = Math.hypot(bx - ax, bz - az); if (!L) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, side = w.W / 2 + 0.8 * U;
      for (let s = 0.8 * U; s < L; s += 1.5 * U) for (const sg of [-1, 1]) { const r = hs(ax + s * 3, az + sg * 11); put(r > 0.45 ? 'flowerShrub' : 'grassClump', ax + (bx - ax) * (s / L) + nx * side * sg, az + (bz - az) * (s / L) + nz * side * sg, 0.5 + r * 0.25, r, 0.35 * U); }
    }
  }
  return out;
}

// Exterior dressing placed by rule (semantic types; the style draws them): lamps along built paths and roads, and at
// each entrance a sign, two planters, a bench and a flag. Positions come from the World's paths and doors only.
function exteriorDressing(model, U, inIsland) {
  const out = [], taken = [];
  const clearOfWays = (x, z, m) => !model.ways.some(w => w.pts.some((p, i) => i && segDist(x, z, w.pts[i - 1], p) < w.W / 2 + m));
  const free = (x, z, r) => inIsland(x, z, 1.5 * U) && !taken.some(t => Math.hypot(t[0] - x, t[1] - z) < r) && !model.buildings.some(b => x > b.r.x0 - 0.6 * U && x < b.r.x1 + 0.6 * U && z > b.r.z0 - 0.6 * U && z < b.r.z1 + 0.6 * U);
  const put = (o, r = 0.8 * U, onWay = false) => { if (!free(o.x, o.z, r) || (!onWay && !clearOfWays(o.x, o.z, 0.3 * U))) return false; taken.push([o.x, o.z]); out.push(o); return true; };
  for (const fc of model.forecourts) {
    const { x, z } = fc.door;
    put({ type: 'planter', x: x - 2.2 * U, z: z - 0.8 * U, w: 0.9 * U, d: 0.9 * U, h: 0.5 * U });
    put({ type: 'planter', x: x + 2.2 * U, z: z - 0.8 * U, w: 0.9 * U, d: 0.9 * U, h: 0.5 * U });
    for (const [dx, dz] of [[-4.6, -4.4], [4.6, -4.4], [-5.5, -2.5], [5.5, -2.5]]) if (put({ type: 'sign', x: x + dx * U, z: z + dz * U, w: 2.2 * U, d: 0.5 * U, h: 1.1 * U })) break;
    for (const [dx, dz] of [[4.2, -5.2], [-4.2, -5.6], [5.8, -4.5]]) if (put({ type: 'flag', x: x + dx * U, z: z + dz * U, w: 0.3 * U, d: 0.3 * U, h: 3.2 * U })) break;
    for (const [dx, dz] of [[3.6, -2.2], [-3.6, -2.2], [4.6, -3.2]]) if (put({ type: 'bench', x: x + dx * U, z: z + dz * U, w: 1.6 * U, d: 0.6 * U, h: 0.5 * U })) break;
  }
  for (const w of model.ways) {
    if (!w.built) continue;
    const pts = w.pts, side = w.W / 2 + 0.6 * U, step = (w.kind === 'road' ? 8 : 4.5) * U;
    let acc = step * 0.5, k = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az); if (!L) continue;
      let s = acc;
      for (; s < L; s += step) { const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t, nx = -(bz - az) / L, nz = (bx - ax) / L, sg = k++ % 2 ? 1 : -1; put({ type: 'lamp', x: x + nx * side * sg, z: z + nz * side * sg, w: 0.3 * U, d: 0.3 * U, h: 2.6 * U }, 2 * U, true); }
      acc = s - L;
    }
  }
  return out;
}
function segDist(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); }
