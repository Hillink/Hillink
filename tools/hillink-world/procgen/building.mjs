// Pass 5A: buildings from a program. A building is designed in its own frame (u along the facade, v depth from the
// facade) and then placed on a parcel facing its road. Every level has the same bones:
//
//   v=0   ┌──────────── entry hall (hallway) ──── [stair core, reserved until a second level exists] ┐
//         │ left band rooms │ corridor (spine) │ right band rooms │
//   v=D   └─────────────────┴──────────────────┴──────────────────┘   <- the back is open for a rear wing
//
// Rooms are sized from their capability's area (never below DIMS.room.minSide), ordered public -> staff -> secure
// from the entrance, and put across the corridor from the capability they want to be near. Seeded choices: band
// widths, the order of equals, the stair side and ties between bands. Leftover band length becomes a vacant
// service room the planner can later occupy or subdivide.
import { DIMS, snap, snapUp } from './units.mjs';
import { rect, r3, centre } from './geom.mjs';
import { accessRank } from './capabilities.mjs';
import { rng as rngOf } from './rng.mjs';

export const roomLength = (areaM2, width) => snapUp(Math.max(areaM2 / width, DIMS.room.minSide));
const ROLE = { public: 'public-area', staff: 'workstation-area', secure: 'secure-area' };
export const roleFor = spec => (spec ? ROLE[spec.access] : 'service-area');

// Local frame <-> world plan, for a footprint whose `front` side faces the road (n = low y, s = high y, w, e).
export function frame(fp, front) {
  const alongX = front === 'n' || front === 's';
  const W = alongX ? fp.w : fp.h, D = alongX ? fp.h : fp.w;
  const pt = (u, v) => {
    if (front === 'n') return { x: r3(fp.x + u), y: r3(fp.y + v) };
    if (front === 's') return { x: r3(fp.x + fp.w - u), y: r3(fp.y + fp.h - v) };
    if (front === 'w') return { x: r3(fp.x + v), y: r3(fp.y + fp.h - u) };
    return { x: r3(fp.x + fp.w - v), y: r3(fp.y + u) };
  };
  const toWorld = (u, v, w, d) => { const a = pt(u, v), b = pt(u + w, v + d); return rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); };
  return { fp, front, W, D, pt, toWorld };
}
// The footprint of a W x D design whose facade lies on `front` of the parcel, set back and slid along the facade.
export function footprintFor(parcel, front, W, D, offset = 0.5) {
  const s = DIMS.setback, alongX = front === 'n' || front === 's';
  const span = (alongX ? parcel.w : parcel.h) - 2 * s - W, deep = (alongX ? parcel.h : parcel.w) - 2 * s - D;
  if (span < 0 || deep < 0) return null;
  const slide = snap(s + span * offset);
  if (front === 'n') return rect(parcel.x + slide, parcel.y + s, W, D);
  if (front === 's') return rect(parcel.x + parcel.w - slide - W, parcel.y + parcel.h - s - D, W, D);
  if (front === 'w') return rect(parcel.x + s, parcel.y + parcel.h - slide - W, D, W);
  return rect(parcel.x + parcel.w - s - D, parcel.y + slide, D, W);
}

// Public first, then staff, then secure; seeded order among equals.
function orderProgram(specs, r) {
  return [0, 1, 2].flatMap(k => r.shuffle(specs.filter(s => accessRank(s.access) === k).sort((a, b) => (a.id < b.id ? -1 : 1))));
}

// Lays one level's rooms into the two bands. With `depth` fixed (upper levels, wings) rooms must fit it.
export function layoutBands({ program, bl, br, start, depth = null, r }) {
  const bands = { L: { width: bl, len: 0, slots: [] }, R: { width: br, len: 0, slots: [] } };
  for (const spec of orderProgram(program, r)) {
    const partner = ['L', 'R'].find(side => bands[side].slots.some(s => spec.adjacent.includes(s.spec.kind) || s.spec.adjacent.includes(spec.kind)));
    const cost = side => bands[side].len + roomLength(spec.area, bands[side].width) + (partner === side ? 3 : 0);
    const cl = cost('L'), cr = cost('R');
    const side = cl < cr ? 'L' : cr < cl ? 'R' : r.chance(0.5) ? 'L' : 'R';
    const len = roomLength(spec.area, bands[side].width);
    bands[side].slots.push({ spec, v: start + bands[side].len, len });
    bands[side].len += len;
  }
  const used = Math.max(bands.L.len, bands.R.len);
  const total = depth ?? used;
  if (used > total + 1e-9) return null;
  for (const side of ['L', 'R']) {
    const b = bands[side], slack = total - b.len;
    if (slack < 1e-9) continue;
    if (slack >= DIMS.room.minSide || !b.slots.length) b.slots.push({ spec: null, v: start + b.len, len: slack });
    else b.slots[b.slots.length - 1].len += slack; // too thin to be a room: the last room takes it
    b.len = total;
  }
  return { bands, depth: total };
}

