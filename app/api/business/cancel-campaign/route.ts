import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { cancelCampaignKeepingRecords } from "@/lib/campaigns/cancel";

type CancelBody = {
  campaignId?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as CancelBody;
  const campaignId = body.campaignId?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, title, business_id, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.business_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (campaign.status !== "open" && campaign.status !== "cancelled") {
    return NextResponse.json({ error: "Only open campaigns can be cancelled" }, { status: 400 });
  }

  // Nothing is deleted: the campaign, its applications, payments, XP and finance history stay as records.
  // Refused once any athlete has sent proof (D4: from then on only a Hillink admin can cancel).
  const result = await cancelCampaignKeepingRecords(admin, {
    campaignId,
    actorId: userId,
    reason: "Cancelled by business",
    allowAfterProof: false,
  });
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
