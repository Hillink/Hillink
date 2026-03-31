export type AthleteTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export type XpAction =
  | "accept_campaign"
  | "complete_campaign"
  | "early_completion_bonus"
  | "upload_proof"
  | "approved_post"
  | "five_star_rating"
  | "repeat_business_bonus"
  | "complete_profile"
  | "connect_instagram"
  | "connect_tiktok"
  | "refer_athlete_signup"
  | "refer_business_signup"
  | "referred_user_first_completion"
  | "weekly_activity_streak"
  | "monthly_activity_streak";

type TierConfig = {
  tier: AthleteTier;
  minXp: number;
  maxXp: number | null;
};

const TIER_CONFIG: TierConfig[] = [
  { tier: "Bronze", minXp: 0, maxXp: 999 },
  { tier: "Silver", minXp: 1000, maxXp: 2499 },
  { tier: "Gold", minXp: 2500, maxXp: 4999 },
  { tier: "Platinum", minXp: 5000, maxXp: 7999 },
  { tier: "Diamond", minXp: 8000, maxXp: null },
];

const XP_REWARDS: Record<XpAction, number> = {
  accept_campaign: 25,
  complete_campaign: 120,
  early_completion_bonus: 30,
  upload_proof: 20,
  approved_post: 40,
  five_star_rating: 35,
  repeat_business_bonus: 50,
  complete_profile: 50,
  connect_instagram: 40,
  connect_tiktok: 25,
  refer_athlete_signup: 75,
  refer_business_signup: 100,
  referred_user_first_completion: 100,
  weekly_activity_streak: 40,
  monthly_activity_streak: 100,
};

const TIER_REWARDS: Record<AthleteTier, string[]> = {
  Bronze: [
    "access to basic local campaigns",
    "in-kind rewards allowed",
  ],
  Silver: [
    "access to cash campaigns",
    "better campaign visibility",
  ],
  Gold: [
    "higher-paying campaigns",
    "bonus campaign eligibility",
  ],
  Platinum: [
    "priority visibility",
    "premium brand invites",
    "highest campaign access",
  ],
  Diamond: [
    "priority visibility",
    "premium brand invites",
    "highest campaign access",
  ],
};

export function getTierFromXp(xp: number): AthleteTier {
  const safeXp = Math.max(0, xp || 0);

  for (const config of TIER_CONFIG) {
    if (config.maxXp === null && safeXp >= config.minXp) {
      return config.tier;
    }

    if (config.maxXp !== null && safeXp >= config.minXp && safeXp <= config.maxXp) {
      return config.tier;
    }
  }

  return "Bronze";
}

export function getNextTierGoal(xp: number): {
  currentTier: AthleteTier;
  nextTier: AthleteTier | null;
  goalXp: number | null;
  remainingXp: number;
} {
  const safeXp = Math.max(0, xp || 0);
  const currentTier = getTierFromXp(safeXp);

  if (currentTier === "Diamond") {
    return {
      currentTier,
      nextTier: null,
      goalXp: null,
      remainingXp: 0,
    };
  }

  const currentIndex = TIER_CONFIG.findIndex((entry) => entry.tier === currentTier);
  const next = TIER_CONFIG[currentIndex + 1];

  if (!next) {
    return {
      currentTier,
      nextTier: null,
      goalXp: null,
      remainingXp: 0,
    };
  }

  return {
    currentTier,
    nextTier: next.tier,
    goalXp: next.minXp,
    remainingXp: Math.max(0, next.minXp - safeXp),
  };
}

export function getXpReward(action: string): number {
  const key = action as XpAction;
  return XP_REWARDS[key] ?? 0;
}

export function getTierRewards(tier: string): string[] {
  const key = tier as AthleteTier;
  return TIER_REWARDS[key] ?? [];
}
