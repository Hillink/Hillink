// Pass 5B: the generated building is the World. Furnishing validity, navigation through generated geometry (doors,
// floors, elevator), construction as truthful stages driven only by HQ facts, the finished room joining navigation
// and use, persistence and replay of projects, one project in both themes, and the old World's baseline behaviours
// (walk, doors, sit, type, print, rest, wait, ride the lift, meet) running on generated geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorld, worldFingerprint, replayWorld } from '../procgen/world.mjs';
import { furnishSpace, walkGrid, reachable } from '../procgen/furnish.mjs';
import { viewOf } from '../procgen/view.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { STAGES, statusForStage } from '../procgen/construction.mjs';
import { entities } from '../procgen/planner.mjs';
import { represent } from '../procgen/themes.mjs';
import { openWorldFile, deserializeWorld, serializeWorld } from '../procgen/persist.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { createSiteSkin, vehicleRoutesOf } from '../render/site-skin.mjs';
import { loadTheme } from '../themes/index.mjs';
import { segmentHitsRect } from '../engine/iso.mjs';
import { vehiclesAt } from '../engine/ambience.mjs';
import { makeEvent } from '../core/events.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { createConstructionDemo, DEMO_STEPS, DEMO_CAPABILITY } from '../sim/construction-demo.mjs';
import { siteFeed } from '../serve.mjs';
import { fromHqActivity } from '../procgen/contract.mjs';
import { worldActivity } from '../../hillink-hq/orchestration/activity.mjs';

const SEEDS = ['hillink', 'alpha', 'bravo', 'charlie', 'delta', 'echo'];
let n = 0;
const hq = (type, fields = {}, source = 'hq') => ({ v: 1, source, id: `t5b-${++n}`, type, at: n, ...fields });
const overlap = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const box = it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 });
const chairish = t => t === 'chair' || t === 'officeChair';
// Run the canonical build of a capability through HQ facts up to (and including) a stage, on a simulated or real world.
function buildTo(w, stage, { source = 'hq', task = 'task-5b', objective = 'obj-5b', cap = DEMO_CAPABILITY } = {}) {
  const f = (type, x) => { const r = applyHqEvent(w, hq(type, x, source)); assert.equal(r.applied, true, `${type}: ${r.reason}`); };
  f('CAPABILITY_REQUESTED', { capability: cap, objectiveId: objective, taskId: task });
  if (stage === 'planning') return;
  f('CONSTRUCTION_REQUESTED', { capabilityId: cap.id });
  f('TASK_ASSIGNED', { taskId: task, agentId: 'claude', objectiveId: objective });
  for (const s of ['foundation', 'structure', 'exterior', 'systems', 'furnishing']) { if (STAGES.indexOf(stage) < STAGES.indexOf(s)) return; f('WORK_COMMITTED', { taskId: task, ref: s }); }
  if (STAGES.indexOf(stage) < STAGES.indexOf('inspection')) return;
  f('TESTING', { agentId: 'codex', taskId: task });
  if (stage === 'inspection') return;
  f('REVIEW_VERDICT', { taskId: task, verdict: 'approved' });
  f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id });
  f('CAPABILITY_VERIFIED', { capabilityId: cap.id });
}

