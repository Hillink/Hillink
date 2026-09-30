// Pass 5A: terrain. A seeded heightfield on a square grid (metres), with water below a level and slope per cell.
// It is regenerated from the seed on every load (a pure function), so only its parameters and a fingerprint are
// stored. Roads are routed across it by cost (slope, water), and buildings may only stand on buildable cells.
import { rng, fingerprint } from './rng.mjs';

export const TERRAIN_DEFAULTS = Object.freeze({ size: 512, cell: 4, relief: 22, waterShare: 0.07, maxSlope: 0.09 });

// Value noise: random values on a lattice, smoothly interpolated, summed over octaves.
function valueNoise(seed, n, cell, octaves) {
  const out = new Float64Array(n * n);
  let amp = 1, total = 0;
  for (const [o, spacing] of octaves.entries()) {
    const r = rng(seed, 'terrain', o), m = Math.ceil((n * cell) / spacing) + 2;
    const lattice = Array.from({ length: m * m }, () => r.next());
    const s = t => t * t * (3 - 2 * t);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i * cell) / spacing, y = (j * cell) / spacing, xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
      const v = k => lattice[k];
      const a = v(yi * m + xi), b = v(yi * m + xi + 1), c = v((yi + 1) * m + xi), d = v((yi + 1) * m + xi + 1);
      out[j * n + i] += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy);
    }
    total += amp; amp *= 0.5;
  }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

export function generateTerrain(seed, options = {}) {
  const o = { ...TERRAIN_DEFAULTS, ...options };
  const n = Math.round(o.size / o.cell);
  const raw = valueNoise(seed, n, o.cell, [o.size / 3, o.size / 7, o.size / 16]);
  const heights = Array.from(raw, h => Math.round(h * o.relief * 100) / 100);
  const sorted = [...heights].sort((a, b) => a - b);
  const waterLevel = sorted[Math.floor(sorted.length * o.waterShare)];
  const t = { size: o.size, cell: o.cell, n, relief: o.relief, maxSlope: o.maxSlope, waterLevel, heights };
  t.fingerprint = fingerprint({ heights, waterLevel });
  return t;
}

export const cellOf = (t, x, y) => [Math.min(t.n - 1, Math.max(0, Math.floor(x / t.cell))), Math.min(t.n - 1, Math.max(0, Math.floor(y / t.cell)))];
export const centreOf = (t, i, j) => ({ x: (i + 0.5) * t.cell, y: (j + 0.5) * t.cell });
export const heightAt = (t, x, y) => { const [i, j] = cellOf(t, x, y); return t.heights[j * t.n + i]; };
export const isWater = (t, i, j) => t.heights[j * t.n + i] <= t.waterLevel;
export function slope(t, i, j) {
  const h = t.heights[j * t.n + i];
  let s = 0;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < t.n && b < t.n) s = Math.max(s, Math.abs(t.heights[b * t.n + a] - h) / t.cell);
  }
  return s;
}
export const buildable = (t, i, j) => !isWater(t, i, j) && slope(t, i, j) <= t.maxSlope;

// Share of a rectangle's cells that can carry a building (0..1).
export function buildableShare(t, rect) {
  const [i0, j0] = cellOf(t, rect.x, rect.y), [i1, j1] = cellOf(t, rect.x + rect.w - 0.01, rect.y + rect.h - 0.01);
  let ok = 0, all = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { all++; if (buildable(t, i, j)) ok++; }
  return all ? ok / all : 0;
}

// A* over the grid (8 neighbours). cost(i, j) returns the price of entering a cell, or Infinity when blocked.
// Returns cell centres from start to goal, or null when unreachable.
export function gridPath(t, from, to, cost) {
  const n = t.n, [si, sj] = cellOf(t, from.x, from.y), [gi, gj] = cellOf(t, to.x, to.y);
  const start = sj * n + si, goal = gj * n + gi;
  const g = new Float64Array(n * n).fill(Infinity), prev = new Int32Array(n * n).fill(-1), done = new Uint8Array(n * n);
  const heap = []; // [f, tie, index]
  let tie = 0;
  const push = (f, k) => { heap.push([f, tie++, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (less(heap[c], heap[p])) { [heap[c], heap[p]] = [heap[p], heap[c]]; c = p; } else break; } };
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === c) break; [heap[c], heap[m]] = [heap[m], heap[c]]; c = m; } } return top; };
  const hEst = k => Math.hypot((k % n) - gi, Math.floor(k / n) - gj);
  g[start] = 0; push(hEst(start), start);
  while (heap.length) {
    const [, , k] = pop();
    if (done[k]) continue; done[k] = 1;
    if (k === goal) break;
    const i = k % n, j = Math.floor(k / n);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const c = cost(a, b); if (!Number.isFinite(c)) continue;
      const nk = b * n + a, step = (di && dj ? Math.SQRT2 : 1) * c;
      if (g[k] + step < g[nk]) { g[nk] = g[k] + step; prev[nk] = k; push(g[nk] + hEst(nk), nk); }
    }
  }
  if (!Number.isFinite(g[goal])) return null;
  const cells = [];
  for (let k = goal; k !== -1; k = prev[k]) cells.push(k);
  return cells.reverse().map(k => centreOf(t, k % n, Math.floor(k / n)));
}

// Drop points that lie on a straight line with their neighbours (a road keeps only its bends).
export function simplify(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = out[out.length - 1], b = points[k], c = points[k + 1];
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 1e-6) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}
