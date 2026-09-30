// Pass 3: objective state. A pure reducer over HQ's one journal, so an objective (its plan, every step, every
// handoff, retry, approval and decision) is rebuilt exactly after a restart. Transitions are explicit: a
// transition the table does not allow throws before it is journaled, so no code path (and no agent output) can
// move an objective somewhere the lifecycle does not permit.

export const OBJECTIVE_STATES = ['QUEUED', 'PLANNING', 'INVESTIGATING', 'WAITING_FOR_EVIDENCE', 'READY_FOR_IMPLEMENTATION', 'IMPLEMENTING', 'VERIFYING', 'REVIEWING', 'AWAITING_DECISION', 'AWAITING_APPROVAL', 'BLOCKED', 'COMPLETE', 'FAILED', 'CANCELLED'];
export const TERMINAL = new Set(['COMPLETE', 'FAILED', 'CANCELLED', 'BLOCKED']);
const ACTIVE = ['INVESTIGATING', 'READY_FOR_IMPLEMENTATION', 'IMPLEMENTING', 'VERIFYING', 'REVIEWING'];
const STOP = ['WAITING_FOR_EVIDENCE', 'AWAITING_DECISION', 'AWAITING_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'];
// from -> allowed next states. BLOCKED, FAILED, COMPLETE and CANCELLED are final for an objective: a new attempt
// is a new objective, so history is never rewritten.
export const TRANSITIONS = {
  QUEUED: ['PLANNING', 'BLOCKED', 'CANCELLED', 'FAILED'],
  PLANNING: [...ACTIVE, 'COMPLETE', ...STOP],
  INVESTIGATING: [...ACTIVE, 'COMPLETE', ...STOP],
  WAITING_FOR_EVIDENCE: [...ACTIVE, 'COMPLETE', ...STOP],
  READY_FOR_IMPLEMENTATION: ['IMPLEMENTING', ...STOP],
  IMPLEMENTING: ['IMPLEMENTING', 'VERIFYING', ...STOP],
  VERIFYING: ['REVIEWING', 'IMPLEMENTING', 'COMPLETE', ...STOP],
  REVIEWING: ['REVIEWING', 'IMPLEMENTING', 'VERIFYING', 'COMPLETE', ...STOP],
  AWAITING_DECISION: [...ACTIVE, 'COMPLETE', 'AWAITING_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: [...ACTIVE, 'COMPLETE', 'AWAITING_DECISION', 'BLOCKED', 'FAILED', 'CANCELLED'],
  BLOCKED: [], COMPLETE: [], FAILED: [], CANCELLED: [],
};
export const STEP_STATES = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED', 'CANCELLED', 'INTERRUPTED'];
export const STEP_KINDS = ['investigate', 'implement', 'verify', 'review', 'rebuttal', 'local-check'];

export const ORCHESTRATION_EVENTS = new Set(['OBJECTIVE_CREATED', 'OBJECTIVE_PLANNED', 'OBJECTIVE_TRANSITION', 'OBJECTIVE_CANCEL_REQUESTED', 'STEP_ADDED', 'STEP_TRANSITION', 'HANDOFF_ACCEPTED', 'HANDOFF_REJECTED', 'STEP_RETRY', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'DECISION_REQUESTED', 'DECISION_RECORDED', 'DECISION_APPLIED', 'DISAGREEMENT_RECORDED', 'OBJECTIVE_RESULT', 'TASK_CANCELLED', 'RUN_RECONCILED']);

export function canTransition(from, to) { return (TRANSITIONS[from] ?? []).includes(to); }

// Applied after the engine's own reducer, for every journal event (replay and live take the same path).
export function reduceOrchestration(state, event) {
  const { type, data: d, at } = event;
  state.objectives ??= {};
  const o = d?.objectiveId ? state.objectives[d.objectiveId] : null;
  switch (type) {
    case 'OBJECTIVE_CREATED':
      state.objectives[d.id] = { id: d.id, input: d.input, requestedBy: d.requestedBy ?? null, limits: d.limits, deadlineAt: d.deadlineAt, createdAt: at, updatedAt: at, status: 'QUEUED', statusReason: 'Objective received.', plan: null, steps: {}, order: [], counters: { steps: 0, agentCalls: 0, retries: 0 }, approvals: {}, decisions: {}, disagreement: null, cancelRequested: false, spentUsd: 0, result: null, history: [{ at, to: 'QUEUED', reason: 'Objective received.' }] };
      break;
    case 'OBJECTIVE_PLANNED':
      o.plan = d.plan; o.updatedAt = at;
      for (const step of d.plan.steps) addStep(o, step, at);
      break;
    case 'STEP_ADDED': addStep(o, d.step, at); o.updatedAt = at; break;
    case 'OBJECTIVE_TRANSITION':
      o.history.push({ at, from: o.status, to: d.to, reason: d.reason });
      o.status = d.to; o.statusReason = d.reason; o.updatedAt = at;
      if (TERMINAL.has(d.to)) o.endedAt = at;
      break;
    case 'OBJECTIVE_CANCEL_REQUESTED': o.cancelRequested = true; o.cancelledBy = d.by; o.updatedAt = at; break;
    case 'STEP_TRANSITION': {
      const s = o.steps[d.stepId];
      s.history.push({ at, from: s.status, to: d.to, reason: d.reason ?? null });
      s.status = d.to; s.updatedAt = at;
      if (d.agentId) s.agentId = d.agentId;
      if (d.to === 'RUNNING') { s.attempts += 1; o.counters.steps += 1; }
      if (d.error) s.error = d.error;
      o.updatedAt = at;
      break;
    }
    case 'TASK_CREATED':
      // The link is part of the task's own creation event, so a crash can never leave a task without its step.
      // Creating a step's task also starts the step, in the same event: a crash between "task created" and
      // "step running" is impossible, so a restart can never dispatch the same step twice.
      if (d.link && state.objectives[d.link.objectiveId]) {
        const obj = state.objectives[d.link.objectiveId];
        obj.counters.agentCalls += 1; obj.updatedAt = at;
        const s = d.link.stepId ? obj.steps[d.link.stepId] : null;
        if (s) {
          s.history.push({ at, from: s.status, to: 'RUNNING', reason: `task ${d.id} for ${d.preferredAgentId}` });
          Object.assign(s, { status: 'RUNNING', taskId: d.id, agentId: d.preferredAgentId, updatedAt: at });
          s.taskIds.push(d.id); s.attempts += 1; obj.counters.steps += 1;
        } else (obj.callbacks ??= []).push({ taskId: d.id, decisionId: d.link.decisionId ?? null, at });
        if (s == null && d.link.decisionId && obj.decisions[d.link.decisionId]) obj.decisions[d.link.decisionId].callbackTaskId = d.id;
      }
      break;
    case 'HANDOFF_ACCEPTED': {
      const s = o.steps[d.stepId];
      Object.assign(s, { handoff: d.handoff, handoffHash: d.hash, handoffFrom: d.agentId ?? null, patchHash: d.patchHash ?? s.patchHash ?? null });
      o.updatedAt = at;
      break;
    }
    case 'HANDOFF_REJECTED': o.steps[d.stepId].rejections.push({ at, taskId: d.taskId, reason: d.reason }); o.updatedAt = at; break;
    case 'STEP_RETRY': {
      const s = o.steps[d.stepId];
      s.retries.push({ at, reason: d.reason, count: d.count, max: d.max, strategy: d.strategy, detail: d.detail ?? null, patchHash: d.patchHash ?? null });
      if (d.allowSameProvider) s.allowSameProvider = true;
      s.status = 'PENDING'; s.agentId = null; s.notBefore = d.notBefore ?? null; s.excludeAgents = d.excludeAgents ?? s.excludeAgents ?? [];
      if (d.repair) s.repair = d.repair;
      o.counters.retries += 1; o.updatedAt = at;
      break;
    }
    case 'APPROVAL_REQUESTED': o.approvals[d.gate] = { gate: d.gate, reason: d.reason, stage: d.stage, status: 'PENDING', requestedAt: at }; o.updatedAt = at; break;
    case 'APPROVAL_DECIDED': Object.assign(o.approvals[d.gate], { status: d.decision === 'approve' ? 'APPROVED' : 'DENIED', decidedAt: at, by: d.by, note: d.note ?? null }); o.updatedAt = at; break;
    case 'DECISION_REQUESTED': o.decisions[d.decisionId] = { id: d.decisionId, question: d.question, options: d.options, context: d.context ?? null, status: 'PENDING', requestedAt: at, resume: d.resume }; o.updatedAt = at; break;
    case 'DECISION_APPLIED': o.decisions[d.decisionId].applied = true; o.updatedAt = at; break;
    case 'DECISION_RECORDED': Object.assign(o.decisions[d.decisionId], { status: 'DECIDED', choice: d.choice, rationale: d.rationale, by: d.by, decidedAt: at }); o.updatedAt = at; break;
    case 'DISAGREEMENT_RECORDED': o.disagreement = { ...d.disagreement, at }; o.updatedAt = at; break;
    case 'OBJECTIVE_RESULT': o.result = { ...d.result, at }; o.updatedAt = at; break;
    case 'TASK_CANCELLED': {
      const t = state.tasks[d.taskId];
      Object.assign(t, { stage: 'CANCELLED', cancelled: { at, by: d.by, reason: d.reason, confirmed: d.confirmed }, blocker: d.reason, ownerAction: d.confirmed ? null : t.ownerAction, recoveryPending: false, endedAt: t.endedAt ?? at });
      break;
    }
    case 'RUN_RECONCILED': { const t = state.tasks[d.taskId]; if (t) t.interrupted = { at, evidence: d.evidence }; break; }
    case 'WORKER_EVENT': {
      // Measured spend attaches to the objective that owns the task (reported cost from the CLI's own counters).
      const run = state.runs[d.runId], t = run && state.tasks[run.taskId];
      if (d.kind === 'USAGE' && t?.link && Number.isFinite(d.usage?.reportedCostUsd)) {
        const obj = state.objectives[t.link.objectiveId];
        if (obj) obj.spentUsd = Math.round((obj.spentUsd + d.usage.reportedCostUsd) * 1e6) / 1e6;
      }
      break;
    }
    default: break;
  }
  return state;
}

function addStep(o, step, at) {
  o.steps[step.id] = { ...step, status: 'PENDING', attempts: 0, taskId: null, taskIds: [], agentId: null, handoff: null, handoffHash: null, rejections: [], retries: [], history: [], createdAt: at, updatedAt: at };
  o.order.push(step.id);
}
