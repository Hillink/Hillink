// Pass 5A: the HQ -> World event contract. Operational truth enters the canonical World only here, and only from
// HQ. Creative freedom for atmosphere; zero creative freedom for operational facts:
//
//   - applyHqEvent() accepts an event only if source is 'hq', its type is in HQ_EVENT_TYPES and its required fields
//     are present. Anything else (a renderer, the simulator, an ambient effect) is refused and changes nothing.
//   - Events are idempotent by id: HQ may redeliver, the World applies each once.
//   - Every applied event is appended to world.history, so a reload or replay reaches the same state.
//
// fromHqActivity() translates HQ's existing Pass 3 activity feed (tools/hillink-hq/orchestration/activity.mjs,
// contract v1) into these events, so no HQ change is needed for today's facts. The capability and construction
// events are new vocabulary for HQ to emit when it gains them; the World already knows how to apply them.
import { placeCapability, setConstruction } from './world.mjs';
import { openProject, projectOfTask, transition, orderOf } from './construction.mjs';

export const CONTRACT_VERSION = 1;
const need = (...fields) => fields;
export const HQ_EVENT_TYPES = {
  OBJECTIVE_CREATED: need('objectiveId'),
  TASK_ASSIGNED: need('taskId', 'agentId'),
  AGENT_WORKING: need('agentId'),
  IMPLEMENTATION_STARTED: need('agentId'),
  TESTING: need('agentId'),
  REVIEW: need('agentId'),
  BLOCKED: need(),
  WAITING_FOR_KYLE: need(),
  AGENT_IDLE: need('agentId'),
  TASK_FINISHED: need('taskId', 'outcome'),
  CAPABILITY_REQUESTED: need('capability'),
  // Pass 5B construction facts: implementation evidence for a project's task, a review verdict, Kyle's approval.
  WORK_COMMITTED: need('taskId'),
  REVIEW_VERDICT: need('verdict'),
  // HQ's objective (not one agent's task) entered verification or review: the project is inspected.
  INSPECTION_STARTED: need('objectiveId'),
  // A project's implementation task finished successfully in HQ.
  IMPLEMENTATION_DONE: need('taskId'),
  // HQ's objective ended. For a construction project's objective, COMPLETE (HQ finishes an objective only after its
  // verification and an approving review) completes and verifies the build; FAILED or CANCELLED stops it.
  OBJECTIVE_FINISHED: need('objectiveId', 'outcome'),
  APPROVAL_GRANTED: need(),
  CONSTRUCTION_REQUESTED: need('capabilityId'),
  CONSTRUCTION_COMPLETED: need('capabilityId'),
  CAPABILITY_VERIFIED: need('capabilityId'),
};

// Where an activity is physically done: the capability that hosts it. (Which desk and which animation stays visual
// policy in core/behavior.mjs; which room is canonical.)
export const ACTIVITY_CAPABILITY = { working: 'engineering', implementing: 'engineering', testing: 'review', reviewing: 'review', planning: 'command', waiting: 'meeting-space' };

export function validateHqEvent(ev) {
  if (!ev || typeof ev !== 'object') return 'not an event';
  if (ev.v !== CONTRACT_VERSION) return `contract version ${ev.v} is not ${CONTRACT_VERSION}`;
  if (ev.source !== 'hq' && ev.source !== 'hq-simulated') return `source '${ev.source}' may not change operational state (only HQ may)`;
  if (typeof ev.id !== 'string' || !ev.id) return 'an HQ event needs an id';
  const fields = HQ_EVENT_TYPES[ev.type];
  if (!fields) return `unknown HQ event type ${ev.type}`;
  const missing = fields.filter(f => ev[f] === undefined || ev[f] === null || ev[f] === '');
  return missing.length ? `${ev.type} is missing ${missing.join(', ')}` : null;
}

