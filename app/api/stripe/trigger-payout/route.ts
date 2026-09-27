import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getPaymentForApplication, payOutPayment } from "@/lib/payments/server";

// Pays an athlete for an approved application from the money the business already funded.
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

  if (appRow.status !== "approved" && appRow.status !== "completed") {
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

  const payment = await getPaymentForApplication(adminClient, appRow.id);
  if (!payment) {
    return NextResponse.json(
      { error: "This athlete's payment hasn't been funded yet. Fund it before paying out.", code: "payment_not_funded" },
      { status: 409 }
    );
  }

  const { data: payoutProfile } = await adminClient
    .from("athlete_payout_profiles")
    .select("stripe_account_id, payout_ready")
    .eq("athlete_id", appRow.athlete_id)
    .single();

  if (!payoutProfile?.stripe_account_id || !payoutProfile.payout_ready) {
    return NextResponse.json({ error: "Athlete payout account is not ready" }, { status: 400 });
  }

  const result = await payOutPayment(getStripe(), adminClient, payment, payoutProfile.stripe_account_id);

  if (!result.ok) {
    await adminClient.from("finance_events").insert({
      source: "payout_trigger",
      event_type: "stripe.transfer.created",
      business_id: userId,
      athlete_id: appRow.athlete_id,
      campaign_id: appRow.campaign_id,
      application_id: appRow.id,
      amount_cents: payment.amount_cents,
      currency: "usd",
      status: "failed",
      details_json: { error: result.error, payment_id: payment.id },
    });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.alreadyPaid) {
    return NextResponse.json({ success: true, transferId: result.transferId, alreadyPaid: true });
  }

  await adminClient.from("finance_events").insert({
    source: "payout_trigger",
    event_type: "stripe.transfer.created",
    business_id: userId,
    athlete_id: appRow.athlete_id,
    campaign_id: appRow.campaign_id,
    application_id: appRow.id,
    transfer_id: result.transferId,
    amount_cents: result.amountCents,
    currency: "usd",
    status: "succeeded",
    details_json: {
      destination_account: payoutProfile.stripe_account_id,
      payment_id: payment.id,
      platform_fee_cents: payment.platform_fee_cents,
      funding_source: payment.funding_source,
    },
  });

  const { data: athleteAuthData } = await adminClient.auth.admin.getUserById(appRow.athlete_id);
  const amountUsd = (result.amountCents / 100).toLocaleString("en-US", {
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
      transferId: result.transferId,
      campaignId: appRow.campaign_id,
      applicationId: appRow.id,
      amountCents: result.amountCents,
    },
  });

  return NextResponse.json({ success: true, transferId: result.transferId });
}
