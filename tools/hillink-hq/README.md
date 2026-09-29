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

## Optional Claude and Codex CLI bridge

Set `HQ_AGENTS_ENABLED=1` before starting the server (PowerShell: `$env:HQ_AGENTS_ENABLED='1'`). HQ then launches the owner's own installed and signed-in CLIs; no API key is stored in HQ.

- **Claude** runs `claude -p --output-format stream-json` with only the `Read`, `Grep` and `Glob` tools, no MCP servers and no saved session.
- **Codex** runs `codex exec --json --sandbox read-only -c approval_policy=never --ephemeral`. Its read-only guarantee is Codex's own sandbox.

Queue **Ask Claude or Codex to review the repo (read-only)** and optionally pick the worker. The task description is sent over stdin, never on a command line. The child gets only PATH, profile/home and proxy variables plus that provider's own configuration (`CLAUDE_CONFIG_DIR` for Claude, which never gets `ANTHROPIC_API_KEY` so reviews use your Claude Code sign-in rather than API billing; `OPENAI_API_KEY`/`CODEX_HOME` for Codex); Supabase, Stripe and other secrets are not inherited.

Evidence is real: the CLI's session start is the ACK, the live process sends heartbeats, and each agent step (tool use, message) is progress. The final answer, the token counts the CLI reports and exit status close the run. A missing CLI shows OFFLINE. A CLI that exits before starting a session fails with a sign-in hint. A usage limit becomes RATE_LIMITED with the reported reset time. Runs are stopped after 20 minutes. Cancellation needs observed process close (SIGTERM then SIGKILL; `taskkill /T` then `/T /F` on Windows, where the npm shim runs through a shell). Answers are model output, not verified implementation. Edit-capable runs are not implemented; that needs an owner decision on worktrees and review gates.

## ChatGPT orchestrator (OpenAI)

With `HQ_AGENTS_ENABLED=1` (or `HQ_ORCHESTRATOR_ENABLED=1`) and `OPENAI_API_KEY` in HQ's environment, ChatGPT becomes a real HQ agent: the orchestrator. Queue **Ask ChatGPT, the orchestrator** (operation `orchestrate`). Without a key it stays not connected, with the reason "OpenAI runtime not configured". A rejected key or unavailable model shows OFFLINE with the reason.

- **Runtime:** OpenAI Responses API over REST with streaming (`orchestrator-adapter.mjs`). There's no SDK, so HQ keeps zero dependencies. The model is `OPENAI_ORCHESTRATOR_MODEL`, default `gpt-6.1-sol`. The instructions live in `prompts/orchestrator.md`.
- **Tools:** `orchestrator-tools.mjs` is the complete list:
  - `get_hq_state` and `get_task` read HQ.
  - `request_repo_review` queues a read-only review for Claude or Codex. It's refused when the agent is not connected, offline or rate limited.
  - `request_kyle_approval` creates an owner-required task, which HQ never runs.
  - There is no shell, file, network or configuration tool. Arguments are validated in HQ before anything happens, and delegated tasks record `requestedBy`, which the HTTP API cannot set.
- **Evidence:** the ACK is OpenAI's `response.created`. Heartbeats come only while a request is in flight. Tool calls are `MODEL_OUTPUT` or `HANDOFF` evidence (a handoff carries `delegatedTaskId`). The answer is `MODEL_RESULT`, with OpenAI's token counts as `USAGE`. A rejected key, an OpenAI outage, a timeout (60 s), a rate limit or more than 6 tool rounds becomes a truthful FAILED or RATE_LIMITED outcome.
- **Context:** one OpenAI Conversation per HQ. Its ID is in `.state/orchestrator.json`, which holds no secrets. HQ, not the conversation, is the source of truth.
- **Scheduling:** it's a remote adapter, so it takes no local-process slot. A question to ChatGPT never waits behind a local run.
- **The key:** read from HQ's environment and sent only to api.openai.com. It is never journaled, logged or returned, and OpenAI error text is redacted.

## Claude implementation tasks (Pass 2.6)

With `HQ_AGENTS_ENABLED=1` (or `HQ_IMPLEMENTATION_ENABLED=1`), Claude can take bounded implementation tasks, operation `implement-repo`. The safety class is `local-worktree-write`, which only this operation may use. ChatGPT asks through `request_implementation`, which can only go to Claude. The engine also refuses the operation for any agent without the `implement-repo` capability, which only Claude gets, so Codex can never be assigned one.

