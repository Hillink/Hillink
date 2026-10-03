// HQ progress telemetry (orchestration/progress.mjs). Progress is derived from HQ's journal only: these tests feed real
// journal events (through the engine's own validation) or drive real objectives through the conductor, runner, git
// and HQ-run tests (orchestration harness), then read what HQ derives at every sequence number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, emptyState, reduce } from '../engine.mjs';
import { MemoryStore } from '../store.mjs';
import { createHQ } from '../server.mjs';
import { planObjective } from '../orchestration/planner.mjs';
import { worldSnapshot } from '../orchestration/activity.mjs';
import { createToolbox } from '../orchestrator-tools.mjs';
import { progressSnapshot, progressFingerprint, taskProgress, objectiveProgress, PROFILES, HQ_OP_LABELS, PROGRESS_STATES } from '../orchestration/progress.mjs';
import { harness, scriptedAgent, handoffText, investigation, review, greetingFiles, role } from './orchestration-harness.mjs';

const SCOPE = ['sandbox/hq-implementation/'], TESTS = ['sandbox/hq-implementation/greeting.test.mjs'];
const CONTRACT = { objective: 'Write greet().', scope: SCOPE, tests: TESTS, acceptanceCriteria: 'The test passes.', constraints: 'Scope only.' };

// A bench: the real engine and journal, no adapters. Runs are started with the journal's own DISPATCHED event and
// evidence enters through engine.workerEvent (the same validation every adapter's evidence goes through).
function bench({ store = new MemoryStore() } = {}) {
  const clock = { t: 5_000_000 };
  const engine = new Engine({ store, now: () => clock.t, config: { heartbeatMs: 3_600_000, progressMs: 3_600_000 } });
  engine.initialize();
  if (!engine.state.agents.claude.capabilities.includes('implement-repo')) engine.configureAgent('claude', { capabilities: ['implement', 'review', 'review-repo', 'implement-repo'] });
  if (!engine.state.agents.codex.capabilities.includes('review-repo')) engine.configureAgent('codex', { capabilities: ['test', 'security', 'review', 'investigate', 'review-repo'] });
  let n = 0;
  const b = {
    engine, clock, store,
    snap: () => progressSnapshot(engine.state, { now: clock.t, statusOf: a => engine.status(a) }),
    agent: id => b.snap().agents.find(a => a.agent === id),
    task: id => taskProgress(engine.state, engine.state.tasks[id], { now: clock.t, statusOf: a => engine.status(a) }),
    implement: (link = null, repair = null) => engine.createTask({ title: 'Implement greet', description: CONTRACT.objective, operation: 'implement-repo', safety: 'local-worktree-write', priority: 50, preferredAgentId: 'claude', implementation: CONTRACT }, { link, repair }),
    readOnly: (agentId, link = null) => engine.createTask({ title: `Review by ${agentId}`, description: 'Read the repository and answer.', operation: 'review-repo', safety: 'local-read-only', priority: 50, preferredAgentId: agentId }, { link }),
    dispatch: (taskId, agentId) => { const runId = `run-${++n}`; engine.emit('DISPATCHED', { taskId, agentId, runId, compute: null }); return runId; },
    ev: (runId, kind, extra = {}) => { clock.t += 1000; engine.workerEvent(runId, { kind, summary: extra.summary ?? `${kind} evidence`, ...extra }); },
    phase: (runId, reason) => b.ev(runId, 'PROGRESS', { summary: `${reason} started (HQ step).`, inFlight: true, phases: [{ id: `hq-op:${++n}`, state: 'begin', reason, boundMs: 60_000 }] }),
    broker: (runId, event, outcome = 'ok') => b.ev(runId, 'BROKER', { summary: `${event} (${outcome})`, broker: { event, outcome } }),
    // An objective with an explicit plan (planner output, or given steps), journaled the way the conductor does it.
    objective: (input, steps = null) => {
      const id = `obj-${++n}`;
      engine.emit('OBJECTIVE_CREATED', { id, input: { title: input.title ?? 'Objective', scope: [], tests: [], ...input }, requestedBy: null, limits: { maxRepairs: 1 }, deadlineAt: clock.t + 3_600_000 });
      const plan = planObjective(engine.state.objectives[id]);
      engine.emit('OBJECTIVE_PLANNED', { objectiveId: id, plan: steps ? { ...plan, steps } : plan });
      return engine.state.objectives[id];
    },
  };
  return b;
}
// Implementation evidence in the order HQ's sandboxed runner and broker produce it.
function implementToAcceptance(b, runId) {
  const seen = [];
  const at = () => seen.push(b.agent('claude').progress);
  b.ev(runId, 'ACK', { summary: 'HQ implementation runner started.' }); at();
  b.phase(runId, 'Creating the task worktree'); at();
  b.phase(runId, 'Sandbox hq-sbx-1 creation'); at();
  b.ev(runId, 'MODEL_OUTPUT', { summary: 'Claude Code session started.' }); at();
  b.broker(runId, 'BROKER_READ'); at();
  b.broker(runId, 'BROKER_WRITE_ALLOWED', 'written'); at();
  b.broker(runId, 'BROKER_READ'); at();
  b.broker(runId, 'SANDBOX_TEST_STARTED', 'started'); at();
  b.broker(runId, 'SANDBOX_TEST_COMPLETED', 'passed'); at();
  b.phase(runId, 'HQ diff of the sandbox'); at();
  b.ev(runId, 'FINDING', { summary: 'Changed 2 file(s)', files: ['sandbox/hq-implementation/greeting.mjs'] }); at();
  b.ev(runId, 'TEST_STARTED', { summary: 'HQ running the acceptance tests.' }); at();
  return seen;
}
// Progress at every journal sequence number, recomputed from scratch (the way a restarted HQ would see it).
function trajectory(events, pick) {
  const state = emptyState(), out = [];
  for (const e of events) { reduce(state, e); out.push({ seq: e.seq, type: e.type, kind: e.data.kind, value: pick(progressSnapshot(state, { now: e.at }), state) }); }
  return out;
}
const nonDecreasing = list => list.every((v, i) => i === 0 || v >= list[i - 1]);

