// Realistic theme: the Hillink HQ tower concept art (Kyle's reference, 2026-09-29).
// World units are source-image pixels; the art is drawn at `art.origin`. Location ids are the same
// semantic places as every other theme, re-homed onto the rooms painted in this image.
const lounge = { lounge1: [800, 812], lounge2: [832, 818], lounge3: [864, 818], lounge4: [896, 815], lounge5: [928, 812], lounge6: [850, 780] };

export const realTheme = {
  id: 'real',
  name: 'Realistic',
  art: { src: 'art/real.jpg', origin: [150, 55], size: [1386, 785], portraits: 'art/real-portraits.jpg',
    portraitIndex: { orchestrator: 0, claude: 1, codex: 2, maya: 3, scout: 4, riley: 5, finley: 6, sage: 7, nova: 8, atlas: 9, pixel: 10 } },
  // Proposed pairing of agents to the concept's portraits; unknown agents get a colored initial.
  avatars: { claude: 'claude', codex: 'codex', chatgpt: 'orchestrator', qwen: 'nova', gemma: 'atlas', sales: 'scout', support: 'riley', research: 'atlas', security: 'sage' },
  camera: { minZoom: 0.3, maxZoom: 2.6 },
  layout: {
    id: 'real',
    bounds: { x: 150, y: 55, w: 1386, h: 785 },
    entityScale: 0.45,
    overflowStep: 22,
    spawn: 'queue',
    locations: [
      { id: 'command', name: 'Executive Command', represents: 'Overall Hillink status', x: 655, y: 170, w: 300, h: 90,
        stations: { console: [800, 240], owner: [760, 242], lounge1: [690, 245], lounge2: [722, 245], lounge3: [850, 245], lounge4: [882, 245], lounge5: [912, 245], lounge6: [940, 245] }, door: [950, 245] },
      { id: 'comms', name: 'Meeting Room', represents: 'Agent-to-agent communication and integrations', x: 650, y: 300, w: 305, h: 95,
        stations: { table1: [730, 385], table2: [790, 385], table3: [850, 385], table4: [905, 382] }, door: [952, 385] },
      { id: 'archive', name: 'Product & Design', represents: 'Research, completed work and docs', x: 650, y: 440, w: 305, h: 75,
        stations: { shelf: [700, 505], reading1: [770, 505], reading2: [840, 505] }, door: [952, 505] },
      { id: 'development', name: 'Engineering', represents: 'Claude and Codex engineering work', x: 160, y: 400, w: 470, h: 110,
        stations: { desk1: [215, 492], desk2: [285, 492], desk3: [355, 492], desk4: [425, 492], desk5: [495, 492], desk6: [560, 492], review: [520, 445] }, door: [630, 505] },
      { id: 'operations', name: 'Sales & Support', represents: 'Live platform activity', x: 170, y: 515, w: 385, h: 150,
        stations: { floor1: [270, 648], floor2: [400, 655], floor3: [480, 655] }, door: [560, 668] },
      { id: 'testing', name: 'Security & QA', represents: 'Automated tests, QA and security testing', x: 770, y: 545, w: 185, h: 140,
        stations: { bench1: [800, 675], bench2: [845, 675], bench3: [890, 675], rig: [925, 660] }, door: [952, 672] },
      { id: 'lounge', name: 'Break Room', represents: 'Idle agents between tasks', x: 775, y: 715, w: 180, h: 120, stations: lounge, door: [955, 800] },
      { id: 'deploy', name: 'Construction', represents: 'Builds and releases', x: 1200, y: 330, w: 320, h: 160,
        stations: { pad: [1330, 455], console1: [1250, 460], console2: [1440, 462] }, door: [1215, 480] },
      { id: 'servers', name: 'Data Center', represents: 'Supabase database and backend', x: 1200, y: 500, w: 320, h: 190,
        stations: { rack: [1330, 665], terminal: [1420, 672] }, door: [1215, 690] },
      { id: 'queue', name: 'Main Plaza', represents: 'Queued work waiting for an agent', x: 320, y: 665, w: 250, h: 170,
        stations: { wait1: [360, 810], wait2: [410, 815], wait3: [460, 815], wait4: [510, 810] }, door: [565, 805] },
    ],
    // Walkways: the glass elevator, each floor's corridor, the stairs to the plaza, and the east terraces.
    nav: {
      nodes: { el1: [985, 245], el2: [985, 385], el3: [985, 505], el4: [985, 672], el5: [985, 805], f3: [640, 512], f4: [600, 678], g1: [600, 815], r3: [1080, 500], c1: [1200, 488], r4: [1090, 690], d1: [1200, 700] },
      edges: [['el1', 'el2'], ['el2', 'el3'], ['el3', 'el4'], ['el4', 'el5'], ['f3', 'el3'], ['f4', 'el4'], ['f4', 'g1'], ['g1', 'el5'], ['el3', 'r3'], ['r3', 'c1'], ['el4', 'r4'], ['r4', 'd1']],
      hubs: { command: 'el1', comms: 'el2', archive: 'el3', development: 'f3', operations: 'f4', testing: 'el4', lounge: 'el5', deploy: 'c1', servers: 'd1', queue: 'g1' },
    },
    places: {
      idle: { location: 'lounge', stations: Object.keys(lounge) },
      offline: { location: 'lounge', stations: Object.keys(lounge).reverse() },
    },
    taskSlots: { queue: { x: 345, y: 760, cols: 10, step: 17 }, archive: { x: 670, y: 462, cols: 14, step: 15 } },
    systemSpots: { database: [1470, 640], tests: [932, 610], deploy: [1480, 420], build: [1262, 420], platform: [460, 600], hq: [915, 200] },
    signals: { tests: [852, 604], deploy: [1420, 418], prs: [345, 425] },
  },
};
