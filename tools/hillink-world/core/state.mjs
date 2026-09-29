// World state: a pure reducer over World events plus a store that reports exactly what changed.
// No DOM, no rendering, no backend knowledge. Deterministic and testable in Node.
import { validateEvent } from './events.mjs';
import { applyPassEvent } from './construction.mjs';

export function emptyWorld() {
  return { seq: 0, at: 0, agents: {}, tasks: {}, systems: {}, prs: {}, builds: {}, deploys: {}, testRuns: {}, issues: {}, meetings: {}, meetingLog: [], passes: {}, messages: [], log: [] };
}

const ACTIVITY_BY_EVENT = {
  AGENT_STARTED_WORK: 'coding', AGENT_THINKING: 'thinking', AGENT_RESEARCHING: 'researching', AGENT_REVIEWING: 'reviewing',
  AGENT_TESTING: 'testing', AGENT_WAITING: 'waiting', AGENT_IDLE: 'idle', AGENT_ERROR: 'error', AGENT_OFFLINE: 'offline',
};
const LOG_LIMIT = 500, MESSAGE_LIMIT = 50, EVIDENCE_LIMIT = 20, MEETING_LOG_LIMIT = 10;
// Activities that are real work: they pull an agent out of a meeting. Idle or waiting does not.
const ENDS_MEETING = new Set(['coding', 'thinking', 'researching', 'reviewing', 'testing', 'error', 'offline']);

