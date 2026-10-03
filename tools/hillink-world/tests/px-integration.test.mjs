// px renderer V2 integration: the pixel renderer (render/px/) over the canonical World, construction, agent status and
// generic content. Every World here comes from createWorld / placeCapability / the HQ contract (applyHqEvent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, placeCapability } from '../procgen/world.mjs';
import { STAGES, STAGE_LABEL } from '../procgen/construction.mjs';
import { capabilityName } from '../procgen/capabilities.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { composeScene } from '../render/px/compose.mjs';
import { createStage } from '../render/px/stage.mjs';
import { PixelBuffer } from '../render/px/buffer.mjs';
import { lookFor, clipFor, buildSprite, isWorkClip, agentStatusOf, INTENT_STATUS, STATUSES, TEST_LOOK, ALIASES, CLIPS } from '../render/px/character.mjs';
import { INTENTS } from '../engine/animation.mjs';
import { floorFor, recipeOrFallback, decorFor, SITE } from '../render/px/kit.mjs';
import { roomNameOf, siteLabelOf, actorsOf, structureKey, locationOfSpot, spotLabelOf } from '../render/px/skin.mjs';
import { loadTheme } from '../themes/index.mjs';
import { ruleActors, worldAtStage, genericWorld, semanticOf, siteHash, v2Evidence, T0_TEAM, UNKNOWN_AGENT, GENERIC_PROGRAM, CONSTRUCTION_PROGRAM, GENERIC_CAPABILITY } from '../scripts/px-harness.mjs';

const THEMES = ['real', 'fantasy'];
const BUILD = STAGES.slice(0, STAGES.indexOf('inspection') + 1); // the stages a project is drawn at (planning..inspection)
const compose = (world, theme) => composeScene(createGeneratedLayout(world, { theme }), theme, { skipGround: true });

test('V2: the same canonical World renders Modern and Fantasy with identical semantic geometry and content', () => {
  const w = worldAtStage('exterior'), before = JSON.stringify(w);
  const S = Object.fromEntries(THEMES.map(th => [th, compose(w, th)]));
  assert.deepEqual(semanticOf(S.real), semanticOf(S.fantasy), 'walls, props, rooms, construction pieces and sites are identical');
  assert.ok(semanticOf(S.real).site.length > 0, 'the active project is drawn');
  assert.deepEqual(S.real.region, S.fantasy.region);
  assert.notEqual(siteHash(S.real), siteHash(S.fantasy), 'only materials differ');
  // Agents (the three founders and an unknown one) are placed by the same rules at the same points in both themes.
  const team = [...T0_TEAM, UNKNOWN_AGENT], at = th => ruleActors(createGeneratedLayout(w, { theme: th }), th, team).map(a => [a.id, a.location, a.station, a.status, a.clip.split('.')[0], ...a.point.map(Math.round)].join());
  assert.deepEqual(at('real'), at('fantasy'));
  assert.equal(JSON.stringify(w), before, 'rendering never writes the World');
});

test('V2: a real placeCapability change appears in both themes', () => {
  const w = createWorld({ seed: 'hillink' }), before = Object.fromEntries(THEMES.map(th => [th, semanticOf(compose(w, th))]));
  const r = placeCapability(w, { id: 'drone-lab', area: 30, traits: ['inspection'] }, { status: 'built' });
  const after = Object.fromEntries(THEMES.map(th => [th, semanticOf(compose(w, th))]));
  const space = w.capabilities['drone-lab'].placement.spaceId;
  for (const th of THEMES) {
    assert.ok(after[th].rooms.includes(space) && !before[th].rooms.includes(space), `${th}: the planned room is drawn`);
    assert.ok(after[th].props.some(p => p.endsWith(`@${space}`)), `${th}: the new room is furnished`);
    assert.ok(after[th].walls.length > before[th].walls.length || r.plan.chosen.option !== 'add-wing', `${th}: the wing has walls`);
  }
  assert.deepEqual(after.real, after.fantasy);
});

