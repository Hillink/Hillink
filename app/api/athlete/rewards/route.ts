import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { syncAthleteRewards } from "@/lib/rewards/server";

// The athlete's rewards road: season level, points (brought up to date first), badges, store and requests.
export async function GET() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) return access.response;
  const admin = createAdminClient();

  try {
    const state = await syncAthleteRewards(admin, access.userId);
    const [items, claims] = await Promise.all([
      admin.from("reward_items").select("id, name, description, points_cost, stock, active").order("sort_order").order("points_cost"),
      admin
        .from("reward_claims")
        .select("id, item_id, points_cost, status, created_at")
        .eq("athlete_id", access.userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (claims.error) throw new Error(claims.error.message);
    return NextResponse.json({ ...state, items: items.data, claims: claims.data });
  } catch (error) {
    console.error("rewards load failed", error);
    return NextResponse.json({ error: "Couldn't load your rewards." }, { status: 500 });
  }
}
