# HILLink agent guide

Read `docs/CURRENT_STATE.md` and the relevant source files before changing behavior. Check `docs/AI_TASKS.md` for overlapping work and open branches. `main` is the shared baseline; use a separate branch for each task and review changes on other branches before merging.

## Code map

- `app/`: Next.js App Router pages and API routes. `app/athlete`, `app/business`, and `app/admin` are separate portals.
- `lib/`: shared server logic for auth, campaigns, payments, compliance, rewards, score, and redemptions.
- `supabase/migrations/`: newer ordered migrations. Earlier schema also lives in standalone `supabase/*.sql` files; see `docs/PAYMENTS_AND_LOCAL_TESTING.md` before database work.
- `tests/unit`, `tests/integration`, `tests/e2e`: pure logic, local Supabase, and browser tests respectively.

## Rules for changes

- Never place secrets or production customer data in code, logs, docs, or commits. Record environment variable **names** only.
- Treat payment release, refund, webhooks, role checks, and row security as sensitive. Inspect both API authorization and database policies before changing them. Do not run reset/seed scripts against a live database.
- Do not assume middleware guards `/api` routes: its matcher excludes them. API routes need their own access checks.
- Keep schema changes in an ordered migration; explain deployment order and rollback limits. Do not execute production migrations or deployments without the owner's direction.
- Preserve existing branch work; do not reset or overwrite another agent's unmerged changes.

## Verification and handoff

Run `npm ci`, `npm run test:unit`, `npm run security:api-auth`, `npx tsc --noEmit`, and `npm run build` as relevant. Integration tests require a local Supabase instance; browser tests may seed users and need configured environment variables. Report exactly which checks ran and which could not.

Update `docs/CURRENT_STATE.md` when behavior or verification status changes; update `docs/AI_TASKS.md` for ownership and next actions. Record important choices in `docs/DECISIONS.md` with their rationale. Commit focused changes to the task branch. Leave a concise handoff with branch, commit, files changed, checks, and unresolved items.
