// Pass 3 World contract (version 1). HQ emits truthful state; the Hillink World only visualizes it. Everything here
// is a pure function of HQ's journal, so the World can replay from any sequence number and never needs HQ internals.
// Nothing here reads model output: summaries are HQ-authored strings. Agent answers (untrusted text) never reach the
// World through this contract.
//
// Activity item: { v, seq, at, type, activity, objectiveId, taskId, stepId, stepKind, agentId, summary }
//   seq      the journal sequence number of the event it came from (monotonic; use it as a cursor)
//   type     one of ACTIVITY_TYPES
//   activity the broad animation state for the agent or objective: one of ACTIVITIES
// Snapshot: { v, at, seq, agents[], objectives[], construction }
export const WORLD_CONTRACT_VERSION = 1;
export const ACTIVITY_TYPES = ['TASK_CREATED', 'PLANNING_STARTED', 'AGENT_ASSIGNED', 'AGENT_STARTED', 'AGENT_WORKING', 'HANDOFF_RECEIVED', 'HANDOFF_REJECTED', 'IMPLEMENTATION_STARTED', 'SANDBOX_CREATED', 'SANDBOX_DESTROYED', 'TESTING', 'TEST_RESULT', 'COMMIT', 'VERIFYING', 'REVIEWING', 'RETRYING', 'APPROVAL_REQUIRED', 'DECISION_REQUIRED', 'WAITING', 'AGENT_FINISHED', 'BLOCKED', 'COMPLETE', 'FAILED', 'CANCELLED'];
export const ACTIVITIES = ['idle', 'planning', 'investigating', 'building', 'testing', 'verifying', 'reviewing', 'waiting', 'blocked', 'done'];

