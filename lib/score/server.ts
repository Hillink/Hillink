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
  first_try_tracked: number | string;
  tracked_campaigns: number | string;
  customers: number | string;
};

const PAGE = 500;

/** Recomputes every athlete's Hillink Score. Scores are stored where only the server can write them. */
export async function refreshAllScores(admin: SupabaseClient): Promise<{ updated: number }> {
  let updated = 0;
  let after: string | null = null;
  for (;;) {
    const { data, error } = await admin.rpc("athlete_score_inputs", { p_after: after, p_limit: PAGE });
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
        firstTryTracked: Number(r.first_try_tracked),
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
    after = rows[rows.length - 1].athlete_id;
    if (rows.length < PAGE) break;
  }
  return { updated };
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const FETCH_TIMEOUT_MS = 5000;
const PARALLEL_CHECKS = 5;

/**
 * Pulls follower counts from Instagram for athletes connected through Instagram login (checked at most weekly,
 * least recently checked first), so businesses see verified reach instead of self-reported numbers.
 */
export async function refreshInstagramFollowers(
  admin: SupabaseClient,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  limit = 100
): Promise<{ checked: number; failed: number }> {
  const { data, error } = await admin.rpc("instagram_follower_queue", { p_limit: limit });
  if (error) throw new Error(error.message);
  const queue = (data || []) as { athlete_id: string; ig_user_id: string; access_token: string }[];

  let checked = 0;
  let failed = 0;

  const checkOne = async (c: (typeof queue)[number]) => {
    let followers: number | null = null;
    try {
      const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(c.ig_user_id)}?fields=followers_count&access_token=${encodeURIComponent(c.access_token)}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const body = (await res.json()) as { followers_count?: number };
      if (res.ok && typeof body.followers_count === "number") followers = Math.max(0, Math.round(body.followers_count));
    } catch {
      followers = null;
    }

    // Failures are stamped too, so a dead token waits a week instead of blocking everyone else every day.
    const patch: Record<string, unknown> = { followers_checked_at: new Date().toISOString() };
    if (followers !== null) patch.instagram_followers = followers;
    const { error: updateError } = await admin.from("athlete_scores").update(patch).eq("athlete_id", c.athlete_id);
    if (followers === null || updateError) failed++;
    else checked++;
  };

  for (let i = 0; i < queue.length; i += PARALLEL_CHECKS) {
    await Promise.all(queue.slice(i, i + PARALLEL_CHECKS).map(checkOne));
  }
  return { checked, failed };
}
