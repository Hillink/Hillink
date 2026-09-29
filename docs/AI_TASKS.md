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
