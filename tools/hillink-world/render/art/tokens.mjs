// Pass 5H: the shared visual DNA of Hillink World. Real and Fantasy look different, but both draw from these rules,
// so a character, a prop or a status marker made for one belongs in the other. Everything here is plain data
// (numbers, colours, names): no function in this file draws, and nothing in it reads World state.

// ---- Scale and proportions (fractions of a character's height h). --------------------------------------------------
// A compact game character: an oversized head (~1/3 of the figure), a short blocky torso, short separated legs and
// small arms. Hip and seat heights stay the World's landmarks (world/scale.mjs) so chairs and desks still fit.
export const PROPORTIONS = {
  head: 0.185, // head radius; the head is ~0.37h across
  headWidth: 1.06, // heads are slightly wider than tall: chunkier silhouettes
  torso: 0.25, // shoulder to hip
  torsoWidth: { front: 0.38, diag: 0.33, side: 0.26 },
  leg: { width: 0.115, gap: 0.045 },
  arm: { width: 0.085, length: 0.2 },
  hand: 0.048,
  foot: { w: 0.12, h: 0.055 },
  neckOverlap: 0.82, // head centre sits this many radii above the shoulders
};

// ---- Outline, shadow, light. ----------------------------------------------------------------------------------------
export const OUTLINE = {
  ink: 'rgba(24,20,28,0.95)', // one outline colour for every character and prop in both themes
  weight: 0.034, // × character height; props use the same rule against their own height, clamped below
  min: 0.6, max: 2.2,
};
export const SHADOW = {
  contact: 'rgba(12,10,20,0.32)', // the grounding ellipse under every character and prop
  contactSize: [0.26, 0.075], // × h (half width, half height)
  cast: 'rgba(12,10,20,0.16)', // soft cast shadow, always toward the lower right (light from the upper left)
  castOffset: [0.12, 0.02],
};
export const LIGHT = {
  from: 'upper-left', // every volume is lit from the upper left in both themes
  highlight: 1.14, shade: 0.8, deepShade: 0.66, // multipliers on a base colour
  glow: { real: ['monitor', 'window', 'rack-led', 'lamp'], fantasy: ['torch', 'forge', 'crystal', 'portal', 'window', 'engine'] },
};

// ---- Depth planes (explicit, shared by both themes). ------------------------------------------------------------------
export const DEPTH_PLANES = ['farBackground', 'background', 'ground', 'building', 'agent', 'foreground', 'overlay'];
export const PLANE_NOTES = {
  farBackground: 'sky, skyline or mountains; never occludes anything',
  background: 'distant buildings, windows, tree lines',
  ground: 'terrain, floors, roads, paths, rugs, water',
  building: 'architecture, rooms, furniture; depth-sorted together with the agent plane by footprint',
  agent: 'agents, workers, creatures, carts',
  foreground: 'front fences, plants, signs and nearby props drawn over characters behind them',
  overlay: 'interaction and status UI only (labels, chips, selection); never scenery',
};

// ---- Directions. ---------------------------------------------------------------------------------------------------
// Five authored views; the left-facing ones mirror the right-facing ones. The view comes from the character's
// smoothed heading (engine/motion.mjs) or, without one, its four-way facing.
export const VIEWS = ['front', 'fdiag', 'side', 'bdiag', 'back'];
export const MIRRORED = { fdiag: true, side: true, bdiag: true };

// ---- Animation standards. ------------------------------------------------------------------------------------------
// Every clip a rig may be asked for, its loop and timing range (seconds per cycle). New art must fit these, so an
// animation added later never needs the character rebuilt.
export const CLIPS = {
  idle: { loop: true, cycle: [2.4, 3.2], note: 'breathing bob, blink, occasional glance' },
  walk: { loop: true, cycle: [0.5, 0.7], note: 'stride scales with speed; arms swing opposite' },
  work: { loop: true, cycle: [0.8, 1.6], note: 'hands at the surface; tool strikes for builders' },
  type: { loop: true, cycle: [0.25, 0.4], note: 'seated or standing at a keyboard' },
  carry: { loop: true, cycle: [0.5, 0.7], note: 'both hands under the carried object' },
  talk: { loop: true, cycle: [1.2, 2], note: 'one hand gestures' },
  think: { loop: true, cycle: [2, 3], note: 'hand to chin' },
  inspect: { loop: true, cycle: [1.4, 2], note: 'tablet, scroll or lens held up' },
  waiting: { loop: true, cycle: [1.4, 2.2], note: 'weight shift, foot tap' },
  blocked: { loop: false, cycle: [0.6, 1], note: 'hands up, then arms crossed' },
  celebrate: { loop: false, cycle: [1.6, 2.6], note: 'only on canonical completion' },
};

