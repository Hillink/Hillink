import { randomUUID } from 'node:crypto';
import { initialAgents, operations } from './registry.mjs';

export const defaults = { heartbeatMs: 15_000, progressMs: 120_000, maxAttempts: 2, maxLocalWorkers: 1 };
const progressKinds = new Set(['COMMIT', 'TEST_RESULT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED']);
const liveStages = new Set(['CLAIMED', 'IMPLEMENTING', 'TESTING', 'REVIEW']);
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function emptyState() { return { version: 1, seq: 0, agents: {}, tasks: {}, runs: {}, alerts: {}, events: [], meeting: null }; }

// A pure reducer: replay and live state take exactly the same path.
export function reduce(state, event) {
  const { type, data: d, at } = event;
  state.seq = event.seq;
  state.events.push(event);
  if (type === 'AGENT_REGISTERED') state.agents[d.id] = { ...d, observedStatus: 'UNKNOWN', observedAt: null, lastMeaningfulAt: null, assignment: null, usage: null };
  if (type === 'AGENT_OBSERVED') Object.assign(state.agents[d.agentId], { observedStatus: d.status, observedAt: at, detail: d.detail, retryAt: d.retryAt ?? null });
  if (type === 'TASK_CREATED') state.tasks[d.id] = { ...d, stage: d.safety === 'owner-required' ? 'BLOCKED' : 'READY', createdAt: at, attempts: 0, runId: null, evidence: [], handoffs: [], blocker: d.ownerAction || null };
  if (type === 'DISPATCHED') {
    const task = state.tasks[d.taskId];
    Object.assign(task, { stage: 'CLAIMED', runId: d.runId, agentId: d.agentId, claimedAt: at, attempts: task.attempts + 1, blocker: null });
    state.agents[d.agentId].assignment = d.taskId;
    state.runs[d.runId] = { ...d, dispatchedAt: at, acknowledgedAt: null, heartbeatAt: null, lastMeaningfulAt: at, endedAt: null, terminal: null };
  }
  if (type === 'WORKER_EVENT') {
    const run = state.runs[d.runId], task = state.tasks[run.taskId], agent = state.agents[run.agentId];
    task.evidence.push({ ...d, at });
    if (d.kind === 'ACK') { run.acknowledgedAt = at; run.heartbeatAt = at; task.stage = 'IMPLEMENTING'; }
    if (d.kind === 'HEARTBEAT') run.heartbeatAt = at;
    if (d.kind === 'TEST_STARTED') task.stage = 'TESTING';
    if (d.kind === 'REVIEW') task.stage = 'REVIEW';
    if (progressKinds.has(d.kind)) { run.lastMeaningfulAt = at; agent.lastMeaningfulAt = at; task.lastMeaningfulAt = at; }
    if (d.kind === 'HANDOFF') task.handoffs.push({ ...d, at });
    if (d.kind === 'USAGE') agent.usage = { ...d.usage, at };
    if (['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED'].includes(d.kind)) {
      run.endedAt = at; run.terminal = d.kind; agent.assignment = null;
      task.stage = d.kind === 'COMPLETED' ? 'DONE' : 'BLOCKED';
      task.blocker = d.kind === 'COMPLETED' ? null : d.summary;
      task.ownerAction = d.ownerAction ?? null;
      agent.observedStatus = d.kind === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'IDLE';
      agent.retryAt = d.retryAt ?? null; agent.observedAt = at;
    }
  }
  if (type === 'RECOVERY') state.tasks[d.taskId].recovery = { ...d, at };
  if (type === 'TASK_REQUEUED') Object.assign(state.tasks[d.taskId], { stage: 'READY', runId: null, agentId: null, blocker: null });
  if (type === 'TASK_PARKED') {
    const task = state.tasks[d.taskId];
    Object.assign(task, { stage: 'BLOCKED', blocker: d.reason, ownerAction: d.ownerAction ?? null });
    // Never clear an uncertain live run; this retains the concurrency/resource lock.
  }
  if (type === 'ALERT_OPENED') state.alerts[d.key] = { ...d, openedAt: at, active: true, acknowledgedAt: null, deliveredAt: null, deliveryError: null };
  if (type === 'ALERT_RESOLVED') state.alerts[d.key].active = false;
  if (type === 'ALERT_ACKNOWLEDGED') state.alerts[d.key].acknowledgedAt = at;
  if (type === 'NOTIFICATION_DELIVERED') Object.assign(state.alerts[d.key], { deliveredAt: at, deliveryError: null });
  if (type === 'NOTIFICATION_FAILED') Object.assign(state.alerts[d.key], { deliveryError: d.reason, deliveryAttemptAt: at });
  return state;
}