test('furnishing: every generated room is furnished for its purpose, inside its walls, clear of doors, with every anchor reachable', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), view = viewOf(w), kinds = new Set();
    for (const s of Object.values(w.spaces).filter(s => s.primitive === 'room' || s.primitive === 'hallway')) {
      const F = furnishSpace(w, s, view); kinds.add(F.kind);
      const R = F.rect;
      for (const it of F.items) {
        const b = box(it);
        assert.ok(b.x0 >= R.x0 - 1e-6 && b.x1 <= R.x1 + 1e-6 && b.z0 >= R.z0 - 1e-6 && b.z1 <= R.z1 + 1e-6, `${seed} ${it.id} is inside ${s.id}`);
        if (it.solid || chairish(it.type)) for (const k of F.keepouts) assert.ok(!overlap(k, b), `${seed} ${it.id} blocks a door or the core`);
      }
      for (const [i, a] of F.items.entries()) for (const b of F.items.slice(i + 1)) if (a.solid && b.solid && !a.on && !b.on) assert.ok(!overlap(box(a), box(b)), `${seed} ${a.id} overlaps ${b.id}`);
      const grid = walkGrid(R, F.items, F.doors, F.obstacles);
      for (const a of F.anchors) assert.ok(reachable(grid, a), `${seed} ${a.id} (${a.use}) is reachable from a door`);
      // Purpose: the rooms say what they are for.
      const uses = new Set(F.anchors.map(a => a.use)), types = new Set(F.items.map(i => i.type));
      if (F.kind === 'development') { assert.ok(uses.has('work') && types.has('desk') && types.has('officeChair'), `${seed} engineering has desks and chairs`); assert.ok(uses.has('print'), `${seed} engineering has a printer`); }
      if (F.kind === 'comms') assert.ok(types.has('roundTable') && uses.has('meeting'), `${seed} meeting room has a table and seats`);
      if (F.kind === 'lounge') assert.ok(uses.has('relax') || uses.has('table'), `${seed} break room has seating`);
      if (F.kind === 'servers') assert.ok(types.has('serverRack'), `${seed} compute has racks`);
      if (F.kind === 'lobby') assert.ok(uses.has('wait'), `${seed} lobby has somewhere to wait`);
      if (F.kind === 'testing') assert.ok(types.has('reviewConsole') && uses.has('inspect'), `${seed} review has its console`);
    }
    for (const k of ['development', 'comms', 'lounge', 'servers', 'lobby', 'testing', 'command']) assert.ok(kinds.has(k), `${seed} has a ${k} room`);
  }
});

test('navigation: generated routes never cross furniture or walls, enter through doors and reach every station, upstairs by elevator', () => {
  for (const seed of SEEDS) {
    const w = createWorld({ seed }), L = createGeneratedLayout(w), U = L.U;
    // Every edge inside a space keeps a person's half-width clear of that space's solid furniture.
    for (const [k, [a, b]] of L.navEdges.entries()) {
      const space = w.spaces[L.edgeSpace[k]], F = space && L.furnishing[space.id]; if (!F) continue;
      const A = [L.nodePlan[a].x / U, L.nodePlan[a].z / U], B = [L.nodePlan[b].x / U, L.nodePlan[b].z / U];
      if (L.nodePlan[a].floor !== L.nodePlan[b].floor) continue;
      // The one exception, as in the old World: the last step into the seat you sit on.
      const seatOf = new Set([a, b].map(x => F.anchors.find(an => an.id === x)?.of).filter(Boolean));
      for (const it of F.items.filter(i => i.solid && !i.on && !seatOf.has(i.id))) { const r = box(it); assert.ok(!segmentHitsRect(A, B, { x0: r.x0 + 0.02, x1: r.x1 - 0.02, z0: r.z0 + 0.02, z1: r.z1 - 0.02 }), `${seed} ${a}-${b} crosses ${it.id}`); }
      // Both ends inside the space the edge belongs to.
      for (const p of [A, B]) assert.ok(p[0] >= F.rect.x0 - 0.01 && p[0] <= F.rect.x1 + 0.01 && p[1] >= F.rect.z0 - 0.01 && p[1] <= F.rect.z1 + 0.01, `${seed} ${a}-${b} leaves ${space.id}`);
    }
    const spawn = L.locationById[L.spawn].door, entrance = `door:${Object.values(w.buildings)[0].entranceDoorId}`;
    for (const [key, info] of Object.entries(L.stationInfo)) {
      const r = L.route(spawn, info.room, info.point);
      assert.ok(Math.hypot(r.at(-1)[0] - info.point[0], r.at(-1)[1] - info.point[1]) < 1, `${seed} ${key} is reachable`);
      if (info.floor > 0) assert.ok(r.some(p => p.lift), `${seed} ${key} (level ${info.floor}) is reached by the elevator`);
    }
    assert.ok(L.navEdges.some(([a, b]) => a === entrance || b === entrance), `${seed}: the front door is on the graph`);
    const lift = Object.values(L.lifts)[0];
    assert.deepEqual(lift.floors, [0, 1], `${seed}: one elevator serving both storeys`);
    assert.ok(lift.stops[0] > lift.stops[1], 'the upper stop is higher on screen');
  }
});

