// Pass 5C: animation modernization. What these tests hold the motion to: the intent layer maps canonical truth (and
// only it) to what a body shows; locomotion accelerates, brakes, turns through its directions and never jumps;
// routes are shaped for walking and still never cross a wall; characters face what they use before sitting;
// construction clips follow the project's real stage and stop when it stops; traffic turns smoothly and fades at the
// map edge; the environment and ambient people are deterministic and never imply an operational fact; and one
// canonical action is dressed differently by the Real and Fantasy rigs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../procgen/world.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { loadTheme } from '../themes/index.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath, startPath, TURN_RATE, dirOf } from '../engine/motion.mjs';
import { IsoWorldView, resolveState } from '../engine/iso-view.mjs';
import { INTENTS, intentOf, BUILD_CLIP, variantOfProject, blendOf, setClip, FACING_ANGLE } from '../engine/animation.mjs';
import { vehiclesAt, smoothPolyline } from '../engine/ambience.mjs';
import { wind, flutter, cloudShadows, siteMachinery } from '../engine/environment.mjs';
import { publicSpots, npcPlan, PUBLIC_USES } from '../engine/npcs.mjs';
import { rigFor, dress } from '../render/rigs.mjs';
import { drawFigure } from '../render/figure.mjs';
import { vehicleRoutesOf } from '../render/site-skin.mjs';
import { DEMO_CAPABILITY } from '../sim/construction-demo.mjs';
import { STAGES } from '../procgen/construction.mjs';
import { routeProblems } from './route-check.mjs';

let n = 0;
const hq = (type, fields = {}) => { n += 1; return { v: 1, source: 'hq', id: `c5c-${n}`, type, at: n, seq: n, ...fields }; };
const T = 'task-5c', O = 'obj-5c';
function buildTo(w, stage) {
  const f = (type, x) => { const r = applyHqEvent(w, hq(type, x)); assert.equal(r.applied, true, `${type}: ${r.reason}`); };
  f('CAPABILITY_REQUESTED', { capability: DEMO_CAPABILITY, objectiveId: O, taskId: T });
  f('CONSTRUCTION_REQUESTED', { capabilityId: DEMO_CAPABILITY.id }); f('TASK_ASSIGNED', { taskId: T, agentId: 'claude', objectiveId: O });
  for (const s of STAGES.slice(STAGES.indexOf('foundation'), STAGES.indexOf(stage) + 1)) if (STAGES.indexOf(s) <= STAGES.indexOf('furnishing')) f('WORK_COMMITTED', { taskId: T, ref: s });
  if (stage === 'inspection') f('INSPECTION_STARTED', { objectiveId: O });
  return w;
}
// The engine on a generated world, stepped at 20 Hz; returns a recorder of every agent's motion.
function run(w, steps, { seconds = 60 } = {}) {
  const theme = loadTheme('real', { world: w }), L = theme.layout, store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  const ev = (type, fields) => store.dispatch(makeEvent(type, fields, { source: 'sim', at: 1000 }));
  for (const a of ['claude', 'codex']) ev('AGENT_REGISTERED', { agentId: a, name: a, role: 'engineer', activity: 'idle' });
  store.flush(); view.sync(store.world, new Set(['*']), 0);
  const frames = [];
  let now = 0;
  const changed = new Set(); store.subscribe(k => { for (const x of k) changed.add(x); });
  const tick = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); for (const e of scene.entities.values()) if (e.kind === 'agent' || e.kind === 'ambient') frames.push({ id: e.id, now, x: e.x, y: e.y, v: e.v ?? 0, heading: e.heading, dir: e.dir, state: e.anim?.state, intent: e.anim?.intent, variant: e.anim?.variant, posture: e.posture, spot: e.spot, faceGoal: e.faceGoal, moving: e.moving, gait: e.gait, loop: e.loop?.phase ?? null, carrying: !!e.carrying, alpha: e.alpha, target: e.target?.key ?? null, placeKey: e.placeKey }); } };
  for (const step of steps) { step(ev); store.flush(); view.sync(store.world, new Set([...changed, '*agent']), now); changed.clear(); tick(seconds / steps.length); }
  return { frames, L, scene, view, store };
}
const of = (frames, id) => frames.filter(f => f.id === id);
const coding = ev => { ev('TASK_CREATED', { taskId: T, title: 'Build' }); ev('TASK_STARTED', { taskId: T, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }); };