// ---- Attachment points (fractions of h from the feet, before mirroring; x is toward the facing side). ---------------
export const ATTACH = {
  head: { x: 0, y: -0.71 },
  hatTop: { x: 0, y: -0.9 },
  handNear: { x: 0.12, y: -0.36 },
  handFar: { x: -0.12, y: -0.36 },
  back: { x: -0.08, y: -0.5 },
  hip: { x: 0.14, y: -0.28 },
  chest: { x: 0.05, y: -0.45 },
};

// ---- Status language (one meaning, two metaphors). --------------------------------------------------------------------
// The same canonical situation always reads the same way: the colour and the pose never change between themes; only the
// small emblem does (a monitor chip in Real, a banner or seal in Fantasy).
export const STATUS = {
  working: { color: '#34d27b', pose: 'work', real: 'chip-play', fantasy: 'spark', label: 'Working' },
  travelling: { color: '#4aa3ff', pose: 'walk', real: 'chip-arrow', fantasy: 'boots', label: 'On the way' },
  waiting: { color: '#f4a23b', pose: 'waiting', real: 'chip-clock', fantasy: 'hourglass', label: 'Waiting' },
  blocked: { color: '#e5484d', pose: 'blocked', real: 'chip-bang', fantasy: 'broken-seal', label: 'Blocked' },
  completed: { color: '#ffd23f', pose: 'celebrate', real: 'chip-check', fantasy: 'star', label: 'Completed' },
  idle: { color: '#8b93a7', pose: 'idle', real: null, fantasy: null, label: 'Idle' },
  offline: { color: '#5a6072', pose: 'offline', real: 'chip-moon', fantasy: 'moon', label: 'Offline' },
  candidate: { color: '#b58cff', pose: 'waiting', real: 'chip-badge', fantasy: 'rune', label: 'Not active yet' },
  'needs-owner': { color: '#ff5fa2', pose: 'waiting', real: 'chip-hand', fantasy: 'scroll-seal', label: 'Needs Kyle' },
};
export const STATUS_ORDER = ['needs-owner', 'blocked', 'waiting', 'working', 'travelling', 'completed', 'candidate', 'idle', 'offline'];

// ---- Palettes. -----------------------------------------------------------------------------------------------------
// Theme palettes share value structure (a light, a mid and a dark per material family) so the two worlds sit at the same
// contrast and a character reads the same against either.
export const PALETTE = {
  real: {
    sky: ['#9fc6e8', '#d9ecf7', '#f6efe2'], grass: ['#7fb069', '#6a9c56', '#57874a'], path: ['#d9d4c7', '#c4bdae', '#a79f8f'],
    floor: { office: ['#e8e4dc', '#dcd6cb'], tech: ['#cfd6de', '#c1c9d2'], wood: ['#c89b6d', '#b8895c'], carpet: ['#5f6f8c', '#566580'] },
    wall: ['#f1efea', '#dcd8d0', '#b9b3a8'], trim: '#3b4250', glass: 'rgba(170,215,245,0.35)',
    wood: ['#c89b6d', '#9b6f45', '#6f4c2d'], metal: ['#c9d0d8', '#8d97a3', '#565f6b'], fabric: ['#5b6f95', '#46597c'],
    accent: '#ff7a1a', screen: '#5ec8ff', leaf: ['#62b066', '#3f8f4f', '#2d6b3a'], light: 'rgba(255,240,200,0.22)',
  },
  fantasy: {
    sky: ['#6c8fd0', '#b9cdf0', '#f7d9a8'], grass: ['#6fae4f', '#5a9640', '#467c33'], path: ['#c9b48f', '#b09b76', '#8e7b5c'],
    stone: ['#cfc6b3', '#aea38c', '#857a66'], wood: ['#a8733f', '#7f5430', '#5a3a20'], roof: { red: ['#b5553a', '#8e3d2a'], blue: ['#4f6db0', '#3a5389'], slate: ['#5f6b7a', '#474f5c'], thatch: ['#d6b267', '#b08f4a'] },
    metal: ['#c9ccd2', '#8d929c', '#5a5f69'], gold: ['#f2c94c', '#c89b2c'], magic: ['#b58cff', '#7fe3ff'], fire: ['#ffd36b', '#ff8a2a', '#c8421e'],
    leaf: ['#72b35a', '#4f8f3f', '#356b2c'], water: ['#5fa8d8', '#3f83b8'], banner: ['#8e2a2a', '#2f5e39', '#2a4f8e', '#d9b44a'],
  },
};
