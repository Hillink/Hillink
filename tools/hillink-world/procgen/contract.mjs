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
import { openProject, projectOfTask, transition } from './construction.mjs';

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

export function applyHqEvent(world, ev, { record = true } = {}) {
  const invalid = validateHqEvent(ev);
  if (invalid) return { applied: false, reason: invalid };
  // A clearly labelled simulation (a demo world that is never saved) replays simulated HQ facts; the real,
  // persisted world accepts HQ's own events only, and a simulated world never takes live ones.
  if (ev.source === 'hq-simulated' && !world.simulated) return { applied: false, reason: 'simulated HQ events are only accepted by a simulated world' };
  if (ev.source === 'hq' && world.simulated) return { applied: false, reason: 'a simulated world does not take live HQ events' };
  if (world.applied[ev.id]) return { applied: false, reason: 'already applied' };
  const ops = world.ops, agent = id => (ops.agents[id] ??= { id, activity: 'idle', taskId: null, spaceId: null, since: null });
  const at = Number.isFinite(ev.at) ? ev.at : null;
  const project = projectOfTask(world, ev.taskId), by = ev.id;
  const refuse = reason => ({ applied: false, reason });
  const locate = (id, activity) => {
    const a = agent(id); a.activity = activity; a.since = at;
    // Work on a construction project happens at its site; other work where the capability that hosts it lives.
    if (project && !project.completed) { a.spaceId = null; a.siteId = project.id; if (!project.builders.includes(id)) project.builders = [...project.builders, id]; return; }
    a.siteId = null;
    const cap = world.capabilities[ACTIVITY_CAPABILITY[activity]]; a.spaceId = cap && ['built', 'operational'].includes(cap.status) ? cap.placement.spaceId : a.spaceId;
  };
  switch (ev.type) {
    case 'OBJECTIVE_CREATED': ops.objectives[ev.objectiveId] = { id: ev.objectiveId, title: String(ev.title ?? '').slice(0, 160), status: 'open', at }; break;
    case 'TASK_ASSIGNED': {
      ops.tasks[ev.taskId] = { id: ev.taskId, agentId: ev.agentId, objectiveId: ev.objectiveId ?? null, status: 'assigned', at }; agent(ev.agentId).taskId = ev.taskId;
      // A task for an objective that asked for a capability works on that capability's project.
      const p = Object.values(world.projects ?? {}).find(q => q.objectiveId && q.objectiveId === ev.objectiveId);
      if (p && !p.taskIds.includes(ev.taskId)) p.taskIds = [...p.taskIds, ev.taskId];
      break;
    }
    case 'AGENT_WORKING': locate(ev.agentId, 'working'); break;
    case 'IMPLEMENTATION_STARTED': locate(ev.agentId, 'implementing'); break;
    case 'TESTING': case 'REVIEW': {
      if (project) { const r = transition.inspect(world, project, { at, by }); if (r) return refuse(r); }
      locate(ev.agentId, ev.type === 'TESTING' ? 'testing' : 'reviewing'); break;
    }
    case 'WORK_COMMITTED': {
      if (!project) return refuse(`task ${ev.taskId} is not a construction project's task`);
      const r = transition.evidence(world, project, { at, by, ref: ev.ref }); if (r) return refuse(r);
      break;
    }
    case 'REVIEW_VERDICT': {
      const p = project ?? world.projects?.[ev.capabilityId]; if (!p) return refuse('no construction project for this verdict');
      if (!['approved', 'changes'].includes(ev.verdict)) return refuse(`verdict must be approved or changes, not ${ev.verdict}`);
      const r = transition.verdict(world, p, { at, by, verdict: ev.verdict }); if (r) return refuse(r);
      break;
    }
    case 'APPROVAL_GRANTED': { for (const p of Object.values(world.projects ?? {})) if ((ev.taskId && p.taskIds.includes(ev.taskId)) || (ev.objectiveId && p.objectiveId === ev.objectiveId)) transition.resume(world, p); break; }
    case 'AGENT_IDLE': { const a = agent(ev.agentId); a.activity = 'idle'; a.taskId = null; a.since = at; break; }
    case 'BLOCKED': case 'WAITING_FOR_KYLE': {
      const status = ev.type === 'BLOCKED' ? 'blocked' : 'waiting-for-kyle';
      for (const p of Object.values(world.projects ?? {})) if ((ev.taskId && p.taskIds.includes(ev.taskId)) || (ev.objectiveId && p.objectiveId === ev.objectiveId)) (ev.type === 'BLOCKED' ? transition.block : transition.wait)(world, p, { at, by, reason: ev.reason });
      if (ev.taskId && ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = status;
      if (ev.objectiveId && ops.objectives[ev.objectiveId]) ops.objectives[ev.objectiveId].status = status;
      if (ev.agentId) { const a = agent(ev.agentId); a.activity = status; a.since = at; }
      break;
    }
    case 'TASK_FINISHED': if (ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = String(ev.outcome).toLowerCase(); break;
    case 'CAPABILITY_REQUESTED': {
      try { placeCapability(world, ev.capability, { status: 'planned', record: false }); } catch (error) { return refuse(error.message); }
      openProject(world, ev.capability.id, { taskId: ev.taskId ?? null, objectiveId: ev.objectiveId ?? null, at, by });
      break;
    }
    case 'CONSTRUCTION_REQUESTED': {
      const p = world.projects?.[ev.capabilityId];
      if (p) { const r = transition.requested(world, p, { at, by }); if (r) return refuse(r); }
      try { setConstruction(world, ev.capabilityId, 'under-construction', { record: false }); } catch (error) { return refuse(error.message); }
      break;
    }
    case 'CONSTRUCTION_COMPLETED': {
      // A project is complete only after inspection with an approved review. A capability placed without a project
      // (by a tool, never through HQ) keeps the direct path.
      const p = world.projects?.[ev.capabilityId];
      if (p) { const r = transition.complete(world, p, { at, by }); if (r) return refuse(r); }
      try { setConstruction(world, ev.capabilityId, 'built', { record: false }); } catch (error) { if (p) p.completed = false; return refuse(error.message); }
      break;
    }
    case 'CAPABILITY_VERIFIED': {
      const c = world.capabilities[ev.capabilityId];
      if (!c) return { applied: false, reason: `unknown capability ${ev.capabilityId}` };
      if (c.status !== 'built' && c.status !== 'operational') return { applied: false, reason: `${ev.capabilityId} is ${c.status}; only a built capability can be verified` };
      const p = world.projects?.[ev.capabilityId];
      if (p) { const r = transition.operational(world, p, { at, by }); if (r) return refuse(r); }
      c.status = 'operational'; break;
    }
  }
  world.applied[ev.id] = true;
  if (record) world.history.push({ seq: world.history.length + 1, type: 'HQ_EVENT', event: ev });
  return { applied: true };
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
  VERIFYING: i => (i.agentId ? { type: 'TESTING', agentId: i.agentId, taskId: i.taskId } : null),
  REVIEWING: i => (i.agentId ? { type: 'REVIEW', agentId: i.agentId, taskId: i.taskId } : null),
  BLOCKED: i => ({ type: 'BLOCKED', agentId: i.agentId, taskId: i.taskId, objectiveId: i.objectiveId }),
  APPROVAL_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId }),
  DECISION_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId }),
  SPEND_APPROVAL_REQUIRED: i => ({ type: 'WAITING_FOR_KYLE', taskId: i.taskId, objectiveId: i.objectiveId }),
  COMMIT: i => (i.taskId ? { type: 'WORK_COMMITTED', taskId: i.taskId, agentId: i.agentId, ref: String(i.summary ?? '').slice(0, 80) } : null),
  AGENT_FINISHED: i => (i.agentId ? { type: 'AGENT_IDLE', agentId: i.agentId } : null),
  COMPLETE: i => (i.taskId ? { type: 'TASK_FINISHED', taskId: i.taskId, outcome: 'COMPLETE' } : null),
  FAILED: i => (i.taskId ? { type: 'TASK_FINISHED', taskId: i.taskId, outcome: 'FAILED' } : null),
};
export function fromHqActivity(item) {
  const f = FROM_ACTIVITY[item?.type];
  const ev = f ? f(item) : null;
  if (!ev || (HQ_EVENT_TYPES[ev.type].includes('agentId') && !ev.agentId)) return null;
  return { v: CONTRACT_VERSION, source: 'hq', id: `hq-${item.seq}-${item.type}`, at: item.at, ...Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined && v !== null)) };
}
