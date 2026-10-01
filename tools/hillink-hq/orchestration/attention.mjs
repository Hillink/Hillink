// Orchestration observability: what the orchestrator (ChatGPT) must not miss. ChatGPT cannot be woken by HQ; it only
// sees HQ when it calls a tool. So HQ keeps an explicit, journaled follow-up list and puts it in front of the
// orchestrator on every tool call (ingress) and in get_hq_state, and raises an HQ alert Kyle and the World see:
//   - an objective that ended BLOCKED, FAILED or CANCELLED and nobody has acknowledged (with what happens next);
//   - a decision HQ assigned to the orchestrator that is still pending;
//   - a standing note Kyle posted for the orchestrator that it has not acknowledged.
// Acknowledging records a fact (who saw it, and the stated next step); it approves, retries or changes nothing.
import { TERMINAL } from './state.mjs';

export const UNRESOLVED = new Set(['BLOCKED', 'FAILED', 'CANCELLED']);
export const ATTENTION_LIMITS = Object.freeze({ items: 20, alertWindowMs: 7 * 24 * 60 * 60_000, noteTitle: 160, noteBody: 8000, ackNote: 600 });
const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);
const iso = at => (Number.isFinite(at) ? new Date(at).toISOString() : null);

export const needsFollowUp = o => UNRESOLVED.has(o.status) && !o.outcomeAck;

export function attention(state, { full = false } = {}) {
  const objectives = Object.values(state.objectives ?? {});
  const followUps = objectives.filter(needsFollowUp).sort((a, b) => (b.endedAt ?? b.updatedAt) - (a.endedAt ?? a.updatedAt)).slice(0, ATTENTION_LIMITS.items)
    .map(o => ({ objective_id: o.id, title: clip(o.input?.title, 160), type: o.input?.type ?? null, status: o.status, why: clip(o.statusReason, 400), owner_action: clip(o.result?.ownerAction, 300), ended_at: iso(o.endedAt), next: 'Read it with get_objective, decide the next step (resubmit, split, or leave it for Kyle), then call acknowledge_objective with that next step.' }));
  const decisions = objectives.filter(o => !TERMINAL.has(o.status)).flatMap(o => Object.values(o.decisions ?? {}).filter(d => d.status === 'PENDING' && d.resume?.authority !== 'kyle').map(d => ({ objective_id: o.id, decision_id: d.id, question: clip(d.question, 300) }))).slice(0, ATTENTION_LIMITS.items);
  const notes = Object.values(state.orchestratorNotes ?? {}).filter(n => !n.ack).sort((a, b) => a.postedAt - b.postedAt).slice(0, ATTENTION_LIMITS.items)
    .map(n => ({ note_id: n.id, title: n.title, from: n.by, posted_at: iso(n.postedAt), ...(full ? { body: n.body } : {}) }));
  return { objectives_needing_followup: followUps, decisions_for_orchestrator: decisions, open_notes: notes, count: followUps.length + decisions.length + notes.length };
}
