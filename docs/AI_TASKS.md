# Shared task board

This file is coordination, not a substitute for checking `git branch -r`, current commits, and pull requests. Update it when claiming a task or handing one off; merge conflicts should be resolved against live branch state.

## Active / awaiting review

| Task | Owner | Branch | State | Scope |
| --- | --- | --- | --- | --- |
| Shared handoff and baseline checks | Codex | `codex/project-handoff` | Ready for review | `AGENTS.md`, docs, README, waitlist test type fix |
| Help center | Claude | `claude/help-center`, `claude/help-answers-fixes` | Unmerged branches seen; owner status unconfirmed | Inspect branch diffs before touching help features |
| Signup verification | Claude | `claude/signup-verification` | Unmerged branch seen; owner status unconfirmed | Inspect branch diff before touching signup |
| Live test fixes | Claude | `claude/live-test-fixes` | Unmerged branch seen; owner status unconfirmed | Inspect branch diff before touching tests |

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
- First slice: truthful dispatcher + journal/reducer + registry + real local verification adapter + watchdog + outbox + Command Center + Real/Fantasy state views/replay.
- Pending: independent review; runtime-specific cloud/Ollama bridges; remaining full World interactions. Missing adapters are not treated as connected workers.
