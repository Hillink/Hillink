import type { SupabaseClient } from "@supabase/supabase-js";

// Plan checks for routes that change campaigns with the service role, which the
// campaigns_enforce_plan_limits trigger lets through. Each runs as one database function
// (supabase/migrations/20260929000300_security_hardening.sql) so the check and the change are atomic.

/** Application statuses that keep a campaign slot (same set as set_campaign_total_slots counts). */
export const SLOT_HOLDING_STATUSES = ["accepted", "in_progress", "submitted", "approved", "completed"] as const;

export type PlanBlock = "subscription_required" | "plan_slot_limit" | "plan_tier_limit" | "plan_campaign_limit";

export const PLAN_BLOCK_MESSAGES: Record<PlanBlock, string> = {
  subscription_required: "Activate a subscription in Settings before running campaigns.",
  plan_slot_limit: "Your plan doesn't allow that many athlete slots on one campaign.",
  plan_tier_limit: "Your plan doesn't include athletes at this campaign's tier. Lower the tier or upgrade.",
  plan_campaign_limit: "Your plan's limit on open campaigns is reached. Pause or finish one first.",
};

export type SlotChangeBlock = PlanBlock | "not_found" | "below_filled_count";

/**
 * Sets a campaign's total slots (accepted plus open) in one database transaction
 * (set_campaign_total_slots), checking the plan when checkPlan is true.
 */
export async function setCampaignTotalSlots(
  admin: SupabaseClient,
  campaignId: string,
  totalSlots: number,
  checkPlan: boolean
): Promise<{ reason: SlotChangeBlock | null; accepted: number }> {
  const { data, error } = await admin.rpc("set_campaign_total_slots", {
    p_campaign_id: campaignId,
    p_total_slots: totalSlots,
    p_check_plan: checkPlan,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { reason?: SlotChangeBlock | null; accepted?: number };
  return { reason: result.reason ?? null, accepted: Number(result.accepted ?? 0) };
}

/**
 * Makes a business's campaign live if its plan allows it. The count and the status change run in one
 * database transaction (activate_campaign_within_plan), so parallel requests can't both pass.
 * Returns null on success, "stale" if the campaign's status changed meanwhile, "no_open_slots" or
 * "no_start_date" if it isn't ready, or the plan block.
 */
export async function activateCampaignWithinPlan(
  admin: SupabaseClient,
  campaignId: string,
  fromStatus: string
): Promise<PlanBlock | "stale" | "no_open_slots" | "no_start_date" | null> {
  const { data, error } = await admin.rpc("activate_campaign_within_plan", {
    p_campaign_id: campaignId,
    p_from_status: fromStatus,
  });
  if (error) throw new Error(error.message);
  return (data as PlanBlock | "stale" | "no_open_slots" | "no_start_date" | null) ?? null;
}
