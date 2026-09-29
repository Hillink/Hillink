import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, applyEvent, emptyWorld } from '../core/state.mjs';
import { placeAgents } from '../core/behavior.mjs';
import { loadTheme } from '../themes/index.mjs';
import { Lift, seeded } from '../engine/lift.mjs';
import { stepPath, startPath, Effects } from '../engine/motion.mjs';
import { occasional, vehiclesAt, npcAt, polyLength } from '../engine/ambience.mjs';
import { Scene } from '../engine/scene.mjs';
import { IsoWorldView, resolveState, PRODUCTIVE_STATES, STATES } from '../engine/iso-view.mjs';
import { Simulator } from '../sim/simulator.mjs';

const ev = (type, fields, at = 1000) => makeEvent(type, fields, { source: 'sim', at });
const theme = loadTheme('real'), L = theme.layout;

test('lift: a call brings the car, opens the doors, rides and lets the rider out', () => {
  const lift = new Lift({ id: 'l', x: 0, stops: [100, 200, 300], speed: 100, rng: seeded(3) });
  lift.y = 100; lift.target = 100;
  const r = lift.call('a', 300, 100);
  const phases = new Set();
  for (let i = 0; i < 600 && r.phase !== 'done'; i++) { lift.update(0.05); phases.add(r.phase); if (r.phase === 'ride') assert.equal(lift.doors <= 1, true); }
  assert.deepEqual([...phases], ['call', 'board', 'ride', 'exit', 'done']);
  assert.equal(lift.y, 100);
  assert.equal(lift.requests.length, 0);
});

test('lift: never travels with its doors open, and wanders between floors when idle', () => {
  const lift = new Lift({ id: 'l', x: 0, stops: [100, 200, 300], speed: 120, rng: seeded(9) });
  const visited = new Set();
  for (let i = 0; i < 4000; i++) {
    const before = lift.y; lift.update(0.05);
    if (lift.y !== before) assert.equal(lift.doors, 0, 'doors shut while moving');
    visited.add(lift.y);
  }
  assert.ok([100, 200, 300].filter(s => visited.has(s)).length >= 2, 'ambient trips visit several floors');
});

test('motion: a rider waits for the car, rides it and walks on', () => {
  const lifts = { tower: new Lift({ id: 'tower', x: 50, stops: [100, 300], speed: 200, rng: seeded(1) }) };
  const e = { id: 'claude', x: 0, y: 300 };
  startPath(e, [[50, 300], Object.assign([50, 100], { lift: 'tower' }), [120, 100]], 0);
  const gaits = new Set();
  for (let i = 0; i < 2000 && e.moving; i++) { stepPath(e, 0.02, { speed: 100, lifts }); lifts.tower.update(0.02); gaits.add(e.gait); }
  assert.equal(e.moving, false);
  assert.deepEqual([e.x, e.y], [120, 100]);
  for (const g of ['walk', 'ride']) assert.ok(gaits.has(g), g);
  assert.ok(e.stride > 100, 'walking advances the stride that drives the leg cycle');
});

test('ambience: occasional, vehicles and staff are deterministic and stay on their routes', () => {
  const hits = []; for (let t = 0; t < 200; t += 0.5) { const p = occasional(t, { every: 10, duration: 2, chance: 1, seed: 1 }); assert.ok(p === -1 || (p >= 0 && p < 1)); if (p >= 0) hits.push(t); }
  assert.ok(hits.length > 0 && hits.length < 200, 'fires sometimes, not always');
  const route = { points: [[0, 0], [100, 0]], speed: 20, every: 3, chance: 1 };
  for (let t = 0; t < 60; t += 0.7) for (const v of vehiclesAt(t, [route])) assert.ok(v.x >= -0.001 && v.x <= 100.001 && v.y === 0);
  assert.deepEqual(vehiclesAt(42, [route]), vehiclesAt(42, [route]));
  const npc = { route: [[0, 0], [30, 40]], speed: 10, pause: 2 }, len = polyLength(npc.route);
  for (let t = 0; t < 60; t += 0.3) { const s = npcAt(t, npc, 2); assert.ok(Math.hypot(s.x, s.y) <= len + 1e-6); if (!s.moving) assert.notEqual(s.pose, 'walk'); }
});

test('truth: productive states only for real work, at the assigned station, after arriving', () => {
  const at = (activity, extra = {}) => resolveState({ agent: { activity }, spot: 'development:desk5', placeKey: 'development:desk5', posture: 'sit', ...extra }, 10_000);
  for (const activity of ['idle', 'offline', 'waiting', 'error', 'completed', 'communicating']) assert.ok(!PRODUCTIVE_STATES.has(at(activity)), `${activity} is never productive`);
  assert.equal(at('coding'), 'type');
  assert.equal(at('coding', { posture: 'stand' }), 'work');
  assert.equal(at('reviewing', { posture: 'stand' }), 'inspect');
  assert.equal(at('researching'), 'read');
  assert.equal(at('coding', { spot: 'lounge:couchSeat1' }), 'idle', 'assigned is not working: not at the desk yet');
  assert.equal(at('coding', { moving: true, gait: 'walk' }), 'walk');
  assert.equal(at('reviewing', { moving: true, gait: 'ride', spot: null }), 'idle', 'riding the lift is not reviewing');
  assert.equal(at('coding', { departAt: 20_000, reactEnd: 20_000 }), 'react');
  assert.equal(at('offline'), 'offline');
  assert.equal(at('error'), 'blocked');
  for (const s of PRODUCTIVE_STATES) assert.ok(STATES.includes(s));
});

