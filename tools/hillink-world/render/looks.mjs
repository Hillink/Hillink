// Skins: the same simulation dressed two ways (plus the Blueprint debug view). A skin is materials for
// the building and a look for each agent; nothing here changes positions, states or timing.
// Pass 5E: agent looks are data in each agent's definition (core/agents.mjs, render/appearance.mjs): a base appearance
// plus per-theme overrides. Hillink's current agents carry their pre-5E looks there unchanged; any other agent (one
// the World has never seen) is drawn from its own appearance data, or a plain outfit in its registered colour.
import { definitionOf, DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { resolveAppearance, figureLookOf } from './appearance.mjs';

export const LOOKS = Object.fromEntries(['real', 'fantasy'].map(t => [t, Object.fromEntries(Object.values(DEFAULT_DEFINITIONS).map(d => [d.id, figureLookOf(resolveAppearance(d.appearance, t), t)]))]));
export function lookFor(skinId, agent) {
  const theme = skinId === 'fantasy' ? 'fantasy' : 'real';
  return figureLookOf(resolveAppearance(definitionOf(agent ?? {})?.appearance, theme), theme);
}

// Building materials per skin.
export const MATERIALS = {
  real: {
    sky: ['#0f1b33', '#2d4b7a', '#f0a36a'], skyline: '#1a2740', skylineLit: '#ffd28a', ground: '#51604a', groundEdge: '#3e4a39',
    road: '#2c2f36', roadLine: '#e8e2c8', pavement: '#9b9a94', pavementEdge: '#7c7b76',
    wallBack: { lounge: '#e9dcc8', hall: '#dfe3e8', eng: '#cfd8e3' }, wallTrim: '#8b949e', wallSide: '#c2c8d0',
    floor: { wood: ['#b98a5e', '#a97b52'], tile: ['#d5d9de', '#c6cbd1'], carpet: ['#6d7b91', '#65728a'] },
    slab: '#6d747d', slabTop: '#8a9199', facade: 'rgba(170,215,255,0.22)', facadeFrame: '#5d6873', frame: '#39414b',
    partitionLow: '#b7bec7', glass: 'rgba(190,225,255,0.18)', glassEdge: 'rgba(230,245,255,0.55)',
    exterior: '#8a95a3', exteriorDark: '#6c7784', roof: '#5f666f', parapet: '#7a828c',
    wood: '#8a5a36', woodLight: '#b07a4a', metal: '#9aa3ad', metalDark: '#59616b', fabric: '#4b6a8a', fabric2: '#c7683f', leaf: '#3f8f4f', leafLight: '#62b066', pot: '#b86b3f',
    screenOff: '#1b2230', screenIdle: '#27405e', screenOn: '#5ec8ff', code: ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff'], accent: '#ff7a1a', light: 'rgba(255,236,190,0.16)',
    lamp: '#fff2c4', sign: '#ffffff', signGlow: 'rgba(255,190,110,0.35)', liftFrame: '#39414b', liftGlass: 'rgba(170,220,255,0.24)', liftCar: '#e6e9ee', liftAccent: '#5ec8ff',
  },
  fantasy: {
    sky: ['#1a1036', '#5b3a8c', '#f4a261'], skyline: '#2a1d4a', skylineLit: '#ffcf6b', ground: '#4f7a3a', groundEdge: '#3d5f2c',
    road: '#6b5b4a', roadLine: '#8a7760', pavement: '#9c8f7a', pavementEdge: '#7d7160',
    wallBack: { lounge: '#c9b28f', hall: '#b9ab94', eng: '#a99c86' }, wallTrim: '#6b5640', wallSide: '#a8977c',
    floor: { wood: ['#9c6b3f', '#8a5d36'], tile: ['#a39a8c', '#958c7e'], carpet: ['#6b2f3a', '#5f2833'] },
    slab: '#6a5a48', slabTop: '#86745e', facade: 'rgba(255,210,140,0.16)', facadeFrame: '#5a4432', frame: '#4a3828',
    partitionLow: '#8e7a60', glass: 'rgba(255,220,160,0.14)', glassEdge: 'rgba(255,235,190,0.45)',
    exterior: '#9a8a74', exteriorDark: '#7d6f5c', roof: '#7a4a3a', parapet: '#8a7560',
    wood: '#6b4226', woodLight: '#9c6b3f', metal: '#b3a17a', metalDark: '#6e5f45', fabric: '#6b2f3a', fabric2: '#2f5e39', leaf: '#3d7f3a', leafLight: '#72b35a', pot: '#8a5a3a',
    screenOff: '#1d1430', screenIdle: '#3a2560', screenOn: '#b58cff', code: ['#ffd36b', '#b58cff', '#72e0c8', '#ff9fb2'], accent: '#ffcf6b', light: 'rgba(255,200,120,0.18)',
    lamp: '#ffcf6b', sign: '#ffe6a8', signGlow: 'rgba(255,190,90,0.4)', liftFrame: '#5a4432', liftGlass: 'rgba(160,120,255,0.22)', liftCar: '#d9c7a0', liftAccent: '#b58cff',
    torches: true, banners: true, fantasy: true,
  },
  blueprint: {
    sky: ['#0b2447', '#0b2447', '#0b2447'], line: '#9ecbff', lineDim: 'rgba(158,203,255,0.35)', text: '#e6f1ff', node: '#ffd23f', edge: 'rgba(255,210,63,0.55)', point: '#7ee787', lift: '#ff7ab6',
  },
};
