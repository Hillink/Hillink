// The object-built World's view: WorldView (state -> places -> paths) plus a character controller.
// The controller turns semantic state and motion into one animation state per character, via play():
//   idle, react, stand, sit, walk, carry, work, type, inspect, read, talk, meeting, blocked, waiting, celebrate, offline,
//   plus assemble/survey at a construction site (only for a real piece of pass evidence that just arrived).
// Truth rule: work/type/inspect/read play only for a productive activity, at the assigned station, after arriving.
import { WorldView } from './world-view.mjs';
import { LAYERS } from './scene.mjs';
import { startPath } from './motion.mjs';
import { stationPoint } from '../core/behavior.mjs';
import { hash, occasional } from './ambience.mjs';
import { turnToward } from './motion.mjs';
import { intentOf, setClip, FACING_ANGLE, BUILD_CLIP, variantOfProject } from './animation.mjs';
import { publicSpots, npcPlan } from './npcs.mjs';
import { transitionOf, planJourney, JOURNEY_WORDS } from './journey.mjs';

export const STATES = ['idle', 'react', 'stand', 'sit', 'walk', 'carry', 'work', 'type', 'inspect', 'read', 'talk', 'meeting', 'blocked', 'waiting', 'celebrate', 'offline', 'assemble', 'survey', 'measure', 'dig', 'paint', 'install', 'lift', 'pickup', 'file', 'frustrated', 'phone', 'stretch', 'watch', 'chat'];
export const PRODUCTIVE_STATES = new Set(['work', 'type', 'inspect', 'read']);
// Construction clips (Pass 5C): played only at a real site station for a verified activity (resolveState).
export const SITE_STATES = new Set(['assemble', 'survey', 'measure', 'dig', 'paint', 'install', 'lift', 'pickup']);
const REACT_MS = 450, STAND_MS = 520, SIT_MS = 480, CELEBRATE_MS = 2600;
const LOOP_MS = 9000; // a builder's or inspector's site loop comes round every LOOP_MS or so (varied per character)
const SITE_MS = 6500, VISIT_FRESH_MS = 20 * 60 * 1000; // a site visit is for evidence from the last 20 minutes
const IDLE_USES = new Set(['relax', 'look', 'coffee', 'snack', 'table', 'lean']);

// Semantic animation API: play(entity, 'walk'). Restarts the clip only when the state changes.
// Pass 5C: the previous clip is remembered so the renderer can blend (engine/animation.mjs setClip).
export function play(e, state, now) { return setClip(e, state, now, { intent: e.anim?.intent ?? null, variant: e.anim?.variant ?? null }); }

