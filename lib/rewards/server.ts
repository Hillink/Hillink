import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BADGES,
  POINTS,
  earnedBadges,
  isPro,
  levelFromXp,
  roadGrants,
  seasonFor,
  type BadgeKey,
  type LevelProgress,
  type Season,
} from "@/lib/rewards/road";

const PAGE = 1000;

async function sumSeasonXp(admin: SupabaseClient, athleteId: string, season: Season): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("athlete_xp_events")
      .select("xp_delta")
      .eq("athlete_id", athleteId)
      .gte("created_at", season.start.toISOString())
      .lt("created_at", season.end.toISOString())
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { xp_delta: number }[]) total += row.xp_delta;
    if (!data || data.length < PAGE) break;
  }
  return total;
}

async function seasonRedemptionIds(admin: SupabaseClient, athleteId: string, season: Season): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("redemptions")
      .select("id")
      .eq("athlete_id", athleteId)
      .gte("redeemed_at", season.start.toISOString())
      .lt("redeemed_at", season.end.toISOString())
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    ids.push(...((data || []) as { id: string }[]).map((r) => r.id));
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

export type RewardsState = {
  season: { key: string; label: string; endsAt: string };
  progress: LevelProgress;
  pro: boolean;
  points: number;
  badges: { key: BadgeKey; name: string; how: string; earned: boolean }[];
};

/**
 * Brings one athlete's points up to date for the current season and returns where they stand.
 * Safe to run any number of times: every grant has a unique ref, so it is only paid once.
 */
export async function syncAthleteRewards(admin: SupabaseClient, athleteId: string, now = new Date()): Promise<RewardsState> {
  const season = seasonFor(now);
  const [seasonXp, redemptionIds, scoreRes, ratingsRes, customersRes] = await Promise.all([
    sumSeasonXp(admin, athleteId, season),
    seasonRedemptionIds(admin, athleteId, season),
    admin
      .from("athlete_scores")
      .select("score, provisional, on_time_part, completed_campaigns, instagram_followers")
      .eq("athlete_id", athleteId)
      .maybeSingle(),
    admin
      .from("athlete_ratings")
      .select("rating")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(3),
    admin.from("redemptions").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId),
  ]);
  if (scoreRes.error) throw new Error(scoreRes.error.message);
  if (ratingsRes.error) throw new Error(ratingsRes.error.message);
  if (customersRes.error) throw new Error(customersRes.error.message);

  const score = scoreRes.data as
    | { score: number; provisional: boolean; on_time_part: number; completed_campaigns: number; instagram_followers: number | null }
    | null;
  const facts = {
    completedCampaigns: score?.completed_campaigns ?? 0,
    customers: customersRes.count ?? 0,
    lastRatings: ((ratingsRes.data || []) as { rating: number }[]).map((r) => r.rating),
    onTimePart: score?.on_time_part ?? null,
    score: score?.score ?? null,
    provisional: score?.provisional ?? true,
    verifiedFollowers: score?.instagram_followers != null,
  };
  const pro = isPro(facts);
  const progress = levelFromXp(seasonXp);
  const badges = earnedBadges(facts);

  const grants = [
    ...roadGrants(season.key, progress.level, pro),
    ...redemptionIds.map((id) => ({ ref: `customer:${id}`, delta: POINTS.perCustomer, reason: "Customer used your code" })),
    ...badges.map((key) => ({ ref: `badge:${key}`, delta: POINTS.badge, reason: `Badge: ${BADGES.find((b) => b.key === key)?.name ?? key}` })),
  ].map((g) => ({ ...g, athlete_id: athleteId, season: season.key }));

  for (let i = 0; i < grants.length; i += 500) {
    const { error } = await admin
      .from("athlete_points_ledger")
      .upsert(grants.slice(i, i + 500), { onConflict: "athlete_id,ref", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const points = await seasonBalance(admin, athleteId, season.key);
  return {
    season: { key: season.key, label: season.label, endsAt: season.end.toISOString() },
    progress,
    pro,
    points,
    badges: BADGES.map((b) => ({ ...b, earned: badges.includes(b.key) })),
  };
}

export async function seasonBalance(admin: SupabaseClient, athleteId: string, seasonKey: string): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("athlete_points_ledger")
      .select("delta")
      .eq("athlete_id", athleteId)
      .eq("season", seasonKey)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { delta: number }[]) total += row.delta;
    if (!data || data.length < PAGE) break;
  }
  return total;
}

const CLAIM_ERRORS: Record<string, { status: number; error: string }> = {
  reward_unavailable: { status: 409, error: "That reward isn't available yet." },
  reward_out_of_stock: { status: 409, error: "That reward is out of stock." },
  not_enough_points: { status: 409, error: "You don't have enough points for that yet." },
};

export async function claimReward(
  admin: SupabaseClient,
  athleteId: string,
  itemId: string,
  now = new Date()
): Promise<{ ok: true; claimId: string; balance: number } | { ok: false; status: number; error: string }> {
  const season = seasonFor(now);
  const { data, error } = await admin.rpc("claim_reward_item", { p_athlete_id: athleteId, p_item_id: itemId, p_season: season.key });
  if (error) {
    const reason = /HILLINK:([a-z_]+)/.exec(error.message)?.[1];
    return reason && CLAIM_ERRORS[reason] ? { ok: false, ...CLAIM_ERRORS[reason] } : { ok: false, status: 500, error: "Couldn't redeem that reward." };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { claim_id: string; balance: number };
  return { ok: true, claimId: row.claim_id, balance: row.balance };
}
