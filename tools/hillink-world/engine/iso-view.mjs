// The object-built World's view: WorldView (state -> places -> paths) plus a character controller.
// The controller turns semantic state and motion into one animation state per character, via play():
//   idle, react, stand, sit, walk, carry, work, type, inspect, read, talk, meeting, blocked, waiting, celebrate, offline.
// Truth rule: work/type/inspect/read play only for a productive activity, at the assigned station, after arriving.
import { WorldView } from './world-view.mjs';
import { startPath } from './motion.mjs';
import { hash } from './ambience.mjs';

export const STATES = ['idle', 'react', 'stand', 'sit', 'walk', 'carry', 'work', 'type', 'inspect', 'read', 'talk', 'meeting', 'blocked', 'waiting', 'celebrate', 'offline'];
export const PRODUCTIVE_STATES = new Set(['work', 'type', 'inspect', 'read']);
const REACT_MS = 450, STAND_MS = 520, SIT_MS = 480, CELEBRATE_MS = 2600;
const IDLE_USES = new Set(['relax', 'look', 'coffee', 'snack', 'table', 'lean']);

// Semantic animation API: play(entity, 'walk'). Restarts the clip only when the state changes.
export function play(e, state, now) {
  if (e.anim?.state !== state) e.anim = { state, since: now };
  return e.anim;
}

// Which state a character should show right now. Pure; reads the entity and its agent.
export function resolveState(e, now) {
  if (e.departAt > now) return now < (e.reactEnd ?? 0) ? 'react' : e.posture === 'sit' ? 'stand' : 'react';
  if (e.gait === 'walk' || e.gait === 'board') return e.carrying ? 'carry' : 'walk';
  if (e.gait === 'wait-lift' || e.gait === 'ride') return e.carrying ? 'carry' : 'idle';
  if (e.errand) return e.errand.phase === 'give' ? 'talk' : 'carry';
  if (e.receiving) return 'talk';
  if (e.sitUntil > now) return 'sit';
  const a = e.agent; if (!a) return 'idle';
  const atStation = !e.moving && e.spot != null && e.spot === e.placeKey;
  switch (a.activity) {
    case 'coding': return atStation ? (e.posture === 'sit' ? 'type' : 'work') : 'idle';
    case 'thinking': return atStation ? 'work' : 'idle';
    case 'reviewing': case 'testing': return atStation ? 'inspect' : 'idle';
    case 'researching': return atStation ? 'read' : 'idle';
    case 'communicating': return a.meetingId ? (atStation ? 'meeting' : 'idle') : 'talk';
    case 'waiting': return 'waiting';
    case 'error': return 'blocked';
    case 'completed': return now - (e.clipStart ?? 0) < CELEBRATE_MS ? 'celebrate' : 'idle';
    case 'offline': return 'offline';
    default: return 'idle';
  }
}

export class IsoWorldView extends WorldView {
  constructor(scene, effects, layout, scenery) {
    super(scene, effects, layout, scenery);
    for (const l of Object.values(this.lifts)) { l.ambient = false; l.floors = layout.lifts[l.id]?.floors; l.speed = scenery?.liftSpeed ?? l.speed; }
  }
  syncAgents(world, now, rebuild) {
    super.syncAgents(world, now, rebuild);
    for (const e of this.scene.entities.values()) if (e.kind === 'agent') {
      const p = this.places[e.ref.id];
      e.placeKey = p && !p.overflow ? `${p.location}:${p.station}` : null;
    }
  }
  // Every trip starts with a beat: the character notices, stands up if seated, then sets off.
  goTo(e, place, target, now) {
    super.goTo(e, place, target, now);
    this.depart(e, now, true);
  }
  chase(from, to, now) { super.chase(from, to, now); if (!from.departAt) this.depart(from, now, false); }
  depart(e, now, react) {
    if (!e.moving || e.ride) return;
    const r = react && !e.fresh ? REACT_MS : 0;
    e.reactEnd = now + r;
    e.departAt = now + r + (e.posture === 'sit' ? STAND_MS : 0) + (r || e.posture === 'sit' ? 0 : 1);
    e.spot = null;
  }
  step(dt, now, opts, stepPath) {
    const moving = super.step(dt, now, opts, stepPath);
    let busy = false;
    for (const e of this.scene.entities.values()) if (e.kind === 'agent') busy = this.control(e, now, opts.instant) || busy;
    return moving || busy;
  }
  // Per-character controller: arrivals, sitting, standing, facing, idle wandering, and the animation state.
  control(e, now, instant) {
    if (e.departAt && now >= e.departAt) { e.departAt = 0; e.posture = 'stand'; }
    if (e.moving || e.departAt) { e.wasMoving = true; e.spot = null; }
    else if (e.spot == null) {
      // Arrived (or placed directly): which interaction point is this, if any?
      const info = this.pointAt(e.x, e.y);
      e.spot = info ? `${info.room}:${info.id}` : '';
      e.spotInfo = info;
      if (info) e.dir = info.facing;
      else if (!e.dir || e.dir === 'back') e.dir = 'front';
      const sit = info?.pose === 'sit';
      if (sit && e.posture !== 'sit') { e.posture = 'sit'; if (e.wasMoving && !instant) e.sitUntil = now + SIT_MS; }
      if (!sit) e.posture = 'stand';
      e.wasMoving = false; e.fresh = false;
      e.nextWander = now + 16000 + hash(e.id.length * 7.7 + now / 997) * 26000;
    }
    const state = resolveState(e, now);
    play(e, state, now);
    // Idle agents in the Break Room drift between its spots now and then (ambient, never "work").
    if (!instant && state === 'idle' && e.agent?.activity === 'idle' && !e.errand && e.spot && now > (e.nextWander ?? Infinity)) this.wander(e, now);
    return e.departAt > now || e.sitUntil > now || state === 'react';
  }
  pointAt(x, y) {
    for (const info of Object.values(this.layout.stationInfo)) if (Math.hypot(info.point[0] - x, info.point[1] - y) < 2) return info;
    return null;
  }
  wander(e, now) {
    const here = this.layout.stationInfo[e.spot];
    e.nextWander = now + 18000 + hash(now / 1000 + e.id.length) * 30000;
    if (here?.room !== 'lounge') return;
    const taken = new Set();
    for (const o of this.scene.entities.values()) if (o.kind === 'agent' && o !== e) { if (o.spot) taken.add(o.spot); if (o.placeKey) taken.add(o.placeKey); if (o.dest) taken.add(`${o.dest.location}:${this.pointAt(...o.dest.target)?.id}`); }
    const free = Object.values(this.layout.stationInfo).filter(p => p.room === 'lounge' && IDLE_USES.has(p.use) && !taken.has(`lounge:${p.id}`) && `lounge:${p.id}` !== e.spot);
    if (!free.length) return;
    const pick = free[Math.floor(hash(now / 1000 + e.id.charCodeAt(0)) * free.length)];
    e.dest = { location: 'lounge', target: pick.point };
    startPath(e, this.layout.route([e.x, e.y], 'lounge', pick.point), now);
    this.depart(e, now, false);
  }
}
