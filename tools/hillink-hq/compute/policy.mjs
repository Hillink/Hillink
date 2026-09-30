// Pass 4: zero-credit compute policy. Every HQ dispatch passes through decideCompute() before any process starts or
// any request leaves the machine. The decision is deterministic (no model call decides whether a model call costs
// money) and is made only from HQ's own wiring and journal, never from agent or task text.
//
// Core invariant: NO VALID KYLE SPEND AUTHORIZATION = NO METERED AI REQUEST.
//   - METERED_API routes need a mode that permits them (BUDGETED) AND a live, matching, unexhausted authorization that
//     Kyle created through HQ's owner API. ZERO_CREDIT_MODE (the default) forbids them outright; no authorization,
//     agent, fallback or restart overrides it.
//   - The engine hands a metered adapter a one-shot grant object (issueGrant). Metered adapters refuse to start
//     without redeeming one (redeemGrant), so calling an adapter directly, around the engine, sends nothing.
//   - A route HQ cannot classify is treated as METERED_API (fail closed).
import { routeFor } from './registry.mjs';

export const COMPUTE_CLASSES = ['LOCAL', 'SUBSCRIPTION', 'METERED_API'];
const RANK = { LOCAL: 0, SUBSCRIPTION: 1, METERED_API: 2 };
export const classRank = c => RANK[c] ?? 2;

// ZERO_CREDIT: LOCAL + SUBSCRIPTION only. BUDGETED: METERED_API also, but only with a matching Kyle authorization.
// UNRESTRICTED is deliberately not implemented: asking for it falls back to ZERO_CREDIT with a warning.
export const MODES = ['ZERO_CREDIT', 'BUDGETED'];
export const DEFAULT_MODE = 'ZERO_CREDIT';
export function resolveMode(value) {
  const v = String(value ?? '').trim().toUpperCase().replace(/_MODE$/, '');
  if (!v) return { mode: DEFAULT_MODE, warning: null };
  if (MODES.includes(v)) return { mode: v, warning: null };
  return { mode: DEFAULT_MODE, warning: `HQ_COMPUTE_MODE=${String(value).slice(0, 40)} is not supported (only ${MODES.join(', ')}); running ZERO_CREDIT.` };
}

// Capacity, from HQ's verified status and the evidence of the agent's last run. Never inferred from a guess about
// remaining quota: nothing HQ can query reports it, so a healthy subscription agent is AVAILABLE with quota UNKNOWN.
export const CAPACITY = ['AVAILABLE', 'BUSY', 'RATE_LIMITED', 'SUBSCRIPTION_LIMIT_REACHED', 'AUTH_REQUIRED', 'UNAVAILABLE', 'UNKNOWN'];
export function capacityOf(agent, status, { connected = true, route = null } = {}) {
  if (!connected) return 'UNAVAILABLE';
  if (agent.assignment || status === 'RUNNING') return 'BUSY';
  if (status === 'RATE_LIMITED') return agent.capacityState === 'SUBSCRIPTION_LIMIT_REACHED' ? 'SUBSCRIPTION_LIMIT_REACHED' : 'RATE_LIMITED';
  if (/^AUTH_REQUIRED/.test(agent.detail ?? '')) return 'AUTH_REQUIRED';
  if (status === 'IDLE') return 'AVAILABLE';
  if (status === 'OFFLINE') return 'UNAVAILABLE';
  return 'UNKNOWN';
}

// ---- spend authorization ------------------------------------------------------------------------------------------
export const AUTH_LIMITS = { maxAmountUsd: 25, maxMinutes: 7 * 24 * 60, maxUnscopedMinutes: 24 * 60 };
const AUTH_KEYS = new Set(['amountUsd', 'expiresInMinutes', 'taskId', 'objectiveId', 'provider', 'agentId', 'oneTime', 'note']);
const id = (v, max = 80) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && v.length <= max;
// Validates Kyle's request. Throws on anything malformed: negative, zero, NaN, Infinity, string or oversized amounts,
// missing or unbounded expiry, unknown fields. Default is $0 because nothing exists until this succeeds.
export function validateSpendAuthorization(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Spend authorization must be an object.');
  const unknown = Object.keys(input).filter(k => !AUTH_KEYS.has(k));
  if (unknown.length) throw Error(`Unknown spend authorization field(s): ${unknown.join(', ').slice(0, 120)}.`);
  const a = input.amountUsd;
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) throw Error('amountUsd must be a positive finite number of dollars.');
  if (a > AUTH_LIMITS.maxAmountUsd) throw Error(`amountUsd is capped at $${AUTH_LIMITS.maxAmountUsd} per authorization (no unlimited budgets).`);
  if (Math.round(a * 100) !== a * 100) throw Error('amountUsd has at most two decimals.');
  const m = input.expiresInMinutes;
  if (!Number.isInteger(m) || m < 1 || m > AUTH_LIMITS.maxMinutes) throw Error(`expiresInMinutes must be a whole number from 1 to ${AUTH_LIMITS.maxMinutes}.`);
  for (const k of ['taskId', 'objectiveId', 'agentId']) if (input[k] != null && !id(input[k])) throw Error(`Invalid ${k}.`);
  if (input.provider != null && !['anthropic', 'openai'].includes(input.provider)) throw Error('provider must be anthropic or openai.');
  if (input.oneTime != null && typeof input.oneTime !== 'boolean') throw Error('oneTime must be true or false.');
  if (input.note != null && (typeof input.note !== 'string' || input.note.length > 300)) throw Error('note is at most 300 characters.');
  const scoped = input.taskId || input.objectiveId || input.provider || input.agentId;
  if (!scoped && m > AUTH_LIMITS.maxUnscopedMinutes) throw Error('An authorization with no task, objective, provider or agent scope may last at most 24 hours.');
  return { amountUsd: a, expiresAt: now + m * 60_000, scope: { taskId: input.taskId ?? null, objectiveId: input.objectiveId ?? null, provider: input.provider ?? null, agentId: input.agentId ?? null }, oneTime: input.oneTime === true, note: input.note ?? null };
}

