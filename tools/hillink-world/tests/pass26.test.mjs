// Pass 2.6 (World side): implementation delegation shows ChatGPT WAITING on Claude, and Claude coding then testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HqTranslator } from '../adapters/hq.mjs';
import { WorldStore } from '../core/state.mjs';

const agent = (id, status, extra = {}) => ({ id, name: { chatgpt: 'ChatGPT', claude: 'Claude' }[id], role: 'r', real: 'x', fantasy: 'y', status, assignment: null, executionAdapter: `a-${id}`, adapterAvailable: true, ...extra });
const impl = (stage, extra = {}) => ({ id: 'i1', title: 'ChatGPT → Claude (implement): Add greet()', stage, agentId: 'claude', preferredAgentId: 'claude', capability: 'implement-repo', operation: 'implement-repo', safety: 'local-worktree-write', requestedBy: { agentId: 'chatgpt', taskId: 'o1' }, runId: 'r1', createdAt: 1, ...extra });
const orch = { id: 'o1', title: 'Kyle asks ChatGPT', stage: 'DONE', agentId: 'chatgpt', capability: 'coordinate', operation: 'orchestrate', safety: 'local-read-only', createdAt: 0, endedAt: 2 };
const live = (agents, tasks, runs) => { const s = new WorldStore(); s.reset(new HqTranslator().ingest({ seq: 1, now: 9000, health: { controller: 'ONLINE' }, agents, tasks, runs, alerts: {}, events: [] }).events); return s.world.agents; };
const running = { r1: { taskId: 'i1', agentId: 'claude', acknowledgedAt: 5, heartbeatAt: 8990 } };

test('Claude implementing: Claude WORKING (coding), ChatGPT WAITING on that real task, not WORKING', () => {
  const a = live([agent('chatgpt', 'IDLE'), agent('claude', 'RUNNING', { assignment: 'i1' })], [orch, impl('IMPLEMENTING')], running);
  assert.equal(a.claude.truth.state, 'WORKING'); assert.equal(a.claude.activity, 'coding');
  assert.equal(a.chatgpt.truth.state, 'WAITING');
  assert.match(a.chatgpt.truth.reason, /Waiting for Claude task i1 \(implementing\): ChatGPT → Claude \(implement\): Add greet\(\)/);
});

test('HQ running the acceptance tests shows Claude testing; the dependency clears when HQ ends the task', () => {
  const a = live([agent('chatgpt', 'IDLE'), agent('claude', 'RUNNING', { assignment: 'i1' })], [orch, impl('TESTING')], running);
  assert.equal(a.claude.activity, 'testing');
  const done = live([agent('chatgpt', 'IDLE'), agent('claude', 'IDLE')], [orch, impl('DONE', { endedAt: 9 })], { r1: { ...running.r1, endedAt: 9, terminal: 'COMPLETED' } });
  assert.equal(done.chatgpt.truth.state, 'IDLE'); assert.equal(done.claude.truth.state, 'IDLE');
  const blocked = live([agent('chatgpt', 'IDLE'), agent('claude', 'IDLE')], [orch, impl('BLOCKED', { endedAt: 9, blocker: 'Acceptance tests failed (0 passed, 1 failed).' })], { r1: { ...running.r1, endedAt: 9, terminal: 'BLOCKED' } });
  assert.equal(blocked.chatgpt.truth.state, 'IDLE', 'not waiting on a task that has ended');
  assert.equal(blocked.claude.truth.state, 'NEEDS_ATTENTION'); assert.match(blocked.claude.truth.reason, /Acceptance tests failed/);
});
