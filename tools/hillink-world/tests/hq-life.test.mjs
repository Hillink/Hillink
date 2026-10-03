// Living HQ pass. What these tests hold the new behaviour to: journeys come only from a transition the reducer really
// recorded (start: task board, carry, desk; finish: archive; block: a frustrated beat), and never from a timer or a
// rebuild; idle variety and chatting happen only while an agent is truly idle; the state an agent reads as (ring and
// pip) follows its canonical state; labels shrink to a pip when zoomed out; and a capability placed into an existing
// room is built there as a refit, stage by stage, with clean routes, builders only while HQ reports the build, and the
// room keeping its previous purpose until the capability is complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../procgen/world.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { loadTheme } from '../themes/index.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView, resolveState, STATES } from '../engine/iso-view.mjs';
import { intentOf, INTENTS } from '../engine/animation.mjs';
import { transitionOf, planJourney } from '../engine/journey.mjs';
import { stateOf, labelModeOf, STATE_COLOR } from '../render/art5d/skin.mjs';
import { REFIT_CAPABILITY, createConstructionDemo } from '../sim/construction-demo.mjs';
import { buildersWork } from '../procgen/construction.mjs';
import { routeProblems } from './route-check.mjs';

// The engine on the generated world, stepped at 20 Hz, recording every agent each frame.
function run(steps, { seconds = 40 } = {}) {
  const w = createWorld({ seed: 'hillink' });
  const theme = loadTheme('real', { world: w }), L = theme.layout, store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  const ev = (type, fields) => store.dispatch(makeEvent(type, fields, { source: 'sim', at: 1000 }));
  for (const a of ['claude', 'codex']) ev('AGENT_REGISTERED', { agentId: a, name: a, role: 'engineer', activity: 'idle' });
  store.flush(); view.sync(store.world, new Set(['*']), 0);
  const frames = [], changed = new Set(); store.subscribe(k => { for (const x of k) changed.add(x); });
  let now = 0;
  const tick = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); for (const e of scene.entities.values()) if (e.kind === 'agent') frames.push({ id: e.ref.id, now, state: e.anim?.state ?? resolveState(e, now), journey: e.journey?.kind ?? null, phase: e.journey?.phase ?? null, carrying: !!e.carrying, moving: !!e.moving, spot: e.spot, dest: e.dest?.location ?? null, chatWith: e.chatWith ?? null, activity: e.agent?.activity }); } };
  for (const [step, secs = seconds] of steps) { step(ev); store.flush(); view.sync(store.world, new Set([...changed, '*agent']), now); changed.clear(); tick(secs); }
  return { frames, L, scene, view, store };
}
const of = (frames, id) => frames.filter(f => f.id === id);
const firstIndex = (fs, pred) => fs.findIndex(pred);
const T = 'task-life';
const start = ev => { ev('TASK_CREATED', { taskId: T, title: 'Build' }); ev('TASK_STARTED', { taskId: T, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }); };

test('transitions: a journey is planned only from a real recorded change of activity', () => {
  const A = (activity, x = {}) => ({ activity, taskId: null, lastTask: null, ...x });
  assert.equal(transitionOf({ activity: 'idle' }, A('coding', { taskId: 't' })), 'start');
  assert.equal(transitionOf({ activity: 'waiting' }, A('testing', { taskId: 't' })), 'start');
  assert.equal(transitionOf({ activity: 'idle' }, A('coding')), null, 'no task, no pickup');
  assert.equal(transitionOf({ activity: 'coding' }, A('coding', { taskId: 't' })), null, 'no change, no journey');
  assert.equal(transitionOf({ activity: 'coding' }, A('testing', { taskId: 't' })), null, 'switching work is not a new pickup');
  assert.equal(transitionOf({ activity: 'completed' }, A('idle', { lastTask: { outcome: 'done' } })), 'finish');
  assert.equal(transitionOf({ activity: 'completed' }, A('idle', { lastTask: { outcome: 'failed' } })), null, 'failed work is not filed');
  assert.equal(transitionOf({ activity: 'coding' }, A('waiting', { lastTask: { outcome: 'blocked' } })), 'block');
  assert.equal(transitionOf({ activity: 'coding' }, A('waiting', { lastTask: { outcome: 'requeued' } })), null);
  assert.equal(transitionOf(null, A('coding', { taskId: 't' })), null, 'first sight is not a transition');
  const fx = { taskBoard: { point: [1, 2], location: 'queue', facing: 'back' }, archive: { point: [3, 4], location: 'archive', facing: 'left' } };
  assert.deepEqual(planJourney('start', fx).map(l => [l.location, l.clip, !!l.carryAfter]), [['queue', 'pickup', true]]);
  assert.deepEqual(planJourney('finish', fx).map(l => [l.location, l.clip, !!l.carry]), [['archive', 'file', true]]);
  assert.deepEqual(planJourney('block', fx).map(l => [l.to, l.clip]), [[null, 'frustrated']]);
  assert.deepEqual(planJourney('start', {}), [], 'no task board, no detour (fail closed to the direct trip)');
  for (const s of ['file', 'frustrated', 'phone', 'stretch', 'watch', 'chat']) assert.ok(STATES.includes(s), s);
});

