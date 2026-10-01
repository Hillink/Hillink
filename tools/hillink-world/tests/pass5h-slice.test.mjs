// Pass 5H vertical slice (Kyle 2026-10-01): the pixel renderer (render/px/) over the ONE canonical layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, worldFingerprint } from '../procgen/world.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { composeScene } from '../render/px/compose.mjs';
import { createStage } from '../render/px/stage.mjs';
import { ALIASES, TEST_LOOK, lookFor, validateParts, validateLook, buildSprite, CANVAS } from '../render/px/character.mjs';
import { PixelBuffer } from '../render/px/buffer.mjs';
import { loadTheme } from '../themes/index.mjs';
import { SCENARIOS, renderScenario, ruleActors, aliasSheet } from '../scripts/px-harness.mjs';
import { roomNameOf, createPxSkin } from '../render/px/skin.mjs';

test('slice: the six aliases are 24 px characters from shared parts; TEST is reference-only', () => {
  assert.deepEqual(Object.keys(ALIASES).sort(), ['chatgpt:fantasy', 'chatgpt:real', 'claude:fantasy', 'claude:real', 'codex:fantasy', 'codex:real']);
  assert.deepEqual(validateParts(), []);
  for (const [key, look] of Object.entries(ALIASES)) {
    const s = buildSprite(look, 'fr', 'idle', 0), b = s.buf.bounds();
    assert.ok(b.h >= 20 && b.h <= 30, `${key}: ${b.h} px tall`);
    assert.ok(!look.test, `${key} is canonical`);
  }
  assert.equal(TEST_LOOK.test, true);
  // No agent resolves to the TEST look, and no fourth canonical alias exists.
  for (const id of ['chatgpt', 'claude', 'codex', 'someone-new']) for (const th of ['real', 'fantasy']) assert.notEqual(lookFor(id, th), TEST_LOOK);
  assert.equal(new Set(Object.keys(ALIASES).map(k => k.split(':')[0])).size, 3);
  // Appearance data cannot smuggle code: unknown parts, tools and non-colour values are dropped.
  const v = validateLook({ parts: ['hair.short', 'evil()'], palette: { top: 'javascript:alert(1)', hair: '#123456' }, tools: { scan: 'x' } });
  assert.deepEqual(v.parts, ['hair.short']); assert.deepEqual(v.palette, { hair: '#123456' }); assert.deepEqual(v.tools, {});
  assert.equal(CANVAS.h, 34);
});

test('slice: Real and Fantasy compose the SAME geometry from the same rules (only materials differ)', () => {
  const w = createWorld({ seed: 'hillink' });
  const real = composeScene(createGeneratedLayout(w, { theme: 'real' }), 'real'), fantasy = composeScene(createGeneratedLayout(w, { theme: 'fantasy' }), 'fantasy');
  // Every canonical furnishing item becomes a prop in both themes (lamp posts along paths are theme environment).
  const plan = s => [...new Set(s.objects.filter(o => o.kind === 'prop' && o.room).map(o => `${o.id.replace(/:back$/, '')}@${o.room}`))].sort();
  assert.deepEqual(plan(real), plan(fantasy), 'one prop per canonical furnishing item in both themes');
  const walls = s => s.objects.filter(o => o.id.startsWith('wall:')).map(o => [o.id, o.x0, o.x1, o.z0, o.z1].join()).sort();
  assert.deepEqual(walls(real), walls(fantasy));
  assert.deepEqual(real.region, fantasy.region);
  assert.notEqual(real.ground.hash(), fantasy.ground.hash(), 'materials differ');
});

test('slice: deterministic pixels, no canonical writes, and every piece traced to a canonical record or rule', () => {
  const w = createWorld({ seed: 'alpha' }), before = JSON.stringify(w);
  const a = renderScenario(w, 'fantasy', { t: 1.25 }).out.hash(), b = renderScenario(createWorld({ seed: 'alpha' }), 'fantasy', { t: 1.25 }).out.hash();
  assert.equal(a, b);
  assert.equal(JSON.stringify(w), before, 'rendering never mutates the World');
  const L = createGeneratedLayout(w, { theme: 'real' }), S = composeScene(L, 'real');
  const items = new Set(Object.values(L.furnishing).flatMap(F => F.items.map(i => i.id))), decor = new Set(Object.values(L.furnishing).flatMap(F => F.decor.map(d => d.id)));
  for (const o of S.objects) {
    const [k, rest] = [o.id.split(':')[0], o.id.split(':').slice(1).join(':')];
    const ok = { wall: true, merlons: true, tower: true, portal: true, 'entrance-light': true, post: true, veg: true, sconce: true, decor: decor.has(rest) }[k] ?? items.has(o.id.replace(/:back$/, ''));
    assert.ok(ok, `untraceable piece ${o.id}`);
  }
});

test('slice harness: several starting Worlds, a planner wing and a planner room split render in both themes', () => {
  const opts = {};
  for (const id of ['t0-bravo', 'growth-wing', 'growth-split']) {
    const w = SCENARIOS[id]();
    if (id === 'growth-wing') opts.wing = w.harnessNote.option;
    if (id === 'growth-split') opts.split = w.harnessNote.option;
    for (const theme of ['real', 'fantasy']) {
      const { out, layout, actors } = renderScenario(w, theme);
      assert.ok(out.bounds(), `${id}/${theme} rendered`);
      assert.deepEqual(actors.map(a => a.id), ['chatgpt', 'claude', 'codex']);
      for (const a of actors) assert.ok(layout.locationById[a.location], `${a.id} placed by rule`);
    }
  }
  assert.equal(opts.wing, 'add-wing'); assert.equal(opts.split, 'subdivide');
  assert.equal(aliasSheet().rows.length, 7);
});

test('slice: P3 in the slice, canonical room names, lighting settings, and the px skin through loadTheme', () => {
  const w = createWorld({ seed: 'hillink' }), L = createGeneratedLayout(w, { theme: 'real' });
  const chat = ruleActors(L, 'real').find(a => a.id === 'chatgpt');
  assert.equal(chat.location, 'command');
  assert.equal(roomNameOf(w, Object.values(w.spaces).find(s => s.capabilities?.includes('meeting-space')).id), 'Break & Meeting');
  const S = createStage(L, 'real', { lighting: 'day' }), view = { x0: Math.floor(L.home.x / S.A), y0: Math.floor(L.home.y / S.A), w: 120, h: 80 };
  const hashes = ['day', 'dusk', 'night'].map(id => { S.setLighting(id); return S.render(new PixelBuffer(120, 80), view, 0).hash(); });
  assert.equal(new Set(hashes).size, 3);
  // Ambient loops change pixels over time; the same time gives the same frame.
  S.setLighting('night');
  const big = { x0: Math.floor(L.home.x / S.A), y0: Math.floor(L.home.y / S.A), w: Math.ceil(L.home.w / S.A), h: Math.ceil(L.home.h / S.A) };
  const f = t => S.render(new PixelBuffer(big.w, big.h), big, t).hash();
  assert.equal(f(0.4), f(0.4)); assert.notEqual(f(0), f(0.4));
  const th = loadTheme('fantasy', { world: w, art: 'px' });
  assert.equal(th.art, 'px'); assert.equal(th.layout.id, 'generated');
  assert.equal(Math.round(th.skin.defaultZoom(1) * 1 * S.A), 2, '2x by default');
  assert.equal(typeof createPxSkin, 'function'); assert.ok(worldFingerprint(w));
});
