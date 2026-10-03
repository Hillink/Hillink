// HQ progress telemetry (version 1). How far each agent assignment and each objective has really come, derived only
// from HQ's journal. It is a pure function of engine state, like the World contract (activity.mjs): nothing here is
// persisted, so a restart rebuilds exactly the same answer from the same events, and nothing here can be set by an
// agent. A worker can report what it did (evidence HQ journals: a sandbox write, a test run, a commit); HQ maps that
// evidence to a milestone from a fixed table, and the milestone, not the worker, decides the percentage. Free-form
// fields on evidence (a "progress" number, model text saying "90% done") are never read.
//
// Rules (deterministic; see PROFILES):
// - An assignment's percentage is the highest milestone HQ has observed since the last regression. Later evidence of
//   an earlier kind (reading after editing) changes the activity line, never the percentage.
// - A failed test run regresses to the milestone that has to be redone (EDITING), and a repair run, which HQ starts
//   after failed acceptance tests or a review asking for changes, starts at that same floor and carries its retry count.
// - WAITING, BLOCKED, STALLED and OFFLINE are states with no percentage (the last observed one is kept as
//   frozenProgress for context). COMPLETE is 100 and only HQ's acceptance (the step's handoff, or a finished unlinked
//   task) gets there. An agent without an assignment is IDLE, with no progress at all.
// - Objective progress is the weighted share of its plan's checklist that HQ has finished (DONE or SKIPPED steps,
//   decided approval gates), plus the running step's own progress. A repair re-opens its phase at the repair floor.
//   Only COMPLETE is 100. Different objective types have different checklists because they have different plans.
import { agentStatus } from '../engine.mjs';

export const PROGRESS_VERSION = 1;
// Assignment states. Only WORKING, ASSIGNED and COMPLETE carry a percentage.
export const PROGRESS_STATES = ['IDLE', 'ASSIGNED', 'WORKING', 'WAITING', 'BLOCKED', 'STALLED', 'OFFLINE', 'COMPLETE', 'FAILED', 'CANCELLED', 'UNAVAILABLE'];
export const OBJECTIVE_PROGRESS_STATES = ['PLANNING', 'WORKING', 'WAITING', 'BLOCKED', 'COMPLETE', 'FAILED', 'CANCELLED'];

