// World Pass 2: one coordinate system, one scale, anchors, depth and movement (world/scale.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../world/building.mjs';
import { AGENT, ARCH, SIZES, STREET_SCALE, sized, anchor } from '../world/scale.mjs';
import { loadTheme } from '../themes/index.mjs';
import { depthSort } from '../engine/iso.mjs';
import { Camera } from '../engine/camera.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath, startPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { placeAgents } from '../core/behavior.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { chairBack } from '../render/props.mjs';

const theme = loadTheme('real'), L = theme.layout, P = L.P;
const byId = Object.fromEntries(B.FURNITURE.map(f => [f.id, f]));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('scale: every piece of furniture has exactly its type\'s size', () => {
  for (const f of B.FURNITURE) {
    assert.deepEqual(sized(f), f, `${f.id} matches SIZES.${f.type}`);
    const s = SIZES[f.type];
    for (const k of ['w', 'd', 'h']) if (s[k] != null && !s.free?.includes(k)) assert.equal(f[k], s[k], `${f.id}.${k}`);
  }
  assert.throws(() => sized({ id: 'giant', type: 'desk', w: 200 }), /a desk is/, 'a desk twice the size is refused');
  assert.throws(() => sized({ id: 'x', type: 'teleporter' }), /no SIZES entry/);
});

test('scale: people, architecture and the street share one reference person', () => {
  const H = AGENT.height;
  assert.equal(L.characterHeight, H); assert.equal(theme.scenery.characterHeight, H);
  assert.equal(theme.scenery.npcHeight, H, 'pedestrians are the same size as agents');
  assert.ok(ARCH.door.h > H * 1.1 && ARCH.door.h < H * 1.5, 'a door fits a person with headroom');
  assert.ok(ARCH.elevator.h > H && B.ELEVATOR.car.h === ARCH.elevator.h, 'the lift car fits a person');
  for (const w of B.WALLS.filter(w => w.door)) { assert.ok(w.doorH > H, w.id); assert.ok(w.door[1] - w.door[0] >= ARCH.door.minWidth, `${w.id} is wide enough`); }
  assert.equal(L.g.height, ARCH.floorHeight, 'one storey height for every floor');
  // Body landmarks: you sit at the seat height, work at a surface above it, and reach nothing below the knee.
  for (const t of ['chair', 'officeChair']) assert.equal(SIZES[t].seat, AGENT.seat, `${t} seat meets the body`);
  assert.ok(SIZES.desk.surface > AGENT.seat && SIZES.desk.surface < AGENT.seat + AGENT.torso, 'a desk is between lap and shoulder when seated');
  assert.ok(SIZES.counter.surface > AGENT.hip && SIZES.counter.surface < AGENT.hip + AGENT.torso, 'a counter is at a standing waist');
  assert.ok(STREET_SCALE.car.length > 2 * H && STREET_SCALE.car.height < H, 'a car is longer than two people and lower than one');
  const road = B.STREET.road; assert.ok(road.z1 - road.z0 >= 2 * STREET_SCALE.car.width * 1.5, 'two lanes of cars fit the road');
});

test('anchors: seats sit on the seat, work spots are desk chairs, standing spots face the object at reach', () => {
  for (const p of B.POINTS) {
    if (p.free) continue;
    const it = byId[p.of]; assert.ok(it, `${p.id} names a real object`);
    if (p.pose === 'sit') {
      assert.ok(SIZES[it.type].seat, `${p.id} sits on something with a seat`);
      const inside = Math.abs(p.x - it.x) <= it.w / 2 && Math.abs(p.z - it.z) <= it.d / 2;
      assert.ok(inside, `${p.id} is on ${it.id}`);
    } else {
      const expect = anchor(it, 'stand', { offset: p.x - it.x }), gap = AGENT.clearance + AGENT.footprint.d / 2;
      assert.ok(near(p.z, expect.z) || near(p.x, expect.x), `${p.id} stands at ${it.id}'s front`);
      if (it.facing === 'front') assert.ok(near(it.z - it.d / 2 - p.z, gap), `${p.id} is ${gap} in front of ${it.id}`);
    }
  }
  // Every workstation is its desk's chair, and that chair is tucked in front of its desk.
  for (const p of B.POINTS.filter(p => p.use === 'work')) {
    const desk = byId[p.desk], chair = byId[p.of];
    assert.equal(chair.id, `${desk.id}:chair`); assert.equal(p.x, desk.x);
    assert.ok(chair.z < desk.z - desk.d / 2 + AGENT.clearance + 1e-9 && chair.z > desk.z - desk.d / 2 - SIZES.officeChair.d, `${chair.id} sits at ${desk.id}`);
  }
});

test('camera: zoom, pan and viewport size move only the view, never the World', () => {
  const pts = B.POINTS.map(p => P.at(p.x, p.z, L.stationInfo[`${p.room}:${p.id}`].floor));
  const cam = new Camera({ bounds: L.bounds }); cam.resize(1568, 721);
  const s0 = cam.worldToScreen(...pts[0]), s1 = cam.worldToScreen(...pts[1]);
  cam.zoomAt(2.5, 300, 200); cam.pan(40, -30); cam.resize(900, 700);
  const t0 = cam.worldToScreen(...pts[0]), t1 = cam.worldToScreen(...pts[1]);
  const k = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) / Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
  assert.ok(near(k, cam.zoom / 1, 1e-6) || near(k, cam.zoom, 1e-6), 'one uniform scale for everything on screen');
  assert.deepEqual(B.POINTS.map(p => P.at(p.x, p.z, L.stationInfo[`${p.room}:${p.id}`].floor)), pts, 'plan projections unchanged');
});

