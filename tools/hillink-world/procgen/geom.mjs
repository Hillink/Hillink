// Pass 5A: plan geometry in metres. Rects are axis aligned { x, y, w, h } (y grows south).
const EPS = 1e-6;
export const rect = (x, y, w, h) => ({ x: r3(x), y: r3(y), w: r3(w), h: r3(h) });
export const r3 = v => Math.round(v * 1000) / 1000;
export const area = r => r.w * r.h;
export const centre = r => ({ x: r3(r.x + r.w / 2), y: r3(r.y + r.h / 2) });
export const contains = (r, p, eps = EPS) => p.x >= r.x - eps && p.x <= r.x + r.w + eps && p.y >= r.y - eps && p.y <= r.y + r.h + eps;
export const containsRect = (outer, inner, eps = EPS) => inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
// Interiors overlap (touching edges do not count).
export const overlaps = (a, b, eps = EPS) => a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
export const inset = (r, d) => rect(r.x + d, r.y + d, r.w - 2 * d, r.h - 2 * d);
export const union = rs => { const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)); return rect(x0, y0, Math.max(...rs.map(r => r.x + r.w)) - x0, Math.max(...rs.map(r => r.y + r.h)) - y0); };
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Does segment ab pass through the interior of r? (Liang-Barsky clip against the rect shrunk by eps.)
export function segmentHitsRect(a, b, r, eps = 0.01) {
  const x0 = r.x + eps, y0 = r.y + eps, x1 = r.x + r.w - eps, y1 = r.y + r.h - eps;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-9;
}

// Point on a polyline closest to p, with the segment index.
export function nearestOnPolyline(points, p) {
  let best = null;
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k], b = points[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    const q = { x: r3(a.x + t * dx), y: r3(a.y + t * dy) }, d = dist(p, q);
    if (!best || d < best.d) best = { point: q, index: k, d };
  }
  return best;
}
export const onPolyline = (points, p, eps = 0.01) => nearestOnPolyline(points, p).d <= eps;
