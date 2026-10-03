// Pass 5H vertical slice: the pixel skin (art 'px'), both themes over the ONE canonical generated layout (P1).
// It plugs into the canvas renderer like every skin: frame(ctx, env) draws the World; env.late carries the UI.
//
// Pixels: the World is rendered into a low-resolution art buffer (render/px/stage.mjs) and shown at an integer scale
// (2x by default) with nearest-neighbour sampling. Characters are 24 px tall, built from shared parts
// (render/px/character.mjs). Lighting (day, dusk, night) is a setting, not a clock.
// UI: a hover chip (name, status, state), the selection ring (in the art buffer) and a contextual details card for the
// selected agent, drawn at the screen's native resolution.
// Reads only: the frame's World is a read-only view; nothing here writes canonical state.
import { createStage } from './stage.mjs';
import { lookFor, clipFor, frameAt, facingOf, agentStatusOf } from './character.mjs';
import { STAGE_LABEL } from '../../procgen/construction.mjs';
import { fingerprint } from '../../procgen/rng.mjs';
import { PixelBuffer } from './buffer.mjs';
import { LIGHTING_IDS } from './palette.mjs';
import { stateOf, STATE_COLOR } from '../art5d/skin.mjs';
import { capabilityName } from '../../procgen/capabilities.mjs';
import { worldFingerprint } from '../../procgen/world.mjs';
import { definitionOf } from '../../core/agents.mjs';

export const PX_SCALE = 2; // the slice's display scale: one art pixel = 2 screen pixels
export const DEFAULT_LIGHTING = 'dusk';
const STATE_WORD = { working: 'Working', travelling: 'Walking', waiting: 'Waiting', blocked: 'Blocked', done: 'Done', idle: 'Idle', offline: 'Offline' };

// Stages are cached per World (fingerprint) and theme, so switching Real <-> Fantasy back and forth is instant after
// the first build. Layouts of one World are identical across themes (P1), so a stage depends only on these keys.
const stages = new Map();
export function stageFor(layout, theme, lighting = DEFAULT_LIGHTING) {
  const key = `${structureKey(layout.world)}|${theme}`;
  let s = stages.get(key);
  if (!s) { if (stages.size > 6) stages.clear(); s = createStage(layout, theme, { lighting }); stages.set(key, s); }
  s.setLighting(lighting);
  return s;
}
// V2: a stage depends on the World's structure, capabilities and construction projects (their stage and gates), not
// on agent activity, so a status change re-renders the frame without re-baking the scene.
export function structureKey(world) {
  const projects = Object.values(world.projects ?? {}).map(p => [p.id, p.stage, !!p.blocked, !!p.waiting, !!p.completed]).sort();
  return fingerprint({ seed: world.seed, spaces: world.spaces, doors: world.doors, buildings: world.buildings, roads: world.roads, paths: world.paths, capabilities: world.capabilities, environment: world.environment, projects });
}
// The canonical name of a construction site: the capability's one display name (world.capabilities spec, P4) and the
// canonical stage label. The same in both themes.
export function siteLabelOf(world, projectId) {
  const p = world?.projects?.[projectId], spec = world?.capabilities?.[projectId]?.spec; if (!p || !spec) return null;
  return `${capabilityName(spec)}: ${STAGE_LABEL[p.stage] ?? p.stage}${p.blocked ? ' (blocked)' : p.waiting ? ' (waiting for Kyle)' : ''}`;
}
let currentLighting = DEFAULT_LIGHTING;
export const setPxLighting = id => { if (LIGHTING_IDS.includes(id)) currentLighting = id; return currentLighting; };
export const pxLighting = () => currentLighting;

// The canonical display name of the room a space is (P4: one name per capability, the same in both themes).
export function roomNameOf(world, spaceId) {
  const s = world?.spaces?.[spaceId]; if (!s) return null;
  const caps = (s.capabilities ?? []).map(id => world.capabilities?.[id]?.spec ?? { id, kind: id });
  return caps.length ? caps.map(capabilityName).join(' & ') : null;
}

