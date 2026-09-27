import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHillinkScore } from "@/lib/score/hillinkScore";

type InputRow = {
  athlete_id: string;
  rating_count: number | string;
  rating_sum: number | string;
  completed: number | string;
  timed: number | string;
  on_time: number | string;
  first_try: number | string;
  tracked_campaigns: number | string;
  customers: number | string;
};

const PAGE = 1000;

/** Recomputes every athlete's Hillink Score. Scores are stored where only the server can write them. */
export async function refreshAllScores(admin: SupabaseClient): Promise<{ updated: number }> {
  let updated = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.rpc("athlete_score_inputs").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as InputRow[];
    if (!rows.length) break;

    const now = new Date().toISOString();
    const upserts = rows.map((r) => {
      const s = computeHillinkScore({
        ratingCount: Number(r.rating_count),
        ratingSum: Number(r.rating_sum),
        completed: Number(r.completed),
        timed: Number(r.timed),
        onTime: Number(r.on_time),
        firstTry: Number(r.first_try),
        trackedCampaigns: Number(r.tracked_campaigns),
        customers: Number(r.customers),
      });
      return {
        athlete_id: r.athlete_id,
        score: s.score,
        rating_part: s.parts.rating,
        on_time_part: s.parts.onTime,
        first_try_part: s.parts.firstTry,
        customers_part: s.parts.customers,
        completed_campaigns: Number(r.completed),
        provisional: s.provisional,
        updated_at: now,
      };
    });
    const { error: upsertError } = await admin.from("athlete_scores").upsert(upserts, { onConflict: "athlete_id" });
    if (upsertError) throw new Error(upsertError.message);
    updated += upserts.length;
    if (rows.length < PAGE) break;
  }
  return { updated };
}

type Fetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Pulls follower counts from Instagram for connected athletes (checked at most weekly), so businesses
 * see verified reach instead of self-reported numbers.
 */
export async function refreshInstagramFollowers(
  admin: SupabaseClient,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  limit = 100
): Promise<{ checked: number; failed: number }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: connections, error } = await admin
    .from("athlete_instagram_connections")
    .select("athlete_id, ig_user_id, access_token, token_expires_at")
    .not("ig_user_id", "is", null)
    .not("access_token", "is", null)
    .limit(limit * 3);
  if (error) throw new Error(error.message);

  const ids = (connections || []).map((c: { athlete_id: string }) => c.athlete_id);
  const { data: existing } = ids.length
    ? await admin.from("athlete_scores").select("athlete_id, followers_checked_at").in("athlete_id", ids)
    : { data: [] };
  const lastChecked = new Map((existing || []).map((e: { athlete_id: string; followers_checked_at: string | null }) => [e.athlete_id, e.followers_checked_at]));

  let checked = 0;
  let failed = 0;
  for (const c of (connections || []) as { athlete_id: string; ig_user_id: string; access_token: string; token_expires_at: string | null }[]) {
    if (checked + failed >= limit) break;
    const last = lastChecked.get(c.athlete_id);
    if (last && last > weekAgo) continue;
    if (c.token_expires_at && Date.parse(c.token_expires_at) < Date.now()) continue;
    try {
      const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(c.ig_user_id)}?fields=followers_count&access_token=${encodeURIComponent(c.access_token)}`;
      const res = await fetchImpl(url);
      const body = (await res.json()) as { followers_count?: number };
      if (!res.ok || typeof body.followers_count !== "number") {
        failed++;
        continue;
      }
      // Only touches the follower columns; the athlete's score row must already exist (refreshAllScores runs first).
      await admin
        .from("athlete_scores")
        .update({ instagram_followers: Math.max(0, Math.round(body.followers_count)), followers_checked_at: new Date().toISOString() })
        .eq("athlete_id", c.athlete_id);
      checked++;
    } catch {
      failed++;
    }
  }
  return { checked, failed };
}
