import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type SubmitBody = {
  applicationId?: string;
  requirementId?: string;
  submissionUrl?: string;
  notes?: string;
  force?: boolean;
};

type ApplicationRow = {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: string;
  accepted_at: string | null;
  decided_at: string | null;
};

type RequirementRow = {
  id: string;
  campaign_id: string;
  deadline_days_after_accept: number | null;
};

type VersionRow = {
  version: number;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["athlete", "admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const applicationId = String(body.applicationId || "").trim();
  const requirementId = String(body.requirementId || "").trim();
  const submissionUrl = String(body.submissionUrl || "").trim();
  const notes = String(body.notes || "").trim();
  const force = auth.role === "admin" && body.force === true;

  if (!applicationId || !requirementId) {
    return NextResponse.json(
      { error: "applicationId and requirementId are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: application, error: applicationError } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status, accepted_at, decided_at")
    .eq("id", applicationId)
    .single<ApplicationRow>();

  if (applicationError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (auth.role === "athlete" && application.athlete_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appStatus = normalizeStatus(application.status);
  if (appStatus !== "accepted" && appStatus !== "completed") {
    return NextResponse.json(
      { error: "Application must be accepted or completed for deliverable submission" },
      { status: 422 }
    );
  }

  const { data: requirement, error: requirementError } = await admin
    .from("deliverable_requirements")
    .select("id, campaign_id, deadline_days_after_accept")
    .eq("id", requirementId)
    .single<RequirementRow>();

  if (requirementError || !requirement) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  if (requirement.campaign_id !== application.campaign_id) {
    return NextResponse.json(
      { error: "Requirement does not belong to this application's campaign" },
      { status: 422 }
    );
  }

  const acceptedAt = application.accepted_at || application.decided_at || new Date().toISOString();
  const deadlineDays = Number(requirement.deadline_days_after_accept ?? 14);
  const dueAt = new Date(new Date(acceptedAt).getTime() + deadlineDays * 24 * 60 * 60 * 1000);

  if (!force && Date.now() > dueAt.getTime()) {
    return NextResponse.json(
      { error: "Submission is past due", reason: "past_due", dueAt: dueAt.toISOString() },
      { status: 422 }
    );
  }

  const { data: latestVersion } = await admin
    .from("deliverable_submissions")
    .select("version")
    .eq("application_id", application.id)
    .eq("requirement_id", requirement.id)
    .order("version", { ascending: false })
    .limit(1)
    .returns<VersionRow[]>();

  const nextVersion = (latestVersion && latestVersion[0]?.version ? latestVersion[0].version : 0) + 1;

  const { data: inserted, error: insertError } = await admin
    .from("deliverable_submissions")
    .insert({
      application_id: application.id,
      requirement_id: requirement.id,
      athlete_id: application.athlete_id,
      submission_url: submissionUrl || null,
      notes: notes || null,
      version: nextVersion,
    })
    .select("id, application_id, requirement_id, athlete_id, submission_url, notes, status, rejection_reason, version, submitted_at, reviewed_at, reviewed_by, due_at")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || "Failed to submit deliverable" }, { status: 500 });
  }

  // Notify the business that a deliverable was submitted — fire-and-forget
  try {
    const { data: campaignRow } = await admin
      .from("campaigns")
      .select("business_id, title")
      .eq("id", application.campaign_id)
      .single<{ business_id: string; title: string }>();

    if (campaignRow?.business_id) {
      await notifyUser({
        userId: campaignRow.business_id,
        type: "deliverable_submitted",
        title: "New deliverable submitted",
        body: `An athlete submitted a deliverable for "${campaignRow.title}". Review it now.`,
        ctaLabel: "Review deliverables",
        ctaUrl: `/business/campaigns/${application.campaign_id}/deliverables`,
        metadata: { submissionId: inserted.id, campaignId: application.campaign_id },
      });
    }
  } catch {
    // Never fail the request due to notification errors
  }

  return NextResponse.json({ submission: inserted }, { status: 201 });
}
