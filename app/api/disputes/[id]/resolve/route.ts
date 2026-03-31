import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type ResolveDisputeBody = {
  status?: string;
  resolutionNotes?: string;
};

type DisputeRow = {
  id: string;
  application_id: string;
  status: string;
  opened_by: string;
};

type ApplicationPartyRow = {
  id: string;
  athlete_id: string;
  campaign_id: string;
};

type CampaignOwnerRow = {
  id: string;
  business_id: string;
};

const RESOLUTION_STATUSES = new Set([
  "under_review",
  "resolved_athlete",
  "resolved_business",
  "resolved_partial",
  "closed",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Dispute resolution is admin-only
  const auth = await requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const disputeId = id?.trim();
  if (!disputeId) {
    return NextResponse.json({ error: "dispute id is required" }, { status: 400 });
  }

  let body: ResolveDisputeBody;
  try {
    body = (await req.json()) as ResolveDisputeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = String(body.status || "").trim();
  const resolutionNotes = String(body.resolutionNotes || "").trim();

  if (!newStatus || !RESOLUTION_STATUSES.has(newStatus)) {
    return NextResponse.json(
      {
        error: `status must be one of: ${[...RESOLUTION_STATUSES].join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Resolution statuses require notes
  const isResolution = newStatus.startsWith("resolved_") || newStatus === "closed";
  if (isResolution && resolutionNotes.length < 10) {
    return NextResponse.json(
      { error: "resolutionNotes (min 10 chars) are required when resolving or closing a dispute" },
      { status: 422 }
    );
  }

  const adminClient = createAdminClient();

  // Fetch dispute
  const { data: dispute, error: fetchError } = await adminClient
    .from("disputes")
    .select("id, application_id, status, opened_by")
    .eq("id", disputeId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching dispute:", fetchError);
    return NextResponse.json({ error: "Failed to fetch dispute" }, { status: 500 });
  }

  if (!dispute) {
    return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  }

  const row = dispute as DisputeRow;

  // Block invalid transitions — only open/under_review can be acted on
  if (!["open", "under_review"].includes(row.status)) {
    return NextResponse.json(
      { error: `Dispute is already in terminal status '${row.status}'` },
      { status: 409 }
    );
  }

  // Block moving backwards (under_review → open is not allowed)
  if (row.status === "under_review" && newStatus === "under_review") {
    return NextResponse.json(
      { error: "Dispute is already under review" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
  };

  if (isResolution) {
    updatePayload.resolution_notes = resolutionNotes;
    updatePayload.resolved_by = auth.userId;
    updatePayload.resolved_at = now;
  } else if (newStatus === "under_review") {
    updatePayload.resolution_notes = resolutionNotes || null;
  }

  // Update dispute — triggers fire to settle payment
  const { data: updated, error: updateError } = await adminClient
    .from("disputes")
    .update(updatePayload)
    .eq("id", disputeId)
    .select("*")
    .single();

  if (updateError) {
    console.error("Error updating dispute:", updateError);
    return NextResponse.json({ error: "Failed to update dispute" }, { status: 500 });
  }

  try {
    const { data: appRow } = await adminClient
      .from("campaign_applications")
      .select("id, athlete_id, campaign_id")
      .eq("id", row.application_id)
      .maybeSingle<ApplicationPartyRow>();

    if (appRow) {
      const { data: campaignRow } = await adminClient
        .from("campaigns")
        .select("id, business_id")
        .eq("id", appRow.campaign_id)
        .maybeSingle<CampaignOwnerRow>();

      const title =
        newStatus === "resolved_athlete"
          ? "Dispute resolved for athlete"
          : newStatus === "resolved_business"
            ? "Dispute resolved for business"
            : newStatus === "resolved_partial"
              ? "Dispute partially resolved"
              : newStatus === "closed"
                ? "Dispute closed"
                : "Dispute status updated";

      const body =
        newStatus === "under_review"
          ? "A dispute is now under review by an admin."
          : `A dispute was updated to ${newStatus.replace("_", " ")}.`;

      await notifyUser({
        userId: appRow.athlete_id,
        type: "dispute_resolved",
        title,
        body,
        ctaLabel: "View deliverables",
        ctaUrl: "/athlete/deliverables",
        metadata: { disputeId: row.id, applicationId: row.application_id, status: newStatus },
      });

      if (campaignRow?.business_id) {
        await notifyUser({
          userId: campaignRow.business_id,
          type: "dispute_resolved",
          title,
          body,
          ctaLabel: "Review campaign",
          ctaUrl: `/business/campaigns/${appRow.campaign_id}`,
          metadata: { disputeId: row.id, applicationId: row.application_id, status: newStatus },
        });
      }
    }
  } catch {
    // Never fail dispute resolution due to notification errors
  }

  return NextResponse.json({ dispute: updated }, { status: 200 });
}
