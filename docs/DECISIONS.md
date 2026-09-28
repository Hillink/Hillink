# Decision log

Record decisions that change product behavior, database ownership, access rules, or operational workflow. Each entry needs a date, decision, reason, and affected files. Do not present an idea or a prior conversation as an implemented decision without checking code and owner approval.

## 2026-09-27: Keep agent coordination in the repository

Decision: Use a short root `AGENTS.md`, a dated code snapshot, and a shared task board. Develop on separate branches and review live diffs before merging.

Reason: Claude and Codex do not share conversation state. The repository provides a checkable handoff, while branch isolation avoids overwriting concurrent changes.

Affected files: `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`.

## 2026-09-27: Business tiers in code are current

Decision (Kyle): Starter $250, Growth $400, Scale $700 and Domination $1,200 a month, with the limits in `lib/stripe/config.ts`, are the real tiers. Older $99/$149/$249 figures are outdated.

Reason: Kyle confirmed the app's tiers in the profitability discussion. Source: Claude's project records, transferred 2026-09-28.

Affected files: `lib/stripe/config.ts`, `docs/PRODUCT_SPEC.md` (Money).

## 2026-09-28: Instagram login required for new athletes only

Decision (Kyle): athletes who sign up from now on must connect Instagram through Instagram login before joining a campaign. Existing athletes are grandfathered.

Reason: verified account ownership, without locking out current athletes.

Affected files: PR #7, `supabase/migrations/20260928000650_signup_verification.sql` (not yet run in production).

## 2026-09-28: Answers to the 13 Help Center product questions (PR #9)

Decision (Kyle, answering the numbered questions in the PR #9 body):
1. Rejected proof can be resubmitted.
2. Proof is a link only. Reword checklists that ask for screenshots.
3. The review window is 72 hours.
4. The business rates the athlete right after approving proof.
5. A business can cancel a campaign before any work is approved.
6. Referral XP is not live yet.
7. Stripe is the only payout method. Remove PayPal, Venmo and Cash App.
8. The 1.5-star apply floor is enforced on the server.
9. Disputes go to HILLink by email.
10. Businesses pay athletes on top of their plan, plus a 20% HILLink fee on top of athlete pay.
11. Businesses can change or cancel their plan without closing the account (Stripe customer portal).
12. Fix `tier_rank()` so Platinum ranks between Gold and Diamond.
13. Accounts pending approval can open the Help Center.

Reason: Kyle's written answers on 2026-09-28. Answer 5 may conflict with a proposal to block cancelling once proof is submitted; that question is open in `docs/PRODUCT_SPEC.md` (D4).

Affected files: PRs #8, #9 and #10; `lib/payments/fees.ts` (the fee already defaults to 20% on top).