test('P1. a new assignment starts at its profile\'s first milestone: ASSIGNED 0%, then the runner\'s acknowledgement', () => {
  const b = bench();
  const id = b.implement();
  assert.equal(b.agent('claude').status, 'WAITING', 'queued work is WAITING, never a percentage');
  assert.equal(b.agent('claude').progress, null);
  const run = b.dispatch(id, 'claude');
  let a = b.agent('claude');
  assert.equal(a.status, 'ASSIGNED'); assert.equal(a.progress, 0); assert.equal(a.milestone, 'ASSIGNED');
  assert.equal(a.taskId, id); assert.equal(a.startedAt, b.clock.t); assert.equal(a.elapsedMs, 0);
  b.ev(run, 'ACK');
  a = b.agent('claude');
  assert.equal(a.status, 'WORKING'); assert.equal(a.progress, 5); assert.equal(a.milestone, 'PREPARING');
  // A read-only agent's profile starts the same way, with its own milestones.
  const r = b.readOnly('codex'), rr = b.dispatch(r, 'codex');
  assert.equal(b.agent('codex').progress, 0);
  b.ev(rr, 'ACK'); assert.equal(b.agent('codex').progress, 10); assert.equal(b.agent('codex').milestone, 'STARTED');
});

test('P2. real milestones advance progress, never backwards; earlier-kind evidence does not move the bar or the activity', () => {
  const b = bench();
  const id = b.implement(), run = b.dispatch(id, 'claude');
  const seen = implementToAcceptance(b, run);
  assert.deepEqual(seen, [5, 5, 5, 15, 15, 30, 30, 45, 55, 65, 65, 75]);
  assert.ok(nonDecreasing(seen));
  let a = b.agent('claude');
  assert.equal(a.milestone, 'ACCEPTANCE_TESTING'); assert.equal(a.activity, 'HQ running the acceptance tests');
  b.ev(run, 'TEST_RESULT', { result: 'passed', summary: '1 passed; 0 failed.' });
  b.ev(run, 'COMMIT', { summary: 'Committed abc on hq/impl/x.', sha: 'a'.repeat(40) });
  a = b.agent('claude'); assert.equal(a.progress, 90); assert.equal(a.milestone, 'COMMITTING');
  // Reading again after editing: same milestone, same activity.
  const e = bench(), eid = e.implement(), er = e.dispatch(eid, 'claude');
  e.ev(er, 'ACK'); e.broker(er, 'BROKER_WRITE_ALLOWED', 'written');
  const before = e.agent('claude');
  e.broker(er, 'BROKER_READ'); e.ev(er, 'MODEL_OUTPUT', { summary: 'Claude step 4: used repo_read.' });
  const after = e.agent('claude');
  assert.equal(after.progress, before.progress); assert.equal(after.activity, before.activity); assert.equal(after.milestone, 'EDITING');
});

test('P3. an agent cannot set the authoritative percentage: progress fields and "90% done" text are journaled but never read', () => {
  const b = bench();
  const id = b.implement(), run = b.dispatch(id, 'claude');
  b.ev(run, 'ACK');
  const before = b.agent('claude');
  b.ev(run, 'PROGRESS', { summary: 'I am 90% done.', progress: 90, percent: 90, milestone: 'COMPLETE', status: 'COMPLETE' });
  b.ev(run, 'MODEL_OUTPUT', { summary: 'Progress: 99%. Almost finished!', progress: 99 });
  b.ev(run, 'HEARTBEAT', { summary: 'alive', progress: 100 });
  const after = b.agent('claude');
  assert.ok(b.engine.state.tasks[id].evidence.some(e => e.progress === 90), 'the claim is in the journal (evidence is never dropped)');
  assert.equal(after.progress, 15, 'a model message is only "the session is working" (INVESTIGATING), whatever it says');
  assert.notEqual(after.milestone, 'COMPLETE'); assert.equal(after.status, 'WORKING');
  assert.ok(after.progress < 90 && before.progress === 5);
  // A read-only agent's answer text cannot claim completion either: only HQ's acceptance of the handoff is 100.
  const r = b.readOnly('codex'), rr = b.dispatch(r, 'codex');
  b.ev(rr, 'ACK'); b.ev(rr, 'MODEL_RESULT', { summary: 'DONE. 100% complete.', fullText: 'progress: 100%' });
  assert.equal(b.agent('codex').progress, 85); assert.equal(b.agent('codex').milestone, 'ANSWERED');
});

