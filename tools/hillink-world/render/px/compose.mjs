// Pass 5H vertical slice: composing a World scene from the canonical layout, by rules only.
// Input: the generated layout (the planner's canonical geometry: spaces, doors, furnishing, roads, paths, terrain) and
// a theme. Output: a static scene in art pixels:
//   ground    one baked buffer: land, water, roads, paths, room floors, rugs, contact shadows
//   objects   depth-sortable sprites: wall pieces, door frames, decor, sconces, props, posts, vegetation (some animated)
//   emitters  light sources (for glows and the lightmap)
//   interiors screen polygons of finished rooms (lit inside at dusk and night)
// Nothing here is placed by hand: every piece comes from a canonical record through a rule (kit.mjs data). Both themes
// run the same rules over the same geometry; only materials and recipes differ. Pure and deterministic: no clock, no
// Math.random, no canonical writes (the layout and world are only read).
import { PixelBuffer, scale, noise, mixc, hex, rgba, R, G, B, bayer } from './buffer.mjs';
import { paletteOf, LIGHTING } from './palette.mjs';
import { MATERIALS, FLOORS, PATTERNS, LAND, recipeFor, DECOR, VEGETATION, EDGE_MIX, POSTS, SCONCES, GLOWS } from './kit.mjs';
import { AGENT, ARCH } from '../../world/scale.mjs';
import { terrainOf } from '../../procgen/world.mjs';

export const ART = AGENT.height / 24; // world units per art pixel: a 1.75 m person is 24 px
const HT = ARCH.floorHeight, LOW = ARCH.partitionWainscot;
const SEATS = new Set(['officeChair', 'chair', 'couch', 'armchair', 'bench']);
export const FRAMES = 4; // animated pieces loop over four frames

// Material colour for a theme: { c: colour, e: emissive } at a ramp shift and animation frame.
function materialer(theme) {
  const pal = paletteOf(theme), mats = MATERIALS[theme] ?? MATERIALS.real;
  return (name, shift = 0, frame = 0, px = 0, py = 0) => {
    const m = mats[name] ?? mats.wood, base = m.k + shift;
    let k = base;
    if (m.anim === 'fire') k = [4, 3, 4, 2][(frame + (noise(px, py, 3) * 4 | 0)) % 4];
    else if (m.anim === 'pulse') k = [2, 3, 4, 3][frame % 4];
    else if (m.anim === 'blink') k = noise(px, py, 1 + (frame >> 1)) > 0.55 ? 4 : 1;
    else if (m.anim === 'flicker') k = [3, 4, 3, 3][(frame + (noise(px, py) * 2 | 0)) % 4];
    if (m.books) return { c: pal.c(['fabric', 'fabric2', 'leather', 'brand', 'paper'][noise(px, 0, 5) * 5 | 0], 1 + (noise(px, 1, 6) * 2 | 0)), e: false };
    return { c: pal.c(m.pal, k), e: !!m.emissive };
  };
}

