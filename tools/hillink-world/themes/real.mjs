// Realistic theme: the Hillink HQ tower concept art (Kyle's reference, 2026-09-29).
// World units are source-image pixels; the art is drawn at `art.origin`. Location ids are the same
// semantic places as every other theme, re-homed onto the rooms painted in this image.
import { realScenery } from './real-scenery.mjs';

const lounge = { lounge1: [800, 812], lounge2: [832, 818], lounge3: [864, 818], lounge4: [896, 815], lounge5: [928, 812], lounge6: [850, 780] };

export const realTheme = {
  id: 'real',
  name: 'Realistic',
  art: { src: 'art/real.jpg', origin: [150, 55], size: [1386, 785], portraits: 'art/real-portraits.jpg',
    portraitIndex: { orchestrator: 0, claude: 1, codex: 2, maya: 3, scout: 4, riley: 5, finley: 6, sage: 7, nova: 8, atlas: 9, pixel: 10 } },
  // Proposed pairing of agents to the concept's portraits; unknown agents get a colored initial.
  avatars: { claude: 'claude', codex: 'codex', chatgpt: 'orchestrator', qwen: 'nova', gemma: 'atlas', sales: 'scout', support: 'riley', research: 'atlas', security: 'sage', 'hq-verifier': 'verifier' },
  // Temporary procedural character looks (brief §16: motion first, polished sprites later).
  looks: {
    claude: { shirt: '#d97745', pants: '#2d2a26', hair: '#4a2f1d', screen: '#ffb27a' },
    codex: { shirt: '#2f6fed', pants: '#1f2530', hair: '#141414', screen: '#5ee1ff' },
    orchestrator: { shirt: '#22303f', pants: '#1a1f27', hair: '#3b2a20', tie: '#10a37f' },
    nova: { shirt: '#7c4dff', pants: '#262032', hair: '#e8e2f4', screen: '#c3a6ff' },
    atlas: { shirt: '#1fa37a', pants: '#1f2a26', hair: '#2b211b', screen: '#7cf0c4' },
    verifier: { shirt: '#3a4454', pants: '#232a33', vest: '#f2b01e', hat: 'hardhat', screen: '#ffe08a' },
    scout: { shirt: '#06d6a0', pants: '#22302b' }, riley: { shirt: '#8338ec', pants: '#261f33' }, sage: { shirt: '#ef476f', pants: '#2c2126' },
  },
  package: 'box',
  scenery: realScenery,
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
        stations: { desk1: [245, 495], desk2: [340, 497], desk3: [390, 496], desk4: [502, 498], desk5: [534, 498], desk6: [560, 500], review: [470, 497] }, door: [630, 505] },
      { id: 'operations', name: 'Sales & Support', represents: 'Live platform activity', x: 170, y: 515, w: 385, h: 150,
        stations: { floor1: [270, 648], floor2: [400, 655], floor3: [480, 655] }, door: [560, 668] },
      { id: 'testing', name: 'Security & QA', represents: 'Automated tests, QA and security testing', x: 770, y: 545, w: 185, h: 140,
        stations: { bench1: [800, 675], bench2: [835, 676], bench3: [900, 676], rig: [868, 672] }, door: [952, 672] },
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
      nodes: { el1: [987, 245], el2: [987, 385], el3: [987, 505], el4: [987, 672], el5: [987, 805], f3: [640, 512], f4: [600, 678], g1: [600, 815], r3: [1080, 500], c1: [1200, 488], r4: [1090, 690], d1: [1200, 700] },
      edges: [['el1', 'el2'], ['el2', 'el3'], ['el3', 'el4'], ['el4', 'el5'], ['f3', 'el3'], ['f4', 'el4'], ['f4', 'g1'], ['g1', 'el5'], ['el3', 'r3'], ['r3', 'c1'], ['el4', 'r4'], ['r4', 'd1']],
      lifts: { tower: ['el1', 'el2', 'el3', 'el4', 'el5'] },
      hubs: { command: 'el1', comms: 'el2', archive: 'el3', development: 'f3', operations: 'f4', testing: 'el4', lounge: 'el5', deploy: 'c1', servers: 'd1', queue: 'g1' },
    },
    places: {
      idle: { location: 'lounge', stations: Object.keys(lounge) },
      offline: { location: 'lounge', stations: Object.keys(lounge).reverse() },
      // Desks nearest the painted monitors fill first, so a working agent visibly wakes a workstation.
      coding: { location: 'development', stations: ['desk4', 'desk5', 'desk6', 'desk3', 'desk2', 'desk1'] },
      thinking: { location: 'development', stations: ['desk5', 'desk4', 'desk6', 'desk3', 'desk2', 'desk1'] },
      // Reviews happen in Security & QA here, so a Codex review lights up that room.
      reviewing: { location: 'testing', stations: ['rig', 'bench1', 'bench2', 'bench3'] },
    },
    taskSlots: { queue: { x: 345, y: 760, cols: 10, step: 17 }, archive: { x: 670, y: 462, cols: 14, step: 15 } },
    systemSpots: { database: [1470, 640], tests: [932, 610], deploy: [1480, 420], build: [1262, 420], platform: [460, 600], hq: [915, 200] },
    signals: { tests: [852, 604], deploy: [1420, 418], prs: [345, 425] },
  },
};
