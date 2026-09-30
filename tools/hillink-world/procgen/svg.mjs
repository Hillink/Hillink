// Pass 5A: a plan-view renderer for inspecting generated worlds (evidence, the /site page and tests). It draws only
// what represent(world, theme) and the canonical geometry say; it is a debug view of the generator, not the art
// (the object-built iso renderer takes over generated sites in Pass 5B). Pure: returns an SVG string.
import { terrainOf } from './world.mjs';
import { represent } from './themes.mjs';
import { frameFor } from './camera.mjs';
import { buildNav } from './nav.mjs';

const PALETTE = {
  real: { water: '#8fc3e6', low: [168, 196, 122], high: [214, 206, 160], parcel: '#6f7f5f', road: '#55585d', roadEdge: '#3b3d41', path: '#c9b89a', building: '#e9e4da', wall: '#4a4540', hall: '#f6f1e7', vacant: '#ddd6c8', planned: '#2f7de1', tree: '#3f7a3a', rock: '#8a8a86', shrub: '#6e9a4c', text: '#2a2622', roles: { 'workstation-area': '#f3d9a4', 'public-area': '#cfe5c4', 'secure-area': '#e7b8b0', 'service-area': '#ddd6c8' }, yard: '#c7c2b4' },
  fantasy: { water: '#5b88a8', low: [96, 128, 70], high: [150, 150, 104], parcel: '#4c5a38', road: '#8b6b45', roadEdge: '#6a4f31', path: '#a58459', building: '#b9a98c', wall: '#3a2f25', hall: '#cbb999', vacant: '#a8977a', planned: '#d9a53c', tree: '#2a4f22', rock: '#77736a', shrub: '#4f6b30', text: '#1f1a14', roles: { 'workstation-area': '#c9a46a', 'public-area': '#a9b98a', 'secure-area': '#9c6b5c', 'service-area': '#a8977a' }, yard: '#8d9a5e' },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => Math.round(v * 100) / 100;

export function renderSvg(world, { theme = 'real', frame = 'settlement', width = 1200, nav = false, labels = true } = {}) {
  const P = PALETTE[theme], t = terrainOf(world), view = typeof frame === 'string' ? frameFor(world, frame) : frame;
  const rep = new Map(represent(world, theme).items.map(i => [`${i.primitive}:${i.canonicalId}`, i]));
  const scale = width / view.w, height = Math.round(view.h * scale), out = [];
  const inView = (x, y, m = 0) => x >= view.x - m && x <= view.x + view.w + m && y >= view.y - m && y <= view.y + view.h + m;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(view.x)} ${f1(view.y)} ${f1(view.w)} ${f1(view.h)}" width="${width}" height="${height}" font-family="system-ui, sans-serif">`);
  out.push(`<title>${esc(represent(world, theme).name)}: seed ${esc(world.seed)}</title>`);
  // Terrain, sampled coarser when the view is large.
  const step = Math.max(1, Math.ceil(view.w / t.cell / 64)); // at most ~64 terrain samples across the view
  for (let j = 0; j < t.n; j += step) for (let i = 0; i < t.n; i += step) {
    const x = i * t.cell, y = j * t.cell, s = t.cell * step;
    if (!inView(x, y, s)) continue;
    const h = t.heights[j * t.n + i], k = Math.max(0, Math.min(1, (h - t.waterLevel) / (t.relief * 0.8)));
    const c = h <= t.waterLevel ? P.water : `rgb(${P.low.map((v, n) => Math.round(v + (P.high[n] - v) * k)).join(',')})`;
    out.push(`<rect x="${x}" y="${y}" width="${s + 0.05}" height="${s + 0.05}" fill="${c}"/>`);
  }
  const lw = Math.max(0.15, 1.2 / scale);
  for (const d of Object.values(world.districts)) out.push(`<rect x="${d.rect.x}" y="${d.rect.y}" width="${d.rect.w}" height="${d.rect.h}" fill="none" stroke="${P.parcel}" stroke-width="${lw * 1.5}" stroke-dasharray="${lw * 8} ${lw * 5}"/>`);
  for (const p of Object.values(world.parcels)) out.push(`<rect x="${p.rect.x}" y="${p.rect.y}" width="${p.rect.w}" height="${p.rect.h}" fill="none" stroke="${P.parcel}" stroke-opacity="${p.status === 'vacant' ? 0.35 : 0.8}" stroke-width="${lw}"/>`);
  const line = (w, color, width, dash = '') => `<polyline points="${w.points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  for (const r of Object.values(world.roads)) { out.push(line(r, P.roadEdge, r.width + 0.8)); out.push(line(r, r.status === 'built' ? P.road : P.planned, r.width, r.status === 'built' ? '' : '3 2')); }
  for (const p of Object.values(world.paths)) out.push(line(p, p.status === 'built' ? P.path : P.planned, p.width, p.status === 'built' ? '' : '1 1'));
  for (const e of world.environment) if (inView(e.x, e.y, 4)) {
    const r = e.kind === 'rock' ? 1.2 : e.kind === 'shrub' ? 1.1 : 2.2;
    out.push(`<circle cx="${e.x}" cy="${e.y}" r="${r}" fill="${P[e.kind === 'tree-wet' ? 'tree' : e.kind] ?? P.tree}" fill-opacity="0.85"><title>${esc(rep.get(`environment-anchor:${e.id}`)?.label ?? e.kind)}</title></circle>`);
  }
  // Structures: ground level (and the lowest level for anything underground), plus a note of other levels.
  for (const b of Object.values(world.buildings)) {
    const planned = b.status !== 'built';
    out.push(`<rect x="${b.footprint.x}" y="${b.footprint.y}" width="${b.footprint.w}" height="${b.footprint.h}" fill="${P.building}" stroke="${P.wall}" stroke-width="${lw * 2}"${planned ? ` stroke-dasharray="${lw * 4}"` : ''}/>`);
  }
  for (const s of Object.values(world.spaces).filter(s => s.level === 0)) {
    const planned = s.status === 'planned' || s.status === 'under-construction', r = s.rect;
    const fill = s.primitive === 'outdoor-facility' ? P.yard : s.primitive === 'hallway' ? P.hall : s.primitive === 'staircase' ? 'none' : s.vacant ? P.vacant : P.roles[s.roles[0]] ?? P.building;
    const dash = s.primitive === 'staircase' && s.status === 'reserved' ? ` stroke-dasharray="${lw * 3} ${lw * 2}"` : planned ? ` stroke-dasharray="${lw * 4}"` : '';
    out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" fill-opacity="${planned ? 0.45 : 1}" stroke="${planned ? P.planned : P.wall}" stroke-width="${lw}"${dash}><title>${esc(rep.get(`${s.primitive}:${s.id}`)?.label ?? s.id)} (${s.id}, ${s.status})</title></rect>`);
  }
  for (const d of Object.values(world.doors).filter(d => d.level === 0)) out.push(`<line x1="${d.seg.x1}" y1="${d.seg.y1}" x2="${d.seg.x2}" y2="${d.seg.y2}" stroke="${d.kind === 'opening' ? P.hall : '#ffffff'}" stroke-width="${lw * 3}"/>`);
  if (nav) {
    const g = buildNav(world);
    for (const e of g.edges) { const a = g.nodes.get(e.a), b = g.nodes.get(e.b); if (a.level === 0 && b.level === 0) out.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#d6336c" stroke-width="${lw * 0.8}" stroke-opacity="0.8"/>`); }
    for (const n of g.nodes.values()) if (n.level === 0 && inView(n.x, n.y)) out.push(`<circle cx="${n.x}" cy="${n.y}" r="${lw * 1.6}" fill="#d6336c"/>`);
  }
  if (labels) for (const s of Object.values(world.spaces).filter(s => s.level === 0 && (s.primitive === 'room' || s.primitive === 'outdoor-facility'))) {
    // The label fits its room (about 0.55 em per character) or is left out; it never spills over a neighbour.
    const r = s.rect, label = rep.get(`${s.primitive}:${s.id}`)?.label ?? s.id, size = Math.min(r.h * 0.32, (r.w * 0.9) / (label.length * 0.55), 1.4);
    if (size * scale < 7) continue;
    out.push(`<text x="${f1(r.x + r.w / 2)}" y="${f1(r.y + r.h / 2)}" font-size="${f1(size)}" text-anchor="middle" dominant-baseline="middle" fill="${P.text}">${esc(label)}</text>`);
  }
  for (const b of Object.values(world.buildings)) if (b.levels.length > 1) out.push(`<text x="${f1(b.footprint.x + b.footprint.w)}" y="${f1(b.footprint.y - 0.6)}" font-size="${f1(1.2 * Math.max(1, 14 / scale))}" text-anchor="end" fill="${P.text}">levels ${b.levels.join(', ')}</text>`);
  out.push('</svg>');
  return out.join('\n');
}
