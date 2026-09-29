// HQ adapter (Phase 4): translates Hillink HQ's journal into World events. Pure; no I/O.
// HQ is the source of truth. Each HQ journal event maps to zero or more World events whose ids derive
// from the HQ event id, so redelivery is idempotent. A first poll, or a gap in HQ's sequence, rebuilds
// the World from HQ's snapshot instead (reset). Nothing here invents activity: every World event cites
// an HQ event or snapshot field.
import { SCHEMA_VERSION } from '../core/events.mjs';

const clip = (s, max = 480) => (typeof s === 'string' && s.length > max ? `${s.slice(0, max - 1)}…` : s ?? null);
const makeEvent = (id, type, at, fields) => ({ v: SCHEMA_VERSION, id, type, at, source: 'hq', ...fields });
const make = makeEvent;

// What an agent visibly does for a task, from the HQ operation's capability.
export function activityForCapability(capability = '') {
  if (/review/.test(capability)) return 'reviewing';
  if (/^(test|verify|security)/.test(capability)) return 'testing';
  if (/^(summarize|classify|extract|inspect|reason)/.test(capability)) return 'researching';
  if (/^(plan|coordinate)/.test(capability)) return 'thinking';
  return 'coding';
}
const ACTIVITY_EVENT = { coding: 'AGENT_STARTED_WORK', reviewing: 'AGENT_REVIEWING', testing: 'AGENT_TESTING', researching: 'AGENT_RESEARCHING', thinking: 'AGENT_THINKING' };
const LIVE = new Set(['CLAIMED', 'IMPLEMENTING', 'TESTING', 'REVIEW']);

function stageActivity(task) {
  if (!task || task.stage === 'CLAIMED') return 'thinking';
  if (task.stage === 'TESTING') return 'testing';
  if (task.stage === 'REVIEW') return 'reviewing';
  return activityForCapability(task.capability);
}
// HQ verified status -> World activity. UNKNOWN is shown as offline: HQ has no evidence the agent is there.
export function activityForStatus(agent, task) {
  switch (agent.status) {
    case 'RUNNING': return stageActivity(task);
    case 'IDLE': return 'idle';
    case 'STALLED': case 'BLOCKED': case 'RATE_LIMITED': return 'waiting';
    default: return 'offline';
  }
}
function issueFor(alert) {
  if (alert.kind === 'HANDOFF_READY') return null; // a completed cycle is good news, not an issue
  return {
    issueId: `hq-alert:${alert.key}`,
    title: clip(alert.ownerAction ?? alert.detail ?? alert.kind, 200),
    severity: alert.kind === 'ADAPTER_UNAVAILABLE' ? 'low' : alert.ownerMustAct ? 'high' : 'medium',
    location: alert.kind === 'VERIFICATION_FAILED' ? 'testing' : 'command',
    agentId: alert.agentId ?? undefined,
    taskId: alert.taskId ?? undefined,
    nextAction: clip(alert.ownerAction, 200) ?? undefined, // HQ's own required action, never a guess
    owner: alert.ownerMustAct === true || undefined, // needs Kyle, not just an agent
  };
}
const healthState = h => (h?.controller === 'ONLINE' ? 'ok' : h?.controller ? 'degraded' : 'unknown');
export function parseTestCounts(summary) {
  const m = /(\d+)\s+passed\D+(\d+)\s+failed/.exec(summary ?? '');
  return m ? { passed: Number(m[1]), failed: Number(m[2]) } : null;
}

export class HqTranslator {
  constructor() { this.seq = 0; this.runs = {}; this.tasks = {}; this.health = null; }

  // One HQ /api/state poll -> { reset, events }. On reset the caller replaces the World before applying.
  ingest(snap) {
    const newer = (snap.events ?? []).filter(e => e.seq > this.seq).sort((a, b) => a.seq - b.seq);
    const gap = this.seq === 0 || snap.seq < this.seq || (newer.length > 0 && newer[0].seq !== this.seq + 1);
    let out;
    if (gap) out = { reset: true, events: this.fromSnapshot(snap) };
    else {
      out = { reset: false, events: newer.flatMap(e => this.fromEvent(e)) };
      const state = healthState(snap.health);
      if (state !== this.health) out.events.push(make(`hq-health-${snap.seq}-${state}`, 'SYSTEM_STATUS', snap.now ?? Date.now(), { systemId: 'hq', state, detail: clip(snap.health?.lastError) }));
    }
    this.health = healthState(snap.health);
    this.seq = snap.seq;
    return out;
  }

