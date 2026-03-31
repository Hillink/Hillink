import Stripe from "stripe";

export type BillingTier = "starter" | "growth" | "scale" | "domination";

const BILLING_TIER_ORDER: BillingTier[] = ["starter", "growth", "scale", "domination"];

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
  });
}

export function getTierConfig(tier: BillingTier) {
  if (tier === "domination") {
    return {
      monthlyPriceCents: 120000,
      maxSlotsPerCampaign: 20,
      maxOpenCampaigns: 20,
      maxAthleteTier: "Diamond" as const,
      envPriceId: process.env.STRIPE_PRICE_DOMINATION,
    };
  }
  if (tier === "scale") {
    return {
      monthlyPriceCents: 70000,
      maxSlotsPerCampaign: 12,
      maxOpenCampaigns: 10,
      maxAthleteTier: "Platinum" as const,
      envPriceId: process.env.STRIPE_PRICE_SCALE,
    };
  }
  if (tier === "growth") {
    return {
      monthlyPriceCents: 40000,
      maxSlotsPerCampaign: 6,
      maxOpenCampaigns: 5,
      maxAthleteTier: "Gold" as const,
      envPriceId: process.env.STRIPE_PRICE_GROWTH,
    };
  }
  return {
    monthlyPriceCents: 25000,
    maxSlotsPerCampaign: 3,
    maxOpenCampaigns: 2,
    maxAthleteTier: "Silver" as const,
    envPriceId: process.env.STRIPE_PRICE_STARTER,
  };
}

export function getBillingTierFromPriceId(priceId?: string | null): BillingTier | null {
  if (!priceId) return null;

  for (const tier of BILLING_TIER_ORDER) {
    if (getTierConfig(tier).envPriceId === priceId) {
      return tier;
    }
  }

  return null;
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
