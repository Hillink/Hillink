# Current state

Snapshot: 2026-09-27, `main` at `ac1f51f`. This is a code inspection, not a production audit. Refresh against `origin/main` and outstanding branches before acting on it.

## Product and architecture observed

Next.js 15 App Router with React 19, Supabase SSR/client/admin clients, Stripe, and Vercel cron. Athlete, business, and admin portals exist. Features in `main` include campaigns and applications, proof review, funded payments and payouts, waitlist, customer redemption codes, athlete score, rewards, and daily automation. The public site explains local NIL campaigns. These are code paths, not claims of production readiness.

The middleware checks portal roles and approval status for page routes. API routes are excluded from middleware and use route-level authorization. A separate waitlist Supabase project is configured by environment variables. Vercel runs `/api/cron/auto-approve` and `/api/cron/scores` daily; both require `CRON_SECRET`.

The repository has baseline SQL in `supabase/*.sql`, an initial migration that does not contain the full schema, and newer feature migrations in `supabase/migrations/`. Local integration setup is explained in `docs/PAYMENTS_AND_LOCAL_TESTING.md`. Do not assume `supabase db reset` alone reconstructs the entire database.

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
