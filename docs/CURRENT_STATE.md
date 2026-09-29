# Current state

Snapshot: 2026-09-27, `main` at `ac1f51f`. This is a code inspection, not a production audit. Refresh against `origin/main` and outstanding branches before acting on it.

## Product and architecture observed

Next.js 15 App Router with React 19, Supabase SSR/client/admin clients, Stripe, and Vercel cron. Athlete, business, and admin portals exist. Features in `main` include campaigns and applications, proof review, funded payments and payouts, waitlist, customer redemption codes, athlete score, rewards, and daily automation. The public site explains local NIL campaigns. These are code paths, not claims of production readiness.

The middleware checks portal roles and approval status for page routes. API routes are excluded from middleware and use route-level authorization. A separate waitlist Supabase project is configured by environment variables. Vercel runs `/api/cron/auto-approve` and `/api/cron/scores` daily; both require `CRON_SECRET`.

The repository has baseline SQL in `supabase/*.sql`, an initial migration that does not contain the full schema, and newer feature migrations in `supabase/migrations/`. Local integration setup is explained in `docs/PAYMENTS_AND_LOCAL_TESTING.md`. Do not assume `supabase db reset` alone reconstructs the entire database.

## Help Center (PR #9, 2026-09-29)

Signed-in Help Center at `/help`, with an admin editor at `/admin/help`. Articles live in the `help_articles` table and are filtered by row security from the reader's own profile. Athletes and businesses see only live articles for their audience or `both`; admins see everything. Details are in `docs/HELP_CENTER.md`. Kyle ran `20260928000600_help_center.sql` and `20260928000610_help_center_seed.sql` in production on 2026-09-29, and a read-only check confirmed the table and articles exist. Re-running the seed updates articles that haven't been edited in `/admin/help` and leaves edited ones alone.

## Verification at this snapshot

- `npm ci`: passed.
- `npm run test:unit`: 37 passed. (PR #15 adds 3 tests, for 40.)
- `npm run security:api-auth`: passed; scanner reported 62 guarded API routes.
- `npm run build`: passed without local production credentials.
- `npx tsc --noEmit`: originally failed in `tests/e2e/waitlist.spec.ts` because its `Page` type evaluated to `never`. Passed after the fix on `codex/project-handoff`.
- Local database integration and seeded browser tests: not run; require local Supabase/Docker or configured test services. Never point seed/reset at production.

## Environment variable names found in code

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WAITLIST_SUPABASE_URL`, `WAITLIST_SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`, `STRIPE_PRICE_DOMINATION`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `ENABLE_INSTAGRAM_OAUTH_VALIDATION`, `STRIPE_DEV_FALLBACK`, `PRELAUNCH_MODE`. `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the `STRIPE_PRICE_*` IDs and the fee settings are read with surrounding whitespace removed (PR #15). Other settings are described in the payment document. Presence in code does not mean each value is required in every environment.

## Known limits

Production migrations, Stripe state, row security behavior in the deployed database, Vercel configuration, and actual user flows were not independently verified. The README previously described only the starter; this branch updates its introduction. Review open Claude branches before overlapping help center, signup, or live test work.

## 2026-09-28 — HQ foundation branch (Codex)

Isolated `codex/hillink-hq-foundation` starts at verified `main@cecec51992042d0e25cec38942d721821c43b38f`; draft PR #31. `tools/hillink-hq/` implements a local durable event engine, allowlisted real verification worker, watchdog/recovery, material alert outbox, Command Center and two skins over the same state. Run `node tools/hillink-hq/server.mjs`. `HQ_OLLAMA_ENABLED=1` enables a loopback-only text-summary adapter for already installed Gemma/Qwen models; a real Gemma summary was verified through the browser. No marketplace API/schema/payment change. Cloud execution and provider credit telemetry remain unavailable/UNKNOWN. This is a first reviewable slice, not completion of the locked World specification. See its README for safety boundaries, runtime/restart handling and remaining work. Shared cleanup PRs remain Claude-owned; this note does not revise their status or the older snapshot above.

HQ verification: 32 deterministic/integration tests; existing 40 unit tests; 62-route auth scan; TypeScript; full Next build (86 routes) passed. Browser verified actual process dispatch, local Gemma generation, same-state skins, historical CLAIMED/UNKNOWN and disabled replay controls. No cloud execution, live Qwen inference, webhook delivery or full World interactions are claimed verified.

## HQ review response — 2026-09-29

Codex addressed Claude's PR #31 review: local cancellation now escalates SIGTERM to SIGKILL within the default adapter deadline, requiring close evidence; concurrent cancels share one attempt. Local token exposure and alert snapshot semantics are explicit. Owner reconciliation and concurrency-aware idle suppression were already present in 989e134. All 36 HQ tests pass, including four new cancellation regressions; UI syntax passes. Current remote main was rechecked at 4623c54; this focused response does not integrate main or claim its marketplace checks were rerun. Independent final-head review remains pending.

## HQ blocking-review fixes — 2026-09-29

Merged main 4623c54 into the HQ branch, preserving both decision-log sections. Addressed B1/B2 with diagnosed terminal-failure recovery and queued capacity retries; B3 with measured monotonic test progress and completed-but-failing verification evidence; N2 with persisted 60-second quarantine. HQ suite: 41 tests passing. Merged repository: 71 unit tests, 66-route auth scan, TypeScript and production build (89 generated pages) passed. Final independent review remains required; no merge to main or DB action performed here.
