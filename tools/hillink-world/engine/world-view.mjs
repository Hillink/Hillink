// Bridges World state to scene entities. Only entities whose keys changed are touched (brief §13).
// Movement starts only because semantic state changed where an agent belongs.
import { placeAgents, stationPoint, taskPlacement } from '../core/behavior.mjs';
import { LAYERS } from './scene.mjs';
import { startPath, WALK_SPEED } from './motion.mjs';
import { Lift, seeded } from './lift.mjs';
import { npcAt } from './ambience.mjs';

const PRODUCTIVE = new Set(['coding', 'thinking', 'reviewing', 'testing', 'researching', 'communicating']);
const HANDOFF_MS = 1500;

export class WorldView {
  // scenery (optional): a theme's animation layer. It adds lifts, ambient staff (NPCs) and foreground occluders.
  constructor(scene, effects, layout, scenery = null) {
    this.scene = scene; this.effects = effects; this.layout = layout; this.places = {}; this.lastMessage = null; this.roomSignals = {};
    this.scenery = scenery; this.activity = { rooms: {}, stations: {}, construction: 0 };
    const s = layout.entityScale ?? 1, ch = scenery?.characterHeight;
    this.size = { agent: ch ? [ch * 0.6, ch] : [44 * s, 64 * s], task: 14 * s, system: 90 * s, issue: 30 * s };
    this.speed = scenery?.walkSpeed ?? layout.walkSpeed ?? WALK_SPEED;
    for (const l of layout.locations) scene.add({ id: `room:${l.id}`, kind: 'room', layer: LAYERS.room, x: l.x + l.w / 2, y: l.y + l.h / 2, w: l.w, h: l.h, selectable: true, ref: { type: 'room', id: l.id }, location: l });
    this.lifts = {};
    // Lifts agents ride (from the layout's nav) plus purely ambient cars the scenery adds.
    [...Object.values(layout.lifts ?? {}), ...(scenery?.ambientLifts ?? [])].forEach((l, i) => {
      const lift = this.lifts[l.id] = new Lift({ id: l.id, x: l.x, stops: l.stops, speed: scenery?.liftSpeed ?? 70, rng: seeded(11 + i) });
      const d = l.w ? l : scenery?.lift; if (!d) return;
      lift.dims = { w: d.w, h: d.h };
      // The car is drawn in two halves around its riders so they appear inside it.
      for (const part of ['back', 'front']) scene.add({ id: `lift:${l.id}:${part}`, kind: part === 'back' ? 'liftBack' : 'liftFront', layer: LAYERS.agent, x: l.x, y: lift.y - d.h / 2, w: d.w, h: d.h, sortY: lift.y + (part === 'back' ? -0.5 : 0.5), lift });
    });
    scenery?.npcs?.forEach((n, i) => {
      const h = scenery.npcHeight ?? 30, p0 = npcAt(0, n, i);
      scene.add({ id: `npc:${i}`, kind: 'npc', layer: LAYERS.agent, x: p0.x, y: p0.y, w: h * 0.6, h, npc: n, index: i, facing: p0.facing, anchor: 'feet' });
    });
    scenery?.occluders?.forEach((o, i) => {
      const pts = o.shapes.flatMap(sh => sh.poly ?? (sh.ellipse ? [[sh.ellipse[0] - sh.ellipse[2], sh.ellipse[1] - sh.ellipse[3]], [sh.ellipse[0] + sh.ellipse[2], sh.ellipse[1] + sh.ellipse[3]]] : [[sh.circle[0] - sh.circle[2], sh.circle[1] - sh.circle[2]], [sh.circle[0] + sh.circle[2], sh.circle[1] + sh.circle[2]]]));
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      scene.add({ id: `occluder:${i}`, kind: 'occluder', layer: LAYERS.agent, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, sortY: o.baseline, shapes: o.shapes });
    });
  }
  // changed: Set of keys from the store ('*' means rebuild everything).
  sync(world, changed, now) {
    this.world = world;
    const all = changed.has('*');
    const agentsChanged = all || [...changed].some(k => k.startsWith('agent:'));
    if (agentsChanged) this.syncAgents(world, now, all);
    if (all || [...changed].some(k => k.startsWith('task:')) || agentsChanged) this.syncTasks(world);
    for (const s of Object.values(world.systems)) if (all || changed.has(`system:${s.id}`)) this.syncSystem(s);
    if (all) for (const [id, e] of this.scene.entities) if (e.kind === 'system' && !world.systems[e.ref.id]) this.scene.remove(id);
    if (all || [...changed].some(k => /^(tests|build|deploy|pr|issue):/.test(k))) this.syncActivityObjects(world);
    if (changed.has('messages') && !all) {
      const m = world.messages.at(-1);
      if (m && m.id !== this.lastMessage) {
        this.lastMessage = m.id;
        const from = this.scene.get(`agent:${m.from}`), to = this.scene.get(`agent:${m.to}`);
        if (from && to) { this.effects.add({ kind: 'message', from: from.id, to: to.id, duration: 1800 }, now); if (this.scenery) this.startHandoff(from, to, now); }
      }
    }
  }
  syncAgents(world, now, rebuild = false) {
    const agents = Object.values(world.agents);
    const layout = this.layout, next = placeAgents(agents, this.places, layout);
    for (const a of agents) {
      let e = this.scene.get(`agent:${a.id}`);
      const place = next[a.id], target = stationPoint(place, layout);
      const created = !e;
      if (!e) {
        // New agents walk in from the command center door rather than appearing mid-room.
        // Arrivals queue side by side at the door (one footprint apart) instead of spawning on one point.
        const door = layout.locationById[layout.spawn ?? 'command'].door, slot = this.arrivals = (this.arrivals ?? 0) + 1;
        const dx = ((slot - 1) % 5) * (layout.overflowStep ?? 0);
        e = this.scene.add({ id: `agent:${a.id}`, kind: 'agent', layer: LAYERS.agent, x: door[0] + dx, y: door[1], w: this.size.agent[0], h: this.size.agent[1], selectable: true, ref: { type: 'agent', id: a.id }, facing: 1, anchor: this.scenery ? 'feet' : undefined });
      }
      const prev = this.places[a.id];
      const placeChanged = created || !prev || prev.location !== place.location || prev.station !== place.station || prev.overflow !== place.overflow;
      // A wholesale rebuild (page load, HQ reconnect) places agents directly; only real changes make them walk.
      if (created && rebuild) { e.x = target[0]; e.y = target[1]; e.dest = { location: place.location, target }; this.scene.moved(e); }
      else if (placeChanged) { this.endHandoff(e); this.goTo(e, place, target, now); }
      if (e.clip !== place.clip) e.clipStart = now;
      Object.assign(e, { clip: place.clip, agent: a });
    }
    for (const [id, e] of this.scene.entities) if (e.kind === 'agent' && !world.agents[e.ref.id]) this.scene.remove(id);
    this.places = next;
  }
  syncTasks(world) {
    const placement = taskPlacement(world.tasks, this.layout);
    for (const [id, e] of this.scene.entities) if (e.kind === 'task' && !world.tasks[e.ref.id]) this.scene.remove(id);
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
      const byId = this.layout.locationById, loc = byId[issue.location] ?? byId.command ?? this.layout.locations[0], s = this.size.issue;
      const id = `issue:${issue.id}`;
      if (!this.scene.get(id)) {
        const n = [...this.scene.entities.values()].filter(e => e.kind === 'issue' && e.issue?.location === issue.location).length;
        this.scene.add({ id, kind: 'issue', layer: LAYERS.effect, x: loc.x + s * 1.3 + n * s * 1.15, y: loc.y + loc.h - s * 1.2, w: s, h: s, selectable: true, ref: { type: 'issue', id: issue.id } });
      }
      this.scene.get(id).issue = issue;
    }
  }
  // Walk to a place; a rider already inside a moving lift finishes the ride first, then re-routes.
  goTo(e, place, target, now) {
    e.dest = { location: place.location, target };
    if (e.ride?.request.phase === 'ride') { e.repath = true; return; }
    if (e.ride) { this.lifts[e.ride.lift]?.cancel(e.id); e.ride = null; }
    startPath(e, this.layout.route([e.x, e.y], place.location, target), now);
  }
  // Handoff (brief §11): the sender carries a package to the receiver, hands it over, and walks back.
  // Triggered only by a real AGENT_MESSAGE; the receiver's own work still comes from its own events.
  startHandoff(from, to, now) {
    if (from.errand || from.ride || from.moving) return;
    from.errand = { to: to.id, phase: 'go', target: null }; from.carrying = true;
    this.chase(from, to, now);
  }
  // Head for where the receiver is (or is heading); called again if the receiver moves on.
  chase(from, to, now) {
    const dest = to.moving ? to.path?.at(-1) ?? [to.x, to.y] : [to.x, to.y];
    const loc = this.places[to.ref.id]?.location ?? this.layout.locationAt(dest[0], dest[1])?.id; if (!loc) return this.endHandoff(from);
    const side = from.x < dest[0] ? -1 : 1;
    from.errand.target = [dest[0], dest[1]];
    if (from.ride) { from.dest = { location: loc, target: [dest[0] + side * this.size.agent[0] * 0.9, dest[1] + 1] }; from.repath = true; return; }
    startPath(from, this.layout.route([from.x, from.y], loc, [dest[0] + side * this.size.agent[0] * 0.9, dest[1] + 1]), now);
  }
  endHandoff(e) {
    if (!e.errand) return;
    const to = this.scene.get(e.errand.to); if (to) to.receiving = false;
    e.errand = null; e.carrying = false;
  }
  stepHandoff(e, now) {
    const h = e.errand, to = this.scene.get(h.to);
    if (!to) return this.endHandoff(e);
    const where = to.moving ? to.path?.at(-1) : [to.x, to.y];
    if (h.phase === 'go' && where && Math.hypot(where[0] - h.target[0], where[1] - h.target[1]) > 30) return this.chase(e, to, now);
    if (h.phase === 'go' && !e.moving) { h.phase = 'give'; h.until = now + HANDOFF_MS; e.facing = to.x > e.x ? 1 : -1; to.facing = -e.facing; to.receiving = true; }
    else if (h.phase === 'give') {
      if (now > h.until - HANDOFF_MS / 2) e.carrying = false;
      if (now >= h.until) {
        to.receiving = false; h.phase = 'back';
        const place = this.places[e.ref.id];
        if (place) { const target = stationPoint(place, this.layout); e.dest = { location: place.location, target }; startPath(e, this.layout.route([e.x, e.y], place.location, target), now); }
      }
    } else if (h.phase === 'back' && !e.moving) this.endHandoff(e);
  }
  // Per-frame: lifts, agents along paths, ambient staff, followers, and which rooms are in real use.
  step(dt, now, { instant }, stepPath) {
    let moving = false;
    for (const lift of Object.values(this.lifts)) {
      if (!instant) lift.update(dt);
      const back = this.scene.get(`lift:${lift.id}:back`), front = this.scene.get(`lift:${lift.id}:front`);
      if (back) { back.y = front.y = lift.y - back.h / 2; back.sortY = lift.y - 0.5; front.sortY = lift.y + 0.5; this.scene.moved(back); this.scene.moved(front); }
    }
    const t = now / 1000;
    for (const e of this.scene.entities.values()) {
      if (e.kind === 'agent') {
        // A character that is still reacting or standing up has not set off yet (see engine/iso-view.mjs).
        if (e.moving && e.departAt > now && !instant) moving = true;
        else if (e.moving) { moving = stepPath(e, dt, { instant, speed: this.speed, lifts: this.lifts, metric: this.layout.metric, arriveDistance: this.layout.arriveDistance }) || moving; this.scene.moved(e); }
        if (e.repath && !e.ride && e.dest) { e.repath = false; startPath(e, this.layout.route([e.x, e.y], e.dest.location, e.dest.target), now); moving = true; }
        if (e.errand) { this.stepHandoff(e, now); moving = true; }
      } else if (e.kind === 'npc') {
        const p = npcAt(instant ? 0 : t, e.npc, e.index);
        e.x = p.x; e.y = p.y; e.facing = p.facing; e.pose = p.pose; e.stride = p.stride; this.scene.moved(e);
      }
    }
    for (const e of this.scene.entities.values()) if (e.kind === 'task' && e.follow) {
      const a = this.scene.get(e.follow);
      if (a) { e.x = a.x + a.w / 2; e.y = a.y - a.h * 0.9; this.scene.moved(e); }
    }
    this.activity = this.roomActivity();
    return moving;
  }
  // Semantic room state (brief §7): a room is "in use" only while a real agent is doing real work there.
  roomActivity() {
    const rooms = {}, stations = {};
    for (const e of this.scene.entities.values()) {
      if (e.kind !== 'agent' || !e.agent || e.moving) continue;
      const a = e.agent, place = this.places[a.id];
      if (!place || !PRODUCTIVE.has(a.activity)) continue;
      rooms[place.location] = Math.min(1, (rooms[place.location] ?? 0) + 0.7);
      stations[`${place.location}:${place.station}`] = { agentId: a.id, color: a.appearance?.color };
    }
    const w = this.world;
    const building = w ? Object.values(w.tasks).some(t => t.status === 'active') : false;
    const releasing = w ? [...Object.values(w.deploys), ...Object.values(w.builds)].some(d => d.state === 'running') : false;
    if (releasing) rooms.deploy = 1;
    return { rooms, stations, construction: building || releasing ? 1 : 0 };
  }
}
