// Theme registry. Every theme is the same object-built Hillink HQ (world/building.mjs) with the same
// simulation; a theme only picks the skin. Realistic and Fantasy dress it; Blueprint is the debug view.
// No theme loads an image.
import { createIsoLayout } from '../world/layout.mjs';
import { createIsoSkin } from '../render/iso-skin.mjs';
import { STREET } from '../world/building.mjs';
import { AGENT, ARCH } from '../world/scale.mjs';
import { createGeneratedLayout } from '../world/generated-layout.mjs';
import { createSiteSkin } from '../render/site-skin.mjs';
import { createArtSkin } from '../render/art5d/skin.mjs';
import { createInterpreter } from './interpreter.mjs';
import { createKingdomLayout } from '../world/kingdom-layout.mjs';
import { createKingdomSkin } from '../render/kingdom-skin.mjs';

export const THEME_ORDER = ['real', 'fantasy', 'blueprint'];
export const THEME_NAMES = { real: 'Realistic', fantasy: 'Fantasy', blueprint: 'Blueprint' };

let layout = null;
export const hqLayout = () => (layout ||= createIsoLayout());

// Ambient pedestrians on the pavement (not Hillink data; never labelled, never selectable).
function scenery(L) {
  return {
    characterHeight: L.characterHeight, walkSpeed: L.walkSpeed, liftSpeed: ARCH.elevator.speed, npcHeight: AGENT.height, // pedestrians are people too: same height as agents
    npcs: STREET.walkers.map(w => ({ route: [L.P.at(w.x0, w.z, 0), L.P.at(w.x1, w.z, 0)], speed: w.speed, pause: w.pause })),
  };
}

// Pass 5B: with a canonical procedural world the theme runs on generated geometry (world/generated-layout.mjs and
// render/site-skin.mjs); without one it falls back to the hand-authored building (kept for comparison: ?world=legacy).
// Pass 5D-A: art '5d' is the visual prototype for the Real World (render/art5d/), opt-in with ?art=5d. It draws the same
// generated layout; only the presentation differs.
// Pass 5H (P1, Kyle 2026-10-01): Real and Fantasy share ONE canonical spatial layout, the planner's generated layout.
// A theme translates materials, architecture, props and environment only; it never creates spatial truth of its own.
// Art 'px' is the 5H vertical slice (render/px/): the pixel renderer, both themes, over that same layout.
// The Pass 5G kingdom (world/kingdom-layout.mjs) is SUPERSEDED and inactive: it stays in the code, reachable only with
// the explicit debug option layout: 'kingdom-5g' (?layout=kingdom-5g), and never drives the slice or Fantasy.
export const SUPERSEDED_LAYOUTS = { 'kingdom-5g': 'Pass 5G 12-district kingdom: superseded by P1 (one shared planner layout); debug only' };
export function loadTheme(id, { world = null, art = null, layout: layoutId = null, pxSkin = null } = {}) {
  const key = THEME_ORDER.includes(id) ? id : 'real';
  if (world && key === 'fantasy' && layoutId === 'kingdom-5g') {
    const K = createKingdomLayout(world);
    return { id: key, name: THEME_NAMES[key], interpreter: createInterpreter(key), layout: K, art: null, skin: createKingdomSkin(K), scenery: { characterHeight: K.characterHeight, walkSpeed: K.walkSpeed, liftSpeed: ARCH.elevator.speed, npcHeight: AGENT.height, npcs: [] }, camera: { minZoom: 0.2, maxZoom: 4 }, generated: true, kingdom: true, superseded: SUPERSEDED_LAYOUTS['kingdom-5g'] };
  }
  if (world) {
    const G = createGeneratedLayout(world, { theme: key });
    const px = art === 'px' && key !== 'blueprint' && pxSkin;
    const artId = px ? 'px' : art === '5d' && key === 'real' ? '5d' : null;
    const skin = px ? pxSkin(G, key) : artId === '5d' ? createArtSkin(G) : createSiteSkin(G, key);
    return { id: key, name: THEME_NAMES[key], interpreter: createInterpreter(key), layout: G, art: artId, skin, scenery: { characterHeight: G.characterHeight, walkSpeed: G.walkSpeed, liftSpeed: ARCH.elevator.speed, npcHeight: AGENT.height, npcs: [] }, camera: { minZoom: 0.2, maxZoom: 4 }, generated: true };
  }
  const L = hqLayout();
  return { id: key, name: THEME_NAMES[key], interpreter: createInterpreter(key), layout: L, skin: createIsoSkin(L, key), scenery: scenery(L), camera: { minZoom: 0.45, maxZoom: 4 } };
}