test('P4. a failed acceptance test returns the work to EDITING; the run that ends there is BLOCKED with no percentage', () => {
  const b = bench();
  const id = b.implement(), run = b.dispatch(id, 'claude');
  implementToAcceptance(b, run);
  assert.equal(b.agent('claude').progress, 75);
  b.ev(run, 'TEST_RESULT', { result: 'failed', summary: '0 passed; 1 failed.' });
  let a = b.agent('claude');
  assert.equal(a.progress, 30); assert.equal(a.milestone, 'EDITING'); assert.match(a.activity, /Acceptance tests failed/);
  b.ev(run, 'BLOCKED', { summary: 'Acceptance tests failed; nothing committed.' });
  const t = b.task(id);
  assert.equal(t.status, 'BLOCKED'); assert.equal(t.progress, null); assert.equal(t.frozenProgress, 30);
  assert.match(t.activity, /waiting for HQ's repair decision/);
  // The agent's run is over: it is IDLE, with no stale percentage.
  a = b.agent('claude'); assert.equal(a.status, 'IDLE'); assert.equal(a.progress, null); assert.equal(a.last.outcome, 'BLOCKED');
  // A failed sandbox test run inside a run regresses the same way and is counted.
  const c = bench(), cid = c.implement(), cr = c.dispatch(cid, 'claude');
  c.ev(cr, 'ACK'); c.broker(cr, 'BROKER_WRITE_ALLOWED', 'written'); c.broker(cr, 'SANDBOX_TEST_STARTED', 'started');
  assert.equal(c.agent('claude').progress, 45);
  c.broker(cr, 'SANDBOX_TEST_COMPLETED', 'failed');
  a = c.agent('claude');
  assert.equal(a.progress, 30); assert.equal(a.activity, 'Repairing after a failed sandbox test run'); assert.equal(a.sandboxTestFailures, 1);
  c.broker(cr, 'BROKER_WRITE_ALLOWED', 'written'); c.broker(cr, 'SANDBOX_TEST_STARTED', 'started'); c.broker(cr, 'SANDBOX_TEST_COMPLETED', 'passed');
  assert.equal(c.agent('claude').progress, 55);
});

test('P5. repair/retry: HQ\'s real repair run shows "Repairing failed acceptance test", Retry 1/1, from the repair floor', async () => {
  const codex = scriptedAgent('Codex', task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()) }));
  const h = harness({ codex, claudeFiles: (_, n) => greetingFiles(undefined, n === 1 ? 'Hi' : 'Hello') });
  const id = h.conductor.submit({ objective: 'greet() is missing; fix it.', type: 'fix', scope: SCOPE });
  await h.drive(h.settled(id));
  assert.equal(h.objective(id).status, 'COMPLETE');
  const [first, repair] = h.tasks(t => t.operation === 'implement-repo').sort((x, y) => x.createdAt - y.createdAt || (x.repair ? 1 : -1));
  assert.ok(repair.repair, 'the second implementation task is HQ\'s repair');
  // Every journal position, recomputed from scratch: the first run's acceptance failure regresses, the repair carries its retry.
  const claude = trajectory(h.engine.state.events, p => p.agents.find(a => a.agent === 'claude') ?? {}).filter(x => x.value.agent);
  const firstRun = claude.filter(x => x.value.taskId === first.id && x.value.status === 'WORKING').map(x => x.value.progress);
  assert.ok(firstRun.includes(75), 'the first attempt reached acceptance testing');
  const failedAt = claude.findIndex(x => x.value.taskId === first.id && x.kind === 'TEST_RESULT');
  assert.equal(claude[failedAt].value.progress, 30, 'returned to editing, not 80%');
  const repairing = claude.filter(x => x.value.taskId === repair.id && ['ASSIGNED', 'WORKING'].includes(x.value.status));
  assert.ok(repairing.length > 0);
  assert.equal(repairing[0].value.progress, 30, 'the repair starts at the repair floor, not at 0 and not at 75');
  assert.match(repairing[0].value.activity, /^Repairing failed acceptance test/);
  assert.deepEqual(repairing[0].value.retry, { count: 1, max: 1, reason: 'test_failure' });
  assert.ok(nonDecreasing(repairing.map(x => x.value.progress)), 'the repair then advances by real milestones');
  assert.ok(repairing.every(x => x.value.progress >= 30));
  // The objective's implementation phase reopened at the floor too.
  const obj = trajectory(h.engine.state.events, p => p.objectives.find(o => o.objectiveId === id));
  const atRetry = obj.find(x => x.type === 'STEP_RETRY');
  const implItem = atRetry.value.checklist.find(i => i.key === 'implement');
  assert.equal(implItem.status, 'pending'); assert.equal(implItem.retries, 1);
});

