// Organizational roles: what each agent is for in the Hillink workflow. This is product intent, kept apart
// from runtime facts: HQ's registry says what an agent can execute today (capabilities, adapters), and
// core/truth.mjs says what it is doing. A role never makes an agent look connected or busy.
// Pass 5E: roles are part of the agent definition (core/agents.mjs). This keeps the old lookups working for any agent.
import { DEFAULT_DEFINITIONS, definitionOf } from './agents.mjs';

const roleFrom = d => (d?.roleTitle || d?.roleDescription ? { title: d.roleTitle ?? d.role ?? 'Agent', summary: d.roleDescription ?? d.role ?? '' } : null);
export const ROLES = Object.fromEntries(Object.values(DEFAULT_DEFINITIONS).filter(d => d.kind !== 'person').map(d => [d.id, roleFrom(d)]).filter(([, r]) => r));
// The role of an agent: pass the World agent (any id, from the registry) or, as before, just a default id.
export const roleOf = x => roleFrom(typeof x === 'string' ? DEFAULT_DEFINITIONS[x] : definitionOf(x));
