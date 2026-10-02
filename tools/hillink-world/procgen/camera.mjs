// Pass 5A: camera framing for a world that grows. The camera itself (engine/camera.mjs: pan, zoom about a point,
// focus, follow) is unchanged; this module decides what it should frame, from canonical geometry only:
//
//   world      the whole map (the limit of zooming out, however large the map becomes)
//   settlement everything developed so far, with a margin (the default view; it grows with the settlement)
//   building   one building and its immediate surroundings
//   room       one space
//   agent      an agent's canonical location (the space HQ says it is in), for follow
//
// Zoom limits come from the same units: fully out shows the map; fully in shows about three people across, so a
// person is never smaller than a sticker or larger than the screen, whatever the world's size.
import { DIMS } from './units.mjs';
import { rect, union, inset, centre } from './geom.mjs';

const pad = (r, m) => inset(r, -m);
const fit = (target, viewport) => Math.min(viewport.w / target.w, viewport.h / target.h); // pixels per metre

export function frames(world) {
  const size = world.terrain.options.size;
  const built = [...Object.values(world.parcels).filter(p => p.status !== 'vacant').map(p => p.rect), ...Object.values(world.buildings).map(b => b.footprint)];
  const out = { world: rect(0, 0, size, size), settlement: built.length ? pad(union(built), 24) : rect(0, 0, size, size), buildings: {}, rooms: {} };
  for (const b of Object.values(world.buildings)) out.buildings[b.id] = pad(b.footprint, 5);
  for (const s of Object.values(world.spaces)) out.rooms[s.id] = pad(s.rect, 1.5);
  return out;
}

export function frameFor(world, target) {
  const f = frames(world);
  if (target === 'world' || target === 'settlement') return f[target];
  if (f.buildings[target]) return f.buildings[target];
  if (f.rooms[target]) return f.rooms[target];
  const a = world.ops.agents[target];
  if (a?.spaceId && f.rooms[a.spaceId]) return { ...f.rooms[a.spaceId], follow: target, at: centre(world.spaces[a.spaceId].rect) };
  return null;
}

// Zoom range in pixels per metre for a viewport, and the zoom that frames a target.
export function zoomLimits(world, viewport) {
  const min = fit(frames(world).world, viewport), personSpan = 3 * DIMS.person.height;
  return { min, max: Math.max(min, Math.min(viewport.w, viewport.h) / personSpan) };
}
export function zoomToFrame(world, target, viewport) {
  const r = typeof target === 'string' ? frameFor(world, target) : target;
  if (!r) return null;
  const { min, max } = zoomLimits(world, viewport);
  return { zoom: Math.max(min, Math.min(max, fit(r, viewport))), centre: centre(r) };
}
