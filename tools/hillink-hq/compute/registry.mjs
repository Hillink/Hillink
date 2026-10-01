// Pass 4 agent capability registry. Data, not code paths: a future agent is one registerAgentProfile() and one
// registerRoute() call. The compute class of a route comes only from this table, keyed by the adapter HQ itself
// wired (engine.adapters key) and the operation. Nothing an agent, a task or a handoff says can change it, and an
// adapter or operation missing from the table is METERED_API (fail closed).

// What each agent is for (semantic capabilities, for planning and the World) and which compute sources it can use.
const profiles = new Map();
export function registerAgentProfile(p) {
  if (!/^[a-z0-9-]+$/.test(p.id) || profiles.has(p.id)) throw Error('Unique agent profile id required');
  profiles.set(p.id, Object.freeze({ ...p, capabilities: Object.freeze([...p.capabilities]), computeSources: Object.freeze([...p.computeSources]) }));
}
export const agentProfiles = () => [...profiles.values()];
export const agentProfile = id => profiles.get(id) ?? null;

registerAgentProfile({ id: 'claude-code', hqAgentId: 'claude', capabilities: ['implementation', 'debugging', 'review', 'investigation'], computeSources: ['subscription', 'metered_api'], authority: 'The only implementation agent. Reviews read-only.' });
registerAgentProfile({ id: 'codex', hqAgentId: 'codex', capabilities: ['investigation', 'review', 'audit', 'tracing', 'verification'], computeSources: ['subscription'], authority: 'Read-only. Never implements.' });
registerAgentProfile({ id: 'qwen-local', hqAgentId: 'qwen', capabilities: ['classification', 'summarization', 'basic-analysis', 'log-analysis', 'handoff-normalization', 'test-output-analysis'], computeSources: ['local'], authority: 'Text in, text out. No tools, no repository writes, never implements.' });
registerAgentProfile({ id: 'gemma-local', hqAgentId: 'gemma', capabilities: ['classification', 'summarization', 'extraction'], computeSources: ['local'], authority: 'Text in, text out. No tools, no repository writes, never implements.' });
registerAgentProfile({ id: 'chatgpt-api', hqAgentId: 'chatgpt', capabilities: ['orchestration'], computeSources: ['metered_api'], authority: 'Optional. Off by default. Kyle normally orchestrates through his ChatGPT subscription outside HQ.' });
registerAgentProfile({ id: 'hq-local', hqAgentId: 'hq-verifier', capabilities: ['verification', 'git', 'tests', 'inspection'], computeSources: ['local'], authority: 'Deterministic HQ processes; not an AI model.' });

// Routes: (adapterId, operation, variant) -> compute class and the facts the spend gate reports. Pass 4.5: one adapter
// can serve an operation through several variants with different compute and security (Claude implementation:
// 'split-broker' on the subscription, 'direct-sandbox' on a metered key). The adapter says which variants it can
// serve right now (supports()); the class of each still comes only from this table.
const CLASS_RANK = { LOCAL: 0, SUBSCRIPTION: 1, METERED_API: 2 };
const routes = new Map();
const key = (adapterId, operation) => `${adapterId}\u0000${operation}`;
export function registerRoute(r) {
  if (!['LOCAL', 'SUBSCRIPTION', 'METERED_API'].includes(r.computeClass)) throw Error('Unknown compute class');
  if (r.computeClass === 'METERED_API' && !(Number.isFinite(r.perRunCapUsd) && r.perRunCapUsd > 0)) throw Error('A metered route needs a per-run cost cap');
  const variant = r.variant ?? 'default';
  if (!/^[a-z0-9-]{1,40}$/.test(variant)) throw Error('Invalid route variant');
  for (const op of r.operations) {
    const list = routes.get(key(r.adapterId, op)) ?? [];
    if (list.some(x => x.variant === variant)) throw Error(`Route ${r.adapterId}/${op}/${variant} already registered`);
    const { operations, ...rest } = r;
    list.push(Object.freeze({ ...rest, variant, operation: op }));
    list.sort((a, b) => CLASS_RANK[a.computeClass] - CLASS_RANK[b.computeClass]);
    routes.set(key(r.adapterId, op), list);
  }
}
const unclassified = (adapterId, operation) => Object.freeze({ adapterId, operation, variant: 'default', computeClass: 'METERED_API', provider: 'unknown', backend: `unclassified route ${String(adapterId).slice(0, 40)}/${String(operation).slice(0, 40)}`, perRunCapUsd: null, why: 'HQ cannot prove this route is free, so it is treated as metered.', alternatives: [], unclassified: true });
// Every variant for (adapter, operation), cheapest first. Unknown: one unclassified METERED route (fail closed).
export function routesFor(adapterId, operation) {
  const list = routes.get(key(adapterId, operation));
  return list?.length ? [...list] : [unclassified(adapterId, operation)];
}
// One route: the named variant (unknown variant: unclassified METERED), or the cheapest when none is named.
export function routeFor(adapterId, operation, variant = null) {
  const list = routesFor(adapterId, operation);
  if (variant == null) return list[0];
  return list.find(r => r.variant === variant) ?? unclassified(adapterId, operation);
}
export const allRoutes = () => [...routes.values()].flat();

