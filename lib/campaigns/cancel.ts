import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyUser } from "@/lib/notifications";
import { getStripe } from "@/lib/stripe/config";
import { refundPaymentIfFunded } from "@/lib/payments/server";
import { PROOF_IN_MESSAGE } from "@/lib/campaigns/lifecycle";

type CancelArgs = {
  campaignId: string;
  actorId: string;
  reason: string;
  /** Admins only (D4): cancel even though an athlete has sent proof. */
  allowAfterProof: boolean;
};

export type CancelOutcome = { ok: true } | { ok: false; status: number; body: { error: string; code?: string } };

/**
 * Cancels a campaign without deleting anything. The database closes its applications and cancels it
 * under one lock (cancel_campaign_keep_records), athletes are told, then held payments are refunded.
 * Safe to call again on a cancelled campaign: it skips the notifications and retries any refund still held.
 */
export async function cancelCampaignKeepingRecords(admin: SupabaseClient, args: CancelArgs): Promise<CancelOutcome> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, title, status, business_id")
    .eq("id", args.campaignId)
    .maybeSingle<{ id: string; title: string; status: string; business_id: string }>();
  if (!campaign) {
    return { ok: false, status: 404, body: { error: "Campaign not found" } };
  }
  const isRetry = campaign.status === "cancelled";

  const { data: cancelResult, error: cancelError } = await admin.rpc("cancel_campaign_keep_records", {
    p_campaign_id: args.campaignId,
    p_actor: args.actorId,
    p_reason: args.reason,
    p_allow_after_proof: args.allowAfterProof,
  });
  if (cancelError) {
    return { ok: false, status: 500, body: { error: cancelError.message } };
  }
  const outcome = (cancelResult ?? {}) as { reason?: string | null; applications?: string[] };
  if (outcome.reason === "proof_submitted") {
    return { ok: false, status: 409, body: { error: PROOF_IN_MESSAGE, code: "proof_submitted" } };
  }
  if (outcome.reason) {
    return { ok: false, status: 400, body: { error: "This campaign can't be cancelled." } };
  }
  const closedIds = outcome.applications ?? [];

  // Tell the athletes before refunding, so a refund that fails (and is retried later) doesn't lose it.
  if (!isRetry && closedIds.length > 0) {
    await notifyAthletes(admin, campaign, closedIds);
  }

  for (const applicationId of closedIds) {
    const refund = await refundPaymentIfFunded(getStripe, admin, applicationId);
    if (refund.error) {
      return {
        ok: false,
        status: 502,
        body: { error: `The campaign is cancelled, but a refund failed: ${refund.error}. Cancel it again to retry the refund.` },
      };
    }
  }

  return { ok: true };
}

async function notifyAthletes(
  admin: SupabaseClient,
  campaign: { id: string; title: string; business_id: string },
  applicationIds: string[]
) {
  try {
    const { data: rows } = await admin.from("campaign_applications").select("athlete_id").in("id", applicationIds);
    const athleteIds = Array.from(new Set((rows ?? []).map((row: { athlete_id: string }) => row.athlete_id)));

    const { data: businessProfile } = await admin
      .from("business_profiles")
      .select("business_name")
      .eq("id", campaign.business_id)
      .maybeSingle();
    const businessName = businessProfile?.business_name || "HILLink Business";

    await Promise.all(
      athleteIds.map(async (athleteId) => {
        const { data: athleteAuthData } = await admin.auth.admin.getUserById(athleteId);
        return notifyUser({
          userId: athleteId,
          email: athleteAuthData.user?.email ? { to: athleteAuthData.user.email } : undefined,
          type: "application_declined",
          title: "Campaign Cancelled",
          body: `The campaign "${campaign.title}" has been cancelled by the business.`,
          metadata: { campaignId: campaign.id, campaignTitle: campaign.title, businessName },
        });
      })
    );
  } catch (error) {
    console.error("Failed to notify athletes about a cancelled campaign", error);
  }
}
