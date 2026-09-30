// Pass 5E: the extensible World foundation. What these tests hold the architecture to: Hillink's current agents load
// through the same registry as any other and look and behave as before; an agent the World has never heard of (and two
// of them, with different roles, looks and rigs) can be requested, provisioned, placed, routed, given work, disabled
// and retired with no code keyed by its id; lifecycle transitions fail closed and leave the World untouched when
// refused; READY comes only from a canonical event, never from anything visual; the theme interpreter cannot change
// canonical state; replay, duplicates, out-of-order and stale updates are deterministic; live and simulated sources
// never touch each other's agents; and unknown optional metadata never breaks a render path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../procgen/world.mjs';
import { loadTheme } from '../themes/index.mjs';
import { WorldStore, emptyWorld, applyEvent } from '../core/state.mjs';
import { makeEvent, validateEvent, EVENT_TYPES } from '../core/events.mjs';
import { Scene } from '../engine/scene.mjs';
import { Effects, stepPath } from '../engine/motion.mjs';
import { IsoWorldView, actionText } from '../engine/iso-view.mjs';
import { DEFAULT_DEFINITIONS, definitionOf, registryOf, normalizeDefinition, presenceOf, TRANSITIONS, LIFECYCLE, checkAgentEvent } from '../core/agents.mjs';
import { createInterpreter, defineTheme, readonly, THEMES } from '../themes/interpreter.mjs';
import { semanticOf, buildEventsOf, SEMANTIC } from '../core/semantic.mjs';
import { resolveAppearance, figureLookOf, rigProfileOf } from '../render/appearance.mjs';
import { lookFor } from '../render/looks.mjs';
import { roleOf } from '../core/roles.mjs';
import { ENTITY_KINDS, defineEntityKind, spawnEntity } from '../core/entities.mjs';
import { drawFigure5d } from '../render/art5d/figure.mjs';
import { drawFigure } from '../render/figure.mjs';
import { SIM_AGENTS } from '../sim/simulator.mjs';
import { DEV_AGENTS, DEV_ONBOARDING } from '../sim/dev-agents.mjs';
import { createConstructionDemo, REFIT_CAPABILITY } from '../sim/construction-demo.mjs';
import { routeProblems } from './route-check.mjs';

const [A, B] = DEV_AGENTS; // two fixture agents; nothing in the World refers to their ids
let n = 0;
const ev = (type, fields, { source = 'sim', at } = {}) => ({ v: 1, id: `t5e-${++n}`, type, at: at ?? n, source, ...fields });
// The engine on the generated world, with the simulated team registered, stepped at 20 Hz.
function world5e() {
  const w = createWorld({ seed: 'hillink' }), theme = loadTheme('real', { world: w }), L = theme.layout, store = new WorldStore(emptyWorld()), scene = new Scene();
  const view = new IsoWorldView(scene, new Effects(), L, theme.scenery, theme.interpreter);
  for (const a of SIM_AGENTS) store.dispatch(makeEvent('AGENT_REGISTERED', { ...a, activity: 'idle' }, { source: 'sim', at: 1 }));
  store.flush(); view.sync(store.world, new Set(['*']), 0);
  const changed = new Set(); store.subscribe(k => { for (const x of k) changed.add(x); });
  let now = 0;
  const send = (...events) => { for (const e of events) store.dispatch(e); store.flush(); view.sync(store.world, new Set([...changed, '*agent']), now); changed.clear(); };
  const run = s => { for (let t = 0; t < s; t += 0.05) { now += 50; view.step(0.05, now, { instant: false }, stepPath); } };
  return { store, view, scene, L, send, run, get now() { return now; } };
}
const onboard = (def, at = 10) => [ev('AGENT_REQUESTED', { agentId: def.id, definition: def }, { at }), ...DEV_ONBOARDING.map((stage, i) => ev('AGENT_PROVISIONING', { agentId: def.id, stage }, { at: at + i + 1 })), ev('AGENT_READY', { agentId: def.id }, { at: at + 10 }), ev('AGENT_ACTIVATED', { agentId: def.id }, { at: at + 11 })];
const snapshot = w => JSON.stringify(w);

