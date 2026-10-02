// Pass 5B: procedural furnishing. Every generated room is furnished from what it is for (its capability, or its
// role when the capability is unknown), sized by world/scale.mjs, and laid out in the view frame (view.mjs): x
// across the screen, z away from the camera, so 'front' faces the open cut-away side.
//
// Rules, all checked (tests/pass5b.test.mjs):
//   - every piece lies inside its room and no two solid pieces overlap;
//   - nothing solid (and no chair) stands in a door's swing zone;
//   - every interaction anchor (a seat, a place to stand at a desk, console, rack, printer, counter) is reachable
//     from the room's door on a walkable grid that keeps a person's half-width clear of solid furniture;
//   - pieces whose anchors cannot be reached are removed rather than left as traps.
// Output is deterministic: the same room gives the same furniture.
import { SIZES, AGENT, anchor as anchorOf } from '../world/scale.mjs';
import { toMetres, toUnits, DIMS } from './units.mjs';
import { viewOf } from './view.mjs';

export const CELL = 0.1; // walk-grid resolution, metres
const CLEAR = 0.2; // a person's half-width kept clear of solid furniture on the walk grid
const DOOR_ZONE = 1.3; // metres inside a door kept free of furniture
const TUCK = 0.16; // how far a chair may slide under its desk or table (the knee clearance of world/scale.mjs, 0.14 m)
const APPROACH = 0.75; // an anchor counts as reached from a free cell this close (a seat sits inside its sofa)
const shrink = (b, k) => ({ x0: b.x0 + k, x1: b.x1 - k, z0: b.z0 + k, z1: b.z1 - k });
const m = type => { const s = SIZES[type]; return { w: toMetres(s.w ?? 0), d: toMetres(s.d ?? 0), h: toMetres(s.h ?? (s.range ? s.range[0] : 0)) }; };

// The semantic place a room stands for. Known capability kinds keep the old World's location ids, so its
// behaviour (who goes where) and props (which desk lights up) work unchanged on generated rooms.
export const PLACE_OF_KIND = { engineering: 'development', review: 'testing', 'meeting-space': 'comms', 'break-space': 'lounge', command: 'command', 'compute-infrastructure': 'servers', reception: 'queue', archive: 'archive', storage: 'storage' };
// A capability shapes a room only once it is usable (built or operational). While it is planned or being built it may
// shape only a room that is itself still under construction (the site shows its own furniture arriving); a room that
// already exists keeps its previous purpose, furniture and place in the World until the new capability is ready.
export const usableCapability = c => Boolean(c) && (c.status === 'built' || c.status === 'operational');
export function purposeOf(world, space) {
  const caps = space.capabilities.map(id => world.capabilities[id]).filter(Boolean);
  return caps.find(usableCapability) ?? (space.status === 'built' ? null : caps[0] ?? null);
}
export function placeKind(world, space) {
  if (space.primitive === 'hallway') return space.id.endsWith('-hall') && space.level === 0 ? 'lobby' : 'passage';
  const cap = purposeOf(world, space);
  if (cap) return PLACE_OF_KIND[cap.spec.kind] ?? byTraits(cap.spec);
  return space.vacant ? 'spare' : 'spare';
}
// Pass 5H (P2): a room shared by several usable capabilities is furnished for each of them, the centre-piece recipes
// first (a meeting table takes the middle before the lounge's small table can), then the rest in capability order.
const CENTRE_FIRST = ['comms', 'comms-like'];
export function placeKinds(world, space) {
  const first = placeKind(world, space);
  if (space.primitive !== 'room') return [first];
  const kinds = [...new Set([first, ...space.capabilities.map(id => world.capabilities[id]).filter(usableCapability).map(c => PLACE_OF_KIND[c.spec.kind] ?? byTraits(c.spec))])];
  return [...kinds.filter(k => CENTRE_FIRST.includes(k)), ...kinds.filter(k => !CENTRE_FIRST.includes(k))];
}
const byTraits = spec => (spec.traits.some(t => ['machines', 'making', 'inspection', 'flight'].includes(t)) ? 'workshop' : spec.traits.includes('gathering') ? 'comms-like' : spec.access === 'secure' ? 'servers-like' : spec.traits.includes('rest') ? 'lounge-like' : 'office');

function doorsOf(world, view, space) {
  return Object.values(world.doors).filter(d => d.a === space.id || d.b === space.id).map(d => {
    const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2);
    return { id: d.id, kind: d.kind, a, b, c: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, horizontal: Math.abs(a.z - b.z) < 1e-6 };
  });
}