// Which state a character should show right now. Pure; reads the entity, its agent and (for a construction site)
// the canonical project it stands at (layout.projects).
export function resolveState(e, now, layout = null) {
  if (e.departAt > now) return now < (e.reactEnd ?? 0) ? 'react' : e.posture === 'sit' ? 'stand' : 'react';
  if (e.gait === 'walk' || e.gait === 'board' || (e.moving && !e.gait && !e.ride)) return e.carrying ? 'carry' : 'walk'; // setting off counts as walking
  if (e.gait === 'wait-lift' || e.gait === 'ride') return e.carrying ? 'carry' : 'idle';
  if (e.errand) return e.errand.phase === 'give' ? 'talk' : 'carry';
  if (e.visit?.phase === 'work' && !e.moving) return e.visit.kind === 'commit' ? 'assemble' : 'survey';
  if (e.loop?.phase === 'work' && !e.moving) return e.loop.clip;
  if (e.journey && e.journey.phase === 'hold' && !e.moving) return e.journey.legs[e.journey.i]?.clip ?? 'idle';
  if (e.receiving) return 'talk';
  if (e.sitUntil > now) return 'sit';
  const a = e.agent; if (!a) return 'idle';
  const atStation = !e.moving && !e.faceGoal && e.spot != null && e.spot === e.placeKey;
  // Pass 5B/5C: at a construction site a productive agent builds, with the clip of the project's real stage, or
  // inspects the work. While the project is under inspection, builders pause rather than build.
  const use = e.spotInfo?.use, siteId = String(e.spot ?? '').match(/^site:([^:]+):/)?.[1], project = siteId ? layout?.projects?.[siteId] : null;
  if (atStation && (use === 'build' || use === 'site-inspect') && ['testing', 'reviewing'].includes(a.activity)) return 'survey';
  if (atStation && use === 'build' && ['coding', 'thinking', 'researching'].includes(a.activity)) {
    if (project?.stage === 'inspection') return 'idle';
    return BUILD_CLIP[project ? variantOfProject(project) : 'structure'] ?? 'assemble';
  }
  if (atStation && use === 'site-inspect' && ['coding', 'thinking'].includes(a.activity)) return 'survey';
  switch (a.activity) {
    case 'coding': return atStation ? (e.posture === 'sit' ? 'type' : 'work') : 'idle';
    case 'thinking': return atStation ? 'work' : 'idle';
    case 'coordinating': return e.moving || e.departAt > now ? 'idle' : 'inspect'; // in place: no trip for a few-second turn
    case 'reviewing': case 'testing': return atStation ? 'inspect' : 'idle';
    case 'researching': return atStation ? 'read' : 'idle';
    case 'communicating': return a.meetingId ? (atStation ? 'meeting' : 'idle') : 'talk';
    case 'waiting': return occasional(now / 1000, { every: 13, duration: 2.2, chance: 0.8, seed: seedOf(e) }) >= 0 ? 'watch' : 'waiting';
    case 'error': return 'blocked';
    case 'completed': return now - (e.clipStart ?? 0) < CELEBRATE_MS ? 'celebrate' : 'idle';
    case 'offline': return 'offline';
    default: return idleVariant(e, now);
  }
}
// Idle life (cosmetic, only for a truly idle agent standing or sitting at its spot): chatting with another idle agent
// nearby, checking a phone when seated, now and then a stretch. Deterministic per agent and time window.
const seedOf = e => { let h = 0; for (const c of String(e.id)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) % 997; };
function idleVariant(e, now) {
  if (e.agent?.activity !== 'idle' || e.moving || e.departAt > now || !e.spot) return 'idle';
  const t = now / 1000, sd = seedOf(e);
  if (e.chatWith) return occasional(t, { every: 6, duration: 3.2, seed: sd }) >= 0 ? 'chat' : 'idle';
  if (e.posture === 'sit' && e.spotInfo?.use !== 'coffee' && occasional(t, { every: 22, duration: 8, chance: 0.75, seed: sd }) >= 0) return 'phone';
  if (e.posture !== 'sit' && occasional(t, { every: 28, duration: 2.6, chance: 0.6, seed: sd + 5 }) >= 0) return 'stretch';
  return 'idle';
}