test('movement: pace is measured on the floor, so it is the same across, into and out of a room', () => {
  const walk = (dx, dz) => {
    const a = P.at(100, 50, 1), b = P.at(100 + dx, 50 + dz, 1), e = { x: a[0], y: a[1] };
    startPath(e, [b], 0);
    stepPath(e, 1, { speed: AGENT.walkSpeed, metric: L.metric });
    const [px, pz] = P.plan(e.x, e.y, 1); return Math.hypot(px - 100, pz - 50);
  };
  const across = walk(200, 0), into = walk(0, 45), diagonal = walk(120, 40);
  assert.ok(near(across, AGENT.walkSpeed, 1e-6), `across ${across}`);
  assert.ok(near(into, AGENT.walkSpeed, 1e-6), `into the room ${into}`);
  assert.ok(near(diagonal, AGENT.walkSpeed, 1e-6), `diagonal ${diagonal}`);
});

test('movement: walking, arriving (slower) and stationary are movement states, not agent states', () => {
  const a = P.at(100, 50, 1), b = P.at(100 + AGENT.walkSpeed * 2, 50, 1), e = { x: a[0], y: a[1] };
  startPath(e, [b], 0);
  const opts = { speed: AGENT.walkSpeed, metric: L.metric, arriveDistance: L.arriveDistance };
  stepPath(e, 0.1, opts); assert.equal(e.motion, 'walking');
  let guard = 0; while (e.motion === 'walking' && guard++ < 200) stepPath(e, 0.05, opts);
  assert.equal(e.motion, 'arriving');
  const before = P.plan(e.x, e.y, 1)[0]; stepPath(e, 0.1, opts); const step = P.plan(e.x, e.y, 1)[0] - before;
  assert.ok(step < AGENT.walkSpeed * 0.1 * 0.6, 'the last stretch is taken slower');
  while (e.moving && guard++ < 400) stepPath(e, 0.05, opts);
  assert.equal(e.motion, 'stationary');
});

test('depth: a desk chair\'s backrest covers its sitter; a couch sitter is in front of the couch; order is deterministic', () => {
  const big = { l: -1e4, r: 1e4, t: -1e4, b: 1e4 };
  const box = it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2, sb: big });
  const person = (p, sit) => ({ id: 'agent', x0: p.x - AGENT.footprint.w / 2, x1: p.x + AGENT.footprint.w / 2, z0: p.z - AGENT.footprint.d / 2, z1: p.z + AGENT.footprint.d / 2, bias: sit ? 1 : 0, sb: big });
  const desk = B.POINTS.find(p => p.id === 'desk1'), chair = byId['desk1:chair'];
  const items = [{ id: 'desk', ...box(byId.desk1) }, { id: 'seat', ...box(chair) }, { id: 'back', ...chairBack(chair), sb: big }, person(desk, true)];
  const order = depthSort(items).map(i => i.id);
  assert.ok(order.indexOf('seat') < order.indexOf('agent') && order.indexOf('agent') < order.indexOf('back'), order.join(' > '));
  assert.ok(order.indexOf('desk') < order.indexOf('agent'), 'the desk is behind its sitter');
  const couchSeat = B.POINTS.find(p => p.id === 'couchSeat1');
  const o2 = depthSort([{ id: 'couch', ...box(byId.couch) }, person(couchSeat, true)]).map(i => i.id);
  assert.deepEqual(o2, ['couch', 'agent']);
  const shuffled = depthSort([...items].reverse()).map(i => i.id);
  assert.deepEqual(shuffled, order, 'the same items sort the same way in any input order');
});

test('multi-agent: distinct stations, and arrivals do not spawn on one point', () => {
  const agents = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({ id, activity: 'coding' }));
  const places = placeAgents(agents, {}, L);
  const keys = Object.values(places).map(p => `${p.location}:${p.station}#${p.overflow ?? 0}`);
  assert.equal(new Set(keys).size, keys.length);
  const store = new WorldStore(emptyWorld()), scene = new Scene(), view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  store.subscribe((c, w) => view.sync(w, c, 0));
  for (const id of ['claude', 'codex', 'qwen']) store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: id, name: id, role: 'r', activity: 'idle' }, { source: 'sim', at: 1 }));
  store.flush();
  // Right after registration each body still stands where it arrived: three different spots at the door.
  const arrived = ['claude', 'codex', 'qwen'].map(id => scene.get(`agent:${id}`).x.toFixed(1));
  assert.equal(new Set(arrived).size, 3, arrived.join(', '));
  assert.equal(scene.get('agent:claude').h, AGENT.height, 'characters are the reference height');
});

test('movement: a re-placement onto the spot an agent already occupies is not a trip (no stand-up, no reaction)', () => {
  const scene = new Scene(), view = new IsoWorldView(scene, new Effects(), L, theme.scenery);
  const seat = L.stationInfo['lounge:couchSeat1'].point;
  const e = scene.add({ id: 'agent:x', kind: 'agent', x: seat[0], y: seat[1], w: 10, h: AGENT.height, posture: 'sit' });
  view.goTo(e, { location: 'lounge', station: 'couchSeat1' }, seat, 1000);
  assert.equal(e.moving ?? false, false); assert.equal(e.departAt ?? 0, 0); assert.equal(e.posture, 'sit');
});
