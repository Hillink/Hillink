// Pass 1 trust boundary: what an agent is allowed to look like, derived from authoritative runtime facts.
//
// Ownership of truth, in order:
//   1. HQ (tools/hillink-hq) owns agent runtime status. Its agentStatus() only reports RUNNING for a run
//      that was acknowledged, is heartbeating and is making progress; it owns stall, offline and rate-limit
//      detection too. The World never re-derives those rules.
//   2. adapters/hq.mjs copies HQ's per-agent facts into an AGENT_RUNTIME event (a.runtime) on every poll
//      where they change.
//   3. deriveAgentState() below turns a.runtime (plus whether HQ is reachable) into one canonical state
//      and a human-readable reason. Nothing else decides WORKING.
//   4. The reducer clamps a.activity (what the renderer animates) to that state, so an event, a stale
//      animation or a button click can never make an agent look productive without a verified run.
// Agents with no runtime (the dev simulator's) keep their event-driven activity; the page labels them SIMULATION.

import { canWork } from './agents.mjs';

export const AGENT_STATES = ['WORKING', 'STARTING', 'IDLE', 'WAITING', 'NEEDS_ATTENTION', 'FAILED', 'OFFLINE', 'NOT_CONNECTED', 'UNKNOWN'];
export const STATE_LABEL = {
  WORKING: 'Working', STARTING: 'Starting', IDLE: 'Idle', WAITING: 'Waiting', NEEDS_ATTENTION: 'Needs attention',
  FAILED: 'Failed', OFFLINE: 'Offline', NOT_CONNECTED: 'Not connected', UNKNOWN: 'Unknown',
};
// Activities the renderer draws as real work (desk, bench, review station). Only WORKING may show them.
export const PRODUCTIVE_ACTIVITIES = new Set(['coding', 'thinking', 'researching', 'reviewing', 'testing', 'communicating', 'coordinating']);

const when = at => (Number.isFinite(at) ? new Date(at).toISOString() : 'unknown time');

// Canonical state for one agent. Pure: reads the World, returns { state, reason, taskId, runId, basis }.
export function deriveAgentState(world, a) {
  const r = a?.runtime;
  if (!r) {
    // No runtime report: simulated, or registered before HQ's first report. Describe the events honestly.
    const act = a?.activity ?? 'offline';
    const state = PRODUCTIVE_ACTIVITIES.has(act) ? 'WORKING' : act === 'waiting' ? 'WAITING' : act === 'error' ? 'FAILED' : act === 'offline' ? 'OFFLINE' : 'IDLE';
    return { state, reason: a?.source === 'sim' ? 'Simulated event (not real activity).' : 'No runtime report yet.', taskId: a?.taskId ?? null, runId: null, basis: a?.source === 'sim' ? 'simulation' : 'events' };
  }
  const base = { taskId: r.taskId ?? null, runId: r.runId ?? null, basis: 'hq' };
  const hq = world.systems?.hq;
  if (hq && hq.state === 'down') return { ...base, state: 'UNKNOWN', reason: `HQ is unreachable, so nothing about this agent is verified. Last HQ report: ${when(r.observedAt)}.` };
  if (!r.connected) return { ...base, state: 'NOT_CONNECTED', reason: r.detail || 'HQ has no execution adapter connected for this agent, so it cannot run work.' };
  switch (r.status) {
    case 'RUNNING': return { ...base, state: 'WORKING', reason: `HQ run ${r.runId} was acknowledged by the agent and is heartbeating (last heartbeat ${when(r.heartbeatAt)}).` };
    case 'STALLED': return { ...base, state: 'NEEDS_ATTENTION', reason: `HQ run ${r.runId} stopped reporting progress. HQ will diagnose it; check the task.` };
    case 'BLOCKED': return { ...base, state: 'WAITING', reason: 'The assigned task is blocked in HQ.' };
    case 'RATE_LIMITED': return { ...base, state: 'WAITING', reason: `Rate limited by the provider${r.retryAt ? ` until ${when(r.retryAt)}` : ''}.` };
    case 'OFFLINE': return { ...base, state: 'OFFLINE', reason: r.detail || 'HQ reports this agent offline.' };
    case 'UNKNOWN':
      if (r.runId) return { ...base, state: 'STARTING', reason: `HQ dispatched run ${r.runId}; waiting for the agent to acknowledge it.` };
      return { ...base, state: 'UNKNOWN', reason: r.detail || 'HQ has no fresh observation of this agent.' };
    case 'IDLE': {
      // Available, but it may be waiting on work it asked for (Pass 2.5): Kyle's decision first, then other agents.
      // Both come from HQ tasks that record requestedBy = this agent, never from what the agent said.
      const ask = r.approvals?.[0];
      if (ask) return { ...base, taskId: ask.taskId, state: 'NEEDS_ATTENTION', reason: `Waiting for Kyle to decide: ${ask.title} (HQ task ${ask.taskId.slice(0, 8)}).` };
      const dep = r.waitingOn?.[0];
      if (dep) return { ...base, taskId: dep.taskId, state: 'WAITING', reason: `Waiting for ${dep.agentName ?? dep.agentId ?? 'an agent'} task ${dep.taskId.slice(0, 8)} (${dep.stage.toLowerCase()}): ${dep.title}${r.waitingOn.length > 1 ? `, and ${r.waitingOn.length - 1} more` : ''}.` };
      // What happened to its most recent task decides whether someone must look at it.
      const last = r.last;
      if (last?.stage === 'FAILED' || (last?.stage === 'BLOCKED' && last.terminal === 'FAILED')) return { ...base, taskId: last.taskId, state: 'FAILED', reason: `Its last task failed${last.detail ? `: ${last.detail}` : '.'}` };
      if (last?.stage === 'BLOCKED') return { ...base, taskId: last.taskId, state: 'NEEDS_ATTENTION', reason: `Its last task is parked in HQ${last.detail ? `: ${last.detail}` : '.'}` };
      return { ...base, state: 'IDLE', reason: 'Available with no active run in HQ.' };
    }
    default: return { ...base, state: 'UNKNOWN', reason: `HQ reported an unrecognised status (${r.status}).` };
  }
}

