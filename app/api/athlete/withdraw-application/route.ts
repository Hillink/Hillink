import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type WithdrawBody = {
  applicationId?: string;
};

type AthleteStatus = "applied" | "accepted" | "declined" | "withdrawn" | "submitted" | "approved" | "rejected";

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as WithdrawBody;
  const applicationId = body.applicationId?.trim();

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: appRow, error: appError } = await adminClient
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status")
    .eq("id", applicationId)
    .single();

  if (appError || !appRow) {
    return NextResponse.json({ error: appError?.message || "Application not found" }, { status: 404 });
  }

  if (appRow.athlete_id !== userId) {
    return NextResponse.json({ error: "Not allowed for this application" }, { status: 403 });
  }

  const status = appRow.status as AthleteStatus;

  if (status !== "applied" && status !== "accepted" && status !== "submitted") {
    return NextResponse.json({ error: "Only active applications can be withdrawn" }, { status: 400 });
  }

  if (status === "accepted" || status === "submitted") {
    const { data: campaign, error: campaignError } = await adminClient
      .from("campaigns")
      .select("id, open_slots, slots")
      .eq("id", appRow.campaign_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: campaignError?.message || "Campaign not found" }, { status: 404 });
    }

    const nextOpenSlots = Math.min(campaign.slots, (campaign.open_slots || 0) + 1);
    const { error: slotError } = await adminClient
      .from("campaigns")
      .update({ open_slots: nextOpenSlots })
      .eq("id", campaign.id);

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await adminClient
    .from("campaign_applications")
    .delete()
    .eq("id", appRow.id)
    .eq("athlete_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
