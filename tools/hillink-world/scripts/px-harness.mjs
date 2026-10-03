// Pass 5H vertical slice harness: proves the pixel pipeline is a SYSTEM, not a hand-made scene.
// It renders, with the same reusable pieces and placement rules, in both themes:
//   - several planner-generated starting Worlds (different seeds),
//   - a planner-added wing, and a planner-chosen room split (subdivide), on top of T0,
//   - the character alias sheet (the six aliases plus the generic TEST character, reference output only).
// Agents are placed by the canonical behaviour rules (core/behavior.mjs placeAgents), never by hand.
// Output: PNGs and manifest.json in the given directory (default ./px-harness-out). Deterministic: the manifest lists a
// pixel hash per image; running twice gives the same hashes.
//
// V2 integration evidence (--v2): the same canonical World in both themes (identical semantic geometry), a real
// placeCapability change, a real construction project driven through the HQ contract (procgen/contract.mjs
// applyHqEvent) stage by stage (with its gates), every canonical agent status, and generic content (a trait-only
// capability of an unknown kind and an agent with no authored look). Nothing here is a second World or simulation:
// every World comes from createWorld / placeCapability / applyHqEvent, and the renderer only reads it.
//
//   node scripts/px-harness.mjs [outDir] [--frames] [--v2]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorld, placeCapability } from '../procgen/world.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { STAGES } from '../procgen/construction.mjs';
import { capabilityName } from '../procgen/capabilities.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { placeAgents, stationPoint, ACTIVITY_PLACE } from '../core/behavior.mjs';
import { createStage } from '../render/px/stage.mjs';
import { composeScene } from '../render/px/compose.mjs';
import { lookFor, facingOf, clipFor, agentStatusOf, isWorkClip, ALIASES, TEST_LOOK, buildSprite, FACINGS, CLIPS, STATUSES } from '../render/px/character.mjs';
import { PixelBuffer, hex } from '../render/px/buffer.mjs';
import { encodePNG } from '../render/px/png.mjs';
import { LIGHTING_IDS } from '../render/px/palette.mjs';
import { roomNameOf, siteLabelOf } from '../render/px/skin.mjs';
import { fingerprint } from '../procgen/rng.mjs';

export const THEMES = ['real', 'fantasy'];
// The founding team of the default scenarios. Nothing depends on it: every function takes any team.
export const T0_TEAM = [{ id: 'chatgpt', activity: 'coordinating' }, { id: 'claude', activity: 'coding' }, { id: 'codex', activity: 'reviewing' }];

// The scenarios: every World here comes from the planner (createWorld / placeCapability); nothing is positioned by hand.
export const SCENARIOS = {
  't0-hillink': () => createWorld({ seed: 'hillink' }),
  't0-alpha': () => createWorld({ seed: 'alpha' }),
  't0-bravo': () => createWorld({ seed: 'bravo' }),
  't0-charlie': () => createWorld({ seed: 'charlie' }),
  // A new wing: the planner's cheapest option for a 30 m² inspection lab on T0 is add-wing.
  'growth-wing': () => { const w = createWorld({ seed: 'hillink' }); const r = placeCapability(w, { id: 'drone-lab', area: 30, traits: ['inspection'] }, { status: 'built' }); return Object.assign(w, { harnessNote: r.plan.chosen }); },
  // A room split: after the wing, an archive moves into the spare wing room, then a small vault is planned and the
  // planner's cheapest option is to subdivide that room.
  'growth-split': () => {
    const w = createWorld({ seed: 'hillink' });
    placeCapability(w, { id: 'drone-lab', area: 30, traits: ['inspection'] }, { status: 'built' });
    placeCapability(w, { id: 'archive', kind: 'archive', area: 8, access: 'staff' }, { status: 'built' });
    const r = placeCapability(w, { id: 'vault', area: 6, access: 'staff', traits: ['records'] }, { status: 'built' });
    return Object.assign(w, { harnessNote: r.plan.chosen });
  },
};

