import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import type { AthleteTier } from "@/lib/xp";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const TIER_MIN_XP: Record<AthleteTier, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 5000,
  Diamond: 8000,
};

function isValidTier(value: string): value is AthleteTier {
  return value === "Bronze" || value === "Silver" || value === "Gold" || value === "Platinum" || value === "Diamond";
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: { userId?: string; targetTier?: string };
  try {
    body = (await req.json()) as { userId?: string; targetTier?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const targetTier = body.targetTier?.trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }
  if (!targetTier || !isValidTier(targetTier)) {
    return NextResponse.json({ error: "Valid targetTier is required" }, { status: 400 });
  }

  const { data: xpRows, error: xpError } = await access.admin
    .from("athlete_xp_events")
    .select("xp_delta")
    .eq("athlete_id", userId);

  if (xpError) {
    return NextResponse.json({ error: xpError.message }, { status: 500 });
  }

  const currentXp = (xpRows || []).reduce((sum, row: { xp_delta: number }) => sum + (row.xp_delta || 0), 0);
  const targetXp = TIER_MIN_XP[targetTier];
  const delta = targetXp - currentXp;

  if (delta === 0) {
    return NextResponse.json({ success: true, userId, currentXp, targetXp, xpDelta: 0, targetTier });
  }

  const { error: insertError } = await access.admin.from("athlete_xp_events").insert({
    athlete_id: userId,
    action: "weekly_activity_streak",
    xp_delta: delta,
    details_json: {
      source: "admin_tier_set",
      admin_id: access.userId,
      target_tier: targetTier,
      previous_xp: currentXp,
      target_xp: targetXp,
    },
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId, currentXp, targetXp, xpDelta: delta, targetTier });
}
