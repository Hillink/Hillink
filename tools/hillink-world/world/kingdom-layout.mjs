// Pass 5G: the Fantasy spatial system. The kingdom is not the Real building renamed: it is its own layout, built from
// the same canonical procedural world (procgen/: capabilities and construction projects), with the same interface
// the engine already runs on (engine/world-view.mjs, engine/iso-view.mjs, core/behavior.mjs; the generated layout,
// world/generated-layout.mjs, documents it). So walking, stations, overflow, journeys, site work and idle life run
// unchanged; only where things are, and what they stand for, is different.
//
// Structure (THEME): one ground level in a layered 2.5D projection. A back row of roofed halls cut away at the front
// (Great Library, Oracle Chamber, King's Command, Vault, Observatory, Arcane Engine), a front row of open-air fenced
// grounds (Kingdom Gate, Summoning Circle, Forge, Hearth Commons, Academy, Builders' Yard), and the Kingdom Road
// between them, which is also the market square where the quest board stands. Which district stands for what is data
// (themes/fantasy/metaphor.mjs); whether HQ really has it is derived from canonical capabilities (`established`).
//
// Navigation (DERIVED from this geometry, deterministic): a spine along the road, a door node where each district
// meets the road (the only opening in its wall or fence), and straight walks inside a district from its entry to each
// station, checked clear of furniture. A route never crosses a wall except through a door, never leaves the walkable
// areas, and is null when a destination cannot be reached (the caller keeps the character where it is).
//
// Construction (CANONICAL input): every unfinished project (world.projects) gets a plot in the Builders' Yard, in
// project-id order, with builder and inspector stations. The plot's picture follows the project's canonical stage and
// nothing else; a finished capability establishes its district.
import { UNITS_PER_METRE } from '../procgen/units.mjs';
import { buildersWork } from '../procgen/construction.mjs';
import { hull } from '../engine/iso.mjs';
import { AGENT } from './scale.mjs';
import { ACTIVITY_PLACE } from '../core/behavior.mjs';
import { definitionOf } from '../core/agents.mjs';
import { DISTRICTS, DISTRICT_ORDER, establishedDistricts, districtOfCapability, domainOf, ACTIVITY_USES, CONSTRUCTION_PHASES } from '../themes/fantasy/metaphor.mjs';
import { deriveKingdomEntities } from '../themes/fantasy/entities.mjs';

const U = UNITS_PER_METRE;
const title = s => String(s).replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Rows and the road, in plan units (z grows away from the camera).
export const KINGDOM = { front: { z0: 60, z1: 440 }, road: { z0: 440, z1: 640, spine: 540 }, back: { z0: 640, z1: 960 }, gap: 30, backOffset: 280, doorHalf: 24, plotW: 200, stockW: 120, height: { back: 150, front: 36 } };

