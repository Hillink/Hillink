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
  // The car holds its doors until a rider who just left is clear of them.
  const ex = entity.exiting;
  if (ex && Math.hypot(entity.x - ex.x, entity.y - ex.y) > 22) { ex.r.out = true; entity.exiting = null; }
  while (budget > 0 && entity.path.length) {
    const wp = entity.path[0], [tx, ty] = wp;
    const lift = wp.lift ? lifts[wp.lift] : null;
    if (lift) {
      // Lift leg: wait at the shaft for the car, ride it, then step out when the doors open.
      if (!entity.ride) { entity.ride = { lift: wp.lift, request: lift.call(entity.id, entity.y, ty) }; entity.ride.request.boarded = false; }
      const r = entity.ride.request;
      if (r.phase === 'call' || r.phase === 'board') {
        entity.gait = r.phase === 'board' ? 'board' : 'wait-lift';
        if (r.phase === 'board') {
          // Step into the car (its centre, on this floor) at walking pace.
          const bx = lift.x - entity.x, by = lift.y - entity.y, bd = Math.hypot(bx, by), s = Math.min(bd, (entity.speed ?? speed) * dtSeconds);
          if (bd < 1) r.boarded = true;
          if (bd > 0.01) { entity.x += (bx / bd) * s; entity.y += (by / bd) * s; entity.stride = (entity.stride ?? 0) + s; if (Math.abs(bx) > 0.5) entity.facing = bx < 0 ? -1 : 1; }
          entity.dir = Math.abs(bx) > Math.abs(by) * 1.2 ? (bx < 0 ? 'left' : 'right') : by < 0 ? 'back' : 'front';
        }
        if (r.since > LIFT_PATIENCE) { lift.cancel(entity.id); entity.ride = null; delete wp.lift; }
        return true;
      }
      if (r.phase === 'ride') { entity.x = lift.x; entity.y = lift.y; entity.gait = 'ride'; return true; }
      // exit / done: the car is at the destination stop; step out and walk to the landing.
      entity.x = lift.x; entity.y = r.to; entity.ride = null;
      r.out = false; entity.exiting = { r, x: lift.x, y: r.to };
      if (Math.hypot(tx - entity.x, ty - entity.y) > 1) delete wp.lift; else entity.path.shift();
      continue;
    }
    const dx = tx - entity.x, dy = ty - entity.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) entity.facing = dx < 0 ? -1 : 1;
    // Screen direction for four-way characters: mostly sideways, or into/out of the room.
    if (d > 0.01) entity.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'back' : 'front';
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