- **Contract** (`implementation-policy.mjs`, validated in `engine.createTask` whichever way a task is created):
  - objective, scope (1 to 5 repository-relative paths), acceptance criteria, constraints, and 1 to 3 `*.test.(mjs|js|ts)` files
  - scope paths are refused if they are absolute or drive paths, use `..`, `~`, wildcards, backslashes or shell characters, or point at a directory less than two levels deep
  - scope paths are also refused inside `.git`, `.github`, `.claude`, `.vscode`, `node_modules`, `tools/hillink-hq`, `supabase`, `.vercel` or `.next`, if they are package manifests or root config files, or if they look like secrets
- **Run** (`implementation-runner.mjs`):
  1. A fresh `git worktree` on a new branch `hq/impl/<task>` from `origin/main`, under `~/.hillink-hq/worktrees` (`HQ_WORKTREE_DIR` to move it).
  2. Claude Code launched directly, with no shell. It gets `--tools Read,Grep,Glob,Edit,Write` (no Bash, no web), `--permission-mode dontAsk`, and `Edit(./<scope>)`/`Write(./<scope>)` as the only pre-approved edits. `--setting-sources user` stops project settings from widening that.
  3. HQ lists what git says changed; anything outside the scope blocks the task.
  4. HQ, not Claude, runs `node --test <tests>` in the worktree with a minimal environment.
  5. Only if the tests pass does HQ commit the in-scope files to the task branch, with `HQ-Task`, `Requested-By` and `Verified-By` trailers. Nothing is pushed or merged.
- **Evidence:** ACK (Claude's session and its tools), Claude's steps and answer, FINDING (changed files), TEST_STARTED and TEST_RESULT (HQ's counts), COMMIT (SHA), and COMPLETED with `implementation: { branch, base, worktree, commit, files, tests }`.
- **Blocked outcomes:** failed tests, a scope violation, missing test files or no changes end BLOCKED with the reason and an owner action. Nothing is committed, and the worktree is kept for inspection.
- **Permissions:** chosen per task by `ClaudeRouter`. Review tasks use the unchanged read-only adapter in the repository, so nothing carries over from one task to the next.

## OS sandbox for implementation (Pass 2.7)

Implementation runs only inside a disposable WSL2 instance (`sandbox.mjs`). Without the sandbox base image HQ does not offer `implement-repo` at all, and withdraws the capability if an earlier start recorded it.

- **Setup (once):** `node tools/hillink-hq/sandbox/build-base.mjs` builds `~/.hillink-hq/sandbox/base.tar` (Ubuntu Base 24.04, Node 24, Claude Code pinned, all downloads checksum-verified) and records its sha256. Set `HQ_SANDBOX_ANTHROPIC_API_KEY` in your Windows user environment; it is the only key the sandbox receives (`ANTHROPIC_API_KEY` and every other credential stay out).
- **Per task:** the image checksum is verified, a fresh instance `hq-sbx-<task>` is imported, the base commit is streamed in with `git archive` (no Windows path is mounted), and the key goes in on stdin, readable only by root. Drive automount and Windows interop are off, WSL's shared mounts are hidden, there is no sudo and no setuid binary.
- **Claude** runs as the unprivileged `claude` user in its own network namespace. Its only way out is a root-owned proxy that allows `CONNECT api.anthropic.com:443` and refuses and logs everything else. bubblewrap gives it its own PID/IPC namespaces with user namespaces disabled.
- **Tests** run as a second user, `runner`, with no network at all, the key deleted, `/work` read-only, and `node --permission` on top.
- **Return path:** only a patch leaves the instance. HQ rejects symlinks, submodules, `.git`, traversal and anything that looks like a secret, applies it with hardened git, then every Pass 2.6 check runs (scope, tests, local commit only).
- **Teardown:** the instance is unregistered on every outcome, and stale `hq-sbx-*` instances are removed when HQ starts.
- **Attack tests:** `node tools/hillink-hq/sandbox/attack-tests.mjs` runs a hostile "Claude" and a hostile test file through the real wrappers and checks every escape attempt fails.

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
