# Decision log

Record decisions that change product behavior, database ownership, access rules, or operational workflow. Each entry needs a date, decision, reason, and affected files. Do not present an idea or a prior conversation as an implemented decision without checking code and owner approval.

## 2026-09-27: Keep agent coordination in the repository

Decision: Use a short root `AGENTS.md`, a dated code snapshot, and a shared task board. Develop on separate branches and review live diffs before merging.

Reason: Claude and Codex do not share conversation state. The repository provides a checkable handoff, while branch isolation avoids overwriting concurrent changes.

Affected files: `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`.

## 2026-09-28: Only an admin can cancel once proof is in (D4)

Decision (confirmed by Kyle, project chat 2026-09-28 05:54Z): once any athlete has sent proof for a campaign, only a Hillink admin can cancel it or remove that athlete. "Proof" means an application in `submitted`/`rejected`/`approved`/`completed`, or any row in `deliverable_submissions`. Cancelling, removing and withdrawing keep records (status changes) instead of deleting rows.

Reason: after proof the business has the athlete's post; letting it cancel and take a refund would leave the athlete unpaid. Hard deletes also destroyed payment and history records.

Affected files: `supabase/migrations/20260929000400_campaign_lifecycle_records.sql`, `lib/campaigns/cancel.ts`, `lib/campaigns/lifecycle.ts`, cancel/remove/withdraw/status routes (PR #32).

## 2026-09-28: The business pays when it accepts an athlete (D5)

Decision (confirmed by Kyle, project chat 2026-09-28 05:54Z): the athlete's payment is created at accept, and proof or deliverables are refused until it is held. The business is asked to fund; the athlete is told to wait, then notified when funded.

Reason: no athlete should work on a campaign spot that isn't paid for.

Affected files: `lib/payments/workFunding.ts`, accept/auto-accept/submit routes, `guard_deliverable_submission` (PR #32).

## 2026-09-28: Pay is fixed once an athlete applies (BUS-001, agent-proposed, Codex agreed)

Decision: each application keeps the pay offered when it was made (`offered_payout_cents`); payments are priced from the higher of that and the current pay, and a business can't lower pay while any athlete is still in. Codex's refinement (pay changes after accept need the athlete's re-acceptance) is recorded but not built.

Reason: a business could cut pay to $0 from the browser and then accept.

Affected files: `supabase/migrations/20260929000400_campaign_lifecycle_records.sql`, `lib/payments/server.ts` (PR #32).

