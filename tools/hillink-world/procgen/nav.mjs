// Pass 5A: navigation from generated geometry. The graph is never authored and never stored: it is derived from
// the world's spaces, doors, stairs, paths and roads every time the world changes, so construction that adds a
// room, a floor or a road is walkable the moment it exists (and nothing walks through what is only planned).
//
// Every edge names the one space it runs through (a room, hallway, stair, path or road) and both of its ends lie
// inside that space, so an edge can never cross a wall: the only way between spaces is a door node on their
// shared wall. validateNav() checks exactly that, plus reachability from the world's arrival point.
import { DIMS } from './units.mjs';
import { centre, contains, dist, segmentHitsRect, nearestOnPolyline, onPolyline } from './geom.mjs';

const walkable = s => s.status === 'built' && (s.primitive === 'room' || s.primitive === 'hallway' || s.primitive === 'staircase' || s.primitive === 'courtyard' || s.primitive === 'outdoor-facility');
const open = x => x.status === 'built';

export function buildNav(world) {
  const nodes = new Map(), edges = [];
  const node = (id, p, level, space) => { if (!nodes.has(id)) nodes.set(id, { id, x: p.x, y: p.y, level, space }); return id; };
  const edge = (a, b, space, costScale = 1) => { const A = nodes.get(a), B = nodes.get(b); edges.push({ a, b, space, cost: dist(A, B) * costScale + (A.level !== B.level ? DIMS.storey * 2 : 0) }); };
  const doors = Object.values(world.doors).filter(open);
  const bySpace = new Map();
  for (const d of doors) for (const s of [d.a, d.b]) if (s !== 'outside') bySpace.set(s, [...(bySpace.get(s) ?? []), d]);
  for (const d of doors) node(`door:${d.id}`, d.centre, d.level, null);

  for (const s of Object.values(world.spaces).filter(walkable)) {
    const ds = bySpace.get(s.id) ?? [];
    if (s.primitive === 'hallway') {
      // A spine along the hallway's long axis; each door joins the spine where it projects onto it.
      const c = centre(s.rect), alongX = s.rect.w >= s.rect.h;
      const spine = [...new Set([...ds.map(d => (alongX ? d.centre.x : d.centre.y)), alongX ? c.x : c.y])].sort((a, b) => a - b);
      const ids = spine.map((v, k) => node(`${s.id}#${k}`, alongX ? { x: v, y: c.y } : { x: c.x, y: v }, s.level, s.id));
      for (let k = 1; k < ids.length; k++) edge(ids[k - 1], ids[k], s.id);
      for (const d of ds) { const v = alongX ? d.centre.x : d.centre.y; edge(ids[spine.indexOf(v)], `door:${d.id}`, s.id); }
      // A built stair core inside this hall joins the hall's spine.
      const stair = Object.values(world.spaces).find(x => x.primitive === 'staircase' && x.inside === s.id && x.status === 'built');
      if (stair) { const sc = centre(stair.rect), k = spine.reduce((bi, v, i) => (Math.abs(v - (alongX ? sc.x : sc.y)) < Math.abs(spine[bi] - (alongX ? sc.x : sc.y)) ? i : bi), 0); edge(ids[k], node(`${stair.id}`, sc, s.level, stair.id), s.id); }
    } else if (s.primitive !== 'staircase') {
      const c = node(s.id, centre(s.rect), s.level, s.id);
      for (const d of ds) edge(c, `door:${d.id}`, s.id);
    }
  }
  // Stairs: the same core on consecutive levels of one building.
  for (const b of Object.values(world.buildings)) for (let k = 1; k < b.levels.length; k++) {
    const lo = `${b.id}-L${b.levels[k - 1]}-stair`, hi = `${b.id}-L${b.levels[k]}-stair`;
    if (nodes.has(lo) && nodes.has(hi)) edge(lo, hi, lo);
  }
  // Roads and paths: their points, plus every junction where another road or path starts on them.
  const ways = [...Object.values(world.roads), ...Object.values(world.paths)].filter(open);
  const junctions = new Map(ways.map(w => [w.id, []]));
  for (const w of ways) for (const other of ways) if (other !== w) {
    const n = nearestOnPolyline(w.points, other.points[0]);
    if (n.d < 0.01) junctions.get(w.id).push({ p: n.point, at: n.index });
  }
  const pointIds = new Map();
  for (const w of ways) {
    const seq = [];
    w.points.forEach((p, k) => { seq.push({ p, key: k }); for (const j of junctions.get(w.id).filter(j => j.at === k)) seq.push({ p: j.p, key: k + dist(w.points[k], j.p) / 1e6 }); });
    seq.sort((a, b) => a.key - b.key);
    const ids = seq.map(({ p }) => { const id = `pt:${p.x},${p.y}`; pointIds.set(id, p); return node(id, p, 0, w.id); });
    for (let k = 1; k < ids.length; k++) if (ids[k] !== ids[k - 1]) edge(ids[k - 1], ids[k], w.id, w.primitive === 'road' ? 1 : 1);
  }
  // A path ends on its entrance door: join them.
  for (const p of Object.values(world.paths).filter(open)) {
    const last = p.points[p.points.length - 1], d = world.doors[p.to];
    if (d && open(d) && dist(last, d.centre) < 0.01) edge(`pt:${last.x},${last.y}`, `door:${d.id}`, p.id);
  }
  const arrival = world.arrival ? `pt:${world.arrival.x},${world.arrival.y}` : null;
  return { nodes, edges, arrival, adjacency: adjacencyOf(nodes, edges) };
}

