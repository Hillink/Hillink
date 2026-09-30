// Development simulation (brief §16). Emits World events tagged source "sim" into a store.
// It has no network access and no adapter: it cannot read or write Hillink data.
import { makeEvent } from '../core/events.mjs';
import { DEFAULT_DEFINITIONS } from '../core/agents.mjs';
import { DEV_AGENTS, DEV_ONBOARDING } from './dev-agents.mjs';

// Pass 5E: the simulated team comes from the registry's default definitions (core/agents.mjs), like any agent.
export const SIM_ROSTER = ['claude', 'codex'];
export const SIM_AGENTS = SIM_ROSTER.map(id => DEFAULT_DEFINITIONS[id]).map(d => ({ agentId: d.id, name: d.name, role: d.role, appearance: { color: d.appearance.palette.primary } }));
export const EXTRA_AGENTS = [
  { agentId: 'sales', name: 'Sales agent', role: 'Sales', appearance: { color: '#06d6a0' } },
  { agentId: 'support', name: 'Support agent', role: 'Support', appearance: { color: '#8338ec' } },
  { agentId: 'research', name: 'Research agent', role: 'Research', appearance: { color: '#f4a261' } },
  { agentId: 'security', name: 'Security agent', role: 'Security', appearance: { color: '#ef476f' } },
];
const SYSTEMS = [
  { systemId: 'supabase', name: 'Database', kind: 'database', state: 'ok' },
  { systemId: 'test-runner', name: 'Test runner', kind: 'tests', state: 'ok' },
  { systemId: 'vercel', name: 'Deploys', kind: 'deploy', state: 'ok' },
  { systemId: 'platform', name: 'Live platform', kind: 'platform', state: 'ok' },
];