test('intents: every INTENT is reachable, and each comes only from the canonical state it pictures', () => {
  const at = (activity, { agent = {}, world = { tasks: {} }, projects = {}, ...extra } = {}) => { const e = { spot: 'development:desk', placeKey: 'development:desk', posture: 'sit', ...extra, agent: { activity, ...agent } }; return intentOf(e, resolveState(e, 10_000), { world, projects }); };
  const seen = new Set();
  const expect = (want, got) => { assert.equal(got.intent, want, JSON.stringify(got)); seen.add(want); };
  expect('working', at('coding'));
  expect('investigating', at('researching', { posture: 'stand' }));
  expect('testing', at('testing', { posture: 'stand' }));
  expect('reviewing', at('reviewing', { posture: 'stand' }));
  expect('meeting', at('communicating', { agent: { meetingId: 'm1' } }));
  expect('waiting', at('waiting'));
  expect('attention', at('waiting', { agent: { truth: { state: 'NEEDS_ATTENTION' } } }));
  expect('blocked', at('waiting', { agent: { taskId: 't9' }, world: { tasks: { t9: { status: 'blocked' } } } }));
  expect('recovering', at('error'));
  expect('completed', intentOf({ agent: { activity: 'completed' } }, 'celebrate'));
  expect('walking', intentOf({ agent: { activity: 'coding' }, gait: 'walk' }, 'walk'));
  expect('onBreak', intentOf({ agent: { activity: 'idle' }, spotInfo: { use: 'coffee' } }, 'idle'));
  expect('idle', at('idle', { posture: 'stand' }));
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure'), p = w.projects[DEMO_CAPABILITY.id];
  expect('building', intentOf({ agent: { activity: 'coding' }, spot: `site:${p.id}:site:${p.id}:build1`, spotInfo: { use: 'build' } }, 'assemble', { projects: w.projects }));
  assert.deepEqual([...seen].sort(), [...INTENTS].sort(), 'all fourteen intents');
  // Truth: productive intents never appear away from the assigned station (walking there is walking, not working).
  for (const activity of ['coding', 'reviewing', 'testing', 'researching']) {
    const e = { agent: { activity }, spot: 'lounge:couch1', placeKey: 'development:desk', posture: 'stand' };
    assert.ok(!['working', 'reviewing', 'testing', 'investigating', 'building'].includes(intentOf(e, resolveState(e, 1), {}).intent), `${activity} away from its station is not shown as work`);
  }
});

test('locomotion: starts from rest, brakes into the stop, turns through its directions, never jumps', () => {
  const pace = 45, e = { x: 0, y: 0 }, path = [[200, 0], [200, 150], [60, 150]];
  startPath(e, path, 0);
  const trace = [];
  for (let i = 0; i < 600 && e.moving; i++) { const x0 = e.x, y0 = e.y, h0 = e.heading ?? 0, d0 = e.dir; stepPath(e, 0.02, { speed: pace, arriveDistance: 10 }); trace.push({ step: Math.hypot(e.x - x0, e.y - y0), v: e.v, dh: Math.abs(Math.atan2(Math.sin(e.heading - h0), Math.cos(e.heading - h0))), d0, d1: e.dir, motion: e.motion }); }
  assert.equal(e.moving, false); assert.deepEqual([e.x, e.y], [60, 150], 'arrives exactly');
  assert.ok(trace[0].step < pace * 0.02 * 0.5, 'the first step is from a standstill, not at full pace');
  assert.ok(trace.every(t => t.step <= pace * 0.02 + 1e-6), 'never faster than pace: no jumps');
  assert.ok(trace.slice(1).every(t => t.dh <= TURN_RATE * 0.02 + 1e-6), 'heading turns at a limited rate');
  const opposite = { left: 'right', right: 'left', front: 'back', back: 'front' };
  assert.ok(trace.every(t => !t.d0 || t.d1 !== opposite[t.d0]), 'never flips to the opposite direction in one step');
  const cornerV = Math.min(...trace.slice(40, 250).map(t => t.v)), cruise = Math.max(...trace.map(t => t.v));
  assert.ok(cornerV < cruise * 0.9, `slows into the corner (${cornerV.toFixed(1)} < ${cruise.toFixed(1)})`);
  assert.ok(trace.slice(-8).every((t, i, a) => i === 0 || t.v <= a[i - 1].v + 1e-9), 'brakes monotonically into the stop');
  assert.equal(dirOf(FACING_ANGLE.left), 'left'); assert.equal(dirOf(FACING_ANGLE.back), 'back');
});

