// Turns the building definition into the layout interface World behavior and the engine already use
// (locations with stations and doors, a nav graph with lifts, route, locationAt), in projected world
// units. The same layout serves every skin: Realistic, Fantasy and the Blueprint debug view.
import * as B from './building.mjs';
import { projector, hull, inPolygon } from '../engine/iso.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createIsoLayout(def = B) {
  const g = def.GEOMETRY, P = projector(g), D = g.depth;
  const roomById = Object.fromEntries(def.ROOMS.map(r => [r.id, r]));

  // Nav nodes: authored walkway nodes plus every interaction point (a point is a node joined to its `via`).
  const plan = {}; // id -> { floor, x, z }
  for (const [id, [floor, x, z]] of Object.entries(def.NAV.nodes)) plan[id] = { floor, x, z };
  for (const p of def.POINTS) plan[p.id] = { floor: roomById[p.room].floor, x: p.x, z: p.z };
  const navNodes = Object.fromEntries(Object.entries(plan).map(([id, n]) => [id, P.at(n.x, n.z, n.floor)]));
  const navEdges = [...def.NAV.edges, ...def.POINTS.filter(p => p.via).map(p => [p.id, p.via])];
  const adjacency = {};
  for (const [a, b] of navEdges) {
    if (!plan[a] || !plan[b]) throw Error(`Building nav: edge ${a}-${b} names an unknown node`);
    (adjacency[a] ||= []).push(b); (adjacency[b] ||= []).push(a);
  }

  // Lifts: stops are nav nodes (the landing in front of the doors); the car sits at the car centre.
  const liftOf = {};
  for (const [id, stops] of Object.entries(def.NAV.lift)) for (const n of stops) liftOf[n] = id;
  const E = def.ELEVATOR, carAt = f => P.at(E.car.x, E.car.z, f);
  const lifts = { [E.id]: { id: E.id, x: carAt(0)[0], stops: E.floors.map(f => carAt(f)[1]), floors: [...E.floors], w: E.car.w, h: E.car.h } };

  // Locations: each room's screen box, its stations (projected points) and its door (the node nearest the entrance).
  const doors = { lounge: 'bdoor', queue: 'd0e', development: 'd1w', hall: 'd1e', plaza: 'p3', roof: 'lift1' };
  const volume = r => {
    const z0 = r.z0 ?? 0, z1 = r.z1 ?? D, top = r.roof ? 160 : g.height;
    return hull([[r.x0, z0, 0], [r.x1, z0, 0], [r.x0, z1, 0], [r.x1, z1, 0], [r.x0, z0, top], [r.x1, z0, top], [r.x0, z1, top], [r.x1, z1, top]].map(([x, z, h]) => P.at(x, z, r.floor, h)));
  };
  const locations = def.ROOMS.map(r => {
    const poly = volume(r), xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    const stations = Object.fromEntries(def.POINTS.filter(p => p.room === r.id).map(p => [p.id, navNodes[p.id]]));
    return { id: r.id, name: r.name, represents: r.represents, floor: r.floor, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, stations, door: navNodes[doors[r.id]], poly, room: r };
  });
  const locationById = Object.fromEntries(locations.map(l => [l.id, l]));
  for (const [alias, target] of Object.entries(def.ALIASES)) locationById[alias] = locationById[target];

  // Which floor a feet point stands on (inverse projection onto each floor plane), and where.
  function planAt(x, y) {
    let best = null;
    for (const f of def.FLOORS) {
      const [px, pz] = P.plan(x, y, f.floor);
      if (pz < -100 || pz > D + 4) continue;
      const score = pz < 0 ? -pz : pz > D ? pz - D : 0;
      if (!best || score < best.score) best = { floor: f.floor, x: px, z: pz, score };
    }
    return best;
  }
  function locationAt(x, y) {
    const p = planAt(x, y);
    if (p) {
      const hit = def.ROOMS.find(r => r.floor === p.floor && p.x >= r.x0 - 2 && p.x <= r.x1 + 2 && p.z >= (r.z0 ?? 0) - 2 && p.z <= (r.z1 ?? D) + 2);
      if (hit) return locationById[hit.id];
    }
    // Not on a floor (a wall-mounted board, a shelf): the room whose volume contains the point.
    return locations.find(l => !l.room.exterior && inPolygon(l.poly, x, y)) ?? null;
  }
  function nearestNode(pt) {
    const p = planAt(pt[0], pt[1]);
    let best = null, bestD = Infinity;
    for (const [id, n] of Object.entries(plan)) {
      if (p && n.floor !== p.floor) continue;
      const d = p ? Math.hypot(n.x - p.x, n.z - p.z) : dist(navNodes[id], pt);
      if (d < bestD) { bestD = d; best = id; }
    }
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
  // Waypoints from a world point to a station: along the walkways (never through furniture or walls).
  // A waypoint reached by riding a lift carries `.lift`; consecutive stops collapse into one ride.
  function route(from, toLocationId, toPoint) {
    const start = nearestNode(from), goal = nearestNode(toPoint);
    const path = shortest(start, goal), out = [];
    path.forEach((n, i) => {
      const ride = i > 0 && liftOf[n] && liftOf[n] === liftOf[path[i - 1]];
      if (ride && i + 1 < path.length && liftOf[path[i + 1]] === liftOf[n]) return;
      if (i === 0 && dist(navNodes[n], from) < 0.5) return; // already there
      const p = [...navNodes[n]];
      if (ride) p.lift = liftOf[n];
      out.push(p);
    });
    if (!out.length || dist(out.at(-1), toPoint) > 0.5) out.push([toPoint[0], toPoint[1]]);
    return out;
  }

  // Interaction-point metadata the character controller reads on arrival (sit or stand, facing, use).
  const stationInfo = {};
  for (const p of def.POINTS) stationInfo[`${p.room}:${p.id}`] = { ...p, floor: roomById[p.room].floor, point: navNodes[p.id] };

  // Queued tasks pin to the lobby task board; finished ones file onto the Engineering bookshelf.
  const board = def.WALL_DECOR.find(d => d.id === 'taskBoard'), shelf = def.FURNITURE.find(f => f.id === 'shelf');
  const [bx, by] = P.at(board.x0 + 8, D, board.floor, board.h1 - 10), [sx, sy] = P.at(shelf.x - shelf.w / 2 + 3, shelf.z - shelf.d / 2, shelf.floor, shelf.h - 10);
  const spot = id => { const f = def.FURNITURE.find(o => o.id === id); return P.at(f.x, f.z - f.d / 2, f.floor, f.h + 10); };

  return {
    id: 'hq', kind: 'iso', P, g, def,
    bounds: { x: -150, y: 90, w: 1180, h: 520 },
    entityScale: 0.5, overflowStep: 16, walkSpeed: 64, characterHeight: 50,
    spawn: 'plaza',
    locations, locationById, navNodes, navEdges, nodePlan: plan, locationAt, planAt, route, lifts, liftOf, stationInfo,
    places: def.PLACES,
    taskSlots: { queue: { x: bx, y: by, cols: 6, step: 12 }, archive: { x: sx, y: sy, cols: 4, step: 6 } },
    systemSpots: { database: spot('rack'), tests: spot('console'), platform: spot('reception'), hq: spot('reception'), deploy: spot('crane'), build: spot('crane') },
    signals: {},
  };
}
