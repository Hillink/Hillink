// Pass 5D-A: ground, roads and vegetation for the Real World prototype.
//
// Rules, not a painted map (another seed gives a different, equally coherent result):
//   terrain   baked once into a plan-space image: meadow colour from low-frequency noise, hillshade from the canonical
//             terrain heights and the sun, water below the water level, a mown lawn apron around each building
//             (landscaped, with mowing stripes), wilder grass beyond it (undeveloped land that looks intentional);
//   ways      each generated road gets gravel shoulders, textured asphalt, edge lines and a centre line; where a road
//             passes a building's frontage it gains a sidewalk with a raised curb; paths are pavers with a clean edge;
//             the entrance gets a paved forecourt;
//   plants    the canonical environment anchors (trees, shrubs, rocks) become species chosen by a noise field
//             (broadleaf groves, conifer stands, birches at the edges), with size and silhouette variation; around a
//             building a planting bed with shrubs; small grass tufts and wildflowers scattered on open land.
// Nothing here affects navigation: plants never stand on roads, paths, forecourts or buildings.
import { MAT, SUN, lit, mix, litBlob } from './light.mjs';
import { makeCanvas, noise, fbm, hash2, planMatrix, TEX } from './textures.mjs';
import { wind } from '../../engine/environment.mjs';
import { smoothPolyline } from '../../engine/ambience.mjs';
import { STREET_SCALE } from '../../world/scale.mjs';
import { terrainOf } from '../../procgen/world.mjs';
import { frames } from '../../procgen/camera.mjs';

const TAU = Math.PI * 2;
const distToSeg = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
const distToPolyline = (px, pz, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, distToSeg(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return m; };
const distToRect = (px, pz, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.z0 - pz, 0, pz - r.z1));