test('1. Hillink\'s current agents load through the registry, with the same roles and exactly the same looks', () => {
  // The pre-5E looks (render/looks.mjs before this pass), verbatim, for the two simulated agents.
  const PRE = {
    real: { claude: { shirt: '#d9773f', sleeve: '#d9773f', pants: '#3a3f4a', hair: '#5a3a22', skin: '#f1c7a0', belt: '#4a3a2a', hoodie: true, glasses: true, screen: '#ffb27a', package: 'box' },
      codex: { shirt: '#2d4f8e', pants: '#1f2530', hair: '#1a1a1d', skin: '#d8a883', headset: true, badge: '#e8f1ff', vest: null, jacket: '#243f73', screen: '#5ee1ff', package: 'box' } },
    fantasy: { claude: { shirt: '#b5552b', sleeve: '#b5552b', pants: '#5a3b24', hair: '#c4521f', beard: '#c4521f', beardLong: true, skin: '#eab28a', hat: 'helmet', hatColor: '#9aa6b4', horns: true, belt: '#3c2a1a', scale: 0.86, wide: 1.2, headScale: 1.08, package: 'scroll' } },
  };
  const { store } = world5e(), reg = registryOf(store.world);
  for (const id of ['claude', 'codex']) {
    assert.ok(reg[id], `${id} is in the registry`);
    assert.equal(reg[id].id, id); assert.equal(reg[id].name, DEFAULT_DEFINITIONS[id].name);
    assert.deepEqual(lookFor('real', store.world.agents[id]), PRE.real[id], `${id} looks the same (real)`);
  }
  assert.deepEqual(lookFor('fantasy', store.world.agents.claude), PRE.fantasy.claude, 'claude looks the same (fantasy)');
  assert.deepEqual(SIM_AGENTS.map(a => [a.agentId, a.name, a.role, a.appearance.color]), [['claude', 'Claude', 'Engineering: builder', '#e2711d'], ['codex', 'Codex', 'Engineering: QA and security', '#3a86ff']], 'the simulated roster is unchanged');
  assert.equal(roleOf('codex').title, 'Investigation and review'); assert.equal(roleOf(store.world.agents.claude).title, 'Implementation');
  for (const d of Object.values(DEFAULT_DEFINITIONS)) assert.deepEqual(normalizeDefinition(d), d, `${d.id} is a valid definition in the shared schema`);
  // No source file outside the fixtures and these tests names the fixture agents.
  const files = []; const walk = dir => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${f.name}`; if (f.isDirectory()) { if (!['tests', 'node_modules', 'docs'].includes(f.name)) walk(p); } else if (p.endsWith('.mjs')) files.push(p); } };
  walk(new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1').replace(/\/$/, ''));
  for (const f of files.filter(f => !f.endsWith('sim/dev-agents.mjs'))) assert.ok(!/agent-test-(unknown|second)/.test(fs.readFileSync(f, 'utf8')), `${f} does not hard-code a fixture agent`);
});

test('2. an unknown agent is requested, provisioned, placed, routed, given work and shown, with no code keyed by its id', () => {
  const W = world5e();
  W.send(onboard(A).at(0)); W.run(3);
  let e = W.scene.get(`agent:${A.id}`), a = W.store.world.agents[A.id];
  assert.ok(e, 'it appears in the World as soon as it is requested (a candidate)');
  assert.equal(presenceOf(a), 'candidate'); assert.equal(a.activity, 'offline', 'a candidate is not working');
  // Provisioning: staged in the onboarding area (the lobby in Real HQ), captioned by stage.
  const seenCaptions = new Set();
  for (const x of onboard(A).slice(1, 6)) { W.send(x); W.run(6); seenCaptions.add(actionText(W.scene.get(`agent:${A.id}`), W.L)); }
  e = W.scene.get(`agent:${A.id}`);
  assert.equal(W.view.places[A.id].location, W.L.places.onboarding.location, 'waits in the onboarding area');
  assert.ok([...seenCaptions].some(c => /trial task/i.test(c)) && [...seenCaptions].some(c => /tool access/i.test(c)), `captions follow the real stage: ${[...seenCaptions]}`);
  assert.equal(W.store.world.agents[A.id].lifecycle.state, 'TESTING', 'animation time never advances the lifecycle');
  // READY and ACTIVE (canonical): it joins the team and walks in to where idle members go.
  W.send(...onboard(A).slice(6)); W.run(40);
  a = W.store.world.agents[A.id]; e = W.scene.get(`agent:${A.id}`);
  assert.equal(presenceOf(a), 'member'); assert.equal(a.activity, 'idle');
  assert.equal(W.view.places[A.id].location, W.L.places.idle.location, 'a member idles where every idle agent does');
  // Work: a real task start sends it through the same journey system (task board, then its research station).
  W.send(ev('TASK_CREATED', { taskId: 'tA', title: 'Market scan' }, { at: 40 }), ev('TASK_STARTED', { taskId: 'tA', agentId: A.id, activity: 'researching' }, { at: 41 }));
  W.run(1); assert.equal(W.scene.get(`agent:${A.id}`).journey?.kind, 'start', 'the start journey runs for it');
  const dest = W.view.places[A.id];
  const r = W.L.route([e.x, e.y], dest.location, W.L.locationById[dest.location].stations[dest.station]);
  assert.ok(r); assert.deepEqual(routeProblems(W.L, r), [], 'its route is clean');
  W.run(60);
  e = W.scene.get(`agent:${A.id}`);
  assert.ok(!e.moving && e.spot, 'it arrived and uses its station');
  assert.equal(roleOf(a).title, 'Market analysis'); assert.equal(definitionOf(a).team, 'Growth');
  assert.equal(lookFor('real', a).shirt, '#2a9d8f', 'drawn from its own appearance data'); assert.equal(lookFor('real', a).glasses, true);
  assert.equal(W.store.world.agents.claude.activity, 'idle', 'the default agents are untouched');
});

test('3. two dynamic agents with different roles, looks and rigs coexist without a shared template', () => {
  const W = world5e();
  W.send(...onboard(A, 10), ...onboard(B, 30)); W.run(40);
  const [ea, eb] = [A, B].map(d => W.scene.get(`agent:${d.id}`));
  assert.ok(ea && eb);
  assert.notDeepEqual(lookFor('real', ea.agent), lookFor('real', eb.agent), 'different looks');
  assert.notEqual(roleOf(ea.agent).title, roleOf(eb.agent).title, 'different roles');
  assert.equal(eb.rig.fallbackFrom, 'golem', 'an undrawn rig falls back to the humanoid, visibly in the data');
  assert.ok(eb.h > ea.h * 1.1, 'and keeps its declared height');
  assert.notEqual(`${W.view.places[A.id].location}:${W.view.places[A.id].station}`, `${W.view.places[B.id].location}:${W.view.places[B.id].station}`, 'they never share a station');
  const reg = registryOf(W.store.world);
  assert.deepEqual(Object.keys(reg).sort(), ['agent-test-second', 'agent-test-unknown', 'claude', 'codex'].sort());
  assert.deepEqual(reg[B.id].extra, { unknownFutureField: { from: 'a newer HQ', kept: true } }, 'an unknown field is kept aside, not lost and not trusted');
});

test('4. lifecycle transitions fail closed, and a refused event leaves the World exactly as it was', () => {
  const store = new WorldStore(emptyWorld());
  const tryEvent = e => { const before = snapshot(store.world); store.dispatch(e); store.flush(); const refused = store.rejected.some(r => r.event === e); if (refused) assert.equal(snapshot(store.world), before, `${e.type} refused without side effects`); return !refused; };
  assert.ok(tryEvent(ev('AGENT_REQUESTED', { agentId: 'x1', definition: { name: 'X' } }, { at: 100 })));
  assert.ok(!tryEvent(ev('AGENT_READY', { agentId: 'x1' }, { at: 101 })), 'READY straight from REQUESTED is refused');
  assert.ok(!tryEvent(ev('AGENT_ACTIVATED', { agentId: 'x1' }, { at: 101 })), 'ACTIVE before READY is refused');
  assert.ok(!tryEvent(ev('AGENT_PROVISIONING', { agentId: 'x1', stage: 'SUMMONING' }, { at: 101 })), 'an unknown stage is refused');
  assert.ok(!tryEvent(ev('TASK_STARTED', { agentId: 'x1', taskId: 't' }, { at: 101 })), 'a candidate cannot be given work');
  assert.ok(tryEvent(ev('AGENT_PROVISIONING', { agentId: 'x1', stage: 'TESTING' }, { at: 105 })));
  // 5E correction (B5): a late event takes its canonical place (as a replay would put it) instead of being dropped.
  assert.ok(tryEvent(ev('AGENT_PROVISIONING', { agentId: 'x1', stage: 'CONFIGURING' }, { at: 103 })), 'a late event lands in time order');
  assert.ok(tryEvent(ev('AGENT_READY', { agentId: 'x1' }, { at: 106 })));
  assert.ok(tryEvent(ev('AGENT_RETIRED', { agentId: 'x1' }, { at: 107 })));
  for (const t of ['AGENT_ACTIVATED', 'AGENT_REQUESTED', 'AGENT_DISABLED']) assert.ok(!tryEvent(ev(t, { agentId: 'x1' }, { at: 200 })), `RETIRED is terminal (${t} refused)`);
  assert.deepEqual(store.world.agents.x1.lifecycle.history.map(h => h.state), ['REQUESTED', 'CONFIGURING', 'TESTING', 'READY', 'RETIRED']);
  // The table is total over the states and only READY leads to ACTIVE.
  for (const s of LIFECYCLE) assert.ok(Array.isArray(TRANSITIONS[s]), s);
  assert.deepEqual(LIFECYCLE.filter(s => TRANSITIONS[s].includes('ACTIVE')).sort(), ['DISABLED', 'READY']);
  assert.deepEqual(LIFECYCLE.filter(s => TRANSITIONS[s].includes('READY')).sort(), ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING'].sort());
});

test('5 and 6. theme interpretation cannot change canonical truth; READY comes only from a canonical event', () => {
  const W = world5e();
  W.send(...onboard(A).slice(0, 6));
  const before = snapshot(W.store.world);
  // Interpretations get read-only views: a theme that tries to write fails, and nothing changed.
  defineTheme('evil', { agent: { TESTING: { place: 'onboarding', caption: 'x' } }, events: { AGENT_PROVISIONING: { sequence: 'portal', text: (nm, e) => { e.stage = 'READY'; return 'x'; } } } });
  const evil = createInterpreter('evil');
  assert.throws(() => evil.cue(W.store.world.log.at(-1)), /cannot change canonical state/);
  assert.throws(() => { readonly(W.store.world.agents[A.id]).lifecycle.state = 'READY'; }, /cannot change canonical state/);
  assert.equal(evil.agent(W.store.world.agents[A.id]).caption, 'x');
  delete THEMES.evil;
  // Long stretches of animation, in every theme's staging, never advance the lifecycle.
  W.run(120);
  assert.equal(W.store.world.agents[A.id].lifecycle.state, 'TESTING');
  assert.equal(snapshot(W.store.world), before, 'rendering and interpretation left canonical state untouched');
  // There is no event source a renderer or theme could use.
  for (const source of ['theme', 'render', 'view', 'animation']) assert.match(validateEvent(ev('AGENT_READY', { agentId: A.id }, { source })), /Unknown source/);
  // Event names say what happened, never how it looks.
  for (const t of [...Object.keys(EVENT_TYPES), ...Object.keys(SEMANTIC)]) assert.ok(!/PORTAL|MAGIC|SUMMON|HAMMER|INTERVIEW|SPELL|HERO/.test(t), t);
  // Every lifecycle event has a semantic form; Real and Fantasy interpret the same fact without changing it.
  const e0 = W.store.world.log.find(x => x.type === 'AGENT_REQUESTED');
  assert.equal(semanticOf(e0).type, 'AGENT_REQUESTED');
  assert.ok(createInterpreter('real').cue(semanticOf(e0), () => 'Test Unknown').text.includes('Test Unknown'));
  assert.equal(createInterpreter('fantasy').agent(W.store.world.agents[A.id]).presence, 'candidate');
});

test('9. save, reload and replay are deterministic: duplicates, reordering and stale updates change nothing', () => {
  const events = [
    ...SIM_AGENTS.map((a, i) => ev('AGENT_REGISTERED', { ...a, activity: 'idle' }, { at: 1 + i })),
    ...onboard(A, 10), ...onboard(B, 30).slice(0, 4), ev('AGENT_PROVISIONING_FAILED', { agentId: B.id, detail: 'tool refused' }, { at: 40 }),
    ev('AGENT_DEFINED', { agentId: A.id, definition: { team: 'Research', appearance: { palette: { shirt: '#ff0000' } } } }, { at: 50 }),
    ev('AGENT_DEFINED', { agentId: A.id, definition: { team: 'Stale' } }, { at: 45 }), // stale: older than the applied definition
    ev('AGENT_DISABLED', { agentId: A.id }, { at: 60 }),
  ];
  const play = list => { const s = new WorldStore(emptyWorld()); s.reset(list); return s.world; };
  const w1 = play(events), w2 = play([...events].reverse()), w3 = play([...events, ...events]);
  const canon = w => JSON.stringify({ agents: w.agents, tasks: w.tasks });
  assert.equal(canon(w2), canon(w1), 'order of delivery does not matter');
  assert.equal(canon(w3), canon(w1), 'duplicates do not matter');
  assert.equal(w1.agents[A.id].definitionVersion, 3, 'request, then both updates in time order (the older is superseded); duplicates change nothing');
  // Delivered late (a later batch), an older definition is refused outright.
  const late = new WorldStore(structuredClone(w1)); late.dispatch(ev('AGENT_DEFINED', { agentId: A.id, definition: { team: 'Late' } }, { at: 44 })); late.flush();
  assert.match(late.rejected.at(-1).error, /stale/); assert.equal(definitionOf(late.world.agents[A.id]).team, 'Research');
  const a = w1.agents[A.id];
  assert.equal(definitionOf(a).team, 'Research', 'the newer definition won');
  assert.equal(lookFor('real', a).shirt, '#ff0000', 'an appearance update applies');
  assert.equal(presenceOf(a), 'absent'); assert.equal(w1.agents[B.id].lifecycle.state, 'ERROR');
  // Save and reload (the page stores the world as JSON), then keep going: the same as never stopping.
  const saved = JSON.parse(JSON.stringify(w1)), more = [ev('AGENT_ACTIVATED', { agentId: A.id }, { at: 70 }), ev('AGENT_REQUESTED', { agentId: B.id }, { at: 71 })];
  const cont = new WorldStore(saved); cont.dispatchAll(more); cont.flush();
  assert.equal(canon(cont.world), canon(play([...events, ...more])), 'reload then continue equals one uninterrupted replay');
  assert.equal(presenceOf(cont.world.agents[A.id]), 'member');
});

test('10 and 11. live and simulated sources never touch each other\'s agents; one identity, many appearances', () => {
  const s = new WorldStore(emptyWorld());
  s.dispatchAll([ev('AGENT_REGISTERED', { agentId: 'live1', name: 'Live', role: 'r' }, { source: 'hq', at: 1 }), ev('AGENT_REQUESTED', { agentId: 'sim1' }, { source: 'sim', at: 2 })]); s.flush();
  const before = snapshot(s.world);
  s.dispatchAll([ev('AGENT_DISABLED', { agentId: 'live1' }, { source: 'sim', at: 3 }), ev('AGENT_DEFINED', { agentId: 'live1', definition: { name: 'Hijack' } }, { source: 'sim', at: 3 }),
    ev('AGENT_PROVISIONING', { agentId: 'sim1', stage: 'TESTING' }, { source: 'hq', at: 3 }), ev('AGENT_REGISTERED', { agentId: 'sim1', name: 'x', role: 'y' }, { source: 'hq', at: 3 })]); s.flush();
  assert.equal(snapshot(s.world), before, 'every cross-source change was refused');
  assert.equal(s.rejected.length, 4);
  assert.match(checkAgentEvent(s.world.agents.live1, ev('AGENT_DISABLED', { agentId: 'live1' }, { source: 'replay', at: 9 })), /cannot change agent/, 'replay is not a wildcard (5E correction B4)');
  // One canonical agent, two representations: a single registry entry, a theme override only where it differs.
  const def = normalizeDefinition(A), real = resolveAppearance(def.appearance, 'real'), fantasy = resolveAppearance(def.appearance, 'fantasy');
  assert.equal(real.archetype, 'human'); assert.equal(fantasy.archetype, 'elf');
  assert.equal(fantasy.palette.pants, real.palette.pants, 'fantasy inherits what it does not override');
  assert.notEqual(figureLookOf(fantasy).shirt, figureLookOf(real).shirt);
  assert.equal(resolveAppearance(def.appearance, 'blueprint').archetype, 'human', 'blueprint uses the real look');
  assert.ok(!JSON.stringify(def.appearance.themes).includes('"id"'), 'no identity inside an appearance');
});

test('12. disabling or retiring an agent frees its station and task, keeps navigation whole, and re-enabling restores it', () => {
  const W = world5e();
  W.send(...onboard(A)); W.run(40);
  W.send(ev('TASK_CREATED', { taskId: 'tD', title: 'Scan' }, { at: 40 }), ev('TASK_STARTED', { taskId: 'tD', agentId: A.id, activity: 'researching' }, { at: 41 })); W.run(40);
  const held = W.view.places[A.id]; assert.ok(held);
  W.send(ev('AGENT_DISABLED', { agentId: A.id }, { at: 50 })); W.run(2);
  assert.equal(W.scene.get(`agent:${A.id}`), undefined, 'it leaves the scene');
  assert.equal(W.view.places[A.id], undefined, 'it holds no station');
  assert.equal(W.store.world.tasks.tD.status, 'queued', 'its task goes back to the queue'); assert.equal(W.store.world.tasks.tD.agentId, null);
  // The rest of the World still works: Claude can start work and route there cleanly, even to the freed station.
  W.send(ev('TASK_CREATED', { taskId: 'tC', title: 'Build' }, { at: 51 }), ev('TASK_STARTED', { taskId: 'tC', agentId: 'claude', activity: 'coding' }, { at: 52 })); W.run(60);
  const c = W.scene.get('agent:claude'); assert.ok(!c.moving && c.spot, 'claude reaches its desk');
  assert.ok(!W.store.world.agents[A.id].taskId);
  // Work for a disabled agent is refused; re-enabling brings it back as a member.
  W.send(ev('TASK_STARTED', { taskId: 'tD', agentId: A.id }, { at: 53 }));
  assert.equal(W.store.world.tasks.tD.status, 'queued');
  W.send(ev('AGENT_ACTIVATED', { agentId: A.id }, { at: 60 })); W.run(3);
  assert.ok(W.scene.get(`agent:${A.id}`), 're-enabled agents return');
  W.send(ev('AGENT_RETIRED', { agentId: A.id }, { at: 70 })); W.run(2);
  assert.equal(W.scene.get(`agent:${A.id}`), undefined);
  assert.equal(Object.keys(W.view.places).length, 2, 'only claude and codex hold places');
});

test('13. unknown or hostile optional metadata never breaks a render path; new entity kinds need no view change', () => {
  const weird = normalizeDefinition({ id: 'odd', name: 'x'.repeat(500), capabilities: 'not a list', appearance: { rig: 'dragon', palette: { shirt: 'url(javascript:alert(1))', hair: 42 }, body: { scale: 99, heightScale: 50 }, accessories: [{}, 'glasses', null], themes: { fantasy: 'nope' } }, meta: { deep: { a: [1, 2, { b: 3 }] } }, huge: 'y'.repeat(20000) });
  assert.equal(weird.name.length, 80); assert.equal(weird.capabilities, undefined); assert.equal(weird.extra, undefined, 'oversized unknown data is dropped');
  const look = figureLookOf(resolveAppearance(weird.appearance, 'real'));
  assert.equal(look.shirt, '#6b7a90', 'an unsafe colour is never used'); assert.equal(look.scale, undefined, 'out-of-range proportions are ignored');
  const rig = rigProfileOf(resolveAppearance(weird.appearance, 'real')); assert.equal(rig.fallbackFrom, 'dragon'); assert.equal(rig.heightScale, 1);
  assert.doesNotThrow(() => lookFor('fantasy', { id: 'odd', definition: weird }));
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  for (const d of [A, B, weird]) for (const theme of ['real', 'fantasy']) for (const draw of [drawFigure, drawFigure5d]) {
    const r = draw(ctx, { x: 0, y: 0, h: 50, dir: 'left', state: 'walk', t: 0.3, time: 1, look: figureLookOf(resolveAppearance(normalizeDefinition(d).appearance, theme)) });
    assert.ok(Number.isFinite(r.top), `${d.id}/${theme}`);
  }
  assert.equal(normalizeDefinition({ name: 'no id' }), null, 'a definition needs an id');
  // Entity kinds: defined as data, spawned without editing the views; unknown kinds are refused, not guessed.
  const scene = new Scene();
  defineEntityKind('visitor-test', { layer: 'agent', selectable: true, canonical: false });
  const e = spawnEntity(scene, 'visitor-test', { id: 'visitor-test:1', x: 1, y: 2, w: 3, h: 4 });
  assert.equal(e.kind, 'visitor-test'); assert.equal(scene.get('visitor-test:1'), e);
  assert.throws(() => spawnEntity(scene, 'nope', { id: 'x' }), /unknown entity kind/);
  delete ENTITY_KINDS['visitor-test'];
  assert.equal(ENTITY_KINDS.agent.canonical, true); assert.equal(ENTITY_KINDS.ambient.canonical, false);
});

test('construction speaks semantic events: BUILD_* from canonical project state, for the refit demo', () => {
  const sim = createWorld({ seed: 'hillink' }); sim.simulated = true;
  const demo = createConstructionDemo({ siteWorld: sim, store: new WorldStore(emptyWorld()), now: () => 1, capability: REFIT_CAPABILITY });
  const seen = [];
  let prev = null;
  while (!demo.done) { demo.applyCanonical(); demo.applyAgents(); const p = demo.project ? structuredClone(demo.project) : null; seen.push(...buildEventsOf(prev, p).map(x => x.type)); prev = p; }
  assert.equal(seen[0], 'CAPABILITY_REQUESTED'); assert.equal(seen.filter(t => t === 'BUILD_STARTED').length, 1);
  assert.ok(seen.includes('BUILD_BLOCKED') && seen.includes('BUILD_RESUMED') && seen.includes('BUILD_STAGE_CHANGED'));
  assert.equal(seen.at(-1), 'BUILD_COMPLETED');
  for (const t of seen) assert.ok(SEMANTIC[t], t);
});

test('the reducer is untouched for pre-5E agents: registration still means present and working as before', () => {
  const w = emptyWorld();
  applyEvent(w, ev('AGENT_REGISTERED', { agentId: 'legacy', name: 'Legacy', role: 'r', activity: 'idle' }, { source: 'hq', at: 1 }));
  applyEvent(w, ev('TASK_STARTED', { agentId: 'legacy', taskId: 't1' }, { source: 'hq', at: 2 }));
  assert.equal(w.agents.legacy.lifecycle, undefined); assert.equal(presenceOf(w.agents.legacy), 'member'); assert.equal(w.agents.legacy.activity, 'coding');
});
