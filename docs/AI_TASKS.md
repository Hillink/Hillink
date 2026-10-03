# Shared task board

This file is coordination, not a substitute for checking `git branch -r`, current commits, and pull requests. Update it when claiming a task or handing one off; merge conflicts should be resolved against live branch state.

## Active / awaiting review

Updated 2026-09-28 by Claude. Merged to `main`: #7, #8, #11, #16–#20, and (after Kyle's go-ahead at 21:42Z) #15, #24–#28.

| Task | Owner | Branch / PR | State | Needs Kyle? |
| --- | --- | --- | --- | --- |
| ATH-001 athletes can read `active` campaigns | Claude | `claude/ath001-live-campaign-visibility` / #29 | Draft; migration not run | Yes: read-only policy check, then run migration |
| Hillink HQ / World foundation | Codex | `codex/hillink-hq-foundation` / #31 | Draft, in progress | No |
| P0 security hardening | Claude | `claude/p0-security-hardening` / #14 | Draft; migration not run | Yes: run migration |
| Product spec | Claude | `claude/product-spec-context` / #13 | Draft | Review |
| Help center | Claude | `claude/help-center` / #9, `claude/help-answers-fixes` / #10 | Draft | SQL before merge |

## Next decisions and checks

1. Confirm whether Claude is actively changing the unmerged branches and which one is next to merge.
2. Verify migration history against the actual development and production databases before applying any new migration.
3. Run local Supabase integration and browser tests in an isolated test environment; record failures and whether they reproduce on `main`.
4. Specify college transfer behavior: school/team identity, eligibility reconfirmation, active campaign compatibility, past record retention, and who can edit or see historical affiliations. Do not implement policy by guessing.
5. Audit deployed RLS and payment flows with test accounts after the schema and environment are known.

## Handoff format

For each task, record: owner, branch, base commit, changed files, behavior, migrations/deploy order, checks run, limitations, next owner, and the exact unresolved question. Do not mark a branch merged until it appears in `main`.

## HQ lane — 2026-09-28 (append-only; Claude owns PR #30 table refresh)

- Owner: Codex, `codex/hillink-hq-foundation`, base `cecec51992042d0e25cec38942d721821c43b38f`.
- Authority: #12 locked HQ = World spec and Codex baton; ACK/CLAIM comment 5878266249.
- Scope: isolated `tools/hillink-hq/`, HQ docs, dated coordination notes. No shared DB/migrations/Stripe or cleanup-route edits.
- First slice in draft PR #31: truthful dispatcher + journal/reducer + registry + real local verification adapter + watchdog + outbox + Command Center + Real/Fantasy state views/replay, plus opt-in Ollama text-summary bridge (actual Gemma request verified).
- Pending: independent review; runtime-specific cloud execution/heartbeats and general local-agent tools; remaining full World interactions. Missing adapters are not treated as connected workers. External notifications need an owner-controlled endpoint. Kyle requested wrapping up this implementation pass; continuation should start from the PR handoff.

## HQ review follow-up — 2026-09-29

Codex owns PR #31 review fixes on codex/hillink-hq-foundation. Scope remains HQ adapter/tests/UI wording/docs only. Claude is requested to re-review the final pushed head and confirm termination handling before merge. Slot-overfill work remains Claude's lane. No merge, DB or deployment action in this response.

## HQ B1–B4 follow-up — 2026-09-29

Codex implemented the newer blocking review on PR #31 and merged current main into its branch. Claude should re-review recovery, rate-limit resumption, measured test progress and conflict resolution at the next pushed head. N1 journal/poll scaling and N5 broader event-validation coverage remain follow-ups. Kyle authorized merge conditional on passing checks; final-review clearance is still pending.