test('traffic: cars drive the generated road, on its lanes', () => {
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w), routes = vehicleRoutesOf(L);
  assert.ok(routes.length >= 2, 'both directions');
  let seen = 0;
  for (let t = 0; t < 400; t += 3.7) for (const v of vehiclesAt(t, routes)) {
    seen++;
    const road = Object.values(w.roads)[0].points.map(p => { const q = L.view.toView(p.x, p.y); return [q.x * L.U, q.z * L.U]; });
    let best = Infinity;
    for (let k = 1; k < road.length; k++) { const [ax, az] = road[k - 1], [bx, bz] = road[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, s = Math.max(0, Math.min(1, ((v.x - ax) * dx + (v.y - az) * dz) / L2)); best = Math.min(best, Math.hypot(v.x - ax - s * dx, v.y - az - s * dz)); }
    assert.ok(best <= Object.values(w.roads)[0].width * L.U / 2 + 1, `a car at ${best.toFixed(1)} units from the centreline stays on the road`);
  }
  assert.ok(seen > 5, 'cars appear');
});

test('construction: stages move only on HQ facts, in order; wrong-order facts are refused', () => {
  const w = createWorld({ seed: 'hillink' }), cap = DEMO_CAPABILITY, T = 'task-order', O = 'obj-order';
  const f = (type, x) => applyHqEvent(w, hq(type, x));
  assert.equal(f('WORK_COMMITTED', { taskId: T }).applied, false, 'no evidence without a project');
  f('CAPABILITY_REQUESTED', { capability: cap, objectiveId: O, taskId: T });
  const p = () => w.projects[cap.id];
  assert.equal(p().stage, 'planning'); assert.equal(w.capabilities[cap.id].status, 'planned');
  assert.equal(f('WORK_COMMITTED', { taskId: T }).applied, false, 'no building before HQ asks for construction');
  assert.equal(f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id }).applied, false);
  f('CONSTRUCTION_REQUESTED', { capabilityId: cap.id });
  assert.equal(p().stage, 'site-preparation');
  const seen = [p().stage];
  for (let k = 0; k < 7; k++) { f('WORK_COMMITTED', { taskId: T, ref: `c${k}` }); seen.push(p().stage); }
  assert.deepEqual([...new Set(seen)], ['site-preparation', 'foundation', 'structure', 'exterior', 'systems', 'furnishing'], 'one stage per piece of evidence, capped at furnishing');
  // Blocked: work stops; builders are sent away; new evidence resumes it.
  f('BLOCKED', { taskId: T, reason: 'tests failing' });
  assert.equal(p().blocked, 'tests failing');
  const L = createGeneratedLayout(w);
  assert.equal(L.placeFor({ id: 'claude', activity: 'coding', taskId: T }), null, 'nobody builds on a blocked site');
  f('WORK_COMMITTED', { taskId: T, ref: 'fix' }); assert.equal(p().blocked, null);
  // Inspection, a rejected review, rework, and only then approval and completion.
  assert.equal(f('TESTING', { agentId: 'codex', taskId: T }).applied, true); assert.equal(p().stage, 'inspection');
  assert.equal(f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id }).applied, false, 'not without an approved review');
  f('REVIEW_VERDICT', { taskId: T, verdict: 'changes' }); assert.equal(p().rework, true);
  assert.equal(f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id }).applied, false, 'a rejected review never becomes operational');
  f('WORK_COMMITTED', { taskId: T, ref: 'rework' }); assert.equal(p().stage, 'systems'); assert.equal(p().rework, false);
  f('WORK_COMMITTED', { taskId: T }); f('TESTING', { agentId: 'codex', taskId: T });
  assert.equal(f('CAPABILITY_VERIFIED', { capabilityId: cap.id }).applied, false, 'not verified before completion');
  f('REVIEW_VERDICT', { taskId: T, verdict: 'approved' });
  assert.equal(f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id }).applied, true);
  assert.equal(w.capabilities[cap.id].status, 'built');
  assert.equal(f('CAPABILITY_VERIFIED', { capabilityId: cap.id }).applied, true);
  assert.equal(p().stage, 'operational'); assert.equal(w.capabilities[cap.id].status, 'operational');
  assert.equal(statusForStage(p()), 'built');
});

