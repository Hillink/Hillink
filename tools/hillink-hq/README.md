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

Adapter interface: `health()` returns an actual IDLE/OFFLINE/UNKNOWN/RATE_LIMITED observation; `start({task,runId,emit})` launches and returns promptly; `cancel(runId)` returns true **only after confirmed termination**. `emit` accepts ACK, HEARTBEAT, TEST_STARTED/RESULT, COMMIT, PR, REVIEW, FINDING, HANDOFF, USAGE, MODEL_OUTPUT/RESULT, UNCERTAIN and terminal events. Wire a registered adapter through `createHQ({adapters})`. Cloud execution adapters are **not implemented**. GitHub comments/assignments must never be converted into ACK/heartbeat evidence.

## Optional real Ollama bridge

Set `HQ_OLLAMA_ENABLED=1` before starting the server (PowerShell: `$env:HQ_OLLAMA_ENABLED='1'`). The bridge discovers existing Gemma/Qwen models through `http://127.0.0.1:11434/api/tags`; it does not download models or contact another host. Queue **Summarize text with a local model**. Only the description is sent to the selected local model, with no file/system tools. Model output is untrusted text, never executable instructions or an authoritative product decision.

Automatic routing prefers Gemma for this utility operation, with Qwen as another capable option; this is a role-based preference, not a fabricated monetary cost estimate. The Worker control permits explicit selection. All HQ local work is serialized. Other programs' Ollama load is UNKNOWN; this is not a machine-wide GPU scheduler.

HTTP submission/headers alone leave the worker UNKNOWN/CLAIMED. Actual generation chunks establish ACK/RUNNING; response output and final token/duration counters supply evidence. Monetary cost/credits stay UNKNOWN. Model loading has a 180-second ACK grace period, during which no work animation is shown. Stream interruption/ambiguous server errors park an unresolved lease. HTTP abort does **not** prove server-side inference stopped. Owner reconciliation is required before another local request can overlap it. A confirmed `done` response releases the lease. Empty output is failure.