test('P6/P7/P10. verification and review update objective progress; COMPLETE is 100 and only COMPLETE', async () => {
  const codex = scriptedAgent('Codex', task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()) }));
  const h = harness({ codex });
  const id = h.conductor.submit({ objective: 'greet() is missing; fix it.', type: 'fix', scope: SCOPE });
  await h.drive(h.settled(id));
  assert.equal(h.objective(id).status, 'COMPLETE');
  const obj = trajectory(h.engine.state.events, p => p.objectives.find(o => o.objectiveId === id)).filter(x => x.value);
  const values = obj.map(x => x.value.progress);
  assert.ok(nonDecreasing(values), `objective progress never goes backwards on a clean run: ${values.join(',')}`);
  assert.equal(values.at(-1), 100);
  assert.ok(values.slice(0, -1).every(v => v < 100), 'nothing before COMPLETE shows 100');
  const step = kind => h.objective(id).order.map(s => h.objective(id).steps[s]).find(s => s.kind === kind);
  const doneAt = kind => obj.findIndex(x => x.type === 'STEP_TRANSITION' && h.engine.state.events[x.seq - 1].data.stepId === step(kind).id && h.engine.state.events[x.seq - 1].data.to === 'DONE');
  const v = doneAt('verify'), r = doneAt('review');
  assert.ok(v > 0 && r > v);
  assert.ok(obj[v].value.progress > obj[v - 1].value.progress, 'HQ verification raised objective progress');
  assert.equal(obj[v].value.checklist.find(i => i.key === 'verify').status, 'done');
  assert.ok(obj[r].value.progress > obj[r - 1].value.progress, 'the review raised objective progress');
  assert.equal(obj[r].value.checklist.find(i => i.key === 'review').status, 'done');
  assert.deepEqual(obj.at(-1).value.checklist.map(i => [i.label, i.status]), [['Investigation', 'done'], ['Implementation', 'done'], ['HQ verification', 'done'], ['Review', 'done']]);
  // While HQ verifies, the verification shows as HQ's own system agent with its objective.
  const verifying = trajectory(h.engine.state.events, p => p.agents.find(a => a.agent === 'hq')).find(x => x.value);
  assert.equal(verifying.value.status, 'WORKING'); assert.equal(verifying.value.objectiveId, id); assert.equal(verifying.value.stepKind, 'verify');
  // The implementation step itself reached COMPLETE 100 once HQ accepted its handoff.
  const implTask = h.engine.state.tasks[step('implement').taskId];
  const t = taskProgress(h.engine.state, implTask, { now: h.clock.t });
  assert.equal(t.status, 'COMPLETE'); assert.equal(t.progress, 100);
});

test('P7b. a review that requests changes reopens implementation (progress drops truthfully), then the repair completes', async () => {
  let reviews = 0;
  const codex = scriptedAgent('Codex', task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : (++reviews === 1 ? review({ verdict: 'request_changes', findings: [{ severity: 'high', detail: 'greet() must trim the name.', file: 'sandbox/hq-implementation/greeting.mjs' }], recommendation: 'Trim the input.' }) : review())) }));
  const h = harness({ codex, claudeFiles: (_, n) => ({ ...greetingFiles(), ...(n > 1 ? { 'sandbox/hq-implementation/NOTES.md': 'Names are trimmed.\n' } : {}) }) });
  const id = h.conductor.submit({ objective: 'greet() is missing; fix it.', type: 'fix', scope: SCOPE });
  await h.drive(h.settled(id));
  const o = h.objective(id);
  const obj = trajectory(h.engine.state.events, p => p.objectives.find(x => x.objectiveId === id)).filter(x => x.value);
  const added = obj.findIndex(x => x.type === 'STEP_ADDED' && h.engine.state.events[x.seq - 1].data.step.repair?.fromReview);
  if (added < 0) assert.fail(`no review repair was planned (objective ${o.status}: ${o.statusReason})`);
  assert.ok(obj[added].value.progress < obj[added - 1].value.progress, 'review changes requested: objective progress goes down, not up');
  assert.equal(obj[added].value.checklist.find(i => i.key === 'implement').repair, 1);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  assert.equal(obj.at(-1).value.progress, 100);
  const repairTask = Object.values(h.engine.state.tasks).find(t => t.repair?.fromReview);
  assert.ok(repairTask, 'HQ ran a repair of the review findings');
  {
    const claude = trajectory(h.engine.state.events, p => p.agents.find(a => a.agent === 'claude') ?? {}).filter(x => x.value.taskId === repairTask.id && x.value.status === 'WORKING');
    assert.match(claude[0].value.activity, /^Repairing review findings/);
    assert.deepEqual(claude[0].value.retry, { count: 1, max: 1, reason: 'review_changes' });
  }
});

