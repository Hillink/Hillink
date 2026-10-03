// Resuming preserved implementation work. A run that ends BLOCKED after HQ applied Claude's work (failing acceptance
// tests, for example) keeps its worktree and records HQ's own fingerprint of the staged patch (patchHash), its base
// and its files. A later implement objective may name that worktree (resumeFrom); HQ resolves what it must find there
// from that evidence, never from the requester. The runner then verifies the preserved patch against it on disk, read
// only, and imports it into a fresh worktree and sandbox (implementation-runner.mjs). The preserved worktree is never
// written, reset, cleaned or used as a working directory.
//
// Only Kyle (the HTTP API) may resume work HQ has no evidence for, by stating the patch hash and base himself; the
// runner then checks the base is part of the implementation base branch. The ChatGPT connector can only name a
// worktree HQ already has evidence for.
//
// Continuing a COMPLETED run: a later objective may instead name the commit an earlier implement run produced
// ({ worktree, commit }). HQ accepts only its own journaled COMPLETED record of exactly that commit, worktree and
// branch, with a passing test record; there is no owner override. The new scope must stay inside the scope that run
// was granted. The runner then checks the branch still points at that commit, the commit descends from its recorded
// base and carries HQ's own trailers, and base..commit fingerprints as recorded, before importing it into a fresh
// worktree (implementation-runner.mjs verifyCompleted). The completed worktree and branch are only read.
import { RESUME_NAME, validateResume } from './implementation-policy.mjs';

const nameOf = p => String(p ?? '').split(/[\\/]/).filter(Boolean).at(-1) ?? '';

// HQ's evidence for a preserved worktree: every implement-repo terminal event that kept that worktree with a patch
// fingerprint. Two records that disagree are refused rather than chosen between.
export function preservedEvidence(state, name) {
  const found = [];
  for (const task of Object.values(state.tasks ?? {})) {
    if (task.operation !== 'implement-repo') continue;
    for (const e of task.evidence ?? []) {
      const impl = e.implementation;
      if (!['BLOCKED', 'FAILED'].includes(e.kind) || !impl || nameOf(impl.worktree) !== name || !impl.patchHash) continue;
      found.push({ task, e, impl });
    }
  }
  if (!found.length) return null;
  const key = f => `${f.impl.patchHash}|${f.impl.base}|${f.impl.branch}`;
  if (new Set(found.map(key)).size > 1) throw Error(`HQ has conflicting records for preserved worktree ${name}; refusing to guess which one to resume.`);
  return found.at(-1);
}

// HQ's evidence for a completed implementation commit: every implement-repo COMPLETED event that recorded exactly this
// commit. Two records that disagree are refused rather than chosen between.
export function completedEvidence(state, commit) {
  const found = [];
  for (const task of Object.values(state.tasks ?? {})) {
    if (task.operation !== 'implement-repo') continue;
    for (const e of task.evidence ?? []) if (e.kind === 'COMPLETED' && e.implementation?.commit === commit) found.push({ task, e, impl: e.implementation });
  }
  if (!found.length) return null;
  const key = f => `${f.task.id}|${f.impl.patchHash}|${f.impl.base}|${f.impl.branch}|${f.impl.worktree}`;
  if (new Set(found.map(key)).size > 1) throw Error(`HQ has conflicting records for commit ${commit.slice(0, 10)}; refusing to guess which one to continue.`);
  return found.at(-1);
}

