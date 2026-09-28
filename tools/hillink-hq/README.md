# Hillink HQ / Hillink World — first execution slice

Authority: [locked product spec](https://github.com/Hillink/Hillink/issues/12#issuecomment-5877991295), [Codex baton](https://github.com/Hillink/Hillink/issues/12#issuecomment-5877912493).

HQ is the World control plane, not a replacement name for the marketplace admin portal. This standalone local service deliberately has no Supabase, Stripe, production environment, or marketplace route dependency. It is an initial reviewable slice, not the full locked product.

## Run

Requires Node **24+** (verified with 24.14.1); no npm dependencies for HQ itself.

```sh
node tools/hillink-hq/server.mjs
# Open http://127.0.0.1:4312
node --test tools/hillink-hq/tests/*.test.mjs
```

Queue `Inspect repository source`, `Run HQ foundation tests`, or `Run Hillink unit tests`. The operation chooses fixed code; task titles/descriptions never become shell commands. Existing unit tests are trusted repository code, not a sandbox for arbitrary/untrusted tests. No seed, E2E, migration, payment or deployment command is available. Local concurrency defaults to one.

Runtime history and the controller lock live in ignored `tools/hillink-hq/.state/`. `HQ_STATE_DIR` and `HQ_PORT` override location/port. Do not commit local logs: evidence can include local paths or future provider output. No secrets should be submitted as task descriptions.

## Evidence and execution contract

`engine.mjs` owns dispatch and a pure reducer. Every state change is appended and fsynced **before** a launch or state mutation. The same reducer reconstructs replay. `registry.mjs` supplies data-driven roles/capabilities/skins/adapters; adding a registration does not require changing the renderer.

- `DISPATCHED` reserves a run and sets CLAIMED; it does **not** make a worker RUNNING.
- Only an actual worker ACK followed by fresh process heartbeats permits RUNNING.
- Heartbeats show liveness, not meaningful progress. Commits, results, findings, PRs, reviews, handoffs and completion advance a separate progress timestamp.
- No ACK is UNKNOWN. Expired heartbeat is OFFLINE; fresh heartbeat without progress is STALLED. Explicit capacity observations support IDLE/RATE_LIMITED. Unconnected agents/unknown provider models/cost/credits remain UNKNOWN.
- Run IDs fence late events. Terminal runs reject further evidence. Failed or uncertain starts retain the lease until worker termination is confirmed.
- Watchdog diagnosis precedes cancellation. A confirmed stop permits a bounded handoff to a different capable worker; otherwise work is parked with an exact blocker and owner action. Other safe work continues when resource safety permits. This slice never claims that it has automatically repaired code or decomposed an arbitrary task.
- Completion requires READY=0, WORKING=0, REVIEW=0, no unresolved worker leases, and explicit blockers on everything remaining.

`local-adapter.mjs` starts a real Node child with an allowlisted operation and a minimal environment. No production/provider environment variables are inherited. Worker ACK, test events, file inventory, elapsed time, CPU time and RSS are actual observations. Its identity is **Local verifier**, never Claude/Codex/Qwen/Gemma. In-process Node test isolation means cancelling the worker does not leave a shell/test process tree behind. The heartbeat and IPC channel are unreferenced so they cannot artificially keep a finished test runner alive.

Adapter interface: `health()` returns an actual IDLE/OFFLINE/UNKNOWN/RATE_LIMITED observation; `start({task,runId,emit})` launches and returns promptly; `cancel(runId)` returns true **only after confirmed termination**. `emit` accepts ACK, HEARTBEAT, TEST_STARTED/RESULT, COMMIT, PR, REVIEW, FINDING, HANDOFF, USAGE and terminal events. Wire a registered adapter through `createHQ({adapters})`. Cloud/Ollama adapters are **not implemented** and cannot be activated just by claiming availability in the UI. GitHub comments/assignments must never be converted into ACK/heartbeat evidence.

## Notifications

Material alerts are durable and deduplicated per episode. They include agent/task, time since meaningful progress, evidence, recovery attempts, runnable count and exact owner action. Ordinary healthy progress does not alert. Acknowledgement and delivery are separate.

Enable browser notifications to receive alerts while this page remains open. For delivery when the browser is closed, configure `HQ_NOTIFICATION_WEBHOOK` with an owner-controlled HTTPS endpoint accepting JSON. It is **unset by default**, sends only material alert payloads, times out after five seconds, and retries failures after 60 seconds. Delivery is at least once; receivers deduplicate `notificationId`. The UI explicitly reports missing/failed delivery. No email/Slack provider is silently configured or contacted. The controller must remain running; no OS service is installed.

## Local security / recovery

This is a single-user local tool, not an internet-hosted dashboard. It binds only 127.0.0.1, validates exact Host, rejects cross-origin API requests, requires a custom non-simple request header and a per-controller bearer session acquired from the same-origin UI. This prevents drive-by websites and DNS rebinding; it is **not** isolation from other programs/users already able to access this machine. Do not proxy it publicly. A future hosted version requires owner authentication, authorization, encrypted credentials and per-adapter credentials.

The single-writer lock fails closed. On an unclean shutdown, preserve the log, inspect the lock PID, and verify that controller **and workers** are stopped before manually removing the lock. On restart, unresolved runs are parked and retain their capacity lock; this slice intentionally requires operator reconciliation rather than guessing that an old worker is dead. Never delete the event log to make a busy worker look idle. An incomplete/corrupt journal blocks startup instead of silently losing history.

## UI scope and remaining work

Functional Command Center: safe queue submission, priorities, assignments, completed/blocked work, state/evidence inspection, test results, material alerts, acknowledgement, adapter health, measured local resource usage, UNKNOWN provider credits, replay and owner-blocked task creation.

Real/Fantasy views consume the identical snapshot; skin changes never call execution APIs. Work animation is restricted to RUNNING and stops when telemetry disconnects. Reduced-motion preference is respected. Replay is conspicuously historical and disables dispatch. Construction inspection uses real task stages/evidence; no fabricated completion percentages or ETA.

Still pending from the full locked spec: authenticated cloud/local-model execution bridges; GitHub evidence ingestion; checkpoint-aware multi-agent Meeting Room and real action-item dispatch; richer traversable spaces/characters; real cross-agent package animations; milestone-driven buildings; local hardware routing/model resource budget; cost intelligence; movable Kyle avatar. The current workstations are navigation/inspection surfaces, **not claims of unlocked capabilities**. No agent is depicted building an unimplemented feature.

The local adapter is useful now for actual verification. It does not prove that this Codex UI session or Claude Code is alive. Connecting those runtimes requires supported execution/heartbeat interfaces and credentials; that integration must preserve their ownership and safety boundaries.
