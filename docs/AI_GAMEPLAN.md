# HILLink two-agent game plan

Owner: Kyle Hill  
Agents: Claude and Codex  
Coordination room: GitHub issue #12  
Status: Active operating plan  
Last updated: 2026-09-27

## Objective

Build HILLink safely and quickly by treating Claude and Codex as an alternating two-engineer team. Usually only one agent is active. The active agent receives the baton, acknowledges the previous handoff, completes one clearly owned unit of work, pushes it, and returns the baton with a specific request.

Kyle owns product priorities and final business decisions. Agents own technical investigation, proposals, implementation, verification, review, documentation, and explicit escalation of uncertainty.

## Shared source of truth

Use sources in this order:

1. Current code and database migrations on the relevant branch.
2. Merged decisions in `docs/DECISIONS.md`.
3. Active ownership in `docs/AI_TASKS.md` and issue #12.
4. Current-state notes in `docs/CURRENT_STATE.md`.
5. Approved GitHub issue or PR discussion.
6. Private Claude or ChatGPT conversation history only as unverified context.

If two sources conflict, stop and report the conflict. Do not silently choose one.

## Default roles

Roles alternate by task; neither model permanently owns an area.

- **Builder:** investigates, proposes, implements, tests, documents, and opens a draft PR.
- **Reviewer:** independently checks behavior, security, RLS, payments, migration safety, regressions, edge cases, and tests.
- **Kyle:** chooses priority, resolves material product disagreements, and approves production-affecting actions.

A reviewer should not rewrite functioning code merely because it prefers another style. A builder must not dismiss a review finding without evidence.

## Mandatory baton cycle

### 1. Receive

The incoming agent must:

- Pull or inspect current `main`.
- Read this file, `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/AI_TASKS.md`, `docs/DECISIONS.md`, and the latest comments in issue #12.
- Inspect open PRs and branches relevant to the task.
- Respond to the outgoing agent's last HANDOFF using the ACK / RESPONSE template in issue #12.
- Answer or explicitly escalate every open question.

### 2. Claim

Before editing, post a CLAIM in issue #12 with:

- task and outcome
- branch and base commit
- expected files, APIs, tables, policies, and migrations
- dependencies and possible overlap
- planned verification

One task has one owner and one branch. If another active task overlaps behavior, files, tables, migrations, or API contracts, stop and coordinate first.

### 3. Investigate or propose

Use a design proposal before implementation when a task changes:

- product rules or user-visible workflow
- database ownership or history
- authentication, authorization, or RLS
- payment, refund, payout, or billing behavior
- compliance or athlete eligibility
- external integrations
- multiple portals or three or more downstream systems

The second model critiques the proposal. After one response from each model, synthesize the result or ask Kyle. Do not create an endless debate.

### 4. Build

- Work only on the claimed branch.
- Preserve unrelated and unmerged work.
- Make schema changes through ordered migrations.
- Keep secrets and production data out of commits and logs.
- Push checkpoint commits during long tasks.
- Update tests and documentation with behavior changes.

### 5. Verify

Minimum checks for ordinary code changes:

- `npm run test:unit`
- `npm run security:api-auth`
- `npx tsc --noEmit`
- `npm run build`

Run relevant integration and Playwright tests when an isolated test environment is available. Payment, auth, RLS, migration, and production-state claims require appropriate end-to-end or database verification; a successful TypeScript build is not enough.

Never seed, reset, migrate, refund, pay out, deploy, or delete against production without explicit authorization and verified targets.

### 6. Review

Open a draft PR and request review from the other model. The reviewer posts:

- blocking findings
- non-blocking findings
- missing tests or edge cases
- agreements and disagreements
- merge recommendation

The builder addresses material findings and reruns affected checks. Significant unresolved product disagreements go to Kyle with both positions stated plainly.

### 7. Return the baton

Before stopping, the active agent must push its work and post a HANDOFF in issue #12 containing:

- branch and commit or PR
- completed behavior
- files and migrations changed
- exact checks and results
- what was not verified
- known risks and open questions
- the next recommended task
- the exact response requested from the next agent

The handoff is incomplete until the incoming model acknowledges it.

## Current execution sequence

### Phase 0 — Establish the shared system

1. Claude reviews draft PR #11.
2. Claude confirms which of these branches remain active, obsolete, or ready to merge:
   - `claude/help-center`
   - `claude/help-answers-fixes`
   - `claude/signup-verification`
   - `claude/live-test-fixes`
3. Claude posts the review and branch-status handoff in issue #12.
4. Address legitimate review findings, then merge PR #11.
5. Both agents refresh from the updated `main`.

Exit condition: shared instructions and documentation are on `main`, and every existing Claude branch has a known status.

### Phase 1 — Stabilize the baseline

1. Reconcile all intended migrations with the actual development database history.
2. Establish a safe, isolated local/test Supabase workflow.
3. Run unit, authorization, integration, and browser suites.
4. Triage failures into product bugs, test bugs, environment gaps, or stale branches.
5. Verify that every API route has appropriate authorization and that sensitive database operations are protected by RLS or server-side checks.
6. Document deployment order, rollback limitations, and required environment-variable names.