  fromSnapshot(snap) {
    const at = snap.now ?? Date.now(), id = (...p) => `hq-s${snap.seq}-${p.join('-')}`, out = [];
    // Every event here restates HQ's current state; none of them happened now. `snapshot` keeps them out of the
    // activity feed, and HQ's own timestamps are used wherever HQ has them.
    const make = (eid, type, t, fields) => makeEvent(eid, type, t, { ...fields, snapshot: true });
    this.runs = {}; this.tasks = {};
    for (const [runId, r] of Object.entries(snap.runs ?? {})) this.runs[runId] = { taskId: r.taskId, agentId: r.agentId };
    for (const t of snap.tasks ?? []) this.tasks[t.id] = { capability: t.capability, operation: t.operation };
    out.push(make(id('hq'), 'SYSTEM_REGISTERED', at, { systemId: 'hq', name: 'HQ controller', kind: 'hq', state: healthState(snap.health) }));
    const tasksById = Object.fromEntries((snap.tasks ?? []).map(t => [t.id, t]));
    for (const a of snap.agents ?? []) {
      out.push(make(id('agent', a.id), 'AGENT_REGISTERED', at, {
        agentId: a.id, name: a.name, role: clip(a.role, 120), activity: activityForStatus(a, tasksById[a.assignment]),
        appearance: { real: a.real, fantasy: a.fantasy }, detail: clip(a.detail),
      }));
    }
    for (const t of snap.tasks ?? []) {
      out.push(make(id('task', t.id), 'TASK_CREATED', t.createdAt ?? at, { taskId: t.id, title: clip(t.title, 200), kind: t.operation }));
      const run = snap.runs?.[t.runId];
      const EV = { COMMIT: 'commit', PR: 'pr', TEST_RESULT: 'tests', REVIEW: 'review', HANDOFF: 'handoff', FINDING: 'finding' };
      (t.evidence ?? []).forEach((ev, i) => { if (EV[ev.kind]) out.push(make(id('ev', t.id, i), 'TASK_PROGRESS', ev.at ?? at, { taskId: t.id, detail: clip(ev.summary, 200), evidence: { kind: EV[ev.kind] } })); });
      if (LIVE.has(t.stage) && t.agentId && run && !run.endedAt) out.push(make(id('start', t.id), 'TASK_STARTED', t.claimedAt ?? at, { taskId: t.id, agentId: t.agentId, activity: stageActivity(t), progress: { kind: 'stage', stage: t.stage.toLowerCase() } }));
      else if (t.stage === 'DONE') out.push(make(id('done', t.id), 'TASK_COMPLETED', t.endedAt ?? at, { taskId: t.id }));
      else if (t.stage === 'BLOCKED') out.push(make(id('blocked', t.id), 'TASK_BLOCKED', t.endedAt ?? at, { taskId: t.id, detail: clip(t.blocker ?? t.ownerAction) }));
    }
    for (const alert of Object.values(snap.alerts ?? {})) {
      const issue = alert.active && issueFor(alert);
      if (issue) out.push(make(id('alert', alert.key), 'ISSUE_FOUND', alert.openedAt ?? at, issue));
    }
    return out;
  }

  fromEvent(e) {
    const d = e.data ?? {}, at = e.at, out = [];
    const push = (type, fields) => out.push(make(`hq-${e.id}-${out.length}`, type, at, fields));
    switch (e.type) {
      case 'AGENT_REGISTERED':
        push('AGENT_REGISTERED', { agentId: d.id, name: d.name, role: clip(d.role, 120), activity: 'offline', appearance: { real: d.real, fantasy: d.fantasy } });
        break;
      case 'AGENT_OBSERVED': {
        // HQ observes only unassigned agents, so an observation never interrupts a live run.
        const type = { IDLE: 'AGENT_IDLE', RATE_LIMITED: 'AGENT_WAITING' }[d.status] ?? 'AGENT_OFFLINE';
        push(type, { agentId: d.agentId, detail: clip(d.status === 'RATE_LIMITED' ? `Rate limited${d.retryAt ? ` until ${new Date(d.retryAt).toISOString()}` : ''}` : d.detail) });
        break;
      }
      case 'TASK_CREATED':
        this.tasks[d.id] = { capability: d.capability, operation: d.operation };
        push('TASK_CREATED', { taskId: d.id, title: clip(d.title, 200), kind: d.operation });
        if (d.safety === 'owner-required') push('TASK_BLOCKED', { taskId: d.id, detail: clip(d.ownerAction) });
        break;
      case 'DISPATCHED':
        this.runs[d.runId] = { taskId: d.taskId, agentId: d.agentId };
        push('TASK_STARTED', { taskId: d.taskId, agentId: d.agentId, activity: 'thinking', progress: { kind: 'stage', stage: 'claimed' } });
        break;
      case 'WORKER_EVENT': this.worker(d, push); break;
      case 'TASK_REQUEUED': push('TASK_QUEUED', { taskId: d.taskId }); break;
      case 'TASK_PARKED': push('TASK_BLOCKED', { taskId: d.taskId, detail: clip(d.reason) }); break;
      case 'ALERT_OPENED': { const issue = issueFor(d); if (issue) push('ISSUE_FOUND', issue); break; }
      case 'ALERT_RESOLVED': push('ISSUE_RESOLVED', { issueId: `hq-alert:${d.key}` }); break;
      default: break; // configuration, acknowledgements and notification delivery have no visible World effect
    }
    return out;
  }

