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

  // Under the campaign and application row locks: still in the status we read, and no deliverable sent
  // meanwhile. The slot comes back in the same transaction.
  const { data: closed, error: closeError } = await adminClient.rpc("close_application_keep_record", {
    p_application_id: appRow.id,
    p_expected_status: status,
    p_next_status: nextStatus,
    p_allow_after_proof: false,
  });

  if (closeError) {
    return NextResponse.json({ error: closeError.message }, { status: 500 });
  }
  const reason = (closed as { reason?: string | null } | null)?.reason ?? null;
  if (reason === "proof_submitted") {
    return NextResponse.json({ error: PROOF_IN_MESSAGE, code: "proof_submitted" }, { status: 409 });
  }
  if (reason) {
    return NextResponse.json({ error: "This athlete's status just changed. Refresh and try again." }, { status: 409 });
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