test('P8. BLOCKED does not advance: a parked run shows BLOCKED with no percentage, whatever evidence follows', () => {
  const b = bench();
  const id = b.implement(), run = b.dispatch(id, 'claude');
  b.ev(run, 'ACK'); b.broker(run, 'BROKER_WRITE_ALLOWED', 'written');
  b.engine.emit('TASK_PARKED', { taskId: id, reason: 'Termination unconfirmed.', ownerAction: 'Confirm the worker stopped.' });
  const parked = b.agent('claude');
  assert.equal(parked.status, 'BLOCKED'); assert.equal(parked.progress, null); assert.equal(parked.frozenProgress, 30);
  b.broker(run, 'SANDBOX_TEST_STARTED', 'started'); b.broker(run, 'SANDBOX_TEST_COMPLETED', 'passed');
  b.clock.t += 3_000_000;
  const later = b.agent('claude');
  assert.equal(later.status, 'BLOCKED'); assert.equal(later.progress, null);
  // A blocked objective keeps its finished share; nothing about being blocked earns more.
  const o = b.objective({ type: 'investigate', objective: 'Why?' });
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: o.id, to: 'PLANNING', reason: 'x' });
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: o.id, to: 'BLOCKED', reason: 'Loop guard.' });
  const p1 = b.snap().objectives.find(x => x.objectiveId === o.id); b.clock.t += 3_600_000;
  const p2 = b.snap().objectives.find(x => x.objectiveId === o.id);
  assert.equal(p1.state, 'BLOCKED'); assert.equal(p2.progress, p1.progress); assert.equal(p1.progress, 0);
});

test('P9. WAITING does not advance: queued work, capacity waits and approval gates hold still as time passes', () => {
  const b = bench();
  b.readOnly('codex');
  const w1 = b.agent('codex');
  assert.equal(w1.status, 'WAITING'); assert.equal(w1.progress, null); assert.match(w1.activity, /Queued/);
  const before = progressFingerprint(b.snap());
  b.clock.t += 6 * 3_600_000;
  assert.equal(progressFingerprint(b.snap()), before, 'only the clock moved: the snapshot is unchanged');
  // A capacity wait recorded by HQ.
  const t = Object.values(b.engine.state.tasks)[0];
  b.engine.emit('WAITING_FOR_CAPACITY', { taskId: t.id, agentId: 'codex', capacity: 'RATE_LIMITED', computeClass: 'SUBSCRIPTION', retryAt: null, paidAlternativeUsed: false });
  assert.match(b.agent('codex').activity, /Waiting for codex capacity \(rate limited\)/); assert.equal(b.agent('codex').progress, null);
  // A run that hit a usage limit waits too (no percentage, no paid fallback).
  const r = b.dispatch(t.id, 'codex'); b.ev(r, 'ACK'); b.ev(r, 'MODEL_OUTPUT');
  b.ev(r, 'RATE_LIMITED', { retryAt: b.clock.t + 60_000 });
  const tv = b.task(t.id); assert.equal(tv.status, 'WAITING'); assert.equal(tv.progress, null); assert.equal(tv.frozenProgress, 30);
  // An objective awaiting Kyle's approval: its share stays put; the gate is a waiting checklist item.
  const o = b.objective({ type: 'implement', objective: 'Ship greet', scope: SCOPE, tests: TESTS, requestedActions: ['merge'] });
  b.engine.emit('APPROVAL_REQUESTED', { objectiveId: o.id, gate: 'merge', stage: 'after verified work', reason: 'Kyle merges.' });
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: o.id, to: 'PLANNING', reason: 'x' });
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: o.id, to: 'AWAITING_APPROVAL', reason: 'Kyle.' });
  const a1 = b.snap().objectives.find(x => x.objectiveId === o.id); b.clock.t += 3_600_000;
  const a2 = b.snap().objectives.find(x => x.objectiveId === o.id);
  assert.equal(a1.state, 'WAITING'); assert.equal(a2.progress, a1.progress);
  assert.equal(a1.checklist.find(i => i.key === 'gate:merge').status, 'waiting');
});

test('P10/P11. COMPLETE reaches 100 for the task; the agent then shows IDLE, not a stale 100% bar', () => {
  const b = bench();
  const id = b.readOnly('codex'), run = b.dispatch(id, 'codex');
  b.ev(run, 'ACK'); b.ev(run, 'MODEL_OUTPUT'); b.ev(run, 'MODEL_RESULT', { summary: 'Answer.' }); b.ev(run, 'COMPLETED');
  const t = b.task(id);
  assert.equal(t.status, 'COMPLETE'); assert.equal(t.progress, 100); assert.equal(t.milestone, 'COMPLETE');
  const a = b.agent('codex');
  assert.equal(a.status, 'IDLE'); assert.equal(a.progress, null); assert.equal(a.milestone, null); assert.equal(a.taskId, null);
  assert.deepEqual(a.last, { taskId: id, objectiveId: null, outcome: 'COMPLETE', endedAt: b.clock.t });
  for (const x of b.snap().agents) if (!x.taskId) assert.equal(x.progress, null, `${x.agent} has no assignment and shows no progress`);
  assert.ok(b.snap().agents.every(x => PROGRESS_STATES.includes(x.status)));
});

