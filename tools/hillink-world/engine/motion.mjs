// Movement along waypoints and time-based clips. Pure time math; no DOM.
// Characters walk (their stride advances with distance, which drives the leg cycle) and ride lifts:
// a waypoint marked `.lift` means "call the car here, board, ride to that stop, step out".
export const WALK_SPEED = 260; // world units per second (layouts may set their own walkSpeed)
const LIFT_PATIENCE = 25; // seconds; a rider never waits forever if a lift is jammed

export function startPath(entity, waypoints, now) {
  entity.path = waypoints.map(p => Object.assign([p[0], p[1]], p.lift ? { lift: p.lift } : {}));
  entity.pathStart = now;
  entity.moving = entity.path.length > 0;
}

// Advances an entity toward its next waypoint. Returns true while still moving (walking, waiting for or riding a lift).
export function stepPath(entity, dtSeconds, { instant = false, speed = WALK_SPEED, lifts = {} } = {}) {
  if (!entity.moving || !entity.path?.length) { entity.moving = false; entity.gait = null; return false; }
  if (instant) {
    const [x, y] = entity.path.at(-1); entity.x = x; entity.y = y; entity.path = [];
    if (entity.ride) { lifts[entity.ride.lift]?.cancel(entity.id); entity.ride = null; }
    entity.moving = false; entity.gait = null; return false;
  }
  let budget = (entity.speed ?? speed) * dtSeconds;
  while (budget > 0 && entity.path.length) {
    const wp = entity.path[0], [tx, ty] = wp;
    const lift = wp.lift ? lifts[wp.lift] : null;
    if (lift) {
      // Lift leg: wait at the shaft for the car, ride it, then step out when the doors open.
      if (!entity.ride) entity.ride = { lift: wp.lift, request: lift.call(entity.id, entity.y, ty) };
      const r = entity.ride.request;
      if (r.phase === 'call' || r.phase === 'board') {
        entity.gait = r.phase === 'board' ? 'board' : 'wait-lift';
        if (r.phase === 'board') entity.x += (lift.x - entity.x) * Math.min(1, dtSeconds * 8);
        if (r.since > LIFT_PATIENCE) { lift.cancel(entity.id); entity.ride = null; delete wp.lift; }
        return true;
      }
      if (r.phase === 'ride') { entity.x = lift.x; entity.y = lift.y; entity.gait = 'ride'; return true; }
      // exit / done: we're at the destination stop and step out.
      entity.x = lift.x; entity.y = r.to; entity.ride = null; entity.path.shift();
      continue;
    }
    const dx = tx - entity.x, dy = ty - entity.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) entity.facing = dx < 0 ? -1 : 1;
    entity.gait = 'walk';
    if (d <= budget) { entity.x = tx; entity.y = ty; entity.path.shift(); budget -= d; entity.stride = (entity.stride ?? 0) + d; }
    else { entity.x += (dx / d) * budget; entity.y += (dy / d) * budget; entity.stride = (entity.stride ?? 0) + budget; budget = 0; }
  }
  entity.moving = entity.path.length > 0;
  if (!entity.moving) entity.gait = null;
  return entity.moving;
}

// Transient effects (message envelopes, completion bursts). Each has a start, duration and payload.
export class Effects {
  constructor() { this.list = []; }
  add(effect, now) { this.list.push({ ...effect, start: now }); }
  active(now) { this.list = this.list.filter(e => now - e.start < e.duration); return this.list; }
  get busy() { return this.list.length > 0; }
}