export function composeScene(layout, theme = 'real') {
  const { P, U, world, view, furnishing } = layout, A = ART, pal = paletteOf(theme), mat = materialer(theme), mat0 = mat;
  const SCREEN_OFF = { screen: 'screenOff' };
  const Q = (x, z, f, h) => { const [sx, sy] = P.at(x, z, f, h); return [sx / A, sy / A]; }; // plan units -> art px
  const spaces = Object.values(world.spaces), projects = world.projects ?? {};
  const active = s => (s.project && projects[s.project] && !projects[s.project].completed ? projects[s.project] : null);
  const finished = s => s.status === 'built' && !active(s);
  const rp = s => { const r = view.rectToView(s.rect); return { x0: r.x0 * U, x1: r.x1 * U, z0: r.z0 * U, z1: r.z1 * U }; };
  const kindOf = s => furnishing[s.id]?.kind ?? (s.primitive === 'hallway' ? 'passage' : 'spare');
  const roomSpaces = spaces.filter(s => finished(s) && furnishing[s.id] && (s.primitive === 'room' || s.primitive === 'hallway'));
  const locOf = Object.fromEntries((layout.locations ?? []).filter(l => l.spaceId).map(l => [l.spaceId, l.id]));

  // ---- Region of the baked ground (art px). ----
  const B0 = layout.bounds, H0 = layout.home;
  const cx = (H0.x + H0.w / 2) / A, cy = (H0.y + H0.h / 2) / A;
  const rw = Math.min(2600, Math.ceil(B0.w / A)), rh = Math.min(1700, Math.ceil(B0.h / A));
  const region = { x0: Math.floor(Math.max(B0.x / A, Math.min(cx - rw / 2, (B0.x + B0.w) / A - rw))), y0: Math.floor(Math.max(B0.y / A, Math.min(cy - rh / 2, (B0.y + B0.h) / A - rh))), w: rw, h: rh };
  const ground = new PixelBuffer(region.w, region.h);

  // Ways (roads, paths) as plan polylines in metres, with the distance along each (for lane dashes and ruts).
  const wayOf = w => w.points.map(p => { const v = view.toView(p.x, p.y); return [v.x, v.z]; });
  // Roads are drawn along the canonical polyline with its corners rounded (Chaikin, endpoints kept): cleaner bends,
  // same route. Paths keep their corners (they are short and meet the entrance square on).
  const chaikin = (pts, n) => { for (let k = 0; k < n; k++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; if (i > 0) o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]); if (i < pts.length - 2) o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; };
  const ways = [...Object.values(world.roads ?? {}).filter(r => r.status !== 'reserved').map(r => ({ kind: 'road', pts: chaikin(wayOf(r), 2), half: r.width / 2 })), ...Object.values(world.paths ?? {}).filter(p => p.status !== 'reserved').map(p => ({ kind: 'path', pts: wayOf(p), half: p.width / 2 }))];
  const segs = ways.flatMap(w => { let acc = 0; return w.pts.slice(1).map((b, k) => { const a = w.pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), s = { kind: w.kind, a, b, L, at: acc, half: w.half, x0: Math.min(a[0], b[0]) - w.half - 0.6, x1: Math.max(a[0], b[0]) + w.half + 0.6, z0: Math.min(a[1], b[1]) - w.half - 0.6, z1: Math.max(a[1], b[1]) + w.half + 0.6 }; acc += L; return s; }); });
  const segInfo = (s, x, z) => { const [ax, az] = s.a, [bx, bz] = s.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz), side = Math.sign(dx * (z - az) - dz * (x - ax)) || 1; return { d, lat: d * side, along: s.at + t * s.L }; };
  const segDist = (s, x, z) => segInfo(s, x, z).d;
  // The way at a point: { kind, edge (m inside the edge; negative = outside, within the verge), lat, along, half }.
  const wayAt = (x, z, verge = 0) => { let best = null; for (const s of segs) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue; const i = segInfo(s, x, z), edge = s.half - i.d; if (edge >= -verge && (!best || edge > best.edge + (s.kind === 'path' && best.kind === 'road' ? -0.3 : 0))) best = { kind: s.kind, edge, lat: i.lat, along: i.along, half: s.half }; } return best && best.edge >= 0 ? best : verge && best ? { ...best, verge: true } : null; };
  // Terrain water (canonical land), sampled in world coordinates.
  const T = terrainOf(world), waterAt = (x, z) => { const w = view.fromView(x, z), i = Math.floor(w.x / T.cell), j = Math.floor(w.y / T.cell); return i >= 0 && j >= 0 && i < T.n && j < T.n && T.heights[j * T.n + i] <= T.waterLevel; };
  // Building footprints (metres) and their entrance doors (canonical doors to the outside).
  const footprints = Object.values(world.buildings).map(b => ({ b, r: rp({ rect: b.footprint }) }));
  const bldgs = footprints.map(({ r }) => ({ x0: r.x0 / U, x1: r.x1 / U, z0: r.z0 / U, z1: r.z1 / U }));
  const entrances = Object.values(world.doors).filter(d => d.status === 'built' && (d.a === 'outside' || d.b === 'outside') && (d.level ?? 0) === 0).map(d => { const a = view.toView(d.seg.x1, d.seg.y1), c = view.toView(d.seg.x2, d.seg.y2); return { d, x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), z0: Math.min(a.z, c.z), z1: Math.max(a.z, c.z) }; });
  // The entrance forecourt: a paved pad in front of each entrance, where the path meets the building.
  const pads = entrances.map(e => ({ x0: e.x0 - 0.9, x1: e.x1 + 0.9, z0: e.z0 - 1.7, z1: e.z0 + 0.01 }));
  const inRect = (q, x, z) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1;
  const bDist = (x, z) => { let d = Infinity; for (const b of bldgs) d = Math.min(d, Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))); return d; };
  const devDist = (x, z) => { let d = bDist(x, z); for (const s of segs) d = Math.min(d, segDist(s, x, z) - s.half); for (const q of pads) d = Math.min(d, Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1))); return d; };
  // Smooth deterministic fields (value noise) for composition: clusters, clearings, meadow patches, stands.
  const vn = (x, z, salt) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz), a = noise(i, j, salt), b = noise(i + 1, j, salt), c = noise(i, j + 1, salt), d = noise(i + 1, j + 1, salt); return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz; };
  const seedSalt = [...String(world.seed ?? '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
  const cluster = (x, z) => 0.62 * vn(x / 9, z / 9, 51 + seedSalt) + 0.38 * vn(x / 3.6, z / 3.6, 52 + seedSalt);
  const meadow = (x, z) => vn(x / 6, z / 6, 53 + seedSalt);
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Floors of storey 0, in metres.
  const floors0 = roomSpaces.filter(s => s.level === 0).map(s => { const r = view.rectToView(s.rect); return { s, r, kind: kindOf(s) }; });
  // Zone rugs: under a round table (gathering), and under each room's workstation cluster (its function at a glance).
  const ZONE = { command: theme === 'fantasy' ? ['floorCarpet', 'gold'] : ['floorCarpet', 'brand'], development: theme === 'fantasy' ? ['floorConcrete', 'ember'] : ['floorConcrete', 'hardhat'], testing: theme === 'fantasy' ? ['floorCarpet2', 'crystalDeep'] : ['floorTile', 'screen'] };
  const rugs = [];
  for (const { s, r, kind } of floors0) {
    const items = furnishing[s.id].items;
    for (const it of items) if (it.type === 'roundTable') rugs.push({ x0: Math.max(r.x0 + 0.3, it.x - it.w / 2 - 0.7), x1: Math.min(r.x1 - 0.3, it.x + it.w / 2 + 0.7), z0: Math.max(r.z0 + 0.3, it.z - it.d / 2 - 0.65), z1: Math.min(r.z1 - 0.3, it.z + it.d / 2 + 0.65), fill: 'floorRug', border: theme === 'fantasy' ? 'gold' : 'floorCarpet' });
    const desks = items.filter(it => it.type === 'desk' || it.type === 'reviewConsole');
    if (ZONE[kind] && desks.length) rugs.push({ x0: Math.max(r.x0 + 0.25, Math.min(...desks.map(i => i.x - i.w / 2)) - 0.35), x1: Math.min(r.x1 - 0.25, Math.max(...desks.map(i => i.x + i.w / 2)) + 0.35), z0: Math.max(r.z0 + 0.2, Math.min(...desks.map(i => i.z - i.d / 2)) - 0.75), z1: Math.min(r.z1 - 0.2, Math.max(...desks.map(i => i.z + i.d / 2)) + 0.3), fill: ZONE[kind][0], border: ZONE[kind][1], zone: kind });
  }
  const floorColour = (f, x, z, X, Y) => {
    const pat = PATTERNS[FLOORS[theme]?.[f.kind] ?? 'concrete'] ?? PATTERNS.concrete;
    let [p, k] = pat(x, z, X, Y);
    const rug = rugs.find(q => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1);
    if (rug) {
      const b = Math.min(x - rug.x0, rug.x1 - x, z - rug.z0, rug.z1 - z);
      if (rug.zone === 'development' && theme === 'real') { if (b < 0.1) [p, k] = ((Math.floor((x + z) / 0.25)) % 2) ? ['hardhat', 2] : ['wallTop', 1]; }
      else if (rug.zone) { if (b < 0.07) [p, k] = [rug.border, theme === 'fantasy' && rug.zone === 'development' ? 1 : 2]; else if (rug.zone !== 'development') [p, k] = [rug.fill, noise(X, Y, 23) > 0.9 ? 3 : 2]; else if (noise(X, Y, 29) > 0.97) [p, k] = ['ember', 1]; }
      else [p, k] = b < 0.1 ? [rug.border, 1] : b < 0.18 ? [rug.fill, 3] : [rug.fill, noise(X, Y, 21) > 0.85 ? 3 : 2];
    }
    // Ambient occlusion along the back and left walls, and a soft edge along every wall.
    const eb = Math.min(z > f.r.z1 - 0.18 ? 0 : 1, x < f.r.x0 + 0.12 ? 0 : 1);
    if (!eb) k = Math.max(0, k - 1); else if (f.r.z1 - z < 0.32 && bayer(X, Y) > 0.5) k = Math.max(0, k - 1);
    return pal.c(p, k);
  };
  const LANDK = theme === 'fantasy', fr1 = v => v - Math.floor(v);
  const wayColour = (w, x, z, X, Y) => {
    if (w.kind === 'road') {
      if (!LANDK) {
        if (w.edge < 0.16) return pal.c('curb', w.edge < 0.05 ? 1 : 3);
        if (Math.abs(w.lat) < 0.07 && (w.along % 3) < 1.6) return pal.c('roadLine', 2);
        if (w.edge < 0.32) return pal.c('road', 1);
        const n = noise(X, Y, 13); return pal.c('road', n > 0.965 ? 3 : n < 0.03 ? 1 : 2);
      }
      // Fantasy: a worn dirt track with two wheel ruts and a grassy crown, fraying into the grass.
      if (w.edge < 0.45 && bayer(X, Y) > w.edge / 0.45) return pal.c(noise(X, Y, 71) > 0.5 ? 'grassDry' : 'grass', 1);
      const r = Math.abs(Math.abs(w.lat) - w.half * 0.5);
      if (Math.abs(w.lat) < 0.18 && noise(X >> 1, Y, 72) > 0.45) return pal.c('grassDry', 1);
      if (r < 0.13) return pal.c('road', 1);
      const n = noise(X, Y, 14); return pal.c(n > 0.975 ? 'rock' : 'road', n > 0.975 ? 3 : n > 0.9 ? 3 : n < 0.06 ? 1 : 2);
    }
    if (!LANDK) { // pavers with a darker edging course
      if (w.edge < 0.1) return pal.c('curb', 1);
      return pal.c('path', fr1(x / 0.5) < 0.07 || fr1(z / 0.5) < 0.09 ? 1 : noise(Math.floor(x / 0.5), Math.floor(z / 0.5), 74) > 0.8 ? 3 : 2);
    }
    // Fantasy: irregular flagstones set in packed earth, the edge stones sinking into grass.
    if (w.edge < 0.2 && bayer(X, Y) > w.edge / 0.2) return pal.c('grassDry', 1);
    const [p, k] = PATTERNS.pathFantasy(x, z, X, Y); return pal.c(p, k);
  };
  const padColour = (x, z, X, Y, q) => {
    const b = Math.min(x - q.x0, q.x1 - x, z - q.z0);
    if (!LANDK) return b < 0.1 ? pal.c('curb', 1) : pal.c('curb', fr1(x / 0.6) < 0.06 || fr1(z / 0.6) < 0.07 ? 2 : 3);
    const r = Math.floor(z / 0.5), c = Math.floor((x + (r & 1) * 0.35) / 0.7), g = fr1((x + (r & 1) * 0.35) / 0.7) < 0.08 || fr1(z / 0.5) < 0.1;
    return b < 0.12 && bayer(X, Y) > 0.4 ? pal.c('grassDry', 1) : pal.c('floorTile', g ? 0 : noise(r, c, 75) > 0.55 ? 3 : 2);
  };
  // Land: meadow and forest floor from the cluster field; dry patches dithered at their borders; sparse tufts; wear
  // beside the ways; a gravel or rubble strip along the building (its base meeting the ground).
  const landColour = (x, z, X, Y) => {
    const near = bDist(x, z);
    if (near < 0.45) return LANDK ? pal.c(noise(X, Y, 81) > 0.6 ? 'rock' : 'soil', noise(X, Y, 82) > 0.8 ? 1 : 2) : pal.c('gravel', noise(X, Y, 83) > 0.7 ? 3 : noise(X, Y, 84) > 0.8 ? 1 : 2);
    const w = wayAt(x, z, 0.6);
    if (w?.verge && bayer(X, Y) * 0.6 > -w.edge * 0.9 && noise(X, Y, 85) > 0.35) return pal.c('soilDry', noise(X, Y, 86) > 0.7 ? 1 : 2);
    const cl = cluster(x, z), forest = cl > 0.56 && devDist(x, z) > 4.5, m = meadow(x, z);
    let p = 'grass', k = 2;
    if (forest) { p = 'grassDark'; k = cl > 0.66 ? 1 : 2; if (noise(X, Y, 87) > 0.94) [p, k] = [LANDK ? 'soil' : 'grassDark', LANDK ? 1 : 0]; }
    else if (m > 0.6 || (m > 0.55 && bayer(X, Y) < (m - 0.55) / 0.05)) p = 'grassDry';
    const tuft = noise(X, Y, 11);
    if (tuft > 0.988) k = Math.min(4, k + 1); else if (noise(X, Y - 1, 11) > 0.988) k = Math.max(0, k - 1);
    return pal.c(p, k);
  };
  for (let Y = 0; Y < region.h; Y++) for (let X = 0; X < region.w; X++) {
    const sx = (region.x0 + X + 0.5) * A, sy = (region.y0 + Y + 0.5) * A, [px, pz] = P.plan(sx, sy, 0), x = px / U, z = pz / U, GX = X + region.x0, GY = Y + region.y0;
    const f = floors0.find(q => x >= q.r.x0 && x < q.r.x1 && z >= q.r.z0 && z < q.r.z1);
    let c;
    if (f) c = floorColour(f, x, z, GX, GY);
    else {
      const q = pads.find(q2 => inRect(q2, x, z)), w = q ? null : wayAt(x, z);
      if (q) c = padColour(x, z, GX, GY, q);
      else if (w) c = wayColour(w, x, z, GX, GY);
      else if (waterAt(x, z)) c = pal.c('water', noise(GX >> 1, GY, 31) > 0.85 ? 3 : 2);
      else c = landColour(x, z, GX, GY);
    }
    ground.data[Y * region.w + X] = c;
  }
  // Doormats inside each entrance.
  for (const e of entrances) { const m = [Q((e.x0 + 0.15) * U, (e.z0 + 0.15) * U, 0, 0), Q((e.x1 - 0.15) * U, (e.z0 + 0.15) * U, 0, 0), Q((e.x1 - 0.15) * U, (e.z0 + 0.75) * U, 0, 0), Q((e.x0 + 0.15) * U, (e.z0 + 0.75) * U, 0, 0)]; ground.poly(m.map(([x, y]) => [x - region.x0, y - region.y0]), pal.c(LANDK ? 'banner' : 'wallTop', LANDK ? 1 : 2)); }
  // Contact shadows under furniture (storey 0) and a soft shadow along the outside of the building's walls.
  const shadowPoly = (pts, k = 0.78) => ground.poly(pts.map(([x, y]) => [x - region.x0, y - region.y0]), null, (x, y) => scale(ground.get(x, y), k));
  for (const { s } of floors0) for (const it of furnishing[s.id].items) {
    if (!it.solid && !SEATS.has(it.type)) continue;
    const x0 = (it.x - it.w / 2 - 0.04) * U, x1 = (it.x + it.w / 2 + 0.06) * U, z0 = (it.z - it.d / 2 - 0.06) * U, z1 = (it.z + it.d / 2) * U;
    shadowPoly([Q(x0, z0, 0, 0), Q(x1, z0, 0, 0), Q(x1, z1, 0, 0), Q(x0, z1, 0, 0)], 0.72);
  }
  for (const { r } of footprints) { const o = 0.55 * U; shadowPoly([Q(r.x1, r.z0 - o * 0.3, 0, 0), Q(r.x1 + o, r.z0 - o * 0.3, 0, 0), Q(r.x1 + o, r.z1, 0, 0), Q(r.x1, r.z1, 0, 0)], 0.8); shadowPoly([Q(r.x0 - o * 0.4, r.z0 - o * 0.5, 0, 0), Q(r.x1 + o, r.z0 - o * 0.5, 0, 0), Q(r.x1 + o, r.z0, 0, 0), Q(r.x0 - o * 0.4, r.z0, 0, 0)], 0.86); }
  // ---- Objects. ----
  const objects = [], emitters = [];
  const addObject = (o) => { objects.push(o); return o; };
  // Rasterizes boxes, faces, blobs into sprite frames. Boxes are in plan units with h in units, on floor f.
  function spriteOf(parts, f, { outline = true, frames = 1, alt = null } = {}) {
    const main = rasterize(parts, f, outline, frames, null); if (!main) return null;
    // An alternative rendering with materials remapped (screens off), for state-driven pieces.
    if (alt) { const o = rasterize(parts, f, outline, 1, alt); main.altFrames = o.frames; main.altMasks = o.masks; }
    return main;
  }
  function rasterize(parts, f, outline, frames, remap) {
    const mat = (m, ...a) => mat0(remap?.[m] ?? m, ...a);
    const pts = [];
    for (const p of parts) {
      if (p.box) { const b = p.box; for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const h of [b.h0, b.h1]) pts.push(Q(x, z, f, h)); }
      if (p.blob) { const [bx, by] = Q(p.blob.x, p.blob.z, f, p.blob.h); pts.push([bx - p.blob.rx - 2, by - p.blob.ry - 2], [bx + p.blob.rx + 2, by + p.blob.ry + 2]); }
      if (p.quad) pts.push(...p.quad);
    }
    if (!pts.length) return null;
    const ox = Math.floor(Math.min(...pts.map(q => q[0]))) - 2, oy = Math.floor(Math.min(...pts.map(q => q[1]))) - 2;
    const w = Math.ceil(Math.max(...pts.map(q => q[0]))) - ox + 3, h = Math.ceil(Math.max(...pts.map(q => q[1]))) - oy + 3;
    const out = [], masks = [];
    for (let fr = 0; fr < frames; fr++) {
      const buf = new PixelBuffer(w, h), em = new Uint8Array(w * h);
      const fill = (poly, shader) => buf.poly(poly.map(([x, y]) => [x - ox, y - oy]), null, (x, y) => { const r = shader(x + ox, y + oy); if (r?.e) em[y * w + x] = 1; return r?.c ?? 0; });
      for (const p of parts) {
        if (p.box) {
          const b = p.box, q = (x, z, hh) => Q(x, z, f, hh), m = p.mat;
          const right = [q(b.x1, b.z0, b.h0), q(b.x1, b.z1, b.h0), q(b.x1, b.z1, b.h1), q(b.x1, b.z0, b.h1)];
          const front = [q(b.x0, b.z0, b.h0), q(b.x1, b.z0, b.h0), q(b.x1, b.z0, b.h1), q(b.x0, b.z0, b.h1)];
          const top = [q(b.x0, b.z0, b.h1), q(b.x1, b.z0, b.h1), q(b.x1, b.z1, b.h1), q(b.x0, b.z1, b.h1)];
          const sh = p.shader;
          fill(right, (X, Y) => (sh ? sh('right', X, Y, fr) : mat(m, -1, fr, X, Y)));
          fill(front, (X, Y) => (sh ? sh('front', X, Y, fr) : mat(m, 0, fr, X, Y)));
          if (b.h1 - b.h0 > 0.01 || p.topAlways) fill(top, (X, Y) => (sh ? sh('top', X, Y, fr) : mat(m, 1, fr, X, Y)));
          for (const d of p.faces ?? []) {
            const [fc, a0, a1, b0, b1, dm] = d, lerp = (a, c, t) => a + (c - a) * t;
            let quad;
            if (fc === 'front') quad = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, c]) => q(lerp(b.x0, b.x1, a), b.z0 - 0.3, lerp(b.h0, b.h1, c)));
            else if (fc === 'top') quad = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, c]) => q(lerp(b.x0, b.x1, a), lerp(b.z0, b.z1, c), b.h1 + 0.2));
            else quad = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, c]) => q(b.x1 + 0.3, lerp(b.z0, b.z1, a), lerp(b.h0, b.h1, c)));
            fill(quad, (X, Y) => mat(dm, fc === 'right' ? -1 : fc === 'top' ? 1 : 0, fr, X, Y));
          }
        }
        if (p.blob) {
          const [bx, by] = Q(p.blob.x, p.blob.z, f, p.blob.h), sway = mat(p.mat).e ? 0 : (MATERIALS[theme]?.[p.mat]?.anim === 'sway' ? [0, 0, 1, 0][(fr + (p.phase ?? 0)) % 4] : 0);
          for (let y = -p.blob.ry; y <= p.blob.ry; y++) for (let x = -p.blob.rx; x <= p.blob.rx; x++) {
            const t = (x * x) / (p.blob.rx * p.blob.rx + 0.5) + (y * y) / (p.blob.ry * p.blob.ry + 0.5); if (t > 1) continue;
            const X = Math.round(bx + x + sway), Y = Math.round(by + y), shade = y < -p.blob.ry * 0.3 && x < 0 ? 1 : y > p.blob.ry * 0.3 ? -1 : 0, r = mat(p.mat, shade + (p.k ?? 0), fr, X, Y);
            buf.set(X - ox, Y - oy, r.c); if (r.e) em[(Y - oy) * w + X - ox] = 1;
          }
        }
        if (p.quad) fill(p.quad, (X, Y) => (p.shader ? p.shader(X, Y, fr) : mat(p.mat, 0, fr, X, Y)));
      }
      let fb = buf;
      if (outline) { fb = buf.outlined({ dark: 0.3, bottom: 0.22 }); const em2 = new Uint8Array(fb.w * fb.h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) em2[(y + 1) * fb.w + x + 1] = em[y * w + x]; masks.push(em2); }
      else masks.push(em);
      out.push(fb);
    }
    return { frames: out, masks, ox: outline ? ox - 1 : ox, oy: outline ? oy - 1 : oy };
  }
  const sbOf = (sp) => ({ l: sp.ox, r: sp.ox + sp.frames[0].w, t: sp.oy, b: sp.oy + sp.frames[0].h });
  const animated = parts => parts.some(p => { const m = MATERIALS[theme]?.[p.mat]; return m?.anim || (p.faces ?? []).some(d => MATERIALS[theme]?.[d[6]]?.anim); });
  const emit = (x, z, f, h, kind, extra = {}) => { const [ex, ey] = Q(x, z, f, h); emitters.push({ x: Math.round(ex), y: Math.round(ey), kind, floor: f, ...extra }); };

  // Props: every furnishing item by its recipe (rotated to its facing).
  const ROT = {
    front: (u, v, w, d) => [u * w, v * d], back: (u, v, w, d) => [-u * w, -v * d],
    right: (u, v, w, d) => [-v * w, u * d], left: (u, v, w, d) => [v * w, -u * d],
  };
  const FACE_ROT = { front: { front: 'front', top: 'top', right: 'right' }, back: { front: 'front', top: 'top', right: 'right' }, right: { front: 'right', top: 'top', right: 'front' }, left: { front: 'front', top: 'top', right: 'right' } };
  function recipeParts(recipe, it, f, phase) {
    const rot = ROT[it.facing] ?? ROT.front, fr = FACE_ROT[it.facing] ?? FACE_ROT.front, parts = [], cx2 = it.x * U, cz2 = it.z * U;
    let last = null;
    for (const r of recipe) {
      if (r[0] === 'box') {
        const [, u0, u1, v0, v1, h0, h1, m] = r, a = rot(u0, v0, it.w, it.d), b = rot(u1, v1, it.w, it.d);
        last = { box: { x0: cx2 + Math.min(a[0], b[0]) * U, x1: cx2 + Math.max(a[0], b[0]) * U, z0: cz2 + Math.min(a[1], b[1]) * U, z1: cz2 + Math.max(a[1], b[1]) * U, h0: h0 * U, h1: h1 * U }, mat: m, faces: [], v0, v1, back: v0 >= 0.25 };
        parts.push(last);
      } else if (r[0] === 'face' && last) last.faces.push([fr[r[1]] ?? r[1], r[2], r[3], r[4], r[5], r[6], r[6]]);
      else if (r[0] === 'blob') { const [, u, v, h, rx, ry, m] = r, o = rot(u, v, it.w, it.d); parts.push({ blob: { x: cx2 + o[0] * U, z: cz2 + o[1] * U, h: h * U, rx, ry }, mat: m, phase }); }
      else if (r[0] === 'light') { const [, u, v, h, kind] = r, o = rot(u, v, it.w, it.d); parts.push({ light: { x: cx2 + o[0] * U, z: cz2 + o[1] * U, h: h * U, kind } }); }
    }
    return parts;
  }
  function placeRecipe(recipe, it, f, { id, room, seat = false, locId = null }) {
    const phase = Math.floor(noise(Math.round(it.x * 10), Math.round(it.z * 10), 9) * 4);
    const parts = recipeParts(recipe, it, f, phase);
    for (const p of parts.filter(q => q.light)) emit(p.light.x, p.light.z, f, p.light.h, p.light.kind, { phase, id, locId, ...(p.light.kind === 'screen' ? { room } : {}) });
    // A seat splits into its back and the rest, so a sitting character is drawn between them.
    const groups = seat ? [parts.filter(p => !p.light && !p.back), parts.filter(p => !p.light && p.back)] : [parts.filter(p => !p.light)];
    groups.forEach((g, gi) => {
      if (!g.length) return;
      const scr = g.some(p => p.mat === 'screen' || (p.faces ?? []).some(d => d[5] === 'screen'));
      const frames = animated(g) ? FRAMES : 1, sp = spriteOf(g, f, { frames, alt: scr ? SCREEN_OFF : null }); if (!sp) return;
      const boxes = g.filter(p => p.box).map(p => p.box), blobs = g.filter(p => p.blob).map(p => p.blob);
      const bx = [...boxes.flatMap(b => [b.x0, b.x1]), ...blobs.map(b => b.x)], bz = [...boxes.flatMap(b => [b.z0, b.z1]), ...blobs.map(b => b.z)];
      addObject({ id: `${id}${gi ? ':back' : ''}`, kind: 'prop', floor: f, room, locId, x0: Math.min(...bx), x1: Math.max(...bx), z0: Math.min(...bz), z1: Math.max(...bz), sb: sbOf(sp), ...sp, fps: frames > 1 ? 6 : 0, phase, screens: scr });
    });
  }
  for (const s of roomSpaces) {
    const F = furnishing[s.id], f = s.level, kind = F.kind;
    for (const it of F.items) {
      if (it.type === 'rug' || it.type === 'mat') continue;
      const recipe = recipeFor(theme, it.type, kind); if (!recipe?.length) continue;
      // Pieces standing on another piece sit on its surface (coffee machine on the counter).
      const base = it.on ? F.items.find(o => o.id === it.on) : null, lift = base ? recipeTop(theme, base.type, kind) : 0;
      const rec = lift ? recipe.map(r => (r[0] === 'box' ? [r[0], r[1], r[2], r[3], r[4], r[5] + lift, r[6] + lift, r[7]] : r[0] === 'blob' || r[0] === 'light' ? [r[0], r[1], r[2], r[3] + lift, ...r.slice(4)] : r)) : recipe;
      placeRecipe(rec, base ? { ...it, z: base.z - base.d / 2 + it.d / 2 + 0.02 } : it, f, { id: it.id, room: s.id, seat: SEATS.has(it.type), locId: locOf[s.id] });
    }
  }

  // ---- Architecture: walls with mass (thickness, a dark cut cap, exterior faces), corners, columns or towers,
  // windows and door frames, the entrance, a plinth. Everything is generated from the canonical spaces, doors and
  // footprints by rules; Fantasy translates the same lines into a towered stone outpost.
  const FANT = theme === 'fantasy';
  const walls = [];
  for (const f of layout.levels) walls.push(...wallsOf(f).map(w => ({ ...w, f })));
  const outerLine = w => footprints.some(({ r }) => (w.axis === 'z' ? (Math.abs(r.z1 - w.at) < 4 || Math.abs(r.z0 - w.at) < 4) : (Math.abs(r.x0 - w.at) < 4 || Math.abs(r.x1 - w.at) < 4)));
  // Plane coordinates (metres) of a pixel on a box face: along the face, height above the floor, and z/x on top.
  const planeOf = (b, f, fc, X, Y) => {
    const sx = (X + 0.5) * A, sy = (Y + 0.5) * A, base = P.baseOf(f);
    if (fc === 'right') { const z = (sx - b.x1) / P.g.skx; return { u: z / U, h: (base - z * P.g.sky - sy) / U }; }
    if (fc === 'front') { const z = b.z0; return { u: (sx - z * P.g.skx) / U, h: (base - z * P.g.sky - sy) / U }; }
    const z = (base - b.h1 - sy) / P.g.sky; return { u: (sx - z * P.g.skx) / U, z: z / U, h: b.h1 / U };
  };
  const C = (name, k, e = false) => ({ c: pal.c(name, Math.max(0, Math.min(4, k))), e });
  // Masonry: coursed blocks, mortar, per-block shade (Fantasy). Panels with reveals (Real).
  const ashlar = (u, h, salt, course = 0.36, blockW = 0.62, base = 'exterior', shade = 0) => {
    const row = Math.floor(h / course), uu = u + (row & 1) * blockW / 2, col = Math.floor(uu / blockW), mortar = fr1(h / course) < 0.13 || fr1(uu / blockW) < 0.07, n = noise(row, col, salt);
    return C(base, mortar ? 0 + shade : (n > 0.72 ? 3 : n > 0.3 ? 2 : 1) + shade);
  };
  const roomKindAlong = (w, along) => {
    const s = roomSpaces.find(q => q.level === w.f && (() => { const r = rp(q); if (w.axis === 'z') return Math.abs(r.z1 - w.at) < 1 && r.x0 / U <= along && r.x1 / U >= along; return Math.abs(r.x0 - w.at) < 1 && r.z0 / U <= along && r.z1 / U >= along; })());
    return s ? kindOf(s) : 'passage';
  };
  // The visible face of each wall type and what it shows.
  const FACE_SIDE = { back: 'interior', left: 'interior', front: 'exterior', right: 'exterior', low: 'partition', partition: 'partition' };
  function wallShader(w) {
    const b = w.box, primary = w.type === 'left' || w.type === 'right' || w.type === 'partition' ? 'right' : 'front', topH = w.h1 / U;
    return (fc, X, Y) => {
      const q = planeOf(b, w.f, fc, X, Y);
      if (fc === 'top') return capColour(w, q, X, Y);
      const side = fc === primary ? FACE_SIDE[w.type] : 'end', u = q.u, h = q.h;
      if (h > topH - 0.05) return C(FANT ? 'wallTop' : 'cap', FANT ? 1 : 2); // the cut edge under the cap
      if (side === 'end') return FANT ? ashlar(u, h, 7, 0.36, 0.62, 'exterior', -1) : C(w.type === 'back' || w.type === 'left' ? 'wallSide' : 'exteriorSide', 1);
      if (side === 'exterior') {
        if (FANT) { if (h < 0.18) return C('base', noise(X, Y, 91) > 0.75 ? 1 : 2); const m = h < 0.4 && noise(X, Y, 92) > 0.86; return m ? C('moss', 2) : ashlar(u, h, 7); }
        if (h < 0.14) return C('base', 1);
        return C('exterior', fr1(u / 1.5) < 0.025 || Math.abs(h - 0.45) < 0.025 ? 1 : noise(Math.floor(u / 1.5), Math.floor(h / 0.45), 93) > 0.6 ? 3 : 2);
      }
      if (side === 'partition') {
        if (FANT) { // stone footing, then a timber rail on posts (open between)
          if (h < 0.45) return ashlar(u, h, 8, 0.22, 0.4, 'wall');
          const post = fr1(u / 0.9) < 0.12, rail = h > topH - 0.14 || Math.abs(h - 0.8) < 0.05;
          return post || rail ? C('woodDark', rail ? 2 : 1) : null;
        }
        if (h < 0.5) return C('wallSide', h < 0.08 ? 1 : 2);
        const mull = fr1(u / 1.2) < 0.05 || h > topH - 0.08 || Math.abs(h - 0.5) < 0.04;
        if (mull) return C('frame', 2);
        // Clear glass: mostly see-through, with a sparse sheen and two diagonal glints per pane (no fence pattern).
        const pu = fr1(u / 1.2), glint = Math.abs(pu - (h - 0.5) * 0.35 - 0.3) < 0.035 || Math.abs(pu - (h - 0.5) * 0.35 - 0.42) < 0.018;
        return glint ? C('glass', 4) : (X + 3 * Y) % 9 === 0 ? C('glass', 3) : null;
      }
      // Interior faces of the full-height outer walls.
      const kind = roomKindAlong(w, u);
      if (FANT) {
        if (h < 0.12) return C('woodDark', 1);
        const beam = Math.abs(h - 2.35) < 0.08, postU = fr1(u / 2.2) < 0.06 && h > 0.12;
        if (beam || postU) return C('woodDark', beam ? 2 : 1);
        if ((kind === 'lounge' || kind === 'comms' || kind === 'command') && h < 1.0) return C('wood', fr1(u / 0.18) < 0.15 ? 1 : 2);
        return ashlar(u, h, 9, 0.3, 0.5, 'wall');
      }
      if (h < 0.1) return C('wallTrim', 1);
      if (h > topH - 0.12) return C('wall', 1);
      if ((kind === 'development' || kind === 'command') && h > 0.95 && h < 1.05) return C(kind === 'development' ? 'hivis' : 'brand', 2);
      if ((kind === 'lounge' || kind === 'comms') && h < 1.0) return C('wood', fr1(u / 0.12) < 0.25 ? 1 : 3);
      if (kind === 'servers') return C('metalDark', fr1(u / 0.4) < 0.08 ? 0 : 1);
      return C('wall', 2);
    };
  }
  function capColour(w, q, X, Y) {
    const b = w.box, edge = q.z !== undefined && (q.z * U - b.z0 < 1.4);
    if (FANT) return C('wallTop', edge ? 3 : (fr1(q.u / 0.5) < 0.08 ? 1 : 2));
    return C('cap', edge ? 3 : 1);
  }
  // Openings blocked for windows: decor, tall pieces against the wall, doors, corners and junctions.
  const tallNear = [];
  for (const s of roomSpaces) for (const it of furnishing[s.id].items) { const top = recipeTop2(theme, it.type, furnishing[s.id].kind); if (top > 1.25) tallNear.push({ x0: it.x - it.w / 2, x1: it.x + it.w / 2, z0: it.z - it.d / 2, z1: it.z + it.d / 2 }); }
  const decorAt = roomSpaces.flatMap(s => furnishing[s.id].decor.map(d => ({ f: s.level, z: rp(s).z1, x0: d.x0, x1: d.x1 })));
  const junctions = [];
  for (const w of walls) if (w.type === 'partition' || w.type === 'low') {
    for (const o of walls) if ((o.type === 'back' || o.type === 'left') && o.f === w.f && o.axis !== w.axis) {
      if (w.axis === 'x' && o.axis === 'z' && w.at >= o.s - 1 && w.at <= o.e + 1 && (Math.abs(w.e - o.at) < 1 || Math.abs(w.s - o.at) < 1)) junctions.push({ f: w.f, axis: 'z', at: o.at, pos: w.at });
      if (w.axis === 'z' && o.axis === 'x' && w.at >= o.s - 1 && w.at <= o.e + 1 && (Math.abs(w.s - o.at) < 1 || Math.abs(w.e - o.at) < 1)) junctions.push({ f: w.f, axis: 'x', at: o.at, pos: w.at });
    }
  }
  const uniqJ = [...new Map(junctions.map(j => [`${j.f}:${j.axis}:${Math.round(j.at)}:${Math.round(j.pos)}`, j])).values()];
  const windowBays = (w) => {
    const L = (w.e - w.s) / U, bw = FANT ? 0.55 : 1.05, gap = FANT ? 1.9 : 1.55, out = [];
    const blocked = (c) => {
      const lo = (c - bw / 2 - 0.25) * U, hi = (c + bw / 2 + 0.25) * U;
      if (lo < w.s + 0.55 * U || hi > w.e - 0.55 * U) return true;
      if ((w.doors ?? []).some(d => d.e > lo && d.s < hi)) return true;
      if (uniqJ.some(j => j.f === w.f && j.axis === w.axis && Math.abs(j.at - w.at) < 1 && j.pos > lo - 0.3 * U && j.pos < hi + 0.3 * U)) return true;
      if (w.axis === 'z' && decorAt.some(d => d.f === w.f && Math.abs(d.z - w.at) < 1 && d.x1 * U > lo && d.x0 * U < hi)) return true;
      const near = w.axis === 'z' ? tallNear.some(t => t.z1 * U > w.at - 0.9 * U && t.x1 * U > lo && t.x0 * U < hi) : tallNear.some(t => t.x0 * U < w.at + 0.9 * U && t.z1 * U > lo && t.z0 * U < hi);
      return near;
    };
    for (let c = 0.6 + bw / 2; c <= L - 0.6 - bw / 2 + 1e-6; c += 0.1) { const cc = w.s / U + c; if (!blocked(cc) && !out.some(o => Math.abs(o - cc) < bw + gap)) out.push(cc); }
    return out;
  };
  const windowsOn = new Map();
  for (const w of walls) {
    const b = w.box, f = w.f, outer = outerLine(w);
    const parts = [{ box: { ...b, h0: w.h0, h1: w.h1 }, shader: w.archOver ? archShader(w) : wallShader(w), topAlways: true }];
    // Windows on full-height outer walls, in clear bays.
    if ((w.type === 'back' || w.type === 'left') && !w.h0 && outer) {
      const bays = windowBays(w); windowsOn.set(w, bays);
      for (const c of bays) parts.push(...windowParts(w, c));
    }
    const sp = spriteOf(parts, f, { outline: false }); if (!sp) continue;
    addObject({ id: `wall:${f}:${w.axis}:${w.at}:${w.s}:${w.h0}`, kind: 'wall', floor: f, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, bias: w.h0 > 0 ? -1 : 0, sb: sbOf(sp), ...sp, fps: 0 });
    // Fantasy: crenellations on every outer wall's top (a parapet on the low front and right walls).
    if (FANT && outer && !w.h0 && w.type !== 'low' && w.type !== 'partition') {
      const step = 0.62 * U, mh = (w.type === 'back' || w.type === 'left' ? 0.34 : 0.22) * U, merl = [];
      for (let a = w.s + step * 0.15; a + step * 0.45 <= w.e; a += step) merl.push(w.axis === 'z' ? { box: { x0: a, x1: Math.min(w.e, a + step * 0.55), z0: b.z0, z1: b.z1, h0: w.h1, h1: w.h1 + mh }, mat: 'cap' } : { box: { x0: b.x0, x1: b.x1, z0: a, z1: Math.min(w.e, a + step * 0.55), h0: w.h1, h1: w.h1 + mh }, mat: 'cap' });
      const ms = spriteOf(merl, f, { outline: true }); if (ms) addObject({ id: `merlons:${f}:${w.axis}:${w.at}:${w.s}`, kind: 'wall', floor: f, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, bias: w.type === 'front' || w.type === 'right' ? 0 : -1, sb: sbOf(ms), ...ms, fps: 0 });
    }
    // Real: a coping on the full-height outer walls (the roof line, read in section).
    if (!FANT && outer && !w.h0 && (w.type === 'back' || w.type === 'left')) {
      const o = 0.05 * U, cop = { box: w.axis === 'z' ? { x0: b.x0, x1: b.x1, z0: b.z0 - o, z1: b.z1 + o, h0: w.h1, h1: w.h1 + 0.1 * U } : { x0: b.x0 - o, x1: b.x1 + o, z0: b.z0, z1: b.z1, h0: w.h1, h1: w.h1 + 0.1 * U }, mat: 'cap' };
      const cs = spriteOf([cop], f, { outline: false }); if (cs) addObject({ id: `coping:${f}:${w.axis}:${w.at}:${w.s}`, kind: 'wall', floor: f, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, bias: -1, sb: sbOf(cs), ...cs, fps: 0 });
    }
  }
  function windowParts(w, c) {
    const b = w.box, f = w.f, half = (FANT ? 0.27 : 0.52) * U, h0 = (FANT ? 1.05 : 0.85) * U, h1 = (FANT ? 2.2 : 2.45) * U, cc = c * U;
    const plane = (a, h) => (w.axis === 'z' ? Q(a, b.z0 - 0.4, f, h) : Q(b.x1 + 0.4, a, f, h));
    const quad = [plane(cc - half, h0), plane(cc + half, h0), plane(cc + half, h1 + (FANT ? half : 0)), plane(cc - half, h1 + (FANT ? half : 0))];
    const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
    const shader = (X, Y) => {
      // Local coordinates: a in -1..1 across, t in 0..1 up (screen-space approximation of the wall plane).
      const yb = w.axis === 'z' ? quad[0][1] : quad[0][1] + (X - quad[0][0]) * (quad[1][1] - quad[0][1]) / ((quad[1][0] - quad[0][0]) || 1);
      const a = ((X + 0.5) - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)) * 2 - 1, up = (yb - (Y + 0.5)) * A / U, H = (h1 - h0) / U;
      if (FANT) {
        const r = half / U, top = H; // arch: semicircle above the straight part
        const inArch = up <= top || (up - top) ** 2 / (r * r) + a * a <= 1;
        if (!inArch) return null;
        const ring = up > top && (up - top) ** 2 / (r * r) + a * a > 0.55, rim = Math.abs(a) > 0.72 || up < 0.08;
        if (ring || rim) return C('wallTop', 3);
        const lead = Math.abs(fr1((a * 3 + up * 4) % 1 + 1) - 0.5) < 0.09 || Math.abs(fr1((a * 3 - up * 4) % 1 + 1) - 0.5) < 0.09;
        return C('glassNight', lead ? 0 : up > top * 0.8 ? 3 : 2);
      }
      if (Math.abs(a) > 0.86 || up < 0.06 || up > H - 0.07) return C('frame', 1);
      if (Math.abs(a) < 0.06) return C('frame', 2);
      if (up < 0.1 && Math.abs(a) <= 0.86) return C('frame', 1);
      if (a < -0.66 || up > H - 0.18) return C('glass', 1); // reveal: the window's depth in shadow
      const glint = Math.abs((a * 0.8 + up / H) - 0.9) < 0.07;
      return C('glass', glint ? 4 : up > H * 0.6 ? 3 : 2);
    };
    const sill = w.axis === 'z' ? { box: { x0: cc - half - 0.06 * U, x1: cc + half + 0.06 * U, z0: b.z0 - 0.12 * U, z1: b.z0, h0: h0 - 0.06 * U, h1: h0 }, mat: FANT ? 'cap' : 'concrete' } : null;
    return [{ quad, shader }, ...(sill ? [sill] : [])];
  }
  // Header over a door in a full-height wall. Fantasy: a round arch with a ring of voussoirs.
  function archShader(w) {
    const base = wallShader(w), b = w.box, mid = (b.x0 + b.x1) / 2 / U, midZ = (b.z0 + b.z1) / 2 / U, half = (w.axis === 'z' ? b.x1 - b.x0 : b.z1 - b.z0) / 2 / U, spring = w.h0 / U + w.rise;
    return (fc, X, Y) => {
      if (fc === 'top') return base(fc, X, Y);
      const q = planeOf(b, w.f, fc, X, Y), a = (q.u - (w.axis === 'z' ? mid : midZ)) / half, up = q.h - spring;
      if (up < 0 && Math.abs(a) < 1) { const inside = up * up / (w.rise * w.rise) + a * a < 1; if (inside) { const ring = up * up / (w.rise * w.rise) + a * a > 0.62; return ring ? C('wallTop', Math.abs(a) < 0.15 ? 4 : 3) : null; } }
      return base(fc, X, Y);
    };
  }
  // Door frames on every legitimate interior door (jambs; the entrance gets its own treatment below).
  for (const w of walls) for (const d of (w.doors ?? [])) {
    if (d.kind === 'opening' || d.outside || w.h0) continue;
    const full = w.type === 'back' || w.type === 'left', jh = full ? d.h : w.h1 + (FANT ? 0.38 : 0.22) * U, tw = (FANT ? 0.14 : 0.08) * U;
    for (const [k, p] of [[0, d.s], [1, d.e]]) {
      const box = w.axis === 'z' ? { x0: k ? p : p - tw, x1: k ? p + tw : p, z0: w.box.z0 - 1, z1: w.box.z1 + 1, h0: 0, h1: jh } : { x0: w.box.x0 - 1, x1: w.box.x1 + 1, z0: k ? p : p - tw, z1: k ? p + tw : p, h0: 0, h1: jh };
      const sp = spriteOf([{ box, mat: FANT ? 'woodDark' : 'frame' }], w.f, { outline: false });
      addObject({ id: `jamb:${w.f}:${w.axis}:${w.at}:${Math.round(p)}`, kind: 'wall', floor: w.f, ...box, bias: 1, sb: sbOf(sp), ...sp, fps: 0 });
    }
  }
  // Columns (Real) and pilasters (Fantasy) where interior walls meet the outer walls; corners per footprint.
  for (const j of uniqJ) {
    const s = 0.2 * U, box = j.axis === 'z' ? { x0: j.pos - s, x1: j.pos + s, z0: j.at - (FANT ? 0.16 : 0.08) * U, z1: j.at + 0.38 * U, h0: 0, h1: HT + (FANT ? 0 : 0.1 * U) } : { x0: j.at - 0.38 * U, x1: j.at + (FANT ? 0.16 : 0.08) * U, z0: j.pos - s, z1: j.pos + s, h0: 0, h1: HT + (FANT ? 0 : 0.1 * U) };
    const sh = (fc, X, Y) => { const q = planeOf(box, j.f, fc, X, Y); if (fc === 'top') return C(FANT ? 'wallTop' : 'cap', FANT ? 3 : 2); return FANT ? ashlar(q.u, q.h, 13, 0.36, 0.42, 'column', fc === 'right' ? -1 : 0) : C('column', fc === 'right' ? 1 : (q.h < 0.1 ? 1 : 2)); };
    const sp = spriteOf([{ box, shader: sh, topAlways: true }], j.f, { outline: false });
    addObject({ id: `column:${j.f}:${j.axis}:${Math.round(j.at)}:${Math.round(j.pos)}`, kind: 'wall', floor: j.f, ...box, bias: 1, sb: sbOf(sp), ...sp, fps: 0 });
  }
  const tw0 = 0.38 * U, tf0 = 0.3 * U; // outer wall thicknesses (back/left, front/right)
  for (const { b: bd, r } of footprints) {
    // Plinth: the building's base course along its visible front and right sides.
    const ph = (FANT ? 0.24 : 0.14) * U, po = 0.12 * U;
    for (const [k, box] of [[0, { x0: r.x0 - tw0 - po, x1: r.x1 + tf0 + po, z0: r.z0 - tf0 - po, z1: r.z0 - tf0, h0: 0, h1: ph }], [1, { x0: r.x1 + tf0, x1: r.x1 + tf0 + po, z0: r.z0 - tf0 - po, z1: r.z1 + tw0, h0: 0, h1: ph }]]) {
      const sh = (fc, X, Y) => { const q = planeOf(box, 0, fc, X, Y); if (fc === 'top') return C(FANT ? 'base' : 'cap', FANT ? 3 : 2); return FANT ? ashlar(q.u, q.h, 15, 0.12, 0.5, 'base', fc === 'right' ? -1 : 0) : C('base', fc === 'right' ? 1 : 2); };
      const sp = spriteOf([{ box, shader: sh, topAlways: true }], 0, { outline: false });
      addObject({ id: `plinth:${bd.id}:${k}`, kind: 'wall', floor: 0, ...box, bias: -2, sb: sbOf(sp), ...sp, fps: 0 });
    }
    const corners = [['bl', r.x0 - tw0, r.z1 + tw0], ['br', r.x1 + tf0, r.z1 + tw0], ['fl', r.x0 - tw0, r.z0 - tf0], ['fr', r.x1 + tf0, r.z0 - tf0]];
    for (const [id, cx0, cz0] of corners) {
      const back = id[0] === 'b', left = id[1] === 'l';
      if (!FANT) {
        // Real: a dark steel column at the back corners (full height, the frame of the cutaway); at the front a
        // concrete corner flush with the low wall (no lamp: exterior lighting stays restrained).
        const s = (back ? 0.22 : 0.2) * U, box = { x0: cx0 - s, x1: cx0 + s, z0: cz0 - s, z1: cz0 + s, h0: 0, h1: back ? HT + 0.12 * U : LOW + 0.08 * U };
        const parts = [{ box, mat: back ? 'column' : 'concrete' }];
        const sp = spriteOf(parts, 0, { outline: back });
        addObject({ id: `corner:${bd.id}:${id}`, kind: 'wall', floor: 0, ...box, bias: back ? -1 : 0, sb: sbOf(sp), ...sp, fps: 0, phase: 0 });
        continue;
      }
      // Fantasy: towers at the back corners (one with a slate roof, one crenellated with a banner), squat turrets in
      // front. Rule: by corner, never by world.
      const s = (back ? 0.95 : 0.7) * U, H = back ? HT * 1.75 : (LOW / U + 0.95) * U;
      const box = { x0: cx0 - s, x1: cx0 + s, z0: cz0 - s, z1: cz0 + s, h0: 0, h1: H };
      const sh = (fc, X, Y) => { const q = planeOf(box, 0, fc, X, Y); if (fc === 'top') return C('wallTop', 2); if (q.h < 0.25) return C('base', 2); const slit = back && fc === 'front' && Math.abs(q.u - (box.x0 + box.x1) / 2 / U) < 0.07 && ((q.h > 1.6 && q.h < 2.15) || (q.h > 3.3 && q.h < 3.85)); if (slit) return C('window', 3, true); return ashlar(q.u, q.h, 17, 0.36, 0.58, 'exterior', fc === 'right' ? -1 : 0); };
      const parts = [{ box, shader: sh, topAlways: true }];
      const m = 0.3 * U, mh = 0.34 * U;
      const roofed = back && !left;
      if (!roofed) for (const [a, c2] of [[box.x0, box.z0], [box.x1 - m, box.z0], [box.x0, box.z1 - m], [box.x1 - m, box.z1 - m], [(box.x0 + box.x1) / 2 - m / 2, box.z0], [box.x1 - m, (box.z0 + box.z1) / 2 - m / 2]]) parts.push({ box: { x0: a, x1: a + m, z0: c2, z1: c2 + m, h0: H, h1: H + mh }, mat: 'cap' });
      if (roofed) for (let k = 0; k < 6; k++) { const ins = (0.08 + k * 0.17) * U; parts.push({ box: { x0: box.x0 - 0.12 * U + ins, x1: box.x1 + 0.12 * U - ins, z0: box.z0 - 0.12 * U + ins, z1: box.z1 + 0.12 * U - ins, h0: H + k * 0.3 * U, h1: H + (k + 1) * 0.3 * U }, mat: 'slate' }); }
      if (roofed) parts.push({ box: { x0: (box.x0 + box.x1) / 2 - 0.05 * U, x1: (box.x0 + box.x1) / 2 + 0.05 * U, z0: (box.z0 + box.z1) / 2 - 0.05 * U, z1: (box.z0 + box.z1) / 2 + 0.05 * U, h0: H + 1.8 * U, h1: H + 2.3 * U }, mat: 'gold' });
      if (back) parts.push({ box: { x0: box.x0 + s * 0.45, x1: box.x0 + s * 1.15, z0: box.z0 - 1.2, z1: box.z0, h0: H * 0.42, h1: H * 0.82 }, mat: left ? 'bannerRed' : 'banner', faces: [['front', 0, 1, 0, 0.1, 'gold'], ['front', 0.35, 0.65, 0.45, 0.68, 'gold']] });
      if (!back) parts.push({ blob: { x: (box.x0 + box.x1) / 2, z: box.z0 + 3, h: H + 0.25 * U, rx: 2, ry: 3 }, mat: 'fire' });
      const sp = spriteOf(parts, 0, { outline: true, frames: back ? 1 : FRAMES });
      addObject({ id: `tower:${bd.id}:${id}`, kind: 'wall', floor: 0, ...box, bias: back ? -1 : 0, sb: sbOf(sp), ...sp, fps: back ? 0 : 6, phase: left ? 0 : 2 });
      if (!back) emit((box.x0 + box.x1) / 2, box.z0 + 3, 0, H + 0.25 * U, 'torch', { phase: left ? 1 : 3 });
      else emit((box.x0 + box.x1) / 2, box.z0 - 2, 0, H * 0.3, 'torch', { phase: left ? 2 : 0 });
    }
    // Fantasy buttresses along the visible exterior walls, clear of doors and corners.
    if (FANT) for (const w of walls.filter(q => (q.type === 'front' || q.type === 'right') && !q.h0 && outerLine(q))) {
      const L = (w.e - w.s) / U, n = Math.floor((L - 1.2) / 2.8);
      for (let k = 1; k <= n; k++) {
        const c = w.s + (0.6 + (L - 1.2) * k / (n + 1)) * U, s = 0.2 * U, o = 0.38 * U;
        if ((w.doors ?? []).some(d => c > d.s - 0.6 * U && c < d.e + 0.6 * U) || entrances.some(e => w.axis === 'z' && c > e.x0 * U - 1.2 * U && c < e.x1 * U + 1.2 * U)) continue;
        const b1 = w.axis === 'z' ? { x0: c - s, x1: c + s, z0: w.box.z0 - o, z1: w.box.z0, h0: 0, h1: w.h1 * 0.7 } : { x0: w.box.x1, x1: w.box.x1 + o, z0: c - s, z1: c + s, h0: 0, h1: w.h1 * 0.7 };
        const b2 = w.axis === 'z' ? { ...b1, z0: w.box.z0 - o * 0.5, h0: b1.h1, h1: w.h1 * 1.05 } : { ...b1, x1: w.box.x1 + o * 0.5, h0: b1.h1, h1: w.h1 * 1.05 };
        const mk = box => ({ box, shader: (fc, X, Y) => { const q = planeOf(box, w.f, fc, X, Y); return fc === 'top' ? C('wallTop', 3) : ashlar(q.u, q.h, 19, 0.3, 0.4, 'exterior', fc === 'right' ? -1 : 0); }, topAlways: true });
        const sp = spriteOf([mk(b1), mk(b2)], w.f, { outline: true });
        addObject({ id: `buttress:${w.f}:${w.axis}:${Math.round(c)}`, kind: 'wall', floor: w.f, x0: Math.min(b1.x0, b2.x0), x1: Math.max(b1.x1, b2.x1), z0: Math.min(b1.z0, b2.z0), z1: Math.max(b1.z1, b2.z1), sb: sbOf(sp), ...sp, fps: 0 });
      }
    }
  }
  // The entrance: piers integrated with the front wall, lights on them, a brand plate (Real) or a stone arch with
  // torches (Fantasy). Built from the canonical entrance door only.
  for (const e of entrances) {
    const x0 = e.x0 * U, x1 = e.x1 * U, z = e.z0 * U, pw = (FANT ? 0.55 : 0.2) * U, depth = (FANT ? 0.62 : 0.3) * U, H = FANT ? 1.85 * U : LOW + 0.42 * U;
    const pierBox = k => ({ x0: k ? x1 : x0 - pw, x1: k ? x1 + pw : x0, z0: z - tf0 - depth * 0.55, z1: z + 0.05 * U, h0: 0, h1: H });
    for (const k of [0, 1]) {
      const box = pierBox(k);
      // Real: slim concrete door reveals with a dark inner edge (the door frame), part of the facade.
      const sh = (fc, X, Y) => { const q = planeOf(box, 0, fc, X, Y); if (fc === 'top') return C(FANT ? 'wallTop' : 'cap', FANT ? 3 : 2); if (FANT) return ashlar(q.u, q.h, 23, 0.36, 0.5, 'exterior', fc === 'right' ? -1 : 0); if (q.h < 0.12) return C('base', 1); const inner = fc === 'front' && (k ? q.u * U < box.x0 + 0.06 * U : q.u * U > box.x1 - 0.06 * U); return inner ? C('frame', 1) : C('exterior', fc === 'right' ? 1 : 2); };
      const parts = [{ box, shader: sh, topAlways: true }];
      if (FANT) parts.push({ box: { x0: (box.x0 + box.x1) / 2 - 0.05 * U, x1: (box.x0 + box.x1) / 2 + 0.05 * U, z0: box.z0 - 0.15 * U, z1: box.z0, h0: H * 0.6, h1: H * 0.72 }, mat: 'metalDark' }, { blob: { x: (box.x0 + box.x1) / 2, z: box.z0 - 0.1 * U, h: H * 0.78, rx: 1, ry: 3 }, mat: 'fire' });
      const sp = spriteOf(parts, 0, { outline: FANT, frames: FANT ? FRAMES : 1 });
      addObject({ id: `pier:${e.d.id}:${k}`, kind: 'wall', floor: 0, ...box, sb: sbOf(sp), ...sp, fps: FANT ? 6 : 0, phase: k * 2 });
      if (FANT) emit((box.x0 + box.x1) / 2, box.z0 - 3, 0, H * 0.78, 'torch', { phase: k + 1 });
    }
    if (FANT) {
      // The arch spanning the gate: its underside is cut as a round arch (transparent), keystone in gold.
      const box = { x0: x0 - pw, x1: x1 + pw, z0: z - tf0 - depth * 0.45, z1: z - tf0 + 0.1 * U, h0: H * 0.62, h1: H + 0.38 * U }, mid = (x0 + x1) / 2, half = (x1 - x0) / 2, rise = (box.h1 - box.h0) * 0.6;
      const sh = (fc, X, Y) => { const q = planeOf(box, 0, fc, X, Y); if (fc === 'top') return C('wallTop', 3); const a = (q.u * U - mid) / half, up = q.h * U - box.h0; if (Math.abs(a) < 1 && up < rise * Math.sqrt(Math.max(0, 1 - a * a))) return null; if (Math.abs(a) < 0.16 && up < rise + 0.14 * U) return C('gold', 3); const ring = Math.abs(a) < 1.25 && up < rise * Math.sqrt(Math.max(0, 1 - Math.min(1, (a / 1.25) ** 2))) + 0.1 * U; return ring ? C('wallTop', 3) : ashlar(q.u, q.h, 29, 0.3, 0.45, 'exterior', fc === 'right' ? -1 : 0); };
      const sp = spriteOf([{ box, shader: sh, topAlways: true }], 0, { outline: true });
      addObject({ id: `arch:${e.d.id}`, kind: 'wall', floor: 0, ...box, bias: -1, sb: sbOf(sp), ...sp, fps: 0 });
    } else {
      // A thin cantilevered canopy over the door with the brand line on its edge and one warm downlight.
      const box = { x0: x0 - pw - 0.25 * U, x1: x1 + pw + 0.25 * U, z0: z - tf0 - 1.0 * U, z1: z - tf0 + 0.05 * U, h0: H, h1: H + 0.1 * U };
      const sp = spriteOf([{ box, mat: 'cap', faces: [['front', 0.06, 0.94, 0.3, 0.7, 'brand']] }], 0, { outline: true });
      addObject({ id: `canopy:${e.d.id}`, kind: 'wall', floor: 0, ...box, bias: -1, sb: sbOf(sp), ...sp, fps: 0 });
      emit((x0 + x1) / 2, box.z0 + 4, 0, H - 2, 'lamp', { phase: 1 });
    }
  }
  // Wall decor and sconces on full-height back walls (sconces between windows, clear of decor).
  const tallBack = (f, r) => walls.find(w => w.f === f && w.type === 'back' && !w.h0 && Math.abs(w.at - r.z1) < 1 && w.s <= (r.x0 + r.x1) / 2 && w.e >= (r.x0 + r.x1) / 2);
  for (const s of roomSpaces.filter(q => q.primitive === 'room')) {
    const F = furnishing[s.id], f = s.level, r = rp(s), wall = tallBack(f, r); if (!wall) continue;
    const used = (windowsOn.get(wall) ?? []).map(c => [c * U - 0.6 * U, c * U + 0.6 * U]);
    for (const dd of F.decor) {
      const pieces = DECOR[theme]?.[dd.type]; if (!pieces) continue;
      const x0 = dd.x0 * U, x1 = dd.x1 * U, h0 = dd.h0, h1 = dd.h1, z = r.z1 - 1.2;
      used.push([x0, x1]);
      const parts = pieces.map(([a0, a1, b0, b1, m]) => ({ quad: [Q(x0 + (x1 - x0) * a0, z, f, h0 + (h1 - h0) * b0), Q(x0 + (x1 - x0) * a1, z, f, h0 + (h1 - h0) * b0), Q(x0 + (x1 - x0) * a1, z, f, h0 + (h1 - h0) * b1), Q(x0 + (x1 - x0) * a0, z, f, h0 + (h1 - h0) * b1)], mat: m }));
      const scr = pieces.some(p => p[4] === 'screen');
      const sp = spriteOf(parts, f, { outline: false, frames: animated(parts) ? FRAMES : 1, alt: scr ? SCREEN_OFF : null }); if (!sp) continue;
      addObject({ id: `decor:${dd.id}`, kind: 'decor', floor: f, room: s.id, locId: locOf[s.id], x0, x1, z0: z - 1, z1: z, bias: 1, sb: sbOf(sp), ...sp, fps: sp.frames.length > 1 ? 6 : 0, phase: 0, screens: scr });
      if (scr) emit((x0 + x1) / 2, z - 4, f, (h0 + h1) / 2, 'screen', { locId: locOf[s.id], room: s.id });
    }
    const kit = SCONCES[theme], n = Math.max(1, Math.round((r.x1 - r.x0) / U / kit.spacing));
    for (let k = 0; k < n; k++) {
      const c = r.x0 + (r.x1 - r.x0) * (k + 0.5) / n, half = kit.w * U / 2;
      if (used.some(([a, b]) => c + half > a - 6 && c - half < b + 6)) continue;
      const z = r.z1 - 1.5, h0 = kit.h0 * U, h1 = kit.h1 * U;
      const parts = kit.pieces.map(([a0, a1, b0, b1, m]) => ({ quad: [Q(c - half + 2 * half * a0, z, f, h0 + (h1 - h0) * b0), Q(c - half + 2 * half * a1, z, f, h0 + (h1 - h0) * b0), Q(c - half + 2 * half * a1, z, f, h0 + (h1 - h0) * b1), Q(c - half + 2 * half * a0, z, f, h0 + (h1 - h0) * b1)], mat: m }));
      const sp = spriteOf(parts, f, { outline: true, frames: FRAMES });
      addObject({ id: `sconce:${s.id}:${k}`, kind: 'decor', floor: f, room: s.id, x0: c - half, x1: c + half, z0: z - 1, z1: z, bias: 1, sb: sbOf(sp), ...sp, fps: 6, phase: k });
      emit(c, z - 6, f, h1, kit.light, { phase: k });
    }
  }

  // ---- Land: lights along paths; vegetation composed as stands, understorey, clearings and accents. ----
  { const kit = POSTS[theme];
    for (const w of ways.filter(q => q.kind === 'path')) {
      let acc = kit.spacing * 0.5, side = 1;
      for (let k = 1; k < w.pts.length; k++) {
        const [ax, az] = w.pts[k - 1], [bx, bz] = w.pts[k], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
        for (let t = acc; t < L; t += kit.spacing) {
          const x = ax + (bx - ax) * t / L + nx * (w.half + 0.35) * side, z = az + (bz - az) * t / L + nz * (w.half + 0.35) * side; side = -side;
          if (bldgs.some(b => x > b.x0 - 1.2 && x < b.x1 + 1.2 && z > b.z0 - 1.2 && z < b.z1 + 1.2) || wayAt(x, z) || pads.some(q => inRect(q, x, z))) continue;
          placeRecipe(kit.recipe.concat([['light', ...kit.light]]), { x, z, w: kit.w, d: kit.w, facing: 'front' }, 0, { id: `post:${Math.round(x * 10)}:${Math.round(z * 10)}` });
        }
        acc = ((acc - L) % kit.spacing + kit.spacing) % kit.spacing;
      }
    } }
  const corners2 = [[0, 0], [region.w, 0], [0, region.h], [region.w, region.h]].map(([X, Y]) => P.plan((region.x0 + X) * A, (region.y0 + Y) * A, 0).map(v => v / U));
  const px0 = Math.min(...corners2.map(c => c[0])), px1 = Math.max(...corners2.map(c => c[0])), pz0 = Math.min(...corners2.map(c => c[1])), pz1 = Math.max(...corners2.map(c => c[1]));
  const STEP = 0.95, pineStand = FANT ? 0.42 : 0.68;
  const plant = (kind, x, z, gx, gz, salt) => {
    const [sx, sy] = Q(x * U, z * U, 0, 0);
    if (sx < region.x0 - 20 || sx > region.x0 + region.w + 20 || sy < region.y0 - 10 || sy > region.y0 + region.h + 40) return;
    const sp = plantSprite(theme, kind, noise(gx, gz, 45 + salt));
    addObject({ id: `veg:${gx}:${gz}${salt ? `:${salt}` : ''}`, kind: 'veg', floor: 0, x0: x * U - 4, x1: x * U + 4, z0: z * U - 4, z1: z * U + 4, sb: { l: Math.round(sx) + sp.ox, r: Math.round(sx) + sp.ox + sp.frames[0].w, t: Math.round(sy) + sp.oy, b: Math.round(sy) + sp.oy + sp.frames[0].h }, frames: sp.frames, masks: sp.masks, ox: Math.round(sx) + sp.ox, oy: Math.round(sy) + sp.oy, fps: sp.frames.length > 1 ? 1.5 : 0, phase: Math.floor(noise(gx, gz, 46) * 4) });
  };
  for (let gz = Math.floor(pz0 / STEP); gz <= Math.ceil(pz1 / STEP); gz++) for (let gx = Math.floor(px0 / STEP); gx <= Math.ceil(px1 / STEP); gx++) {
    const x = (gx + noise(gx, gz, 41)) * STEP, z = (gz + noise(gx, gz, 42)) * STEP;
    if (wayAt(x, z, 0.3) || waterAt(x, z) || pads.some(q => inRect(q, x, z))) continue;
    const d = devDist(x, z); if (d < 1.3) continue;
    const cl = cluster(x, z), ramp = smooth(3.5, 11, d), dens = ramp * smooth(0.46, 0.64, cl), n = noise(gx, gz, 43);
    const stand = vn(x / 14, z / 14, 54 + seedSalt) > pineStand ? 'pine' : 'broad';
    if (n < dens * 0.82) { // a stand: big trees in its heart, smaller toward its edge
      const heart = cl > 0.66 && n < dens * 0.45, kind = stand === 'pine' ? (heart || noise(gx, gz, 47) > 0.3 ? 'pine' : 'pineSmall') : (heart && noise(gx, gz, 48) > 0.45 ? 'treeBig' : noise(gx, gz, 49) > 0.35 ? 'tree' : 'treeSmall');
      plant(kind, x, z, gx, gz, 0); continue;
    }
    // Understorey: bushes and young trees ringing each stand (the transition), sparse toward the clearing.
    const ring = ramp * smooth(0.38, 0.5, cl) * (1 - smooth(0.58, 0.66, cl));
    if (n < dens * 0.82 + ring * 0.42) { plant(noise(gx, gz, 50) > 0.72 ? (stand === 'pine' ? 'pineSmall' : 'treeSmall') : 'bush', x, z, gx, gz, 0); continue; }
    // Rock outcrops: grouped where their own field peaks (in stands or clearings).
    const rockF = vn(x / 7, z / 7, 55 + seedSalt);
    if (rockF > 0.8 && d > 2.5 && noise(gx, gz, 56) < (rockF - 0.8) * 2.2) { plant(rockF > 0.86 && noise(gx, gz, 57) > 0.6 ? 'rockBig' : 'rock', x, z, gx, gz, 0); continue; }
    // Clearings: meadow flowers in patches and tufts; a lone old tree as an occasional landmark.
    if (cl < 0.4 && d > 2) {
      const m = meadow(x, z);
      if (m > 0.62 && noise(gx, gz, 58) < 0.35) { plant('flowers', x, z, gx, gz, 0); continue; }
      if (noise(gx, gz, 59) < 0.06) { plant('tuft', x, z, gx, gz, 0); continue; }
      if (d > 7 && cl < 0.3 && noise(gx, gz, 60) > 0.992) { plant(stand === 'pine' ? 'pine' : 'treeBig', x, z, gx, gz, 0); continue; }
    }
    // Near the building: a few planted shrubs where the forecourt meets the grass (rule: beside pads and paths).
    if (d < 2.2 && devDist(x, z) > 1.3 && pads.some(q => x > q.x0 - 2.2 && x < q.x1 + 2.2 && z > q.z0 - 2.2 && z < q.z1 + 0.5) && noise(gx, gz, 61) < 0.35) plant(noise(gx, gz, 62) > 0.5 ? 'bush' : 'flowers', x, z, gx, gz, 0);
  }

  // Interiors (screen polygons of finished rooms and halls) for the lightmap.
  const interiors = (layout.locations ?? []).filter(l => l.spaceId && !l.exterior && !l.site && l.poly).map(l => l.poly.map(([x, y]) => [x / A, y / A]));
  // Room rects (plan units) for state-driven pieces: a room's screens are on only while an agent works in it.
  const rooms = roomSpaces.map(s => ({ id: s.id, f: s.level, ...rp(s) }));
  return { theme, A, region, ground, objects, emitters, interiors, rooms, pal, Q };

  // -- helpers (hoisted) --
  function wallsOf(f) {
    const rects = spaces.filter(s => s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const siteRects = spaces.filter(s => s.level === f && active(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const doors = Object.values(world.doors).filter(d => (d.level ?? 0) === f && d.status === 'built').map(d => { const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2); return { a: { x: a.x * U, z: a.z * U }, b: { x: b.x * U, z: b.z * U }, h: (d.height ?? 2.2) * U, kind: d.kind, outside: d.a === 'outside' || d.b === 'outside' }; });
    const out = [], eq = (a, b) => Math.abs(a - b) < 0.5;
    for (const axis of ['z', 'x']) {
      const lines = [...new Set(rects.flatMap(r => (axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1]).map(v => Math.round(v * 2) / 2)))];
      for (const at of lines) {
        const lo = axis === 'z' ? 'x' : 'z';
        const after = rects.filter(r => eq(axis === 'z' ? r.z0 : r.x0, at)), before = rects.filter(r => eq(axis === 'z' ? r.z1 : r.x1, at));
        const cuts = [...new Set([...after, ...before].flatMap(r => [r[`${lo}0`], r[`${lo}1`]]))].sort((a, b) => a - b);
        const lineDoors = doors.filter(d => (axis === 'z' ? eq(d.a.z, at) && eq(d.b.z, at) : eq(d.a.x, at) && eq(d.b.x, at))).map(d => ({ s: Math.min(d.a[lo], d.b[lo]), e: Math.max(d.a[lo], d.b[lo]), h: d.h, kind: d.kind, outside: d.outside }));
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
    // Mass by rule: outer walls are thick and stand OUTSIDE the room rect (the room's floor stays whole); interior
    // walls are thin and centred. Heights: full storey at the back and left (the cutaway), low at the front and right.
    const isFant = theme === 'fantasy';
    for (const w of out) {
      const full = w.type === 'back' || w.type === 'left';
      const h1 = full ? HT : w.type === 'partition' ? (isFant ? 1.15 : 1.6) * U : w.type === 'low' ? (isFant ? LOW : 1.2 * U) : LOW + (isFant ? 0.15 * U : 0);
      const t = full ? 0.38 * U : w.type === 'front' || w.type === 'right' ? 0.3 * U : 0.14 * U;
      let cur = w.s;
      const openings = [...(w.doors ?? [])].sort((a, b) => a.s - b.s);
      const piece = (s, e, h0 = 0, extra = {}) => {
        if (e - s < 0.5) return;
        const box = w.axis === 'z'
          ? { x0: s, x1: e, z0: w.type === 'back' ? w.at : w.type === 'front' ? w.at - t : w.at - t / 2, z1: w.type === 'back' ? w.at + t : w.type === 'front' ? w.at : w.at + t / 2 }
          : { x0: w.type === 'left' ? w.at - t : w.type === 'right' ? w.at : w.at - t / 2, x1: w.type === 'left' ? w.at : w.type === 'right' ? w.at + t : w.at + t / 2, z0: s, z1: e };
        pieces.push({ ...w, box, h0, h1, ...extra });
      };
      for (const o of openings) {
        piece(cur, o.s);
        // The header over a door. Fantasy full walls carve a round arch into it (rise in metres, springing at the
        // door's height); everything else is a straight lintel.
        if (h1 > o.h && o.kind !== 'opening') { const rise = isFant && full ? Math.min(0.5, (o.e - o.s) / U / 2) : 0; piece(o.s, o.e, o.h - rise * U, rise ? { archOver: true, rise } : {}); }
        cur = o.e;
      }
      piece(cur, w.e);
    }
    return pieces;
  }
}
// Height (m) of a recipe's top surface, for pieces that stand on it.
// Height (m) of a recipe's highest box anywhere (tall pieces keep windows clear).
function recipeTop2(theme, type, kind) { const r = recipeFor(theme, type, kind) ?? []; return Math.max(0, ...r.filter(p => p[0] === 'box').map(p => p[6])); }
function recipeTop(theme, type, kind) { const r = recipeFor(theme, type, kind) ?? []; return Math.max(0, ...r.filter(p => p[0] === 'box' && p[3] <= 0 && p[4] >= 0).map(p => p[6])); }
function quadEdge(q, X, Y) { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return X <= Math.min(...xs) + 0.5 || X >= Math.max(...xs) - 1.5 || Y <= Math.min(...ys) + 0.5 || Y >= Math.max(...ys) - 1.5; }

// A plant sprite (two sway frames for canopies) from VEGETATION data. Origin: the plant's foot.
const plantCache = new Map();
export function plantSprite(theme, kind, n) {
  // Variety by rule: three sizes; the third variant takes the alternative leaf; a rare Fantasy old tree turns autumn.
  const variant = Math.floor(n * 3), autumn = theme === 'fantasy' && kind === 'treeBig' && n > 0.95, key = `${theme}|${kind}|${variant}|${autumn}`;
  if (plantCache.has(key)) return plantCache.get(key);
  const pal0 = paletteOf(theme), v = VEGETATION[theme][kind], k = 0.8 + variant * 0.16;
  const swap = p => (p === 'leaf' || p === 'leafLight') && autumn ? (p === 'leaf' ? 'leafAutumn' : 'flower') : p === 'leaf' && variant === 2 ? 'leafAlt' : p;
  const pal = { c: (p, s) => pal0.c(swap(p), s) };
  const frames = [], masks = [], W = 40, H = 46, fx = 20, fy = 40;
  for (let fr = 0; fr < (v.blobs && v.trunk || v.cone ? 2 : 1); fr++) {
    const b = new PixelBuffer(W, H), sway = fr;
    if (v.trunk) { const [tw, th] = v.trunk; b.rect(fx - Math.floor(tw / 2), fy - th, tw, th, pal.c('trunk', 1)); b.rect(fx - Math.floor(tw / 2), fy - th, 1, th, pal.c('trunk', 2)); }
    for (const [dx, dy, rx, ry, p, s] of v.blobs ?? []) { const big = v.trunk ? k : 1; for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) { if ((x * x) / (rx * rx + 0.6) + (y * y) / (ry * ry + 0.6) > 1) continue; const edge = noise(x + dx, y + dy, variant) > 0.82 && (x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.6; if (edge) continue; const shade = y > ry * 0.35 ? -1 : x < -rx * 0.3 && y < 0 ? 1 : 0; b.set(Math.round(fx + (dx + x) * big + (v.trunk && dy < -6 ? sway : 0)), Math.round(fy + dy * big + y), pal.c(p, Math.max(0, Math.min(4, s + shade + (noise(x, y, 77 + variant) > 0.88 ? 1 : 0))))); } }
    for (const [dx, dy, rx, h, p, s] of v.cone ?? []) { const hh = Math.round(h * k); for (let y = 0; y < hh; y++) { const half = Math.round((rx * k) * (y / hh)) + ((y % 4 === 3) ? 1 : 0); for (let x = -half; x <= half; x++) b.set(fx + dx + x + (y < hh * 0.4 ? sway : 0), fy + dy + Math.round(30 - 30 * k) + y + 0, pal.c(p, Math.max(0, s + (x < 0 ? 0 : x > half - 2 ? -1 : 0) + (y % 4 === 0 ? 1 : 0)))); } }
    for (const [dx, dy, p] of v.dots ?? []) { b.set(fx + dx, fy + dy - 1, pal.c('grassDark', 2)); b.set(fx + dx, fy + dy - 2, pal.c(p, 3)); }
    const o = v.dots ? b : b.outlined({ dark: 0.4, bottom: 0.3 });
    frames.push(o); masks.push(new Uint8Array(o.w * o.h));
  }
  const off = v.dots ? 0 : 1, sp = { frames, masks, ox: -fx - off, oy: -fy - off };
  plantCache.set(key, sp);
  return sp;
}

// The static lightmap of a scene for a lighting setting: per region pixel, an RGB multiplier (255 = 1.0).
export function lightmapOf(scene, lighting = 'dusk') {
  const L = LIGHTING[lighting] ?? LIGHTING.dusk, { region } = scene, n = region.w * region.h, out = new Uint32Array(n);
  const amb = rgba(L.ambient[0] * 255, L.ambient[1] * 255, L.ambient[2] * 255), inner = rgba(L.interior[0] * 255, L.interior[1] * 255, L.interior[2] * 255);
  out.fill(amb);
  const tmp = new PixelBuffer(region.w, region.h); tmp.data = out;
  for (const poly of scene.interiors) tmp.poly(poly.map(([x, y]) => [x - region.x0, y - region.y0]), inner);
  for (const e of scene.emitters) {
    const g = GLOWS[e.kind]; if (!g || e.kind === 'screen' || e.kind === 'led') continue;
    const rr = g.r * 2.2, gx = e.x - region.x0, gy = e.y - region.y0 + 6;
    for (let y = Math.floor(gy - rr * 0.6); y <= gy + rr * 0.6; y++) for (let x = Math.floor(gx - rr); x <= gx + rr; x++) {
      if (x < 0 || y < 0 || x >= region.w || y >= region.h) continue;
      const d = Math.hypot((x - gx) / rr, (y - gy) / (rr * 0.6)); if (d >= 1) continue;
      const t = (1 - d) * (1 - d); if (t < bayer(x, y) * 0.35) continue;
      const i = y * region.w + x, c = out[i], pc = L.pool;
      out[i] = rgba(Math.min(255, R(c) + pc[0] * 255 * t * 1.6), Math.min(255, G(c) + pc[1] * 255 * t * 1.6), Math.min(255, B(c) + pc[2] * 255 * t * 1.6));
    }
  }
  return { lighting, data: out, ambient: amb, skip: lighting === 'day' };
}

// A dithered glow sprite (additive) for a light kind at intensity step s (0..3).
const glowCache = new Map();
export function glowSprite(kind, s = 3) {
  const key = `${kind}|${s}`; if (glowCache.has(key)) return glowCache.get(key);
  const g = GLOWS[kind] ?? GLOWS.lamp, r = Math.round(g.r * (0.8 + s * 0.08)), b = new PixelBuffer(r * 2 + 1, r * 2 + 1), c = hex(g.colour);
  for (let y = 0; y <= 2 * r; y++) for (let x = 0; x <= 2 * r; x++) {
    const d = Math.hypot(x - r, (y - r) * 1.15) / r; if (d >= 1) continue;
    const t = Math.pow(1 - d, 1.8) * g.k * (0.55 + s * 0.15); if (t < bayer(x, y) * 0.22) continue;
    b.data[y * b.w + x] = rgba(R(c) * t, G(c) * t, B(c) * t);
  }
  const out = { buf: b, r }; glowCache.set(key, out); return out;
}
export { mixc };
