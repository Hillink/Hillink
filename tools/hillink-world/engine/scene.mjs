// Scene: registry of visual entities with world bounds, layer and selection metadata,
// plus a uniform-grid spatial index for culling and hit testing. Knows nothing about Hillink.
export const LAYERS = { floor: 0, room: 1, furniture: 2, system: 3, task: 4, agent: 5, effect: 6, label: 7 };
const CELL = 256;

export class Scene {
  constructor() { this.entities = new Map(); this.grid = new Map(); this.cellsOf = new Map(); this.version = 0; }
  add(entity) {
    const e = { visible: true, selectable: false, layer: LAYERS.furniture, w: 0, h: 0, ...entity };
    this.entities.set(e.id, e); this.index(e); this.version++;
    return e;
  }
  get(id) { return this.entities.get(id); }
  remove(id) { this.unindex(id); this.entities.delete(id); this.version++; }
  // Call after changing x/y/w/h so culling and picking stay correct.
  moved(e) { this.unindex(e.id); this.index(e); }
  index(e) {
    const keys = [];
    const x0 = Math.floor((e.x - e.w / 2) / CELL), x1 = Math.floor((e.x + e.w / 2) / CELL);
    const y0 = Math.floor((e.y - e.h / 2) / CELL), y1 = Math.floor((e.y + e.h / 2) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = `${cx},${cy}`; let set = this.grid.get(k); if (!set) this.grid.set(k, set = new Set());
      set.add(e.id); keys.push(k);
    }
    this.cellsOf.set(e.id, keys);
  }
  unindex(id) { for (const k of this.cellsOf.get(id) || []) this.grid.get(k)?.delete(id); this.cellsOf.delete(id); }
  // Entities whose bounds intersect rect, sorted by layer then y (painter's order gives depth).
  query(rect) {
    const found = new Set();
    const x0 = Math.floor(rect.x / CELL), x1 = Math.floor((rect.x + rect.w) / CELL);
    const y0 = Math.floor(rect.y / CELL), y1 = Math.floor((rect.y + rect.h) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const id of this.grid.get(`${cx},${cy}`) || []) found.add(id);
    const out = [];
    for (const id of found) {
      const e = this.entities.get(id);
      if (e.visible && e.x + e.w / 2 >= rect.x && e.x - e.w / 2 <= rect.x + rect.w && e.y + e.h / 2 >= rect.y && e.y - e.h / 2 <= rect.y + rect.h) out.push(e);
    }
    return out.sort((a, b) => a.layer - b.layer || a.y - b.y);
  }
  // Topmost selectable entity at a world point.
  pick(wx, wy, slop = 0) {
    const hits = this.query({ x: wx - slop, y: wy - slop, w: slop * 2, h: slop * 2 }).filter(e => e.selectable);
    return hits.at(-1) ?? null;
  }
}
