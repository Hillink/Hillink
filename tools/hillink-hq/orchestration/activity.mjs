// Pass 3 World contract (version 1). HQ emits truthful state; the Hillink World only visualizes it. Everything here
// is a pure function of HQ's journal, so the World can replay from any sequence number and never needs HQ internals.
// Nothing here reads model output: summaries are HQ-authored strings. Agent answers (untrusted text) never reach the
// World through this contract.
//
// Activity item: { v, seq, at, type, activity, objectiveId, taskId, stepId, stepKind, agentId, summary } (+ verdict on a
// review HANDOFF_RECEIVED: approve | request_changes | reject)
//   seq      the journal sequence number of the event it came from (monotonic; use it as a cursor)
//   type     one of ACTIVITY_TYPES
//   activity the broad animation state for the agent or objective: one of ACTIVITIES
// Snapshot: { v, at, seq, agents[], objectives[], construction, progress }
//   progress (additive) is HQ's canonical progress telemetry (orchestration/progress.mjs), passed in by the server: each
//   agent and objective entry also carries its own `telemetry` (status, progress, activity, milestone, objective). The
//   World displays these; it never computes a percentage of its own.
export const WORLD_CONTRACT_VERSION = 1;
export const ACTIVITY_TYPES = ['TASK_CREATED', 'PLANNING_STARTED', 'AGENT_ASSIGNED', 'AGENT_STARTED', 'AGENT_WORKING', 'HANDOFF_RECEIVED', 'HANDOFF_REJECTED', 'IMPLEMENTATION_STARTED', 'SANDBOX_CREATED', 'SANDBOX_DESTROYED', 'TESTING', 'TEST_RESULT', 'COMMIT', 'VERIFYING', 'REVIEWING', 'RETRYING', 'APPROVAL_REQUIRED', 'DECISION_REQUIRED', 'WAITING', 'AGENT_FINISHED', 'BLOCKED', 'COMPLETE', 'FAILED', 'CANCELLED',
  // Pass 4 compute events (additive). Items may carry computeClass: LOCAL | SUBSCRIPTION | METERED_API, so the World
  // can show local, subscription and paid external compute differently. Amounts are dollars; never credentials.
  'COMPUTE_SELECTED', 'LOCAL_AGENT_STARTED', 'SUBSCRIPTION_AGENT_STARTED', 'METERED_AGENT_STARTED', 'AGENT_CAPACITY_EXHAUSTED', 'WAITING_FOR_CAPACITY', 'SPEND_APPROVAL_REQUIRED', 'SPEND_AUTHORIZED', 'SPEND_REVOKED', 'BUDGET_EXHAUSTED',
  // Pass 4.5 split-broker events (additive). HQ-authored, from the broker's audit: never a path, file content, prompt,
  // model text or credential.
  'FILE_EDITING', 'REPAIRING', 'IMPLEMENTATION_FINISHED'];