test('V2: active projects render canonical stage-specific construction art in both themes, changing by stage only', () => {
  const pieces = {}, hashes = {};
  for (const stage of BUILD) {
    const w = worldAtStage(stage);
    for (const th of THEMES) {
      const S = compose(w, th), site = S.sites.find(s => s.project === CONSTRUCTION_PROGRAM.capability.id);
      assert.ok(site, `${stage}/${th}: the project is drawn`);
      assert.equal(site.stage, stage, 'drawn at its canonical stage');
      assert.equal(w.projects['drone-lab'].stage, stage);
      pieces[`${stage}/${th}`] = S.sites.flatMap(s => s.pieces).sort().join();
      hashes[`${stage}/${th}`] = siteHash(S);
      assert.ok(S.objects.filter(o => o.kind === 'site').every(o => o.project === 'drone-lab' && o.stage === stage));
    }
    assert.equal(pieces[`${stage}/real`], pieces[`${stage}/fantasy`], `${stage}: the same pieces in both themes`);
    assert.notEqual(hashes[`${stage}/real`], hashes[`${stage}/fantasy`], `${stage}: theme materials`);
  }
  for (const th of THEMES) assert.equal(new Set(BUILD.map(s => pieces[`${s}/${th}`])).size, BUILD.length, `${th}: every stage has its own art`);
  for (const th of THEMES) assert.equal(new Set(BUILD.map(s => hashes[`${s}/${th}`])).size, BUILD.length);
  // Stage-specific pieces (from the canonical stage, nothing else).
  const has = (stage, key) => pieces[`${stage}/real`].split(',').some(k => k.startsWith(key));
  assert.ok(has('planning', 'survey') && has('planning', 'stake:'));
  assert.ok(has('site-preparation', 'cone:') && has('site-preparation', 'materials'));
  assert.ok(has('foundation', 'slab') && has('foundation', 'rebar:'));
  assert.ok(has('structure', 'column:') && has('structure', 'beam:front'));
  assert.ok(has('exterior', 'wall:back') && has('exterior', 'scaffold'));
  assert.ok(has('systems', 'services'));
  assert.ok(has('furnishing', 'crate:'));
  assert.ok(has('inspection', 'inspection') && has('inspection', 'fit:'));
  // Same stage, same pixels; gates come from canonical project state.
  assert.equal(siteHash(compose(worldAtStage('structure'), 'fantasy')), hashes['structure/fantasy']);
  for (const gate of ['blocked', 'waiting']) {
    const w = worldAtStage('structure', { gate });
    for (const th of THEMES) { const S = compose(w, th); assert.equal(S.sites[0].gate, gate); assert.ok(S.sites[0].pieces.includes(`gate:${gate}`)); }
    assert.match(siteLabelOf(w, 'drone-lab'), gate === 'blocked' ? /blocked/ : /waiting for Kyle/);
  }
  // A completed project is a finished room, with no construction art.
  const done = createWorld({ seed: 'hillink' }); placeCapability(done, CONSTRUCTION_PROGRAM.capability, { status: 'built' });
  assert.equal(compose(done, 'real').sites.length, 0);
  assert.ok(SITE.real && SITE.fantasy && Object.keys(SITE.real).every(k => k in SITE.fantasy), 'one role table, translated per theme');
});

