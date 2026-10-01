// Pass 5H vertical slice: colour. Every colour the pixel renderer uses comes from a theme palette of named base
// colours, expanded into hue-shifted ramps (shadows cooler and more saturated, lights warmer), so materials share one
// light logic (Art Direction Spec §8, §9). Lighting is a parameter (day / dusk / night): a lightmap multiplies the
// composed frame, emissive pixels (screens, fire, crystals, LEDs, lit windows) are exempt, and glows are added on top.
// Nothing here depends on time.
import { hex, rgba, R, G, B } from './buffer.mjs';

function hsl(c) {
  const r = R(c) / 255, g = G(c) / 255, b = B(c) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, k = t => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return rgba(Math.round(k(h / 360 + 1 / 3) * 255), Math.round(k(h / 360) * 255), Math.round(k(h / 360 - 1 / 3) * 255));
}
// Hue shift toward a target hue by up to `amt` degrees.
const toward = (h, target, amt) => { const d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
// A ramp of 5: [deep shadow, shadow, base, light, highlight].
export function ramp(base) {
  const c = typeof base === 'string' ? hex(base) : base, [h, s, l] = hsl(c);
  return [
    fromHsl(toward(h, 250, 26), Math.min(1, s * 1.05 + 0.06), l * 0.52),
    fromHsl(toward(h, 250, 14), Math.min(1, s * 1.02 + 0.03), l * 0.74),
    c,
    fromHsl(toward(h, 55, 10), s * 0.96, l + (1 - l) * 0.22),
    fromHsl(toward(h, 55, 18), s * 0.85, l + (1 - l) * 0.45),
  ];
}

// Theme palettes (base colours). Real: modern materials, cool-neutral with Hillink blue; Fantasy: stone, timber, green
// and gold, crystal blue as a local secondary (C26).
export const PALETTES = {
  real: {
    grass: '#6f9f4a', grassDry: '#8aa856', grassDark: '#4f7d3c', soil: '#7a6248', rock: '#8d8b84', water: '#4f8fbf',
    path: '#c9c4ba', road: '#55595f', roadLine: '#e8e3d0', curb: '#b9b6ae',
    trunk: '#6b4a32', leaf: '#4f8a3c', leafLight: '#7fb54e', pine: '#3e6e4a', bush: '#5c9444', flower: '#e9d36a', flower2: '#e48aa0',
    floorWood: '#c79a68', floorCarpet: '#5f7590', floorCarpet2: '#7b6a8f', floorTile: '#d9dcdf', floorConcrete: '#b8b4ad', floorRug: '#4f78a8',
    wall: '#e6e2da', wallSide: '#d2cdc4', wallTrim: '#9aa0a8', wallTop: '#3a3f47', exterior: '#7d838b', exteriorSide: '#676d75', base: '#4e535a', cap: '#30353c', column: '#33383f',
    glass: '#9cc6e0', frame: '#3b4350', door: '#7a5a3e', doorFrame: '#3b4350',
    metal: '#a7b0ba', metalDark: '#5c6570', wood: '#9b6f45', woodDark: '#6e4c30', fabric: '#3f6fa6', fabric2: '#6b7d8f', leather: '#7a4b2e', white: '#f4f4f1',
    screen: '#59b8ff', screenOff: '#28323f', led: '#4dff88', ledRed: '#ff5a4d', lamp: '#ffe9a8', brand: '#2f7df6', paper: '#f3efe2', sticky: '#ffe36e',
    hivis: '#ff8a1f', hardhat: '#ffcc1f', leafAlt: '#6f8f3a', leafAutumn: '#9a9a3a', gravel: '#8f8b84', soilDry: '#9a8466', asphalt: '#4d5157', glassNight: '#33465c',
  },
  fantasy: {
    grass: '#5f8f3f', grassDry: '#7f9a48', grassDark: '#40692f', soil: '#6e553c', rock: '#7e7c78', water: '#3f6f8f',
    path: '#a08a68', road: '#8a7254', roadLine: '#a08a68', curb: '#6f6a62',
    trunk: '#5a3e2a', leaf: '#3f7838', leafLight: '#6aa04a', pine: '#2f5a3e', bush: '#4a7d3a', flower: '#e8c75a', flower2: '#b48ad8',
    floorWood: '#9c6e44', floorCarpet: '#2f6a46', floorCarpet2: '#7a3b3b', floorTile: '#8f8a80', floorConcrete: '#857c70', floorRug: '#2f6a46',
    wall: '#9d9486', wallSide: '#857c6f', wallTrim: '#5e4a36', wallTop: '#b3aa9a', exterior: '#8f877b', exteriorSide: '#776f64', base: '#5f584e', cap: '#b3aa9a', column: '#7d7569', slate: '#4b5568', moss: '#5b7a3a',
    glass: '#d8b860', frame: '#4a3626', door: '#6b4a2e', doorFrame: '#4a3626',
    metal: '#9aa0a6', metalDark: '#4f555c', wood: '#8a5e3a', woodDark: '#5c3e26', fabric: '#2f6a46', fabric2: '#7a3b3b', leather: '#6a4228', white: '#ece4cf',
    screen: '#7fe0ff', screenOff: '#2a3a4a', led: '#7fe0ff', ledRed: '#ff4a3a', lamp: '#ffc46a', brand: '#2f8a4a', paper: '#e9dcb8', sticky: '#d9b44a',
    gold: '#d9b44a', banner: '#1f6b3a', fire: '#ff8a2a', fireCore: '#ffe27a', crystal: '#6fd8ff', crystalDeep: '#2f7fc8', ember: '#ff5a1f',
    leafAlt: '#6b7a34', leafAutumn: '#b0642c', gravel: '#857d70', soilDry: '#8a7052', asphalt: '#7d6a50', glassNight: '#2c3a4e', leaded: '#4a5a6a', bannerRed: '#8a2a2a',
  },
};
// Colours that emit light: the lightmap never darkens them (screens, LEDs, fire, crystals, lamps, lit windows).
export const EMISSIVE = new Set(['screen', 'led', 'ledRed', 'lamp', 'fire', 'fireCore', 'crystal', 'ember']);

const cache = new Map();
// The ramps of one theme: pal.c(name, k) is the colour `name` at ramp step k (0 deep shadow .. 4 highlight; 2 base).
export function paletteOf(themeId) {
  const key = themeId in PALETTES ? themeId : 'real';
  if (cache.has(key)) return cache.get(key);
  const ramps = Object.fromEntries(Object.entries(PALETTES[key]).map(([k, v]) => [k, ramp(v)]));
  const c = (name, k = 2) => (ramps[name] ?? ramps.wall)[Math.max(0, Math.min(4, k))];
  const pal = { theme: key, ramps, c, emissive: name => EMISSIVE.has(name) };
  cache.set(key, pal);
  return pal;
}

// Lighting settings. ambient: the outdoor multiplier; interior: inside finished rooms; pool: a lamp's added light.
export const LIGHTING = {
  day: { ambient: [1, 1, 1], interior: [0.97, 0.97, 0.98], pool: [0.06, 0.05, 0.02], sky: ['#9ccbe9', '#d5ecf7'], glow: 0.25 },
  dusk: { ambient: [0.80, 0.66, 0.70], interior: [0.98, 0.9, 0.78], pool: [0.22, 0.16, 0.06], sky: ['#3d3a66', '#e39a6c'], glow: 0.7 },
  night: { ambient: [0.30, 0.36, 0.56], interior: [0.86, 0.78, 0.64], pool: [0.38, 0.28, 0.12], sky: ['#0b1426', '#1d2a48'], glow: 1 },
};
export const LIGHTING_IDS = Object.keys(LIGHTING);