export class Simulator {
  constructor(store, { now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) } = {}) {
    Object.assign(this, { store, now, schedule, cancel }); this.timers = new Set(); this.n = 0;
    this.scenarios = new Map(); this.current = null; this.sn = 0;
  }
  emit(type, fields) { this.store.dispatch(makeEvent(type, fields, { source: 'sim', at: this.now() })); }
  // Timers belong to the scenario that scheduled them, so a newer scenario can cancel an older one's future events.
  later(ms, fn) {
    const sc = this.current;
    const id = this.schedule(() => {
      this.timers.delete(id); sc?.timers.delete(id);
      const prev = this.current; this.current = sc;
      try { fn(); } finally { this.current = prev; }
      if (sc && !sc.timers.size) this.scenarios.delete(sc.id);
    }, ms);
    this.timers.add(id); sc?.timers.add(id);
  }
  stop() { for (const id of this.timers) this.cancel(id); this.timers.clear(); this.scenarios.clear(); }
  // Scenario ownership: starting a scenario cancels the pending events of any running scenario that drives
  // the same agents, so an older script can never silently overwrite a newer one. Returns what was cancelled.
  run(key) {
    const agents = new Set(scenarioAgents(key, this.store.world)), cancelled = [];
    for (const [id, sc] of this.scenarios) {
      if (![...sc.agents].some(a => agents.has(a))) continue;
      for (const t of sc.timers) { this.cancel(t); this.timers.delete(t); }
      this.scenarios.delete(id); cancelled.push(sc.label);
    }
    const sc = { id: ++this.sn, key, label: SCENARIOS.find(([k]) => k === key)?.[1] ?? key, agents, timers: new Set() };
    this.scenarios.set(sc.id, sc); this.current = sc;
    try { this[key](); } finally { this.current = null; }
    if (!sc.timers.size) this.scenarios.delete(sc.id);
    return cancelled;
  }
  running() { return [...this.scenarios.values()].map(sc => sc.label); }
  id(prefix) { this.n += 1; return `${prefix}-${this.now().toString(36)}-${this.n}`; }
  activeTask(agentId) { return this.store.world.agents[agentId]?.taskId ?? null; }

  seed() {
    for (const a of SIM_AGENTS) this.emit('AGENT_REGISTERED', { ...a, activity: 'idle' });
    for (const s of SYSTEMS) this.emit('SYSTEM_REGISTERED', s);
  }
  // Scenarios from the brief. Each uses only World events.
  claudeCodes() {
    const taskId = this.id('task');
    this.emit('TASK_CREATED', { taskId, title: 'Payment edge-case fix' });
    this.later(600, () => this.emit('TASK_STARTED', { taskId, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }));
  }
  codexTests() {
    const runId = this.id('tests'), taskId = this.id('task');
    this.emit('TASK_CREATED', { taskId, title: 'Run the unit suite (simulated)' });
    this.emit('TASK_STARTED', { taskId, agentId: 'codex', activity: 'testing', progress: { kind: 'stage', stage: 'Testing' } });
    this.emit('TESTS_STARTED', { runId, agentId: 'codex', taskId, suite: 'unit' });
    this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'busy' });
    return runId;
  }
  claudeMessagesCodex() {
    const taskId = this.activeTask('claude') ?? undefined;
    this.emit('AGENT_MESSAGE', { agentId: 'claude', toAgentId: 'codex', taskId, summary: 'Implementation ready for review' });
    const prId = Object.values(this.store.world.prs).find(p => p.taskId === taskId && p.state === 'open')?.id;
    this.later(400, () => this.emit('AGENT_REVIEWING', { agentId: 'codex', prId, detail: 'Reviewing Claude\'s handoff' }));
  }
  testFails() {
    const runId = Object.values(this.store.world.testRuns).find(r => r.state === 'running')?.id ?? this.codexTests();
    this.later(300, () => {
      const taskId = this.store.world.testRuns[runId]?.taskId ?? undefined;
      const failing = ['payouts › partial refund keeps fee (simulated)', 'payouts › retry after Stripe timeout (simulated)'];
      this.emit('TESTS_FINISHED', { runId, taskId, agentId: 'codex', passed: 69, failed: 2, failing });
      this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'degraded', detail: '2 failing tests' });
      this.emit('ISSUE_FOUND', { issueId: this.id('issue'), title: '2 unit tests failing', severity: 'high', location: 'testing', agentId: 'codex', taskId, runId, nextAction: 'Fix the 2 failing payout checks, then re-run the unit suite' });
      this.emit('AGENT_ERROR', { agentId: 'codex', taskId, detail: `Tests failed: ${failing[0]}` });
    });
  }
  testPasses() {
    const runId = Object.values(this.store.world.testRuns).find(r => r.state === 'running')?.id ?? this.codexTests();
    this.later(300, () => {
      const taskId = this.store.world.testRuns[runId]?.taskId ?? undefined;
      this.emit('TESTS_FINISHED', { runId, taskId, agentId: 'codex', passed: 71, failed: 0 });
      this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'ok' });
      for (const issue of Object.values(this.store.world.issues)) if (issue.open && issue.location === 'testing') this.emit('ISSUE_RESOLVED', { issueId: issue.id });
      if (taskId && this.store.world.tasks[taskId]?.status === 'active') this.emit('TASK_COMPLETED', { taskId, detail: '71 passed, 0 failed' });
      this.emit('AGENT_IDLE', { agentId: 'codex' });
    });
  }
  taskCompletes() {
    const taskId = this.activeTask('claude') ?? Object.values(this.store.world.tasks).find(t => t.status === 'active')?.id;
    if (!taskId) return this.claudeCodes();
    this.emit('PR_CREATED', { prId: this.id('pr'), title: 'Payment edge-case fix (simulated)', agentId: 'claude', taskId });
    this.emit('TASK_COMPLETED', { taskId, progress: { kind: 'stage', stage: 'Done' } });
  }
  deployBegins() { this.emit('DEPLOY_STARTED', { deployId: this.id('deploy'), target: 'preview' }); this.emit('SYSTEM_STATUS', { systemId: 'vercel', state: 'busy' }); }
  deploySucceeds() {
    const d = Object.values(this.store.world.deploys).find(x => x.state === 'running');
    const deployId = d?.id ?? this.id('deploy');
    if (!d) this.deployBegins();
    this.later(d ? 200 : 2500, () => { this.emit('DEPLOY_SUCCESS', { deployId }); this.emit('SYSTEM_STATUS', { systemId: 'vercel', state: 'ok' }); });
  }
  // ---- Pass 5E DEVELOPMENT HARNESS (simulated, source "sim"): any agent definition through the canonical lifecycle.
  // These emit the same lifecycle events a real provisioning backend would report; nothing is provisioned.
  defineAgent(def) { this.emit('AGENT_DEFINED', { agentId: def.id, definition: def }); }
  requestAgent(def) { this.emit('AGENT_REQUESTED', { agentId: def.id, definition: def, detail: 'Simulated request (development harness)' }); }
  provisionAgent(id, stage) { this.emit('AGENT_PROVISIONING', { agentId: id, stage, detail: 'Simulated (development harness)' }); }
  pauseProvisioning(id, detail) { this.emit('AGENT_PROVISIONING_WAITING', { agentId: id, detail }); }
  failProvisioning(id, detail) { this.emit('AGENT_PROVISIONING_FAILED', { agentId: id, detail }); }
  agentReady(id) { this.emit('AGENT_READY', { agentId: id, detail: 'Simulated (development harness)' }); }
  activateAgent(id) { this.emit('AGENT_ACTIVATED', { agentId: id }); }
  disableAgent(id) { this.emit('AGENT_DISABLED', { agentId: id }); }
  retireAgent(id) { this.emit('AGENT_RETIRED', { agentId: id }); }
  // A full simulated onboarding, one stage every stepMs: request, the provisioning stages, ready, active.
  onboard(def, { stepMs = 2500, fail = null } = {}) {
    this.requestAgent(def);
    DEV_ONBOARDING.forEach((stage, i) => this.later((i + 1) * stepMs, () => {
      if (fail && stage === fail) return this.failProvisioning(def.id, `Simulated failure at ${stage.toLowerCase().replace(/_/g, ' ')}`);
      if (fail && DEV_ONBOARDING.indexOf(stage) > DEV_ONBOARDING.indexOf(fail)) return;
      this.provisionAgent(def.id, stage);
    }));
    if (fail) return;
    this.later((DEV_ONBOARDING.length + 1) * stepMs, () => this.agentReady(def.id));
    this.later((DEV_ONBOARDING.length + 1) * stepMs + 600, () => this.activateAgent(def.id));
  }
  devOnboard() { this.onboard(DEV_AGENTS[0]); }
  devTwoAgents() { for (const d of DEV_AGENTS) this.onboard(d, { stepMs: 700 }); }
  devProvisionFails() { this.onboard(DEV_AGENTS[1], { stepMs: 1500, fail: 'CONNECTING_TOOLS' }); }
  devDisable() { this.disableAgent(DEV_AGENTS[0].id); }
  devRetire() { for (const d of DEV_AGENTS) if (this.store.world.agents[d.id]) this.retireAgent(d.id); }
  devWork() { const id = DEV_AGENTS[0].id, taskId = this.id('task'); this.emit('TASK_CREATED', { taskId, title: 'Market scan (simulated)' }); this.later(600, () => this.emit('TASK_STARTED', { taskId, agentId: id, activity: 'researching', progress: { kind: 'stage', stage: 'Researching' } })); }
  manyAgents() {
    for (const a of EXTRA_AGENTS) if (!this.store.world.agents[a.agentId]) this.emit('AGENT_REGISTERED', { ...a, activity: 'idle' });
    this.later(500, () => {
      this.emit('AGENT_RESEARCHING', { agentId: 'research' });
      this.emit('AGENT_MESSAGE', { agentId: 'sales', toAgentId: 'support', summary: 'New business lead handoff' });
      this.emit('AGENT_TESTING', { agentId: 'security' });
      const taskId = this.id('task'); this.emit('TASK_CREATED', { taskId, title: 'Follow up with 3 business leads' });
      this.emit('AGENT_WAITING', { agentId: 'support', detail: 'Waiting for sales handoff' });
    });
  }
  teamMeeting() {
    const ids = Object.keys(this.store.world.agents).slice(0, 4);
    this.meeting = this.id('meeting');
    const pr = Object.values(this.store.world.prs).at(-1);
    this.emit('MEETING_STARTED', { meetingId: this.meeting, agentIds: ids, topic: 'Plan the payout retry fix (simulated)', decision: 'Retry in the webhook, or in a scheduled job?', evidence: pr ? [{ kind: 'pr', ref: pr.id, summary: pr.title }] : [], taskId: pr?.taskId ?? undefined });
  }
  endMeeting() { if (this.meeting) this.emit('MEETING_ENDED', { meetingId: this.meeting, outcome: 'Retry in a scheduled job (simulated decision)' }); this.meeting = null; }
  ownerNeeded() { this.emit('ISSUE_FOUND', { issueId: this.id('issue'), title: 'Approve production SQL (simulated)', severity: 'high', location: 'command', agentId: 'codex', owner: true }); this.emit('AGENT_WAITING', { agentId: 'codex', detail: 'Waiting for Kyle' }); }
  queueWork(count = 5) { for (let i = 0; i < count; i++) this.emit('TASK_CREATED', { taskId: this.id('task'), title: `Queued task ${this.n}` }); }
  allIdle() { for (const a of Object.values(this.store.world.agents)) this.emit('AGENT_IDLE', { agentId: a.id }); }
  systemError() {
    this.emit('SYSTEM_STATUS', { systemId: 'supabase', state: 'down', detail: 'Connection refused (simulated)' });
    this.emit('ISSUE_FOUND', { issueId: this.id('issue'), title: 'Database unreachable', severity: 'high', location: 'servers' });
  }
  systemRecovers() {
    this.emit('SYSTEM_STATUS', { systemId: 'supabase', state: 'ok' });
    for (const issue of Object.values(this.store.world.issues)) if (issue.open && issue.location === 'servers') this.emit('ISSUE_RESOLVED', { issueId: issue.id });
  }
  // Kyle's acceptance scenario (redesign directive §31): Claude is given a task in the Break Room, travels
  // to Engineering by the elevator and works; the finished work becomes a pull request on the review
  // tray; Codex is asked to review, travels there and inspects it; the review passes. Timings leave room
  // for the walks, but nothing waits on the view: these are the same events a real source would send.
  reviewJourney({ work = 42000, review = 36000 } = {}) {
    const taskId = this.id('task'), prId = this.id('pr'), title = 'Athlete payout edge case (simulated)';
    this.emit('TASK_CREATED', { taskId, title });
    this.later(1500, () => this.emit('TASK_STARTED', { taskId, agentId: 'claude', activity: 'coding', progress: { kind: 'stage', stage: 'Implementing' } }));
    // Simulated commits: evidence the task moved, not a percentage.
    this.later(Math.round(work * 0.5), () => this.emit('TASK_PROGRESS', { taskId, detail: 'Guard partial refunds (simulated commit)', evidence: { kind: 'commit', ref: 'sim-1a2b3c' } }));
    this.later(Math.round(work * 0.8), () => this.emit('TASK_PROGRESS', { taskId, progress: { kind: 'stage', stage: 'Tests passing locally' }, detail: 'Add payout edge-case tests (simulated commit)', evidence: { kind: 'commit', ref: 'sim-4d5e6f' } }));
    this.later(work, () => {
      this.emit('PR_CREATED', { prId, title, agentId: 'claude', taskId, reviewerId: 'codex' });
      this.emit('TASK_COMPLETED', { taskId, progress: { kind: 'stage', stage: 'Review required' }, detail: 'Handed to Codex for review' });
      this.emit('AGENT_REVIEWING', { agentId: 'codex', prId, detail: `Reviewing: ${title}` });
    });
    this.later(work + review, () => { this.emit('PR_REVIEWED', { prId, verdict: 'approved', summary: 'no blocking findings (simulated)' }); this.emit('AGENT_IDLE', { agentId: 'codex' }); });
    this.later(work + review + 5000, () => this.emit('AGENT_IDLE', { agentId: 'claude' }));
  }
  // Construction, one real-shaped milestone per click (no timers: nothing advances on its own).
  // The pass is marked simulated everywhere it shows; LIVE mode only ever draws passes from git and GitHub.
  constructionStep() {
    const pass = this.store.world.passes?.[SIM_PASS.id], done = pass ? Object.keys(pass.evidence).length + 1 : 0;
    const step = SIM_PASS_STEPS[done];
    if (!step) return false;
    const [type, fields] = step;
    this.emit(type, { passId: SIM_PASS.id, ...fields });
    return true;
  }
  // A scripted walkthrough of the whole loop.
  tour() {
    const steps = [() => this.claudeCodes(), () => this.claudeMessagesCodex(), () => this.codexTests(), () => this.testFails(), () => this.emit('AGENT_THINKING', { agentId: 'claude' }),
      () => this.testPasses(), () => this.taskCompletes(), () => this.deployBegins(), () => this.deploySucceeds(), () => this.allIdle()];
    steps.forEach((fn, i) => this.later(i * 3000, fn));
  }
}

