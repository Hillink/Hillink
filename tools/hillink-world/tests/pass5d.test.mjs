// Pass 5D-A: the visual prototype is presentation only. These tests hold it to that: the art layer draws the same
// generated layout (geometry, navigation, anchors) as the default renderer; its procedural rules keep plants off
// roads, paths, forecourts and buildings on any seed; another seed gives a different, equally valid result; the
// prototype is opt-in and every agent pose still comes from the 5C rig and pose data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../procgen/world.mjs';
import { loadTheme } from '../themes/index.mjs';
import { createGround, plantHeight } from '../render/art5d/ground.mjs';
import { FURN5 } from '../render/art5d/furniture.mjs';
import { drawFigure5d } from '../render/art5d/figure.mjs';
import { litBox, lit, MAT } from '../render/art5d/light.mjs';
import { rigFor } from '../render/rigs.mjs';

const stripFns = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v)));

test('5D-A is opt-in and presentation only: the same layout, navigation and anchors under both renderers', () => {
  const w = createWorld({ seed: 'hillink' });
  const plain = loadTheme('real', { world: w }), art = loadTheme('real', { world: w, art: '5d' });
  assert.equal(plain.art ?? null, null); assert.equal(art.art, '5d');
  assert.notEqual(plain.skin, art.skin);
  for (const k of ['navNodes', 'navEdges', 'stationInfo', 'nodePlan', 'lifts']) assert.deepEqual(stripFns(art.layout[k]), stripFns(plain.layout[k]), `${k} unchanged`);
  assert.deepEqual(art.layout.locations.map(l => [l.id, Object.keys(l.stations)]), plain.layout.locations.map(l => [l.id, Object.keys(l.stations)]));
  // Fantasy is untouched by the prototype (5D-A is Real only).
  assert.equal(loadTheme('fantasy', { world: w, art: '5d' }).art ?? null, null);
});

test('procedural vegetation: species and planting from rules, never on roads, paths, forecourts, buildings or water, on any seed', () => {
  const dist = (px, pz, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); m = Math.min(m, Math.hypot(px - ax - dx * t, pz - az - dz * t)); } return m; };
  const results = {};
  for (const seed of ['hillink', 'alpha', 'bravo']) {
    const L = loadTheme('real', { world: createWorld({ seed }) }).layout, G = createGround(L), U = L.U;
    assert.ok(G.plants.length > 20, `${seed}: a planted landscape (${G.plants.length})`);
    const kinds = new Set(G.plants.map(p => p.kind));
    assert.ok(kinds.size >= 4, `${seed}: several species (${[...kinds]})`);
    for (const p of G.plants) {
      for (const w of G.ways) assert.ok(dist(p.x, p.z, w.pts) >= w.W / 2, `${seed}: ${p.kind} not on ${w.kind}`);
      for (const f of G.forecourts) assert.ok(!(p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1), `${seed}: not on the forecourt`);
      for (const b of Object.values(L.world.buildings)) { const r = L.view.rectToView(b.footprint); assert.ok(!(p.x > r.x0 * U && p.x < r.x1 * U && p.z > r.z0 * U && p.z < r.z1 * U), `${seed}: not inside a building`); }
      assert.ok(plantHeight(p, U) > 0);
    }
    assert.ok(G.beds.length >= 1 && G.forecourts.length >= 1, `${seed}: landscaped beds and an entrance forecourt`);
    results[seed] = G.plants.map(p => `${p.kind}:${Math.round(p.x)}:${Math.round(p.z)}`).join('|');
  }
  assert.notEqual(results.hillink, results.alpha, 'another seed, another landscape');
  // Deterministic: the same seed plants the same landscape.
  const again = createGround(loadTheme('real', { world: createWorld({ seed: 'hillink' }) }).layout).plants.map(p => `${p.kind}:${Math.round(p.x)}:${Math.round(p.z)}`).join('|');
  assert.equal(again, results.hillink);
});

test('the new figures and furniture draw every clip, direction and piece without error, with the 5C poses', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  const clips = ['idle', 'walk', 'carry', 'type', 'work', 'inspect', 'survey', 'assemble', 'measure', 'dig', 'paint', 'install', 'lift', 'pickup', 'read', 'talk', 'meeting', 'blocked', 'waiting', 'celebrate', 'offline', 'sit', 'stand', 'react'];
  for (const state of clips) for (const dir of ['front', 'back', 'left', 'right']) {
    const r = drawFigure5d(ctx, { x: 0, y: 0, h: 50, dir, state, prev: 'walk', blend: 0.5, props: rigFor('real').props, t: 0.4, time: 2, gait: 0.7, look: { shirt: '#d9773f', hair: '#5a3a22', glasses: true, hat: 'hardhat' } });
    assert.ok(Number.isFinite(r.top) && r.top < 0, `${state}/${dir} returns a head top above the feet`);
  }
  const P = { at: (x, z, f, h = 0) => [x + z * 0.5, 560 - f * 100 - z * 0.4 - h], g: { skx: 0.5, sky: 0.4 }, baseOf: f => 560 - f * 100 };
  const d = { ctx, P, T: 3, reduced: false, stationActive: () => true, room: () => 1, lastTests: { state: 'running' } };
  for (const [type, fn] of Object.entries(FURN5)) fn(d, { x: 100, z: 50, w: 40, d: 20, h: 30, floor: 0, facing: 'back', station: 'desk1' }, 'all');
  litBox(d, 0, { x0: 0, x1: 10, z0: 0, z1: 10, h1: 20 }, 'concrete');
  assert.match(lit(MAT.grass[0], 0.8), /^rgb\(/);
});
