import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getStripe } from "@/lib/stripe/config";
import { refundPaymentIfFunded } from "@/lib/payments/server";
import { PROOF_IN_MESSAGE } from "@/lib/campaigns/lifecycle";

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

  const { data: appRows, error: appError } = await admin
    .from("campaign_applications")
    .select("id, athlete_id, status")
    .eq("campaign_id", campaignId);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  const applications = appRows || [];

  // Nothing is deleted: the campaign, its applications, payments, XP and finance history stay as records.
  // The database closes the applications and cancels the campaign under one lock, and refuses once any
  // athlete has sent proof (D4: from then on only a Hillink admin can cancel).
  const { data: cancelResult, error: cancelError } = await admin.rpc("cancel_campaign_keep_records", {
    p_campaign_id: campaignId,
    p_actor: userId,
    p_reason: "Cancelled by business",
    p_allow_after_proof: false,
  });
  if (cancelError) {
    return NextResponse.json({ error: cancelError.message }, { status: 500 });
  }
  const outcome = (cancelResult ?? {}) as { reason?: string | null; applications?: string[] };
  if (outcome.reason === "proof_submitted") {
    return NextResponse.json({ error: PROOF_IN_MESSAGE, code: "proof_submitted" }, { status: 409 });
  }
  if (outcome.reason) {
    return NextResponse.json({ error: "This campaign can't be cancelled." }, { status: 400 });
  }

  // Refund every funded athlete payment on the closed applications. Safe to retry: cancelling an
  // already-cancelled campaign comes back here and refunds whatever is still held.
  for (const applicationId of outcome.applications ?? []) {
    const refund = await refundPaymentIfFunded(getStripe, admin, applicationId);
    if (refund.error) {
      return NextResponse.json(
        { error: `The campaign is cancelled, but a refund failed: ${refund.error}. Try cancelling again to retry it.` },
        { status: 502 }
      );
    }
  }

  // A retry after a failed refund doesn't notify athletes again.
  if (campaign.status === "cancelled") {
    return NextResponse.json({ success: true });
  }

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

  return NextResponse.json({ success: true });
}
