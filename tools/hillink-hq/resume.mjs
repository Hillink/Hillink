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

// resumeFrom: "<worktree name>" (HQ evidence required), or, from Kyle only, { worktree, patchHash, base }.
export function resolveResume(state, resumeFrom, { scope, owner = false } = {}) {
  const spec = typeof resumeFrom === 'string' ? { worktree: resumeFrom } : resumeFrom;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw Error('resumeFrom must be a preserved worktree name');
  for (const k of Object.keys(spec)) if (!['worktree', 'patchHash', 'base'].includes(k)) throw Error(`Unexpected resumeFrom field "${String(k).slice(0, 40)}"`);
  const name = String(spec.worktree ?? '').trim();
  if (!RESUME_NAME.test(name)) throw Error('resumeFrom must name an HQ implementation worktree such as 6c5a1401-a81811');
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