test('routes are shaped for walking (few sharp turns) and still never cross a wall or solid furniture', () => {
  for (const seed of ['hillink', 'alpha', 'delta']) {
    const L = createGeneratedLayout(createWorld({ seed })), pts = L.locations.flatMap(l => Object.values(l.stations));
    let routes = 0, sharp = 0;
    for (let i = 0; i < pts.length; i += 4) for (let j = 2; j < pts.length; j += 5) {
      const r = L.route(pts[i], 'x', pts[j]); assert.ok(r); routes++;
      assert.deepEqual(routeProblems(L, r), []);
      for (let k = 2; k < r.length; k++) { const a = r[k - 2].at, b = r[k - 1].at, c = r[k].at; if (a.floor !== c.floor) continue; const t = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z))); if (t > Math.PI / 3) sharp++; }
    }
    assert.ok(sharp / routes < 3, `${seed}: ${(sharp / routes).toFixed(2)} sharp turns per route (the raw grid path had about 12)`);
  }
});

test('interaction alignment: an agent walks to its desk, turns to face it, then sits, then types', () => {
  const { frames, L } = run(createWorld({ seed: 'hillink', storeys: 2, share: false }), [() => {}, coding], { seconds: 120 }); // two storeys: the lift too
  const c = of(frames, 'agent:claude'), arrive = c.findIndex((f, i) => i > 0 && c[i - 1].moving && !f.moving && f.placeKey?.startsWith('development:') && f.spot === f.placeKey);
  assert.ok(arrive > 0, 'claude arrives at the desk');
  const station = L.stationInfo[c[arrive].placeKey];
  const typing = c.findIndex((f, i) => i > arrive && f.state === 'type');
  assert.ok(typing > arrive, 'and types');
  const afterArrive = c.slice(arrive, typing);
  assert.ok(afterArrive.some(f => f.state === 'sit'), 'sits down first');
  const firstSit = afterArrive.findIndex(f => f.state === 'sit');
  assert.ok(afterArrive.slice(firstSit).every(f => !f.faceGoal), 'only after it has turned to face the desk');
  assert.equal(c[typing].dir, station.facing, 'facing what it uses'); assert.equal(c[typing].posture, 'sit');
  assert.equal(c[typing].intent, 'working');
  // The trip there: continuous motion with momentum, including the elevator ride upstairs.
  const walk = c.filter(f => f.moving && f.gait === 'walk');
  assert.ok(walk.some(f => f.v < 10) && walk.some(f => f.v > 40), 'speeds up and slows down');
  assert.ok(c.some(f => f.gait === 'ride'), 'rides the elevator');
});

test('construction: builders play their stage\'s clip, pause for inspection, and stop when the site stops', () => {
  for (const [stage, clip] of [['foundation', 'dig'], ['structure', 'assemble'], ['exterior', 'paint'], ['systems', 'install'], ['furnishing', 'lift']]) {
    const w = buildTo(createWorld({ seed: 'hillink' }), stage);
    const { frames } = run(w, [coding], { seconds: 40 });
    const c = of(frames, 'agent:claude').filter(f => f.spot?.startsWith('site:') && !f.moving && f.spot === f.placeKey);
    assert.ok(c.length, `${stage}: claude works on site`);
    assert.ok(c.some(f => f.state === clip), `${stage}: plays ${clip} (${[...new Set(c.map(f => f.state))]})`);
    assert.ok(c.filter(f => f.state === clip).every(f => f.intent === 'building' && f.variant === stage), `${stage}: intent building, variant ${stage}`);
  }
  assert.equal(BUILD_CLIP.repair, 'install');
  // Rework after a rejected review is shown as repair.
  const r = buildTo(createWorld({ seed: 'hillink' }), 'inspection'); const p = r.projects[DEMO_CAPABILITY.id];
  applyHqEvent(r, hq('REVIEW_VERDICT', { taskId: T, verdict: 'changes' })); applyHqEvent(r, hq('WORK_COMMITTED', { taskId: T, ref: 'fix' }));
  assert.equal(variantOfProject(p), 'repair');
  // Inspection: a builder still coding at the site does not build.
  const insp = buildTo(createWorld({ seed: 'hillink' }), 'inspection');
  const { frames: fi } = run(insp, [coding], { seconds: 30 });
  assert.ok(!of(fi, 'agent:claude').some(f => ['dig', 'assemble', 'paint', 'install', 'lift', 'measure'].includes(f.state)), 'no building during inspection');
  // Blocked or waiting: nobody is on the site, and its machinery stands still.
  for (const gate of ['BLOCKED', 'WAITING_FOR_KYLE']) {
    const w = buildTo(createWorld({ seed: 'hillink' }), 'structure'); applyHqEvent(w, hq(gate, { objectiveId: O, reason: 'stop' }));
    const { frames: fb } = run(w, [coding], { seconds: 30 });
    assert.ok(!of(fb, 'agent:claude').some(f => f.spot?.startsWith('site:')), `${gate}: nobody works on site`);
    const m1 = siteMachinery(10, w.projects[DEMO_CAPABILITY.id]), m2 = siteMachinery(20, w.projects[DEMO_CAPABILITY.id]);
    assert.equal(m1.active, false); assert.deepEqual(m1, m2, `${gate}: machinery does not move`);
  }
  const live = buildTo(createWorld({ seed: 'hillink' }), 'structure').projects[DEMO_CAPABILITY.id];
  assert.notDeepEqual(siteMachinery(10, live), siteMachinery(11, live), 'machinery moves while the build is under way');
});

