// Pass 5H vertical slice harness: proves the pixel pipeline is a SYSTEM, not a hand-made scene.
// It renders, with the same reusable pieces and placement rules, in both themes:
//   - several planner-generated starting Worlds (different seeds),
//   - a planner-added wing, and a planner-chosen room split (subdivide), on top of T0,
//   - the character alias sheet (the six aliases plus the generic TEST character, reference output only).
// Agents are placed by the canonical behaviour rules (core/behavior.mjs placeAgents), never by hand.
// Output: PNGs and manifest.json in the given directory (default ./px-harness-out). Deterministic: the manifest lists a
// pixel hash per image; running twice gives the same hashes.
//
//   node scripts/px-harness.mjs [outDir] [--frames]
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, placeCapability } from '../procgen/world.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { placeAgents } from '../core/behavior.mjs';
import { createStage } from '../render/px/stage.mjs';
import { lookFor, facingOf, clipFor, ALIASES, TEST_LOOK, buildSprite, FACINGS, CLIPS } from '../render/px/character.mjs';
import { PixelBuffer, hex } from '../render/px/buffer.mjs';
import { encodePNG } from '../render/px/png.mjs';
import { LIGHTING_IDS } from '../render/px/palette.mjs';

export const THEMES = ['real', 'fantasy'];
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
export function ruleActors(layout, theme, team = T0_TEAM) {
  const places = placeAgents(team, {}, layout);
  return team.map(a => {
    const p = places[a.id], loc = layout.locationById[p.location], key = `${loc.id}:${p.station.split('#')[0]}`, st = layout.stationInfo[key];
    const pt = loc.stations[p.station.split('#')[0]], look = lookFor(a.id, theme);
    const sitting = st?.pose === 'sit', state = p.clip ?? (a.activity === 'coding' ? 'type' : a.activity === 'reviewing' ? 'review' : 'idle');
    return { id: a.id, look, lookKey: `${a.id}:${theme}`, point: pt, plan: { x: st?.x ?? 0, z: st?.z ?? 0, floor: st?.floor ?? loc.floor ?? 0 }, facing: facingOf(null, st?.facing ?? 'front'), clip: clipFor(look, { state, moving: false, posture: sitting ? 'sit' : null }), frame: 0, sitting, location: p.location, station: p.station };
  });
}

// Renders a scenario in a theme: the building's surroundings at 1 art px per pixel.
export function renderScenario(world, theme, { lighting = 'dusk', t = 0, pad = 60, selected = null, sprites = null } = {}) {
  const layout = createGeneratedLayout(world, { theme }), stage = createStage(layout, theme, { lighting, sprites }), A = stage.A;
  const H = layout.home, x0 = Math.floor(H.x / A) - pad, y0 = Math.floor(H.y / A) - pad, w = Math.ceil(H.w / A) + pad * 2, h = Math.ceil(H.h / A) + pad * 2;
  const actors = ruleActors(layout, theme).map(a => ({ ...a, foot: [a.point[0] / A, a.point[1] / A], selected: a.id === selected }));
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

async function main() {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'px-harness-out', frames = process.argv.includes('--frames');
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
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.scenarios).map(([k, v]) => [k, `${v.rooms} rooms, ${v.storeys} storey(s), ${v.hash}`])), null, 1));
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
