// Pass 3 retries and loop guards. HQ classifies why a step did not produce an accepted handoff, from HQ's own
// evidence (terminal events, parked reasons, the runner's own BLOCKED reasons), and retries only where a retry
// can plausibly help, a bounded number of times, each with a recorded reason, count, maximum and strategy.

export const FAILURE_POLICY = {
  usage_limit: { max: 2, strategy: 'Record the agent as unavailable until its reset time; reroute to another approved agent for this step, otherwise wait for the reset (bounded by the objective deadline).' },
  timeout: { max: 1, strategy: 'Retry once with the same agent.' },
  infrastructure: { max: 1, strategy: 'Retry once after the adapter recovers.' },
  agent_failure: { max: 1, strategy: 'Retry once; prefer another approved agent for this step.' },
  malformed_handoff: { max: 1, strategy: 'Retry once with the validation error quoted and the handoff format restated.' },
  test_failure: { max: 1, strategy: 'One repair attempt: Claude receives HQ\'s failing test output as quoted data, same scope.' },
  review_changes: { max: 1, strategy: 'One repair attempt: Claude receives the review findings as quoted data, same scope.' },
  interrupted: { max: 1, strategy: 'HQ restarted during the step. Re-run it once, after the previous run is proven stopped; an implementation starts again in a fresh branch and sandbox.' },
  policy_refusal: { max: 0, strategy: 'No retry: HQ policy refused the work.' },
  missing_dependency: { max: 0, strategy: 'No retry: something HQ needs is missing; the owner must provide it.' },
  implementation_failure: { max: 0, strategy: 'No retry: the implementation produced nothing HQ could accept.' },
  cancelled: { max: 0, strategy: 'No retry: cancelled.' },
};

// The final evidence of a finished (or parked) step task -> { reason, detail, retryAt }.
export function classify(task) {
  const terminal = task.evidence.filter(e => ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED', 'RATE_LIMITED', 'UNCERTAIN'].includes(e.kind)).at(-1);
  const text = `${terminal?.summary ?? ''} ${task.blocker ?? ''}`;
  if (task.interrupted) return { reason: 'interrupted', detail: `HQ restarted during this step; ${task.interrupted.evidence}` };
  if (task.stage === 'CANCELLED' || (terminal?.kind === 'CANCELLED' && !/Watchdog|Start failed/.test(terminal.summary))) return { reason: 'cancelled', detail: text.trim() };
  if (terminal?.kind === 'RATE_LIMITED' || /usage limit|rate.?limit|quota/i.test(text)) return { reason: 'usage_limit', detail: terminal?.summary ?? text, retryAt: terminal?.retryAt ?? null };
  if (/Adapter start failed|did not start|not startable|not found on PATH|ENOENT|patch did not apply|sandbox .* could not/i.test(text)) return { reason: 'infrastructure', detail: text.trim() };
  if (/timed out|run limit|did not answer within|No worker acknowledgement|STALLED|OFFLINE/i.test(text)) return { reason: 'timeout', detail: text.trim() };
  if (/Acceptance tests failed/.test(text)) return { reason: 'test_failure', detail: terminal?.summary, testOutput: terminal?.implementation?.testOutput ?? null, patchHash: terminal?.implementation?.patchHash ?? null };
  if (/Scope violation|Sandbox output rejected|symbolic link|protected|refused/i.test(text)) return { reason: 'policy_refusal', detail: text.trim() };
  if (/without changing any file|Acceptance test file\(s\) missing/.test(text)) return { reason: 'implementation_failure', detail: text.trim() };
  if (/Implementation is disabled|No Anthropic API key|base image|not configured|missing/i.test(text)) return { reason: 'missing_dependency', detail: text.trim() };
  if (terminal?.kind === 'COMPLETED') return { reason: 'ok' };
  return { reason: 'agent_failure', detail: text.trim() || 'The agent ended without a result.' };
}

// Whether a step may retry for this reason, given its own history and the objective's global budget.
export function retryDecision(objective, step, failure) {
  const policy = FAILURE_POLICY[failure.reason];
  if (!policy) return { retry: false, why: `No retry policy for ${failure.reason}.` };
  const used = step.retries.filter(r => r.reason === failure.reason).length;
  if (used >= policy.max) return { retry: false, why: policy.max === 0 ? policy.strategy : `Retry budget for ${failure.reason} exhausted (${used}/${policy.max}).` };
  if (objective.counters.retries >= objective.limits.maxRetries) return { retry: false, why: `Objective retry budget exhausted (${objective.counters.retries}/${objective.limits.maxRetries}).` };
  return { retry: true, count: used + 1, max: policy.max, strategy: policy.strategy };
}

// Loop guards over the whole objective. Returns a reason string when the objective must stop, else null.
export function loopGuard(objective, now) {
  const l = objective.limits;
  if (now > objective.deadlineAt) return `Objective deadline passed (${new Date(objective.deadlineAt).toISOString()}).`;
  if (objective.counters.steps >= l.maxSteps) return `Maximum orchestration steps reached (${objective.counters.steps}/${l.maxSteps}).`;
  if (objective.counters.agentCalls > l.maxAgentCalls) return `Maximum agent calls exceeded (${objective.counters.agentCalls}/${l.maxAgentCalls}).`;
  if (objective.counters.retries > l.maxRetries) return `Maximum retries exceeded (${objective.counters.retries}/${l.maxRetries}).`;
  return null;
}

// An accepted handoff identical to an earlier one of the same kind in this objective means the agents are
// repeating themselves; an identical patch after a repair means the repair changed nothing.
export function repeated(objective, stepId, hash, field = 'handoffHash') {
  const kind = objective.steps[stepId].kind;
  return Object.values(objective.steps).some(s => s.id !== stepId && s.kind === kind && s[field] && s[field] === hash);
}
