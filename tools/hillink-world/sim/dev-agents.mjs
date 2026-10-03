// Pass 5E DEVELOPMENT HARNESS. Fixture agents the World has never heard of, used to prove that nothing in the World
// depends on a hard-coded agent id, role or look. They exist only in the development simulator (source "sim"): they are
// not Hillink agents, HQ knows nothing about them, and every lifecycle step they take here is SIMULATED. No real
// provider, tool connection or provisioning happens. The ids and definitions below are data; no code anywhere tests for
// them by name.
export const DEV_AGENTS = [
  {
    id: 'agent-test-unknown', name: 'Test Unknown', kind: 'agent', provider: 'dev-fixture', model: 'none (simulated)',
    role: 'Research: market analyst', roleTitle: 'Market analysis', roleDescription: 'DEV FIXTURE: a researcher defined at runtime.',
    responsibilities: ['market research'], capabilities: ['research'], tools: ['web-search (simulated)'], permissions: ['read-only'], team: 'Growth',
    appearance: { archetype: 'human', rig: 'humanoid', palette: { shirt: '#2a9d8f', pants: '#264653', hair: '#e9c46a', skin: '#f1c7a0', accent: '#e76f51' }, accessories: ['glasses', 'headset'],
      themes: { fantasy: { archetype: 'elf', palette: { shirt: '#4c956c', accent: '#d68c45' }, accessories: ['hood'] } } },
    meta: { fixture: true },
  },
  {
    id: 'agent-test-second', name: 'Test Second', kind: 'agent', provider: 'dev-fixture',
    role: 'Operations: site reliability', roleTitle: 'Reliability', team: 'Operations',
    appearance: { archetype: 'golem', rig: 'golem', body: { heightScale: 1.15, scale: 1.1, width: 1.3 }, palette: { shirt: '#6d6875', pants: '#3d3a4b', hair: '#b5838d', accent: '#ffb703' }, clothing: ['vest', 'hardhat'] },
    meta: { fixture: true, note: 'rig "golem" is not drawn yet: it falls back to the humanoid with its declared height' },
    unknownFutureField: { from: 'a newer HQ', kept: true },
  },
];
// The provisioning stages a fixture walks through, in order (all simulated).
export const DEV_ONBOARDING = ['CONFIGURING', 'CONNECTING_PROVIDER', 'CONNECTING_TOOLS', 'GENERATING_APPEARANCE', 'TESTING'];
