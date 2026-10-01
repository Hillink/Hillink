// Pass 3 planner: an objective becomes an explicit, machine-readable plan. The plan says what we are trying to
// accomplish, how risky it is, which gates apply, which roles are needed, what evidence each step must produce and
// what "done" means. Steps are materialized as the work proceeds (an implementation step exists only once an
// investigation has justified it), so the plan is a policy, not a fixed script.
import { gatesFor, riskFor, reviewPolicy, PRE_WORK_GATES, POST_WORK_GATES } from './policy.mjs';
import { ROUTES } from './routing.mjs';
import { routesFor } from '../compute/registry.mjs';

// Pass 4: the adapter HQ wires for each agent, so the plan can say, before anything runs, what compute each step
// would use and whether any of it is metered. Deterministic: no model is asked what a model costs.
const ADAPTER = { claude: 'cli-claude', codex: 'cli-codex', qwen: 'ollama-qwen', gemma: 'ollama-gemma', 'hq-verifier': 'local-checks' };
// supports(adapterId, operation, variant): whether HQ can serve that route variant now (Pass 4.5). Unknown: assume yes.
export function computePlan(kinds, mode, supports = () => undefined) {
  const steps = [...new Set(kinds)].map(kind => {
    const r = ROUTES[kind];
    if (!r || kind === 'verify') return { kind, computeClass: 'LOCAL', provider: 'local', backend: 'HQ deterministic checks' };
    const usable = (a, x) => { const v = supports(ADAPTER[a], r.operation, x.variant); return v === undefined ? (x.variant === 'default' || x.computeClass === 'METERED_API') : v !== false && v?.ok !== false; };
    const options = r.agents.flatMap(a => routesFor(ADAPTER[a], r.operation).filter(x => usable(a, x)).map(x => ({ agentId: a, ...x })));
    if (!options.length) return { kind, computeClass: 'UNAVAILABLE', provider: 'none', backend: 'no route can run this step in this HQ' };
    const best = options.sort((a, b) => ['LOCAL', 'SUBSCRIPTION', 'METERED_API'].indexOf(a.computeClass) - ['LOCAL', 'SUBSCRIPTION', 'METERED_API'].indexOf(b.computeClass))[0];
    return { kind, agentId: best.agentId, computeClass: best.computeClass, provider: best.provider, backend: best.backend, ...(best.computeClass === 'METERED_API' ? { maxCostUsdPerRun: best.perRunCapUsd, why: best.why } : {}) };
  });
  const metered = steps.filter(s => s.computeClass === 'METERED_API');
  return {
    mode, steps, meteredComputeRequired: metered.length > 0,
    expectedMeteredSpendUsd: metered.length ? null : 0,
    spendGate: metered.length ? `METERED COMPUTE REQUIRED for ${metered.map(s => s.kind).join(', ')}: HQ stops at the spend gate before it${mode === 'BUDGETED' ? ' unless Kyle has authorized a bounded amount' : ' (ZERO_CREDIT mode forbids it)'}. Up to $${metered.reduce((n, s) => n + (s.maxCostUsdPerRun ?? 0), 0).toFixed(2)} per attempt.` : 'None: every step runs on local or already-paid subscription compute ($0 metered).',
  };
}

let counter = 0;
export const stepId = (kind, n = ++counter) => `${kind}-${Date.now().toString(36)}-${n.toString(36)}`;

export const REQUIRED_EVIDENCE = {
  investigate: 'A validated investigation handoff: findings, file evidence, suspected cause, confidence, risks and a recommended action.',
  implement: 'HQ evidence from the sandboxed runner: git\'s changed files inside scope, HQ-run tests passing, a local commit on the task branch, the sandbox destroyed.',
  verify: 'HQ\'s own deterministic checks of the commit against git and the runner evidence.',
  review: 'A validated review handoff from a reviewer who is not the implementer: verdict, findings with severity, regression risks, recommendation.',
  rebuttal: 'A validated rebuttal handoff answering the other agent\'s evidence.',
  produce: 'HQ evidence from the Art Factory run: the recipe and input hash, two renders with byte-identical sheets, the sheet checks passing, the World tests passing in the asset worktree, and a local commit containing only the generated sheet.',
};

// The implementation contract steps an objective can reach, as step definitions.
export function implementationSteps(objective, contract, { repair = null, reviewRule, requireReviewer = null } = {}) {
  const impl = { id: stepId('implement'), kind: 'implement', role: 'implementer', dependsOn: [], contract, repair, requiredEvidence: REQUIRED_EVIDENCE.implement };
  const verify = { id: stepId('verify'), kind: 'verify', role: 'hq', dependsOn: [impl.id], requiredEvidence: REQUIRED_EVIDENCE.verify };
  const review = { id: stepId('review'), kind: 'review', role: 'reviewer', dependsOn: [verify.id], reviewRule, requireAgent: requireReviewer, requiredEvidence: REQUIRED_EVIDENCE.review };
  return [impl, verify, review];
}