export const SIM_PASS = {
  id: 'sim-pass', title: 'Pass 2 (simulated): operations annex', order: 2,
  structures: [{ id: 'ops-annex', kind: 'annex', name: 'Operations annex', floor: 0, x0: 690, x1: 796, z0: 40, z1: 98, h: 84, sitePoints: ['site1', 'site2'] }],
};
const sha = n => `51a${String(n).padStart(4, '0')}`.padEnd(40, '0');
const commit = (n, summary, by = 'claude') => ['PASS_EVIDENCE', { agentId: by, evidence: { kind: 'commit', ref: sha(n), key: `commit:${sha(n)}`, summary, by } }];
const ci = (n, state, summary) => ['PASS_EVIDENCE', { evidence: { kind: 'ci', ref: sha(n), sha: sha(n), key: `ci:${sha(n)}:${state}`, state, summary } }];
const review = (id, state, summary) => ['PASS_EVIDENCE', { agentId: 'codex', evidence: { kind: 'review', ref: id, key: `review:${id}`, state, by: 'codex', summary } }];
export const SIM_PASS_STEPS = [
  ['PASS_PLANNED', { title: SIM_PASS.title, summary: 'Simulated milestones for trying the construction view. Not real Hillink work.', structures: SIM_PASS.structures, order: SIM_PASS.order }],
  ['PASS_EVIDENCE', { evidence: { kind: 'branch', ref: 'sim/annex', key: 'branch', summary: 'Branch sim/annex' } }],
  commit(1, 'Slab and frame for the annex'),
  commit(2, 'Beams and walls'),
  ['PASS_EVIDENCE', { evidence: { kind: 'pr', ref: '#sim', key: 'pr:ready', state: 'ready', summary: 'PR opened for review' } }],
  ci(2, 'running', 'CI: running'),
  ci(2, 'failed', 'Failing: unit tests'),
  commit(3, 'Fix the failing unit tests'),
  ci(3, 'passed', 'CI: passed'),
  review('r1', 'changes_requested', 'Board text is too small to read'),
  commit(4, 'Larger board text (review fix)'),
  ci(4, 'passed', 'CI: passed'),
  review('r2', 'approved', 'No blocking findings'),
  ['PASS_EVIDENCE', { evidence: { kind: 'merge', ref: '#sim', key: 'merge', summary: 'Merged to main' } }],
];