// The vertical core at one end of the entry hall: a stair flight and, beside it, an elevator shaft.
export const CORE_W = r3(DIMS.stairCore.w + DIMS.liftShaft.w);

// A whole design for a program. Returns the local plan the placer turns into world spaces and doors.
// `levels` (optional) splits the program over storeys: [[specs for level 0], [specs for level 1], ...]. Every level
// shares the same footprint, band widths and core, so the building reads as one block.
export function designBuilding(program, r, { levels = null } = {}) {
  const cw = DIMS.corridor, hallD = DIMS.stairCore.d, programs = levels ?? [program], all = programs.flat();
  // Each level lays out from its own sub-stream, so the sizing pass and the final pass make the same choices.
  const key = r.next(), sub = k => rngOf('level-layout', key, k);
  // Office-sized bands by default; a large space (a hall, a workshop floor) widens its band so it stays a sensible shape.
  const wide = Math.min(12, snap(Math.sqrt(Math.max(...all.map(s => s.area), 0) / 1.6)));
  let bl = Math.max(snap(r.float(3.5, 6)), wide), br = snap(r.float(3.5, 6));
  // The core stands at the end of the hall on the wider band's side; that band is at least as wide as the core,
  // so the entrance (on the corridor's axis) never lands in the stair or the lift.
  const stairSide = bl >= br ? 'L' : 'R';
  if (stairSide === 'L') bl = Math.max(bl, CORE_W); else br = Math.max(br, CORE_W);
  const depth = Math.max(...programs.map((p, k) => layoutBands({ program: p, bl, br, start: hallD, r: sub(k) }).depth));
  const laid = programs.map((p, k) => ({ level: k, bands: layoutBands({ program: p, bl, br, start: hallD, depth, r: sub(k) }).bands }));
  return { W: r3(bl + cw + br), D: r3(hallD + depth), bl, br, cw, hallD, stairSide, bands: laid[0].bands, levels: laid };
}

// Turns a design into world entities (ids from the world's counters). Returns the building record.
export function placeBuilding(world, { parcelId, fp, front, design, level = 0, status = 'built' }) {
  const id = nextId(world, 'bldg');
  const F = frame(fp, front);
  const b = {
    id, primitive: 'building', parcelId, block: fp, footprint: fp, front, status,
    plan: { W: design.W, D: design.D, bl: design.bl, br: design.br, cw: design.cw, hallD: design.hallD, stairSide: design.stairSide, rearD: design.D },
    levels: [], wings: [], maxLevels: 4,
  };
  world.buildings[id] = b;
  for (const l of design.levels ?? [{ level, bands: design.bands }]) addLevel(world, b, l.level, l.bands, status);
  // Entrance: the front wall, on the corridor's axis.
  const hall = world.spaces[`${id}-L${level}-hall`];
  const u = design.bl + design.cw / 2, ew = DIMS.entrance.width;
  const a = F.pt(u - ew / 2, 0), c = F.pt(u + ew / 2, 0);
  b.entranceDoorId = addDoor(world, { buildingId: id, level, a: hall.id, b: 'outside', seg: [a, c], width: ew, height: DIMS.entrance.height, kind: 'entrance', status });
  return b;
}

