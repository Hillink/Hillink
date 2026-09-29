import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent, validateEvent, validProgress, EVENT_TYPES } from '../core/events.mjs';
import { WorldStore, applyEvent, emptyWorld } from '../core/state.mjs';
import { createLayout, blueprintLayout } from '../core/layout.mjs';
import { placeAgents, stationPoint, taskPlacement, ACTIVITY_PLACE } from '../core/behavior.mjs';
import { realTheme } from '../themes/real.mjs';
import { fantasyTheme } from '../themes/fantasy.mjs';

const LAYOUTS = [blueprintLayout, realTheme.layout, fantasyTheme.layout].map(createLayout);
const blueprint = LAYOUTS[0];
import { Camera } from '../engine/camera.mjs';
import { Scene } from '../engine/scene.mjs';
import { Simulator } from '../sim/simulator.mjs';

const ev = (type, fields, at = 1000) => makeEvent(type, fields, { source: 'sim', at });

test('events: required fields, sources and schema version are enforced', () => {
  assert.equal(validateEvent(ev('AGENT_THINKING', { agentId: 'claude' })), null);
  assert.match(validateEvent(ev('AGENT_THINKING', {})), /requires agentId/);
  assert.match(validateEvent({ ...ev('AGENT_IDLE', { agentId: 'a' }), source: 'prod-db' }), /Unknown source/);
  assert.match(validateEvent({ ...ev('AGENT_IDLE', { agentId: 'a' }), v: 2 }), /schema version/);
  assert.match(validateEvent(ev('NOT_A_TYPE', {})), /Unknown event type/);
  assert.match(validateEvent(ev('SYSTEM_STATUS', { systemId: 's', state: 'fine' })), /system state/);
  for (const type of Object.keys(EVENT_TYPES)) assert.ok(Array.isArray(EVENT_TYPES[type]), type);
});

test('events: progress must be a real ratio or a named stage, never a bare percentage', () => {
  assert.ok(validProgress({ kind: 'ratio', done: 3, total: 10 }));
  assert.ok(validProgress({ kind: 'stage', stage: 'Implementing' }));
  assert.ok(!validProgress({ kind: 'ratio', done: 11, total: 10 }));
  assert.ok(!validProgress({ kind: 'ratio', done: 0, total: 0 }));
  assert.ok(!validProgress({ percent: 60 }));
  assert.match(validateEvent(ev('TASK_PROGRESS', { taskId: 't', progress: { percent: 60 } })), /Invalid progress/);
});

test('state: task lifecycle drives agent activity and reports changed keys', () => {
  const w = emptyWorld();
  applyEvent(w, ev('AGENT_REGISTERED', { agentId: 'claude', name: 'Claude', role: 'Builder' }));
  applyEvent(w, ev('TASK_CREATED', { taskId: 't1', title: 'Fix' }));
  const changed = applyEvent(w, ev('TASK_STARTED', { taskId: 't1', agentId: 'claude' }, 2000));
  assert.deepEqual([...changed].sort(), ['agent:claude', 'task:t1']);
  assert.equal(w.agents.claude.activity, 'coding');
  assert.equal(w.agents.claude.taskId, 't1');
  assert.equal(w.tasks.t1.status, 'active');
  applyEvent(w, ev('TASK_FAILED', { taskId: 't1' }, 3000));
  assert.equal(w.agents.claude.activity, 'error');
  assert.equal(w.tasks.t1.status, 'failed');
});

test('state: an event for an unknown agent creates an unregistered placeholder', () => {
  const w = emptyWorld();
  applyEvent(w, ev('AGENT_TESTING', { agentId: 'ghost' }));
  assert.equal(w.agents.ghost.role, 'Unregistered agent');
  assert.equal(w.agents.ghost.activity, 'testing');
});

