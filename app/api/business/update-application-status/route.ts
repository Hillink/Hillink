import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

const VALID_STATUSES = ["accepted", "declined", "approved", "rejected"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

type UpdateBody = {
  applicationId?: string;
  status?: string;
};

type NotificationDef = {
  title: string;
  body: (campaignTitle: string) => string;
  type:
    | "application_accepted"
    | "application_declined"
    | "proof_approved"
    | "proof_rejected";
};

const NOTIFICATION_MAP: Record<ValidStatus, NotificationDef> = {
  accepted: {
    type: "application_accepted",
    title: "Application Accepted!",
    body: (c) =>
      `Your application for "${c}" has been accepted. Upload your proof when you're ready.`,
  },
  declined: {
    type: "application_declined",
    title: "Application Update",
    body: (c) => `Your application for "${c}" was not selected this time.`,
  },
  approved: {
    type: "proof_approved",
    title: "Proof Approved!",
    body: (c) =>
      `Your proof for "${c}" has been approved. Payment is being processed.`,
  },
  rejected: {
    type: "proof_rejected",
    title: "Proof Needs Revision",
    body: (c) =>
      `Your proof submission for "${c}" was not approved. Please check the campaign requirements.`,
  },
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as UpdateBody;

  if (!body.applicationId || !body.status) {
    return NextResponse.json(
      { error: "applicationId and status are required" },
      { status: 400 }
    );
  }

  if (!VALID_STATUSES.includes(body.status as ValidStatus)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const nextStatus = body.status as ValidStatus;
  const admin = createAdminClient();

  // Load application + campaign together to verify ownership
  const { data: appRow, error: appError } = await admin
    .from("campaign_applications")
    .select("id, athlete_id, campaign_id, status")
    .eq("id", body.applicationId)
    .single();

  if (appError || !appRow) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, title, business_id, open_slots")
    .eq("id", appRow.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.business_id !== userId) {
    return NextResponse.json(
      { error: "Not authorized for this campaign" },
      { status: 403 }
    );
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = { status: nextStatus };
  if (
    nextStatus === "accepted" ||
    nextStatus === "declined" ||
    nextStatus === "approved" ||
    nextStatus === "rejected"
  ) {
    updatePayload.decided_at = new Date().toISOString();
  }
  if (nextStatus === "approved" || nextStatus === "rejected") {
    updatePayload.reviewed_at = new Date().toISOString();
  }

  const { error: updateError } = await admin
    .from("campaign_applications")
    .update(updatePayload)
    .eq("id", body.applicationId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Decrement open_slots on accept
  if (nextStatus === "accepted" && (campaign.open_slots ?? 0) > 0) {
    await admin
      .from("campaigns")
      .update({ open_slots: Math.max(0, (campaign.open_slots ?? 1) - 1) })
      .eq("id", campaign.id);
  }

  // Notify athlete
  const notif = NOTIFICATION_MAP[nextStatus];
  const { data: athleteAuthData } = await admin.auth.admin.getUserById(appRow.athlete_id);

  await notifyUser({
    userId: appRow.athlete_id,
    email: athleteAuthData.user?.email ? { to: athleteAuthData.user.email } : undefined,
    type: notif.type,
    title: notif.title,
    body: notif.body(campaign.title),
    metadata: {
      applicationId: body.applicationId,
      campaignId: campaign.id,
      campaignTitle: campaign.title,
    },
  });

  return NextResponse.json({
    success: true,
    nextStatus,
    needsPayout: nextStatus === "approved",
  });
}