// Adds one level (hall, corridor, stair core, band rooms, doors) to a building.
export function addLevel(world, b, level, bands, status) {
  const F = frame(b.block, b.front), P = b.plan, key = `${b.id}-L${level}`;
  const depth = P.D; // every level shares the main block's depth; rear wings are ground-level additions
  const hall = addSpace(world, `${key}-hall`, { primitive: 'hallway', roles: ['public-area'], buildingId: b.id, level, rect: F.toWorld(0, 0, P.W, P.hallD), local: { u: 0, v: 0, w: P.W, d: P.hallD }, access: level === 0 ? 'public' : 'staff', status });
  const corridor = addSpace(world, `${key}-corridor`, { primitive: 'hallway', roles: [], buildingId: b.id, level, rect: F.toWorld(P.bl, P.hallD, P.cw, depth - P.hallD), local: { u: P.bl, v: P.hallD, w: P.cw, d: depth - P.hallD }, access: 'staff', status });
  // The core: the stair flight at the hall's end, the lift shaft beside it at the back of the hall (its doors open
  // onto the hall). Both stay reserved until the building has a second built level.
  const su = P.stairSide === 'L' ? 0 : P.W - DIMS.stairCore.w, lu = P.stairSide === 'L' ? DIMS.stairCore.w : P.W - CORE_W, L = DIMS.liftShaft;
  const stair = addSpace(world, `${key}-stair`, { primitive: 'staircase', roles: [], buildingId: b.id, level, rect: F.toWorld(su, 0, DIMS.stairCore.w, P.hallD), local: { u: su, v: 0, w: DIMS.stairCore.w, d: P.hallD }, access: 'staff', status: 'reserved', inside: hall.id });
  addSpace(world, `${key}-lift`, { primitive: 'elevator', roles: [], buildingId: b.id, level, rect: F.toWorld(lu, P.hallD - L.d, L.w, L.d), local: { u: lu, v: P.hallD - L.d, w: L.w, d: L.d }, access: 'staff', status: 'reserved', inside: hall.id });
  // Hall and corridor share an open edge the width of the corridor.
  addDoor(world, { buildingId: b.id, level, a: hall.id, b: corridor.id, seg: [F.pt(P.bl, P.hallD), F.pt(P.bl + P.cw, P.hallD)], width: P.cw, height: DIMS.clearHeight, kind: 'opening', status });
  b.levels = [...new Set([...b.levels, level])].sort((x, y) => x - y);
  placeBandRooms(world, b, level, bands, corridor, F, status);
  refreshStairs(world, b);
  return { hall, corridor, stair };
}

export function placeBandRooms(world, b, level, bands, corridor, F, status, wingId = null) {
  const P = b.plan, made = [];
  for (const side of ['L', 'R']) for (const slot of bands[side].slots) {
    const u = side === 'L' ? 0 : P.bl + P.cw, w = side === 'L' ? P.bl : P.br;
    const room = addSpace(world, nextId(world, 'room'), {
      primitive: 'room', roles: [roleFor(slot.spec)], buildingId: b.id, level, wingId, band: side,
      rect: F.toWorld(u, slot.v, w, slot.len), local: { u, v: slot.v, w, d: slot.len },
      access: slot.spec?.access ?? 'staff', capabilities: slot.spec ? [...(slot.spec.members ?? [slot.spec.id])] : [], vacant: !slot.spec, status,
    });
    roomDoor(world, b, room, corridor, F, status);
    made.push(room);
  }
  return made;
}

// A room's door is on its corridor wall, centred on the room.
export function roomDoor(world, b, room, corridor, F, status) {
  const P = b.plan, wallU = room.band === 'L' ? P.bl : P.bl + P.cw, v = snap(room.local.v + room.local.d / 2), dw = DIMS.door.width;
  room.doorId = addDoor(world, { buildingId: b.id, level: room.level, a: room.id, b: corridor.id, seg: [F.pt(wallU, v - dw / 2), F.pt(wallU, v + dw / 2)], width: dw, height: DIMS.door.height, kind: 'door', status });
  return room.doorId;
}

// The stair core is walkable (linking levels) only on built levels of a building with two or more built levels.
export function refreshStairs(world, b) {
  const built = b.levels.filter(l => world.spaces[`${b.id}-L${l}-hall`]?.status === 'built');
  for (const l of b.levels) {
    for (const s of [world.spaces[`${b.id}-L${l}-stair`], world.spaces[`${b.id}-L${l}-lift`]]) if (s) s.status = built.length > 1 && built.includes(l) ? 'built' : 'reserved';
  }
}

export function addSpace(world, id, fields) { const s = { id, capabilities: [], vacant: false, ...fields }; world.spaces[id] = s; return s; }
export function addDoor(world, { seg, ...fields }) {
  const id = nextId(world, 'door'), [a, b] = seg;
  world.doors[id] = { id, primitive: 'door', ...fields, seg: { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, centre: centre(rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))) };
  return id;
}
export function nextId(world, type) { world.counters[type] = (world.counters[type] ?? 0) + 1; return `${type}-${world.counters[type]}`; }
