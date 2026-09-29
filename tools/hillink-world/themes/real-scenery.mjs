// Realistic theme scenery: the animation layer painted over Kyle's HQ concept image.
// Authored in source-image pixels, then shifted by the art origin into world units.
// Nothing here is Hillink data: it is ambience plus the places where real activity shows up.
const O = [150, 55];
const p = (x, y) => [x + O[0], y + O[1]];
const pts = list => list.map(([x, y]) => p(x, y));
const r = (x, y, w, h) => [x + O[0], y + O[1], w, h];

export const realScenery = {
  characterHeight: 44,
  npcHeight: 39,
  walkSpeed: 92,
  liftSpeed: 75,
  // The HILLINK water wall by the plaza, and the painted people standing in front of it.
  water: [{ poly: pts([[201, 617], [387, 619], [387, 729], [201, 721]]), pool: pts([[205, 724], [410, 732], [420, 782], [214, 782]]), tint: '#9fd8ff' }],
  patches: [
    { circle: [...p(222, 686), 7.5] }, { poly: pts([[209, 693], [236, 693], [238, 730], [207, 730]]) },
    { circle: [...p(254, 706), 7.5] }, { poly: pts([[241, 713], [266, 713], [266, 732], [241, 732]]) },
  ],
  // Monitors and wall displays: ambient flicker always; bright and busy when their room (or station) is in real use.
  screens: [
    { rect: r(330, 352, 20, 25), room: 'development', kind: 'dash' },
    { rect: r(280, 361, 19, 25), room: 'development', station: 'desk3', kind: 'log' },
    { rect: r(345, 381, 25, 18), room: 'development', station: 'desk4', kind: 'code' },
    { rect: r(373, 381, 25, 18), room: 'development', station: 'desk5', kind: 'code' },
    { rect: r(424, 401, 15, 24), room: 'development', station: 'desk6', kind: 'graph' },
    { rect: r(640, 527, 30, 33), room: 'testing', kind: 'log' },
    { rect: r(680, 527, 30, 30), room: 'testing', kind: 'radar' },
    { rect: r(722, 538, 24, 33), room: 'testing', station: 'rig', kind: 'code' },
    { rect: r(748, 542, 24, 29), room: 'testing', kind: 'graph' },
    { rect: r(262, 515, 35, 30), room: 'operations', kind: 'dash' },
    { rect: r(299, 518, 41, 27), room: 'operations', kind: 'log' },
    { rect: r(347, 515, 30, 27), room: 'operations', kind: 'graph' },
    { rect: r(150, 490, 20, 35), room: 'operations', kind: 'graph' },
    { rect: r(527, 392, 15, 30), room: 'archive', kind: 'dash' },
    { rect: r(590, 408, 15, 22), room: 'archive', station: 'reading1', kind: 'code' },
    { rect: r(630, 397, 17, 23), room: 'archive', station: 'reading2', kind: 'graph' },
    { rect: r(740, 385, 15, 30), room: 'archive', kind: 'dash' },
    { rect: r(517, 142, 20, 38), room: 'command', kind: 'graph' },
    { rect: r(530, 260, 57, 30), room: 'comms', kind: 'dash', meeting: true },
    { rect: r(700, 277, 25, 23), room: 'comms', kind: 'log', meeting: true },
  ],
  leds: [
    { rect: r(1192, 547, 10, 58), cols: 2, rows: 12, colors: ['#3aa0ff', '#7fd4ff', '#2f6bff'] },
    { rect: r(1320, 505, 20, 50), cols: 3, rows: 8, colors: ['#23e0c8', '#5ef0ff'] },
    { rect: r(1242, 512, 48, 26), cols: 6, rows: 3, colors: ['#4d8dff', '#9cc6ff'] },
  ],
  fans: [{ at: p(1108, 478), r: 9 }, { at: p(1150, 470), r: 9 }, { at: p(1300, 492), r: 7 }],
  crane: { apex: p(1266, 143), pivot: p(1265, 172), jib: 108, counter: 32, drop: [18, 120], color: '#f0a21e' },
  heli: { hub: p(271, 191), radius: 104, tail: p(207, 211), tailR: 9 },
  lift: { id: 'tower', w: 44, h: 58 },
  vehicles: [
    { points: pts([[1410, 668], [1290, 700], [1190, 740], [1120, 774], [1085, 800]]), speed: 58, every: 8, chance: 0.75, kinds: ['car', 'car', 'suv', 'van'] },
    { points: pts([[1075, 786], [1175, 727], [1285, 688], [1410, 652]]), speed: 52, every: 10, chance: 0.7, kinds: ['car', 'suv', 'car'] },
    { points: pts([[-20, 736], [95, 760], [205, 792]]), speed: 42, every: 12, chance: 0.6, kinds: ['car', 'suv'], scale: 1.05 },
    { points: pts([[1410, 470], [1350, 452], [1395, 470]]), speed: 30, every: 40, chance: 0.9, kinds: ['truck'], stopAt: 0.5, stopFor: 9, colors: ['#f0a21e'], scale: 0.85 },
  ],
  blinkers: [
    { at: p(1266, 141), color: '#ff3b30', period: 1.4, r: 2.4 },
    { at: p(1150, 285), color: '#ffb020', period: 2.1, r: 2 },
    { at: p(1350, 258), color: '#ffb020', period: 1.7, r: 2 },
    { at: p(1372, 318), color: '#ffb020', period: 2.6, r: 2 },
    { at: p(1290, 498), color: '#ff3b30', period: 3.1, r: 1.8 },
    { at: p(180, 266), color: '#4db2ff', period: 2.4, r: 2 },
    { at: p(368, 262), color: '#4db2ff', period: 2.4, r: 2, phase: 1.2 },
  ],
  sparks: [p(1195, 360), p(1300, 330), p(1335, 378), p(1230, 300), p(1160, 330)],
  signs: [
    { rect: r(548, 28, 202, 40), color: '#dfe9ff' },
    { rect: r(1208, 310, 126, 38), color: '#ffd28a' },
    { rect: r(215, 640, 125, 75), color: '#9fd8ff' },
  ],
  twinkle: [{ rect: r(0, 55, 420, 85), count: 26 }, { rect: r(880, 130, 360, 90), count: 22 }],
  motes: { rect: r(0, 560, 1386, 225), count: 26, color: '#ffd9a0' },
  // Rooms brighten and gain activity when real agents work in them.
  rooms: {
    development: r(20, 340, 445, 110), testing: r(620, 500, 185, 125), archive: r(470, 360, 330, 95), comms: r(495, 250, 300, 85),
    command: r(500, 95, 300, 100), deploy: r(1080, 150, 300, 260), servers: r(1060, 450, 290, 180), operations: r(20, 480, 440, 130), lounge: r(590, 680, 215, 105),
  },
  // Ambient staff (decorative only; never tied to Hillink data).
  npcs: [
    { route: pts([[160, 774], [300, 778], [430, 772]]), look: { shirt: '#6f7f99', pants: '#2c3340', hair: '#3b2a20' }, speed: 20, pause: 5 },
    { route: pts([[620, 770], [700, 774]]), look: { shirt: '#a0525e', pants: '#2b2f38', hair: '#c9a36b' }, pose: 'coffee', speed: 14, pause: 9 },
    { route: pts([[555, 455], [700, 457]]), look: { shirt: '#c7cfda', pants: '#394150', hair: '#1c1612' }, speed: 18, pause: 6 },
    { route: pts([[250, 603], [430, 607]]), look: { shirt: '#4f6d7a', pants: '#20252c', hair: '#5a3b24' }, speed: 19, pause: 7 },
    { route: pts([[330, 250], [396, 245]]), look: { shirt: '#39424f', pants: '#1d2229', vest: '#f28c28', hat: 'cap', hatColor: '#1f2733' }, speed: 12, pause: 10 },
    { route: pts([[1100, 392], [1210, 388]]), look: { shirt: '#44505e', pants: '#2a3542', vest: '#f2b01e', hat: 'hardhat' }, speed: 15, pause: 6 },
    { route: pts([[1222, 297], [1292, 294]]), look: { shirt: '#5b4a3a', pants: '#2a3542', vest: '#f28c28', hat: 'hardhat', hatColor: '#ffffff' }, speed: 11, pause: 8 },
    { route: pts([[955, 732], [1060, 770]]), look: { shirt: '#7b8a6a', pants: '#2c3340', hair: '#16110d' }, speed: 20, pause: 6 },
    { route: pts([[560, 190], [640, 192]]), look: { shirt: '#1f2733', pants: '#1a1f27', hair: '#3b2a20', tie: '#b3261e' }, speed: 13, pause: 11 },
    { route: pts([[875, 772], [950, 760]]), look: { shirt: '#8a6f9e', pants: '#262c36', hair: '#2b211b' }, speed: 16, pause: 8 },
  ],
  // Foreground objects that characters can walk behind: redrawn from the plate over anyone standing further back.
  occluders: [
    { baseline: p(0, 452)[1], shapes: [{ ellipse: [...p(284, 414), 16, 15] }, { poly: pts([[274, 422], [296, 422], [296, 452], [274, 452]]) }] },
    { baseline: p(0, 447)[1], shapes: [{ ellipse: [...p(160, 407), 15, 14] }, { poly: pts([[150, 418], [171, 418], [171, 447], [150, 447]]) }] },
    { baseline: p(0, 458)[1], shapes: [{ ellipse: [...p(434, 433), 14, 12] }, { poly: pts([[424, 440], [445, 440], [445, 458], [424, 458]]) }] },
    { baseline: p(0, 455)[1], shapes: [{ ellipse: [...p(512, 415), 15, 17] }, { poly: pts([[502, 425], [524, 425], [524, 455], [502, 455]]) }] },
    { baseline: p(0, 455)[1], shapes: [{ ellipse: [...p(712, 432), 13, 12] }, { poly: pts([[703, 438], [722, 438], [722, 455], [703, 455]]) }] },
    { baseline: p(0, 785)[1], shapes: [{ poly: pts([[628, 748], [700, 745], [702, 785], [626, 785]]) }] },
    { baseline: p(0, 760)[1], shapes: [{ poly: pts([[664, 732], [742, 730], [746, 760], [662, 761]]) }] },
  ],
};
