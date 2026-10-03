// World state: a pure reducer over World events plus a store that reports exactly what changed.
// No DOM, no rendering, no backend knowledge. Deterministic and testable in Node.
import { validateEvent } from './events.mjs';
import { applyPassEvent } from './construction.mjs';
import { reconcileAgents } from './truth.mjs';
import { normalizeDefinition, mergeDefinitions, checkAgentEvent, isLifecycleEvent, targetState, canWork, sameFamily, readied, familyOf, PROVISIONING_STAGES } from './agents.mjs';

export function emptyWorld() {
  return { seq: 0, at: 0, agents: {}, tasks: {}, systems: {}, prs: {}, builds: {}, deploys: {}, testRuns: {}, issues: {}, meetings: {}, meetingLog: [], passes: {}, messages: [], log: [] };
}

const ACTIVITY_BY_EVENT = {
  AGENT_STARTED_WORK: 'coding', AGENT_THINKING: 'thinking', AGENT_COORDINATING: 'coordinating', AGENT_RESEARCHING: 'researching', AGENT_REVIEWING: 'reviewing',
  AGENT_TESTING: 'testing', AGENT_WAITING: 'waiting', AGENT_IDLE: 'idle', AGENT_ERROR: 'error', AGENT_OFFLINE: 'offline',
};
const LOG_LIMIT = 500, MESSAGE_LIMIT = 50, EVIDENCE_LIMIT = 20, MEETING_LOG_LIMIT = 10;
// Activities that are real work: they pull an agent out of a meeting. Idle or waiting does not.
const ENDS_MEETING = new Set(['coding', 'thinking', 'coordinating', 'researching', 'reviewing', 'testing', 'error', 'offline']);

