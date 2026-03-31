import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createServerClient } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

export const REASON_MESSAGES: Record<string, string> = {
  campaign_not_found: "Campaign not found",
  campaign_not_active: "This campaign is not accepting applications",
  auto_accept_disabled: "Auto-accept is not enabled for this campaign",
  no_slots: "This campaign is full",
  auto_accept_locked: "Applications are closed within 12 hours of campaign start",
  athlete_profile_not_found: "Athlete profile not found",
  not_verified: "Your account must be verified to apply",
  flagged: "Your account is not eligible to apply",
  tier_insufficient: "You do not meet the minimum tier for this campaign",
  outside_radius: "You are outside the campaign's acceptance radius",
  already_applied: "You have already applied to this campaign",
  location_missing: "Your profile is missing location data",
  campaign_location_missing: "This campaign has no location set",
};

type AttemptAutoAcceptResult = {
  success?: boolean;
  reason?: string;
  application_id?: string;
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

    return NextResponse.json({ applicationId: data.application_id }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Internal error", reason: "internal_error" },
    { status: 500 }
  );
}