test('store: batches, orders by time, dedupes by id, and quarantines invalid events', () => {
  const store = new WorldStore();
  const calls = [];
  store.subscribe(changed => calls.push([...changed]));
  const later = ev('AGENT_IDLE', { agentId: 'a' }, 2000);
  const earlier = ev('AGENT_TESTING', { agentId: 'a' }, 1000);
  store.dispatchAll([later, earlier, later, ev('AGENT_IDLE', {})]);
  store.flush();
  assert.equal(calls.length, 1, 'one notification per flush');
  assert.equal(store.world.agents.a.activity, 'idle', 'later event wins after sorting');
  assert.equal(store.world.seq, 2, 'duplicate id applied once');
  assert.equal(store.rejected.length, 1);
  store.dispatch(later); assert.equal(store.flush().size, 0, 'redelivery is a no-op');
  store.replace(emptyWorld());
  assert.deepEqual(calls.at(-1), ['*']);
});

for (const layout of LAYOUTS) test(`layout ${layout.id}: every location is reachable and every activity has its stations`, () => {
  const { locations, locationAt, route, bounds } = layout;
  for (const a of locations) for (const b of locations) {
    const start = a.stations[Object.keys(a.stations)[0]], end = b.stations[Object.keys(b.stations)[0]];
    const path = route(start, b.id, end);
    assert.deepEqual(path.at(-1), end);
    assert.ok(path.every(p => Array.isArray(p) && p.every(Number.isFinite)), `${a.id} -> ${b.id}`);
    if (a.id !== b.id) assert.ok(path.length >= 3, `${a.id} -> ${b.id} goes through doors`);
  }
  for (const l of locations) for (const [name, [x, y]] of Object.entries(l.stations)) {
    assert.equal(locationAt(x, y)?.id, l.id, `${l.id}.${name} is inside its room`);
    assert.ok(x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h, `${l.id}.${name} is inside the world`);
  }
  for (const [activity, base] of Object.entries(ACTIVITY_PLACE)) {
    const rule = { ...base, ...(layout.places?.[activity] ?? {}) };
    if (rule.stay) continue;
    const loc = layout.locationById[rule.location];
    assert.ok(loc, `${activity} maps to a room in ${layout.id}`);
    for (const s of rule.stations) assert.ok(loc.stations[s], `${layout.id}: ${rule.location} has station ${s}`);
  }
  for (const id of ['development', 'command', 'testing', 'deploy', 'operations', 'servers', 'queue', 'comms', 'archive']) assert.ok(layout.locationById[id], `${layout.id} has ${id}`);
});

test('behavior: agents get distinct station points, even when a room overflows', () => {
  const agents = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, activity: 'testing' }));
  const places = placeAgents(agents, {}, blueprint);
  const points = Object.values(places).map(p => stationPoint(p, blueprint).join(','));
  assert.equal(new Set(points).size, agents.length);
  assert.ok(Object.values(places).every(p => p.location === 'testing'));
  const kept = placeAgents([{ id: 'a0', activity: 'error' }], { a0: places.a0 }, blueprint);
  assert.equal(kept.a0.station, places.a0.station, 'errors stay where the work happened');
  assert.equal(kept.a0.clip, 'error');
});

test('behavior: queued tasks sit in the queue, active tasks follow their agent', () => {
  for (const layout of LAYOUTS) {
    const out = taskPlacement({ q: { id: 'q', status: 'queued', createdAt: 1 }, a: { id: 'a', status: 'active', agentId: 'claude' }, d: { id: 'd', status: 'done', createdAt: 2 } }, layout);
    assert.equal(layout.locationAt(...out.q.point)?.id, 'queue', layout.id);
    assert.deepEqual(out.a, { follow: 'claude' });
    assert.equal(layout.locationAt(...out.d.point)?.id, 'archive', layout.id);
  }
});

test('behavior: a layout can re-home idle agents (realistic break room)', () => {
  const real = LAYOUTS[1];
  assert.equal(placeAgents([{ id: 'a', activity: 'idle' }], {}, real).a.location, 'lounge');
  assert.equal(placeAgents([{ id: 'a', activity: 'idle' }], {}, blueprint).a.location, 'command');
});