// ---- milestone profiles (data). A profile is chosen by the task's operation; an operation HQ does not know uses
// 'agent', so a future agent or role works without changes here. map: canonical evidence signal -> what it does in
// this profile ({ to } advances, { regress } goes back, { result } reaches a result without regressing).
const ms = (id, percent, label) => ({ id, percent, label });
export const PROFILES = {
  // Claude's sandboxed implementation run (implementation-runner.mjs, subscription-implementer.mjs, broker audit).
  implementation: {
    milestones: [
      ms('ASSIGNED', 0, 'Assigned; waiting for HQ\'s runner to start'),
      ms('PREPARING', 5, 'Preparing the isolated worktree and sandbox'),
      ms('INVESTIGATING', 15, 'Reading the task repository'),
      ms('EDITING', 30, 'Editing files in the sandbox'),
      ms('FOCUSED_TESTING', 45, 'Running the task tests in the sandbox'),
      ms('FOCUSED_PASSED', 55, 'Task tests passed in the sandbox'),
      ms('HANDOFF', 65, 'HQ collecting and scope-checking the change'),
      ms('ACCEPTANCE_TESTING', 75, 'HQ running the acceptance tests'),
      ms('COMMITTING', 90, 'Acceptance tests passed; HQ committing locally'),
      ms('DELIVERED', 95, 'Run finished; HQ accepting the handoff'),
      ms('COMPLETE', 100, 'Implementation accepted by HQ'),
    ],
    repairFloor: 'EDITING',
    map: {
      STARTED: { to: 'PREPARING' }, PREPARING: { to: 'PREPARING' }, READING: { to: 'INVESTIGATING' }, WORKING: { to: 'INVESTIGATING' },
      EDITING: { to: 'EDITING' }, FOCUSED_TESTING: { to: 'FOCUSED_TESTING' }, FOCUSED_PASSED: { to: 'FOCUSED_PASSED' },
      FOCUSED_FAILED: { regress: 'EDITING', activity: 'Repairing after a failed sandbox test run' },
      CHANGES_FOUND: { to: 'HANDOFF' }, COLLECTING: { to: 'HANDOFF' }, TESTING: { to: 'ACCEPTANCE_TESTING' },
      TEST_PASSED: { to: 'COMMITTING' }, TEST_FAILED: { regress: 'EDITING', activity: 'Acceptance tests failed; the change goes back for repair' },
      COMMIT: { to: 'COMMITTING' }, DELIVERED: { to: 'DELIVERED' },
    },
  },
  // A model working read-only and answering (investigation, review, rebuttal, orchestration, local summaries).
  agent: {
    milestones: [
      ms('ASSIGNED', 0, 'Assigned; waiting for the agent to start'),
      ms('STARTED', 10, 'Session started'),
      ms('WORKING', 30, 'Reading and reasoning'),
      ms('ANSWERED', 85, 'Answer delivered; HQ validating it'),
      ms('DELIVERED', 95, 'Run finished; HQ accepting the handoff'),
      ms('COMPLETE', 100, 'Handoff accepted by HQ'),
    ],
    repairFloor: null,
    map: { STARTED: { to: 'STARTED' }, PREPARING: { to: 'STARTED' }, READING: { to: 'WORKING' }, WORKING: { to: 'WORKING' }, NOTE: { to: 'WORKING' }, CHANGES_FOUND: { to: 'WORKING' }, ANSWERED: { to: 'ANSWERED' }, DELIVERED: { to: 'DELIVERED' } },
  },
  // HQ's allowlisted local checks (worker.mjs): inspect the repository, run a test suite.
  check: {
    milestones: [
      ms('ASSIGNED', 0, 'Assigned; waiting for the local process to start'),
      ms('STARTED', 10, 'Local check started'),
      ms('INSPECTING', 25, 'Inspecting the repository'),
      ms('TESTING', 40, 'Running the tests'),
      ms('RESULT', 90, 'Check finished with a result'),
      ms('DELIVERED', 95, 'Process finished; HQ recording the result'),
      ms('COMPLETE', 100, 'Check complete'),
    ],
    repairFloor: null,
    // A failing test suite is the check's result (HQ reports it as such), not a regression of the check itself.
    map: { STARTED: { to: 'STARTED' }, WORKING: { to: 'INSPECTING' }, READING: { to: 'INSPECTING' }, CHANGES_FOUND: { to: 'INSPECTING' }, TESTING: { to: 'TESTING' }, TEST_PASSED: { to: 'RESULT', activity: 'Tests passed' }, TEST_FAILED: { to: 'RESULT', activity: 'Tests finished with failures' }, DELIVERED: { to: 'DELIVERED' } },
  },
};
const PROFILE_FOR_OPERATION = { 'implement-repo': 'implementation', 'inspect-repo': 'check', 'verify-hq': 'check', 'verify-unit': 'check' };
export const profileFor = task => PROFILES[PROFILE_FOR_OPERATION[task?.operation] ?? 'agent'];
// What the read-only profile is doing, in the words of the step it performs.
const KIND_WORK = { investigate: 'Investigating the repository', review: 'Reviewing the change', rebuttal: 'Answering the other agent\'s evidence', 'local-check': 'Working on the local check' };
const pct = (profile, id) => profile.milestones.find(m => m.id === id)?.percent ?? 0;
const label = (profile, id) => profile.milestones.find(m => m.id === id)?.label ?? id;

// HQ's own operation labels (inflight.mjs whileRunning callers in the implementation runners). These strings are HQ
// code, never agent output; tests/progress.test.mjs fails if a runner renames one.
export const HQ_OP_LABELS = [
  [/^Creating the task worktree$/, 'PREPARING', 'Creating the isolated worktree'],
  [/^Sandbox base image check$/, 'PREPARING', 'Checking the sandbox image'],
  [/^Sandbox \S+ creation$/, 'PREPARING', 'Creating the sandbox'],
  [/^Sandbox \S+ staging$/, 'PREPARING', 'Staging the repository into the sandbox'],
  [/^HQ diff of the sandbox$/, 'COLLECTING', 'HQ collecting the change from the sandbox'],
  [/^HQ acceptance tests/, 'TESTING', 'HQ running the acceptance tests'],
  [/^Sandbox \S+ teardown$/, null, 'Tearing down the sandbox'],
];

