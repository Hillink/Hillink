import type { SupabaseClient } from "@supabase/supabase-js";

// Once an athlete has sent proof, the business has their post. From then on only a Hillink admin can
// cancel the campaign or take the athlete off it (Kyle's decision D4, 2026-09-28).

export const PROOF_IN_MESSAGE =
  "An athlete has already sent proof for this campaign, so it can't be cancelled from here. Contact HILLink if something is wrong.";

/**
 * True when any athlete on the campaign has sent proof: an application in a proof status, or a deliverable
 * sent through the deliverables flow (which leaves the application "accepted").
 */
export async function campaignHasProof(admin: SupabaseClient, campaignId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("campaign_has_proof", { p_campaign_id: campaignId });
  if (error) throw new Error(error.message);
  return data === true;
}
