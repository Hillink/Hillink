// Starter Help Center articles, checked against the app code on 2026-09-27.
// This file only produces the seed migration (scripts/generate-help-seed.ts). Once the migration has run,
// the database is the source of truth: edit articles at /admin/help, not here. Re-running the seed never
// overwrites an article that already exists.
//
// Rules for content here: describe only what the live code does, keep planned features out of anything
// live, and never include internal strategy, pricing experiments, margins or roadmap.

import type { HelpAudience, HelpStatus } from "./access.ts";

export type SeedArticle = {
  slug: string;
  category: string;
  title: string;
  short_answer: string;
  body?: string;
  steps?: string[];
  audience: HelpAudience;
  status: HelpStatus;
  feature?: string;
  keywords?: string[];
  question_variants?: string[];
  related_slugs?: string[];
  featured?: boolean;
  escalation_required?: boolean;
  sort_order?: number;
  /** When this article was last checked against the app, if later than SEED_VERIFIED_AT. */
  verified_at?: string;
};

export const SEED_VERIFIED_AT = "2026-09-27";

// Articles rewritten after the first seed may already be in a database. The update migration
// (20260928000710) rewrites these slugs there too, unless an admin has edited the article since.
export const SEED_UPDATED_SLUGS = [
  "how-to-submit-proof",
  "what-happens-after-i-submit-proof",
  "choosing-proof-requirements",
  "how-to-review-proof",
  "after-an-athlete-is-approved",
  "rating-athletes",
  "business-plans",
  "paying-athletes",
  "cancelling-a-campaign",
];

