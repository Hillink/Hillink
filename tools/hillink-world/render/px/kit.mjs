// Pass 5H vertical slice: the modular environment kit, per theme, as data.
//   MATERIALS   material -> palette colour, ramp step, light behaviour and loop (blink, flicker, pulse, fire, sway)
//   FLOORS      room kind -> floor pattern; patterns are pure functions of plan position (metres)
//   PROPS       furnishing type (by room kind) -> a recipe of boxes, face details, blobs and light emitters
//   DECOR       wall-mounted pieces (whiteboard, status screen, task board, code wall, window, clock)
//   VEGETATION  trees, bushes and rocks for the land and the natural edge
// A recipe is a list of primitives in the item's own frame: u across its width and v across its depth as fractions
// (-0.5 .. 0.5, v = -0.5 is its front), h in metres up from the floor.
//   ['box', u0, u1, v0, v1, h0, h1, mat]                 a lit box (top, front and right faces)
//   ['face', 'front'|'top'|'right', a0, a1, b0, b1, mat]  a detail on the previous box's face (fractions of the face)
//   ['blob', u, v, h, rx, ry, mat]                       an ellipse (radii in art px): foliage, flame, crystal
//   ['light', u, v, h, kind]                             a light emitter (lamp, torch, fire, crystal, screen, led)
// Recipes, materials and patterns are data: the theme TRANSLATES each canonical piece (C25: command office <-> war
// table, workshop <-> forge, engineering station <-> analysis station, server bay <-> Arcane Core); it never adds,
// moves or removes one.
import { noise } from './buffer.mjs';

// ---- Materials: [palette name, ramp step (2 = base), options]. ----------------------------------------------------
const M = (pal, k = 2, opt = {}) => ({ pal, k, ...opt });
export const MATERIALS = {
  real: {
    wood: M('wood'), woodDark: M('woodDark'), woodLight: M('wood', 3), metal: M('metal'), metalDark: M('metalDark'), steel: M('metalDark', 1), white: M('white'), plastic: M('white', 3), fabric: M('fabric'), fabric2: M('fabric2'), leather: M('leather'),
    screen: M('screen', 2, { emissive: true, screen: true }), screenOff: M('screenOff'), led: M('led', 3, { emissive: true, anim: 'blink' }), ledRed: M('ledRed', 3, { emissive: true, anim: 'blink' }), lamp: M('lamp', 3, { emissive: true, anim: 'flicker' }),
    paper: M('paper'), sticky: M('sticky'), glass: M('glass', 3), frame: M('frame'), brand: M('brand'), leaf: M('leaf', 2, { anim: 'sway' }), leafLight: M('leafLight', 3, { anim: 'sway' }), pot: M('white', 1), soil: M('soil', 1), books: M('fabric', 2, { books: true }), stone: M('rock'), water: M('water', 3), hivis: M('hivis'), yellow: M('hardhat'),
    fire: M('lamp', 3, { emissive: true, anim: 'fire' }), crystal: M('screen', 3, { emissive: true, anim: 'pulse' }), gold: M('sticky', 2), banner: M('brand'), parchment: M('paper'), rug: M('floorRug'),
    cap: M('cap'), column: M('column'), concrete: M('exterior'), base: M('base'), slate: M('metalDark', 1), moss: M('leaf', 1), glassNight: M('glassNight'),
  },
  fantasy: {
    wood: M('wood'), woodDark: M('woodDark'), woodLight: M('wood', 3), metal: M('metal'), metalDark: M('metalDark'), steel: M('metalDark', 1), white: M('white'), plastic: M('white', 1), fabric: M('fabric'), fabric2: M('fabric2'), leather: M('leather'),
    screen: M('crystal', 3, { emissive: true, anim: 'pulse' }), screenOff: M('crystalDeep', 1), led: M('crystal', 3, { emissive: true, anim: 'pulse' }), ledRed: M('ember', 3, { emissive: true, anim: 'flicker' }), lamp: M('fire', 3, { emissive: true, anim: 'flicker' }),
    paper: M('paper'), sticky: M('paper', 3), glass: M('lamp', 2), frame: M('woodDark'), brand: M('banner'), leaf: M('leaf', 2, { anim: 'sway' }), leafLight: M('leafLight', 3, { anim: 'sway' }), pot: M('soil', 2), soil: M('soil', 1), books: M('fabric2', 2, { books: true }), stone: M('rock'), water: M('water', 3), hivis: M('fabric2'), yellow: M('gold'),
    fire: M('fire', 3, { emissive: true, anim: 'fire' }), crystal: M('crystal', 3, { emissive: true, anim: 'pulse' }), gold: M('gold'), banner: M('banner'), parchment: M('paper'), rug: M('floorRug'),
    cap: M('cap', 2), column: M('column'), concrete: M('exterior'), base: M('base'), slate: M('slate'), moss: M('moss'), glassNight: M('leaded'), bannerRed: M('bannerRed'), window: M('lamp', 3, { emissive: true, anim: 'flicker' }),
  },
};

