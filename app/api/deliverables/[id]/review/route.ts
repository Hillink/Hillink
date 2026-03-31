import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type ReviewStatus = "approved" | "rejected" | "revision_requested";

type ReviewBody = {
  status?: ReviewStatus;
  rejectionReason?: string;
};

type SubmissionRow = {
  id: string;
  application_id: string;
  requirement_id: string;
  athlete_id: string;
  status: string;
  version: number;
};

type ApplicationRow = {
  id: string;
  campaign_id: string;
  status: string;
};

type CampaignRow = {
  id: string;
  business_id: string;
};

type RequirementRow = {
  id: string;
};

type SubmissionStatusRow = {
  requirement_id: string;
  status: string;
  version: number;
};

const VALID_STATUSES = new Set<ReviewStatus>([
  "approved",
  "rejected",
  "revision_requested",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ["business", "admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const submissionId = id?.trim();
  if (!submissionId) {
    return NextResponse.json({ error: "submission id is required" }, { status: 400 });
  }

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const status = body.status;
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const rejectionReason = String(body.rejectionReason || "").trim();
  if (status === "rejected" && !rejectionReason) {
    return NextResponse.json(
      { error: "rejectionReason is required when status is rejected" },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  const { data: submission, error: submissionError } = await admin
    .from("deliverable_submissions")
    .select("id, application_id, requirement_id, athlete_id, status, version")
    .eq("id", submissionId)
    .single<SubmissionRow>();

  if (submissionError || !submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const { data: application, error: appError } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, status")
    .eq("id", submission.application_id)
    .single<ApplicationRow>();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, business_id")
    .eq("id", application.campaign_id)
    .single<CampaignRow>();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (auth.role === "business" && campaign.business_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updatedSubmission, error: updateError } = await admin
    .from("deliverable_submissions")
    .update({
      status,
      rejection_reason: status === "rejected" ? rejectionReason : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.userId,
    })
    .eq("id", submissionId)
    .select("id, application_id, requirement_id, athlete_id, submission_url, notes, status, rejection_reason, version, submitted_at, reviewed_at, reviewed_by, due_at")
    .single();

  if (updateError || !updatedSubmission) {
    return NextResponse.json({ error: updateError?.message || "Failed to update submission" }, { status: 500 });
  }

  const { data: requiredRequirements, error: requiredError } = await admin
    .from("deliverable_requirements")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("is_required", true)
    .returns<RequirementRow[]>();

  if (requiredError) {
    return NextResponse.json({ error: requiredError.message }, { status: 500 });
  }

  const requiredIds = (requiredRequirements || []).map((r) => r.id);
  let allRequiredApproved = true;

  if (requiredIds.length > 0) {
    const { data: allRequiredSubmissions, error: requiredSubmissionError } = await admin
      .from("deliverable_submissions")
      .select("requirement_id, status, version")
      .eq("application_id", application.id)
      .in("requirement_id", requiredIds)
      .order("requirement_id", { ascending: true })
      .order("version", { ascending: false })
      .returns<SubmissionStatusRow[]>();

    if (requiredSubmissionError) {
      return NextResponse.json({ error: requiredSubmissionError.message }, { status: 500 });
    }

    const latestByRequirement = new Map<string, SubmissionStatusRow>();
    for (const row of allRequiredSubmissions || []) {
      if (!latestByRequirement.has(row.requirement_id)) {
        latestByRequirement.set(row.requirement_id, row);
      }
    }

    allRequiredApproved = requiredIds.every((idKey) => {
      const latest = latestByRequirement.get(idKey);
      return !!latest && latest.status === "approved";
    });
  }

  let applicationStatus = application.status;
  if (allRequiredApproved && application.status !== "completed") {
    const { error: completeError } = await admin
      .from("campaign_applications")
      .update({ status: "completed" })
      .eq("id", application.id);

    if (completeError) {
      return NextResponse.json({ error: completeError.message }, { status: 500 });
    }

    applicationStatus = "completed";
  }

  try {
    const label =
      status === "approved"
        ? "approved"
        : status === "rejected"
          ? "rejected"
          : "needs revision";

    await notifyUser({
      userId: submission.athlete_id,
      type: "deliverable_reviewed",
      title: "Deliverable reviewed",
      body: `Your deliverable was ${label}.`,
      ctaLabel: "View deliverables",
      ctaUrl: "/athlete/deliverables",
      metadata: {
        submissionId: updatedSubmission.id,
        applicationId: application.id,
        status,
      },
    });
  } catch {
    // Never fail the review flow due to notification errors
  }

  return NextResponse.json({
    submission: updatedSubmission,
    applicationStatus,
    allRequiredApproved,
  });
}
