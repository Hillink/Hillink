// Codex usage conservation (orchestration/review-ledger.mjs): Codex's findings become the repair contract, Claude
// repairs against them, HQ verifies every repair deterministically, and Codex is called again only at a real
// independent-review boundary. Real engine, conductor, runner, git and HQ-run tests; fake agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, scriptedAgent, handoffText, investigation, review, role, GREETING_TEST } from './orchestration-harness.mjs';
import { reviewBoundary, codexCapacity, reviewContract } from '../orchestration/review-ledger.mjs';

const FIX = { objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] };
const DIR = 'sandbox/hq-implementation';
const FINDING = { severity: 'medium', detail: 'greet() needs a doc comment.', file: `${DIR}/greeting.mjs`, evidence: null };
// Codex investigates, asks for changes on its first review, approves any later one; counts its review calls.
function codex(finding = FINDING) {
  let reviews = 0;
  const agent = scriptedAgent('Codex', task => {
    if (role(task) === 'investigate') return { text: handoffText(investigation()) };
    reviews += 1;
    return { text: handoffText(reviews === 1 ? review({ verdict: 'request_changes', findings: [finding], recommendation: 'Add the comment.' }) : review()) };
  });
  return Object.assign(agent, { reviews: () => reviews });
}
const greeting = (body, extra = '') => ({ [`${DIR}/greeting.mjs`]: `${extra}export const greet = name => \`${body}, \${name}!\`;\n`, [`${DIR}/greeting.test.mjs`]: GREETING_TEST });
const kinds = o => o.order.map(id => `${o.steps[id].kind}:${o.steps[id].status}`);
const boundary = o => Object.values(o.steps).find(s => s.boundary)?.boundary;

test('consolidation 1: a small bounded repair loop (including a failed test repair) is verified by HQ every time and never re-sent to Codex', async () => {
  const c = codex();
  // 1: the reviewed change. 2: the review repair, which fails HQ's tests. 3: the test repair, which passes.
  const h = harness({ codex: c, claudeFiles: (_, n) => (n === 1 ? greeting('Hello') : n === 2 ? greeting('Hi', '// Greets a person.\n') : greeting('Hello', '// Greets a person by name.\n')) });
  const id = h.conductor.submit(FIX);
  await h.drive(h.settled(id), 3000);
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  assert.equal(c.reviews(), 1, 'Codex reviewed once; the repairs were not re-sent to it');
  assert.deepEqual(kinds(o), ['investigate:DONE', 'implement:DONE', 'verify:DONE', 'review:DONE', 'implement:DONE', 'verify:DONE', 'review:SKIPPED']);
  // Deterministic verification still ran: HQ ran the tests on every attempt and verified both accepted commits.
  assert.equal(h.tasks(t => t.operation === 'implement-repo').length, 3, 'reviewed change, failed repair, passing repair');
  const verifies = Object.values(o.steps).filter(s => s.kind === 'verify');
  assert.ok(verifies.every(s => s.handoff.ok === true && s.handoff.checks.every(x => x.ok)), 'HQ verified every accepted commit');
  const repairStep = Object.values(o.steps).filter(s => s.kind === 'implement').at(-1);
  assert.equal(repairStep.retries[0].reason, 'test_failure', 'the failing repair was repaired inside its own step');
  assert.equal(repairStep.repair.fromReview, true, 'the test repair is still a repair of the review findings');
  // The decision is journaled with its evidence, and shown in the result.
  const b = boundary(o);
  assert.equal(b.required, false, b.reasons.join('; '));
  assert.deepEqual(b.findings.map(f => [f.id, f.status]), [['F1', 'addressed-verified']]);
  assert.equal(b.reviewedCommit, Object.values(o.steps).filter(s => s.kind === 'implement')[0].handoff.commit);
  assert.equal(b.repairCommit, o.result.commit);
  assert.ok(h.engine.state.events.some(e => e.type === 'REVIEW_BOUNDARY' && e.data.objectiveId === id));
  assert.deepEqual(o.result.reviewProvenance.reviews.map(r => [r.agentId, r.verdict]), [['codex', 'request_changes']]);
  assert.equal(o.result.reviewProvenance.boundaries[0].required, false);
  assert.match(o.statusReason, /review consolidated/);
  // The repair brief quoted the findings as the contract.
  assert.match(h.tasks(t => t.operation === 'implement-repo')[1].repair.reason, /F1 \[medium\] greet\(\) needs a doc comment/);
});

