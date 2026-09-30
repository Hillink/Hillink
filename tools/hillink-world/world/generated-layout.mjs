// Pass 5B: the World's layout, generated. It turns the canonical procedural world (procgen/) into exactly the layout
// interface the engine already runs on (engine/world-view.mjs, engine/iso-view.mjs, core/behavior.mjs): locations
// with stations and doors, a projected navigation graph with lifts, route(), planAt(), locationAt(), places,
// task slots and system spots. So the old World's behaviour (walking, doors, sitting at desks, riding the elevator,
// break-room life, meetings, handoffs, construction visits) runs unchanged on generated geometry.
//
// Plan space is the view frame (procgen/view.mjs) in render units: x across the screen, z away from the camera.
// Floors are drawn as an exploded cutaway stack: each storey sits `pitch` above the one below, enough that a lower
// storey's rooms and people stay visible under the next (the dollhouse the old World used, for deeper buildings).
//
// Navigation comes from the furnishing's walk grids (procgen/furnish.mjs): inside a space every edge follows free
// grid cells, so no route crosses furniture or a wall; spaces join only at door nodes; storeys join only through a
// built elevator. Only built structures are walkable. A construction site is a location of its own, reached by
// its builders along one access edge from the nearest walkable node.
import { viewOf } from '../procgen/view.mjs';
import { furnishSpace, gridWalk, approachCell } from '../procgen/furnish.mjs';
import { UNITS_PER_METRE } from '../procgen/units.mjs';
import { represent } from '../procgen/themes.mjs';
import { STAGE_LABEL, stageIndex, buildersWork } from '../procgen/construction.mjs';
import { frames } from '../procgen/camera.mjs';
import { placeKind as placeKindOf } from '../procgen/furnish.mjs';
import { hull, inPolygon } from '../engine/iso.mjs';
import { AGENT, ARCH } from './scale.mjs';

const U = UNITS_PER_METRE;
const title = s => String(s).replace(/(^|\s)\S/g, c => c.toUpperCase());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// The old World's semantic location ids, so behaviour, props and aliases keep working.
const SEMANTIC = { lobby: 'queue', development: 'development', testing: 'testing', comms: 'comms', lounge: 'lounge', command: 'command', servers: 'servers', archive: 'archive' };

