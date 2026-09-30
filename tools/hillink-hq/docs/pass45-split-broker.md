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
- **Orphaned host Claude (repaired after Codex's audit):** an orphan keeps only its old endpoint URL and token, and both die with HQ. A restarted HQ starts with no sessions, so every call gets a 404. The orphan cannot reach the sandbox or the repository (V8). HQ now records a marker before the spawn (the run's private MCP config path, which is on Claude's command line) and the pid right after the spawn. Recovery no longer counts an unregistered sandbox as proof on this route. It needs the host pid to be gone. If the pid was never recorded, it needs a scan of the process table showing that no process carries the marker. Where the table cannot be read (Windows), the run stays parked with an owner action (V8, V9). What remains is resource use only: an orphan can keep spending subscription usage and CPU until it exits.
- **Concurrency:** each task has its own session id, URL, token, sandbox instance, temp directory and worktree. A token is valid only for its own URL (B7). Calls within a session are serialized.

## Audit and World

- Broker audit records go into the task's evidence as `BROKER` worker events. They record the operation, the logical path, the outcome, sizes, counters and refusal reasons. They never record file contents, prompts or credentials (B26).
- Events: `BROKER_CREATED`, `SUBSCRIPTION_IMPLEMENTER_STARTED`, `BROKER_READ`, `BROKER_SEARCH`, `BROKER_WRITE_REQUESTED`, `BROKER_WRITE_ALLOWED`, `BROKER_WRITE_REFUSED`, `BROKER_REFUSED`, `SANDBOX_TEST_STARTED`, `SANDBOX_TEST_COMPLETED`, `SUBSCRIPTION_IMPLEMENTATION_COMPLETED`, `BROKER_CLOSED`.
- World activity (contract v1, additive): `IMPLEMENTATION_STARTED`, `AGENT_WORKING`, `FILE_EDITING`, `TESTING`, `REPAIRING` (a test run after a failed one), `TEST_RESULT`, `IMPLEMENTATION_FINISHED`. None carries a path, code, prompt or credential (B28).

## Repairs after Codex's audit (Pass 4.5 repair)

1. **Forged test results (blocker).** Before this fix, HQ read `# pass`/`# fail` from node:test's TAP and checked the exit code. Repository code shares that process, so it could print a fake report and `process.exit(0)` before the real reporter ran.
   - HQ now sends a fresh 256-bit run key on stdin to its own runner, `sandbox/guest/hq-test-runner.mjs`. The runner reads the key before any repository code loads and runs the files through node:test's `run()`. It counts the events itself and, only when the run ends normally, writes one line: `HQ-RESULT <json> <mac>`.
   - HQ (`test-verdict.mjs`) accepts only a single valid, completed, successful result. It fails the run if any unissued `HQ-RESULT` line appears, if the exit is dirty, or if any test failed, was cancelled, skipped or todo. Every acceptance file must also run at least one passing test.
   - Hardening in the runner:
     - `--frozen-intrinsics` and the permission model;
     - heap snapshots, V8 flags, object queries and module hooks are disabled;
     - `node:test` and `node:assert` are frozen;
     - stdin is consumed before repository code runs.
   - The same verdict is used for HQ's acceptance run, for Claude's `run_tests`, and for the metered direct-sandbox route.
   - Regression tests: V1 to V6. V1 also shows that the old predicate would have accepted the forged output. V6 runs through the real Linux test step.
2. **Search and list could show what read refuses.** The guest now returns structured entries. HQ applies one rule, `policy.visible()` (exactly what `repo_read` accepts), to every path from `repo_list` and `repo_search`. Hidden entries are audited as counts only. Regression test: V7, with the mechanical invariant that everything listed or found is readable. Before the fix, 11 protected files leaked through a root search.
3. **Orphan PID.** See "Cancellation, crash recovery, concurrency" above.

Residual risk (inherent to running tests at all): code under test runs inside the test process. It can behave correctly only while being tested, and a Node permission-model bypass (a Node bug) would reach the key. The independent review and Kyle's merge decision remain the controls for that.

## Re-audit (Claude, 2026-09-30) and what is still open

**OPEN BLOCKER, not fixed: Area 1, the authenticated test result.** The runner counts node:test events in the same
process as repository code. Repository code can change shared, mutable objects on that path (for example stream
prototypes), so it can change what the runner counts before the result is signed. The signature proves the runner
wrote the result, not that the result is faithful. Automated agents (Claude and Codex) were stopped by safety checks
while working on this fix, so it needs a person to build it. Proposed design:
1. One Node process per acceptance file, each with its own key derived from HQ's run key.
2. A controller process that never loads repository code checks each child's signed result, attributes it to the
   file by process (not by the file name node:test reports), and issues the one result HQ verifies.
3. Inside each child, freeze the test framework's objects and prototypes before repository code loads.
The auditor's proof of concept is the regression test: it must come back red.

**Fixed: crash-recovery gaps** (not security blockers; an orphan has no broker session):
- The host process scan matches the marker anywhere in the raw command line, so shell-wrapped processes are found (V10).
- On the host Claude route HQ always scans for the marker, even when the pid was recorded, so a re-exec'd or child
  process is not missed (V11). Where the process table cannot be read (Windows) the recorded pid remains the proof.
- A lost compute record no longer hides a host Claude run: a cli-claude run with a host marker or host pid is treated
  as a host run (V12).

## Tests

`tests/broker-attacks.test.mjs` has 38 tests (B1 to B28, B12a, and V1 to V9 from the audit repairs). A fake Claude plays the attacker over real HTTP and obeys every injection. The OS isolation claims run against the real Linux namespace sandbox. They cover:

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
