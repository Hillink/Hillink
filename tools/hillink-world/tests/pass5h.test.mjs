// Pass 5H: the unified art system. Not pixel tests: what these hold the art to is its contract with the World.
// Sprite data is data (primitives, palette slots, colour literals: no code); appearance metadata only selects named parts
// and colours and cannot inject behaviour or out-of-range geometry; an agent the art has never seen is dressed and drawn
// in both themes by role and colour alone, and two agents with the same definition look the same whatever their ids;
// missing assets fall back; views are a pure function of heading; drawing a frame in either theme, or switching theme,
// never changes canonical state; the status language comes from canonical fields only (completion only from a
// canonical TASK_COMPLETED, NEEDS KYLE never inferred); construction art reads the canonical stage; set dressing never
// stands on a walk, a station or furniture; and depth order is deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../procgen/world.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { STAGES } from '../procgen/construction.mjs';
import { DEMO_CAPABILITY } from '../sim/construction-demo.mjs';
import { loadTheme } from '../themes/index.mjs';
import { readonly } from '../themes/interpreter.mjs';
import { WorldStore, emptyWorld } from '../core/state.mjs';
import { makeEvent } from '../core/events.mjs';
import { DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView } from '../engine/iso-view.mjs';
import { createCanvasRenderer } from '../render/canvas2d.mjs';
import { depthOrder } from '../render/kingdom-skin.mjs';
import { validateShapes } from '../render/art/sprites.mjs';
import { HAIR, HEADWEAR, HEAD_ACCESSORIES, FACE, HEAD_BACK, GARMENTS, BODY, PART_NAMES } from '../render/art/parts.mjs';
import { drawCharacter, viewOf, characterParts } from '../render/art/character.mjs';
import { dressFor, npcLook } from '../render/art/dress.mjs';
import { STATUS, STATUS_ORDER, VIEWS, CLIPS, DEPTH_PLANES } from '../render/art/tokens.mjs';
import { statusOf, workChipOf, drawEmblem, drawWorkChip, drawStatusRing, drawCeremony, CEREMONY_S } from '../render/art/status.mjs';
import { dressDistrict, KPROPS, KPROP_SIZE, DISTRICT_DRESSING } from '../render/art/kingdom-props.mjs';
import { dressRoom, RPROPS, RPROP_SIZE, ROOM_DRESSING } from '../render/art5d/dressing.mjs';

let n = 0;
const ev = (type, fields, at) => ({ v: 1, id: `t5h-${++n}`, type, at: at ?? n, source: 'sim', ...fields });
const hq = (type, fields = {}) => ({ v: 1, source: 'hq', id: `t5h-hq-${++n}`, type, at: n, ...fields });
const truth = w => JSON.stringify({ ...w, log: (w.log ?? []).map(({ id, ...e }) => e) });

// A 2D context that records every call name (and accepts everything).
function recorder() {
  const calls = [], noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const base = { canvas: { width: 1400, height: 900 }, getTransform: () => ({ a: 1, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }), measureText: s => ({ width: String(s).length * 5 }), createLinearGradient: grad, createRadialGradient: grad, createPattern: () => null, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h }) };
  const ctx = new Proxy(base, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push(k); void a; }), set: (o, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') calls.push(`${k}=${v}`); o[k] = v; return true; } });
  return { ctx, calls };
}
globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return recorder().ctx; } };

