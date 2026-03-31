import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type InviteAthleteBody = {
  campaignId?: string;
  userId?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const businessUserId = access.userId;

  let body: InviteAthleteBody;
  try {
    body = (await req.json()) as InviteAthleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaignId = body.campaignId?.trim();
  const athleteUserId = body.userId?.trim();
  if (!campaignId || !athleteUserId) {
    return NextResponse.json({ error: "campaignId and userId are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, title, status, business_id, payout_cents, open_slots")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.business_id !== businessUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (campaign.status !== "open") {
    return NextResponse.json({ error: "Only open campaigns can send invites" }, { status: 400 });
  }

  const { data: athleteProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", athleteUserId)
    .single();

  if (!athleteProfile || athleteProfile.role !== "athlete") {
    return NextResponse.json({ error: "Target user is not an athlete" }, { status: 400 });
  }

  const [{ data: businessProfile }, { data: athleteAuthData }] = await Promise.all([
    admin
      .from("business_profiles")
      .select("business_name")
      .eq("id", businessUserId)
      .single(),
    admin.auth.admin.getUserById(athleteUserId),
  ]);

  const businessName = businessProfile?.business_name || "HILLink Business";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const payoutText = (campaign.payout_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  await notifyUser({
    userId: athleteUserId,
    email: athleteAuthData.user?.email ? { to: athleteAuthData.user.email } : undefined,
    type: "campaign_invited",
    title: "You've been invited to a campaign",
    body: `${businessName} invited you to \"${campaign.title}\". Claim your spot before it fills.`,
    ctaLabel: "View Campaign",
    ctaUrl: `${appUrl}/athlete`,
    metadata: {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      payoutCents: campaign.payout_cents,
      spotsRemaining: campaign.open_slots,
      businessName,
    },
  });

  return NextResponse.json({ success: true });
}
