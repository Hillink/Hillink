// Theme registry. Every theme is the same object-built Hillink HQ (world/building.mjs) with the same
// simulation; a theme only picks the skin. Realistic and Fantasy dress it; Blueprint is the debug view.
// No theme loads an image.
import { createIsoLayout } from '../world/layout.mjs';
import { createIsoSkin } from '../render/iso-skin.mjs';
import { STREET } from '../world/building.mjs';

export const THEME_ORDER = ['real', 'fantasy', 'blueprint'];
export const THEME_NAMES = { real: 'Realistic', fantasy: 'Fantasy', blueprint: 'Blueprint' };

let layout = null;
export const hqLayout = () => (layout ||= createIsoLayout());

// Ambient pedestrians on the pavement (not Hillink data; never labelled, never selectable).
function scenery(L) {
  return {
    characterHeight: L.characterHeight, walkSpeed: L.walkSpeed, liftSpeed: 58, npcHeight: 40,
    npcs: STREET.walkers.map(w => ({ route: [L.P.at(w.x0, w.z, 0), L.P.at(w.x1, w.z, 0)], speed: w.speed, pause: w.pause })),
  };
}

export function loadTheme(id) {
  const key = THEME_ORDER.includes(id) ? id : 'real', L = hqLayout();
  return { id: key, name: THEME_NAMES[key], layout: L, skin: createIsoSkin(L, key), scenery: scenery(L), camera: { minZoom: 0.45, maxZoom: 4 } };
}
