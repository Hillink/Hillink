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
  if (ev.source !== 'hq') return `source '${ev.source}' may not change operational state (only HQ may)`;
  if (typeof ev.id !== 'string' || !ev.id) return 'an HQ event needs an id';
  const fields = HQ_EVENT_TYPES[ev.type];
  if (!fields) return `unknown HQ event type ${ev.type}`;
  const missing = fields.filter(f => ev[f] === undefined || ev[f] === null || ev[f] === '');
  return missing.length ? `${ev.type} is missing ${missing.join(', ')}` : null;
}

export function applyHqEvent(world, ev, { record = true } = {}) {
  const invalid = validateHqEvent(ev);
  if (invalid) return { applied: false, reason: invalid };
  if (world.applied[ev.id]) return { applied: false, reason: 'already applied' };
  const ops = world.ops, agent = id => (ops.agents[id] ??= { id, activity: 'idle', taskId: null, spaceId: null, since: null });
  const at = Number.isFinite(ev.at) ? ev.at : null;
  const locate = (id, activity) => { const a = agent(id); a.activity = activity; a.since = at; const cap = world.capabilities[ACTIVITY_CAPABILITY[activity]]; a.spaceId = cap && cap.status !== 'planned' ? cap.placement.spaceId : a.spaceId; };
  switch (ev.type) {
    case 'OBJECTIVE_CREATED': ops.objectives[ev.objectiveId] = { id: ev.objectiveId, title: String(ev.title ?? '').slice(0, 160), status: 'open', at }; break;
    case 'TASK_ASSIGNED': ops.tasks[ev.taskId] = { id: ev.taskId, agentId: ev.agentId, objectiveId: ev.objectiveId ?? null, status: 'assigned', at }; agent(ev.agentId).taskId = ev.taskId; break;
    case 'AGENT_WORKING': locate(ev.agentId, 'working'); break;
    case 'IMPLEMENTATION_STARTED': locate(ev.agentId, 'implementing'); break;
    case 'TESTING': locate(ev.agentId, 'testing'); break;
    case 'REVIEW': locate(ev.agentId, 'reviewing'); break;
    case 'AGENT_IDLE': { const a = agent(ev.agentId); a.activity = 'idle'; a.taskId = null; a.since = at; break; }
    case 'BLOCKED': case 'WAITING_FOR_KYLE': {
      const status = ev.type === 'BLOCKED' ? 'blocked' : 'waiting-for-kyle';
      if (ev.taskId && ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = status;
      if (ev.objectiveId && ops.objectives[ev.objectiveId]) ops.objectives[ev.objectiveId].status = status;
      if (ev.agentId) { const a = agent(ev.agentId); a.activity = status; a.since = at; }
      break;
    }
    case 'TASK_FINISHED': if (ops.tasks[ev.taskId]) ops.tasks[ev.taskId].status = String(ev.outcome).toLowerCase(); break;
    case 'CAPABILITY_REQUESTED': try { placeCapability(world, ev.capability, { status: 'planned', record: false }); } catch (error) { return { applied: false, reason: error.message }; } break;
    case 'CONSTRUCTION_REQUESTED': try { setConstruction(world, ev.capabilityId, 'under-construction', { record: false }); } catch (error) { return { applied: false, reason: error.message }; } break;
    case 'CONSTRUCTION_COMPLETED': try { setConstruction(world, ev.capabilityId, 'built', { record: false }); } catch (error) { return { applied: false, reason: error.message }; } break;
    case 'CAPABILITY_VERIFIED': {
      const c = world.capabilities[ev.capabilityId];
      if (!c) return { applied: false, reason: `unknown capability ${ev.capabilityId}` };
      if (c.status !== 'built' && c.status !== 'operational') return { applied: false, reason: `${ev.capabilityId} is ${c.status}; only a built capability can be verified` };
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
