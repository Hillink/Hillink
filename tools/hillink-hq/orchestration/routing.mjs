// Pass 3 routing: which agent may do which kind of step. Fixed in code. The roles are not interchangeable:
//   investigate  -> Codex (preferred) or a read-only Claude review session
//   review       -> Codex; a read-only Claude session only where policy allows a same-provider review (low risk)
//   rebuttal     -> the agent whose position is being answered (read-only)
//   implement    -> Claude Code only, through the Pass 2.7 sandbox runner. Never Codex, never a local model.
//   local-check  -> a local Ollama model (Qwen/Gemma): text classification or summaries only, never on the
//                   critical path for correctness
//   verify       -> HQ itself (deterministic git and evidence checks); no agent
//   produce      -> HQ's local Art Factory process (headless Blender + deterministic pixel pass); not a model
// ChatGPT is above this table: it submits objectives and makes orchestration decisions; it is never routed a step.
export const ROUTES = {
  investigate: { operation: 'review-repo', safety: 'local-read-only', agents: ['codex', 'claude'] },
  review: { operation: 'review-repo', safety: 'local-read-only', agents: ['codex', 'claude'] },
  rebuttal: { operation: 'review-repo', safety: 'local-read-only', agents: ['codex', 'claude'] },
  implement: { operation: 'implement-repo', safety: 'local-worktree-write', agents: ['claude'] },
  'local-check': { operation: 'summarize-local', safety: 'local-read-only', agents: ['qwen', 'gemma'] },
  verify: { operation: null, safety: null, agents: ['hq'] },
  produce: { operation: 'produce-asset', safety: 'local-artifact-write', agents: ['hq-verifier'] },
};
const PROVIDER = { codex: 'openai', claude: 'anthropic', qwen: 'local', gemma: 'local', hq: 'hq', 'hq-verifier': 'local' };
export const providerOf = id => PROVIDER[id] ?? 'unknown';

// The one gate every implementation dispatch passes. Throws; callers never catch it into a fallback.
export function assertImplementer(agentId) {
  if (agentId !== 'claude') throw Error(`Routing refused: implementation is Claude-only; "${String(agentId).slice(0, 40)}" can never implement.`);
}

// Candidates for a step, in preference order, with why each one is or is not usable right now.
// status(agentId) -> HQ's verified status; connected(agentId) -> adapter present; capable(agentId, capability).
export function candidates(step, { status, connected, capable, reviewRule = null, implementerId = null }) {
  const route = ROUTES[step.kind];
  if (!route) throw Error(`No route for step kind ${step.kind}`);
  if (step.kind === 'verify') return [{ agentId: 'hq', usable: true, reason: 'HQ verifies deterministically.' }];
  let pool = route.agents;
  if (step.kind === 'rebuttal') pool = [step.respondent];
  if (step.kind === 'review' && reviewRule?.independentProvider) pool = pool.filter(a => providerOf(a) !== providerOf(implementerId ?? 'claude'));
  if (step.kind === 'review' && step.requireAgent) pool = pool.filter(a => a === step.requireAgent);
  pool = pool.filter(a => !(step.excludeAgents ?? []).includes(a));
  const capability = { 'review-repo': 'review-repo', 'implement-repo': 'implement-repo', 'summarize-local': 'summarize', 'produce-asset': 'produce-asset' }[route.operation];
  return pool.map(agentId => {
    if (step.kind === 'implement') assertImplementer(agentId);
    if (!connected(agentId)) return { agentId, usable: false, reason: 'not connected to HQ' };
    if (!capable(agentId, capability)) return { agentId, usable: false, reason: `lacks the ${capability} capability` };
    const s = status(agentId);
    if (s === 'IDLE' || s === 'RUNNING') return { agentId, usable: true, busy: s === 'RUNNING', reason: s === 'RUNNING' ? 'busy; HQ queues the step' : 'available' };
    return { agentId, usable: false, status: s, reason: `status ${s}` };
  });
}
