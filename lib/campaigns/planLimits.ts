import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side copy of the plan checks that the campaigns_enforce_plan_limits trigger runs for direct
// inserts (supabase/migrations/20260929000300_security_hardening.sql). Routes that change campaigns
// with the service role bypass that trigger, so they use these instead.

export type PlanBlock = "subscription_required" | "plan_slot_limit" | "plan_campaign_limit";

export const PLAN_BLOCK_MESSAGES: Record<PlanBlock, string> = {
  subscription_required: "Activate a subscription in Settings before running campaigns.",
  plan_slot_limit: "Your plan doesn't allow that many athlete slots on one campaign.",
  plan_campaign_limit: "Your plan's limit on open campaigns is reached. Pause or finish one first.",
};

type Billing = {
  subscription_status: string | null;
  billing_ready: boolean | null;
  max_slots_per_campaign: number | null;
  max_open_campaigns: number | null;
};

async function loadBilling(admin: SupabaseClient, businessId: string): Promise<Billing | null> {
  const { data } = await admin
    .from("business_billing_profiles")
    .select("subscription_status, billing_ready, max_slots_per_campaign, max_open_campaigns")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as Billing | null) ?? null;
}

function activeSubscription(billing: Billing | null): billing is Billing {
  return !!billing && billing.subscription_status === "active" && !!billing.billing_ready;
}

/** Why a business can't have this many athletes on one campaign (accepted plus open), or null. */
export async function slotPlanBlock(admin: SupabaseClient, businessId: string, slots: number): Promise<PlanBlock | null> {
  const billing = await loadBilling(admin, businessId);
  if (!activeSubscription(billing)) return "subscription_required";
  if (slots > Number(billing.max_slots_per_campaign ?? 0)) return "plan_slot_limit";
  return null;
}

/**
 * Makes a business's campaign live if its plan allows it. The count and the status change run in one
 * database transaction (activate_campaign_within_plan), so parallel requests can't both pass.
 * Returns null on success, "stale" if the campaign's status changed meanwhile, or the plan block.
 */
export async function activateCampaignWithinPlan(
  admin: SupabaseClient,
  campaignId: string,
  fromStatus: string
): Promise<PlanBlock | "stale" | null> {
  const { data, error } = await admin.rpc("activate_campaign_within_plan", {
    p_campaign_id: campaignId,
    p_from_status: fromStatus,
  });
  if (error) throw new Error(error.message);
  return (data as PlanBlock | "stale" | null) ?? null;
}
