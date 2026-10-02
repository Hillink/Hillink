// Pass 3 policy: decided in code, never by a model. What an objective may be, how risky it is, which approval
// gates it hits, whether implementation is eligible, what review independence it needs, and the hard budgets
// that stop loops. ChatGPT supplies an objective; HQ decides everything below from it.
import { checkPath, validateImplementation } from '../implementation-policy.mjs';

export const TASK_TYPES = ['investigate', 'review', 'fix', 'implement'];
// Actions that always need Kyle. HQ has no operation that performs any of them; approval records Kyle's decision.
export const APPROVAL_GATES = {
  merge: 'Merging a branch changes the shared code line; only Kyle merges.',
  deploy: 'Deploying changes what users run; only Kyle deploys.',
  'production-change': 'Changes to production systems need Kyle.',
  'database-change': 'Production database changes need Kyle.',
  destructive: 'Destructive operations (deleting data, history or files) need Kyle.',
  'credential-change': 'Credentials and secrets are Kyle-only.',
  'security-policy-change': 'HQ security policy, sandbox and permission changes are Kyle-only.',
  spend: 'Spending above the objective budget needs Kyle.',
  'architecture-change': 'Broad architectural changes with product consequences need Kyle.',
};
export const GATE_NAMES = Object.keys(APPROVAL_GATES);
// Gates that must be cleared before any work starts; the rest (merge, deploy) are the last step after verified work.
export const PRE_WORK_GATES = new Set(['production-change', 'database-change', 'destructive', 'credential-change', 'security-policy-change', 'architecture-change']);
export const POST_WORK_GATES = new Set(['merge', 'deploy']);

// Text signals HQ uses to raise gates and risk even if the submitter did not declare them. Over-triggering is the
// safe direction: a false positive costs Kyle one approval, a false negative could cost production.
const GATE_SIGNALS = [
  ['merge', /\b(merge|merging)\b.*\b(pr|pull request|branch|main|master)\b|\bmerge (it|this|the)\b/i],
  ['deploy', /\b(deploy|deployment|release to|ship to (prod|production)|vercel --prod|promote)\b/i],
  ['production-change', /\b(production|prod)\b(?!uct)/i],
  ['database-change', /\b(migration|migrate|drop table|alter table|truncate|supabase db|database schema|prod(uction)? (db|database))\b/i],
  ['destructive', /\b(delete|remove|wipe|purge|drop|force[- ]push|reset --hard|rm -rf|erase)\b.*\b(data|history|branch|table|records?|files?|users?|repo)\b/i],
  ['credential-change', /\b(api[_ -]?key|secret|credential|password|token|oauth|ssh key|rotate)\b/i],
  ['security-policy-change', /\b(sandbox|permission model|allowlist|security policy|disable (the )?(check|guard|scope|sandbox)|bypass)\b/i],
  ['architecture-change', /\b(rewrite|re-architect|rearchitect|migrate (the )?(framework|stack)|replace (the )?(framework|database|auth))\b/i],
];
const HIGH_RISK_AREAS = /^(app\/api\/|lib\/(supabase|stripe|auth|payments?)|middleware|supabase\/|scripts\/)/i;
const LOW_RISK_AREAS = /^(sandbox\/|docs\/|tools\/hillink-world\/|tests\/)/i;
// Narrower than LOW_RISK_AREAS on purpose: only the World tree is exempt from the breadth heuristic, so broad
// docs/ or tests/ scopes keep raising architecture-change.
const ISOLATED_STAGING = /^tools\/hillink-world\//i;

export const DEFAULT_LIMITS = { maxSteps: 12, maxAgentCalls: 10, maxRetries: 4, maxRepairs: 1, maxRebuttals: 1, maxSpendUsd: 2, deadlineMs: 3 * 60 * 60_000, maxActiveObjectives: 3, evidenceWaitMs: 2 * 60 * 60_000 };

const str = (v, name, max, { optional = false } = {}) => {
  if (v == null || v === '') { if (optional) return null; throw Error(`${name} is required`); }
  if (typeof v !== 'string' || !v.trim()) throw Error(`${name} must be a non-empty string`);
  if (v.length > max) throw Error(`${name} is longer than ${max} characters`);
  return v.trim();
};
const paths = (v, name, max, kind) => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max) throw Error(`${name} must be a list of at most ${max} paths`);
  return [...new Set(v.map(p => checkPath(p, { kind })))];
};