// The furnishing of one space. Returns { items, decor, anchors, grid }.
export function furnishSpace(world, space, view = viewOf(world)) {
  const R = view.rectToView(space.rect), kind = placeKind(world, space), doors = doorsOf(world, view, space);
  const items = [], decor = [], anchors = [], keepouts = [];
  // Spaces standing inside this one (the stair flight and lift shaft in a hall) are obstacles, whether built or reserved.
  const obstacles = Object.values(world.spaces).filter(o => o.inside === space.id).map(o => ({ id: o.id, primitive: o.primitive, ...view.rectToView(o.rect) }));
  keepouts.push(...obstacles);
  // Door swing zones, and for hallways the whole walking line between their openings stays clear too.
  for (const d of doors) {
    const half = Math.max(Math.abs(d.a.x - d.b.x), Math.abs(d.a.z - d.b.z)) / 2 + 0.3;
    keepouts.push(d.horizontal
      ? { x0: d.c.x - half, x1: d.c.x + half, z0: Math.abs(d.c.z - R.z0) < 0.01 ? R.z0 : R.z1 - DOOR_ZONE, z1: Math.abs(d.c.z - R.z0) < 0.01 ? R.z0 + DOOR_ZONE : R.z1 }
      : { z0: d.c.z - half, z1: d.c.z + half, x0: Math.abs(d.c.x - R.x0) < 0.01 ? R.x0 : R.x1 - DOOR_ZONE, x1: Math.abs(d.c.x - R.x0) < 0.01 ? R.x0 + DOOR_ZONE : R.x1 });
  }
  const overlaps = (a, b) => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
  const box = it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 });
  const inside = b => b.x0 >= R.x0 + 0.04 && b.x1 <= R.x1 - 0.04 && b.z0 >= R.z0 + 0.04 && b.z1 <= R.z1 - 0.04;
  let n = 0;
  const id = type => `${space.id}:${type}${++n}`;
  const fits = (it, { ignoreKeepouts = false } = {}) => {
    const b = box(it);
    if (!inside(b)) return false;
    if (!ignoreKeepouts && keepouts.some(k => overlaps(k, b))) return false;
    // Chairs tuck under their desk or table (up to TUCK), as authored chairs do; nothing else may overlap.
    const chairish = t => t === 'chair' || t === 'officeChair';
    return !items.some(o => {
      if (o.on || it.on) return false;
      if (chairish(o.type) && chairish(it.type)) return overlaps(box(o), b);
      if (chairish(o.type) || chairish(it.type)) { const solid = chairish(o.type) ? b : box(o), chair = chairish(o.type) ? box(o) : b; return overlaps(shrink(solid, TUCK), chair); }
      return (o.solid || it.solid) && overlaps(box(o), b);
    });
  };
  const put = (type, x, z, extra = {}) => ({ id: id(type), type, spaceId: space.id, level: space.level, x: r3(x), z: r3(z), ...m(type), ...extra, ...(extra.w ? { w: extra.w } : {}) });
  const add = it => { items.push(it); return it; };
  // Anchors are computed by world/scale.mjs anchor() on the piece in render units, then brought back to metres, so a
  // generated seat is exactly where an authored one would be.
  const anchorFor = (it, kindOf, use, opts = {}) => {
    const u = anchorOf({ ...it, x: toUnits(it.x), z: toUnits(it.z), w: toUnits(it.w), d: toUnits(it.d) }, kindOf, { ...opts, offset: toUnits(opts.offset ?? 0) });
    const a = { id: `${it.id}${opts.index != null ? `#${opts.index}` : ''}${opts.offset ? `@${opts.offset}` : ''}`, spaceId: space.id, level: space.level, x: r3(toMetres(u.x)), z: r3(toMetres(u.z)), pose: u.pose, facing: u.facing, use, of: it.id };
    anchors.push(a); return a;
  };
  // Try positions along the back wall (then the side walls) from left to right until one fits.
  const alongBack = (type, { gap = 0.06, extra = {}, from = 'left', step = 0.25 } = {}) => {
    const s = { ...m(type), ...extra }, z = R.z1 - s.d / 2 - gap;
    const xs = []; for (let x = R.x0 + s.w / 2 + 0.1; x <= R.x1 - s.w / 2 - 0.1 + 1e-9; x += step) xs.push(x);
    if (from === 'right') xs.reverse();
    for (const x of xs) { const it = put(type, x, z, { facing: 'front', solid: true, ...extra }); if (fits(it)) return add(it); }
    return null;
  };
  const alongSide = (type, side, { extra = {} } = {}) => {
    const s = { ...m(type), ...extra }, x = side === 'left' ? R.x0 + s.w / 2 + 0.06 : R.x1 - s.w / 2 - 0.06;
    for (let z = R.z1 - s.d / 2 - 0.1; z >= R.z0 + s.d / 2 + 0.1; z -= 0.25) { const it = put(type, x, z, { facing: side === 'left' ? 'right' : 'left', solid: true, ...extra }); if (fits(it)) return add(it); }
    return null;
  };
  const deskUnit = (use = 'work') => {
    const desk = alongBack('desk', { step: 0.25 });
    if (!desk) return null;
    const chair = put('officeChair', desk.x, desk.z - desk.d / 2 - m('officeChair').d / 2 + toMetres(AGENT.clearance), { facing: 'back' });
    if (!fits(chair)) { items.splice(items.indexOf(desk), 1); return null; }
    add(chair); desk.station = anchorFor(chair, 'seat', use).id; desk.chair = chair.id;
    return desk;
  };
  const standAt = (it, use, offsets = [0]) => offsets.map(o => anchorFor(it, 'stand', use, { offset: o }));
  const wall = (type, width, h0, h1, extra = {}) => {
    // Wall-mounted pieces on the back wall, clear of doors in that wall.
    for (let x = R.x0 + 0.3; x + width <= R.x1 - 0.3; x += 0.25) {
      const b = { x0: x, x1: x + width, z0: R.z1 - 0.3, z1: R.z1 };
      if (doors.some(d => d.horizontal && Math.abs(d.c.z - R.z1) < 0.01 && Math.abs(d.c.x - (x + width / 2)) < width / 2 + 0.8)) continue;
      if (decor.some(o => o.x0 < b.x1 + 0.2 && b.x0 < o.x1 + 0.2)) continue;
      decor.push({ id: id(type), type, spaceId: space.id, level: space.level, x0: r3(x), x1: r3(x + width), h0, h1, ...extra }); return true;
    }
    return false;
  };
  const tableSet = (chairs = 4, use = 'table') => {
    const t = m('roundTable'), c = m('chair'), cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    const table = put('roundTable', cx, cz, { solid: true });
    if (!fits(table)) return null;
    add(table);
    const tuck = toMetres(2);
    const around = [[-t.w / 2 - c.w / 2 + tuck, 0, 'right'], [t.w / 2 + c.w / 2 - tuck, 0, 'left'], [0, t.d / 2 + c.w / 2 - tuck, 'front'], [0, -t.d / 2 - c.w / 2 + tuck, 'back']];
    for (const [dx, dz, facing] of around.slice(0, chairs)) { const ch = put('chair', cx + dx, cz + dz, { facing }); if (fits(ch)) { add(ch); anchorFor(ch, 'seat', use); } }
    return table;
  };

  const recipe = {
    development() { for (let k = 0; k < 4 && deskUnit('work'); k++); const shelf = alongSide('bookshelf', 'right') ?? alongSide('bookshelf', 'left'); if (shelf) standAt(shelf, 'read'); const pr = alongSide('printer', 'left') ?? alongSide('printer', 'right'); if (pr) standAt(pr, 'print'); wall('codeWall', 1.8, 30, 70); alongSide('plant', 'left', { extra: { h: toMetres(44) } }); },
    workshop() { recipe.development(); },
    office() { for (let k = 0; k < 3 && deskUnit('work'); k++); const pr = alongSide('printer', 'right'); if (pr) standAt(pr, 'print'); wall('whiteboard', 1.4, 28, 64); },
    testing() { const con = alongBack('reviewConsole'); if (con) standAt(con, 'inspect', [-0.4, 0.4]); const rig = alongSide('serverRack', 'right') ?? alongSide('serverRack', 'left'); if (rig) { rig.system = 'tests'; standAt(rig, 'inspect'); } deskUnit('work'); },
    comms() { tableSet(4, 'meeting') ?? tableSet(2, 'meeting'); wall('whiteboard', 1.4, 28, 64); wall('statusScreen', 0.9, 40, 66); },
    'comms-like'() { recipe.comms(); },
    lounge() {
      const couch = alongBack('couch'); if (couch) for (const i of [0, 1]) anchorFor(couch, 'seat', 'relax', { index: i });
      const counter = alongBack('counter', { from: 'right', extra: { w: Math.min(toMetres(SIZES.counter.w), 1.6) } });
      if (counter) { const cm = put('coffeeMachine', counter.x - counter.w / 4, counter.z, { on: counter.id, solid: false }); add(cm); standAt(counter, 'coffee', [-counter.w / 4]); standAt(counter, 'snack', [counter.w / 4]); }
      tableSet(2, 'table');
      const vend = alongSide('vending', 'left'); if (vend) standAt(vend, 'snack');
      const arm = alongSide('armchair', 'right'); if (arm) anchorFor(arm, 'seat', 'relax');
      wall('window', 1.3, 26, 70); wall('clock', 0.35, 54, 68);
    },
    'lounge-like'() { recipe.lounge(); },
    command() { for (let k = 0; k < 2 && deskUnit('work'); k++); wall('statusScreen', 1.0, 40, 66); wall('taskBoard', 1.6, 22, 70); },
    servers() { for (let k = 0; k < 4; k++) { const r = alongBack('serverRack', { step: 0.1 }); if (!r) break; r.system = 'database'; standAt(r, 'inspect'); } deskUnit('work'); },
    'servers-like'() { recipe.servers(); },
    lobby() {
      const bench = alongBack('bench', { extra: { w: 1.9 } }); if (bench) for (const i of [0, 1]) anchorFor(bench, 'seat', 'wait', { index: i });
      const rec = alongBack('reception', { from: 'right', extra: { w: 1.6 } }); if (rec) { rec.system = 'platform'; standAt(rec, 'wait', [-0.35, 0.35]); }
      alongBack('plant', { from: 'right', extra: { h: toMetres(46) } });
      wall('taskBoard', 1.7, 22, 70); wall('statusScreen', 0.9, 40, 66);
    },
    passage() { alongBack('waterCooler', { from: 'right' }); },
    archive() { for (let k = 0; k < 3; k++) { const s = alongBack('bookshelf', { step: 0.1 }); if (!s) break; standAt(s, 'read'); } },
    storage() { recipe.archive(); },
    spare() { for (let k = 0; k < 2; k++) if (!alongBack('bookshelf', { step: 0.1 })) break; },
  };
  if (space.primitive === 'room' || space.primitive === 'hallway' || space.primitive === 'outdoor-facility') for (const k of placeKinds(world, space)) (recipe[k] ?? recipe.office)();
  // Reachability: drop anything whose anchors cannot be reached from a door, until everything left can be.
  let grid = walkGrid(R, items, doors, obstacles);
  for (let guard = 0; guard < 12; guard++) {
    const lost = anchors.filter(a => !reachable(grid, a));
    if (!lost.length) break;
    const drop = new Set(lost.map(a => a.of));
    for (const it of items) if (drop.has(it.id)) { if (it.chair) drop.add(it.chair); for (const o of items) if (o.on === it.id) drop.add(o.id); }
    for (const d of [...drop]) { const desk = items.find(o => o.chair === d); if (desk) drop.add(desk.id); }
    for (let i = items.length - 1; i >= 0; i--) if (drop.has(items[i].id)) items.splice(i, 1);
    for (let i = anchors.length - 1; i >= 0; i--) if (drop.has(anchors[i].of)) anchors.splice(i, 1);
    grid = walkGrid(R, items, doors, obstacles);
  }
  return { kind, rect: R, items, decor, anchors, doors, keepouts, obstacles, grid };
}

