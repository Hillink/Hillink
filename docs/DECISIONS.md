# Decision log

Record decisions that change product behavior, database ownership, access rules, or operational workflow. Each entry needs a date, decision, reason, and affected files. Do not present an idea or a prior conversation as an implemented decision without checking code and owner approval.

## 2026-09-27: Keep agent coordination in the repository

Decision: Use a short root `AGENTS.md`, a dated code snapshot, and a shared task board. Develop on separate branches and review live diffs before merging.

Reason: Claude and Codex do not share conversation state. The repository provides a checkable handoff, while branch isolation avoids overwriting concurrent changes.

Affected files: `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`.
