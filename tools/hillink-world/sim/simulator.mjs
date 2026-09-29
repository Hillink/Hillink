// Development simulation (brief §16). Emits World events tagged source "sim" into a store.
// It has no network access and no adapter: it cannot read or write Hillink data.
import { makeEvent } from '../core/events.mjs';

export const SIM_AGENTS = [
  { agentId: 'claude', name: 'Claude', role: 'Engineering: builder', appearance: { color: '#e2711d' } },
  { agentId: 'codex', name: 'Codex', role: 'Engineering: QA and security', appearance: { color: '#3a86ff' } },
];
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
  }
  emit(type, fields) { this.store.dispatch(makeEvent(type, fields, { source: 'sim', at: this.now() })); }
  later(ms, fn) { const id = this.schedule(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); }
  stop() { for (const id of this.timers) this.cancel(id); this.timers.clear(); }
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
    const runId = this.id('tests');
    this.emit('AGENT_TESTING', { agentId: 'codex' });
    this.emit('TESTS_STARTED', { runId, agentId: 'codex', suite: 'unit' });
    this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'busy' });
    return runId;
  }
  claudeMessagesCodex() { this.emit('AGENT_MESSAGE', { agentId: 'claude', toAgentId: 'codex', summary: 'Implementation ready for review' }); this.later(400, () => this.emit('AGENT_REVIEWING', { agentId: 'codex' })); }
  testFails() {
    const runId = Object.values(this.store.world.testRuns).find(r => r.state === 'running')?.id ?? this.codexTests();
    this.later(300, () => {
      this.emit('TESTS_FINISHED', { runId, passed: 69, failed: 2 });
      this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'degraded', detail: '2 failing tests' });
      this.emit('ISSUE_FOUND', { issueId: this.id('issue'), title: '2 unit tests failing', severity: 'high', location: 'testing', agentId: 'codex' });
      this.emit('AGENT_ERROR', { agentId: 'codex', detail: 'Tests failed' });
    });
  }
  testPasses() {
    const runId = Object.values(this.store.world.testRuns).find(r => r.state === 'running')?.id ?? this.codexTests();
    this.later(300, () => {
      this.emit('TESTS_FINISHED', { runId, passed: 71, failed: 0 });
      this.emit('SYSTEM_STATUS', { systemId: 'test-runner', state: 'ok' });
      for (const issue of Object.values(this.store.world.issues)) if (issue.open && issue.location === 'testing') this.emit('ISSUE_RESOLVED', { issueId: issue.id });
      this.emit('AGENT_IDLE', { agentId: 'codex' });
    });
  }
  taskCompletes() {
    const taskId = this.activeTask('claude') ?? Object.values(this.store.world.tasks).find(t => t.status === 'active')?.id;
    if (!taskId) return this.claudeCodes();
    this.emit('TASK_COMPLETED', { taskId, progress: { kind: 'stage', stage: 'Done' } });
    this.emit('PR_CREATED', { prId: this.id('pr'), title: 'Payment edge-case fix' });
  }
  deployBegins() { this.emit('DEPLOY_STARTED', { deployId: this.id('deploy'), target: 'preview' }); this.emit('SYSTEM_STATUS', { systemId: 'vercel', state: 'busy' }); }
  deploySucceeds() {
    const d = Object.values(this.store.world.deploys).find(x => x.state === 'running');
    const deployId = d?.id ?? this.id('deploy');
    if (!d) this.deployBegins();
    this.later(d ? 200 : 2500, () => { this.emit('DEPLOY_SUCCESS', { deployId }); this.emit('SYSTEM_STATUS', { systemId: 'vercel', state: 'ok' }); });
  }
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
    this.emit('MEETING_STARTED', { meetingId: this.meeting, agentIds: ids, topic: 'Planning (simulated)' });
  }
  endMeeting() { if (this.meeting) this.emit('MEETING_ENDED', { meetingId: this.meeting }); this.meeting = null; }
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
  // A scripted walkthrough of the whole loop.
  tour() {
    const steps = [() => this.claudeCodes(), () => this.claudeMessagesCodex(), () => this.codexTests(), () => this.testFails(), () => this.emit('AGENT_THINKING', { agentId: 'claude' }),
      () => this.testPasses(), () => this.taskCompletes(), () => this.deployBegins(), () => this.deploySucceeds(), () => this.allIdle()];
    steps.forEach((fn, i) => this.later(i * 3000, fn));
  }
}

export const SCENARIOS = [
  ['claudeCodes', 'Claude starts coding'], ['codexTests', 'Codex starts testing'], ['claudeMessagesCodex', 'Claude messages Codex'],
  ['testFails', 'Test fails'], ['testPasses', 'Test succeeds'], ['taskCompletes', 'Task completes'], ['deployBegins', 'Deployment begins'],
  ['deploySucceeds', 'Deployment succeeds'], ['teamMeeting', 'Start a meeting'], ['endMeeting', 'End the meeting'], ['ownerNeeded', 'Needs Kyle'], ['manyAgents', 'Many agents at once'], ['queueWork', 'Queue 5 tasks'], ['allIdle', 'Agents go idle'],
  ['systemError', 'System error'], ['systemRecovers', 'System recovers'], ['tour', 'Play full tour'],
];
