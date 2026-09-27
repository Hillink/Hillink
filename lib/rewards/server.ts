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

// A business could log fake customers for an athlete, so points from any one campaign are capped per season.
export const CUSTOMER_POINTS_CAP_PER_CAMPAIGN = 20;

// Grants that are taken back when their source goes away (lost XP, a deleted customer). Badges stay.
const REVOCABLE = ["level", "milestone", "pro", "promilestone", "customer"];

type Grant = { ref: string; delta: number; reason: string };

/** Season XP for the road: each XP challenge counts once, and XP an admin set by hand doesn't count. */
async function sumSeasonXp(admin: SupabaseClient, athleteId: string, season: Season): Promise<number> {
  let total = 0;
  const challenges = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("athlete_xp_events")
      .select("xp_delta, details_json")
      .eq("athlete_id", athleteId)
      .gte("created_at", season.start.toISOString())
      .lt("created_at", season.end.toISOString())
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { xp_delta: number; details_json: Record<string, unknown> | null }[]) {
      const d = row.details_json || {};
      if (d.source === "admin_tier_set") continue;
      if (d.source === "xp_challenge" && typeof d.challenge_id === "string") {
        if (challenges.has(d.challenge_id)) continue;
        challenges.add(d.challenge_id);
      }
      total += row.xp_delta;
    }
    if (!data || data.length < PAGE) break;
  }
  return total;
}

/** This season's customers that earn points, oldest first, at most CUSTOMER_POINTS_CAP_PER_CAMPAIGN per campaign. */
async function seasonCustomerIds(admin: SupabaseClient, athleteId: string, season: Season): Promise<string[]> {
  const ids: string[] = [];
  const perApplication = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("redemptions")
      .select("id, application_id")
      .eq("athlete_id", athleteId)
      .gte("redeemed_at", season.start.toISOString())
      .lt("redeemed_at", season.end.toISOString())
      .order("redeemed_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data || []) as { id: string; application_id: string }[]) {
      const n = perApplication.get(r.application_id) ?? 0;
      if (n >= CUSTOMER_POINTS_CAP_PER_CAMPAIGN) continue;
      perApplication.set(r.application_id, n + 1);
      ids.push(r.id);
    }
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

type LedgerRow = { base_ref: string | null; delta: number; season: string };

async function ledgerRows(admin: SupabaseClient, athleteId: string, seasonKey: string): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  // This season's rows, plus badge rows from any season (a badge is paid once, ever).
  for (const filter of [`season.eq.${seasonKey}`, "base_ref.like.badge:*"]) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("athlete_points_ledger")
        .select("id, base_ref, delta, season")
        .eq("athlete_id", athleteId)
        .or(filter)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data || []) as (LedgerRow & { id: string })[]).filter((r) => filter.startsWith("season") || r.season !== seasonKey));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

/**
 * Pro-track grants for this sync. Pro pays only for levels reached while Pro: a level the athlete is newly
 * reaching gets its Pro grant if they're Pro now, and Pro grants already paid stay as long as the level does.
 */
export function proGrants(seasonKey: string, level: number, pro: boolean, isPaid: (ref: string) => boolean): Grant[] {
  const out: Grant[] = [];
  for (const g of roadGrants(seasonKey, level, true)) {
    if (!g.ref.startsWith("pro:") && !g.ref.startsWith("promilestone:")) continue;
    const l = g.ref.split(":").pop();
    const newlyReached = !isPaid(`level:${seasonKey}:${l}`);
    if (isPaid(g.ref) || (pro && newlyReached)) out.push(g);
  }
  return out;
}

export type RewardsState = {
  season: { key: string; label: string; endsAt: string };
  progress: LevelProgress;
  pro: boolean;
  points: number;
  badges: { key: BadgeKey; name: string; how: string; earned: boolean }[];
};

/**
 * Brings one athlete's points in line with what they've earned this season and returns where they stand.
 * Pays new grants, takes back grants whose source went away, and only writes when something changed.
 */
export async function syncAthleteRewards(admin: SupabaseClient, athleteId: string, now = new Date()): Promise<RewardsState> {
  const season = seasonFor(now);
  const [seasonXp, customerIds, ledger, scoreRes, ratingsRes, customersRes] = await Promise.all([
    sumSeasonXp(admin, athleteId, season),
    seasonCustomerIds(admin, athleteId, season),
    ledgerRows(admin, athleteId, season.key),
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

  const net = new Map<string, number>();
  let points = 0;
  for (const row of ledger) {
    if (row.season === season.key) points += row.delta;
    if (row.base_ref) net.set(row.base_ref, (net.get(row.base_ref) ?? 0) + row.delta);
  }
  const isPaid = (ref: string) => (net.get(ref) ?? 0) > 0;

  const desired: Grant[] = [
    ...roadGrants(season.key, progress.level, false),
    ...proGrants(season.key, progress.level, pro, isPaid),
    ...customerIds.map((id) => ({ ref: `customer:${id}`, delta: POINTS.perCustomer, reason: "Customer used your code" })),
    ...badges.map((key) => ({ ref: `badge:${key}`, delta: POINTS.badge, reason: `Badge: ${BADGES.find((b) => b.key === key)?.name ?? key}` })),
  ];
  const wanted = new Set(desired.map((g) => g.ref));
  const changed =
    desired.some((g) => !isPaid(g.ref)) ||
    ledger.some(
      (r) => r.season === season.key && r.base_ref && REVOCABLE.includes(r.base_ref.split(":")[0]) && isPaid(r.base_ref) && !wanted.has(r.base_ref)
    );

  if (changed) {
    const { data, error } = await admin.rpc("sync_reward_points", {
      p_athlete_id: athleteId,
      p_season: season.key,
      p_desired: desired,
      p_revocable_prefixes: REVOCABLE,
    });
    if (error) throw new Error(error.message);
    points = Number(data);
  }

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
