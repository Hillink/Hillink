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
export function loadTheme(id, { world = null, art = null } = {}) {
  const key = THEME_ORDER.includes(id) ? id : 'real';
  if (world) {
    const G = createGeneratedLayout(world, { theme: key });
    return { id: key, name: THEME_NAMES[key], layout: G, art: art === '5d' && key === 'real' ? '5d' : null, skin: art === '5d' && key === 'real' ? createArtSkin(G) : createSiteSkin(G, key), scenery: { characterHeight: G.characterHeight, walkSpeed: G.walkSpeed, liftSpeed: ARCH.elevator.speed, npcHeight: AGENT.height, npcs: [] }, camera: { minZoom: 0.2, maxZoom: 4 }, generated: true };
  }
  const L = hqLayout();
  return { id: key, name: THEME_NAMES[key], layout: L, skin: createIsoSkin(L, key), scenery: scenery(L), camera: { minZoom: 0.45, maxZoom: 4 } };
}