// Which agents a scenario drives (for scenario ownership).
function scenarioAgents(key, world) {
  const all = Object.keys(world.agents);
  return {
    reviewJourney: ['claude', 'codex'], claudeCodes: ['claude'], codexTests: ['codex'], claudeMessagesCodex: ['claude', 'codex'],
    testFails: ['codex'], testPasses: ['codex'], taskCompletes: ['claude'], ownerNeeded: ['codex'], tour: ['claude', 'codex'],
    teamMeeting: all.slice(0, 4), manyAgents: EXTRA_AGENTS.map(a => a.agentId), allIdle: all,
    devOnboard: [DEV_AGENTS[0].id], devTwoAgents: DEV_AGENTS.map(d => d.id), devProvisionFails: [DEV_AGENTS[1].id], devDisable: [DEV_AGENTS[0].id], devRetire: DEV_AGENTS.map(d => d.id), devWork: [DEV_AGENTS[0].id],
  }[key] ?? [];
}

export const SCENARIOS = [
  ['reviewJourney', 'Claude builds, Codex reviews'], ['claudeCodes', 'Claude starts coding'], ['codexTests', 'Codex starts testing'], ['claudeMessagesCodex', 'Claude messages Codex'],
  ['testFails', 'Test fails'], ['testPasses', 'Test succeeds'], ['taskCompletes', 'Task completes'], ['deployBegins', 'Deployment begins'],
  ['deploySucceeds', 'Deployment succeeds'], ['teamMeeting', 'Start a meeting'], ['endMeeting', 'End the meeting'], ['ownerNeeded', 'Needs Kyle'], ['manyAgents', 'Many agents at once'], ['queueWork', 'Queue 5 tasks'], ['allIdle', 'Agents go idle'],
  ['devOnboard', 'DEV: onboard an unknown agent'], ['devTwoAgents', 'DEV: onboard two unknown agents'], ['devProvisionFails', 'DEV: provisioning fails'], ['devWork', 'DEV: unknown agent works'], ['devDisable', 'DEV: disable the unknown agent'], ['devRetire', 'DEV: retire the dev agents'],
  ['constructionStep', 'Construction: next milestone'], ['systemError', 'System error'], ['systemRecovers', 'System recovers'], ['tour', 'Play full tour'],
];