// What the body is doing, in words (never the job: "coding" is not shown while walking to the desk).
const PRODUCTIVE_WORDS = { coordinating: 'Coordinating', coding: 'Typing', thinking: 'Thinking at desk', reviewing: 'Inspecting', testing: 'Running checks', researching: 'Reading' };
export function actionText(e, layout) {
  const st = e.anim?.state ?? 'idle', a = e.agent;
  const where = e.dest?.location ? layout?.locationById?.[e.dest.location]?.name : null;
  switch (st) {
    case 'walk': if (e.journey) return e.journey.kind === 'start' && e.carrying ? JOURNEY_WORDS.start : e.journey.kind === 'start' ? 'Going to pick up the task' : e.journey.kind === 'finish' ? 'Taking the finished task to the archive' : 'Walking';
      if (e.loop) return e.loop.kind === 'haul' ? (e.loop.phase === 'back' ? 'Carrying materials' : 'Fetching materials') : 'Walking the site';
      if (e.visit) return e.visit.phase === 'back' ? 'Walking back from the site' : 'Walking to the construction site';
      return e.ride ? 'Walking to the elevator' : where ? `Walking to ${where}` : 'Walking';
    case 'carry': if (e.journey) return e.journey.kind === 'finish' ? 'Taking the finished task to the archive' : JOURNEY_WORDS.start;
      if (!e.errand && !e.loop && e.agent?.taskId) return 'Carrying the task to the desk';
      if (e.loop) return 'Carrying materials';
      return e.errand ? 'Carrying a handoff' : where ? `Carrying to ${where}` : 'Carrying';
    case 'react': return 'Noticed new work';
    case 'stand': return 'Getting up';
    case 'sit': return 'Sitting down';
    case 'type': case 'work': case 'inspect': case 'read': return PRODUCTIVE_WORDS[a?.activity] ?? 'Working';
    case 'talk': return e.errand ? 'Handing off' : e.receiving ? 'Receiving a handoff' : 'Talking';
    case 'meeting': return 'In a meeting';
    case 'assemble': return e.visit ? `Installing commit ${e.visit?.ref?.slice(0, 7) ?? ''}`.trim() : `Building ${where ?? 'on site'}`.replace(/: .*$/, '');
    case 'measure': return 'Surveying the site';
    case 'dig': return 'Laying the foundation';
    case 'paint': return 'Finishing the exterior';
    case 'install': return e.anim?.variant === 'repair' ? 'Reworking after review' : 'Installing systems';
    case 'lift': return 'Fitting furniture';
    case 'pickup': return e.journey ? 'Picking up the task from the board' : e.loop?.kind === 'haul' ? 'Collecting materials' : 'Picking up';
    case 'file': return 'Filing the finished task';
    case 'frustrated': return 'Blocked';
    case 'phone': return 'On break: checking phone';
    case 'stretch': return 'Stretching';
    case 'watch': return 'Waiting: checking the time';
    case 'chat': return 'Chatting';
    case 'survey': return e.visit ? (e.visit?.state === 'changes_requested' ? 'Marking changes on the site' : 'Inspecting the site') : 'Inspecting the construction';
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
    if (layout.generated) this.initAmbient(); else this.ambient = [];
  }
  // Pass 5C: ambient people (engine/npcs.mjs). Created once per layout; stepped with the same locomotion as agents.
  initAmbient() {
    const L = this.layout, plaza = L.locationById.plaza?.door;
    this.ambientSpots = publicSpots(L);
    if (!plaza || this.ambientSpots.length < 2) { this.ambient = []; return; }
    this.ambientSpots.push({ key: 'plaza:outside', room: 'plaza', point: plaza, pose: 'stand', facing: 'front', use: 'look' });
    const n = L.ambientCount ?? Math.min(4, Math.max(2, Math.floor(this.ambientSpots.length / 3))); // a layout may ask for more
    this.ambient = Array.from({ length: n }, (_, i) => this.scene.add({ id: `ambient:${i}`, kind: 'ambient', layer: LAYERS.agent, x: plaza[0], y: plaza[1], w: this.size.agent[0], h: this.size.agent[1], anchor: 'feet', index: i, plan: npcPlan(i, L.world?.seed?.length ?? 0), phase: 'away', trip: 0, trips: 0, alpha: 0, facing: 1, dir: 'front', heading: Math.PI / 2 }));
  }
  stepAmbient(e, dt, now, instant, stepPath) {
    const P = e.plan, L = this.layout, spots = this.ambientSpots;
    e.t0 ??= now;
    const clip = s => setClip(e, s, now, { intent: s === 'walk' ? 'walking' : 'onBreak', variant: 'ambient' });
    if (e.phase === 'away') { e.alpha = 0; if (now - e.t0 >= (e.returnAt ?? P.arriveAt)) { e.phase = 'arriving'; e.trips = 0; e.x = spots.at(-1).point[0]; e.y = spots.at(-1).point[1]; this.nextAmbient(e, now); } return false; }
    if (e.standUntil > now) { clip('stand'); return true; }
    if (e.moving) {
      stepPath(e, dt, { instant, speed: this.speed * 0.9, lifts: this.lifts, metric: L.metric, arriveDistance: L.arriveDistance });
      e.alpha = Math.min(1, e.alpha + dt * 2); this.scene.moved(e); clip(e.moving ? 'walk' : 'idle');
      if (!e.moving) { e.arrivedAt = now; const s = e.target; e.faceGoal = s?.facing ?? null; e.pendingSit = s?.pose === 'sit'; }
      return true;
    }
    if (e.faceGoal) { turnToward(e, FACING_ANGLE[e.faceGoal], dt); if (Math.abs(Math.atan2(Math.sin(e.heading - FACING_ANGLE[e.faceGoal]), Math.cos(e.heading - FACING_ANGLE[e.faceGoal]))) < 0.02) { e.dir = e.faceGoal; e.faceGoal = null; } clip('idle'); return true; }
    if (e.pendingSit) { e.pendingSit = false; e.posture = 'sit'; e.sitUntil = now + SIT_MS; }
    if (e.sitUntil > now) { clip('sit'); return true; }
    e.use = e.target?.use; clip('idle');
    // Agents always have right of way: if an agent is placed at (or heading to) this spot, move on.
    if (e.phase === 'visiting' && e.target && now > (e.checkAt ?? 0)) { e.checkAt = now + 1000; for (const o of this.scene.entities.values()) if (o.kind === 'agent' && (o.placeKey === e.target.key || o.spot === e.target.key)) { e.stayUntil = now; break; } }
    if (e.phase === 'leaving') { e.alpha = Math.max(0, e.alpha - dt * 1.5); if (e.alpha <= 0) { e.phase = 'away'; e.returnAt = now - e.t0 + 20000 + hash(e.index * 3.3 + e.trip) * 25000; } return true; }
    if (now >= e.stayUntil) {
      if (e.posture === 'sit') { e.posture = 'stand'; e.standUntil = now + STAND_MS; return true; }
      this.nextAmbient(e, now);
    }
    return false;
  }
  // The next destination: a free public spot (never one an agent or another ambient person uses or is heading to),
  // or, after a few stays, the way out.
  nextAmbient(e, now) {
    const P = e.plan, spots = this.ambientSpots, L = this.layout;
    const taken = new Set();
    for (const o of this.scene.entities.values()) { if (o.kind === 'agent') { taken.add(o.spot); taken.add(o.placeKey); if (o.dest) taken.add(`${o.dest.location}:${this.pointAt(...o.dest.target)?.id}`); } if (o.kind === 'ambient' && o !== e && o.target) taken.add(o.target.key); }
    let target;
    if (e.trips >= P.tripsBeforeLeaving) { target = spots.at(-1); e.phase = 'leaving'; }
    else {
      const free = spots.filter(s => s.key !== e.target?.key && (s.key === 'plaza:outside' || !taken.has(s.key)));
      target = free[P.pick(e.trip, free.length)] ?? spots.at(-1);
      e.phase = 'visiting';
    }
    const path = L.route([e.x, e.y], target.room, target.point);
    e.trip += 1; e.trips += 1; e.target = target; e.use = null; e.stayUntil = now + P.stayMs(e.trip) + (path ? 0 : 5000);
    if (path) startPath(e, path, now);
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
    // Living HQ: note which real transition each agent just made, so goTo can turn it into a journey.
    this.seen ??= {}; this.pendingTransition = {};
    for (const a of Object.values(world.agents)) { if (!rebuild) this.pendingTransition[a.id] = transitionOf(this.seen[a.id], a); this.seen[a.id] = { activity: a.activity, taskId: a.taskId ?? null }; }
    super.syncAgents(world, now, rebuild);
    for (const e of this.scene.entities.values()) if (e.kind === 'agent') {
      const p = this.places[e.ref.id];
      e.placeKey = p && !p.overflow ? `${p.location}:${p.station}` : null;
    }
  }
  // Every trip starts with a beat: the character notices, stands up if seated, then sets off.
  goTo(e, place, target, now) {
    e.visit = null; e.pendingVisit = null; e.loop = null; e.carrying = e.errand ? e.carrying : false; // real work always wins over a site visit
    // A real transition becomes a journey through the places it stands for (engine/journey.mjs).
    const kind = this.pendingTransition?.[e.ref.id]; e.journey = null;
    if (kind) {
      const legs = planJourney(kind, this.layout.fixtures);
      if (legs.length) {
        e.journey = { kind, legs, i: 0, final: { place, target }, phase: 'go', since: now };
        this.startLeg(e, now);
        return;
      }
    }
    // Already standing (or sitting) on the new spot: nothing to walk, so no reaction, no standing up.
    if (!e.moving && !e.ride && Math.hypot(target[0] - e.x, target[1] - e.y) < 1) { e.dest = { location: place.location, target }; return; }
    super.goTo(e, place, target, now);
    this.depart(e, now, true);
  }
  // The next leg of a journey (or its final destination): walk there, or hold in place for a beat.
  startLeg(e, now) {
    const J = e.journey, leg = J.legs[J.i];
    if (!leg) { const { place, target } = J.final; e.journey = null; e.dest = { location: place.location, target }; startPath(e, this.layout.route([e.x, e.y], place.location, target), now); this.depart(e, now, false); return; }
    if (!leg.to) { J.phase = 'hold'; J.until = now + leg.ms; e.carrying = !!leg.carry; return; }
    J.phase = 'go'; e.carrying = !!leg.carry;
    e.dest = { location: leg.location, target: leg.to };
    startPath(e, this.layout.route([e.x, e.y], leg.location, leg.to), now);
    this.depart(e, now, J.i === 0);
  }
  stepJourney(e, now) {
    const J = e.journey, leg = J.legs[J.i]; if (!leg) return;
    if (J.phase === 'go' && !e.moving && !e.departAt) { if (leg.face) e.faceGoal = leg.face; J.phase = 'turn'; }
    else if (J.phase === 'turn' && !e.faceGoal) { J.phase = 'hold'; J.until = now + leg.ms; }
    else if (J.phase === 'hold' && now >= J.until) { e.carrying = !!leg.carryAfter; J.i += 1; this.startLeg(e, now); }
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
    for (const e of this.ambient ?? []) busy = this.stepAmbient(e, dt, now, opts.instant, stepPath) || busy;
    return moving || busy;
  }
  // Per-character controller: arrivals, turning to face, sitting, standing, the site work loop, idle wandering, and
  // the animation state (body clip plus intent, engine/animation.mjs).
  control(e, now, instant) {
    const dt = Math.min(0.1, Math.max(0.001, (now - (e.lastControl ?? now)) / 1000)); e.lastControl = now;
    if (e.departAt && now >= e.departAt) { e.departAt = 0; e.posture = 'stand'; }
    if (e.moving || e.departAt) { e.wasMoving = true; e.spot = null; e.faceGoal = null; e.pendingSit = false; }
    else if (e.spot == null) {
      // Arrived (or placed directly): which interaction point is this, if any?
      const info = this.pointAt(e.x, e.y);
      e.spot = info ? `${info.room}:${info.id}` : '';
      e.spotInfo = info;
      const sit = info?.pose === 'sit', goal = info?.facing ?? (!e.dir || e.dir === 'back' ? 'front' : null);
      if (instant || !e.wasMoving) {
        // Placed directly (page load, replay): already in pose.
        if (goal) { e.dir = goal; e.heading = FACING_ANGLE[goal]; }
        e.posture = sit ? 'sit' : 'stand';
      } else {
        // Arrived on foot: turn to face what is used here (the desk, the printer, the site), then sit if it is a seat.
        e.faceGoal = goal; e.pendingSit = sit;
        if (!sit) e.posture = 'stand';
      }
      e.wasMoving = false; e.fresh = false;
      e.nextWander = now + 16000 + hash(e.id.length * 7.7 + now / 997) * 26000;
      e.nextLoop = now + LOOP_MS * (0.6 + hash(e.id.length * 3.1 + now / 1009) * 0.8);
    }
    if (e.faceGoal) {
      if (instant) { e.dir = e.faceGoal; e.heading = FACING_ANGLE[e.faceGoal]; e.faceGoal = null; }
      else { turnToward(e, FACING_ANGLE[e.faceGoal], dt); if (Math.abs(Math.atan2(Math.sin(e.heading - FACING_ANGLE[e.faceGoal]), Math.cos(e.heading - FACING_ANGLE[e.faceGoal]))) < 0.02) { e.dir = e.faceGoal; e.faceGoal = null; } }
    }
    if (!e.faceGoal && e.pendingSit) { e.pendingSit = false; if (e.posture !== 'sit') { e.posture = 'sit'; if (!instant) e.sitUntil = now + SIT_MS; } }
    // Chat partners: both idle and at rest at their own spots in the same room, a few metres apart. Checked every frame
    // for the current partner (a partner who walks off ends the chat at once), and every 0.9 s for a new one.
    const restingIdle = o => o.agent?.activity === 'idle' && !o.moving && !o.departAt && !o.visit && !o.loop && o.spot && o.spotInfo?.room;
    const near = o => o !== e && o.kind === 'agent' && restingIdle(o) && o.spotInfo.room === e.spotInfo?.room && Math.hypot(o.x - e.x, o.y - e.y) < this.size.agent[1] * 2.4;
    if (e.chatWith) { const o = this.scene.get(e.chatWith); if (!o || !restingIdle(e) || !near(o)) e.chatWith = null; }
    if (!instant && !e.chatWith && now > (e.chatCheck ?? 0)) { e.chatCheck = now + 900; if (restingIdle(e)) for (const o of this.scene.entities.values()) if (near(o)) { e.chatWith = o.id; if (!e.faceGoal && e.posture !== 'sit') { const dx = o.x - e.x; e.faceGoal = Math.abs(dx) > 2 ? (dx < 0 ? 'left' : 'right') : e.dir; } break; } }
    if (e.journey) this.stepJourney(e, now);
    else if (e.carrying && !e.errand && !e.loop && !e.moving && e.spot && e.spot === e.placeKey) e.carrying = false; // set the task down at the desk
    if (e.visit) this.visitStep(e, now);
    else if (e.pendingVisit) { const pv = e.pendingVisit; e.pendingVisit = null; if (now < pv.until) this.visitSite(pv.ev, pv.pass, pv.s, now); }
    if (!instant) this.siteLoop(e, now);
    const state = resolveState(e, now, this.layout);
    setClip(e, state, now, intentOf(e, state, { world: this.world, projects: this.layout.projects }));
    // Idle agents in the Break Room drift between its spots now and then (ambient, never "work").
    if (!instant && state === 'idle' && e.agent?.activity === 'idle' && !e.errand && !e.visit && e.spot && now > (e.nextWander ?? Infinity)) this.wander(e, now);
    return e.departAt > now || e.sitUntil > now || state === 'react' || !!e.faceGoal || !!e.loop;
  }
  // Pass 5C: work at a construction site is not one frozen pose. While HQ truth has the character working there
  // (it stands at its assigned site station, playing a productive clip), it now and then walks a short loop:
  // builders fetch materials from the site entrance and carry them back (site preparation, furnishing), an
  // inspector walks to another point of the site and surveys it. The loop never changes a fact: it starts only from
  // the assigned station, and ends (or never starts) the moment the character's place changes, as it does when the
  // project is blocked, waits for Kyle or finishes.
  siteLoop(e, now) {
    const L = e.loop;
    if (L) {
      if (e.placeKey && this.places[e.ref.id] && `${this.places[e.ref.id].location}:${this.places[e.ref.id].station}` !== L.home) { e.loop = null; e.carrying = false; return; }
      if (L.phase === 'go' && !e.moving && !e.departAt && !e.faceGoal) { L.phase = 'work'; L.until = now + L.workMs; }
      else if (L.phase === 'work' && now >= L.until) {
        L.phase = 'back'; if (L.kind === 'haul') e.carrying = true;
        e.dest = { location: L.site, target: L.homePoint }; startPath(e, this.layout.route([e.x, e.y], L.site, L.homePoint), now); e.spot = null;
      } else if (L.phase === 'back' && !e.moving && e.spot === L.home) { e.loop = null; e.carrying = false; e.nextLoop = now + LOOP_MS * (0.7 + hash(now / 1013 + e.id.length) * 0.7); }
      return;
    }
    if (e.moving || e.departAt || e.faceGoal || !e.spot?.startsWith('site:') || e.spot !== e.placeKey || now < (e.nextLoop ?? Infinity)) return;
    const st = e.anim?.state, site = this.layout.locationById[e.spotInfo?.room];
    if (!site?.site) return;
    const haul = st === 'lift' || st === 'measure', inspect = st === 'survey';
    if (!haul && !inspect) { e.nextLoop = now + LOOP_MS; return; }
    const homePoint = [e.x, e.y], taken = new Set([...this.scene.entities.values()].filter(o => o.kind === 'agent' && o !== e).flatMap(o => [o.spot, o.placeKey, o.loop?.targetKey]));
    let target = null, targetKey = null;
    if (haul && site.gate) target = site.gate;
    else if (inspect) { const free = Object.entries(site.stations).filter(([k]) => `${site.id}:${k}` !== e.spot && !taken.has(`${site.id}:${k}`)); if (free.length) { const [k, p] = free[Math.floor(hash(now / 997 + e.id.length) * free.length)]; target = p; targetKey = `${site.id}:${k}`; } }
    if (!target) { e.nextLoop = now + LOOP_MS; return; }
    const path = this.layout.route([e.x, e.y], site.id, target); if (!path) { e.nextLoop = now + LOOP_MS; return; }
    e.loop = { kind: haul ? 'haul' : 'inspect', phase: 'go', site: site.id, home: e.spot, homePoint, targetKey, workMs: haul ? 1400 : 3200, clip: haul ? 'pickup' : 'survey' };
    e.dest = { location: site.id, target }; startPath(e, path, now); e.spot = null;
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
    for (const o of this.scene.entities.values()) if (o.kind === 'agent' && o !== e) { if (o.spot) taken.add(o.spot); if (o.placeKey) taken.add(o.placeKey); if (o.dest) taken.add(`${o.dest.location}:${this.pointAt(...o.dest.target)?.id}`); } for (const o of this.ambient ?? []) if (o.target && o.phase !== 'away') taken.add(o.target.key);
    const free = Object.values(this.layout.stationInfo).filter(p => p.room === 'lounge' && IDLE_USES.has(p.use) && !taken.has(`lounge:${p.id}`) && `lounge:${p.id}` !== e.spot);
    if (!free.length) return;
    const pick = free[Math.floor(hash(now / 1000 + e.id.charCodeAt(0)) * free.length)];
    e.dest = { location: 'lounge', target: pick.point };
    startPath(e, this.layout.route([e.x, e.y], 'lounge', pick.point), now);
    this.depart(e, now, false);
  }
}
