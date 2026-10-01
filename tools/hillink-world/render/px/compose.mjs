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
  const { P, U, world, view, furnishing } = layout, A = ART, pal = paletteOf(theme), mat = materialer(theme);
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

  // Ways (roads, paths) as plan segments in metres.
  const wayOf = w => w.points.map(p => { const v = view.toView(p.x, p.y); return [v.x, v.z]; });
  const ways = [...Object.values(world.roads ?? {}).filter(r => r.status !== 'reserved').map(r => ({ kind: 'road', pts: wayOf(r), half: r.width / 2 })), ...Object.values(world.paths ?? {}).filter(p => p.status !== 'reserved').map(p => ({ kind: 'path', pts: wayOf(p), half: p.width / 2 }))];
  const segs = ways.flatMap(w => w.pts.slice(1).map((b, k) => { const a = w.pts[k]; return { kind: w.kind, a, b, half: w.half, x0: Math.min(a[0], b[0]) - w.half, x1: Math.max(a[0], b[0]) + w.half, z0: Math.min(a[1], b[1]) - w.half, z1: Math.max(a[1], b[1]) + w.half }; }));
  const segDist = (s, x, z) => { const [ax, az] = s.a, [bx, bz] = s.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
  const wayAt = (x, z) => { let best = null; for (const s of segs) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue; const d = segDist(s, x, z); if (d <= s.half && (!best || s.kind === 'path')) best = { kind: s.kind, edge: s.half - d }; } return best; };
  // Terrain water (canonical land), sampled in world coordinates.
  const T = terrainOf(world), waterAt = (x, z) => { const w = view.fromView(x, z), i = Math.floor(w.x / T.cell), j = Math.floor(w.y / T.cell); return i >= 0 && j >= 0 && i < T.n && j < T.n && T.heights[j * T.n + i] <= T.waterLevel; };
  // Floors of storey 0, in metres.
  const floors0 = roomSpaces.filter(s => s.level === 0).map(s => { const r = view.rectToView(s.rect); return { s, r, kind: kindOf(s) }; });
  const rugs = [];
  for (const { s, r } of floors0) for (const it of furnishing[s.id].items) if (it.type === 'roundTable') rugs.push({ x0: Math.max(r.x0 + 0.3, it.x - it.w / 2 - 0.7), x1: Math.min(r.x1 - 0.3, it.x + it.w / 2 + 0.7), z0: Math.max(r.z0 + 0.3, it.z - it.d / 2 - 0.65), z1: Math.min(r.z1 - 0.3, it.z + it.d / 2 + 0.65) });
  const floorColour = (f, x, z, X, Y) => {
    const pat = PATTERNS[FLOORS[theme]?.[f.kind] ?? 'concrete'] ?? PATTERNS.concrete;
    let [p, k] = pat(x, z, X, Y);
    const rug = rugs.find(q => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1);
    if (rug) { const b = Math.min(x - rug.x0, rug.x1 - x, z - rug.z0, rug.z1 - z); [p, k] = b < 0.1 ? [theme === 'fantasy' ? 'gold' : 'floorCarpet', 1] : b < 0.18 ? ['floorRug', 3] : ['floorRug', noise(X, Y, 21) > 0.85 ? 3 : 2]; }
    // Ambient occlusion along the back and left walls.
    if (z > f.r.z1 - 0.14 || x < f.r.x0 + 0.1) k = Math.max(0, k - 1);
    return pal.c(p, k);
  };
  for (let Y = 0; Y < region.h; Y++) for (let X = 0; X < region.w; X++) {
    const sx = (region.x0 + X + 0.5) * A, sy = (region.y0 + Y + 0.5) * A, [px, pz] = P.plan(sx, sy, 0), x = px / U, z = pz / U;
    const f = floors0.find(q => x >= q.r.x0 && x < q.r.x1 && z >= q.r.z0 && z < q.r.z1);
    let c;
    if (f) c = floorColour(f, x, z, X + region.x0, Y + region.y0);
    else {
      const w = wayAt(x, z);
      if (w) { const [p, k] = PATTERNS[LAND[theme][w.kind]](x, z, X + region.x0, Y + region.y0); c = pal.c(p, w.edge < 0.12 ? Math.max(0, k - 1) : k); if (w.kind === 'road' && theme === 'real' && Math.abs(w.edge - (w.edge + 0)) < 1 && w.edge > 0 && noise(Math.floor(x), Math.floor(z)) < 0) c = pal.c('roadLine', 2); }
      else if (waterAt(x, z)) c = pal.c('water', noise(X >> 1, Y, 31) > 0.85 ? 3 : 2);
      else { const [p, k] = PATTERNS.grass(x, z, X + region.x0, Y + region.y0); c = pal.c(p, k); }
    }
    ground.data[Y * region.w + X] = c;
  }
  // Contact shadows under furniture (storey 0) and along the outside of the building's walls.
  const shadowPoly = (pts, k = 0.78) => ground.poly(pts.map(([x, y]) => [x - region.x0, y - region.y0]), null, (x, y) => scale(ground.get(x, y), k));
  for (const { s } of floors0) for (const it of furnishing[s.id].items) {
    if (!it.solid && !SEATS.has(it.type)) continue;
    const x0 = (it.x - it.w / 2 - 0.04) * U, x1 = (it.x + it.w / 2 + 0.06) * U, z0 = (it.z - it.d / 2 - 0.06) * U, z1 = (it.z + it.d / 2) * U;
    shadowPoly([Q(x0, z0, 0, 0), Q(x1, z0, 0, 0), Q(x1, z1, 0, 0), Q(x0, z1, 0, 0)], 0.72);
  }

  // ---- Objects. ----
  const objects = [], emitters = [];
  const addObject = (o) => { objects.push(o); return o; };
  // Rasterizes boxes, faces, blobs into sprite frames. Boxes are in plan units with h in units, on floor f.
  function spriteOf(parts, f, { outline = true, frames = 1 } = {}) {
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
        if (p.quad) fill(p.quad, (X, Y) => p.shader(X, Y, fr));
      }
      let fb = buf;
      if (outline) { fb = buf.outlined({ dark: 0.42, bottom: 0.3 }); const em2 = new Uint8Array(fb.w * fb.h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) em2[(y + 1) * fb.w + x + 1] = em[y * w + x]; masks.push(em2); }
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
    for (const p of parts.filter(q => q.light)) emit(p.light.x, p.light.z, f, p.light.h, p.light.kind, { phase, id, locId });
    // A seat splits into its back and the rest, so a sitting character is drawn between them.
    const groups = seat ? [parts.filter(p => !p.light && !p.back), parts.filter(p => !p.light && p.back)] : [parts.filter(p => !p.light)];
    groups.forEach((g, gi) => {
      if (!g.length) return;
      const frames = animated(g) ? FRAMES : 1, sp = spriteOf(g, f, { frames }); if (!sp) return;
      const boxes = g.filter(p => p.box).map(p => p.box), blobs = g.filter(p => p.blob).map(p => p.blob);
      const bx = [...boxes.flatMap(b => [b.x0, b.x1]), ...blobs.map(b => b.x)], bz = [...boxes.flatMap(b => [b.z0, b.z1]), ...blobs.map(b => b.z)];
      addObject({ id: `${id}${gi ? ':back' : ''}`, kind: 'prop', floor: f, room, locId, x0: Math.min(...bx), x1: Math.max(...bx), z0: Math.min(...bz), z1: Math.max(...bz), sb: sbOf(sp), ...sp, fps: frames > 1 ? 6 : 0, phase, screens: g.some(p => p.mat === 'screen' || (p.faces ?? []).some(d => d[5] === 'screen')) });
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

  // ---- Walls (the 5D wall rules: cut from finished spaces and their built doors). ----
  const walls = [];
  for (const f of layout.levels) walls.push(...wallsOf(f).map(w => ({ ...w, f })));
  const footprints = Object.values(world.buildings).map(b => ({ b, r: rp({ rect: b.footprint }) }));
  const exteriorAt = (w) => w.type === 'back' || w.type === 'left' || w.type === 'right' || w.type === 'front';
  function wallShader(w, faceName) {
    // Plane coordinates of a pixel on this wall's visible face -> a material colour.
    const b = w.box, f = w.f, base = P.baseOf(f);
    return (fc, X, Y, fr) => {
      const sx = (X + 0.5) * A, sy = (Y + 0.5) * A;
      let along, h;
      if (fc === 'right') { const z = (sx - b.x1) / P.g.skx; along = z / U; h = (base - z * P.g.sky - sy) / U; }
      else if (fc === 'front') { const z = b.z0; along = (sx - z * P.g.skx) / U; h = (base - z * P.g.sky - sy) / U; }
      else return { c: pal.c('wallTop', theme === 'fantasy' ? 2 : 1), e: false };
      const face = fc === faceName;
      return wallColour(w, along, h, face, X, Y);
    };
  }
  const roomKindAlong = (w, along) => {
    const s = roomSpaces.find(q => q.level === w.f && (() => { const r = rp(q); if (w.axis === 'z') return Math.abs(r.z1 - w.at) < 1 && r.x0 / U <= along && r.x1 / U >= along; return Math.abs(r.x0 - w.at) < 1 && r.z0 / U <= along && r.z1 / U >= along; })());
    return s ? kindOf(s) : 'passage';
  };
  function wallColour(w, along, h, interior, X, Y) {
    const tall = h > LOW / U + 0.02, kind = interior && (w.type === 'back' || w.type === 'left') ? roomKindAlong(w, along) : null;
    if (theme === 'fantasy') {
      // Coursed stone: 0.3 m courses, 0.5 m blocks offset per course, dark mortar, per-block shade; timber on interiors.
      const course = Math.floor(h / 0.3), blk = Math.floor((along + (course % 2) * 0.25) / 0.5), mortar = (h / 0.3) % 1 < 0.14 || ((along + (course % 2) * 0.25) / 0.5) % 1 < 0.06;
      if (interior && tall && (kind === 'lounge' || kind === 'comms' || kind === 'command') && h > 0.15 && h < 1.0) return { c: pal.c('wood', (along / 0.18) % 1 < 0.15 ? 1 : 2), e: false };
      if (interior && h < 0.12) return { c: pal.c('woodDark', 1), e: false };
      return { c: pal.c(interior ? 'wall' : 'exterior', mortar ? 0 : noise(course, blk, 7) > 0.66 ? 3 : noise(course, blk, 7) > 0.3 ? 2 : 1), e: false };
    }
    if (!interior) return { c: pal.c('exterior', h < 0.12 ? 1 : (along / 1.2) % 1 < 0.03 ? 1 : 2), e: false };
    if (h < 0.1) return { c: pal.c('wallTrim', 1), e: false };
    const band = kind === 'development' || kind === 'command' ? h > 0.95 && h < 1.05 : false;
    if (band) return { c: pal.c(kind === 'development' ? 'hivis' : 'brand', 2), e: false };
    if ((kind === 'lounge' || kind === 'comms') && h > 0.1 && h < 1.0) return { c: pal.c('wood', (along / 0.12) % 1 < 0.25 ? 1 : 3), e: false };
    if (kind === 'servers') return { c: pal.c('metalDark', (along / 0.4) % 1 < 0.08 ? 0 : 1), e: false };
    return { c: pal.c('wall', h > HT / U - 0.12 ? 1 : 2), e: false };
  }
  for (const w of walls) {
    const b = w.box, f = w.f, visible = w.type === 'left' ? 'right' : 'front';
    const parts = [{ box: { ...b, h0: w.h0, h1: w.h1 }, shader: wallShader(w, visible), topAlways: true }];
    // Windows on full-height outer walls (rule: every 2.6 m, clear of doors and wall ends).
    const outer = footprints.some(({ r }) => (w.axis === 'z' ? Math.abs(r.z1 - w.at) < 4 : Math.abs(r.x0 - w.at) < 4));
    if ((w.type === 'back' || w.type === 'left') && !w.h0 && outer) {
      const L = (w.e - w.s) / U, n = Math.floor((L - 0.6) / 2.6);
      for (let k = 0; k < n; k++) {
        const c = w.s + (0.3 + (L - 0.6) * (k + 0.5) / n) * U, half = (theme === 'fantasy' ? 0.18 : 0.55) * U, h0 = (theme === 'fantasy' ? 1.05 : 0.9) * U, h1 = (theme === 'fantasy' ? 1.85 : 2.1) * U;
        const quad = w.axis === 'z' ? [Q(c - half, b.z0 - 0.4, f, h0), Q(c + half, b.z0 - 0.4, f, h0), Q(c + half, b.z0 - 0.4, f, h1), Q(c - half, b.z0 - 0.4, f, h1)] : [Q(b.x1 + 0.4, c - half, f, h0), Q(b.x1 + 0.4, c + half, f, h0), Q(b.x1 + 0.4, c + half, f, h1), Q(b.x1 + 0.4, c - half, f, h1)];
        parts.push({ quad, shader: (X, Y) => { const edge = quadEdge(quad, X, Y); return edge ? { c: pal.c('frame', 2), e: false } : { c: pal.c('glass', noise(X, Y, 2) > 0.8 ? 4 : 3), e: theme === 'fantasy' }; } });
      }
    }
    const sp = spriteOf(parts, f, { outline: false }); if (!sp) continue;
    addObject({ id: `wall:${f}:${w.axis}:${w.at}:${w.s}:${w.h0}`, kind: 'wall', floor: f, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, bias: w.h0 > 0 ? -1 : 0, sb: sbOf(sp), ...sp, fps: 0 });
    // Fantasy: crenellations on the outer walls' tops.
    if (theme === 'fantasy' && outer && (w.type === 'back' || w.type === 'left') && !w.h0) {
      const L = w.e - w.s, step = 0.5 * U, merl = [];
      for (let a = w.s; a + step * 0.5 <= w.e; a += step) merl.push(w.axis === 'z' ? { box: { x0: a, x1: Math.min(w.e, a + step * 0.55), z0: b.z0, z1: b.z1, h0: HT, h1: HT + 0.32 * U }, mat: 'stone' } : { box: { x0: b.x0, x1: b.x1, z0: a, z1: Math.min(w.e, a + step * 0.55), h0: HT, h1: HT + 0.32 * U }, mat: 'stone' });
      void L;
      const ms = spriteOf(merl, f, { outline: true }); if (ms) addObject({ id: `merlons:${f}:${w.axis}:${w.at}:${w.s}`, kind: 'wall', floor: f, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, bias: -1, sb: sbOf(ms), ...ms, fps: 0 });
    }
  }
  // Fantasy massing: a tower at each back corner of each building, behind its walls (outside every space).
  if (theme === 'fantasy') for (const { r } of footprints) for (const [x, side] of [[r.x0, -1], [r.x1, 1]]) {
    const s = 1.1 * U, box = { x0: side < 0 ? x - s * 0.75 : x - s * 0.25, x1: side < 0 ? x + s * 0.25 : x + s * 0.75, z0: r.z1 - s * 0.1, z1: r.z1 + s * 0.9, h0: 0, h1: HT * 1.55 };
    const tw = { box, mat: 'stone', shader: (fc, X, Y) => { const sx = (X + 0.5) * A, sy = (Y + 0.5) * A, z = fc === 'right' ? (sx - box.x1) / P.g.skx : box.z0, along = fc === 'right' ? z / U : (sx - z * P.g.skx) / U, h = (P.baseOf(0) - z * P.g.sky - sy) / U; if (fc === 'top') return { c: pal.c('wallTop', 1), e: false }; const course = Math.floor(h / 0.3), blk = Math.floor((along + (course % 2) * 0.25) / 0.5), mortar = (h / 0.3) % 1 < 0.14 || ((along + (course % 2) * 0.25) / 0.5) % 1 < 0.06; return { c: pal.c('exterior', mortar ? 0 : noise(course, blk, 17) > 0.6 ? 3 : fc === 'right' ? 1 : 2), e: false }; }, topAlways: true };
    const merl = []; const m = 0.32 * U;
    for (const [a, c2] of [[box.x0, box.z0], [box.x1 - m, box.z0], [box.x0, box.z1 - m], [box.x1 - m, box.z1 - m], [(box.x0 + box.x1) / 2 - m / 2, box.z0]]) merl.push({ box: { x0: a, x1: a + m, z0: c2, z1: c2 + m, h0: box.h1, h1: box.h1 + 0.35 * U }, mat: 'stone' });
    const banner = { box: { x0: box.x0 + s * 0.3, x1: box.x0 + s * 0.7, z0: box.z0 - 1, z1: box.z0, h0: HT * 0.75, h1: HT * 1.35 }, mat: 'banner', faces: [['front', 0, 1, 0, 0.12, 'gold'], ['front', 0.35, 0.65, 0.45, 0.7, 'gold']] };
    const sp = spriteOf([tw, banner, ...merl], 0, { outline: true });
    addObject({ id: `tower:${x}`, kind: 'wall', floor: 0, x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1, sb: sbOf(sp), ...sp, fps: 0 });
  }
  // Door frames: the building entrance gets a portal (Real: a framed glass door; Fantasy: a timber gate under a stone
  // lintel), built from the canonical entrance door only.
  for (const d of Object.values(world.doors).filter(d => d.status === 'built' && (d.a === 'outside' || d.b === 'outside'))) {
    const a = view.toView(d.seg.x1, d.seg.y1), c = view.toView(d.seg.x2, d.seg.y2), f = d.level ?? 0;
    const x0 = Math.min(a.x, c.x) * U, x1 = Math.max(a.x, c.x) * U, z = Math.min(a.z, c.z) * U, post = 0.14 * U, hh = (d.height ?? 2.2) * U * 0.85;
    const parts = [{ box: { x0: x0 - post, x1: x0, z0: z - 3, z1: z + 3, h0: 0, h1: hh }, mat: theme === 'fantasy' ? 'stone' : 'frame' }, { box: { x0: x1, x1: x1 + post, z0: z - 3, z1: z + 3, h0: 0, h1: hh }, mat: theme === 'fantasy' ? 'stone' : 'frame' },
      { box: { x0: x0 - post, x1: x1 + post, z0: z - 3, z1: z + 3, h0: hh, h1: hh + 0.22 * U }, mat: theme === 'fantasy' ? 'stone' : 'frame', faces: theme === 'fantasy' ? [['front', 0.4, 0.6, 0.2, 0.8, 'gold']] : [['front', 0.1, 0.9, 0.25, 0.75, 'brand']] }];
    const sp = spriteOf(parts, f, { outline: true });
    addObject({ id: `portal:${d.id}`, kind: 'wall', floor: f, x0: x0 - post, x1: x1 + post, z0: z - 3, z1: z + 3, sb: sbOf(sp), ...sp, fps: 0 });
    // Entrance lights either side.
    const kit = POSTS[theme];
    for (const [ex, k] of [[x0 - post * 3, 0], [x1 + post * 3, 1]]) { const it = { x: ex / U, z: z / U - 0.5, w: kit.w, d: kit.w, facing: 'front' }; placeRecipe(kit.recipe.concat([['light', ...kit.light]]), it, f, { id: `entrance-light:${d.id}:${k}` }); }
  }
  // Wall decor and sconces on full-height back walls.
  const tallBack = (f, r) => walls.find(w => w.f === f && w.type === 'back' && !w.h0 && Math.abs(w.at - r.z1) < 1 && w.s <= (r.x0 + r.x1) / 2 && w.e >= (r.x0 + r.x1) / 2);
  for (const s of roomSpaces.filter(q => q.primitive === 'room')) {
    const F = furnishing[s.id], f = s.level, r = rp(s), wall = tallBack(f, r); if (!wall) continue;
    const used = [];
    for (const dd of F.decor) {
      const pieces = DECOR[theme]?.[dd.type]; if (!pieces) continue;
      const x0 = dd.x0 * U, x1 = dd.x1 * U, h0 = dd.h0, h1 = dd.h1, z = r.z1 - 1.2;
      used.push([x0, x1]);
      const parts = pieces.map(([a0, a1, b0, b1, m]) => { const quad = [Q(x0 + (x1 - x0) * a0, z, f, h0 + (h1 - h0) * b0), Q(x0 + (x1 - x0) * a1, z, f, h0 + (h1 - h0) * b0), Q(x0 + (x1 - x0) * a1, z, f, h0 + (h1 - h0) * b1), Q(x0 + (x1 - x0) * a0, z, f, h0 + (h1 - h0) * b1)]; return { quad, shader: (X, Y, fr) => mat(m, 0, fr, X, Y), mat: m }; });
      const sp = spriteOf(parts, f, { outline: false, frames: animated(parts) ? FRAMES : 1 }); if (!sp) continue;
      addObject({ id: `decor:${dd.id}`, kind: 'decor', floor: f, room: s.id, locId: locOf[s.id], x0, x1, z0: z - 1, z1: z, bias: 1, sb: sbOf(sp), ...sp, fps: sp.frames.length > 1 ? 6 : 0, phase: 0 });
      if (pieces.some(p => p[4] === 'screen')) emit((x0 + x1) / 2, z - 4, f, (h0 + h1) / 2, 'screen', { locId: locOf[s.id] });
    }
    const kit = SCONCES[theme], n = Math.max(1, Math.round((r.x1 - r.x0) / U / kit.spacing));
    for (let k = 0; k < n; k++) {
      const c = r.x0 + (r.x1 - r.x0) * (k + 0.5) / n, half = kit.w * U / 2;
      if (used.some(([a, b]) => c + half > a - 6 && c - half < b + 6)) continue;
      const z = r.z1 - 1.5, h0 = kit.h0 * U, h1 = kit.h1 * U;
      const parts = kit.pieces.map(([a0, a1, b0, b1, m]) => ({ quad: [Q(c - half + 2 * half * a0, z, f, h0 + (h1 - h0) * b0), Q(c - half + 2 * half * a1, z, f, h0 + (h1 - h0) * b0), Q(c - half + 2 * half * a1, z, f, h0 + (h1 - h0) * b1), Q(c - half + 2 * half * a0, z, f, h0 + (h1 - h0) * b1)], shader: (X, Y, fr) => mat(m, 0, fr, X, Y), mat: m }));
      const sp = spriteOf(parts, f, { outline: true, frames: FRAMES });
      addObject({ id: `sconce:${s.id}:${k}`, kind: 'decor', floor: f, room: s.id, x0: c - half, x1: c + half, z0: z - 1, z1: z, bias: 1, sb: sbOf(sp), ...sp, fps: 6, phase: k });
      emit(c, z - 6, f, h1, kit.light, { phase: k });
    }
  }

  // ---- Land: lights along paths, vegetation thickening into the natural edge. ----
  const bldgs = footprints.map(({ r }) => ({ x0: r.x0 / U, x1: r.x1 / U, z0: r.z0 / U, z1: r.z1 / U }));
  const devDist = (x, z) => {
    let d = Infinity;
    for (const b of bldgs) d = Math.min(d, Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)));
    for (const s of segs) d = Math.min(d, segDist(s, x, z) - s.half);
    return d;
  };
  { const kit = POSTS[theme];
    for (const w of ways.filter(q => q.kind === 'path')) {
      let acc = kit.spacing * 0.5, side = 1;
      for (let k = 1; k < w.pts.length; k++) {
        const [ax, az] = w.pts[k - 1], [bx, bz] = w.pts[k], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
        for (let t = acc; t < L; t += kit.spacing) {
          const x = ax + (bx - ax) * t / L + nx * (w.half + 0.45) * side, z = az + (bz - az) * t / L + nz * (w.half + 0.45) * side; side = -side;
          if (bldgs.some(b => x > b.x0 - 1.2 && x < b.x1 + 1.2 && z > b.z0 - 1.2 && z < b.z1 + 1.2) || wayAt(x, z)) continue;
          placeRecipe(kit.recipe.concat([['light', ...kit.light]]), { x, z, w: kit.w, d: kit.w, facing: 'front' }, 0, { id: `post:${Math.round(x * 10)}:${Math.round(z * 10)}` });
        }
        acc = ((acc - L) % kit.spacing + kit.spacing) % kit.spacing;
      }
    } }
  const veg = VEGETATION[theme], mix = EDGE_MIX[theme], total = mix.reduce((s, [, w]) => s + w, 0);
  const pickPlant = (n, d) => { let t = n * total; for (const [k, w] of mix) { if ((k === 'tree' || k === 'treeBig' || k === 'pine') && d < 5) continue; if ((t -= w) <= 0) return k; } return d < 5 ? 'bush' : mix[0][0]; };
  // The plan extent of the region (its four corners on the ground plane).
  const corners = [[0, 0], [region.w, 0], [0, region.h], [region.w, region.h]].map(([X, Y]) => P.plan((region.x0 + X) * A, (region.y0 + Y) * A, 0).map(v => v / U));
  const px0 = Math.min(...corners.map(c => c[0])), px1 = Math.max(...corners.map(c => c[0])), pz0 = Math.min(...corners.map(c => c[1])), pz1 = Math.max(...corners.map(c => c[1]));
  const STEP = 1.15;
  for (let gz = Math.floor(pz0 / STEP); gz <= Math.ceil(pz1 / STEP); gz++) for (let gx = Math.floor(px0 / STEP); gx <= Math.ceil(px1 / STEP); gx++) {
    const x = (gx + noise(gx, gz, 41)) * STEP, z = (gz + noise(gx, gz, 42)) * STEP, d = devDist(x, z);
    if (d < 1.4 || wayAt(x, z) || waterAt(x, z)) continue;
    const density = Math.max(0, Math.min(1, (d - 7) / 16)), p = d < 4 ? 0.04 : 0.05 + density * 0.72;
    if (noise(gx, gz, 43) > p) continue;
    const kind = pickPlant(noise(gx, gz, 44), d), [sx, sy] = Q(x * U, z * U, 0, 0);
    if (sx < region.x0 - 20 || sx > region.x0 + region.w + 20 || sy < region.y0 - 10 || sy > region.y0 + region.h + 40) continue;
    const sp = plantSprite(theme, kind, noise(gx, gz, 45));
    addObject({ id: `veg:${gx}:${gz}`, kind: 'veg', floor: 0, x0: x * U - 4, x1: x * U + 4, z0: z * U - 4, z1: z * U + 4, sb: { l: Math.round(sx) + sp.ox, r: Math.round(sx) + sp.ox + sp.frames[0].w, t: Math.round(sy) + sp.oy, b: Math.round(sy) + sp.oy + sp.frames[0].h }, frames: sp.frames, masks: sp.masks, ox: Math.round(sx) + sp.ox, oy: Math.round(sy) + sp.oy, fps: sp.frames.length > 1 ? 1.5 : 0, phase: Math.floor(noise(gx, gz, 46) * 4) });
  }

  // Interiors (screen polygons of finished rooms and halls) for the lightmap.
  const interiors = (layout.locations ?? []).filter(l => l.spaceId && !l.exterior && !l.site && l.poly).map(l => l.poly.map(([x, y]) => [x / A, y / A]));
  return { theme, A, region, ground, objects, emitters, interiors, pal, Q };

  // -- helpers (hoisted) --
  function wallsOf(f) {
    const rects = spaces.filter(s => s.level === f && finished(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const siteRects = spaces.filter(s => s.level === f && active(s) && (s.primitive === 'room' || s.primitive === 'hallway')).map(rp);
    const doors = Object.values(world.doors).filter(d => (d.level ?? 0) === f && d.status === 'built').map(d => { const a = view.toView(d.seg.x1, d.seg.y1), b = view.toView(d.seg.x2, d.seg.y2); return { a: { x: a.x * U, z: a.z * U }, b: { x: b.x * U, z: b.z * U }, h: (d.height ?? 2.2) * U, kind: d.kind }; });
    const out = [], eq = (a, b) => Math.abs(a - b) < 0.5;
    for (const axis of ['z', 'x']) {
      const lines = [...new Set(rects.flatMap(r => (axis === 'z' ? [r.z0, r.z1] : [r.x0, r.x1]).map(v => Math.round(v * 2) / 2)))];
      for (const at of lines) {
        const lo = axis === 'z' ? 'x' : 'z';
        const after = rects.filter(r => eq(axis === 'z' ? r.z0 : r.x0, at)), before = rects.filter(r => eq(axis === 'z' ? r.z1 : r.x1, at));
        const cuts = [...new Set([...after, ...before].flatMap(r => [r[`${lo}0`], r[`${lo}1`]]))].sort((a, b) => a - b);
        const lineDoors = doors.filter(d => (axis === 'z' ? eq(d.a.z, at) && eq(d.b.z, at) : eq(d.a.x, at) && eq(d.b.x, at))).map(d => ({ s: Math.min(d.a[lo], d.b[lo]), e: Math.max(d.a[lo], d.b[lo]), h: d.h, kind: d.kind }));
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
      const h1 = w.type === 'back' || w.type === 'left' ? HT : w.type === 'partition' ? LOW * 1.6 : LOW;
      const t = w.type === 'back' || w.type === 'left' ? 6 : 4;
      let cur = w.s;
      const openings = [...(w.doors ?? [])].sort((a, b) => a.s - b.s);
      const piece = (s, e, h0 = 0) => {
        if (e - s < 0.5) return;
        const box = w.axis === 'z' ? { x0: s, x1: e, z0: w.type === 'back' ? w.at : w.at - t / 2, z1: w.type === 'back' ? w.at + t : w.at + t / 2 } : { x0: w.type === 'left' ? w.at - t : w.at - t / 2, x1: w.type === 'left' ? w.at : w.at + t / 2, z0: s, z1: e };
        pieces.push({ ...w, box, h0, h1 });
      };
      for (const o of openings) { piece(cur, o.s); if (h1 > o.h && o.kind !== 'opening') piece(o.s, o.e, o.h); cur = o.e; }
      piece(cur, w.e);
    }
    return pieces;
  }
}
// Height (m) of a recipe's top surface, for pieces that stand on it.
function recipeTop(theme, type, kind) { const r = recipeFor(theme, type, kind) ?? []; return Math.max(0, ...r.filter(p => p[0] === 'box' && p[3] <= 0 && p[4] >= 0).map(p => p[6])); }
function quadEdge(q, X, Y) { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return X <= Math.min(...xs) + 0.5 || X >= Math.max(...xs) - 1.5 || Y <= Math.min(...ys) + 0.5 || Y >= Math.max(...ys) - 1.5; }

// A plant sprite (two sway frames for canopies) from VEGETATION data. Origin: the plant's foot.
const plantCache = new Map();
export function plantSprite(theme, kind, n) {
  const variant = Math.floor(n * 3), key = `${theme}|${kind}|${variant}`;
  if (plantCache.has(key)) return plantCache.get(key);
  const pal = paletteOf(theme), v = VEGETATION[theme][kind], k = 0.85 + variant * 0.12;
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
