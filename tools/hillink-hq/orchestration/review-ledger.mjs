// Codex usage conservation (Kyle, 2026-10-02): review consolidation, not weaker review. Codex is the scarce
// independent reviewer, so HQ does not re-send every small repair to it. When Codex reviews a verified commit and
// asks for changes, its findings become the repair contract. Claude repairs against them (inside the existing
// bounded repair and test-failure budgets), HQ verifies every repair deterministically (verify.mjs), and only then
// does HQ decide, in code, whether the repaired commit needs a fresh independent review:
//
//   required  high-risk work, an architecture- or security-sensitive gate, a "reject" verdict, a finding HQ cannot
//             prove fixed (high/critical severity, no file, or its file untouched by the repair), a repair that
//             touches files the reviewer never saw, a repair too large to call "bounded", or a size HQ could not
//             measure (fail closed)
//   skipped   otherwise: every actionable finding names a file the repair changed, the repair stayed inside the
//             reviewed files, and HQ's tests and commit checks passed. The skip is journaled (REVIEW_BOUNDARY) with
//             its reasons and shown in the objective result; it is never silent.
//
// The merge gate, approval gates and HQ verification are unchanged: consolidation only decides whether a second
// Codex call adds independent evidence. Codex capacity is reported as HQ observes it (status and reset time from
// the agent's own rate-limit report); HQ has no remaining-usage figure, so "remaining" is UNKNOWN, never a guess,
// and capacity never turns a required review into a skipped one.
import { providerOf } from './routing.mjs';

// Gates whose work keeps an independent review of the final commit whatever its repair looks like.
export const SENSITIVE_GATES = new Set(['architecture-change', 'security-policy-change', 'credential-change', 'database-change', 'production-change', 'destructive']);
// A repair is "bounded" only if its change against the reviewed commit stays small: at most materialMinLines changed
// lines, or materialFraction of the reviewed change when that is larger.
export const REVIEW_LIMITS = Object.freeze({ materialMinLines: 60, materialFraction: 0.5 });
const PROVABLE = new Set(['low', 'medium']);
const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : '');

// The repair contract from an accepted review of a verified implementation: what was reviewed and what it found.
export function reviewContract(o, review, pair) {
  const h = review.handoff, impl = pair?.impl?.handoff;
  return {
    reviewStepId: review.id,
    reviewer: review.handoffFrom ?? review.agentId,
    provider: providerOf(review.handoffFrom ?? review.agentId),
    verdict: h.verdict,
    reviewedCommit: h.reviewedSource?.commit ?? impl?.commit ?? null,
    reviewedBase: h.reviewedSource?.base ?? impl?.base ?? null,
    reviewedFiles: [...(impl?.filesChanged ?? [])].sort(),
    reviewedPatchHash: pair?.impl?.patchHash ?? impl?.patchHash ?? null,
    findings: h.findings.map((f, i) => ({ id: `F${i + 1}`, severity: f.severity, detail: clip(f.detail, 400), file: f.file ?? null })),
  };
}

// What HQ knows about Codex's capacity right now. Only observed facts; nothing estimated.
export function codexCapacity(state, now) {
  const a = state.agents?.codex;
  const resetAt = Number.isFinite(a?.retryAt) && a.retryAt > now ? a.retryAt : null;
  return { agentId: 'codex', connected: Boolean(a), limited: Boolean(resetAt), resetAt, remaining: 'UNKNOWN', basis: a ? 'HQ-observed agent status and its own rate-limit reports; no usage meter is available' : 'Codex is not registered in this HQ' };
}

// delta: { files, added, deleted } between the reviewed commit and the repaired commit, and the reviewed change's own
// size { added, deleted } against its base; null when HQ could not measure them.
export function reviewBoundary({ plan, contract, repair, verification, delta, reviewedSize, capacity }) {
  const reasons = [];
  if (plan.risk === 'high') reasons.push('high-risk objective: its final commit keeps an independent review');
  const sensitive = (plan.gates ?? []).filter(g => SENSITIVE_GATES.has(g));
  if (sensitive.length) reasons.push(`architecture/security-sensitive gate(s) ${sensitive.join(', ')}: the final commit keeps an independent review`);
  if (contract.verdict === 'reject') reasons.push('the reviewer rejected the change outright');
  if (verification?.ok !== true) reasons.push('HQ verification of the repair did not pass');
  const reviewed = new Set(contract.reviewedFiles);
  const unseen = (repair.filesChanged ?? []).filter(f => !reviewed.has(f));
  if (unseen.length) reasons.push(`scope expansion: the repair changes file(s) the reviewer never saw (${unseen.slice(0, 5).join(', ')})`);
  if (!delta || !reviewedSize) reasons.push('HQ could not measure the repair against the reviewed commit');
  const changed = delta ? delta.added + delta.deleted : null;
  const limit = reviewedSize ? Math.max(REVIEW_LIMITS.materialMinLines, Math.ceil((reviewedSize.added + reviewedSize.deleted) * REVIEW_LIMITS.materialFraction)) : null;
  if (delta && limit != null && changed > limit) reasons.push(`material change: the repair changed ${changed} lines against the reviewed commit (bounded repair limit ${limit})`);
  const touched = new Set(delta?.files ?? []);
  const findings = contract.findings.map(f => {
    if (f.severity === 'info') return { ...f, status: 'informational', why: 'Informational; nothing to prove.' };
    if (!PROVABLE.has(f.severity)) return { ...f, status: 'needs-review', why: `A ${f.severity} finding is confirmed by the reviewer, not by HQ.` };
    if (!f.file) return { ...f, status: 'needs-review', why: 'The finding names no file HQ can check.' };
    if (!touched.has(f.file)) return { ...f, status: 'needs-review', why: `The repair did not change ${f.file}.` };
    if (verification?.ok !== true) return { ...f, status: 'needs-review', why: 'HQ verification did not pass.' };
    return { ...f, status: 'addressed-verified', why: `The repair changed ${f.file} and HQ's tests and commit checks passed.` };
  });
  const open = findings.filter(f => f.status === 'needs-review');
  if (open.length) reasons.push(`finding(s) HQ cannot prove fixed deterministically: ${open.map(f => f.id).join(', ')}`);
  return {
    required: reasons.length > 0,
    reasons: reasons.length ? reasons : ['bounded repair inside the reviewed files; every actionable finding is addressed and HQ-verified'],
    reviewedCommit: contract.reviewedCommit, repairCommit: repair.commit ?? null,
    reviewer: contract.reviewer, reviewStepId: contract.reviewStepId,
    delta: delta ? { files: delta.files.slice(0, 20), changedLines: changed, limit } : null,
    findings, capacity,
  };
}
