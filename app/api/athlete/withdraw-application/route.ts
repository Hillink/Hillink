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

  // Close the application and give its slot back in one database transaction, only if it's still in the
  // status we checked, so a concurrent change isn't overwritten and the refund below happens once. It's
  // kept as a record, marked withdrawn, instead of deleted (with its payment).
  const { data: closed, error: closeError } = await adminClient.rpc("close_application_keep_record", {
    p_application_id: appRow.id,
    p_expected_status: status,
    p_next_status: "withdrawn",
    p_allow_after_proof: true,
  });

  if (closeError) {
    return NextResponse.json({ error: closeError.message }, { status: 500 });
  }
  if ((closed as { reason?: string | null } | null)?.reason) {
    return NextResponse.json({ error: "This application just changed. Refresh and try again." }, { status: 409 });
  }

  if (status === "accepted" || status === "submitted") {
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