test('V2: real agent states are distinguishable and screens activate only for work', () => {
  // Status from canonical facts.
  assert.equal(agentStatusOf({ activity: 'coding' }), 'working');
  assert.equal(agentStatusOf({ activity: 'coding', moving: true }), 'walking');
  assert.equal(agentStatusOf({ activity: 'idle' }), 'idle');
  assert.equal(agentStatusOf({ activity: 'waiting-for-kyle' }), 'waiting');
  assert.equal(agentStatusOf({ activity: 'blocked' }), 'blocked');
  assert.equal(agentStatusOf({ activity: 'communicating' }), 'talking');
  assert.equal(agentStatusOf({ activity: 'idle', state: 'talk' }), 'talking');
  for (const th of THEMES) for (const id of ['chatgpt', 'claude', 'codex', UNKNOWN_AGENT.id]) {
    const look = lookFor(id, th, id === UNKNOWN_AGENT.id ? UNKNOWN_AGENT.def : null);
    for (const posture of [null, 'sit']) {
      const clips = STATUSES.map(s => clipFor(look, { status: s, posture: s === 'walking' ? null : posture }));
      assert.equal(new Set(clips).size, STATUSES.length, `${id}/${th}: one clip per status`);
      assert.deepEqual(clips.map(isWorkClip), STATUSES.map(s => s === 'working'), 'only work clips light screens');
      const sprites = clips.map(c => buildSprite(look, 'fr', c, 0).buf.hash());
      assert.equal(new Set(sprites).size, STATUSES.length, `${id}/${th}/${posture}: every status draws differently`);
      for (const c of clips) assert.ok(CLIPS[c], c);
    }
  }
  // Screens in the World: on only where an agent plays a work clip. Rule placement, real HQ activities.
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w, { theme: 'real' }), S = createStage(L, 'real', { lighting: 'night' }), A = S.A, H = L.home;
  const view = { x0: Math.floor(H.x / A), y0: Math.floor(H.y / A), w: Math.ceil(H.w / A), h: Math.ceil(H.h / A) };
  const run = team => { const actors = ruleActors(L, 'real', team).map(a => ({ ...a, foot: [a.point[0] / A, a.point[1] / A] })); const hash = S.render(new PixelBuffer(view.w, view.h), view, 0, actors).hash(); return { actors, hash, live: S.liveRooms }; };
  const working = run(T0_TEAM);
  assert.ok(working.live.length > 0, 'working agents light their room');
  for (const status of ['idle', 'waiting', 'blocked', 'talking', 'walking']) {
    const r = run(T0_TEAM.map(a => ({ ...a, status })));
    assert.deepEqual(r.live, [], `${status}: no screen is on`);
    assert.ok(r.actors.every(a => a.status === status && !isWorkClip(a.clip)));
    assert.notEqual(r.hash, working.hash);
  }
  // Statuses from real activities are placed by the canonical rules (waiting, blocked and idle agents leave the desks).
  const real = run([{ id: 'claude', activity: 'blocked' }, { id: 'codex', activity: 'waiting-for-kyle' }, { id: 'chatgpt', activity: 'communicating' }]);
  assert.deepEqual(real.actors.map(a => a.status), ['blocked', 'waiting', 'talking']);
  assert.deepEqual(real.live, []);
  // Live entities (the skin path) take their status from the canonical agent record.
  const ent = (activity, extra = {}) => ({ kind: 'agent', id: `e-${activity}`, x: H.x + H.w / 2, y: H.y + H.h / 2, agent: { id: 'claude', activity }, anim: { state: extra.state ?? 'idle' }, moving: !!extra.moving, ...extra });
  const acts = actorsOf([ent('working', { state: 'type' }), ent('blocked'), ent('waiting-for-kyle'), ent('idle'), ent('working', { moving: true })], L, 'real', { A });
  assert.deepEqual(acts.map(a => a.status), ['working', 'blocked', 'waiting', 'idle', 'walking']);
  assert.deepEqual(acts.map(a => isWorkClip(a.clip)), [true, false, false, false, false]);
  // A status change does not change the stage key (no re-bake); a construction stage change does.
  const w2 = worldAtStage('foundation'), k1 = structureKey(w2); w2.ops.agents.claude = { id: 'claude', activity: 'blocked' };
  assert.equal(structureKey(w2), k1);
  assert.notEqual(structureKey(worldAtStage('structure')), k1);
});

test('V2: existing capability naming comes from world.capabilities', () => {
  const w = createWorld({ seed: 'hillink' });
  for (const s of Object.values(w.spaces).filter(q => q.capabilities?.length)) {
    assert.equal(roomNameOf(w, s.id), s.capabilities.map(id => capabilityName(w.capabilities[id].spec)).join(' & '));
  }
  const eng = w.capabilities.engineering.placement.spaceId;
  assert.equal(roomNameOf(w, eng), 'Build Workshop');
  // The name follows the canonical record, not the room or the theme.
  const copy = structuredClone(w); copy.capabilities.engineering.spec = { ...copy.capabilities.engineering.spec, kind: 'review' };
  assert.equal(roomNameOf(copy, eng), 'Engineering & Testing');
  const site = worldAtStage('systems');
  assert.equal(siteLabelOf(site, 'drone-lab'), `${capabilityName(site.capabilities['drone-lab'].spec)}: ${STAGE_LABEL.systems}`);
  assert.equal(siteLabelOf(site, 'nope'), null);
});