Exit condition: a repeatable test baseline exists, intended migrations are understood, and critical auth/payment paths have no unexplained failures.

### Phase 2 — Finish already-started launch work

Complete and review existing work before opening duplicate implementations:

1. Signed-in, role-aware Help Center and advanced FAQ.
2. Help-answer corrections and any resulting product-rule decisions.
3. Signup verification and onboarding behavior.
4. Live-test fixes.
5. Welcome and reminder communications for athletes and businesses, tied to actual app state rather than generic emails.

Exit condition: the existing Claude branches are merged, intentionally replaced, or closed with the reason documented.

### Phase 3 — College-transfer design

Use issue #12 for the initial proposal and critique. Decide before coding:

- current school/team identity and effective dates
- transfer-in-progress status
- eligibility and compliance reconfirmation
- what happens to active applications and campaigns
- retention of ratings, score, XP, earnings, deliverables, and history
- visibility of previous affiliations
- who can edit, verify, approve, or dispute a transfer
- duplicate profiles and account continuity
- notifications to affected athletes, businesses, and admins
- RLS and audit-log requirements
- NCAA, school, conference, and state-rule fields that must remain configurable

Exit condition: Kyle approves the unresolved product choices, the decision is recorded, and a scoped implementation/test plan exists.

### Phase 4 — Launch-readiness audit

Audit, prioritize, and address:

- authentication and role boundaries
- RLS and service-role usage
- Stripe funding, refund, payout, webhook, idempotency, and reconciliation
- eligibility/compliance enforcement
- privacy, account deletion, retention, and audit history
- notification delivery and failure handling
- admin recovery tools
- rate limiting and abuse controls
- analytics correctness
- accessibility and mobile flows
- monitoring, backups, incident response, and support procedures
- pricing and subscription-state consistency
- legal-policy requirements requiring professional review

Exit condition: launch blockers are separated from post-launch improvements, each blocker has an owner, and unverified production assumptions are explicit.

## Priority rules

When Kyle has not specified the next task, choose in this order:

1. Active security, payment, data-loss, or production breakage.
2. Work required to make tests and migrations trustworthy.
3. Review and finish existing branches.
4. Clearly approved launch blockers.
5. Product design with unresolved cross-system behavior.
6. Improvements, refactors, and polish.

Do not start a new feature merely because it is interesting while a higher-priority blocker is active.

## Definition of done

A task is done only when:

- acceptance behavior is explicit
- implementation is committed and pushed
- relevant tests pass
- security and role implications are reviewed
- migrations and deployment order are documented
- user-facing and operational documentation is updated
- the other model has reviewed material changes
- remaining limitations are recorded
- the PR is merged or deliberately closed

“Code generated” is not done.

## Instructions for Claude on return

1. Read this game plan and all of issue #12.
2. Review PR #11.
3. Post an ACK / RESPONSE in issue #12.
4. Confirm the status and purpose of every unmerged `claude/*` branch.
5. Identify conflicts, stale branches, missing migrations, or unpushed local work.
6. Review the waitlist typing fix and shared documentation for factual errors.
7. Recommend whether PR #11 should merge and state any blocking changes.
8. Do not start a new feature until branch ownership and the next task are recorded.

## Instructions for Codex after Claude responds

1. Read Claude's complete response and inspect every cited branch/commit.
2. Answer Claude's questions and acknowledge agreements/disagreements.
3. Fix legitimate issues in PR #11 or explain with evidence why no change is needed.
4. Update the task board and current-state document to match confirmed branch status.
5. Return the baton with a recommended next owned task.


## Concurrent portal QA mode — ChatGPT athlete × Claude business

This mode is used when Kyle explicitly asks both agents to test HILLink at the same time. It supplements the normal alternating-agent workflow above; it does not remove the branch, claim, review, or safety rules.

### Fixed ownership during a concurrent QA session

**ChatGPT / Codex owns the athlete portal**
- athlete signup, login, verification, and onboarding
- athlete profile creation/editing and public/private visibility
- discovery/search surfaces available to athletes
- campaign/opportunity discovery and applications
- offer/application state from the athlete perspective
- proof/deliverable submission
- athlete-facing payments/earnings/payout state
- rewards, score, redemptions, notifications, Help Center, and settings
- athlete permissions, validation, mobile/responsive behavior, refresh/back navigation, and edge cases

**Claude owns the business portal**
- business signup, login, verification, and onboarding
- business/company profile creation/editing and visibility
- athlete discovery/search/filtering
- campaign/opportunity creation and management
- applications/offers from the business perspective
- proof/deliverable review and approval/rejection
- campaign funding, billing/refund state, and business-facing payment state
- business notifications, Help Center, subscription/settings, permissions, validation, mobile/responsive behavior, and edge cases

Admin behavior and shared backend systems have **no automatic owner**. The first agent that finds a problem there must coordinate in issue #12 before editing shared behavior.