test('fixtures: the task board and archive are real places, reachable on clean routes from every station', () => {
  const L = createGeneratedLayout(createWorld({ seed: 'hillink' }));
  const { taskBoard, archive } = L.fixtures;
  assert.ok(taskBoard && archive, 'both fixtures exist');
  assert.ok(L.locationById[taskBoard.location] && L.locationById[archive.location]);
  let checked = 0;
  for (const l of L.locations.filter(x => !x.site && !x.exterior)) for (const pt of Object.values(l.stations)) for (const fx of [taskBoard, archive]) {
    const r = L.route(pt, fx.location, fx.point); assert.ok(r, `${l.id} -> ${fx.location}`);
    assert.deepEqual(routeProblems(L, r), [], `${l.id} -> ${fx.location}`); checked++;
  }
  assert.ok(checked > 20, `checked ${checked} routes`);
});

test('start: a real task start sends the agent to the board, it picks the task up, carries it to the desk, and works', () => {
  const { frames } = run([[start, 60]]);
  const c = of(frames, 'claude');
  const pick = firstIndex(c, f => f.journey === 'start' && f.state === 'pickup');
  assert.ok(pick > 0, 'picks the task up at the board');
  assert.ok(c.slice(0, pick).every(f => !f.carrying), 'empty handed on the way to the board');
  const carry = firstIndex(c.slice(pick), f => f.carrying && f.moving);
  assert.ok(carry > 0, 'then walks carrying it');
  const work = firstIndex(c.slice(pick + carry), f => !f.moving && ['type', 'work'].includes(f.state));
  assert.ok(work > 0, 'then works at the desk');
  assert.equal(c[pick + carry + work].carrying, false, 'the task is set down at the desk');
  assert.equal(c.at(-1).journey, null, 'the journey is over');
  // The other agent stayed idle: no journey without a transition.
  assert.ok(of(frames, 'codex').every(f => f.journey === null), 'no journey for an agent whose state did not change');
});

test('finish and block: a completed task is filed at the archive; a blocked task shows a frustrated beat first', () => {
  const { frames: ff } = run([[start, 50], [ev => ev('TASK_COMPLETED', { taskId: T, agentId: 'claude' }), 3], [ev => ev('AGENT_IDLE', { agentId: 'claude' }), 60]]);
  const c = of(ff, 'claude'), fin = firstIndex(c, f => f.journey === 'finish');
  assert.ok(fin > 0, 'a finish journey follows completion then release');
  assert.ok(c.slice(fin).some(f => f.state === 'file'), 'files the task');
  assert.ok(c.slice(fin).some(f => f.journey === 'finish' && f.carrying && f.moving), 'carries it there');
  assert.ok(c.slice(0, fin).every(f => f.state !== 'file'), 'never files before the finish');
  const { frames: fb } = run([[start, 50], [ev => ev('TASK_BLOCKED', { taskId: T, detail: 'needs Kyle' }), 40]]);
  const b = of(fb, 'claude'), fr = firstIndex(b, f => f.state === 'frustrated');
  assert.ok(fr > 0, 'the frustrated beat happens');
  assert.equal(b[fr].moving, false, 'at the desk, before leaving');
  assert.ok(b.slice(0, fr).every(f => f.activity !== 'waiting' || f.journey === 'block'), 'only after the real block');
  assert.ok(b.slice(fr).some(f => f.moving), 'then leaves for the waiting area');
  assert.equal(b.at(-1).activity, 'waiting');
  assert.ok(fb.every(f => f.state !== 'frustrated' || f.id === 'claude'), 'nobody else is frustrated');
});

test('idle life: variants and chatting only while truly idle, and they map to idle or break intents', () => {
  const { frames } = run([[() => {}, 120]]);
  const idle = frames.filter(f => f.activity === 'idle');
  assert.ok(idle.some(f => ['phone', 'stretch', 'chat'].includes(f.state)), 'idle agents show some life over two minutes');
  const { frames: w } = run([[start, 90]]);
  assert.ok(of(w, 'claude').filter(f => f.activity === 'coding').every(f => !['phone', 'stretch', 'chat', 'watch'].includes(f.state)), 'no idle variety while working');
  assert.ok(w.every(f => !f.chatWith || f.activity === 'idle'), 'only idle agents chat');
  const byNow = new Map(); for (const f of frames) byNow.set(`${f.now}:${f.id}`, f);
  const chats = frames.filter(f => f.state === 'chat');
  assert.ok(chats.every(f => { const o = byNow.get(`${f.now}:${String(f.chatWith).replace('agent:', '')}`); return o && !o.moving && !f.moving && o.activity === 'idle'; }), 'a chat partner is always idle and at rest, never walking away');
  for (const [s, activity] of [['phone', 'idle'], ['stretch', 'idle'], ['chat', 'idle'], ['watch', 'waiting'], ['file', 'completed'], ['frustrated', 'waiting']]) {
    const r = intentOf({ spot: 'lounge:sofa', posture: 'sit', agent: { activity }, anim: { state: s } }, s, { tasks: {} }, {});
    assert.ok(INTENTS.includes(r.intent), `${s} -> ${r.intent}`);
  }
});