test('construction: unfinished structures are not walkable or usable; once complete they join navigation and are used', () => {
  const w = createWorld({ seed: 'hillink' }), before = createGeneratedLayout(w), beforeIds = new Set(before.locations.map(l => l.spaceId));
  buildTo(w, 'exterior');
  const L = createGeneratedLayout(w), roomId = w.capabilities[DEMO_CAPABILITY.id].placement.spaceId;
  assert.equal(w.spaces[roomId].status, 'under-construction');
  assert.ok(!L.locations.some(l => l.spaceId === roomId), 'the room under construction is no location');
  assert.ok(!Object.values(L.stationInfo).some(s => L.furnishing[roomId]?.anchors.some(a => a.id === s.id)), 'none of its seats can be used');
  assert.ok(!Object.keys(L.nodePlan).some(k => k.startsWith(`${roomId}~`)), 'nobody walks through it');
  assert.ok(L.locationById[`site:${DEMO_CAPABILITY.id}`], 'the site is a location of its own');
  const site = L.placeFor({ id: 'claude', activity: 'coding', taskId: 'task-5b' });
  assert.equal(site.location, `site:${DEMO_CAPABILITY.id}`, 'its builder works on site');
  const spawn = L.locationById[L.spawn].door, st = Object.keys(L.locationById[site.location].stations)[0];
  assert.ok(L.route(spawn, site.location, L.locationById[site.location].stations[st]).length > 1, 'builders can reach the site');
  // Complete it: the room is furnished, walkable and becomes the meeting room agents use.
  const f = (type, x) => assert.equal(applyHqEvent(w, hq(type, x)).applied, true, type);
  f('WORK_COMMITTED', { taskId: 'task-5b' }); f('WORK_COMMITTED', { taskId: 'task-5b' }); f('TESTING', { agentId: 'codex', taskId: 'task-5b' }); f('REVIEW_VERDICT', { taskId: 'task-5b', verdict: 'approved' }); f('CONSTRUCTION_COMPLETED', { capabilityId: DEMO_CAPABILITY.id });
  const done = createGeneratedLayout(w);
  const loc = done.locations.find(l => l.spaceId === roomId);
  assert.ok(loc && Object.keys(loc.stations).length >= 2, 'the new room is a location with seats');
  assert.equal(done.places.communicating.location, loc.id, 'meetings now happen in the new, larger meeting room');
  for (const k of Object.keys(loc.stations)) { const info = done.stationInfo[`${loc.id}:${k}`], r = done.route(done.locationById[done.spawn].door, loc.id, info.point); assert.ok(Math.hypot(r.at(-1)[0] - info.point[0], r.at(-1)[1] - info.point[1]) < 1, `${k} reachable`); }
  assert.ok(!done.locationById[`site:${DEMO_CAPABILITY.id}`], 'no site once complete');
  for (const id of beforeIds) if (id) assert.ok(done.locations.some(l => l.spaceId === id), `${id} is still a location`);
});

test('expansion moves nothing unrelated: only the project and the corridor it extends change', () => {
  const w = createWorld({ seed: 'hillink' }), before = new Map(entities(w).map(([id, e]) => [id, JSON.stringify(e.rect ?? e.points ?? e.seg ?? null)]));
  buildTo(w, 'operational');
  const changed = entities(w).filter(([id, e]) => before.has(id) && before.get(id) !== JSON.stringify(e.rect ?? e.points ?? e.seg ?? null)).map(([id]) => id);
  for (const id of changed) assert.ok(/corridor$/.test(id), `${id} moved`);
});

test('construction persists and replays: a half-built project reloads and rebuilds identically from history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-5b-')), file = path.join(dir, 'site.json');
  const s = openWorldFile(file, { seed: 'hillink' });
  buildTo(s.world, 'systems'); s.save();
  const again = openWorldFile(file);
  assert.equal(worldFingerprint(again.world), worldFingerprint(s.world));
  assert.equal(again.world.projects[DEMO_CAPABILITY.id].stage, 'systems');
  assert.equal(worldFingerprint(replayWorld(again.world.history, { applyOps: applyHqEvent })), worldFingerprint(s.world), 'the project replays from HQ history');
  assert.equal(createGeneratedLayout(again.world).locationById[`site:${DEMO_CAPABILITY.id}`].room.site, true);
});

