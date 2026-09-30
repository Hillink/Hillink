import { randomUUID } from 'node:crypto';
import { initialAgents, operations } from './registry.mjs';
import { validateImplementation } from './implementation-policy.mjs';
import { ORCHESTRATION_EVENTS, reduceOrchestration } from './orchestration/state.mjs';
import { COMPUTE_EVENTS, reduceCompute, emptyCompute, computeLedger } from './compute/state.mjs';
import { decideVariants, issueGrant, classRank, capacityOf, validateSpendAuthorization, authorizationStatus, DEFAULT_MODE, MODES } from './compute/policy.mjs';
import { routeFor } from './compute/registry.mjs';

export const defaults = { computeMode: DEFAULT_MODE, heartbeatMs: 15_000, progressMs: 120_000, adapterTimeoutMs: 3000, quarantineMs: 60_000, observationJournalMs: 300_000, maxAttempts: 2, maxLocalWorkers: 1 };
async function bounded(call, timeoutMs) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(call), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Adapter response timed out')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
const progressKinds = new Set(['PROGRESS', 'COMMIT', 'TEST_PROGRESS', 'TEST_RESULT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED', 'MODEL_OUTPUT', 'MODEL_RESULT']);
const liveStages = new Set(['CLAIMED', 'IMPLEMENTING', 'TESTING', 'REVIEW']);
const eventTypes = new Set(['AGENT_REGISTERED', 'AGENT_CONFIGURED', 'AGENT_OBSERVED', 'TASK_CREATED', 'DISPATCHED', 'WORKER_EVENT', 'RECOVERY', 'TASK_REQUEUED', 'TASK_PARKED', 'ALERT_OPENED', 'ALERT_RESOLVED', 'ALERT_ACKNOWLEDGED', 'NOTIFICATION_DELIVERED', 'NOTIFICATION_FAILED', 'OWNER_CONFIRMED_TERMINATION', ...ORCHESTRATION_EVENTS, ...COMPUTE_EVENTS]);
// Stages after which a task never runs again. CANCELLED (Pass 3) is final: later worker evidence cannot reopen it.
export const FINAL_STAGES = new Set(['DONE', 'BLOCKED', 'CANCELLED']);
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function emptyState() { return { version: 1, seq: 0, agents: {}, tasks: {}, runs: {}, alerts: {}, events: [], meeting: null, objectives: {}, compute: emptyCompute() }; }