function agent(world, id, changed, e = null) {
  let a = world.agents[id];
  if (!a) {
    // Events can reference an agent before registration; it exists but is unidentified until registered.
    // 5E correction (B3, B4): such an agent is a placeholder, never a working member, until AGENT_REGISTERED or the
    // lifecycle establishes it; and it belongs to the source family of the event that first mentioned it.
    a = world.agents[id] = { id, name: id, role: 'Unregistered agent', kind: 'agent', activity: 'offline', taskId: null, prId: null, lastTask: null, lastEvent: null, since: world.at, source: null, placeholder: true, origin: e?.source ?? null };
  }
  changed.add(`agent:${id}`);
  return a;
}
function task(world, id, changed, e = null) {
  let t = world.tasks[id];
  if (!t) t = world.tasks[id] = { id, title: id, status: 'queued', agentId: null, progress: null, createdAt: world.at, startedAt: null, endedAt: null, history: [], evidence: [], prId: null, outcome: null, origin: e?.source ?? null };
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

// Pass 5E: registry rules, checked before the reducer touches anything (a refused event changes nothing).
// Definitions and lifecycle follow core/agents.mjs; an agent that is not a working member (being provisioned, READY but
// not activated, disabled, retired, or a mere placeholder) cannot be given work; and an agent defined by one source
// family is never changed by the other.
//
// 5E correction (B2): one gate for every event that can give an agent work or participation. It names the agents an
// event makes PARTICIPATE (take a task, an activity, a message or a meeting seat) and requires each to be a working
// member; the only exception is AGENT_OFFLINE carrying no task or PR, which says an agent is not working.
// 5E correction (B4): every agent (and task and meeting) an event refers to is checked for source family, not only the
// registry events: agentId, toAgentId, agentIds[], reviewerId, evidence.by, and a task's or meeting's owner.
const PARTICIPATION = new Set(['TASK_STARTED', 'AGENT_MESSAGE', 'MEETING_STARTED', ...Object.keys(ACTIVITY_BY_EVENT)]);
export function participantsOf(e) {
  if (!PARTICIPATION.has(e.type)) return [];
  if (e.type === 'AGENT_OFFLINE' && e.taskId == null && e.prId == null) return [];
  return [e.agentId, e.toAgentId, ...(Array.isArray(e.agentIds) ? e.agentIds : [])].filter(id => id != null);
}
export function agentRefsOf(world, e) {
  const ids = [e.agentId, e.toAgentId, e.reviewerId, e.evidence?.by, ...(Array.isArray(e.agentIds) ? e.agentIds : [])];
  const t = e.taskId != null ? world.tasks[e.taskId] : null; if (t?.agentId) ids.push(t.agentId);
  const m = e.meetingId != null ? world.meetings?.[e.meetingId] : null; if (m) ids.push(...m.agentIds);
  return [...new Set(ids.filter(id => typeof id === 'string' && id))];
}
function precheck(world, e) {
  const a = e.agentId != null ? world.agents[e.agentId] : null;
  const refs = agentRefsOf(world, e), named = [e.agentId, e.toAgentId, ...(Array.isArray(e.agentIds) ? e.agentIds : [])].filter(id => id != null);
  if (named.length && !sameFamily(null, e.source)) return `${e.type}: ${e.source} events cannot refer to agents (a replay restates events with their original source)`;
  for (const id of refs) { const r = world.agents[id]; if (r?.origin && !sameFamily(r.origin, e.source)) return `${e.type}: ${e.source} events cannot change agent ${id} (defined by ${r.origin})`; }
  const t = e.taskId != null ? world.tasks[e.taskId] : null;
  if (t?.origin && !sameFamily(t.origin, e.source)) return `${e.type}: ${e.source} events cannot change task ${e.taskId} (created by ${t.origin})`;
  const m = e.meetingId != null ? world.meetings?.[e.meetingId] : null;
  if (m?.source && !sameFamily(m.source, e.source)) return `${e.type}: ${e.source} events cannot change meeting ${e.meetingId} (started by ${m.source})`;
  if (e.type === 'AGENT_DEFINED' || isLifecycleEvent(e.type)) return checkAgentEvent(a, e);
  for (const id of participantsOf(e)) {
    const p = world.agents[id];
    if (!p || !canWork(p)) return `${e.type}: ${id} is ${!p ? 'unknown' : p.placeholder ? 'unregistered' : p.lifecycle.state}, not a working member`;
  }
  return null;
}
function define(a, raw, e) {
  const d = normalizeDefinition({ ...raw, id: a.id }); if (!d) return;
  a.definition = mergeDefinitions(a.definition, d);
  a.definitionVersion = (a.definitionVersion ?? 0) + 1; a.definedAt = e.at;
  // The fields older code reads directly stay in step with the definition.
  if (d.name) a.name = d.name; if (d.role) a.role = d.role; if (d.kind) a.kind = d.kind;
  if (d.appearance) a.appearance = a.definition.appearance;
}
const LIFECYCLE_HISTORY = 12;
// An agent that stops being a working member leaves every open meeting: no meeting keeps a seat for it (5E correction
// B2). A meeting left with nobody in it ends.
function leaveMeetings(world, id, e, changed) {
  for (const m of Object.values(world.meetings ?? {})) {
    if (!m.agentIds.includes(id)) continue;
    m.agentIds = m.agentIds.filter(x => x !== id); changed.add('meetings');
    if (!m.agentIds.length) {
      delete world.meetings[m.id];
      world.meetingLog ??= []; world.meetingLog.push({ ...m, outcome: 'no participants left', endedAt: e.at });
      if (world.meetingLog.length > MEETING_LOG_LIMIT) world.meetingLog.shift();
    }
  }
}

// Returns the set of changed entity keys ("agent:claude", "task:t1", "system:db", ...).
export function applyEvent(world, event) {
  const problem = validateEvent(event) ?? precheck(world, event);
  if (problem) throw Error(problem);
  const changed = new Set();
  world.seq += 1;
  world.at = Math.max(world.at, event.at);
  const e = event;
  switch (e.type) {
    case 'AGENT_REGISTERED': {
      const a = agent(world, e.agentId, changed, e);
      Object.assign(a, { name: e.name, role: e.role, kind: e.kind ?? 'agent', home: e.home ?? null, appearance: e.appearance ?? null, source: e.source });
      a.origin ??= e.source; delete a.placeholder; // registration establishes the agent (5E correction B3)
      // Registration carries the definition fields HQ knows (Pass 5E); the pre-5E fields above stay as they were.
      define(a, { ...(e.definition ?? {}), name: e.name, role: e.role, ...(e.kind ? { kind: e.kind } : {}), ...(e.appearance ? { appearance: e.appearance } : {}), ...(e.home ? { home: e.home } : {}) }, e);
      if (e.activity && canWork(a)) setActivity(a, e.activity, e);
      break;
    }
    case 'AGENT_DEFINED': {
      const created = !world.agents[e.agentId], a = agent(world, e.agentId, changed, e);
      a.origin ??= e.source;
      define(a, e.definition, e);
      // A new (or merely mentioned) agent defined at runtime starts as a draft of the lifecycle.
      if ((created || a.placeholder) && !a.lifecycle) a.lifecycle = { state: 'DRAFT', since: e.at, detail: null, history: [{ state: 'DRAFT', at: e.at }], readied: false };
      delete a.placeholder;
      break;
    }
    case 'AGENT_REQUESTED': case 'AGENT_PROVISIONING': case 'AGENT_PROVISIONING_WAITING': case 'AGENT_PROVISIONING_FAILED':
    case 'AGENT_READY': case 'AGENT_ACTIVATED': case 'AGENT_DISABLED': case 'AGENT_RETIRED': {
      const a = agent(world, e.agentId, changed, e), to = targetState(e), wasReady = readied(a);
      a.origin ??= e.source; delete a.placeholder;
      if (e.definition) define(a, e.definition, e);
      const history = [...(a.lifecycle?.history ?? []), { state: to, at: e.at, detail: e.detail ?? null }].slice(-LIFECYCLE_HISTORY);
      // `readied` survives the bounded history: whether this agent ever legitimately reached READY (5E correction B3).
      a.lifecycle = { state: to, since: e.at, detail: e.detail ?? null, history, readied: wasReady || to === 'READY' || to === 'ACTIVE' };
      a.source = e.source;
      // Only a working member may hold work. Leaving (or not yet joining) the team drops any task and meeting seat;
      // joining makes the agent available (its runtime, if HQ reports one, still decides what it does).
      if (!canWork(a)) {
        if (a.taskId && world.tasks[a.taskId]?.agentId === a.id && world.tasks[a.taskId].status === 'active') { const t = world.tasks[a.taskId]; t.status = 'queued'; t.agentId = null; t.history.push({ type: e.type, at: e.at }); changed.add(`task:${t.id}`); }
        leaveMeetings(world, a.id, e, changed);
        a.taskId = null; a.meetingId = null; a.beforeMeeting = null; a.talkingTo = null; setActivity(a, 'offline', e);
      } else if (a.activity === 'offline' && !a.runtime) setActivity(a, 'idle', e);
      break;
    }
    case 'AGENT_RUNTIME': {
      const a = agent(world, e.agentId, changed, e);
      a.runtime = { ...e.runtime, observedAt: e.at };
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
      const t = task(world, e.taskId, changed, e);
      Object.assign(t, { title: e.title, kind: e.kind ?? 'work', createdAt: e.at });
      t.history.push({ type: e.type, at: e.at });
      break;
    }
    case 'TASK_STARTED': {
      const t = task(world, e.taskId, changed, e);
      Object.assign(t, { status: 'active', agentId: e.agentId, startedAt: e.at, progress: e.progress ?? t.progress });
      t.history.push({ type: e.type, at: e.at, agentId: e.agentId });
      const a = agent(world, e.agentId, changed, e);
      a.taskId = e.taskId;
      setActivity(a, e.activity ?? 'coding', e);
      break;
    }
    case 'TASK_PROGRESS': {
      const t = task(world, e.taskId, changed, e);
      if (e.progress) t.progress = e.progress;
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      if (e.evidence) addEvidence(t, { kind: e.evidence.kind, ref: e.evidence.ref ?? null, summary: e.detail ?? e.evidence.summary ?? null, at: e.at });
      break;
    }
    case 'TASK_COMPLETED':
    case 'TASK_FAILED': {
      const t = task(world, e.taskId, changed, e);
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
      const t = task(world, e.taskId, changed, e);
      const owner = t.agentId && world.agents[t.agentId]?.taskId === t.id ? agent(world, t.agentId, changed) : null;
      Object.assign(t, { status: e.type === 'TASK_BLOCKED' ? 'blocked' : 'queued', blocker: e.type === 'TASK_BLOCKED' ? e.detail ?? null : null });
      if (e.type === 'TASK_QUEUED') t.agentId = null;
      t.history.push({ type: e.type, at: e.at, detail: e.detail ?? null });
      if (owner) { owner.taskId = null; owner.lastTask = { taskId: t.id, outcome: e.type === 'TASK_BLOCKED' ? 'blocked' : 'requeued', at: e.at }; setActivity(owner, e.type === 'TASK_BLOCKED' ? 'waiting' : 'idle', e); }
      break;
    }
    case 'AGENT_MESSAGE': {
      const from = agent(world, e.agentId, changed, e); agent(world, e.toAgentId, changed, e);
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
        const a = agent(world, id, changed, e);
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
        const a = agent(world, e.agentId, changed, e);
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
  // Truth: HQ-backed agents are re-derived after every event, so no event can leave one looking busy without a verified run.
  for (const id of reconcileAgents(world, e.at, setActivity)) changed.add(`agent:${id}`);
  if (e.type === 'AGENT_RUNTIME') return changed; // runtime reports are state, not activity: kept out of the feed
  world.log.push({ seq: world.seq, ...e }); // Events are small; keeping them whole lets the feed and replay describe them.
  if (world.log.length > LOG_LIMIT) world.log.shift();
  return changed;
}

// 5E correction (B5): the canonical order of World events, the same for live delivery and for replay. Events are applied
// by time; at the same time, grouped by source and in the source's own sequence where it gives one (`order`: HQ's event
// sequence); then by what they mean (an agent is registered or defined before its lifecycle advances, a lifecycle
// advances in its own order, a task is created before it is worked on, and leaving comes last); and finally by id
// (makeEvent pads its counter, so the simulator's ids sort in emission order). Every step is a total order on the
// events' own fields, so nothing depends on how events were batched or delivered.
const RANK = { SYSTEM_REGISTERED: 0, AGENT_REGISTERED: 0, AGENT_DEFINED: 0, AGENT_REQUESTED: 1, AGENT_PROVISIONING_WAITING: 8, AGENT_PROVISIONING_FAILED: 9, AGENT_READY: 10, AGENT_ACTIVATED: 11, TASK_CREATED: 12, AGENT_DISABLED: 14, AGENT_RETIRED: 15 };
const rankOf = e => (e.type === 'AGENT_PROVISIONING' ? 2 + Math.max(0, PROVISIONING_STAGES.indexOf(e.stage)) : RANK[e.type] ?? 13);
const orderOf = e => (Number.isFinite(e.order) ? e.order : 0);
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
export function eventOrder(a, b) {
  return a.at - b.at || cmp(a.source, b.source) || orderOf(a) - orderOf(b) || rankOf(a) - rankOf(b) || cmp(a.id, b.id);
}

// Store: batches events and notifies subscribers once per flush with the union of changed keys,
// so one agent's progress never forces a whole-world redraw decision.
//
// 5E correction (B5): the store keeps the events it has received (its history) in canonical order, and its world is
// always the fold of that history over its base world, so live state equals a replay of the same events:
//   - an event later than everything applied is applied directly (the common case);
//   - an event that arrives late (its place is earlier in the history) re-applies the history from the last checkpoint
//     before its place, so it lands exactly where a replay would put it, and later events are re-checked after it;
//   - a duplicate id changes nothing (if two different events share an id, the earlier in canonical order is kept);
//   - reset() is the same fold over a new history. Checkpoints (a copy of the world every CHECKPOINT events) keep a
//     late event cheap; once the history exceeds HISTORY_LIMIT its oldest half is folded into the base world, and an
//     event older than that point can no longer be placed (it is refused as too late, never applied out of order).
// A store built from a saved world (no history) treats that world as its base: events older than it are checked
// against it, as the saved world has no history to place them in.
const CHECKPOINT = 250, HISTORY_LIMIT = 20000;
export class WorldStore {
  constructor(world = emptyWorld()) {
    this.world = world; this.listeners = new Set(); this.pending = []; this.rejected = []; this.sticky = new Map(); this.family = null;
    this.base = structuredClone(world); this.history = []; this.byId = new Map(); this.folded = new Set(); this.foldedAt = null; this.checkpoints = []; this.snapshotInfo = world.snapshot ?? null;
  }
  // Events from a source independent of the main feed (construction evidence from git and GitHub) survive
  // a reset or replace: HQ reconnecting must not demolish the building.
  keep(events) { for (const e of events) if (!this.sticky.has(e.id)) { this.sticky.set(e.id, e); this.pending.push(e); } }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  dispatch(event) { this.pending.push(event); }
  dispatchAll(events) { for (const e of events) this.pending.push(e); }
  reject(event, error) { this.rejected.push({ event, error }); if (this.rejected.length > 50) this.rejected.shift(); }
  // Put one event into the history. Returns the index it went in at, or -1 when it changes nothing.
  insert(event) {
    const problem = validateEvent(event);
    if (problem) { this.reject(event, problem); return -1; }
    // 5E correction (B4): a store locked to one family (the live page locks to 'live') takes no event from the other.
    if (this.family && familyOf(event.source) !== this.family) { this.reject(event, `${event.type}: a ${this.family} World refuses ${event.source} events`); return -1; }
    if (this.folded.has(event.id)) return -1;
    if (this.foldedAt && eventOrder(event, this.foldedAt) <= 0) { this.reject(event, `${event.type}: arrived after its place in the history was folded into the base world`); return -1; }
    const known = this.byId.get(event.id);
    if (known) {
      if (eventOrder(event, known) >= 0) return -1; // a redelivery (or a later copy of the same id): nothing changes
      const i = this.history.indexOf(known); this.history.splice(i, 1); // the canonical copy is the earlier one
      this.byId.set(event.id, event);
      return Math.min(i, this.place(event));
    }
    this.byId.set(event.id, event);
    return this.place(event);
  }
  place(event) {
    let lo = 0, hi = this.history.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (eventOrder(this.history[mid], event) <= 0) lo = mid + 1; else hi = mid; }
    this.history.splice(lo, 0, event);
    return lo;
  }
  // Re-apply the history from index `from` (the first place that changed), starting at the last checkpoint before it.
  refold(from, changed) {
    this.checkpoints = this.checkpoints.filter(c => c.index <= from);
    const cp = this.checkpoints.at(-1), start = cp ? cp.index : 0;
    const world = structuredClone(cp ? cp.world : this.base), redo = new Set(this.history.slice(start).map(e => e.id));
    this.rejected = this.rejected.filter(r => !redo.has(r.event?.id));
    this.world = world;
    this.applyFrom(start, changed);
    if (this.snapshotInfo) this.world.snapshot = this.snapshotInfo;
  }
  applyFrom(start, changed) {
    for (let i = start; i < this.history.length; i++) {
      const event = this.history[i];
      try { for (const key of applyEvent(this.world, event)) changed.add(key); }
      catch (error) { this.reject(event, error.message); }
      // What a re-application may have undone: keep every entity the event names in the change set.
      if (event.agentId) changed.add(`agent:${event.agentId}`); if (event.taskId) changed.add(`task:${event.taskId}`);
      if ((i + 1) % CHECKPOINT === 0 && !this.checkpoints.some(c => c.index === i + 1)) this.checkpoints.push({ index: i + 1, world: structuredClone(this.world) });
    }
    if (this.history.length > HISTORY_LIMIT) this.fold();
  }
  // Fold the oldest history into the base world at a checkpoint, so memory stays bounded.
  fold() {
    const cp = this.checkpoints.filter(c => c.index <= this.history.length / 2).at(-1); if (!cp) return;
    const gone = this.history.splice(0, cp.index);
    for (const e of gone) { this.byId.delete(e.id); this.folded.add(e.id); }
    while (this.folded.size > HISTORY_LIMIT) this.folded.delete(this.folded.values().next().value);
    this.base = cp.world; this.foldedAt = gone.at(-1);
    this.checkpoints = this.checkpoints.filter(c => c.index > cp.index).map(c => ({ ...c, index: c.index - cp.index }));
  }
  flush() {
    if (!this.pending.length) return null;
    const changed = new Set(), before = this.history.length;
    let from = Infinity;
    const batch = this.pending.splice(0), valid = [];
    for (const event of batch) { const problem = validateEvent(event); if (problem) this.reject(event, problem); else valid.push(event); }
    for (const event of valid.sort(eventOrder)) {
      const i = this.insert(event);
      if (i >= 0) from = Math.min(from, i);
    }
    if (from < before) this.refold(from, changed); // something arrived late: replay from its place
    else if (from !== Infinity) this.applyFrom(from, changed);
    if (changed.size) for (const fn of this.listeners) fn(changed, this.world);
    return changed;
  }
  // Backend truth replaces the cached/simulated world wholesale.
  replace(world) {
    this.base = structuredClone(world); this.world = world; this.history = []; this.byId.clear(); this.folded.clear(); this.foldedAt = null; this.checkpoints = []; this.pending = []; this.snapshotInfo = world.snapshot ?? null;
    const changed = new Set();
    for (const e of [...this.sticky.values()].sort(eventOrder)) if (this.insert(e) >= 0) { /* placed */ }
    this.applyFrom(0, changed);
    for (const fn of this.listeners) fn(new Set(['*']), this.world);
  }
  // Rebuild from a snapshot's events in one step, so views place everything directly instead of animating a replay.
  // The same fold as live delivery: a replay is idempotent by event id and independent of the order it is given in.
  reset(events) {
    const world = emptyWorld();
    this.base = structuredClone(world); this.world = world; this.history = []; this.byId.clear(); this.folded.clear(); this.foldedAt = null; this.checkpoints = []; this.pending = []; this.snapshotInfo = null;
    for (const e of [...events, ...this.sticky.values()]) this.insert(e);
    this.applyFrom(0, new Set());
    const snap = events.filter(e => e.snapshot);
    if (snap.length) this.snapshotInfo = world.snapshot = { source: snap[0].source, loadedAt: Math.max(...snap.map(e => e.at)), agents: Object.keys(world.agents).length, tasks: Object.keys(world.tasks).length };
    for (const fn of this.listeners) fn(new Set(['*']), this.world);
  }
}
