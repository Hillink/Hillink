// Test helper (Pass 5B correction): checks a complete emitted route against the canonical geometry. Every segment on
// one storey must stay out of walls (a space's edges, except where a door opens) and out of solid furniture;
// consecutive points on different storeys must be one elevator ride. Plan positions come from each point's `.at`.
import { viewOf } from '../procgen/view.mjs';
import { UNITS_PER_METRE as U } from '../procgen/units.mjs';

const cross = (p, q, a, b) => {
  const d = (u, v, w) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
};
export function wallsOf(world) {
  const view = viewOf(world), walls = [];
  for (const s of Object.values(world.spaces)) {
    if (!['room', 'hallway'].includes(s.primitive) || s.status === 'planned') continue;
    const r = view.rectToView(s.rect), m = v => v * U;
    const openings = Object.values(world.doors).filter(d => d.a === s.id || d.b === s.id).map(d => { const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2); return { x0: m(Math.min(a.x, b.x)) - 1, x1: m(Math.max(a.x, b.x)) + 1, z0: m(Math.min(a.z, b.z)) - 1, z1: m(Math.max(a.z, b.z)) + 1 }; });
    const corners = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => ({ x: m(x), z: m(z) }));
    for (let k = 0; k < 4; k++) walls.push({ floor: s.level, a: corners[k], b: corners[(k + 1) % 4], openings, space: s.id });
  }
  return walls;
}
// Returns a list of problems (empty when the route is sound).
export function routeProblems(layout, route, { solids = true } = {}) {
  const world = layout.world, walls = wallsOf(world), out = [];
  const boxes = solids ? Object.values(layout.furnishing).flatMap(F => F.items.filter(it => it.solid && !it.on).map(it => ({ floor: it.level, x0: (it.x - it.w / 2) * U, x1: (it.x + it.w / 2) * U, z0: (it.z - it.d / 2) * U, z1: (it.z + it.d / 2) * U, id: it.id }))) : [];
  const pts = route.map(p => p.at);
  if (pts.some(p => !p)) return ['a route point has no plan position'];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (a.floor !== b.floor) { if (!route[k].lift) out.push(`storey change without the lift at ${k}`); continue; }
    for (const w of walls) {
      if (w.floor !== a.floor || !cross(a, b, w.a, w.b)) continue;
      // Where does it cross? Allowed only inside a door opening on that wall.
      const t = ((w.a.x - a.x) * (w.b.z - w.a.z) - (w.a.z - a.z) * (w.b.x - w.a.x)) / ((b.x - a.x) * (w.b.z - w.a.z) - (b.z - a.z) * (w.b.x - w.a.x));
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!w.openings.some(o => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1)) out.push(`segment ${k} (${a.node ?? 'point'} -> ${b.node ?? 'point'}) crosses a wall of ${w.space} at (${(x / U).toFixed(2)}, ${(z / U).toFixed(2)}) m`);
    }
    // Sitting: the last step onto (or first step off) a seat of a piece enters that piece; nothing else may.
    const seatOf = n => typeof n === 'string' && boxes.find(bx => n === bx.id || n.startsWith(`${bx.id}#`) || n.startsWith(`${bx.id}@`))?.id;
    const own = new Set([seatOf(a.node), seatOf(b.node)].filter(Boolean));
    for (const bx of boxes) {
      if (bx.floor !== a.floor || own.has(bx.id)) continue;
      for (let s = 1; s < 20; s++) { const x = a.x + (b.x - a.x) * s / 20, z = a.z + (b.z - a.z) * s / 20; if (x > bx.x0 + 1 && x < bx.x1 - 1 && z > bx.z0 + 1 && z < bx.z1 - 1) { out.push(`segment ${k} passes through ${bx.id}`); break; } }
    }
  }
  return out;
}
