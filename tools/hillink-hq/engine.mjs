import { randomUUID } from 'node:crypto';
import { initialAgents, operations } from './registry.mjs';
import { validateImplementation } from './implementation-policy.mjs';
import { reduceOrchestration, ORCHESTRATION_EVENTS } from './orchestration/state.mjs';

export const defaults = { heartbeatMs: 15_000, progressMs: 120_000, adapterTimeoutMs: 3000, quarantineMs: 60_000, observationJournalMs: 300_000, maxAttempts: 2, maxLocalWorkers: 1 };
async function bounded(call, timeoutMs) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(call), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Adapter response timed out')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
const progressKinds = new Set(['COMMIT', 'TEST_PROGRESS', 'TEST_RESULT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED', 'MODEL_OUTPUT', 'MODEL_RESULT']);
const liveStages = new Set(['CLAIMED', 'IMPLEMENTING', 'TESTING', 'REVIEW']);
const ENGINE_EVENT_TYPES = new Set(['AGENT_REGISTERED', 'AGENT_CONFIGURED', 'AGENT_OBSERVED', 'TASK_CREATED', 'DISPATCHED', 'WORKER_EVENT', 'RECOVERY', 'TASK_REQUEUED', 'TASK_PARKED', 'ALERT_OPENED', 'ALERT_RESOLVED', 'ALERT_ACKNOWLEDGED', 'NOTIFICATION_DELIVERED', 'NOTIFICATION_FAILED', 'OWNER_CONFIRMED_TERMINATION']);
const eventTypes = new Set([...ENGINE_EVENT_TYPES, ...ORCHESTRATION_EVENTS]);
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function emptyState() { return { version: 1, seq: 0, agents: {}, tasks: {}, runs: {}, alerts: {}, events: [], meeting: null, objectives: {} }; }

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
  if (type === 'TASK_CREATED') state.tasks[d.id] = { ...d, stage: d.safety === 'owner-required' ? 'BLOCKED' : 'READY', createdAt: at, createdSeq: event.seq, attempts: 0, runId: null, evidence: [], handoffs: [], blocker: d.ownerAction || null };
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
      task.stage = d.kind === 'COMPLETED' ? 'DONE' : 'BLOCKED';
      task.endedAt = at;
      task.blocker = d.kind === 'COMPLETED' ? null : d.summary;
      task.ownerAction = d.ownerAction ?? null;
      task.recoveryPending = d.kind === 'FAILED' || d.kind === 'RATE_LIMITED';
      if (d.kind === 'RATE_LIMITED') task.notBefore = d.retryAt ?? null;
      agent.observedStatus = d.kind === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'IDLE';
      agent.retryAt = d.retryAt ?? null; agent.observedAt = at;
    }
  }
  if (type === 'RECOVERY') state.tasks[d.taskId].recovery = { ...d, at };
  if (type === 'TASK_REQUEUED') Object.assign(state.tasks[d.taskId], { stage: 'READY', runId: null, agentId: null, blocker: null, ownerAction: null, recoveryPending: false, notBefore: d.notBefore ?? null });
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
    this.state = store.read().reduce(reduce, emptyState());
  }
  status(agent, at = this.now()) { return agentStatus(this.state, agent, at, this.config, this.seen[agent.id]); }
  emit(type, data) {
    const event = { seq: this.state.seq + 1, id: randomUUID(), at: this.now(), type, data };
    this.store.append(event); // Persist before mutating state or executing anything.
    reduce(this.state, event);
    return event;
  }
  initialize() {
    for (const agent of initialAgents) if (!this.state.agents[agent.id]) this.register(agent);
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
  createTask(input, { requestedBy = null, link = null } = {}) {
    if (!text(input.title, 200) || !text(input.description, 2000)) throw Error('Title and description required');
    if (requestedBy && (!this.state.agents[requestedBy.agentId] || !this.state.tasks[requestedBy.taskId])) throw Error('Unknown requesting agent or task');
    if (!Object.hasOwn(operations, input.operation)) throw Error('Operation is not allowlisted');
    if (!['local-read-only', 'local-worktree-write', 'owner-required'].includes(input.safety)) throw Error('Explicit safety classification required');
    // Implementation (Pass 2.6) is its own operation and safety class, with a validated contract; nothing else may write.
    const implementing = input.operation === 'implement-repo';
    if (implementing !== (input.safety === 'local-worktree-write')) throw Error('implement-repo tasks, and only they, use local-worktree-write');
    const implementation = implementing ? validateImplementation(input.implementation) : null;
    if (input.safety === 'owner-required' && !text(input.ownerAction)) throw Error('Exact owner action required');
    if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw Error('Priority must be 0–100');
    if (input.preferredAgentId && !this.state.agents[input.preferredAgentId]?.capabilities.includes(operations[input.operation].capability)) throw Error('Selected worker cannot perform this operation');
    const id = randomUUID();
    this.emit('TASK_CREATED', { id, title: input.title, description: input.description, operation: input.operation, capability: operations[input.operation].capability, safety: input.safety, ownerAction: input.ownerAction || null, priority: input.priority, preferredAgentId: input.preferredAgentId || null, ...(implementation ? { implementation } : {}), ...(requestedBy ? { requestedBy: { agentId: requestedBy.agentId, taskId: requestedBy.taskId } } : {}), ...(link ? { link: { objectiveId: link.objectiveId, stepId: link.stepId ?? null, ...(link.decisionId ? { decisionId: link.decisionId } : {}) } } : {}) });
    if (this.state.alerts['cycle:complete']?.active) this.emit('ALERT_RESOLVED', { key: 'cycle:complete' });
    return id;
  }
  workerEvent(runId, payload) {
    const run = this.state.runs[runId];
    if (!run || run.endedAt || this.state.tasks[run.taskId].runId !== runId) throw Error('Stale or unknown run');
    if (!payload || !text(payload.summary)) throw Error('Evidence summary required');
    const kinds = ['ACK', 'HEARTBEAT', 'TEST_STARTED', 'TEST_PROGRESS', 'TEST_RESULT', 'COMMIT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'USAGE', 'MODEL_OUTPUT', 'MODEL_RESULT', 'UNCERTAIN'];
    if (!kinds.includes(payload.kind)) throw Error('Unknown evidence kind');
    if (payload.kind === 'ACK' && run.acknowledgedAt) throw Error('Run already acknowledged');
    if (!run.acknowledgedAt && !['ACK', 'FAILED', 'CANCELLED', 'BLOCKED', 'UNCERTAIN', 'RATE_LIMITED'].includes(payload.kind)) throw Error('Worker acknowledgement required');
    if (payload.kind === 'TEST_RESULT' && !['passed', 'failed'].includes(payload.result)) throw Error('Test result required');
    if (payload.kind === 'TEST_PROGRESS') {
      const previous = this.state.tasks[run.taskId].evidence.filter(e => e.runId === runId && e.kind === 'TEST_PROGRESS').at(-1)?.completedTests ?? 0;
      if (!Number.isInteger(payload.completedTests) || payload.completedTests <= previous) throw Error('Increasing measured test count required');
    }
    if (payload.kind === 'USAGE' && (!payload.usage || !text(payload.usage.source) || !Number.isFinite(payload.usage.elapsedMs) || payload.usage.elapsedMs < 0)) throw Error('Measured usage source required');
    if (payload.url && !/^https:\/\//.test(payload.url)) throw Error('Evidence links must use HTTPS');
    if (payload.files && (!Array.isArray(payload.files) || payload.files.some(f => !text(f, 500)))) throw Error('Invalid files');
    if (payload.kind === 'RATE_LIMITED' && payload.retryAt != null && (!Number.isFinite(payload.retryAt) || payload.retryAt <= this.now())) throw Error('Future retry time required');
    this.emit('WORKER_EVENT', { ...payload, runId });
  }
  runnable() { return Object.values(this.state.tasks).filter(t => t.stage === 'READY' && (t.safety === 'local-read-only' || t.safety === 'local-worktree-write')).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt); }
  snapshot(at = this.now()) {
    const tasks = Object.values(this.state.tasks), agents = Object.values(this.state.agents).map(a => ({ ...a, status: this.status(a, at), adapterAvailable: Boolean(this.adapters[a.executionAdapter]) }));
    const counts = { ready: this.runnable().length, assigned: tasks.filter(t => liveStages.has(t.stage)).length, working: agents.filter(a => a.status === 'RUNNING').length, review: tasks.filter(t => t.stage === 'REVIEW').length, blocked: tasks.filter(t => t.stage === 'BLOCKED').length, done: tasks.filter(t => t.stage === 'DONE').length };
    const unresolvedRuns = Object.values(this.state.runs).filter(r => !r.endedAt).length;
    return { ...this.state, agents, tasks, counts, unresolvedRuns, now: at, cycleComplete: tasks.length > 0 && counts.ready === 0 && counts.assigned === 0 && counts.working === 0 && counts.review === 0 && unresolvedRuns === 0 && tasks.every(t => t.stage === 'DONE' || (t.stage === 'BLOCKED' && !t.recoveryPending && Boolean(t.blocker))) };
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
        if (task.notBefore > this.now()) continue;
        // The local concurrency limit is for local processes. A remote API adapter (the orchestrator) takes no
        // local slot, so a question to ChatGPT never queues behind a long local run, nor blocks one.
        const local = r => !this.adapters[this.state.agents[r.agentId]?.executionAdapter]?.remote;
        const active = Object.values(this.state.runs).filter(r => !r.endedAt && local(r));
        const remoteTask = Object.values(this.state.agents).some(a => a.capabilities.includes(task.capability) && this.adapters[a.executionAdapter]?.remote);
        if (!remoteTask && active.length >= this.config.maxLocalWorkers) continue;
        const agent = Object.values(this.state.agents).sort((a, b) => (a.routingPriority ?? 0) - (b.routingPriority ?? 0)).find(a => (!task.preferredAgentId || a.id === task.preferredAgentId) && a.capabilities.includes(task.capability) && !a.assignment && this.status(a) === 'IDLE' && this.adapters[a.executionAdapter]);
        if (!agent) continue;
        const runId = randomUUID();
        this.emit('DISPATCHED', { taskId: task.id, agentId: agent.id, runId });
        try {
          // start returns after spawn, not task completion. ACK comes from the worker.
          await bounded(() => this.adapters[agent.executionAdapter].start({ task, runId, emit: event => this.workerEvent(runId, event) }), this.config.adapterTimeoutMs);
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
  async recover() {
    for (const task of Object.values(this.state.tasks)) {
      const run = this.state.runs[task.runId];
      if (!run) continue;
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
      this.emit('AGENT_OBSERVED', { agentId: agent.id, status: 'OFFLINE', detail: 'Recovery quarantine; awaiting cooldown and fresh health check', quarantineUntil: this.now() + this.config.quarantineMs });
      // Different worker handoff is preferred; no blind repetition or arbitrary shell retries.
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
  reconcileStoppedRun(runId, confirmation, evidence) {
    const run = this.state.runs[runId], task = this.state.tasks[run?.taskId];
    if (!run || run.endedAt || task?.stage !== 'BLOCKED') throw Error('Only an unresolved blocked run can be reconciled');
    if (confirmation !== true || !text(evidence)) throw Error('Owner confirmation and termination evidence required');
    this.emit('OWNER_CONFIRMED_TERMINATION', { runId, taskId: task.id, evidence });
    this.workerEvent(runId, { kind: 'CANCELLED', summary: `Owner confirmed worker stopped: ${evidence}` });
    this.emit('TASK_PARKED', { taskId: task.id, reason: 'Previous run reconciled as stopped; task remains incomplete.', ownerAction: 'Repair or split the original task and create a new scoped follow-up when ready.' });
    this.adapters[this.state.agents[run.agentId].executionAdapter]?.reconcile?.(runId);
  }
  // Unconfirmed termination keeps the run's lease (confirmed: false) exactly like recovery does.
  async cancelTask(taskId, { by = 'hq', reason = '' } = {}) {
    const task = this.state.tasks[taskId];
    if (!task) throw Error('Unknown task');
    if (['DONE', 'CANCELLED'].includes(task.stage)) return { taskId, confirmed: true };
    const run = task.runId ? this.state.runs[task.runId] : null;
    if (run && !run.endedAt) {
      const agent = this.state.agents[run.agentId];
      let stopped = false;
      try { stopped = await bounded(() => this.adapters[agent?.executionAdapter]?.cancel(task.runId), this.config.adapterTimeoutMs); } catch { /* retain lease */ }
      if (stopped === true && !this.state.runs[task.runId].endedAt) this.workerEvent(task.runId, { kind: 'CANCELLED', summary: `Cancelled by ${by}: ${String(reason).slice(0, 200) || 'no reason given'}` });
    }
    const confirmed = !run || Boolean(this.state.runs[task.runId].endedAt);
    this.emit('TASK_CANCELLED', { taskId, by, reason: String(reason).slice(0, 300), confirmed });
    return { taskId, confirmed };
  }
}
