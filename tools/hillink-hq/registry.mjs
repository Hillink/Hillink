// Registration is data. Renderers do not switch on provider or agent identity.
export const initialAgents = [
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', model: null, role: 'Orchestrator', capabilities: ['plan', 'coordinate'], workstation: 'Command Center', real: 'Controller', fantasy: 'King', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', model: null, role: 'Builder', capabilities: ['implement', 'review'], workstation: 'Workshop', real: 'Engineer', fantasy: 'Dwarf builder', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'codex', name: 'Codex', provider: 'OpenAI', model: null, role: 'QA / security; implementation when assigned', capabilities: ['test', 'security', 'review', 'implement'], workstation: 'Testing Lab', real: 'Inspector', fantasy: 'Cyborg inspector', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'qwen', name: 'Qwen local', provider: 'Ollama', model: null, role: 'General local worker', capabilities: ['reason', 'implement'], workstation: 'Local Workshop', real: 'Technician', fantasy: 'Artificer', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'gemma', name: 'Gemma local', provider: 'Ollama', model: null, role: 'Utility worker', capabilities: ['classify', 'extract', 'summarize'], workstation: 'Archive', real: 'Analyst', fantasy: 'Scribe', executionAdapter: null, telemetryAdapter: null, usageSource: null },
  { id: 'hq-verifier', name: 'Local verifier', provider: 'Local Node.js', model: null, role: 'Allowlisted local verification process (not an AI model)', capabilities: ['verify-hq', 'verify-unit', 'inspect-repo'], workstation: 'Testing Lab', real: 'Test technician', fantasy: 'Clockwork tester', executionAdapter: 'local-checks', telemetryAdapter: 'child-process', usageSource: 'process-observation' },
];

export const operations = {
  'summarize-local': { label: 'Summarize text with a local model', capability: 'summarize', description: 'Opt-in Ollama bridge; summarizes only the task description, without tools or repository access.' },
  'inspect-repo': { label: 'Inspect repository source', capability: 'inspect-repo', description: 'Count source files locally; no network, credentials or database.' },
  'verify-hq': { label: 'Run HQ foundation tests', capability: 'verify-hq', description: 'Run isolated engine and persistence tests.' },
  'verify-unit': { label: 'Run Hillink unit tests', capability: 'verify-unit', description: 'Run existing pure unit tests; never seed or run E2E.' },
};
