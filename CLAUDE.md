# Claude instructions for HILLink

This repository is developed by Kyle, Claude, and Codex using an alternating-agent workflow.

Before starting any task:

1. Read `AGENTS.md`.
2. Read `docs/AI_GAMEPLAN.md`.
3. Read `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`, `docs/DECISIONS.md`, and `docs/PRODUCT_SPEC.md`.
4. Read the latest comments in GitHub issue #12, the shared Claude × Codex coordination room.
5. Inspect current `main`, open pull requests, and all relevant remote branches.
6. Acknowledge the previous agent's handoff in issue #12 before editing.
7. Claim one task, branch, and expected file/table scope in issue #12.

Do not work directly on `main`. Do not duplicate or overwrite another agent's active task. If behavior, files, APIs, tables, policies, or migration ordering overlap, stop and coordinate first.

Private chat or project memory is not sufficient shared context. If you know a HILLink requirement, nuance, rejection, or prior decision that is missing from the repository, add it to `docs/PRODUCT_SPEC.md` or propose it in issue #12. Clearly distinguish:

- confirmed by Kyle
- observed in current code
- proposed by an agent
- unresolved question

Do not present inferred or remembered behavior as approved fact. Ask Kyle when a missing choice would materially change product behavior.

At the end of a task, push the branch, open or update a draft PR, run relevant checks, update shared documentation, and post a complete HANDOFF in issue #12 with a specific requested response from Codex.
