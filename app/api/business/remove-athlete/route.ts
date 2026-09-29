import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getStripe } from "@/lib/stripe/config";
import { refundPaymentIfFunded } from "@/lib/payments/server";
import { PROOF_IN_MESSAGE } from "@/lib/campaigns/lifecycle";

type RemoveBody = {
  applicationId?: string;
};

type ManagedStatus = "applied" | "accepted" | "declined" | "withdrawn" | "submitted" | "approved" | "rejected";

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as RemoveBody;
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

  const { data: campaign, error: campaignError } = await adminClient
    .from("campaigns")
    .select("id, business_id, open_slots, slots")
    .eq("id", appRow.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message || "Campaign not found" }, { status: 404 });
  }

  if (campaign.business_id !== userId) {
    return NextResponse.json({ error: "Not allowed for this campaign" }, { status: 403 });
  }

  const status = appRow.status as ManagedStatus;

  // Removing an already-removed athlete retries a refund that failed the first time.
  if (status === "withdrawn") {
    const retry = await refundPaymentIfFunded(getStripe, adminClient, appRow.id);
    if (retry.error) {
      return NextResponse.json({ error: `Refund failed: ${retry.error}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, nextStatus: "withdrawn" });
  }

  if (status === "declined" || status === "rejected") {
    return NextResponse.json({ error: "Application is already closed" }, { status: 400 });
  }

  if (status === "approved") {
    return NextResponse.json({ error: "Approved applications cannot be removed" }, { status: 400 });
  }

  // Once the athlete has sent proof, only a Hillink admin can take them off the campaign (D4).
  if (status === "submitted" || (status as string) === "completed") {
    return NextResponse.json({ error: PROOF_IN_MESSAGE, code: "proof_submitted" }, { status: 409 });
  }

  const nextStatus: ManagedStatus = status === "applied" ? "declined" : "withdrawn";
  const nowIso = new Date().toISOString();

  const { data: updatedRows, error: updateError } = await adminClient
    .from("campaign_applications")
    .update({
      status: nextStatus,
      decided_at: nowIso,
      reviewed_at: nextStatus === "declined" ? nowIso : null,
    })
    .eq("id", appRow.id)
    .eq("status", status)
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: "This athlete's status just changed. Refresh and try again." }, { status: 409 });
  }

  if (status === "accepted") {
    const nextOpenSlots = Math.min(campaign.slots, (campaign.open_slots || 0) + 1);
    const { error: slotError } = await adminClient
      .from("campaigns")
      .update({ open_slots: nextOpenSlots })
      .eq("id", campaign.id);

    if (slotError) {
      return NextResponse.json({ error: slotError.message }, { status: 500 });
    }
  }

  // Then give the business its money back. The athlete is off the campaign first, so they can't send
  // proof after the refund. If the refund fails, removing them again retries it.
  if (status === "accepted") {
    const refund = await refundPaymentIfFunded(getStripe, adminClient, appRow.id);
    if (refund.error) {
      return NextResponse.json(
        { error: `The athlete was removed, but the refund failed: ${refund.error}. Remove them again to retry.` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ success: true, nextStatus });
}
