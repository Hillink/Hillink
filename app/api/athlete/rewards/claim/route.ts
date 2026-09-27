import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { claimReward, syncAthleteRewards } from "@/lib/rewards/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Spend this season's points on a reward. Hillink then ships it (status "requested" until sent).
export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  const itemId = String(body.itemId || "").trim();
  if (!UUID.test(itemId)) return NextResponse.json({ error: "Pick a reward." }, { status: 400 });

  const admin = createAdminClient();
  try {
    // Make sure everything earned so far is counted before checking the balance.
    await syncAthleteRewards(admin, access.userId);
  } catch (error) {
    console.error("rewards sync before claim failed", error);
    return NextResponse.json({ error: "Couldn't load your points." }, { status: 500 });
  }
  const result = await claimReward(admin, access.userId, itemId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ claimId: result.claimId, points: result.balance });
}