test('V2: an unknown trait-only capability and an unknown agent render through generalized fallbacks', () => {
  const g = genericWorld(), spec = g.world.capabilities[GENERIC_CAPABILITY.id].spec, before = JSON.stringify(g.world);
  assert.equal(spec.known, false, 'unknown kind');
  assert.equal(roomNameOf(g.world, g.spaceId), 'Signal Garden', 'named from world.capabilities');
  const S = Object.fromEntries(THEMES.map(th => [th, compose(g.world, th)]));
  assert.deepEqual(semanticOf(S.real), semanticOf(S.fantasy));
  const L = createGeneratedLayout(g.world, { theme: 'real' }), F = L.furnishing[g.spaceId];
  assert.ok(S.real.rooms.some(r => r.id === g.spaceId));
  for (const th of THEMES) {
    assert.ok(S[th].objects.some(o => o.kind === 'prop' && o.room === g.spaceId), `${th}: the room is furnished`);
    for (const it of F.items) if (!['rug', 'mat'].includes(it.type)) assert.ok(Array.isArray(recipeOrFallback(th, it.type, F.kind, it)));
    // Kinds, furniture and decor the kit has never seen still get floors, recipes and panels.
    assert.ok(floorFor(th, 'never-seen-like') && floorFor(th, F.kind) && floorFor(th, 'comms-like') === floorFor(th, 'comms'));
    assert.ok(recipeOrFallback(th, 'holoLoom', 'never-seen', { h: 1.2 }).length > 0);
    assert.ok(decorFor(th, 'starMap').length > 0);
  }
  assert.notDeepEqual(recipeOrFallback('real', 'holoLoom', 'x'), recipeOrFallback('fantasy', 'holoLoom', 'x'), 'the fallback is translated per theme');
  assert.deepEqual(recipeOrFallback('fantasy', 'coffee', 'lounge'), [], 'a deliberately empty piece stays empty in every theme');
  // The same capability requested through HQ is drawn as a construction site at its canonical stage.
  for (const stage of ['planning', 'structure', 'furnishing']) {
    const w = worldAtStage(stage, { program: GENERIC_PROGRAM });
    for (const th of THEMES) { const s = compose(w, th).sites.find(q => q.project === GENERIC_CAPABILITY.id); assert.ok(s && s.stage === stage && s.pieces.length > 0, `${stage}/${th}`); }
    assert.match(siteLabelOf(w, GENERIC_CAPABILITY.id), /^Signal Garden: /);
  }
  // The unknown agent: a generalized, deterministic, theme-translated look; placed and animated by the same rules.
  const look = th => lookFor(UNKNOWN_AGENT.id, th, UNKNOWN_AGENT.def);
  for (const th of THEMES) {
    const l = look(th);
    assert.equal(l.fallback, true); assert.notEqual(l, TEST_LOOK); assert.ok(!l.test);
    assert.deepEqual(look(th), l, 'deterministic');
    for (const c of Object.keys(CLIPS)) { const b = buildSprite(l, 'fl', c, 0).buf.bounds(); assert.ok(b && b.h >= 18 && b.h <= 36, `${th}/${c}`); }
    const other = lookFor('agent-v2-unknown-732', th, null);
    assert.notDeepEqual(other.palette, l.palette, 'unknown agents do not all look alike');
  }
  assert.notDeepEqual(look('real').parts, look('fantasy').parts, 'garments translate per theme');
  assert.equal(look('real').work, 'scan', 'a researcher inspects');
  assert.equal(lookFor('x-builder', 'real', { role: 'Builder' }).work, 'hammer');
  // Hostile appearance data is dropped: only part names and colour literals survive.
  const hostile = lookFor('x-hostile', 'real', { name: 'H', appearance: { themes: { real: { figure: { shirt: 'javascript:alert(1)', hat: '<script>', hair: '#123456' } } } } });
  assert.equal(hostile.palette.hair, '#123456');
  assert.ok(Object.values(hostile.palette).every(c => /^#[0-9a-f]{6}$/i.test(c)));
  const actors = ruleActors(L, 'real', [...T0_TEAM, UNKNOWN_AGENT]);
  const u = actors.find(a => a.id === UNKNOWN_AGENT.id);
  assert.ok(u && L.locationById[u.location] && u.status === 'working' && u.look.fallback);
  assert.ok(Object.keys(ALIASES).every(k => !k.startsWith(UNKNOWN_AGENT.id)));
  // No three-agent dependency: a team of one unknown agent, or five, is placed and drawn by the same rules.
  for (const team of [[UNKNOWN_AGENT], [...T0_TEAM, UNKNOWN_AGENT, { id: 'agent-v2-unknown-732', activity: 'idle' }]]) assert.equal(ruleActors(L, 'fantasy', team).length, team.length);
  assert.equal(JSON.stringify(g.world), before);
});

test('V2: the harness records evidence for themes, procgen, construction, agent state and generic content', () => {
  const ev = v2Evidence({ stages: ['site-preparation', 'exterior'], gates: ['blocked'] });
  assert.equal(ev.themes.identical, true);
  assert.notEqual(ev.themes.materials.real, ev.themes.materials.fantasy);
  assert.ok(ev.themes.agents.length >= 4);
  assert.equal(ev.procgen.identical, true); assert.ok(ev.procgen.roomsAdded.real.length > 0);
  assert.deepEqual(Object.keys(ev.construction.stages), ['site-preparation', 'exterior']);
  for (const s of Object.values(ev.construction.stages)) { assert.equal(s.identical, true); assert.ok(s.pieces.length > 0); assert.notEqual(s.hash.real, s.hash.fantasy); }
  assert.notDeepEqual(ev.construction.stages['site-preparation'].pieces, ev.construction.stages.exterior.pieces);
  assert.equal(ev.construction.gates.blocked.gate, 'blocked');
  for (const [key, a] of Object.entries(ev.agents)) {
    assert.deepEqual(Object.keys(a.statuses), STATUSES, key);
    assert.equal(new Set(Object.values(a.statuses).map(s => s.sprite)).size, STATUSES.length, key);
    assert.deepEqual(Object.entries(a.statuses).filter(([, s]) => s.screens).map(([k]) => k), ['working']);
  }
  assert.equal(ev.agents[`${UNKNOWN_AGENT.id}:real`].fallback, true);
  assert.equal(ev.agents['claude:real'].fallback, false);
  assert.equal(ev.generic.known, false); assert.equal(ev.generic.name, ev.generic.canonicalName); assert.equal(ev.generic.identical, true);
  assert.ok(ev.generic.props.real > 0 && ev.generic.props.real === ev.generic.props.fantasy);
  assert.equal(ev.generic.unknownAgent.fallback, true);
});

test('V2 fix: an explicit resolved controller state (idle included) wins over the productive activity fallback', () => {
  // Fallback only when no resolved state or intent is present.
  for (const none of [{}, { state: null }, { state: '', intent: null }]) assert.equal(agentStatusOf({ activity: 'coding', ...none }), 'working');
  assert.equal(agentStatusOf({ activity: 'communicating' }), 'talking');
  // A resolved idle state or intent is authoritative.
  assert.equal(agentStatusOf({ activity: 'coding', state: 'idle' }), 'idle');
  assert.equal(agentStatusOf({ activity: 'reviewing', intent: 'idle' }), 'idle');
  assert.equal(agentStatusOf({ activity: 'communicating', state: 'idle' }), 'idle');
  assert.equal(agentStatusOf({ activity: 'idle', intent: 'review' }), 'working');
  assert.equal(agentStatusOf({ activity: 'coding', state: 'idle', intent: 'type' }), 'idle', 'the state outranks the intent');
  // Canonical blocked / waiting facts and movement still outrank everything.
  assert.equal(agentStatusOf({ activity: 'blocked', state: 'type' }), 'blocked');
  assert.equal(agentStatusOf({ activity: 'waiting-for-kyle', state: 'idle' }), 'waiting');
  assert.equal(agentStatusOf({ activity: 'coding', state: 'idle', moving: true }), 'walking');
  // Through the skin path: a coding agent the controller resolved as idle plays no work clip; without a state it works.
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w, { theme: 'real' }), H = L.home;
  const ent = (id, anim) => ({ kind: 'agent', id, x: H.x + H.w / 2, y: H.y + H.h / 2, agent: { id: 'claude', activity: 'coding' }, anim, moving: false });
  const acts = actorsOf([ent('a', { state: 'idle' }), ent('b', {}), ent('c', undefined), ent('d', { intent: 'idle' })], L, 'real', { A: 1 });
  assert.deepEqual(acts.map(a => a.status), ['idle', 'working', 'working', 'idle']);
  assert.deepEqual(acts.map(a => isWorkClip(a.clip)), [false, true, true, false]);
});

test('V2 fix: the canonical animation intents (engine/animation.mjs) map to the right status and clip', () => {
  // Every canonical intent is mapped (the real vocabulary, not body-state aliases).
  for (const intent of INTENTS) assert.ok(Object.hasOwn(INTENT_STATUS, intent), intent);
  const expected = { working: 'working', building: 'working', reviewing: 'working', testing: 'working', investigating: 'working', walking: 'walking' };
  // As the controller sends them: no state, or the body clip it resolved (a beat such as 'sit' or 'stand' keeps the
  // intent it leads to), with an idle HQ activity so the activity fallback cannot hide the mapping.
  for (const [intent, status] of Object.entries(expected)) {
    for (const state of [null, undefined, '', 'sit', 'stand']) assert.equal(agentStatusOf({ activity: 'idle', intent, state }), status, `${intent}/${state}`);
    assert.equal(agentStatusOf({ activity: 'coding', intent }), status, `${intent} with a productive activity`);
  }
  assert.equal(agentStatusOf({ activity: 'idle', intent: 'meeting' }), 'talking');
  for (const intent of ['onBreak', 'completed', 'recovering']) assert.equal(agentStatusOf({ activity: 'coding', intent }), 'idle', intent);
  // An explicit resolved idle still wins (state or intent); movement, blocked and waiting still override any intent.
  for (const intent of Object.keys(expected)) {
    assert.equal(agentStatusOf({ activity: 'coding', state: 'idle', intent }), 'idle', `idle state over ${intent}`);
    assert.equal(agentStatusOf({ activity: 'coding', intent, moving: true }), 'walking', `moving over ${intent}`);
    assert.equal(agentStatusOf({ activity: 'blocked', intent }), 'blocked', `blocked over ${intent}`);
    assert.equal(agentStatusOf({ activity: 'waiting-for-kyle', intent }), 'waiting', `waiting over ${intent}`);
  }
  assert.equal(agentStatusOf({ activity: 'coding', intent: 'idle' }), 'idle');
  assert.equal(agentStatusOf({ activity: 'coding', intent: 'blocked' }), 'blocked');
  assert.equal(agentStatusOf({ activity: 'coding', intent: 'attention' }), 'waiting');
  // Through the skin path (actorsOf): the actor's status and clip follow the intent the controller resolved.
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w, { theme: 'real' }), H = L.home;
  const ent = (intent, state, extra = {}) => ({ kind: 'agent', id: `i-${intent}-${state}`, x: H.x + H.w / 2, y: H.y + H.h / 2, agent: { id: 'claude', activity: 'idle' }, anim: { intent, state }, moving: false, ...extra });
  const look = lookFor('claude', 'real');
  const cases = [['working', 'type'], ['building', 'assemble'], ['reviewing', 'inspect'], ['testing', 'survey'], ['investigating', 'read'], ['working', 'sit'], ['walking', 'walk']];
  const acts = actorsOf(cases.map(([i, s]) => ent(i, s)), L, 'real', { A: 1 });
  assert.deepEqual(acts.map(a => a.status), cases.map(([i]) => expected[i]));
  assert.deepEqual(acts.map(a => isWorkClip(a.clip)), cases.map(([i]) => i !== 'walking'));
  assert.equal(acts.at(-1).clip, 'walk', 'walking plays the walk clip');
  assert.equal(acts[0].clip, `work.${look.work}`);
  // Seated work keeps the seated work clip.
  assert.equal(actorsOf([ent('working', 'sit', { posture: 'sit' })], L, 'real', { A: 1 })[0].clip, 'sit.work');
  // Explicit idle, movement, blocked and waiting through the skin path.
  const over = actorsOf([ent('working', 'idle'), ent('building', 'assemble', { moving: true }), ent('reviewing', 'inspect', { agent: { id: 'claude', activity: 'blocked' } }), ent('testing', 'survey', { agent: { id: 'claude', activity: 'waiting-for-kyle' } })], L, 'real', { A: 1 });
  assert.deepEqual(over.map(a => a.status), ['idle', 'walking', 'blocked', 'waiting']);
  assert.deepEqual(over.map(a => isWorkClip(a.clip)), [false, false, false, false]);
});

