// Lift: one elevator car in a shaft. It serves agents first (call -> board -> ride -> exit) and,
// when nobody needs it, makes occasional ambient trips so the building never looks frozen.
// Pure time math over dt; randomness comes from an injected rng so tests are deterministic.
export class Lift {
  constructor({ id, x, stops, speed = 70, doorSeconds = 0.55, rng = Math.random, ambient = true }) {
    Object.assign(this, { id, x, stops: [...stops].sort((a, b) => a - b), speed, doorSeconds, rng, ambient });
    this.y = this.stops.at(-1); this.target = this.y; this.doors = 0; this.doorGoal = 0;
    this.requests = []; this.dwell = 2 + rng() * 4; this.hold = 0; this.passenger = false; this.openFor = 0; this.arriving = false;
  }
  nearestStop(y) { return this.stops.reduce((b, s) => (Math.abs(s - y) < Math.abs(b - y) ? s : b), this.stops[0]); }
  // An agent at a stop asks to ride to another stop. Returns the request; its phase drives the rider.
  call(rider, fromY, toY) {
    this.cancel(rider);
    const r = { rider, from: this.nearestStop(fromY), to: this.nearestStop(toY), phase: 'call', since: 0 };
    this.requests.push(r);
    return r;
  }
  cancel(rider) {
    const i = this.requests.findIndex(r => r.rider === rider);
    if (i >= 0 && this.requests[i].phase !== 'ride') this.requests.splice(i, 1);
  }
  get moving() { return Math.abs(this.target - this.y) > 0.5; }
  get riders() { return this.requests.filter(r => r.phase === 'ride').map(r => r.rider); }

  update(dt) {
    // Doors move toward their goal; the car only travels with doors shut.
    const doorStep = dt / this.doorSeconds;
    this.doors = this.doorGoal > this.doors ? Math.min(this.doorGoal, this.doors + doorStep) : Math.max(this.doorGoal, this.doors - doorStep);
    const r = this.requests[0];
    for (const q of this.requests) q.since += dt;
    if (r) this.serve(r, dt);
    else this.idle(dt);
  }
  travel(dt) {
    if (!this.moving) { this.y = this.target; return false; }
    if (this.doors > 0) { this.doorGoal = 0; return true; }
    const d = this.target - this.y, step = Math.min(Math.abs(d), this.speed * dt);
    // Ease in the last few units so stops don't look like collisions.
    const k = Math.abs(d) < 18 ? Math.max(0.35, Math.abs(d) / 18) : 1;
    this.y += Math.sign(d) * step * k;
    if (Math.abs(this.target - this.y) < 0.5) this.y = this.target;
    return true;
  }
  serve(r, dt) {
    this.passenger = false;
    if (r.phase === 'call') {
      this.target = r.from;
      if (this.travel(dt)) return;
      this.doorGoal = 1;
      if (this.doors >= 1) { r.phase = 'board'; this.hold = 0.35; }
    } else if (r.phase === 'board') {
      this.hold -= dt;
      if (this.hold <= 0) { r.phase = 'ride'; this.target = r.to; }
    } else if (r.phase === 'ride') {
      this.target = r.to;
      if (this.travel(dt)) return;
      this.doorGoal = 1;
      if (this.doors >= 1) { r.phase = 'exit'; this.hold = 0.6; }
    } else if (r.phase === 'exit') {
      this.hold -= dt;
      if (this.hold <= 0) { r.phase = 'done'; this.requests.shift(); this.dwell = 1.5 + this.rng() * 2; }
    }
  }
  // Ambient: after arriving, doors open for a moment; then the car waits and sometimes travels to another floor.
  idle(dt) {
    if (this.travel(dt)) { this.arriving = true; return; }
    if (this.arriving) { this.arriving = false; this.openFor = 1.6; }
    if (this.openFor > 0) { this.doorGoal = 1; if (this.doors >= 1) this.openFor -= dt; return; }
    this.doorGoal = 0; this.passenger = false;
    if (!this.ambient) return;
    this.dwell -= dt;
    if (this.dwell <= 0 && this.doors <= 0) {
      const others = this.stops.filter(s => s !== this.y);
      this.target = others[Math.floor(this.rng() * others.length)];
      this.passenger = this.rng() < 0.5; // a staff member rides along some of the time
      this.dwell = 3.5 + this.rng() * 7;
    }
  }
}

// Small seeded generator for deterministic ambience.
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