// A walk grid over the room: a cell is free when a person standing there keeps CLEAR from every solid piece.
export function walkGrid(R, items, doors, obstacles = []) {
  const nx = Math.max(1, Math.round((R.x1 - R.x0) / CELL)), nz = Math.max(1, Math.round((R.z1 - R.z0) / CELL));
  const free = new Uint8Array(nx * nz).fill(1);
  const solids = [...items.filter(it => it.solid && !it.on).map(it => ({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 })), ...obstacles]
    .map(b => ({ x0: b.x0 - CLEAR, x1: b.x1 + CLEAR, z0: b.z0 - CLEAR, z1: b.z1 + CLEAR }));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = R.x0 + (i + 0.5) * CELL, z = R.z0 + (j + 0.5) * CELL;
    // Walls: keep a person's half-width off them too.
    if (x < R.x0 + CLEAR * 0.75 || x > R.x1 - CLEAR * 0.75 || z < R.z0 + CLEAR * 0.75 || z > R.z1 - CLEAR * 0.75) { free[j * nx + i] = 0; continue; }
    if (solids.some(s => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1)) free[j * nx + i] = 0;
  }
  const cellOf = p => [Math.min(nx - 1, Math.max(0, Math.floor((p.x - R.x0) / CELL))), Math.min(nz - 1, Math.max(0, Math.floor((p.z - R.z0) / CELL)))];
  // Where people come in: the free cells just inside each door.
  const starts = [], startDoor = new Map();
  for (const d of doors) {
    const inward = d.horizontal ? { x: 0, z: Math.abs(d.c.z - R.z0) < 0.01 ? 1 : -1 } : { x: Math.abs(d.c.x - R.x0) < 0.01 ? 1 : -1, z: 0 };
    for (let k = 1; k <= 6; k++) { const [i, j] = cellOf({ x: d.c.x + inward.x * (CLEAR + k * CELL), z: d.c.z + inward.z * (CLEAR + k * CELL) }); if (free[j * nx + i]) { starts.push(j * nx + i); startDoor.set(j * nx + i, d.id); break; } }
  }
  const seen = new Int32Array(nx * nz).fill(-1), queue = [...starts];
  for (const s of starts) seen[s] = s;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const nk = b * nx + a; if (!free[nk] || seen[nk] !== -1) continue;
      seen[nk] = k; queue.push(nk);
    }
  }
  // The solid pieces themselves (not inflated): the last step from a cell to an anchor may not pass through one.
  const bodies = items.filter(it => it.solid && !it.on).map(it => ({ id: it.id, x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 }));
  return { R, nx, nz, free, seen, starts, startDoor, bodies, cellOf, centreOf: k => ({ x: r3(R.x0 + ((k % nx) + 0.5) * CELL), z: r3(R.z0 + (Math.floor(k / nx) + 0.5) * CELL) }) };
}

