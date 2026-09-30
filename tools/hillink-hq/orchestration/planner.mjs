// Pass 3 planner: an objective becomes an explicit, machine-readable plan. The plan says what we are trying to
// accomplish, how risky it is, which gates apply, which roles are needed, what evidence each step must produce and
// what "done" means. Steps are materialized as the work proceeds (an implementation step exists only once an
// investigation has justified it), so the plan is a policy, not a fixed script.
import { gatesFor, riskFor, reviewPolicy, PRE_WORK_GATES, POST_WORK_GATES } from './policy.mjs';

let counter = 0;
export const stepId = (kind, n = ++counter) => `${kind}-${Date.now().toString(36)}-${n.toString(36)}`;

export const REQUIRED_EVIDENCE = {
  investigate: 'A validated investigation handoff: findings, file evidence, suspected cause, confidence, risks and a recommended action.',
  implement: 'HQ evidence from the sandboxed runner: git\'s changed files inside scope, HQ-run tests passing, a local commit on the task branch, the sandbox destroyed.',
  verify: 'HQ\'s own deterministic checks of the commit against git and the runner evidence.',
  review: 'A validated review handoff from a reviewer who is not the implementer: verdict, findings with severity, regression risks, recommendation.',
  rebuttal: 'A validated rebuttal handoff answering the other agent\'s evidence.',
};

// The implementation contract steps an objective can reach, as step definitions.
export function implementationSteps(objective, contract, { repair = null, reviewRule, requireReviewer = null } = {}) {
  const impl = { id: stepId('implement'), kind: 'implement', role: 'implementer', dependsOn: [], contract, repair, requiredEvidence: REQUIRED_EVIDENCE.implement };
  const verify = { id: stepId('verify'), kind: 'verify', role: 'hq', dependsOn: [impl.id], requiredEvidence: REQUIRED_EVIDENCE.verify };
  const review = { id: stepId('review'), kind: 'review', role: 'reviewer', dependsOn: [verify.id], reviewRule, requireAgent: requireReviewer, requiredEvidence: REQUIRED_EVIDENCE.review };
  return [impl, verify, review];
}

export function planObjective(objective) {
  const input = objective.input;
  const gates = gatesFor(input), risk = riskFor(input, gates), reviewRule = reviewPolicy(risk.level);
  const steps = [];
  if (input.type === 'investigate') steps.push({ id: stepId('investigate'), kind: 'investigate', role: 'investigator', dependsOn: [], requiredEvidence: REQUIRED_EVIDENCE.investigate });
  if (input.type === 'review') steps.push({ id: stepId('review'), kind: 'review', role: 'reviewer', dependsOn: [], reviewRule: { ...reviewRule, independentProvider: false }, standalone: true, requiredEvidence: REQUIRED_EVIDENCE.review });
  if (input.type === 'fix') steps.push({ id: stepId('investigate'), kind: 'investigate', role: 'investigator', dependsOn: [], requiredEvidence: REQUIRED_EVIDENCE.investigate });
  if (input.type === 'implement') steps.push(...implementationSteps(objective, { objective: input.objective, scope: input.scope, tests: input.tests, acceptanceCriteria: input.acceptanceCriteria, constraints: input.constraints ?? 'Change nothing outside the scope.' }, { reviewRule }));
  const path = { investigate: ['investigate'], review: ['review'], fix: ['investigate', 'implement (only if the evidence supports it and policy allows)', 'verify (HQ)', 'review (independent)'], implement: ['implement', 'verify (HQ)', 'review (independent)'] }[input.type];
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
    implementationEligible: input.type === 'implement' ? 'yes: a complete contract was submitted' : input.type === 'fix' ? 'decided after investigation, from its evidence and the approved scope' : 'no: read-only objective',
    reviewRule,
    verification: input.type === 'implement' || input.type === 'fix' ? ['HQ-run tests inside the sandbox must pass', 'HQ verifies the commit, scope and test evidence from git', `review by ${reviewRule.independentProvider ? 'an independent provider (Codex)' : 'a read-only reviewer other than the implementing session'}`] : ['the handoff must validate'],
    completionCriteria: input.type === 'implement' || input.type === 'fix' ? ['an accepted investigation (fix) or a submitted contract (implement)', 'a verified local commit on an hq/impl branch', 'an approving review, or a recorded decision on a disagreement', ...gates.filter(g => POST_WORK_GATES.has(g)).map(g => `Kyle's decision on ${g} (HQ never performs it)`)] : ['an accepted handoff answering the objective'],
    steps,
  };
}
