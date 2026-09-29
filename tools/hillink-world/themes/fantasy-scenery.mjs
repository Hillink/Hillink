// Fantasy theme scenery: the animation layer over the Hillink realm concept image.
// Authored in source-image pixels, then shifted by the art origin into world units.
const O = [152, 55];
const p = (x, y) => [x + O[0], y + O[1]];
const pts = list => list.map(([x, y]) => p(x, y));
const r = (x, y, w, h) => [x + O[0], y + O[1], w, h];

export const fantasyScenery = {
  characterHeight: 42,
  npcHeight: 34,
  walkSpeed: 95,
  liftSpeed: 60,
  // The HILLINK fountain in the court: shimmer, ripples and a sparkling jet.
  water: [],
  fountains: [{ pool: pts([[505, 800], [690, 798], [712, 830], [705, 870], [640, 905], [560, 935], [505, 935], [490, 880]]), jet: p(602, 842), height: 44 }],
  screens: [
    { rect: r(482, 160, 40, 36), room: 'command', kind: 'dash', holo: true },
    { rect: r(600, 190, 60, 40), room: 'command', kind: 'graph', holo: true },
    { rect: r(680, 165, 50, 45), room: 'command', kind: 'dash', holo: true },
    { rect: r(805, 445, 70, 70), room: 'testing', kind: 'radar', holo: true },
    { rect: r(960, 450, 70, 50), room: 'testing', station: 'rig', kind: 'graph', holo: true },
    { rect: r(1142, 272, 55, 120), room: 'archive', kind: 'dash', holo: true },
    { rect: r(1330, 268, 50, 60), room: 'archive', station: 'reading2', kind: 'graph', holo: true },
    { rect: r(210, 455, 40, 30), room: 'development', station: 'desk1', kind: 'code', holo: true },
  ],
  leds: [
    { rect: r(1188, 830, 14, 70), cols: 2, rows: 12, colors: ['#4d8dff', '#9cc6ff'] },
    { rect: r(1212, 836, 14, 66), cols: 2, rows: 11, colors: ['#3aa0ff', '#7fd4ff'] },
    { rect: r(1262, 842, 14, 64), cols: 2, rows: 11, colors: ['#4d8dff', '#b0d4ff'] },
    { rect: r(1300, 846, 14, 60), cols: 2, rows: 10, colors: ['#3aa0ff', '#7fd4ff'] },
  ],
  ambientLifts: [
    { id: 'spire', x: p(845, 0)[0], stops: [p(0, 70)[1], p(0, 140)[1], p(0, 215)[1]], w: 34, h: 44 },
    { id: 'forge', x: p(422, 0)[0], stops: [p(0, 350)[1], p(0, 430)[1], p(0, 515)[1], p(0, 598)[1]], w: 38, h: 48 },
  ],
  vehicles: [
    { points: pts([[1010, 968], [800, 952], [610, 966], [380, 972]]), speed: 30, every: 22, chance: 0.8, kinds: ['van'], colors: ['#e9d9a8', '#f0f3f7'], scale: 0.8 },
  ],
  blinkers: [
    { at: p(845, 18), color: '#6fc3ff', period: 2.2, r: 2.2 },
    { at: p(415, 318), color: '#6fc3ff', period: 2.8, r: 2 },
  ],
  sparks: [p(178, 505), p(232, 482)],
  signs: [
    { rect: r(530, 40, 172, 50), color: '#dfe9ff' },
    { rect: r(35, 290, 205, 60), color: '#cfe0ff' },
    { rect: r(810, 400, 130, 60), color: '#b8d8ff' },
  ],
  twinkle: [{ rect: r(0, 150, 360, 90), count: 18 }],
  motes: { rect: r(0, 350, 1384, 600), count: 34, color: '#ffe7a8' },
  magic: [{ at: p(915, 510), r: 90, color: '#b58cff' }, { at: p(1265, 330), r: 70, color: '#8fd3ff' }],
  rooms: {
    development: r(0, 350, 440, 200), testing: r(795, 430, 260, 200), archive: r(1135, 210, 250, 340), command: r(360, 90, 420, 150),
    comms: r(488, 640, 260, 150), operations: r(168, 550, 280, 200), servers: r(1085, 760, 296, 210), deploy: r(748, 830, 230, 140), queue: r(448, 800, 280, 170),
  },
  npcs: [
    { route: pts([[250, 725], [420, 760]]), look: { shirt: '#6d7fa3', pants: '#2c3340', hair: '#3b2a20' }, speed: 18, pause: 5 },
    { route: pts([[560, 765], [705, 785]]), look: { shirt: '#9e5b3c', pants: '#2b2f38', hair: '#c9a36b' }, speed: 16, pause: 7 },
    { route: pts([[520, 452], [760, 560]]), look: { shirt: '#d7dde6', pants: '#394150', hair: '#1c1612' }, speed: 20, pause: 6 },
    { route: pts([[1060, 505], [1205, 540]]), look: { shirt: '#4f6d7a', pants: '#20252c', hair: '#5a3b24' }, speed: 17, pause: 8 },
    { route: pts([[730, 845], [790, 930]]), look: { shirt: '#8a6f9e', pants: '#262c36', hair: '#2b211b' }, speed: 15, pause: 9 },
    { route: pts([[860, 735], [990, 760]]), look: { shirt: '#39424f', pants: '#1d2229', hat: 'hood', hatColor: '#5b4a9e' }, speed: 14, pause: 10 },
    { route: pts([[40, 880], [190, 930]]), look: { shirt: '#7b8a6a', pants: '#2c3340', hair: '#16110d' }, speed: 18, pause: 6 },
  ],
  occluders: [],
};
