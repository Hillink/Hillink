# Decision log

Record decisions that change product behavior, database ownership, access rules, or operational workflow. Each entry needs a date, decision, reason, and affected files. Do not present an idea or a prior conversation as an implemented decision without checking code and owner approval.

## 2026-09-27: Keep agent coordination in the repository

Decision: Use a short root `AGENTS.md`, a dated code snapshot, and a shared task board. Develop on separate branches and review live diffs before merging.

Reason: Claude and Codex do not share conversation state. The repository provides a checkable handoff, while branch isolation avoids overwriting concurrent changes.

Affected files: `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`.

## 2026-09-28: HQ is World; evidence precedes visualization

Owner-confirmed direction: #12 comment 5877991295 locks HQ and World as one product and the foundation-first implementation order. Assignment is not execution. Unavailable live/provider telemetry is UNKNOWN. Safety boundaries for production, shared databases, live Stripe, destructive migrations and business policy remain unchanged.

Implementation choice (Codex, first slice): use an isolated single-user loopback Node control service in `tools/hillink-hq/`, with a durable journal and an actual allowlisted local verifier. Do not add a production database or pretend the local verifier is a cloud model. Confirm worker termination before safe reassignment; uncertain restarts retain locks and require reconciliation. Real/Fantasy and replay consume the same reducer. This does not decide business policy or authorize deployment. See the HQ README for security limits and incomplete scope.

## 2026-09-29 — HQ cancellation and runtime review

Local worker cancellation uses one second of SIGTERM grace then one second for SIGKILL close evidence, fitting the default three-second engine deadline. Signal acceptance never releases a lease. Alert episode details remain immutable snapshots for durable notification deduplication and are labeled accordingly. Keep Node 24+ as the verified support floor rather than expand support based only on another runtime's partial test pass.