// One journaled worker event -> a canonical signal (or null). Reads only structured fields HQ code set.
export function signalOf(e) {
  switch (e.kind) {
    case 'ACK': return { signal: 'STARTED' };
    case 'MODEL_OUTPUT': return { signal: 'WORKING', detail: e.summary };
    // HQ's runners and adapters narrate with PROGRESS; a declared HQ operation is a milestone, anything else a note.
    case 'MODEL_RESULT': return { signal: 'ANSWERED' };
    case 'TEST_STARTED': return { signal: 'TESTING' };
    case 'TEST_PROGRESS': return { signal: 'TESTING', activity: Number.isInteger(e.completedTests) ? `Running the tests (${e.completedTests} finished)` : null };
    case 'TEST_RESULT': return { signal: e.result === 'passed' ? 'TEST_PASSED' : 'TEST_FAILED' };
    case 'COMMIT': return { signal: 'COMMIT' };
    case 'FINDING': return Array.isArray(e.files) && e.files.length ? { signal: 'CHANGES_FOUND' } : null;
    case 'COMPLETED': return { signal: 'DELIVERED' };
    case 'BROKER': {
      const ev = e.broker?.event;
      if (ev === 'BROKER_READ' || ev === 'BROKER_SEARCH') return { signal: 'READING' };
      if (ev === 'BROKER_WRITE_ALLOWED') return { signal: 'EDITING' };
      if (ev === 'SANDBOX_TEST_STARTED') return { signal: 'FOCUSED_TESTING' };
      if (ev === 'SANDBOX_TEST_COMPLETED') return { signal: e.broker.outcome === 'passed' ? 'FOCUSED_PASSED' : 'FOCUSED_FAILED' };
      return null;
    }
    case 'PROGRESS': {
      const begin = (e.phases ?? []).find(p => p.state === 'begin');
      if (begin && e.inFlight) {
        const hit = HQ_OP_LABELS.find(([re]) => re.test(String(begin.reason ?? '')));
        if (hit) return { signal: hit[1], activity: hit[2] };
        return null;
      }
      if (e.resume) return { signal: 'PREPARING', activity: 'Importing the preserved work into a fresh worktree' };
      if (e.reviewSource) return { signal: 'PREPARING', activity: 'Reading HQ\'s snapshot of the verified commit' };
      return e.inFlight ? null : { signal: 'NOTE', detail: e.summary };
    }
    default: return null;
  }
}

