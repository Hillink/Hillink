// World event schema. The only language the World understands.
// Adapters translate backend facts (HQ, GitHub, Supabase aggregates) into these; the simulator emits them too.
// The renderer never sees backend payloads.

export const SCHEMA_VERSION = 1;

// Semantic agent activities. The renderer decides what each looks like.
export const ACTIVITIES = ['idle', 'thinking', 'coding', 'researching', 'testing', 'reviewing', 'communicating', 'waiting', 'completed', 'error', 'offline'];

export const SYSTEM_STATES = ['ok', 'busy', 'degraded', 'down', 'unknown'];

// type -> required fields. Every event also carries { v, id, type, at, source }.
export const EVENT_TYPES = {
  // Registry: things that exist in the World.
  AGENT_REGISTERED: ['agentId', 'name', 'role'],
  SYSTEM_REGISTERED: ['systemId', 'name', 'kind'],
  // Tasks.
  TASK_CREATED: ['taskId', 'title'],
  TASK_STARTED: ['taskId', 'agentId'],
  TASK_PROGRESS: ['taskId'],
  TASK_COMPLETED: ['taskId'],
  TASK_FAILED: ['taskId'],
  TASK_BLOCKED: ['taskId'], // waiting on a person or a fix; not a failure of the agent
  TASK_QUEUED: ['taskId'], // back in the queue (e.g. retry after a rate limit)
  // Agent activity.
  AGENT_STARTED_WORK: ['agentId'],
  AGENT_THINKING: ['agentId'],
  AGENT_RESEARCHING: ['agentId'],
  AGENT_REVIEWING: ['agentId'],
  AGENT_TESTING: ['agentId'],
  AGENT_WAITING: ['agentId'],
  AGENT_IDLE: ['agentId'],
  AGENT_ERROR: ['agentId'],
  AGENT_OFFLINE: ['agentId'],
  // Authoritative runtime facts for one agent, copied from its backend (HQ). core/truth.mjs derives state from these.
  AGENT_RUNTIME: ['agentId', 'runtime'],
  AGENT_MESSAGE: ['agentId', 'toAgentId'], // a handoff or note from one agent to another
  MEETING_STARTED: ['meetingId', 'agentIds'], // agents gather in the meeting room
  MEETING_ENDED: ['meetingId'],
  // Source control.
  PR_CREATED: ['prId', 'title'],
  PR_REVIEWED: ['prId'],
  PR_MERGED: ['prId'],
  // Build / deploy.
  BUILD_STARTED: ['buildId'],
  BUILD_SUCCESS: ['buildId'],
  BUILD_FAILED: ['buildId'],
  DEPLOY_STARTED: ['deployId'],
  DEPLOY_SUCCESS: ['deployId'],
  DEPLOY_FAILED: ['deployId'],
  // Tests.
  TESTS_STARTED: ['runId'],
  TESTS_FINISHED: ['runId', 'passed', 'failed'],
  // Construction: each development pass is a building project; it moves only on real evidence.
  PASS_PLANNED: ['passId', 'title'],
  PASS_EVIDENCE: ['passId', 'evidence'],
  // Issues and system health.
  ISSUE_FOUND: ['issueId', 'title'],
  ISSUE_RESOLVED: ['issueId'],
  SYSTEM_STATUS: ['systemId', 'state'],
};

export const SOURCES = ['hq', 'github', 'platform', 'sim', 'replay'];

const isText = (v, max = 500) => typeof v === 'string' && v.length > 0 && v.length <= max;

export function validateEvent(event) {
  if (!event || typeof event !== 'object') return 'Event must be an object';
  if (event.v !== SCHEMA_VERSION) return `Unsupported schema version ${event.v}`;
  if (!isText(event.id, 120)) return 'Event id required';
  if (!Object.hasOwn(EVENT_TYPES, event.type)) return `Unknown event type ${event.type}`;
  if (!Number.isFinite(event.at)) return 'Event time required';
  if (!SOURCES.includes(event.source)) return `Unknown source ${event.source}`;
  for (const field of EVENT_TYPES[event.type]) if (event[field] == null) return `${event.type} requires ${field}`;
  if (event.progress != null && !validProgress(event.progress)) return 'Invalid progress';
  if (event.type === 'SYSTEM_STATUS' && !SYSTEM_STATES.includes(event.state)) return 'Invalid system state';
  return null;
}

// Progress is evidence-backed: either a known ratio from a real counter, or a named stage. Never an invented percentage.
export function validProgress(p) {
  if (p.kind === 'ratio') return Number.isFinite(p.done) && Number.isFinite(p.total) && p.total > 0 && p.done >= 0 && p.done <= p.total;
  if (p.kind === 'stage') return isText(p.stage, 80);
  return false;
}

let counter = 0;
export function makeEvent(type, fields, { source = 'sim', at = Date.now() } = {}) {
  counter = (counter + 1) % 1e9;
  return { v: SCHEMA_VERSION, id: `${source}-${at.toString(36)}-${counter.toString(36)}`, type, at, source, ...fields };
}
