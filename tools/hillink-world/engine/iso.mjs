// 2.5D projection and depth sorting for the object-built World. Pure math, no drawing.
// Plan space: x along the building, z depth into a room (0 = open front), floor index, h height.
// World units: sx = x + z*skx, sy = base(floor) - z*sky - h. Depth recedes up and to the right,
// so the visible faces of a box are its front (min z), its top and its right side (max x).

export function projector(g) {
  const pitch = g.height + g.slab;
  const baseOf = f => g.base - f * pitch;
  return {
    g, pitch, baseOf,
    at: (x, z, floor = 0, h = 0) => [x + z * g.skx, baseOf(floor) - z * g.sky - h],
    // Inverse on a floor plane (h = 0): world point -> [x, z].
    plan(sx, sy, floor = 0) { const z = (baseOf(floor) - sy) / g.sky; return [sx - z * g.skx, z]; },
  };
}

// Screen bounds of a plan box (x0..x1, z0..z1, h0..h1) on a floor.
export function boxBounds(P, b, floor) {
  const [l] = P.at(b.x0, b.z0, floor), [r] = P.at(b.x1, b.z1, floor);
  const [, bottom] = P.at(0, b.z0, floor, b.h0 ?? 0), [, top] = P.at(0, b.z1, floor, b.h1 ?? b.h ?? 0);
  return { l, r, t: top, b: bottom };
}

// a in front of b? >0 yes, <0 no. Anything behind a point lies deeper in z and further left,
// so a box entirely nearer in z, or level in z but entirely to the right, is in front.
export function inFront(a, b) {
  if (a.z1 <= b.z0) return 1;
  if (b.z1 <= a.z0) return -1;
  if (a.x0 >= b.x1) return 1;
  if (b.x0 >= a.x1) return -1;
  return ((b.z0 + b.z1) - (a.z0 + a.z1)) || (a.bias ?? 0) - (b.bias ?? 0);
}

const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

// Painter's order for one floor: a topological sort of "must draw before" among items whose screen
// bounds overlap. Items: { x0, x1, z0, z1, sb: screen bounds, bias? }. Cycles (never expected) fall
// back to the base order instead of hanging.
export function depthSort(items) {
  const n = items.length, before = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i], b = items[j];
    if (a.sb && b.sb && !overlaps(a.sb, b.sb)) continue;
    const c = inFront(a, b);
    if (c > 0) before[i].push(j); else if (c < 0) before[j].push(i);
  }
  const order = [...items.keys()].sort((a, b) => (items[b].z0 + items[b].z1) - (items[a].z0 + items[a].z1) || items[a].x0 - items[b].x0);
  const state = new Uint8Array(n), out = [];
  const visit = i => {
    if (state[i]) return;
    state[i] = 1;
    for (const j of before[i]) visit(j);
    state[i] = 2; out.push(items[i]);
  };
  for (const i of order) visit(i);
  return out;
}

// Convex hull (for picking rooms by their projected volume).
export function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Segment vs axis-aligned rectangle (plan space), used to prove walkways avoid furniture.
export function segmentHitsRect([ax, az], [bx, bz], r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-6;
}
