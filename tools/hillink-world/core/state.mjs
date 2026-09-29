// World state: a pure reducer over World events plus a store that reports exactly what changed.
// No DOM, no rendering, no backend knowledge. Deterministic and testable in Node.
import { validateEvent } from './events.mjs';

export function emptyWorld() {
  return { seq: 0, at: 0, agents: {}, tasks: {}, systems: {}, prs: {}, builds: {}, deploys: {}, testRuns: {}, issues: {}, messages: [], log: [] };
}

const ACTIVITY_BY_EVENT = {
  AGENT_STARTED_WORK: 'coding', AGENT_THINKING: 'thinking', AGENT_RESEARCHING: 'researching', AGENT_REVIEWING: 'reviewing',
  AGENT_TESTING: 'testing', AGENT_WAITING: 'waiting', AGENT_IDLE: 'idle', AGENT_ERROR: 'error', AGENT_OFFLINE: 'offline',
};
const LOG_LIMIT = 500, MESSAGE_LIMIT = 50;

function agent(world, id, changed) {
  let a = world.agents[id];
  if (!a) {
    // Events can reference an agent before registration; it exists but is unidentified until registered.
    a = world.agents[id] = { id, name: id, role: 'Unregistered agent', kind: 'agent', activity: 'offline', taskId: null, lastEvent: null, since: world.at, source: null };
  }
  changed.add(`agent:${id}`);
  return a;
}
function task(world, id, changed) {
  let t = world.tasks[id];
  if (!t) t = world.tasks[id] = { id, title: id, status: 'queued', agentId: null, progress: null, createdAt: world.at, startedAt: null, endedAt: null, history: [] };
  changed.add(`task:${id}`);
  return t;
}
function setActivity(a, activity, event) {
  if (a.activity !== activity) a.since = event.at;
  a.activity = activity;
  a.lastEvent = { type: event.type, at: event.at, detail: event.detail ?? null };
  a.source = event.source;
}