// ---- Floors by room kind: pattern ids. -------------------------------------------------------------------------
export const FLOORS = {
  real: { lobby: 'concrete', passage: 'concrete', lounge: 'wood', comms: 'wood', development: 'concreteWork', workshop: 'concreteWork', office: 'carpet', command: 'carpet', testing: 'tile', servers: 'tile', archive: 'wood', storage: 'concrete', spare: 'concrete', site: 'concrete' },
  fantasy: { lobby: 'flagstone', passage: 'flagstone', lounge: 'planks', comms: 'planks', development: 'flagstoneDark', workshop: 'flagstoneDark', office: 'planks', command: 'planks', testing: 'flagstone', servers: 'runeStone', archive: 'planks', storage: 'flagstone', spare: 'flagstone', site: 'flagstone' },
};
// A pattern returns [palette name, ramp step] for a plan point (metres) and its integer pixel (for dithering).
const fr1 = v => v - Math.floor(v); // fractional part, also for negative coordinates
export const PATTERNS = {
  wood: (x, z) => { const row = Math.floor(z / 0.2), off = noise(row, 7) * 1.2, seam = fr1(z / 0.2) < 0.12 || fr1((x + off) / 1.2) < 0.025; return ['floorWood', seam ? 1 : noise(row, Math.floor((x + off) / 1.2)) > 0.5 ? 2 : 3]; },
  planks: (x, z) => { const row = Math.floor(z / 0.26), off = noise(row, 3) * 1.6, seam = fr1(z / 0.26) < 0.1 || fr1((x + off) / 1.6) < 0.02, nail = fr1((x + off) / 1.6) > 0.04 && fr1((x + off) / 1.6) < 0.06 && fr1(z / 0.26) > 0.4 && fr1(z / 0.26) < 0.6; return ['floorWood', seam ? 0 : nail ? 1 : noise(row, Math.floor((x + off) / 1.6)) > 0.45 ? 2 : 1]; },
  carpet: (x, z, X, Y) => ['floorCarpet', noise(X, Y, 3) > 0.82 ? 3 : noise(X >> 1, Y >> 1, 4) > 0.9 ? 1 : 2],
  tile: (x, z) => ['floorTile', fr1(x / 0.6) < 0.06 || fr1(z / 0.6) < 0.08 ? 1 : 3],
  concrete: (x, z, X, Y) => ['floorConcrete', fr1(x / 1.5) < 0.02 || fr1(z / 1.5) < 0.03 ? 1 : noise(X, Y, 5) > 0.93 ? 1 : 2],
  concreteWork: (x, z, X, Y) => ['floorConcrete', fr1(x / 1.5) < 0.02 || fr1(z / 1.5) < 0.03 ? 1 : noise(X, Y, 6) > 0.9 ? 1 : noise(X >> 2, Y >> 2, 9) > 0.85 ? 3 : 2],
  flagstone: (x, z, X, Y) => { const r = Math.floor(z / 0.45), c = Math.floor((x + (r & 1) * 0.3) / 0.6), gx = ((x + (r & 1) * 0.3) / 0.6) % 1, gz = fr1(z / 0.45); return ['floorTile', gx < 0.07 || gz < 0.1 ? 0 : noise(r, c, 2) > 0.6 ? 3 : noise(r, c, 2) > 0.25 ? 2 : 1]; },
  flagstoneDark: (x, z, X, Y) => { const r = Math.floor(z / 0.45), c = Math.floor((x + (r & 1) * 0.3) / 0.6), gx = ((x + (r & 1) * 0.3) / 0.6) % 1, gz = fr1(z / 0.45); return ['floorConcrete', gx < 0.07 || gz < 0.1 ? 0 : noise(r, c, 8) > 0.5 ? 2 : 1]; },
  runeStone: (x, z, X, Y) => { const r = Math.floor(z / 0.5), c = Math.floor(x / 0.5), g = fr1(x / 0.5) < 0.08 || fr1(z / 0.5) < 0.1; return ['floorConcrete', g ? 0 : (r + c) % 5 === 0 && noise(r, c, 1) > 0.5 ? 3 : 1]; },
  // Land.
  grass: (x, z, X, Y) => { const n = noise(X, Y, 11), m = noise(X >> 3, Y >> 3, 12); return [m > 0.72 ? 'grassDry' : 'grass', n > 0.9 ? 3 : n < 0.1 ? 1 : 2]; },
  pathReal: (x, z) => ['path', fr1(x / 0.6) < 0.06 || fr1(z / 0.6) < 0.08 ? 1 : 2],
  // Fantasy path: irregular flagstones (staggered, some missing) with grass in the joints.
  pathFantasy: (x, z, X, Y) => { const r = Math.floor(z / 0.42), o = (r & 1) * 0.27 + noise(r, 0, 4) * 0.2, c = Math.floor((x + o) / 0.55), gx = fr1((x + o) / 0.55), gz = fr1(z / 0.42), n = noise(r, c, 4); if (n > 0.88) return ['grassDry', 1]; if (gx < 0.1 || gz < 0.16) return [noise(X, Y, 3) > 0.5 ? 'grassDark' : 'soil', 2]; return ['path', gz > 0.8 ? 3 : n > 0.55 ? 3 : n < 0.15 ? 1 : 2]; },
  roadReal: (x, z, X, Y) => ['road', noise(X, Y, 13) > 0.95 ? 3 : 2],
  roadFantasy: (x, z, X, Y) => ['road', noise(X, Y, 14) > 0.88 ? 1 : noise(X, Y, 15) > 0.93 ? 3 : 2],
};
export const LAND = { real: { path: 'pathReal', road: 'roadReal' }, fantasy: { path: 'pathFantasy', road: 'roadFantasy' } };
// V2 generalized fallback: a room kind the kit has never seen (a trait-derived kind such as 'comms-like', or anything
// new) takes its base kind's floor, else the spare-room floor. Never undefined.
const baseKind = kind => String(kind ?? '').replace(/-like$/, '');
export const floorFor = (theme, kind) => { const F = FLOORS[theme] ?? FLOORS.real; return F[kind] ?? F[baseKind(kind)] ?? F.spare; };