export const SEED_ARTICLES: SeedArticle[] = [
  // ---------------------------------------------------------------- Shared
  {
    slug: "what-is-hillink",
    category: "getting-started",
    title: "What is HILLink?",
    short_answer:
      "HILLink connects local businesses with college athletes. Businesses post campaigns, athletes join and create posts, and athletes get paid once the business approves their work.",
    body: `## How it works in one minute

- **Businesses** post campaigns: for example, "visit our restaurant and post about it on Instagram."
- **Athletes** browse campaigns near them, join the ones they qualify for, and do the work.
- The athlete sends a link to the live post as **proof**.
- The business **approves** the proof, and the athlete is **paid** through Stripe.

Everything happens inside your HILLink dashboard. You'll get notifications as each step happens.

## Where to go next

- Athletes: [Start here for athletes](/help/getting-started/athlete-start-here)
- Businesses: [Start here for businesses](/help/getting-started/business-start-here)`,
    audience: "both",
    status: "live",
    feature: "platform",
    keywords: ["about", "overview", "nil", "how does hillink work", "platform"],
    question_variants: ["How does HILLink work?", "What does HILLink do?"],
    featured: true,
    sort_order: 5,
  },
  {
    slug: "campaign-types",
    category: "campaign-types",
    title: "What campaign types are there?",
    short_answer:
      "There are four campaign types: Instagram Post, Dine and Post, Product Review / Unboxing, and Monthly Ambassador.",
    body: `## Instagram Post
Post about the business on Instagram. Formats: feed post, story, reel or carousel. Athletes usually have 3 days to post.

## Dine and Post
Visit the business (for example, eat at a restaurant), then post about it. Formats: feed post, story, reel, or a post plus a story. Usually 3 days to post.

## Product Review / Unboxing
Receive or pick up a product, then post a review or unboxing. Formats include feed post, story, reel, unboxing video or product review video. Usually 7 days to post.

## Monthly Ambassador
A longer partnership with several posts over about a month. The business picks which athletes join.

Each campaign lists exactly what to post, how many posts, the deadline and what proof is needed.`,
    audience: "both",
    status: "live",
    feature: "campaign_templates",
    keywords: ["instagram", "dine and post", "product review", "unboxing", "ambassador", "templates", "formats", "reel", "story"],
    question_variants: ["What kinds of campaigns are there?", "What is a Dine and Post campaign?"],
    related_slugs: ["how-campaigns-work", "how-to-create-a-campaign"],
    sort_order: 10,
  },
  {
    slug: "how-referrals-work",
    category: "referrals",
    title: "How do referral codes work?",
    short_answer:
      "Every HILLink account has its own referral code (it looks like HL-XXXX-XXXX) in Settings. If someone referred you, you can enter their code once in Settings.",
    steps: [
      "Open Settings from your dashboard.",
      "Find your referral code and tap Copy to share it.",
      "If someone referred you, type their code in the referral field and save it.",
    ],
    body: `- You can enter a referral code **only once**, and it can't be changed afterward.
- You can't use your own code.
- If a code doesn't work, check it for typos. Codes are not case sensitive.`,
    audience: "both",
    status: "live",
    feature: "referrals",
    keywords: ["referral", "refer", "invite", "code", "friend", "hl-"],
    question_variants: ["Where is my referral code?", "How do I refer a friend?", "How do I enter a referral code?"],
    sort_order: 10,
  },
  {
    slug: "account-pending-approval",
    category: "troubleshooting",
    title: "Why does my account say it's pending?",
    short_answer:
      "HILLink reviews every new athlete and business account before it can use the dashboard. Until then you'll see a pending page. You can still update your details in Settings while you wait.",
    body: `If your account was not approved, the pending page will say so. Update your information and contact HILLink so we can take another look.

Athletes: sign up with your student email ending in **.edu**. Other emails can't create athlete accounts.`,
    audience: "both",
    status: "live",
    feature: "account_approval",
    keywords: ["pending", "approval", "approved", "waiting", "review", "locked", "rejected", "verify"],
    question_variants: ["Why can't I get into my dashboard?", "How long does approval take?", "My account is under review"],
    related_slugs: ["contact-hillink"],
    featured: true,
    sort_order: 10,
  },
  {
    slug: "change-email-or-close-account",
    category: "account-privacy",
    title: "How do I change my email or close my account?",
    short_answer:
      "Both are in Settings. Change your email under your account details. To close your account for good, use Terminate Account in the Danger Zone.",
    body: `## Changing your email
Enter your new email in Settings and choose **Change email**. Follow the confirmation email that's sent to you.

## Closing your account
Choose **Terminate Account** in the Danger Zone at the bottom of Settings. You'll be asked to confirm and type TERMINATE.

- This is permanent, and your access ends right away.
- For businesses, your HILLink subscription is cancelled as part of closing the account.

Your data is handled as described in the Privacy Policy linked at the bottom of every page.`,
    audience: "both",
    status: "live",
    feature: "account_settings",
    keywords: ["email", "delete account", "terminate", "close", "cancel account", "privacy", "remove"],
    question_variants: ["How do I delete my account?", "Can I change my login email?"],
    sort_order: 10,
  },
  {
    slug: "disputes-and-problems",
    category: "disputes",
    title: "What if something goes wrong with a campaign?",
    short_answer:
      "Email HILLink with the campaign name and what happened. The HILLink team reviews disputes between athletes and businesses and decides how to resolve them.",
    body: `Examples: an athlete didn't post, a post was rejected unfairly, or a business isn't responding.

Include:
- the campaign name
- the other person or business involved
- what you expected and what happened
- links or screenshots that show it

While a dispute is open, the athlete's proof is not approved automatically.`,
    audience: "both",
    status: "live",
    feature: "disputes",
    keywords: ["dispute", "problem", "unfair", "rejected", "scam", "not paid", "complaint", "report"],
    question_variants: ["How do I report a problem?", "How do I open a dispute?"],
    related_slugs: ["contact-hillink"],
    escalation_required: true,
    sort_order: 10,
  },
  {
    slug: "contact-hillink",
    category: "contact",
    title: "How do I contact HILLink?",
    short_answer: "Email contact@hillink.io. Tell us your account email, what you were trying to do, and what happened.",
    body: `Use **Contact HILLink** at the bottom of any help article to start an email with your account type already filled in.`,
    audience: "both",
    status: "live",
    feature: "support",
    keywords: ["contact", "support", "email", "help", "talk to someone", "customer service", "human"],
    question_variants: ["How do I reach support?", "Can I talk to a person?"],
    sort_order: 10,
  },

  // ---------------------------------------------------------------- Athletes
  {
    slug: "athlete-start-here",
    category: "getting-started",
    title: "HILLink for athletes: start here",
    short_answer:
      "Set up your profile, find a campaign near you, post about the business, send proof, and get paid once the business approves.",
    steps: [
      "Sign up with your .edu student email and confirm it. HILLink reviews and approves your account.",
      "Finish your profile, then confirm your eligibility (age, visa status and school disclosure).",
      "In Settings, connect your Stripe payout account so you can be paid.",
      "Open Find Campaigns on your dashboard and choose Review & Join on a campaign you like.",
      "Once you're accepted, do exactly what the campaign asks and include #ad in your post.",
      "Paste the link to your live post in My Campaigns and choose Submit Proof.",
      "The business approves your proof, and your pay is sent to your Stripe account. You earn XP too.",
    ],
    body: `## Good to know

- **Some campaigns accept you right away.** Others let the business choose, so you apply and wait. [How joining works](/help/finding-campaigns/how-to-join-a-campaign)
- **Your pay is already set aside.** The business funds your pay when it accepts you. [When do I get paid?](/help/payments/when-do-i-get-paid)
- **Good work helps you get more campaigns.** Ratings, on-time posts and customers you bring in build your [Hillink Score](/help/hillink-score/hillink-score-for-athletes).`,
    audience: "athlete",
    status: "live",
    feature: "onboarding",
    keywords: ["start", "new", "beginner", "how to", "first campaign", "getting started", "101", "guide"],
    question_variants: ["How do I get started?", "I'm new, what do I do?", "How does HILLink work for athletes?"],
    related_slugs: ["how-to-join-a-campaign", "how-to-submit-proof", "when-do-i-get-paid"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "how-campaigns-work",
    category: "finding-campaigns",
    title: "How do campaigns work?",
    short_answer:
      "A campaign is a paid (or in-kind) job from a local business. You join, create the post it asks for, send proof, and get paid when the business approves.",
    body: `Open **Find Campaigns** on your dashboard to see the marketplace. Each campaign shows:

- what to post and how many posts
- the pay per athlete, and anything extra (like a free meal)
- which athlete tiers can join
- how many spots are left
- the business, its location, and the due date

Use the filters to narrow by deal type, tier, pay, state or distance. To use distance, add your city and state in Settings.

Tap a business name to see the full campaign, then choose **Review & Join**.`,
    audience: "athlete",
    status: "live",
    feature: "campaign_marketplace",
    keywords: ["campaign", "marketplace", "find", "browse", "deals", "jobs", "gigs", "filter"],
    question_variants: ["Where do I find campaigns?", "How do I find deals near me?"],
    related_slugs: ["how-to-join-a-campaign", "campaign-types", "why-cant-i-join-a-campaign"],
    featured: true,
    sort_order: 1,
  },
  {
    slug: "how-to-join-a-campaign",
    category: "finding-campaigns",
    title: "How do I join a campaign?",
    short_answer:
      "Choose Review & Join. On first-come campaigns you're accepted right away if you qualify. On campaigns where the business selects, you apply and the business accepts or declines you.",
    body: `## First come, first served
If you qualify and a spot is open, you're accepted instantly. These campaigns can also require you to be within a set distance of the business, so make sure your city and state are in your profile. They stop taking new athletes 12 hours before the campaign starts.

## Business selects
You apply, and the business reviews your profile. You'll get a notification when you're accepted or not selected.

## After you're accepted
The campaign moves to **My Campaigns**. The business funds your pay, and you can start working. You can also get a [customer code](/help/customer-codes/customer-codes-for-athletes) to share.`,
    audience: "athlete",
    status: "live",
    feature: "campaign_join",
    keywords: ["join", "apply", "accept", "claim", "sign up for campaign", "first come", "auto accept"],
    question_variants: ["How do I apply to a campaign?", "Did I get accepted?", "What does auto-accept mean?"],
    related_slugs: ["why-cant-i-join-a-campaign", "campaign-requirements-explained"],
    featured: true,
    sort_order: 2,
  },
  {
    slug: "why-cant-i-join-a-campaign",
    category: "finding-campaigns",
    title: "Why can't I join a campaign?",
    short_answer:
      "The message on the campaign tells you why. The most common reasons are unconfirmed eligibility, a full campaign, a tier requirement, or being too far away.",
    body: `## Common reasons

- **Eligibility not confirmed.** Confirm your age, visa status and school disclosure first. [Eligibility rules](/help/account-eligibility/eligibility-requirements)
- **The campaign is full**, or it's no longer taking athletes.
- **Your tier is too low.** You'll see "not eligible for this payout yet." [How tiers work](/help/xp-levels/xp-and-tiers)
- **You're outside the campaign's distance limit**, or your profile is missing your location.
- **Too close to the start.** First-come campaigns close 12 hours before they start.
- **Your school has an exclusive sponsor** in this business's category.
- **The business is in a category athletes can't promote.**
- **Your student visa** status doesn't allow paid NIL work.
- **Your rating is below 1.5 stars.** You can't apply until it improves.
- **You already applied** to this campaign.

If none of these fit, contact HILLink with the campaign name.`,
    audience: "athlete",
    status: "live",
    feature: "campaign_eligibility",
    keywords: ["can't join", "cannot apply", "not eligible", "blocked", "full", "radius", "tier", "error"],
    question_variants: ["Why am I not eligible?", "It says not eligible for this payout yet", "Why is the campaign unavailable?"],
    related_slugs: ["eligibility-requirements", "xp-and-tiers", "contact-hillink"],
    sort_order: 3,
  },
  {
    slug: "campaign-requirements-explained",
    category: "campaign-requirements",
    title: "What are campaign requirements?",
    short_answer:
      "Requirements are the business's instructions: what to post, the format, how many posts, the deadline, and the proof you need to send. Follow them exactly to get approved.",
    body: `Open the campaign from **My Campaigns** or the marketplace to see:

- **Directions**: what to say or show, tags or mentions, and the call to action.
- **Content format**: feed post, story, reel, carousel or video.
- **Number of posts.**
- **Deadline**: how many days you have to post after you're accepted.
- **Proof checklist**: what the business will check, such as a live post link and the #ad label.

Every campaign requires #ad or Instagram's Paid partnership label. [Why #ad is required](/help/safety-rules/ad-disclosure-rules)`,
    audience: "athlete",
    status: "live",
    feature: "campaign_requirements",
    keywords: ["requirements", "deliverables", "directions", "instructions", "deadline", "what do i post", "checklist"],
    question_variants: ["What do I have to post?", "How long do I have to post?"],
    related_slugs: ["how-to-submit-proof", "ad-disclosure-rules"],
    sort_order: 1,
  },
  {
    slug: "how-to-submit-proof",
    category: "proof-approval",
    title: "How do I submit proof?",
    short_answer:
      "In My Campaigns, paste the link to your live post in the Proof URL box, add any notes, and choose Submit Proof.",
    steps: [
      "Publish your post, including #ad or the Paid partnership label.",
      "Copy the link to the live post.",
      "Open My Campaigns on your dashboard and find the campaign.",
      "Paste the link in Proof URL and add notes if helpful.",
      "Choose Submit Proof.",
    ],
    body: `You can submit proof once the business has accepted you. Double-check your link before you submit.

There's no screenshot upload. The business checks your live post through the link, so make sure it's public and shows everything the campaign asks for, including #ad.

If the business asks for changes, fix your post, paste the new link, and choose **Submit Again**.

If you post on Instagram and your account is connected, HILLink also pulls your post's stats (likes, comments, reach). Use **Sync Diagnostics** to refresh them.`,
    audience: "athlete",
    status: "live",
    verified_at: "2026-09-28",
    feature: "proof_submission",
    keywords: ["proof", "submit", "link", "url", "upload", "post link", "screenshot"],
    question_variants: ["Where do I upload my post?", "How do I show I posted?", "How do I send my post link?"],
    related_slugs: ["what-happens-after-i-submit-proof", "campaign-requirements-explained"],
    featured: true,
    sort_order: 1,
  },
  {
    slug: "what-happens-after-i-submit-proof",
    category: "proof-approval",
    title: "What happens after I submit proof?",
    short_answer:
      "The business reviews your proof. If they approve it, you're paid and earn XP. If they don't review it within the campaign's review window (72 hours by default), it's approved automatically once your pay is funded.",
    body: `## If the business approves
You get a notification, your pay is sent to your Stripe account, and you earn XP for completing the campaign. [When do I get paid?](/help/payments/when-do-i-get-paid)

## If the business doesn't respond
Proof that waits longer than the campaign's review window is approved automatically. The window is 72 hours by default and never shorter than 24 hours. This only happens once the business has funded your pay, and not while a dispute is open.

## If the business asks for changes
You'll get a notification and the campaign shows **Needs changes** in My Campaigns. Check the campaign requirements, fix your post, then paste the new link and choose **Submit Again**. The business reviews it again, with a new review window. If you think the decision is wrong, [contact HILLink](/help/disputes/disputes-and-problems).

After approval, the business may also [rate your work](/help/ratings/how-athlete-ratings-work).`,
    audience: "athlete",
    status: "live",
    verified_at: "2026-09-28",
    feature: "proof_review",
    keywords: ["approval", "approved", "rejected", "review", "waiting", "auto approve", "72 hours", "pending proof", "resubmit", "needs changes", "fix"],
    question_variants: ["How long does approval take?", "Why hasn't my proof been approved?", "My proof was rejected", "Can I resubmit my proof?"],
    related_slugs: ["when-do-i-get-paid", "how-athlete-ratings-work", "disputes-and-problems"],
    featured: true,
    sort_order: 2,
  },
  {
    slug: "dropping-a-campaign",
    category: "completing-campaigns",
    title: "Can I drop a campaign after joining?",
    short_answer:
      "Yes. Choose Drop Campaign in My Campaigns any time before your proof is approved. Your spot opens up again and the business gets back the money it set aside for you.",
    body: `Only drop a campaign if you really can't do it. Finishing campaigns you join, on time, is part of your [Hillink Score](/help/hillink-score/hillink-score-for-athletes).`,
    audience: "athlete",
    status: "live",
    feature: "withdraw_application",
    keywords: ["drop", "withdraw", "leave", "quit", "cancel", "can't do it"],
    question_variants: ["How do I cancel a campaign?", "How do I withdraw my application?"],
    sort_order: 1,
  },
  {
    slug: "set-up-payouts",
    category: "payments",
    title: "How do I set up payouts?",
    short_answer:
      "Go to Settings and choose Connect Stripe Payout Account. HILLink pays athletes through Stripe, so you need a connected Stripe account before any pay can be sent.",
    steps: [
      "Open Settings from your dashboard.",
      "Under Payout Receiving Information, choose Connect Stripe Payout Account.",
      "Finish Stripe's setup (your details and a bank account or debit card).",
      "Come back to HILLink. Once Stripe confirms your account, you're ready to be paid.",
    ],
    body: `Stripe handles your bank details. HILLink never sees your full bank account number.

If a campaign is approved before your payout account is ready, your pay stays held for you. After you finish setup, the business can send it from their dashboard. Contact HILLink if it doesn't arrive.`,
    audience: "athlete",
    status: "live",
    feature: "payouts",
    keywords: ["payout", "stripe", "bank", "connect", "direct deposit", "set up payment", "get paid"],
    question_variants: ["How do I add my bank account?", "How do I connect Stripe?"],
    related_slugs: ["when-do-i-get-paid"],
    featured: true,
    sort_order: 1,
  },
  {
    slug: "when-do-i-get-paid",
    category: "payments",
    title: "When do I get paid?",
    short_answer:
      "Your pay is sent to your Stripe account as soon as the business approves your proof. Stripe then moves it to your bank on its normal payout schedule.",
    body: `## How your pay is protected
When a business accepts you, it pays HILLink your campaign pay up front. That money is held for you. When your proof is approved, it's sent to you. You get the full pay listed on the campaign; HILLink's fee is charged to the business, not taken out of your pay.

## What has to be true to get paid
- Your proof is approved (by the business, or automatically after the review window).
- Your [Stripe payout account](/help/payments/set-up-payouts) is connected.

## Checking your payments
Your earnings page lists each campaign payment and when it was paid: [My Earnings](/athlete/earnings).

## In-kind campaigns
Some campaigns pay with something other than money, like a free meal or product. Those have no cash payout.`,
    audience: "athlete",
    status: "live",
    feature: "payouts",
    keywords: ["paid", "payment", "payout", "money", "when", "how long", "stripe", "earnings", "bank"],
    question_variants: ["How do payouts work?", "Where is my money?", "How long until I get paid?", "Why haven't I been paid?"],
    related_slugs: ["set-up-payouts", "what-happens-after-i-submit-proof"],
    featured: true,
    escalation_required: true,
    sort_order: 0,
  },
  {
    slug: "how-athlete-ratings-work",
    category: "ratings",
    title: "How do athlete ratings work?",
    short_answer:
      "After approving your work, a business can rate you from 1 to 5 stars and leave a short review. Your average rating shows on your dashboard.",
    body: `- Each campaign can be rated once.
- Your average is the average of all your ratings.
- Ratings are the biggest part of your [Hillink Score](/help/hillink-score/hillink-score-for-athletes).
- If your average falls below **1.5 stars**, you can't apply to new campaigns until it improves.

The best way to earn strong ratings: follow the campaign directions exactly, post on time, and include #ad.`,
    audience: "athlete",
    status: "live",
    feature: "ratings",
    keywords: ["rating", "stars", "review", "feedback", "average", "1.5"],
    question_variants: ["What are ratings?", "How do I improve my rating?", "Who rates me?"],
    related_slugs: ["hillink-score-for-athletes"],
    sort_order: 1,
  },
  {
    slug: "xp-and-tiers",
    category: "xp-levels",
    title: "What are XP and athlete tiers?",
    short_answer:
      "You earn XP for campaign work. Your total XP sets your tier: Bronze, Silver, Gold, Platinum or Diamond. Some campaigns are only open to higher tiers.",
    body: `## Tiers
- Bronze: 0 XP
- Silver: 1,000 XP
- Gold: 2,500 XP
- Platinum: 5,000 XP
- Diamond: 8,000 XP

## How you earn XP
- Accepted into a campaign: 25 XP
- Proof submitted: 20 XP
- Proof approved: 160 XP (120 for completing the campaign plus 40 for the approved post)
- Proof sent by the campaign's due date: 30 XP bonus
- XP Challenges on your dashboard, like Campaign Starter and Closer
- A bonus when a connected Instagram post performs very well

Your dashboard shows your XP, your tier and how much XP you need for the next tier.

## Tiers and seasonal levels are different
Your **tier** is based on all the XP you've ever earned. The [rewards road](/help/rewards/rewards-road) has separate **levels 1–50** that restart every semester.`,
    audience: "athlete",
    status: "live",
    feature: "xp",
    keywords: ["xp", "experience", "tier", "level", "bronze", "silver", "gold", "platinum", "diamond", "rank"],
    question_variants: ["What is Gold level?", "How do I level up?", "How are levels calculated?", "How do I get to the next tier?"],
    related_slugs: ["rewards-road", "why-cant-i-join-a-campaign"],
    featured: true,
    sort_order: 1,
  },
  {
    slug: "hillink-score-for-athletes",
    category: "hillink-score",
    title: "What is my Hillink Score?",
    short_answer:
      "Your Hillink Score is a number from 0 to 100 that shows businesses how reliable you are. It's built from your ratings, posting on time, getting approved the first time, and customers you bring in.",
    body: `## What goes into it
- **Star ratings from businesses**: 40%
- **Proof sent on time**: 25%
- **Proof approved the first time**: 15%
- **Customers who use your code, per campaign**: 20%

New athletes start near the middle and are marked **New** until they finish 3 campaigns, so one campaign can't swing your score too far.

Your score is updated daily. Your dashboard shows it, each part, and one tip to raise it. Businesses see it on your athlete card.

A score of 90 or more after 3 campaigns unlocks the Pro track on the [rewards road](/help/rewards/rewards-road).`,
    audience: "athlete",
    status: "live",
    feature: "hillink_score",
    keywords: ["score", "hillink score", "credit score", "reliability", "rating", "pro"],
    question_variants: ["How is my score calculated?", "How do I raise my Hillink Score?"],
    related_slugs: ["how-athlete-ratings-work", "customer-codes-for-athletes"],
    sort_order: 1,
  },
  {
    slug: "rewards-road",
    category: "rewards",
    title: "How does the rewards road work?",
    short_answer:
      "Each semester you climb levels 1 to 50 with the XP you earn, collect points for levels, badges and customers you bring in, and unlock badges. Open it from your dashboard.",
    body: `## Seasons
Seasons follow the school year: spring (January to May), summer (June and July) and fall (August to December). Levels and points start over each season. Your tier, XP and Hillink Score carry over.

## Levels
Level 2 takes 60 XP, and each level after that takes a little more.

## Points
- Every level: 10 points
- Every 5th level: 25 bonus points
- Each customer who uses your code: 5 points (up to 20 customers per campaign each season)
- Each badge, the first time you earn it: 20 points

## Pro track
Reach a Hillink Score of 90 or more after 3 campaigns to unlock the Pro track: 15 extra points every level and 50 extra every 5th level. You never pay for Pro.

## Badges
First Campaign, Regular (5 campaigns), 10 Customers Driven, 5-Star Streak, Always On Time, Verified Reach, and Hillink Pro.`,
    audience: "athlete",
    status: "live",
    feature: "rewards_road",
    keywords: ["rewards", "points", "badges", "season", "semester", "levels", "battle pass", "pro track"],
    question_variants: ["How do I earn points?", "What are badges?", "What is the Pro track?"],
    related_slugs: ["xp-and-tiers", "hillink-score-for-athletes"],
    sort_order: 1,
  },
  {
    slug: "rewards-store",
    category: "rewards",
    title: "Spending points in the rewards store",
    short_answer: "Planned: athletes will spend rewards-road points on HILLink merch and partner rewards.",
    body: `Internal note: store items exist in the database with active = false until point values and item prices are decided. Keep this article in planned status until at least one item is turned on.`,
    audience: "athlete",
    status: "planned",
    feature: "rewards_store",
    keywords: ["store", "merch", "redeem", "spend points", "hoodie", "shirt"],
    sort_order: 50,
  },
  {
    slug: "customer-codes-for-athletes",
    category: "customer-codes",
    title: "How do customer codes work for athletes?",
    short_answer:
      "Once you're accepted into a campaign, choose Get customer code. Share the code or its link in your post. Every customer who shows it at the business counts toward your results.",
    steps: [
      "Open My Campaigns and choose Get customer code on the campaign.",
      "Put the code in your post or story, or share the link that comes with it.",
      "Customers show the code at the business, and the business records it.",
    ],
    body: `Your code looks like **JAKE-7K2Q**. The link shows customers the business, any offer it gives for using the code, and your code.

- Codes only work at the business running the campaign.
- A code stops working if you leave the campaign.
- Each customer earns you 5 rewards points, up to 20 customers per campaign each season.
- Customers you bring in also count toward your [Hillink Score](/help/hillink-score/hillink-score-for-athletes).`,
    audience: "athlete",
    status: "live",
    feature: "customer_codes",
    keywords: ["customer code", "promo code", "discount code", "share link", "redemption", "customers"],
    question_variants: ["What is a customer code?", "Where do I get my promo code?"],
    related_slugs: ["rewards-road"],
    sort_order: 1,
  },
  {
    slug: "eligibility-requirements",
    category: "account-eligibility",
    title: "What do I need to be eligible?",
    short_answer:
      "You must be 18 or older, tell HILLink your visa status, agree to report HILLink deals to your school, and list any categories where your school has an exclusive sponsor.",
    body: `Confirm these on your eligibility page. Until you do, your dashboard shows a reminder and you can't join campaigns.

- **Age**: you must be 18 or older.
- **Visa**: student visas usually don't allow paid NIL work in the US. If you're an international student who hasn't been cleared by your school, you can't join campaigns.
- **School disclosure**: you agree to report your HILLink deals to your school.
- **School sponsors**: if your school has an exclusive deal in a category (for example, apparel or drinks), you won't be able to join campaigns from businesses in that category.

Update your answers any time on the [eligibility page](/athlete/eligibility).`,
    audience: "athlete",
    status: "live",
    feature: "compliance",
    keywords: ["eligible", "eligibility", "age", "18", "visa", "international", "school", "confirm"],
    question_variants: ["Why do I need to confirm eligibility?", "Can international students use HILLink?"],
    related_slugs: ["nil-school-rules", "why-cant-i-join-a-campaign"],
    sort_order: 1,
  },
  {
    slug: "nil-school-rules",
    category: "nil-compliance",
    title: "NIL and school rules on HILLink",
    short_answer:
      "HILLink blocks campaigns that would break common NIL rules, but you're still responsible for following your school's policies and reporting your deals.",
    body: `## Categories athletes can't promote
HILLink doesn't allow businesses in these categories, and athletes can't join their campaigns:
- bars, breweries and liquor stores
- tobacco and vape
- cannabis, CBD and hemp
- betting, casinos and sweepstakes
- adult entertainment
- firearms and weapons
- supplements and weight loss (they can contain NCAA-banned substances)

## Your school's rules
Your school may have its own rules, including exclusive sponsors. Tell HILLink about exclusive categories on your eligibility page so those campaigns are blocked for you.

HILLink doesn't give legal or compliance advice. When in doubt, ask your school's compliance office before joining a campaign.`,
    audience: "athlete",
    status: "live",
    feature: "compliance",
    keywords: ["nil", "ncaa", "compliance", "school", "rules", "alcohol", "betting", "supplements", "banned", "restricted"],
    question_variants: ["Is HILLink NCAA compliant?", "Do I have to tell my school?"],
    related_slugs: ["eligibility-requirements", "ad-disclosure-rules"],
    sort_order: 1,
  },
  {
    slug: "ad-disclosure-rules",
    category: "safety-rules",
    title: "Why do I have to use #ad?",
    short_answer:
      "US advertising rules (from the FTC) require paid posts to be clearly labeled. Every HILLink campaign post must include #ad or use Instagram's Paid partnership label.",
    body: `- Put **#ad** where people will see it, or turn on Instagram's **Paid partnership** label.
- Make sure it shows in your proof, because businesses check for it.
- Follow the campaign's directions, and only say things about the business that are true.`,
    audience: "athlete",
    status: "live",
    feature: "ftc_disclosure",
    keywords: ["#ad", "ad", "ftc", "disclosure", "paid partnership", "sponsored", "label"],
    question_variants: ["Do I need to say it's an ad?", "What is the Paid partnership label?"],
    sort_order: 1,
  },

  // ---------------------------------------------------------------- Businesses
  {
    slug: "business-start-here",
    category: "getting-started",
    title: "HILLink for businesses: start here",
    short_answer:
      "Choose a plan, post a campaign, accept athletes and fund their pay, then approve their posts. Athletes are paid automatically when you approve.",
    steps: [
      "Create your account and business profile. HILLink reviews and approves new businesses.",
      "In Settings, choose a plan and finish billing. You need an active plan to post campaigns.",
      "Choose Post New Campaign. Pick a campaign type, what athletes should post, pay per athlete, and how many athletes.",
      "Athletes join. On first-come campaigns they're accepted automatically; otherwise you accept the ones you want.",
      "Fund each accepted athlete's pay through Stripe. The money is held until you approve their work.",
      "When an athlete submits proof, open it, then Approve or Reject. Approving pays the athlete.",
      "Track customers who used athletes' codes under Results & customer codes.",
    ],
    body: `## Good to know

- **You don't have to watch every post.** Proof you don't review within 72 hours is approved automatically, as long as you've funded it. [Reviewing proof](/help/proof-approval/how-to-review-proof)
- **You only pay for athletes you accept.** Money is held and only released when work is approved. [Paying athletes](/help/payments/paying-athletes)
- **See your results.** Customer codes show how many customers each athlete brought in. [Customer codes](/help/customer-codes/customer-codes-for-businesses)`,
    audience: "business",
    status: "live",
    feature: "onboarding",
    keywords: ["start", "new", "beginner", "how to", "first campaign", "getting started", "101", "guide", "setup"],
    question_variants: ["How do I get started?", "How does HILLink work for businesses?", "What do I do first?"],
    related_slugs: ["business-plans", "how-to-create-a-campaign", "paying-athletes"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "how-to-create-a-campaign",
    category: "creating-campaigns",
    title: "How do I create a campaign?",
    short_answer:
      "Choose Post New Campaign on your dashboard, fill in what you want athletes to do and what you'll pay, then choose Create Campaign.",
    steps: [
      "Make sure your plan is active in Settings.",
      "Choose Post New Campaign.",
      "Pick a campaign type and content format.",
      "Add a title, a short description and your goal (for example, bringing in customers).",
      "Set the number of posts, the posting deadline and how athletes join.",
      "Choose which athlete tiers can join, the number of athletes and the pay per athlete.",
      "Add clear directions and choose the proof you want.",
      "Review the summary, confirm the two checkboxes, and choose Create Campaign.",
    ],
    body: `## Tips
- **Directions** are what athletes follow. Include what to say, tags or mentions, and your call to action.
- **Customer offer** (optional) is what customers get for using an athlete's code, such as 10% off.
- **Additional compensation** (optional) is anything extra, like a free meal.
- **Saved templates** let you reuse a campaign setup.

## Limits from your plan
Your plan sets how many campaigns can be open at once, how many athletes each campaign can have, and the highest athlete tier you can choose. [Business plans](/help/plans-billing/business-plans)`,
    audience: "business",
    status: "live",
    feature: "campaign_builder",
    keywords: ["create", "post", "new campaign", "campaign builder", "launch", "set up campaign", "template"],
    question_variants: ["How do I post a campaign?", "How do I make a new campaign?"],
    related_slugs: ["campaign-types", "choosing-proof-requirements", "how-athletes-join-your-campaign"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "how-athletes-join-your-campaign",
    category: "choosing-athletes",
    title: "How do athletes join my campaign?",
    short_answer:
      "You choose when you create the campaign. With first come, first served, qualifying athletes are accepted automatically. With business selects, athletes apply and you accept or decline them.",
    body: `## First come, first served
Athletes who qualify are accepted instantly until your spots are full. You'll get a notification each time. Athletes must be within the campaign's distance limit, and new athletes can't join in the last 12 hours before the campaign starts.

## Business selects
Athletes apply and you get a notification. Open the campaign, view the athlete's full profile, and choose **Accept** or **Decline**. Monthly Ambassador campaigns always use this option.

## After you accept
You'll be asked to fund the athlete's pay. [Paying athletes](/help/payments/paying-athletes)

## Finding athletes yourself
Use **Find Athletes** on your dashboard to browse athletes, including their tier, rating and Hillink Score.`,
    audience: "business",
    status: "live",
    feature: "campaign_join",
    keywords: ["athletes join", "accept", "decline", "applicants", "auto accept", "first come", "choose athletes", "select"],
    question_variants: ["How do I pick athletes?", "Who can join my campaign?", "What is auto-accept?"],
    related_slugs: ["paying-athletes", "athlete-tiers-for-businesses"],
    sort_order: 0,
  },
  {
    slug: "choosing-proof-requirements",
    category: "campaign-requirements",
    title: "What should I ask athletes to submit as proof?",
    short_answer:
      "Each campaign type comes with a proof checklist, such as a live post link and a post that says #ad. Athletes send proof as a link to their live post, so ask for things you can check by opening that link.",
    body: `Examples from the built-in checklists:
- live post link
- post includes the required tags or mentions
- post says #ad or uses the Paid partnership label (always included, because the FTC requires it)
- post shows the visit (Dine and Post) or the product (Product Review)

Athletes send proof by pasting a link to their live post and adding notes. There's no screenshot upload. For campaigns with several posts, athletes put the extra links in the notes.

Clear directions get better posts. Say exactly what to mention, what to show and what customers should do.`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "campaign_requirements",
    keywords: ["proof", "requirements", "checklist", "deliverables", "what to ask", "directions"],
    question_variants: ["What proof should I require?", "How do I write good directions?"],
    related_slugs: ["how-to-review-proof", "how-to-create-a-campaign"],
    sort_order: 0,
  },
  {
    slug: "how-to-review-proof",
    category: "proof-approval",
    title: "How do I review campaign proof?",
    short_answer:
      "When an athlete submits proof, open the campaign on your dashboard, choose View Proof, then Approve or Reject. Approving pays the athlete from the money you funded.",
    body: `## Before you can approve
The athlete's pay must be funded. If it isn't, you'll see **Fund payment** first.

## If you don't review it
Proof you don't review within the campaign's review window (72 hours by default) is approved automatically and the athlete is paid. This only happens for funded work and never while a dispute is open. Unfunded work is never auto-approved; you'll get a reminder instead.

## Rejecting
Reject proof that doesn't meet your requirements. The athlete is notified and can fix their post and send it again. Their funded pay stays held until you approve, and the review window starts over when they resubmit. If you're not sure, [contact HILLink](/help/disputes/disputes-and-problems).

## After approving
You're asked to rate the athlete right away. You can also rate them later with **Rate Athlete**. [Rating athletes](/help/ratings/rating-athletes)

## Post stats
For Instagram posts, **Sync Diagnostics** shows likes, comments and reach when the athlete's account is connected.`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "proof_review",
    keywords: ["review", "approve", "reject", "proof", "view proof", "auto approve", "72 hours", "submission", "resubmit"],
    question_variants: ["How do I approve a post?", "What happens if I don't review proof?"],
    related_slugs: ["paying-athletes", "rating-athletes", "after-an-athlete-is-approved"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "after-an-athlete-is-approved",
    category: "proof-approval",
    title: "What happens when an athlete's work is approved?",
    short_answer:
      "The athlete is paid from the money you funded, earns XP, and their part of the campaign shows as completed. You can then rate them and track customers they bring in.",
    body: `- **Payment**: the athlete's pay is sent to their Stripe account. If their payout account isn't set up yet, a **Pay athlete** button lets you send it later.
- **Ratings**: you're asked to rate the athlete from 1 to 5 stars as soon as you approve. [Rating athletes](/help/ratings/rating-athletes)
- **Results**: customers who use the athlete's code keep counting in your [monthly results](/help/results/monthly-results-report).`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "campaign_completion",
    keywords: ["completed", "complete", "done", "finished", "after approval", "campaign completed"],
    question_variants: ["What happens when a campaign is completed?", "What do I do after approving?"],
    related_slugs: ["rating-athletes", "monthly-results-report"],
    sort_order: 1,
  },
  {
    slug: "rating-athletes",
    category: "ratings",
    title: "How do athlete ratings work?",
    short_answer:
      "After an athlete's work is approved, you can rate them from 1 to 5 stars and add a short review. Ratings help other businesses and shape the athlete's Hillink Score.",
    body: `- When you approve an athlete's work, a rating window opens right away.
- To rate later, open the campaign on your dashboard (or in **Campaign History**), expand the athlete, and choose **Rate Athlete**.
- You can rate each athlete once per campaign.
- An athlete's average rating shows on their profile.
- Athletes whose average falls below 1.5 stars can't apply to new campaigns.`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "ratings",
    keywords: ["rate", "rating", "stars", "review athlete", "feedback"],
    question_variants: ["How do I rate an athlete?", "Where is the Rate Athlete button?"],
    related_slugs: ["hillink-score-for-businesses"],
    sort_order: 0,
  },
  {
    slug: "athlete-tiers-for-businesses",
    category: "xp-levels",
    title: "What do athlete tiers mean?",
    short_answer:
      "Athletes move up from Bronze to Silver, Gold, Platinum and Diamond as they earn XP by completing campaigns. Higher tiers mean more completed, approved work on HILLink.",
    body: `## Tiers
- Bronze: new athletes
- Silver: 1,000 XP
- Gold: 2,500 XP
- Platinum: 5,000 XP
- Diamond: 8,000 XP

Athletes earn most of their XP from accepted and approved campaigns.

## Using tiers in your campaigns
When you create a campaign, you choose which tiers can join. Your plan sets the highest tier you can choose. [Business plans](/help/plans-billing/business-plans)

For a fuller picture of an athlete, look at their [Hillink Score](/help/hillink-score/hillink-score-for-businesses) and rating.`,
    audience: "business",
    status: "live",
    feature: "xp",
    keywords: ["tier", "level", "bronze", "silver", "gold", "platinum", "diamond", "xp", "athlete level"],
    question_variants: ["What is a Gold athlete?", "What do athlete levels mean?"],
    related_slugs: ["hillink-score-for-businesses", "business-plans"],
    sort_order: 0,
  },
  {
    slug: "hillink-score-for-businesses",
    category: "hillink-score",
    title: "What is the Hillink Score?",
    short_answer:
      "A 0 to 100 score on each athlete's card that shows how reliable they are, based on ratings, on-time posts, approvals on the first try, and customers they bring in.",
    body: `- Star ratings from businesses: 40%
- Proof sent on time: 25%
- Proof approved the first time: 15%
- Customers per campaign: 20%

Athletes with fewer than 3 finished campaigns are marked **New**. In **Find Athletes**, sort by **Best Hillink Score** to see the most reliable athletes first. Follower counts marked ✓ are verified from the athlete's connected Instagram.`,
    audience: "business",
    status: "live",
    feature: "hillink_score",
    keywords: ["score", "hillink score", "reliability", "best athletes", "verified followers"],
    question_variants: ["How do I find reliable athletes?", "What does the score on athlete cards mean?"],
    related_slugs: ["athlete-tiers-for-businesses", "rating-athletes"],
    sort_order: 0,
  },
  {
    slug: "business-plans",
    category: "plans-billing",
    title: "How do business plans work?",
    short_answer:
      "HILLink has four monthly plans. Your plan sets how many campaigns you can run at once, how many athletes each campaign can have, and the highest athlete tier you can work with.",
    body: `## Plans
- **Starter**, $250/month: 2 open campaigns, up to 3 athletes each, athletes up to Silver
- **Growth**, $400/month: 5 open campaigns, up to 6 athletes each, athletes up to Gold
- **Scale**, $700/month: 10 open campaigns, up to 12 athletes each, athletes up to Platinum
- **Domination**, $1,200/month: 20 open campaigns, up to 20 athletes each, all tiers including Diamond

Choose your plan and billing details in **Settings**, then pay through Stripe's secure checkout. You need an active plan before you can post a campaign.

## Changing or cancelling your plan
- **Switch plans:** in Settings, pick a new tier and choose **Pay and Activate Tier**. Stripe charges or credits the difference right away.
- **Cancel, update your card or see invoices:** choose **Manage billing or cancel plan** in Settings. Without an active plan you can't post new campaigns.

## Athlete pay
Athlete pay isn't included in your plan. For each athlete you accept, you pay their campaign pay plus HILLink's 20% platform fee and card processing. [Paying athletes](/help/payments/paying-athletes)`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "subscriptions",
    keywords: ["plan", "pricing", "price", "subscription", "billing", "starter", "growth", "scale", "domination", "cost", "cancel", "upgrade", "downgrade", "invoice", "card"],
    question_variants: ["How much does HILLink cost?", "What plan do I need?", "How do I pay for HILLink?", "How do I cancel my plan?", "How do I change my plan?"],
    related_slugs: ["paying-athletes", "how-to-create-a-campaign"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "paying-athletes",
    category: "payments",
    title: "How do athlete payments work?",
    short_answer:
      "When you accept an athlete, you fund their pay plus HILLink's 20% platform fee through Stripe. HILLink holds the money and sends the athlete's pay to them when you approve their work. If the athlete leaves or you remove them first, you're refunded.",
    body: `## Funding
After you accept an athlete, choose **Fund payment**. The button shows the exact total before you pay. It covers:
- the athlete's pay (the athlete receives all of it)
- HILLink's platform fee: 20% of the athlete's pay
- card processing

For example, for a $100 athlete, you pay $100 plus a $20 fee, plus card processing. This is separate from your monthly plan.

## Paying out
When you approve the athlete's proof, their pay is sent to them automatically. If their payout account isn't ready yet, use **Pay athlete** later.

## Refunds
- If you remove an accepted athlete, or the athlete drops the campaign before approval, the money you funded is refunded.
- Money that has already been paid out to an athlete is not refunded.

## In-kind campaigns
If a campaign pays $0 (for example, a free meal), there's nothing to fund.`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "campaign_payments",
    keywords: ["pay athletes", "fund", "funding", "payment", "refund", "held", "stripe", "checkout", "fee", "platform fee", "20%", "commission"],
    question_variants: ["When do I pay athletes?", "Do I get a refund if an athlete doesn't post?", "What is Fund payment?", "How much is HILLink's fee?"],
    related_slugs: ["how-to-review-proof", "removing-an-athlete"],
    featured: true,
    escalation_required: true,
    sort_order: 0,
  },
  {
    slug: "cancelling-a-campaign",
    category: "campaign-problems",
    title: "Can I cancel a campaign?",
    short_answer:
      "Yes, as long as no athlete's work on it has been approved yet. Choose Cancel Campaign on your dashboard. Any athlete pay you funded is refunded and the athletes are notified.",
    body: `- Cancelling removes the campaign and everyone who applied or joined it.
- Athletes who applied, were accepted or had sent proof get a notification.
- Money you funded for athletes is refunded to you through Stripe.
- Once any athlete's work on the campaign has been approved, it can't be cancelled.

To stop working with just one athlete, [remove them](/help/campaign-problems/removing-an-athlete) instead.`,
    audience: "business",
    status: "live",
    verified_at: "2026-09-28",
    feature: "cancel_campaign",
    keywords: ["cancel", "delete campaign", "stop campaign", "end campaign", "remove campaign", "refund"],
    question_variants: ["How do I cancel a campaign?", "How do I delete a campaign?", "Can I stop my campaign?"],
    related_slugs: ["removing-an-athlete", "paying-athletes"],
    sort_order: 1,
  },
  {
    slug: "removing-an-athlete",
    category: "campaign-problems",
    title: "Can I remove an athlete from my campaign?",
    short_answer:
      "Yes, any time before you approve their work. Choose Remove Athlete (or Remove Applicant) on the campaign. If you funded their pay, it's refunded.",
    body: `- Removing an applicant declines them.
- Removing an accepted athlete takes them off the campaign and refunds their funded pay.
- You can't remove an athlete whose work you've already approved.

If an athlete didn't follow the campaign or you think something is wrong, [contact HILLink](/help/disputes/disputes-and-problems).`,
    audience: "business",
    status: "live",
    feature: "remove_athlete",
    keywords: ["remove", "kick", "athlete didn't post", "no show", "refund", "replace athlete"],
    question_variants: ["An athlete didn't post, what do I do?", "How do I remove an athlete?"],
    related_slugs: ["paying-athletes", "disputes-and-problems"],
    sort_order: 0,
  },
  {
    slug: "customer-codes-for-businesses",
    category: "customer-codes",
    title: "How do customer codes work for businesses?",
    short_answer:
      "Each athlete in your campaign can share their own customer code. When a customer shows one, you or your staff log it, and it counts in your monthly results.",
    steps: [
      "Open Results & customer codes from your dashboard.",
      "Type the code a customer shows you and log it.",
      "Or create a staff link so counter staff can log codes on their phones without a HILLink login.",
    ],
    body: `- Codes look like **JAKE-7K2Q** and only work at your business.
- The same code logged twice within 60 seconds counts once.
- A code stops working if the athlete leaves the campaign.
- Making a new staff link turns the old one off.
- Add a **customer offer** when you create a campaign (for example, 10% off) so customers have a reason to use the code.`,
    audience: "business",
    status: "live",
    feature: "customer_codes",
    keywords: ["customer code", "promo code", "redeem", "staff link", "log code", "redemption", "track customers"],
    question_variants: ["How do I track customers from athletes?", "How do my staff log codes?"],
    related_slugs: ["monthly-results-report"],
    featured: true,
    sort_order: 0,
  },
  {
    slug: "monthly-results-report",
    category: "results",
    title: "How do I see my results?",
    short_answer:
      "Open Results & customer codes on your dashboard. For each month you'll see customers from athletes, cost per customer, approved posts, order totals and Instagram reach.",
    body: `The report includes:
- customers brought in by athletes
- cost per customer (athlete pay plus your plan price)
- posts approved
- order totals your staff entered
- Instagram reach, where the athlete's account is connected
- a breakdown by campaign and your top athletes

Pick a month at the top. Use **Print / save PDF** to keep a copy.`,
    audience: "business",
    status: "live",
    feature: "results_report",
    keywords: ["results", "roi", "report", "customers", "cost per customer", "analytics", "reach", "pdf"],
    question_variants: ["Is HILLink working for my business?", "How do I measure ROI?"],
    related_slugs: ["customer-codes-for-businesses"],
    sort_order: 0,
  },
  {
    slug: "restricted-business-categories",
    category: "business-account",
    title: "Which businesses can't use HILLink?",
    short_answer:
      "Businesses in categories that NIL rules bar athletes from promoting can't post campaigns: alcohol, tobacco and vape, cannabis and CBD, betting, adult entertainment, firearms, and supplements.",
    body: `You pick your business category when you set up your profile. Restricted categories can't be saved.

Some schools also have exclusive sponsors in certain categories. Athletes from those schools can't join campaigns from businesses in those categories, so a few athletes may not be able to join your campaign.`,
    audience: "business",
    status: "live",
    feature: "compliance",
    keywords: ["restricted", "category", "alcohol", "vape", "cbd", "betting", "supplements", "not allowed", "banned"],
    question_variants: ["Why can't I pick my business category?", "Can a bar use HILLink?"],
    sort_order: 0,
  },

  // ---------------------------------------------------------------- Admin only
  {
    slug: "managing-help-articles",
    category: "internal",
    title: "Managing Help Center articles",
    short_answer:
      "Edit articles at /admin/help. Customers only see live articles written for their account type; everything else stays admin-only.",
    body: `## Who sees what
- Athletes: live articles for Athletes or Both.
- Businesses: live articles for Businesses or Both.
- Admins: everything, including drafts, planned features and Admins only notes.

The database enforces this from the reader's own account, so the future support agent can only ever retrieve what that user may read.

## Publishing checklist
- Describe only what the app does today. Planned features stay in planned status.
- Never put internal strategy, pricing experiments, margins, business plans or roadmap in customer articles.
- Use the preview links at the top of the Help Center to check what athletes and businesses see.
- Don't change a live article's URL name: emails and notifications link to it.

## Welcome email links
- Athletes: /help/getting-started/athlete-start-here
- Businesses: /help/getting-started/business-start-here
- Either (sends each person to their own guide): /help/start-here`,
    audience: "admin",
    status: "live",
    feature: "help_center",
    keywords: ["admin", "help center", "articles", "publish", "edit", "knowledge base"],
    sort_order: 0,
  },
];