// An anchor is reachable when a reachable free cell lies within a step of it (a seat is inside its chair).
export function approachCell(grid, a) {
  const [ci, cj] = grid.cellOf(a), reach = Math.ceil(APPROACH / CELL);
  let best = -1, bestD = Infinity;
  for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
    const k = j * grid.nx + i; if (grid.seen[k] === -1) continue;
    const c = grid.centreOf(k), d = Math.hypot(c.x - a.x, c.z - a.z);
    if (d < bestD && !(grid.bodies ?? []).some(b => b.id !== a.of && stepHits(c, a, b))) { bestD = d; best = k; }
  }
  return bestD <= APPROACH + 1e-9 ? best : -1;
}
// Does the straight step from c to a pass through box b (shrunk by 2 cm, as the route checks allow)?
function stepHits(c, a, b) {
  const x0 = b.x0 + 0.02, x1 = b.x1 - 0.02, z0 = b.z0 + 0.02, z1 = b.z1 - 0.02;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[c.x, a.x - c.x, x0, x1], [c.z, a.z - c.z, z0, z1]]) {
    if (Math.abs(d) < 1e-12) { if (p <= lo || p >= hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return false;
  }
  return true;
}
export const reachable = (grid, a) => approachCell(grid, a) !== -1;

// The walk from a door into the room to an anchor: grid cells back to the door, simplified to its turns.
export function walkTo(grid, a) {
  const k = approachCell(grid, a); if (k === -1) return null;
  const cells = [];
  for (let c = k; ; c = grid.seen[c]) { cells.push(grid.centreOf(c)); if (grid.seen[c] === c) break; }
  cells.reverse();
  const out = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) { const p = out[out.length - 1], q = cells[i], r = cells[i + 1]; if (Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)) > 1e-9) out.push(q); }
  if (cells.length > 1) out.push(cells[cells.length - 1]);
  return out;
}