export function agentStatus(state, agent, now, config = defaults) {
  const task = state.tasks[agent.assignment], run = state.runs[task?.runId];
  if (run && !run.endedAt) {
    if (task.stage === 'BLOCKED') return 'BLOCKED';
    if (!run.acknowledgedAt) return 'UNKNOWN';
    if (now - run.heartbeatAt > config.heartbeatMs) return 'OFFLINE';
    if (now - run.lastMeaningfulAt > config.progressMs) return 'STALLED';
    return 'RUNNING';
  }
  if (!agent.observedAt || now - agent.observedAt > config.heartbeatMs) return 'UNKNOWN';
  return agent.observedStatus;
}

export class Engine {
  constructor({ store, adapters = {}, now = Date.now, config = {} }) {
    this.store = store; this.adapters = adapters; this.now = now; this.config = { ...defaults, ...config }; this.busy = false;
    this.state = store.read().reduce(reduce, emptyState());
  }
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
  }
  register(agent) {
    if (!text(agent.id, 80) || !/^[a-z0-9-]+$/.test(agent.id) || this.state.agents[agent.id]) throw Error('Unique lowercase agent id required');
    for (const key of ['name', 'provider', 'role', 'workstation', 'real', 'fantasy']) if (!text(agent[key], 200)) throw Error(`Invalid agent ${key}`);
    if (!Array.isArray(agent.capabilities) || agent.capabilities.some(c => !text(c, 80))) throw Error('Capabilities required');
    this.emit('AGENT_REGISTERED', agent);
  }
  createTask(input) {
    if (!text(input.title, 200) || !text(input.description, 2000)) throw Error('Title and description required');
    if (!Object.hasOwn(operations, input.operation)) throw Error('Operation is not allowlisted');
    if (!['local-read-only', 'owner-required'].includes(input.safety)) throw Error('Explicit safety classification required');
    if (input.safety === 'owner-required' && !text(input.ownerAction)) throw Error('Exact owner action required');
    if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 100) throw Error('Priority must be 0–100');
    const id = randomUUID();
    this.emit('TASK_CREATED', { id, title: input.title, description: input.description, operation: input.operation, capability: operations[input.operation].capability, safety: input.safety, ownerAction: input.ownerAction || null, priority: input.priority });
    return id;
  }
  workerEvent(runId, payload) {
    const run = this.state.runs[runId];
    if (!run || run.endedAt || this.state.tasks[run.taskId].runId !== runId) throw Error('Stale or unknown run');
    if (!payload || !text(payload.summary)) throw Error('Evidence summary required');
    const kinds = ['ACK', 'HEARTBEAT', 'TEST_STARTED', 'TEST_RESULT', 'COMMIT', 'PR', 'REVIEW', 'FINDING', 'HANDOFF', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'USAGE'];
    if (!kinds.includes(payload.kind)) throw Error('Unknown evidence kind');
    if (payload.kind === 'ACK' && run.acknowledgedAt) throw Error('Run already acknowledged');
    if (!run.acknowledgedAt && !['ACK', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(payload.kind)) throw Error('Worker acknowledgement required');
    if (payload.kind === 'TEST_RESULT' && !['passed', 'failed'].includes(payload.result)) throw Error('Test result required');
    if (payload.kind === 'USAGE' && (!payload.usage || !text(payload.usage.source) || !Number.isFinite(payload.usage.elapsedMs) || payload.usage.elapsedMs < 0)) throw Error('Measured usage source required');
    if (payload.url && !/^https:\/\//.test(payload.url)) throw Error('Evidence links must use HTTPS');
    if (payload.files && (!Array.isArray(payload.files) || payload.files.some(f => !text(f, 500)))) throw Error('Invalid files');
    if (payload.kind === 'RATE_LIMITED' && payload.retryAt != null && (!Number.isFinite(payload.retryAt) || payload.retryAt <= this.now())) throw Error('Future retry time required');
    this.emit('WORKER_EVENT', { ...payload, runId });
  }
  runnable() { return Object.values(this.state.tasks).filter(t => t.stage === 'READY' && t.safety === 'local-read-only').sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt); }
  snapshot(at = this.now()) {
    const tasks = Object.values(this.state.tasks), agents = Object.values(this.state.agents).map(a => ({ ...a, status: agentStatus(this.state, a, at, this.config), adapterAvailable: Boolean(this.adapters[a.executionAdapter]) }));
    const counts = { ready: this.runnable().length, working: tasks.filter(t => liveStages.has(t.stage)).length, review: tasks.filter(t => t.stage === 'REVIEW').length, blocked: tasks.filter(t => t.stage === 'BLOCKED').length, done: tasks.filter(t => t.stage === 'DONE').length };
    const unresolvedRuns = Object.values(this.state.runs).filter(r => !r.endedAt).length;
    return { ...this.state, agents, tasks, counts, unresolvedRuns, now: at, cycleComplete: tasks.length > 0 && counts.ready === 0 && counts.working === 0 && counts.review === 0 && unresolvedRuns === 0 && tasks.every(t => t.stage === 'DONE' || (t.stage === 'BLOCKED' && Boolean(t.blocker))) };
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Only a connected adapter can supply an availability observation.
      for (const agent of Object.values(this.state.agents)) {
        const adapter = this.adapters[agent.executionAdapter];
        if (!adapter || agent.assignment || (agent.observedStatus === 'RATE_LIMITED' && (!agent.retryAt || this.now() < agent.retryAt))) continue;
        const observation = await adapter.health();
        if (!['IDLE', 'OFFLINE', 'UNKNOWN', 'RATE_LIMITED'].includes(observation.status)) throw Error('Invalid adapter health');
        if (agent.observedStatus !== observation.status || !agent.observedAt || this.now() - agent.observedAt > this.config.heartbeatMs / 2) this.emit('AGENT_OBSERVED', { agentId: agent.id, ...observation });
      }
      await this.recover();
      for (const task of this.runnable()) {
        const active = Object.values(this.state.runs).filter(r => !r.endedAt);
        if (active.length >= this.config.maxLocalWorkers) break;
        const agent = Object.values(this.state.agents).find(a => a.capabilities.includes(task.capability) && !a.assignment && agentStatus(this.state, a, this.now(), this.config) === 'IDLE' && this.adapters[a.executionAdapter]);
        if (!agent) continue;
        const runId = randomUUID();
        this.emit('DISPATCHED', { taskId: task.id, agentId: agent.id, runId });
        try {
          // start returns after spawn, not task completion. ACK comes from the worker.
          await this.adapters[agent.executionAdapter].start({ task, runId, emit: event => this.workerEvent(runId, event) });
        } catch (error) {
          // A rejected start might have partially launched a worker. Fence it until
          // the adapter confirms termination, just like a lost heartbeat.
          let stopped = false;
          try { stopped = await this.adapters[agent.executionAdapter].cancel(runId); } catch { /* retain lease */ }
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
      if (!run || run.endedAt || task.stage === 'BLOCKED') continue;
      const agent = this.state.agents[run.agentId], status = agentStatus(this.state, agent, this.now(), this.config);
      const ackExpired = !run.acknowledgedAt && this.now() - run.dispatchedAt > this.config.heartbeatMs;
      if (!ackExpired && !['OFFLINE', 'STALLED'].includes(status)) continue;
      this.emit('RECOVERY', { taskId: task.id, step: 'diagnose', reason: ackExpired ? 'No worker acknowledgement' : status, runId: run.runId });
      let stopped = false;
      try { stopped = await this.adapters[agent.executionAdapter]?.cancel(run.runId); } catch { /* Uncertain cancellation retains lease. */ }
      if (stopped !== true) {
        this.emit('TASK_PARKED', { taskId: task.id, reason: 'Automatic recovery failed: worker termination unconfirmed.', ownerAction: 'Inspect and stop the previous worker; confirm termination before retrying.' });
        continue;
      }
      if (!run.endedAt) this.workerEvent(run.runId, { kind: 'CANCELLED', summary: 'Watchdog confirmed worker stopped before recovery.' });
      // Different worker handoff is preferred; no blind repetition or arbitrary shell retries.
      const alternate = Object.values(this.state.agents).find(a => a.id !== agent.id && a.capabilities.includes(task.capability) && !a.assignment && this.adapters[a.executionAdapter] && agentStatus(this.state, a, this.now(), this.config) === 'IDLE');
      if (alternate && task.attempts < this.config.maxAttempts) {
        this.emit('RECOVERY', { taskId: task.id, step: 'handoff', reason: `Retry with ${alternate.name}`, from: agent.id, to: alternate.id });
        this.emit('AGENT_OBSERVED', { agentId: agent.id, status: 'OFFLINE', detail: 'Quarantined after watchdog cancellation' });
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
    }
    if (snapshot.counts.ready) {
      for (const agent of snapshot.agents) {
        if (!this.runnable().some(t => agent.capabilities.includes(t.capability))) continue;
        if (['IDLE', 'OFFLINE', 'STALLED', 'RATE_LIMITED', 'UNKNOWN'].includes(agent.status)) add(`capacity:${agent.id}`, agent.adapterAvailable ? `UNEXPECTED_${agent.status}` : 'ADAPTER_UNAVAILABLE', agent, null, agent.adapterAvailable ? null : `Connect an execution/telemetry adapter for ${agent.name}, or route to a capable connected worker.`, agent.detail || 'Runnable work exists without verified execution on this worker.');
      }
      if (!snapshot.agents.some(a => a.adapterAvailable && this.runnable().some(t => a.capabilities.includes(t.capability)))) add('queue:no-adapter', 'ADAPTER_UNAVAILABLE', null, null, 'Connect a capable execution adapter for the queued operation.', 'No connected worker can execute the safe queue.');
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
}