// Returns the set of changed entity keys ("agent:claude", "task:t1", "system:db", ...).
export function applyEvent(world, event) {
  const problem = validateEvent(event);
  if (problem) throw Error(problem);
  const changed = new Set();
  world.seq += 1;
  world.at = Math.max(world.at, event.at);
  const e = event;
  switch (e.type) {
    case 'AGENT_REGISTERED': {
      const a = agent(world, e.agentId, changed);
      Object.assign(a, { name: e.name, role: e.role, kind: e.kind ?? 'agent', home: e.home ?? null, appearance: e.appearance ?? null, source: e.source });
      if (e.activity) setActivity(a, e.activity, e);
      break;
    }
    case 'SYSTEM_REGISTERED':
      world.systems[e.systemId] = { id: e.systemId, name: e.name, kind: e.kind, state: e.state ?? 'unknown', metrics: e.metrics ?? {}, since: e.at, source: e.source };
      changed.add(`system:${e.systemId}`);
      break;
    case 'SYSTEM_STATUS': {
      const s = world.systems[e.systemId] ??= { id: e.systemId, name: e.systemId, kind: 'system', metrics: {}, since: e.at };
      if (s.state !== e.state) s.since = e.at;
      Object.assign(s, { state: e.state, metrics: { ...s.metrics, ...(e.metrics ?? {}) }, detail: e.detail ?? null, source: e.source });
      changed.add(`system:${e.systemId}`);
      break;
    }
    case 'TASK_CREATED': {
      const t = task(world, e.taskId, changed);
      Object.assign(t, { title: e.title, kind: e.kind ?? 'work', createdAt: e.at });
      t.history.push({ type: e.type, at: e.at });
      break;
    }
    case 'TASK_STARTED': {
      const t = task(world, e.taskId, changed);
      Object.assign(t, { status: 'active', agentId: e.agentId, startedAt: e.at, progress: e.progress ?? t.progress });
      t.history.push({ type: e.type, at: e.at, agentId: e.agentId });
      const a = agent(world, e.agentId, changed);
      a.taskId = e.taskId;
      setActivity(a, e.activity ?? 'coding', e);
      break;
    }
    case 'TASK_PROGRESS': {
      const t = task(world, e.taskId, changed);
      if (e.progress) t.progress = e.progress;
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      break;
    }
    case 'TASK_COMPLETED':
    case 'TASK_FAILED': {
      const t = task(world, e.taskId, changed);
      Object.assign(t, { status: e.type === 'TASK_COMPLETED' ? 'done' : 'failed', endedAt: e.at, progress: e.progress ?? t.progress });
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      if (t.agentId && world.agents[t.agentId]?.taskId === t.id) {
        const a = agent(world, t.agentId, changed);
        a.taskId = null;
        setActivity(a, e.type === 'TASK_COMPLETED' ? 'completed' : 'error', e);
      }
      break;
    }
    case 'TASK_BLOCKED':
    case 'TASK_QUEUED': {
      const t = task(world, e.taskId, changed);
      const owner = t.agentId && world.agents[t.agentId]?.taskId === t.id ? agent(world, t.agentId, changed) : null;
      Object.assign(t, { status: e.type === 'TASK_BLOCKED' ? 'blocked' : 'queued', blocker: e.type === 'TASK_BLOCKED' ? e.detail ?? null : null });
      if (e.type === 'TASK_QUEUED') t.agentId = null;
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      if (owner) { owner.taskId = null; setActivity(owner, 'idle', e); }
      break;
    }
    case 'AGENT_MESSAGE': {
      const from = agent(world, e.agentId, changed); agent(world, e.toAgentId, changed);
      setActivity(from, 'communicating', e);
      from.talkingTo = e.toAgentId;
      world.messages.push({ id: e.id, from: e.agentId, to: e.toAgentId, at: e.at, summary: e.summary ?? null });
      if (world.messages.length > MESSAGE_LIMIT) world.messages.shift();
      changed.add('messages');
      break;
    }
    case 'PR_CREATED': case 'PR_REVIEWED': case 'PR_MERGED': {
      const pr = world.prs[e.prId] ??= { id: e.prId, title: e.title ?? e.prId, url: e.url ?? null, createdAt: e.at };
      pr.state = { PR_CREATED: 'open', PR_REVIEWED: 'reviewed', PR_MERGED: 'merged' }[e.type];
      if (e.verdict) pr.verdict = e.verdict;
      pr.updatedAt = e.at;
      changed.add(`pr:${e.prId}`);
      break;
    }
    case 'BUILD_STARTED': case 'BUILD_SUCCESS': case 'BUILD_FAILED':
      world.builds[e.buildId] = { id: e.buildId, state: { BUILD_STARTED: 'running', BUILD_SUCCESS: 'success', BUILD_FAILED: 'failed' }[e.type], at: e.at, detail: e.detail ?? null };
      changed.add(`build:${e.buildId}`);
      break;
    case 'DEPLOY_STARTED': case 'DEPLOY_SUCCESS': case 'DEPLOY_FAILED':
      world.deploys[e.deployId] = { id: e.deployId, state: { DEPLOY_STARTED: 'running', DEPLOY_SUCCESS: 'success', DEPLOY_FAILED: 'failed' }[e.type], at: e.at, target: e.target ?? null, detail: e.detail ?? null };
      changed.add(`deploy:${e.deployId}`);
      break;
    case 'TESTS_STARTED':
      world.testRuns[e.runId] = { id: e.runId, state: 'running', startedAt: e.at, passed: null, failed: null, agentId: e.agentId ?? null, suite: e.suite ?? null };
      changed.add(`tests:${e.runId}`);
      break;
    case 'TESTS_FINISHED': {
      const r = world.testRuns[e.runId] ??= { id: e.runId, startedAt: e.at, agentId: e.agentId ?? null, suite: e.suite ?? null };
      Object.assign(r, { state: e.failed > 0 ? 'failed' : 'passed', passed: e.passed, failed: e.failed, endedAt: e.at });
      changed.add(`tests:${e.runId}`);
      break;
    }
    case 'ISSUE_FOUND':
      world.issues[e.issueId] = { id: e.issueId, title: e.title, severity: e.severity ?? 'unknown', location: e.location ?? null, agentId: e.agentId ?? null, open: true, at: e.at };
      changed.add(`issue:${e.issueId}`);
      break;
    case 'ISSUE_RESOLVED':
      if (world.issues[e.issueId]) Object.assign(world.issues[e.issueId], { open: false, resolvedAt: e.at });
      changed.add(`issue:${e.issueId}`);
      break;
    default: {
      const activity = ACTIVITY_BY_EVENT[e.type];
      if (activity) {
        const a = agent(world, e.agentId, changed);
        setActivity(a, activity, e);
        if (activity !== 'communicating') a.talkingTo = null;
        if (e.taskId !== undefined) a.taskId = e.taskId;
      }
    }
  }
  world.log.push({ seq: world.seq, ...e }); // Events are small; keeping them whole lets the feed and replay describe them.
  if (world.log.length > LOG_LIMIT) world.log.shift();
  return changed;
}

// Store: batches events and notifies subscribers once per flush with the union of changed keys,
// so one agent's progress never forces a whole-world redraw decision.
export class WorldStore {
  constructor(world = emptyWorld()) { this.world = world; this.listeners = new Set(); this.pending = []; this.seen = new Set(); this.rejected = []; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  dispatch(event) { this.pending.push(event); }
  dispatchAll(events) { for (const e of events) this.pending.push(e); }
  flush() {
    if (!this.pending.length) return null;
    const changed = new Set();
    const batch = this.pending.splice(0).sort((a, b) => a.at - b.at);
    for (const event of batch) {
      if (this.seen.has(event.id)) continue; // Adapters may redeliver; events are idempotent by id.
      try { for (const key of applyEvent(this.world, event)) changed.add(key); this.seen.add(event.id); }
      catch (error) { this.rejected.push({ event, error: error.message }); if (this.rejected.length > 50) this.rejected.shift(); }
    }
    if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2500));
    if (changed.size) for (const fn of this.listeners) fn(changed, this.world);
    return changed;
  }
  // Backend truth replaces the cached/simulated world wholesale.
  replace(world) { this.world = world; this.seen.clear(); for (const fn of this.listeners) fn(new Set(['*']), this.world); }
}
