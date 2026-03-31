import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export type CoAthlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  profile_photo_url: string | null;
  tier: string;
};

const TIER_MIN_XP = [
  { name: "Diamond", min: 8000 },
  { name: "Platinum", min: 5000 },
  { name: "Gold", min: 2500 },
  { name: "Silver", min: 1000 },
  { name: "Bronze", min: 0 },
] as const;

function computeTier(xp: number): string {
  for (const t of TIER_MIN_XP) {
    if (xp >= t.min) return t.name;
  }
  return "Bronze";
}

// GET /api/campaigns/[id]/co-athletes
// Returns accepted/approved/submitted athletes in the same campaign so athletes can see each other.
// The caller must have an application in this campaign (any status).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const admin = createAdminClient();

  // Verify caller participates in this campaign
  const { data: myApp } = await admin
    .from("campaign_applications")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("athlete_id", userId)
    .maybeSingle();

  if (!myApp) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Fetch co-athletes (accepted / approved / submitted)
  const { data: apps } = await admin
    .from("campaign_applications")
    .select("athlete_id")
    .eq("campaign_id", campaignId)
    .in("status", ["accepted", "approved", "submitted"])
    .neq("athlete_id", userId);

  if (!apps || apps.length === 0) {
    return NextResponse.json([]);
  }

  const athleteIds = [...new Set(apps.map((a: { athlete_id: string }) => a.athlete_id))];

  // Only fetch safe public fields — no contact info, payout, or instagram
  const { data: profiles } = await admin
    .from("athlete_profiles")
    .select("id, first_name, last_name, school, sport, city, state, profile_photo_url")
    .in("id", athleteIds);

  const { data: xpRows } = await admin
    .from("athlete_xp_events")
    .select("athlete_id, xp_delta")
    .in("athlete_id", athleteIds);

  const xpMap: Record<string, number> = {};
  for (const row of xpRows || []) {
    xpMap[row.athlete_id] = (xpMap[row.athlete_id] || 0) + (row.xp_delta || 0);
  }

  const result: CoAthlete[] = (profiles || []).map((p: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    school: string | null;
    sport: string | null;
    city: string | null;
    state: string | null;
    profile_photo_url: string | null;
  }) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    school: p.school,
    sport: p.sport,
    city: p.city,
    state: p.state,
    profile_photo_url: p.profile_photo_url,
    tier: computeTier(xpMap[p.id] || 0),
  }));

  return NextResponse.json(result);
}
