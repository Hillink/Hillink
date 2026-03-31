import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = await req.json();
  const { applicationId } = body as { applicationId?: string };

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

  if (appRow.status !== "approved") {
    return NextResponse.json({ error: "Payout only allowed for approved applications" }, { status: 400 });
  }

  const { data: campaign } = await adminClient
    .from("campaigns")
    .select("id, title, business_id, payout_cents")
    .eq("id", appRow.campaign_id)
    .single();

  if (!campaign || campaign.business_id !== userId) {
    return NextResponse.json({ error: "Not allowed for this campaign" }, { status: 403 });
  }

  const { data: payoutProfile } = await adminClient
    .from("athlete_payout_profiles")
    .select("stripe_account_id, payout_ready")
    .eq("athlete_id", appRow.athlete_id)
    .single();

  if (!payoutProfile?.stripe_account_id || !payoutProfile.payout_ready) {
    return NextResponse.json({ error: "Athlete payout account is not ready" }, { status: 400 });
  }

  try {
    const stripe = getStripe();

    // NOTE: This is a scaffold for destination charges/transfers.
    // In production, you should charge the platform customer and transfer net funds.
    const transfer = await stripe.transfers.create({
      amount: campaign.payout_cents,
      currency: "usd",
      destination: payoutProfile.stripe_account_id,
      metadata: {
        campaign_application_id: appRow.id,
      },
    });

    await adminClient.from("finance_events").insert({
      source: "payout_trigger",
      event_type: "stripe.transfer.created",
      business_id: userId,
      athlete_id: appRow.athlete_id,
      campaign_id: appRow.campaign_id,
      application_id: appRow.id,
      transfer_id: transfer.id,
      amount_cents: campaign.payout_cents,
      currency: "usd",
      status: "succeeded",
      details_json: {
        destination_account: payoutProfile.stripe_account_id,
      },
    });

    const { data: athleteAuthData } = await adminClient.auth.admin.getUserById(appRow.athlete_id);
    const amountUsd = (campaign.payout_cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    await notifyUser({
      userId: appRow.athlete_id,
      email: athleteAuthData.user?.email ? { to: athleteAuthData.user.email } : undefined,
      type: "payout_sent",
      title: "Payout sent",
      body: `Your payout for \"${campaign.title || "Campaign"}\" has been processed for ${amountUsd}.`,
      metadata: {
        campaignTitle: campaign.title || "Campaign",
        amount: amountUsd,
        paymentMethod: "Stripe",
        transferId: transfer.id,
        campaignId: appRow.campaign_id,
        applicationId: appRow.id,
        amountCents: campaign.payout_cents,
      },
    });

    return NextResponse.json({ success: true, transferId: transfer.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payout transfer failed";

    await adminClient.from("finance_events").insert({
      source: "payout_trigger",
      event_type: "stripe.transfer.created",
      business_id: userId,
      athlete_id: appRow.athlete_id,
      campaign_id: appRow.campaign_id,
      application_id: appRow.id,
      amount_cents: campaign.payout_cents,
      currency: "usd",
      status: "failed",
      details_json: {
        error: message,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
