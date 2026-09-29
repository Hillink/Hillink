// Fantasy theme: the Hillink realm concept art (Kyle's reference, 2026-09-29).
// The painted character name cards become live "plaques": each shows the real agent bound to that
// persona and its real status, or "No agent connected". Nothing painted claims activity by itself.
export const fantasyTheme = {
  id: 'fantasy',
  name: 'Fantasy',
  art: { src: 'art/fantasy.jpg', origin: [152, 55], size: [1384, 969], portraits: 'art/fantasy-portraits.jpg',
    portraitIndex: { dwarf: 0, cyborg: 1, cupid: 2, ghost: 3, cyclops: 4, sentinel: 5, king: 6, oracle: 7, goblin: 8, marketing: 9 } },
  // Proposed persona pairing (Claude builds, Codex inspects, HQ's verifier is the Oracle); a plaque shows the first
  // listed agent that exists, and personas without an agent say so.
  avatars: { claude: 'dwarf', codex: 'cyborg', chatgpt: 'king', gemma: 'cyclops', 'hq-verifier': 'oracle', qwen: 'goblin', sales: 'cupid', support: 'ghost', research: 'cyclops', security: 'sentinel' },
  plaques: [
    { rect: [352, 166, 496, 207], title: 'Scout (Cupid)', agentIds: ['sales'] },
    { rect: [793, 164, 932, 201], title: 'Orchestrator (King)', agentIds: ['chatgpt'] },
    { rect: [303, 445, 440, 487], title: 'Builder (Dwarf)', agentIds: ['claude'] },
    { rect: [735, 450, 874, 490], title: 'Inspector (Cyborg)', agentIds: ['codex'] },
    { rect: [1035, 458, 1172, 497], title: 'QA (Oracle)', agentIds: ['hq-verifier'] },
    { rect: [1368, 423, 1497, 462], title: 'Analytics (Cyclops)', agentIds: ['gemma', 'research'] },
    { rect: [463, 658, 602, 697], title: 'Support', agentIds: ['support'] },
    { rect: [162, 696, 294, 735], title: 'Treasurer (Goblin)', agentIds: [] },
    { rect: [1031, 740, 1172, 782], title: 'Security (Sentinel)', agentIds: ['security'] },
    { rect: [1383, 701, 1524, 742], title: 'Marketing', agentIds: [] },
  ],
  camera: { minZoom: 0.3, maxZoom: 2.6 },
  layout: {
    id: 'fantasy',
    bounds: { x: 152, y: 55, w: 1384, h: 969 },
    entityScale: 0.5,
    overflowStep: 24,
    spawn: 'queue',
    locations: [
      { id: 'development', name: 'Engineering Forge', represents: 'Claude and Codex engineering work', x: 152, y: 400, w: 440, h: 200,
        stations: { desk1: [180, 578], desk2: [360, 585], desk3: [420, 570], desk4: [480, 580], desk5: [530, 565], desk6: [250, 592], review: [440, 520] }, door: [585, 560] },
      { id: 'command', name: 'Throne Hall', represents: 'Overall Hillink status', x: 520, y: 150, w: 420, h: 150,
        stations: { console: [770, 290], owner: [735, 292], lounge1: [580, 290], lounge2: [620, 292], lounge3: [660, 292], lounge4: [840, 292], lounge5: [880, 290], lounge6: [915, 288] }, door: [930, 280] },
      { id: 'testing', name: 'QA Sanctum', represents: 'Automated tests, QA and security testing', x: 950, y: 440, w: 260, h: 200,
        stations: { bench1: [990, 615], bench2: [1040, 625], bench3: [1150, 622], rig: [1100, 590] }, door: [965, 630] },
      { id: 'comms', name: 'Town Square', represents: 'Agent-to-agent communication and integrations', x: 640, y: 690, w: 260, h: 150,
        stations: { table1: [690, 790], table2: [750, 800], table3: [820, 795], table4: [870, 780] }, door: [760, 835] },
      { id: 'operations', name: 'Support Hall', represents: 'Live platform activity', x: 320, y: 600, w: 280, h: 200,
        stations: { floor1: [400, 765], floor2: [470, 785], floor3: [560, 770] }, door: [592, 790] },
      { id: 'servers', name: 'Data Center', represents: 'Supabase database and backend', x: 1240, y: 800, w: 296, h: 224,
        stations: { rack: [1330, 965], terminal: [1430, 990] }, door: [1250, 900] },
      { id: 'deploy', name: 'Launch Bay', represents: 'Builds and releases', x: 900, y: 880, w: 230, h: 144,
        stations: { pad: [960, 995], console1: [1030, 1000], console2: [1100, 975] }, door: [930, 900] },
      { id: 'archive', name: 'Analytics Tower', represents: 'Research, completed work and docs', x: 1290, y: 220, w: 246, h: 340,
        stations: { shelf: [1330, 545], reading1: [1400, 550], reading2: [1480, 548] }, door: [1300, 555] },
      { id: 'queue', name: 'Fountain Court', represents: 'Queued work waiting for an agent', x: 600, y: 850, w: 280, h: 174,
        stations: { wait1: [640, 1000], wait2: [700, 1012], wait3: [800, 1012], wait4: [860, 1000] }, door: [740, 860] },
    ],
    // Walkways: the sky bridge, the plaza paths, the east promenade and the tower lift.
    nav: {
      nodes: { fe: [615, 575], b1: [650, 500], b2: [930, 625], k1: [975, 285], k2: [990, 430], p0: [615, 815], p1: [760, 848], p2: [905, 870], a1: [1250, 560], m1: [1230, 700], d1: [1210, 880] },
      edges: [['fe', 'b1'], ['b1', 'b2'], ['fe', 'p0'], ['p0', 'p1'], ['p1', 'p2'], ['p2', 'b2'], ['p2', 'd1'], ['d1', 'm1'], ['m1', 'a1'], ['a1', 'k2'], ['k2', 'b2'], ['k1', 'k2']],
      hubs: { development: 'fe', command: 'k1', testing: 'b2', comms: 'p1', operations: 'p0', servers: 'd1', deploy: 'p2', archive: 'a1', queue: 'p1' },
    },
    taskSlots: { queue: { x: 670, y: 900, cols: 10, step: 16 }, archive: { x: 1320, y: 500, cols: 10, step: 15 } },
    systemSpots: { database: [1290, 880], tests: [1185, 520], deploy: [1060, 930], build: [990, 935], platform: [440, 650], hq: [640, 240] },
    signals: { tests: [1010, 445], deploy: [1015, 905], prs: [300, 412] },
  },
};