// ---- one assignment (task) ----
const DETAIL_KINDS = new Set(['MODEL_OUTPUT', 'PROGRESS']);
export function taskProgress(state, task, { now, statusOf } = {}) {
  const profile = profileFor(task), run = task.runId ? state.runs[task.runId] : null;
  const o = task.link ? state.objectives?.[task.link.objectiveId] : null, step = o && task.link.stepId ? o.steps[task.link.stepId] : null;
  const kindWork = step && profile === PROFILES.agent ? KIND_WORK[step.kind] : null;
  let milestone = 'ASSIGNED', reached = 0, activity = label(profile, 'ASSIGNED'), detail = null, updatedAt = run?.dispatchedAt ?? task.createdAt, focusedFailures = 0;
  let acceptanceFailed = false;
  for (const e of task.evidence) {
    if (!run || e.runId !== run.runId) continue;
    const s = signalOf(e);
    if (!s) continue;
    if (s.detail && DETAIL_KINDS.has(e.kind)) detail = String(s.detail).slice(0, 200);
    const rule = s.signal ? profile.map[s.signal] : null;
    if (rule?.regress) {
      milestone = rule.regress; reached = pct(profile, rule.regress); activity = rule.activity ?? label(profile, rule.regress); updatedAt = e.at;
      if (s.signal === 'FOCUSED_FAILED') focusedFailures += 1;
      if (s.signal === 'TEST_FAILED') acceptanceFailed = true;
    } else if (rule?.to && pct(profile, rule.to) >= reached) {
      // Only an advance (or a repeat of the current milestone) moves the activity line; earlier-kind evidence
      // (reading again while editing) leaves both the milestone and the activity where they are.
      reached = pct(profile, rule.to); milestone = rule.to; updatedAt = e.at;
      activity = s.activity ?? rule.activity ?? (rule.to === 'WORKING' && kindWork ? kindWork : label(profile, rule.to));
    } else if (s.activity && (rule || s.signal === null)) { activity = s.activity; updatedAt = e.at; }
  }
  // Retry and repair state: HQ's own records (the step's journaled retries, the task's repair attempt).
  const lastRetry = step?.retries?.at(-1) ?? null;
  const retry = task.repair
    ? { count: task.repair.attempt, max: task.repair.fromReview ? (o?.limits?.maxRepairs ?? null) : (lastRetry?.max ?? null), reason: task.repair.fromReview ? 'review_changes' : 'test_failure' }
    : lastRetry ? { count: lastRetry.count, max: lastRetry.max, reason: lastRetry.reason } : null;
  const floorId = task.repair && profile.repairFloor ? profile.repairFloor : null, floor = floorId ? pct(profile, floorId) : 0;
  if (floorId && reached <= floor) activity = `${task.repair.fromReview ? 'Repairing review findings' : 'Repairing failed acceptance test'}${milestone === floorId || milestone === 'ASSIGNED' ? '' : `: ${activity.charAt(0).toLowerCase()}${activity.slice(1)}`}`;
  let percent = Math.max(floor, reached);

  // State: what HQ knows about the run decides whether a percentage is shown at all.
  let status, frozen = null;
  const stepAccepted = step ? step.status === 'DONE' && step.taskId === task.id : task.stage === 'DONE';
  if (task.stage === 'CANCELLED') { status = 'CANCELLED'; activity = 'Cancelled'; }
  else if (run?.endedAt) {
    if (run.terminal === 'COMPLETED') {
      if (stepAccepted || (!step && task.stage === 'DONE')) { status = 'COMPLETE'; milestone = 'COMPLETE'; percent = 100; activity = label(profile, 'COMPLETE'); }
      else if ((step && step.status === 'FAILED' && step.taskId === task.id) || step?.rejections?.some(r => r.taskId === task.id)) { status = 'FAILED'; activity = 'HQ rejected the handoff'; }
      else { status = 'WORKING'; milestone = 'DELIVERED'; percent = pct(profile, 'DELIVERED') || percent; activity = label(profile, 'DELIVERED'); }
    } else if (run.terminal === 'RATE_LIMITED') { status = 'WAITING'; activity = 'Out of capacity; HQ waits (no paid fallback)'; }
    else if (run.terminal === 'FAILED') { status = 'FAILED'; activity = 'Run failed'; }
    else if (run.terminal === 'CANCELLED') { status = 'CANCELLED'; activity = 'Run stopped'; }
    else { status = 'BLOCKED'; activity = acceptanceFailed && profile === PROFILES.implementation ? 'Acceptance tests failed; waiting for HQ\'s repair decision' : 'Blocked'; }
  } else if (run) {
    const agent = state.agents[run.agentId];
    const engineStatus = statusOf ? statusOf(agent) : agentStatus(state, agent, now);
    if (task.stage === 'BLOCKED' || engineStatus === 'BLOCKED') { status = 'BLOCKED'; activity = 'Blocked: HQ has not proven the previous worker stopped'; }
    else if (!run.acknowledgedAt || engineStatus === 'UNKNOWN') status = run.acknowledgedAt ? 'WORKING' : 'ASSIGNED';
    else if (engineStatus === 'STALLED') { status = 'STALLED'; activity = 'No progress evidence within HQ\'s window'; }
    else if (engineStatus === 'OFFLINE') { status = 'OFFLINE'; activity = 'Worker liveness lost'; }
    else status = 'WORKING';
  } else if (task.stage === 'BLOCKED') { status = 'BLOCKED'; activity = task.spendBlocked ? 'Stopped at the spend gate; needs Kyle' : 'Blocked'; }
  else if (task.stage === 'DONE') { status = 'COMPLETE'; milestone = 'COMPLETE'; percent = 100; activity = label(profile, 'COMPLETE'); }
  else {
    status = 'WAITING';
    activity = task.waitingFor ? `Waiting for ${task.waitingFor.agentId} capacity (${String(task.waitingFor.capacity).toLowerCase().replace(/_/g, ' ')})` : task.notBefore > now ? `Queued until ${new Date(task.notBefore).toISOString()}` : `${step ? `${stepLabel(o, step)} queued` : 'Queued'}`;
  }
  if (!['WORKING', 'ASSIGNED', 'COMPLETE'].includes(status)) { frozen = status === 'CANCELLED' ? null : percent; percent = null; }
  const startedAt = run?.dispatchedAt ?? null, endedAt = run?.endedAt ?? task.endedAt ?? null;
  return {
    agent: run?.agentId ?? task.agentId ?? task.preferredAgentId ?? null,
    objectiveId: o?.id ?? null, objectiveTitle: o?.input?.title ?? null, stepId: step?.id ?? null, stepKind: step?.kind ?? null,
    taskId: task.id, taskTitle: task.title, operation: task.operation, profile: Object.keys(PROFILES).find(k => PROFILES[k] === profile),
    status, progress: percent, ...(frozen != null ? { frozenProgress: frozen } : {}),
    activity, milestone, milestoneLabel: label(profile, milestone), ...(detail && status === 'WORKING' ? { detail } : {}),
    retry, ...(focusedFailures ? { sandboxTestFailures: focusedFailures } : {}),
    startedAt, updatedAt, endedAt, elapsedMs: startedAt == null ? null : Math.max(0, (endedAt ?? now) - startedAt),
  };
}