test('P12. restart: HQ rebuilds the same truthful state from the journal; an unproven run becomes BLOCKED, keeping its facts', () => {
  const store = new MemoryStore();
  const b = bench({ store });
  const o = b.objective({ type: 'implement', objective: 'Write greet()', scope: SCOPE, tests: TESTS });
  const implStep = o.order.map(s => o.steps[s]).find(s => s.kind === 'implement');
  b.engine.emit('STEP_RETRY', { objectiveId: o.id, stepId: implStep.id, reason: 'test_failure', count: 1, max: 1, strategy: 'repair', detail: 'failed', patchHash: null, excludeAgents: [], notBefore: null, repair: { attempt: 1, reason: 'tests failed' } });
  const id = b.implement({ objectiveId: o.id, stepId: implStep.id }, { attempt: 1, reason: 'HQ ran the acceptance tests and they failed.' });
  const run = b.dispatch(id, 'claude');
  b.ev(run, 'ACK'); b.broker(run, 'BROKER_WRITE_ALLOWED', 'written'); b.broker(run, 'SANDBOX_TEST_STARTED', 'started');
  const live = b.snap();
  // A second controller reading the same journal derives the identical snapshot (nothing transient was persisted).
  const replayed = new Engine({ store, now: () => b.clock.t, config: { heartbeatMs: 3_600_000, progressMs: 3_600_000 } });
  assert.equal(progressFingerprint(progressSnapshot(replayed.state, { now: b.clock.t, statusOf: a => replayed.status(a) })), progressFingerprint(live));
  // The restart itself: HQ parks the run it cannot prove stopped. Truthful: BLOCKED, no percentage, facts kept.
  replayed.initialize();
  const after = progressSnapshot(replayed.state, { now: b.clock.t, statusOf: a => replayed.status(a) }).agents.find(a => a.agent === 'claude');
  const before = live.agents.find(a => a.agent === 'claude');
  assert.equal(before.status, 'WORKING'); assert.equal(before.progress, 45);
  assert.equal(after.status, 'BLOCKED'); assert.equal(after.progress, null); assert.equal(after.frozenProgress, 45);
  for (const k of ['objectiveId', 'stepId', 'taskId', 'milestone', 'startedAt']) assert.deepEqual(after[k], before[k], k);
  assert.deepEqual(after.retry, { count: 1, max: 1, reason: 'test_failure' });
  // And the objective's checklist is the same plan with the same step states.
  const oa = progressSnapshot(replayed.state, { now: b.clock.t }).objectives.find(x => x.objectiveId === o.id);
  assert.deepEqual(oa.checklist.map(i => i.label), live.objectives.find(x => x.objectiveId === o.id).checklist.map(i => i.label));
});

test('P13. agents on different objectives stay isolated', () => {
  const b = bench();
  const o1 = b.objective({ type: 'implement', objective: 'One', title: 'One', scope: SCOPE, tests: TESTS });
  const o2 = b.objective({ type: 'review', objective: 'Two', title: 'Two' });
  const s1 = o1.order.map(s => o1.steps[s]).find(s => s.kind === 'implement'), s2 = o2.steps[o2.order[0]];
  const t1 = b.implement({ objectiveId: o1.id, stepId: s1.id }), t2 = b.readOnly('codex', { objectiveId: o2.id, stepId: s2.id });
  const r1 = b.dispatch(t1, 'claude'), r2 = b.dispatch(t2, 'codex');
  b.ev(r2, 'ACK');
  const codexBefore = b.agent('codex'), o2Before = b.snap().objectives.find(x => x.objectiveId === o2.id);
  implementToAcceptance(b, r1);
  const s = b.snap(), claude = s.agents.find(a => a.agent === 'claude'), codex = s.agents.find(a => a.agent === 'codex');
  assert.equal(claude.objectiveId, o1.id); assert.equal(claude.objectiveTitle, 'One'); assert.equal(claude.progress, 75);
  assert.equal(codex.objectiveId, o2.id); assert.equal(codex.progress, codexBefore.progress);
  assert.equal(s.objectives.find(x => x.objectiveId === o2.id).progress, o2Before.progress, 'objective Two did not move');
  assert.deepEqual(s.objectives.find(x => x.objectiveId === o1.id).agents, ['claude']);
  assert.deepEqual(s.objectives.find(x => x.objectiveId === o2.id).agents, ['codex']);
});

