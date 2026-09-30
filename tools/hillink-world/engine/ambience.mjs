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

// Pass 5C: a route's corners, rounded. Each interior vertex becomes a short curve of radius up to `radius` (never
// more than 45% of either neighbouring segment), so anything that follows the polyline turns instead of snapping.
export function smoothPolyline(points, radius) {
  if (points.length < 3 || !(radius > 0)) return points.map(p => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i - 1], [cx, cy] = points[i], [bx, by] = points[i + 1];
    const la = Math.hypot(ax - cx, ay - cy), lb = Math.hypot(bx - cx, by - cy), r = Math.min(radius, la * 0.45, lb * 0.45);
    if (r < 1e-6) { out.push([cx, cy]); continue; }
    const q0 = [cx + (ax - cx) * r / la, cy + (ay - cy) * r / la], q1 = [cx + (bx - cx) * r / lb, cy + (by - cy) * r / lb];
    for (let k = 0; k <= 6; k++) { const t = k / 6; out.push([(1 - t) ** 2 * q0[0] + 2 * (1 - t) * t * cx + t * t * q1[0], (1 - t) ** 2 * q0[1] + 2 * (1 - t) * t * cy + t * t * q1[1]]); }
  }
  out.push([points.at(-1)[0], points.at(-1)[1]]);
  return out;
}
// Timing along a route (cached on the route): cumulative distance, and cumulative time at a speed that eases off in
// bends (the sharper the local turn over a car length or so, the slower), so vehicles slow into curves and pick up
// again after them. Heading is sampled per point so it can be interpolated smoothly.
function timingOf(r) {
  if (r._timing) return r._timing;
  const P = r.points, n = P.length, dist = [0], heading = [];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  for (let i = 0; i < n; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; heading.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
  const window = r.bendWindow ?? 40, slow = [];
  for (let i = 0; i < n; i++) {
    let j0 = i, j1 = i; while (j0 > 0 && dist[i] - dist[j0] < window) j0--; while (j1 < n - 1 && dist[j1] - dist[i] < window) j1++;
    let turn = Math.abs(heading[j1] - heading[j0]); if (turn > Math.PI) turn = 2 * Math.PI - turn;
    slow.push(1 - 0.5 * Math.min(1, turn / (Math.PI / 2)));
  }
  const time = [0];
  for (let i = 1; i < n; i++) time.push(time[i - 1] + (dist[i] - dist[i - 1]) / (r.speed * Math.min(slow[i - 1], slow[i])));
  return (r._timing = { dist, time, heading, length: dist[n - 1], duration: time[n - 1] });
}
const timeAt = (T, s) => { let lo = 0, hi = T.dist.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T.dist[mid] <= s) lo = mid; else hi = mid; } return T.time[lo] + (T.time[hi] - T.time[lo]) * ((s - T.dist[lo]) / Math.max(1e-9, T.dist[hi] - T.dist[lo])); };
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
// Where a vehicle is `age` seconds into a trip (ignoring any stop): position, smoothly interpolated heading, distance.
function along(r, age) {
  const T = timingOf(r), P = r.points, time = T.time;
  if (age <= 0) return { x: P[0][0], y: P[0][1], angle: T.heading[0], s: 0 };
  if (age >= T.duration) return { x: P.at(-1)[0], y: P.at(-1)[1], angle: T.heading.at(-1), s: T.length };
  let lo = 0, hi = time.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (time[mid] <= age) lo = mid; else hi = mid; }
  const k = (age - time[lo]) / Math.max(1e-9, time[hi] - time[lo]);
  return { x: P[lo][0] + (P[hi][0] - P[lo][0]) * k, y: P[lo][1] + (P[hi][1] - P[lo][1]) * k, angle: lerpAngle(T.heading[lo], T.heading[hi], k), s: T.dist[lo] + (T.dist[hi] - T.dist[lo]) * k };
}

// Vehicles: each route spawns trips at irregular intervals; a trip drives the polyline, easing off in bends
// (optionally braking to a stop at `stopAt` for `stopFor` seconds, e.g. a truck unloading at the site, then pulling
// away). `fade` (distance) fades a vehicle in and out at the route's ends, where it enters and leaves the map.
export function vehiclesAt(t, routes) {
  const out = [];
  routes.forEach((r, ri) => {
    const T = timingOf(r), stop = r.stopFor ?? 0, brake = stop ? 2 * (r.brakeS ?? 1.2) : 0, trip = T.duration + stop + brake;
    const every = r.every, back = Math.ceil(trip / every) + 1, w0 = Math.floor(t / every);
    for (let w = w0 - back; w <= w0; w++) {
      if (hash(w * 1.37 + ri * 17.3) > (r.chance ?? 0.7)) continue;
      const start = w * every + hash(w * 5.1 + ri) * every * 0.6, age = t - start;
      if (age < 0 || age > trip) continue;
      // Stopping trips: time is remapped so the car decelerates into the stop and accelerates out of it.
      let a = age, stopped = false;
      if (stop) {
        const ts = timeAt(T, (r.stopAt ?? 0.5) * T.length);
        const b = r.brakeS ?? 1.2;
        if (age < ts - b) a = age;
        else if (age < ts + b) { const u = (age - (ts - b)) / (2 * b); a = ts - b + b * (1 - (1 - u) * (1 - u)); } // braking to a stop
        else if (age < ts + b + stop) { a = ts; stopped = true; }
        else if (age < ts + 3 * b + stop) { const u = (age - (ts + b + stop)) / (2 * b); a = ts + b * u * u; }
        else a = age - stop - 2 * b;
      }
      const p = along(r, a), kinds = r.kinds ?? ['car'];
      const kind = kinds[Math.floor(hash(w * 2.9 + ri) * kinds.length)];
      const colors = r.colors ?? ['#c9ced6', '#2f3a4c', '#9b1d20', '#e6e8eb', '#1d2a44', '#5a6270'];
      const fade = r.fade ?? 0, alpha = fade > 0 ? Math.max(0, Math.min(1, p.s / fade, (T.length - p.s) / fade)) : 1;
      out.push({ id: `${ri}:${w}`, x: p.x, y: p.y, angle: p.angle, dx: Math.cos(p.angle), kind, color: colors[Math.floor(hash(w * 4.3 + ri) * colors.length)], scale: r.scale ?? 1, stopped, alpha });
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
