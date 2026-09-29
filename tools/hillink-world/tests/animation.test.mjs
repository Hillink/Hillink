import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, applyEvent, emptyWorld } from '../core/state.mjs';
import { createLayout } from '../core/layout.mjs';
import { placeAgents } from '../core/behavior.mjs';
import { realTheme } from '../themes/real.mjs';
import { fantasyTheme } from '../themes/fantasy.mjs';
import { Lift, seeded } from '../engine/lift.mjs';
import { stepPath, startPath, Effects } from '../engine/motion.mjs';
import { occasional, vehiclesAt, npcAt, polyLength } from '../engine/ambience.mjs';
import { Scene } from '../engine/scene.mjs';
import { WorldView } from '../engine/world-view.mjs';
import { agentPose, PRODUCTIVE_POSES } from '../render/character.mjs';

const ev = (type, fields, at = 1000) => makeEvent(type, fields, { source: 'sim', at });
const real = createLayout(realTheme.layout);

test('layout: a route through the tower collapses consecutive stops into one lift ride', () => {
  const from = real.locationById.lounge.stations.lounge1, to = real.locationById.development.stations.desk4;
  const path = real.route(from, 'development', to);
  const rides = path.filter(p => p.lift);
  assert.equal(rides.length, 1, 'exactly one ride');
  assert.equal(rides[0].lift, 'tower');
  assert.equal(rides[0][1], real.navNodes.el3[1], 'rides from the break room floor up to the engineering floor');
  assert.deepEqual(path.at(-1), to);
  assert.deepEqual(Object.keys(real.lifts), ['tower']);
  assert.equal(real.lifts.tower.stops.length, 5);
});

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

test('truth: productive poses only for real, arrived work; idle agents may look alive but never work', () => {
  for (const activity of ['idle', 'offline', 'waiting', 'error', 'completed']) for (const arrived of [true, false]) {
    assert.ok(!PRODUCTIVE_POSES.has(agentPose({ activity, arrived }, 'coffee')), `${activity} is never productive`);
  }
  assert.equal(agentPose({ activity: 'coding', arrived: true }), 'typing');
  assert.equal(agentPose({ activity: 'coding', arrived: false }), 'idle', 'no typing before reaching the desk');
  assert.equal(agentPose({ activity: 'coding', gait: 'walk' }), 'walk');
  assert.equal(agentPose({ activity: 'reviewing', arrived: true }), 'inspecting');
  assert.equal(agentPose({ activity: 'idle', carrying: true, gait: 'walk' }), 'carrying');
});

test('meetings: only a meeting sends agents to the meeting room; it restores what they were doing', () => {
  const w = emptyWorld();
  for (const id of ['claude', 'codex']) applyEvent(w, ev('AGENT_REGISTERED', { agentId: id, name: id, role: 'r', activity: 'idle' }));
  applyEvent(w, ev('AGENT_REVIEWING', { agentId: 'codex' }));
  const before = placeAgents(Object.values(w.agents), {}, real);
  applyEvent(w, ev('AGENT_MESSAGE', { agentId: 'claude', toAgentId: 'codex' }));
  assert.equal(placeAgents(Object.values(w.agents), before, real).claude.location, before.claude.location, 'a message sender stays put');
  applyEvent(w, ev('MEETING_STARTED', { meetingId: 'm1', agentIds: ['claude', 'codex'] }));
  const inMeeting = placeAgents(Object.values(w.agents), before, real);
  assert.equal(inMeeting.claude.location, 'comms'); assert.equal(inMeeting.codex.location, 'comms');
  applyEvent(w, ev('MEETING_ENDED', { meetingId: 'm1' }));
  assert.equal(w.agents.codex.activity, 'reviewing'); assert.equal(w.agents.claude.activity, 'idle');
  assert.equal(w.meetings.m1, undefined);
});

function viewFor(theme) {
  const store = new WorldStore(emptyWorld()), scene = new Scene(), layout = createLayout(theme.layout);
  const view = new WorldView(scene, new Effects(), layout, theme.scenery);
  store.subscribe((changed, world) => view.sync(world, changed, 0));
  let clock = 0; // seconds; keeps running across run() calls like a real frame loop
  return { store, scene, view, run(seconds, dt = 0.05) { for (let t = 0; t < seconds; t += dt) { clock += dt; view.step(dt, clock * 1000, { instant: false }, stepPath); } } };
}

test('view: rooms react only to real work, and a rebuild places agents without replaying walks', () => {
  const { store, scene, view, run } = viewFor(realTheme);
  store.reset([ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'Builder', activity: 'idle' })]);
  const e = scene.get('agent:claude');
  assert.equal(e.moving ?? false, false, 'placed directly on rebuild');
  assert.equal(real.locationAt(e.x, e.y).id, 'lounge');
  run(0.2); assert.deepEqual(view.activity.rooms, {}, 'idle agents light nothing');
  store.dispatch(ev('TASK_CREATED', { taskId: 't', title: 'Fix' }, 2000)); store.dispatch(ev('TASK_STARTED', { taskId: 't', agentId: 'claude', activity: 'coding' }, 2001)); store.flush();
  run(0.5); assert.equal(view.activity.rooms.development, undefined, 'not while still walking');
  run(90);
  assert.equal(e.moving, false); assert.equal(real.locationAt(e.x, e.y).id, 'development');
  assert.ok(view.activity.rooms.development > 0);
  assert.ok(view.activity.stations['development:desk4'], 'the monitor desk wakes up');
  assert.equal(view.activity.construction, 1, 'active work drives the construction site');
  assert.ok(scene.get('npc:0') && scene.get('lift:tower:back') && scene.get('occluder:0'), 'scenery adds staff, the lift car and occluders');
});

test('view: a handoff walks the package to the receiver and brings the sender back', () => {
  const { store, scene, run } = viewFor(realTheme);
  store.reset([
    ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'Builder', activity: 'coding' }),
    ev('AGENT_REGISTERED', { agentId: 'codex', name: 'Codex', role: 'QA', activity: 'idle' }),
  ]);
  const claude = scene.get('agent:claude'), home = [claude.x, claude.y];
  store.dispatch(ev('AGENT_MESSAGE', { agentId: 'claude', toAgentId: 'codex', summary: 'ready' }, 3000)); store.flush();
  assert.equal(claude.errand?.phase, 'go'); assert.equal(claude.carrying, true);
  let gave = false;
  for (let i = 0; i < 4000 && claude.errand; i++) { run(0.05); if (claude.errand?.phase === 'give') gave = true; }
  assert.ok(gave, 'the package was handed over');
  assert.equal(claude.errand, null); assert.equal(claude.carrying, false);
  assert.deepEqual([Math.round(claude.x), Math.round(claude.y)], home.map(Math.round));
});

test('scenery: every themed character, NPC route and lift sits inside its art', () => {
  for (const theme of [realTheme, fantasyTheme]) {
    const b = theme.layout.bounds, inside = ([x, y]) => x >= b.x - 40 && x <= b.x + b.w + 40 && y >= b.y - 40 && y <= b.y + b.h + 40;
    for (const n of theme.scenery.npcs) for (const pt of n.route) assert.ok(inside(pt), `${theme.id} npc ${pt}`);
    for (const v of theme.scenery.vehicles) for (const pt of v.points) assert.ok(inside(pt), `${theme.id} vehicle ${pt}`);
    for (const s of theme.scenery.screens) assert.ok(inside(s.rect) && theme.layout.locations.some(l => l.id === s.room), `${theme.id} screen ${s.room}`);
  }
});