test('behavior: places carried over from another theme fall back when the room does not exist', () => {
  const fantasy = LAYOUTS[2];
  const p = placeAgents([{ id: 'a', activity: 'completed' }], { a: { location: 'lounge', station: 'lounge1' } }, fantasy).a;
  assert.ok(fantasy.locationById[p.location].stations[p.station]);
});

test('camera: screen/world transforms invert and zoom keeps the cursor point fixed', () => {
  const c = new Camera({ bounds: { x: 0, y: 0, w: 2400, h: 1560 } });
  c.resize(1200, 800); c.animateTo({ x: 1000, y: 700, zoom: 1.2 }, 0);
  const [wx, wy] = c.screenToWorld(300, 200);
  const [sx, sy] = c.worldToScreen(wx, wy);
  assert.ok(Math.abs(sx - 300) < 1e-9 && Math.abs(sy - 200) < 1e-9);
  c.zoomAt(1.5, 300, 200);
  const [wx2, wy2] = c.screenToWorld(300, 200);
  assert.ok(Math.abs(wx2 - wx) < 1e-6 && Math.abs(wy2 - wy) < 1e-6);
  c.pan(-1e6, -1e6);
  const v = c.viewRect();
  assert.ok(v.x + v.w <= 2400 + 1e-6 && v.y + v.h <= 1560 + 1e-6, 'camera clamps to world bounds');
  c.insets = { top: 50, right: 0, bottom: 100, left: 0 };
  c.focusPoint(1000, 700, { zoom: 1, duration: 0 });
  const [, sy2] = c.worldToScreen(1000, 700);
  assert.ok(Math.abs(sy2 - (50 + (800 - 150) / 2)) < 1e-6, 'focus centers in the area between HUD insets');
});

test('scene: query culls to the rectangle and pick returns the topmost selectable entity', () => {
  const s = new Scene();
  s.add({ id: 'room', kind: 'room', layer: 1, x: 100, y: 100, w: 200, h: 200, selectable: true });
  s.add({ id: 'agent', kind: 'agent', layer: 5, x: 100, y: 100, w: 40, h: 40, selectable: true });
  s.add({ id: 'far', kind: 'agent', layer: 5, x: 2000, y: 1400, w: 40, h: 40, selectable: true });
  assert.deepEqual(s.query({ x: 0, y: 0, w: 300, h: 300 }).map(e => e.id), ['room', 'agent']);
  assert.equal(s.pick(100, 100).id, 'agent');
  assert.equal(s.pick(20, 20).id, 'room');
  const e = s.get('far'); e.x = 110; s.moved(e);
  assert.equal(s.query({ x: 1900, y: 1300, w: 200, h: 200 }).length, 0, 'spatial index follows moves');
});

test('simulator: emits only source "sim" events and every one is valid', () => {
  const store = new WorldStore();
  const queue = []; let t = 1_700_000_000_000;
  const sim = new Simulator(store, { now: () => (t += 10), schedule: fn => { queue.push(fn); return queue.length; }, cancel: () => {} });
  const seen = [];
  const dispatch = store.dispatch.bind(store);
  store.dispatch = e => { seen.push(e); dispatch(e); };
  sim.seed();
  for (const key of ['claudeCodes', 'claudeMessagesCodex', 'codexTests', 'testFails', 'testPasses', 'taskCompletes', 'deployBegins', 'deploySucceeds', 'manyAgents', 'queueWork', 'systemError', 'systemRecovers', 'allIdle']) {
    sim[key](); while (queue.length) queue.shift()(); store.flush();
  }
  assert.ok(seen.length > 30);
  assert.ok(seen.every(e => e.source === 'sim'));
  assert.equal(store.rejected.length, 0, JSON.stringify(store.rejected[0]));
  assert.ok(Object.values(store.world.agents).every(a => a.activity === 'idle'));
});
