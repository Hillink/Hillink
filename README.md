# HILLink Vercel Starter

This is a simple Next.js starter site for HILLink.

## What is included
- Next.js app router setup
- One polished landing page
- Ready to push to GitHub
- Ready to deploy on Vercel

## Run locally
1. Open the project folder in VS Code
2. Run:

```bash
npm install
npm run dev
```

3. Open `http://localhost:3000`

## Push to GitHub
1. Create a new GitHub repo
2. From the project folder, run:

```bash
git init
git add .
git commit -m "Initial HILLink site"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Deploy to Vercel
1. Log into Vercel
2. Click `Add New Project`
3. Import your GitHub repo
4. Leave the defaults as they are
5. Click `Deploy`

## Next steps
Your developer can extend this with:
- Supabase auth
- Stripe subscriptions
- Business dashboard
- Athlete dashboard
- Campaign posting and claiming

## Automated Feature Testing (No Real Customer Base Needed)

This repo now includes Playwright smoke tests plus a seed script that creates reusable test users and profile data in your linked Supabase project.

### 1) Required env values
Make sure `.env.local` includes:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WAITLIST_SUPABASE_URL`
- `WAITLIST_SUPABASE_SERVICE_ROLE_KEY`

Optional for Instagram OAuth flows:
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`

### Separate waitlist Supabase project

The public waitlist is configured to use a dedicated Supabase project instead of the main app database.

Use these env vars for the separate waitlist project:
- `WAITLIST_SUPABASE_URL`
- `WAITLIST_SUPABASE_SERVICE_ROLE_KEY`

Recommended setup:
- Main Supabase project: auth, profiles, campaigns, payouts, dashboards.
- Waitlist Supabase project: only `athlete_waitlist` and `business_waitlist` tables.

To initialize the separate waitlist project:
1. Create a new Supabase project for waitlist traffic only.
2. Run [supabase/waitlist.sql](supabase/waitlist.sql) in that project.
3. Add `WAITLIST_SUPABASE_URL` and `WAITLIST_SUPABASE_SERVICE_ROLE_KEY` to local env and Vercel env.
4. Keep your main `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` pointed at the main app project.

Notes:
- Waitlist admin review still runs inside this Next.js app, but the data comes from the separate waitlist project.
- `reviewed_by` in the waitlist DB stores the admin user id from the main app project without a database foreign key.

### 2) Install browser runtime once

```bash
npx playwright install chromium
```

### 3) Seed your test user base

```bash
npm run test:seed
```

The seed script creates:
- `hillink+admin@test.local`
- `hillink+business1@test.local`
- `hillink+business2@test.local`
- `hillink+athlete1@test.local`
- `hillink+athlete2@test.local`
- `hillink+athlete3@test.local`

Password for all seeded users:
- `Password123!`

### 4) Run the full smoke suite

```bash
npm run test:e2e
```

Or run seed + e2e together:

```bash
npm run test:all
```

### 5) Useful variants

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

### What is currently covered
- Role-based login and portal redirect checks (athlete/business/admin)
- Admin portal user search and finance section load
- Admin athlete approval flow (pending to approved)
- API contract and authorization checks:
	- anonymous blocked from admin endpoints
	- non-admin blocked from admin endpoints
	- non-business blocked from payout trigger endpoint
	- admin endpoint validation behavior
- Core business-athlete campaign flow:
	- business creates campaign
	- athlete applies
	- business accepts
	- athlete submits proof
	- business syncs diagnostics
- Settings + payment fallback flow:
	- business Stripe checkout fallback activation in development
	- athlete Stripe payout fallback activation in development

### Notes
- Tests are configured to run sequentially with one worker for stability.
- Playwright auto-starts local dev server if not already running.
- Seed runs automatically before Playwright tests via global setup.