export function createGeneratedLayout(world, { theme = 'real' } = {}) {
  const view = viewOf(world), labels = new Map(represent(world, theme === 'blueprint' ? 'real' : theme).items.map(i => [`${i.primitive}:${i.canonicalId}`, i.label]));
  const all = Object.values(world.spaces);
  const levelsOf = [...new Set(all.map(s => s.level))].sort((a, b) => a - b);
  // Exploded pitch: a storey plus the deepest building's receding depth, so storeys do not hide each other.
  const depthU = Math.max(0, ...Object.values(world.buildings).map(b => { const r = view.rectToView(b.footprint); return (r.z1 - r.z0) * U; }));
  const g = { skx: 0.5, sky: 0.4, height: ARCH.floorHeight, slab: ARCH.slab, base: 560, depth: depthU };
  const pitch = Math.round(ARCH.floorHeight * 0.5 + ARCH.slab + depthU * g.sky + 10);
  const baseOf = f => g.base - f * pitch;
  const P = { g, pitch, baseOf, at: (x, z, f = 0, h = 0) => [x + z * g.skx, baseOf(f) - z * g.sky - h], plan: (sx, sy, f = 0) => { const z = (baseOf(f) - sy) / g.sky; return [sx - z * g.skx, z]; } };
  const toPlan = (vx, vz) => ({ x: vx * U, z: vz * U });
  const rectPlan = r => ({ x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U });

  // Furnishing for every space that is built or being fitted out (a construction site shows its furniture arriving).
  const furnishing = {};
  const furnished = s => (s.primitive === 'room' || s.primitive === 'hallway' || s.primitive === 'outdoor-facility') && (s.status === 'built' || s.status === 'under-construction');
  for (const s of all) if (furnished(s)) furnishing[s.id] = furnishSpace(world, s, view);
  const walkable = s => s.status === 'built' && furnishing[s.id];

  const plan = {}, navNodes = {}, adjacency = {}, navEdges = [];
  const node = (id, vx, vz, floor) => { if (!plan[id]) { const p = toPlan(vx, vz); plan[id] = { floor, x: p.x, z: p.z }; navNodes[id] = P.at(p.x, p.z, floor); } return id; };
  const link = (a, b, space) => { if (a === b) return; navEdges.push([a, b]); (adjacency[a] ||= []).push(b); (adjacency[b] ||= []).push(a); edgeSpace.push(space); };
  const edgeSpace = [];
  const chain = (ids, space) => { for (let k = 1; k < ids.length; k++) link(ids[k - 1], ids[k], space); };
  const doorLevel = d => d.level ?? 0;

  // Inside each walkable space: door nodes, the entry cell behind each door, door-to-door walks, and a walk from the
  // nearest door to every anchor (and to a hall's lift landing).
  const locations = [], locationOf = {}, stationInfo = {}, siteStations = {};
  const lifts = {}, liftOf = {};
  const builtDoors = Object.values(world.doors).filter(d => d.status === 'built');
  // The biggest room of each kind takes the semantic id (so a new, larger meeting room becomes the meeting room).
  const area = s => s.rect.w * s.rect.h;
  for (const s of all.filter(walkable).sort((a, b) => area(b) - area(a) || (a.id < b.id ? -1 : 1))) {
    const F = furnishing[s.id], grid = F.grid, floor = s.level;
    const doors = F.doors.filter(d => builtDoors.some(b => b.id === d.id));
    const inOf = {};
    for (const [cell, doorId] of grid.startDoor) if (doors.some(d => d.id === doorId)) {
      const d = doors.find(x => x.id === doorId), c = grid.centreOf(cell);
      node(`door:${doorId}`, d.c.x, d.c.z, floor);
      inOf[doorId] = { cell, id: node(`${s.id}~in~${doorId}`, c.x, c.z, floor) };
      link(`door:${doorId}`, inOf[doorId].id, s.id);
    }
    const walk = (fromDoor, cell, key) => {
      const pts = gridWalk(grid, inOf[fromDoor].cell, cell); if (!pts) return null;
      const ids = [inOf[fromDoor].id, ...pts.slice(1).map((p, k) => node(`${s.id}~${key}~${k}`, p.x, p.z, floor))];
      chain(ids, s.id); return ids.at(-1);
    };
    const doorIds = Object.keys(inOf);
    for (let i = 0; i < doorIds.length; i++) for (let j = i + 1; j < doorIds.length; j++) { const end = walk(doorIds[i], inOf[doorIds[j]].cell, `d${i}-${j}`); if (end) link(end, inOf[doorIds[j]].id, s.id); }
    const nearestDoor = cell => doorIds.find(d => gridWalk(grid, inOf[d].cell, cell)) ?? null;
    const reachTo = (target, key) => {
      const cell = approachCell(grid, target); if (cell === -1) return null;
      const from = nearestDoor(cell); if (!from) return null;
      return walk(from, cell, key);
    };
    // Location for this space.
    const id = semanticId(world, s, locations);
    const R = rectPlan(F.rect);
    const loc = { id, name: title(labels.get(`${s.primitive}:${s.id}`) ?? s.id), represents: represents(world, s), floor, stations: {}, door: null, room: { ...R, floor, spaceId: s.id, kind: F.kind, x0: R.x0, x1: R.x1 }, spaceId: s.id };
    for (const a of F.anchors) {
      const end = reachTo(a, `a:${a.id}`); if (!end) continue;
      node(a.id, a.x, a.z, floor); link(end, a.id, s.id);
      loc.stations[a.id] = navNodes[a.id];
      const p = toPlan(a.x, a.z);
      stationInfo[`${id}:${a.id}`] = { id: a.id, room: id, x: p.x, z: p.z, pose: a.pose, facing: a.facing, use: a.use, of: a.of, floor, point: navNodes[a.id] };
    }
    // A hall's built lift: its landing is in front of the doors, on this storey.
    const lift = all.find(o => o.primitive === 'elevator' && o.inside === s.id && o.status === 'built');
    if (lift) {
      const L = view.rectToView(lift.rect), landing = { x: (L.x0 + L.x1) / 2, z: L.z0 - 0.55 };
      const end = reachTo(landing, 'lift');
      if (end) { const lid = `lift:${lift.buildingId}`, n = node(`${lid}@${floor}`, landing.x, landing.z, floor); link(end, n, s.id); liftOf[n] = lid; (lifts[lid] ||= { id: lid, buildingId: lift.buildingId, levels: [], landings: {}, shaft: rectPlan(L) }).levels.push(floor); lifts[lid].landings[floor] = n; }
    }
    loc.door = doorIds.length ? navNodes[`door:${doorIds[0]}`] : Object.values(loc.stations)[0] ?? P.at((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, floor);
    locationOf[s.id] = loc; locations.push(loc);
  }
  // The elevator: stops at every storey it serves, joined as one ride.
  for (const l of Object.values(lifts)) {
    l.levels.sort((a, b) => a - b);
    for (let k = 1; k < l.levels.length; k++) link(l.landings[l.levels[k - 1]], l.landings[l.levels[k]], `${l.id}`);
    const cx = (l.shaft.x0 + l.shaft.x1) / 2, cz = (l.shaft.z0 + l.shaft.z1) / 2;
    Object.assign(l, { x: P.at(cx, cz, 0)[0], stops: l.levels.map(f => P.at(cx, cz, f)[1]), floors: [...l.levels], w: ARCH.elevator.w, h: ARCH.elevator.h, car: { x: cx, z: cz, w: ARCH.elevator.w, d: ARCH.elevator.d } });
  }

  // Outdoors: built roads and paths (a path starts at its road's end and ends on its entrance door).
  const wayNodes = w => w.points.map((p, k) => { const v = view.toView(p.x, p.y); return node(`${w.id}#${k}`, v.x, v.z, 0); });
  const roadNodes = {};
  for (const r of Object.values(world.roads).filter(r => r.status === 'built')) { roadNodes[r.id] = wayNodes(r); chain(roadNodes[r.id], r.id); }
  const nearestRoadNode = p => { let best = null; for (const ids of Object.values(roadNodes)) for (const id of ids) { const d = Math.hypot(plan[id].x - p.x, plan[id].z - p.z); if (!best || d < best.d) best = { id, d }; } return best?.id ?? null; };
  for (const r of Object.values(world.roads).filter(r => r.status === 'built' && r.from && roadNodes[r.from])) link(roadNodes[r.id][0], nearestRoadNode(plan[roadNodes[r.id][0]]), r.id);
  let spawn = null;
  for (const p of Object.values(world.paths).filter(p => p.status === 'built')) {
    const ids = wayNodes(p); chain(ids, p.id);
    const start = nearestRoadNode(plan[ids[0]]); if (start) link(ids[0], start, p.id);
    const door = world.doors[p.to]; if (door && plan[`door:${door.id}`]) link(ids.at(-1), `door:${door.id}`, p.id);
    if (p.buildingId === foundingId(world)) spawn = ids[0]; else spawn ??= ids[0];
  }
  // The plaza: outside the founding building's door, where new agents arrive.
  if (spawn) {
    const pt = plan[spawn], loc = { id: 'plaza', name: theme === 'fantasy' ? 'Outside the keep' : 'Outside', represents: 'Where agents arrive and leave', floor: 0, stations: {}, door: navNodes[spawn], exterior: true, room: { x0: pt.x - 60, x1: pt.x + 60, z0: pt.z - 60, z1: pt.z + 60, floor: 0, spaceId: null, kind: 'outside', exterior: true }, spaceId: null };
    locations.push(loc);
  }

  // Construction sites (projects not yet complete): a location with builder stations just inside the site's front edge,
  // reached along one access edge from the nearest walkable node on its storey (or the storey below).
  const projects = world.projects ?? {};
  for (const p of Object.values(projects)) {
    if (p.completed) continue;
    const parts = all.filter(s => s.project === p.id && s.primitive !== 'staircase' && s.primitive !== 'elevator');
    if (!parts.length) continue;
    const level = Math.max(...parts.map(s => s.level));
    const rs = parts.filter(s => s.level === level).map(s => view.rectToView(s.rect));
    const r = { x0: Math.min(...rs.map(q => q.x0)), x1: Math.max(...rs.map(q => q.x1)), z0: Math.min(...rs.map(q => q.z0)), z1: Math.max(...rs.map(q => q.z1)) };
    const lid = `site:${p.id}`, w = r.x1 - r.x0, stations = {};
    const spots = [['build1', r.x0 + w * 0.3, 'build'], ['build2', r.x0 + w * 0.7, 'build'], ['inspect1', r.x0 + w * 0.5, 'site-inspect']];
    for (const [key, x, use] of spots) {
      const sid = `${lid}:${key}`; node(sid, x, r.z0 + 0.6, level);
      stations[sid] = navNodes[sid];
      stationInfo[`${lid}:${sid}`] = { id: sid, room: lid, x: toPlan(x, 0).x, z: toPlan(0, r.z0 + 0.6).z, pose: 'stand', facing: 'back', use, floor: level, point: navNodes[sid] };
    }
    const ids = Object.keys(stations);
    chain(ids, lid);
    const access = nearestNode(plan[ids[0]], level, true) ?? nearestNode(plan[ids[0]], level - 1, true);
    if (access) link(access, ids[0], lid);
    const R = rectPlan(r);
    locations.push({ id: lid, name: `${title(labels.get(`room:${parts[0].id}`) ?? p.id)}: ${STAGE_LABEL[p.stage]}`, represents: `Construction for ${p.id}`, floor: level, stations, door: navNodes[ids[0]], site: true, project: p, room: { ...R, floor: level, spaceId: null, kind: 'site', site: true }, spaceId: null });
    siteStations[p.id] = { build: ids.slice(0, 2), inspect: ids.slice(2) };
  }
  function nearestNode(pt, floor, skipSites = false) {
    let best = null, bestD = Infinity;
    for (const [id, n] of Object.entries(plan)) {
      if (n.floor !== floor || liftOf[id] || (skipSites && id.startsWith('site:'))) continue;
      const d = Math.hypot(n.x - pt.x, n.z - pt.z);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // Screen boxes for picking and focus.
  for (const l of locations) {
    const r = l.room, top = l.exterior ? 10 : ARCH.floorHeight;
    l.poly = hull([[r.x0, r.z0, 0], [r.x1, r.z0, 0], [r.x0, r.z1, 0], [r.x1, r.z1, 0], [r.x0, r.z0, top], [r.x1, r.z0, top], [r.x0, r.z1, top], [r.x1, r.z1, top]].map(([x, z, h]) => P.at(x, z, l.floor, h)));
    const xs = l.poly.map(q => q[0]), ys = l.poly.map(q => q[1]);
    Object.assign(l, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  const locationById = Object.fromEntries(locations.map(l => [l.id, l]));
  const pick = (...ids) => ids.map(i => locationById[i]).find(Boolean) ?? locations.find(l => !l.exterior && !l.site) ?? locations[0];
  for (const [alias, targets] of Object.entries({ queue: ['queue'], development: ['development', 'command'], testing: ['testing', 'development'], comms: ['comms', 'lounge'], lounge: ['lounge', 'comms', 'queue'], command: ['command', 'queue'], archive: ['archive', 'development'], servers: ['servers', 'development'], operations: ['command', 'queue'], deploy: ['queue'], hall: ['queue'] })) locationById[alias] ??= pick(...targets);

  // Where World behaviour sends each activity: the anchors of the right kind in the right room.
  // In the order of the uses asked for (a researcher goes to the printer before the shelf).
  const stationsWith = (locId, uses) => { const l = locationById[locId]; return l ? Object.keys(l.stations).filter(k => uses.includes(stationInfo[`${l.id}:${k}`]?.use)).sort((a, b) => uses.indexOf(stationInfo[`${l.id}:${a}`].use) - uses.indexOf(stationInfo[`${l.id}:${b}`].use)) : []; };
  const place = (locId, uses, fallback) => { const l = locationById[locId], st = stationsWith(locId, uses); return st.length ? { location: l.id, stations: st } : fallback ?? { location: l.id, stations: Object.keys(l.stations).length ? Object.keys(l.stations) : [Object.keys(locationById.queue.stations)[0]].filter(Boolean) }; };
  const places = {
    coding: place('development', ['work']),
    thinking: place('development', ['work']),
    reviewing: place('testing', ['inspect'], place('development', ['work'])),
    testing: place('testing', ['inspect'], place('development', ['work'])),
    researching: place('development', ['print', 'read'], place('archive', ['read'])),
    communicating: place('comms', ['meeting', 'table']),
    waiting: place('queue', ['wait']),
    idle: place('lounge', ['relax', 'coffee', 'snack', 'table'], place('queue', ['wait'])),
    offline: place('lounge', ['relax', 'table'], place('queue', ['wait'])),
  };
  // An agent on a construction project's task works at its site while HQ reports the build (never after it is
  // complete, never while it is blocked); testing or reviewing it is an inspection on site.
  const PRODUCTIVE = new Set(['coding', 'thinking', 'testing', 'reviewing', 'researching']);
  function placeFor(agent) {
    if (!agent?.taskId || !PRODUCTIVE.has(agent.activity)) return null;
    const p = Object.values(projects).find(q => q.taskIds.includes(agent.taskId));
    if (!p || p.completed || p.blocked || !siteStations[p.id]) return null;
    const inspecting = ['testing', 'reviewing'].includes(agent.activity) || p.stage === 'inspection';
    if (!inspecting && !buildersWork(p)) return null;
    return { location: `site:${p.id}`, stations: inspecting ? [...siteStations[p.id].inspect, ...siteStations[p.id].build] : siteStations[p.id].build, clip: inspecting ? 'review' : 'work' };
  }

  // Floor detection for a projected point: the storey whose walkable space contains it (outdoors is storey 0).
  const bySpace = all.filter(s => furnishing[s.id]).map(s => ({ floor: s.level, r: rectPlan(view.rectToView(s.rect)) }));
  function planAt(x, y) {
    let outside = null;
    for (const f of [...levelsOf].sort((a, b) => b - a)) {
      const [px, pz] = P.plan(x, y, f);
      if (bySpace.some(s => s.floor === f && px >= s.r.x0 - 6 && px <= s.r.x1 + 6 && pz >= s.r.z0 - 6 && pz <= s.r.z1 + 6)) return { floor: f, x: px, z: pz, score: 0 };
      if (f === 0) outside = { floor: 0, x: px, z: pz, score: 1 };
    }
    if (outside) return outside;
    const [px, pz] = P.plan(x, y, 0); return { floor: 0, x: px, z: pz, score: 1 };
  }
  function locationAt(x, y) {
    const p = planAt(x, y);
    const hit = locations.find(l => l.floor === p.floor && !l.exterior && p.x >= l.room.x0 - 2 && p.x <= l.room.x1 + 2 && p.z >= l.room.z0 - 2 && p.z <= l.room.z1 + 2);
    return hit ?? locations.find(l => !l.exterior && inPolygon(l.poly, x, y)) ?? null;
  }
  function nearestTo(pt) {
    const p = planAt(pt[0], pt[1]);
    let best = null, bestD = Infinity;
    for (const [id, n] of Object.entries(plan)) {
      if (n.floor !== p.floor) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best) return best;
    for (const [id, q] of Object.entries(navNodes)) { const d = dist(q, pt); if (d < bestD) { bestD = d; best = id; } }
    return best;
  }
  function shortest(start, goal) {
    const d = { [start]: 0 }, prev = {}, open = new Set([start]);
    while (open.size) {
      let u = null; for (const n of open) if (u === null || d[n] < d[u]) u = n;
      open.delete(u);
      if (u === goal) break;
      for (const v of adjacency[u] || []) {
        const alt = d[u] + (liftOf[u] && liftOf[v] ? 20 : dist(navNodes[u], navNodes[v]));
        if (alt < (d[v] ?? Infinity)) { d[v] = alt; prev[v] = u; open.add(v); }
      }
    }
    const path = []; for (let n = goal; n; n = prev[n]) { path.unshift(n); if (n === start) break; }
    return path[0] === start ? path : [start, goal];
  }
  function route(from, toLocationId, toPoint) {
    const start = nearestTo(from), goal = nearestTo(toPoint);
    const path = shortest(start, goal), out = [];
    path.forEach((n, i) => {
      const ride = i > 0 && liftOf[n] && liftOf[n] === liftOf[path[i - 1]];
      if (ride && i + 1 < path.length && liftOf[path[i + 1]] === liftOf[n]) return;
      if (i === 0 && dist(navNodes[n], from) < 0.5) return;
      const p = [...navNodes[n]];
      if (ride) p.lift = liftOf[n];
      out.push(p);
    });
    if (!out.length || dist(out.at(-1), toPoint) > 0.5) out.push([toPoint[0], toPoint[1]]);
    return out;
  }
  const metric = (a, b) => { const dy = b[1] - a[1], dz = -dy / g.sky, dx = b[0] - a[0] - dz * g.skx; return Math.hypot(dx, dz); };

  // Task board, archive shelf and the spots systems report from.
  const decorOf = type => Object.values(furnishing).flatMap(F => F.decor.map(d => ({ ...d, F }))).find(d => d.type === type);
  const itemOf = type => Object.values(furnishing).flatMap(F => F.items).find(i => i.type === type && world.spaces[i.spaceId]?.status === 'built');
  const itemTop = it => (it ? P.at(it.x * U, (it.z - it.d / 2) * U, it.level, it.h * U + 10) : null);
  const board = decorOf('taskBoard'), shelf = itemOf('bookshelf');
  const home0 = locationById.queue ?? locations[0];
  const taskSlots = {
    queue: board ? (() => { const [x, y] = P.at(board.x0 * U + 8, board.F.rect.z1 * U, board.level, board.h1 - 10); return { x, y, cols: 6, step: 12 }; })() : { x: home0.x + 10, y: home0.y + 10, cols: 6, step: 12 },
    archive: shelf ? (() => { const [x, y] = P.at((shelf.x - shelf.w / 2) * U + 3, (shelf.z - shelf.d / 2) * U, shelf.level, shelf.h * U - 10); return { x, y, cols: 4, step: 6 }; })() : { x: home0.x + 30, y: home0.y + 30, cols: 4, step: 6 },
  };
  const spot = type => itemTop(itemOf(type)) ?? [home0.x + home0.w / 2, home0.y];
  const systemSpots = { database: spot('serverRack'), tests: spot('reviewConsole'), platform: spot('reception'), hq: spot('reception'), deploy: spot('serverRack'), build: spot('serverRack') };

  // Camera: the founding building frames the overview; the settlement (plus room to grow) bounds panning.
  const founding = world.buildings[foundingId(world)];
  const boxOf = (rect, levels, h = ARCH.floorHeight + 20) => {
    const r = rectPlan(view.rectToView(rect)), pts = [];
    for (const f of levels) for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) for (const hh of [0, h]) pts.push(P.at(x, z, f, hh));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const grow = (b, k) => ({ x: b.x - k, y: b.y - k, w: b.w + 2 * k, h: b.h + 2 * k });
  const home = founding ? grow(boxOf(founding.footprint, founding.levels), 60) : { x: 0, y: 0, w: 800, h: 600 };
  const settle = frames(world).settlement, top = Math.max(0, ...levelsOf);
  const bounds = grow(boxOf(settle, [Math.min(0, ...levelsOf), top]), 400);
  const meetingTable = Object.values(furnishing).flatMap(F => F.items).find(i => i.type === 'roundTable' && locationById.comms?.spaceId === i.spaceId);

  return {
    id: 'generated', kind: 'iso', generated: true, world, view, U, P, g, pitch, levels: levelsOf, furnishing, home, bounds, metric,
    entityScale: 0.5, overflowStep: AGENT.footprint.w + 2, walkSpeed: AGENT.walkSpeed, arriveDistance: AGENT.arriveDistance, characterHeight: AGENT.height,
    spawn: locationById.plaza ? 'plaza' : 'queue',
    locations, locationById, navNodes, navEdges, edgeSpace, nodePlan: plan, locationAt, planAt, route, lifts, liftOf, stationInfo,
    places, placeFor, projects, taskSlots, systemSpots, signals: {},
    def: { FURNITURE: meetingTable ? [{ id: 'table', x: meetingTable.x * U, z: meetingTable.z * U, floor: meetingTable.level, h: meetingTable.h * U }] : [] },
  };
}

export function foundingId(world) {
  return Object.values(world.capabilities).find(c => c.option === 'founding')?.placement?.buildingId ?? Object.keys(world.buildings)[0];
}
function semanticId(world, s, taken) {
  const F = placeKindOf(world, s), sem = SEMANTIC[F];
  return sem && !taken.some(l => l.id === sem) ? sem : s.id;
}
function represents(world, s) {
  const caps = s.capabilities.map(id => world.capabilities[id]).filter(Boolean);
  if (caps.length) return `Capability: ${caps.map(c => `${c.id} (${c.status})`).join(', ')}`;
  return s.primitive === 'hallway' ? 'Circulation' : s.vacant ? 'Spare space, ready for a capability' : s.primitive;
}
