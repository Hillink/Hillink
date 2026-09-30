// The object-built World's view: WorldView (state -> places -> paths) plus a character controller.
// The controller turns semantic state and motion into one animation state per character, via play():
//   idle, react, stand, sit, walk, carry, work, type, inspect, read, talk, meeting, blocked, waiting, celebrate, offline,
//   plus assemble/survey at a construction site (only for a real piece of pass evidence that just arrived).
// Truth rule: work/type/inspect/read play only for a productive activity, at the assigned station, after arriving.
import { WorldView } from './world-view.mjs';
import { LAYERS } from './scene.mjs';
import { startPath } from './motion.mjs';
import { stationPoint } from '../core/behavior.mjs';
import { hash } from './ambience.mjs';

export const STATES = ['idle', 'react', 'stand', 'sit', 'walk', 'carry', 'work', 'type', 'inspect', 'read', 'talk', 'meeting', 'blocked', 'waiting', 'celebrate', 'offline', 'assemble', 'survey'];
export const PRODUCTIVE_STATES = new Set(['work', 'type', 'inspect', 'read']);
const REACT_MS = 450, STAND_MS = 520, SIT_MS = 480, CELEBRATE_MS = 2600;
const SITE_MS = 6500, VISIT_FRESH_MS = 20 * 60 * 1000; // a site visit is for evidence from the last 20 minutes
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
  if (e.visit?.phase === 'work' && !e.moving) return e.visit.kind === 'commit' ? 'assemble' : 'survey';
  if (e.receiving) return 'talk';
  if (e.sitUntil > now) return 'sit';
  const a = e.agent; if (!a) return 'idle';
  const atStation = !e.moving && e.spot != null && e.spot === e.placeKey;
  switch (a.activity) {
    case 'coding': return atStation ? (e.posture === 'sit' ? 'type' : 'work') : 'idle';
    case 'thinking': return atStation ? 'work' : 'idle';
    case 'coordinating': return e.moving || e.departAt > now ? 'idle' : 'inspect'; // in place: no trip for a few-second turn
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

// What the body is doing, in words (never the job: "coding" is not shown while walking to the desk).
const PRODUCTIVE_WORDS = { coordinating: 'Coordinating', coding: 'Typing', thinking: 'Thinking at desk', reviewing: 'Inspecting', testing: 'Running checks', researching: 'Reading' };
export function actionText(e, layout) {
  const st = e.anim?.state ?? 'idle', a = e.agent;
  const where = e.dest?.location ? layout?.locationById?.[e.dest.location]?.name : null;
  switch (st) {
    case 'walk': if (e.visit) return e.visit.phase === 'back' ? 'Walking back from the site' : 'Walking to the construction site';
      return e.ride ? 'Walking to the elevator' : where ? `Walking to ${where}` : 'Walking';
    case 'carry': return e.errand ? 'Carrying a handoff' : where ? `Carrying to ${where}` : 'Carrying';
    case 'react': return 'Noticed new work';
    case 'stand': return 'Getting up';
    case 'sit': return 'Sitting down';
    case 'type': case 'work': case 'inspect': case 'read': return PRODUCTIVE_WORDS[a?.activity] ?? 'Working';
    case 'talk': return e.errand ? 'Handing off' : e.receiving ? 'Receiving a handoff' : 'Talking';
    case 'meeting': return 'In a meeting';
    case 'assemble': return `Installing commit ${e.visit?.ref?.slice(0, 7) ?? ''}`.trim();
    case 'survey': return e.visit?.state === 'changes_requested' ? 'Marking changes on the site' : 'Inspecting the site';
    case 'blocked': return 'Blocked';
    case 'waiting': return 'Waiting';
    case 'celebrate': return 'Finished';
    case 'offline': return 'Offline';
    default:
      if (e.gait === 'ride') return 'Riding the elevator';
      if (e.gait === 'wait-lift') return 'Waiting for the elevator';
      return 'Idle';
  }
}

export class IsoWorldView extends WorldView {
  constructor(scene, effects, layout, scenery) {
    super(scene, effects, layout, scenery);
    for (const l of Object.values(this.lifts)) { l.ambient = false; l.floors = layout.lifts[l.id]?.floors; l.speed = scenery?.liftSpeed ?? l.speed; }
  }
  sync(world, changed, now) {
    super.sync(world, changed, now);
    if (changed.has('*') || changed.has('meetings')) this.syncMeetings(world);
    if (changed.has('*') || [...changed].some(k => k.startsWith('pass:'))) this.syncPasses(world, changed.has('*'), now);
  }
  // Construction sites are clickable; new real evidence sends its agent to the site for a short visit.
  // A rebuild (page load, reconnect, replay) only records what is already there: nobody walks for history.
  syncPasses(world, rebuild, now) {
    this.passSeen ??= new Map();
    for (const [id, e] of this.scene.entities) if (e.kind === 'pass' && !world.passes?.[e.ref.id]) this.scene.remove(id);
    for (const pass of Object.values(world.passes ?? {})) {
      const s = pass.structures?.[0];
      if (s) {
        const [x, y] = this.layout.P.at((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.floor, s.h / 2);
        const e = this.scene.get(`pass:${pass.id}`) ?? this.scene.add({ id: `pass:${pass.id}`, kind: 'pass', layer: LAYERS.effect, x, y, w: (s.x1 - s.x0) * 0.9, h: s.h + 20, selectable: true, ref: { type: 'pass', id: pass.id } });
        e.pass = pass;
      }
      // First sight of a pass is history too (the first construction poll after a page load).
      const known = this.passSeen.has(pass.id), seen = this.passSeen.get(pass.id) ?? new Set(), fresh = [];
      for (const [key, ev] of Object.entries(pass.evidence ?? {})) if (!seen.has(key)) { seen.add(key); fresh.push(ev); }
      this.passSeen.set(pass.id, seen);
      if (rebuild || !known || !s) continue;
      for (const ev of fresh) if ((ev.kind === 'commit' || ev.kind === 'review') && ev.by && Date.now() - ev.at < VISIT_FRESH_MS) this.visitSite(ev, pass, s, now);
    }
  }
  visitSite(ev, pass, s, now) {
    const e = this.scene.get(`agent:${ev.by}`), a = e?.agent;
    // Only a free body walks: never one doing its own work or offline. One that is mid-errand, in the lift
    // or already on site goes when it is free (within a minute), so the visit still matches the evidence.
    if (!e || !a || !['idle', 'completed'].includes(a.activity)) return;
    if (e.ride || e.errand || e.visit || e.departAt > now) { e.pendingVisit = { ev, pass, s, until: now + 60000 }; return; }
    e.pendingVisit = null;
    const key = s.sitePoints?.[ev.kind === 'commit' ? 0 : 1] ?? s.sitePoints?.[0];
    const info = Object.values(this.layout.stationInfo).find(p => p.id === key);
    if (!info) return;
    e.visit = { phase: 'go', kind: ev.kind, ref: ev.ref, state: ev.state ?? null, passId: pass.id, spot: `${info.room}:${info.id}` };
    e.dest = { location: info.room, target: info.point };
    startPath(e, this.layout.route([e.x, e.y], info.room, info.point), now);
    this.depart(e, now, true);
  }
  visitStep(e, now) {
    const v = e.visit;
    if (v.phase === 'go' && !e.moving && !e.departAt && e.spot === v.spot) { v.phase = 'work'; v.until = now + SITE_MS; }
    else if (v.phase === 'go' && !e.moving && !e.departAt && e.spot != null && e.spot !== v.spot) e.visit = null; // could not reach it
    else if (v.phase === 'work' && now >= v.until) {
      v.phase = 'back';
      const place = this.places[e.ref.id];
      if (place) { const target = stationPoint(place, this.layout); e.dest = { location: place.location, target }; startPath(e, this.layout.route([e.x, e.y], place.location, target), now); e.spot = null; }
    } else if (v.phase === 'back' && !e.moving) e.visit = null;
  }
  // A live meeting is a clickable object at the meeting table (topic, participants, decision, evidence, outcome).
  syncMeetings(world) {
    const table = this.layout.def?.FURNITURE?.find(f => f.id === 'table');
    for (const [id, e] of this.scene.entities) if (e.kind === 'meeting' && !world.meetings?.[e.ref.id]) this.scene.remove(id);
    if (!table) return;
    const [x, y] = this.layout.P.at(table.x, table.z, table.floor, table.h + 14);
    for (const m of Object.values(world.meetings ?? {})) {
      const e = this.scene.get(`meeting:${m.id}`) ?? this.scene.add({ id: `meeting:${m.id}`, kind: 'meeting', layer: LAYERS.effect, x, y, w: 26, h: 22, selectable: true, ref: { type: 'meeting', id: m.id } });
      e.meeting = m;
    }
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
    e.visit = null; e.pendingVisit = null; // real work always wins over a site visit
    // Already standing (or sitting) on the new spot: nothing to walk, so no reaction, no standing up.
    if (!e.moving && !e.ride && Math.hypot(target[0] - e.x, target[1] - e.y) < 1) { e.dest = { location: place.location, target }; return; }
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
    if (e.visit) this.visitStep(e, now);
    else if (e.pendingVisit) { const pv = e.pendingVisit; e.pendingVisit = null; if (now < pv.until) this.visitSite(pv.ev, pv.pass, pv.s, now); }
    const state = resolveState(e, now);
    play(e, state, now);
    // Idle agents in the Break Room drift between its spots now and then (ambient, never "work").
    if (!instant && state === 'idle' && e.agent?.activity === 'idle' && !e.errand && !e.visit && e.spot && now > (e.nextWander ?? Infinity)) this.wander(e, now);
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