// A pure reducer: replay and live state take exactly the same path.
export function reduce(state, event) {
  const { type, data: d, at } = event;
  if (!eventTypes.has(type)) throw Error(`Unsupported event type ${type}; refusing partial replay`);
  state.seq = event.seq;
  state.events.push(event);
  if (type === 'AGENT_REGISTERED') state.agents[d.id] = { ...d, observedStatus: 'UNKNOWN', observedAt: null, lastMeaningfulAt: null, assignment: null, usage: null };
  if (type === 'AGENT_CONFIGURED') Object.assign(state.agents[d.agentId], d.configuration);
  if (type === 'AGENT_OBSERVED') Object.assign(state.agents[d.agentId], { observedStatus: d.status, observedAt: at, detail: d.detail, retryAt: d.retryAt ?? null });
  if (type === 'AGENT_OBSERVED' && d.quarantineUntil) state.agents[d.agentId].quarantineUntil = d.quarantineUntil;
  if (type === 'TASK_CREATED') state.tasks[d.id] = { ...d, stage: d.safety === 'owner-required' ? 'BLOCKED' : 'READY', createdAt: at, attempts: 0, runId: null, evidence: [], handoffs: [], blocker: d.ownerAction || null };
  if (type === 'DISPATCHED') {
    const task = state.tasks[d.taskId];
    Object.assign(task, { stage: 'CLAIMED', runId: d.runId, agentId: d.agentId, claimedAt: at, attempts: task.attempts + 1, blocker: null, endedAt: null, recoveryPending: false, notBefore: null });
    state.agents[d.agentId].assignment = d.taskId;
    state.runs[d.runId] = { ...d, dispatchedAt: at, acknowledgedAt: null, heartbeatAt: null, lastMeaningfulAt: at, endedAt: null, terminal: null };
  }
  if (type === 'WORKER_EVENT') {
    const run = state.runs[d.runId], task = state.tasks[run.taskId], agent = state.agents[run.agentId];
    task.evidence.push({ ...d, at });
    if (d.kind === 'ACK') { run.acknowledgedAt = at; run.heartbeatAt = at; task.stage = 'IMPLEMENTING'; }
    if (d.kind === 'HEARTBEAT') run.heartbeatAt = at;
    if (d.kind === 'TEST_STARTED') task.stage = 'TESTING';
    if (d.kind === 'TEST_RESULT') task.verificationResult = d.result;
    if (d.kind === 'REVIEW') task.stage = 'REVIEW';
    if (progressKinds.has(d.kind)) { run.lastMeaningfulAt = at; agent.lastMeaningfulAt = at; task.lastMeaningfulAt = at; }
    if (d.kind === 'HANDOFF') task.handoffs.push({ ...d, at });
    if (d.kind === 'USAGE') agent.usage = { ...d.usage, at };
    if (d.kind === 'UNCERTAIN') Object.assign(task, { stage: 'BLOCKED', blocker: d.summary, ownerAction: d.ownerAction || 'Verify the remote worker stopped before releasing this run.' });
    if (['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED'].includes(d.kind)) {
      run.endedAt = at; run.terminal = d.kind; agent.assignment = null;
      // A cancelled task stays CANCELLED: the run's own terminal evidence is recorded, the stage is not reopened.
      if (task.stage !== 'CANCELLED') task.stage = d.kind === 'COMPLETED' ? 'DONE' : 'BLOCKED';
      task.endedAt = at;
      task.blocker = d.kind === 'COMPLETED' ? null : d.summary;
      task.ownerAction = d.ownerAction ?? null;
      task.recoveryPending = task.stage !== 'CANCELLED' && (d.kind === 'FAILED' || d.kind === 'RATE_LIMITED');
      if (d.kind === 'RATE_LIMITED') task.notBefore = d.retryAt ?? null;
      agent.observedStatus = d.kind === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'IDLE';
      agent.capacityState = d.kind === 'RATE_LIMITED' ? (d.capacity === 'SUBSCRIPTION_LIMIT_REACHED' ? 'SUBSCRIPTION_LIMIT_REACHED' : 'RATE_LIMITED') : null;
      agent.retryAt = d.retryAt ?? null; agent.observedAt = at;
    }
  }
  if (type === 'RECOVERY') state.tasks[d.taskId].recovery = { ...d, at };
  if (type === 'TASK_REQUEUED') Object.assign(state.tasks[d.taskId], { stage: 'READY', runId: null, agentId: null, blocker: null, ownerAction: null, recoveryPending: false, notBefore: d.notBefore ?? null, spendBlocked: false });
  if (type === 'TASK_PARKED') {
    const task = state.tasks[d.taskId];
    Object.assign(task, { stage: 'BLOCKED', blocker: d.reason, ownerAction: d.ownerAction ?? null, recoveryPending: false });
    // Never clear an uncertain live run; this retains the concurrency/resource lock.
  }
  if (type === 'ALERT_OPENED') state.alerts[d.key] = { ...d, openedAt: at, active: true, acknowledgedAt: null, deliveredAt: null, deliveryError: null };
  if (type === 'ALERT_RESOLVED') state.alerts[d.key].active = false;
  if (type === 'ALERT_ACKNOWLEDGED') state.alerts[d.key].acknowledgedAt = at;
  if (type === 'NOTIFICATION_DELIVERED') Object.assign(state.alerts[d.key], { deliveredAt: at, deliveryError: null });
  if (type === 'NOTIFICATION_FAILED') Object.assign(state.alerts[d.key], { deliveryError: d.reason, deliveryAttemptAt: at });
  // Pass 4: compute selections, spend authorizations and the cost ledger (compute/state.mjs). Before Pass 3's reducer,
  // which reads a run's compute class to decide whether its reported cost is spend.
  reduceCompute(state, event);
  // Pass 3: objectives, steps, handoffs, approvals and decisions live in the same journal (orchestration/state.mjs).
  reduceOrchestration(state, event);
  return state;
}

// seenAt: latest in-memory adapter observation. Unchanged observations are journaled only as a periodic keep-alive.
export function agentStatus(state, agent, now, config = defaults, seenAt = null) {
  const task = state.tasks[agent.assignment], run = state.runs[task?.runId];
  if (run && !run.endedAt) {
    if (task.stage === 'BLOCKED') return 'BLOCKED';
    if (!run.acknowledgedAt) return 'UNKNOWN';
    if (now - run.heartbeatAt > config.heartbeatMs) return 'OFFLINE';
    if (now - run.lastMeaningfulAt > config.progressMs) return 'STALLED';
    return 'RUNNING';
  }
  if (agent.quarantineUntil > now) return 'OFFLINE';
  const observedAt = Math.max(agent.observedAt ?? 0, seenAt ?? 0);
  if (!observedAt || now - observedAt > config.heartbeatMs) return 'UNKNOWN';
  return agent.observedStatus;
}

