// Ambient life: pure functions of time for things that are not Hillink data (cars, staff, machinery).
// Nothing here reads World state. Each object gets its own period and seed so motion never syncs up.
export const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Occasional event: time is cut into windows of `every` seconds; a window fires with `chance` at a
// random offset and lasts `duration`. Returns progress 0..1 while firing, or -1.
export function occasional(t, { every, duration, chance = 1, seed = 0 }) {
  const w = Math.floor(t / every), start = w * every + hash(w * 7.13 + seed) * Math.max(0, every - duration);
  if (hash(w * 3.71 + seed * 1.9) > chance) return -1;
  const p = (t - start) / duration;
  return p >= 0 && p < 1 ? p : -1;
}

// Polyline helpers.
export function polyLength(points) { let d = 0; for (let i = 1; i < points.length; i++) d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]); return d; }
export function pointAt(points, dist) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], seg = Math.hypot(bx - ax, by - ay);
    if (dist <= seg || i === points.length - 1) {
      const k = seg ? Math.min(1, Math.max(0, dist / seg)) : 0;
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, angle: Math.atan2(by - ay, bx - ax), dx: bx - ax };
    }
    dist -= seg;
  }
  return { x: points[0][0], y: points[0][1], angle: 0, dx: 0 };
}

// Vehicles: each route spawns trips at irregular intervals; a trip drives the polyline at `speed`
// (optionally stopping at `stopAt` for `stopFor` seconds, e.g. a truck unloading at the site).
export function vehiclesAt(t, routes) {
  const out = [];
  routes.forEach((r, ri) => {
    const len = polyLength(r.points), stop = r.stopFor ?? 0, trip = len / r.speed + stop;
    const every = r.every, back = Math.ceil(trip / every) + 1, w0 = Math.floor(t / every);
    for (let w = w0 - back; w <= w0; w++) {
      if (hash(w * 1.37 + ri * 17.3) > (r.chance ?? 0.7)) continue;
      const start = w * every + hash(w * 5.1 + ri) * every * 0.6, age = t - start;
      if (age < 0 || age > trip) continue;
      const s = (r.stopAt ?? 0.5) * len, ts = s / r.speed;
      const d = !stop || age < ts ? age * r.speed : age < ts + stop ? s : s + (age - ts - stop) * r.speed;
      const p = pointAt(r.points, d), kinds = r.kinds ?? ['car'];
      const kind = kinds[Math.floor(hash(w * 2.9 + ri) * kinds.length)];
      const colors = r.colors ?? ['#c9ced6', '#2f3a4c', '#9b1d20', '#e6e8eb', '#1d2a44', '#5a6270'];
      out.push({ id: `${ri}:${w}`, x: p.x, y: p.y, angle: p.angle, dx: p.dx, kind, color: colors[Math.floor(hash(w * 4.3 + ri) * colors.length)], scale: r.scale ?? 1, stopped: !!stop && age >= ts && age < ts + stop });
    }
  });
  return out;
}

// NPC staff: walk a route back and forth with pauses, or stand and idle. Deterministic from time.
export function npcAt(t, npc, index = 0) {
  const pts = npc.route, speed = npc.speed ?? 22;
  if (!pts || pts.length < 2) return { x: pts?.[0]?.[0] ?? 0, y: pts?.[0]?.[1] ?? 0, facing: npc.facing ?? 1, moving: false, pose: npc.pose ?? 'idle' };
  const len = polyLength(pts), walk = len / speed, pause = npc.pause ?? 4;
  const cycle = 2 * (walk + pause), offset = hash(index * 9.7 + 3) * cycle, u = (t + offset) % cycle;
  let dist, forward, moving;
  if (u < pause) { dist = 0; forward = true; moving = false; }
  else if (u < pause + walk) { dist = (u - pause) * speed; forward = true; moving = true; }
  else if (u < 2 * pause + walk) { dist = len; forward = false; moving = false; }
  else { dist = len - (u - 2 * pause - walk) * speed; forward = false; moving = true; }
  const p = pointAt(pts, dist), dir = forward ? Math.sign(p.dx) || 1 : -(Math.sign(p.dx) || 1);
  return { x: p.x, y: p.y, facing: dir, moving, pose: moving ? 'walk' : npc.pose ?? 'idle', stride: moving ? (u * speed) : 0 };
}