test('site loops: builders fetch materials and return; the loop ends when the place changes', () => {
  const w = buildTo(createWorld({ seed: 'hillink' }), 'furnishing');
  const { frames } = run(w, [coding], { seconds: 90 });
  const c = of(frames, 'agent:claude');
  assert.ok(c.some(f => f.loop === 'go') && c.some(f => f.loop === 'work') && c.some(f => f.loop === 'back' && f.carrying), 'goes to the entrance, picks up, carries back');
  assert.ok(c.filter(f => f.loop).every(f => f.spot === null || f.spot === '' || f.spot?.startsWith('site:') || f.spot === f.placeKey), 'loops stay on the site');
  // Blocked in the middle: the loop is abandoned (no work continues on a stopped site).
  const w2 = buildTo(createWorld({ seed: 'hillink' }), 'furnishing');
  const { frames: f2 } = run(w2, [coding, ev => { applyHqEvent(w2, hq('BLOCKED', { objectiveId: O })); ev('TASK_BLOCKED', { taskId: T, reason: 'blocked' }); }], { seconds: 120 });
  const tail = of(f2, 'agent:claude').slice(-200);
  assert.ok(tail.every(f => !f.loop && !f.spot?.startsWith('site:')), 'after the block, no site work');
});

test('clip blending and rigs: clips blend over BLEND_MS; Real and Fantasy dress the same action differently', () => {
  const e = {}; setClip(e, 'walk', 0, { intent: 'walking' }); setClip(e, 'sit', 1000, { intent: 'working' });
  assert.equal(e.anim.prev, 'walk'); assert.ok(blendOf(e.anim, 1000) === 0 && blendOf(e.anim, 1100) > 0 && blendOf(e.anim, 1300) === 1);
  const anim = { state: 'assemble', intent: 'building', variant: 'structure' };
  assert.equal(dress(rigFor('real'), anim).props.hammer ?? 'hammer', 'hammer');
  assert.equal(dress(rigFor('fantasy'), anim).props.hammer, 'mallet');
  assert.equal(dress(rigFor('fantasy'), { state: 'dig' }).props.shovel, 'spade');
  // Every clip draws in every direction and posture, blending from any other, without throwing.
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^(fillStyle|strokeStyle|lineWidth|globalAlpha|lineCap|font|textAlign|textBaseline)$/.test(k) ? 1 : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const clips = ['idle', 'walk', 'carry', 'type', 'work', 'inspect', 'survey', 'assemble', 'measure', 'dig', 'paint', 'install', 'lift', 'pickup', 'read', 'talk', 'meeting', 'blocked', 'waiting', 'celebrate', 'offline', 'sit', 'stand', 'react'];
  for (const state of clips) for (const dir of ['front', 'back', 'left', 'right']) for (const props of [{}, rigFor('fantasy').props]) drawFigure(ctx, { x: 0, y: 0, h: 40, dir, state, prev: 'walk', blend: 0.5, props, t: 0.5, time: 3, gait: 0.6, look: {} });
});