function team(extra = []) {
  const store = new WorldStore(emptyWorld());
  for (const id of ['claude', 'codex', 'chatgpt']) store.dispatch(makeEvent('AGENT_REGISTERED', { agentId: id, name: DEFAULT_DEFINITIONS[id].name, role: DEFAULT_DEFINITIONS[id].role ?? 'r', activity: 'idle' }, { source: 'sim' }));
  for (const e of extra) store.dispatch(e);
  store.flush();
  return store;
}
const onboard = (def, at = 10) => [ev('AGENT_REQUESTED', { agentId: def.id, definition: def }, at), ...['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'TESTING'].map((stage, i) => ev('AGENT_PROVISIONING', { agentId: def.id, stage }, at + 1 + i)), ev('AGENT_READY', { agentId: def.id }, at + 6), ev('AGENT_ACTIVATED', { agentId: def.id }, at + 7)];
function rig(themeId, store, siteWorld, art = null) {
  const theme = loadTheme(themeId, { world: siteWorld, art }), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), theme.layout, theme.scenery, theme.interpreter);
  view.sync(store.world, new Set(['*']), 0);
  let now = 0;
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); } };
  const draw = (time = 1000) => { const { ctx, calls } = recorder(); createCanvasRenderer({ getContext: () => ctx, style: {}, width: 1400, height: 900 }).draw({ camera: { width: 1400, height: 900, zoom: 1, x: 0, y: 0 }, scene, skin: theme.skin, layout: theme.layout, world: store.world, entities: [...scene.entities.values()], time, effects: [], activity: view.activity, reducedMotion: false }); return calls; };
  return { theme, L: theme.layout, scene, view, run, draw };
}
function buildTo(w, stage) {
  const f = (type, x) => { const r = applyHqEvent(w, hq(type, x)); assert.equal(r.applied, true, `${type}: ${r.reason}`); };
  f('CAPABILITY_REQUESTED', { capability: DEMO_CAPABILITY, objectiveId: 'obj-5h', taskId: 'task-5h' });
  if (stage === 'planning') return w;
  f('CONSTRUCTION_REQUESTED', { capabilityId: DEMO_CAPABILITY.id });
  f('TASK_ASSIGNED', { taskId: 'task-5h', agentId: 'claude', objectiveId: 'obj-5h' });
  for (const s of ['foundation', 'structure', 'exterior', 'systems', 'furnishing']) { if (STAGES.indexOf(stage) < STAGES.indexOf(s)) return w; f('WORK_COMMITTED', { taskId: 'task-5h', ref: s }); }
  return w;
}
const UNKNOWN = { id: 'agent-5h-unknown-417', name: 'Unknown 417', role: 'Repository inspector', team: 'Engineering', capabilities: ['inspect-repo'], appearance: { palette: { primary: '#2a9d8f' }, accessories: ['cap'] } };

test('A. every sprite in the part library is plain data: primitives, finite numbers, palette slots or colours', () => {
  const problems = [];
  const walk = (v, where) => { if (Array.isArray(v) && (v.length === 0 || Array.isArray(v[0]))) problems.push(...validateShapes(v, where)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'flap') continue; walk(x, `${where}.${k}`); } };
  for (const [name, lib] of Object.entries({ HAIR, HEADWEAR, HEAD_ACCESSORIES, FACE, HEAD_BACK, GARMENTS, BODY })) walk(lib, name);
  assert.deepEqual(problems, []);
  assert.ok(validateShapes([['e', 0, 0, 1, 1, 'skin', { onload: () => 1 }]]).length, 'a function in options is rejected');
  assert.ok(validateShapes([['x', 0, 0]]).length, 'an unknown primitive is rejected');
  assert.ok(validateShapes([['c', 0, 0, 'NaN', 'skin']]).length, 'non-numeric geometry is rejected');
  assert.ok(validateShapes([['c', 0, 0, 1, 'url(javascript:alert(1))']]).length, 'a non-colour fill is rejected');
  for (const k of ['hair', 'headwear', 'face', 'garment', 'body']) assert.ok(PART_NAMES[k].length > 0, k);
});