export function createGround(layout) {
  const { world, view, U, P } = layout;
  const t = terrainOf(world), settle = frames(world).settlement, pad = 70;
  const toPlan = (X, Y) => { const v = view.toView(X, Y); return [v.x * U, v.z * U]; };
  // Plan-space bounds of the ground we detail (the settlement and some land around it).
  const cs = [[settle.x - pad, settle.y - pad], [settle.x + settle.w + pad, settle.y - pad], [settle.x - pad, settle.y + settle.h + pad], [settle.x + settle.w + pad, settle.y + settle.h + pad]].map(([X, Y]) => toPlan(X, Y));
  const box = { x0: Math.min(...cs.map(c => c[0])), x1: Math.max(...cs.map(c => c[0])), z0: Math.min(...cs.map(c => c[1])), z1: Math.max(...cs.map(c => c[1])) };
  const ways = [...Object.values(world.roads).map(r => ({ kind: 'road', w: r, pts: smoothPolyline(r.points.map(p => toPlan(p.x, p.y)), STREET_SCALE.car.length * 1.6), W: r.width * U, built: r.status === 'built' })), ...Object.values(world.paths).map(p => ({ kind: 'path', w: p, pts: p.points.map(q => toPlan(q.x, q.y)), W: p.width * U, built: p.status === 'built' }))];
  const buildings = Object.values(world.buildings).map(b => { const r = view.rectToView(b.footprint); return { b, r: { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U } }; });
  const sites = Object.values(world.spaces).filter(s => s.status !== 'built' && s.project).map(s => { const r = view.rectToView(s.rect); return { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U }; });
  // Entrance forecourts: a paved apron in front of each outside door.
  const forecourts = Object.values(world.doors).filter(d => d.status === 'built' && (d.a === 'outside' || d.b === 'outside')).map(d => { const c = view.toView((d.seg.x1 + d.seg.x2) / 2, (d.seg.y1 + d.seg.y2) / 2), x = c.x * U, z = c.z * U; return { x0: x - 3.2 * U, x1: x + 3.2 * U, z0: z - 3.4 * U, z1: z, door: { x, z } }; });
  const heightAtPlan = (x, z) => {
    const w = view.fromView(x / U, z / U), fx = Math.max(0, Math.min(t.n - 1.001, w.x / t.cell)), fy = Math.max(0, Math.min(t.n - 1.001, w.y / t.cell)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, H = (a, b) => t.heights[Math.min(t.n - 1, b) * t.n + Math.min(t.n - 1, a)];
    return H(i, j) * (1 - u) * (1 - v) + H(i + 1, j) * u * (1 - v) + H(i, j + 1) * (1 - u) * v + H(i + 1, j + 1) * u * v;
  };
  const onWay = (x, z, margin = 0) => ways.some(w => distToPolyline(x, z, w.pts) < w.W / 2 + margin);
  const lawnDist = (x, z) => Math.min(...buildings.map(b => distToRect(x, z, b.r)));

  // ---- Vegetation: species from rules over the canonical environment anchors, plus planting around buildings. ----
  const plants = [];
  const clear = (x, z, m) => !onWay(x, z, m) && !buildings.some(b => distToRect(x, z, b.r) < m) && !sites.some(r => distToRect(x, z, r) < m) && !forecourts.some(r => distToRect(x, z, r) < m) && heightAtPlan(x, z) > t.waterLevel + 0.3;
  for (const e of world.environment) {
    const [x, z] = toPlan(e.x, e.y); if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1) continue;
    if (!clear(x, z, e.kind === 'tree' ? 2.2 * U : 1.2 * U)) continue;
    const grove = fbm(e.x / 60, e.y / 60, 3, 2), r = hash2(e.x, e.y, 1);
    if (e.kind === 'rock') { plants.push({ kind: 'rock', x, z, s: 0.7 + r * 0.8, seed: r }); continue; }
    if (e.kind === 'shrub') { plants.push({ kind: r > 0.6 ? 'flowerShrub' : 'shrub', x, z, s: 0.8 + r * 0.6, seed: r }); continue; }
    const species = grove > 0.58 ? 'conifer' : lawnDist(x, z) < 14 * U && r > 0.55 ? 'birch' : 'broadleaf';
    plants.push({ kind: species, x, z, s: 0.8 + r * 0.55, seed: r });
  }
  // Foundation planting: a mulch bed along the sides of each building the camera sees (not across doors), with shrubs.
  const beds = [];
  for (const { r } of buildings) {
    const doorsX = forecourts.map(f => f.door.x);
    const W = 1.3 * U;
    beds.push({ x0: r.x0 - W, x1: r.x0 - 0.15 * U, z0: r.z0 + 0.4 * U, z1: r.z1 - 0.4 * U }); // left side
    for (const [a, b] of [[r.x0 - W, Math.min(...doorsX, r.x1) - 3.6 * U], [Math.max(...doorsX, r.x0) + 3.6 * U, r.x1 + W]]) if (b - a > 1.5 * U) beds.push({ x0: a, x1: b, z0: r.z0 - W, z1: r.z0 - 0.15 * U }); // front, either side of the entrance
  }
  for (const bd of beds) {
    const along = bd.x1 - bd.x0 > bd.z1 - bd.z0, len = along ? bd.x1 - bd.x0 : bd.z1 - bd.z0, n = Math.max(1, Math.floor(len / (1.4 * U)));
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n, x = along ? bd.x0 + u * (bd.x1 - bd.x0) : (bd.x0 + bd.x1) / 2, z = along ? (bd.z0 + bd.z1) / 2 : bd.z0 + u * (bd.z1 - bd.z0); if (onWay(x, z, 0.3 * U)) continue; const r = hash2(x, z, 5); plants.push({ kind: r > 0.7 ? 'grassClump' : r > 0.35 ? 'flowerShrub' : 'shrub', x, z, s: 0.55 + r * 0.35, seed: r, bed: true }); }
  }
  // Wildflowers and grass tufts on open land (small decals, near the settlement only).
  const decals = [];
  for (let i = 0; i < 1400; i++) {
    const x = box.x0 + hash2(i, 1, 31) * (box.x1 - box.x0), z = box.z0 + hash2(i, 2, 31) * (box.z1 - box.z0);
    if (!clear(x, z, 0.6 * U) || beds.some(b => distToRect(x, z, b) < 0.2 * U)) continue;
    const lawn = lawnDist(x, z) < 7 * U;
    if (lawn && hash2(i, 4, 31) > 0.25) continue; // the lawn is mown
    decals.push({ x, z, kind: hash2(i, 3, 31) > 0.86 ? 'flower' : 'tuft', c: ['#f4f1e6', '#f2d24b', '#b99cf0', '#ef8f8f'][Math.floor(hash2(i, 5, 31) * 4)], seed: hash2(i, 6, 31) });
  }

  // ---- The baked terrain image (plan space). ----
  let baked = null;
  function bake() {
    const res = Math.min(0.14, 1800 / Math.max(box.x1 - box.x0, box.z1 - box.z0)), W = Math.ceil((box.x1 - box.x0) * res), H = Math.ceil((box.z1 - box.z0) * res);
    const c = makeCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    const cols = { g: parseRGB(MAT.grass[0]), m: parseRGB(MAT.meadow[0]), d: parseRGB(MAT.grassDry[0]), l: parseRGB(MAT.lawn[0]), l2: parseRGB(MAT.lawn[1]), w: parseRGB(MAT.water[0]), s: parseRGB(MAT.soil[0]) };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = box.x0 + (i + 0.5) / res, z = box.z0 + (j + 0.5) / res, h = heightAtPlan(x, z), mx = x / U, mz = z / U;
      const e = 2 / res, dhx = heightAtPlan(x + e, z) - heightAtPlan(x - e, z), dhz = heightAtPlan(x, z + e) - heightAtPlan(x, z - e);
      const shadeK = 1 + Math.max(-0.12, Math.min(0.12, (-dhx * SUN.sx - dhz * SUN.sz) * 0.9)); // hillshade: slopes facing the sun are lighter
      let rgb;
      if (h <= t.waterLevel) { const k = Math.min(1, (t.waterLevel - h) / 1.2); rgb = mixRGB(cols.s, cols.w, 0.35 + 0.65 * k); }
      else {
        const n1 = fbm(mx / 38, mz / 38, 1, 4), n2 = fbm(mx / 9, mz / 9, 2, 3), wet = Math.max(0, 1 - (h - t.waterLevel) / 2.5);
        rgb = mixRGB(mixRGB(cols.g, cols.m, Math.min(1, Math.max(0, (n1 - 0.3) * 1.8))), cols.d, Math.max(0, (n2 - 0.5) * 1.6) * (1 - wet));
        const lawn = lawnDist(x, z) / U;
        if (lawn < 8) { const k = Math.min(1, (8 - lawn) / 2.5), stripe = Math.floor(mx / 1.6) % 2 ? cols.l : mixRGB(cols.l, cols.l2, 0.35); rgb = mixRGB(rgb, stripe, k); }
        if (wet > 0) rgb = mixRGB(rgb, cols.w, wet * 0.15);
      }
      const o = (j * W + i) * 4; px[o] = rgb[0] * shadeK; px[o + 1] = rgb[1] * shadeK; px[o + 2] = rgb[2] * shadeK; px[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Baked shadows of what never moves on the ground: trees, shrubs and the buildings themselves.
    g.save(); g.scale(res, res); g.translate(-box.x0, -box.z0); g.fillStyle = 'rgba(28,44,74,0.34)';
    if ('filter' in g) g.filter = `blur(${Math.max(1, 0.35 * U * res)}px)`;
    for (const p of plants) { const hgt = plantHeight(p, U), r = plantRadius(p, U); g.beginPath(); g.ellipse(p.x + SUN.sx * hgt * 0.62, p.z + SUN.sz * hgt * 0.62, r * 1.05, r * 0.8, 0, 0, TAU); g.fill(); }
    for (const { b, r } of buildings) { const hgt = (b.levels?.length ?? 1) * 3.4 * U; g.beginPath(); g.moveTo(r.x0, r.z1); g.lineTo(r.x1, r.z0); g.lineTo(r.x1 + SUN.sx * hgt, r.z0 + SUN.sz * hgt); g.lineTo(r.x1 + SUN.sx * hgt, r.z1 + SUN.sz * hgt); g.lineTo(r.x0 + SUN.sx * hgt, r.z1 + SUN.sz * hgt); g.closePath(); g.fill(); }
    g.restore();
    baked = { c, res };
  }

  // ---- Drawing. ----
  function drawTerrain(d) {
    const { ctx } = d;
    if (!baked) bake();
    ctx.save(); ctx.transform(...planMatrix(P, 0));
    ctx.fillStyle = MAT.meadow[0]; ctx.fillRect(box.x0 - 2e4, box.z0 - 2e4, 4e4 + (box.x1 - box.x0), 4e4 + (box.z1 - box.z0));
    ctx.imageSmoothingEnabled = true; ctx.drawImage(baked.c, box.x0, box.z0, box.x1 - box.x0, box.z1 - box.z0);
    if (!d.reduced) { ctx.globalAlpha = 0.42; ctx.fillStyle = TEX.grass(ctx); ctx.fillRect(box.x0, box.z0, box.x1 - box.x0, box.z1 - box.z0); ctx.globalAlpha = 1; }
    // Planting beds (mulch with a steel edge).
    for (const b of beds) { ctx.fillStyle = MAT.mulch[0]; ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 0.8; ctx.strokeRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0); }
    drawWays(ctx);
    ctx.restore();
  }
  function strip(pts, width) { const out = []; for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L * width / 2, nz = (bx - ax) / L * width / 2; out.push([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]); } return out; }
  function strokePts(ctx, pts) { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z))); ctx.stroke(); }
  const offsetLine = (pts, k) => pts.map(([x, z], i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [x - ((b[1] - a[1]) / L) * k, z + ((b[0] - a[0]) / L) * k]; });
  function fillStrip(ctx, pts, width, fill) { ctx.fillStyle = fill; for (const q of strip(pts, width)) { ctx.beginPath(); q.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z))); ctx.closePath(); ctx.fill(); } for (const [x, z] of pts) { ctx.beginPath(); ctx.arc(x, z, width / 2, 0, TAU); ctx.fill(); } }
  function drawWays(ctx) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const w of ways.filter(w => w.kind === 'road')) {
      const { pts, W } = w;
      fillStrip(ctx, pts, W + 1.6 * U, TEX.gravel(ctx) ?? MAT.gravel[0]);           // shoulders
      fillStrip(ctx, pts, W + 0.5 * U, MAT.asphaltEdge[0]);                          // worn edge
      fillStrip(ctx, pts, W, TEX.asphalt(ctx) ?? MAT.asphalt[0]);                    // asphalt
      ctx.strokeStyle = 'rgba(238,241,244,0.85)'; ctx.lineWidth = 0.12 * U;
      for (const s of [-1, 1]) strokePts(ctx, offsetLine(pts, s * (W / 2 - 0.3 * U)));  // edge lines
      ctx.setLineDash([2.2 * U, 2.6 * U]); ctx.strokeStyle = 'rgba(242,201,76,0.9)'; ctx.lineWidth = 0.14 * U; strokePts(ctx, pts); ctx.setLineDash([]); // centre line
    }
    // Sidewalks with a curb where a road passes a building's frontage.
    for (const w of ways.filter(w => w.kind === 'road')) for (const { r } of buildings) {
      const side = offsetLine(w.pts, w.W / 2 + 1.1 * U), near = side.filter(([x, z]) => distToRect(x, z, r) < 18 * U);
      if (near.length < 2) continue;
      w.sidewalk = near;
      ctx.strokeStyle = MAT.concrete[0]; ctx.lineWidth = 1.9 * U; ctx.lineCap = 'butt'; strokePts(ctx, near);
      ctx.strokeStyle = 'rgba(120,125,130,0.35)'; ctx.lineWidth = 0.05 * U; ctx.setLineDash([0.05 * U, 1.5 * U]);
      for (const k of [-0.9, 0.9]) strokePts(ctx, offsetLine(near, k * U)); ctx.setLineDash([]);
      ctx.strokeStyle = MAT.curb[0]; ctx.lineWidth = 0.28 * U; strokePts(ctx, offsetLine(near, -0.95 * U)); // curb top
      ctx.strokeStyle = 'rgba(40,50,60,0.35)'; ctx.lineWidth = 0.08 * U; strokePts(ctx, offsetLine(near, -1.1 * U)); // curb shadow line
      ctx.lineCap = 'round';
    }
    for (const w of ways.filter(w => w.kind === 'path')) {
      if (!w.built) { fillStrip(ctx, w.pts, w.W, 'rgba(150,120,80,0.35)'); continue; }
      fillStrip(ctx, w.pts, w.W + 0.3 * U, MAT.concreteDark[0]);
      fillStrip(ctx, w.pts, w.W, TEX.pavers(ctx) ?? MAT.paver[0]);
    }
    for (const f of forecourts) { ctx.fillStyle = MAT.concreteDark[0]; ctx.fillRect(f.x0 - 0.15 * U, f.z0 - 0.15 * U, f.x1 - f.x0 + 0.3 * U, f.z1 - f.z0 + 0.15 * U); ctx.fillStyle = TEX.pavers(ctx) ?? MAT.paver[0]; ctx.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0); }
  }
  // Small decals on open land, drawn in screen space only where on screen (tufts sway in the wind).
  function drawDecals(d, onScreen) {
    const { ctx } = d, T = d.reduced ? 0 : d.T;
    for (const g of decals) {
      const [sx, sy] = P.at(g.x, g.z, 0, 0); if (!onScreen(sx, sy)) continue;
      const w = wind(T, g.x, g.z) * 1.2;
      if (g.kind === 'tuft') { ctx.strokeStyle = g.seed > 0.5 ? '#5f8f3f' : '#7aa850'; ctx.lineWidth = 1; ctx.beginPath(); for (const k of [-2, 0, 2]) { ctx.moveTo(sx + k, sy); ctx.quadraticCurveTo(sx + k + w * 0.5, sy - 3, sx + k * 1.6 + w, sy - 5 - g.seed * 2); } ctx.stroke(); }
      else { ctx.strokeStyle = '#5f8f3f'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + w * 0.6, sy - 5); ctx.stroke(); ctx.fillStyle = g.c; ctx.beginPath(); ctx.arc(sx + w * 0.6, sy - 5.5, 1.5, 0, TAU); ctx.fill(); }
    }
  }
  return { box, plants, beds, forecourts, ways, drawTerrain, drawDecals };
}

