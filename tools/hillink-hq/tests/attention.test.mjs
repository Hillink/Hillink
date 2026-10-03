// Orchestration observability: an objective that ends BLOCKED, FAILED or CANCELLED, a decision waiting on the
// orchestrator, or a note Kyle posted for it cannot sit unnoticed. ChatGPT cannot be woken by HQ, so HQ puts the
// follow-up list in front of it on EVERY ingress call, lists it in get_hq_state, and keeps an HQ alert open (for Kyle
// and the World) until someone records what happens next. Real HTTP ingress, engine, conductor and journal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startIngress, INGRESS_TOOLS } from '../ingress/mcp-ingress.mjs';
import { Engine } from '../engine.mjs';
import { attention } from '../orchestration/attention.mjs';
import { harness, scriptedAgent } from './orchestration-harness.mjs';

const TOKEN = randomBytes(32).toString('base64url');
async function withIngress(h, fn) {
  const ing = await startIngress({ engine: h.engine, token: TOKEN, port: 0 });
  let n = 0;
  const call = async (name, args) => {
    const r = await fetch(`${ing.base}/mcp/${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }) });
    const res = await r.json();
    return { isError: res.result.isError, value: JSON.parse(res.result.content[0].text) };
  };
  try { return await fn(call); } finally { await ing.close(); }
}
const submit = (h, title = 'Investigate the stall') => h.conductor.submit({ objective: 'Find out why the review stalled.', type: 'investigate', title, scope: [], tests: [], acceptanceCriteria: null, constraints: null, requestedActions: [] }, { requestedBy: { agentId: 'chatgpt', taskId: null } });

test('O1. an objective that ends unresolved is on every ChatGPT call and an open HQ alert until acknowledged; COMPLETE never is', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ fail: 'Codex process crashed.' })), claudeReview: scriptedAgent('Claude', () => ({ fail: 'Claude process crashed.' })), metered: false });
  const id = submit(h);
  await h.drive(() => ['BLOCKED', 'FAILED'].includes(h.objective(id).status));
  await h.tick();
  const status = h.objective(id).status;
  assert.equal(attention(h.engine.state).objectives_needing_followup[0].objective_id, id);
  assert.equal(h.engine.state.alerts[`objective:${id}`]?.active, true, 'HQ alert open for Kyle and the World');
  assert.equal(h.engine.state.alerts[`objective:${id}`].kind, 'OBJECTIVE_NEEDS_FOLLOW_UP');
  await withIngress(h, async call => {
    // Unrelated calls carry it: ChatGPT cannot miss it between calls.
    const other = await call('get_task', { task_id: 'nope' });
    assert.equal(other.value.hq_needs_attention.objectives_needing_followup[0].objective_id, id);
    assert.equal(other.value.hq_needs_attention.objectives_needing_followup[0].status, status);
    const state = await call('get_hq_state', {});
    assert.equal(state.value.needs_attention.objectives_needing_followup[0].objective_id, id);
    // Acknowledging needs a stated next step, and records only that.
    assert.match((await call('acknowledge_objective', { objective_id: id, next_step: '' })).value.error, /non-empty/);
    const ack = await call('acknowledge_objective', { objective_id: id, next_step: 'Resubmitting as two smaller objectives.' });
    assert.equal(ack.isError, false); assert.equal(ack.value.acknowledged, true);
    assert.equal(h.objective(id).status, status, 'acknowledging changes nothing about the objective');
    assert.equal((await call('get_task', { task_id: 'nope' })).value.hq_needs_attention, undefined, 'nothing left to follow up');
  });
  await h.tick();
  assert.equal(h.engine.state.alerts[`objective:${id}`].active, false, 'alert resolved by the acknowledgement');
  assert.deepEqual(h.objective(id).outcomeAck.by, 'chatgpt');
  // Replay: the follow-up state survives a restart.
  const replayed = new Engine({ store: h.store, adapters: {}, now: () => h.clock.t });
  assert.equal(attention(replayed.state).count, 0);
  assert.equal(replayed.state.objectives[id].outcomeAck.note, 'Resubmitting as two smaller objectives.');
});

test('O2. acknowledging cannot be used on live or completed objectives, cannot approve anything, and is limited per call', async () => {
  const h = harness({ codex: scriptedAgent('Codex', () => ({ hang: true })), metered: false });
  const live = submit(h, 'Still running');
  await h.tick();
  assert.throws(() => h.conductor.acknowledgeOutcome(live, { by: 'chatgpt', note: 'x' }), /only a BLOCKED, FAILED or CANCELLED outcome/);
  assert.throws(() => h.conductor.acknowledgeOutcome(live, { by: 'someone-else', note: 'x' }), /Only the orchestrator or Kyle/);
  await h.conductor.cancel(live, { by: 'kyle', reason: 'test' });
  assert.equal(h.objective(live).status, 'CANCELLED');
  assert.equal(attention(h.engine.state).objectives_needing_followup.length, 1, 'a cancelled objective also needs a stated next step');
  assert.ok(!INGRESS_TOOLS.some(n => /approve|merge|deploy|spend|post_note/.test(n)), 'no approval, spend or note-posting door for ChatGPT');
  h.conductor.acknowledgeOutcome(live, { by: 'kyle', note: 'Kyle: not needed any more.' });
  assert.equal(h.conductor.acknowledgeOutcome(live, { by: 'chatgpt', note: 'again' }).already, true, 'idempotent');
});

test('O3. Kyle\'s standing notes reach ChatGPT through HQ (full text in get_hq_state) until it acknowledges them; only Kyle posts', async () => {
  const h = harness({ metered: false });
  assert.throws(() => h.conductor.postNote({ title: 't', body: 'b' }, { by: 'chatgpt' }), /Only Kyle/);
  assert.throws(() => h.conductor.postNote({ title: '', body: 'b' }, { by: 'kyle' }), /title/);
  const noteId = h.conductor.postNote({ title: 'Resume local-gen in three parts', body: 'Part 1: prepare.mjs + masks + tests. Part 2: postprocess. Part 3: docs.' }, { by: 'kyle' });
  await withIngress(h, async call => {
    const s = await call('get_hq_state', {});
    const note = s.value.needs_attention.open_notes[0];
    assert.equal(note.note_id, noteId); assert.match(note.body, /Part 1: prepare\.mjs/); assert.equal(note.from, 'kyle');
    const other = await call('get_objective', { objective_id: 'x' });
    assert.equal(other.value.hq_needs_attention.open_notes[0].note_id, noteId, 'flagged on every call (body only in get_hq_state)');
    assert.equal(other.value.hq_needs_attention.open_notes[0].body, undefined);
    assert.equal((await call('acknowledge_note', { note_id: noteId, next_step: 'Submitting part 1 now.' })).value.acknowledged, true);
    assert.equal((await call('get_hq_state', {})).value.needs_attention.open_notes.length, 0);
  });
});

test('O4. a decision HQ assigned to the orchestrator is listed; a decision for Kyle is not offered to ChatGPT', () => {
  const h = harness({ metered: false });
  const id = submit(h);
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: 'd-orch', question: 'Which scope?', options: [{ id: 'a', label: 'A' }], resume: { authority: 'orchestrator', type: 'scope' } });
  h.engine.emit('DECISION_REQUESTED', { objectiveId: id, decisionId: 'd-kyle', question: 'Accept same-provider review?', options: [{ id: 'a', label: 'A' }], resume: { authority: 'kyle' } });
  assert.deepEqual(attention(h.engine.state).decisions_for_orchestrator.map(d => d.decision_id), ['d-orch']);
});
