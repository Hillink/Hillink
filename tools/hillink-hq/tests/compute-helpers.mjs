// Pass 4 test helper. Tests of the metered paths (Pass 2.6/2.7 sandboxed implementation, the optional OpenAI
// orchestrator) exercise what happens once Kyle has deliberately turned paid compute on: BUDGETED mode plus a bounded,
// expiring authorization created through the same owner-only method the HTTP API uses. Nothing else authorizes spend.
export function allowMetered(engine, { amountUsd = 25, expiresInMinutes = 24 * 60, ...scope } = {}) {
  engine.config.computeMode = 'BUDGETED';
  return engine.authorizeSpend({ amountUsd, expiresInMinutes, note: 'test: Kyle authorized metered runs', ...scope }, { by: 'kyle' });
}
// A fake CLI's answers to HQ's subscription preflight (`claude auth status --json`, `codex login status`).
export function subscriptionProbe(args, child, { claude = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }, codex = 'Logged in using ChatGPT' } = {}) {
  if (args[0] === 'auth' && args[1] === 'status') { queueMicrotask(() => { child.stdout.emit('data', Buffer.from(JSON.stringify(claude))); child.emit('close', 0, null); }); return true; }
  if (args[0] === 'login' && args[1] === 'status') { queueMicrotask(() => { child.stderr.emit('data', Buffer.from(`${codex}\n`)); child.emit('close', 0, null); }); return true; }
  return false;
}
// What the engine hands a metered adapter after a successful spend check, for tests that drive an adapter directly.
import { issueGrant } from '../compute/policy.mjs';
import { routeFor } from '../compute/registry.mjs';
// Implementation grants default to the metered direct-sandbox variant (Pass 2.7 runner); pass variant for others.
export const testGrant = (taskId, runId, { adapterId = 'cli-claude', operation = 'implement-repo', variant = operation === 'implement-repo' ? 'direct-sandbox' : null, authorizationId = 'test-authorization', reservedUsd = 2 } = {}) => issueGrant({ taskId, runId, route: routeFor(adapterId, operation, variant), authorizationId, reservedUsd });
