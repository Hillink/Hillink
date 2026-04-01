import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, getStripe, getTierConfig, type BillingTier } from "@/lib/stripe/config";
import { isValidStripePriceId, isValidStripeSecretKey } from "@/lib/env/validation";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }

  const userId = access.userId;
  const supabase = access.supabase;
  const adminClient = createAdminClient();
  const userEmail = access.authUser.email || undefined;

  const body = await req.json();
  const tier = body?.tier as BillingTier | undefined;
  if (!tier || !["starter", "growth", "scale", "domination"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const tierConfig = getTierConfig(tier);
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const hasValidSecret = isValidStripeSecretKey(stripeSecretKey);
  const hasValidPrice = isValidStripePriceId(tierConfig.envPriceId);
  const fallbackFlag = (process.env.STRIPE_DEV_FALLBACK || "").trim().toLowerCase();
  const fallbackEnabledByFlag =
    fallbackFlag === "" || fallbackFlag === "true" || fallbackFlag === "1" || fallbackFlag === "yes";
  const allowDevFallback =
    fallbackEnabledByFlag ||
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "preview";

  console.log("[stripe/create-subscription-checkout] request", {
    userId,
    tier,
    nodeEnv: process.env.NODE_ENV,
    hasValidSecret,
    hasValidPrice,
    allowDevFallback,
  });

  if (!hasValidSecret || !hasValidPrice) {
     if (allowDevFallback) {
      console.log("[stripe/create-subscription-checkout] using dev fallback", {
        userId,
        tier,
        hasValidSecret,
        hasValidPrice,
      });

      const { error: billingError } = await supabase
        .from("business_billing_profiles")
        .upsert(
          {
            business_id: userId,
            subscription_tier: tier,
            subscription_status: "active",
            monthly_price_cents: tierConfig.monthlyPriceCents,
            max_slots_per_campaign: tierConfig.maxSlotsPerCampaign,
            max_open_campaigns: tierConfig.maxOpenCampaigns,
            max_athlete_tier: tierConfig.maxAthleteTier,
            billing_ready: true,
            billing_name: "Dev Mode Billing",
            billing_email: userEmail || "dev-billing@local",
            billing_address_line1: "Local Development",
            billing_city: "Local",
            billing_state: "NA",
            billing_postal_code: "00000",
            billing_country: "US",
          },
          { onConflict: "business_id" }
        );

      if (billingError) {
        return NextResponse.json({ error: billingError.message }, { status: 500 });
      }

      return NextResponse.json({ manualActivated: true });
    }

    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_* values in Vercel for production billing, or enable STRIPE_DEV_FALLBACK=true to bypass Stripe in local/preview testing.",
        diagnostics: {
          hasValidSecret,
          hasValidPrice,
          tier,
          allowDevFallback,
        },
      },
      { status: 503 }
    );
  }

  if (!hasValidPrice || !tierConfig.envPriceId) {
    return NextResponse.json({ error: `Missing Stripe price id for tier ${tier}` }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    const { data: billingProfile } = await supabase
      .from("business_billing_profiles")
      .select("subscription_tier, stripe_subscription_id, stripe_customer_id")
      .eq("business_id", userId)
      .maybeSingle();

    const resolveExistingSubscription = async () => {
      let customerId = billingProfile?.stripe_customer_id || null;

      if (!customerId && userEmail) {
        const customers = await stripe.customers.list({ email: userEmail, limit: 10 });
        const exact = customers.data.find(
          (c) => (c.email || "").toLowerCase() === userEmail.toLowerCase()
        );
        customerId = exact?.id || customers.data[0]?.id || null;
      }

      if (!customerId) {
        return null;
      }

      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      const existing = subs.data.find((s) =>
        ["active", "trialing", "past_due", "unpaid"].includes(s.status)
      );

      if (!existing) {
        return { customerId, subscriptionId: null as string | null };
      }

      await supabase
        .from("business_billing_profiles")
        .upsert(
          {
            business_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: existing.id,
            stripe_subscription_status: existing.status,
          },
          { onConflict: "business_id" }
        );

      return { customerId, subscriptionId: existing.id };
    };

    const resolved = await resolveExistingSubscription();
    const activeSubscriptionId = billingProfile?.stripe_subscription_id || resolved?.subscriptionId || null;
    const activeCustomerId = billingProfile?.stripe_customer_id || resolved?.customerId || null;
    const currentTier = billingProfile?.subscription_tier || null;

    console.log("[stripe/create-subscription-checkout] billing profile", {
      userId,
      currentTier: billingProfile?.subscription_tier || null,
      hasStripeSubscriptionId: !!activeSubscriptionId,
      hasStripeCustomerId: !!activeCustomerId,
      requestedTier: tier,
    });

    if (activeSubscriptionId) {
      if (currentTier === tier) {
        console.log("[stripe/create-subscription-checkout] tier already active", {
          userId,
          tier,
        });
        return NextResponse.json({ alreadyActive: true });
      }

      const existingSubscription = await stripe.subscriptions.retrieve(activeSubscriptionId, {
        expand: ["items.data.price"],
      });

      const currentItem = existingSubscription.items.data[0];
      if (!currentItem) {
        return NextResponse.json({ error: "Existing Stripe subscription has no billable item" }, { status: 409 });
      }

      if (currentItem.price.id === tierConfig.envPriceId) {
        console.log("[stripe/create-subscription-checkout] subscription already on requested price", {
          userId,
          tier,
          stripeSubscriptionId: activeSubscriptionId,
        });
        return NextResponse.json({ alreadyActive: true });
      }

      console.log("[stripe/create-subscription-checkout] updating existing subscription", {
        userId,
        stripeSubscriptionId: activeSubscriptionId,
        fromTier: currentTier,
        toTier: tier,
      });

      const updatedSubscription = await stripe.subscriptions.update(activeSubscriptionId, {
        items: [{ id: currentItem.id, price: tierConfig.envPriceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        metadata: {
          user_id: userId,
          billing_tier: tier,
        },
        expand: ["items.data.price"],
      });

      const { error: billingError } = await supabase
        .from("business_billing_profiles")
        .update({
          subscription_tier: tier,
          monthly_price_cents: tierConfig.monthlyPriceCents,
          max_slots_per_campaign: tierConfig.maxSlotsPerCampaign,
          max_open_campaigns: tierConfig.maxOpenCampaigns,
          max_athlete_tier: tierConfig.maxAthleteTier,
          stripe_subscription_status: updatedSubscription.status,
          subscription_status:
            updatedSubscription.status === "active" || updatedSubscription.status === "trialing"
              ? "active"
              : "past_due",
          billing_ready: updatedSubscription.status === "active" || updatedSubscription.status === "trialing",
        })
        .eq("business_id", userId);

      if (billingError) {
        return NextResponse.json({ error: billingError.message }, { status: 500 });
      }

      const { error: financeError } = await adminClient.from("finance_events").insert({
        source: "stripe_api",
        event_type: "subscription.updated",
        business_id: userId,
        amount_cents: tierConfig.monthlyPriceCents,
        currency: "usd",
        status: updatedSubscription.status,
        details_json: {
          stripe_customer_id: activeCustomerId,
          stripe_subscription_id: updatedSubscription.id,
          previous_tier: currentTier,
          new_tier: tier,
          proration_behavior: "always_invoice",
        },
      });

      if (financeError) {
        console.error("finance_events insert failed", financeError.message);
      }

      console.log("[stripe/create-subscription-checkout] subscription updated", {
        userId,
        stripeSubscriptionId: updatedSubscription.id,
        status: updatedSubscription.status,
        tier,
      });

      return NextResponse.json({ updated: true, tier, status: updatedSubscription.status });
    }

    // Hard guard: do not create a brand-new checkout if Stripe already has an active-like
    // subscription for this customer. This prevents duplicate subscriptions/double charges.
    if (activeCustomerId) {
      const existingForCustomer = await stripe.subscriptions.list({
        customer: activeCustomerId,
        status: "all",
        limit: 20,
      });

      const activeLike = existingForCustomer.data.find((s) =>
        ["active", "trialing", "past_due", "unpaid"].includes(s.status)
      );

      if (activeLike) {
        console.warn("[stripe/create-subscription-checkout] prevented duplicate checkout", {
          userId,
          customerId: activeCustomerId,
          existingSubscriptionId: activeLike.id,
          existingStatus: activeLike.status,
          requestedTier: tier,
        });

        return NextResponse.json(
          {
            error:
              "An existing subscription already exists for this customer. Upgrade updates must be applied to the existing subscription, not via a new checkout session.",
            code: "existing_subscription_detected",
            stripeSubscriptionId: activeLike.id,
            stripeSubscriptionStatus: activeLike.status,
          },
          { status: 409 }
        );
      }
    }

    const appUrl = getAppUrl();

    console.log("[stripe/create-subscription-checkout] creating checkout session", {
      userId,
      tier,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: tierConfig.envPriceId, quantity: 1 }],
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=cancelled`,
      ...(activeCustomerId ? { customer: activeCustomerId } : { customer_email: userEmail }),
      metadata: {
        user_id: userId,
        billing_tier: tier,
      },
      allow_promotion_codes: true,
    });

    console.log("[stripe/create-subscription-checkout] checkout session created", {
      userId,
      tier,
      sessionId: session.id,
      hasUrl: !!session.url,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create checkout session";
    console.error("[stripe/create-subscription-checkout] failed", {
      userId,
      tier,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
