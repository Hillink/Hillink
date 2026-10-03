// Pass 5E: semantic World events, the theme-agnostic record of WHAT happened, which themes interpret. They come from
// two canonical sources and nowhere else:
//   1. World events (core/events.mjs) already describe what happened (TASK_STARTED, AGENT_READY, ...); semanticOf()
//      passes the ones a theme may want to stage through, unchanged, with their subject.
//   2. Construction, whose facts are canonical project state (procgen/construction.mjs): buildEventsOf() compares a
//      project before and after an HQ fact was applied and says what changed (BUILD_STARTED, BUILD_STAGE_CHANGED,
//      BUILD_BLOCKED, BUILD_RESUMED, BUILD_COMPLETED, CAPABILITY_REQUESTED).
// The vocabulary grows by adding a line here when HQ reports something new (INTEGRATION_CONNECTED, SECURITY_ALERT,
// ...): nothing is invented ahead of a backend that reports it. Names never describe a picture (no PORTAL, HAMMER,
// INTERVIEW): that is the theme interpreter's job (themes/interpreter.mjs).

// World event types a theme may stage, and what they mean in one line (the semantic vocabulary in use today).
export const SEMANTIC = {
  AGENT_REGISTERED: 'an agent is part of HQ (registered by HQ or the simulator)',
  AGENT_DEFINED: 'an agent definition was created or updated',
  AGENT_REQUESTED: 'a new agent was requested',
  AGENT_PROVISIONING: 'the requested agent reached a provisioning stage (stage)',
  AGENT_PROVISIONING_WAITING: 'provisioning is paused on outside input',
  AGENT_PROVISIONING_FAILED: 'provisioning failed',
  AGENT_READY: 'the agent is provisioned and ready',
  AGENT_ACTIVATED: 'the agent joined the working team',
  AGENT_DISABLED: 'the agent was disabled',
  AGENT_RETIRED: 'the agent was retired',
  TASK_STARTED: 'an agent started a task', TASK_BLOCKED: 'a task is blocked', TASK_COMPLETED: 'a task is done', TASK_FAILED: 'a task failed', TASK_QUEUED: 'a task went back to the queue',
  AGENT_WAITING: 'an agent is waiting', MEETING_STARTED: 'agents met', MEETING_ENDED: 'a meeting ended',
  TESTS_STARTED: 'a test run started', TESTS_FINISHED: 'a test run finished', DEPLOY_STARTED: 'a deploy started', DEPLOY_SUCCESS: 'a deploy succeeded', DEPLOY_FAILED: 'a deploy failed',
  ISSUE_FOUND: 'something needs attention', SYSTEM_STATUS: 'a system changed state',
  CAPABILITY_REQUESTED: 'HQ needs a new capability', BUILD_STARTED: 'construction started', BUILD_STAGE_CHANGED: 'construction reached a new stage',
  BUILD_BLOCKED: 'construction stopped', BUILD_RESUMED: 'construction resumed', BUILD_COMPLETED: 'construction finished',
};
const SUBJECT = ['agentId', 'taskId', 'meetingId', 'runId', 'deployId', 'issueId', 'systemId'];

// A World event as a semantic event (a new object; the event is not touched), or null when no theme stages it.
export function semanticOf(e) {
  if (!e || !Object.hasOwn(SEMANTIC, e.type) || e.type.startsWith('BUILD_') || e.type === 'CAPABILITY_REQUESTED') return null;
  const out = { type: e.type, at: e.at, source: e.source };
  for (const k of SUBJECT) if (e[k] != null) out[k] = e[k];
  if (e.stage != null) out.stage = e.stage;
  if (e.detail != null) out.detail = e.detail;
  return out;
}

// Construction as semantic events: what changed between two canonical project states (either may be missing).
export function buildEventsOf(before, after, at = 0) {
  if (!after) return [];
  const ev = (type, x = {}) => ({ type, at, source: 'hq', projectId: after.id, stage: after.stage, ...x });
  if (!before) return [ev('CAPABILITY_REQUESTED')];
  const out = [];
  const started = s => s && s !== 'planning' && s !== 'survey';
  if (!started(before.stage) && started(after.stage)) out.push(ev('BUILD_STARTED'));
  else if (before.stage !== after.stage && !after.completed) out.push(ev('BUILD_STAGE_CHANGED', { from: before.stage }));
  if (!before.blocked && after.blocked) out.push(ev('BUILD_BLOCKED', { detail: after.blocked }));
  if (before.blocked && !after.blocked && !after.completed) out.push(ev('BUILD_RESUMED'));
  if (!before.completed && after.completed) out.push(ev('BUILD_COMPLETED'));
  return out;
}
