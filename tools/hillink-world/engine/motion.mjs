// Movement along waypoints and time-based clips. Pure time math; no DOM.
// Characters walk (their stride advances with distance, which drives the leg cycle) and ride lifts:
// a waypoint marked `.lift` means "call the car here, board, ride to that stop, step out".
export const WALK_SPEED = 260; // world units per second (layouts may set their own walkSpeed)
// Movement state (Pass 2), separate from what an agent is doing (operational state, core/truth.mjs) and from
// the clip it plays (animation state, engine/iso-view.mjs): stationary, walking, arriving (the last stretch,
// at half pace), waiting-lift, boarding, riding.
export const MOVEMENT_STATES = ['stationary', 'walking', 'arriving', 'waiting-lift', 'boarding', 'riding'];
const ARRIVE_PACE = 0.55;
const euclid = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const LIFT_PATIENCE = 25; // seconds; a rider never waits forever if a lift is jammed

// waypoints null: the layout found no route (fail closed). The character stays where it is, marked unreachable,
// rather than walking a made-up line through walls.
export function startPath(entity, waypoints, now) {
  entity.unreachable = !waypoints;
  if (!waypoints) { entity.path = []; entity.pathStart = now; entity.moving = false; return; }
  entity.path = waypoints.map(p => Object.assign([p[0], p[1]], p.lift ? { lift: p.lift } : {}));
  entity.pathStart = now;
  entity.moving = entity.path.length > 0;
}

// Advances an entity toward its next waypoint. Returns true while still moving (walking, waiting for or riding a lift).
// metric(a, b): distance between two projected points measured on the floor (layout.metric). Speed is in
// those units per second, so pace is the same across, into or out of a room and never depends on the camera.
// arriveDistance: the final stretch walked at ARRIVE_PACE so characters settle instead of sliding to a stop.
export function stepPath(entity, dtSeconds, { instant = false, speed = WALK_SPEED, lifts = {}, metric = euclid, arriveDistance = 0 } = {}) {
  if (!entity.moving || !entity.path?.length) { entity.moving = false; entity.gait = null; entity.motion = 'stationary'; return false; }
  if (instant) {
    const [x, y] = entity.path.at(-1); entity.x = x; entity.y = y; entity.path = [];
    if (entity.ride) { lifts[entity.ride.lift]?.cancel(entity.id); entity.ride = null; }
    entity.moving = false; entity.gait = null; entity.motion = 'stationary'; return false;
  }
  const pace = entity.speed ?? speed;
  let budget = pace * dtSeconds;
  // Arriving: the last waypoint is within arriveDistance (on the floor) and no lift ride is left.
  const last = entity.path.length === 1 && !entity.path[0].lift && arriveDistance > 0 && metric([entity.x, entity.y], entity.path[0]) < arriveDistance;
  if (last) budget *= ARRIVE_PACE;
  entity.motion = last ? 'arriving' : 'walking';
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
        entity.gait = r.phase === 'board' ? 'board' : 'wait-lift'; entity.motion = r.phase === 'board' ? 'boarding' : 'waiting-lift';
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
      if (r.phase === 'ride') { entity.x = lift.x; entity.y = lift.y; entity.gait = 'ride'; entity.motion = 'riding'; return true; }
      // exit / done: the car is at the destination stop; step out and walk to the landing.
      entity.x = lift.x; entity.y = r.to; entity.ride = null;
      r.out = false; entity.exiting = { r, x: lift.x, y: r.to };
      if (Math.hypot(tx - entity.x, ty - entity.y) > 1) delete wp.lift; else entity.path.shift();
      continue;
    }
    const dx = tx - entity.x, dy = ty - entity.y, d = Math.hypot(dx, dy), m = metric([entity.x, entity.y], [tx, ty]);
    if (Math.abs(dx) > 0.5) entity.facing = dx < 0 ? -1 : 1;
    // Screen direction for four-way characters: mostly sideways, or into/out of the room.
    if (d > 0.01) entity.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'back' : 'front';
    entity.gait = 'walk';
    // Stride counts floor distance, so the leg cycle matches ground covered (no moonwalking on depth moves).
    if (m <= budget) { entity.x = tx; entity.y = ty; entity.path.shift(); budget -= m; entity.stride = (entity.stride ?? 0) + m; }
    else { const k = budget / m; entity.x += dx * k; entity.y += dy * k; entity.stride = (entity.stride ?? 0) + budget; budget = 0; }
  }
  entity.moving = entity.path.length > 0;
  if (!entity.moving) { entity.gait = null; entity.motion = 'stationary'; }
  return entity.moving;
}

// Transient effects (message envelopes, completion bursts). Each has a start, duration and payload.
export class Effects {
  constructor() { this.list = []; }
  add(effect, now) { this.list.push({ ...effect, start: now }); }
  active(now) { this.list = this.list.filter(e => now - e.start < e.duration); return this.list; }
  get busy() { return this.list.length > 0; }
}
