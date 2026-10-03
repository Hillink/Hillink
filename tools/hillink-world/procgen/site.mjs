// Pass 5A: land. The settlement starts where the terrain is flat and dry near the middle of the map. A district is a
// block of land reserved for growth; it is cut into parcels by seeded binary splits (every parcel between
// DIMS.parcel.min and .max on a side). Parcels stay vacant until the planner needs one. Roads are routed across the
// terrain by cost (slope, water, never through a building); a path joins the road to each entrance.
import { DIMS, snap } from './units.mjs';
import { rng } from './rng.mjs';
import { rect, r3, centre, contains, overlaps, inset, dist, nearestOnPolyline } from './geom.mjs';
import { cellOf, centreOf, buildable, buildableShare, isWater, slope, gridPath, simplify } from './terrain.mjs';
import { nextId } from './building.mjs';

export const DISTRICT_SIZE = 144;

export function chooseOrigin(t, seed) {
  const r = rng(seed, 'origin'), half = 24, mid = t.size / 2, reach = t.size * 0.3;
  let best = null;
  for (let y = mid - reach; y <= mid + reach; y += 16) for (let x = mid - reach; x <= mid + reach; x += 16) {
    const share = buildableShare(t, rect(x - half, y - half, 2 * half, 2 * half));
    const score = share - (Math.hypot(x - mid, y - mid) / t.size) * 0.6 + r.float(0, 0.08);
    if (share >= 0.8 && (!best || score > best.score)) best = { x: snap(x), y: snap(y), score };
  }
  return best ?? { x: mid, y: mid, score: 0 };
}

// A district centred on a point, clipped to the map, split into parcels. With `reserve` (a side in metres), the
// district first carves one parcel that large in its corner nearest `toward` (the settlement), so a capability
// bigger than any ordinary parcel always has land, then splits the rest as usual.
export function addDistrict(world, t, at, { seed, key, reserve = 0, toward = null }) {
  const S = DISTRICT_SIZE, x = Math.max(0, Math.min(t.size - S, snap(at.x - S / 2))), y = Math.max(0, Math.min(t.size - S, snap(at.y - S / 2)));
  const id = nextId(world, 'district');
  const d = { id, primitive: 'district', rect: rect(x, y, S, S), parcels: [] };
  world.districts[id] = d;
  const r = rng(seed, 'parcels', key);
  const split = box => {
    const long = box.w >= box.h ? 'w' : 'h', L = box[long];
    if (L <= DIMS.parcel.max) return [box];
    const cut = snap(r.float(DIMS.parcel.min, L - DIMS.parcel.min));
    return long === 'w' ? [...split(rect(box.x, box.y, cut, box.h)), ...split(rect(box.x + cut, box.y, box.w - cut, box.h))]
      : [...split(rect(box.x, box.y, box.w, cut)), ...split(rect(box.x, box.y + cut, box.w, box.h - cut))];
  };
  let boxes = [d.rect];
  const side = reserve ? Math.max(DIMS.parcel.min, Math.ceil(reserve)) : 0;
  if (side && side <= S - DIMS.parcel.min) {
    const c = toward ?? centre(d.rect), left = c.x < x + S / 2, top = c.y < y + S / 2;
    const px = left ? x : x + S - side, py = top ? y : y + S - side;
    const big = rect(px, py, side, side);
    // The rest of the square: the strip beside the reserved parcel, and the full-width band beyond it.
    const beside = rect(left ? x + side : x, py, S - side, side), beyond = rect(x, top ? y + side : y, S, S - side);
    boxes = [big, ...split(beside), ...split(beyond)];
  } else boxes = split(d.rect);
  for (const pr of boxes) {
    const pid = nextId(world, 'parcel');
    world.parcels[pid] = { id: pid, primitive: 'parcel', districtId: id, rect: pr, buildable: r3(buildableShare(t, pr)), status: 'vacant', uses: [] };
    d.parcels.push(pid);
  }
  return d;
}

// Cost of a road entering a cell: flat and dry is cheap, slopes cost more, water is a bridge (expensive but
// possible), and buildings or other developed parcels are closed.
export function roadCost(world, t, allowParcel = null) {
  const closed = [...Object.values(world.buildings).map(b => inset(b.footprint, -1)), ...Object.values(world.parcels).filter(p => p.status !== 'vacant' && p.id !== allowParcel).map(p => inset(p.rect, 1))];
  return (i, j) => {
    const c = centreOf(t, i, j);
    if (closed.some(rc => contains(rc, c, 0))) return Infinity;
    return 1 + slope(t, i, j) * 40 + (isWater(t, i, j) ? 25 : 0);
  };
}

// The first road: from the nearest map edge to the parcel. Returns { road, front, end } where `front` is the
// parcel side the road arrives at and `end` the point on that side.
export function accessRoad(world, t, parcel, seed) {
  const r = rng(seed, 'access-road'), c = centre(parcel.rect), S = t.size;
  const edges = [{ side: 'n', d: c.y, p: { x: c.x, y: 1 } }, { side: 's', d: S - c.y, p: { x: c.x, y: S - 1 } }, { side: 'w', d: c.x, p: { x: 1, y: c.y } }, { side: 'e', d: S - c.x, p: { x: S - 1, y: c.y } }]
    .sort((a, b) => a.d - b.d || (a.side < b.side ? -1 : 1));
  const e = edges[0], off = r.float(-S * 0.15, S * 0.15);
  let start = e.side === 'n' || e.side === 's' ? { x: Math.max(8, Math.min(S - 8, e.p.x + off)), y: e.p.y } : { x: e.p.x, y: Math.max(8, Math.min(S - 8, e.p.y + off)) };
  const [si, sj] = cellOf(t, start.x, start.y); start = centreOf(t, si, sj);
  return routeTo(world, t, start, parcel, { kind: 'access' });
}