// Applies one HQ event as a transaction: the reducer below validates and changes the world; if it refuses (or throws),
// every canonical change it made is rolled back, so a refused event leaves state, history, fingerprint and the
// applied-event set exactly as they were. Only an applied event is marked applied and recorded in history.
export function applyHqEvent(world, ev, { record = true } = {}) {
  const invalid = validateHqEvent(ev);
  if (invalid) return { applied: false, reason: invalid };
  // A clearly labelled simulation (a demo world that is never saved) replays simulated HQ facts; the real,
  // persisted world accepts HQ's own events only, and a simulated world never takes live ones.
  if (ev.source === 'hq-simulated' && !world.simulated) return { applied: false, reason: 'simulated HQ events are only accepted by a simulated world' };
  if (ev.source === 'hq' && world.simulated) return { applied: false, reason: 'a simulated world does not take live HQ events' };
  if (world.applied[ev.id]) return { applied: false, reason: 'already applied' };
  const { history, applied, ...rest } = world, saved = structuredClone(rest);
  let reason;
  try { reason = reduce(world, ev); } catch (error) { reason = error.message; }
  if (reason) {
    for (const k of Object.keys(world)) if (k !== 'history' && k !== 'applied' && !(k in saved)) delete world[k];
    Object.assign(world, saved);
    return { applied: false, reason };
  }
  world.applied[ev.id] = true;
  if (record) world.history.push({ seq: world.history.length + 1, type: 'HQ_EVENT', event: ev });
  return { applied: true };
}