test('one canonical project in both themes: same id, same stage, same site; different presentation', () => {
  const w = createWorld({ seed: 'hillink' }); buildTo(w, 'structure');
  const real = createGeneratedLayout(w, { theme: 'real' }), fantasy = createGeneratedLayout(w, { theme: 'fantasy' });
  const id = `site:${DEMO_CAPABILITY.id}`;
  assert.deepEqual(real.locationById[id].room, fantasy.locationById[id].room, 'the same site');
  assert.equal(real.locationById[id].project.stage, 'structure'); assert.equal(fantasy.locationById[id].project, real.locationById[id].project, 'the same project object');
  const roomId = w.capabilities[DEMO_CAPABILITY.id].placement.spaceId;
  const lr = represent(w, 'real').items.find(i => i.canonicalId === roomId).label, lf = represent(w, 'fantasy').items.find(i => i.canonicalId === roomId).label;
  assert.equal(lr, 'meeting room'); assert.equal(lf, 'council chamber');
  assert.match(real.locationById[id].name, /Meeting Room: Structure/); assert.match(fantasy.locationById[id].name, /Council Chamber: Structure/);
  for (const t of ['real', 'fantasy', 'blueprint']) assert.ok(createSiteSkin(createGeneratedLayout(w, { theme: t }), t).frame);
});

test('the demonstration is simulated and labelled: its facts only change a simulated world, and it builds the room step by step', () => {
  const live = createWorld({ seed: 'hillink' });
  assert.equal(applyHqEvent(live, hq('CAPABILITY_REQUESTED', { capability: DEMO_CAPABILITY }, 'hq-simulated')).applied, false, 'the real world refuses simulated facts');
  const sim = structuredClone(live); sim.simulated = true;
  assert.equal(applyHqEvent(sim, hq('OBJECTIVE_CREATED', { objectiveId: 'x' })).applied, false, 'a simulated world refuses live facts');
  const store = new WorldStore(emptyWorld()), demo = createConstructionDemo({ siteWorld: sim, store, now: () => 1 });
  // The demo runs in simulation mode, where the simulated team is registered (5E correction: only members work or meet).
  for (const id of ['claude', 'codex']) store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: id, name: id, role: 'r' }, { source: 'sim', at: 0 }));
  const stages = [];
  while (!demo.done) { const r = demo.applyCanonical(); for (const x of r) assert.equal(x.applied, true, `${x.type}: ${x.reason}`); demo.applyAgents(); store.flush(); stages.push(demo.project?.stage + (demo.project?.blocked ? '!blocked' : '') + (demo.project?.rework ? '!rework' : '')); }
  assert.equal(stages.length, DEMO_STEPS.length);
  for (const s of ['planning', 'site-preparation', 'foundation', 'structure', 'structure!blocked', 'exterior', 'systems', 'furnishing', 'inspection', 'inspection!rework', 'operational']) assert.ok(stages.includes(s), `the demo shows ${s}`);
  assert.equal(sim.capabilities[DEMO_CAPABILITY.id].status, 'operational');
  assert.ok(Object.values(store.world.meetings).length === 1, 'the team meets in the new room');
  assert.ok(!Object.keys(live.capabilities).includes(DEMO_CAPABILITY.id), 'the real world is untouched');
});

