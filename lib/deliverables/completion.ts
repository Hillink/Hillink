import type { SupabaseClient } from "@supabase/supabase-js";

type SubmissionStatusRow = { requirement_id: string; status: string; version: number };

/**
 * Marks an application completed once the latest submission for every required deliverable is
 * approved. Used by the business review route and the auto-approve job.
 */
export async function completeIfAllRequiredApproved(
  admin: SupabaseClient,
  application: { id: string; campaign_id: string; status: string }
): Promise<{ ok: true; allRequiredApproved: boolean; applicationStatus: string } | { ok: false; error: string }> {
  const { data: requiredRequirements, error: requiredError } = await admin
    .from("deliverable_requirements")
    .select("id")
    .eq("campaign_id", application.campaign_id)
    .eq("is_required", true);
  if (requiredError) return { ok: false, error: requiredError.message };

  const requiredIds = (requiredRequirements || []).map((r: { id: string }) => r.id);
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
    if (requiredSubmissionError) return { ok: false, error: requiredSubmissionError.message };

    const latestByRequirement = new Map<string, SubmissionStatusRow>();
    for (const row of allRequiredSubmissions || []) {
      if (!latestByRequirement.has(row.requirement_id)) {
        latestByRequirement.set(row.requirement_id, row);
      }
    }

    allRequiredApproved = requiredIds.every((idKey: string) => {
      const latest = latestByRequirement.get(idKey);
      return !!latest && latest.status === "approved";
    });
  }

  let applicationStatus = application.status;
  if (allRequiredApproved && application.status !== "completed") {
    const { error: completeError } = await admin
      .from("campaign_applications")
      // reviewed_at records when the work was approved (reports count pay in that month).
      .update({ status: "completed", reviewed_at: new Date().toISOString() })
      .eq("id", application.id)
      // Don't overwrite a status that changed meanwhile (athlete removed or withdrew).
      .in("status", ["accepted", "submitted"]);
    if (completeError) return { ok: false, error: completeError.message };
    applicationStatus = "completed";
  }

  return { ok: true, allRequiredApproved, applicationStatus };
}
