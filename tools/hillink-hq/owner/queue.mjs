// "Waiting for Kyle": every owner-gated action HQ is holding, with what Kyle needs to decide it and a fingerprint that
// binds a decision to exactly this request. The fingerprint covers the objective as submitted, the gate or decision
// as requested (including when), and the work it would let through (branch, commit, files). If any of that changes, or
// the request is superseded, the fingerprint changes and a decision made against the old one is refused.
//
// Two kinds of item:
//   gate      an approval gate (merge, deploy, production-change, ...) on an objective AWAITING_APPROVAL: approve | deny
//   decision  a decision HQ assigned to Kyle (authority kyle) on an objective AWAITING_DECISION: one of its option ids
import { createHash } from 'node:crypto';

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
const sha = v => createHash('sha256').update(canonical(v)).digest('hex');

export const itemId = (kind, objectiveId, key) => `${kind}:${objectiveId}:${key}`;

function evidenceOf(o) {
  const steps = o.order.map(id => o.steps[id]);
  const verify = steps.find(s => s.kind === 'verify' && s.handoff);
  const review = steps.filter(s => s.kind === 'review' && s.handoff).at(-1);
  return {
    risk: o.plan?.risk ?? null,
    riskReasons: (o.plan?.riskReasons ?? []).map(r => clip(r, 300)),
    expectedPath: o.plan?.expectedPath ?? [],
    steps: steps.map(s => ({ kind: s.kind, agent: s.agentId ?? null, status: s.status })),
    branch: o.result?.branch ?? null,
    commit: o.result?.commit ?? null,
    files: (o.result?.files ?? []).slice(0, 50),
    verification: verify ? { ok: Boolean(verify.handoff.ok), checks: (verify.handoff.checks ?? []).length, failed: (verify.handoff.checks ?? []).filter(c => !c.ok).map(c => clip(c.name, 80)) } : null,
    review: review ? { agent: review.handoffFrom ?? review.agentId ?? null, verdict: review.handoff.verdict ?? null, recommendation: clip(review.handoff.recommendation, 400) } : null,
    scope: o.input.scope ?? [],
    tests: o.input.tests ?? [],
  };
}

// The binding: what a decision on this item is a decision about. Display-only fields stay out of it.
function bindingOf(o, kind, key) {
  const base = { v: 1, kind, objectiveId: o.id, input: sha(o.input), requestedBy: o.requestedBy ?? null, branch: o.result?.branch ?? null, commit: o.result?.commit ?? null, files: o.result?.files ?? [] };
  if (kind === 'gate') { const a = o.approvals[key]; return { ...base, gate: a.gate, reason: a.reason, stage: a.stage ?? null, requestedAt: a.requestedAt }; }
  const d = o.decisions[key];
  return { ...base, decisionId: d.id, question: d.question, options: d.options, resume: d.resume, requestedAt: d.requestedAt };
}
export const fingerprintOf = (o, kind, key) => sha(bindingOf(o, kind, key));

function common(o, kind, key) {
  return {
    id: itemId(kind, o.id, key), kind, fingerprint: fingerprintOf(o, kind, key),
    objective: { id: o.id, title: clip(o.input.title, 160), type: o.input.type, text: clip(o.input.objective, 2000), status: o.status, why: clip(o.statusReason, 600) },
    requestedBy: o.requestedBy?.agentId ?? 'kyle',
    evidence: evidenceOf(o),
  };
}

export function waitingForKyle(state) {
  const items = [];
  for (const o of Object.values(state.objectives ?? {})) {
    if (o.status === 'AWAITING_APPROVAL') {
      for (const a of Object.values(o.approvals)) {
        if (a.status !== 'PENDING') continue;
        items.push({ ...common(o, 'gate', a.gate), action: { gate: a.gate, stage: clip(a.stage, 300), choices: [{ id: 'approve', label: `Approve ${a.gate}` }, { id: 'deny', label: `Deny ${a.gate}` }] }, reason: clip(a.reason, 600), gateType: a.gate, requestedAt: a.requestedAt });
      }
    }
    if (o.status === 'AWAITING_DECISION') {
      for (const d of Object.values(o.decisions)) {
        if (d.status !== 'PENDING' || d.resume?.authority !== 'kyle') continue;
        items.push({ ...common(o, 'decision', d.id), action: { decisionId: d.id, type: d.resume?.type ?? null, question: clip(d.question, 1200), choices: d.options.map(x => ({ id: x.id, label: clip(x.label, 200) })) }, reason: clip(d.question, 600), gateType: `decision:${d.resume?.type ?? 'other'}`, requestedAt: d.requestedAt });
      }
    }
  }
  return items.sort((a, b) => a.requestedAt - b.requestedAt);
}

export function findItem(state, id) {
  return waitingForKyle(state).find(x => x.id === id) ?? null;
}
