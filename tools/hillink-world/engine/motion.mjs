// Movement along waypoints and time-based clips. Pure time math; no DOM.
export const WALK_SPEED = 260; // world units per second

export function startPath(entity, waypoints, now) {
  entity.path = waypoints.map(p => [p[0], p[1]]);
  entity.pathStart = now;
  entity.moving = entity.path.length > 0;
}

// Advances an entity toward its next waypoint. Returns true while still moving.
export function stepPath(entity, dtSeconds, { instant = false } = {}) {
  if (!entity.moving || !entity.path?.length) { entity.moving = false; return false; }
  if (instant) { const [x, y] = entity.path.at(-1); entity.x = x; entity.y = y; entity.path = []; entity.moving = false; return false; }
  let budget = WALK_SPEED * dtSeconds;
  while (budget > 0 && entity.path.length) {
    const [tx, ty] = entity.path[0];
    const dx = tx - entity.x, dy = ty - entity.y, d = Math.hypot(dx, dy);
    if (d <= budget) { entity.x = tx; entity.y = ty; entity.path.shift(); budget -= d; }
    else { entity.x += (dx / d) * budget; entity.y += (dy / d) * budget; entity.facing = dx < 0 ? -1 : dx > 0 ? 1 : entity.facing; budget = 0; }
  }
  entity.moving = entity.path.length > 0;
  return entity.moving;
}

// Transient effects (message envelopes, completion bursts). Each has a start, duration and payload.
export class Effects {
  constructor() { this.list = []; }
  add(effect, now) { this.list.push({ ...effect, start: now }); }
  active(now) { this.list = this.list.filter(e => now - e.start < e.duration); return this.list; }
  get busy() { return this.list.length > 0; }
}
