# Pass 4.5: Claude implementation on the subscription, through a split broker

Status: implemented on branch `claude/hq-pass4` (see draft PR #38). Tests: `node --test tools/hillink-hq/tests/*.test.mjs` (Node 24).
Live evidence: [pass45-live-results.json](pass45-live-results.json), produced by `node tools/hillink-hq/live/pass45-live.mjs`.

## What changed

Before, implementation (`implement-repo`) had only one runner. It ran Claude Code inside the sandbox with a metered API key (Pass 2.7), so in `ZERO_CREDIT` mode HQ could not implement at all.

Now there is a second, preferred route. Claude Code runs on the trusted host, signed in with Kyle's Claude subscription, and has no built-in tools. Its only tools are seven HQ broker tools served by HQ over MCP on `127.0.0.1`. HQ, not Claude, decides what each call may do and runs it inside the disposable sandbox. Repository code (tests) runs only in the sandbox, with no network and no credential. After Claude finishes, HQ takes the diff from the sandbox itself and runs the unchanged Pass 2.6/2.7 checks: patch validation, scope, the acceptance tests, then a local commit only.

## Trust diagram

```
 TRUSTED HOST (Kyle's machine)                                        | DISPOSABLE SANDBOX (per task)
                                                                      |
  Kyle ── HQ owner API (same-origin, session token)                   |  Linux: unshare net/pid/ipc/uts/mount
             │                                                        |         + tmpfs chroot, setpriv, no caps
             ▼                                                        |  WSL2:  fresh instance, no automount/interop,
  ┌─────────────────────────── HQ (node) ───────────────────────────┐ |         netns + bwrap (Pass 2.7 base image)
  │ engine / conductor / compute policy (ZERO_CREDIT default)        │ |
  │   route: claude-subscription-implementation (SUBSCRIPTION, $0)   │ |  /work  ← staged tree (git archive of base)
  │                                                                  │ |
  │  SubscriptionImplementer                                         │ |  uid 64000  hq-broker.mjs  (list/read/search/
  │   1. claude auth status: subscription, no API key, or BLOCKED    │ |             write/edit; re-validates every
  │   2. sandbox create + stage (base commit)                        │ |             path; O_NOFOLLOW; no symlinks;
  │   3. broker.open(): URL /mcp/<uuid> + 256-bit bearer token       │ |             writes only inside the scope)
  │                                                                  │ |
  │  BrokerServer 127.0.0.1:<random>   ◄── MCP (HTTP, JSON-RPC) ──┐  │ |  uid 64001  node --permission --test
  │   exact Host, no Origin, bearer, POST, ≤1 MB, no batches      │  │ |             (/work read-only, no network,
  │   BrokerSession: policy.authorize → limits → audit → sandbox ─┼──┼─┼──►           no env, timeout 300 s)
  │   sanitize every reply (credentials, host paths, controls)    │  │ |
  │                                                               │  │ |  no credential, no Claude process, no host
  │  Claude Code (child, subscription OAuth, cwd = empty temp dir)│  │ |  home, no HQ, no broker token in here
  │   --tools ""  --strict-mcp-config  --allowedTools mcp__hq__*  ┘  │ |
  │   --setting-sources ""  --permission-mode dontAsk  no sessions   │ |  ── only a diff leaves (HQ pulls it) ──►
  │   HQ stops the run if init shows any other tool or MCP server    │ |
  │                                                                  │ |
  │  after Claude: HQ diff → checkPatch → apply to worktree → scope   │ |
  │  → acceptance tests in the sandbox → local commit → destroy      │ |
  └──────────────────────────────────────────────────────────────────┘ |
        │ HTTPS (Claude Code's own client, subscription OAuth)         |
        ▼                                                              |
   Anthropic (claude.ai subscription)                                  |
```

## Trust boundaries

| Boundary | Enforced by | What crosses it |
|---|---|---|
| Kyle to HQ | owner API: same-origin, per-start session token | objectives, approvals, spend authorizations |
| HQ to Claude Code | CLI flags built from constants; HQ-owned env (metered variables stripped); `claude auth status` preflight; init event check (tools and MCP servers must equal HQ's list exactly, `apiKeySource` must be `none`) | the task brief (HQ-authored) and the MCP config path |
| Claude Code to broker | per-session URL and bearer token (256-bit, timing-safe compare), `127.0.0.1` only, exact Host, no Origin (blocks browsers and DNS rebinding), POST JSON only, 1 MB cap, no batches | tool calls, which HQ treats as untrusted requests |
| broker to sandbox | `policy.authorize` (fixed schemas, `additionalProperties:false`, path rules, scope), limits, then only the fixed guest programs with JSON on stdin; the guest re-checks everything | normalized requests; file bytes; test output (sanitized on the way back) |
| sandbox to host | namespaces and chroot (Linux) or the WSL instance (Windows); no network; unprivileged users; HQ pulls the diff | only a diff, which `checkPatch` validates |

## Where the credentials are

- **Claude subscription OAuth:** only in Claude Code's own config on the host (`~/.claude`). HQ never reads it, copies it, passes it on a command line or puts it into a sandbox. The sandbox cannot see the host home directory (attack tests B12, B12a and the live H1 test prove this).
- **Broker session token:** created per task and written to a `0600` file inside a `0700` temp directory. Only Claude Code reads that file. The token dies when the session closes and the directory is deleted. It never enters the sandbox.
- **Metered keys** (`ANTHROPIC_API_KEY`, `HQ_SANDBOX_ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and others): stripped from Claude Code's environment. The split-broker runner never reads `HQ_SANDBOX_ANTHROPIC_API_KEY` (`sandboxKey()` returns an empty string, and B-tests count the reads: 0).

## The tools (all of them)

| Tool | Does | Limits |
|---|---|---|
| `repo_list` | list a directory of the staged tree | ≤400 entries; no `.git`; no symlink traversal |
| `repo_read` | read a text file (line window) | ≤200 KB per read; binary refused |
| `repo_search` | fixed-string search | ≤100 results; no regex engine from Claude |
| `repo_write` | create or replace a file inside the write scope | ≤400 KB; scope and path re-checked in the sandbox |
| `repo_edit` | exact-text replacement inside the write scope | the old text must match exactly once unless `replace_all` |
| `repo_changes` | list the files this session wrote | |
| `run_tests` | run the contract's acceptance tests in the sandbox | takes no arguments: tests come from HQ's contract; ≤8 runs |

There is no exec, shell, network, git, install or path-outside-the-tree tool. Per-session limits: 25 min deadline, 250 calls, 160 reads, 60 writes, 8 test runs, 40 refusals (after that the session is closed), and 6 MB of output in total.

## Network

- Claude Code (host) talks only to Anthropic through its own client. HQ does not proxy or inspect that traffic.
- The broker listens only on `127.0.0.1`.
- Every sandbox step has no network interface (Linux: a fresh network namespace; WSL: `unshare --net`). Tests keep zero egress (B12, and the live hostile test's isolation test, which fetches `https://1.1.1.1`).

## Authentication and billing

`claude auth status --json` must show a subscription sign-in (`claude.ai` or `oauth_token`, first party). HQ refuses an API-key sign-in or an `apiKeyHelper`. The session's init event must report `apiKeySource: none`, or HQ stops it. `total_cost_usd` in Claude Code's result is Claude Code's notional estimate. It is recorded as `cliReportedCostUsd` and not billed (Pass 4 decision). HQ's ledger records `meteredCostUsd: 0` for the run.

## Paid fallback and ZERO_CREDIT

- Routes: `claude-subscription-implementation` (SUBSCRIPTION, `split-broker`) and `claude-api-sandbox-implementation` (METERED_API, `direct-sandbox`, cap $2 per run).
- The engine picks the cheapest usable variant. In `ZERO_CREDIT` it can pick only the subscription route.
- If the broker is unavailable, the task waits (`WAITING_FOR_CAPACITY` with capacity `UNAVAILABLE`) or the objective goes to `WAITING_FOR_EVIDENCE`. HQ never switches to the API route on its own.
- The API route still exists. It needs `HQ_COMPUTE_MODE=BUDGETED` plus a live Kyle spend authorization. Each runner accepts only its own engine-issued grant (B24).

## Cancellation, crash recovery, concurrency

- **Cancel:** the task's abort signal closes the broker session at once. Every in-flight and later call is refused, sandbox steps are killed (process group), Claude is terminated, and the sandbox is destroyed.
- **Crash:** broker sessions live only in HQ's memory, so a restarted HQ has no session. An orphaned Claude process has no reachable broker and cannot touch the sandbox or the repository. Stale `hq-sbx-*` instances are destroyed at start. The Pass 3 recovery parks interrupted runs until it proves they stopped.
- **Known gap:** the Claude pid is recorded at its first stream event. If HQ crashes in the few hundred milliseconds between spawning Claude and that event, recovery cannot name the pid. The orphan still has no broker, and it exits when its stdin closes.
- **Concurrency:** each task has its own session id, URL, token, sandbox instance, temp directory and worktree. A token is valid only for its own URL (B7). Calls within a session are serialized.

## Audit and World

- Broker audit records go into the task's evidence as `BROKER` worker events. They record the operation, the logical path, the outcome, sizes, counters and refusal reasons. They never record file contents, prompts or credentials (B26).
- Events: `BROKER_CREATED`, `SUBSCRIPTION_IMPLEMENTER_STARTED`, `BROKER_READ`, `BROKER_SEARCH`, `BROKER_WRITE_REQUESTED`, `BROKER_WRITE_ALLOWED`, `BROKER_WRITE_REFUSED`, `BROKER_REFUSED`, `SANDBOX_TEST_STARTED`, `SANDBOX_TEST_COMPLETED`, `SUBSCRIPTION_IMPLEMENTATION_COMPLETED`, `BROKER_CLOSED`.
- World activity (contract v1, additive): `IMPLEMENTATION_STARTED`, `AGENT_WORKING`, `FILE_EDITING`, `TESTING`, `REPAIRING` (a test run after a failed one), `TEST_RESULT`, `IMPLEMENTATION_FINISHED`. None carries a path, code, prompt or credential (B28).

## Tests

`tests/broker-attacks.test.mjs` has 29 tests (B1 to B28, plus B12a). A fake Claude plays the attacker over real HTTP and obeys every injection. The OS isolation claims run against the real Linux namespace sandbox. They cover:

- **filesystem:** traversal, absolute paths, `.git`, symlinks, scope escape, binary and oversize files;
- **tool:** unknown tools, extra arguments, `run_tests` arguments, prototype pollution, and a forged built-in tool in the stream;
- **credential:** the environment, the host home and OAuth files, and redaction of replies;
- **network:** the sandbox has no egress, no DNS, and cannot reach the broker port;
- **prompt injection:** in the repository, file names and test output;
- **lifecycle:** cancellation, deadlines, limits, closed sessions, token reuse across sessions, and wrong Host or Origin;
- **financial:** API-key sign-in, `apiKeySource`, no metered fallback, forged grants, and injected spend.

## Residual risks

1. Claude Code's own flags are the only thing that removes its built-in tools. HQ verifies this at init (exact tool list) and on every tool call in the stream, and stops the run on any mismatch. A Claude Code bug that ran a built-in tool without reporting it in the stream would not be caught by HQ. The OS does not sandbox Claude Code itself, because it must hold the OAuth credential.
2. The subscription's usage limits apply. HQ waits on a limit and does not pay.
3. The crash window described above.
4. Linux backend: HQ must run as root for namespaces and chroot. The WSL backend needs the base image rebuilt, because the new guest scripts are hashed into `base.json`: `node tools/hillink-hq/sandbox/build-base.mjs`. Until then `implementationRoutes.subscriptionSplitBroker` reports UNAVAILABLE, with the reason, and nothing falls back.
5. The model can still write wrong code inside the scope. HQ's tests, its scope check and the independent review catch what they can. The commit stays local, and Kyle decides.
