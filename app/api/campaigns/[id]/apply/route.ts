import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createServerClient } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";
import { REASON_MESSAGES } from "./constants";

type AttemptAutoAcceptResult = {
  success?: boolean;
  reason?: string;
  application_id?: string;
};

type CampaignClaimRecord = {
  id: string;
  status: string;
  open_slots: number;
  claim_method: "first_come_first_serve" | "business_selects" | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ["athlete"]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: campaignId } = await params;
  const userId = authResult.userId;

  const supabase = await createServerClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, status, open_slots, claim_method")
    .eq("id", campaignId)
    .maybeSingle<CampaignClaimRecord>();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: REASON_MESSAGES.campaign_not_found, reason: "campaign_not_found" }, { status: 404 });
  }

  if (campaign.status !== "active" && campaign.status !== "open") {
    return NextResponse.json({ error: REASON_MESSAGES.campaign_not_active, reason: "campaign_not_active" }, { status: 422 });
  }

  if ((campaign.open_slots || 0) <= 0) {
    return NextResponse.json({ error: REASON_MESSAGES.no_slots, reason: "no_slots" }, { status: 422 });
  }

  const claimMethod = campaign.claim_method || "business_selects";

  if (claimMethod === "business_selects") {
    const { data: inserted, error: insertError } = await supabase
      .from("campaign_applications")
      .insert({
        campaign_id: campaignId,
        athlete_id: userId,
        status: "applied",
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "Already applied", reason: "duplicate_application" }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message || "Apply failed", reason: "internal_error" }, { status: 500 });
    }

    const { data: campaignBusiness } = await supabase
      .from("campaigns")
      .select("business_id")
      .eq("id", campaignId)
      .maybeSingle<{ business_id: string }>();

    if (campaignBusiness?.business_id) {
      try {
        await createNotification({
          userId: campaignBusiness.business_id,
          type: "new_application",
          title: "New campaign applicant",
          body: "An athlete applied to one of your campaigns.",
          ctaUrl: `/business/campaigns/${campaignId}/deliverables`,
          ctaLabel: "Review Applicant",
        });
      } catch (error) {
        console.error("Failed to create business application notification", error);
      }
    }

    return NextResponse.json({ applicationId: inserted.id, joinStatus: "applied" }, { status: 201 });
  }

  const result = await supabase.rpc("attempt_auto_accept", {
    p_campaign_id: campaignId,
    p_athlete_id: userId,
  });

  if (result.error) {
    return NextResponse.json(
      { error: "Internal error", reason: "internal_error" },
      { status: 500 }
    );
  }

  const data = (result.data ?? {}) as AttemptAutoAcceptResult;

  if (data.success === false) {
    const reason = data.reason ?? "unknown";
    return NextResponse.json(
      {
        error: REASON_MESSAGES[reason] ?? reason,
        reason,
      },
      { status: 422 }
    );
  }

  if (data.success === true && data.application_id) {
    try {
      await createNotification({
        userId: userId,
        type: "application_accepted",
        title: "You have been accepted",
        body: "You were auto-accepted into a campaign.",
        ctaUrl: `/athlete/campaigns/${campaignId}`,
        ctaLabel: "View Campaign",
      });
    } catch (error) {
      console.error("Failed to create athlete auto-accept notification", error);
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("business_id")
      .eq("id", campaignId)
      .maybeSingle<{ business_id: string }>();

    if (campaign?.business_id) {
      try {
        await createNotification({
          userId: campaign.business_id,
          type: "new_application",
          title: "New athlete accepted",
          body: "An athlete was auto-accepted into your campaign.",
          ctaUrl: `/business/campaigns/${campaignId}`,
          ctaLabel: "View Campaign",
        });
      } catch (error) {
        console.error("Failed to create business auto-accept notification", error);
      }
    }

    return NextResponse.json({ applicationId: data.application_id, joinStatus: "accepted" }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Internal error", reason: "internal_error" },
    { status: 500 }
  );
}