test('the live bridge applies HQ activity to the persisted world once, through the contract, and remembers where it stopped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hlw-5b-feed-')), site = openWorldFile(path.join(dir, 'site.json'), { seed: 'hillink' }), cursorFile = path.join(dir, 'cursor.json');
  const items = [
    { v: 1, seq: 4, at: 4, type: 'TASK_CREATED', activity: 'planning', objectiveId: 'o1', summary: 'Objective received: x' },
    { v: 1, seq: 5, at: 5, type: 'AGENT_ASSIGNED', activity: 'waiting', objectiveId: 'o1', taskId: 't1', agentId: 'claude' },
    { v: 1, seq: 6, at: 6, type: 'IMPLEMENTATION_STARTED', activity: 'building', objectiveId: 'o1', taskId: 't1', agentId: 'claude' },
  ];
  let asked = [];
  const hqFake = { activity: async since => { asked.push(since); return { activity: items.filter(i => i.seq > since) }; } };
  const feed = siteFeed({ hq: hqFake, site, cursorFile, intervalMs: 1e9 });
  await feed.tick(); feed.stop();
  assert.equal(feed.status.applied, 3); assert.equal(JSON.parse(fs.readFileSync(cursorFile, 'utf8')).seq, 6);
  assert.equal(deserializeWorld(fs.readFileSync(path.join(dir, 'site.json'), 'utf8')).ops.agents.claude.activity, 'implementing', 'saved');
  const again = siteFeed({ hq: hqFake, site, cursorFile, intervalMs: 1e9 }); await again.tick(); again.stop();
  assert.equal(asked.at(-1), 6, 'it resumes after the last applied sequence'); assert.equal(again.status.applied, 0);
});

// HQ's real journal (through its own World contract, orchestration/activity.mjs) driving a construction project.
function hqJournal() {
  let seq = 0; const events = [];
  const j = (type, data) => { events.push({ seq: ++seq, at: seq * 10, type, data }); };
  return {
    events,
    objective: (id, to) => j('OBJECTIVE_TRANSITION', { objectiveId: id, to }),
    task: (id, objectiveId, operation = 'implement-repo') => j('TASK_CREATED', { id, operation, link: { objectiveId, stepId: `${id}-step` } }),
    dispatch: (taskId, agentId, runId = `run-${taskId}`) => j('DISPATCHED', { taskId, agentId, runId }),
    worker: (taskId, kind, extra = {}) => j('WORKER_EVENT', { runId: `run-${taskId}`, kind, ...extra }),
    review: (taskId, objectiveId, verdict) => j('HANDOFF_ACCEPTED', { objectiveId, stepId: `${taskId}-step`, taskId, agentId: 'codex', handoff: { kind: 'review', verdict } }),
    spend: objectiveId => j('SPEND_AUTHORIZED', { amountUsd: 1, scope: { objectiveId } }),
  };
}
function liveProject(objective = 'obj-live') {
  const w = createWorld({ seed: 'hillink' });
  // Until HQ emits the capability vocabulary itself (5C), the project is opened with HQ-sourced contract events.
  assert.equal(applyHqEvent(w, hq('CAPABILITY_REQUESTED', { capability: DEMO_CAPABILITY, objectiveId: objective })).applied, true);
  assert.equal(applyHqEvent(w, hq('CONSTRUCTION_REQUESTED', { capabilityId: DEMO_CAPABILITY.id })).applied, true);
  return { w, p: () => w.projects[DEMO_CAPABILITY.id], cap: () => w.capabilities[DEMO_CAPABILITY.id] };
}
const feed = (w, events, since = 0) => worldActivity(events, { since }).map(i => ({ i, ev: fromHqActivity(i) })).filter(x => x.ev).map(({ i, ev }) => ({ type: i.type, ...applyHqEvent(w, ev) }));

test('live bridge: HQ reporting BLOCKED stops construction; builders leave the site until new evidence', () => {
  const { w, p } = liveProject(), J = hqJournal();
  J.task('impl', 'obj-live'); J.dispatch('impl', 'claude'); J.worker('impl', 'ACK'); J.worker('impl', 'COMMIT');
  feed(w, J.events);
  assert.equal(p().stage, 'foundation'); assert.ok(p().taskIds.includes('impl'), 'HQ dispatch links the task to the project');
  assert.ok(createGeneratedLayout(w).placeFor({ id: 'claude', activity: 'coding', taskId: 'impl' }), 'the builder works on site');
  const n0 = J.events.length; J.objective('obj-live', 'BLOCKED');
  feed(w, J.events, n0);
  assert.ok(p().blocked, 'blocked'); assert.equal(p().stage, 'foundation', 'nothing advances');
  assert.equal(createGeneratedLayout(w).placeFor({ id: 'claude', activity: 'coding', taskId: 'impl' }), null, 'nobody builds on a blocked site');
  const n1 = J.events.length; J.objective('obj-live', 'COMPLETE');
  const r = feed(w, J.events, n1);
  assert.equal(r[0].applied, false, 'a blocked project cannot complete'); assert.notEqual(w.capabilities[DEMO_CAPABILITY.id].status, 'operational');
  // A failed implementation is a block too.
  const b = liveProject('obj-fail'), K = hqJournal();
  K.task('impl2', 'obj-fail'); K.dispatch('impl2', 'claude'); K.worker('impl2', 'ACK'); K.worker('impl2', 'FAILED');
  feed(b.w, K.events);
  assert.match(b.p().blocked, /implementation failed/);
});