// The location an agent's spot is in. A spot is `${location id}:${station id}` (engine/iso-view), and both ids may
// themselves contain colons (construction sites: `site:<project>` and `site:<project>:build1`), so the spot is looked
// up whole in the layout's station table; failing that, the longest location id it starts with (then a colon) wins.
export function locationOfSpot(layout, spot) {
  if (typeof spot !== 'string' || !spot) return null;
  const byId = layout?.locationById ?? {}, info = layout?.stationInfo?.[spot];
  if (info?.room && byId[info.room]) return byId[info.room];
  let best = null;
  for (const id of Object.keys(byId)) if (spot.startsWith(`${id}:`) && (!best || id.length > best.length)) best = id;
  return best ? byId[best] : null;
}
// The canonical label of a location: a room's capability name, a construction site's capability name and stage.
export function placeLabelOf(layout, loc) {
  if (!loc) return null;
  if (loc.spaceId) return roomNameOf(layout.world, loc.spaceId) ?? loc.name ?? null;
  if (loc.site && loc.project) return siteLabelOf(layout.world, loc.project.id) ?? loc.name ?? null;
  return loc.name ?? null;
}
export const spotLabelOf = (layout, spot) => placeLabelOf(layout, locationOfSpot(layout, spot));

// Agent entities -> stage actors (pure; exported for the harness and tests).
export function actorsOf(entities, layout, theme, { time = 0, reduced = false, hoverId = null, selectedId = null, A }) {
  const out = [];
  for (const e of entities) {
    if (e.kind !== 'agent' || !e.agent) continue;
    if (e.ride && ['board', 'ride', 'exit'].includes(e.ride.request?.phase)) continue;
    const pl = layout.planAt(e.x, e.y) ?? { x: e.x, z: 0, floor: 0 };
    const look = lookFor(e.agent.id, theme, definitionOf(e.agent));
    // V2: the clip follows the agent's canonical status (activity, route, animation intent); blocked and waiting come
    // only from canonical facts.
    const status = agentStatusOf({ activity: e.agent.activity, moving: e.moving, state: e.anim?.state, intent: e.anim?.intent });
    const clip = clipFor(look, { state: e.anim?.state, moving: e.moving, posture: e.posture, status });
    const t = reduced ? 0 : Math.max(0, (time - (e.anim?.since ?? 0)) / 1000);
    out.push({ id: e.id, status, look, lookKey: `${e.agent.id}:${theme}`, foot: [e.x / A, e.y / A], plan: pl, facing: facingOf(e.heading, e.dir), clip, frame: frameAt(clip, e.moving ? time / 1000 : t), sitting: e.posture === 'sit', hovered: e.id === hoverId, selected: e.id === selectedId });
  }
  return out;
}