const STEP_ACTIVITY = { investigate: 'investigating', implement: 'building', verify: 'verifying', review: 'reviewing', rebuttal: 'reviewing', 'local-check': 'investigating' };
const STATUS_ACTIVITY = { QUEUED: 'planning', PLANNING: 'planning', INVESTIGATING: 'investigating', WAITING_FOR_EVIDENCE: 'waiting', READY_FOR_IMPLEMENTATION: 'building', IMPLEMENTING: 'building', VERIFYING: 'verifying', REVIEWING: 'reviewing', AWAITING_DECISION: 'waiting', AWAITING_APPROVAL: 'waiting', BLOCKED: 'blocked', COMPLETE: 'done', FAILED: 'blocked', CANCELLED: 'done' };
const STATUS_TYPE = { PLANNING: 'PLANNING_STARTED', VERIFYING: 'VERIFYING', REVIEWING: 'REVIEWING', AWAITING_APPROVAL: 'APPROVAL_REQUIRED', AWAITING_DECISION: 'DECISION_REQUIRED', WAITING_FOR_EVIDENCE: 'WAITING', BLOCKED: 'BLOCKED', COMPLETE: 'COMPLETE', FAILED: 'FAILED', CANCELLED: 'CANCELLED' };
const TERMINAL_KINDS = new Set(['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'UNCERTAIN']);

// Maps journal events to World activity. `since` is exclusive. Bounded by `limit` (most recent kept).
export function worldActivity(events, { since = 0, limit = 500 } = {}) {
  const tasks = new Map(), runs = new Map(), out = [];
  const push = (e, item) => { if (e.seq > since) out.push({ v: WORLD_CONTRACT_VERSION, seq: e.seq, at: e.at, objectiveId: null, taskId: null, stepId: null, stepKind: null, agentId: null, ...item }); };
  for (const e of events) {
    const d = e.data ?? {};
    switch (e.type) {
      case 'OBJECTIVE_CREATED': push(e, { type: 'TASK_CREATED', activity: 'planning', objectiveId: d.id, summary: `Objective received: ${String(d.input?.title ?? '').slice(0, 120)}` }); break;
      case 'OBJECTIVE_TRANSITION': if (STATUS_TYPE[d.to]) push(e, { type: STATUS_TYPE[d.to], activity: STATUS_ACTIVITY[d.to], objectiveId: d.objectiveId, summary: `Objective ${d.to.toLowerCase().replace(/_/g, ' ')}.` }); break;
      case 'STEP_RETRY': push(e, { type: 'RETRYING', activity: 'waiting', objectiveId: d.objectiveId, stepId: d.stepId, summary: `Retrying a step (${d.reason}, ${d.count}/${d.max}).` }); break;
      case 'HANDOFF_ACCEPTED': push(e, { type: 'HANDOFF_RECEIVED', activity: 'done', objectiveId: d.objectiveId, stepId: d.stepId, taskId: d.taskId, agentId: d.agentId ?? null, stepKind: d.handoff?.kind ?? null, summary: `${d.handoff?.kind ?? 'Handoff'} accepted by HQ.` }); break;
      case 'HANDOFF_REJECTED': push(e, { type: 'HANDOFF_REJECTED', activity: 'waiting', objectiveId: d.objectiveId, stepId: d.stepId, taskId: d.taskId, summary: 'HQ rejected a handoff that failed validation.' }); break;
      case 'TASK_CREATED': {
        const t = { id: d.id, operation: d.operation, objectiveId: d.link?.objectiveId ?? null, stepId: d.link?.stepId ?? null };
        tasks.set(d.id, t);
        break;
      }
      case 'DISPATCHED': {
        const t = tasks.get(d.taskId) ?? {};
        runs.set(d.runId, { ...t, agentId: d.agentId });
        push(e, { type: 'AGENT_ASSIGNED', activity: 'waiting', objectiveId: t.objectiveId ?? null, stepId: t.stepId ?? null, taskId: d.taskId, agentId: d.agentId, summary: `${d.agentId} assigned.` });
        break;
      }
      case 'WORKER_EVENT': {
        const r = runs.get(d.runId); if (!r) break;
        const base = { objectiveId: r.objectiveId, stepId: r.stepId, taskId: r.id, agentId: r.agentId };
        const building = r.operation === 'implement-repo';
        if (d.kind === 'ACK') {
          push(e, { ...base, type: 'AGENT_STARTED', activity: building ? 'building' : 'investigating', summary: `${r.agentId} started.` });
          if (building) push(e, { ...base, type: 'IMPLEMENTATION_STARTED', activity: 'building', summary: 'Implementation started (sandboxed).' });
        } else if (d.kind === 'PROGRESS' && /created/i.test(d.summary ?? '')) push(e, { ...base, type: 'SANDBOX_CREATED', activity: 'building', summary: 'Sandbox created.' });
        else if (d.kind === 'PROGRESS' && /destroyed/i.test(d.summary ?? '')) push(e, { ...base, type: 'SANDBOX_DESTROYED', activity: 'building', summary: 'Sandbox destroyed.' });
        else if (d.kind === 'MODEL_OUTPUT' || d.kind === 'FINDING') push(e, { ...base, type: 'AGENT_WORKING', activity: building ? 'building' : 'investigating', summary: `${r.agentId} working.` });
        else if (d.kind === 'TEST_STARTED') push(e, { ...base, type: 'TESTING', activity: 'testing', summary: 'HQ running the acceptance tests.' });
        else if (d.kind === 'TEST_RESULT') push(e, { ...base, type: 'TEST_RESULT', activity: 'testing', summary: `Tests ${d.result}.` });
        else if (d.kind === 'COMMIT') push(e, { ...base, type: 'COMMIT', activity: 'building', summary: 'Local commit made by HQ (not pushed, not merged).' });
        else if (TERMINAL_KINDS.has(d.kind)) push(e, { ...base, type: 'AGENT_FINISHED', activity: d.kind === 'COMPLETED' ? 'done' : 'blocked', outcome: d.kind.toLowerCase(), summary: `${r.agentId} finished (${d.kind.toLowerCase()}).` });
        break;
      }
      default: break;
    }
  }
  return out.slice(-limit);
}

// What each agent and objective is doing now, and how far the construction has come.
export function worldSnapshot(snapshot) {
  const objectives = Object.values(snapshot.objectives ?? {});
  const stepOf = task => (task?.link ? snapshot.objectives?.[task.link.objectiveId]?.steps?.[task.link.stepId] : null);
  const agents = snapshot.agents.map(a => {
    const task = snapshot.tasks.find(t => t.id === a.assignment) ?? null, step = stepOf(task);
    const activity = !task ? 'idle' : task.operation === 'implement-repo' ? (task.stage === 'TESTING' ? 'testing' : 'building') : step ? STEP_ACTIVITY[step.kind] : task.operation === 'orchestrate' ? 'planning' : 'investigating';
    return { id: a.id, name: a.name, role: a.role, workstation: a.workstation, status: a.status, activity, objectiveId: task?.link?.objectiveId ?? null, taskId: task?.id ?? null, stepKind: step?.kind ?? null, taskStage: task?.stage ?? null };
  });
  const view = o => {
    const steps = o.order.map(id => o.steps[id]);
    return {
      id: o.id, title: o.input.title, status: o.status, activity: STATUS_ACTIVITY[o.status], reason: o.statusReason, risk: o.plan?.risk ?? null,
      needsKyle: o.status === 'AWAITING_APPROVAL' || Object.values(o.decisions).some(d => d.status === 'PENDING' && d.resume?.authority === 'kyle'),
      progress: { done: steps.filter(s => s.status === 'DONE').length, total: steps.length },
      steps: steps.map(s => ({ id: s.id, kind: s.kind, status: s.status, agentId: s.agentId, dependsOn: s.dependsOn })),
      createdAt: o.createdAt, endedAt: o.endedAt ?? null,
    };
  };
  const verifiedCommits = objectives.filter(o => o.status === 'COMPLETE' && o.result?.commit).length;
  const completed = objectives.filter(o => o.status === 'COMPLETE').length;
  return {
    v: WORLD_CONTRACT_VERSION, at: snapshot.now, seq: snapshot.seq,
    agents, objectives: objectives.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(view),
    // Construction progress is earned only by verified work: completed objectives and HQ-verified commits.
    construction: { completedObjectives: completed, verifiedCommits, activeObjectives: objectives.filter(o => !['COMPLETE', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(o.status)).length, level: Math.min(10, completed + verifiedCommits) },
  };
}
