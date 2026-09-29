// The HQ layout is data. Each location maps to a real Hillink system (brief §8).
// World units: 1 unit = 1 CSS px at zoom 1. Floors/buildings are future expansion via `floor` and `building`.
export const WORLD_BOUNDS = { x: 0, y: 0, w: 2400, h: 1560 };

export const locations = [
  { id: 'development', name: 'Development', represents: 'Claude and Codex engineering work', x: 160, y: 80, w: 600, h: 380,
    stations: { desk1: [290, 250], desk2: [460, 250], desk3: [630, 250], desk4: [290, 380], desk5: [460, 380], desk6: [630, 380], review: [460, 150] }, door: [460, 460] },
  { id: 'command', name: 'Command Center', represents: 'Overall Hillink status', x: 900, y: 80, w: 600, h: 380,
    stations: { console: [1200, 200], lounge1: [1030, 370], lounge2: [1110, 370], lounge3: [1190, 370], lounge4: [1270, 370], lounge5: [1350, 370], lounge6: [1430, 370], owner: [1200, 280] }, door: [1200, 460] },
  { id: 'testing', name: 'Testing Lab', represents: 'Automated tests, QA and security testing', x: 1640, y: 80, w: 600, h: 380,
    stations: { bench1: [1780, 300], bench2: [1940, 300], bench3: [2100, 300], rig: [1940, 170] }, door: [1940, 460] },
  { id: 'deploy', name: 'Deployment Bay', represents: 'Builds and releases', x: 160, y: 600, w: 600, h: 380,
    stations: { pad: [460, 760], console1: [300, 900], console2: [620, 900] }, door: [460, 600] },
  { id: 'operations', name: 'Operations', represents: 'Live platform activity', x: 900, y: 600, w: 600, h: 380,
    stations: { floor1: [1060, 860], floor2: [1200, 860], floor3: [1340, 860] }, door: [1200, 600] },
  { id: 'servers', name: 'Server / Data Room', represents: 'Supabase database and backend', x: 1640, y: 600, w: 600, h: 380,
    stations: { rack: [1940, 760], terminal: [1800, 900] }, door: [1940, 600] },
  { id: 'queue', name: 'Task Queue', represents: 'Queued work waiting for an agent', x: 160, y: 1120, w: 600, h: 360,
    stations: { wait1: [300, 1400], wait2: [420, 1400], wait3: [540, 1400], wait4: [660, 1400] }, door: [460, 1120] },
  { id: 'comms', name: 'Communications', represents: 'Agent-to-agent communication and integrations', x: 900, y: 1120, w: 600, h: 360,
    stations: { table1: [1110, 1300], table2: [1290, 1300], table3: [1110, 1400], table4: [1290, 1400] }, door: [1200, 1120] },
  { id: 'archive', name: 'Archive', represents: 'Completed work, docs and history', x: 1640, y: 1120, w: 600, h: 360,
    stations: { shelf: [1940, 1330], reading1: [1800, 1400], reading2: [2080, 1400] }, door: [1940, 1120] },
];
export const locationById = Object.fromEntries(locations.map(l => [l.id, l]));

// Corridor graph: two horizontal halls and two vertical ones; every door connects to its hall.
const halls = { h1: 530, h2: 1050 }, cols = { c0: 90, c1: 830, c2: 1570, c3: 2310 };
export const navNodes = {};
for (const [hk, y] of Object.entries(halls)) for (const [ck, x] of Object.entries(cols)) navNodes[`${hk}${ck}`] = [x, y];
for (const l of locations) {
  const hall = l.door[1] <= 600 ? 'h1' : 'h2';
  navNodes[`door:${l.id}`] = l.door;
  navNodes[`hall:${l.id}`] = [l.door[0], halls[hall]];
}
const edges = [];
const link = (a, b) => edges.push([a, b]);
for (const hk of Object.keys(halls)) { const order = Object.keys(cols); for (let i = 0; i < order.length - 1; i++) link(`${hk}${order[i]}`, `${hk}${order[i + 1]}`); }
for (const ck of Object.keys(cols)) link(`h1${ck}`, `h2${ck}`);
for (const l of locations) {
  link(`door:${l.id}`, `hall:${l.id}`);
  // Splice the door's hall point into its hall between the nearest column nodes.
  const hk = navNodes[`hall:${l.id}`][1] === halls.h1 ? 'h1' : 'h2';
  const x = l.door[0], order = Object.entries(cols).sort((a, b) => a[1] - b[1]);
  const left = order.filter(([, cx]) => cx <= x).at(-1), right = order.find(([, cx]) => cx > x);
  if (left) link(`hall:${l.id}`, `${hk}${left[0]}`);
  if (right) link(`hall:${l.id}`, `${hk}${right[0]}`);
}
export const navEdges = edges;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const adjacency = {};
for (const [a, b] of edges) { (adjacency[a] ||= []).push(b); (adjacency[b] ||= []).push(a); }

export function locationAt(x, y) {
  return locations.find(l => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) ?? null;
}

// Waypoints from a world point to a station. Inside the same room: straight line. Otherwise: out the door, along halls, in the door.
export function route(from, toLocationId, toPoint) {
  const src = locationAt(from[0], from[1]);
  if (src && src.id === toLocationId) return [toPoint];
  const start = src ? `door:${src.id}` : nearestNode(from);
  const goal = `door:${toLocationId}`;
  const path = shortest(start, goal);
  return [...path.map(n => navNodes[n]), toPoint];
}
function nearestNode(p) {
  let best = null, bestD = Infinity;
  for (const [id, q] of Object.entries(navNodes)) { const d = dist(p, q); if (d < bestD) { bestD = d; best = id; } }
  return best;
}
function shortest(start, goal) {
  const d = { [start]: 0 }, prev = {}, open = new Set([start]);
  while (open.size) {
    let u = null; for (const n of open) if (u === null || d[n] < d[u]) u = n;
    open.delete(u);
    if (u === goal) break;
    for (const v of adjacency[u] || []) {
      const alt = d[u] + dist(navNodes[u], navNodes[v]);
      if (alt < (d[v] ?? Infinity)) { d[v] = alt; prev[v] = u; open.add(v); }
    }
  }
  const path = []; for (let n = goal; n; n = prev[n]) { path.unshift(n); if (n === start) break; }
  return path[0] === start ? path : [start, goal];
}