export class Engine {
  constructor({ store, adapters = {}, now = Date.now, config = {} }) {
    this.store = store; this.adapters = adapters; this.now = now; this.config = { ...defaults, ...config }; this.busy = false; this.seen = {};
    // Fail closed: an unknown mode is ZERO_CREDIT, never something more permissive.
    if (!MODES.includes(this.config.computeMode)) this.config.computeMode = DEFAULT_MODE;
    this.state = store.read().reduce(reduce, emptyState());
  }
  status(agent, at = this.now()) { return agentStatus(this.state, agent, at, this.config, this.seen[agent.id]); }
  emit(type, data) {
    const event = { seq: this.state.seq + 1, id: randomUUID(), at: this.now(), type, data };
    this.store.append(event); // Persist before mutating state or executing anything.
    reduce(this.state, event);
    return event;
  }
  initialize({ modeSource = 'default', modeWarning = null } = {}) {
    // The operating mode is HQ configuration (environment), journaled on every change so the ledger shows which mode
    // every run was selected under. No API, agent or task can change it.
    if (this.state.compute.mode !== this.config.computeMode) this.emit('COMPUTE_MODE', { mode: this.config.computeMode, source: String(modeSource).slice(0, 60), warning: modeWarning });
    for (const agent of initialAgents) if (!this.state.agents[agent.id]) this.register(agent);
    // Pass 3 roles: only Claude implements. A journal from before Pass 3 may still list 'implement' for others.
    for (const agent of Object.values(this.state.agents)) if (agent.id !== 'claude' && !agent.assignment && agent.capabilities.some(c => c === 'implement' || c === 'implement-repo')) this.configureAgent(agent.id, { capabilities: agent.capabilities.filter(c => c !== 'implement' && c !== 'implement-repo') });
    for (const task of Object.values(this.state.tasks)) {
      const run = this.state.runs[task.runId];
      if (run && !run.endedAt) this.emit('TASK_PARKED', { taskId: task.id, reason: 'Controller restarted; previous worker termination is unconfirmed.', ownerAction: 'Confirm the previous process has stopped before resolving this run. It will not be dispatched twice.' });
    }
    for (const agent of Object.values(this.state.agents)) if (!this.adapters[agent.executionAdapter] && agent.observedStatus !== 'UNKNOWN') this.emit('AGENT_OBSERVED', { agentId: agent.id, status: 'UNKNOWN', detail: 'Execution adapter is not connected in this controller.' });
  }
  configureAgent(agentId, configuration) {
    const agent = this.state.agents[agentId];
    if (!agent || agent.assignment) throw Error('Only a registered unassigned agent can be configured');
    const allowed = ['model', 'capabilities', 'executionAdapter', 'telemetryAdapter', 'usageSource', 'routingPriority', 'ackTimeoutMs'];
    if (Object.keys(configuration).some(key => !allowed.includes(key))) throw Error('Unsupported agent configuration');
    if (JSON.stringify(configuration) !== JSON.stringify(Object.fromEntries(Object.keys(configuration).map(k => [k, agent[k]])))) this.emit('AGENT_CONFIGURED', { agentId, configuration });
  }
  register(agent) {
    if (!text(agent.id, 80) || !/^[a-z0-9-]+$/.test(agent.id) || this.state.agents[agent.id]) throw Error('Unique lowercase agent id required');
    for (const key of ['name', 'provider', 'role', 'workstation', 'real', 'fantasy']) if (!text(agent[key], 200)) throw Error(`Invalid agent ${key}`);
    if (!Array.isArray(agent.capabilities) || agent.capabilities.some(c => !text(c, 80))) throw Error('Capabilities required');
    this.emit('AGENT_REGISTERED', agent);
  }
  // requestedBy is internal only (the orchestrator's tools set it; the HTTP API cannot): which agent and
  // task asked for this one, so delegations are traceable and the requester can be shown waiting on it.
  // link and repair are internal too (Pass 3: only the conductor sets them): the objective step this task
  // performs, and HQ's own record of why a previous implementation attempt was not accepted.
  createTask(input, { requestedBy = null, link = null, repair = null } = {}) {
    // A conductor step carries HQ-quoted evidence (a verified diff for a reviewer), so its brief may be longer.
    if (!text(input.title, 200) || !text(input.description, link ? 16_000 : 2000)) throw Error('Title and description required');
    if (requestedBy && (!this.state.agents[requestedBy.agentId] || !this.state.tasks[requestedBy.taskId])) throw Error('Unknown requesting agent or task');
    if (link) {
      const o = this.state.objectives[link.objectiveId];
      if (!o || (link.stepId != null && !o.steps[link.stepId])) throw Error('Unknown objective step');
      if (link.stepId != null && o.steps[link.stepId].status !== 'PENDING') throw Error('Objective step is not pending; refusing to start it twice');
    }
    if (repair && (!Number.isInteger(repair.attempt) || repair.attempt < 1 || !text(repair.reason, 3000))) throw Error('Invalid repair record');
    if (!Object.hasOwn(operations, input.operation)) throw Error('Operation is not allowlisted');
    if (!['local-read-only', 'local-worktree-write', 'owner-required'].includes(input.safety)) throw Error('Explicit safety classification required');
    // Implementation (Pass 2.6) is its own operation and safety class, with a validated contract; nothing else may write.
    const implementing = input.operation === 'implement-repo';
    if (implementing !== (input.safety === 'local-worktree-write')) throw Error('implement-repo tasks, and only they, use local-worktree-write');
    const implementation = implementing ? validateImplementation(input.implementation) : null;
    if (input.safety === 'owner-required' && !text(input.ownerAction)) throw Error('Exact owner action required');
    if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw Error('Priority must be 0–100');
    if (input.preferredAgentId && !this.state.agents[input.preferredAgentId]?.capabilities.includes(operations[input.operation].capability)) throw Error('Selected worker cannot perform this operation');
    // Pass 3 role boundary, independent of capability data: implementation is Claude's alone.
    if (implementing && input.preferredAgentId !== 'claude') throw Error('Implementation tasks go to Claude only');
    const id = randomUUID();
    this.emit('TASK_CREATED', { id, title: input.title, description: input.description, operation: input.operation, capability: operations[input.operation].capability, safety: input.safety, ownerAction: input.ownerAction || null, priority: input.priority, preferredAgentId: input.preferredAgentId || null, ...(implementation ? { implementation } : {}), ...(requestedBy ? { requestedBy: { agentId: requestedBy.agentId, taskId: requestedBy.taskId } } : {}), ...(link ? { link: { objectiveId: link.objectiveId, stepId: link.stepId ?? null, ...(link.decisionId ? { decisionId: link.decisionId } : {}) } } : {}), ...(repair ? { repair: { attempt: repair.attempt, reason: repair.reason, ...(repair.fromReview ? { fromReview: true } : {}) } } : {}) });
    if (this.state.alerts['cycle:complete']?.active) this.emit('ALERT_RESOLVED', { key: 'cycle:complete' });
    return id;
  }
  workerEvent(runId, payload) {
    const run = this.state.runs[runId];
    if (!run || run.endedAt || this.state.tasks[run.taskId].runId !== runId) throw Error('Stale or unknown run');
    if (!payload || !text(payload.summary)) throw Error('Evidence summary required');
    const kinds = ['ACK', 'HEARTBEAT', 'PROGRESS', 'TEST_STARTED', 'TEST_PROGRESS', 'TEST_RESULT', 'COMMIT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'USAGE', 'MODEL_OUTPUT', 'MODEL_RESULT', 'UNCERTAIN', 'BROKER'];
    if (!kinds.includes(payload.kind)) throw Error('Unknown evidence kind');
    // Pass 4.5 broker audit: HQ-authored metadata (operation, logical path, outcome, sizes), never file contents.
    if (payload.kind === 'BROKER' && (!payload.broker || typeof payload.broker !== 'object' || !/^[A-Z_]{3,40}$/.test(String(payload.broker.event)) || JSON.stringify(payload.broker).length > 2000)) throw Error('Invalid broker audit record');
    if (payload.kind === 'ACK' && run.acknowledgedAt) throw Error('Run already acknowledged');
    if (!run.acknowledgedAt && !['ACK', 'FAILED', 'CANCELLED', 'BLOCKED', 'UNCERTAIN', 'RATE_LIMITED'].includes(payload.kind)) throw Error('Worker acknowledgement required');
    if (payload.kind === 'TEST_RESULT' && !['passed', 'failed'].includes(payload.result)) throw Error('Test result required');
    if (payload.kind === 'TEST_PROGRESS') {
      const previous = this.state.tasks[run.taskId].evidence.filter(e => e.runId === runId && e.kind === 'TEST_PROGRESS').at(-1)?.completedTests ?? 0;
      if (!Number.isInteger(payload.completedTests) || payload.completedTests <= previous) throw Error('Increasing measured test count required');
    }
    if (payload.kind === 'USAGE' && (!payload.usage || !text(payload.usage.source) || !Number.isFinite(payload.usage.elapsedMs) || payload.usage.elapsedMs < 0)) throw Error('Measured usage source required');
    if (payload.url && !/^https:\/\//.test(payload.url)) throw Error('Evidence links must use HTTPS');
    // The full answer (bounded) is kept for HQ's handoff validation; summary stays the short display text.
    if (payload.fullText != null && (payload.kind !== 'MODEL_RESULT' || typeof payload.fullText !== 'string' || payload.fullText.length > 30_000)) throw Error('Invalid full model text');
    if (payload.files && (!Array.isArray(payload.files) || payload.files.some(f => !text(f, 500)))) throw Error('Invalid files');
    if (payload.kind === 'RATE_LIMITED' && payload.retryAt != null && (!Number.isFinite(payload.retryAt) || payload.retryAt <= this.now())) throw Error('Future retry time required');
    this.emit('WORKER_EVENT', { ...payload, runId });
    // A metered run that used up its authorization is recorded once, so Kyle and the World see it.
    const c = this.state.compute.runs[runId];
    if (c?.authorizationId && c.endedAt != null && !this.state.compute.exhausted[c.authorizationId]) {
      const auth = this.state.compute.authorizations[c.authorizationId], st = auth && authorizationStatus(this.state, auth, this.now());
      if (st && !st.valid && st.reason === 'exhausted') this.emit('BUDGET_EXHAUSTED', { authorizationId: c.authorizationId, amountUsd: auth.amountUsd, committedUsd: st.committed });
    }
  }
  runnable() { return Object.values(this.state.tasks).filter(t => t.stage === 'READY' && (t.safety === 'local-read-only' || t.safety === 'local-worktree-write')).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt); }
  snapshot(at = this.now()) {
    const tasks = Object.values(this.state.tasks), agents = Object.values(this.state.agents).map(a => ({ ...a, status: this.status(a, at), adapterAvailable: Boolean(this.adapters[a.executionAdapter]) }));
    const counts = { ready: this.runnable().length, assigned: tasks.filter(t => liveStages.has(t.stage)).length, working: agents.filter(a => a.status === 'RUNNING').length, review: tasks.filter(t => t.stage === 'REVIEW').length, blocked: tasks.filter(t => t.stage === 'BLOCKED').length, done: tasks.filter(t => t.stage === 'DONE').length };
    const unresolvedRuns = Object.values(this.state.runs).filter(r => !r.endedAt).length;
    const compute = { mode: this.config.computeMode, ledger: computeLedger(this.state, { now: at }), capacity: Object.fromEntries(agents.map(a => [a.id, capacityOf(a, a.status, { connected: a.adapterAvailable, route: a.executionAdapter ? routeFor(a.executionAdapter, 'review-repo') : null })])) };
    return { ...this.state, agents, tasks, counts, unresolvedRuns, now: at, compute, cycleComplete: tasks.length > 0 && counts.ready === 0 && counts.assigned === 0 && counts.working === 0 && counts.review === 0 && unresolvedRuns === 0 && tasks.every(t => t.stage === 'DONE' || t.stage === 'CANCELLED' || (t.stage === 'BLOCKED' && !t.recoveryPending && Boolean(t.blocker))) };
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Only a connected adapter can supply an availability observation.
      for (const agent of Object.values(this.state.agents)) {
        const adapter = this.adapters[agent.executionAdapter];
        if (!adapter || agent.assignment || agent.quarantineUntil > this.now() || (agent.observedStatus === 'RATE_LIMITED' && (!agent.retryAt || this.now() < agent.retryAt))) continue;
        let observation;
        try {
          observation = await bounded(() => adapter.health(), this.config.adapterTimeoutMs);
          if (!['IDLE', 'OFFLINE', 'UNKNOWN', 'RATE_LIMITED'].includes(observation.status)) throw Error('Invalid adapter health');
        } catch (error) { observation = { status: 'UNKNOWN', detail: `Adapter health failed: ${error.message}` }; }
        if (agent.observedStatus !== observation.status || agent.detail !== observation.detail || !agent.observedAt || this.now() - agent.observedAt > this.config.observationJournalMs) this.emit('AGENT_OBSERVED', { agentId: agent.id, ...observation });
        this.seen[agent.id] = this.now();
      }
      await this.recover();
      for (const task of this.runnable()) {
        // The local concurrency limit is for local processes. A remote API adapter (the orchestrator) takes no
        // local slot, so a question to ChatGPT never queues behind a long local run, nor blocks one.
        const local = r => !this.adapters[this.state.agents[r.agentId]?.executionAdapter]?.remote;
        const active = Object.values(this.state.runs).filter(r => !r.endedAt && local(r));
        const remoteTask = Object.values(this.state.agents).some(a => a.capabilities.includes(task.capability) && this.adapters[a.executionAdapter]?.remote);
        if (!remoteTask && active.length >= this.config.maxLocalWorkers) continue;
        // Pass 4 compute gate: capability first (who can do it), then security (the route table), then authorization
        // and cost, then availability. Deterministic; decided before anything starts.
        const pick = this.selectCompute(task);
        if (!pick) continue;
        const { agent, decision } = pick;
        if (task.operation === 'implement-repo' && agent.id !== 'claude') throw Error(`Refusing to dispatch implementation to ${agent.id}`);
        const runId = randomUUID(), route = decision.route;
        const compute = { operation: task.operation, adapterId: agent.executionAdapter, variant: route.variant ?? 'default', routeId: route.routeId ?? null, security: route.security ?? null, computeClass: route.computeClass, provider: route.provider, backend: route.backend, model: agent.model ?? null, authorizationId: decision.authorizationId ?? null, reservedUsd: decision.reservedUsd ?? 0, mode: this.config.computeMode };
        this.emit('DISPATCHED', { taskId: task.id, agentId: agent.id, runId, compute });
        // A one-shot grant for exactly this run. Metered adapters refuse to send anything without redeeming one.
        const grant = issueGrant({ taskId: task.id, runId, route, authorizationId: compute.authorizationId, reservedUsd: compute.reservedUsd });
        try {
          // start returns after spawn, not task completion. ACK comes from the worker.
          await bounded(() => this.adapters[agent.executionAdapter].start({ task, runId, emit: event => this.workerEvent(runId, event), compute: grant }), this.config.adapterTimeoutMs);
        } catch (error) {
          // A rejected start might have partially launched a worker. Fence it until
          // the adapter confirms termination, just like a lost heartbeat.
          let stopped = false;
          try { stopped = await bounded(() => this.adapters[agent.executionAdapter].cancel(runId), this.config.adapterTimeoutMs); } catch { /* retain lease */ }
          if (stopped === true && !this.state.runs[runId].endedAt) this.workerEvent(runId, { kind: 'CANCELLED', summary: `Start failed; termination confirmed: ${error.message}` });
          this.emit('TASK_PARKED', { taskId: task.id, reason: `Adapter start failed: ${error.message}`, ownerAction: stopped === true ? 'Repair the adapter or route a newly scoped task to another worker.' : 'Confirm the partially started worker has stopped before retrying.' });
        }
      }
      this.watchdog();
    } finally { this.busy = false; }
  }
  // Chooses the agent and compute route for one READY task, or records why it cannot run for free now.
  selectCompute(task) {
    const now = this.now(), mode = this.config.computeMode;
    const capable = Object.values(this.state.agents).filter(a => (!task.preferredAgentId || a.id === task.preferredAgentId) && a.capabilities.includes(task.capability) && this.adapters[a.executionAdapter]);
    if (!capable.length) return null; // no connected worker: the watchdog reports it
    // Pass 3 role boundary before any cost reasoning: implementation is Claude's alone, whatever the journal says.
    const intruder = task.operation === 'implement-repo' && capable.find(a => a.id !== 'claude');
    if (intruder) throw Error(`Refusing to dispatch implementation to ${intruder.id}`);
    // Pass 4.5: each agent may serve the operation through several route variants; the adapter says which it can run
    // here now. A free variant that exists but is unavailable is remembered for the report, never replaced by paying.
    const unsupported = [];
    const decided = capable.flatMap(agent => {
      const adapter = this.adapters[agent.executionAdapter];
      const v = decideVariants({ state: this.state, task, agentId: agent.id, adapterId: agent.executionAdapter, mode, now, supports: (op, variant) => adapter.supports?.(op, variant) });
      unsupported.push(...v.unsupported.filter(u => u.route.computeClass !== 'METERED_API').map(u => ({ agent, ...u })));
      return v.decided.map(decision => ({ agent, decision }));
    });
    if (!decided.length) {
      // Only free variants exist and none can run here now: wait (recorded once), never pay.
      const u = unsupported[0];
      if (u && !(task.waitingFor?.agentId === u.agent.id && task.waitingFor?.capacity === 'UNAVAILABLE')) this.emit('WAITING_FOR_CAPACITY', { taskId: task.id, agentId: u.agent.id, capacity: 'UNAVAILABLE', computeClass: u.route.computeClass, reason: String(u.reason).slice(0, 300), retryAt: null, paidAlternativeUsed: false });
      return null;
    }
    const allowed = decided.filter(x => x.decision.allowed);
    const free = allowed.filter(x => x.decision.route.computeClass !== 'METERED_API');
    // Metered compute is considered only when no LOCAL or SUBSCRIPTION route can do this task at all. A free agent that
    // is busy or out of capacity means wait, never "pay instead".
    const pool = (free.length ? free : allowed).sort((x, y) => classRank(x.decision.route.computeClass) - classRank(y.decision.route.computeClass) || (x.agent.routingPriority ?? 0) - (y.agent.routingPriority ?? 0));
    // A task told to wait (capacity reset time) is not dispatched early, but its wait is still recorded below.
    const ready = task.notBefore > now ? null : pool.find(x => !x.agent.assignment && this.status(x.agent) === 'IDLE');
    if (ready) return ready;
    if (!pool.length) {
      let blocked = decided.find(x => !x.decision.allowed).decision;
      if (unsupported.length) blocked = { ...blocked, reason: `${blocked.reason} The $0 route is not available here (${unsupported.map(u => `${u.route.routeId ?? u.route.variant}: ${u.reason}`).join('; ')}).`.slice(0, 900) };
      const ownerAction = mode === 'BUDGETED'
        ? `Authorize up to $${(blocked.maxCostUsd ?? 0).toFixed(2)} for this task in HQ (Spend), then retry it; or use a $0 alternative: ${blocked.alternatives.join(' ')}`.slice(0, 1900)
        : `This needs metered ${blocked.provider} API compute, which ZERO_CREDIT mode forbids. $0 alternatives: ${blocked.alternatives.join(' ')} To pay for it: start HQ with HQ_COMPUTE_MODE=BUDGETED and authorize a bounded amount for this task.`.slice(0, 1900);
      this.emit('SPEND_APPROVAL_REQUIRED', { taskId: task.id, code: blocked.code, provider: blocked.provider, agentId: blocked.agentId, backend: blocked.backend, why: blocked.why, reason: blocked.reason, estimatedCostUsd: blocked.estimatedCostUsd, maxCostUsd: blocked.maxCostUsd, alternatives: blocked.alternatives, waitingWouldHelp: blocked.waitingWouldHelp, mode, ownerAction });
      return null;
    }
    // Free agents exist but none can take it now. Ordinary queueing is silent; a capacity problem is recorded once.
    for (const { agent, decision } of pool) {
      if (agent.assignment) continue;
      const capacity = capacityOf(agent, this.status(agent), { route: decision.route });
      if (!['RATE_LIMITED', 'SUBSCRIPTION_LIMIT_REACHED', 'AUTH_REQUIRED'].includes(capacity)) continue;
      if (task.waitingFor?.agentId === agent.id && task.waitingFor?.capacity === capacity) break;
      this.emit('WAITING_FOR_CAPACITY', { taskId: task.id, agentId: agent.id, capacity, computeClass: decision.route.computeClass, retryAt: agent.retryAt ?? null, paidAlternativeUsed: false });
      break;
    }
    return null;
  }
  // Pass 4 spend authorization. Kyle only (the owner HTTP API passes by: 'kyle'; nothing that reads agent or model
  // output calls this). Explicit, bounded (amount, expiry, scope), journaled, and revocable.
  authorizeSpend(input, { by } = {}) {
    if (by !== 'kyle') throw Error('Only Kyle can authorize spending.');
    const v = validateSpendAuthorization(input, this.now());
    if (v.scope.taskId && !this.state.tasks[v.scope.taskId]) throw Error('Unknown task for this authorization.');
    if (v.scope.objectiveId && !this.state.objectives[v.scope.objectiveId]) throw Error('Unknown objective for this authorization.');
    if (v.scope.agentId && !this.state.agents[v.scope.agentId]) throw Error('Unknown agent for this authorization.');
    const id = randomUUID();
    this.emit('SPEND_AUTHORIZED', { id, by: 'kyle', ...v });
    return id;
  }
  revokeSpend(id, { by, reason = null } = {}) {
    if (by !== 'kyle') throw Error('Only Kyle can revoke a spend authorization.');
    const auth = this.state.compute.authorizations[id];
    if (!auth) throw Error('Unknown spend authorization.');
    if (!auth.revokedAt) this.emit('SPEND_REVOKED', { id, by: 'kyle', reason: typeof reason === 'string' ? reason.slice(0, 300) : null });
    return { revoked: true };
  }
  // A task stopped at the spend gate runs again only when Kyle asks (after authorizing, or to retry for free).
  retrySpendBlocked(taskId, { by } = {}) {
    if (by !== 'kyle') throw Error('Only Kyle can retry a task stopped at the spend gate.');
    const task = this.state.tasks[taskId];
    if (!task?.spendBlocked || task.stage !== 'BLOCKED') throw Error('That task is not waiting at the spend gate.');
    this.emit('TASK_REQUEUED', { taskId });
    return { requeued: true };
  }
  async recover() {
    for (const task of Object.values(this.state.tasks)) {
      const run = this.state.runs[task.runId];
      if (!run) continue;
      // Pass 3: a task that performs an objective step is never retried or rerouted here. The conductor owns its
      // retries (bounded, classified, and within the routing and review-independence rules); the engine only parks it.
      if (task.link && task.recoveryPending && ['RATE_LIMITED', 'FAILED'].includes(run.terminal)) {
        this.emit('TASK_PARKED', { taskId: task.id, reason: task.blocker ?? `${run.terminal} run.`, ownerAction: null });
        continue;
      }
      if (run.terminal === 'RATE_LIMITED' && task.recoveryPending) {
        this.emit('RECOVERY', { taskId: task.id, step: 'capacity-wait', reason: task.blocker, runId: run.runId });
        if (task.notBefore && task.attempts < this.config.maxAttempts) this.emit('TASK_REQUEUED', { taskId: task.id, notBefore: task.notBefore });
        else this.emit('TASK_PARKED', { taskId: task.id, reason: 'Rate limit recovery parked: retry time missing or attempt budget exhausted.', ownerAction: 'Verify provider capacity and scope a follow-up when available.' });
        continue;
      }
      const failed = run.terminal === 'FAILED' && task.recoveryPending;
      if (!failed && (run.endedAt || task.stage === 'BLOCKED')) continue;
      const agent = this.state.agents[run.agentId], status = this.status(agent);
      const ackExpired = !run.acknowledgedAt && this.now() - run.dispatchedAt > (agent.ackTimeoutMs ?? this.config.heartbeatMs);
      if (!failed && !ackExpired && !['OFFLINE', 'STALLED'].includes(status)) continue;
      this.emit('RECOVERY', { taskId: task.id, step: 'diagnose', reason: failed ? task.blocker : ackExpired ? 'No worker acknowledgement' : status, runId: run.runId });
      let stopped = failed; // FAILED is terminal evidence from the adapter, not a lost response.
      if (!stopped) try { stopped = await bounded(() => this.adapters[agent.executionAdapter]?.cancel(run.runId), this.config.adapterTimeoutMs); } catch { /* Uncertain cancellation retains lease. */ }
      if (stopped !== true) {
        this.emit('TASK_PARKED', { taskId: task.id, reason: 'Automatic recovery failed: worker termination unconfirmed.', ownerAction: 'Inspect and stop the previous worker; confirm termination before retrying.' });
        continue;
      }
      if (!run.endedAt) this.workerEvent(run.runId, { kind: 'CANCELLED', summary: 'Watchdog confirmed worker stopped before recovery.' });
      // A task already cancelled is never requeued: record the now-proven stop and move on.
      if (task.stage === 'CANCELLED') { if (!task.cancelled?.confirmed) this.emit('TASK_CANCELLED', { taskId: task.id, by: 'hq-watchdog', reason: task.cancelled?.reason ?? 'Cancelled.', confirmed: true }); continue; }
      this.emit('AGENT_OBSERVED', { agentId: agent.id, status: 'OFFLINE', detail: 'Recovery quarantine; awaiting cooldown and fresh health check', quarantineUntil: this.now() + this.config.quarantineMs });
      // Different worker handoff is preferred; no blind repetition or arbitrary shell retries.
      if (task.link) { this.emit('TASK_PARKED', { taskId: task.id, reason: `Watchdog: the worker was ${ackExpired ? 'not acknowledged in time' : status} (timed out) and was stopped.`, ownerAction: null }); continue; }
      const alternate = Object.values(this.state.agents).find(a => a.id !== agent.id && (!task.preferredAgentId || a.id === task.preferredAgentId) && a.capabilities.includes(task.capability) && !a.assignment && this.adapters[a.executionAdapter] && this.status(a) === 'IDLE');
      if (alternate && task.attempts < this.config.maxAttempts) {
        this.emit('RECOVERY', { taskId: task.id, step: 'handoff', reason: `Retry with ${alternate.name}`, from: agent.id, to: alternate.id });
        this.emit('TASK_REQUEUED', { taskId: task.id });
      } else {
        this.emit('TASK_PARKED', { taskId: task.id, reason: `Recovery parked: ${task.attempts >= this.config.maxAttempts ? 'attempt budget exhausted' : 'no alternate capable connected worker'}. Diagnose or split this task; other safe tasks continue.`, ownerAction: 'Inspect evidence, repair or split the failing work, then create a new scoped task.' });
      }
    }
  }
  watchdog() {
    const snapshot = this.snapshot(), desired = new Map();
    const add = (key, kind, agent, task, ownerAction, detail) => desired.set(key, { key, kind, agentId: agent?.id ?? null, taskId: task?.id ?? null, sinceProgressMs: task ? this.now() - (task.lastMeaningfulAt ?? task.claimedAt ?? task.createdAt) : null, evidence: task?.evidence.slice(-3) ?? [], recoveryAttempted: task?.recovery ?? null, runnableQueueCount: snapshot.counts.ready, ownerMustAct: Boolean(ownerAction), ownerAction: ownerAction || null, detail });
    for (const task of snapshot.tasks) {
      const agent = this.state.agents[task.agentId];
      if (task.stage === 'BLOCKED') add(`blocked:${task.id}`, task.ownerAction ? 'OWNER_ACTION_REQUIRED' : 'TASK_BLOCKED', agent, task, task.ownerAction, task.blocker);
      if (task.stage === 'DONE' && task.verificationResult === 'failed') add(`verification:${task.id}`, 'VERIFICATION_FAILED', agent, task, 'Inspect the failing assertions and create a scoped repair task.', 'Verification finished and found failing tests; DONE describes the check, not passing code.');
    }
    // Queued work waiting behind the intentional local concurrency limit is healthy.
    if (snapshot.counts.ready && snapshot.unresolvedRuns < this.config.maxLocalWorkers) {
      for (const agent of snapshot.agents) {
        if (!this.runnable().some(t => (!t.preferredAgentId || t.preferredAgentId === agent.id) && agent.capabilities.includes(t.capability))) continue;
        if (['IDLE', 'OFFLINE', 'STALLED', 'RATE_LIMITED', 'UNKNOWN'].includes(agent.status)) add(`capacity:${agent.id}`, agent.adapterAvailable ? `UNEXPECTED_${agent.status}` : 'ADAPTER_UNAVAILABLE', agent, null, agent.adapterAvailable ? null : `Connect an execution/telemetry adapter for ${agent.name}, or route to a capable connected worker.`, agent.detail || 'Runnable work exists without verified execution on this worker.');
      }
      if (!snapshot.agents.some(a => a.adapterAvailable && this.runnable().some(t => (!t.preferredAgentId || t.preferredAgentId === a.id) && a.capabilities.includes(t.capability)))) add('queue:no-adapter', 'ADAPTER_UNAVAILABLE', null, null, 'Connect a capable execution adapter for the queued operation.', 'No connected worker can execute the safe queue.');
    }
    if (snapshot.cycleComplete) add('cycle:complete', 'HANDOFF_READY', null, null, null, 'READY=0, WORKING=0, REVIEW=0; remaining tasks have explicit blockers.');
    for (const [key, alert] of desired) {
      const old = this.state.alerts[key];
      if (!old?.active) this.emit('ALERT_OPENED', alert);
    }
    for (const alert of Object.values(this.state.alerts)) if (alert.active && !desired.has(alert.key)) this.emit('ALERT_RESOLVED', { key: alert.key });
  }
  acknowledgeAlert(key) {
    if (!this.state.alerts[key]) throw Error('Unknown alert');
    if (!this.state.alerts[key].acknowledgedAt) this.emit('ALERT_ACKNOWLEDGED', { key });
  }
  // Pass 3 cancellation of one task. Never-dispatched work is withdrawn outright. A live run is stopped through its
  // adapter, and the task is recorded as CANCELLED only with proof: the adapter confirmed the process ended. Without
  // proof the lease stays held (confirmed: false) so nothing is dispatched on top of a process that may still run.
  async cancelTask(taskId, { by = 'kyle', reason = 'Cancelled.' } = {}) {
    const task = this.state.tasks[taskId];
    if (!task) throw Error('Unknown task');
    if (task.stage === 'DONE' || (task.stage === 'CANCELLED' && task.cancelled?.confirmed)) return { confirmed: true, already: task.stage };
    const run = this.state.runs[task.runId];
    let confirmed = true;
    if (run && !run.endedAt) {
      let stopped = false;
      try { stopped = await bounded(() => this.adapters[this.state.agents[run.agentId]?.executionAdapter]?.cancel(run.runId), Math.max(this.config.adapterTimeoutMs, 30_000)); } catch { /* unproven */ }
      confirmed = stopped === true;
      if (confirmed && !this.state.runs[run.runId].endedAt) this.workerEvent(run.runId, { kind: 'CANCELLED', summary: `Cancelled by ${by}; termination confirmed by the adapter.` });
    }
    this.emit('TASK_CANCELLED', { taskId, by: String(by).slice(0, 40), reason: String(reason).slice(0, 300) || 'Cancelled.', confirmed });
    return { confirmed };
  }
  reconcileStoppedRun(runId, confirmation, evidence) {
    const run = this.state.runs[runId], task = this.state.tasks[run?.taskId];
    if (!run || run.endedAt || !['BLOCKED', 'CANCELLED'].includes(task?.stage)) throw Error('Only an unresolved blocked run can be reconciled');
    if (confirmation !== true || !text(evidence)) throw Error('Owner confirmation and termination evidence required');
    this.emit('OWNER_CONFIRMED_TERMINATION', { runId, taskId: task.id, evidence });
    this.workerEvent(runId, { kind: 'CANCELLED', summary: `Owner confirmed worker stopped: ${evidence}` });
    this.emit('TASK_PARKED', { taskId: task.id, reason: 'Previous run reconciled as stopped; task remains incomplete.', ownerAction: 'Repair or split the original task and create a new scoped follow-up when ready.' });
    this.adapters[this.state.agents[run.agentId].executionAdapter]?.reconcile?.(runId);
  }
}