### Branch isolation

For each concurrent QA run:
- ChatGPT uses a branch named like `qa/athlete-chatgpt-YYYYMMDD`.
- Claude uses a branch named like `qa/business-claude-YYYYMMDD`.
- Neither agent edits directly on `main`.
- Each branch starts from the same confirmed `main` commit whenever possible.
- Agents may test simultaneously, but they must not knowingly edit the same file, migration, API contract, table policy, or shared library at the same time.

If a bug can be fixed entirely inside the owning portal, the owning agent may implement it on its branch. If the fix touches shared code, auth, RLS, payments, migrations, shared APIs, or behavior used by both portals, post a CROSS-PORTAL finding in issue #12 before editing.

### Issue #12 is the live agent conversation

During concurrent work, issue #12 acts as the persistent conversation between ChatGPT and Claude. Both agents must read new messages before beginning a new fix and after completing a test cluster.

Use these message types:

**CLAIM**
- agent
- portal
- branch/base commit
- test cluster being run
- expected files/services touched

**FINDING**
- ID, e.g. `ATH-014` or `BUS-009`
- severity: blocker / high / medium / low
- exact reproduction steps
- expected behavior
- observed behavior
- screenshots/logs/test evidence when available
- suspected ownership: athlete / business / shared / unknown

**CROSS-PORTAL**
- finding ID
- what happened on the discovering side
- what state the other portal should observe
- shared API/table/event involved, if known
- explicit question or verification requested from the other agent
- no shared-code fix until the other agent acknowledges, unless it is an urgent security/data-loss issue

**ACK / RESPONSE**
- finding being answered
- reproduced: yes/no/not yet
- observed state
- agreement/disagreement with suspected cause
- files/API/table likely involved
- who should own the fix

**FIX**
- finding ID
- branch/commit
- behavior changed
- files/migrations changed
- checks run
- explicit request for cross-portal retest when applicable

**RETEST**
- finding ID
- exact commit/PR tested
- pass/fail
- portal tested
- remaining discrepancy

**HANDOFF**
- completed test clusters
- open findings
- commits/PRs
- checks run
- areas not tested
- exact next action requested from the other agent

### Cross-portal handshake tests

The portals must not be treated as independent products. For workflows involving both roles, use paired tests:

1. Business creates/changes state.
2. Claude records the expected athlete-visible result in issue #12.
3. ChatGPT verifies the athlete side and posts RETEST/RESPONSE.
4. Athlete performs the next action.
5. ChatGPT records the expected business-visible result.
6. Claude verifies the business side.
7. A cross-portal workflow is only marked PASS when both agents observe consistent state.

Paired flows include at minimum:
- campaign/opportunity creation → athlete discovery
- athlete application → business receives application
- business accept/reject/offer → athlete sees correct state
- athlete acceptance/decline where applicable → business sees correct state
- proof submission → business review
- approval/rejection/revision → athlete receives correct state
- funding/payment/payout/refund state transitions
- notifications generated by the other role
- profile/status changes that affect eligibility or discovery
- account/approval/role restrictions

### Conflict-prevention protocol

Before modifying shared code:
1. Search issue #12 and `docs/AI_TASKS.md` for active ownership.
2. Post CROSS-PORTAL with the intended shared scope.
3. The other agent replies ACK / RESPONSE.
4. Assign one agent as the sole builder for that shared fix.
5. The other agent becomes the verifier and does not implement a competing fix.
6. Builder posts FIX with commit.
7. Verifier retests from its portal and posts RETEST.

If both agents independently discover the same root cause, they do not create two fixes. The first acknowledged owner keeps implementation ownership.

### Test matrix and evidence

Each agent should maintain reproducible evidence rather than only saying a feature “works.” Every meaningful test should capture:
- role/persona
- starting state
- action
- expected result
- observed result
- pass/fail
- finding ID if failed
- commit/environment tested

Automated Playwright/integration coverage should be added for important reproducible bugs when practical. Manual browser success does not replace authorization, RLS, payment, or database tests.

### Safety boundaries

Concurrent QA must use isolated/dev/test accounts and non-production payment/test data unless Kyle explicitly authorizes a production-safe check. Neither agent may reset, seed, migrate, delete, refund, pay out, deploy, or alter production data merely to complete QA.

Never commit credentials, tokens, cookies, personal customer information, or screenshots containing secrets.

### Session completion

The concurrent session is complete only when:
- both portal matrices have been worked through for the agreed scope
- every failure has a finding ID
- cross-portal failures have responses from both agents
- fixes are isolated in branches/PRs
- affected workflows are retested from both sides
- unresolved blockers are clearly recorded
- `docs/AI_TASKS.md` and `docs/CURRENT_STATE.md` are updated with verified status
- Kyle can see what passed, failed, was fixed, and remains untested

The goal is not for two agents to generate twice as much code. The goal is for two independent agents to exercise both halves of the marketplace simultaneously, communicate through GitHub, and catch integration failures that a single-sided test would miss.
