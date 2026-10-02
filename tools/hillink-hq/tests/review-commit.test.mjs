// A review that could never start (objective 8efb28bd, commit dfcbe393): after a repair cycle the review brief quoted
// every implementation attempt, overflowed the engine's 16,000-character task limit, and the objective was blocked
// with "Title and description required". Reviews now quote only the commit they review, briefs are fitted to the
// limit, the error says what is wrong, and an HQ-verified commit can be reviewed by a review objective (reviewCommit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, scriptedAgent, handoffText, investigation, review, role, git } from './orchestration-harness.mjs';
import { fitQuoted } from '../orchestration/conductor.mjs';

const FIX = { objective: 'greet() is missing; find out why and fix it.', type: 'fix', scope: ['sandbox/hq-implementation/'] };
const TEST = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { greet } from './greeting.mjs';\ntest('greets', () => assert.equal(greet('Kyle'), 'Hello, Kyle!'));\n";
// Large implementations (each diff alone fills the 9,000-character quote), different on every attempt.
const bigFiles = (_, n) => ({
  'sandbox/hq-implementation/greeting.mjs': `export const greet = name => \`Hello, \${name}!\`;\n${Array.from({ length: 400 }, (_, i) => `export const filler${n}_${i} = 'attempt ${n} line ${i}';`).join('\n')}\n`,
  'sandbox/hq-implementation/greeting.test.mjs': TEST,
});
const reviews = (...verdicts) => scriptedAgent('Codex', (task) => {
  if (role(task) === 'investigate') return { text: handoffText(investigation()) };
  const v = verdicts.shift() ?? 'approve';
  return v === 'fail' ? { fail: 'reviewer crashed' } : { text: handoffText(review(v === 'approve' ? {} : { verdict: v, findings: [{ severity: 'medium', detail: 'Rename the filler exports.', file: 'sandbox/hq-implementation/greeting.mjs', evidence: null }], recommendation: 'Fix and resubmit.' })) };
});
const commits = h => h.tasks(t => t.operation === 'implement-repo').map(t => t.evidence.find(e => e.kind === 'COMMIT')?.sha).filter(Boolean);

test('review commit 1: after a repair cycle with large diffs the final review starts, fits the limit, and quotes only the commit it reviews', async () => {
  const h = harness({ codex: reviews('request_changes', 'approve'), claudeFiles: bigFiles });
  const id = h.conductor.submit(FIX);
  await h.drive(h.settled(id));
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  const [first, repaired] = commits(h);
  assert.ok(first && repaired && first !== repaired, 'two implementation attempts');
  const finalReview = h.tasks(t => t.operation === 'review-repo' && t.reviewSource?.commit === repaired).at(-1);
  assert.ok(finalReview, 'the review of the repaired commit was created');
  assert.ok(finalReview.description.length <= 16_000);
  assert.match(finalReview.description, new RegExp(repaired));
  assert.ok(!finalReview.description.includes(first), 'the earlier attempt is not quoted');
  assert.equal(o.result.review.handoff.reviewedSource.commit, repaired);
});