// District templates (THEME, spatial). Stations: [id, fx (0..1 across), d (0..1 from the door edge inwards), use, pose,
// facing]. Solids: [type, fx, d, w, depth, h] furniture boxes that no walk may cross. Every solid sits deeper than
// every station of its district, so the straight walk from the entry to a station never meets one; the tests check it.
const TEMPLATES = {
  gatehouse: {
    stations: [['watch1', 0.5, 0.52, 'guard', 'stand', 'front'], ['relax1', 0.3, 0.35, 'relax', 'stand', 'front'], ['relax2', 0.7, 0.35, 'relax', 'stand', 'front']],
    solids: [['tower', 0.12, 0.8, 46, 46, 130], ['tower', 0.88, 0.8, 46, 46, 130], ['beacon', 0.5, 0.86, 22, 22, 44]],
  },
  forge: {
    stations: [['work1', 0.25, 0.48, 'work', 'stand', 'front'], ['work2', 0.5, 0.48, 'work', 'stand', 'front'], ['work3', 0.75, 0.48, 'work', 'stand', 'front'], ['relax1', 0.1, 0.3, 'relax', 'stand', 'right'], ['relax2', 0.9, 0.3, 'relax', 'stand', 'left']],
    solids: [['anvil', 0.25, 0.64, 26, 16, 18], ['anvil', 0.5, 0.64, 26, 16, 18], ['anvil', 0.75, 0.64, 26, 16, 18], ['furnace', 0.13, 0.88, 56, 40, 74], ['quench', 0.88, 0.86, 26, 22, 20], ['rack', 0.5, 0.9, 90, 14, 42]],
  },
  commons: {
    stations: [['relax1', 0.3, 0.42, 'relax', 'sit', 'right'], ['relax2', 0.7, 0.42, 'relax', 'sit', 'left'], ['relax3', 0.3, 0.72, 'relax', 'sit', 'right'], ['relax4', 0.7, 0.72, 'relax', 'sit', 'left'], ['relax5', 0.12, 0.56, 'relax', 'stand', 'right'], ['relax6', 0.88, 0.56, 'relax', 'stand', 'left']],
    solids: [['campfire', 0.5, 0.57, 34, 26, 12], ['tavern-table', 0.2, 0.92, 44, 20, 18], ['barrel', 0.84, 0.92, 22, 18, 24]],
  },
  academy: {
    stations: [['read1', 0.25, 0.48, 'read', 'stand', 'front'], ['read2', 0.5, 0.48, 'read', 'stand', 'front'], ['read3', 0.75, 0.48, 'read', 'stand', 'front'], ['relax1', 0.1, 0.3, 'relax', 'stand', 'right']],
    solids: [['lectern', 0.25, 0.64, 18, 12, 28], ['lectern', 0.5, 0.64, 18, 12, 28], ['lectern', 0.75, 0.64, 18, 12, 28], ['slate', 0.5, 0.92, 130, 8, 52], ['dummy', 0.9, 0.84, 16, 16, 44]],
  },
  library: {
    stations: [['read1', 0.25, 0.45, 'read', 'stand', 'back'], ['read2', 0.5, 0.45, 'read', 'stand', 'back'], ['read3', 0.75, 0.45, 'read', 'stand', 'back'], ['relax1', 0.1, 0.26, 'relax', 'sit', 'right']],
    solids: [['shelf', 0.25, 0.86, 76, 16, 84], ['shelf', 0.5, 0.86, 76, 16, 84], ['shelf', 0.75, 0.86, 76, 16, 84]],
  },
  tower: {
    stations: [['inspect1', 0.3, 0.45, 'inspect', 'stand', 'back'], ['inspect2', 0.7, 0.45, 'inspect', 'stand', 'back'], ['inspect3', 0.5, 0.3, 'inspect', 'stand', 'back'], ['relax1', 0.1, 0.26, 'relax', 'stand', 'right']],
    solids: [['pedestal', 0.3, 0.62, 18, 18, 26], ['pedestal', 0.7, 0.62, 18, 18, 26], ['crystal', 0.5, 0.86, 44, 30, 44]],
  },
  keep: {
    stations: [['meet1', 0.16, 0.55, 'meeting', 'stand', 'right'], ['meet2', 0.4, 0.55, 'meeting', 'stand', 'left'], ['meet3', 0.28, 0.38, 'meeting', 'stand', 'back'], ['meet4', 0.4, 0.38, 'meeting', 'stand', 'back'], ['throne', 0.72, 0.8, 'throne', 'sit', 'front'], ['relax1', 0.86, 0.5, 'relax', 'stand', 'left'], ['relax2', 0.58, 0.5, 'relax', 'stand', 'right']],
    solids: [['council-table', 0.28, 0.55, 60, 40, 18], ['throne', 0.72, 0.93, 46, 22, 72]],
  },
  vault: {
    stations: [['work1', 0.35, 0.48, 'work', 'stand', 'back'], ['work2', 0.65, 0.48, 'work', 'stand', 'back'], ['relax1', 0.12, 0.3, 'relax', 'stand', 'right']],
    solids: [['counting-table', 0.35, 0.64, 40, 18, 18], ['counting-table', 0.65, 0.64, 40, 18, 18], ['vault-door', 0.5, 0.93, 80, 10, 84]],
  },
  dome: {
    stations: [['read1', 0.36, 0.5, 'read', 'stand', 'back'], ['read2', 0.78, 0.42, 'read', 'stand', 'left'], ['relax1', 0.14, 0.3, 'relax', 'stand', 'right']],
    solids: [['telescope', 0.5, 0.76, 32, 30, 64]],
  },
  engine: {
    stations: [['work1', 0.3, 0.48, 'work', 'stand', 'back'], ['inspect1', 0.7, 0.48, 'inspect', 'stand', 'back'], ['relax1', 0.12, 0.28, 'relax', 'stand', 'right']],
    solids: [['console', 0.3, 0.64, 30, 12, 24], ['console', 0.7, 0.64, 30, 12, 24], ['engine-core', 0.5, 0.86, 96, 40, 96]],
  },
  circle: { stations: [], solids: [['portal-arch', 0.5, 0.86, 60, 16, 90]] },
  yard: { stations: [['relax1', 0.5, 0.3, 'relax', 'stand', 'front']], solids: [['stockpile', 0.5, 0.86, 70, 36, 30]] },
};
// The Summoning Circle's zones (THEME): each provisioning stage has its own spot, so a candidate moves through the
// summoning as HQ reports each stage. [id, fx0, fx1, d0, d1, stations: [key, fx, d, facing]].
const SUMMON_ZONES = [
  ['summon-arrive', 0.02, 0.3, 0.05, 0.45, [['c1', 0.1, 0.25, 'front'], ['c2', 0.22, 0.25, 'front']]],
  ['summon-runes', 0.02, 0.3, 0.5, 0.95, [['c1', 0.1, 0.62, 'front'], ['c2', 0.22, 0.62, 'front']]],
  ['summon-portal', 0.34, 0.66, 0.3, 0.95, [['c1', 0.43, 0.58, 'front'], ['c2', 0.57, 0.58, 'front']]],
  ['summon-armoury', 0.7, 0.98, 0.5, 0.95, [['c1', 0.78, 0.62, 'front'], ['c2', 0.9, 0.62, 'front']]],
  ['summon-trial', 0.7, 0.98, 0.05, 0.45, [['c1', 0.78, 0.22, 'front'], ['c2', 0.9, 0.22, 'front']]],
  ['summon-ready', 0.34, 0.66, 0.02, 0.26, [['c1', 0.42, 0.16, 'back'], ['c2', 0.5, 0.2, 'back'], ['c3', 0.58, 0.16, 'back']]],
];
const SUMMON_SOLIDS = [['rune-table', 0.16, 0.8, 50, 18, 20], ['armoury-rack', 0.84, 0.82, 60, 14, 48], ['proving-stone', 0.84, 0.38, 26, 20, 30]];

