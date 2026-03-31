import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

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

  if (campaign.status !== "open") {
    return NextResponse.json({ error: "Only open campaigns can be cancelled" }, { status: 400 });
  }

  const { data: appRows, error: appError } = await admin
    .from("campaign_applications")
    .select("id, athlete_id, status")
    .eq("campaign_id", campaignId);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  const applications = appRows || [];
  const hasCompletedPost = applications.some((app: { status: string }) => app.status === "approved");
  if (hasCompletedPost) {
    return NextResponse.json(
      { error: "This campaign cannot be cancelled because an athlete has already completed and been approved." },
      { status: 400 }
    );
  }

  const applicationIds = applications.map((app: { id: string }) => app.id);

  const notifyAthleteIds = Array.from(
    new Set(
      applications
        .filter((app: { status: string }) => ["applied", "accepted", "submitted"].includes(app.status))
        .map((app: { athlete_id: string }) => app.athlete_id)
    )
  );

  const { data: businessProfile } = await admin
    .from("business_profiles")
    .select("business_name")
    .eq("id", userId)
    .single();
  const businessName = businessProfile?.business_name || "HILLink Business";

  await Promise.all(
    notifyAthleteIds.map(async (athleteId) => {
      const { data: athleteAuthData } = await admin.auth.admin.getUserById(athleteId);

      return notifyUser({
        userId: athleteId,
        email: athleteAuthData.user?.email ? { to: athleteAuthData.user.email } : undefined,
        type: "application_declined",
        title: "Campaign Cancelled",
        body: `The campaign \"${campaign.title}\" has been cancelled by the business.`,
        metadata: {
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          businessName,
        },
      })
    })
  );

  if (applicationIds.length > 0) {
    const { error: diagnosticsDeleteError } = await admin
      .from("instagram_post_diagnostics")
      .delete()
      .in("application_id", applicationIds);
    if (diagnosticsDeleteError) {
      return NextResponse.json({ error: diagnosticsDeleteError.message }, { status: 500 });
    }

    const { error: xpDeleteByAppError } = await admin
      .from("athlete_xp_events")
      .delete()
      .in("application_id", applicationIds);
    if (xpDeleteByAppError) {
      return NextResponse.json({ error: xpDeleteByAppError.message }, { status: 500 });
    }

    const { error: financeDeleteByAppError } = await admin
      .from("finance_events")
      .delete()
      .in("application_id", applicationIds);
    if (financeDeleteByAppError) {
      return NextResponse.json({ error: financeDeleteByAppError.message }, { status: 500 });
    }
  }

  const { error: xpDeleteByCampaignError } = await admin
    .from("athlete_xp_events")
    .delete()
    .eq("campaign_id", campaignId);
  if (xpDeleteByCampaignError) {
    return NextResponse.json({ error: xpDeleteByCampaignError.message }, { status: 500 });
  }

  const { error: financeDeleteByCampaignError } = await admin
    .from("finance_events")
    .delete()
    .eq("campaign_id", campaignId);
  if (financeDeleteByCampaignError) {
    return NextResponse.json({ error: financeDeleteByCampaignError.message }, { status: 500 });
  }

  const { error: applicationsDeleteError } = await admin
    .from("campaign_applications")
    .delete()
    .eq("campaign_id", campaignId);
  if (applicationsDeleteError) {
    return NextResponse.json({ error: applicationsDeleteError.message }, { status: 500 });
  }

  const { error: campaignDeleteError } = await admin
    .from("campaigns")
    .delete()
    .eq("id", campaignId);
  if (campaignDeleteError) {
    return NextResponse.json({ error: campaignDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