registerRoute({ adapterId: 'local-checks', operations: ['inspect-repo', 'verify-hq', 'verify-unit'], computeClass: 'LOCAL', provider: 'local', backend: 'HQ allowlisted Node.js processes', authentication: 'none' });
registerRoute({ adapterId: 'local-checks', operations: ['produce-asset'], computeClass: 'LOCAL', provider: 'local', backend: 'HQ Art Factory: headless Blender (bpy) and a deterministic pixel pass on this machine', authentication: 'none' });
registerRoute({ adapterId: 'ollama-qwen', operations: ['summarize-local'], computeClass: 'LOCAL', provider: 'local', backend: 'Ollama on 127.0.0.1 (local model only)', authentication: 'none' });
registerRoute({ adapterId: 'ollama-gemma', operations: ['summarize-local'], computeClass: 'LOCAL', provider: 'local', backend: 'Ollama on 127.0.0.1 (local model only)', authentication: 'none' });
registerRoute({ adapterId: 'cli-claude', operations: ['review-repo'], computeClass: 'SUBSCRIPTION', provider: 'anthropic', backend: 'Claude Code CLI on the host, read-only tools', authentication: 'Kyle\'s Claude subscription sign-in; API keys stripped and refused (apiKeySource must be none)' });
registerRoute({ adapterId: 'cli-codex', operations: ['review-repo'], computeClass: 'SUBSCRIPTION', provider: 'openai', backend: 'Codex CLI, read-only sandbox', authentication: 'Kyle\'s ChatGPT sign-in; forced_login_method=chatgpt, API keys stripped and refused' });
// Pass 4.5: claude-subscription-implementation. Claude Code runs on the trusted host under Kyle's subscription with no
// built-in tools; its only tools are HQ broker operations that execute inside the disposable sandbox (broker/).
registerRoute({
  adapterId: 'cli-claude', variant: 'split-broker', routeId: 'claude-subscription-implementation', operations: ['implement-repo'], computeClass: 'SUBSCRIPTION', provider: 'anthropic', security: 'split-broker',
  backend: 'Claude Code on the host (subscription, HQ broker tools only); files and tests inside a disposable sandbox',
  authentication: 'Kyle\'s Claude subscription sign-in on the host; API keys stripped and refused; the credential never enters the sandbox',
});
// claude-api-sandbox-implementation (Pass 2.7): Claude Code inside the sandbox with a dedicated metered key. Optional
// paid fallback: BUDGETED mode and a Kyle spend authorization only.
registerRoute({
  adapterId: 'cli-claude', variant: 'direct-sandbox', routeId: 'claude-api-sandbox-implementation', operations: ['implement-repo'], computeClass: 'METERED_API', provider: 'anthropic', perRunCapUsd: 2, security: 'direct-sandbox',
  backend: 'Claude Code inside a disposable WSL2 sandbox, authenticated with HQ_SANDBOX_ANTHROPIC_API_KEY',
  authentication: 'dedicated sandbox API key (metered)',
  why: 'This variant runs Claude inside the sandbox, which must not hold Kyle\'s persistent Claude subscription credential (Pass 2.7 security). The only credential that can safely enter the sandbox is a separate, spend-limited API key. The $0 split-broker variant is preferred whenever it is available.',
  alternatives: ['Use the subscription split broker (HQ picks it automatically when its sandbox supports broker operations).', 'Ask for a read-only Claude or Codex review/investigation of the change (subscription, $0).', 'Authorize a bounded spend for this task (BUDGETED mode + an authorization of at least $2).'],
  waitingWouldHelp: false,
});
registerRoute({
  adapterId: 'openai-orchestrator', operations: ['orchestrate'], computeClass: 'METERED_API', provider: 'openai', perRunCapUsd: 0.25,
  backend: 'OpenAI Responses API (OPENAI_API_KEY)', authentication: 'OPENAI_API_KEY (metered)',
  why: 'An in-HQ ChatGPT turn is an API call billed per token; Kyle\'s ChatGPT subscription does not cover it.',
  alternatives: ['Decide in HQ yourself, or ask ChatGPT in your subscription and act on its answer in HQ.'],
  waitingWouldHelp: false,
});