// What the body may animate in a given state. `current` is the event-driven activity.
export function allowedActivity(state, current, runtimeActivity) {
  switch (state) {
    case 'WORKING': return PRODUCTIVE_ACTIVITIES.has(current) ? current : runtimeActivity || 'thinking';
    case 'IDLE': return current === 'completed' ? 'completed' : 'idle'; // a just-finished job may still celebrate
    case 'STARTING': return PRODUCTIVE_ACTIVITIES.has(current) ? 'idle' : current === 'completed' || current === 'error' ? 'idle' : current;
    case 'WAITING': case 'NEEDS_ATTENTION': return 'waiting';
    case 'FAILED': return 'error';
    default: return 'offline'; // OFFLINE, NOT_CONNECTED, UNKNOWN: no invented activity
  }
}

const TRANSITION_LIMIT = 12;
// Reducer hook: re-derive and clamp every HQ-backed agent. Returns ids whose state or activity changed.
export function reconcileAgents(world, at, setActivity) {
  const changed = [];
  for (const a of Object.values(world.agents)) {
    if (!a.runtime) continue;
    const truth = deriveAgentState(world, a), prev = a.truth;
    const activity = allowedActivity(truth.state, a.activity, a.runtime.activity);
    const moved = !prev || prev.state !== truth.state || prev.reason !== truth.reason || prev.taskId !== truth.taskId;
    if (moved) {
      a.transitions ??= [];
      if (!prev || prev.state !== truth.state) {
        a.transitions.push({ from: prev?.state ?? null, to: truth.state, at, reason: truth.reason, taskId: truth.taskId, runId: truth.runId });
        if (a.transitions.length > TRANSITION_LIMIT) a.transitions.shift();
      }
      a.truth = { ...truth, since: !prev || prev.state !== truth.state ? at : prev.since };
    }
    // 5E correction (B2): runtime facts never give work or activity to an agent that is not a working member.
    if (!canWork(a)) { if (moved) changed.push(a.id); continue; }
    // Pass 5F (found by the live Living HQ test): HQ's runtime report is per poll, but a task's end arrives as an event
    // in the same poll just before it. A report that still says WORKING on a task the World already saw end is stale:
    // it must not pull the agent back to work (and so skip the finish walk to the archive). The next report settles it.
    if (truth.state === 'WORKING' && truth.taskId && ['done', 'failed'].includes(world.tasks[truth.taskId]?.status)) { if (moved) changed.push(a.id); continue; }
    if (truth.state !== 'WORKING' && a.taskId && truth.taskId !== a.taskId && !['WAITING', 'NEEDS_ATTENTION'].includes(truth.state)) a.taskId = null;
    if (truth.state === 'WORKING' && truth.taskId) a.taskId = truth.taskId;
    if (activity !== a.activity) { setActivity(a, activity, { type: 'AGENT_RUNTIME', at, detail: truth.reason, source: 'hq' }); changed.push(a.id); }
    else if (moved) changed.push(a.id);
  }
  return changed;
}

// Observability: why does the World show this agent the way it does? (window.hillinkWorld.why('claude'))
export function explainAgent(world, id) {
  const a = world.agents[id]; if (!a) return null;
  const truth = a.truth ?? deriveAgentState(world, a);
  return { agent: id, state: truth.state, reason: truth.reason, basis: truth.basis, since: truth.since ?? null, activity: a.activity, taskId: truth.taskId ?? a.taskId ?? null, runId: truth.runId ?? null, runtime: a.runtime ?? null, transitions: a.transitions ?? [] };
}