test('P14. agents on the same objective aggregate: each step\'s own progress, weighted into one objective figure', () => {
  const b = bench();
  // A plan with two independent read-only steps (an investigation and a review), run by two agents at once.
  const o = b.objective({ type: 'investigate', objective: 'Two views', title: 'Two views' }, [
    { id: 'inv-1', kind: 'investigate', role: 'investigator', dependsOn: [] },
    { id: 'rev-1', kind: 'review', role: 'reviewer', dependsOn: [], standalone: true },
  ]);
  const ti = b.readOnly('claude', { objectiveId: o.id, stepId: 'inv-1' }), tr = b.readOnly('codex', { objectiveId: o.id, stepId: 'rev-1' });
  const ri = b.dispatch(ti, 'claude'), rr = b.dispatch(tr, 'codex');
  b.ev(ri, 'ACK'); b.ev(ri, 'MODEL_OUTPUT'); b.ev(ri, 'MODEL_RESULT', { summary: 'Answer.' }); // 85% of 30
  b.ev(rr, 'ACK'); // 10% of 25
  const p = b.snap().objectives.find(x => x.objectiveId === o.id);
  assert.deepEqual(p.agents.sort(), ['claude', 'codex']);
  assert.equal(p.progress, Math.floor((100 * (0.85 * 30 + 0.10 * 25)) / 55));
  assert.deepEqual(p.checklist.map(i => [i.key, i.status, i.agentProgress]), [['investigate', 'running', 85], ['review', 'running', 10]]);
  const claude = b.agent('claude'), codex = b.agent('codex');
  assert.equal(claude.stepId, 'inv-1'); assert.equal(codex.stepId, 'rev-1');
  assert.equal(claude.activity, 'Answer delivered; HQ validating it');
});

test('P15. an unknown or future agent works without any change: registered data, the generic profile', () => {
  const b = bench();
  b.engine.register({ id: 'scientist', name: 'Scientist', provider: 'Future Lab', role: 'Scientist', capabilities: ['review-repo'], workstation: 'Lab', real: 'Researcher', fantasy: 'Alchemist', executionAdapter: null, telemetryAdapter: null, usageSource: null });
  assert.equal(b.agent('scientist').status, 'IDLE');
  const id = b.readOnly('scientist'), run = b.dispatch(id, 'scientist');
  b.ev(run, 'ACK'); b.ev(run, 'PROGRESS', { summary: 'Request sent to the model.' });
  const a = b.agent('scientist');
  assert.equal(a.name, 'Scientist'); assert.equal(a.status, 'WORKING'); assert.equal(a.progress, 30); assert.equal(a.profile, 'agent');
  // Any operation HQ has no profile for falls back to the generic agent profile.
  assert.equal(taskProgress(b.engine.state, { ...b.engine.state.tasks[id], operation: 'future-operation' }, { now: b.clock.t }).profile, 'agent');
  assert.ok(Object.keys(PROFILES).every(k => PROFILES[k].milestones[0].percent === 0 && PROFILES[k].milestones.at(-1).percent === 100));
});

test('P16. objective types calculate from their own plans', () => {
  const b = bench();
  const labels = o => b.snap().objectives.find(x => x.objectiveId === o.id).checklist.map(i => i.label);
  assert.deepEqual(labels(b.objective({ type: 'investigate', objective: 'Why?' })), ['Investigation']);
  assert.deepEqual(labels(b.objective({ type: 'review', objective: 'Review it' })), ['Review']);
  assert.deepEqual(labels(b.objective({ type: 'implement', objective: 'Build', scope: SCOPE, tests: TESTS })), ['Implementation', 'HQ verification', 'Review']);
  // Application code is medium risk, so its review must come from an independent provider.
  const merge = b.objective({ type: 'implement', objective: 'Build and merge', scope: ['lib/greeting/'], tests: ['lib/greeting/greeting.test.mjs'], requestedActions: ['merge'] });
  assert.deepEqual(labels(merge), ['Implementation', 'HQ verification', 'Independent review', 'Kyle approval: merge']);
  // A fix shows its implementation phases as projected until the investigation justifies them.
  const fix = b.objective({ type: 'fix', objective: 'Fix it', scope: SCOPE });
  const fp = b.snap().objectives.find(x => x.objectiveId === fix.id);
  assert.deepEqual(fp.checklist.map(i => [i.label, Boolean(i.projected)]), [['Investigation', false], ['Implementation', true], ['HQ verification', true], ['Review', true]]);
  // Finishing the investigation of a fix is about a quarter of it, not "done"; of an investigation it is all of it.
  const inv = b.objective({ type: 'investigate', objective: 'Why?' });
  for (const o of [fix, inv]) b.engine.emit('STEP_TRANSITION', { objectiveId: o.id, stepId: o.order[0], to: 'DONE', reason: 'accepted' });
  assert.equal(b.snap().objectives.find(x => x.objectiveId === fix.id).progress, Math.floor(100 * 30 / 110));
  assert.equal(b.snap().objectives.find(x => x.objectiveId === inv.id).progress, 99, 'only COMPLETE is 100');
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: inv.id, to: 'PLANNING', reason: 'x' });
  b.engine.emit('OBJECTIVE_TRANSITION', { objectiveId: inv.id, to: 'COMPLETE', reason: 'done' });
  assert.equal(b.snap().objectives.find(x => x.objectiveId === inv.id).progress, 100);
  // An objective type HQ adds later, with step kinds it has no weights for, still totals truthfully.
  const future = b.objective({ type: 'investigate', objective: 'Future' }, [{ id: 'exp-1', kind: 'experiment', role: 'scientist', dependsOn: [] }, { id: 'rep-1', kind: 'report', role: 'scientist', dependsOn: ['exp-1'] }]);
  b.engine.emit('STEP_TRANSITION', { objectiveId: future.id, stepId: 'exp-1', to: 'DONE', reason: 'ok' });
  const fu = b.snap().objectives.find(x => x.objectiveId === future.id);
  assert.deepEqual(fu.checklist.map(i => i.label), ['Experiment', 'Report']); assert.equal(fu.progress, 50);
});