test('traffic: cars turn through bends without snapping, slow in them, fade at the map edge, deterministically', () => {
  const L = createGeneratedLayout(createWorld({ seed: 'hillink' })), routes = vehicleRoutesOf(L);
  assert.ok(routes.length >= 2 && routes.every(r => r.fade > 0));
  let maxTurn = 0, seen = 0, faded = 0;
  const prev = new Map();
  for (let t = 0; t < 240; t += 0.05) for (const v of vehiclesAt(t, routes)) {
    seen++; if (v.alpha < 1) faded++;
    const p = prev.get(v.id);
    if (p) { const d = Math.abs(Math.atan2(Math.sin(v.angle - p.angle), Math.cos(v.angle - p.angle))); maxTurn = Math.max(maxTurn, d); }
    prev.set(v.id, v);
  }
  assert.ok(seen > 100 && faded > 0, 'cars come and go, fading at the ends');
  assert.ok(maxTurn < 0.2, `heading changes smoothly (max ${maxTurn.toFixed(3)} rad per 50 ms)`);
  assert.deepEqual(vehiclesAt(77.7, routes), vehiclesAt(77.7, routes));
  // Slower in a bend than on the straight.
  const bend = { points: smoothPolyline([[0, 0], [500, 0], [500, 500]], 80), speed: 100, every: 100, chance: 1, bendWindow: 40 };
  const pos = t => vehiclesAt(t, [bend])[0];
  const t0 = [...Array(10000).keys()].map(i => i * 0.01).find(t => pos(t)), speedAt = t => Math.hypot(pos(t + 0.05).x - pos(t).x, pos(t + 0.05).y - pos(t).y) / 0.05;
  const straight = speedAt(t0 + 1), inBend = Math.min(...[...Array(40).keys()].map(i => speedAt(t0 + 4 + i * 0.05)));
  assert.ok(inBend < straight * 0.95, `slows in the bend (${inBend.toFixed(1)} vs ${straight.toFixed(1)})`);
});

test('environment: wind, flags and clouds are deterministic and bounded', () => {
  for (let t = 0; t < 120; t += 1.3) { const w = wind(t, t * 13, 5); assert.ok(Math.abs(w) <= 1.2); assert.equal(w, wind(t, t * 13, 5)); assert.ok(Math.abs(flutter(t, 1, 3)) < 0.2); }
  assert.deepEqual(cloudShadows(50, { x0: 0, x1: 1000, z0: 0, z1: 800 }), cloudShadows(50, { x0: 0, x1: 1000, z0: 0, z1: 800 }));
  assert.notDeepEqual(cloudShadows(50, { x0: 0, x1: 1000, z0: 0, z1: 800 }), cloudShadows(60, { x0: 0, x1: 1000, z0: 0, z1: 800 }), 'clouds drift');
});

test('ambient people: public spots only, never an agent\'s spot, never counted as work, deterministic', () => {
  const L = createGeneratedLayout(createWorld({ seed: 'hillink' })), spots = publicSpots(L);
  assert.ok(spots.length >= 3 && spots.every(s => PUBLIC_USES.has(s.use) && ['queue', 'lounge'].includes(s.room)), 'only resting or waiting spots in public rooms');
  assert.deepEqual(npcPlan(2).stayMs(3), npcPlan(2).stayMs(3));
  const { frames, view, L: L2 } = run(createWorld({ seed: 'hillink' }), [() => {}, coding, ev => ev('AGENT_IDLE', { agentId: 'claude' })], { seconds: 240 });
  const amb = frames.filter(f => f.id.startsWith('ambient:'));
  assert.ok(amb.some(f => f.moving) && amb.some(f => !f.moving && f.alpha > 0.9), 'they walk and stay');
  const ids = [...new Set(amb.map(f => f.id))];
  assert.ok(ids.length >= 2, 'several of them');
  const firstMove = ids.map(id => amb.find(f => f.id === id && f.moving)?.now ?? Infinity);
  assert.ok(new Set(firstMove).size === firstMove.length, 'they do not all set off together');
  const productive = new Set(Object.values(L2.stationInfo).filter(s => !PUBLIC_USES.has(s.use)).map(s => `${s.room}:${s.id}`));
  assert.ok(amb.every(f => !productive.has(f.target)), 'never at a desk, console, printer or rack');
  const agentSpots = frames.filter(f => f.id.startsWith('agent:') && !f.moving && f.spot).map(f => `${f.now}|${f.spot}`);
  assert.ok(!amb.some(f => !f.moving && f.alpha > 0.5 && agentSpots.includes(`${f.now}|${f.target}`)), 'never on the spot an agent occupies');
  assert.ok(!Object.keys(view.roomActivity().rooms).length || [...view.scene.entities.values()].filter(e => e.kind === 'agent').some(e => !e.moving), 'room activity comes from agents only');
  // Routes they walk are the same checked routes as everyone's.
  for (const s of spots.slice(0, 4)) { const r = L.route(L.locationById.plaza.door, s.room, s.point); assert.ok(r); assert.deepEqual(routeProblems(L, r), []); }
});