test('B. appearance metadata only selects named parts and colours; hostile values are dropped or clamped', () => {
  const hostile = { id: 'hostile-1', name: 'H', role: 'Builder', team: 'Engineering', appearance: {
    palette: { primary: 'javascript:alert(1)', skin: '<img onerror=x>', hair: '#12345' },
    accessories: ['__proto__', 'constructor', 'toString', 'bionic-eye', '../../etc/passwd', 'wings'], effects: ['eval', 'regal-glow'],
    hair: { style: 'function(){}' }, body: { scale: 1e9, width: -5, headScale: 'x' },
    themes: { fantasy: { archetype: 'rm -rf', palette: { primary: 'expression(alert(1))' }, equipment: ['hammer', 'require("fs")'] } },
  } };
  for (const theme of ['real', 'fantasy']) {
    const D = dressFor({ id: hostile.id, name: 'H', definition: hostile }, theme);
    assert.deepEqual(JSON.parse(JSON.stringify(D)), D, `${theme}: plain data only`);
    const known = new Set(Object.values(PART_NAMES).flat());
    for (const o of D.parts.overlays) assert.ok(known.has(o), `${theme}: ${o} is a known part`);
    assert.ok(D.parts.hair === null || PART_NAMES.hair.includes(D.parts.hair));
    for (const [k, v] of Object.entries(D.look)) if (typeof v === 'string' && /color|skin|hair|shirt|pants|primary|badge/i.test(k)) assert.ok(/^(#[0-9a-f]{3,8}|rgba?\()/i.test(v) || v === 'scroll' || v === 'box', `${theme}: ${k}=${v}`);
    const { ctx } = recorder();
    const head = drawCharacter(ctx, { x: 0, y: 0, h: 50, look: { ...D.look, scale: 1e9, wide: -5, headScale: 'x' }, parts: D.parts, state: 'idle' });
    assert.ok(head.top > -50 * 1.5 * 1.4 && head.r < 50 * 0.19 * 1.5 * 1.36, `${theme}: proportions clamped (top ${head.top}, r ${head.r})`);
  }
  assert.deepEqual(characterParts({ accessories: ['__proto__', 'constructor'] }).overlays, []);
});

test('C. an agent the art has never seen is dressed by role and colour in both themes; identity never matters', () => {
  const twin = { ...UNKNOWN, id: 'agent-5h-twin-999', name: 'Someone Else' };
  for (const theme of ['real', 'fantasy']) {
    const a = dressFor({ id: UNKNOWN.id, name: UNKNOWN.name, definition: UNKNOWN }, theme), b = dressFor({ id: twin.id, name: twin.name, definition: twin }, theme);
    assert.deepEqual(a, b, `${theme}: same definition, same look, whatever the id or name`);
    const { ctx, calls } = recorder();
    for (const view of [Math.PI / 2, Math.PI / 4, 0, -Math.PI / 4, -Math.PI / 2, Math.PI]) assert.doesNotThrow(() => drawCharacter(ctx, { x: 0, y: 0, h: 50, heading: view, look: a.look, parts: a.parts, state: 'walk', stride: 10, moving: true }));
    assert.ok(calls.length > 100, `${theme}: the unknown agent is actually drawn`);
  }
  assert.notDeepEqual(dressFor({ id: UNKNOWN.id, definition: UNKNOWN }, 'real'), dressFor({ id: UNKNOWN.id, definition: UNKNOWN }, 'fantasy'), 'the two themes dress it differently');
  // Known agents' looks come from their definitions (Pass 5E pins), not from their ids in this module.
  for (const id of Object.keys(DEFAULT_DEFINITIONS)) for (const theme of ['real', 'fantasy']) assert.ok(dressFor({ id, name: DEFAULT_DEFINITIONS[id].name }, theme).look, `${id} ${theme}`);
});

test('D. missing assets fall back: unknown hair, headwear, archetype and an empty look still draw a whole character', () => {
  const { ctx, calls } = recorder();
  for (const look of [{}, { hat: 'no-such-hat', hair: 'not-a-colour' }, { robe: true, bald: true }]) assert.doesNotThrow(() => drawCharacter(ctx, { x: 0, y: 0, h: 50, look, parts: { hair: 'no-such-style', overlays: ['no-such-part'] }, state: 'no-such-clip' }));
  assert.ok(calls.includes('fill') && calls.includes('stroke'));
  const D = dressFor({ id: 'x', definition: { id: 'x', name: 'X', role: 'Unclassifiable', appearance: { themes: { fantasy: { archetype: 'no-such-archetype' } } } } }, 'fantasy');
  assert.ok(D.look && Array.isArray(D.parts.overlays));
  const N = npcLook(7, 'fantasy', { shirt: '#445566' });
  assert.ok(PART_NAMES.hair.includes(N.parts.hair));
});

test('E. views are a pure function of heading (five authored views, mirrored left)', () => {
  const deg = a => (a * Math.PI) / 180;
  assert.deepEqual(VIEWS, ['front', 'fdiag', 'side', 'bdiag', 'back']);
  const cases = [[90, 'front', 1], [45, 'fdiag', 1], [0, 'side', 1], [-45, 'bdiag', 1], [-90, 'back', 1], [135, 'fdiag', -1], [180, 'side', -1], [-135, 'bdiag', -1]];
  for (const [a, view, m] of cases) assert.deepEqual(viewOf(deg(a)), { view, m }, `${a}°`);
  assert.deepEqual(viewOf(undefined, 'left'), { view: 'side', m: -1 });
  assert.deepEqual(viewOf(NaN, 'back'), { view: 'back', m: 1 });
  for (let a = -180; a <= 180; a += 7) assert.deepEqual(viewOf(deg(a)), viewOf(deg(a)));
  for (const k of ['idle', 'walk', 'work', 'carry', 'talk', 'think', 'inspect', 'waiting', 'blocked', 'celebrate']) assert.ok(CLIPS[k], k);
  assert.deepEqual(DEPTH_PLANES, ['farBackground', 'background', 'ground', 'building', 'agent', 'foreground', 'overlay']);
});

test('F. drawing full frames in Real and Fantasy, and switching between them, never changes canonical state', () => {
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure'), site = JSON.stringify(w);
  const store = team([...onboard(UNKNOWN, 20), ev('TASK_CREATED', { taskId: 't-f', title: 'Work' }, 40), ev('TASK_STARTED', { taskId: 't-f', agentId: 'claude', activity: 'coding' }, 41), ev('PR_CREATED', { prId: 'pr-f', title: 'PR', agentId: 'claude', taskId: 't-f' }, 42)]);
  const before = truth(store.world);
  for (let k = 0; k < 3; k++) for (const [id, art] of [['real', '5d'], ['fantasy', null], ['real', null], ['blueprint', null]]) {
    const R = rig(id, store, w, art); R.run(2);
    assert.ok(R.draw(1000 + k * 500).length > 500, `${id}${art ? '/' + art : ''}: a frame is drawn`);
  }
  assert.equal(truth(store.world), before); assert.equal(JSON.stringify(w), site);
  const ro = readonly(store.world);
  assert.throws(() => { ro.agents.claude.activity = 'completed'; }, /cannot change canonical state/);
});

test('G. status language: canonical fields only; celebration only on canonical completion; NEEDS KYLE never inferred', () => {
  for (const k of STATUS_ORDER) { const S = STATUS[k]; assert.ok(/^#[0-9a-f]{6}$/i.test(S.color) && S.pose && 'real' in S && 'fantasy' in S, k); }
  assert.equal(new Set(STATUS_ORDER.map(k => STATUS[k].color)).size, STATUS_ORDER.length, 'every status has its own colour');
  const e = (x = {}) => ({ anim: {}, ...x });
  assert.equal(statusOf(e(), { activity: 'completed' }), 'completed');
  assert.equal(statusOf(e({ anim: { state: 'celebrate' } }), { activity: 'idle' }), 'idle', 'an animation alone never reads as completion');
  assert.equal(statusOf(e(), { activity: 'idle', lastTask: { outcome: 'done' } }), 'idle', 'a finished task in the past is not a ceremony');
  assert.equal(statusOf(e({ staging: { presence: 'candidate' } }), { activity: 'coding', taskId: 't' }), 'candidate', 'READY is never shown as working');
  assert.equal(statusOf(e(), { activity: 'waiting', lastTask: { outcome: 'blocked' } }), 'blocked');
  assert.equal(statusOf(e(), { activity: 'error' }), 'blocked');
  assert.equal(statusOf(e({ moving: true }), { activity: 'coding', taskId: 't' }), 'travelling');
  assert.equal(statusOf(e({ anim: { intent: 'working' } }), { activity: 'coding', taskId: 't' }), 'working');
  for (const activity of ['idle', 'thinking', 'coordinating', 'coding', 'researching', 'testing', 'reviewing', 'communicating', 'waiting', 'completed', 'error', 'offline'])
    for (const outcome of [null, 'blocked', 'done', 'failed']) assert.notEqual(statusOf(e(), { activity, lastTask: outcome ? { outcome, detail: 'Needs Kyle approval' } : null }), 'needs-owner');
  // Work chips: canonical PR ids only.
  const world = { tasks: { t: { prId: 'p1' } }, prs: { p1: { state: 'open' } } };
  assert.equal(workChipOf(world, { taskId: 't' }).prId, 'p1');
  assert.equal(workChipOf(world, { taskId: null, role: 'PR reviewer', name: 'PR bot' }), null, 'names and roles never make a chip');
  assert.equal(workChipOf(world, { prId: 'p1' }).reviewing, true);
  // The ceremony draws only inside its window, and nothing when motion is reduced.
  const r = recorder();
  drawCeremony(r.ctx, 0, 0, 50, CEREMONY_S + 0.1, 'real'); drawCeremony(r.ctx, 0, 0, 50, 1, 'real', true);
  assert.equal(r.calls.length, 0);
  drawCeremony(r.ctx, 0, 0, 50, 0.5, 'fantasy'); assert.ok(r.calls.length > 0);
  for (const theme of ['real', 'fantasy']) for (const k of STATUS_ORDER) assert.doesNotThrow(() => { drawEmblem(r.ctx, 0, 0, k, theme, 1, 1); drawStatusRing(r.ctx, 0, 0, 50, k, 1); drawWorkChip(r.ctx, 0, 0, { prId: 'p', state: 'open' }, theme); });
});

test('H. construction art follows the canonical stage only (never time, never animation)', () => {
  // The site's drawing, isolated (the skin tags each plot item with its project), with motion frozen.
  const siteCalls = (stage, T) => {
    const w = buildTo(createWorld({ seed: 'hillink' }), stage), th = loadTheme('fantasy', { world: w }), it = th.skin.items.find(x => x.site === DEMO_CAPABILITY.id);
    assert.ok(it, `${stage}: the plot is drawn`);
    const { ctx, calls } = recorder();
    it.draw({ ctx, P: th.layout.P, T, now: T * 1000, env: { zoom: 1, world: team().world, scene: null }, late: [], reduced: true, lw: 1, room: () => 0 });
    return calls.join('|').replace(/,\s*[\d.]+\)/g, ')'); // a light's flicker (alpha) is motion, not the site's stage
  };
  const at = {};
  for (const stage of ['planning', 'foundation', 'structure', 'exterior', 'systems', 'furnishing']) { at[stage] = siteCalls(stage, 5); assert.equal(siteCalls(stage, 60), at[stage], `${stage}: later time, same site`); }
  assert.equal(new Set(Object.values(at)).size, 6, 'every canonical stage draws a different site');
});

test('I. set dressing never stands on a walk, a station, furniture or a construction plot (both themes)', () => {
  const w = buildTo(createWorld({ seed: 'hillink' }), 'structure');
  const F = loadTheme('fantasy', { world: w }).layout, nodes = Object.values(F.nodePlan), walks = F.navEdges.map(([a, b]) => [F.nodePlan[a], F.nodePlan[b]]);
  const on = (r, p, m = 0) => p.x > r.x0 - m && p.x < r.x1 + m && p.z > r.z0 - m && p.z < r.z1 + m;
  const hitsWalk = (r, [a, b]) => { for (let k = 0; k <= 40; k++) if (on(r, { x: a.x + (b.x - a.x) * k / 40, z: a.z + (b.z - a.z) * k / 40 }, 2)) return true; return false; };
  let total = 0;
  for (const D of Object.values(F.districts)) {
    if (!D.established && !D.always) continue;
    const inD = q => q.x >= D.x0 - 2 && q.x <= D.x1 + 2 && q.z >= D.z0 - 2 && q.z <= D.z1 + 2;
    const out = dressDistrict(D, { solids: F.solids.filter(s => s.district === D.id), stations: nodes.filter(inD), plots: D.id === 'yard' ? F.plots.map(p => p.rect) : [], zones: D.id === 'summoning' ? F.locations.filter(l => l.zone).map(l => l.room) : [], walks: walks.filter(([a, b]) => inD(a) || inD(b)) });
    assert.deepEqual(out, dressDistrict(D, { solids: F.solids.filter(s => s.district === D.id), stations: nodes.filter(inD), plots: D.id === 'yard' ? F.plots.map(p => p.rect) : [], zones: D.id === 'summoning' ? F.locations.filter(l => l.zone).map(l => l.room) : [], walks: walks.filter(([a, b]) => inD(a) || inD(b)) }), 'deterministic');
    for (const q of out) {
      total++;
      assert.ok(KPROPS[q.kind] && KPROP_SIZE[q.kind], q.kind);
      assert.ok(q.x0 >= D.x0 && q.x1 <= D.x1 && q.z0 >= D.z0 && q.z1 <= D.z1, `${q.kind} inside ${D.id}`);
      assert.ok(!F.solids.some(s => q.x0 < s.x1 && q.x1 > s.x0 && q.z0 < s.z1 && q.z1 > s.z0), `${q.kind} in ${D.id} is clear of furniture`);
      assert.ok(!nodes.some(p => on(q, p, 4)), `${q.kind} in ${D.id} is clear of every station and walk node`);
      assert.ok(!walks.some(s => hitsWalk(q, s)), `${q.kind} in ${D.id} is on no walk`);
      if (D.id === 'yard') assert.ok(!F.plots.some(p => q.x0 < p.rect.x1 && q.x1 > p.rect.x0 && q.z0 < p.rect.z1 && q.z1 > p.rect.z0), 'clear of plots');
    }
    for (const k of DISTRICT_DRESSING[D.structure] ?? []) assert.ok(KPROPS[k], `drawer for ${k}`);
  }
  assert.ok(total > 60, `the kingdom is dressed (${total} props)`);
  // Real: the same rule against the generated rooms.
  const G = loadTheme('real', { world: w, art: '5d' }).layout, gn = Object.values(G.nodePlan), gw = G.navEdges.map(([a, b]) => [G.nodePlan[a], G.nodePlan[b]]);
  let real = 0;
  for (const s of Object.values(w.spaces)) {
    const F2 = G.furnishing[s.id]; if (!F2) continue;
    const R = G.view.rectToView(s.rect), r = { x0: R.x0 * G.U, x1: R.x1 * G.U, z0: R.z0 * G.U, z1: R.z1 * G.U }, f = s.level;
    const inR = q => q.floor === f && q.x >= r.x0 - 2 && q.x <= r.x1 + 2 && q.z >= r.z0 - 2 && q.z <= r.z1 + 2;
    const avoid = [...F2.items.map(it => ({ x0: (it.x - it.w / 2) * G.U, x1: (it.x + it.w / 2) * G.U, z0: (it.z - it.d / 2) * G.U, z1: (it.z + it.d / 2) * G.U })), ...F2.keepouts.map(k => ({ x0: k.x0 * G.U, x1: k.x1 * G.U, z0: k.z0 * G.U, z1: k.z1 * G.U }))];
    const walksR = gw.filter(([a, b]) => a && b && (inR(a) || inR(b)));
    for (const q of dressRoom(F2.kind, r, { avoid, nodes: gn.filter(inR), walks: walksR, seed: 1 })) {
      real++;
      assert.ok(RPROPS[q.kind] && RPROP_SIZE[q.kind], q.kind);
      assert.ok(!avoid.some(o => q.x0 < o.x1 && q.x1 > o.x0 && q.z0 < o.z1 && q.z1 > o.z0), `${q.kind} in ${s.id} clear of furniture and door zones`);
      assert.ok(!walksR.some(sg => hitsWalk(q, sg)), `${q.kind} in ${s.id} on no walk`);
    }
  }
  assert.ok(real > 5, `the HQ is dressed (${real} props)`);
  for (const list of Object.values(ROOM_DRESSING)) for (const k of list) assert.ok(RPROPS[k], k);
});

test('J. depth order is deterministic (same state, same order), dressing included', () => {
  const order = () => { const K = loadTheme('fantasy', { world: createWorld({ seed: 'hillink' }) }).skin; return depthOrder(K.items.filter(it => it.layer !== 'overlay')).map(it => `${it.layer}:${it.dressing ?? ''}:${it.x0},${it.z0}`); };
  const a = order(), b = order();
  assert.deepEqual(a, b);
  assert.ok(a.some(k => k.startsWith('building:') && k.split(':')[1]), 'dressing is depth-sorted with the building plane');
  const K = loadTheme('fantasy', { world: createWorld({ seed: 'hillink' }) }).skin;
  assert.ok(K.items.filter(it => it.dressing).every(it => it.layer === 'building'));
  // A character in front of a barrel is drawn after it, and behind it before it.
  const barrel = K.items.find(it => it.dressing === 'barrel');
  const front = { layer: 'agent', x0: barrel.x0, x1: barrel.x1, z0: barrel.z0 - 12, z1: barrel.z0 - 6, id: 'front' }, back = { layer: 'agent', x0: barrel.x0, x1: barrel.x1, z0: barrel.z1 + 6, z1: barrel.z1 + 12, id: 'back' };
  const seq = depthOrder([front, barrel, back]).map(it => it.id ?? 'barrel');
  assert.ok(seq.indexOf('back') < seq.indexOf('barrel') && seq.indexOf('barrel') < seq.indexOf('front'), seq.join(' '));
});