export function createPxSkin(layout, theme = 'real') {
  const key = theme === 'fantasy' ? 'fantasy' : 'real';
  let stage = stageFor(layout, key, currentLighting);
  let buf = null, img = null, off = null;
  const font = (px, w = 600) => `${w} ${px}px ui-sans-serif, system-ui, sans-serif`;

  function frame(ctx, env) {
    if (stage.lighting !== currentLighting) stage.setLighting(currentLighting);
    const A = stage.A, T = ctx.getTransform(), s = Math.max(1, Math.round(T.a * A)), c = ctx.canvas;
    // The art-pixel window on screen (from the camera transform), whole pixels.
    const inv = T.inverse(), wx0 = inv.e, wy0 = inv.f, wx1 = inv.a * c.width + inv.e, wy1 = inv.d * c.height + inv.f;
    const x0 = Math.floor(wx0 / A), y0 = Math.floor(wy0 / A), w = Math.ceil(wx1 / A) - x0 + 1, h = Math.ceil(wy1 / A) - y0 + 1;
    if (!buf || buf.w !== w || buf.h !== h) { buf = new PixelBuffer(w, h); off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); img = new ImageData(w, h); }
    const time = env.reducedMotion ? 0 : env.time / 1000;
    const agents = [...(env.scene?.entities.values() ?? [])];
    const actors = actorsOf(agents, layout, key, { time: env.time, reduced: env.reducedMotion, hoverId: env.hoverId, selectedId: env.selectedId, A });
    stage.render(buf, { x0, y0, w, h }, time, actors);
    new Uint32Array(img.data.buffer).set(buf.data);
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    const dx = Math.round(T.a * x0 * A + T.e), dy = Math.round(T.d * y0 * A + T.f);
    ctx.drawImage(off, 0, 0, w, h, dx, dy, w * s, h * s);
    ctx.restore();
    // UI at native resolution.
    const toScreen = (ax, ay) => [dx + (ax - x0) * s, dy + (ay - y0) * s];
    const hov = agents.find(e => e.id === env.hoverId && e.kind === 'agent' && e.agent), sel = agents.find(e => e.id === env.selectedId && e.kind === 'agent' && e.agent);
    env.late.push(() => {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = (globalThis.devicePixelRatio || 1) > 1.5 ? 2 : 1;
      if (hov && hov !== sel) chip(ctx, hov, toScreen(hov.x / A, hov.y / A - 27), dpr);
      if (sel) card(ctx, sel, toScreen(sel.x / A + 10, sel.y / A - 30), env, dpr);
      ctx.restore();
    });
  }
  function chip(ctx, e, [x, y], k) {
    const st = stateOf(e, e.agent), dot = STATE_COLOR[st] ?? '#8aa0b8', name = e.agent.name ?? e.agent.id, word = STATE_WORD[st] ?? st;
    ctx.font = font(11 * k, 700); const nw = ctx.measureText(name).width; ctx.font = font(10 * k, 500); const ww = ctx.measureText(word).width;
    const W = nw + ww + 26 * k, H = 18 * k, X = Math.round(x - W / 2), Y = Math.round(y - H);
    ctx.fillStyle = 'rgba(14,20,30,0.88)'; ctx.fillRect(X, Y, W, H); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X, Y + H, W, k);
    ctx.fillStyle = dot; ctx.fillRect(X + 6 * k, Y + 6 * k, 6 * k, 6 * k);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = font(11 * k, 700); ctx.fillStyle = '#f3f6fa'; ctx.fillText(name, X + 16 * k, Y + H / 2 + 0.5);
    ctx.font = font(10 * k, 500); ctx.fillStyle = '#aeb9c8'; ctx.fillText(word, X + 20 * k + nw, Y + H / 2 + 0.5);
  }
  function card(ctx, e, [x, y], env, k) {
    const a = e.agent, world = env.world, st = stateOf(e, a), def = definitionOf(a) ?? {};
    const task = a.taskId ? world?.tasks?.[a.taskId]?.title : null, loc = locationOfSpot(layout, e.spot);
    const room = placeLabelOf(layout, loc);
    const lines = [[a.name ?? a.id, 13, 700, '#f6f8fb'], [a.roleTitle ?? def.roleTitle ?? a.role ?? '', 10.5, 500, '#aeb9c8'], [`● ${STATE_WORD[st] ?? st}`, 11, 600, STATE_COLOR[st] ?? '#c9d2de'], task ? [`Task: ${task}`, 10.5, 500, '#dfe6ee'] : null, room ? [`Room: ${room}`, 10.5, 500, '#dfe6ee'] : null, ['Enter: details', 9.5, 500, '#7f8ba0']].filter(Boolean);
    const W = Math.min(260 * k, Math.max(...lines.map(([t, px, w]) => { ctx.font = font(px * k, w); return ctx.measureText(t).width; })) + 20 * k), H = lines.reduce((s, [, px]) => s + (px + 5) * k, 0) + 12 * k;
    const cw = ctx.canvas.width, X = Math.round(Math.min(cw - W - 8, x)), Y = Math.round(Math.max(8, y - H / 2));
    ctx.fillStyle = 'rgba(12,17,26,0.92)'; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(X, Y, 3 * k, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = k; ctx.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
    let cy = Y + 8 * k; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const [t, px, w, col] of lines) { ctx.font = font(px * k, w); ctx.fillStyle = col; ctx.fillText(t, X + 12 * k, cy, W - 18 * k); cy += (px + 5) * k; }
  }

  return {
    id: `px-${key}`, art: 'px', lod: [0, 0], stage,
    get lighting() { return currentLighting; },
    // Zoom snapped so one art pixel is a whole number of device pixels (PX_SCALE by default).
    snapZoom(zoom, dpr = 1) { const s = Math.max(1, Math.min(6, Math.round(zoom * dpr * stage.A))); return s / (dpr * stage.A); },
    stepZoom(zoom, dpr, dir) { const s = Math.round(zoom * dpr * stage.A); return Math.max(1, Math.min(6, s + dir)) / (dpr * stage.A); },
    defaultZoom: (dpr = 1) => PX_SCALE / (dpr * stage.A),
    background(ctx, camera) { ctx.fillStyle = key === 'fantasy' ? '#1f2a1c' : '#22301f'; ctx.fillRect(0, 0, camera.width, camera.height); },
    frame,
  };
}
