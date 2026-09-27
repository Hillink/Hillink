// Rewards road: a semester-long "battle pass" built on the XP athletes already earn.
// Points reset each season; tier and Hillink Score carry over. All numbers here are starting values
// for Kyle to tune (see docs/PAYMENTS_AND_LOCAL_TESTING.md, "Rewards road").

export const MAX_LEVEL = 50;
export const MILESTONE_EVERY = 5;

export const POINTS = {
  perLevel: 10, // free track, every level
  milestone: 25, // free track, extra at every 5th level
  proPerLevel: 15, // Pro track, every level, while the athlete is Pro
  proMilestone: 50, // Pro track, extra at every 5th level
  perCustomer: 5, // performance bonus for each customer logged with the athlete's code
  badge: 20, // once per badge, ever
} as const;

// Pro track: unlocked by performance, never by paying.
export const PRO_MIN_SCORE = 90;

export type Season = { key: string; label: string; start: Date; end: Date };

/** Semester seasons: spring (Jan–May), summer (Jun–Jul), fall (Aug–Dec), in UTC. */
export function seasonFor(now: Date): Season {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const make = (name: string, startMonth: number, endMonth: number, endYear = y) => ({
    key: `${y}-${name}`,
    label: `${name[0].toUpperCase()}${name.slice(1)} ${y}`,
    start: new Date(Date.UTC(y, startMonth, 1)),
    end: new Date(Date.UTC(endYear, endMonth, 1)),
  });
  if (m <= 4) return make("spring", 0, 5);
  if (m <= 6) return make("summer", 5, 7);
  return make("fall", 7, 0, y + 1);
}

/** XP it takes to go from `level` to `level + 1`. Early levels come quickly; later ones take longer. */
export function xpForNextLevel(level: number): number {
  return 60 + 2 * (Math.max(1, level) - 1);
}

/** Total season XP needed to reach `level` (level 1 is free). */
export function xpToReach(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpForNextLevel(l);
  return total;
}

export type LevelProgress = { level: number; xpIntoLevel: number; xpForNext: number | null; seasonXp: number };

export function levelFromXp(seasonXp: number): LevelProgress {
  const xp = Number.isFinite(seasonXp) && seasonXp > 0 ? Math.floor(seasonXp) : 0;
  let level = 1;
  let used = 0;
  while (level < MAX_LEVEL && xp - used >= xpForNextLevel(level)) {
    used += xpForNextLevel(level);
    level++;
  }
  return { level, xpIntoLevel: xp - used, xpForNext: level >= MAX_LEVEL ? null : xpForNextLevel(level), seasonXp: xp };
}

export const isMilestone = (level: number) => level % MILESTONE_EVERY === 0;

// What each milestone is called on the road. Physical rewards are bought with points in the store.
export const MILESTONE_LABELS: Record<number, { free: string; pro: string }> = {
  5: { free: "Starter bonus", pro: "Pro starter bonus" },
  10: { free: "Sticker pack unlocked", pro: "Featured for a week" },
  15: { free: "Bonus points", pro: "Bonus points" },
  20: { free: "T-shirt unlocked", pro: "Partner gift card unlocked" },
  25: { free: "Halfway bonus", pro: "Halfway bonus" },
  30: { free: "Bonus points", pro: "Featured for two weeks" },
  35: { free: "Bonus points", pro: "Bonus points" },
  40: { free: "Hoodie unlocked", pro: "Partner gift card unlocked" },
  45: { free: "Bonus points", pro: "Bonus points" },
  50: { free: "Season finisher badge", pro: "Cash bonus (set by Hillink)" },
};

/** Every points grant an athlete has earned on the road this season, keyed so each is paid once. */
export function roadGrants(seasonKey: string, level: number, pro: boolean): { ref: string; delta: number; reason: string }[] {
  const grants: { ref: string; delta: number; reason: string }[] = [];
  for (let l = 2; l <= Math.min(level, MAX_LEVEL); l++) {
    grants.push({ ref: `level:${seasonKey}:${l}`, delta: POINTS.perLevel, reason: `Reached level ${l}` });
    if (isMilestone(l)) grants.push({ ref: `milestone:${seasonKey}:${l}`, delta: POINTS.milestone, reason: `Level ${l} milestone` });
    if (pro) {
      grants.push({ ref: `pro:${seasonKey}:${l}`, delta: POINTS.proPerLevel, reason: `Pro track level ${l}` });
      if (isMilestone(l)) grants.push({ ref: `promilestone:${seasonKey}:${l}`, delta: POINTS.proMilestone, reason: `Pro level ${l} milestone` });
    }
  }
  return grants;
}

export type BadgeKey =
  | "first_campaign"
  | "five_campaigns"
  | "ten_customers"
  | "five_star_streak"
  | "always_on_time"
  | "verified_reach"
  | "hillink_pro";

export const BADGES: { key: BadgeKey; name: string; how: string }[] = [
  { key: "first_campaign", name: "First Campaign", how: "Finish your first campaign" },
  { key: "five_campaigns", name: "Regular", how: "Finish 5 campaigns" },
  { key: "ten_customers", name: "10 Customers Driven", how: "Bring in 10 customers with your codes" },
  { key: "five_star_streak", name: "5-Star Streak", how: "Get 5 stars on your last 3 ratings" },
  { key: "always_on_time", name: "Always On Time", how: "On-time score of 90+ after 3 campaigns" },
  { key: "verified_reach", name: "Verified Reach", how: "Connect Instagram through Instagram login" },
  { key: "hillink_pro", name: "Hillink Pro", how: `Hillink Score of ${PRO_MIN_SCORE}+ after 3 campaigns` },
];

export type BadgeFacts = {
  completedCampaigns: number;
  customers: number;
  lastRatings: number[]; // newest first
  onTimePart: number | null;
  score: number | null;
  provisional: boolean;
  verifiedFollowers: boolean;
};

export function isPro(facts: Pick<BadgeFacts, "score" | "provisional">): boolean {
  return !facts.provisional && (facts.score ?? 0) >= PRO_MIN_SCORE;
}

export function earnedBadges(f: BadgeFacts): BadgeKey[] {
  const out: BadgeKey[] = [];
  if (f.completedCampaigns >= 1) out.push("first_campaign");
  if (f.completedCampaigns >= 5) out.push("five_campaigns");
  if (f.customers >= 10) out.push("ten_customers");
  if (f.lastRatings.length >= 3 && f.lastRatings.slice(0, 3).every((r) => r === 5)) out.push("five_star_streak");
  if (!f.provisional && (f.onTimePart ?? 0) >= 90) out.push("always_on_time");
  if (f.verifiedFollowers) out.push("verified_reach");
  if (isPro(f)) out.push("hillink_pro");
  return out;
}