const STARTED = { LOCAL: 'LOCAL_AGENT_STARTED', SUBSCRIPTION: 'SUBSCRIPTION_AGENT_STARTED', METERED_API: 'METERED_AGENT_STARTED' };
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
      case 'HANDOFF_ACCEPTED': {
        // Pass 5B (additive): a review handoff carries its validated verdict (an enum HQ checked, never model text), so
        // the World can tell an approved review from one that asked for changes.
        const verdict = d.handoff?.kind === 'review' && ['approve', 'request_changes', 'reject'].includes(d.handoff.verdict) ? { verdict: d.handoff.verdict } : {};
        push(e, { type: 'HANDOFF_RECEIVED', activity: 'done', objectiveId: d.objectiveId, stepId: d.stepId, taskId: d.taskId, agentId: d.agentId ?? null, stepKind: d.handoff?.kind ?? null, ...verdict, summary: `${d.handoff?.kind ?? 'Handoff'} accepted by HQ.` });
        break;
      }
      case 'HANDOFF_REJECTED': push(e, { type: 'HANDOFF_REJECTED', activity: 'waiting', objectiveId: d.objectiveId, stepId: d.stepId, taskId: d.taskId, summary: 'HQ rejected a handoff that failed validation.' }); break;
      case 'TASK_CREATED': {
        const t = { id: d.id, operation: d.operation, objectiveId: d.link?.objectiveId ?? null, stepId: d.link?.stepId ?? null };
        tasks.set(d.id, t);
        break;
      }
      case 'DISPATCHED': {
        const t = tasks.get(d.taskId) ?? {};
        runs.set(d.runId, { ...t, agentId: d.agentId, computeClass: d.compute?.computeClass ?? null });
        push(e, { type: 'AGENT_ASSIGNED', activity: 'waiting', objectiveId: t.objectiveId ?? null, stepId: t.stepId ?? null, taskId: d.taskId, agentId: d.agentId, summary: `${d.agentId} assigned.` });
        if (d.compute) push(e, { type: 'COMPUTE_SELECTED', activity: 'waiting', objectiveId: t.objectiveId ?? null, stepId: t.stepId ?? null, taskId: d.taskId, agentId: d.agentId, computeClass: d.compute.computeClass, provider: d.compute.provider, summary: `${d.agentId} on ${d.compute.computeClass.toLowerCase().replace('_', ' ')} compute${d.compute.computeClass === 'METERED_API' ? ` (reserved up to $${Number(d.compute.reservedUsd ?? 0).toFixed(2)})` : ' ($0 metered)'}.` });
        break;
      }
      case 'WORKER_EVENT': {
        const r = runs.get(d.runId); if (!r) break;
        const base = { objectiveId: r.objectiveId, stepId: r.stepId, taskId: r.id, agentId: r.agentId };
        const building = r.operation === 'implement-repo';
        if (d.kind === 'ACK') {
          push(e, { ...base, type: 'AGENT_STARTED', activity: building ? 'building' : 'investigating', summary: `${r.agentId} started.` });
          if (STARTED[r.computeClass]) push(e, { ...base, type: STARTED[r.computeClass], computeClass: r.computeClass, activity: building ? 'building' : 'investigating', summary: `${r.agentId} started on ${r.computeClass.toLowerCase().replace('_', ' ')} compute.` });
          if (building) push(e, { ...base, type: 'IMPLEMENTATION_STARTED', activity: 'building', summary: 'Implementation started (sandboxed).' });
        } else if (d.kind === 'PROGRESS' && /created/i.test(d.summary ?? '')) push(e, { ...base, type: 'SANDBOX_CREATED', activity: 'building', summary: 'Sandbox created.' });
        else if (d.kind === 'PROGRESS' && /destroyed/i.test(d.summary ?? '')) push(e, { ...base, type: 'SANDBOX_DESTROYED', activity: 'building', summary: 'Sandbox destroyed.' });
        else if (d.kind === 'MODEL_OUTPUT' || d.kind === 'FINDING') push(e, { ...base, type: 'AGENT_WORKING', activity: building ? 'building' : 'investigating', summary: `${r.agentId} working.` });
        else if (d.kind === 'TEST_STARTED') push(e, { ...base, type: 'TESTING', activity: 'testing', summary: 'HQ running the acceptance tests.' });
        else if (d.kind === 'TEST_RESULT') push(e, { ...base, type: 'TEST_RESULT', activity: 'testing', summary: `Tests ${d.result}.` });
        else if (d.kind === 'COMMIT') push(e, { ...base, type: 'COMMIT', activity: 'building', summary: 'Local commit made by HQ (not pushed, not merged).' });
        else if (d.kind === 'BROKER') {
          const ev = d.broker?.event;
          if (ev === 'BROKER_WRITE_ALLOWED') push(e, { ...base, type: 'FILE_EDITING', activity: 'building', summary: `${r.agentId} editing a file in the sandbox.` });
          else if (ev === 'BROKER_READ' || ev === 'BROKER_SEARCH') push(e, { ...base, type: 'AGENT_WORKING', activity: 'building', summary: `${r.agentId} reading the task repository.` });
          else if (ev === 'SANDBOX_TEST_STARTED') push(e, { ...base, type: r.testFailed ? 'REPAIRING' : 'TESTING', activity: 'testing', summary: r.testFailed ? `${r.agentId} repairing: re-running the tests after a failure.` : `${r.agentId} running the tests in the sandbox.` });
          else if (ev === 'SANDBOX_TEST_COMPLETED') { r.testFailed = d.broker.outcome !== 'passed'; push(e, { ...base, type: 'TEST_RESULT', activity: 'testing', summary: `Agent's test run ${r.testFailed ? 'failed' : 'passed'}.` }); }
        }
        else if (d.kind === 'RATE_LIMITED') push(e, { ...base, type: 'AGENT_CAPACITY_EXHAUSTED', activity: 'waiting', computeClass: r.computeClass, capacity: d.capacity === 'SUBSCRIPTION_LIMIT_REACHED' ? 'SUBSCRIPTION_LIMIT_REACHED' : 'RATE_LIMITED', summary: `${r.agentId} is out of capacity; HQ waits (no paid fallback).` });
        if (TERMINAL_KINDS.has(d.kind) && building) push(e, { ...base, type: 'IMPLEMENTATION_FINISHED', activity: d.kind === 'COMPLETED' ? 'done' : 'blocked', outcome: d.kind.toLowerCase(), summary: `Implementation finished (${d.kind.toLowerCase()}).` });
        if (TERMINAL_KINDS.has(d.kind)) push(e, { ...base, type: 'AGENT_FINISHED', activity: d.kind === 'COMPLETED' ? 'done' : 'blocked', outcome: d.kind.toLowerCase(), summary: `${r.agentId} finished (${d.kind.toLowerCase()}).` });
        break;
      }
      case 'WAITING_FOR_CAPACITY': push(e, { type: 'WAITING_FOR_CAPACITY', activity: 'waiting', taskId: d.taskId, agentId: d.agentId, computeClass: d.computeClass ?? null, capacity: d.capacity, summary: `Waiting for ${d.agentId} capacity (${String(d.capacity).toLowerCase().replace(/_/g, ' ')}); no paid fallback.` }); break;
      case 'SPEND_APPROVAL_REQUIRED': push(e, { type: 'SPEND_APPROVAL_REQUIRED', activity: 'blocked', objectiveId: d.objectiveId ?? tasks.get(d.taskId)?.objectiveId ?? null, stepId: d.stepId ?? null, taskId: d.taskId ?? null, agentId: d.agentId ?? null, computeClass: 'METERED_API', provider: d.provider, summary: `Stopped before metered ${d.provider} compute: needs Kyle's spend approval.` }); break;
      case 'SPEND_AUTHORIZED': push(e, { type: 'SPEND_AUTHORIZED', activity: 'waiting', objectiveId: d.scope?.objectiveId ?? null, taskId: d.scope?.taskId ?? null, agentId: d.scope?.agentId ?? null, amountUsd: d.amountUsd, summary: `Kyle authorized up to $${Number(d.amountUsd).toFixed(2)}.` }); break;
      case 'SPEND_REVOKED': push(e, { type: 'SPEND_REVOKED', activity: 'waiting', summary: 'Kyle revoked a spend authorization.' }); break;
      case 'BUDGET_EXHAUSTED': push(e, { type: 'BUDGET_EXHAUSTED', activity: 'blocked', amountUsd: d.amountUsd, summary: `A $${Number(d.amountUsd).toFixed(2)} authorization is used up; metered work stops.` }); break;
      default: break;
    }
  }
  return out.slice(-limit);
}