Protocol sources: [Ollama model inventory](https://docs.ollama.com/api/tags), [generation stream and counters](https://docs.ollama.com/api/generate). On 2026-09-28 the local `gemma3:4b` bridge was exercised through the browser and completed an actual summary with ACK, output, usage and completion evidence. `qwen3.5:9b` was discovered and its adapter configured; live Qwen inference was not exercised in this pass. Deterministic tests cover routing and interrupted/rejected/empty responses.

## Notifications

Material alerts are durable and deduplicated per episode. They include agent/task, time since meaningful progress, evidence, recovery attempts, runnable count and exact owner action. Ordinary healthy progress does not alert. Acknowledgement and delivery are separate.

Enable browser notifications to receive alerts while this page remains open. For delivery when the browser is closed, configure `HQ_NOTIFICATION_WEBHOOK` with an owner-controlled HTTPS endpoint accepting JSON. It is **unset by default**, sends only material alert payloads, times out after five seconds, and retries failures after 60 seconds. Delivery is at least once; receivers deduplicate `notificationId`. The UI explicitly reports missing/failed delivery. No email/Slack provider is silently configured or contacted. The controller must remain running; no OS service is installed.

## Local security / recovery

This is a single-user local tool, not an internet-hosted dashboard. It binds only 127.0.0.1, validates exact Host, rejects cross-origin API requests, requires a custom non-simple request header and a per-controller bearer session acquired from the same-origin UI. This prevents drive-by websites and DNS rebinding; it is **not** isolation from other programs/users already able to access this machine. Do not proxy it publicly. A future hosted version requires owner authentication, authorization, encrypted credentials and per-adapter credentials.

The single-writer lock fails closed. On an unclean shutdown, preserve the log, inspect the lock PID, and verify that controller **and workers** are stopped before manually removing the lock. On restart, unresolved runs are parked and retain their capacity lock. Inspect the blocked task and use **Reconcile an uncertain worker** only after verifying termination, with exact evidence and the explicit checkbox. This journals an owner confirmation, fences late events and releases the capacity lock; the unfinished task stays BLOCKED. It never kills an unknown process or declares the task done. Never delete the event log to make a busy worker look idle. An incomplete/corrupt or unsupported-version journal blocks startup instead of silently losing history.

Adapter health, launch and cancellation calls are bounded. One hung health adapter cannot prevent a different connected capable worker from dispatching. Uncertain/timed-out launches retain their lease. Graceful shutdown waits for the active control tick and confirms local worker cancellation before closing the journal.

For a stale controller lock with **no unresolved worker runs**, `node tools/hillink-hq/unlock.mjs` checks that the recorded PID is absent and every run is terminal before removing only the lock. It refuses live PIDs, uncertain runs and invalid journals; event history is preserved.

## UI scope and remaining work

Functional Command Center: safe queue submission, priorities, assignments, completed/blocked work, state/evidence inspection, test results, material alerts, acknowledgement, adapter health, measured local resource usage, UNKNOWN provider credits, replay and owner-blocked task creation.

Real/Fantasy views consume the identical snapshot; skin changes never call execution APIs. Work animation is restricted to RUNNING and stops when telemetry disconnects. Reduced-motion preference is respected. Replay is conspicuously historical and disables dispatch. Construction inspection uses real task stages/evidence; no fabricated completion percentages or ETA.

Still pending from the full locked spec: authenticated cloud execution bridges and general local-agent tool execution; GitHub evidence ingestion; checkpoint-aware multi-agent Meeting Room and real action-item dispatch; richer traversable spaces/characters; real cross-agent package animations; milestone-driven buildings; local hardware routing/model resource budget; cost intelligence; movable Kyle avatar. The current workstations are navigation/inspection surfaces, **not claims of unlocked capabilities**. No agent is depicted building an unimplemented feature.

The local adapter is useful now for actual verification. It does not prove that this Codex UI session or Claude Code is alive. Connecting those runtimes requires supported execution/heartbeat interfaces and credentials; that integration must preserve their ownership and safety boundaries.

## Review clarifications

Cancellation sends SIGTERM, waits up to one second, then sends SIGKILL and waits up to one more second. Only a process close event confirms termination. Missing close evidence retains the lease even if a signal was accepted. Windows may terminate immediately on SIGTERM; deterministic tests exercise ignored-signal escalation independently of OS behavior.

Any local process running as the same user can acquire the session token; this is a single-user local control surface, not isolation from local processes. Alert details (including time since progress, queue size and recovery) are snapshots captured when the episode opens, not live counters. Node 24+ remains the supported minimum tested here; passing tests on Node 22 does not expand the supported runtime contract.

## Recovery review follow-up

Terminal worker failures enter diagnosis before cycle completion is allowed. A confirmed failed worker is quarantined for 60 seconds; recovery uses a different capable worker within the two-attempt budget, or parks exact repair/split instructions. Quarantine persists through replay and needs a fresh health observation after cooldown. A rate-limited task with a retry time stays queued until that time; missing retry information or repeated rejection parks an explicit capacity blocker.

Completed verification can be DONE with Tests: failed: the check completed, but the tested code did not pass. A VERIFICATION_FAILED alert requests repair. Worker crashes remain FAILED and use recovery. Actual completed-test counts emit throttled TEST_PROGRESS evidence; repeated counts are rejected. Heartbeats alone still do not reset progress: a single test producing no result for the progress timeout remains subject to the watchdog. This is a deliberate limit, not a claim that heartbeat proves useful work.

Known follow-ups from review: idle health journal growth, bounded state/event pagination, and replay snapshots are not implemented in this foundation slice.

## Journal size

Unchanged health observations are kept in memory, not journaled every tick. The journal records status or detail changes plus a keep-alive every 5 minutes, so an idle connected worker adds about 12 events an hour instead of about 450. Replay therefore shows a worker as UNKNOWN between journaled observations; that is the honest historical reading. `/api/state` returns the latest 300 events and `eventCount`; `/api/history?seq=` still replays the full journal.