test('V2 fix: site labels resolve for colon-containing construction site and station ids', () => {
  const w = worldAtStage('structure'), L = createGeneratedLayout(w, { theme: 'real' });
  const loc = L.locations.find(l => l.site && l.project?.id === 'drone-lab');
  assert.ok(loc && loc.id.includes(':'), 'site location ids contain a colon');
  const label = siteLabelOf(w, 'drone-lab');
  assert.ok(label);
  // Real station spots (`${location}:${station}`, both colon-containing) and a synthetic one.
  const spots = [...Object.keys(L.stationInfo).filter(k => L.stationInfo[k].room === loc.id), `${loc.id}:${loc.id}:build9`];
  assert.equal(L.locationById[spots[0].split(':')[0]], undefined, 'splitting at the first colon finds nothing (the old bug)');
  for (const spot of spots) {
    assert.equal(locationOfSpot(L, spot), loc, spot);
    assert.equal(spotLabelOf(L, spot), label, spot);
  }
  // A project id that itself contains colons resolves to its own site, not a shorter prefix.
  const fake = { world: w, stationInfo: {}, locationById: { site: { id: 'site', name: 'Wrong' }, 'site:ops': { id: 'site:ops', name: 'Wrong too', site: true, project: { id: 'ops' } }, 'site:ops:lab': { id: 'site:ops:lab', name: 'Ops Lab: Structure', site: true, project: { id: 'ops:lab' } } } };
  assert.equal(locationOfSpot(fake, 'site:ops:lab:site:ops:lab:build1').id, 'site:ops:lab');
  assert.equal(spotLabelOf(fake, 'site:ops:lab:site:ops:lab:build1'), 'Ops Lab: Structure', 'falls back to the location name when the World has no record');
  const w2 = structuredClone(w); w2.projects['ops:lab'] = { ...w2.projects['drone-lab'], id: 'ops:lab' }; w2.capabilities['ops:lab'] = w2.capabilities['drone-lab'];
  assert.equal(siteLabelOf(w2, 'ops:lab'), label);
  assert.equal(spotLabelOf({ ...fake, world: w2 }, 'site:ops:lab:site:ops:lab:build1'), label);
  // Ordinary rooms keep their canonical capability names; unknown spots have no label.
  const roomSpot = Object.keys(L.stationInfo).find(k => L.locationById[L.stationInfo[k].room]?.spaceId && roomNameOf(w, L.locationById[L.stationInfo[k].room].spaceId));
  assert.ok(roomSpot);
  assert.equal(spotLabelOf(L, roomSpot), roomNameOf(w, L.locationById[L.stationInfo[roomSpot].room].spaceId));
  assert.equal(spotLabelOf(L, 'nowhere:at-all'), null);
  assert.equal(spotLabelOf(L, null), null);
});