// The reducer: returns null when the event applied, or why it was refused.
function reduce(world, ev) {
  const ops = world.ops, agent = id => (ops.agents[id] ??= { id, activity: 'idle', taskId: null, spaceId: null, since: null });
  const at = Number.isFinite(ev.at) ? ev.at : null, order = orderOf(ev), by = ev.id;
  const projects = Object.values(world.projects ?? {});
  const project = projectOfTask(world, ev.taskId) ?? (ev.objectiveId ? projects.find(p => p.objectiveId === ev.objectiveId) ?? null : null);
  const matching = () => projects.filter(p => (ev.taskId && p.taskIds.includes(ev.taskId)) || (ev.objectiveId && p.objectiveId === ev.objectiveId));
  const locate = (id, activity) => {
    const a = agent(id); a.activity = activity; a.since = at;
    // Work on a construction project happens at its site; other work where the capability that hosts it lives.
    if (project && !project.completed) { a.spaceId = null; a.siteId = project.id; if (!project.builders.includes(id)) project.builders = [...project.builders, id]; return; }
    a.siteId = null;
    const cap = world.capabilities[ACTIVITY_CAPABILITY[activity]]; a.spaceId = cap && ['built', 'operational'].includes(cap.status) ? cap.placement.spaceId : a.spaceId;
  };
  // Completion and verification of a project, each through every gate.
  const complete = p => transition.complete(world, p, { at, by, order }) ?? setConstruction(world, p.id, 'built', { record: false }) ?? null;
  const verify = p => { const r = transition.operational(world, p, { at, by, order }); if (!r) world.capabilities[p.id].status = 'operational'; return r; };
  switch (ev.type) {
    case 'OBJECTIVE_CREATED': ops.objectives[ev.objectiveId] = { id: ev.objectiveId, title: String(ev.title ?? '').slice(0, 160), status: 'open', at }; return null;
    case 'TASK_ASSIGNED': {
      ops.tasks[ev.taskId] = { id: ev.taskId, agentId: ev.agentId, objectiveId: ev.objectiveId ?? null, status: 'assigned', at }; agent(ev.agentId).taskId = ev.taskId;
      // A task for an objective that asked for a capability works on that capability's project. HQ dispatching the
      // project's work again is authority to continue: it lifts an older wait (never a newer one).
      const p = projects.find(q => q.objectiveId && q.objectiveId === ev.objectiveId);
      if (p && !p.taskIds.includes(ev.taskId)) p.taskIds = [...p.taskIds, ev.taskId];
      if (p) transition.resume(world, p, { at, by, order, why: 'HQ dispatched the work again' });
      if (p) transition.unblockPlanning(world, p, { at, by, order });
      return null;
    }
    case 'AGENT_WORKING': locate(ev.agentId, 'working'); return null;
    case 'IMPLEMENTATION_STARTED': locate(ev.agentId, 'implementing'); return null;
    case 'TESTING': case 'REVIEW': {
      if (project) { const r = transition.inspect(world, project, { at, by, order, midBuild: true }); if (r) return r; }
      locate(ev.agentId, ev.type === 'TESTING' ? 'testing' : 'reviewing'); return null;
    }
    case 'INSPECTION_STARTED':
      if (!project) return `objective ${ev.objectiveId} is not a construction project's objective`;
      return transition.inspect(world, project, { at, by, order, midBuild: false });
    case 'WORK_COMMITTED': case 'IMPLEMENTATION_DONE': {
      const p = projectOfTask(world, ev.taskId);
      if (!p) return `task ${ev.taskId} is not a construction project's task`;
      return transition.evidence(world, p, { at, by, order, ref: ev.ref, finished: ev.type === 'IMPLEMENTATION_DONE' });
    }
    case 'REVIEW_VERDICT': {
      const p = project ?? world.projects?.[ev.capabilityId]; if (!p) return 'no construction project for this verdict';
      return transition.verdict(world, p, { at, by, order, verdict: ev.verdict });
    }
    case 'APPROVAL_GRANTED': {
      for (const p of matching()) { const r = transition.resume(world, p, { at, by, order, why: "Kyle's approval" }); if (r) return r; }
      return null;
    }
    case 'AGENT_IDLE': { const a = agent(ev.agentId); a.activity = 'idle'; a.taskId = null; a.since = at; return null; }
    case 'BLOCKED': case 'WAITING_FOR_KYLE': {
      const status = ev.type === 'BLOCKED' ? 'blocked' : 'waiting-for-kyle';
      for (const p of matching()) (ev.type === 'BLOCKED' ? transition.block : transition.wait)(world, p, { at, by, order, reason: ev.reason });
      if (ev.taskId && ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = status;
      if (ev.objectiveId && ops.objectives[ev.objectiveId]) ops.objectives[ev.objectiveId].status = status;
      if (ev.agentId) { const a = agent(ev.agentId); a.activity = status; a.since = at; }
      return null;
    }
    case 'OBJECTIVE_FINISHED': {
      // HQ finishes an objective only after its verification and an approving review, so COMPLETE completes and
      // verifies the project's build, through every gate; FAILED or CANCELLED stops it.
      const outcome = String(ev.outcome).toUpperCase();
      if (project && outcome === 'COMPLETE') { const r = complete(project) ?? verify(project); if (r) return r; }
      else if (project) transition.block(world, project, { at, by, order, reason: ev.reason ?? `objective ${outcome.toLowerCase()} in HQ` });
      if (ops.objectives[ev.objectiveId]) ops.objectives[ev.objectiveId].status = outcome.toLowerCase();
      return null;
    }
    case 'TASK_FINISHED': if (ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = String(ev.outcome).toLowerCase(); return null;
    case 'CAPABILITY_REQUESTED':
      placeCapability(world, ev.capability, { status: 'planned', record: false });
      openProject(world, ev.capability.id, { taskId: ev.taskId ?? null, objectiveId: ev.objectiveId ?? null, at, by, order });
      return null;
    case 'CONSTRUCTION_REQUESTED': {
      const p = world.projects?.[ev.capabilityId];
      if (p) { const r = transition.requested(world, p, { at, by, order }); if (r) return r; }
      setConstruction(world, ev.capabilityId, 'under-construction', { record: false });
      return null;
    }
    case 'CONSTRUCTION_COMPLETED': {
      // A project is complete only after inspection with an approved review of its current work and no open gate. A
      // capability placed without a project (by a tool, never through HQ) keeps the direct path.
      const p = world.projects?.[ev.capabilityId];
      if (p) return complete(p);
      setConstruction(world, ev.capabilityId, 'built', { record: false });
      return null;
    }
    case 'CAPABILITY_VERIFIED': {
      const c = world.capabilities[ev.capabilityId];
      if (!c) return `unknown capability ${ev.capabilityId}`;
      if (c.status !== 'built' && c.status !== 'operational') return `${ev.capabilityId} is ${c.status}; only a built capability can be verified`;
      const p = world.projects?.[ev.capabilityId];
      if (p) return verify(p);
      c.status = 'operational'; return null;
    }
  }
  return `unhandled HQ event type ${ev.type}`;
}

// HQ Pass 3 activity item (contract v1) -> HQ event, or null when the item is not an operational fact for the
// canonical World (compute and sandbox chatter, for instance).
const FROM_ACTIVITY = {
  TASK_CREATED: i => (i.objectiveId ? { type: 'OBJECTIVE_CREATED', objectiveId: i.objectiveId, title: i.summary } : null),
  AGENT_ASSIGNED: i => (i.taskId && i.agentId ? { type: 'TASK_ASSIGNED', taskId: i.taskId, agentId: i.agentId, objectiveId: i.objectiveId } : null),
  AGENT_STARTED: i => ({ type: 'AGENT_WORKING', agentId: i.agentId, taskId: i.taskId }),
  AGENT_WORKING: i => ({ type: 'AGENT_WORKING', agentId: i.agentId, taskId: i.taskId }),
  FILE_EDITING: i => ({ type: 'IMPLEMENTATION_STARTED', agentId: i.agentId, taskId: i.taskId }),
  IMPLEMENTATION_STARTED: i => ({ type: 'IMPLEMENTATION_STARTED', agentId: i.agentId, taskId: i.taskId }),
  TESTING: i => ({ type: 'TESTING', agentId: i.agentId, taskId: i.taskId }),
  VERIFYING: i => (i.agentId ? { type: 'TESTING', agentId: i.agentId, taskId: i.taskId } : i.objectiveId ? { type: 'INSPECTION_STARTED', objectiveId: i.objectiveId } : null),
  REVIEWING: i => (i.agentId ? { type: 'REVIEW', agentId: i.agentId, taskId: i.taskId } : i.objectiveId ? { type: 'INSPECTION_STARTED', objectiveId: i.objectiveId } : null),
  BLOCKED: i => ({ type: 'BLOCKED', agentId: i.agentId, taskId: i.taskId, objectiveId: i.objectiveId, reason: i.summary }),
  APPROVAL_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId, reason: i.summary }),
  DECISION_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId, reason: i.summary }),
  SPEND_APPROVAL_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId, reason: i.summary }),
  SPEND_AUTHORIZED: i => (i.taskId || i.objectiveId ? { type: 'APPROVAL_GRANTED', taskId: i.taskId, objectiveId: i.objectiveId } : null),
  // Pass 5B: a failed, blocked or uncertain implementation stops the build; a review verdict decides inspection.
  IMPLEMENTATION_FINISHED: i => (!i.taskId ? null : i.outcome === 'completed' ? { type: 'IMPLEMENTATION_DONE', taskId: i.taskId, agentId: i.agentId } : { type: 'BLOCKED', agentId: i.agentId, taskId: i.taskId, objectiveId: i.objectiveId, reason: `implementation ${i.outcome ?? 'stopped'}` }),
  HANDOFF_RECEIVED: i => (i.stepKind === 'review' && i.verdict ? { type: 'REVIEW_VERDICT', taskId: i.taskId, objectiveId: i.objectiveId, verdict: i.verdict === 'approve' ? 'approved' : 'changes' } : null),
  COMMIT: i => (i.taskId ? { type: 'WORK_COMMITTED', taskId: i.taskId, agentId: i.agentId, ref: String(i.summary ?? '').slice(0, 80) } : null),
  AGENT_FINISHED: i => (i.agentId ? { type: 'AGENT_IDLE', agentId: i.agentId } : null),
  COMPLETE: i => (i.taskId ? { type: 'TASK_FINISHED', taskId: i.taskId, outcome: 'COMPLETE' } : i.objectiveId ? { type: 'OBJECTIVE_FINISHED', objectiveId: i.objectiveId, outcome: 'COMPLETE' } : null),
  FAILED: i => (i.taskId ? { type: 'TASK_FINISHED', taskId: i.taskId, outcome: 'FAILED' } : i.objectiveId ? { type: 'OBJECTIVE_FINISHED', objectiveId: i.objectiveId, outcome: 'FAILED' } : null),
  CANCELLED: i => (i.objectiveId && !i.taskId ? { type: 'OBJECTIVE_FINISHED', objectiveId: i.objectiveId, outcome: 'CANCELLED' } : null),
};
export function fromHqActivity(item) {
  const f = FROM_ACTIVITY[item?.type];
  const ev = f ? f(item) : null;
  if (!ev || (HQ_EVENT_TYPES[ev.type].includes('agentId') && !ev.agentId)) return null;
  // seq: HQ's journal sequence number, the provenance construction uses to order facts (construction.mjs newer()).
  return { v: CONTRACT_VERSION, source: 'hq', id: `hq-${item.seq}-${item.type}`, at: item.at, ...(Number.isFinite(item.seq) ? { seq: item.seq } : {}), ...Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined && v !== null)) };
}
