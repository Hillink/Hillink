# Decision log

Record decisions that change product behavior, database ownership, access rules, or operational workflow. Each entry needs a date, decision, reason, and affected files. Do not present an idea or a prior conversation as an implemented decision without checking code and owner approval.

## 2026-09-27: Keep agent coordination in the repository

Decision: Use a short root `AGENTS.md`, a dated code snapshot, and a shared task board. Develop on separate branches and review live diffs before merging.

Reason: Claude and Codex do not share conversation state. The repository provides a checkable handoff, while branch isolation avoids overwriting concurrent changes.

Affected files: `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`.

## 2026-09-28: Privileged columns are server-only (P0 security hardening)

Decision: Kyle approved fixing the audit's P0 security holes (project chat, 2026-09-28). Signed-in users can no longer write: XP (`log_athlete_xp_event`), campaign status as another user (`transition_campaign_status`), `campaign_status_log`, athlete `is_verified`/`is_flagged`/`tier`, business plan and Stripe fields on `business_billing_profiles`, athlete Stripe account fields on `athlete_payout_profiles`, or disputes directly. Plan limits (active subscription, open campaigns, slots, athlete tier) are enforced in the database for direct campaign inserts and in the slots/status APIs. Instagram metrics are stored only when read from the athlete's own connected account.

Reason: each was writable through the Supabase API with the anon key and a user session, bypassing checks that existed only in React or in the API.

Affected files: `supabase/migrations/20260929000300_security_hardening.sql`, `lib/campaigns/planLimits.ts`, `app/api/campaigns/[id]/slots/route.ts`, `app/api/campaigns/[id]/status/route.ts`, `lib/instagram/diagnostics.ts`, `app/api/business/report/route.ts`, `tests/sql/security_hardening_check.sql`. Not yet applied to production.
