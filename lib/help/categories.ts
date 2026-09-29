// Help Center topics and the four groups the home page shows. Pure, no imports.
// A category only appears to a reader when it has at least one article they can read, so topics for
// features that aren't live stay hidden until a live article is published in them.

export type HelpReaderRole = "athlete" | "business";

export type HelpSection = {
  key: "campaigns" | "money" | "reputation" | "account";
  label: Record<HelpReaderRole, string>;
  blurb: Record<HelpReaderRole, string>;
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    key: "campaigns",
    label: { athlete: "Campaigns", business: "Campaigns" },
    blurb: {
      athlete: "Finding, joining and completing campaigns",
      business: "Posting campaigns, choosing athletes, reviewing posts",
    },
  },
  {
    key: "money",
    label: { athlete: "Getting paid", business: "Plans & payments" },
    blurb: {
      athlete: "Payouts, rewards and referrals",
      business: "Your plan, billing and paying athletes",
    },
  },
  {
    key: "reputation",
    label: { athlete: "Levels & ratings", business: "Athlete levels & ratings" },
    blurb: {
      athlete: "XP, tiers, ratings and your Hillink Score",
      business: "What tiers, ratings and the Hillink Score mean",
    },
  },
  {
    key: "account",
    label: { athlete: "Account & rules", business: "Account" },
    blurb: {
      athlete: "Eligibility, NIL rules, privacy and fixes",
      business: "Your business account, privacy and fixes",
    },
  },
];

export type HelpCategory = {
  key: string;
  /** Group on the home page. "start" is the Start Here area. */
  section: HelpSection["key"] | "start";
  label: string;
  /** Role-specific label where the same topic reads differently. */
  labels?: Partial<Record<HelpReaderRole, string>>;
  sortOrder: number;
};

// Keys are URL segments (/help/<key>/<article>). "search" and "start-here" are reserved for pages.
export const HELP_CATEGORIES: HelpCategory[] = [
  { key: "getting-started", section: "start", label: "Getting started", sortOrder: 0 },

  { key: "finding-campaigns", section: "campaigns", label: "Finding campaigns", sortOrder: 10 },
  { key: "creating-campaigns", section: "campaigns", label: "Creating campaigns", sortOrder: 10 },
  { key: "campaign-types", section: "campaigns", label: "Campaign types", sortOrder: 11 },
  { key: "choosing-athletes", section: "campaigns", label: "Choosing and receiving athletes", sortOrder: 12 },
  { key: "campaign-requirements", section: "campaigns", label: "Campaign requirements", sortOrder: 13 },
  { key: "completing-campaigns", section: "campaigns", label: "Completing campaigns", sortOrder: 14 },
  { key: "proof-approval", section: "campaigns", label: "Proof & approval", sortOrder: 15 },
  { key: "customer-codes", section: "campaigns", label: "Customer codes", sortOrder: 16 },
  { key: "results", section: "campaigns", label: "Measuring results", sortOrder: 17 },
  { key: "campaign-problems", section: "campaigns", label: "Campaign problems", sortOrder: 18 },
  { key: "disputes", section: "campaigns", label: "Disputes", sortOrder: 19 },

  { key: "plans-billing", section: "money", label: "Plans & billing", sortOrder: 20 },
  {
    key: "payments",
    section: "money",
    label: "Payments",
    labels: { athlete: "Payments & payouts", business: "Athlete payments" },
    sortOrder: 21,
  },
  { key: "rewards", section: "money", label: "Rewards", sortOrder: 22 },
  { key: "referrals", section: "money", label: "Referrals", sortOrder: 23 },

  { key: "xp-levels", section: "reputation", label: "XP & levels", labels: { business: "Athlete levels" }, sortOrder: 30 },
  { key: "ratings", section: "reputation", label: "Ratings", sortOrder: 31 },
  { key: "hillink-score", section: "reputation", label: "Hillink Score", sortOrder: 32 },

  { key: "account-eligibility", section: "account", label: "Account & eligibility", sortOrder: 40 },
  { key: "business-account", section: "account", label: "Business account", sortOrder: 40 },
  { key: "nil-compliance", section: "account", label: "NIL & school rules", sortOrder: 41 },
  { key: "safety-rules", section: "account", label: "Safety & rules", sortOrder: 42 },
  { key: "account-privacy", section: "account", label: "Account & privacy", sortOrder: 43 },
  { key: "troubleshooting", section: "account", label: "Troubleshooting", sortOrder: 44 },
  { key: "contact", section: "account", label: "Contact HILLink", sortOrder: 45 },

  // Admin-only notes about running Hillink. Never shown to athletes or businesses.
  { key: "internal", section: "account", label: "Internal (admins only)", sortOrder: 90 },
];

export const RESERVED_HELP_SEGMENTS = ["search", "start-here"];

export function categoryByKey(key: string | null | undefined): HelpCategory | null {
  return HELP_CATEGORIES.find((c) => c.key === key) ?? null;
}

export function categoryLabel(key: string, role: HelpReaderRole | "admin"): string {
  const category = categoryByKey(key);
  if (!category) return key;
  return (role !== "admin" && category.labels?.[role]) || category.label;
}

/** Stable article URL: /help/<category>/<slug>. Old links keep working if an article changes category. */
export function articlePath(article: { category: string; slug: string }): string {
  return `/help/${article.category}/${article.slug}`;
}

/** Start Here guides. These URLs are linked from welcome emails; don't rename the slugs. */
export const START_HERE_SLUGS: Record<HelpReaderRole, string> = {
  athlete: "athlete-start-here",
  business: "business-start-here",
};
