import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side copy of the plan checks that the campaigns_enforce_plan_limits trigger runs for direct
// inserts (supabase/migrations/20260929000300_security_hardening.sql). Routes that change campaigns
// with the service role bypass that trigger, so they call this instead.

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

/** Why a business can't set this many slots on a campaign, or null. */
export async function slotPlanBlock(admin: SupabaseClient, businessId: string, slots: number): Promise<PlanBlock | null> {
  const billing = await loadBilling(admin, businessId);
  if (!activeSubscription(billing)) return "subscription_required";
  if (slots > Number(billing.max_slots_per_campaign ?? 0)) return "plan_slot_limit";
  return null;
}

/** Why a business can't make this campaign live (active), or null. */
export async function activationPlanBlock(admin: SupabaseClient, businessId: string, campaignId: string): Promise<PlanBlock | null> {
  const billing = await loadBilling(admin, businessId);
  if (!activeSubscription(billing)) return "subscription_required";
  const { count } = await admin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .in("status", ["active", "open"])
    .neq("id", campaignId);
  if (Number(count ?? 0) >= Number(billing.max_open_campaigns ?? 0)) return "plan_campaign_limit";
  return null;
}
