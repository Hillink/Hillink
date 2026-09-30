// Pass 5G: the kingdom's theme entities. Things that move or stand in the kingdom without being agents: the Giant and
// the workers at a construction site, material carts, the portals of heroes being summoned, and the gate's ranger,
// golem and the hearth's cat. Every one is either DERIVED (a pure function of canonical state: construction projects,
// agent lifecycles, open issues) or COSMETIC infrastructure; none is canonical, none is selectable, none is ever an
// agent, and nothing here can write anything: the input is a read-only view and the output is fresh data.
//
// The rule that keeps truth one-way: a site's stage is read from its canonical project. The Giant appears only while
// HQ reports builders working at site preparation, foundation or structure, and it does whatever that stage is; a
// Giant, a worker or a cart finishing an animation loop can never advance, complete or block anything.
// Messengers (fairies) are drawn on the existing message effect (a canonical AGENT_MESSAGE), so they need no entity.
import { defineEntityKind } from '../../core/entities.mjs';
import { presenceOf } from '../../core/agents.mjs';
import { buildersWork, stageIndex } from '../../procgen/construction.mjs';
import { SUMMONING, GIANT_WORK, CONSTRUCTION_PHASES } from './metaphor.mjs';

export const KINGDOM_KINDS = {
  giant: { layer: 'agent', selectable: false, canonical: false, derived: true, from: 'construction project stage (site-preparation, foundation, structure) with builders working', anchor: 'feet' },
  worker: { layer: 'agent', selectable: false, canonical: false, derived: true, from: 'construction project with builders working', anchor: 'feet' },
  cart: { layer: 'agent', selectable: false, canonical: false, derived: true, from: 'construction project between foundation and furnishing', anchor: 'feet' },
  portal: { layer: 'agent', selectable: false, canonical: false, derived: true, from: 'a candidate agent\'s lifecycle state', anchor: 'feet' },
  ranger: { layer: 'agent', selectable: false, canonical: false, cosmetic: true, from: 'kingdom infrastructure (gate patrol); alert follows open canonical issues', anchor: 'feet' },
  golem: { layer: 'agent', selectable: false, canonical: false, cosmetic: true, from: 'kingdom infrastructure (gate guard); alert follows open canonical issues', anchor: 'feet' },
  creature: { layer: 'agent', selectable: false, canonical: false, cosmetic: true, from: 'ambient life', anchor: 'feet' },
};
for (const [k, d] of Object.entries(KINGDOM_KINDS)) defineEntityKind(k, d);

// Specs for every derived entity, from the kingdom layout (its canonical projects) and the World state (read-only).
// Deterministic: the same canonical state gives the same list, in the same order, at the same places.
export function deriveKingdomEntities(layout, world) {
  const out = [], P = layout.P, pt = (x, z) => P.at(x, z, 0);
  const H = layout.characterHeight;
  // Construction: per unfinished project with a site.
  for (const plot of layout.plots ?? []) {
    const p = plot.project; if (p.completed) continue;
    const r = plot.rect, stock = layout.solids.find(s => s.type === 'stockpile'), working = buildersWork(p), phase = CONSTRUCTION_PHASES[p.stage]?.phase ?? 'site';
    const from = stock ? { x: (stock.x0 + stock.x1) / 2, z: stock.z1 + 12 } : { x: r.x0, z: r.z0 }, to = { x: r.x0 + (r.x1 - r.x0) * 0.5, z: r.z0 + (r.z1 - r.z0) * 0.62 };
    if (working && GIANT_WORK[p.stage]) { const [x, y] = pt(r.x1 - 30, r.z0 + (r.z1 - r.z0) * 0.72); out.push({ id: `derived:giant:${p.id}`, kind: 'giant', x, y, w: H * 1.4, h: H * 2.6, project: p.id, stage: p.stage, work: GIANT_WORK[p.stage], phase, plan: { x: r.x1 - 30, z: r.z0 + (r.z1 - r.z0) * 0.72 } }); }
    if (working) { const [x, y] = pt(from.x, from.z); out.push({ id: `derived:worker:${p.id}`, kind: 'worker', x, y, w: H * 0.4, h: H * 0.7, project: p.id, stage: p.stage, phase, haul: { from, to } }); }
    if (stageIndex(p.stage) >= stageIndex('foundation') && stageIndex(p.stage) < stageIndex('inspection')) { const c = { x: r.x0 + 26, z: r.z0 + 18 }, [x, y] = pt(c.x, c.z); out.push({ id: `derived:cart:${p.id}`, kind: 'cart', x, y, w: 40, h: 26, project: p.id, stage: p.stage, moving: working, plan: c }); }
  }
  // Portals: one per candidate agent, in the zone its canonical lifecycle state is staged at.
  for (const a of Object.values(world?.agents ?? {}).sort((u, v) => (u.id < v.id ? -1 : 1))) {
    if (presenceOf(a) !== 'candidate') continue;
    const s = SUMMONING[a.lifecycle?.state]; if (!s) continue;
    const zone = layout.locationById[s.zone]; if (!zone) continue;
    const c = { x: (zone.room.x0 + zone.room.x1) / 2, z: zone.room.z0 + (zone.room.z1 - zone.room.z0) * 0.72 }, [x, y] = pt(c.x, c.z);
    out.push({ id: `derived:portal:${a.id}`, kind: 'portal', x, y, w: 40, h: 60, agentId: a.id, state: s.portal, phase: s.phase, lifecycle: a.lifecycle.state, plan: c });
  }
  // Gate infrastructure. Its alert follows open canonical issues only (no incident is ever made up).
  const openIssues = Object.values(world?.issues ?? {}).filter(i => i.open).length, G = layout.districts?.gate;
  if (G) {
    const gz = G.z0 + (G.z1 - G.z0) * 0.3, [rx, ry] = pt(G.x0 + 40, gz), [gx, gy] = pt(G.x1 - 60, G.z0 + (G.z1 - G.z0) * 0.55);
    out.push({ id: 'derived:ranger', kind: 'ranger', x: rx, y: ry, w: H * 0.6, h: H, alert: openIssues > 0, patrol: { x0: G.x0 + 30, x1: G.x1 - 30, z: gz } });
    out.push({ id: 'derived:golem', kind: 'golem', x: gx, y: gy, w: H * 0.9, h: H * 1.35, alert: openIssues > 0, plan: { x: G.x1 - 60, z: G.z0 + (G.z1 - G.z0) * 0.55 } });
  }
  const Hc = layout.districts?.hearth;
  if (Hc) { const c = { x: Hc.x0 + (Hc.x1 - Hc.x0) * 0.62, z: Hc.z1 - (Hc.z1 - Hc.z0) * 0.62 }, [x, y] = pt(c.x, c.z); out.push({ id: 'derived:cat', kind: 'creature', x, y, w: 14, h: 10, species: 'cat', plan: c }); }
  return out;
}
