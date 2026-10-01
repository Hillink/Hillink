// Registration is data. Renderers do not switch on provider or agent identity.
export const initialAgents = [
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', model: null, role: 'Orchestrator', capabilities: ['plan', 'coordinate'], workstation: 'Command Center', real: 'Controller', fantasy: 'King', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', model: null, role: 'Builder', capabilities: ['implement', 'review'], workstation: 'Workshop', real: 'Engineer', fantasy: 'Dwarf builder', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'codex', name: 'Codex', provider: 'OpenAI', model: null, role: 'Investigation, audit, review and QA (read-only; never implements)', capabilities: ['test', 'security', 'review', 'investigate'], workstation: 'Testing Lab', real: 'Inspector', fantasy: 'Cyborg inspector', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'qwen', name: 'Qwen local', provider: 'Ollama', model: null, role: 'Local verification and classification (no repository writes)', capabilities: ['reason', 'classify'], workstation: 'Local Workshop', real: 'Technician', fantasy: 'Artificer', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'gemma', name: 'Gemma local', provider: 'Ollama', model: null, role: 'Utility worker', capabilities: ['classify', 'extract', 'summarize'], workstation: 'Archive', real: 'Analyst', fantasy: 'Scribe', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'hq-verifier', name: 'Local verifier', provider: 'Local Node.js', model: null, role: 'Allowlisted local verification process (not an AI model)', capabilities: ['verify-hq', 'verify-unit', 'inspect-repo'], workstation: 'Testing Lab', real: 'Test technician', fantasy: 'Clockwork tester', executionAdapter: 'local-checks', telemetryAdapter: 'child-process', usageSource: 'process-observation' },
];

export const operations = {
  'orchestrate': { label: 'Ask ChatGPT, the orchestrator', capability: 'coordinate', description: 'OpenAI orchestrator: reads HQ state and may queue read-only reviews or ask Kyle to decide. No repository, shell, file or production access.' },
  'implement-repo': { label: 'Ask Claude to implement a bounded change', capability: 'implement-repo', description: 'Claude Code edits only the task scope in an isolated git worktree branch; HQ checks the scope, runs the tests and commits. Never pushed or merged.' },
  'owner-decision': { label: 'A decision only Kyle can make', capability: 'owner-decision', description: 'Owner-required; never dispatched to any agent.' },
  'summarize-local': { label: 'Summarize text with a local model', capability: 'summarize', description: 'Opt-in Ollama bridge; summarizes only the task description, without tools or repository access.' },
  'review-repo': { label: 'Ask Claude or Codex to review the repo (read-only)', capability: 'review-repo', description: 'Opt-in local CLI bridge; the agent reads the repository and answers. No edits, shell writes, deploys or database access.' },
  'inspect-repo': { label: 'Inspect repository source', capability: 'inspect-repo', description: 'Count source files locally; no network, credentials or database.' },
  'verify-hq': { label: 'Run HQ foundation tests', capability: 'verify-hq', description: 'Run isolated engine and persistence tests.' },
  'produce-asset': { label: 'Produce a character sprite sheet (Art Factory)', capability: 'produce-asset', description: 'HQ runs the local Art Factory (headless Blender, deterministic pixel pass) on an allowlisted recipe in an isolated worktree, checks the result and commits only the generated sheet. No network, no model, never pushed.' },
  'verify-unit': { label: 'Run Hillink unit tests', capability: 'verify-unit', description: 'Run existing pure unit tests; never seed or run E2E.' },
};