// A road from `start` (on the map edge or on an existing road) to the edge of `parcel`.
export function routeTo(world, t, start, parcel, { kind = 'spur', from = null } = {}) {
  const cells = gridPath(t, start, centre(parcel.rect), roadCost(world, t, parcel.id));
  if (!cells) return null;
  // Stop at the first cell inside the parcel; the road ends on the parcel's edge.
  const k = cells.findIndex(p => contains(parcel.rect, p, 0));
  const outside = cells.slice(0, Math.max(1, k));
  const last = outside[outside.length - 1], P = parcel.rect;
  const sides = [{ side: 'n', d: Math.abs(last.y - P.y) }, { side: 's', d: Math.abs(last.y - (P.y + P.h)) }, { side: 'w', d: Math.abs(last.x - P.x) }, { side: 'e', d: Math.abs(last.x - (P.x + P.w)) }];
  const front = sides.sort((a, b) => a.d - b.d)[0].side;
  const clampX = v => Math.max(P.x + DIMS.setback, Math.min(P.x + P.w - DIMS.setback, v)), clampY = v => Math.max(P.y + DIMS.setback, Math.min(P.y + P.h - DIMS.setback, v));
  const end = front === 'n' ? { x: snap(clampX(last.x)), y: P.y } : front === 's' ? { x: snap(clampX(last.x)), y: P.y + P.h } : front === 'w' ? { x: P.x, y: snap(clampY(last.y)) } : { x: P.x + P.w, y: snap(clampY(last.y)) };
  const points = simplify([start, ...outside.slice(1), ...(front === 'n' || front === 's' ? [{ x: end.x, y: last.y }] : [{ x: last.x, y: end.y }]), end]).map(p => ({ x: r3(p.x), y: r3(p.y) }));
  const id = nextId(world, 'road');
  world.roads[id] = { id, primitive: 'road', kind, from, points, width: DIMS.road.width, status: 'built', to: parcel.id };
  return { road: world.roads[id], front, end };
}

// Nearest point on the existing road network to a parcel.
export function nearestRoadPoint(world, target) {
  let best = null;
  for (const road of Object.values(world.roads)) {
    const n = nearestOnPolyline(road.points, target);
    if (!best || n.d < best.d) best = { ...n, roadId: road.id };
  }
  return best;
}

// A path from the road's end, along the parcel front, to the entrance door.
export function entrancePath(world, { roadEnd, door, front, buildingId, status = 'built' }) {
  const c = door.centre, alongX = front === 'n' || front === 's';
  const corner = alongX ? { x: c.x, y: roadEnd.y } : { x: roadEnd.x, y: c.y };
  const points = [roadEnd, corner, c].filter((p, k, all) => k === 0 || dist(p, all[k - 1]) > 1e-6).map(p => ({ x: r3(p.x), y: r3(p.y) }));
  const id = nextId(world, 'path');
  world.paths[id] = { id, primitive: 'path', points, width: DIMS.path.width, to: door.id, buildingId, status };
  return world.paths[id];
}

// Scenery anchors across the undeveloped land: points where a renderer may put a tree, rock or shrub. They are
// not objects: a theme decides what grows there. Kept clear of water, roads, paths and developed parcels.
export function scatterEnvironment(world, t, seed, { spacing = 11, attempts = 2600 } = {}) {
  const r = rng(seed, 'environment'), placed = [], grid = new Map(), cellSize = spacing;
  const key = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  const near = p => { const [cx, cy] = key(p.x, p.y).split(',').map(Number); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) if (dist(p, q) < spacing) return true; return false; };
  const blocked = p => Object.values(world.parcels).some(pc => pc.status !== 'vacant' && contains(pc.rect, p)) || [...Object.values(world.roads), ...Object.values(world.paths)].some(w => nearestOnPolyline(w.points, p).d < w.width / 2 + 2);
  for (let k = 0; k < attempts; k++) {
    const p = { x: r3(r.float(2, t.size - 2)), y: r3(r.float(2, t.size - 2)) }, [i, j] = cellOf(t, p.x, p.y);
    if (isWater(t, i, j) || near(p) || blocked(p)) continue;
    const s = slope(t, i, j), h = t.heights[j * t.n + i];
    const kind = s > t.maxSlope * 1.4 ? 'rock' : h < t.waterLevel + t.relief * 0.18 ? 'tree-wet' : r.chance(0.7) ? 'tree' : 'shrub';
    placed.push({ ...p, kind });
    const g = key(p.x, p.y); grid.set(g, [...(grid.get(g) ?? []), p]);
  }
  world.environment = placed.map((p, k) => ({ id: `env-${k + 1}`, primitive: 'environment-anchor', kind: p.kind, x: p.x, y: p.y }));
}
// After new development, anchors inside developed land or on roads are cleared (the rest keep their ids).
export function clearEnvironment(world) {
  const blocked = p => Object.values(world.parcels).some(pc => pc.status !== 'vacant' && contains(pc.rect, p)) || [...Object.values(world.roads), ...Object.values(world.paths)].some(w => nearestOnPolyline(w.points, p).d < w.width / 2 + 2);
  world.environment = world.environment.filter(e => !blocked(e));
}

export const parcelFree = (world, parcel) => parcel.status === 'vacant' && !Object.values(world.buildings).some(b => overlaps(b.footprint, parcel.rect));
export { buildable };
