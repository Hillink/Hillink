import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import type { AthleteTier } from "@/lib/xp";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type BillingTier = "starter" | "growth" | "scale" | "domination";

function getTierLimits(tier: BillingTier) {
  if (tier === "domination") {
    return { maxSlotsPerCampaign: 20, maxOpenCampaigns: 20, maxAthleteTier: "Diamond" as AthleteTier };
  }
  if (tier === "scale") {
    return { maxSlotsPerCampaign: 12, maxOpenCampaigns: 10, maxAthleteTier: "Platinum" as AthleteTier };
  }
  if (tier === "growth") {
    return { maxSlotsPerCampaign: 6, maxOpenCampaigns: 5, maxAthleteTier: "Gold" as AthleteTier };
  }
  return { maxSlotsPerCampaign: 3, maxOpenCampaigns: 2, maxAthleteTier: "Silver" as AthleteTier };
}

function isBillingTier(value: string): value is BillingTier {
  return value === "starter" || value === "growth" || value === "scale" || value === "domination";
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: { userId?: string; accessTier?: string | null };
  try {
    body = (await req.json()) as { userId?: string; accessTier?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const accessTierValue = body.accessTier?.trim() || null;

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }
  if (accessTierValue !== null && !isBillingTier(accessTierValue)) {
    return NextResponse.json({ error: "Invalid accessTier" }, { status: 400 });
  }

  const { data: billingProfile, error: billingError } = await access.admin
    .from("business_billing_profiles")
    .select("business_id, subscription_tier")
    .eq("business_id", userId)
    .single();

  if (billingError || !billingProfile) {
    return NextResponse.json({ error: billingError?.message || "Business billing profile not found" }, { status: 404 });
  }

  const paidTier = billingProfile.subscription_tier as BillingTier;
  const effectiveTier = accessTierValue ?? paidTier;
  const limits = getTierLimits(effectiveTier);

  const baseUpdate = {
    max_slots_per_campaign: limits.maxSlotsPerCampaign,
    max_open_campaigns: limits.maxOpenCampaigns,
    max_athlete_tier: limits.maxAthleteTier,
  };

  const withOverrideUpdate = {
    ...baseUpdate,
    access_tier_override: accessTierValue,
  };

  const { error: updateWithOverrideError } = await access.admin
    .from("business_billing_profiles")
    .update(withOverrideUpdate)
    .eq("business_id", userId);

  if (updateWithOverrideError) {
    const message = (updateWithOverrideError.message || "").toLowerCase();
    const missingOverrideColumn = message.includes("access_tier_override") && message.includes("column");

    if (!missingOverrideColumn) {
      return NextResponse.json({ error: updateWithOverrideError.message }, { status: 500 });
    }

    const { error: fallbackUpdateError } = await access.admin
      .from("business_billing_profiles")
      .update(baseUpdate)
      .eq("business_id", userId);

    if (fallbackUpdateError) {
      return NextResponse.json({ error: fallbackUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      paidTier,
      accessTierOverride: null,
      effectiveTier,
      warning: "Applied limits but could not persist access override. Run supabase/business-access-override.sql.",
    });
  }

  return NextResponse.json({
    success: true,
    userId,
    paidTier,
    accessTierOverride: accessTierValue,
    effectiveTier,
  });
}
