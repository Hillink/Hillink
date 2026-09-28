import type { SupabaseClient } from "@supabase/supabase-js";

// Once an athlete has sent proof, the business has their post. From then on only a Hillink admin can
// cancel the campaign or take the athlete off it (Kyle's decision D4, 2026-09-28).
export const PROOF_IN_STATUSES = ["submitted", "rejected", "approved", "completed"] as const;

export const PROOF_IN_MESSAGE =
  "An athlete has already sent proof for this campaign, so it can't be cancelled from here. Contact HILLink if something is wrong.";

/** True when any athlete on the campaign has sent proof. */
export async function campaignHasProof(admin: SupabaseClient, campaignId: string): Promise<boolean> {
  const { count, error } = await admin
    .from("campaign_applications")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", [...PROOF_IN_STATUSES]);
  if (error) throw new Error(error.message);
  return Number(count ?? 0) > 0;
}