// Actors for a layout from the canonical placement rules (station position, pose and facing come from the layout).
// A team member is { id, activity, status?, moving?, def?, frame? }: its place comes from its activity (placeAgents),
// its look from its id and definition (authored alias, else the generalized fallback), its clip from its canonical
// status (agentStatusOf; `status` may name one directly). Works for any number of agents and any ids.
export function ruleActors(layout, theme, team = T0_TEAM) {
  // An HQ activity the behaviour rules have no place for (waiting-for-kyle, blocked, anything new) is placed as
  // waiting (the queue) or idle (the lounge), so it always lands on a station the layout has. Its status still comes
  // from its own canonical activity (below).
  const placeAs = act => (act === 'waiting-for-kyle' ? 'waiting' : layout.places?.[act] || (ACTIVITY_PLACE[act] && act !== 'idle') ? act : 'idle');
  const places = placeAgents(team.map(a => ({ ...a, activity: placeAs(a.activity) })), {}, layout);
  return team.map(a => {
    const p = places[a.id], loc = layout.locationById[p.location], sid = p.station.split('#')[0], st = layout.stationInfo[`${loc.id}:${sid}`];
    const pt = stationPoint(p, layout) ?? loc.stations[sid], look = lookFor(a.id, theme, a.def ?? null);
    // The placement clip is a resolved state only when it is this agent's own (an 'idle' clip that placement substituted
    // for a non-idle activity, e.g. a stay rule or an unplaced activity, is not); null: unresolved, the activity decides.
    const own = p.clip && !(p.clip === 'idle' && a.activity !== 'idle') ? p.clip : null;
    const state = own ?? (a.activity === 'coding' ? 'type' : a.activity === 'reviewing' ? 'review' : null);
    const status = STATUSES.includes(a.status) ? a.status : agentStatusOf({ activity: a.activity, moving: !!a.moving, state });
    const sitting = st?.pose === 'sit' && status !== 'walking';
    const clip = clipFor(look, { state, moving: status === 'walking', posture: sitting ? 'sit' : null, status });
    return { id: a.id, status, look, lookKey: `${a.id}:${theme}`, point: pt, plan: { x: st?.x ?? 0, z: st?.z ?? 0, floor: st?.floor ?? loc.floor ?? 0 }, facing: facingOf(null, st?.facing ?? 'front'), clip, frame: (a.frame ?? 0) % (CLIPS[clip]?.frames.length ?? 1), sitting, location: p.location, station: p.station };
  });
}

// Renders a scenario in a theme: the building's surroundings at 1 art px per pixel.
export function renderScenario(world, theme, { lighting = 'dusk', t = 0, pad = 60, selected = null, team = T0_TEAM } = {}) {
  const layout = createGeneratedLayout(world, { theme }), stage = createStage(layout, theme, { lighting }), A = stage.A;
  const H = layout.home, x0 = Math.floor(H.x / A) - pad, y0 = Math.floor(H.y / A) - pad, w = Math.ceil(H.w / A) + pad * 2, h = Math.ceil(H.h / A) + pad * 2;
  const actors = ruleActors(layout, theme, team).map(a => ({ ...a, foot: [a.point[0] / A, a.point[1] / A], selected: a.id === selected }));
  const out = new PixelBuffer(w, h);
  stage.render(out, { x0, y0, w, h }, t, actors);
  return { out, layout, stage, actors };
}

