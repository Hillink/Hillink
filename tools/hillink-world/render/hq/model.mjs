// The semantic visual model of the HQ look: what exists and where, read from the generated layout (which reads the
// canonical World). Built once per layout; it holds no art. A style (styles/modern.mjs, styles/fantasy.mjs) decides
// how each kind of thing looks. Nothing here is invented: rooms, walls, doors, furniture, decor, stairs, lifts,
// construction projects, plants, paths and roads all come from the World (procgen + furnishing + projects).
//
//   rooms     finished rooms and halls: { id, level, r (plan box), kind (furnishing place kind), primitive, label }
//   walls     wall pieces cut from the finished spaces of each storey, broken around doors:
//             { axis, at, type, s, e, box, h0, h1, f, room (kind behind it), doors }
//             type: back / left (far walls, full height), front / right (near walls of the building, kept low so the
//             interior reads), low / partition (interior walls between spaces, half height with glass or timber above)
//   items     furniture: { id, type, f, x, z, w, d, h, facing, on, room, kind, station, system }
//   decor     wall-mounted pieces on a room's back wall: { type, f, x0, x1, h0, h1, z, kind }
//   doors     built doors: { id, f, a, b (plan points), kind ('door' | 'opening' | 'entrance'), axis, outside }
//   slots     reserved stairs and lifts: { f, r, what }
//   sites     construction projects: { p, f, u (plan box), rs, label, kind: 'site' | 'refit' }
//   ways      roads and paths on the ground: { kind, pts, W, built }
//   plants    vegetation from the World's environment anchors and foundation beds: { kind, x, z, s, seed, bed }
import { ARCH } from '../../world/scale.mjs';
import { represent } from '../../procgen/themes.mjs';
import { stageIndex } from '../../procgen/construction.mjs';
import { createGround } from '../art5d/ground.mjs';

export const HT = ARCH.floorHeight;
export const LOW = ARCH.partitionWainscot;