const SHA1 = /^[0-9a-f]{40}$/;
// { worktree, commit } (optionally restating branch, base or patchHash, which must match): HQ evidence only.
function resolveCompleted(state, spec, name, scope) {
  const commit = String(spec.commit ?? '');
  if (!SHA1.test(commit)) throw Error('resumeFrom.commit must be a full 40-character lowercase commit sha');
  const found = completedEvidence(state, commit);
  if (!found) throw Error(`HQ has no journaled COMPLETED implementation that committed ${commit.slice(0, 10)}; only an HQ-completed commit can be continued.`);
  const { task, e, impl } = found;
  const recorded = { branch: impl.branch, base: impl.base, patchHash: impl.patchHash };
  if (nameOf(impl.worktree) !== name) throw Error(`HQ recorded commit ${commit.slice(0, 10)} in worktree ${nameOf(impl.worktree).slice(0, 40) || '(none)'}, not ${name}.`);
  for (const k of ['branch', 'base', 'patchHash']) if (spec[k] != null && spec[k] !== recorded[k]) throw Error(`The stated ${k} does not match HQ's record for commit ${commit.slice(0, 10)}.`);
  if (task.stage !== 'DONE') throw Error(`HQ task ${task.id.slice(0, 8)} that committed ${commit.slice(0, 10)} is ${task.stage}, not DONE.`);
  // The run's own COMMIT event must agree with its COMPLETED record.
  if (!(task.evidence ?? []).some(x => x.kind === 'COMMIT' && x.sha === commit && x.runId === e.runId)) throw Error(`HQ has no COMMIT event for ${commit.slice(0, 10)} from the run that completed it.`);
  const t = impl.tests;
  if (!t || !Array.isArray(t.files) || !t.files.length || !Number.isInteger(t.passed) || t.passed < 1 || t.failed !== 0) throw Error(`HQ's record of commit ${commit.slice(0, 10)} has no passing acceptance test result.`);
  if (!Array.isArray(task.implementation?.scope) || !task.implementation.scope.length) throw Error(`HQ has no recorded scope for the task that committed ${commit.slice(0, 10)}.`);
  const note = [`HQ completed that run: ${String(e.summary ?? '').slice(0, 500)}`, `Acceptance tests then: ${t.passed} passed, 0 failed (${t.files.join(', ')}).`].join('\n');
  return validateResume({ worktree: name, branch: impl.branch, base: impl.base, patchHash: impl.patchHash, commit, source: 'hq-completed', files: impl.files ?? null, fromTaskId: task.id, note, tests: { files: t.files, passed: t.passed, failed: 0 }, allowedScope: task.implementation.scope }, scope);
}

// resumeFrom: "<worktree name>" (HQ evidence required), or, from Kyle only, { worktree, patchHash, base }; or, to
// continue a completed run, { worktree, commit } (HQ evidence required, from anyone who may submit).
export function resolveResume(state, resumeFrom, { scope, owner = false } = {}) {
  const spec = typeof resumeFrom === 'string' ? { worktree: resumeFrom } : resumeFrom;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw Error('resumeFrom must be a preserved worktree name');
  for (const k of Object.keys(spec)) if (!['worktree', 'patchHash', 'base', 'commit', 'branch'].includes(k)) throw Error(`Unexpected resumeFrom field "${String(k).slice(0, 40)}"`);
  const name = String(spec.worktree ?? '').trim();
  if (!RESUME_NAME.test(name)) throw Error('resumeFrom must name an HQ implementation worktree such as 6c5a1401-a81811');
  if (spec.commit != null) return resolveCompleted(state, spec, name, scope);
  if (spec.branch != null) throw Error('resumeFrom.branch is only for continuing a completed commit');
  const found = preservedEvidence(state, name);
  if (found) {
    const { task, e, impl } = found;
    // Kyle may restate the hash or base; a restatement that differs from HQ's record is a mismatch, not an override.
    if (spec.patchHash != null && spec.patchHash !== impl.patchHash) throw Error(`The stated patch hash does not match HQ's record for ${name}.`);
    if (spec.base != null && spec.base !== impl.base) throw Error(`The stated base does not match HQ's record for ${name}.`);
    const tests = impl.tests ? `Acceptance tests then: ${impl.tests.passed ?? '?'} passed, ${impl.tests.failed ?? '?'} failed.` : '';
    const note = [`HQ ended that attempt ${e.kind}: ${String(e.summary ?? '').slice(0, 500)}`, tests, impl.testOutput ? `Test output tail:\n${String(impl.testOutput).slice(-1200)}` : ''].filter(Boolean).join('\n');
    return validateResume({ worktree: name, branch: impl.branch, base: impl.base, patchHash: impl.patchHash, source: 'hq-evidence', files: impl.files ?? null, fromTaskId: task.id, note }, scope);
  }
  if (!owner) throw Error(`HQ has no record of preserved worktree ${name} with a verified patch; only Kyle can resume it, by stating its patch hash and base.`);
  if (typeof spec.patchHash !== 'string' || typeof spec.base !== 'string') throw Error(`HQ has no record of preserved worktree ${name}; state its patchHash (sha256 of the staged diff) and base commit to resume it.`);
  return validateResume({ worktree: name, branch: `hq/impl/${name}`, base: spec.base, patchHash: spec.patchHash, source: 'owner' }, scope);
}
