import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

type ForceAcceptBody = {
  athleteId?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const { id } = await params;
  const campaignId = id?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id is required" }, { status: 400 });
  }

  let body: ForceAcceptBody;
  try {
    body = (await req.json()) as ForceAcceptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const athleteId = body.athleteId?.trim();
  if (!athleteId) {
    return NextResponse.json({ error: "athleteId is required" }, { status: 400 });
  }

  const [{ data: campaign }, { data: athleteProfile }] = await Promise.all([
    access.admin
      .from("campaigns")
      .select("id, title, open_slots")
      .eq("id", campaignId)
      .single(),
    access.admin
      .from("profiles")
      .select("id, role")
      .eq("id", athleteId)
      .single(),
  ]);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (!athleteProfile || athleteProfile.role !== "athlete") {
    return NextResponse.json({ error: "Target user must be an athlete" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await access.admin
    .from("campaign_applications")
    .insert({
      campaign_id: campaignId,
      athlete_id: athleteId,
      status: "accepted",
      accepted_at: now,
      accepted_via: "manual",
      applied_at: now,
      decided_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError) {
    const lowered = (insertError.message || "").toLowerCase();
    if (insertError.code === "23505" || lowered.includes("duplicate") || lowered.includes("unique")) {
      return NextResponse.json({ error: "Already applied" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await access.admin
    .from("campaigns")
    .update({ open_slots: Math.max(0, (campaign.open_slots ?? 0) - 1) })
    .eq("id", campaignId);

  const { error: auditError } = await access.admin.from("finance_events").insert({
    source: "system",
    event_type: "admin.force_accept_athlete",
    event_id: `${Date.now()}-${access.userId}-${campaignId}-${athleteId}`,
    campaign_id: campaignId,
    application_id: inserted.id,
    athlete_id: athleteId,
    status: "applied",
    details_json: {
      actor_admin_id: access.userId,
      override: true,
      bypassed_gates: [
        "is_verified",
        "is_flagged",
        "tier",
        "status",
        "lock_window",
        "open_slots",
        "radius",
      ],
    },
  });

  if (auditError) {
    console.error("force-accept audit insert failed", auditError.message);
  }

  return NextResponse.json({ applicationId: inserted.id }, { status: 201 });
}
