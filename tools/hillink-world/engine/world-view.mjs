// Bridges World state to scene entities. Only entities whose keys changed are touched (brief §13).
// Movement starts only because semantic state changed where an agent belongs.
import { placeAgents, stationPoint, taskPlacement } from '../core/behavior.mjs';
import { LAYERS } from './scene.mjs';
import { startPath } from './motion.mjs';

export class WorldView {
  constructor(scene, effects, layout) {
    this.scene = scene; this.effects = effects; this.layout = layout; this.places = {}; this.lastMessage = null; this.roomSignals = {};
    const s = layout.entityScale ?? 1; this.size = { agent: [44 * s, 64 * s], task: 14 * s, system: 90 * s, issue: 30 * s };
    for (const l of layout.locations) scene.add({ id: `room:${l.id}`, kind: 'room', layer: LAYERS.room, x: l.x + l.w / 2, y: l.y + l.h / 2, w: l.w, h: l.h, selectable: true, ref: { type: 'room', id: l.id }, location: l });
  }
  // changed: Set of keys from the store ('*' means rebuild everything).
  sync(world, changed, now) {
    const all = changed.has('*');
    const agentsChanged = all || [...changed].some(k => k.startsWith('agent:'));
    if (agentsChanged) this.syncAgents(world, now);
    if (all || [...changed].some(k => k.startsWith('task:')) || agentsChanged) this.syncTasks(world);
    for (const s of Object.values(world.systems)) if (all || changed.has(`system:${s.id}`)) this.syncSystem(s);
    if (all || [...changed].some(k => /^(tests|build|deploy|pr|issue):/.test(k))) this.syncActivityObjects(world);
    if (changed.has('messages') && !all) {
      const m = world.messages.at(-1);
      if (m && m.id !== this.lastMessage) {
        this.lastMessage = m.id;
        const from = this.scene.get(`agent:${m.from}`), to = this.scene.get(`agent:${m.to}`);
        if (from && to) this.effects.add({ kind: 'message', from: from.id, to: to.id, duration: 1800 }, now);
      }
    }
  }
  syncAgents(world, now) {
    const agents = Object.values(world.agents);
    const layout = this.layout, next = placeAgents(agents, this.places, layout);
    for (const a of agents) {
      let e = this.scene.get(`agent:${a.id}`);
      const place = next[a.id], target = stationPoint(place, layout);
      if (!e) {
        // New agents walk in from the command center door rather than appearing mid-room.
        const door = layout.locationById[layout.spawn ?? 'command'].door;
        e = this.scene.add({ id: `agent:${a.id}`, kind: 'agent', layer: LAYERS.agent, x: door[0], y: door[1], w: this.size.agent[0], h: this.size.agent[1], selectable: true, ref: { type: 'agent', id: a.id }, facing: 1 });
      }
      const prev = this.places[a.id];
      const placeChanged = !prev || prev.location !== place.location || prev.station !== place.station || prev.overflow !== place.overflow;
      if (placeChanged) startPath(e, layout.route([e.x, e.y], place.location, target), now);
      if (e.clip !== place.clip) e.clipStart = now;
      Object.assign(e, { clip: place.clip, agent: a });
    }
    for (const [id, e] of this.scene.entities) if (e.kind === 'agent' && !world.agents[e.ref.id]) this.scene.remove(id);
    this.places = next;
  }
  syncTasks(world) {
    const placement = taskPlacement(world.tasks, this.layout);
    for (const t of Object.values(world.tasks)) {
      let e = this.scene.get(`task:${t.id}`);
      if (!e) e = this.scene.add({ id: `task:${t.id}`, kind: 'task', layer: LAYERS.task, x: 0, y: 0, w: this.size.task, h: this.size.task, selectable: true, ref: { type: 'task', id: t.id } });
      const p = placement[t.id];
      e.task = t; e.follow = p.follow ? `agent:${p.follow}` : null;
      if (p.point) { e.x = p.point[0]; e.y = p.point[1]; this.scene.moved(e); }
    }
  }
  syncSystem(s) {
    const spots = this.layout.systemSpots, spot = spots[s.kind] ?? spots.platform;
    let e = this.scene.get(`system:${s.id}`);
    if (!e) e = this.scene.add({ id: `system:${s.id}`, kind: 'system', layer: LAYERS.system, x: spot[0], y: spot[1], w: this.size.system, h: this.size.system, selectable: true, ref: { type: 'system', id: s.id } });
    e.system = s;
  }
  // Tests, builds, deploys, PRs and issues light up their rooms' equipment; the renderer reads these per room.
  syncActivityObjects(world) {
    const latest = obj => Object.values(obj).sort((a, b) => (b.at ?? b.startedAt ?? 0) - (a.at ?? a.startedAt ?? 0))[0] ?? null;
    this.roomSignals = {
      testing: latest(world.testRuns),
      deploy: latest(world.deploys) ?? latest(world.builds),
      development: Object.values(world.prs).filter(p => p.state !== 'merged'),
    };
    for (const [id, e] of this.scene.entities) if (e.kind === 'issue' && !world.issues[e.ref.id]?.open) this.scene.remove(id);
    for (const issue of Object.values(world.issues)) {
      if (!issue.open) continue;
      const byId = this.layout.locationById, loc = byId[issue.location] ?? byId.command, s = this.size.issue;
      const id = `issue:${issue.id}`;
      if (!this.scene.get(id)) {
        const n = [...this.scene.entities.values()].filter(e => e.kind === 'issue' && e.issue?.location === issue.location).length;
        this.scene.add({ id, kind: 'issue', layer: LAYERS.effect, x: loc.x + s * 1.3 + n * s * 1.15, y: loc.y + loc.h - s * 1.2, w: s, h: s, selectable: true, ref: { type: 'issue', id: issue.id } });
      }
      this.scene.get(id).issue = issue;
    }
  }
  // Per-frame: move agents along paths, keep followers attached. Returns true while anything moves.
  step(dt, now, { instant }, stepPath) {
    let moving = false;
    for (const e of this.scene.entities.values()) {
      if (e.kind === 'agent' && e.moving) { moving = stepPath(e, dt, { instant }) || moving; this.scene.moved(e); }
    }
    for (const e of this.scene.entities.values()) if (e.kind === 'task' && e.follow) {
      const a = this.scene.get(e.follow);
      if (a) { e.x = a.x + a.w / 2; e.y = a.y - a.h * 0.9; this.scene.moved(e); }
    }
    return moving;
  }
}