test('meetings: only a meeting gathers agents; it restores what they were doing', () => {
  const w = emptyWorld();
  for (const id of ['claude', 'codex']) applyEvent(w, ev('AGENT_REGISTERED', { agentId: id, name: id, role: 'r', activity: 'idle' }));
  applyEvent(w, ev('AGENT_REVIEWING', { agentId: 'codex' }));
  const before = placeAgents(Object.values(w.agents), {}, L);
  applyEvent(w, ev('AGENT_MESSAGE', { agentId: 'claude', toAgentId: 'codex' }));
  assert.equal(placeAgents(Object.values(w.agents), before, L).claude.location, before.claude.location, 'a message sender stays put');
  applyEvent(w, ev('MEETING_STARTED', { meetingId: 'm1', agentIds: ['claude', 'codex'] }));
  const inMeeting = placeAgents(Object.values(w.agents), before, L);
  assert.equal(L.locationById[inMeeting.claude.location].id, 'lounge'); assert.equal(L.locationById[inMeeting.codex.location].id, 'lounge');
  applyEvent(w, ev('MEETING_ENDED', { meetingId: 'm1' }));
  assert.equal(w.agents.codex.activity, 'reviewing'); assert.equal(w.agents.claude.activity, 'idle');
  assert.equal(w.meetings.m1, undefined);
});

function viewFor() {
  const store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  store.subscribe((changed, world) => view.sync(world, changed, clock * 1000));
  let clock = 0; // seconds; keeps running across run() calls like a real frame loop
  return { store, scene, view, now: () => clock * 1000, run(seconds, dt = 0.05, each) { for (let t = 0; t < seconds; t += dt) { clock += dt; view.step(dt, clock * 1000, { instant: false }, stepPath); for (const l of Object.values(view.lifts)) l.update?.(0); each?.(); } } };
}

test('view: rooms react only to real work, and a rebuild places agents without replaying walks', () => {
  const { store, scene, view, run } = viewFor();
  store.reset([ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'Builder', activity: 'idle' })]);
  const e = scene.get('agent:claude');
  assert.equal(e.moving ?? false, false, 'placed directly on rebuild');
  assert.equal(L.locationAt(e.x, e.y).id, 'lounge');
  run(0.2); assert.deepEqual(view.activity.rooms, {}, 'idle agents light nothing');
  assert.ok(!PRODUCTIVE_STATES.has(e.anim.state));
  store.dispatch(ev('TASK_CREATED', { taskId: 't', title: 'Fix' }, 2000)); store.dispatch(ev('TASK_STARTED', { taskId: 't', agentId: 'claude', activity: 'coding' }, 2001)); store.flush();
  run(0.5); assert.equal(view.activity.rooms.development, undefined, 'not while still walking');
  run(120);
  assert.equal(e.moving, false); assert.equal(L.locationAt(e.x, e.y).id, 'development');
  assert.equal(e.anim.state, 'type', 'seated at the desk and typing');
  assert.ok(view.activity.rooms.development > 0);
});

test('DEV SIM journey: Claude leaves the Break Room, rides up, types; Codex inspects; review passes', () => {
  const { store, scene, run, now } = viewFor();
  const timers = [];
  const sim = new Simulator(store, { now, schedule: (fn, ms) => (timers.push({ at: now() + ms, fn }), timers.length), cancel: () => {} });
  sim.seed(); store.flush(); run(20);
  const claude = scene.get('agent:claude'), codex = scene.get('agent:codex');
  assert.equal(L.locationAt(claude.x, claude.y).id, 'lounge');
  sim.reviewJourney({ work: 60000, review: 40000 }); store.flush();
  const seen = { claude: [], codex: [] }, lifts = new Set();
  run(130, 0.05, () => {
    for (const t of timers.filter(t => !t.done && t.at <= now())) { t.done = true; t.fn(); }
    store.flush();
    for (const [id, e] of [['claude', claude], ['codex', codex]]) if (seen[id].at(-1) !== e.anim?.state) seen[id].push(e.anim?.state);
    if (claude.ride) lifts.add(claude.ride.request.phase);
  });
  const order = (list, ...states) => { let i = -1; for (const s of states) { const j = list.indexOf(s, i + 1); assert.ok(j > i, `${s} after ${states.slice(0, states.indexOf(s)).join(',')} in ${list.join('>')}`); i = j; } };
  order(seen.claude, 'react', 'walk', 'sit', 'type', 'celebrate');
  order(seen.codex, 'walk', 'inspect');
  assert.ok(lifts.has('ride'), 'Claude rode the elevator');
  const pr = Object.values(store.world.prs ?? {})[0];
  assert.equal(pr?.agentId, 'claude'); assert.equal(pr?.state, 'reviewed'); assert.equal(pr?.verdict, 'approved');
  assert.equal(store.rejected.length, 0);
});

test('scenery: street walkers stay on the ground-floor pavement (they may enter from off-screen)', () => {
  const b = L.bounds, inside = ([x, y]) => x >= b.x - 120 && x <= b.x + b.w + 120 && y >= b.y && y <= b.y + b.h;
  for (const n of theme.scenery.npcs) for (const pt of n.route) assert.ok(inside(pt), `npc ${pt}`);
});