test('review commit 2: a too-long task brief is refused with its own message, not as a missing one', () => {
  const h = harness();
  assert.throws(() => h.engine.createTask({ title: 't', description: 'x'.repeat(2001), operation: 'review-repo', safety: 'local-read-only', priority: 50 }), /2001 characters, above HQ's 2000-character limit/);
  assert.throws(() => h.engine.createTask({ title: 't', description: '', operation: 'review-repo', safety: 'local-read-only', priority: 50 }), /Title and description required/);
  // Fitting trims the largest quoted evidence first and keeps every block.
  const fitted = fitQuoted([{ label: 'a', text: 'a'.repeat(9000) }, { label: 'b', text: 'b'.repeat(9000) }, { label: 'c', text: 'c'.repeat(300) }], 12_000);
  assert.ok(fitted.reduce((n, q) => n + q.text.length, 0) <= 12_000);
  assert.equal(fitted.length, 3);
  assert.equal(fitted[2].text.length, 300, 'small blocks untouched');
});

test('review commit 3: a commit HQ verified in an objective that ended BLOCKED can be reviewed on its exact snapshot by a review objective', async () => {
  // The original objective verifies its commit, then its review cannot complete and the objective ends BLOCKED.
  const h = harness({ codex: reviews('fail', 'fail', 'fail'), claudeReview: scriptedAgent('Claude', () => ({ fail: 'reviewer crashed' })) });
  const blocked = h.conductor.submit({ ...FIX, objective: 'Build the greeting module.' });
  await h.drive(h.settled(blocked));
  assert.equal(h.objective(blocked).status, 'BLOCKED');
  const [sha] = commits(h);
  assert.ok(h.objective(blocked).order.some(i => h.objective(blocked).steps[i].kind === 'verify' && h.objective(blocked).steps[i].status === 'DONE'));
  // A fresh review of exactly that commit.
  h.claude.calls.length = 0;
  const ok = scriptedAgent('Claude', () => ({ text: handoffText(review()) }));
  h.engine.adapters['cli-claude'].review = ok;
  const id = h.conductor.submit({ type: 'review', objective: `Review HQ-verified commit ${sha}.`, reviewCommit: sha });
  await h.drive(h.settled(id));
  const o = h.objective(id);
  assert.equal(o.status, 'COMPLETE', o.statusReason);
  const task = h.tasks(t => t.link?.objectiveId === id).at(-1);
  const implStep = Object.values(h.objective(blocked).steps).find(x => x.kind === 'implement');
  assert.deepEqual(task.reviewSource, { commit: sha, base: git(h.repo, 'rev-parse', `${sha}^1`).trim(), branch: implStep.handoff.branch });
  assert.match(task.description, new RegExp(`read-only snapshot of exactly commit ${sha}`));
  assert.match(task.description, /Objective the reviewed change was made for[\s\S]*Build the greeting module\./);
  assert.ok(task.description.length <= 16_000);
  assert.equal(o.result.review.handoff.reviewedSource.commit, sha);
  assert.equal(o.result.review.handoff.reviewedSource.verifiedCommit, sha);
  assert.equal(h.objective(blocked).status, 'BLOCKED', 'the original objective stays final');
});

test('review commit 4: only an HQ-verified commit can be named; anything else is refused before any work exists', async () => {
  const h = harness({ codex: reviews() });
  const before = Object.keys(h.engine.state.objectives).length;
  assert.throws(() => h.conductor.submit({ type: 'review', objective: 'Review it.', reviewCommit: 'a'.repeat(40) }), /no record of verifying commit/);
  assert.throws(() => h.conductor.submit({ type: 'review', objective: 'Review it.', reviewCommit: 'HEAD' }), /full 40-character/);
  assert.throws(() => h.conductor.submit({ type: 'fix', objective: 'Review it.', reviewCommit: 'a'.repeat(40) }), /only for review objectives/);
  assert.equal(Object.keys(h.engine.state.objectives).length, before);
  // A verification that failed, or one of a different commit, is no record.
  const sha = 'b'.repeat(40);
  const fake = (ok, commit) => ({ id: `x${ok}${commit}`, status: 'BLOCKED', steps: { i: { id: 'i', kind: 'implement', handoff: { commit: sha, base: 'c'.repeat(40) } }, v: { id: 'v', kind: 'verify', status: 'DONE', dependsOn: ['i'], handoff: { source: 'hq', ok, commit } } } });
  h.engine.state.objectives.f1 = fake(false, sha);
  h.engine.state.objectives.f2 = fake(true, 'd'.repeat(40));
  assert.equal(h.conductor.verifiedImplementation(sha), null);
  h.engine.state.objectives.f3 = fake(true, sha);
  assert.equal(h.conductor.verifiedImplementation(sha).impl.handoff.commit, sha);
  delete h.engine.state.objectives.f1; delete h.engine.state.objectives.f2; delete h.engine.state.objectives.f3;
});