// What an authorization has consumed. A finished metered run counts its measured cost when the provider reported one,
// otherwise its full reservation (an unknown cost is never assumed to be zero). A live run counts its reservation.
export function authorizationUsage(state, authId) {
  let committed = 0, reserved = 0, runs = 0;
  for (const c of Object.values(state.compute?.runs ?? {})) {
    if (c.authorizationId !== authId) continue;
    runs += 1;
    if (c.endedAt == null) reserved += c.reservedUsd;
    // A negative, NaN or missing figure is not a measurement: the full reservation counts.
    else committed += Number.isFinite(c.meteredCostUsd) && c.meteredCostUsd >= 0 ? c.meteredCostUsd : c.reservedUsd;
  }
  return { committed: round(committed), reserved: round(reserved), runs };
}
const round = v => Math.round(v * 1e6) / 1e6;
export function authorizationStatus(state, auth, now) {
  if (auth.revokedAt) return { valid: false, reason: 'revoked' };
  if (now >= auth.expiresAt) return { valid: false, reason: 'expired' };
  const u = authorizationUsage(state, auth.id);
  if (auth.oneTime && u.runs > 0) return { valid: false, reason: 'one-time authorization already used', ...u };
  const available = round(auth.amountUsd - u.committed - u.reserved);
  if (available <= 0) return { valid: false, reason: 'exhausted', available: 0, ...u };
  return { valid: true, available, ...u };
}
function matchAuthorization(state, { task, agentId, route, now }) {
  const tried = [];
  for (const auth of Object.values(state.compute?.authorizations ?? {})) {
    const s = authorizationStatus(state, auth, now);
    const scope = auth.scope;
    const why = !s.valid ? s.reason
      : scope.taskId && scope.taskId !== task.id ? 'scoped to a different task'
      : scope.objectiveId && scope.objectiveId !== task.link?.objectiveId ? 'scoped to a different objective'
      : scope.provider && scope.provider !== route.provider ? `scoped to provider ${scope.provider}`
      : scope.agentId && scope.agentId !== agentId ? `scoped to agent ${scope.agentId}`
      : s.available < route.perRunCapUsd ? `only $${s.available.toFixed(2)} left; this run reserves up to $${route.perRunCapUsd.toFixed(2)}`
      : null;
    if (!why) return { auth, tried };
    tried.push({ id: auth.id, why });
  }
  return { auth: null, tried };
}

// ---- the gate -----------------------------------------------------------------------------------------------------
// Returns { allowed: true, route, authorizationId?, reservedUsd } or { allowed: false, code, route, ...facts }.
export function decideCompute({ state, task, agentId, adapterId, mode, now }) {
  const route = routeFor(adapterId, task.operation);
  if (route.computeClass !== 'METERED_API') return { allowed: true, route, reservedUsd: 0 };
  const base = { allowed: false, route, provider: route.provider, agentId, backend: route.backend, why: route.why, estimatedCostUsd: null, maxCostUsd: route.perRunCapUsd ?? null, alternatives: route.alternatives ?? [], waitingWouldHelp: route.waitingWouldHelp ?? false, mode };
  if (mode !== 'BUDGETED') return { ...base, code: 'BLOCKED_REQUIRES_SPEND_APPROVAL', reason: `${route.provider} metered API (${route.backend}) is forbidden in ${mode} mode. Nothing ran.` };
  if (!Number.isFinite(route.perRunCapUsd) || route.perRunCapUsd <= 0) return { ...base, code: 'BLOCKED_REQUIRES_SPEND_APPROVAL', reason: 'This route has no enforceable per-run cost cap, so no authorization can cover it.' };
  const { auth, tried } = matchAuthorization(state, { task, agentId, route, now });
  if (!auth) return { ...base, code: 'BLOCKED_REQUIRES_SPEND_APPROVAL', reason: tried.length ? `No usable Kyle spend authorization: ${tried.map(t => `${t.id.slice(0, 8)} ${t.why}`).join('; ').slice(0, 500)}.` : 'No Kyle spend authorization exists. Default metered budget is $0.' };
  return { allowed: true, route, authorizationId: auth.id, reservedUsd: route.perRunCapUsd };
}

// One-shot capability objects. Only the engine issues them, right after journaling COMPUTE_SELECTED; a metered
// adapter redeems exactly one per run. A plain object with the same fields is not a grant.
const issued = new WeakSet(), redeemed = new WeakSet();
export function issueGrant({ taskId, runId, route, authorizationId = null, reservedUsd = 0 }) {
  const grant = Object.freeze({ taskId, runId, computeClass: route.computeClass, provider: route.provider, adapterId: route.adapterId, authorizationId, reservedUsd });
  issued.add(grant);
  return grant;
}
export function redeemGrant(grant, { taskId, runId }) {
  if (!grant || !issued.has(grant)) throw Error('Refusing metered request: no HQ compute grant (NO VALID KYLE SPEND AUTHORIZATION = NO METERED AI REQUEST).');
  if (redeemed.has(grant)) throw Error('Refusing metered request: this compute grant was already used.');
  if (grant.taskId !== taskId || grant.runId !== runId) throw Error('Refusing metered request: the compute grant belongs to a different run.');
  if (grant.computeClass === 'METERED_API' && !grant.authorizationId) throw Error('Refusing metered request: the grant carries no spend authorization.');
  redeemed.add(grant);
  return grant;
}
