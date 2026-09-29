// Theme registry. A theme = layout data + a skin (+ optional art). Switching themes rebuilds the view;
// World state is untouched, so every theme shows the same real activity.
import { createLayout, blueprintLayout } from '../core/layout.mjs';
import { placeholderSkin, themes as palettes } from '../render/skin-placeholder.mjs';
import { createArtSkin } from '../render/skin-art.mjs';
import { realTheme } from './real.mjs';
import { fantasyTheme } from './fantasy.mjs';

export const THEME_ORDER = ['real', 'fantasy', 'blueprint'];

export function loadTheme(id, { onArtLoaded } = {}) {
  if (id === 'blueprint') return { id, name: 'Blueprint', layout: createLayout(blueprintLayout), skin: placeholderSkin, palette: palettes.day, camera: { minZoom: 0.2, maxZoom: 3 } };
  const def = id === 'fantasy' ? fantasyTheme : realTheme;
  return { id: def.id, name: def.name, layout: createLayout(def.layout), skin: createArtSkin(def, onArtLoaded), palette: palettes.day, camera: def.camera, avatars: def.avatars, art: def.art, scenery: def.scenery ?? null };
}
export const THEME_NAMES = { real: 'Realistic', fantasy: 'Fantasy', blueprint: 'Blueprint' };