export function createKingdomLayout(world, { theme = 'fantasy' } = {}) {
  const g = { skx: 0.22, sky: 0.42, base: 560, height: KINGDOM.height.back, slab: 0 };
  const P = { g, pitch: 0, baseOf: () => g.base, at: (x, z, f = 0, h = 0) => [x + z * g.skx, g.base - z * g.sky - h], plan: (sx, sy) => { const z = (g.base - sy) / g.sky; return [sx - z * g.skx, z]; } };
  const projects = world.projects ?? {};
  const established = establishedDistricts(world);

  // ---- Construction plots (from canonical projects; deterministic by id). ----
  const open = Object.values(projects).filter(p => !p.completed).sort((a, b) => (a.id < b.id ? -1 : 1));
  // A finished capability whose kind no district stands for keeps its plot as a built guild hall.
  const guilds = Object.values(projects).filter(p => p.completed && !districtOfCapability(world.capabilities?.[p.id]?.spec)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const plotCount = Math.max(2, open.length + guilds.length);

  // ---- Districts: rectangles in two rows. ----
  const districts = {};
  let x = 0;
  for (const id of DISTRICT_ORDER.front) {
    const w = id === 'yard' ? KINGDOM.stockW + plotCount * KINGDOM.plotW : DISTRICTS[id].width;
    districts[id] = { id, ...DISTRICTS[id], x0: x, x1: x + w, z0: KINGDOM.front.z0, z1: KINGDOM.front.z1, doorZ: KINGDOM.front.z1, inward: -1, established: established.has(id) };
    x += w + KINGDOM.gap;
  }
  const frontEnd = x - KINGDOM.gap;
  x = KINGDOM.backOffset;
  for (const id of DISTRICT_ORDER.back) {
    const w = DISTRICTS[id].width;
    districts[id] = { id, ...DISTRICTS[id], x0: x, x1: x + w, z0: KINGDOM.back.z0, z1: KINGDOM.back.z1, doorZ: KINGDOM.back.z0, inward: 1, established: established.has(id) };
    x += w + KINGDOM.gap;
  }
  const backEnd = x - KINGDOM.gap;
  const road = { id: 'road', x0: -120, x1: Math.max(frontEnd, backEnd) + 120, z0: KINGDOM.road.z0, z1: KINGDOM.road.z1 };
  // A point in a district from (fx across, d inwards from its door edge).
  const at = (D, fx, d) => ({ x: D.x0 + (D.x1 - D.x0) * fx, z: D.inward > 0 ? D.z0 + (D.z1 - D.z0) * d : D.z1 - (D.z1 - D.z0) * d });

  // ---- Walk areas, walls and solids (exported for the skin and the route checks). ----
  const walkAreas = [{ id: 'road', ...road }], walls = [], solids = [];
  for (const D of Object.values(districts)) {
    walkAreas.push({ id: D.id, x0: D.x0 + 4, x1: D.x1 - 4, z0: D.z0 + 4, z1: D.z1 - 4 });
    const dx = (D.x0 + D.x1) / 2, h = D.row === 'back' ? KINGDOM.height.back : KINGDOM.height.front, kind = D.row === 'back' ? 'wall' : 'fence';
    const door = { x0: dx - KINGDOM.doorHalf, x1: dx + KINGDOM.doorHalf };
    walls.push({ district: D.id, kind, side: 'door', a: { x: D.x0, z: D.doorZ }, b: { x: D.x1, z: D.doorZ }, openings: [door], h: D.row === 'back' ? 30 : h });
    const farZ = D.inward > 0 ? D.z1 : D.z0;
    walls.push({ district: D.id, kind, side: D.row === 'back' ? 'back' : 'front', a: { x: D.x0, z: farZ }, b: { x: D.x1, z: farZ }, openings: [], h });
    walls.push({ district: D.id, kind, side: 'left', a: { x: D.x0, z: D.z0 }, b: { x: D.x0, z: D.z1 }, openings: [], h });
    walls.push({ district: D.id, kind, side: 'right', a: { x: D.x1, z: D.z0 }, b: { x: D.x1, z: D.z1 }, openings: [], h });
    D.door = { x: dx, z: D.doorZ, ...door };
  }

  // ---- Navigation graph. ----
  const plan = {}, navNodes = {}, adjacency = {}, navEdges = [], edgeSpace = [], areaOf = {};
  const node = (id, p, areas) => { if (!plan[id]) { plan[id] = { floor: 0, x: p.x, z: p.z }; navNodes[id] = P.at(p.x, p.z, 0); areaOf[id] = areas; } return id; };
  const link = (a, b, space) => { if (a === b || adjacency[a]?.includes(b)) return; navEdges.push([a, b]); (adjacency[a] ||= []).push(b); (adjacency[b] ||= []).push(a); edgeSpace.push(space); };
  const locations = [], stationInfo = {}, siteStations = {};
  const location = (loc, rect, top) => {
    loc.floor = 0; loc.room = { x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1, floor: 0, spaceId: null, kind: loc.kind ?? 'district', ...(loc.exterior ? { exterior: true } : {}) };
    const corners = [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z1]];
    loc.poly = hull(corners.flatMap(([cx, cz]) => [P.at(cx, cz, 0, 0), P.at(cx, cz, 0, top)]));
    const xs = loc.poly.map(q => q[0]), ys = loc.poly.map(q => q[1]);
    Object.assign(loc, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    locations.push(loc); return loc;
  };
  const station = (loc, sid, p, use, pose, facing, areas, from) => {
    const n = node(sid, p, areas); link(from, n, loc.id);
    loc.stations[sid] = navNodes[n];
    stationInfo[`${loc.id}:${sid}`] = { id: sid, room: loc.id, x: p.x, z: p.z, pose, facing, use, floor: 0, point: navNodes[n] };
    return n;
  };
  const spineXs = new Set([road.x0 + 20, road.x1 - 20]);
  const inOf = {};
  for (const D of Object.values(districts)) {
    spineXs.add(D.door.x);
    const door = node(`door:${D.id}`, { x: D.door.x, z: D.doorZ }, ['road', D.id]);
    const inn = node(`${D.id}~in`, at(D, 0.5, 0.08), [D.id]);
    link(door, inn, D.id); inOf[D.id] = inn;
    const tpl = TEMPLATES[D.structure];
    const loc = { id: D.id, name: D.name, represents: `${D.represents}${D.established ? '' : ' (no such capability in HQ yet: an unclaimed plot)'}`, district: D.id, established: D.established, stations: {}, door: navNodes[door], kind: D.structure };
    for (const [sid, fx, d, use, pose, facing] of tpl.stations) station(loc, `${D.id}:${sid}`, at(D, fx, d), use, pose, facing, [D.id], inn);
    for (const [type, fx, d, w, dd, h] of tpl.solids) { const c = at(D, fx, d); solids.push({ district: D.id, type, x0: c.x - w / 2, x1: c.x + w / 2, z0: c.z - dd / 2, z1: c.z + dd / 2, h }); }
    location(loc, D, D.row === 'back' ? KINGDOM.height.back : KINGDOM.height.front);
  }
  // Summoning zones: locations inside the circle's grounds, each walked to from the circle's entry.
  const S = districts.summoning;
  for (const [zid, fx0, fx1, d0, d1, st] of SUMMON_ZONES) {
    const a = at(S, fx0, d0), b = at(S, fx1, d1), rect = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
    const loc = { id: zid, name: `Summoning Circle: ${title(zid.replace('summon-', ''))}`, represents: 'Provisioning stage (HQ lifecycle)', district: 'summoning', zone: true, stations: {}, kind: 'summon-zone' };
    for (const [key, fx, d, facing] of st) station(loc, `${zid}:${key}`, at(S, fx, d), 'candidate', 'stand', facing, ['summoning'], inOf.summoning);
    loc.door = Object.values(loc.stations)[0];
    location(loc, rect, 10);
  }
  for (const [type, fx, d, w, dd, h] of SUMMON_SOLIDS) { const c = at(S, fx, d); solids.push({ district: 'summoning', type, x0: c.x - w / 2, x1: c.x + w / 2, z0: c.z - dd / 2, z1: c.z + dd / 2, h }); }

  // Construction plots in the Builders' Yard.
  const Y = districts.yard, plots = [];
  [...open, ...guilds].forEach((p, i) => {
    const px0 = Y.x0 + KINGDOM.stockW + i * KINGDOM.plotW + 10, px1 = px0 + KINGDOM.plotW - 20, rect = { x0: px0, x1: px1, z0: Y.z0 + 20, z1: Y.z1 - 40 };
    const cx = (px0 + px1) / 2, cap = world.capabilities?.[p.id], home = districtOfCapability(cap?.spec);
    plots.push({ project: p, rect, cx, district: home, guild: p.completed });
    if (p.completed) return; // a finished guild hall: drawn, not a site
    const lid = `site:${p.id}`, gate = node(`${lid}~gate`, { x: cx, z: rect.z1 - 10 }, ['yard']);
    link(inOf.yard, gate, 'yard');
    const loc = { id: lid, name: `${title(cap?.spec?.name ?? p.id)}: ${CONSTRUCTION_PHASES[p.stage]?.label ?? p.stage}`, represents: `Construction for ${p.id}${home ? ` (for ${DISTRICTS[home].name})` : ''}`, district: 'yard', site: true, reachable: true, gate: navNodes[gate], project: p, stations: {}, kind: 'site' };
    for (const [key, fx, d, use] of [['build1', 0.25, 0.4, 'build'], ['build2', 0.75, 0.4, 'build'], ['inspect1', 0.5, 0.18, 'site-inspect']]) {
      const q = { x: px0 + (px1 - px0) * fx, z: rect.z1 - (rect.z1 - rect.z0) * d };
      station(loc, `${lid}:${key}`, q, use, 'stand', 'front', ['yard'], gate);
    }
    loc.door = loc.gate;
    location(loc, rect, 120);
    const ids = Object.keys(loc.stations);
    siteStations[p.id] = { build: ids.filter(i => stationInfo[`${lid}:${i}`].use === 'build'), inspect: ids.filter(i => stationInfo[`${lid}:${i}`].use === 'site-inspect') };
  });

  // The Kingdom Road and market square (exterior): the quest board and benches along its front edge.
  const plazaX = (districts.throne.x0 + districts.throne.x1) / 2 - 150;
  const plazaLoc = { id: 'plaza', name: 'Kingdom Road', represents: 'Paths between districts; the quest board where queued work waits', exterior: true, stations: {}, kind: 'road' };
  const spineNode = sx => `road:${Math.round(sx)}`;
  const PLAZA = [['board', plazaX, KINGDOM.road.z1 - 34, 'look', 'stand', 'back'], ['wait1', plazaX - 90, KINGDOM.road.z0 + 26, 'wait', 'sit', 'back'], ['wait2', plazaX - 60, KINGDOM.road.z0 + 26, 'wait', 'sit', 'back'], ['wait3', plazaX + 60, KINGDOM.road.z0 + 26, 'wait', 'sit', 'back'], ['wait4', plazaX + 90, KINGDOM.road.z0 + 26, 'wait', 'sit', 'back'], ['well', plazaX + 260, KINGDOM.road.z1 - 34, 'look', 'stand', 'back']];
  for (const [, sx] of PLAZA) spineXs.add(sx);
  const xs = [...spineXs].sort((a, b) => a - b), dense = [];
  for (let k = 0; k < xs.length; k++) { dense.push(xs[k]); if (k + 1 < xs.length) for (let v = xs[k] + 90; v < xs[k + 1] - 30; v += 90) dense.push(v); }
  const spine = dense.map(sx => node(spineNode(sx), { x: sx, z: KINGDOM.road.spine }, ['road']));
  for (let k = 1; k < spine.length; k++) link(spine[k - 1], spine[k], 'road');
  for (const D of Object.values(districts)) link(spineNode(D.door.x), `door:${D.id}`, 'road');
  for (const [sid, sx, sz, use, pose, facing] of PLAZA) station(plazaLoc, `plaza:${sid}`, { x: sx, z: sz }, use, pose, facing, ['road'], spineNode(sx));
  solids.push({ district: 'road', type: 'quest-board', x0: plazaX - 30, x1: plazaX + 30, z0: KINGDOM.road.z1 - 14, z1: KINGDOM.road.z1 - 4, h: 60 });
  solids.push({ district: 'road', type: 'well', x0: plazaX + 245, x1: plazaX + 275, z0: KINGDOM.road.z1 - 22, z1: KINGDOM.road.z1 - 2, h: 26 });
  plazaLoc.door = navNodes[spineNode(districts.gate.door.x)];
  location(plazaLoc, road, 8);

  // ---- Lookups. ----
  const locationById = Object.fromEntries(locations.map(l => [l.id, l]));
  // Real's semantic ids, for code that asks for them by name (behaviour defaults, meetings, systems).
  for (const [alias, target] of Object.entries({ queue: 'plaza', development: 'forge', testing: 'oracle', comms: 'throne', lounge: 'hearth', command: 'throne', archive: 'library', servers: 'arcane', operations: 'throne', deploy: 'gate', hall: 'plaza', onboarding: 'summon-arrive', summoning: 'summoning' })) locationById[alias] ??= locationById[target];
  const stationsWith = (locId, uses) => { const l = locationById[locId]; return l ? Object.keys(l.stations).filter(k => uses.includes(stationInfo[`${l.id}:${k}`]?.use)).sort((a, b) => uses.indexOf(stationInfo[`${l.id}:${a}`].use) - uses.indexOf(stationInfo[`${l.id}:${b}`].use)) : []; };
  const place = (locId, uses, clip) => ({ location: locationById[locId].id, stations: stationsWith(locId, uses), ...(clip ? { clip } : {}) });
  const places = {
    coding: place('forge', ['work']), thinking: place('forge', ['work']),
    reviewing: place('oracle', ['inspect']), testing: place('oracle', ['inspect']),
    researching: place('library', ['read']), communicating: place('throne', ['meeting']),
    waiting: place('plaza', ['wait']), idle: place('hearth', ['relax']), offline: place('hearth', ['relax']),
    onboarding: place('summon-arrive', ['candidate']),
  };
  for (const [zid] of SUMMON_ZONES) places[zid] = place(zid, ['candidate']);

  // Where an agent works (THEME): a construction site while HQ reports the build; otherwise its home district when that
  // district has stations for the activity (the Oracle inspects in the Oracle Chamber, an apprentice reads at the
  // Academy), else the district the activity stands for. Idle agents rest in their home district. Never keyed by id.
  const PRODUCTIVE = new Set(['coding', 'thinking', 'testing', 'reviewing', 'researching']);
  function siteFor(agent) {
    if (!agent?.taskId || !PRODUCTIVE.has(agent.activity)) return null;
    const p = Object.values(projects).find(q => q.taskIds?.includes(agent.taskId));
    if (!p || p.completed || p.blocked || p.waiting || !siteStations[p.id]) return null;
    const inspecting = ['testing', 'reviewing'].includes(agent.activity) || p.stage === 'inspection';
    if (!inspecting && !buildersWork(p)) return null;
    const stations = inspecting ? [...siteStations[p.id].inspect, ...siteStations[p.id].build] : siteStations[p.id].build;
    return stations.length ? { location: `site:${p.id}`, stations, clip: inspecting ? 'review' : 'work' } : null;
  }
  function placeFor(agent) {
    const site = siteFor(agent); if (site) return site;
    const act = agent?.activity;
    if (!ACTIVITY_USES[act] || act === 'communicating' || act === 'waiting') return null;
    const dom = domainOf(definitionOf(agent)), uses = (act === 'idle' || act === 'offline') ? dom.idleUses ?? ACTIVITY_USES[act] : ACTIVITY_USES[act];
    const home = locationById[dom.district], st = home ? stationsWith(home.id, uses) : [];
    if (st.length) return { location: home.id, stations: st, clip: ACTIVITY_PLACE[act]?.clip ?? 'idle' };
    return null;
  }

  function planAt(sx, sy) { const [px, pz] = P.plan(sx, sy); return { floor: 0, x: px, z: pz, score: 0 }; }
  const inRect = (q, r, pad = 0) => q.x >= r.x0 - pad && q.x <= r.x1 + pad && q.z >= r.z0 - pad && q.z <= r.z1 + pad;
  function locationAt(sx, sy) {
    const p = planAt(sx, sy);
    const hits = locations.filter(l => !l.exterior && inRect(p, l.room, 2)).sort((a, b) => (a.room.x1 - a.room.x0) * (a.room.z1 - a.room.z0) - (b.room.x1 - b.room.x0) * (b.room.z1 - b.room.z0));
    return hits[0] ?? (inRect(p, road) ? plazaLoc : null);
  }
  // A straight walk inside one walk area that meets no furniture.
  const areaById = Object.fromEntries(walkAreas.map(a => [a.id, a]));
  const areasAt = q => walkAreas.filter(a => inRect(q, a, 4.5)).map(a => a.id);
  const hitsSolid = (a, b) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
    for (let k = 0; k <= n; k++) { const q = { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }; if (solids.some(s => q.x > s.x0 + 0.5 && q.x < s.x1 - 0.5 && q.z > s.z0 + 0.5 && q.z < s.z1 - 0.5)) return true; }
    return false;
  };
  const clear = (a, b, area) => { const r = areaById[area]; return r && inRect(a, r, 4.5) && inRect(b, r, 4.5) && !hitsSolid(a, b); };
  function attach(pt) {
    const p = planAt(pt[0], pt[1]), areas = areasAt(p); if (!areas.length) return null;
    const near = Object.keys(plan).filter(id => areaOf[id].some(a => areas.includes(a))).map(id => ({ id, d: Math.hypot(plan[id].x - p.x, plan[id].z - p.z) })).sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
    for (const c of near.slice(0, 40)) if (c.d < 1 || areaOf[c.id].some(a => areas.includes(a) && clear(p, plan[c.id], a))) return { id: c.id, at: p };
    return null;
  }
  function shortest(start, goal) {
    const d = { [start]: 0 }, prev = {}, openSet = new Set([start]);
    while (openSet.size) {
      let u = null; for (const n of openSet) if (u === null || d[n] < d[u] || (d[n] === d[u] && n < u)) u = n;
      openSet.delete(u); if (u === goal) break;
      for (const v of adjacency[u] || []) { const alt = d[u] + dist(navNodes[u], navNodes[v]); if (alt < (d[v] ?? Infinity)) { d[v] = alt; prev[v] = u; openSet.add(v); } }
    }
    if (start !== goal && prev[goal] === undefined) return null;
    const path = []; for (let n = goal; n; n = prev[n]) { path.unshift(n); if (n === start) break; }
    return path[0] === start ? path : null;
  }
  function route(from, toLocationId, toPoint) {
    const s = attach(from), e = attach(toPoint); if (!s || !e) return null;
    const path = shortest(s.id, e.id); if (!path) return null;
    const pts = [];
    for (const n of path) { const q = [...navNodes[n]]; q.at = { floor: 0, x: plan[n].x, z: plan[n].z, node: n }; pts.push(q); }
    if (dist(pts.at(-1), toPoint) > 0.5) { const q = [toPoint[0], toPoint[1]]; q.at = { floor: 0, x: e.at.x, z: e.at.z, node: null }; pts.push(q); }
    const out = pts.filter((q, i) => i > 0 || dist(q, from) >= 0.5);
    return out.length ? out : [Object.assign([toPoint[0], toPoint[1]], { at: { floor: 0, x: e.at.x, z: e.at.z, node: null } })];
  }
  const metric = (a, b) => { const dy = b[1] - a[1], dz = -dy / g.sky, dx = b[0] - a[0] - dz * g.skx; return Math.hypot(dx, dz); };

  // Standing spots when a district's stations are all taken: free grid points between its entry and its stations,
  // a body's width from every station and each other, reached by a clear straight walk from the entry.
  const overflowCache = {};
  function overflowSpots(locationId) {
    if (overflowCache[locationId]) return overflowCache[locationId];
    const loc = locationById[locationId], out = []; overflowCache[locationId] = out;
    if (!loc || loc.exterior) return out;
    const D = districts[loc.district] ?? districts[loc.id]; if (!D) return out;
    const R = loc.room, gap = AGENT.footprint.w + 2, entry = plan[inOf[D.id]], cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    const keep = [...Object.keys(loc.stations).map(k => stationInfo[`${loc.id}:${k}`]), entry];
    const cells = [];
    for (let gx = R.x0 + 14; gx <= R.x1 - 14; gx += gap) for (let gz = R.z0 + 14; gz <= R.z1 - 14; gz += gap) cells.push({ x: gx, z: gz, d: Math.hypot(gx - cx, gz - cz) });
    cells.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
    for (const c of cells) {
      if ([...keep, ...out.map(o => o.at)].some(q => Math.hypot(q.x - c.x, q.z - c.z) < gap)) continue;
      if (!clear(entry, c, D.id)) continue;
      const pt = P.at(c.x, c.z, 0); pt.at = { floor: 0, x: c.x, z: c.z, node: null }; out.push(pt);
      if (out.length >= 24) break;
    }
    return out;
  }

  // Fixtures, task slots, system spots, the council table.
  const boardInfo = stationInfo['plaza:plaza:board'], archiveInfo = stationInfo['library:library:read3'];
  const fixtures = { taskBoard: { point: boardInfo.point, location: 'plaza', facing: 'back' }, archive: { point: archiveInfo.point, location: 'library', facing: 'back' } };
  const [qx, qy] = P.at(plazaX - 26, KINGDOM.road.z1 - 9, 0, 54), shelf = solids.find(s => s.district === 'library' && s.type === 'shelf' && s.x0 > districts.library.x0 + (districts.library.x1 - districts.library.x0) * 0.6);
  const [ax, ay] = P.at(shelf.x0 + 4, shelf.z0, 0, shelf.h - 8);
  const taskSlots = { queue: { x: qx, y: qy, cols: 6, step: 8 }, archive: { x: ax, y: ay, cols: 8, step: 7 } };
  const above = id => { const D = districts[id]; return P.at((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, 0, (D.row === 'back' ? KINGDOM.height.back : 60) + 30); };
  const systemSpots = { database: above('arcane'), tests: above('oracle'), platform: above('throne'), hq: above('throne'), deploy: above('gate'), build: above('arcane') };
  const table = solids.find(s => s.type === 'council-table');

  // Camera.
  const box = (x0, x1, z0, z1, h) => { const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].flatMap(([px, pz]) => [P.at(px, pz, 0, 0), P.at(px, pz, 0, h)]); const sx = pts.map(q => q[0]), sy = pts.map(q => q[1]); return { x: Math.min(...sx), y: Math.min(...sy), w: Math.max(...sx) - Math.min(...sx), h: Math.max(...sy) - Math.min(...sy) }; };
  const grow = (b, k) => ({ x: b.x - k, y: b.y - k, w: b.w + 2 * k, h: b.h + 2 * k });
  const home = grow(box(0, Math.max(frontEnd, backEnd), KINGDOM.front.z0, KINGDOM.back.z1, KINGDOM.height.back + 60), 40);
  const bounds = grow(home, 500);

  const layout = {
    id: 'kingdom', kind: 'iso', generated: true, kingdom: true, world, view: null, U, P, g, pitch: 0, levels: [0], furnishing: {}, home, bounds, metric,
    entityScale: 0.5, overflowStep: AGENT.footprint.w + 2, walkSpeed: AGENT.walkSpeed, arriveDistance: AGENT.arriveDistance, characterHeight: AGENT.height,
    spawn: 'gate', locations, locationById, navNodes, navEdges, edgeSpace, nodePlan: plan, locationAt, planAt, route, overflowSpots, lifts: {}, liftOf: {}, stationInfo,
    places, placeFor, projects, taskSlots, systemSpots, fixtures, signals: {},
    def: { FURNITURE: table ? [{ id: 'table', x: (table.x0 + table.x1) / 2, z: (table.z0 + table.z1) / 2, floor: 0, h: table.h }] : [] },
    // Kingdom specifics (read by the kingdom skin, the derived entities and the tests).
    districts, road, walkAreas, walls, solids, plots, established, areasAt,
    idleRooms: ['hearth'], publicRooms: ['plaza', 'hearth', 'gate'], ambientCount: 3,
  };
  // Derived theme entities (themes/fantasy/entities.mjs): a pure function of canonical state, read-only.
  layout.derive = storeWorld => deriveKingdomEntities(layout, storeWorld);
  return layout;
}