// ---- Plants: cached sprites per species and variant, drawn standing (billboards) with wind sway. ----
export const plantHeight = (p, U) => ({ broadleaf: 5.4, conifer: 7, birch: 6, shrub: 1.1, flowerShrub: 1.0, grassClump: 0.8, rock: 0.6 }[p.kind] ?? 1) * U * p.s;
export const plantRadius = (p, U) => ({ broadleaf: 1.9, conifer: 1.35, birch: 1.2, shrub: 0.75, flowerShrub: 0.7, grassClump: 0.45, rock: 0.55 }[p.kind] ?? 0.6) * U * p.s;
const sprites = new Map();
function spriteOf(p, U) {
  const variant = Math.floor(p.seed * 5), key = `${p.kind}:${variant}:${Math.round(p.s * 4)}`;
  let s = sprites.get(key); if (s) return s;
  const H = plantHeight(p, U), R = plantRadius(p, U), scale = 2, w = Math.ceil(R * 2.8 + 8), h = Math.ceil(H + R * 0.6 + 10);
  const c = makeCanvas(w * scale, h * scale), g = c.getContext('2d'); g.scale(scale, scale);
  const bx = w / 2, by = h - 4, rnd = k => hash2(variant, k, p.kind.length);
  if (p.kind === 'broadleaf' || p.kind === 'birch') {
    const trunkTop = by - H * (p.kind === 'birch' ? 0.62 : 0.45), tw = p.kind === 'birch' ? 1.6 : 2.6;
    g.fillStyle = p.kind === 'birch' ? MAT.birch[0] : MAT.bark[0]; g.beginPath(); g.moveTo(bx - tw, by); g.lineTo(bx - tw * 0.5, trunkTop); g.lineTo(bx + tw * 0.5, trunkTop); g.lineTo(bx + tw, by); g.fill();
    g.fillStyle = 'rgba(20,30,40,0.25)'; g.fillRect(bx, trunkTop, tw * 0.8, by - trunkTop);
    if (p.kind === 'birch') { g.fillStyle = '#3a3a3a'; for (let k = 0; k < 5; k++) g.fillRect(bx - tw * 0.8, by - 4 - k * (by - trunkTop) / 6, tw * 1.2, 0.8); }
    const base = p.kind === 'birch' ? MAT.foliageLight[0] : [MAT.foliage[0], MAT.foliageLight[0], MAT.foliageDark[0]][variant % 3];
    const cy = by - H * 0.72, n = 5 + variant % 3;
    const clumps = Array.from({ length: n }, (_, k) => ({ x: bx + (rnd(k) - 0.5) * R * 1.2, y: cy + (rnd(k + 9) - 0.5) * R * 0.9 - (k % 2) * R * 0.25, r: R * (0.5 + rnd(k + 19) * 0.3) })).sort((a, b) => a.y - b.y);
    litBlob(g, bx, cy + R * 0.25, R * 0.95, lit(base, 0.78));
    for (const cl of clumps) litBlob(g, cl.x, cl.y, cl.r, base);
    g.globalAlpha = 0.35; for (let k = 0; k < 40; k++) { g.fillStyle = k % 2 ? lit(base, 1.25) : lit(base, 0.7); g.beginPath(); g.arc(bx + (rnd(k + 40) - 0.5) * R * 1.7, cy + (rnd(k + 80) - 0.5) * R * 1.3, 0.9 + rnd(k) * 1.2, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  } else if (p.kind === 'conifer') {
    g.fillStyle = MAT.bark[0]; g.fillRect(bx - 1.3, by - H * 0.2, 2.6, H * 0.2);
    const tiers = 4, base = MAT.conifer[0];
    for (let k = 0; k < tiers; k++) {
      const y0 = by - H * 0.14 - k * H * 0.2, y1 = y0 - H * 0.36, r = R * (1 - k * 0.2);
      const grd = g.createLinearGradient(bx - r, 0, bx + r, 0); grd.addColorStop(0, lit(base, 1.15)); grd.addColorStop(0.55, base); grd.addColorStop(1, lit(base, 0.7));
      g.fillStyle = grd; g.beginPath(); g.moveTo(bx - r, y0); g.quadraticCurveTo(bx, y0 + 2.5, bx + r, y0); g.lineTo(bx + (rnd(k) - 0.5) * 1.5, y1); g.closePath(); g.fill();
    }
  } else if (p.kind === 'rock') {
    const base = MAT.rock[0]; g.fillStyle = lit(base, 0.8); g.beginPath(); g.ellipse(bx, by - R * 0.3, R, R * 0.55, 0, 0, TAU); g.fill();
    litBlob(g, bx - R * 0.15, by - R * 0.45, R * 0.85, base, { squash: 0.62 });
  } else {
    // Shrubs, flowering shrubs and grass clumps: low rounded masses (flowers dotted on top).
    const base = p.kind === 'grassClump' ? '#8fb55a' : p.kind === 'flowerShrub' ? MAT.foliageDark[0] : MAT.foliage[0];
    if (p.kind === 'grassClump') { g.strokeStyle = base; g.lineWidth = 1.2; for (let k = 0; k < 14; k++) { const a = -Math.PI / 2 + (rnd(k) - 0.5) * 1.6; g.beginPath(); g.moveTo(bx + (rnd(k + 3) - 0.5) * R, by); g.quadraticCurveTo(bx + Math.cos(a) * R * 0.5, by - H * 0.5, bx + Math.cos(a) * R * 1.1, by - H * (0.7 + rnd(k + 5) * 0.4)); g.stroke(); } }
    else {
      for (let k = 0; k < 4; k++) litBlob(g, bx + (rnd(k) - 0.5) * R * 0.9, by - H * 0.45 - rnd(k + 7) * H * 0.25, R * (0.55 + rnd(k + 13) * 0.25), base, { squash: 0.8 });
      if (p.kind === 'flowerShrub') for (let k = 0; k < 14; k++) { g.fillStyle = ['#f4f1e6', '#f29bb5', '#f2d24b'][variant % 3]; g.beginPath(); g.arc(bx + (rnd(k + 30) - 0.5) * R * 1.4, by - H * 0.35 - rnd(k + 50) * H * 0.55, 1.1, 0, TAU); g.fill(); }
    }
  }
  s = { c, w, h, bx, by, scale }; sprites.set(key, s);
  return s;
}
// Draws one plant with its sway: the crown leans with the wind; the base stays put.
export function drawPlant(d, p, U) {
  const { ctx, P } = d, s = spriteOf(p, U), [x, y] = P.at(p.x, p.z, 0, 0);
  const sway = d.reduced || p.kind === 'rock' ? 0 : wind(d.T, p.x, p.z) * (p.kind === 'conifer' ? 0.018 : p.kind.startsWith('b') ? 0.03 : 0.05);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -sway, 1, 0, 0); ctx.drawImage(s.c, -s.bx, -s.by, s.w, s.h); ctx.restore();
}

function parseRGB(c) { const n = parseInt(c.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mixRGB(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