// ---- Props. Each theme maps a furnishing type, refined by the room kind, to a recipe. ------------------------------
const box = (u0, u1, v0, v1, h0, h1, mat) => ['box', u0, u1, v0, v1, h0, h1, mat];
const face = (f, a0, a1, b0, b1, mat) => ['face', f, a0, a1, b0, b1, mat];
const REAL = {
  desk: [box(-0.5, 0.5, -0.5, 0.5, 0.72, 0.78, 'woodLight'), box(-0.48, -0.42, -0.4, 0.4, 0, 0.72, 'metalDark'), box(0.42, 0.48, -0.4, 0.4, 0, 0.72, 'metalDark'),
    box(-0.15, 0.15, 0.1, 0.3, 0.78, 1.2, 'frame'), face('front', 0.08, 0.92, 0.1, 0.9, 'screen'), box(-0.05, 0.05, 0.25, 0.35, 0.78, 0.9, 'metalDark'), ['light', 0, 0, 1.0, 'screen']],
  'desk@command': [box(-0.5, 0.5, -0.5, 0.5, 0.72, 0.8, 'woodDark'), box(-0.5, 0.5, 0.2, 0.5, 0, 0.72, 'woodDark'), box(-0.46, -0.05, 0.05, 0.25, 0.8, 1.22, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'), box(0.05, 0.46, 0.05, 0.25, 0.8, 1.22, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'), ['light', 0, 0, 1.0, 'screen']],
  'desk@development': [box(-0.5, 0.5, -0.5, 0.5, 0.74, 0.84, 'wood'), box(-0.48, -0.4, -0.45, 0.45, 0, 0.74, 'wood'), box(0.4, 0.48, -0.45, 0.45, 0, 0.74, 'wood'), box(-0.46, 0.46, -0.4, 0.4, 0.18, 0.24, 'wood'),
    box(-0.35, -0.1, 0.0, 0.3, 0.84, 0.92, 'metal'), box(0.15, 0.3, -0.2, 0.2, 0.84, 1.0, 'hivis'), box(-0.45, 0.45, 0.42, 0.5, 0.84, 1.45, 'steel'), face('front', 0.05, 0.25, 0.3, 0.7, 'metal'), face('front', 0.35, 0.45, 0.2, 0.8, 'yellow'), face('front', 0.6, 0.9, 0.45, 0.55, 'hivis')],
  // Codex's engineering station: two monitors (primary) + a test rig (supporting) + a status LED (accent).
  'desk@testing': [box(-0.5, 0.5, -0.5, 0.5, 0.72, 0.78, 'white'), box(-0.48, -0.42, -0.4, 0.4, 0, 0.72, 'metal'), box(0.42, 0.48, -0.4, 0.4, 0, 0.72, 'metal'),
    box(-0.46, -0.02, 0.12, 0.3, 0.78, 1.28, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'), box(0.02, 0.4, 0.12, 0.3, 0.78, 1.24, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'),
    box(0.18, 0.46, -0.42, -0.12, 0.78, 0.9, 'metalDark'), face('front', 0.15, 0.35, 0.3, 0.7, 'led'), ['light', 0, 0, 1.0, 'screen']],
  // Graphite task chair: a darker, lower silhouette than the desk it serves (it never merges into the desk).
  officeChair: [box(-0.36, 0.36, -0.36, 0.36, 0.4, 0.48, 'fabric2'), box(-0.34, 0.34, 0.3, 0.46, 0.48, 0.92, 'steel'), box(-0.05, 0.05, -0.05, 0.05, 0.05, 0.4, 'metalDark'), box(-0.4, 0.4, -0.4, 0.4, 0, 0.05, 'metalDark')],
  chair: [box(-0.4, 0.4, -0.4, 0.4, 0.42, 0.5, 'wood'), box(-0.4, 0.4, 0.3, 0.5, 0.5, 0.95, 'wood'), box(-0.4, -0.3, -0.4, -0.3, 0, 0.42, 'woodDark'), box(0.3, 0.4, -0.4, -0.3, 0, 0.42, 'woodDark')],
  roundTable: [box(-0.5, 0.5, -0.5, 0.5, 0.7, 0.76, 'woodLight'), box(-0.08, 0.08, -0.08, 0.08, 0.05, 0.7, 'metalDark'), box(-0.3, 0.3, -0.3, 0.3, 0, 0.05, 'metalDark'), box(-0.1, 0.1, 0.0, 0.2, 0.76, 0.84, 'white')],
  couch: [box(-0.5, 0.5, -0.5, 0.5, 0.12, 0.42, 'fabric2'), box(-0.5, 0.5, 0.25, 0.5, 0.42, 0.85, 'fabric2'), box(-0.5, -0.4, -0.5, 0.25, 0.42, 0.62, 'fabric2'), box(0.4, 0.5, -0.5, 0.25, 0.42, 0.62, 'fabric2'), box(-0.2, 0.0, 0.05, 0.25, 0.42, 0.62, 'brand')],
  armchair: [box(-0.5, 0.5, -0.5, 0.5, 0.12, 0.42, 'leather'), box(-0.5, 0.5, 0.25, 0.5, 0.42, 0.85, 'leather'), box(-0.5, -0.35, -0.5, 0.25, 0.42, 0.62, 'leather'), box(0.35, 0.5, -0.5, 0.25, 0.42, 0.62, 'leather')],
  counter: [box(-0.5, 0.5, -0.5, 0.5, 0, 0.84, 'white'), face('front', 0.02, 0.98, 0.05, 0.92, 'wood'), box(-0.5, 0.5, -0.5, 0.5, 0.84, 0.9, 'metalDark')],
  coffeeMachine: [box(-0.4, 0.4, -0.3, 0.4, 0, 0.45, 'metalDark'), face('front', 0.3, 0.7, 0.55, 0.8, 'ledRed'), box(-0.15, 0.15, -0.5, -0.2, 0, 0.12, 'white')],
  // A quiet vending machine: brushed metal, glass front, a thin brand band (no permanently lit screen).
  vending: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.9, 'metal'), face('front', 0.08, 0.66, 0.14, 0.86, 'glassNight'), face('front', 0.12, 0.62, 0.3, 0.34, 'sticky'), face('front', 0.12, 0.62, 0.55, 0.59, 'fabric'), face('front', 0.72, 0.92, 0.45, 0.62, 'metalDark'), face('front', 0, 1, 0.9, 0.97, 'brand')],
  bookshelf: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.9, 'wood'), face('front', 0.06, 0.94, 0.06, 0.3, 'books'), face('front', 0.06, 0.94, 0.36, 0.62, 'books'), face('front', 0.06, 0.94, 0.68, 0.94, 'books')],
  printer: [box(-0.5, 0.5, -0.5, 0.5, 0, 0.75, 'plastic'), box(-0.4, 0.4, -0.4, 0.3, 0.75, 1.0, 'white'), face('front', 0.6, 0.8, 0.3, 0.5, 'led'), box(-0.3, 0.3, -0.5, -0.1, 0.75, 0.8, 'paper')],
  plant: [box(-0.4, 0.4, -0.4, 0.4, 0, 0.35, 'pot'), ['blob', 0, 0, 0.75, 6, 6, 'leaf'], ['blob', -0.15, 0, 1.0, 4, 4, 'leafLight'], ['blob', 0.2, 0, 0.6, 4, 3, 'leaf']],
  reviewConsole: [box(-0.5, 0.5, -0.5, 0.5, 0.7, 0.78, 'white'), box(-0.5, 0.5, 0.2, 0.5, 0, 0.7, 'metal'), box(-0.46, -0.18, 0.1, 0.3, 0.78, 1.2, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'), box(-0.14, 0.14, 0.1, 0.3, 0.78, 1.25, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'),
    box(0.18, 0.46, 0.1, 0.3, 0.78, 1.2, 'frame'), face('front', 0.06, 0.94, 0.1, 0.9, 'screen'), ['light', 0, 0, 1.0, 'screen']],
  serverRack: [box(-0.5, 0.5, -0.5, 0.5, 0, 2.0, 'metalDark'), face('front', 0.1, 0.9, 0.06, 0.94, 'steel'), face('front', 0.15, 0.85, 0.1, 0.9, 'led'), ['light', 0, -0.5, 1.2, 'led']],
  bench: [box(-0.5, 0.5, -0.5, 0.5, 0.4, 0.48, 'wood'), box(-0.5, 0.5, 0.3, 0.5, 0.48, 0.85, 'wood'), box(-0.46, -0.4, -0.4, 0.4, 0, 0.4, 'metalDark'), box(0.4, 0.46, -0.4, 0.4, 0, 0.4, 'metalDark')],
  reception: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.0, 'white'), face('front', 0.0, 1, 0.55, 0.7, 'brand'), box(-0.5, 0.5, -0.5, 0.5, 1.0, 1.06, 'woodLight'), box(0.1, 0.35, 0.0, 0.3, 1.06, 1.35, 'frame'), face('front', 0.08, 0.92, 0.1, 0.9, 'screen')],
  waterCooler: [box(-0.4, 0.4, -0.4, 0.4, 0, 0.9, 'white'), box(-0.3, 0.3, -0.3, 0.3, 0.9, 1.35, 'water')],
  coffee: [],
};
const FANTASY = {
  desk: [box(-0.5, 0.5, -0.5, 0.5, 0.72, 0.8, 'wood'), box(-0.46, -0.36, -0.4, 0.4, 0, 0.72, 'woodDark'), box(0.36, 0.46, -0.4, 0.4, 0, 0.72, 'woodDark'), box(-0.3, 0.1, -0.2, 0.2, 0.8, 0.82, 'parchment'), box(0.25, 0.32, 0.0, 0.1, 0.8, 0.95, 'white'), ['blob', 0.285, 0.05, 1.0, 1, 2, 'fire'], ['light', 0.285, 0.05, 1.0, 'torch']],
  // War table (command office): a heavy table with the map of the realm, figures on it.
  'desk@command': [box(-0.5, 0.5, -0.5, 0.5, 0.7, 0.82, 'woodDark'), face('top', 0.06, 0.94, 0.1, 0.9, 'parchment'), face('top', 0.3, 0.45, 0.3, 0.5, 'banner'), face('top', 0.6, 0.7, 0.55, 0.7, 'gold'), box(-0.46, -0.36, -0.42, 0.42, 0, 0.7, 'woodDark'), box(0.36, 0.46, -0.42, 0.42, 0, 0.7, 'woodDark'), box(-0.1, -0.04, -0.1, -0.02, 0.82, 0.92, 'gold'), box(0.15, 0.21, 0.1, 0.18, 0.82, 0.9, 'banner')],
  // The forge (Claude's workshop): stone hearth with fire, an anvil beside it.
  'desk@development': [box(-0.5, 0.1, -0.2, 0.5, 0, 0.9, 'stone'), face('front', 0.15, 0.85, 0.15, 0.6, 'fire'), box(-0.45, 0.05, 0.1, 0.5, 0.9, 1.9, 'stone'), box(-0.35, -0.05, 0.25, 0.45, 1.9, 2.1, 'steel'), ['light', -0.2, -0.2, 0.4, 'fire'],
    box(0.2, 0.5, -0.3, 0.1, 0, 0.45, 'woodDark'), box(0.18, 0.5, -0.25, 0.05, 0.45, 0.62, 'metalDark'), box(0.45, 0.55, -0.2, 0.0, 0.5, 0.6, 'metalDark')],
  // Analysis station (Codex): a stone pedestal holding a crystal lens on a brass arm, rune plate.
  'desk@testing': [box(-0.5, 0.5, -0.5, 0.5, 0.7, 0.78, 'stone'), box(-0.4, 0.4, -0.4, 0.4, 0, 0.7, 'stone'), face('front', 0.3, 0.7, 0.3, 0.7, 'crystal'), box(-0.05, 0.05, 0.1, 0.2, 0.78, 1.25, 'gold'), ['blob', 0, 0.15, 1.3, 3, 3, 'crystal'], ['light', 0, 0.15, 1.3, 'crystal']],
  officeChair: [box(-0.4, 0.4, -0.4, 0.4, 0.4, 0.5, 'wood'), box(-0.4, 0.4, 0.3, 0.5, 0.5, 1.0, 'woodDark'), box(-0.4, -0.3, -0.4, -0.3, 0, 0.4, 'woodDark'), box(0.3, 0.4, -0.4, -0.3, 0, 0.4, 'woodDark'), box(-0.3, 0.3, 0.32, 0.45, 0.6, 0.9, 'fabric')],
  chair: [box(-0.4, 0.4, -0.4, 0.4, 0.4, 0.48, 'wood'), box(-0.4, 0.4, 0.3, 0.5, 0.48, 0.9, 'woodDark'), box(-0.4, -0.3, -0.4, -0.3, 0, 0.4, 'woodDark'), box(0.3, 0.4, -0.4, -0.3, 0, 0.4, 'woodDark')],
  roundTable: [box(-0.5, 0.5, -0.5, 0.5, 0.68, 0.78, 'wood'), box(-0.4, -0.3, -0.4, -0.3, 0, 0.68, 'woodDark'), box(0.3, 0.4, -0.4, -0.3, 0, 0.68, 'woodDark'), box(-0.4, -0.3, 0.3, 0.4, 0, 0.68, 'woodDark'), box(0.3, 0.4, 0.3, 0.4, 0, 0.68, 'woodDark'),
    box(-0.05, 0.05, -0.05, 0.05, 0.78, 0.92, 'white'), ['blob', 0, 0, 0.98, 1, 2, 'fire'], ['light', 0, 0, 1.0, 'torch'], box(0.15, 0.25, 0.1, 0.2, 0.78, 0.88, 'metal')],
  couch: [box(-0.5, 0.5, -0.5, 0.5, 0.3, 0.45, 'wood'), box(-0.5, 0.5, 0.3, 0.5, 0.45, 0.85, 'woodDark'), box(-0.45, -0.35, -0.45, 0.4, 0, 0.3, 'woodDark'), box(0.35, 0.45, -0.45, 0.4, 0, 0.3, 'woodDark'), box(-0.4, 0.1, -0.4, 0.2, 0.45, 0.5, 'leather')],
  armchair: [box(-0.5, 0.5, -0.5, 0.5, 0.3, 0.45, 'woodDark'), box(-0.5, 0.5, 0.25, 0.5, 0.45, 1.1, 'woodDark'), box(-0.4, 0.4, 0.3, 0.45, 0.5, 0.95, 'fabric'), box(-0.5, -0.38, -0.5, 0.25, 0.45, 0.7, 'woodDark'), box(0.38, 0.5, -0.5, 0.25, 0.45, 0.7, 'woodDark')],
  counter: [box(-0.5, 0.5, -0.5, 0.5, 0, 0.9, 'woodDark'), face('front', 0.04, 0.96, 0.1, 0.85, 'wood'), box(-0.5, 0.5, -0.5, 0.5, 0.9, 0.98, 'wood')],
  coffeeMachine: [box(-0.4, 0.4, -0.3, 0.4, 0, 0.5, 'wood'), face('front', 0, 1, 0.2, 0.3, 'metal'), face('front', 0, 1, 0.7, 0.8, 'metal'), box(-0.1, 0.1, -0.5, -0.3, 0.1, 0.2, 'metal')],
  vending: [box(-0.5, 0.0, -0.5, 0.5, 0, 0.9, 'wood'), face('front', 0, 1, 0.15, 0.25, 'metal'), face('front', 0, 1, 0.75, 0.85, 'metal'), box(0.05, 0.5, -0.5, 0.5, 0, 0.9, 'wood'), face('front', 0, 1, 0.15, 0.25, 'metal'), face('front', 0, 1, 0.75, 0.85, 'metal'), box(-0.3, 0.3, -0.4, 0.4, 0.9, 1.6, 'woodLight'), face('front', 0, 1, 0.2, 0.3, 'metal')],
  bookshelf: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.9, 'woodDark'), face('front', 0.06, 0.94, 0.06, 0.3, 'books'), face('front', 0.06, 0.94, 0.36, 0.62, 'books'), face('front', 0.06, 0.94, 0.68, 0.94, 'books'), box(-0.1, 0.1, -0.3, 0.1, 1.9, 2.0, 'white'), ['blob', 0, -0.1, 2.08, 1, 2, 'fire']],
  printer: [box(-0.15, 0.15, -0.3, 0.3, 0, 1.0, 'woodDark'), box(-0.5, 0.5, -0.5, 0.5, 1.0, 1.12, 'wood'), box(-0.4, 0.4, -0.4, 0.4, 1.12, 1.15, 'parchment')],
  plant: [box(-0.4, 0.4, -0.4, 0.4, 0, 0.35, 'pot'), ['blob', 0, 0, 0.7, 5, 7, 'leaf'], ['blob', 0.1, 0, 1.0, 3, 4, 'leafLight']],
  // Arcane analysis apparatus (the review console): rune bench, crystal lenses, brass frame. Never a screen (C17).
  reviewConsole: [box(-0.5, 0.5, -0.5, 0.5, 0.7, 0.8, 'stone'), box(-0.5, 0.5, 0.0, 0.5, 0, 0.7, 'stone'), face('front', 0.1, 0.9, 0.4, 0.6, 'crystal'), box(-0.4, -0.35, 0.1, 0.2, 0.8, 1.4, 'gold'), box(0.35, 0.4, 0.1, 0.2, 0.8, 1.4, 'gold'), box(-0.4, 0.4, 0.1, 0.2, 1.4, 1.46, 'gold'),
    ['blob', -0.15, 0.15, 1.1, 3, 3, 'crystal'], ['blob', 0.18, 0.15, 1.15, 2, 2, 'crystal'], ['light', 0, 0.15, 1.1, 'crystal']],
  // The Arcane Core (the server bay): a crystal pillar in a stone socket.
  serverRack: [box(-0.5, 0.5, -0.5, 0.5, 0, 0.35, 'stone'), box(-0.25, 0.25, -0.25, 0.25, 0.35, 1.7, 'crystal'), box(-0.5, 0.5, -0.5, 0.5, 1.7, 1.85, 'stone'), ['light', 0, 0, 1.0, 'crystal']],
  bench: [box(-0.5, 0.5, -0.5, 0.5, 0.36, 0.46, 'wood'), box(-0.46, -0.38, -0.4, 0.4, 0, 0.36, 'woodDark'), box(0.38, 0.46, -0.4, 0.4, 0, 0.36, 'woodDark')],
  reception: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.0, 'stone'), face('front', 0.35, 0.65, 0.1, 0.95, 'banner'), face('front', 0.45, 0.55, 0.6, 0.75, 'gold'), box(-0.5, 0.5, -0.5, 0.5, 1.0, 1.08, 'wood'), box(0.2, 0.3, 0.1, 0.2, 1.08, 1.2, 'white'), ['blob', 0.25, 0.15, 1.26, 1, 2, 'fire'], ['light', 0.25, 0.15, 1.25, 'torch']],
  waterCooler: [box(-0.4, 0.4, -0.4, 0.4, 0, 0.8, 'wood'), face('front', 0, 1, 0.2, 0.3, 'metal'), face('front', 0, 1, 0.7, 0.8, 'metal'), box(-0.35, 0.35, -0.35, 0.35, 0.8, 0.84, 'water')],
};
export const PROPS = { real: REAL, fantasy: FANTASY };
export const recipeFor = (theme, type, roomKind) => { const R = PROPS[theme] ?? REAL; return R[`${type}@${roomKind}`] ?? R[type] ?? null; };
// V2 generalized fallback for a furnishing type with no recipe: a cabinet sized by the item's canonical height, its
// trim by a stable hash of the type (so two unknown types differ), in the theme's materials. An explicit empty recipe
// (drawn by its host piece) stays empty.
const GENERIC_TRIM = ['metal', 'woodDark', 'frame', 'brand', 'stone'];
export function recipeOrFallback(theme, type, roomKind, item = {}) {
  const r = recipeFor(theme, type, roomKind) ?? recipeFor(theme, type, baseKind(roomKind));
  if (r) return r;
  // A type some theme deliberately draws as nothing (drawn by its host piece) stays nothing in every theme.
  const known = Object.values(PROPS).map(T => T[`${type}@${roomKind}`] ?? T[type]).filter(Boolean);
  if (known.length && known.every(x => !x.length)) return [];
  const h = Math.max(0.3, Math.min(2.0, Number(item.h) > 0 ? Number(item.h) : 0.9)), salt = [...String(type)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const trim = GENERIC_TRIM[salt % GENERIC_TRIM.length];
  return [box(-0.5, 0.5, -0.5, 0.5, 0, h, theme === 'fantasy' ? 'wood' : 'white'), face('front', 0.08, 0.92, 0.08, 0.9, trim), face('front', 0.44, 0.56, 0.4, 0.6, 'metal'), box(-0.5, 0.5, -0.5, 0.5, h, h + 0.04, theme === 'fantasy' ? 'woodDark' : 'metalDark')];
}

// ---- Wall decor (on a back wall): [width fraction pieces] drawn as a face on the wall plane. -----------------------
// Each is a list of [a0, a1, b0, b1, mat] in fractions of the decor's own rectangle (x0..x1, h0..h1).
export const DECOR = {
  real: {
    whiteboard: [[0, 1, 0, 1, 'metal'], [0.04, 0.96, 0.06, 0.94, 'white'], [0.1, 0.5, 0.7, 0.76, 'brand'], [0.1, 0.7, 0.5, 0.56, 'frame'], [0.1, 0.4, 0.3, 0.36, 'ledRed']],
    statusScreen: [[0, 1, 0, 1, 'frame'], [0.06, 0.94, 0.08, 0.92, 'screen'], [0.15, 0.5, 0.6, 0.7, 'led']],
    taskBoard: [[0, 1, 0, 1, 'woodLight'], [0.05, 0.95, 0.06, 0.94, 'paper'], [0.1, 0.25, 0.6, 0.8, 'sticky'], [0.32, 0.47, 0.6, 0.8, 'sticky'], [0.54, 0.69, 0.6, 0.8, 'sticky'], [0.1, 0.25, 0.2, 0.4, 'sticky']],
    codeWall: [[0, 1, 0, 1, 'frame'], [0.04, 0.96, 0.06, 0.94, 'screen'], [0.1, 0.6, 0.7, 0.75, 'white'], [0.1, 0.45, 0.5, 0.55, 'white'], [0.1, 0.7, 0.3, 0.35, 'white']],
    window: [[0, 1, 0, 1, 'frame'], [0.06, 0.47, 0.06, 0.94, 'glass'], [0.53, 0.94, 0.06, 0.94, 'glass']],
    clock: [[0, 1, 0, 1, 'frame'], [0.15, 0.85, 0.15, 0.85, 'white']],
  },
  fantasy: {
    whiteboard: [[0, 1, 0, 1, 'woodDark'], [0.05, 0.95, 0.06, 0.94, 'parchment'], [0.15, 0.45, 0.3, 0.7, 'woodDark'], [0.55, 0.85, 0.5, 0.56, 'woodDark']],
    statusScreen: [[0.2, 0.8, 0, 1, 'banner'], [0.2, 0.8, 0.9, 1, 'gold'], [0.4, 0.6, 0.45, 0.65, 'gold']],
    taskBoard: [[0, 1, 0, 1, 'woodDark'], [0.08, 0.3, 0.55, 0.85, 'parchment'], [0.38, 0.6, 0.5, 0.82, 'parchment'], [0.68, 0.9, 0.55, 0.88, 'parchment'], [0.2, 0.42, 0.12, 0.42, 'parchment']],
    codeWall: [[0.1, 0.9, 0, 1, 'banner'], [0.1, 0.9, 0.92, 1, 'gold'], [0.3, 0.7, 0.4, 0.7, 'gold']],
    window: [[0, 1, 0, 1, 'stone'], [0.15, 0.85, 0.08, 0.8, 'glass'], [0.25, 0.75, 0.8, 0.9, 'glass']],
    clock: [[0.4, 0.6, 0, 0.6, 'woodDark'], [0.35, 0.65, 0.6, 1, 'fire']],
  },
};

// V2: unknown wall decor falls back to a framed panel in the theme's materials (a notice board / a parchment).
export const decorFor = (theme, type) => DECOR[theme]?.[type] ?? (theme === 'fantasy' ? [[0, 1, 0, 1, 'woodDark'], [0.08, 0.92, 0.1, 0.9, 'parchment'], [0.2, 0.8, 0.6, 0.66, 'woodDark']] : [[0, 1, 0, 1, 'frame'], [0.06, 0.94, 0.08, 0.92, 'paper'], [0.15, 0.6, 0.62, 0.7, 'brand']]);

// ---- Construction (V2). The canonical stage chooses WHICH pieces a site shows (compose.mjs, same geometry in both
// themes); this table only names each role's material per theme: Real is a modern steel-and-concrete site (hi-vis
// tape, cones, steel frame, concrete cladding, scaffold, floodlight); Fantasy is a masons' and carpenters' yard (rope
// and pegs, barrels, timber frame, ashlar, timber scaffold, brazier).
export const SITE = {
  real: { stake: 'hivis', tape: 'hivis', slab: 'concrete', slabTop: 'cap', rebar: 'steel', frame: 'column', beam: 'column', clad: 'concrete', glazing: 'glassNight', scaffold: 'yellow', plank: 'woodLight', pipe: 'metal', duct: 'metalDark', crate: 'woodLight', strap: 'metalDark', cone: 'hivis', coneBand: 'white', pile: 'concrete', pile2: 'woodLight', sign: 'metalDark', signFace: 'brand', barrier: 'hivis', barrier2: 'white', wait: 'yellow', lamp: 'lamp', light: 'lamp', tool: 'metal', toolHead: 'yellow' },
  fantasy: { stake: 'woodDark', tape: 'woodLight', slab: 'stone', slabTop: 'cap', rebar: 'woodDark', frame: 'woodDark', beam: 'wood', clad: 'concrete', glazing: 'glassNight', scaffold: 'woodLight', plank: 'wood', pipe: 'gold', duct: 'slate', crate: 'wood', strap: 'metal', cone: 'woodDark', coneBand: 'metal', pile: 'stone', pile2: 'wood', sign: 'woodDark', signFace: 'banner', barrier: 'hivis', barrier2: 'woodDark', wait: 'gold', lamp: 'fire', light: 'torch', tool: 'woodDark', toolHead: 'gold' },
};

// ---- Vegetation and land props for the natural edge. ---------------------------------------------------------------
// Each is drawn by compose.mjs from these numbers: canopy blobs (dx, dy, rx, ry, palette, step) over a trunk.
export const VEGETATION = {
  real: {
    tree: { trunk: [2, 9], blobs: [[0, -16, 8, 7, 'leaf', 1], [-3, -18, 6, 5, 'leaf', 2], [3, -20, 5, 5, 'leafLight', 2], [-1, -22, 4, 3, 'leafLight', 3]] },
    treeBig: { trunk: [3, 12], blobs: [[0, -20, 11, 9, 'leaf', 1], [-4, -23, 8, 7, 'leaf', 2], [4, -25, 7, 6, 'leafLight', 2], [0, -28, 5, 4, 'leafLight', 3]] },
    pine: { trunk: [2, 4], cone: [[0, -26, 7, 22, 'pine', 1], [0, -26, 5, 18, 'pine', 2]] },
    treeSmall: { trunk: [2, 6], blobs: [[0, -11, 6, 5, 'leaf', 1], [-2, -13, 4, 4, 'leaf', 2], [2, -14, 3, 3, 'leafLight', 3]] },
    pineSmall: { trunk: [2, 3], cone: [[0, -18, 5, 15, 'pine', 1], [0, -18, 3, 12, 'pine', 2]] },
    rockBig: { blobs: [[0, -4, 9, 5, 'rock', 2], [-2, -6, 6, 4, 'rock', 3], [-3, -8, 3, 2, 'rock', 4], [5, -2, 3, 2, 'rock', 2], [-6, -1, 2, 1, 'grassDark', 2]] },
    tuft: { dots: [[0, 0, 'grassDark'], [1, -1, 'grassDark'], [-1, 0, 'grassDark']] },
    bush: { blobs: [[0, -3, 5, 3, 'bush', 1], [-1, -4, 3, 2, 'bush', 2], [2, -5, 2, 2, 'leafLight', 3]] },
    rock: { blobs: [[0, -2, 4, 3, 'rock', 2], [-1, -3, 3, 2, 'rock', 3], [-1, -4, 1, 1, 'rock', 4]] },
    flowers: { dots: [[0, 0, 'flower'], [2, -1, 'flower2'], [-2, 1, 'flower'], [3, 1, 'flower']] },
  },
  fantasy: {
    tree: { trunk: [2, 8], blobs: [[0, -15, 8, 7, 'leaf', 1], [-3, -17, 6, 5, 'leaf', 2], [3, -19, 5, 4, 'leafLight', 2]] },
    treeBig: { trunk: [3, 12], blobs: [[0, -20, 11, 9, 'leaf', 0], [-4, -23, 8, 7, 'leaf', 1], [4, -25, 7, 6, 'leaf', 2], [0, -28, 5, 4, 'leafLight', 2]] },
    pine: { trunk: [2, 4], cone: [[0, -30, 8, 26, 'pine', 1], [0, -30, 5, 21, 'pine', 2]] },
    treeSmall: { trunk: [2, 6], blobs: [[0, -11, 6, 5, 'leaf', 1], [-2, -13, 4, 4, 'leaf', 2], [2, -14, 3, 3, 'leafLight', 2]] },
    pineSmall: { trunk: [2, 3], cone: [[0, -19, 5, 16, 'pine', 1], [0, -19, 3, 13, 'pine', 2]] },
    rockBig: { blobs: [[0, -5, 10, 6, 'rock', 2], [-2, -7, 7, 4, 'rock', 3], [-3, -9, 3, 2, 'rock', 4], [6, -2, 3, 2, 'rock', 2], [-7, -1, 2, 1, 'moss', 2], [2, -10, 2, 1, 'moss', 2]] },
    tuft: { dots: [[0, 0, 'grassDark'], [1, -1, 'grassDark'], [-1, 0, 'grassDark']] },
    bush: { blobs: [[0, -3, 5, 3, 'bush', 1], [-1, -4, 3, 2, 'bush', 2]] },
    rock: { blobs: [[0, -3, 6, 4, 'rock', 2], [-1, -4, 4, 3, 'rock', 3], [-2, -6, 2, 1, 'rock', 4], [3, -1, 1, 1, 'grassDark', 2]] },
    flowers: { dots: [[0, 0, 'flower'], [2, -1, 'flower2'], [-2, 1, 'flower']] },
  },
};
// Which plants the edge grows, by theme (weights): Fantasy leans to pine and rock, Real to broadleaf and shrubs.
export const EDGE_MIX = { real: [['tree', 4], ['treeBig', 2], ['pine', 1], ['bush', 3], ['rock', 2], ['flowers', 2]], fantasy: [['pine', 5], ['tree', 2], ['treeBig', 1], ['bush', 2], ['rock', 4], ['flowers', 1]] };
// Exterior lights along paths: Real lamp posts, Fantasy torch posts.
export const POSTS = {
  // Real: restrained low bollards with a light band (no tall street lamps at a compact HQ).
  real: { recipe: [box(-0.5, 0.5, -0.5, 0.5, 0, 0.62, 'metalDark'), box(-0.5, 0.5, -0.5, 0.5, 0.62, 0.74, 'lamp'), box(-0.5, 0.5, -0.5, 0.5, 0.74, 0.86, 'metalDark')], light: [0, 0, 0.68, 'lamp'], w: 0.22, spacing: 4 },
  fantasy: { recipe: [box(-0.5, 0.5, -0.5, 0.5, 0, 1.6, 'woodDark'), box(-0.6, 0.6, -0.6, 0.6, 1.6, 1.7, 'metal'), ['blob', 0, 0, 1.85, 2, 3, 'fire']], light: [0, 0, 1.8, 'torch'], w: 0.22, spacing: 5 },
};
// Torches / wall lamps on interior back walls, every `spacing` metres, clear of decor.
export const SCONCES = {
  real: { pieces: [[0, 1, 0, 0.3, 'metalDark'], [0.1, 0.9, 0.3, 1, 'lamp']], w: 0.3, h0: 1.55, h1: 1.75, spacing: 3.2, light: 'lamp' },
  fantasy: { pieces: [[0.3, 0.7, 0, 0.5, 'woodDark'], [0.2, 0.8, 0.5, 0.6, 'metal'], [0.25, 0.75, 0.6, 1, 'fire']], w: 0.25, h0: 1.4, h1: 1.8, spacing: 2.6, light: 'torch' },
};
// Glow sprites per light kind: radius (art px), colour, loop.
export const GLOWS = {
  lamp: { r: 16, colour: '#ffcf7a', k: 0.55, loop: 'flicker-soft' }, torch: { r: 14, colour: '#ff9a3a', k: 0.7, loop: 'flicker' }, fire: { r: 24, colour: '#ff7a2a', k: 0.85, loop: 'flicker' },
  wash: { r: 6, colour: '#ffd9a0', k: 0.2, loop: 'steady' },
  crystal: { r: 16, colour: '#5fd0ff', k: 0.6, loop: 'pulse' }, screen: { r: 7, colour: '#5fb8ff', k: 0.4, loop: 'steady' }, led: { r: 4, colour: '#4dff88', k: 0.3, loop: 'steady' },
};
