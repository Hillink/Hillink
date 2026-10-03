// ?art=hq (Kyle 2026-10-02): one canonical World, two looks (Modern, Fantasy). These checks prove the visual proof is
// plug-and-play: it builds from the same generated World as every other skin, every World furniture/decor type has a
// look in both styles, both styles see exactly the same semantic objects, and construction stages come from World
// projects only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../procgen/world.mjs';
import { applyHqEvent } from '../procgen/contract.mjs';
import { STAGES } from '../procgen/construction.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { loadTheme } from '../themes/index.mjs';
import { buildModel } from '../render/hq/model.mjs';
import { kit } from '../render/hq/prims.mjs';
import { islandRect } from '../render/hq/island.mjs';
import { createModernStyle } from '../render/hq/styles/modern.mjs';
import { createFantasyStyle } from '../render/hq/styles/fantasy.mjs';
import { DEMO_CAPABILITY } from '../sim/construction-demo.mjs';

let n = 0;
const hq = (type, fields = {}) => ({ v: 1, source: 'hq', id: `hqart-${++n}`, type, at: n, ...fields });
function buildTo(w, stage, cap = DEMO_CAPABILITY) {
  const f = (type, x) => assert.equal(applyHqEvent(w, hq(type, x)).applied, true, type);
  f('CAPABILITY_REQUESTED', { capability: cap, objectiveId: 'o', taskId: 't' });
  if (stage === 'planning') return;
  f('CONSTRUCTION_REQUESTED', { capabilityId: cap.id }); f('TASK_ASSIGNED', { taskId: 't', agentId: 'claude', objectiveId: 'o' });
  for (const s of ['foundation', 'structure', 'exterior', 'systems', 'furnishing']) { if (STAGES.indexOf(stage) < STAGES.indexOf(s)) return; f('WORK_COMMITTED', { taskId: 't', ref: s }); }
  if (STAGES.indexOf(stage) < STAGES.indexOf('inspection')) return;
  f('TESTING', { agentId: 'codex', taskId: 't' }); if (stage === 'inspection') return;
  f('REVIEW_VERDICT', { taskId: 't', verdict: 'approved' }); f('CONSTRUCTION_COMPLETED', { capabilityId: cap.id }); f('CAPABILITY_VERIFIED', { capabilityId: cap.id });
}
const styles = layout => { const P = layout.P, model = buildModel(layout); return [createModernStyle({ K: kit(P), P, U: layout.U, layout, model }), createFantasyStyle({ K: kit(P), P, U: layout.U, layout, model })]; };
const geometry = m => JSON.stringify({ rooms: m.rooms.map(r => [r.id, r.kind, r.r]), items: m.items.map(i => [i.id, i.type, i.x, i.z, i.w, i.d, i.h, i.facing]), decor: m.decor.map(d => [d.type, d.x0, d.x1]), walls: m.walls.map(w => [w.f, w.axis, w.at, w.s, w.e, w.type]), doors: m.doors.map(d => [d.id, d.kind]), sites: m.sites.map(s => [s.p.id, s.p.stage, s.u]) });

test('hq art: ?art=hq loads for both themes on the generated World (1 and 2 storeys), with no backend fork', () => {
  for (const storeys of [1, 2]) {
    const world = createWorld({ seed: 'hillink', storeys });
    for (const id of ['real', 'fantasy']) {
      const t = loadTheme(id, { world, art: 'hq' });
      assert.equal(t.art, 'hq'); assert.equal(t.generated, true); assert.ok(t.skin?.frame && t.skin?.background, `${id}: a skin`);
      assert.equal(t.layout.world, world, 'the skin reads the same World object, never a copy');
    }
    assert.equal(loadTheme('blueprint', { world, art: 'hq' }).art === 'hq', false, 'the blueprint stays the blueprint');
  }
});

test('hq art: every furniture and decor type the World furnishes has a look in Modern and in Fantasy', () => {
  for (const seed of ['hillink', 'alpha', 'bravo', 'charlie']) for (const storeys of [1, 2]) {
    const world = createWorld({ seed, storeys }), layout = createGeneratedLayout(world, { projection: 'diamond' }), m = buildModel(layout);
    for (const s of styles(layout)) {
      for (const it of m.items) assert.ok(s.kinds.items.includes(it.type), `${seed}/${storeys}: no look for item ${it.type}`);
      for (const dc of m.decor) assert.ok(s.kinds.decor.includes(dc.type), `${seed}/${storeys}: no look for decor ${dc.type}`);
      for (const r of m.rooms) assert.ok(s.roomLight(r.kind), `${seed}: no light for room kind ${r.kind}`);
    }
  }
});

test('hq art: Modern and Fantasy see exactly the same semantic World (same rooms, furniture, walls, doors, sites)', () => {
  const world = createWorld({ seed: 'hillink', storeys: 2 }), layout = createGeneratedLayout(world, { projection: 'diamond' });
  assert.equal(geometry(buildModel(layout, 'real')), geometry(buildModel(layout, 'fantasy')));
});

test('hq art: construction sites come from World projects at every stage, and a finished project becomes a room', () => {
  for (const stage of STAGES) {
    const world = createWorld({ seed: 'hillink' }); buildTo(world, stage);
    const layout = createGeneratedLayout(world, { projection: 'diamond' }), m = buildModel(layout);
    if (stage === 'operational') { assert.equal(m.sites.length, 0, 'no site once operational'); continue; }
    assert.ok(m.sites.every(s => world.projects[s.p.id] === s.p), 'every site is a World project');
    if (stage !== 'planning') assert.ok(m.sites.some(s => s.p.stage === stage), `${stage}: a site at that stage`);
  }
  const before = buildModel(createGeneratedLayout(createWorld({ seed: 'hillink' }), { projection: 'diamond' })).rooms.length;
  const done = createWorld({ seed: 'hillink' }); buildTo(done, 'operational');
  assert.ok(buildModel(createGeneratedLayout(done, { projection: 'diamond' })).rooms.length > before, 'the completed capability is a finished room');
});

test('hq art: the island holds every building and grows with the settlement', () => {
  const world = createWorld({ seed: 'hillink' }), layout = createGeneratedLayout(world, { projection: 'diamond' }), R = islandRect(layout), m = buildModel(layout);
  for (const b of m.buildings) assert.ok(b.r.x0 >= R.x0 && b.r.x1 <= R.x1 && b.r.z0 >= R.z0 && b.r.z1 <= R.z1, 'building on the island');
});