test('V2 fix: screens are gated per screen: only the working room\'s screens switch on (per-screen pixels, no frame hashes)', () => {
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w, { theme: 'real' }), S = createStage(L, 'real', { lighting: 'night' });
  const all = (S.render(new PixelBuffer(1, 1), { x0: S.region.x0, y0: S.region.y0, w: 1, h: 1 }, 0, []), S.screens);
  const bx0 = Math.min(...all.map(s => s.x)) - 48, by0 = Math.min(...all.map(s => s.y)) - 48;
  const view = { x0: bx0, y0: by0, w: Math.max(...all.map(s => s.x + s.w)) + 48 - bx0, h: Math.max(...all.map(s => s.y + s.h)) + 48 - by0 }, crop = (buf, s) => { const px = []; for (let y = s.y - view.y0; y < s.y - view.y0 + s.h; y++) for (let x = s.x - view.x0; x < s.x - view.x0 + s.w; x++) px.push(x >= 0 && y >= 0 && x < buf.w && y < buf.h ? buf.data[y * buf.w + x] : -1); return px; };
  // Glows are additive light around a screen; they are switched off here so only the screen SURFACE (the frame the
  // stage drew for the screen sprite itself) can change the pixels compared below.
  const frame = actors => { const b = S.render(new PixelBuffer(view.w, view.h), view, 0, actors, { glows: false }); return { buf: b, screens: S.screens }; };
  const base = frame([]);
  assert.ok(base.screens.length > 0 && base.screens.every(s => !s.on), 'screens exist and are off with nobody working');
  assert.ok(base.screens.every(s => s.surface === 'off'), 'every screen is in view and draws its off surface');
  const rooms = [...new Set(base.screens.map(s => s.room))].map(id => S.scene.rooms.find(r => r.id === id)).filter(Boolean);
  assert.ok(rooms.length > 0);
  const look = lookFor('claude', 'real');
  // The probe stands in the room (plan) but is drawn far outside the view, so only the screens can change pixels.
  const probe = (r, status) => ({ id: 'probe', look, lookKey: 'claude:real', foot: [-1e5, -1e5], plan: { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, floor: r.f }, facing: 'fr', clip: clipFor(look, { status }), frame: 0 });
  const near = (a, b, m = 40) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
  const lit = []; // rooms whose own screen surface pixels switched on
  let othersCompared = 0;
  let tried = 0;
  for (const r of rooms) {
    // The stage assigns an agent to the first room containing its plan point; skip a room another one shadows there.
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (S.scene.rooms.find(q => q.f === r.f && cx >= q.x0 && cx <= q.x1 && cz >= q.z0 && cz <= q.z1) !== r) continue;
    tried++;
    const on = frame([probe(r, 'working')]);

    const mine = on.screens.filter(s => s.room === r.id), others = on.screens.filter(s => s.room !== r.id);
    assert.ok(mine.length > 0 && mine.every(s => s.on), `${r.id}: its screens are on`);
    assert.ok(others.every(s => !s.on), `${r.id}: no other room's screen is on`);
    assert.ok(mine.every(s => s.surface === 'on'), `${r.id}: its screens draw the on surface`);
    assert.ok(others.every(s => s.surface === 'off'), `${r.id}: every other room's screen draws the off surface`);
    // Pixels (no glow): the room's own screen surface changes; other rooms' screens stay pixel-identical to the base.
    const switched = mine.some(s => crop(on.buf, s).join() !== crop(base.buf, s).join());
    const compared = others.filter(o => !mine.some(m => near(o, m, 0)));
    if (switched) lit.push({ room: r.id, others: new Set(compared.map(s => s.room)).size });
    for (const s of compared) { othersCompared++; assert.deepEqual(crop(on.buf, s), crop(base.buf, s), `${r.id}: screen ${s.id} in ${s.room} is untouched`); }
    for (const status of STATUSES.filter(x => x !== 'working')) {
      const off = frame([probe(r, status)]);
      assert.ok(off.screens.every(s => !s.on), `${r.id}/${status}: every screen off`);
      assert.ok(off.screens.every(s => s.surface === 'off'), `${r.id}/${status}: every screen draws the off surface`);
      for (const s of mine) assert.deepEqual(crop(off.buf, s), crop(base.buf, s), `${r.id}/${status}: screen ${s.id} draws its off state`);
    }
  }
  // Non-vacuous: with glows excluded, the selected (working) room's screen surface pixels visibly switch on, so an
  // always-off surface fails here; and in that same frame another room's screens were compared and stayed off.
  assert.ok(tried > 0 && othersCompared > 0, 'rooms were tried and other rooms\' screens were compared');
  assert.ok(lit.length > 0, 'a working room\'s screen SURFACE pixels switch on (glow excluded)');
  assert.ok(lit.some(x => x.others > 0), `in the same frame, the selected room's screen switches on and another room's screens are checked off (${lit.map(x => x.room).join()})`);
});

test('V2: px stays opt-in', () => {
  const w = createWorld({ seed: 'hillink' });
  let made = 0; const stub = () => { made++; return { id: 'px-stub' }; };
  const plain = loadTheme('real', { world: w, pxSkin: stub });
  assert.notEqual(plain.art, 'px'); assert.equal(made, 0, 'no px skin unless asked for');
  const fant = loadTheme('fantasy', { world: w, pxSkin: stub });
  assert.notEqual(fant.art, 'px'); assert.equal(made, 0);
  const px = loadTheme('fantasy', { world: w, art: 'px', pxSkin: stub });
  assert.equal(px.art, 'px'); assert.equal(made, 1);
  assert.notEqual(loadTheme('blueprint', { world: w, art: 'px', pxSkin: stub }).art, 'px');
});
