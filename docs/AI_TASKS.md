# Shared task board

This file is coordination, not a substitute for checking `git branch -r`, current commits, and pull requests. Update it when claiming a task or handing one off; merge conflicts should be resolved against live branch state.

## Active / awaiting review

| Task | Owner | Branch | State | Scope |
| --- | --- | --- | --- | --- |
| Shared handoff and baseline checks | Codex | `codex/project-handoff` | Ready for review | `AGENTS.md`, docs, README, waitlist test type fix |
| Help center | Claude | `claude/help-center`, `claude/help-answers-fixes` | Unmerged branches seen; owner status unconfirmed | Inspect branch diffs before touching help features |
| Signup verification | Claude | `claude/signup-verification` | Unmerged branch seen; owner status unconfirmed | Inspect branch diff before touching signup |
| Live test fixes | Claude | `claude/live-test-fixes` | Unmerged branch seen; owner status unconfirmed | Inspect branch diff before touching tests |
| PAY-001: trim env settings (fees, cron secret, Stripe) | Claude | `claude/fee-settings-parsing` | Draft PR #15; Codex review round 1 addressed | `lib/payments/fees.ts`, `lib/env/read.ts`, cron/payout/webhook routes, `lib/stripe/config.ts` |

## Next decisions and checks

1. Confirm whether Claude is actively changing the unmerged branches and which one is next to merge.
2. Verify migration history against the actual development and production databases before applying any new migration.
3. Run local Supabase integration and browser tests in an isolated test environment; record failures and whether they reproduce on `main`.
4. Specify college transfer behavior: school/team identity, eligibility reconfirmation, active campaign compatibility, past record retention, and who can edit or see historical affiliations. Do not implement policy by guessing.
5. Audit deployed RLS and payment flows with test accounts after the schema and environment are known.

## Handoff format

For each task, record: owner, branch, base commit, changed files, behavior, migrations/deploy order, checks run, limitations, next owner, and the exact unresolved question. Do not mark a branch merged until it appears in `main`.
