# Campaign payments and local testing

## How athlete pay moves

1. **Accept.** When a business accepts an athlete, Hillink creates one `payments` row for that application with a quote: the athlete's pay, Hillink's platform fee (20% by default), and card processing.
2. **Fund.** The business is sent to Stripe Checkout for that total. When Stripe confirms the charge (`checkout.session.completed` webhook), the payment moves from `uncommitted` to `held`.
3. **Approve.** A business can only approve submitted proof once the payment is `held`.
4. **Pay out.** The athlete is paid with a Stripe transfer tied to the business's charge (`source_transaction`). Each payment has one fixed idempotency key (`hillink-payout-<payment id>`) and a claim lock, so double clicks, retries and the admin/cron release route can never pay twice. Once a transfer id is saved, the database refuses to change it.
5. **Remove or cancel.** Removing an accepted athlete, or cancelling a campaign, refunds a held payment first. A payment that was already paid out is never refunded, and the cancel stops if a refund fails.

A $0 (in-kind) deal needs no money moved and is held straight away.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PLATFORM_FEE_BPS` | `2000` | Hillink's fee as basis points of athlete pay (2000 = 20%). |
| `PASS_CARD_FEES_TO_BUSINESS` | `true` | Add Stripe's 2.9% + 30c to the business's charge. `false` means Hillink absorbs it. |
| `ATHLETE_PAY_MODE` | `on_top` | `on_top`: businesses pay athletes on top of their tier. `included`: each month's tier price includes athlete credit. |
| `INCLUDED_ATHLETE_CREDIT_BPS` | `6000` | In `included` mode, the share of the monthly tier price available as athlete credit (6000 = 60%). |

## Database change

Run `supabase/migrations/20260928000100_campaign_payment_funding.sql` on production before deploying this code. It adds funding columns to `payments`, a unique payment per application, and the guard that stops a saved transfer id from being changed.

## Running tests

Pure fee math, no setup:

```bash
npm run test:unit
```

Payment flow against a local database, with a fake Stripe (needs Docker):

```bash
mv supabase/migrations /tmp/hillink-migrations && npx supabase start && mv /tmp/hillink-migrations supabase/migrations
./scripts/local-db-bootstrap.sh            # RESET=1 to rebuild from scratch
LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
LOCAL_SUPABASE_SERVICE_ROLE_KEY="<service role key from npx supabase status>" \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
npm run test:payments:local
```

The migrations folder is moved aside during `supabase start` because the repo's first migration is empty and the schema lives in the loose `supabase/*.sql` files, which the bootstrap script applies in order.

## Customer codes and the monthly results report

- Once a business accepts an athlete, the athlete taps **Get customer code** on their dashboard and gets a code like `JAKE-7K2Q` plus a share link (`/c/JAKE-7K2Q`). The link shows the business, the campaign's customer offer, and the code.
- When a customer shows the code, it's logged either by the owner on **Results & customer codes** (`/business/report`) or by counter staff on a private staff link (`/redeem/<token>`, no login). Only a hash of the staff token is stored, and making a new link turns the old one off.
- The same code logged twice within 60 seconds counts once. Codes only work at their own business and stop working if the athlete leaves the campaign.
- The report shows, for the month:
  - customers from athletes
  - cost per customer (athlete pay plus the plan price)
  - posts approved
  - order totals staff entered
  - Instagram reach, where synced
  - a per-campaign table and the top athletes
  - "Print / save PDF" prints a clean copy.
- Migration: `supabase/migrations/20260928000200_customer_redemptions.sql`.

`npm run test:payments:local` runs every local-database test, payments and customer codes. Set `LOCAL_SUPABASE_ANON_KEY` too to include the row-security check.

## Eligibility, restricted categories and auto-approve

- **Athlete eligibility** (`/athlete/eligibility`): 18+, visa status, a promise to report deals to their school, and the categories where their school has exclusive sponsors. Athletes who haven't confirmed see a banner and can't join campaigns. Uncleared international students can't join. A school exclusive in a category blocks campaigns from businesses in that category.
- **Business categories**: onboarding picks from a fixed list. Alcohol, tobacco/vape, cannabis/CBD, betting, adult, firearms and supplements can't be saved.
- These rules are enforced in the database (`athlete_join_block()` and a trigger on new applications), so every way of joining is covered: the apply API, auto-accept, and direct API calls. The server (service role) is exempt.
- **#ad**: every campaign template's proof checklist asks for a screenshot showing #ad or the Paid partnership label, and athletes see the FTC reminder next to Submit Proof.
- **Auto-approve** (`/api/cron/auto-approve`, daily through `vercel.json`):
  - Proof left unreviewed past the campaign's review window (default 72h, minimum 24h) is approved.
  - The athlete is paid if their payout account is ready.
  - Unfunded work is never approved; the business gets a reminder instead.
  - Needs `CRON_SECRET` set in Vercel.
- Migration: `supabase/migrations/20260928000300_compliance_and_automation.sql`.

## Hillink Score

- Every athlete gets a 0–100 score from four parts:
  - average star rating (40%)
  - on-time proof (25%)
  - proof approved the first time (15%)
  - customers brought in per campaign (20%)
- New athletes start near the middle instead of 0 or 100, and are marked "New" until they finish 3 campaigns.
- Athletes see their score, the four bars and one tip on their dashboard. Businesses see the score on athlete cards and can sort by "Best Hillink Score".
- Instagram follower counts are refreshed at most weekly for linked accounts and shown as verified ("3.5k followers ✓").
- `/api/cron/scores` recomputes scores daily through `vercel.json` (needs `CRON_SECRET`).
- Also fixed: business ratings never updated the athlete's average rating because of row security, and athletes could edit their own average. Both are handled in the migration.
- Migration: `supabase/migrations/20260928000400_hillink_score.sql`.