// ---- objectives ----
export const STEP_WEIGHTS = { investigate: 30, implement: 45, verify: 10, review: 25, rebuttal: 10, 'local-check': 10 };
export const GATE_WEIGHT = 5, DEFAULT_STEP_WEIGHT = 10;
const ITEM_STATUS = { PENDING: 'pending', RUNNING: 'running', DONE: 'done', SKIPPED: 'skipped', FAILED: 'failed', CANCELLED: 'cancelled', INTERRUPTED: 'failed' };
function stepLabel(o, s) {
  if (s.kind === 'review') return s.standalone ? 'Review' : s.reviewRule?.independentProvider === false || s.allowSameProvider ? 'Review' : 'Independent review';
  return { investigate: 'Investigation', implement: 'Implementation', verify: 'HQ verification', rebuttal: 'Disagreement round', 'local-check': 'Local check' }[s.kind] ?? `${s.kind.charAt(0).toUpperCase()}${s.kind.slice(1)}`;
}
const OBJECTIVE_STATE = { QUEUED: 'PLANNING', PLANNING: 'PLANNING', WAITING_FOR_EVIDENCE: 'WAITING', AWAITING_DECISION: 'WAITING', AWAITING_APPROVAL: 'WAITING', BLOCKED: 'BLOCKED', FAILED: 'FAILED', CANCELLED: 'CANCELLED', COMPLETE: 'COMPLETE' };
const TERMINAL_OBJECTIVE = new Set(['COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED']);

