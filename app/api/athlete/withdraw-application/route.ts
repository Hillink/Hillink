import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getStripe } from "@/lib/stripe/config";
import { refundPaymentIfFunded } from "@/lib/payments/server";

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

  let body: WithdrawBody;
  try {
    body = (await req.json()) as WithdrawBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
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

  // Withdrawing again retries a refund that failed the first time.
  if (status === "withdrawn") {
    const retry = await refundPaymentIfFunded(getStripe, adminClient, appRow.id);
    if (retry.error) {
      return NextResponse.json({ error: `Refund failed: ${retry.error}` }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  }

  if (status !== "applied" && status !== "accepted" && status !== "submitted") {
    return NextResponse.json({ error: "Only active applications can be withdrawn" }, { status: 400 });
  }

  // Close the application first, and only if it's still in the status we checked, so a concurrent change
  // isn't overwritten and the slot and refund below happen once. It's kept as a record, marked withdrawn,
  // instead of deleted (with its payment).
  const { data: withdrawn, error: withdrawError } = await adminClient
    .from("campaign_applications")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", appRow.id)
    .eq("athlete_id", userId)
    .eq("status", status)
    .select("id");

  if (withdrawError) {
    return NextResponse.json({ error: withdrawError.message }, { status: 500 });
  }
  if (!withdrawn || withdrawn.length === 0) {
    return NextResponse.json({ error: "This application just changed. Refresh and try again." }, { status: 409 });
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

    // Then give the business its money back. If it fails, withdrawing again retries it.
    const refund = await refundPaymentIfFunded(getStripe, adminClient, appRow.id);
    if (refund.error) {
      return NextResponse.json(
        { error: `You've withdrawn, but the business's refund failed: ${refund.error}. Withdraw again to retry.` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
