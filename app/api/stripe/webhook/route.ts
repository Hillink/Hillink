import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingTierFromPriceId, getStripe, getTierConfig, type BillingTier } from "@/lib/stripe/config";
import { isValidStripeWebhookSecret } from "@/lib/env/validation";
import { markPaymentFunded } from "@/lib/payments/server";
import { createNotification } from "@/lib/notifications";

// AUTH_EXEMPT: Stripe signed webhook endpoint; auth is verified by signature.

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret || !isValidStripeWebhookSecret(webhookSecret)) {
    return NextResponse.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const logFinanceEvent = async (
    payload: Record<string, unknown>
  ) => {
    const { error } = await adminClient.from("finance_events").insert(payload);
    if (error) {
      console.error("finance_events insert failed", error.message);
    }
  };

  try {
    if (
      (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
      event.data.object.mode === "payment" &&
      event.data.object.metadata?.kind === "athlete_payment"
    ) {
      const session = event.data.object;
      const result = await markPaymentFunded(getStripe(), adminClient, session);
      // The athlete couldn't post until this was paid; tell them they can start.
      if (result.applied && session.metadata?.application_id) {
        const { data: appRow } = await adminClient
          .from("campaign_applications")
          .select("athlete_id, campaign_id")
          .eq("id", session.metadata.application_id)
          .maybeSingle();
        if (appRow?.athlete_id) {
          try {
            await createNotification({
              userId: appRow.athlete_id,
              type: "application_accepted",
              title: "You're funded. Time to post!",
              body: "The business has paid for your campaign spot. You can send your proof now.",
              ctaUrl: "/athlete",
              ctaLabel: "Open campaign",
            });
          } catch (error) {
            console.error("Failed to notify athlete of funding", error);
          }
        }
      }
      await logFinanceEvent({
        source: "stripe_webhook",
        event_type: event.type,
        event_id: event.id,
        amount_cents: typeof session.amount_total === "number" ? session.amount_total : null,
        currency: session.currency || "usd",
        status: result.applied ? "applied" : "ignored",
        details_json: {
          kind: "athlete_payment",
          payment_id: session.metadata?.payment_id ?? null,
          application_id: session.metadata?.application_id ?? null,
          reason: result.reason ?? null,
        },
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.metadata?.user_id && session.metadata?.billing_tier) {
        const tier = session.metadata.billing_tier as BillingTier;
        const config = getTierConfig(tier);

        await adminClient.from("business_billing_profiles").upsert(
          {
            business_id: session.metadata.user_id,
            subscription_tier: tier,
            subscription_status: "active",
            monthly_price_cents: config.monthlyPriceCents,
            max_slots_per_campaign: config.maxSlotsPerCampaign,
            max_open_campaigns: config.maxOpenCampaigns,
            max_athlete_tier: config.maxAthleteTier,
            stripe_customer_id:
              typeof session.customer === "string" ? session.customer : session.customer?.id || null,
            stripe_subscription_id:
              typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null,
            stripe_subscription_status: "active",
            billing_ready: true,
            billing_name: "Stripe Customer",
            billing_email: session.customer_details?.email || "",
            billing_address_line1: "Stripe-managed",
            billing_city: "Stripe-managed",
            billing_state: "Stripe-managed",
            billing_postal_code: "00000",
            billing_country: "US",
          },
          { onConflict: "business_id" }
        );

        await logFinanceEvent({
          source: "stripe_webhook",
          event_type: event.type,
          event_id: event.id,
          business_id: session.metadata.user_id,
          amount_cents: typeof session.amount_total === "number" ? session.amount_total : null,
          currency: session.currency || "usd",
          status: "applied",
          details_json: {
            mode: session.mode,
            stripe_customer_id:
              typeof session.customer === "string" ? session.customer : session.customer?.id || null,
            stripe_subscription_id:
              typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null,
            tier: session.metadata.billing_tier,
          },
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = sub.status;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      const currentPriceId = sub.items?.data?.[0]?.price?.id;
      const tier = getBillingTierFromPriceId(currentPriceId);
      const tierConfig = tier ? getTierConfig(tier) : null;

      if (customerId) {
        await adminClient
          .from("business_billing_profiles")
          .update({
            ...(tierConfig
              ? {
                  subscription_tier: tier,
                  monthly_price_cents: tierConfig.monthlyPriceCents,
                  max_slots_per_campaign: tierConfig.maxSlotsPerCampaign,
                  max_open_campaigns: tierConfig.maxOpenCampaigns,
                  max_athlete_tier: tierConfig.maxAthleteTier,
                }
              : {}),
            stripe_subscription_status: status,
            subscription_status: status === "active" || status === "trialing" ? "active" : "past_due",
            billing_ready: status === "active" || status === "trialing",
          })
          .eq("stripe_customer_id", customerId);

        await logFinanceEvent({
          source: "stripe_webhook",
          event_type: event.type,
          event_id: event.id,
          status,
          amount_cents: typeof sub.items?.data?.[0]?.price?.unit_amount === "number"
            ? sub.items.data[0].price.unit_amount
            : null,
          currency: sub.currency || "usd",
          details_json: {
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            tier,
            stripe_price_id: currentPriceId,
          },
        });
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const amountPaid = typeof invoice.amount_paid === "number" ? invoice.amount_paid : null;
      const amountDue = typeof invoice.amount_due === "number" ? invoice.amount_due : null;

      if (customerId) {
        await logFinanceEvent({
          source: "stripe_webhook",
          event_type: event.type,
          event_id: event.id,
          status: event.type === "invoice.paid" ? "paid" : "payment_failed",
          amount_cents: event.type === "invoice.paid" ? amountPaid : amountDue,
          currency: invoice.currency || "usd",
          details_json: {
            stripe_customer_id: customerId,
            stripe_invoice_id: invoice.id,
            billing_reason: invoice.billing_reason,
          },
        });

        if (event.type === "invoice.payment_failed") {
          await adminClient
            .from("business_billing_profiles")
            .update({
              subscription_status: "past_due",
              billing_ready: false,
            })
            .eq("stripe_customer_id", customerId);
        }
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object;
      const accountId = account.id;
      const ready = !!account.charges_enabled && !!account.payouts_enabled;

      await adminClient
        .from("athlete_payout_profiles")
        .update({
          stripe_onboarding_complete: ready,
          payout_ready: ready,
        })
        .eq("stripe_account_id", accountId);

      await logFinanceEvent({
        source: "stripe_webhook",
        event_type: event.type,
        event_id: event.id,
        status: ready ? "ready" : "incomplete",
        details_json: {
          stripe_account_id: accountId,
          charges_enabled: !!account.charges_enabled,
          payouts_enabled: !!account.payouts_enabled,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