export function objectiveProgress(state, o, { now, taskView } = {}) {
  const view = taskView ?? (t => taskProgress(state, t, { now }));
  // The checklist follows the plan as it really is: the latest step of each kind is that phase (a repair or a
  // follow-up supersedes the earlier attempt), in the order the plan reached them.
  const latest = new Map();
  for (const id of o.order ?? []) latest.set(o.steps[id].kind, o.steps[id]);
  const items = [];
  for (const s of latest.values()) {
    const weight = STEP_WEIGHTS[s.kind] ?? DEFAULT_STEP_WEIGHT;
    const task = s.taskId ? state.tasks[s.taskId] : null;
    const live = s.status === 'RUNNING' && task ? view(task) : null;
    const floor = s.repair && s.kind === 'implement' ? pct(PROFILES.implementation, PROFILES.implementation.repairFloor) / 100 : 0;
    let credit = 0;
    if (s.status === 'DONE' || s.status === 'SKIPPED') credit = weight;
    else if (s.status === 'RUNNING') credit = weight * Math.max(floor, ((live?.progress ?? live?.frozenProgress ?? (s.agentId === 'hq' ? 50 : 0)) / 100));
    else if (s.status === 'PENDING') credit = weight * floor;
    items.push({ key: s.kind, label: stepLabel(o, s), status: ITEM_STATUS[s.status] ?? 'pending', stepId: s.id, agentId: s.agentId ?? null, weight, credit, attempts: s.attempts, retries: s.retries?.length ?? 0, ...(s.repair ? { repair: s.repair.attempt } : {}), ...(s.status === 'SKIPPED' && s.boundary ? { consolidated: true } : {}), ...(live ? { agentProgress: live.progress, activity: live.activity } : {}) });
  }
  // A fix objective's implementation phases exist only after the investigation justifies them; until then the plan's
  // expected path shows them as projected (pending), so finishing the investigation is not "done".
  // Each expected phase not materialized yet is projected on its own, so the moment HQ adds the steps (one journal event
  // each) never shows a transient jump.
  if (o.input?.type === 'fix' && !TERMINAL_OBJECTIVE.has(o.status) && o.plan) {
    for (const kind of ['implement', 'verify', 'review']) if (!latest.has(kind)) items.push({ key: kind, label: stepLabel(o, { kind, reviewRule: o.plan.reviewRule }), status: 'pending', stepId: null, agentId: null, weight: STEP_WEIGHTS[kind], credit: 0, attempts: 0, retries: 0, projected: true });
  }
  // Kyle's approval gates: decided ones count as done; a denial is a failed item.
  const gates = [...new Set([...(o.plan?.gates ?? []), ...Object.keys(o.approvals ?? {})])];
  for (const g of gates) {
    const a = o.approvals?.[g];
    const status = !a ? 'pending' : a.status === 'APPROVED' ? 'done' : a.status === 'DENIED' ? 'failed' : 'waiting';
    items.push({ key: `gate:${g}`, label: `Kyle approval: ${g}`, status, stepId: null, agentId: 'kyle', weight: GATE_WEIGHT, credit: status === 'done' ? GATE_WEIGHT : 0, gate: g });
  }
  const total = items.reduce((n, i) => n + i.weight, 0), earned = items.reduce((n, i) => n + i.credit, 0);
  const progress = o.status === 'COMPLETE' ? 100 : total ? Math.min(99, Math.floor((100 * earned) / total)) : 0;
  const state_ = OBJECTIVE_STATE[o.status] ?? 'WORKING';
  const current = items.find(i => i.status === 'running') ?? items.find(i => i.status === 'waiting') ?? items.find(i => i.status === 'pending' && !i.projected) ?? null;
  const agents = Object.values(state.tasks).filter(t => t.link?.objectiveId === o.id && t.runId && !state.runs[t.runId]?.endedAt).map(t => state.runs[t.runId].agentId);
  for (const s of Object.values(o.steps)) if (s.status === 'RUNNING' && s.agentId === 'hq') agents.push('hq');
  const retries = Object.values(o.steps).reduce((n, s) => n + (s.retries?.length ?? 0), 0);
  const repairs = Object.values(o.steps).filter(s => s.kind === 'implement' && s.repair).length;
  return {
    objectiveId: o.id, title: o.input?.title ?? null, type: o.input?.type ?? null, status: o.status, state: state_, reason: o.statusReason ?? null,
    progress, checklist: items.map(({ credit, ...rest }) => rest),
    done: items.filter(i => i.status === 'done' || i.status === 'skipped').length, total: items.length,
    current: current ? { key: current.key, label: current.label, status: current.status, stepId: current.stepId } : null,
    agents: [...new Set(agents)], retries, repairs,
    startedAt: o.createdAt, updatedAt: o.updatedAt, endedAt: o.endedAt ?? null, elapsedMs: Math.max(0, (o.endedAt ?? now) - o.createdAt),
  };
}