// The walk between two free cells of a grid (breadth first), simplified to its turns; null if they are not connected.
export function gridWalk(grid, fromCell, toCell) {
  const prev = new Int32Array(grid.nx * grid.nz).fill(-1), queue = [fromCell];
  prev[fromCell] = fromCell;
  for (let q = 0; q < queue.length && prev[toCell] === -1; q++) {
    const k = queue[q], i = k % grid.nx, j = Math.floor(k / grid.nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= grid.nx || b >= grid.nz) continue;
      const nk = b * grid.nx + a; if (!grid.free[nk] || prev[nk] !== -1) continue;
      prev[nk] = k; queue.push(nk);
    }
  }
  if (prev[toCell] === -1) return null;
  const cells = [];
  for (let c = toCell; ; c = prev[c]) { cells.push(grid.centreOf(c)); if (c === fromCell) break; }
  cells.reverse();
  const out = [cells[0]];
  for (let i = 1; i < cells.length - 1; i++) { const p = out[out.length - 1], q = cells[i], r = cells[i + 1]; if (Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)) > 1e-9) out.push(q); }
  if (cells.length > 1) out.push(cells[cells.length - 1]);
  return out;
}

const r3 = v => Math.round(v * 1000) / 1000;
export const furnishingDims = { CELL, CLEAR, DOOR_ZONE, person: DIMS.person };