function agent(world, id, changed) {
  let a = world.agents[id];
  if (!a) {
    // Events can reference an agent before registration; it exists but is unidentified until registered.
    a = world.agents[id] = { id, name: id, role: 'Unregistered agent', kind: 'agent', activity: 'offline', taskId: null, prId: null, lastTask: null, lastEvent: null, since: world.at, source: null };
  }
  changed.add(`agent:${id}`);
  return a;
}
function task(world, id, changed) {
  let t = world.tasks[id];
  if (!t) t = world.tasks[id] = { id, title: id, status: 'queued', agentId: null, progress: null, createdAt: world.at, startedAt: null, endedAt: null, history: [], evidence: [], prId: null, outcome: null };
  changed.add(`task:${id}`);
  return t;
}
// Evidence is what makes a task's story checkable: commits, PRs, test runs, reviews, handoffs.
function addEvidence(t, item) {
  t.evidence ??= [];
  t.evidence.push(item);
  if (t.evidence.length > EVIDENCE_LIMIT) t.evidence.shift();
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
      if (e.evidence) addEvidence(t, { kind: e.evidence.kind, ref: e.evidence.ref ?? null, summary: e.detail ?? e.evidence.summary ?? null, at: e.at });
      break;
    }
    case 'TASK_COMPLETED':
    case 'TASK_FAILED': {
      const t = task(world, e.taskId, changed);
      const outcome = e.type === 'TASK_COMPLETED' ? 'done' : 'failed';
      Object.assign(t, { status: outcome, outcome, endedAt: e.at, progress: e.progress ?? t.progress });
      if (e.detail) t.outcomeDetail = e.detail;
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      if (t.agentId && world.agents[t.agentId]?.taskId === t.id) {
        const a = agent(world, t.agentId, changed);
        a.taskId = null; // the job ended; what it was, and how it ended, stays on the agent
        a.lastTask = { taskId: t.id, outcome, at: e.at };
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
      if (owner) { owner.taskId = null; owner.lastTask = { taskId: t.id, outcome: e.type === 'TASK_BLOCKED' ? 'blocked' : 'requeued', at: e.at }; setActivity(owner, e.type === 'TASK_BLOCKED' ? 'waiting' : 'idle', e); }
      break;
    }
    case 'AGENT_MESSAGE': {
      const from = agent(world, e.agentId, changed); agent(world, e.toAgentId, changed);
      setActivity(from, 'communicating', e);
      from.talkingTo = e.toAgentId;
      const about = e.taskId ? world.tasks[e.taskId] : null;
      if (about) { addEvidence(about, { kind: 'handoff', ref: `${e.agentId}→${e.toAgentId}`, summary: e.summary ?? null, at: e.at }); changed.add(`task:${about.id}`); }
      world.messages.push({ id: e.id, from: e.agentId, to: e.toAgentId, at: e.at, summary: e.summary ?? null });
      if (world.messages.length > MESSAGE_LIMIT) world.messages.shift();
      changed.add('messages');
      break;
    }
    case 'MEETING_STARTED': {
      world.meetings ??= {};
      world.meetings[e.meetingId] = { id: e.meetingId, agentIds: [...e.agentIds], topic: e.topic ?? null, decision: e.decision ?? null, evidence: e.evidence ?? [], taskId: e.taskId ?? null, at: e.at, source: e.source };
      for (const id of e.agentIds) {
        const a = agent(world, id, changed);
        if (!a.meetingId) a.beforeMeeting = a.activity;
        a.meetingId = e.meetingId; setActivity(a, 'communicating', e);
      }
      changed.add('meetings');
      break;
    }
    case 'MEETING_ENDED': {
      const m = world.meetings?.[e.meetingId];
      for (const id of m?.agentIds ?? []) {
        const a = world.agents[id];
        if (!a || a.meetingId !== e.meetingId) continue;
        changed.add(`agent:${id}`);
        a.meetingId = null; setActivity(a, a.beforeMeeting && a.beforeMeeting !== 'communicating' ? a.beforeMeeting : 'idle', e); a.beforeMeeting = null;
      }
      if (m) {
        delete world.meetings[e.meetingId];
        world.meetingLog ??= [];
        world.meetingLog.push({ ...m, outcome: e.outcome ?? null, endedAt: e.at });
        if (world.meetingLog.length > MEETING_LOG_LIMIT) world.meetingLog.shift();
      }
      changed.add('meetings');
      break;
    }
    case 'PR_CREATED': case 'PR_REVIEWED': case 'PR_MERGED': {
      const pr = world.prs[e.prId] ??= { id: e.prId, title: e.title ?? e.prId, url: e.url ?? null, createdAt: e.at };
      pr.state = { PR_CREATED: 'open', PR_REVIEWED: 'reviewed', PR_MERGED: 'merged' }[e.type];
      if (e.verdict) pr.verdict = e.verdict;
      if (e.agentId) pr.agentId ??= e.agentId;
      if (e.taskId) pr.taskId ??= e.taskId;
      if (e.reviewerId) pr.reviewerId = e.reviewerId;
      pr.updatedAt = e.at;
      changed.add(`pr:${e.prId}`);
      const t = pr.taskId ? world.tasks[pr.taskId] : null;
      if (t) {
        if (e.type === 'PR_CREATED') t.prId = e.prId;
        const summary = e.type === 'PR_CREATED' ? `Opened: ${pr.title}` : e.type === 'PR_REVIEWED' ? `Review: ${e.verdict ?? 'reviewed'}${e.summary ? `, ${e.summary}` : ''}` : 'Merged';
        addEvidence(t, { kind: e.type === 'PR_REVIEWED' ? 'review' : 'pr', ref: e.prId, summary, at: e.at });
        changed.add(`task:${t.id}`);
      }
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
      world.testRuns[e.runId] = { id: e.runId, state: 'running', startedAt: e.at, passed: null, failed: null, agentId: e.agentId ?? null, taskId: e.taskId ?? null, suite: e.suite ?? null, failing: [] };
      changed.add(`tests:${e.runId}`);
      break;
    case 'TESTS_FINISHED': {
      const r = world.testRuns[e.runId] ??= { id: e.runId, startedAt: e.at, agentId: e.agentId ?? null, taskId: e.taskId ?? null, suite: e.suite ?? null };
      Object.assign(r, { state: e.failed > 0 ? 'failed' : 'passed', passed: e.passed, failed: e.failed, endedAt: e.at, failing: Array.isArray(e.failing) ? e.failing.slice(0, 10) : [] });
      r.taskId ??= e.taskId ?? null; r.agentId ??= e.agentId ?? null;
      changed.add(`tests:${e.runId}`);
      const t = r.taskId ? world.tasks[r.taskId] : null;
      if (t) { addEvidence(t, { kind: 'tests', ref: e.runId, summary: `${e.passed} passed, ${e.failed} failed${r.suite ? ` (${r.suite})` : ''}`, failed: e.failed, at: e.at }); changed.add(`task:${t.id}`); }
      break;
    }
    case 'PASS_PLANNED': case 'PASS_EVIDENCE':
      applyPassEvent(world, e, changed);
      break;
    case 'ISSUE_FOUND':
      world.issues[e.issueId] = { id: e.issueId, title: e.title, severity: e.severity ?? 'unknown', location: e.location ?? null, agentId: e.agentId ?? null, taskId: e.taskId ?? null, runId: e.runId ?? null, nextAction: e.nextAction ?? null, nextActionSource: e.nextAction ? e.source : null, owner: e.owner === true, open: true, at: e.at };
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
        if (a.meetingId && ENDS_MEETING.has(activity)) { a.meetingId = null; a.beforeMeeting = null; } // real work pulls an agent out of a meeting
        if (e.taskId !== undefined) a.taskId = e.taskId;
        // What the agent is working on: a PR under review, or the task it names. Idle clears it.
        if (e.prId !== undefined) a.prId = e.prId;
        else if ((activity === 'idle' || activity === 'offline') && a.prId) {
          const pr = world.prs[a.prId]; // the review ended: remember what was reviewed and how it came out
          a.lastTask = { taskId: pr?.taskId ?? null, prId: a.prId, outcome: pr?.verdict ?? pr?.state ?? 'reviewed', at: e.at };
          a.prId = null;
        }
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
  constructor(world = emptyWorld()) { this.world = world; this.listeners = new Set(); this.pending = []; this.seen = new Set(); this.rejected = []; this.sticky = new Map(); }
  // Events from a source independent of the main feed (construction evidence from git and GitHub) survive
  // a reset or replace: HQ reconnecting must not demolish the building.
  keep(events) { for (const e of events) if (!this.sticky.has(e.id)) { this.sticky.set(e.id, e); this.pending.push(e); } }
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
  replace(world) {
    this.world = world; this.seen.clear();
    for (const e of this.sticky.values()) { try { applyEvent(world, e); this.seen.add(e.id); } catch { /* reported on first delivery */ } }
    for (const fn of this.listeners) fn(new Set(['*']), this.world);
  }
  // Rebuild from a snapshot's events in one step, so views place everything directly instead of animating a replay.
  reset(events) {
    const world = emptyWorld(), ids = [];
    for (const event of [...events].sort((a, b) => a.at - b.at)) {
      try { applyEvent(world, event); ids.push(event.id); }
      catch (error) { this.rejected.push({ event, error: error.message }); if (this.rejected.length > 50) this.rejected.shift(); }
    }
    const snap = events.filter(e => e.snapshot);
    if (snap.length) world.snapshot = { source: snap[0].source, loadedAt: Math.max(...snap.map(e => e.at)), agents: Object.keys(world.agents).length, tasks: Object.keys(world.tasks).length };
    this.pending = []; this.replace(world); for (const id of ids) this.seen.add(id);
  }
}