// The alias sheet: rows = looks (six aliases + TEST), columns = facing x {idle, walk 0, walk 2, work 0, work 2, sit}.
export function aliasSheet() {
  const looks = [...Object.entries(ALIASES), ['test', TEST_LOOK]], clips = [['idle', 0], ['walk', 0], ['walk', 2], ['work', 0], ['work', 2], ['sit.work', 0]];
  const cw = 28, ch = 38, out = new PixelBuffer(cw * clips.length * FACINGS.length + 8, ch * looks.length + 8).clear(hex('#55684f'));
  looks.forEach(([, l], i) => FACINGS.forEach((f, j) => clips.forEach(([c, fr], k) => {
    const clip = c === 'work' ? `work.${l.work}` : c, s = buildSprite(l, f, clip, fr % CLIPS[clip].frames.length);
    out.blit(s.buf, 4 + (j * clips.length + k) * cw + Math.floor((cw - s.buf.w) / 2), 4 + i * ch + (ch - s.buf.h));
  })));
  return { out, rows: looks.map(([k]) => k), columns: FACINGS.flatMap(f => clips.map(([c, fr]) => `${f}:${c}${fr ? `#${fr}` : ''}`)) };
}

// ---- V2 integration ----------------------------------------------------------------------------------------------
// An HQ event as HQ would deliver it (contract v1), with its journal sequence (construction orders facts by it).
export const hqEvent = (n, type, fields = {}) => ({ v: 1, source: 'hq', id: `px-v2-${n}-${type}`, seq: n, at: 1_700_000_000_000 + n * 1000, type, ...fields });
// The construction program the evidence drives: a lab with a known trait, and a capability of an unknown kind that
// has only traits (the generic case).
export const CONSTRUCTION_PROGRAM = { capability: { id: 'drone-lab', area: 30, traits: ['inspection'] }, taskId: 'task-drone-lab', objectiveId: 'obj-drone-lab' };
export const GENERIC_CAPABILITY = { id: 'signal-garden', area: 14, traits: ['listening', 'quiet'] };
export const GENERIC_PROGRAM = { capability: GENERIC_CAPABILITY, taskId: 'task-signal-garden', objectiveId: 'obj-signal-garden' };
// An agent nobody authored a look for (no alias, no appearance): it must render through the generalized fallback.
export const UNKNOWN_AGENT = { id: 'agent-v2-unknown-731', activity: 'coding', def: { id: 'agent-v2-unknown-731', name: 'Wren', role: 'Field researcher' } };

// A World whose project is at `stage`, reached only through real HQ events applied by the canonical contract. gate:
// null | 'blocked' | 'waiting' (a canonical gate fact applied after the stage is reached).
export function worldAtStage(stage, { seed = 'hillink', gate = null, program = CONSTRUCTION_PROGRAM } = {}) {
  const target = STAGES.indexOf(stage);
  if (target < 0 || target > STAGES.indexOf('inspection')) throw Error(`the harness drives projects from planning to inspection, not ${stage}`);
  const w = createWorld({ seed }), { capability, taskId, objectiveId } = program;
  let n = 0;
  const apply = (type, fields) => { const r = applyHqEvent(w, hqEvent(++n, type, fields)); if (!r.applied) throw Error(`${type} refused: ${r.reason}`); };
  apply('CAPABILITY_REQUESTED', { capability, taskId, objectiveId });
  if (target >= 1) apply('CONSTRUCTION_REQUESTED', { capabilityId: capability.id });
  for (let k = 2; k <= Math.min(target, STAGES.indexOf('furnishing')); k++) apply('WORK_COMMITTED', { taskId, agentId: 'claude', ref: `evidence ${k - 1}` });
  if (target >= STAGES.indexOf('inspection')) apply('INSPECTION_STARTED', { objectiveId });
  if (gate === 'blocked') apply('BLOCKED', { taskId, objectiveId, reason: 'harness: implementation blocked in HQ' });
  if (gate === 'waiting') apply('WAITING_FOR_KYLE', { taskId, objectiveId, reason: 'harness: approval required' });
  if (w.projects[capability.id]?.stage !== stage) throw Error(`expected ${capability.id} at ${stage}, got ${w.projects[capability.id]?.stage}`);
  return w;
}
// The generic-content World: T0 plus a built capability of an unknown kind that has only traits.
export function genericWorld(seed = 'hillink') {
  const w = createWorld({ seed }), r = placeCapability(w, GENERIC_CAPABILITY, { status: 'built' });
  return { world: w, plan: r.plan.chosen, spaceId: w.capabilities[GENERIC_CAPABILITY.id].placement.spaceId };
}

// The semantic content of a composed scene (what must be identical across themes): walls, one prop per canonical
// furnishing item, construction pieces with their geometry, finished rooms, sites and their stages.
export function semanticOf(scene) {
  const r2 = v => Math.round(v * 100) / 100;
  return {
    // A wall piece by its line and run (its header height is the theme's door-arch springing, not geometry).
    walls: scene.objects.filter(o => o.id.startsWith('wall:')).map(o => [o.id.split(':').slice(0, 5).join(':'), o.x0, o.x1, o.z0, o.z1].map(v => (typeof v === 'number' ? r2(v) : v)).join()).sort(),
    props: [...new Set(scene.objects.filter(o => o.kind === 'prop' && o.room).map(o => `${o.id.replace(/:back$/, '')}@${o.room}`))].sort(),
    site: scene.objects.filter(o => o.kind === 'site').map(o => [o.id, o.x0, o.x1, o.z0, o.z1].map(v => (typeof v === 'number' ? r2(v) : v)).join()).sort(),
    rooms: scene.rooms.map(r => r.id).sort(),
    sites: scene.sites.map(s => `${s.project}@${s.space}:${s.stage}${s.gate ? `!${s.gate}` : ''}:${s.pieces.length}`).sort(),
  };
}
// A pixel fingerprint of a scene's construction pieces (their first frames), for stage and theme comparisons.
export const siteHash = scene => fingerprint(scene.objects.filter(o => o.kind === 'site' || o.id.startsWith('site:')).sort((a, b) => (a.id < b.id ? -1 : 1)).map(o => `${o.id}|${o.ox},${o.oy}|${o.frames[0].hash()}`));
const composeBoth = world => Object.fromEntries(THEMES.map(th => [th, composeScene(createGeneratedLayout(world, { theme: th }), th, { skipGround: true })]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The V2 evidence records (no files): every section compares both themes over ONE canonical World.
export function v2Evidence({ stages = STAGES.slice(0, STAGES.indexOf('inspection') + 1), gates = ['blocked', 'waiting'], team = [...T0_TEAM, UNKNOWN_AGENT] } = {}) {
  const ev = { themes: null, procgen: null, construction: { stages: {}, gates: {} }, agents: {}, generic: null };
  // Same state, two themes: identical semantics (and identical rule placement of every agent), different materials.
  { const w = worldAtStage('exterior'), S = composeBoth(w), sem = Object.fromEntries(THEMES.map(th => [th, semanticOf(S[th])]));
    const places = Object.fromEntries(THEMES.map(th => [th, ruleActors(createGeneratedLayout(w, { theme: th }), th, team).map(a => `${a.id}@${a.location}:${a.station}:${a.status}:${a.point.map(Math.round)}`)]));
    ev.themes = { world: 'hillink + drone-lab at exterior', identical: same(sem.real, sem.fantasy) && same(places.real, places.fantasy), semantic: fingerprint(sem.real), agents: places.real, materials: Object.fromEntries(THEMES.map(th => [th, siteHash(S[th])])) }; }
  // A real planner change: placeCapability on T0, before and after, in both themes.
  { const w = createWorld({ seed: 'hillink' }), before = composeBoth(w), r = placeCapability(w, { id: 'drone-lab', area: 30, traits: ['inspection'] }, { status: 'built' }), after = composeBoth(w);
    const added = th => semanticOf(after[th]).rooms.filter(id => !semanticOf(before[th]).rooms.includes(id));
    const newProps = th => semanticOf(after[th]).props.filter(id => !semanticOf(before[th]).props.includes(id));
    ev.procgen = { option: r.plan.chosen.option, roomsAdded: { real: added('real'), fantasy: added('fantasy') }, propsAdded: { real: newProps('real').length, fantasy: newProps('fantasy').length }, identical: same(added('real'), added('fantasy')) && same(newProps('real'), newProps('fantasy')) }; }
  // Construction: one canonical project, stage by stage, then its gates.
  for (const stage of stages) {
    const w = worldAtStage(stage), S = composeBoth(w);
    ev.construction.stages[stage] = { label: siteLabelOf(w, CONSTRUCTION_PROGRAM.capability.id), pieces: S.real.sites.flatMap(s => s.pieces).sort(), identical: same(semanticOf(S.real), semanticOf(S.fantasy)), hash: Object.fromEntries(THEMES.map(th => [th, siteHash(S[th])])) };
  }
  for (const gate of gates) {
    const w = worldAtStage('structure', { gate }), S = composeBoth(w);
    ev.construction.gates[gate] = { label: siteLabelOf(w, CONSTRUCTION_PROGRAM.capability.id), gate: S.real.sites[0]?.gate ?? null, pieces: S.real.sites.flatMap(s => s.pieces).filter(k => k.startsWith('gate:')) };
  }
  // Agent statuses: each canonical status's clip, the sprite it draws, and whether it may light screens.
  for (const th of THEMES) for (const a of team) {
    const look = lookFor(a.id, th, a.def ?? null);
    ev.agents[`${a.id}:${th}`] = { fallback: !!look.fallback, statuses: Object.fromEntries(STATUSES.map(s => { const clip = clipFor(look, { status: s }); return [s, { clip, screens: isWorkClip(clip), sprite: buildSprite(look, 'fr', clip, 0).buf.hash() }]; })) };
  }
  // Generic content: a trait-only capability of an unknown kind, built, and the unknown agent working in the World.
  { const g = genericWorld(), S = composeBoth(g.world), spec = g.world.capabilities[GENERIC_CAPABILITY.id].spec;
    const props = th => S[th].objects.filter(o => o.kind === 'prop' && o.room === g.spaceId).map(o => o.id.replace(/:back$/, ''));
    const L = createGeneratedLayout(g.world, { theme: 'real' });
    ev.generic = { capability: GENERIC_CAPABILITY.id, kind: spec.kind, known: spec.known, name: roomNameOf(g.world, g.spaceId), canonicalName: capabilityName(spec), option: g.plan.option, roomKind: L.furnishing[g.spaceId]?.kind ?? null, props: { real: [...new Set(props('real'))].length, fantasy: [...new Set(props('fantasy'))].length }, identical: same(semanticOf(S.real), semanticOf(S.fantasy)), unknownAgent: ruleActors(L, 'real', [UNKNOWN_AGENT]).map(a => ({ id: a.id, fallback: !!a.look.fallback, location: a.location, clip: a.clip }))[0] }; }
  return ev;
}

async function main() {
  const args = process.argv.slice(2), dir = args[0] && !args[0].startsWith('--') ? args[0] : 'px-harness-out', frames = args.includes('--frames'), v2 = args.includes('--v2');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { scenarios: {}, sheet: null };
  for (const [id, make] of Object.entries(SCENARIOS)) for (const theme of THEMES) {
    const world = make(), { out, layout, stage, actors } = renderScenario(world, theme, { selected: 'claude' });
    const file = `${id}-${theme}.png`; fs.writeFileSync(path.join(dir, file), encodePNG(out, 2));
    const kinds = {}; for (const o of stage.scene.objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
    manifest.scenarios[`${id}/${theme}`] = { file, hash: out.hash(), rooms: layout.locations.filter(l => l.spaceId && !l.exterior).length, storeys: layout.levels.length, objects: kinds, emitters: stage.scene.emitters.length, agents: actors.map(a => `${a.id}@${a.location}:${a.station}`), planner: world.harnessNote ?? null };
    if (frames && id === 't0-hillink') for (const L of LIGHTING_IDS) { const r = renderScenario(make(), theme, { lighting: L }); fs.writeFileSync(path.join(dir, `${id}-${theme}-${L}.png`), encodePNG(r.out, 2)); }
  }
  const sheet = aliasSheet(); fs.writeFileSync(path.join(dir, 'alias-sheet.png'), encodePNG(sheet.out, 4));
  manifest.sheet = { file: 'alias-sheet.png', hash: sheet.out.hash(), rows: sheet.rows, columns: sheet.columns };
  if (v2) {
    manifest.v2 = v2Evidence();
    // Images: every construction stage and gate in both themes (full render, agents by rule), and the status sheet.
    const shot = (name, world, theme, team) => { const r = renderScenario(world, theme, { lighting: 'dusk', team }); fs.writeFileSync(path.join(dir, name), encodePNG(r.out, 2)); return { file: name, hash: r.out.hash(), live: r.stage.liveRooms }; };
    manifest.v2.images = {};
    for (const stage of Object.keys(manifest.v2.construction.stages)) for (const th of THEMES) manifest.v2.images[`construction/${stage}/${th}`] = shot(`v2-construction-${stage}-${th}.png`, worldAtStage(stage), th, [{ id: 'claude', activity: 'coding', taskId: CONSTRUCTION_PROGRAM.taskId }, { id: 'codex', activity: 'reviewing' }, { id: 'chatgpt', activity: 'coordinating' }]);
    for (const gate of Object.keys(manifest.v2.construction.gates)) for (const th of THEMES) manifest.v2.images[`gate/${gate}/${th}`] = shot(`v2-gate-${gate}-${th}.png`, worldAtStage('structure', { gate }), th, T0_TEAM);
    for (const th of THEMES) manifest.v2.images[`generic/${th}`] = shot(`v2-generic-${th}.png`, genericWorld().world, th, [...T0_TEAM, UNKNOWN_AGENT]);
    for (const s of STATUSES) for (const th of THEMES) manifest.v2.images[`status/${s}/${th}`] = shot(`v2-status-${s}-${th}.png`, createWorld({ seed: 'hillink' }), th, T0_TEAM.map(a => ({ ...a, status: s })));
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.scenarios).map(([k, v]) => [k, `${v.rooms} rooms, ${v.storeys} storey(s), ${v.hash}`])), null, 1));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
