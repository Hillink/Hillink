import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export type LeaderboardEntry = {
  rank: number;
  athlete_id: string;
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  sport: string | null;
  total_xp: number;
  tier: string;
};

const TIER_THRESHOLDS: { tier: string; min: number }[] = [
  { tier: "Diamond", min: 5000 },
  { tier: "Platinum", min: 2500 },
  { tier: "Gold", min: 1000 },
  { tier: "Silver", min: 400 },
  { tier: "Bronze", min: 0 },
];

function tierFromXp(xp: number): string {
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (xp >= min) return tier;
  }
  return "Bronze";
}

export async function GET() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }

  const adminClient = createAdminClient();

  // Fetch all XP events (athlete_id + xp_delta only for efficiency)
  const { data: xpRows, error: xpError } = await adminClient
    .from("athlete_xp_events")
    .select("athlete_id, xp_delta");

  if (xpError) {
    return NextResponse.json({ error: xpError.message }, { status: 500 });
  }

  // Aggregate total XP per athlete in JS
  const xpByAthlete = new Map<string, number>();
  for (const row of xpRows ?? []) {
    xpByAthlete.set(row.athlete_id, (xpByAthlete.get(row.athlete_id) ?? 0) + (row.xp_delta ?? 0));
  }

  // Sort and take top 100
  const sorted = Array.from(xpByAthlete.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100);

  if (sorted.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const athleteIds = sorted.map(([id]) => id);

  const { data: profiles, error: profilesError } = await adminClient
    .from("athlete_profiles")
    .select("id, first_name, last_name, school, sport")
    .in("id", athleteIds);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const profileMap = new Map<string, { first_name: string | null; last_name: string | null; school: string | null; sport: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { first_name: p.first_name, last_name: p.last_name, school: p.school, sport: p.sport });
  }

  const leaderboard: LeaderboardEntry[] = sorted.map(([athlete_id, total_xp], index) => {
    const profile = profileMap.get(athlete_id);
    return {
      rank: index + 1,
      athlete_id,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      school: profile?.school ?? null,
      sport: profile?.sport ?? null,
      total_xp,
      tier: tierFromXp(total_xp),
    };
  });

  return NextResponse.json({ leaderboard });
}
