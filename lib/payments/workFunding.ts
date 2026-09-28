import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notifications";
import { ensurePaymentForApplication, type PaymentRow } from "@/lib/payments/server";

// No athlete works on a campaign that isn't paid for (Kyle's decision D5, 2026-09-28). The business pays
// when it accepts an athlete; until that payment is held, the athlete can't send proof.

export const UNFUNDED_WORK_MESSAGE =
  "The business hasn't paid for this campaign spot yet. You can send proof once they do. We've let them know.";

type FundingArgs = { applicationId: string; campaignId: string; athleteId: string };

/** The application's payment (created if missing), or null when the campaign can't be found. */
export async function paymentForWork(admin: SupabaseClient, args: FundingArgs): Promise<PaymentRow | null> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("business_id, payout_cents")
    .eq("id", args.campaignId)
    .maybeSingle<{ business_id: string; payout_cents: number | null }>();
  if (!campaign) return null;
  return ensurePaymentForApplication(admin, {
    applicationId: args.applicationId,
    businessId: campaign.business_id,
    athleteId: args.athleteId,
    payoutCents: Math.max(0, Number(campaign.payout_cents || 0)),
  });
}

export function isFunded(payment: PaymentRow | null): boolean {
  return !!payment && (payment.hold_status === "held" || payment.hold_status === "released");
}

/** Tells the business an accepted athlete is waiting on their payment. Never throws. */
export async function askBusinessToFund(args: { businessId: string; campaignId: string; campaignTitle?: string | null }) {
  try {
    await createNotification({
      userId: args.businessId,
      type: "new_application",
      title: "Pay to let your athlete start",
      body: `An athlete accepted into "${args.campaignTitle || "your campaign"}" is waiting for you to fund their pay before they can post.`,
      ctaUrl: `/business/campaigns/${args.campaignId}`,
      ctaLabel: "Fund athlete",
    });
  } catch (error) {
    console.error("Failed to notify business to fund", error);
  }
}

/**
 * Null when the athlete may send proof for this application, otherwise a 409 body. Asks the business
 * to fund when it isn't.
 */
export async function unfundedWorkBlock(admin: SupabaseClient, args: FundingArgs) {
  const payment = await paymentForWork(admin, args);
  if (isFunded(payment)) return null;
  if (payment?.business_id) {
    const { data: campaign } = await admin.from("campaigns").select("title").eq("id", args.campaignId).maybeSingle();
    await askBusinessToFund({ businessId: payment.business_id, campaignId: args.campaignId, campaignTitle: campaign?.title });
  }
  return { error: UNFUNDED_WORK_MESSAGE, code: "payment_not_funded" as const };
}