test('consolidation 2: a material repair (far larger than the reviewed change) goes back to Codex for a final review', async () => {
  const c = codex();
  const big = Array.from({ length: 90 }, (_, i) => `// note ${i}`).join('\n') + '\n';
  const h = harness({ codex: c, claudeFiles: (_, n) => (n === 1 ? greeting('Hello') : greeting('Hello', big)) });
  const id = h.conductor.submit(FIX);
  await h.drive(h.settled(id), 3000);
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  assert.equal(c.reviews(), 2, 'the final commit was reviewed independently');
  const b = boundary(o);
  assert.equal(b.required, true);
  assert.ok(b.reasons.some(r => /material change: the repair changed \d+ lines/.test(r)), b.reasons.join('; '));
  const final = Object.values(o.steps).filter(s => s.kind === 'review').at(-1);
  assert.equal(final.status, 'DONE'); assert.equal(final.agentId, 'codex');
  assert.equal(final.handoff.reviewedSource.commit, o.result.commit, 'Codex read the repaired commit');
});

test('consolidation 3: a repair that touches a file the reviewer never saw invalidates the review and needs a re-review', async () => {
  const c = codex();
  const h = harness({ codex: c, claudeFiles: (_, n) => (n === 1 ? greeting('Hello') : { ...greeting('Hello', '// Greets a person.\n'), [`${DIR}/helpers.mjs`]: 'export const x = 1;\n' }) });
  const id = h.conductor.submit(FIX);
  await h.drive(h.settled(id), 3000);
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  assert.equal(c.reviews(), 2);
  assert.ok(boundary(o).reasons.some(r => /scope expansion: .*helpers\.mjs/.test(r)), boundary(o).reasons.join('; '));
});

test('consolidation 4: architecture/security-sensitive work keeps its independent review of the final commit, however small the repair', async () => {
  const c = codex();
  const h = harness({ codex: c, claudeFiles: (_, n) => (n === 1 ? greeting('Hello') : greeting('Hello', '// Greets a person.\n')) });
  const id = h.conductor.submit({ ...FIX, requestedActions: ['architecture-change'] });
  await h.drive(h.settled(id), 3000);
  h.conductor.approve(id, 'architecture-change', 'approve', { by: 'kyle' });
  await h.drive(h.settled(id), 3000);
  const scope = Object.values(h.objective(id).decisions).find(d => d.status === 'PENDING');
  assert.equal(scope.resume.authority, 'kyle', 'high risk: Kyle confirms the scope');
  h.conductor.decide(id, scope.id, 'approve_scope', { by: 'kyle', rationale: 'ok' });
  await h.drive(h.settled(id), 3000);
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  assert.equal(c.reviews(), 2, 'Codex reviewed the repaired commit');
  const b = boundary(o);
  assert.equal(b.required, true);
  assert.ok(b.reasons.some(r => /high-risk/.test(r)) && b.reasons.some(r => /architecture\/security-sensitive gate\(s\) architecture-change/.test(r)), b.reasons.join('; '));
  assert.deepEqual(b.findings.map(f => f.status), ['addressed-verified'], 'the finding was addressed, and the review still runs');
});