// The only shape an objective can have. Unknown fields are refused, so nothing unvalidated reaches the planner.
export function validateObjectiveInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Objective must be an object');
  const allowed = ['objective', 'type', 'system', 'scope', 'tests', 'acceptanceCriteria', 'constraints', 'requestedActions', 'title'];
  for (const k of Object.keys(input)) if (!allowed.includes(k)) throw Error(`Unexpected objective field "${String(k).slice(0, 40)}"`);
  const objective = str(input.objective, 'objective', 2000);
  const type = input.type ?? 'fix';
  if (!TASK_TYPES.includes(type)) throw Error(`type must be one of ${TASK_TYPES.join(', ')}`);
  const requestedActions = input.requestedActions ?? [];
  if (!Array.isArray(requestedActions) || requestedActions.length > GATE_NAMES.length || requestedActions.some(a => !GATE_NAMES.includes(a))) throw Error(`requestedActions must be drawn from ${GATE_NAMES.join(', ')}`);
  const out = {
    title: str(input.title, 'title', 160, { optional: true }) ?? objective.replace(/\s+/g, ' ').slice(0, 120),
    objective, type,
    system: str(input.system, 'system', 120, { optional: true }),
    scope: paths(input.scope, 'scope', 5, 'scope'),
    tests: paths(input.tests, 'tests', 3, 'test'),
    acceptanceCriteria: str(input.acceptanceCriteria, 'acceptance criteria', 1200, { optional: true }),
    constraints: str(input.constraints, 'constraints', 1200, { optional: true }),
    requestedActions: [...new Set(requestedActions)],
  };
  if (type === 'implement') {
    // A direct implementation objective must already be a complete, valid Pass 2.6 contract.
    validateImplementation({ objective, scope: out.scope, tests: out.tests, acceptanceCriteria: out.acceptanceCriteria, constraints: out.constraints });
  }
  return out;
}

// Gates from declared actions plus text signals in the objective, criteria and constraints.
export function gatesFor(input) {
  const text = [input.objective, input.acceptanceCriteria, input.constraints].filter(Boolean).join('\n');
  const gates = new Set(input.requestedActions);
  for (const [gate, re] of GATE_SIGNALS) if (re.test(text)) gates.add(gate);
  // Breadth alone is not architecture when every path is staging inside the isolated World tree; text signals
  // above and the protected-path checks in implementation-policy still apply to it.
  const isolatedWorldStaging = input.scope.length > 0 && input.scope.every(p => ISOLATED_STAGING.test(p));
  if (!isolatedWorldStaging && (input.scope.length > 3 || new Set(input.scope.map(p => p.split('/')[0])).size > 2)) gates.add('architecture-change');
  return [...gates].sort();
}

export function riskFor(input, gates) {
  const reasons = [];
  if (gates.some(g => PRE_WORK_GATES.has(g))) reasons.push(`approval gate(s): ${gates.filter(g => PRE_WORK_GATES.has(g)).join(', ')}`);
  const high = input.scope.filter(p => HIGH_RISK_AREAS.test(p));
  if (high.length) reasons.push(`sensitive area(s): ${high.join(', ')}`);
  if (/\b(auth|login|payment|stripe|payout|billing|security|permission)\b/i.test(input.objective)) reasons.push('objective touches auth, payments or security');
  if (reasons.length) return { level: 'high', reasons };
  if (input.scope.length && input.scope.every(p => LOW_RISK_AREAS.test(p))) return { level: 'low', reasons: ['scope is limited to low-risk areas (sandbox, docs, World, tests)'] };
  if (!input.scope.length && (input.type === 'investigate' || input.type === 'review')) return { level: 'low', reasons: ['read-only work'] };
  return { level: 'medium', reasons: [input.scope.length ? 'application code outside the low-risk areas' : 'no scope yet; set after investigation'] };
}

// Review independence: the reviewer must not be the implementer. Medium and high risk need an independent
// provider (Codex); low risk may fall back to a separate read-only Claude session, recorded as same-provider.
export function reviewPolicy(risk) {
  return risk === 'low' ? { required: true, independentProvider: false, preferred: 'codex' } : { required: true, independentProvider: true, preferred: 'codex' };
}

// Can an investigation's proposal be implemented without a new decision? Only inside the approved scope.
export function implementationEligibility(objective, proposal) {
  const approved = objective.input.scope;
  if (!proposal.scope.length) return { eligible: false, needs: 'decision', reason: 'The investigation proposed no implementation scope.' };
  let scope, tests;
  try { scope = proposal.scope.map(p => checkPath(p, { kind: 'scope' })); tests = proposal.tests.map(p => checkPath(p, { kind: 'test' })); }
  catch (error) { return { eligible: false, needs: 'refuse', reason: `Proposed scope refused by HQ policy: ${error.message}` }; }
  if (!tests.length) return { eligible: false, needs: 'decision', reason: 'The investigation proposed no test file HQ could run.' };
  const within = p => approved.some(a => (a.endsWith('/') ? p.startsWith(a) || p === a : p === a));
  if (approved.length && scope.every(within) && tests.every(within)) return { eligible: true, scope, tests, reason: 'Proposed scope and tests are inside the approved scope.' };
  if (approved.length) return { eligible: false, needs: 'decision', scope, tests, reason: `Proposed scope (${scope.join(', ')}) is outside the approved scope (${approved.join(', ')}).` };
  return { eligible: false, needs: 'decision', scope, tests, reason: 'No scope was approved when the objective was submitted; the orchestrator must confirm the proposed scope.' };
}
