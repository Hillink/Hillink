import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type OpenDisputeBody = {
  applicationId?: string;
  reason?: string;
  evidenceUrls?: string[];
};

type ApplicationRow = {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: string;
};

type CampaignRow = {
  id: string;
  business_id: string;
};

const VALID_APPLICATION_STATUSES = new Set(["accepted", "completed", "in_progress"]);

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["athlete", "business", "admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: OpenDisputeBody;
  try {
    body = (await req.json()) as OpenDisputeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const applicationId = String(body.applicationId || "").trim();
  const reason = String(body.reason || "").trim();
  const evidenceUrls = Array.isArray(body.evidenceUrls)
    ? body.evidenceUrls.filter((u) => typeof u === "string" && u.trim().length > 0)
    : [];

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  if (reason.length < 10) {
    return NextResponse.json(
      { error: "reason must be at least 10 characters" },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Fetch application
  const { data: application, error: appError } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    console.error("Error fetching application:", appError);
    return NextResponse.json({ error: "Failed to fetch application" }, { status: 500 });
  }

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const app = application as ApplicationRow;

  if (!VALID_APPLICATION_STATUSES.has(app.status)) {
    return NextResponse.json(
      { error: `Cannot open dispute on application with status '${app.status}'` },
      { status: 422 }
    );
  }

  // Fetch campaign to determine business_id
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .select("id, business_id")
    .eq("id", app.campaign_id)
    .maybeSingle();

  if (campError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const camp = campaign as CampaignRow;

  // Authorization: only the athlete on this application, the business that owns it, or admin may open
  const isAthlete = auth.role === "athlete" && auth.userId === app.athlete_id;
  const isBusiness = auth.role === "business" && auth.userId === camp.business_id;
  const isAdmin = auth.role === "admin";

  if (!isAthlete && !isBusiness && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Block if payment is already released — cannot dispute after payout
  const { data: payment } = await admin
    .from("payments")
    .select("id, hold_status")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (payment && payment.hold_status === "released") {
    return NextResponse.json(
      { error: "Cannot open dispute after payout has already been released" },
      { status: 422 }
    );
  }

  // Block duplicate active disputes (unique index will catch this, but give a clear 409)
  const { data: existing } = await admin
    .from("disputes")
    .select("id, status")
    .eq("application_id", applicationId)
    .in("status", ["open", "under_review"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An active dispute already exists for this application", disputeId: existing.id },
      { status: 409 }
    );
  }

  const openedByRole = isAdmin
    ? // Admin opening on behalf: infer from application ownership
      auth.userId === app.athlete_id
      ? "athlete"
      : "business"
    : auth.role as "athlete" | "business";

  // Insert dispute — trigger fires to freeze payment
  const { data: dispute, error: insertError } = await admin
    .from("disputes")
    .insert({
      application_id: applicationId,
      opened_by: auth.userId,
      opened_by_role: openedByRole,
      reason,
      evidence_urls: evidenceUrls,
      status: "open",
      sla_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();

  if (insertError) {
    console.error("Error inserting dispute:", insertError);

    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "An active dispute already exists for this application" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to open dispute" }, { status: 500 });
  }

  try {
    const targetUserId = auth.userId === app.athlete_id ? camp.business_id : app.athlete_id;
    await notifyUser({
      userId: targetUserId,
      type: "dispute_opened",
      title: "A dispute was opened",
      body: "A dispute has been opened on one of your campaign applications.",
      ctaLabel: auth.userId === app.athlete_id ? "Review in business portal" : "View dispute status",
      ctaUrl: auth.userId === app.athlete_id
        ? `/business/campaigns/${app.campaign_id}/deliverables`
        : "/athlete/deliverables",
      metadata: {
        disputeId: (dispute as { id?: string })?.id,
        applicationId: app.id,
        campaignId: app.campaign_id,
      },
    });
  } catch {
    // Never fail dispute opening due to notification errors
  }

  return NextResponse.json({ dispute }, { status: 201 });
}