test('consolidation 5: findings HQ cannot prove fixed (high severity, no file, file untouched) keep the review', () => {
  const plan = { risk: 'low', gates: [] };
  const base = { reviewStepId: 'r', reviewer: 'codex', verdict: 'request_changes', reviewedCommit: 'a'.repeat(40), reviewedBase: 'b'.repeat(40), reviewedFiles: ['x/a.mjs', 'x/a.test.mjs'] };
  const repair = { commit: 'c'.repeat(40), filesChanged: ['x/a.mjs', 'x/a.test.mjs'] };
  const ok = { ok: true };
  const small = { files: ['x/a.mjs'], added: 2, deleted: 1 }, size = { added: 10, deleted: 0 };
  const cap = codexCapacity({ agents: {} }, 0);
  const run = (findings, over = {}) => reviewBoundary({ plan, contract: { ...base, findings }, repair, verification: ok, delta: small, reviewedSize: size, capacity: cap, ...over });
  assert.equal(run([{ id: 'F1', severity: 'low', detail: 'd', file: 'x/a.mjs' }]).required, false);
  assert.equal(run([{ id: 'F1', severity: 'high', detail: 'd', file: 'x/a.mjs' }]).required, true);
  assert.equal(run([{ id: 'F1', severity: 'medium', detail: 'd', file: null }]).required, true);
  assert.equal(run([{ id: 'F1', severity: 'medium', detail: 'd', file: 'x/other.mjs' }]).required, true);
  assert.equal(run([{ id: 'F1', severity: 'low', detail: 'd', file: 'x/a.mjs' }], { contract: { ...base, verdict: 'reject', findings: [] } }).required, true);
  // Fail closed: a repair HQ could not measure, or whose verification did not pass, keeps the review.
  assert.equal(run([{ id: 'F1', severity: 'low', detail: 'd', file: 'x/a.mjs' }], { delta: null }).required, true);
  assert.equal(run([{ id: 'F1', severity: 'low', detail: 'd', file: 'x/a.mjs' }], { verification: { ok: false } }).required, true);
  assert.equal(run([], { plan: { risk: 'medium', gates: ['security-policy-change'] } }).required, true);
  // The contract records what was reviewed: the reviewer, its provider, the commit, the files and numbered findings.
  const contract = reviewContract({}, { id: 'r', agentId: 'codex', handoff: { verdict: 'request_changes', findings: [FINDING], reviewedSource: { commit: 'a'.repeat(40), base: 'b'.repeat(40) } } }, { impl: { handoff: { filesChanged: ['x/b.mjs', 'x/a.mjs'] }, patchHash: 'p' } });
  assert.deepEqual([contract.reviewer, contract.provider, contract.reviewedCommit, contract.reviewedFiles, contract.reviewedPatchHash, contract.findings[0].id], ['codex', 'openai', 'a'.repeat(40), ['x/a.mjs', 'x/b.mjs'], 'p', 'F1']);
});

test('consolidation 6: Codex capacity is reported as observed; remaining usage is UNKNOWN, never invented', async () => {
  const none = codexCapacity({ agents: { codex: {} } }, 1000);
  assert.deepEqual([none.remaining, none.limited, none.resetAt], ['UNKNOWN', false, null]);
  const limited = codexCapacity({ agents: { codex: { retryAt: 5000 } } }, 1000);
  assert.deepEqual([limited.remaining, limited.limited, limited.resetAt], ['UNKNOWN', true, 5000]);
  assert.equal(codexCapacity({ agents: {} }, 0).connected, false);
  for (const c of [none, limited]) assert.ok(!/%|percent/i.test(JSON.stringify(c)) && !Object.values(c).some(v => typeof v === 'number' && v !== c.resetAt), JSON.stringify(c));
  // And in a real run's journal and result.
  const h = harness({ codex: codex(), claudeFiles: (_, n) => (n === 1 ? greeting('Hello') : greeting('Hello', '// Greets a person.\n')) });
  const id = h.conductor.submit(FIX);
  await h.drive(h.settled(id), 3000);
  const o = h.objective(id);
  assert.equal(boundary(o).capacity.remaining, 'UNKNOWN');
  assert.equal(o.result.reviewProvenance.boundaries[0].codexRemaining, 'UNKNOWN');
  assert.ok(!/remaining":\s*\d|%/.test(JSON.stringify(boundary(o).capacity)));
});
