// Organizational roles: what each agent is for in the Hillink workflow. This is product intent, kept apart
// from runtime facts: HQ's registry says what an agent can execute today (capabilities, adapters), and
// core/truth.mjs says what it is doing. A role never makes an agent look connected or busy.
export const ROLES = {
  claude: { title: 'Implementation', summary: 'Builds features and fixes. Through HQ today it runs read-only repository reviews only.' },
  codex: { title: 'Investigation and review', summary: 'Audits, traces behavior, verifies and reviews work, and specifies what to build next. Not an implementation agent.' },
  qwen: { title: 'Local analysis', summary: 'Delegated local research and verification on this machine.' },
  gemma: { title: 'Local utility', summary: 'Small delegated local jobs: summaries, classification, extraction.' },
  chatgpt: { title: 'Orchestration', summary: 'Coordinates the agents through HQ: reads state, delegates reviews, asks Kyle to decide. Does not code. Workspace: Lobby reception.' },
  'hq-verifier': { title: 'Verification process', summary: 'Runs allowlisted local checks. A process, not an AI model.' },
};
export const roleOf = id => ROLES[id] ?? null;
