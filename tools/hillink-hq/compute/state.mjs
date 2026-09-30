// Pass 4 compute journal: what compute every run used, what Kyle authorized, and what was blocked or waited. A pure
// reducer over HQ's one journal (like Pass 3's objectives), so a restart rebuilds modes, authorizations,
// reservations and the ledger exactly; nothing about spending lives only in memory.
import { authorizationUsage } from './policy.mjs';

export const COMPUTE_EVENTS = new Set(['COMPUTE_MODE', 'SPEND_APPROVAL_REQUIRED', 'WAITING_FOR_CAPACITY', 'SPEND_AUTHORIZED', 'SPEND_REVOKED', 'BUDGET_EXHAUSTED']);
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED']);

export function emptyCompute() { return { mode: null, modeHistory: [], runs: {}, authorizations: {}, blocked: {}, exhausted: {} }; }

export function reduceCompute(state, event) {
  const { type, data: d, at } = event;
  const c = (state.compute ??= emptyCompute());
  switch (type) {
    case 'COMPUTE_MODE': c.mode = d.mode; c.modeHistory.push({ at, mode: d.mode, source: d.source, warning: d.warning ?? null }); break;
    // The compute selection is part of the DISPATCHED event itself, so a run and its compute record (and any spend
    // reservation) are journaled atomically: there is no crash window where one exists without the other.
    case 'DISPATCHED': {
      const s = d.compute; if (!s) break; // journals from before Pass 4 carry no compute record
      c.runs[d.runId] = { runId: d.runId, taskId: d.taskId, agentId: d.agentId, operation: s.operation, adapterId: s.adapterId, computeClass: s.computeClass, provider: s.provider, backend: s.backend, model: s.model ?? null, authorizationId: s.authorizationId ?? null, reservedUsd: s.reservedUsd ?? 0, mode: s.mode, startedAt: at, endedAt: null, outcome: null, meteredCostUsd: s.computeClass === 'METERED_API' ? null : 0, reportedCostUsd: null, costSource: s.computeClass === 'METERED_API' ? 'unknown' : 'not metered' };
      if (state.tasks[d.taskId]) delete state.tasks[d.taskId].waitingFor;
      break;
    }
    case 'SPEND_APPROVAL_REQUIRED': {
      // Task-level (the engine refused a dispatch) or objective-level (the conductor stopped before creating work).
      const t = d.taskId ? state.tasks[d.taskId] : null;
      c.blocked[d.taskId ?? `objective:${d.objectiveId}:${d.stepId}`] = { ...d, at };
      if (t) Object.assign(t, { stage: 'BLOCKED', blocker: `${d.code}: ${d.reason}`, ownerAction: d.ownerAction, recoveryPending: false, spendBlocked: true, endedAt: at });
      break;
    }
    case 'WAITING_FOR_CAPACITY': { const t = state.tasks[d.taskId]; if (t) t.waitingFor = { agentId: d.agentId, capacity: d.capacity, retryAt: d.retryAt ?? null, at }; break; }
    case 'SPEND_AUTHORIZED': c.authorizations[d.id] = { id: d.id, by: d.by, amountUsd: d.amountUsd, scope: d.scope, oneTime: d.oneTime, expiresAt: d.expiresAt, note: d.note, createdAt: at, revokedAt: null, revokedBy: null }; break;
    case 'SPEND_REVOKED': { const a = c.authorizations[d.id]; if (a && !a.revokedAt) Object.assign(a, { revokedAt: at, revokedBy: d.by, revokeReason: d.reason ?? null }); break; }
    case 'BUDGET_EXHAUSTED': c.exhausted[d.authorizationId] = at; break;
    case 'WORKER_EVENT': {
      const r = c.runs[d.runId]; if (!r) break;
      // A metered run's cost is what the provider's own stream reported (Claude Code's result, OpenAI's usage counters
      // do not include a price). A subscription run's CLI "cost" is an estimate of API-equivalent value, not a charge.
      if (d.kind === 'USAGE') {
        const reported = Number.isFinite(d.usage?.reportedCostUsd) ? d.usage.reportedCostUsd : null;
        r.reportedCostUsd = reported;
        if (r.computeClass === 'METERED_API' && reported != null && reported >= 0) { r.meteredCostUsd = reported; r.costSource = 'provider-reported'; }
        if (d.usage?.model && !r.model) r.model = String(d.usage.model).slice(0, 80);
      }
      if (TERMINAL.has(d.kind) && r.endedAt == null) { r.endedAt = at; r.outcome = d.kind; }
      break;
    }
    case 'TASK_CANCELLED': break;
    default: break;
  }
  return state;
}

// Ledger rows and aggregates. Days and months are UTC. Unknown metered costs stay unknown (null) in the rows and are
// counted at their reservation in `meteredSpendUpperBound`, never silently as $0.
export function computeLedger(state, { now, taskId = null } = {}) {
  const runs = Object.values(state.compute?.runs ?? {});
  const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7);
  const rows = runs.map(r => ({ task: r.taskId, run: r.runId, agent: r.agentId, model: r.model, backend: r.backend, computeClass: r.computeClass, provider: r.provider, start: r.startedAt, end: r.endedAt, outcome: r.outcome ?? 'RUNNING', meteredCostUsd: r.computeClass === 'METERED_API' ? r.meteredCostUsd : 0, costKnown: r.computeClass !== 'METERED_API' || r.meteredCostUsd != null, spendAuthorized: Boolean(r.authorizationId), authorizationId: r.authorizationId, reservedUsd: r.reservedUsd }));
  const sum = list => {
    const metered = list.filter(r => r.computeClass === 'METERED_API');
    const known = metered.filter(r => r.costKnown).reduce((s, r) => s + r.meteredCostUsd, 0);
    const unknown = metered.filter(r => !r.costKnown);
    return { meteredUsd: Math.round(known * 1e6) / 1e6, unknownCostRuns: unknown.length, upperBoundUsd: Math.round((known + unknown.reduce((s, r) => s + r.reservedUsd, 0)) * 1e6) / 1e6, meteredRuns: metered.length, runs: list.length };
  };
  const today = sum(rows.filter(r => new Date(r.start).toISOString().slice(0, 10) === day));
  const thisMonth = sum(rows.filter(r => new Date(r.start).toISOString().slice(0, 7) === month));
  const task = taskId ? sum(rows.filter(r => r.task === taskId)) : null;
  const byClass = Object.fromEntries(['LOCAL', 'SUBSCRIPTION', 'METERED_API'].map(k => [k, rows.filter(r => r.computeClass === k).length]));
  const authorizations = Object.values(state.compute?.authorizations ?? {}).map(a => ({ ...a, ...authorizationUsage(state, a.id), expired: now >= a.expiresAt }));
  return {
    mode: state.compute?.mode ?? null,
    meteredSpendToday: today.meteredUsd, meteredSpendThisMonth: thisMonth.meteredUsd, meteredSpendThisTask: task ? task.meteredUsd : null,
    unknownCostRunsToday: today.unknownCostRuns, meteredSpendUpperBoundToday: today.upperBoundUsd, meteredSpendUpperBoundThisMonth: thisMonth.upperBoundUsd,
    runsByClass: byClass, rows: rows.slice(-200), authorizations,
  };
}
