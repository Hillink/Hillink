# HQ Pass 4: zero-credit compute

**The rule:** normal HQ operation needs $0 of metered AI API spend. HQ prefers local compute, then the subscriptions Kyle already pays for, then waiting. Metered API compute runs only after Kyle deliberately turns it on and authorizes a bounded amount.

**Core invariant:** no valid Kyle spend authorization means no metered AI request. `tests/compute-adversarial.test.mjs` proves it. It counts metered requests where they would actually be billed: POSTs to the OpenAI Responses API through the real orchestrator adapter, and Claude launches through the real implementer.

## 1. Normal Kyle configuration

Leave `HQ_COMPUTE_MODE` unset. HQ then boots in `ZERO_CREDIT`, and it does not need `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `HQ_SANDBOX_ANTHROPIC_API_KEY`.

These run with no additional token bill:

| Work | Compute class | How it's paid |
|---|---|---|
| HQ's own checks (inspect repo, HQ tests, unit tests, git, verification) | LOCAL | Nothing to pay |
| Qwen and Gemma through Ollama on 127.0.0.1 | LOCAL | Your hardware |
| Claude Code read-only review and investigation | SUBSCRIPTION | Your Claude plan |
| Codex read-only investigation and review | SUBSCRIPTION | Your ChatGPT plan |
| Pass 3 orchestration: planning, routing, handoffs, retries, approvals and World events | LOCAL | Deterministic HQ code, no model call |

These stop at the spend gate:

| Work | Compute class | Why |
|---|---|---|
| Claude **implementation** in the WSL sandbox | METERED_API | The sandbox authenticates with `HQ_SANDBOX_ANTHROPIC_API_KEY` (section 5) |
| In-HQ ChatGPT orchestrator | METERED_API | Every turn is an OpenAI API call. You orchestrate through ChatGPT (your subscription) and HQ instead |

## 2. The architecture

- **Route table** (`compute/registry.mjs`). The compute class comes from the pair *(adapter HQ wired, operation)*. It never comes from agent, task or handoff text. The table is frozen, and a route it doesn't know is `METERED_API`, so HQ fails closed. The same file holds the agent capability registry, as data (`registerAgentProfile`, `registerRoute`), so a future agent is two calls. For example:
  - `claude-code`: implementation, debugging, review; subscription and metered API.
  - `codex`: investigation, review, audit; subscription only.
  - `qwen-local`: classification, summarization, basic analysis; local only.
- **Gate** (`compute/policy.mjs`, `decideCompute`). It runs in this order: capability (who can do the task), security (the route table), authorization and cost, then availability. It is deterministic; no model is asked whether a model call costs money. The engine calls it on every dispatch (`Engine.selectCompute`):
  - It uses LOCAL first, then SUBSCRIPTION.
  - It considers a metered route only when no local or subscription route can do the task at all.
  - A free agent that is busy, rate limited or out of subscription capacity means HQ waits. It never means "pay instead".
- **Grants.** When the engine allows a metered dispatch, it journals the compute selection inside the `DISPATCHED` event. That makes the run and its spend reservation one atomic record. The engine then hands the adapter a one-shot grant object. Metered adapters (`OrchestratorAdapter`, `ClaudeImplementer`) call `redeemGrant` before touching a key or the network. Calling an adapter directly, reusing a grant, or passing a look-alike object sends nothing.
- **Planner and conductor.** Every Pass 3 plan now carries a `compute` section: the class of each step, `meteredComputeRequired`, `expectedMeteredSpendUsd` (0, or unknown), and the spend-gate text.
  - Before creating a step's task, the conductor runs the same gate.
  - Metered work stops as a **Kyle-only decision** (`spend`, with options `retry` and `stop`) before any task, sandbox or key exists. The orchestrator cannot answer it.
  - `retry` re-checks the journal, so choosing it without a real authorization just asks again.
- **Modes.**
  - `ZERO_CREDIT` (default): LOCAL and SUBSCRIPTION only. An authorization cannot override it, and neither can a restart or any agent.
  - `BUDGETED`: metered compute needs a matching authorization.
  - `UNRESTRICTED` is deliberately not implemented. Asking for it, or any unknown value, gives ZERO_CREDIT with a warning.
  - The mode is HQ environment configuration, journaled on every change (`COMPUTE_MODE`). No API, task or agent can set it.
- **Capacity.** Each agent has one capacity state:
  - `AVAILABLE`
  - `BUSY`
  - `RATE_LIMITED`
  - `SUBSCRIPTION_LIMIT_REACHED`
  - `AUTH_REQUIRED`
  - `UNAVAILABLE`
  - `UNKNOWN`

  Remaining subscription quota is always UNKNOWN, because nothing HQ can query reports it reliably. A Claude `rate_limit_event` with a five-hour or seven-day window, or CLI text about a usage limit or plan, becomes `SUBSCRIPTION_LIMIT_REACHED`. The task then waits (`WAITING_FOR_CAPACITY`, recorded once), and there is no paid fallback.

## 3. Spend authorization (paid mode)

Paid compute is something Kyle deliberately turns on:

1. Start HQ with `HQ_COMPUTE_MODE=BUDGETED`. For the optional orchestrator, also set `HQ_ORCHESTRATOR_ENABLED=1` and `OPENAI_API_KEY`.
2. Authorize a bounded amount through the owner API. The API is loopback only, same-origin and uses a session token:

```powershell
$h = @{ 'X-HQ-Client' = 'command-center' }
$t = (Invoke-RestMethod http://127.0.0.1:4312/api/session -Headers $h).token
$h.Authorization = "Bearer $t"
# $2 for one objective, valid for 2 hours:
Invoke-RestMethod http://127.0.0.1:4312/api/spend/authorize -Method Post -Headers $h -ContentType application/json -Body '{"amountUsd":2,"expiresInMinutes":120,"objectiveId":"<id>"}'
# Revoke: /api/spend/revoke {"id":"<authorization id>"}. Retry a task stopped at the gate: /api/spend/retry {"taskId":"<id>"}.
# Ledger, routes and registry: GET /api/compute
```

An authorization has these properties:

- **Explicit.** Only `Engine.authorizeSpend(input, { by: 'kyle' })` creates one, and only the owner HTTP API calls it. The orchestrator's tools have no spending, mode or authorization tool. Handoffs and model output are never parsed for approvals.
- **Bounded.**
  - The amount must be a positive number of dollars with at most two decimals, up to $25.
  - Expiry is required and lasts at most 7 days.
  - An authorization with no scope lasts at most 24 hours.
  - The optional scope can name a task, an objective, a provider (`anthropic` or `openai`) or an agent, and can be one-time.
  - Negative, zero, NaN, Infinity, string or unknown fields are rejected.
- **Conservative accounting.** A dispatch reserves the route's per-run cap: $2 for the sandboxed implementation, $0.25 for an orchestrator turn. A finished run counts its provider-reported cost when there is one. Otherwise it counts the full reservation, so an unknown or negative cost is never treated as $0. Concurrent tasks cannot share more than the amount. A run cancelled after dispatch keeps its reservation.
- **Enforced at the provider too.** Sandboxed Claude gets `--max-budget-usd <reservation>`. The pinned sandbox Claude Code 2.1.138 supports this flag, which was checked. Kyle's Anthropic Console limit on the sandbox key is a third cap.
- **Auditable and revocable.** Authorizations are journaled as `SPEND_AUTHORIZED`, revocations as `SPEND_REVOKED`, and a used-up budget as `BUDGET_EXHAUSTED`. The whole ledger rebuilds from the journal after a restart.

## 4. Cost ledger

`computeLedger` (in `compute/state.mjs`) is exposed in `/api/state` as `compute.ledger` and in `/api/compute`. Each row records:

- task, run, agent, model, backend
- compute class and provider
- start and end, and outcome
- `meteredCostUsd` (null when unknown), `costKnown`, whether spend was authorized, and the reservation

It also gives these totals:

- `meteredSpendToday`, `meteredSpendThisMonth` and `meteredSpendThisTask` (days and months are UTC)
- `unknownCostRunsToday`, and upper bounds that count unknown costs at their reservation
- `runsByClass`

A subscription CLI's `total_cost_usd` is Claude Code's estimate of the API-equivalent value, not a charge. HQ records it as `reportedCostUsd` but never counts it as spend. It also no longer trips Pass 3's objective spend gate, which it did before this pass.

## 5. Claude implementation: why it stays metered (blocked by default)

Pass 2.7 runs sandboxed implementation with a separate spend-limited key, so Kyle's persistent Claude sign-in never enters the untrusted VM. These options were threat-modeled:

| Option | Verdict |
|---|---|
| Copy or mount Kyle's Claude credentials, or a `setup-token` long-lived token, into the sandbox | **Rejected.** A persistent subscription credential would sit in the environment that runs Claude-written code (the tests run there). A prompt-injected session or test could use it or exfiltrate it through Anthropic's own endpoints, which is the one egress the sandbox allows. |
| Authenticated host proxy: the sandbox talks to a host proxy that injects Kyle's OAuth token | **Not safe yet.** The token stays on the host, but untrusted code in the sandbox gets an authenticated channel to Kyle's subscription and can spend its quota on anything. It also depends on using the subscription token outside Claude Code's own client. |
| **Split broker**: Claude Code runs on the **host** under Kyle's sign-in with every built-in tool disabled. Its only tools are HQ's own file tools (read, list, grep, write inside the task scope), and those execute **inside** the sandbox. | **The viable design.** The credential never leaves the host process, and the model can only act through HQ-validated file operations. A probe on the laptop during this pass showed the shape works: the tools were HQ-only, `apiKeySource` was `none` and there was no shell. It needs its own careful build and attack tests: tool path and symlink validation, size limits, disabling hooks, plugins, auto-memory and MCP from user settings, and a sandbox RPC. |

**Pass 4 decision:** do not fake it. Implementation stays `METERED_API`. In ZERO_CREDIT it returns `BLOCKED_REQUIRES_SPEND_APPROVAL` before any sandbox is created or any key is read; live check D below confirms this. The API route is kept intact for BUDGETED use. The split broker is the recommended next step.

**Result in plain terms:** subscription-backed sandboxed implementation was **not** delivered this pass. With the default configuration it is correctly blocked before paid execution.

## 6. Codex

Codex remains read-only: investigation, audit, tracing, review and verification. The hard refusal against routing implementation to it is kept, and it now fires in `Engine.selectCompute` before any cost reasoning.

**Found and fixed:** Pass 3 forwarded `OPENAI_API_KEY` to the Codex CLI. This pass proved live, with Codex 0.159.2, that `CODEX_API_KEY` in Codex's environment makes `codex exec` send an API request. Now:

- Codex never receives either key.
- It runs with `-c forced_login_method=chatgpt`. With that flag, Codex itself refuses any API key before making a request, which was also verified live.
- HQ runs `codex login status` before dispatching. `Logged in using an API key` or `Not logged in` gives `AUTH_REQUIRED`, and the task waits. HQ never switches Codex to API billing.
- A Codex usage limit gives `RATE_LIMITED` with `capacity: SUBSCRIPTION_LIMIT_REACHED` (`AGENT_CAPACITY_EXHAUSTED` in the World), and the task waits.

## 7. Claude review (subscription)

- The child process never gets any of the metered variables: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, the Bedrock, Vertex and Foundry switches, `OPENAI_*`, `CODEX_API_KEY`, or the sandbox key.
- Reviews run with `--setting-sources user`, so repository settings (data) cannot add an `apiKeyHelper` or env block.
- **Before dispatch**, HQ runs `claude auth status --json`. It must report `loggedIn` and `firstParty`, with no `apiKeySource`. The status shows `apiKeySource` exactly when an API key would be used, which was verified live.
- **During the run:** if the session's `init` event reports any `apiKeySource` other than `none` (for example from an `apiKeyHelper` in Kyle's own user settings), HQ kills it. The run is recorded as `BLOCKED AUTH_REQUIRED`, never as subscription work.

## 8. Local compute (Qwen and Ollama)

`qwen-local` and `gemma-local` are first-class `LOCAL` routes (`ollama-qwen`, `ollama-gemma`) through the loopback-only adapter:

- Text in, text out. No tools and no repository writes.
- Implementation is refused by the engine, the routing table and the adapter.
- Ollama **cloud** models (`…-cloud`, or a `remote_host` in the inventory) run on ollama.com under an account. HQ never connects them as local.

The registry lists what a local agent is for (classification, summaries, log and test-output analysis, handoff normalization), so future passes can route that work there. This pass does not add the workforce specialization.

## 9. Secrets audit

Values are never printed or journaled. `/api/state` `health.meteredCredentialsPresent` reports presence only.

| Credential | Loaded by | Who receives it | Needed for normal HQ? | Accidental fallback? |
|---|---|---|---|---|
| `OPENAI_API_KEY` | `connectOrchestrator`, only when `HQ_ORCHESTRATOR_ENABLED=1` **and** BUDGETED | The Authorization header to api.openai.com, per authorized turn | **No** | Before this pass it was forwarded to the Codex CLI. Removed. |
| `ANTHROPIC_API_KEY` | Nobody | Nobody (stripped from every child) | **No** | Claude review sessions that report it are refused |
| `HQ_SANDBOX_ANTHROPIC_API_KEY` | `ClaudeImplementer`, only after redeeming a grant | Piped over stdin into one sandbox instance, which deletes it before the tests run | **No** (only for BUDGETED implementation) | No: the grant is required first |
| `CODEX_API_KEY` | Nobody | Nobody | **No** | Refused by `forced_login_method=chatgpt` |
| `ANTHROPIC_AUTH_TOKEN`, `*_BASE_URL`, Bedrock and Vertex switches | Nobody | Nobody | No | Stripped |
| Kyle's Claude sign-in | The host Claude Code CLI only | Reviews on the host; never the sandbox | Yes, for Claude reviews | n/a |
| Kyle's ChatGPT sign-in for Codex (`CODEX_HOME`) | The host Codex CLI only | Codex reviews | Yes, for Codex | n/a |

Removing all four API keys does not break normal HQ. Live check E ran with fake values for all four present, and nothing used them.

## 10. Failure behavior (instead of spending)

| Situation | What HQ does |
|---|---|
| Metered compute needed, ZERO_CREDIT | `SPEND_APPROVAL_REQUIRED`: the task is blocked with provider, agent, backend, why, maximum cost, $0 alternatives and whether waiting helps. For objectives, it becomes a Kyle decision. |
| BUDGETED with no matching authorization (wrong task, expired, revoked, exhausted, one-time already used) | Same, and the reason names the problem |
| Subscription limit or rate limit | Task waits (`WAITING_FOR_CAPACITY`). The objective waits, or Kyle decides on the review fallback. No API. |
| CLI not signed in, or signed in with an API key | `AUTH_REQUIRED`; the agent is not dispatched |
| Ollama down | Local tasks wait; nothing is escalated to a paid model |
| Restart | Mode, authorizations, reservations, spend-blocked tasks and the ledger rebuild from the journal. Interrupted runs stay parked (Pass 3). |

## 11. World events (additive, contract v1)

`COMPUTE_SELECTED`, `LOCAL_AGENT_STARTED`, `SUBSCRIPTION_AGENT_STARTED`, `METERED_AGENT_STARTED`, `AGENT_CAPACITY_EXHAUSTED`, `WAITING_FOR_CAPACITY`, `SPEND_APPROVAL_REQUIRED`, `SPEND_AUTHORIZED`, `SPEND_REVOKED` and `BUDGET_EXHAUSTED`.

Items carry `computeClass` (plus provider or amount where relevant), and snapshot agents carry `computeClass` and `capacity`. The metadata is safe: no credentials, no model text. There is no visual work in this pass.

## 12. Tests and live results

- `node --test tests/*.test.mjs` with Node 24: **138/138**. That is 121 existing tests, still green, plus 17 financial attack tests in `tests/compute-adversarial.test.mjs`. They cover the core invariant across modes and authorizations, plus all 20 attacks in the brief.
- Existing tests that exercise the metered paths (Pass 2.6 and 2.7 implementation, the orchestrator) now run the way Kyle would enable them: BUDGETED plus an authorization (`tests/compute-helpers.mjs`).
- Live checks: `node live/pass4-live.mjs` ran against the real HQ server, Claude Code 2.1.285 and Codex 0.159.2 in the cloud build container, with fake metered keys in HQ's environment. Full output is in `docs/pass4-live-results.json`.

| Check | Result |
|---|---|
| A. Local | The local run finished DONE as `LOCAL`; $0 metered. Qwen: Ollama isn't installable in the cloud container (download blocked), so the Qwen part runs on the laptop with the same script. |
| B. Claude subscription review | Health: `signed in with the subscription (oauth_token)`. The session ACK read `subscription sign-in` (`apiKeySource: none`) and the run finished DONE as `SUBSCRIPTION`, answering with the correct file and line. The CLI's own estimate was about $0.02 API-equivalent; metered cost was **$0**. |
| C. Codex | Not signed in on that machine, so `AUTH_REQUIRED`: the task stayed READY and was never dispatched, with no API fallback even though `CODEX_API_KEY` and `OPENAI_API_KEY` were set. On the laptop, signed in with ChatGPT, it runs on the subscription. |
| D. Claude implementation | The plan said `METERED COMPUTE REQUIRED`, and the objective stopped at a `BLOCKED_REQUIRES_SPEND_APPROVAL` Kyle decision. 0 implementation tasks, 0 sandboxes. |
| E. API keys present | All four fake keys were present. 0 OpenAI requests, the orchestrator was `DISABLED` (ZERO_CREDIT), and Claude still used the subscription (a leaked fake key would have failed the run). |
| F. Malicious requests | An injected "unlimited spend" objective was treated as data (its plan: not metered). The spend API from a hostile origin returned 403. $1000 and -$5 authorizations were rejected. A `computeMode` field on a task was ignored. 0 authorizations exist. |
| G. Restart | Same stages after restart, mode still ZERO_CREDIT, spend-blocked work still blocked, 0 authorizations. Ledger: 1 LOCAL run, 2 SUBSCRIPTION, 0 METERED, $0. |

## 13. Remaining ways money could be spent

1. **Kyle turns on BUDGETED and authorizes an amount.** This is the intended path. It is capped per authorization, per run (`--max-budget-usd`) and by the Console limit on the sandbox key.
2. **Paid overage on a subscription.** If extra usage (Claude) or purchased credits (Codex/ChatGPT) are enabled on the plan, subscription runs past the plan limit could bill. HQ cannot see that. Turn those off to make "subscription" strictly $0.
3. **An `apiKeyHelper` in Kyle's own user-level Claude settings** that `auth status` doesn't report. HQ kills the session at its `init` event, but the first request may already be in flight. Keep Claude Code's user settings free of API keys.
4. **Anything outside HQ**, such as running the CLIs yourself.

## 14. Remaining security risks

- Claude reviews still run on the host under Kyle's sign-in, with read-only tools. This is unchanged from Pass 2.5.
- The spend and approval owner API trusts any local process that can get the loopback session token. This is the same trust boundary as Pass 3's approvals.
- The split broker (section 5) is not built yet, so sandboxed implementation still needs the separate key when paid mode is on.

## 15. What Kyle configures by hand

- Nothing, for zero-credit operation.
- Recommended:
  - `codex login`, and choose **Sign in with ChatGPT**.
  - Keep Claude Code signed in with your subscription, with no `ANTHROPIC_API_KEY` or `apiKeyHelper` in its settings.
  - Turn off paid extra usage on both plans if you want a hard $0.
- Optional paid mode:
  - Set `HQ_COMPUTE_MODE=BUDGETED` and authorize an amount per task or objective.
  - Keep the $15 Console limit on `HQ_SANDBOX_ANTHROPIC_API_KEY`.
  - `HQ_ORCHESTRATOR_ENABLED=1` only if you really want an in-HQ ChatGPT.