export function buildModel(layout, skinId = 'real') {
  const { world, view, U, furnishing } = layout;
  const labelOf = new Map(represent(world, skinId === 'fantasy' ? 'fantasy' : 'real').items.map(i => [`${i.primitive}:${i.canonicalId}`, i.label]));
  const rp = s => { const r = view.rectToView(s.rect); return { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U }; };
  const projects = world.projects ?? {};
  const activeProject = s => (s.project && projects[s.project] && !projects[s.project].completed ? projects[s.project] : null);
  const spaces = Object.values(world.spaces);
  const finished = s => s.status === 'built' && !activeProject(s);

  const rooms = spaces.filter(s => finished(s) && furnishing[s.id] && (s.primitive === 'room' || s.primitive === 'hallway')).map(s => ({ id: s.id, level: s.level, r: rp(s), kind: furnishing[s.id].kind, primitive: s.primitive, label: labelOf.get(`room:${s.id}`) ?? null, space: s }));
  const kindAt = (f, x, z) => rooms.find(q => q.level === f && x >= q.r.x0 - 1 && x <= q.r.x1 + 1 && z >= q.r.z0 - 1 && z <= q.r.z1 + 1)?.kind ?? 'passage';

  const items = [], decor = [];
  for (const room of rooms) {
    const F = furnishing[room.id], f = room.level;
    for (const it of F.items) items.push({ id: it.id, type: it.type, f, x: it.x * U, z: it.z * U, w: it.w * U, d: it.d * U, h: it.h * U, facing: it.facing ?? 'front', on: it.on ?? null, room: room.id, kind: room.kind, station: it.station ?? null, system: it.system ?? null, chair: it.chair ?? null });
    for (const w of F.decor) decor.push({ type: w.type, f, x0: w.x0 * U, x1: w.x1 * U, h0: w.h0, h1: w.h1, z: room.r.z1, room: room.id, kind: room.kind });
  }
  // Items standing on another item keep its id; the base's top is where they sit.
  for (const it of items) if (it.on) { const base = items.find(o => o.id === it.on); if (base) it.base = base; }

  const doors = Object.values(world.doors).filter(d => d.status === 'built').map(d => {
    const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2);
    return { id: d.id, f: d.level ?? 0, a: { x: a.x * U, z: a.z * U }, b: { x: b.x * U, z: b.z * U }, kind: d.kind, h: (d.height ?? 2.2) * U, axis: Math.abs(a.z - b.z) < 1e-6 ? 'z' : 'x', outside: d.a === 'outside' || d.b === 'outside' };
  });

  const levels = [...new Set(spaces.map(s => s.level))].sort((a, b) => a - b);
  const walls = [];
  for (const f of levels) walls.push(...wallsOf(f));
  function wallsOf(f) {
    const rects = spaces.filter(s => s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const siteRects = spaces.filter(s => s.level === f && activeProject(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const fdoors = doors.filter(d => d.f === f);
    const out = [], eq = (a, b) => Math.abs(a - b) < 0.5;
    for (const axis of ['z', 'x']) {
      const lines = [...new Set(rects.flatMap(r => (axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1]).map(v => Math.round(v * 2) / 2)))];
      for (const at of lines) {
        const lo = axis === 'z' ? 'x' : 'z';
        const after = rects.filter(r => eq(axis === 'z' ? r.z0 : r.x0, at)), before = rects.filter(r => eq(axis === 'z' ? r.z1 : r.x1, at));
        const cuts = [...new Set([...after, ...before].flatMap(r => [r[`${lo}0`], r[`${lo}1`]]))].sort((a, b) => a - b);
        const lineDoors = fdoors.filter(d => (axis === 'z' ? eq(d.a.z, at) && eq(d.b.z, at) : eq(d.a.x, at) && eq(d.b.x, at))).map(d => ({ s: Math.min(d.a[lo], d.b[lo]), e: Math.max(d.a[lo], d.b[lo]), h: d.h, kind: d.kind, outside: d.outside }));
        let run = null;
        const flush = () => { if (run) out.push(run); run = null; };
        for (let k = 0; k < cuts.length - 1; k++) {
          const s = cuts[k], e = cuts[k + 1], mid = (s + e) / 2;
          const hasAfter = after.some(r => r[`${lo}0`] <= mid && r[`${lo}1`] >= mid), hasBefore = before.some(r => r[`${lo}0`] <= mid && r[`${lo}1`] >= mid);
          if (!hasAfter && !hasBefore) { flush(); continue; }
          const opened = siteRects.some(r => (axis === 'z' ? eq(r.z0, at) || eq(r.z1, at) : eq(r.x0, at) || eq(r.x1, at)) && r[`${lo}0`] <= mid && r[`${lo}1`] >= mid);
          const type = axis === 'z' ? (hasAfter && hasBefore ? 'low' : hasBefore ? (opened ? 'low' : 'back') : 'front') : (hasAfter && hasBefore ? 'partition' : hasAfter ? (opened ? 'partition' : 'left') : 'right');
          if (run && run.type === type && eq(run.e, s)) run.e = e; else { flush(); run = { axis, at, type, s, e }; }
        }
        flush();
        for (const w of out.filter(w => w.axis === axis && w.at === at && !w.doors)) w.doors = lineDoors.filter(d => d.e > w.s && d.s < w.e);
      }
    }
    const pieces = [];
    for (const w of out) {
      const far = w.type === 'back' || w.type === 'left', near = w.type === 'front' || w.type === 'right';
      const h1 = far ? HT : near ? LOW : HT * 0.62, t = far ? 6 : near ? 5 : 3;
      let cur = w.s;
      const piece = (s, e, h0 = 0, door = null) => {
        if (e - s < 0.5) return;
        const box = w.axis === 'z' ? { x0: s, x1: e, z0: w.type === 'back' ? w.at : w.type === 'front' ? w.at - t : w.at - t / 2, z1: w.type === 'back' ? w.at + t : w.type === 'front' ? w.at : w.at + t / 2 }
          : { x0: w.type === 'left' ? w.at - t : w.type === 'right' ? w.at : w.at - t / 2, x1: w.type === 'left' ? w.at : w.type === 'right' ? w.at + t : w.at + t / 2, z0: s, z1: e };
        // The space this wall faces (its room's kind), for finishes: back walls face the room before them, left walls the room after.
        const mid = (s + e) / 2, probe = w.axis === 'z' ? [mid, w.type === 'back' ? w.at - 2 : w.at + 2] : [w.type === 'left' ? w.at + 2 : w.at - 2, mid];
        pieces.push({ ...w, f, box, h0, h1, far, near, s, e, door, room: kindAt(f, probe[0], probe[1]), bias: h0 > 0 ? -1 : 0 });
      };
      for (const o of [...(w.doors ?? [])].sort((a, b) => a.s - b.s)) { piece(cur, o.s); if (h1 > o.h && o.kind !== 'opening') piece(o.s, o.e, o.h, o); cur = o.e; }
      piece(cur, w.e);
    }
    return pieces;
  }

  const slots = spaces.filter(s => (s.primitive === 'staircase' || s.primitive === 'elevator') && spaces.some(h => h.id === s.inside && finished(h))).map(s => ({ f: s.level, r: rp(s), what: s.primitive === 'elevator' ? 'lift' : 'stair', built: s.status === 'built' }));

  // Construction: new structures (spaces owned by an unfinished project) and refits inside an existing room.
  const sites = [];
  for (const p of Object.values(projects)) {
    if (p.completed && p.stage === 'operational') continue;
    const parts = spaces.filter(s => s.project === p.id && s.primitive !== 'staircase' && s.primitive !== 'elevator' && !finished(s));
    const cap = world.capabilities[p.id];
    for (const f of [...new Set(parts.map(s => s.level))]) {
      const rs = parts.filter(s => s.level === f).map(s => ({ s, r: rp(s) }));
      const u = { x0: Math.min(...rs.map(q => q.r.x0)), x1: Math.max(...rs.map(q => q.r.x1)), z0: Math.min(...rs.map(q => q.r.z0)), z1: Math.max(...rs.map(q => q.r.z1)) };
      sites.push({ kind: 'site', p, f, u, rs, label: labelOf.get(`room:${cap?.placement?.spaceId}`) ?? p.id });
    }
    if (!parts.length && !p.completed) {
      const room = cap && world.spaces[cap.placement?.spaceId];
      if (room && room.status === 'built' && stageIndex(p.stage) >= stageIndex('site-preparation')) {
        const r = rp(room), side = Math.sqrt(Math.max(4, cap.area ?? 9)) * U, w = Math.min(side * 1.25, (r.x1 - r.x0) * 0.6), dz = Math.min(side * 0.8, (r.z1 - r.z0) * 0.5);
        sites.push({ kind: 'refit', p, f: room.level, u: { x0: r.x1 - 24 - w, x1: r.x1 - 24, z0: r.z1 - 30 - dz, z1: r.z1 - 30 }, rs: [], label: labelOf.get(`room:${room.id}`) ?? room.id, name: cap.spec?.name ?? String(p.id).replace(/-/g, ' ') });
      }
    }
  }

  const ground = createGround(layout);
  const ways = ground.ways.map(w => ({ kind: w.kind, pts: w.pts, W: w.W, built: w.built }));
  const plants = ground.plants;
  const forecourts = ground.forecourts;
  const buildings = Object.values(world.buildings).map(b => ({ id: b.id, r: rp({ rect: b.footprint }), levels: b.levels }));
  return { rooms, items, decor, doors, walls, slots, sites, ways, plants, forecourts, buildings, levels, labelOf, kindAt, rp, finished, projects };
}