export function planObjective(objective, { computeMode = 'ZERO_CREDIT', supports } = {}) {
  const input = objective.input;
  const gates = gatesFor(input), risk = riskFor(input, gates), reviewRule = reviewPolicy(risk.level);
  const steps = [];
  if (input.type === 'investigate') steps.push({ id: stepId('investigate'), kind: 'investigate', role: 'investigator', dependsOn: [], requiredEvidence: REQUIRED_EVIDENCE.investigate });
  if (input.type === 'review') steps.push({ id: stepId('review'), kind: 'review', role: 'reviewer', dependsOn: [], reviewRule: { ...reviewRule, independentProvider: false }, standalone: true, requiredEvidence: REQUIRED_EVIDENCE.review });
  if (input.type === 'fix') steps.push({ id: stepId('investigate'), kind: 'investigate', role: 'investigator', dependsOn: [], requiredEvidence: REQUIRED_EVIDENCE.investigate });
  if (input.type === 'asset') {
    const produce = { id: stepId('produce'), kind: 'produce', role: 'art-factory', dependsOn: [], asset: input.asset, requiredEvidence: REQUIRED_EVIDENCE.produce };
    steps.push(produce, { id: stepId('verify'), kind: 'verify', role: 'hq', dependsOn: [produce.id], requiredEvidence: REQUIRED_EVIDENCE.verify });
  }
  if (input.type === 'implement') steps.push(...implementationSteps(objective, { objective: input.objective, scope: input.scope, tests: input.tests, acceptanceCriteria: input.acceptanceCriteria, constraints: input.constraints ?? 'Change nothing outside the scope.' }, { reviewRule }));
  const path = { investigate: ['investigate'], review: ['review'], fix: ['investigate', 'implement (only if the evidence supports it and policy allows)', 'verify (HQ)', 'review (independent)'], implement: ['implement', 'verify (HQ)', 'review (independent)'], asset: ['produce (Art Factory, local)', 'verify (HQ)'] }[input.type];
  return {
    version: 1,
    objective: input.objective,
    taskType: input.type,
    affectedSystem: input.system ?? 'unspecified',
    permittedScope: input.scope,
    tests: input.tests,
    risk: risk.level, riskReasons: risk.reasons,
    gates, preWorkGates: gates.filter(g => PRE_WORK_GATES.has(g)), postWorkGates: gates.filter(g => POST_WORK_GATES.has(g)) ,
    agentsNeeded: [...new Set(steps.map(s => s.role).concat(input.type === 'fix' ? ['implementer', 'hq', 'reviewer'] : []))],
    expectedPath: path,
    asset: input.asset ?? null,
    implementationEligible: input.type === 'asset' ? 'no model implements: HQ\'s Art Factory produces the files' : input.type === 'implement' ? 'yes: a complete contract was submitted' : input.type === 'fix' ? 'decided after investigation, from its evidence and the approved scope' : 'no: read-only objective',
    reviewRule,
    verification: input.type === 'asset' ? ['two Art Factory runs produce byte-identical sheets', 'the sheet checks pass (cell, anchor, binary alpha, one palette, four facings)', 'the World tests pass in the asset worktree', 'HQ verifies the commit holds only the generated sheet, from git'] : input.type === 'implement' || input.type === 'fix' ? ['HQ-run tests inside the sandbox must pass', 'HQ verifies the commit, scope and test evidence from git', `review by ${reviewRule.independentProvider ? 'an independent provider (Codex)' : 'a read-only reviewer other than the implementing session'}`] : ['the handoff must validate'],
    completionCriteria: input.type === 'asset' ? ['a verified local commit on an hq/asset branch holding only the generated sheet', 'Kyle\'s visual approval before the asset is used by default (a candidate is shown only with ?assets=standin)'] : input.type === 'implement' || input.type === 'fix' ? ['an accepted investigation (fix) or a submitted contract (implement)', 'a verified local commit on an hq/impl branch', 'an approving review, or a recorded decision on a disagreement', ...gates.filter(g => POST_WORK_GATES.has(g)).map(g => `Kyle's decision on ${g} (HQ never performs it)`)] : ['an accepted handoff answering the objective'],
    steps,
    compute: computePlan(input.type === 'fix' ? ['investigate', 'implement', 'verify', 'review'] : steps.map(s => s.kind), computeMode, supports),
  };
}
