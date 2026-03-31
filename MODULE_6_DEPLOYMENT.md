# Module 6 Migration & Deployment Checklist

## Pre-Migration Checklist

- [ ] Read [MODULE_6_SUMMARY.md](./MODULE_6_SUMMARY.md) for architecture overview
- [ ] Verify Stripe Secret Key is in `.env.local` as `STRIPE_SECRET_KEY`
- [ ] Optional: Set `CRON_SECRET` env var for background payout job trigger

## Step 1: Apply Database Migration

### Via Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/_/sql/editor
2. Click **+ New Query**
3. Open and copy entire contents of: `supabase/payments.sql`
4. Paste into SQL editor
5. Click **Run** (wait ~5 seconds)
6. Verify success: Check **Database → Tables** for:
   - ✅ `public.payments` table exists
   - ✅ Indexes present (5 total):
     - `payments_application_id_idx`
     - `payments_business_id_idx`
     - `payments_athlete_id_idx`
     - `payments_hold_status_idx`
     - `payments_stripe_transfer_id_idx`

### Via CLI (If Supabase CLI Available)

```bash
supabase db push
```

## Step 2: Verify Schema

In Supabase SQL Editor, run:

```sql
-- Verify payments table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;

-- Verify trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%release_payment%';

-- Verify RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'payments';
```

Expected output:
- 12 columns (id, application_id, business_id, athlete_id, hold_status, stripe_payment_intent_id, stripe_transfer_id, amount_cents, payout_at, idempotency_key, created_at, updated_at)
- 1 trigger: `campaign_applications_release_on_completed`
- RLS: `true`

## Step 3: Test Database Integration

```bash
# Seed test users (if not already seeded)
npm run -s test:seed

# Run payout E2E tests
npm run -s test:payouts
```

Expected result: ✅ 6 test cases pass

## Step 4: Deploy Backend

```bash
# Type check
npx tsc --noEmit

# Security audit
npm run -s security:api-auth

# Deploy (with your hosting provider)
npm run build
npm start  # or your deployment process
```

Expected results:
- No TypeScript errors
- ✅ 43 API routes have explicit access guard coverage
- Deployment successful

## Step 5: Enable Payout Processing (Optional)

To automatically release payouts when applications complete:

### Option A: Scheduled CRON Job

Set up your hosting provider's cron service (e.g., Vercel Crons) to call:

```
POST /api/payouts/release
Header: x-cron-secret: YOUR_CRON_SECRET_VALUE
Body: { "applicationId": "UUID_OF_APP" }
```

Every 5 minutes or on a schedule that suits your SLA.

**Set environment variable:**
```bash
CRON_SECRET=your-secure-random-string-here
```

### Option B: Manual Admin Trigger

Admins can manually trigger payout release via the API:

```bash
curl -X POST http://localhost:3001/api/payouts/release \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"applicationId": "UUID"}'
```

## Verification Commands

### Check Both Migrations Applied

```bash
# In Supabase SQL Editor:

-- Check Module 5 (Deliverables)
SELECT COUNT(*) as deliverable_submissions_count FROM public.deliverable_submissions;
SELECT COUNT(*) as deliverable_requirements_count FROM public.deliverable_requirements;

-- Check Module 6 (Payouts)
SELECT COUNT(*) as payments_count FROM public.payments;
SELECT COUNT(*) as payment_rows FROM pg_tables WHERE tablename = 'payments';
```

### Monitor First Payout

1. Create campaign + application with athlete
2. Athlete submits deliverable
3. Business approves deliverable
4. Check Supabase → `payments` table:
   ```sql
   SELECT id, hold_status, payout_at, stripe_transfer_id
   FROM public.payments
   WHERE application_id = 'YOUR_APP_ID';
   ```
   Expected: `hold_status` should transition from `'held'` → `'released'`

## Troubleshooting

### Issue: `payments` table doesn't exist

**Solution:** Check if SQL migration ran successfully. Errors will show in Supabase dashboard.

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'payments'
);
```

### Issue: Trigger not firing on application completion

**Solution:** Verify trigger exists and is enabled:

```sql
SELECT trigger_name, trigger_schema, enabled
FROM pg_trigger
WHERE tgname LIKE '%release_payment%';

-- If disabled, re-enable:
ALTER TRIGGER campaign_applications_release_on_completed
  ON public.campaign_applications ENABLE TRIGGER;
```

### Issue: Payout API returns 500 "Stripe transfer failed"

**Solution:** Verify Stripe key and athlete payout profile:

```sql
-- Check athlete payout profile
SELECT stripe_account_id, stripe_onboarding_complete
FROM public.athlete_payout_profiles
WHERE athlete_id = 'ATHLETE_UUID';

-- Check payment record
SELECT id, athlete_id, amount_cents, hold_status, stripe_transfer_id
FROM public.payments
WHERE application_id = 'APP_UUID';
```

Ensure:
- ✅ `stripe_account_id` is set (e.g., `acct_...`)
- ✅ `stripe_onboarding_complete` is `true`
- ✅ `amount_cents > 0`

## Rollback Plan

If issues arise, to revert Module 6:

```sql
DROP TRIGGER IF EXISTS campaign_applications_release_on_completed ON public.campaign_applications;
DROP FUNCTION IF EXISTS public.release_payment_on_completion();
DROP TABLE IF EXISTS public.payments;
```

⚠️ **Warning:** This will lose payment history. Backup before rolling back.

## Success Indicators

- ✅ 6 E2E tests pass (`npm run -s test:payouts`)
- ✅ No TypeScript errors (`npx tsc --noEmit`)
- ✅ 43 API routes guarded (`npm run -s security:api-auth`)
- ✅ Payments table populated as applications complete
- ✅ Stripe transfers succeed with idempotent keys
- ✅ No duplicate payouts on retries

---

**Need help?** See [MODULE_6_SUMMARY.md](./MODULE_6_SUMMARY.md) for complete architecture reference.
