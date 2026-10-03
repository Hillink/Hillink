// Decision authority regression tests (spec requirements 1-10).
// Proves: review-fallback -> orchestrator; Kyle-only consequential decisions stay Kyle;
// escalation converts to Kyle; Command Center surfaces and decides pending Kyle decisions;
// journal replay normalizes old 'kyle' review-fallback authority to 'orchestrator'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startIngress } from '../ingress/mcp-ingress.mjs';
import { createHQ } from '../server.mjs';
import { MemoryStore } from '../store.mjs';
import { deriveDecisionAuthority } from '../orchestration/state.mjs';
import { harness, scriptedAgent, handoffText, review, greetingFiles } from './orchestration-harness.mjs';
import { createToolbox } from '../orchestrator-tools.mjs';

const TOKEN = randomBytes(32).toString('base64url');
function client(base) {
  let n = 0;
  const rpc = async (method, params) => (await fetch(`${base}/mcp/${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) })).json();
  const call = async (name, args) => { const res = await rpc('tools/call', { name, arguments: args }); return res.error ? { rpcError: res.error } : { isError: res.result.isError, value: JSON.parse(res.result.content[0].text) }; };
  return { rpc, call };
}

// Medium-risk scope (not in sandbox/ LOW_RISK_AREAS): forces independentProvider: true for review.
// Uses the same greeting test pattern but at app/components/greeting/ so the risk level is 'medium'.
const MEDIUM_SCOPE = ['app/components/greeting/'];
const MEDIUM_TEST = ['app/components/greeting/greeting.test.mjs'];
const mediumGreetingFiles = () => greetingFiles('app/components/greeting');

// Harness for review-fallback tests: Codex always rate-limits (forces unavailable for independent review),
// Claude writes medium-risk files so the pipeline reaches the review step.
function reviewFallbackHarness() {
  return harness({
    codex: scriptedAgent('Codex', () => ({ rateLimited: Date.now() + 9_999_999 })),
    claudeFiles: mediumGreetingFiles,
  });
}

// Drive an implement objective through implement -> verify, stop at AWAITING_DECISION (review-fallback).
async function reachReviewFallback() {
  const h = reviewFallbackHarness();
  const id = h.conductor.submit({
    objective: 'Add greet(name) returning "Hello, <name>!".',
    type: 'implement',
    scope: MEDIUM_SCOPE,
    tests: MEDIUM_TEST,
    acceptanceCriteria: 'greet("Kyle") returns "Hello, Kyle!".',
    constraints: 'Change nothing outside the scope.',
  });
  await h.drive(() => {
    const o = h.objective(id);
    return o.status === 'AWAITING_DECISION' &&
      Object.values(o.decisions).some(d => d.resume?.type === 'review-fallback' && d.status === 'PENDING');
  });
  return { h, id };
}

// 1. review-fallback can be resolved by ChatGPT through the connector.
test('1. review-fallback decision: orchestrator-owned; ChatGPT can resolve it through the connector', async () => {
  const { h, id } = await reachReviewFallback();
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const o = h.objective(id);
    const d = Object.values(o.decisions).find(x => x.resume?.type === 'review-fallback');
    assert.ok(d, 'review-fallback decision exists');
    assert.equal(d.resume.authority, 'orchestrator', 'authority is orchestrator, not kyle');

    const c = client(ing.base);
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: d.id, choice: 'wait', rationale: 'Waiting for Codex.' });
    assert.equal(r.isError, false, JSON.stringify(r.value));
    assert.equal(r.value.choice, 'wait');
    const decided = h.engine.state.events.filter(e => e.type === 'DECISION_RECORDED');
    assert.equal(decided.length, 1);
    assert.equal(decided[0].data.by, 'chatgpt');
  } finally { await ing.close(); }
});

// 2. Kyle-only consequential decisions cannot be resolved by ChatGPT.
test('2. Kyle-owned consequential decision: connector refuses to resolve it', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const id = h.conductor.submit({ objective: 'Investigate something.', type: 'investigate' });
    // Inject a kyle-authority spend decision directly (type != review-fallback, so deriveDecisionAuthority keeps kyle).
    const decisionId = 'kyle-scope-1';
    h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId, question: 'Should we spend?', options: [{ id: 'retry', label: 'Retry' }, { id: 'stop', label: 'Stop' }], resume: { authority: 'kyle', type: 'spend' } });

    const c = client(ing.base);
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: decisionId, choice: 'retry', rationale: 'I think yes.' });
    assert.equal(r.isError, true, 'connector must refuse kyle-owned decision');
    assert.match(r.value.refused ?? r.value.error ?? JSON.stringify(r.value), /kyle|Kyle|needs Kyle|orchestrator cannot/i);
    // No DECISION_RECORDED event.
    assert.equal(h.engine.state.events.filter(e => e.type === 'DECISION_RECORDED').length, 0);
  } finally { await ing.close(); }
});

// 3. Explicit escalation converts to Kyle ownership; connector refuses afterwards.
test('3. escalate_to_kyle converts to Kyle ownership; connector refuses afterwards', async () => {
  const { h, id } = await reachReviewFallback();
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const o = h.objective(id);
    const d = Object.values(o.decisions).find(x => x.resume?.type === 'review-fallback');
    assert.equal(d.resume.authority, 'orchestrator');

    const c = client(ing.base);
    // Orchestrator escalates.
    const esc = await c.call('resolve_objective_decision', { objective_id: id, decision_id: d.id, choice: 'escalate_to_kyle', rationale: 'This needs owner judgment.' });
    assert.equal(esc.isError, false, JSON.stringify(esc.value));

    // Let the conductor apply the escalation and create the new kyle decision.
    await h.drive(() => {
      const obj = h.objective(id);
      return Object.values(obj.decisions).some(x => x.status === 'PENDING' && x.resume?.authority === 'kyle');
    });

    const o2 = h.objective(id);
    const escalated = Object.values(o2.decisions).find(x => x.status === 'PENDING' && x.resume?.authority === 'kyle');
    assert.ok(escalated, 'escalated kyle-decision exists');
    assert.ok(escalated.resume?.escalated, 'escalated flag is set on the resume');

    // Connector cannot resolve the escalated decision.
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: escalated.id, choice: escalated.options[0].id, rationale: 'Trying anyway.' });
    assert.equal(r.isError, true, 'connector must refuse escalated kyle decision');
    assert.match(r.value.refused ?? r.value.error ?? JSON.stringify(r.value), /kyle|Kyle/i);
  } finally { await ing.close(); }
});

// 4. Kyle-owned pending decisions appear in API state (get_objective) with question and options.
test('4. Kyle-owned pending decisions appear in API state (get_objective) with question and options', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const id = h.conductor.submit({ objective: 'Investigate something.', type: 'investigate' });
  const decisionId = 'kyle-q-1';
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId, question: 'What do you want to do?', options: [{ id: 'go', label: 'Go' }, { id: 'stop', label: 'Stop' }], resume: { authority: 'kyle', type: 'spend' } });
  const tb = createToolbox(h.engine, { taskId: null });
  const view = JSON.parse(tb.call('get_objective', JSON.stringify({ objective_id: id })).output);
  assert.ok(view.decisions_pending?.length >= 1, 'decision present');
  const kd = view.decisions_pending.find(d => d.decision_id === decisionId);
  assert.ok(kd, 'found kyle decision in view');
  assert.equal(kd.for, 'kyle');
  assert.equal(kd.question, 'What do you want to do?');
  assert.deepEqual(kd.options, [{ id: 'go', label: 'Go' }, { id: 'stop', label: 'Stop' }]);
  assert.match(kd.how, /Command Center|command-center/i, 'how field directs to Command Center');
});

// 5. Command Center decide endpoint requires authenticated owner session.
test('5. /api/objectives/decide requires authenticated session; unauthenticated request returns 401', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: {} });
  try {
    const id = hq.engine.conductor.submit({ objective: 'Investigate X.', type: 'investigate' });
    const decisionId = 'test-auth-d';
    hq.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId, question: 'Q?', options: [{ id: 'yes', label: 'Yes' }], resume: { authority: 'kyle', type: 'spend' } });
    const base = hq.origin;
    const headers = { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json' };
    // No Authorization header.
    const noAuth = await fetch(`${base}/api/objectives/decide`, { method: 'POST', headers, body: JSON.stringify({ id, decisionId, choice: 'yes', rationale: '' }) });
    assert.equal(noAuth.status, 401, 'no auth should be 401');
    // Wrong token.
    const wrongAuth = await fetch(`${base}/api/objectives/decide`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrongtoken' }, body: JSON.stringify({ id, decisionId, choice: 'yes', rationale: '' }) });
    assert.equal(wrongAuth.status, 401, 'wrong token should be 401');
  } finally { await hq.close(); }
});

// 6. Invalid option and repeated decision are rejected.
test('6. invalid option and repeated decision are rejected', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const id = h.conductor.submit({ objective: 'Investigate X.', type: 'investigate' });
  const decisionId = 'repeated-d';
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId, question: 'Q?', options: [{ id: 'yes', label: 'Yes' }], resume: { authority: 'kyle', type: 'spend' } });

  // Invalid choice.
  assert.throws(() => h.conductor.decide(id, decisionId, 'invalid-option', { by: 'kyle' }), /choice must be one of/);

  // Valid choice succeeds.
  assert.doesNotThrow(() => h.conductor.decide(id, decisionId, 'yes', { by: 'kyle' }));

  // Repeated decision is rejected (status is now DECIDED).
  assert.throws(() => h.conductor.decide(id, decisionId, 'yes', { by: 'kyle' }), /No pending decision/);
});

// 7. Valid Command Center decision records by=kyle, channel=command-center.
test('7. Command Center decide: records by=kyle and channel=command-center', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: {} });
  try {
    const id = hq.engine.conductor.submit({ objective: 'Investigate X.', type: 'investigate' });
    const decisionId = 'cc-d-1';
    hq.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId, question: 'Q?', options: [{ id: 'stop', label: 'Stop' }], resume: { authority: 'kyle', type: 'spend' } });
    const base = hq.origin;
    const sessionToken = (await fetch(`${base}/api/session`, { headers: { 'X-HQ-Client': 'command-center' } }).then(r => r.json())).token;
    const headers = { 'X-HQ-Client': 'command-center', 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` };
    const res = await fetch(`${base}/api/objectives/decide`, { method: 'POST', headers, body: JSON.stringify({ id, decisionId, choice: 'stop', rationale: 'Stopping.' }) });
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${await res.text()}`);
    const recorded = hq.engine.state.events.filter(e => e.type === 'DECISION_RECORDED');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].data.by, 'kyle');
    assert.equal(recorded[0].data.channel, 'command-center');
    const o = hq.engine.state.objectives[id];
    assert.equal(o.decisions[decisionId].by, 'kyle');
    assert.equal(o.decisions[decisionId].channel, 'command-center');
  } finally { await hq.close(); }
});

// 8. Journal replay normalizes old review-fallback authority from 'kyle' to 'orchestrator'.
test('8. journal replay: old review-fallback with authority=kyle is corrected to orchestrator on replay', () => {
  // Verify deriveDecisionAuthority directly — this is what runs at DECISION_REQUESTED replay time.
  assert.equal(deriveDecisionAuthority({ type: 'review-fallback', authority: 'kyle' }), 'orchestrator', 'old kyle review-fallback -> orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'review-fallback', authority: 'orchestrator' }), 'orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'review-fallback' }), 'orchestrator', 'review-fallback with no stored authority -> orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'spend', authority: 'kyle' }), 'kyle', 'spend stays kyle');
  assert.equal(deriveDecisionAuthority({ type: 'scope', authority: 'kyle' }), 'kyle', 'high-risk scope stays kyle');
  assert.equal(deriveDecisionAuthority({ type: 'unknown-future-type', authority: 'kyle' }), 'kyle', 'unknown type fails safe to kyle');
  assert.equal(deriveDecisionAuthority({ type: 'review-fallback', authority: 'kyle', escalated: true }), 'kyle', 'explicit escalation stays kyle even if type is review-fallback');
  assert.equal(deriveDecisionAuthority(null), 'kyle', 'null fails safe to kyle');
  assert.equal(deriveDecisionAuthority(undefined), 'kyle', 'undefined fails safe to kyle');

  // End-to-end via state reducer: emit old-style DECISION_REQUESTED (review-fallback with authority=kyle).
  const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const id = h.conductor.submit({ objective: 'Investigate.', type: 'investigate' });
  // Simulate an old journal entry where review-fallback was recorded as kyle-authority.
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: 'old-rf-1', question: 'Old review fallback question?', options: [{ id: 'wait', label: 'Wait' }], resume: { authority: 'kyle', type: 'review-fallback' } });
  const d = h.engine.state.objectives[id].decisions['old-rf-1'];
  assert.equal(d.resume.authority, 'orchestrator', 'replay normalizes old kyle review-fallback to orchestrator');
  // ChatGPT can resolve it.
  assert.doesNotThrow(() => h.conductor.decide(id, 'old-rf-1', 'wait', { by: 'chatgpt', rationale: 'Waiting.' }));
  // Kyle cannot be locked out (his code path still works too).
  const h2 = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
  const id2 = h2.conductor.submit({ objective: 'Investigate.', type: 'investigate' });
  h2.engine.emit('DECISION_REQUESTED', { objectiveId: id2, decisionId: 'old-rf-2', question: 'Old question?', options: [{ id: 'wait', label: 'Wait' }], resume: { authority: 'kyle', type: 'review-fallback' } });
  assert.doesNotThrow(() => h2.conductor.decide(id2, 'old-rf-2', 'wait', { by: 'kyle', rationale: 'Kyle deciding.' }));
});

// 8b. Authority is enforced by recognized type; a supplied authority cannot hand a Kyle-owned decision to the orchestrator.
test('8b. unknown and spend decisions stay Kyle even when the supplied authority says orchestrator', () => {
  assert.equal(deriveDecisionAuthority({ type: 'unknown-future-type', authority: 'orchestrator' }), 'kyle', 'unknown + orchestrator -> kyle');
  assert.equal(deriveDecisionAuthority({ authority: 'orchestrator' }), 'kyle', 'missing type + orchestrator -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'toString', authority: 'orchestrator' }), 'kyle', 'prototype key as type -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'spend', authority: 'orchestrator' }), 'kyle', 'spend + orchestrator -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'spend' }), 'kyle', 'spend with no stored authority -> kyle');
  // Existing behaviour of the other recognized types is unchanged.
  assert.equal(deriveDecisionAuthority({ type: 'scope', authority: 'orchestrator' }), 'orchestrator', 'non-high-risk scope -> orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'scope', authority: 'kyle' }), 'kyle', 'high-risk scope -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'scope' }), 'kyle', 'scope with no stored authority -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'disagreement', authority: 'orchestrator' }), 'orchestrator', 'non-high-risk disagreement -> orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'disagreement', authority: 'kyle' }), 'kyle', 'high-risk disagreement -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'investigation', authority: 'orchestrator' }), 'orchestrator', 'investigation -> orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'investigation', authority: 'kyle' }), 'orchestrator', 'investigation is always orchestrator');
  assert.equal(deriveDecisionAuthority({ type: 'investigation', authority: 'orchestrator', escalated: true }), 'kyle', 'escalated investigation -> kyle');
  assert.equal(deriveDecisionAuthority({ type: 'scope', authority: 'orchestrator', escalated: true }), 'kyle', 'escalated scope -> kyle');

  // End-to-end via the reducer: the orchestrator cannot resolve either decision; Kyle can.
  for (const type of ['unknown-future-type', 'spend']) {
    const h = harness({ codex: scriptedAgent('Codex', () => ({ text: handoffText(review()) })) });
    const id = h.conductor.submit({ objective: 'Investigate.', type: 'investigate' });
    h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: `forged-${type}`, question: 'Forged?', options: [{ id: 'go', label: 'Go' }], resume: { authority: 'orchestrator', type } });
    assert.equal(h.engine.state.objectives[id].decisions[`forged-${type}`].resume.authority, 'kyle', `${type} normalized to kyle`);
    assert.throws(() => h.conductor.decide(id, `forged-${type}`, 'go', { by: 'chatgpt', rationale: 'Trying.' }), /needs Kyle/);
    assert.doesNotThrow(() => h.conductor.decide(id, `forged-${type}`, 'go', { by: 'kyle', rationale: 'Kyle deciding.' }));
  }
});

// 9. Existing approval gates remain protected; connector cannot substitute for approval.
test('9. approval gates remain Kyle-only; connector resolve_objective_decision cannot substitute for approval', async () => {
  const hq = await createHQ({ port: 0, store: new MemoryStore(), intervalMs: 20, env: {} });
  const ing = await startIngress({ engine: hq.engine, token: TOKEN, port: 0 });
  try {
    const c = client(ing.base);
    const sub = await c.call('submit_objective', { objective: 'Deploy to production.', type: 'investigate', title: 'Deploy', scope: [], tests: [], acceptance_criteria: null, constraints: null, requested_actions: ['production-change'] });
    assert.equal(sub.isError, false, JSON.stringify(sub.value));
    const id = sub.value.objective_id;
    // Wait for the conductor to plan and request approval (it auto-ticks via intervalMs).
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && hq.engine.state.objectives[id]?.status !== 'AWAITING_APPROVAL') await new Promise(r => setTimeout(r, 20));
    assert.equal(hq.engine.state.objectives[id].status, 'AWAITING_APPROVAL');

    // Connector cannot approve via resolve_objective_decision — approval is not a decision.
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: 'production-change', choice: 'approve', rationale: 'Looks good.' });
    assert.equal(r.isError, true);
    // No APPROVAL_DECIDED or DECISION_RECORDED events.
    assert.equal(hq.engine.state.events.filter(e => e.type === 'APPROVAL_DECIDED').length, 0);
    assert.equal(hq.engine.state.events.filter(e => e.type === 'DECISION_RECORDED').length, 0);
    // The conductor.approve() also blocks non-Kyle callers.
    assert.throws(() => hq.engine.conductor.approve(id, 'production-change', 'approve', { by: 'chatgpt' }), /Only Kyle/);
  } finally { await ing.close(); await hq.close(); }
});

// 10. Same-provider review is explicitly recorded as NOT independent.
test('10. accept_same_provider_review is explicitly recorded as NOT independent', async () => {
  const { h, id } = await reachReviewFallback();
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  try {
    const o = h.objective(id);
    const d = Object.values(o.decisions).find(x => x.resume?.type === 'review-fallback');
    assert.equal(d.resume.authority, 'orchestrator');

    // The accept_same_provider_review option label must explicitly say NOT independent.
    const opt = d.options.find(x => x.id === 'accept_same_provider_review');
    assert.ok(opt, 'option exists');
    assert.match(opt.label, /NOT independent/i, 'label says NOT independent');

    const c = client(ing.base);
    const r = await c.call('resolve_objective_decision', { objective_id: id, decision_id: d.id, choice: 'accept_same_provider_review', rationale: 'No Codex available; proceeding with same-provider.' });
    assert.equal(r.isError, false, JSON.stringify(r.value));

    // Drive to REVIEWING (review step gets dispatched to Claude, same provider).
    await h.drive(() => ['REVIEWING', 'COMPLETE', 'BLOCKED', 'FAILED', 'CANCELLED'].includes(h.objective(id).status));
    const o2 = h.objective(id);

    // The review step must have allowSameProvider=true.
    const reviewStep = Object.values(o2.steps).find(s => s.kind === 'review');
    assert.ok(reviewStep?.allowSameProvider, 'allowSameProvider recorded on step');

    // The status reason or retry strategy must say NOT independent.
    const statusReason = o2.statusReason ?? '';
    const retryStrategy = reviewStep?.retries.at(-1)?.strategy ?? '';
    assert.ok(
      /NOT independent/i.test(statusReason) || /NOT independent/i.test(retryStrategy),
      `"NOT independent" not found in status "${statusReason}" or retry strategy "${retryStrategy}"`
    );

    // The merge gate still requires Kyle (approval, not decision).
    assert.throws(() => h.conductor.approve(id, 'merge', 'approve', { by: 'chatgpt' }), /Only Kyle/);
  } finally { await ing.close(); }
});
