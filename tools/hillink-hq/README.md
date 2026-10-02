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

## Zero-credit compute (Pass 4)

Normal HQ needs **no metered AI API spend**. Every dispatch is classified from HQ's own route table as `LOCAL` (HQ processes, Ollama on 127.0.0.1), `SUBSCRIPTION` (Claude Code and Codex signed in with Kyle's subscriptions) or `METERED_API` (the sandboxed Claude implementation's API key, the optional OpenAI orchestrator, anything unclassified). The default mode, `ZERO_CREDIT`, forbids metered compute outright and returns `BLOCKED_REQUIRES_SPEND_APPROVAL` before anything runs. `HQ_COMPUTE_MODE=BUDGETED` allows metered compute only with a live, bounded, revocable spend authorization Kyle creates through the owner API. Out-of-capacity subscriptions make HQ wait; they never fall back to an API. Full design, secrets audit, live results and remaining risks: [docs/pass4-zero-credit.md](docs/pass4-zero-credit.md).

## Optional real Ollama bridge

Set `HQ_OLLAMA_ENABLED=1` before starting the server (PowerShell: `$env:HQ_OLLAMA_ENABLED='1'`). The bridge discovers existing Gemma/Qwen models through `http://127.0.0.1:11434/api/tags`; it does not download models or contact another host. Queue **Summarize text with a local model**. Only the description is sent to the selected local model, with no file/system tools. Model output is untrusted text, never executable instructions or an authoritative product decision.

Automatic routing prefers Gemma for this utility operation, with Qwen as another capable option; this is a role-based preference, not a fabricated monetary cost estimate. The Worker control permits explicit selection. All HQ local work is serialized. Other programs' Ollama load is UNKNOWN; this is not a machine-wide GPU scheduler.

HTTP submission/headers alone leave the worker UNKNOWN/CLAIMED. Actual generation chunks establish ACK/RUNNING; response output and final token/duration counters supply evidence. Monetary cost/credits stay UNKNOWN. Model loading has a 180-second ACK grace period, during which no work animation is shown. Stream interruption/ambiguous server errors park an unresolved lease. HTTP abort does **not** prove server-side inference stopped. Owner reconciliation is required before another local request can overlap it. A confirmed `done` response releases the lease. Empty output is failure.

Protocol sources: [Ollama model inventory](https://docs.ollama.com/api/tags), [generation stream and counters](https://docs.ollama.com/api/generate). On 2026-09-28 the local `gemma3:4b` bridge was exercised through the browser and completed an actual summary with ACK, output, usage and completion evidence. `qwen3.5:9b` was discovered and its adapter configured; live Qwen inference was not exercised in this pass. Deterministic tests cover routing and interrupted/rejected/empty responses.

## Optional Claude and Codex CLI bridge

Set `HQ_AGENTS_ENABLED=1` before starting the server (PowerShell: `$env:HQ_AGENTS_ENABLED='1'`). HQ then launches the owner's own installed and signed-in CLIs; no API key is stored in HQ.

- **Claude** runs `claude -p --output-format stream-json` with only the `Read`, `Grep` and `Glob` tools, no MCP servers and no saved session.
- **Codex** runs `codex exec --json --sandbox read-only -c approval_policy=never --ephemeral`. Its read-only guarantee is Codex's own sandbox.

Queue **Ask Claude or Codex to review the repo (read-only)** and optionally pick the worker. The task description is sent over stdin, never on a command line. The child gets only PATH, profile/home and proxy variables plus that provider's own configuration (`CLAUDE_CONFIG_DIR` for Claude, `CODEX_HOME` for Codex). Neither ever gets an API key (Pass 4: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY` and the other metered variables are stripped), Codex runs with `-c forced_login_method=chatgpt`, and HQ checks `claude auth status --json` / `codex login status` before dispatching, so reviews run only on your subscription sign-ins. Supabase, Stripe and other secrets are not inherited.

Evidence is real: the CLI's session start is the ACK, the live process sends heartbeats, and each agent step (tool use, message) is progress. The final answer, the token counts the CLI reports and exit status close the run. A missing CLI shows OFFLINE. A CLI that exits before starting a session fails with a sign-in hint. A usage limit becomes RATE_LIMITED with the reported reset time. Runs are stopped after 20 minutes. Cancellation needs observed process close (SIGTERM then SIGKILL; `taskkill /T` then `/T /F` on Windows, where the npm shim runs through a shell). Answers are model output, not verified implementation. Edit-capable runs are not implemented; that needs an owner decision on worktrees and review gates.

## ChatGPT orchestrator (OpenAI)

**Pass 4: optional and off by default.** Every turn is a metered OpenAI API call, and Kyle normally orchestrates through his ChatGPT subscription outside HQ. The orchestrator connects only with `HQ_ORCHESTRATOR_ENABLED=1` (no longer implied by `HQ_AGENTS_ENABLED`), `OPENAI_API_KEY`, and `HQ_COMPUTE_MODE=BUDGETED`; each turn then still needs a Kyle spend authorization. Without it, decisions the orchestrator would make go to Kyle in HQ. With those, ChatGPT becomes a real HQ agent: the orchestrator. Queue **Ask ChatGPT, the orchestrator** (operation `orchestrate`). Without a key it stays not connected, with the reason "OpenAI runtime not configured". A rejected key or unavailable model shows OFFLINE with the reason.

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

## ChatGPT connector ingress (subscription, $0)

This lets ChatGPT on Kyle's subscription submit and follow objectives itself, without Kyle relaying anything and without a metered OpenAI API call. It is a remote MCP server (`ingress/mcp-ingress.mjs`) that exposes exactly six of the orchestrator's tools plus a read-only `wait_for_objective` (blocks up to 55 s until the objective is final or needs someone, so ChatGPT can chain steps in one chat): `submit_objective`, `get_objective`, `get_task`, `get_hq_state`, `resolve_objective_decision` (only decisions HQ assigned to the orchestrator; decisions for Kyle are refused) and `cancel_objective`. They run through the same `createToolbox` validation and the same conductor policy.

- **No approval tool.** There is no approval, merge, deploy, spend or cancel tool. Gates stay Kyle's (`POST /api/objectives/approve`).
- **Attribution.** Objectives arrive as `requestedBy { agentId: 'chatgpt', taskId: null }`.
- **Off by default.** Enable it with `HQ_INGRESS_ENABLED=1`.
- **Binding.** It listens on `127.0.0.1:${HQ_INGRESS_PORT:-4313}`, never on another interface.
- **Auth.** A 256-bit secret in the path, `/mcp/<token>`, compared in constant time. Anything else gets a bare 404.
  - The token comes from `HQ_INGRESS_TOKEN` (43–128 URL-safe characters), or from `<state dir>/ingress-token`. HQ creates that file once with mode 0600 and reuses it, so the connector URL survives restarts.
  - HQ never prints, logs or returns the token, and it is not the browser session token.
- **Limits.** 64 KiB bodies, 120 requests a minute, 5 objective submissions a minute, and HQ's own open-objective limit.
- **Transport.** MCP Streamable HTTP, POST JSON-RPC with JSON responses (no SSE stream). Checked with the official MCP TypeScript SDK client 1.31.0.

To connect ChatGPT:

1. Start HQ with `HQ_INGRESS_ENABLED=1`, and with `HQ_IMPLEMENTATION_ENABLED=1` so Claude takes the implementation steps. It prints `ChatGPT ingress: ENABLED on http://127.0.0.1:4313/mcp/<token> (token in …\ingress-token)`.
2. Run a tunnel to that port, for example `cloudflared tunnel --url http://127.0.0.1:4313` (install with `winget install Cloudflare.cloudflared`).
   - A quick tunnel prints a new `https://<name>.trycloudflare.com` address every time it starts.
   - A named Cloudflare tunnel keeps one address.
3. In ChatGPT, open Settings, then Apps & Connectors, then Advanced, and turn on Developer mode. Create a connector with:
   - URL: `https://<tunnel address>/mcp/<token>`
   - Authentication: none (the secret URL is the credential)
4. Anyone with the full URL can submit objectives, so treat it like a password. To revoke it, delete `ingress-token` (or change `HQ_INGRESS_TOKEN`) and restart HQ.

## Supervised restarts (`restart_hq`)

HQ runs under a small external supervisor: `start-hillink-hq.ps1` runs `node supervisor.mjs`, which launches `server.mjs` as a child with an IPC channel and stays alive while HQ restarts. (Started directly with `node server.mjs`, HQ has no supervisor and `restart_hq` refuses.)

- **Tool:** `restart_hq({ reason })` on the connector (and `POST /api/restart` for Kyle). HQ journals `HQ_RESTART requested` first, refuses while any run is in progress, then asks the supervisor. The answer is `accepted` with a `restart_id`, never "healthy": read `get_hq_state` → `hq_process.last_restart` after about a minute. The call may lose its connection while HQ restarts; the supervisor owns the restart, so that is expected.
- **Sequence:** acknowledge → HQ drains (no new dispatch) → graceful shutdown over IPC (HQ closes its adapters, journal and `controller.lock`) → after 30 s, `taskkill /PID <pid> /T /F` → `controller.lock` released only if its pid is proven gone → relaunch the code already on disk (git HEAD recorded before and after; nothing is pulled or changed) → health check (process alive, `/api/state` with a journal at least as long as before, agents registered, connector port answering) → the new HQ journals `HQ_RESTART completed` with old and new pid, attempts, duration and whether force was needed.
- **Loop protection:** one restart at a time (a second request is a duplicate), 2-minute cooldown, at most 6 per hour, at most 3 start attempts with 5/15/45 s backoff. When they are exhausted the supervisor stays up, writes `supervisor-status.json` and `supervisor.log` in the state directory, and answers on the connector port with a minimal `get_hq_state` that reports HQ DOWN and the diagnostic. It never loops.
- **Self-recovery:** an HQ process that exits unexpectedly is restarted by the supervisor, at most 3 times an hour. Agent or worker problems (Claude offline, Codex usage limit) never restart HQ.
- **Unchanged by a restart:** the journal is replayed, so every objective, decision, approval gate, note and the compute mode come back exactly as they were; a restart approves, clears or retries nothing. The supervisor strips the same paid credentials as the start script.
- **Logs:** `supervisor.log` (JSON lines) and `supervisor-status.json` in the state directory; HQ's own output in `hq-supervised.out.log` / `hq-supervised.err.log` next to `server.mjs`.

## Claude implementation tasks (Pass 2.6)

With `HQ_AGENTS_ENABLED=1` (or `HQ_IMPLEMENTATION_ENABLED=1`), Claude can take bounded implementation tasks, operation `implement-repo`. The safety class is `local-worktree-write`, which only this operation may use. ChatGPT asks through `request_implementation`, which can only go to Claude. The engine also refuses the operation for any agent without the `implement-repo` capability, which only Claude gets, so Codex can never be assigned one.

- **Contract** (`implementation-policy.mjs`, validated in `engine.createTask` whichever way a task is created):
  - objective, scope (1 to 5 repository-relative paths), acceptance criteria, constraints, and 1 to 3 `*.test.(mjs|js|ts)` files
  - scope paths are refused if they are absolute or drive paths, use `..`, `~`, wildcards, backslashes or shell characters, or point at a directory less than two levels deep
  - scope paths are also refused inside `.git`, `.github`, `.claude`, `.vscode`, `node_modules`, `tools/hillink-hq`, `supabase`, `.vercel` or `.next`, if they are package manifests or root config files, or if they look like secrets
- **Run** (`implementation-runner.mjs`):
  1. A fresh `git worktree` on a new branch `hq/impl/<task>` from the implementation base, under `~/.hillink-hq/worktrees` (`HQ_WORKTREE_DIR` to move it). The base is `origin/main` unless `HQ_IMPL_BASE` names one remote-tracking branch as `origin/<branch>` (for World work: `HQ_IMPL_BASE=origin/claude/dev-baseline`, after `git fetch origin claude/dev-baseline`). Any other value, or a ref that does not resolve, disables implementation at start (`/api/state` → `health.implementation` says why); the resolved ref and commit are shown in `health.implementationRoutes.base`.
  2. Claude Code launched directly, with no shell. It gets `--tools Read,Grep,Glob,Edit,Write` (no Bash, no web), `--permission-mode dontAsk`, and `Edit(./<scope>)`/`Write(./<scope>)` as the only pre-approved edits. `--setting-sources user` stops project settings from widening that.
  3. HQ lists what git says changed; anything outside the scope blocks the task.
  4. HQ, not Claude, runs `node --test <tests>` in the worktree with a minimal environment.
  5. Only if the tests pass does HQ commit the in-scope files to the task branch, with `HQ-Task`, `Requested-By` and `Verified-By` trailers. Nothing is pushed or merged.
- **Evidence:** ACK (Claude's session and its tools), Claude's steps and answer, FINDING (changed files), TEST_STARTED and TEST_RESULT (HQ's counts), COMMIT (SHA), and COMPLETED with `implementation: { branch, base, worktree, commit, files, tests }`.
- **Blocked outcomes:** failed tests, a scope violation, missing test files or no changes end BLOCKED with the reason and an owner action. Nothing is committed, and the worktree is kept for inspection.
- **Permissions:** chosen per task by `ClaudeRouter`. Review tasks use the unchanged read-only adapter in the repository, so nothing carries over from one task to the next.

## Subscription implementation through the split broker (Pass 4.5)

In `ZERO_CREDIT` mode, implementation runs on Kyle's Claude subscription.

- Claude Code runs on the host with **no built-in tools** (`--tools ""`) and only HQ's seven broker tools over MCP on `127.0.0.1`: list, read, search, write, edit, changes and run_tests.
- HQ authorizes every call against the task's scope and limits. It then runs the call inside the disposable sandbox, which has no network and no credential, and audits it.
- Afterwards HQ takes the diff itself and runs the usual checks. The commit is local only.
- The metered Pass 2.7 route (Claude inside the sandbox with an API key) remains, but only with `BUDGETED` mode plus a Kyle spend authorization. HQ never falls back to it on its own.
- On Linux the sandbox is `sandbox/linux.mjs`, which uses namespaces and a chroot and needs root. On Windows it is WSL, and you must rebuild the base image once with `node tools/hillink-hq/sandbox/build-base.mjs` for the new guest scripts.
- `GET /api/state` shows `health.implementationRoutes`.
- Design, trust diagram, residual risks: [docs/pass45-split-broker.md](docs/pass45-split-broker.md). Live results: [docs/pass45-live-results.json](docs/pass45-live-results.json).

## OS sandbox for implementation (Pass 2.7)

Implementation runs only inside a disposable WSL2 instance (`sandbox.mjs`). Without the sandbox base image HQ does not offer `implement-repo` at all, and withdraws the capability if an earlier start recorded it.

- **Setup (once):** `node tools/hillink-hq/sandbox/build-base.mjs` builds `~/.hillink-hq/sandbox/base.tar` (Ubuntu Base 24.04, Node 24, Claude Code pinned, all downloads checksum-verified) and records its sha256. Set `HQ_SANDBOX_ANTHROPIC_API_KEY` in your Windows user environment; it is the only key the sandbox receives (`ANTHROPIC_API_KEY` and every other credential stay out).
- **Per task:** the image checksum is verified, a fresh instance `hq-sbx-<task>` is imported, the base commit is streamed in with `git archive` (no Windows path is mounted), and the key goes in on stdin, readable only by root. Drive automount and Windows interop are off, WSL's shared mounts are hidden, there is no sudo and no setuid binary.
- **Claude** runs as the unprivileged `claude` user in its own network namespace. Its only way out is a root-owned proxy that allows `CONNECT api.anthropic.com:443` and refuses and logs everything else. bubblewrap gives it its own PID/IPC namespaces with user namespaces disabled.
- **Tests** run as a second user, `runner`, with no network at all, the key deleted, `/work` read-only, and `node --permission` on top.
- **Return path:** only a patch leaves the instance. HQ rejects symlinks, submodules, `.git`, traversal and anything that looks like a secret, applies it with hardened git, then every Pass 2.6 check runs (scope, tests, local commit only).
- **Teardown:** the instance is unregistered on every outcome, and stale `hq-sbx-*` instances are removed when HQ starts.
- **Attack tests:** `node tools/hillink-hq/sandbox/attack-tests.mjs` runs a hostile "Claude" and a hostile test file through the real wrappers and checks every escape attempt fails.

## Objective orchestration (Pass 3)

Kyle → ChatGPT → HQ → specialist agents → verification → handoff. ChatGPT hands HQ a whole objective (`submit_objective`, or `POST /api/objectives` for Kyle). HQ's conductor (`orchestration/`) plans it, routes each step, validates every handoff, verifies the work itself, and keeps going while the next step is safe. It stops at approval, decision, loop and failure boundaries. Agents reason; HQ controls.

- **Modules:** `policy` (gates, risk, eligibility, budgets), `planner` (the machine-readable plan), `routing` (who may do what), `handoff` (structured, validated agent output), `retry` (failure classes, bounded retries, loop guards), `verify` (HQ's git checks), `recovery` (restart proof), `state` (lifecycle reducer over the same journal), `activity` (the World contract), `conductor` (the control loop).
- **Plan:** objective, type (`investigate`, `review`, `fix`, `implement`), system, approved scope, risk and reasons, gates, required evidence per step, agents, dependencies, implementation eligibility, verification and completion criteria. It is journaled, so after a restart HQ knows what happened, what remains, who is next, and why.
- **Lifecycle:** QUEUED → PLANNING → INVESTIGATING → READY_FOR_IMPLEMENTATION → IMPLEMENTING → VERIFYING → REVIEWING → COMPLETE. Stop states are WAITING_FOR_EVIDENCE, AWAITING_DECISION, AWAITING_APPROVAL, BLOCKED, FAILED and CANCELLED. Every transition is checked against a table before it is journaled. BLOCKED, FAILED, CANCELLED and COMPLETE are final: a new attempt is a new objective.
- **Routing:** investigation goes to Codex (a read-only Claude session when Codex is out). Review goes to Codex; a same-provider Claude review is allowed only at low risk, or with Kyle's decision. Implementation goes to Claude only, in the sandbox; the engine, dispatcher, routing table and conductor each refuse anything else. Verification is HQ's own. ChatGPT decides above the loop and is never routed a step.
- **Handoffs:** agents end with a fenced `hq-handoff` JSON block. HQ parses it as data and checks every field: typed, bounded, no unknown fields, and paths through HQ's path policy. Attribution comes from HQ's record of the run, never from the handoff. The implementation handoff is built by HQ from git and runner evidence.
- **Verification:** HQ re-derives the facts from git. The commit is the head of the task branch and sits on the recorded base. It carries the task id. Every changed file is in scope and matches the runner's evidence. The tests are in the tree, and HQ ran them with at least one real test passing: a file that defines no tests fails, and spoofed summary lines can only lower the count. The sandbox was confirmed destroyed.
- **Disagreement:** one bounded repair, then one response from each side. HQ records both positions, their evidence and the remaining uncertainty, then the orchestrator decides (Kyle at high risk).
- **Retries:** classified as usage limit, timeout, infrastructure, agent failure, malformed handoff, test failure, review changes, interrupted, policy refusal, missing dependency, implementation failure or cancelled. Each class has a maximum (0 or 1, 2 for usage limits) and a recorded strategy. A usage limit reroutes to another approved agent, but never silently lowers an independent review.
- **Loop guards:** maximum steps, agent calls and retries, a deadline, and detection of repeated identical handoffs and identical patches. When one trips, the objective is BLOCKED with the reason.
- **Approval gates:** merge, deploy, production change, database change, destructive, credential change, security-policy change, spend and architecture change. Pre-work gates stop before anything runs. Merge and deploy stop after verified work, and Kyle performs them himself: HQ has no such operation. Only `POST /api/objectives/approve` (Kyle) decides a gate, and ChatGPT has no approval tool. Gates come from declared actions and positive mentions; constraints and negated mentions ("do not deploy") are prohibitions.
- **Cancellation:** `POST /api/objectives/cancel` or ChatGPT's `cancel_objective` stops pending steps and running agents, including the sandbox, and prevents any later commit. Every task is recorded CANCELLED only with confirmed termination; otherwise its lease stays held.
- **Restart:** unresolved runs are parked (Pass 2). HQ then tries to prove each one stopped: the reported pids are gone, and a sandboxed run's instance is unregistered according to a strict WSL listing. It never assumes success. A proven stop becomes one `interrupted` retry in a fresh branch and sandbox; anything unproven stays parked.
- **World contract (v1):** `GET /api/world?since=<seq>` returns a snapshot of agents (activity, current objective and step), objectives (status, progress, steps, dependencies, whether Kyle is needed) and construction (earned only by completed objectives and HQ-verified commits), plus activity since a journal sequence number. It is a pure function of the journal and carries HQ-authored summaries only, never model text.

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

Any local process running as the same user can acquire the session token; this is a single-user local control surface, not isolation from local processes. Alert details (including time since progress, queue size and recovery) are snapshots captured when the episode opens, not live counters. Node 24+ is required and enforced: `createHQ` refuses to start on an older Node, the Linux sandbox is unavailable when the Node it would mount is older than 24, and the guest test controller and per-file test process exit 99 on an older Node. (Node 22 reports node:test events differently; it once let an empty acceptance file count as a pass. The per-file process now also counts only passes attributed to the launched file, on any version.)

## Recovery review follow-up

Terminal worker failures enter diagnosis before cycle completion is allowed. A confirmed failed worker is quarantined for 60 seconds; recovery uses a different capable worker within the two-attempt budget, or parks exact repair/split instructions. Quarantine persists through replay and needs a fresh health observation after cooldown. A rate-limited task with a retry time stays queued until that time; missing retry information or repeated rejection parks an explicit capacity blocker.

Completed verification can be DONE with Tests: failed: the check completed, but the tested code did not pass. A VERIFICATION_FAILED alert requests repair. Worker crashes remain FAILED and use recovery. Actual completed-test counts emit throttled TEST_PROGRESS evidence; repeated counts are rejected. Heartbeats alone still do not reset progress: a single test producing no result for the progress timeout remains subject to the watchdog. This is a deliberate limit, not a claim that heartbeat proves useful work.

Known follow-ups from review: idle health journal growth, bounded state/event pagination, and replay snapshots are not implemented in this foundation slice.

## Journal size

Unchanged health observations are kept in memory, not journaled every tick. The journal records status or detail changes plus a keep-alive every 5 minutes, so an idle connected worker adds about 12 events an hour instead of about 450. Replay therefore shows a worker as UNKNOWN between journaled observations; that is the honest historical reading. `/api/state` returns the latest 300 events and `eventCount`; `/api/history?seq=` still replays the full journal.