function adjacencyOf(nodes, edges) {
  const adj = new Map([...nodes.keys()].map(k => [k, []]));
  for (const e of edges) { adj.get(e.a).push({ to: e.b, cost: e.cost, space: e.space }); adj.get(e.b).push({ to: e.a, cost: e.cost, space: e.space }); }
  return adj;
}

// Shortest route (Dijkstra). Returns { nodes: [ids], cost } or null.
export function route(nav, from, to) {
  if (!nav.nodes.has(from) || !nav.nodes.has(to)) return null;
  const distTo = new Map([[from, 0]]), prev = new Map(), done = new Set(), queue = [[0, from]];
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    const [d, k] = queue.shift();
    if (done.has(k)) continue; done.add(k);
    if (k === to) break;
    for (const { to: n, cost } of nav.adjacency.get(k)) if (d + cost < (distTo.get(n) ?? Infinity)) { distTo.set(n, d + cost); prev.set(n, k); queue.push([d + cost, n]); }
  }
  if (!distTo.has(to)) return null;
  const path = [];
  for (let k = to; k !== undefined; k = prev.get(k)) path.push(k);
  return { nodes: path.reverse(), cost: distTo.get(to) };
}

// The node to walk to for a space (a room's centre, a hallway's first spine point).
export const nodeFor = (nav, spaceId) => (nav.nodes.has(spaceId) ? spaceId : nav.nodes.has(`${spaceId}#0`) ? `${spaceId}#0` : null);

export function validateNav(world, nav = buildNav(world)) {
  const problems = [];
  const spaceGeom = id => world.spaces[id] ?? world.roads[id] ?? world.paths[id];
  const inside = (g, p) => (g.rect ? contains(g.rect, p, 1e-3) : onPolyline(g.points, p, 1e-3));
  const footprints = Object.values(world.buildings).filter(b => b.status === 'built').map(b => b.footprint);
  for (const e of nav.edges) {
    const A = nav.nodes.get(e.a), B = nav.nodes.get(e.b), g = spaceGeom(e.space);
    if (!g) { problems.push(`edge ${e.a}-${e.b}: unknown space ${e.space}`); continue; }
    if (A.level === B.level && (!inside(g, A) || !inside(g, B))) problems.push(`edge ${e.a}-${e.b} leaves ${e.space}`);
    // Outdoors, nothing walks through a building; the entrance door sits on the wall, so touching it is fine.
    if (!g.rect) for (const fp of footprints) if (segmentHitsRect(A, B, fp)) problems.push(`edge ${e.a}-${e.b} on ${e.space} passes through a building`);
  }
  for (const d of Object.values(world.doors)) if (d.width < DIMS.person.footprint.w + 2 * DIMS.person.clearance || d.height < DIMS.person.height) problems.push(`door ${d.id} is too small for a person`);
  // Everything built and walkable is reachable from where people arrive.
  if (!nav.arrival || !nav.nodes.has(nav.arrival)) problems.push('no arrival point on the road network');
  else {
    const seen = new Set([nav.arrival]), stack = [nav.arrival];
    while (stack.length) for (const { to } of nav.adjacency.get(stack.pop())) if (!seen.has(to)) { seen.add(to); stack.push(to); }
    for (const s of Object.values(world.spaces).filter(walkable)) { const n = nodeFor(nav, s.id); if (!n || !seen.has(n)) problems.push(`${s.id} is not reachable from the arrival point`); }
  }
  return { ok: problems.length === 0, problems };
}