test('the runner labels progress relies on are HQ\'s own strings (a rename fails here, not silently in the UI)', () => {
  const sources = ['../implementation-runner.mjs', '../subscription-implementer.mjs'].map(f => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  for (const label of ['Creating the task worktree', 'Sandbox base image check', 'HQ diff of the sandbox', 'HQ acceptance tests', 'creation`', 'staging`', 'teardown`']) assert.ok(sources.includes(label), label);
  const samples = ['Creating the task worktree', 'Sandbox base image check', 'Sandbox hq-sbx-1 creation', 'Sandbox hq-sbx-1 staging', 'HQ diff of the sandbox', 'HQ acceptance tests in the sandbox', 'Sandbox hq-sbx-1 teardown'];
  for (const s of samples) assert.ok(HQ_OP_LABELS.some(([re]) => re.test(s)), s);
});

test('World and ChatGPT read the same canonical progress; nothing recomputes it', async () => {
  const codex = scriptedAgent('Codex', task => ({ text: handoffText(role(task) === 'investigate' ? investigation() : review()) }));
  const h = harness({ codex });
  const id = h.conductor.submit({ objective: 'greet() is missing; fix it.', type: 'fix', scope: SCOPE });
  await h.drive(h.settled(id));
  const progress = progressSnapshot(h.engine.state, { now: h.clock.t, statusOf: a => h.engine.status(a) });
  const world = worldSnapshot(h.engine.snapshot(), { progress });
  assert.deepEqual(world.progress, progress);
  assert.deepEqual(world.objectives.find(o => o.id === id).telemetry, progress.objectives.find(o => o.objectiveId === id));
  assert.equal(world.agents.find(a => a.id === 'claude').telemetry.status, 'IDLE');
  assert.deepEqual(world.objectives.find(o => o.id === id).progress, { done: 4, total: 4 }, 'the existing World field is unchanged');
  assert.equal(worldSnapshot(h.engine.snapshot()).progress, undefined, 'without telemetry the World contract is exactly as before');
  const tools = createToolbox(h.engine, { taskId: null });
  const view = JSON.parse(tools.call('get_objective', JSON.stringify({ objective_id: id })).output);
  assert.equal(view.progress.percent, 100); assert.equal(view.progress.state, 'COMPLETE');
  const state = JSON.parse(tools.call('get_hq_state', '{}').output);
  assert.ok(state.agent_progress.some(a => a.agent === 'claude' && a.status === 'IDLE' && a.percent === null));
});

test('HTTP: /api/progress and /api/state carry the snapshot; the live stream pushes on journal events and needs the session', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20 });
  const controller = new AbortController();
  try {
    const headers = { 'X-HQ-Client': 'command-center' };
    assert.equal((await fetch(`${hq.origin}/api/progress/stream`, { headers })).status, 401);
    headers.Authorization = `Bearer ${(await fetch(`${hq.origin}/api/session`, { headers }).then(r => r.json())).token}`;
    const p = await fetch(`${hq.origin}/api/progress`, { headers }).then(r => r.json());
    assert.equal(p.v, 1); assert.ok(p.agents.some(a => a.agent === 'claude' && a.status === 'IDLE'));
    assert.equal((await fetch(`${hq.origin}/api/progress?objective=nope`, { headers })).status, 404);
    const state = await fetch(`${hq.origin}/api/state`, { headers }).then(r => r.json());
    assert.equal(state.progress.v, 1);
    const world = await fetch(`${hq.origin}/api/world`, { headers }).then(r => r.json());
    assert.equal(world.snapshot.progress.v, 1);
    const res = await fetch(`${hq.origin}/api/progress/stream`, { headers, signal: controller.signal });
    assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    const next = async () => {
      for (;;) {
        const i = buffer.indexOf('\n\n');
        if (i >= 0) { const frame = buffer.slice(0, i); buffer = buffer.slice(i + 2); if (frame.startsWith('event: progress')) return JSON.parse(frame.split('\n').find(l => l.startsWith('data: ')).slice(6)); continue; }
        const { value, done } = await reader.read(); if (done) throw Error('stream ended'); buffer += decoder.decode(value, { stream: true });
      }
    };
    const first = await next();
    assert.equal(first.v, 1);
    // A journal event that changes the answer is pushed without the client asking.
    const id = hq.engine.createTask({ title: 'Inspect', description: 'Count files', operation: 'inspect-repo', priority: 50, safety: 'local-read-only' });
    const pushed = await next();
    assert.ok(pushed.seq > first.seq);
    assert.ok(hq.engine.state.tasks[id]);
  } finally { controller.abort(); await hq.close(); }
});