// What each agent and objective is doing now, and how far the construction has come.
export function worldSnapshot(snapshot, { progress = null } = {}) {
  const objectives = Object.values(snapshot.objectives ?? {});
  const stepOf = task => (task?.link ? snapshot.objectives?.[task.link.objectiveId]?.steps?.[task.link.stepId] : null);
  const agents = snapshot.agents.map(a => {
    const task = snapshot.tasks.find(t => t.id === a.assignment) ?? null, step = stepOf(task);
    const activity = !task ? 'idle' : task.operation === 'implement-repo' ? (task.stage === 'TESTING' ? 'testing' : 'building') : step ? STEP_ACTIVITY[step.kind] : task.operation === 'orchestrate' ? 'planning' : 'investigating';
    const run = task?.runId ? snapshot.compute?.ledger?.rows?.find(r => r.run === task.runId) : null;
    return { id: a.id, name: a.name, role: a.role, workstation: a.workstation, status: a.status, activity, computeClass: run?.computeClass ?? null, capacity: snapshot.compute?.capacity?.[a.id] ?? null, objectiveId: task?.link?.objectiveId ?? null, taskId: task?.id ?? null, stepKind: step?.kind ?? null, taskStage: task?.stage ?? null, ...(progress ? { telemetry: progress.agents.find(p => p.agent === a.id) ?? null } : {}) };
  });
  const view = o => {
    const steps = o.order.map(id => o.steps[id]);
    return {
      id: o.id, title: o.input.title, status: o.status, activity: STATUS_ACTIVITY[o.status], reason: o.statusReason, risk: o.plan?.risk ?? null,
      needsKyle: o.status === 'AWAITING_APPROVAL' || Object.values(o.decisions).some(d => d.status === 'PENDING' && d.resume?.authority === 'kyle'),
      progress: { done: steps.filter(s => s.status === 'DONE').length, total: steps.length },
      steps: steps.map(s => ({ id: s.id, kind: s.kind, status: s.status, agentId: s.agentId, dependsOn: s.dependsOn })),
      createdAt: o.createdAt, endedAt: o.endedAt ?? null,
      ...(progress ? { telemetry: progress.objectives.find(p => p.objectiveId === o.id) ?? null } : {}),
    };
  };
  const verifiedCommits = objectives.filter(o => o.status === 'COMPLETE' && o.result?.commit).length;
  const completed = objectives.filter(o => o.status === 'COMPLETE').length;
  return {
    v: WORLD_CONTRACT_VERSION, at: snapshot.now, seq: snapshot.seq,
    agents, objectives: objectives.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(view),
    // Construction progress is earned only by verified work: completed objectives and HQ-verified commits.
    construction: { completedObjectives: completed, verifiedCommits, activeObjectives: objectives.filter(o => !['COMPLETE', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(o.status)).length, level: Math.min(10, completed + verifiedCommits) },
    ...(progress ? { progress } : {}),
  };
}
