# HILLink product specification

Status: living document. First context transfer by Claude on 2026-09-28; awaiting Codex's comparison with code and Kyle's verification of the items marked **Open**.
Product owner: Kyle Hill
Coordination: GitHub issue #12

## How to maintain this document

This file captures product truth that can't be reliably reconstructed from code alone. Every material entry uses one of these labels:

- **Confirmed:** Kyle explicitly approved it. The source and date are given.
- **Implemented:** current code on `main` behaves this way. Implementation is not automatically product approval. "Implemented on #N" means the behavior exists only on that unmerged PR.
- **Proposed:** an agent recommendation awaiting approval.
- **Open:** an unresolved product question.
- **Rejected:** considered and intentionally not selected, with the reason.

An entry can carry two labels, for example **Confirmed · Implemented**. When the labels disagree (for example **Confirmed** but not implemented), the entry also appears in [Contradictions and missing implementation](#contradictions-and-missing-implementation).

When transferring context from a private Claude or ChatGPT conversation, don't mark it Confirmed silently. Include the source and date when known, state the remembered requirement, and ask Kyle to verify anything consequential. Code, migrations, screenshots and live behavior can establish implementation state, but not always intended behavior.

### Sources used in the 2026-09-28 transfer

These are Claude's private project records. They are cited, not copied.

| Tag | Source | Weight |
|---|---|---|
| `K-0928` | Kyle's written answers on 2026-09-28 to the 13 product questions in PR #9, plus his decision on Instagram login for PR #7 | Kyle's own words: **Confirmed** |
| `K-0927` | Kyle's statements in the 2026-09-27 profitability and planning thread (for example, "the app tiers are current") | Kyle's own words: **Confirmed** where he decided; otherwise noted |
| `PLAN-0925` | Claude's summary of Kyle's Obsidian Hillink plan (business model, targets, schools, markets), 2026-09-25 | Kyle's plan as summarized by Claude; Kyle should spot-check the numbers |
| `STRAT-0927` | Claude's strategy notes and ideas log from 2026-09-27 (Monte Carlo pricing models, ROI, gamification, legal) | Mostly agent analysis on assumed inputs: **Proposed** unless Kyle decided |
| `AUDIT-0928` | Claude's read-only architecture audit of `main@ac1f51f` and PRs #7–#10, 2026-09-28 | Agent findings: **Proposed**, and **Implemented** facts where they cite code |
| `LIVE-0927` | The 2026-09-27 go-live session: production migrations Kyle ran and the live test on hillink.io | Kyle-reported production state, not verified by an agent |

Nothing here includes credentials, business lead contact details, or raw conversation text.

---

## Product vision and positioning

- **Confirmed (PLAN-0925):** HILLink is a marketplace that pairs **local businesses** with **college athletes who currently earn $0 in NIL**. Campaigns are small, local and repeatable.
- **Confirmed (PLAN-0925):** Target athletes are in non-revenue sports with roughly **2k–15k followers**. The large NIL companies ignore both this athlete group and small local businesses.
- **Confirmed (PLAN-0925):** Target businesses are local businesses. **Proposed (STRAT-0927):** prioritize cheap, repeat-purchase, student-heavy businesses (barbers, nutrition bars, cafés), because customer codes work best there. See [contradiction X1](#contradictions-and-missing-implementation) about supplement stores.
- **Confirmed (K-0927):** Kyle wants businesses to see proof of ROI with low effort. His main worry is that a code flops and the business leaves. **Proposed (STRAT-0927):** the core promise to businesses is **measurable customers through the door**, not views, shown by customer codes plus a monthly results report. The promise to athletes is their first paid NIL deals, close to campus.
- **Confirmed (PLAN-0925):** School launch order: **Blinn College is the pilot**. PVAMU, Houston Christian (HCU), St. Thomas and TSU come next. Sam Houston is benched, and Texas A&M comes later.
- **Confirmed (PLAN-0925):** Markets are the Houston cluster and the Brenham/US-290 corridor. **Proposed (STRAT-0927):** treat HCU, St. Thomas and TSU as one Houston business pool, and open a new campus about every 3 months, because every market wears out in about a year.
- **Confirmed (PLAN-0925):** Sequencing is to **sign 10+ athletes before pitching businesses**, then run the first 3–5 campaigns by hand and turn them into case studies.
- **Confirmed (PLAN-0925):** Launch targets:
  - **Month 1:** 10–15 athletes, 3–5 businesses, 5 campaigns and about $400 MRR.
  - **Month 3:** 50+ athletes and about $2k MRR.
  - **Month 6:** 200+ athletes and about $8k MRR.
  - **Throughout:** campaign completion rate stays above 80%.
  - **Proposed (STRAT-0927):** the model gave the Month 6 target about an 8% chance on assumed inputs, and $8k MRR needs about 70 active businesses.
- **Proposed (STRAT-0927):** a 30-day go/no-go test.
  - **Steps:** payments live, 10 athletes signed, 40+ business pitches, and the first campaigns run by hand.
  - **Go:** 3+ businesses pay and 2+ pay again the next month.
  - **Change the offer before building more:** fewer than 2 pay.
- **Proposed (STRAT-0927):** pause new gamification features until businesses are paying. Building faster than selling was named the biggest business risk.
- **Open:** differentiation copy and brand voice haven't been written down. The code uses both "HILLink" and "Hillink" (`README.md`, `lib/`, emails).

## Roles and actors

- **Implemented:** the roles are `athlete`, `business` and `admin` (`profiles.role`, `lib/rbac.ts`). Page routes are role-gated in `middleware.ts`. API routes are excluded from the middleware matcher and check access themselves.
- **Implemented:** an unauthenticated **customer** only interacts through a redemption code or link, and **business staff** use a staff tap link without an account (`lib/redemptions/`, migration `20260928000200`).
- **Implemented:** one login equals one business. There are no organizations, members or staff accounts.
  - **Proposed (AUDIT-0928):** treat `business_profiles.id` as the future organization id and add `campaigns.created_by`, so multi-user businesses can be added without renaming columns.
- **Proposed (STRAT-0927):** a **campus rep** per school (a student or athlete) sets up campaigns for businesses. Pay is $400/month plus 15% of that campus's revenue, and a rep is hired once a market has about 10 paying businesses. There is no rep role in code. **Open:** does a rep need an app role, or do they use an admin or business login?
- **Open:** a school or compliance-office role. None exists, and none should be assumed.

## Athlete lifecycle

### Signup, verification and eligibility
- **Implemented:** athlete signup requires an email ending in `.edu`, checked in the browser only (`app/signup/page.tsx:31`). **Implemented on #7:** the database also enforces it.
- **Implemented:** admins approve or reject athletes (`profiles.athlete_verification_status`, `/api/admin/athlete-verification`). Pending athletes see a pending page.
- **Confirmed (K-0928):** athletes who sign up from now on must connect Instagram through Instagram login before joining any campaign. Existing athletes are grandfathered. **Implemented on #7:** `profiles.instagram_login_required`, and `athlete_join_block` returns `instagram_not_verified`.
- **Implemented:** the eligibility form (`/athlete/eligibility`, `lib/compliance/rules.ts`) records:
  - 18+ confirmation
  - visa status (US citizen or resident, international cleared, international not cleared)
  - acknowledgement of disclosure to the school
  - school conflict categories

  `athlete_join_block()` enforces this in SQL on every application insert and returns reason codes. **Proposed (STRAT-0927):** the athlete's written confirmation shifts the duty to report deals onto the athlete. It is not legal advice.
- **Implemented on #7 and #10:** join is blocked when the athlete's average rating is below 1.5 stars. **Confirmed (K-0928):** the floor is enforced on the server.
- **Open (AUDIT-0928):** pending (unapproved) athletes can call the apply API directly. The API routes don't check approval. **Proposed:** add an approval check to `athlete_join_block`.

### Campaign participation
- **Implemented:** athletes browse, apply, withdraw, submit proof, and are rated. Auto-accept is on by default, with a 10-mile radius and a 12-hour lock (`supabase/auto-accept.sql`).
- **Confirmed (K-0928):** rejected proof **can be resubmitted**. **Implemented on #10.** A resubmission updates `submitted_at`, so a late fix counts against the on-time score.
- **Confirmed (K-0928):** proof is a **link only**, with no screenshots. Checklists must be reworded to ask only for what's visible from the link. **Implemented on #10.** On main, templates still ask for screenshots.
- **Open (AUDIT-0928):** how many times can a business reject the same proof? Resubmits are unlimited, so a business can reject forever. **Proposed:** the second rejection opens admin review.

### Ratings, score, XP, tiers and rewards
- **Implemented:** XP comes from 15 actions (`lib/xp.ts`). Examples: complete a campaign 120, approved post 40, 5-star rating 35, refer a business 100.
- **Implemented:** athlete tiers are Bronze 0, Silver 1,000, Gold 2,500, Platinum 5,000 and Diamond 8,000 XP (`lib/xp.ts:27`). A business's plan caps the top tier it can use.
- **Confirmed (K-0927, logged as "Decided"):** follower count should also count toward the athlete's tier. **Not implemented:** tiers are XP-only. **Open:** how XP and followers combine. For example, Gold could require 2,500 XP and 3k+ followers.
- **Confirmed (K-0928):** referral XP is **not live yet**. **Implemented:** referral XP values exist in `lib/xp.ts` but are never awarded, and the help articles don't mention referral rewards.
- **Confirmed (K-0927):** Kyle wants an Uber-style athlete "credit score".
  - **Implemented:** the HILLink Score, 0–100 (`lib/score/hillinkScore.ts`), is weighted rating 40%, on-time 25%, proof approved on the first try 15%, and customers driven 20%. It is "provisional" below 3 completed campaigns.
  - **Proposed (STRAT-0927):** show low scorers less often, instead of only blocking below 1.5 stars. **Not implemented:** the score is only displayed to the athlete and isn't used for ranking or auto-accept.
- **Confirmed (K-0927):** a battle-pass style rewards road where levels earn points, points spent on merch, achievements or badges, and referral and performance bonuses.
  - **Implemented (migration `20260928000500`, `lib/rewards/road.ts`):**
    - Semester seasons (spring Jan–May, summer Jun–Jul, fall Aug–Dec, UTC). Points reset each season, and tier and score carry over.
    - Levels 1–50. The free track earns 10 points per level plus 25 at every 5th level.
    - A Pro track earns 15 per level plus 50 per milestone. Pro is unlocked by a score of 90+ after 3 campaigns and never by paying, and it is not retroactive.
    - 7 badges worth 20 points each.
    - 5 points per customer the athlete drives, capped at 20 customers per campaign per season.
    - The store is on an append-only points ledger. Its items are switched off until priced.
  - **Proposed:** these numbers are starting values from STRAT-0927, not Kyle's. **Open:** what a point is worth, merch costs, and the total rewards budget. **Proposed:** keep rewards at 2–3% of revenue, and use merch donated by businesses first.
- **Implemented:** businesses rate athletes 1–5 stars after approving proof (`RATING_SETUP.md`). **Confirmed (K-0928):** the rating prompt opens right after Approve. **Implemented on #10.**
- **Open (AUDIT-0928, E5):** every signed-in user can read every rating (policy `using (true)`). **Proposed:** athletes see their own ratings, and businesses see an athlete's average and count only.
- **Proposed (AUDIT-0928):** athletes rate businesses after launch, and those reviews stay blind until both sides submit.

### Payouts
- **Confirmed (K-0928):** **Stripe is the only payout method.** PayPal, Venmo and Cash App options are removed. **Implemented on #10.** On main, Settings still offers them.
- **Proposed (STRAT-0927):** athletes are contractors, so W-9 and 1099 handling ($600+ a year) goes through Stripe Connect. **Open:** confirm with an accountant.

### Suspension, graduation, transfer, closure
- **Implemented:** suspension is only an auth ban. Unrelated flags (`is_verified`, `is_flagged`) sit on `athlete_profiles` and are athlete-editable (AUDIT-0928 H5).
- **Implemented:** account "terminate" hard-deletes the auth user and cascades to profiles, campaigns, applications, **payments**, disputes and ratings (AUDIT-0928 C1).
  - **Proposed:** deactivate, then anonymize. Block deletion while money is held or work is in progress.
  - **Open (E7):** retention period. **Proposed:** anonymize personal data right away and keep money and dispute records for 7 years.
- **Open:** graduation. `.edu` emails stop working after graduation, which locks athletes out of their earnings history. **Proposed:** let athletes add a personal login email.
- See [College transfers](#college-transfers).

## Business lifecycle

- **Implemented:** businesses sign up, onboard, choose a plan through Stripe Checkout, and create campaigns from the dashboard.
- **Implemented:** new businesses are auto-approved on main. **Implemented on #7:** new businesses land on "under review", admins approve or reject them, and a rejected business goes back to review when it edits its profile. Existing businesses stay approved. **Open:** Kyle requested #7 ("verify athletes and businesses at signup"). Please confirm that manual business approval is intended.
- **Implemented on #8:** business onboarding writes the columns that exist in production: `category`, `budget`, `preferred_tiers` and `description`. On main it writes non-existent columns (`budget_range` and others) and fails on hillink.io (LIVE-0927).
- **Confirmed (K-0928):** businesses can change **and cancel** their plan without closing their account. **Implemented on #10:** a Stripe billing portal link. It requires the customer portal to be enabled in Stripe.
- **Proposed (STRAT-0927):** the business should spend about 5 minutes a month. HILLink or the campus rep sets up campaigns, proof auto-approves, rating is one tap, and views are pulled from Instagram automatically.
  - **Implemented:** four campaign templates with proof checklists (`lib/campaignTemplates.ts`): Instagram Post, Dine and Post, Product Review and Monthly Ambassador.
  - **Not implemented:** one-tap rating from email or text, and automatic view pulls.
- **Open (AUDIT-0928):** what happens to live campaigns when a business subscription lapses? **Proposed:** existing work finishes and new accepts are blocked.

## Campaign lifecycle and business rules

### Campaign (the listing)
- **Implemented:** statuses are enforced in four places that already disagree: `supabase/campaign-lifecycle.sql` (a trigger and `transition_campaign_status`), `app/api/campaigns/[id]/status/constants.ts`, and the dashboards.
  - New campaigns are created `active` (`app/business/BusinessDashboard.tsx:725`).
  - The athlete read policy only allows `status = 'open'` (`supabase/connections.sql:138`).
  - Cancel on main only accepts `open` (`app/api/business/cancel-campaign/route.ts:41`).
- **Proposed (AUDIT-0928):** draft → active ⇄ paused → closed → completed, plus cancelled and expired, with legacy `open` folded into `active`, all enforced by one transition function.
- **Confirmed (K-0928):** a business can cancel a campaign **before any work is approved**. **Implemented on #10:** cancel is accepted from `draft`, `open`, `active` and `paused`, and blocked once any application is `approved` or `completed`. It refunds held payments and notifies athletes. See [contradiction X6](#contradictions-and-missing-implementation) (cancel after proof is submitted).
- **Implemented:** cancelling hard-deletes the campaign, its applications, their XP and their `finance_events` (`cancel-campaign/route.ts:110-159`). **Proposed:** use status changes and keep the rows.
- **Implemented:** plan limits (subscription active, max open campaigns, slots per campaign, top athlete tier) are checked **only in React** (`BusinessDashboard.tsx:620-650`). Campaigns are inserted directly from the browser. **Proposed:** create campaigns server-side with the plan check.
- **Open (AUDIT-0928, E4):** can a business edit a campaign after an athlete accepts? **Proposed:** lock payout, deliverables, requirements, dates and location, and snapshot the terms at accept.

### Application (the athlete's work)
- **Implemented:** `campaign_applications.status` runs applied → accepted → submitted → approved/rejected → completed. `withdrawn` exists but is unused, because withdraw deletes the row.
- **Implemented:** auto-accept locks the campaign row, so two athletes can't take the last slot (`supabase/fn-auto-accept.sql`). Manual accept does **not** lock and can overfill (AUDIT-0928 C6).
- **Confirmed (K-0928):** the review window is **72 hours**, and proof auto-approves after it.
  - **Implemented:** `DEFAULT_REVIEW_WINDOW_HOURS = 72` (`lib/compliance/rules.ts:97`). The daily cron `/api/cron/auto-approve` only approves funded work, never fires under 24 hours, and skips disputed work.
  - On main, the campaign modal says 48 hours. **Implemented on #8:** it says 72.
- **Open (AUDIT-0928 C9):** deadlines have no effect. An accepted athlete who never submits holds the slot and the business's money forever. **Proposed:** the daily cron notifies, then expires the work, frees the slot and refunds.
- **Open (AUDIT-0928):** athletes can do the work before the business funds it (C2). **Proposed (E2):** require funding at accept, and don't show the campaign as started until the payment is held.
- **Confirmed (K-0928):** **disputes go by email** to HILLink. **Implemented:** a disputes API exists, but there's no dispute button. The API only allows disputes on `accepted`, `completed` or `in_progress` applications (`app/api/disputes/open/route.ts:24`). `in_progress` doesn't exist, and submitted or rejected work can't be disputed.
- **Proposed (STRAT-0927):** clear written rules for "athlete didn't post" and "business won't approve".
- **Proposed (STRAT-0927):** a make-good guarantee. If a campaign gets fewer than 5 code redemptions, the business gets a free post from another athlete (about $40 cost to HILLink).

## College transfers

Nothing is decided. **Open**, and Kyle's call, as listed in issue #12.

- **Implemented:** school is a free-text field on `athlete_profiles`. Campaigns can't target a school. School conflicts are checked only when an athlete joins.
- **Open (E1):** what happens to accepted or in-progress work when an athlete transfers mid-campaign? Options (AUDIT-0928):
  1. **Finish unless blocked** (recommended). Work continues, and it's cancelled with a refund only if the new school's conflict rules block that business.
  2. **The business decides** within 48 hours. No answer means keep.
  3. **An admin reviews** every transfer.
  4. **Auto-cancel and refund.**
- **Open:** while an athlete is in the portal with no new school, can they accept new campaigns? **Proposed:** yes, since eligibility depends on age, visa and conflicts, not enrollment. This needs a check against Texas NIL rules.
- **Proposed (AUDIT-0928 F8):** an `athlete_affiliations` history table (school, sport, division, status `current | pending_transfer | past`, dates, verification method) with one current row. `athlete_profiles.school` stays as a synced copy. XP, points, ratings and history stay attached to the athlete id and never move. "Report a transfer" becomes a flow, not a free-text edit.
- **Open:** the same rule is needed when an athlete loses eligibility mid-campaign (visa, new conflict, rating below 1.5). **Proposed:** finish unless legally blocked.

## Compliance and eligibility

- **Proposed (STRAT-0927) · Implemented:** 18+ only, through the eligibility form and `athlete_join_block`. **Open:** not explicitly approved by Kyle.
- **Proposed (STRAT-0927) · Implemented:** ask about visa status at signup, because visa holders usually can't do paid NIL in the US.
- **Proposed (STRAT-0927):** no alcohol, vape, gambling or cannabis businesses.
  - **Implemented:** `lib/compliance/rules.ts` restricts **alcohol, tobacco/vape, cannabis/CBD, gambling, adult, firearms and supplements**, and the SQL in migration `20260928000300` mirrors it.
  - **Open:** none of the list is Kyle-approved, and adult, firearms and **supplements** go beyond the strategy notes. See [X1](#contradictions-and-missing-implementation). A lawyer should review the list before launch.
- **Implemented:** FTC `#ad` disclosure is part of the proof checklist (migration `20260928000300`).
- **Implemented:** school conflict categories are recorded **by the athlete**. **Proposed (STRAT-0927):** also store each school's conflict categories centrally, and send athletes a deal summary to forward to compliance. **Proposed:** meet each school's compliance office before recruiting there, starting with Blinn.
- **Proposed (STRAT-0927):** the terms state that HILLink is a marketplace, not the athlete's agent. **Open:** a lawyer drafts the terms of service, the athlete agreement and the business agreement before launch. None exist in the repo.
- **Proposed (STRAT-0927):** general liability and E&O insurance once money is flowing.
- **Proposed (STRAT-0927):** businesses approve posts before they go live. **Not implemented:** approval happens after posting.
- **Open (AUDIT-0928):** a business that changes its category can escape a school's conflict. **Proposed:** lock or audit category changes.

## Money and monetization

- **Confirmed (K-0927):** there are four business tiers, and they are current. The old $99/$149/$249 figures are outdated. **Implemented** in `lib/stripe/config.ts`:

  | Tier | Price/mo | Athletes per campaign | Open campaigns | Top athlete tier |
  |---|---|---|---|---|
  | Starter | $250 | 3 | 2 | Silver |
  | Growth | $400 | 6 | 5 | Gold |
  | Scale | $700 | 12 | 10 | Platinum |
  | Domination | $1,200 | 20 | 20 | Diamond |

- **Confirmed (K-0928, answer 10):** **businesses pay athletes on top of their plan, plus a 20% HILLink fee on top of athlete pay.** The athlete receives the full payout.
  - **Implemented:** `lib/payments/fees.ts` sets `PLATFORM_FEE_BPS=2000`, `ATHLETE_PAY_MODE=on_top` and `PASS_CARD_FEES_TO_BUSINESS=true` (Stripe's 2.9% + 30¢ is added to the business's charge). The fee and card fee are frozen on the payment row at accept.
- **Proposed, not confirmed (STRAT-0927):** pass card fees to the business. Code does it by default. **Open:** confirm with Kyle.
- **Open:** is the "athlete pay included in the tier" test still planned? **Implemented:** `ATHLETE_PAY_MODE=included` exists as a switch, giving 60% of the tier price as athlete credit.
  - The pricing model preferred "included + 20% on extra budget", but only if it closes at least 1.6× as many businesses (idea 1.3). Kyle's 2026-09-28 answer confirms `on_top` for now.
  - **Proposed:** A/B-pitch the first leads before switching.
- **Confirmed (K-0927: Kyle asked for "charge the business first, stop double payouts") · Implemented (PR #2):** **HILLink never pays an athlete before the business's money clears.** The business pays through Stripe Checkout at or after accept, one payment row exists per application, a claim column stops a payout and a refund from racing, the Stripe idempotency key is fixed, and a late checkout is refunded automatically. AUDIT-0928 rates this path the strongest in the app: keep it.
- **Proposed (STRAT-0927):** suggested athlete pay by level:
  - Bronze: $25–40 plus product or service.
  - Silver: about $50 per post.
  - Gold: about $75 per post.
  - Platinum/Diamond: $100+ per post.

  $0 in-kind deals are allowed. **Open (E9):** $0 campaigns between linked accounts can farm XP, points and ratings. **Proposed:** cap them, and grant completion XP only after HILLink approves the business.
- **Proposed (STRAT-0927):** annual prepay with 2 months free.
- **Rejected (STRAT-0927 analysis):**
  - A $99 entry tier and a free first month lost to the current tiers in the model.
  - Commission-only (20%, no tiers) earned about a quarter of the profit.
  - Pay per result, using codes as pricing, was low revenue. Codes are for proving ROI instead.
  - A subscription-only access fee with no platform cut: Kyle doubted it, and it came last in the model.
  - Fixed packages ($250/$500/$900 retainer) were folded into the "included" idea.

  These were rejected by the model. Kyle hasn't reversed any of them.
- **Implemented (AUDIT-0928):** not handled yet: chargebacks (`charge.dispute.created`), transfer reversals after a payout, partial refunds for `resolved_partial` disputes, and invoice records. **Proposed:** P2, since Stripe is the ledger of record at this size. Never delete `payments` or `finance_events`.
- **Open:** tax, 1099 and bookkeeping treatment need an accountant.

## Matching, discovery, and invitations

- **Implemented:** the athlete feed loads every `active` and `open` campaign (`app/athlete/AthleteDashboard.tsx:333`). Tier, radius and compliance fail only when the athlete taps Apply.
  - **Proposed (E6):** return each campaign with its `athlete_join_block` reason and show eligible campaigns first.
- **Implemented:** auto-accept uses tier, radius and compliance. It trusts `athlete_profiles.is_verified`, `tier` and `is_flagged`, all of which the athlete can edit (AUDIT-0928 H5, P0).
- **Implemented:** verified Instagram follower counts are stored (PR #5). Follower count isn't used for tiers yet. See Confirmed 5.3 above.
- **Open:** cold-start and fairness rules for new athletes, and the empty states for a 10-athlete marketplace. **Proposed (AUDIT-0928):** show counts in the athlete's area, explain what unlocks more, and offer to notify.

## Proving ROI: customer codes and reports

- **Confirmed (K-0927):** Kyle asked for customer-code tracking and a monthly report, so businesses see proof of ROI.
- **Implemented (PR #3):**
  - Each athlete gets a customer code for each business.
  - The customer shows a code or QR link, and staff tap "redeemed" through a staff link without an account.
  - Monthly results report: posts, reach, codes used, new customers, and cost per new customer.
- **Implemented (AUDIT-0928 H9):** when an athlete's Instagram isn't connected, `calculateMockDiagnostics` (`lib/instagram/diagnostics.ts:53`) **invents** likes, reach and views from the URL's characters. The numbers are stored, summed into the business report as reach, and can award XP. **Proposed (P0):** store only a status, label the report "not verified", and never award XP from it.
- **Implemented:** the HL-XXXX referral code is for platform signups only. It is not a customer code.
- **Proposed (STRAT-0927):**
  - Pitch strong offers (15–20% off or a free add-on, in both a post and a story).
  - Show the lifetime-value math (a $30 haircut × 10 visits = $300 per regular).
  - The business keeps the content to reuse as ads.
  - Offer in-person athlete appearances.
  - Tell businesses month 1 is a test, and don't sell on codes alone.
  - **Later:** Square, Toast or Shopify redemption integrations.
- **Open (AUDIT-0928):** a business's own staff can redeem codes to boost an athlete's score. **Proposed:** a daily cap and burst flags.
- **Open (LIVE-0927 checklist):** verify whether past months in the report use today's price.

## Communications and support

- **Implemented:** in-app and email notifications (`lib/notifications.ts`, Resend). When an insert fails a check constraint, the notification is re-inserted as `new_application` (`lib/notifications.ts:83`). Email failures aren't logged. **Proposed:** a notification `category` (transactional, reminder, marketing) and an `email_status` column.
- **Implemented on #9:** a signed-in, role-aware Help Center at `/help`, with an admin editor at `/admin/help` and 42 starter articles.
  - **Confirmed (K-0928):** pending accounts can open Help.
  - **Proposed (AUDIT-0928 C10):** render rule values (72h, 1.5 stars, 20%) from one rules module, not hard-coded article text.
- **Confirmed (K-0928):** disputes and support go by email.
- **Not implemented (game plan Phase 2):** welcome and reminder emails tied to real app state. The stable Help links for them are in `docs/HELP_CENTER.md` on #9.
- **Proposed:** an AI support agent answers from `searchKnowledge()` (#9) and `athlete_join_block` reason codes.

## Admin and operations

- **Implemented:** admin approval of athletes (and of businesses on #7), a payments view with release and refund, reward item management, and waitlist review.
- **Implemented:** three partial audit logs: `campaign_status_log` (the repo SQL never enables RLS on it), `athlete_verification_audit_logs`, and `finance_events` (which cancel deletes). **Proposed (F6):** one insert-only `audit_events` table, with a reason required on admin actions.
- **Implemented:** Vercel cron runs `/api/cron/auto-approve` at 15:00 UTC and `/api/cron/scores` at 15:30 UTC (`vercel.json`), guarded by `CRON_SECRET`.
- **Kyle-reported (LIVE-0927), not verified by an agent:**
  - `CRON_SECRET` once had surrounding whitespace, which broke Vercel deploys. Kyle re-saved it.
  - Production deploys were "staged" without the domain, so hillink.io served a build about 17 days old until someone clicked Promote. Merges don't go live automatically.
- **Open:** production test data. Kyle's business account has **237 open E2E test campaigns** against a 20-campaign limit. Real athletes would see them in the feed.
  - **Proposed:** add an `is_test` flag, and cancel (not delete) the test campaigns.
  - **Proposed:** stop seed and E2E scripts from targeting a non-local database unless explicitly allowed.
- **Open:** which actions need Kyle's approval, for example production SQL, refunds and deletes. AGENTS.md already requires Kyle's direction for production migrations and deploys.

## Analytics and success metrics

- **Confirmed (PLAN-0925):** the metrics are MRR, athletes signed, active businesses, campaigns run, and campaign completion rate (target above 80%).
- **Confirmed (PLAN-0925):** the sales pipeline stages are Lead, Contacted, Responded, Call Scheduled, Proposal Sent, and Closed/Lost. They're tracked **outside the app** (Kyle's dashboard). Not implemented in this repo.
- **Proposed (STRAT-0927):** close rate is the strongest lever, then market size, then churn. Replace the model's guesses with data from the first 3–5 campaigns.
- **Implemented:** there's no product-event tracking, and admin analytics read raw tables, including test data. **Proposed (F11):** a server-written `product_events` table with `is_test`.

## Privacy, security, and account lifecycle

These AUDIT-0928 findings are from repo SQL and are **not confirmed against production**. The audit artifact has read-only queries to confirm each one.

- **Implemented (P0):**
  - Any signed-in user can mint XP through `log_athlete_xp_event`, which is security definer and never revoked (`supabase/xp.sql:40`).
  - `transition_campaign_status` trusts a caller-supplied `p_changed_by` (`supabase/campaign-lifecycle.sql:64`).
  - Businesses can write their own billing plan fields.
  - Athletes can write their own `is_verified`, `tier`, `is_flagged`, and payout account fields.
  - Anyone can insert a dispute on any application.
- **Implemented on #7:** a profile guard stops self-approval and self-assigned roles.
- **Implemented:** rate limiting exists only on the waitlist.
- **Implemented:** the waitlist uses a separate Supabase project (`WAITLIST_SUPABASE_URL`).
- **Implemented:** `PRELAUNCH_MODE` is off by default (the MVP is open).
- **Open:** a privacy policy, data export, and consent records. There's no record of which terms version a user accepted.

## UX and design rules

- **Implemented on #8:** errors must show next to the action button. Hidden banner errors caused "Create Campaign does nothing" in the live test.
- **Implemented on #9:** no horizontal scroll on a 390px phone, which the Help Center tests check.
- **Proposed:** mobile-first for athletes. Plain explanations of NIL terms. A clear message for every blocked state, using reason codes.
- **Open:** brand colors and a design system aren't documented in the repo.

## External systems and environments

- **Implemented:** Next.js 15, Supabase (main project plus a separate waitlist project), Stripe (Checkout, Billing, Connect transfers and webhooks), Resend email, and Instagram/Meta OAuth (which requests `instagram_manage_insights`).
- **Kyle-reported (LIVE-0927), not agent-verified:**
  - Production migrations `20260928000100` through `20260928000500` (PRs #2–#6) were run by Kyle in the Supabase SQL editor on 2026-09-27.
  - #7–#10's migrations are **not** run.
  - Each PR builds two Vercel projects, `hillink` and `hillink-vercel-starter`, and the latter serves hillink.io.
  - The Stripe live test used **test mode**. Stripe live mode is a launch blocker (PLAN-0925).
- **Implemented:** `supabase/migrations/20260331161357_init_schema.sql` is empty (0 bytes). The real baseline is the loose `supabase/*.sql` files, and production has drifted from them (for example, `graduation_year` is written by `app/onboarding/athlete/page.tsx:123` but created by no SQL file). **Proposed:** dump production's schema into the repo before the next migration.
- **Open:** do both Vercel projects run the crons in production? If so, each job runs twice a day.

## Rejected approaches and non-goals

- **Rejected (K-0927):** the $99/$149/$249 tier prices from older notes. The app's tiers are current.
- **Rejected (STRAT-0927 model; see Money):** the $99 tier, a free first month, commission-only, pay-per-result pricing, and subscription-only with no cut.
- **Rejected (K-0928):** PayPal, Venmo and Cash App payouts, because payouts go through Stripe only.
- **Rejected (K-0928):** proof screenshots for now, because proof is a link.
- **Rejected (K-0928), for now:** live referral XP. It's "not yet", not "never".
- **Rejected (AUDIT-0928):** a `campaign_versions` table, a double-entry ledger, organizations, and a schools master table **before launch**. A snapshot column and kept rows are enough for now, so each was postponed rather than rejected.

## Contradictions and missing implementation

These compare the product context above with `main@7475f5b` and the four open PRs. Items marked **Ask Kyle** are listed again in [Open product decisions](#open-product-decisions).

| # | Context | Code | Status |
|---|---|---|---|
| X1 | Strategy recommends supplement shops as ideal code businesses, and the highest-scored College Station lead is a supplement store. | `supplements` is a **restricted** category (`lib/compliance/rules.ts`), so athletes can't join those campaigns. | **Ask Kyle** (and a lawyer) |
| X2 | The strategy notes proposed restricting alcohol, vape, gambling and cannabis. | Code also restricts adult, firearms and supplements, and Kyle hasn't approved any of the list. | **Ask Kyle** |
| X3 | Follower count counts toward tier (Confirmed). | Tiers are XP-only (`lib/xp.ts:27`). | Missing; thresholds open |
| X4 | Low scorers are shown less (Proposed; Kyle wanted an Uber-style score). | The score is only displayed to the athlete, not used for ranking. | Missing; needs approval |
| X5 | Plan tiers gate campaigns (Confirmed revenue model). | Limits are checked only in React, and billing fields are self-editable. | P0 bug |
| X6 | Cancel is allowed "before any approval" (Confirmed K-0928). | #10 allows cancel while proof is **submitted**, with a full refund and the athlete's work deleted. The audit proposes blocking cancel once proof is submitted. | **Ask Kyle** |
| X7 | Resubmits unlimited, disputes by email (Confirmed). | Dispute API excludes submitted and rejected work, and nothing caps rejections. | **Ask Kyle** (rejection cap) |
| X8 | Instagram login is required for new athletes and ROI must be real (Confirmed). | Invented metrics are stored and reported when the athlete isn't connected. | P0 bug |
| X9 | Rewards and points have real value (Confirmed). | Anyone can mint XP (`supabase/xp.sql:40`). | P0 bug |
| X10 | HILLink never fronts athlete pay (Confirmed). | Satisfied. But athletes can **work** unfunded, and nothing escalates. | **Ask Kyle** (fund at accept) |
| X11 | Campaigns are created `active`. | The athlete read policy allows only `open`, so production feed behavior is unverified. | Bug; verify in production |
| X12 | Proof is link-only, the window is 72h, rating follows approval, payouts are Stripe-only, Platinum ranks correctly, and the 1.5-star floor is on the server (all Confirmed K-0928). | On main: screenshot checklists, a 48h label, rating buried in history, PayPal/Venmo options, Platinum below Bronze in `tier_rank()`, and the 1.5 check in the browser only. | Fixed on #8 and #10; merge pending |
| X13 | Cancel, withdraw and account deletion must keep money records (Proposed). | All three hard-delete, and `payments` cascade. | P0; needs approval of the approach |
| X14 | Test data must not reach real users. | 237 open E2E campaigns in production; seed scripts have no target guard; no `is_test` flag. | **Ask Kyle** (cleanup) |
| X15 | Welcome and reminder emails (game plan Phase 2). | Not built. | Missing |
| X16 | The project ideas log marks 18+ and the restricted list as "Idea". | Both are implemented. | Log is stale (outside the repo) |
| X17 | Business approval at signup (#7). | Main auto-approves businesses. | **Ask Kyle** to confirm intent |

## Open product decisions

Each has a recommended default so work can continue. None is decided until Kyle answers.

| # | Decision | Why it matters | Recommendation | Affects | Blocking |
|---|---|---|---|---|---|
| D1 | Transfer rule for accepted work | Fairness to athletes, compliance | Finish unless the new school's conflict blocks it | `athlete_join_block`, new affiliations table | Transfer design (Phase 3) |
| D2 | Cleanup of the 237 E2E test campaigns in production | Real athletes would see them, and they break metrics | Add `is_test`, then cancel (not delete) them | `campaigns`, production data | Launch |
| D3 | Supplements (and adult, firearms) restricted? | The top lead is a supplement store | Keep blocked until a lawyer rules; if allowed, allow only NSF Certified for Sport products | `lib/compliance/rules.ts`, migration 000300 | Business pitches |
| D4 | Can a business cancel after proof is submitted? | Athletes lose paid work | No: after submission, only an admin can cancel | `cancel-campaign` | #10 merge |
| D5 | When must the business fund? | Athletes working unpaid | At accept | Accept flow, athlete UI | Launch |
| D6 | Rejection cap | Endless reject loop | The second rejection opens admin review | `update-application-status`, disputes | — |
| D7 | Follower thresholds per tier | Confirmed idea with no numbers | For example, Silver 1k, Gold 3k, Platinum 7k, Diamond 12k followers, plus XP | `lib/xp.ts`, auto-accept | — |
| D8 | Pass card fees to businesses | 3% of every charge | Yes (the current default) | `PASS_CARD_FEES_TO_BUSINESS` | — |
| D9 | Is the "athlete pay included" pricing test still planned? | Pricing copy, Help Center | Keep `on_top` until the first A/B pitches | `ATHLETE_PAY_MODE`, help articles | — |
| D10 | Point value, merch prices, rewards budget | Store is off until priced | 2–3% of revenue; donated merch first | `reward_items` | Store launch |
| D11 | Rating visibility | Privacy, fairness | Athletes see their own; businesses see average and count | RLS on ratings | — |
| D12 | Edits after accept | Terms changing under athletes | Lock material fields and snapshot at accept | `campaigns` trigger | — |
| D13 | Deletion retention | Legal, chargebacks | Anonymize now, keep money records for 7 years | Terminate route, foreign keys | Launch |
| D14 | Show campaigns athletes can't join? | Small marketplace looks empty | Yes, below eligible ones, with the reason | Feed | — |
| D15 | $0 campaign limits | XP and points farming | Cap per pair per month; XP after business approval | XP, rewards | — |
| D16 | Manual business approval (#7) | Signup friction | Keep it, since there are few businesses | #7 | #7 merge |

## Context-transfer checklist for Claude

1. Compare remembered and project knowledge against every section above. *Done 2026-09-28.*
2. Add missing nuances in a dedicated branch. *Done on `claude/product-spec-context`.*
3. Label each entry Confirmed, Implemented, Proposed, Open, or Rejected. *Done.*
4. Cite the relevant code, prior explicit Kyle decision, or approximate conversation date. *Done: the source tags above.*
5. Don't copy secrets, credentials, personal user data, or raw private conversation logs. *Checked.*
6. Post a summary in issue #12. *Done.*
7. Ask Codex to independently compare the new specification with current code and migrations. *Requested in the HANDOFF.*

Still undocumented: brand voice and design system, notification preferences, admin two-person rules, the exact Texas NIL and school rules per campus, and multi-location businesses.
