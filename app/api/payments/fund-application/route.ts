import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getStripe } from "@/lib/stripe/config";
import { createFundingCheckout, ensurePaymentForApplication } from "@/lib/payments/server";

// A business pays for an accepted athlete's payout (plus Hillink's fee) up front.
// Returns a Stripe Checkout URL, or funded: true when nothing needs to be paid.
export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }

  const body = (await req.json().catch(() => ({}))) as { applicationId?: string };
  if (!body.applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!appRow) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, title, business_id, payout_cents")
    .eq("id", appRow.campaign_id)
    .maybeSingle();
  if (!campaign || campaign.business_id !== access.userId) {
    return NextResponse.json({ error: "Not allowed for this campaign" }, { status: 403 });
  }

  if (!["accepted", "submitted", "approved"].includes(appRow.status)) {
    return NextResponse.json({ error: "Only accepted athletes can be funded." }, { status: 409 });
  }

  const payment = await ensurePaymentForApplication(admin, {
    applicationId: appRow.id,
    businessId: campaign.business_id,
    athleteId: appRow.athlete_id,
    payoutCents: Number(campaign.payout_cents || 0),
  });

  if (payment.hold_status !== "uncommitted") {
    return NextResponse.json({ funded: payment.hold_status === "held" || payment.hold_status === "released", status: payment.hold_status });
  }

  try {
    const url = await createFundingCheckout(getStripe(), admin, payment, {
      campaignTitle: campaign.title,
      businessEmail: access.authUser.email,
    });
    return NextResponse.json({ url, businessChargeCents: payment.business_charge_cents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