  worker(d, push) {
    const run = this.runs[d.runId];
    if (!run) return; // run from before our window; the next reset snapshot covers it
    const { taskId, agentId } = run, task = this.tasks[taskId] ?? {}, summary = clip(d.summary);
    switch (d.kind) {
      case 'ACK': {
        const activity = activityForCapability(task.capability);
        push(ACTIVITY_EVENT[activity], { agentId, taskId, detail: summary });
        push('TASK_PROGRESS', { taskId, progress: { kind: 'stage', stage: 'working' }, detail: summary });
        break;
      }
      case 'TEST_STARTED': push('AGENT_TESTING', { agentId, taskId, detail: summary }); push('TESTS_STARTED', { runId: `hq-${d.runId}`, agentId, taskId, suite: task.operation }); break;
      case 'TEST_PROGRESS': push('TASK_PROGRESS', { taskId, progress: { kind: 'stage', stage: `${d.completedTests} tests run` }, detail: summary }); break;
      case 'TEST_RESULT': {
        const counts = parseTestCounts(d.summary);
        // Without counts HQ still knows pass/fail; report 0/1 failing rather than invent totals.
        push('TESTS_FINISHED', { runId: `hq-${d.runId}`, passed: counts?.passed ?? 0, failed: counts?.failed ?? (d.result === 'failed' ? 1 : 0), agentId, taskId, failing: d.result === 'failed' && summary ? [summary] : undefined });
        break;
      }
      case 'REVIEW': push('AGENT_REVIEWING', { agentId, taskId, detail: summary }); push('TASK_PROGRESS', { taskId, detail: summary, evidence: { kind: 'review' } }); break;
      case 'PR': push('PR_CREATED', { prId: d.url ?? `hq-pr-${d.runId}`, title: summary ?? 'Pull request', url: d.url ?? undefined, agentId, taskId }); break;
      case 'HANDOFF':
        if (d.toAgentId) push('AGENT_MESSAGE', { agentId, toAgentId: d.toAgentId, taskId, summary });
        else push('TASK_PROGRESS', { taskId, detail: summary, evidence: { kind: 'handoff' } });
        break;
      case 'COMMIT': push('TASK_PROGRESS', { taskId, detail: summary, evidence: { kind: 'commit', ref: clip(d.sha ?? d.url, 80) ?? undefined } }); break;
      case 'FINDING': push('TASK_PROGRESS', { taskId, detail: summary, evidence: { kind: 'finding' } }); break;
      case 'MODEL_OUTPUT': push('TASK_PROGRESS', { taskId, detail: summary }); break;
      case 'MODEL_RESULT': push('TASK_PROGRESS', { taskId, progress: { kind: 'stage', stage: 'answer ready' }, detail: clip(d.summary, 200) }); break;
      case 'COMPLETED': push('TASK_COMPLETED', { taskId, detail: summary }); break;
      case 'FAILED': case 'CANCELLED': push('TASK_FAILED', { taskId, detail: summary }); break;
      case 'BLOCKED': push('TASK_BLOCKED', { taskId, detail: summary }); break;
      case 'RATE_LIMITED':
        push('TASK_BLOCKED', { taskId, detail: summary });
        push('AGENT_WAITING', { agentId, detail: clip(`Rate limited${d.retryAt ? ` until ${new Date(d.retryAt).toISOString()}` : ''}`) });
        break;
      case 'UNCERTAIN': push('TASK_BLOCKED', { taskId, detail: summary }); push('AGENT_ERROR', { agentId, taskId, detail: summary }); break;
      default: break; // HEARTBEAT, USAGE: liveness and counters, not visible activity
    }
  }
}