test('readability: the ring and pip follow canonical state; labels shrink to a pip when zoomed out', () => {
  const at = (a, e = {}) => stateOf({ anim: {}, ...e }, { activity: 'idle', ...a });
  assert.equal(at({ activity: 'error' }), 'blocked');
  assert.equal(at({}, { anim: { state: 'frustrated' } }), 'blocked');
  assert.equal(at({ activity: 'waiting' }), 'waiting');
  assert.equal(at({ activity: 'completed' }), 'done');
  assert.equal(at({ activity: 'coding' }, { moving: true, carrying: true }), 'travelling');
  assert.equal(at({ activity: 'coding' }, { anim: { intent: 'working' } }), 'working');
  assert.equal(at({}), 'idle'); assert.equal(STATE_COLOR.idle, null, 'idle has no ring (no clutter)');
  assert.equal(at({ activity: 'offline' }), 'offline');
  assert.equal(labelModeOf(0.5, false, false), 'pip');
  assert.equal(labelModeOf(0.5, true, false), 'full');
  assert.equal(labelModeOf(1.2, false, false), 'name');
  assert.equal(labelModeOf(1.2, false, true), 'full');
});

test('refit: a capability placed into an existing room is built there, stage by stage, with clean routes', () => {
  // A refit needs a spare built room: the pre-5H two-storey founding has one (the compact T0 has none).
  const sim = createWorld({ seed: 'hillink', storeys: 2, share: false }); sim.simulated = true;
  const demo = createConstructionDemo({ siteWorld: sim, store: new WorldStore(emptyWorld()), now: () => 1, capability: REFIT_CAPABILITY });
  const before = createGeneratedLayout(sim), prior = Object.fromEntries(before.locations.filter(l => l.spaceId).map(l => [l.spaceId, l.id]));
  let refitSteps = 0, routes = 0, sentWhileStopped = 0;
  while (!demo.done) {
    demo.applyCanonical(); demo.applyAgents();
    const p = demo.project, cap = sim.capabilities[REFIT_CAPABILITY.id], L = createGeneratedLayout(sim), site = L.locationById[`site:${REFIT_CAPABILITY.id}`];
    assert.ok(!Object.values(sim.spaces).some(s => s.project === REFIT_CAPABILITY.id), 'a refit builds no new structure');
    // The room keeps its purpose (and its semantic id) the whole time.
    if (!p?.completed) for (const l of L.locations.filter(x => x.spaceId)) if (prior[l.spaceId]) assert.equal(l.id, prior[l.spaceId], `${l.spaceId} keeps its purpose until the capability is complete (${p?.stage})`);
    if (!site) { assert.ok(!p || p.completed || p.stage === 'planning' || p.stage === 'inspection', `no refit site at ${p?.stage}`); continue; }
    refitSteps++;
    assert.equal(site.refit, true); assert.equal(site.floor, sim.spaces[cap.placement.spaceId].level);
    for (const l of L.locations.filter(x => !x.site && !x.exterior)) for (const pt of Object.values(l.stations)) for (const spt of Object.values(site.stations)) {
      const r = L.route(pt, site.id, spt); assert.ok(r, `${l.id} -> refit`); assert.deepEqual(routeProblems(L, r), [], `${l.id} -> refit at ${p.stage}`); routes++;
    }
    const builder = L.placeFor({ taskId: p.taskIds[0], activity: 'coding' });
    if (p.blocked || p.waiting || !buildersWork(p)) { if (builder && builder.clip === 'work') sentWhileStopped++; }
    else if (p.stage !== 'inspection') assert.equal(builder?.location, site.id, `builders work inside the room at ${p.stage}`);
  }
  assert.equal(sentWhileStopped, 0, 'never sent to build while HQ stops the work');
  assert.ok(refitSteps >= 10, `refit site across ${refitSteps} steps`);
  assert.ok(routes > 100, `checked ${routes} routes`);
  assert.ok(demo.project.completed, 'the refit completes');
  const room = sim.capabilities[REFIT_CAPABILITY.id].placement.spaceId, after = createGeneratedLayout(sim).locations.find(l => l.spaceId === room);
  assert.notEqual(after.id, prior[room], 'once complete, the room takes on its new purpose');
});