test('live bridge: a review asking for changes (or rejecting) never becomes operational', () => {
  for (const verdict of ['request_changes', 'reject']) {
    const { w, p, cap } = liveProject(), J = hqJournal();
    J.task('impl', 'obj-live'); J.dispatch('impl', 'claude'); J.worker('impl', 'ACK'); J.worker('impl', 'COMMIT'); J.worker('impl', 'COMPLETED');
    J.objective('obj-live', 'VERIFYING'); J.task('rev', 'obj-live', 'review-repo'); J.dispatch('rev', 'codex'); J.objective('obj-live', 'REVIEWING');
    J.review('rev', 'obj-live', verdict); J.objective('obj-live', 'COMPLETE');
    const r = feed(w, J.events);
    assert.equal(p().stage, 'inspection'); assert.equal(p().rework, true, `${verdict} is rework`);
    assert.equal(r.at(-1).applied, false, 'HQ completing the objective does not complete a rejected build'); assert.match(r.at(-1).reason, /rework outstanding|review is not approved/);
    assert.equal(p().completed, false); assert.notEqual(cap().status, 'operational'); assert.notEqual(cap().status, 'built');
  }
});

test("live bridge: Kyle's approval means the site waits; HQ resuming the work lifts it", () => {
  const { w, p } = liveProject(), J = hqJournal();
  J.task('impl', 'obj-live'); J.dispatch('impl', 'claude'); J.worker('impl', 'ACK'); J.worker('impl', 'COMMIT');
  J.objective('obj-live', 'AWAITING_APPROVAL');
  feed(w, J.events);
  assert.ok(p().waiting, 'waiting for Kyle');
  assert.equal(createGeneratedLayout(w).placeFor({ id: 'claude', activity: 'coding', taskId: 'impl' }), null, 'builders wait off site');
  const n = J.events.length; J.spend('obj-live'); feed(w, J.events, n);
  assert.equal(p().waiting, null, 'Kyle approved');
  J.objective('obj-live', 'AWAITING_DECISION'); feed(w, J.events, n + 1); assert.ok(p().waiting);
  const m = J.events.length; J.task('impl-b', 'obj-live'); J.dispatch('impl-b', 'claude'); feed(w, J.events, m);
  assert.equal(p().waiting, null, 'HQ dispatching the work again means the gate was passed');
});

test('live bridge: implementation, verification, an approving review and HQ completion make the room operational', () => {
  const { w, p, cap } = liveProject(), J = hqJournal();
  J.task('impl', 'obj-live'); J.dispatch('impl', 'claude'); J.worker('impl', 'ACK');
  J.objective('obj-live', 'REVIEWING'); // out of order: refused, the site is not ready for inspection
  J.worker('impl', 'COMMIT'); J.worker('impl', 'TEST_STARTED'); J.worker('impl', 'COMPLETED');
  J.objective('obj-live', 'VERIFYING'); J.task('rev', 'obj-live', 'review-repo'); J.dispatch('rev', 'codex'); J.objective('obj-live', 'REVIEWING');
  J.review('rev', 'obj-live', 'approve'); J.objective('obj-live', 'COMPLETE');
  const r = feed(w, J.events);
  assert.equal(r.find(x => x.type === 'REVIEWING').applied, false, 'no inspection before the fit-out');
  assert.equal(r.find(x => x.type === 'TESTING').applied, true, 'builders testing mid-build is work on site, not an inspection');
  assert.equal(p().stage, 'operational'); assert.equal(cap().status, 'operational');
  assert.deepEqual([...new Set(p().history.map(h => h.stage))], ['planning', 'site-preparation', 'foundation', 'furnishing', 'inspection', 'operational']);
  assert.ok(createGeneratedLayout(w).locations.some(l => l.spaceId === cap().placement.spaceId), 'the finished room joins navigation');
});