// ---- the canonical snapshot ----
// statusOf(agent): the engine's liveness status for an agent (engine.status), so STALLED and OFFLINE agree with the
// watchdog. Without it the pure agentStatus() from the journal is used.
export function progressSnapshot(state, { now = Date.now(), statusOf = null, objectiveLimit = 20, recentMs = 24 * 3600_000 } = {}) {
  const status = statusOf ?? (a => agentStatus(state, a, now));
  const cache = new Map();
  const view = t => { if (!cache.has(t.id)) cache.set(t.id, taskProgress(state, t, { now, statusOf: status })); return cache.get(t.id); };
  const tasks = Object.values(state.tasks);
  const agents = [];
  for (const a of Object.values(state.agents)) {
    if (a.lifecycle?.state === 'RETIRED') continue;
    const base = { agent: a.id, name: a.name, role: a.role ?? null };
    const task = a.assignment ? state.tasks[a.assignment] : null;
    if (task) { agents.push({ ...base, ...view(task), agent: a.id }); continue; }
    if (a.lifecycle && a.lifecycle.state !== 'ACTIVE') { agents.push({ ...base, status: 'UNAVAILABLE', progress: null, activity: `Not on the team yet (${a.lifecycle.state.toLowerCase()})`, milestone: null }); continue; }
    // Work HQ has queued for this agent, not yet started: WAITING (never a percentage).
    const queued = tasks.filter(t => t.stage === 'READY' && (t.preferredAgentId === a.id || t.waitingFor?.agentId === a.id)).sort((x, y) => y.priority - x.priority || x.createdAt - y.createdAt)[0];
    if (queued) { agents.push({ ...base, ...view(queued), agent: a.id }); continue; }
    const last = tasks.filter(t => t.agentId === a.id && t.endedAt != null).sort((x, y) => y.endedAt - x.endedAt)[0];
    agents.push({ ...base, status: 'IDLE', progress: null, activity: 'Idle', milestone: null, objectiveId: null, stepId: null, taskId: null, last: last ? { taskId: last.id, objectiveId: last.link?.objectiveId ?? null, outcome: view(last).status, endedAt: last.endedAt } : null });
  }
  // HQ's own in-process steps (deterministic verification) run as the 'hq' system agent while they run.
  for (const o of Object.values(state.objectives ?? {})) for (const s of Object.values(o.steps)) {
    if (s.status !== 'RUNNING' || s.agentId !== 'hq') continue;
    const since = [...(s.history ?? [])].reverse().find(h => h.to === 'RUNNING')?.at ?? s.updatedAt;
    agents.push({ agent: 'hq', name: 'HQ verification', role: 'HQ deterministic checks (not an AI model)', system: true, status: 'WORKING', progress: 50, activity: 'HQ verifying the commit from git and its own evidence', milestone: 'VERIFYING', milestoneLabel: 'HQ verifying', objectiveId: o.id, objectiveTitle: o.input?.title ?? null, stepId: s.id, stepKind: s.kind, taskId: null, retry: null, startedAt: since, updatedAt: s.updatedAt, endedAt: null, elapsedMs: Math.max(0, now - since) });
  }
  const assignments = tasks.filter(t => t.runId && !state.runs[t.runId]?.endedAt).map(view);
  const objectives = Object.values(state.objectives ?? {})
    .filter(o => !TERMINAL_OBJECTIVE.has(o.status) || now - (o.endedAt ?? o.updatedAt) <= recentMs)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, objectiveLimit)
    .map(o => objectiveProgress(state, o, { now, taskView: view }));
  return { v: PROGRESS_VERSION, seq: state.seq, at: now, agents, assignments, objectives };
}

// What changed for a live stream: everything except the clock (elapsed time is derived from startedAt by the reader).
export function progressFingerprint(snapshot) {
  return JSON.stringify(snapshot, (key, value) => (key === 'at' || key === 'elapsedMs' || key === 'seq' ? undefined : value));
}