// The old World's baseline behaviours, run by its own engine on the generated building.
function runWorld(w, seedEvents, { seconds = 90 } = {}) {
  const theme = loadTheme('real', { world: w }), L = theme.layout, store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  const ev = (type, fields) => store.dispatch(makeEvent(type, fields, { source: 'sim', at: 1000 }));
  for (const a of ['claude', 'codex']) ev('AGENT_REGISTERED', { agentId: a, name: a, role: 'engineer', activity: 'idle' });
  store.flush(); view.sync(store.world, new Set(['*']), 0);
  const log = { states: {}, gaits: {}, floors: {}, spots: {} };
  const record = () => { for (const e of scene.entities.values()) if (e.kind === 'agent') { const id = e.ref.id; (log.states[id] ||= new Set()).add(e.anim?.state); (log.gaits[id] ||= new Set()).add(e.gait); (log.floors[id] ||= new Set()).add(L.planAt(e.x, e.y).floor); if (e.spotInfo) (log.spots[id] ||= new Set()).add(e.spotInfo.use); } };
  let now = 0;
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); record(); } };
  const changed = new Set(); store.subscribe(k => { for (const x of k) changed.add(x); });
  for (const step of seedEvents) { step(ev); store.flush(); view.sync(store.world, new Set([...changed, '*agent']), now); changed.clear(); run(seconds / seedEvents.length); }
  return { log, scene, L, store };
}

test('baseline on generated geometry: agents enter, walk the halls, ride the lift upstairs, sit and type at desks, print, and rest in the break room', () => {
  const w = createWorld({ seed: 'hillink' });
  const { log, scene } = runWorld(w, [
    ev => {},
    ev => { ev('TASK_CREATED', { taskId: 't1', title: 'Code' }); ev('TASK_STARTED', { taskId: 't1', agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }); ev('TASK_CREATED', { taskId: 't2', title: 'Research' }); ev('TASK_STARTED', { taskId: 't2', agentId: 'codex', activity: 'researching', progress: { kind: 'stage', stage: 'Reading' } }); },
    ev => { ev('TASK_COMPLETED', { taskId: 't1' }); ev('TASK_COMPLETED', { taskId: 't2' }); ev('AGENT_IDLE', { agentId: 'claude' }); ev('AGENT_IDLE', { agentId: 'codex' }); },
  ], { seconds: 150 });
  assert.ok(log.gaits.claude.has('walk'), 'claude walks');
  assert.ok(log.gaits.claude.has('ride'), 'claude rides the elevator');
  assert.ok(log.floors.claude.has(0) && log.floors.claude.has(1), 'claude moves between storeys');
  assert.ok(log.states.claude.has('type'), 'claude sits and types at a desk');
  assert.ok(log.states.claude.has('sit') || [...scene.entities.values()].some(e => e.posture === 'sit'), 'sitting');
  assert.ok(log.spots.codex.has('print') || log.spots.codex.has('read'), 'codex uses the printer or shelf');
  assert.ok(log.states.codex.has('read'), 'codex reads at it');
  assert.ok(log.spots.claude.has('relax') || log.spots.claude.has('coffee') || log.spots.claude.has('table') || log.spots.claude.has('snack'), 'idle agents go to the break room');
});

test('baseline on generated geometry: builders walk to a construction site and build; an inspector surveys it', () => {
  const w = createWorld({ seed: 'hillink' }); buildTo(w, 'structure');
  const { log } = runWorld(w, [ev => { ev('TASK_CREATED', { taskId: 'task-5b', title: 'Build' }); ev('TASK_STARTED', { taskId: 'task-5b', agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }); ev('AGENT_TESTING', { agentId: 'codex', taskId: 'task-5b' }); }], { seconds: 60 });
  assert.ok(log.states.claude.has('assemble'), 'claude builds on site');
  assert.ok(log.states.codex.has('survey'), 'codex inspects on site');
  assert.ok(log.spots.claude.has('build'));
});
