import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getAppUrl } from "@/lib/stripe/config";
import {
  creditPeriodStart,
  includedCreditCents,
  payoutIdempotencyKey,
  quoteFunding,
  readFeeSettings,
} from "@/lib/payments/fees";

export type PaymentRow = {
  id: string;
  application_id: string;
  business_id: string | null;
  athlete_id: string | null;
  hold_status: "uncommitted" | "held" | "released" | "refunded" | "disputed";
  amount_cents: number;
  platform_fee_cents: number;
  card_fee_cents: number;
  business_charge_cents: number;
  funding_source: "checkout" | "tier_credit" | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  funded_at: string | null;
  payout_claimed_at: string | null;
};

const PAYMENT_COLUMNS =
  "id, application_id, business_id, athlete_id, hold_status, amount_cents, platform_fee_cents, card_fee_cents, business_charge_cents, funding_source, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, funded_at, payout_claimed_at";

export async function getPaymentForApplication(admin: SupabaseClient, applicationId: string) {
  const { data, error } = await admin
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("application_id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PaymentRow | null) ?? null;
}

/**
 * Creates the payment row for an accepted application (once), priced from the campaign payout.
 * In "included" mode the payment is funded from the business's monthly tier credit when enough is left.
 */
export async function ensurePaymentForApplication(
  admin: SupabaseClient,
  args: { applicationId: string; businessId: string; athleteId: string; payoutCents: number }
): Promise<PaymentRow> {
  const existing = await getPaymentForApplication(admin, args.applicationId);
  if (existing) return existing;

  const settings = readFeeSettings();
  const quote = quoteFunding(args.payoutCents, settings);

  let fundedFromCredit = false;
  if (settings.athletePayMode === "included" && args.payoutCents > 0) {
    const remaining = await remainingTierCreditCents(admin, args.businessId);
    fundedFromCredit = remaining >= args.payoutCents;
  }

  const now = new Date().toISOString();
  const row: Record<string, unknown> = fundedFromCredit
    ? {
        application_id: args.applicationId,
        business_id: args.businessId,
        athlete_id: args.athleteId,
        amount_cents: args.payoutCents,
        platform_fee_cents: 0,
        card_fee_cents: 0,
        business_charge_cents: 0,
        funding_source: "tier_credit",
        hold_status: "held",
        funded_at: now,
      }
    : {
        application_id: args.applicationId,
        business_id: args.businessId,
        athlete_id: args.athleteId,
        amount_cents: quote.athletePayoutCents,
        platform_fee_cents: quote.platformFeeCents,
        card_fee_cents: quote.cardFeeCents,
        business_charge_cents: quote.businessChargeCents,
        // A $0 payout (e.g. an in-kind Bronze deal) needs no money moved.
        hold_status: quote.businessChargeCents === 0 ? "held" : "uncommitted",
        funded_at: quote.businessChargeCents === 0 ? now : null,
      };

  const { data, error } = await admin
    .from("payments")
    .upsert(row, { onConflict: "application_id", ignoreDuplicates: true })
    .select(PAYMENT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as PaymentRow;

  // Another request created it first.
  const again = await getPaymentForApplication(admin, args.applicationId);
  if (!again) throw new Error("Failed to create payment record");
  return again;
}

/** Monthly athlete credit left for a business in "included" mode. */
export async function remainingTierCreditCents(admin: SupabaseClient, businessId: string): Promise<number> {
  const settings = readFeeSettings();
  const { data: billing } = await admin
    .from("business_billing_profiles")
    .select("monthly_price_cents, subscription_status")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!billing || billing.subscription_status !== "active") return 0;

  const credit = includedCreditCents(Number(billing.monthly_price_cents || 0), settings);
  const periodStart = creditPeriodStart(new Date()).toISOString();
  const { data: used, error } = await admin
    .from("payments")
    .select("amount_cents")
    .eq("business_id", businessId)
    .eq("funding_source", "tier_credit")
    .neq("hold_status", "refunded")
    .gte("funded_at", periodStart);
  if (error) throw new Error(error.message);
  const spent = (used || []).reduce((sum, r) => sum + Number(r.amount_cents || 0), 0);
  return Math.max(0, credit - spent);
}

/** Stripe Checkout for funding one athlete payment. */
export async function createFundingCheckout(
  stripe: Stripe,
  admin: SupabaseClient,
  payment: PaymentRow,
  details: { campaignTitle: string; businessEmail: string | null }
): Promise<string> {
  const appUrl = getAppUrl();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: payment.amount_cents,
        product_data: { name: `Athlete payout: ${details.campaignTitle}` },
      },
    },
  ];
  if (payment.platform_fee_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: payment.platform_fee_cents, product_data: { name: "Hillink platform fee" } },
    });
  }
  if (payment.card_fee_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: payment.card_fee_cents, product_data: { name: "Card processing" } },
    });
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: lineItems,
      success_url: `${appUrl}/business?funding=success`,
      cancel_url: `${appUrl}/business?funding=cancelled`,
      ...(details.businessEmail ? { customer_email: details.businessEmail } : {}),
      metadata: { kind: "athlete_payment", payment_id: payment.id, application_id: payment.application_id },
      payment_intent_data: {
        metadata: { kind: "athlete_payment", payment_id: payment.id, application_id: payment.application_id },
      },
    },
    // One open checkout per payment row and amount.
    { idempotencyKey: `hillink-fund-${payment.id}-${payment.business_charge_cents}` }
  );

  await admin.from("payments").update({ stripe_checkout_session_id: session.id }).eq("id", payment.id);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Marks a payment funded after a completed, paid checkout. Safe to call more than once. */
export async function markPaymentFunded(
  stripe: Stripe,
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<{ applied: boolean; reason?: string }> {
  const paymentId = session.metadata?.payment_id;
  if (!paymentId) return { applied: false, reason: "no payment_id" };
  if (session.payment_status !== "paid") return { applied: false, reason: `payment_status ${session.payment_status}` };

  const { data: payment } = await admin.from("payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle();
  if (!payment) return { applied: false, reason: "payment not found" };
  const row = payment as PaymentRow;
  if (row.hold_status !== "uncommitted") return { applied: false, reason: `already ${row.hold_status}` };
  if ((session.amount_total ?? 0) < row.business_charge_cents) {
    return { applied: false, reason: "amount paid is less than the amount due" };
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  let chargeId: string | null = null;
  if (paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id ?? null;
  }

  const { data: updated, error } = await admin
    .from("payments")
    .update({
      hold_status: "held",
      funding_source: "checkout",
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      funded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("hold_status", "uncommitted")
    .select("id");
  if (error) throw new Error(error.message);
  return { applied: (updated || []).length > 0 };
}

export type PayoutResult =
  | { ok: true; transferId: string; amountCents: number; alreadyPaid?: boolean }
  | { ok: false; status: number; error: string };

/**
 * Pays an athlete from a funded payment. Only one caller can claim a payment, and the Stripe
 * idempotency key is fixed per payment, so double clicks and retries never pay twice.
 */
export async function payOutPayment(
  stripe: Stripe,
  admin: SupabaseClient,
  payment: PaymentRow,
  destinationAccountId: string
): Promise<PayoutResult> {
  if (payment.stripe_transfer_id) {
    return { ok: true, transferId: payment.stripe_transfer_id, amountCents: payment.amount_cents, alreadyPaid: true };
  }
  if (payment.hold_status !== "held" && payment.hold_status !== "released") {
    return {
      ok: false,
      status: 409,
      error:
        payment.hold_status === "uncommitted"
          ? "This athlete's payment hasn't been funded yet. Fund it before paying out."
          : `Payment is ${payment.hold_status} and cannot be paid out.`,
    };
  }
  if (payment.amount_cents <= 0) {
    return { ok: false, status: 422, error: "Nothing to pay out for this application." };
  }

  // Claim the payment. A stale claim (crash mid-payout) can be retried after 10 minutes; the
  // idempotency key still prevents a second transfer.
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("payments")
    .update({ payout_claimed_at: new Date().toISOString() })
    .eq("id", payment.id)
    .is("stripe_transfer_id", null)
    .or(`payout_claimed_at.is.null,payout_claimed_at.lt.${staleBefore}`)
    .select("id");
  if (claimError) return { ok: false, status: 500, error: claimError.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: "A payout for this application is already in progress." };
  }

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: payment.amount_cents,
        currency: "usd",
        destination: destinationAccountId,
        // Tie the transfer to the business's charge so it's paid from those funds.
        ...(payment.funding_source === "checkout" && payment.stripe_charge_id
          ? { source_transaction: payment.stripe_charge_id }
          : {}),
        metadata: { payment_id: payment.id, campaign_application_id: payment.application_id },
      },
      { idempotencyKey: payoutIdempotencyKey(payment.id) }
    );
  } catch (err) {
    await admin.from("payments").update({ payout_claimed_at: null }).eq("id", payment.id).is("stripe_transfer_id", null);
    const message = err instanceof Error ? err.message : "Stripe transfer failed";
    return { ok: false, status: 502, error: message };
  }

  const { error: saveError } = await admin
    .from("payments")
    .update({
      stripe_transfer_id: transfer.id,
      idempotency_key: payoutIdempotencyKey(payment.id),
      hold_status: "released",
      payout_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);
  if (saveError) {
    // The transfer happened; the claim stays set so nobody retries into a new transfer.
    console.error("[payments] transfer succeeded but saving it failed", { paymentId: payment.id, transferId: transfer.id });
  }
  return { ok: true, transferId: transfer.id, amountCents: payment.amount_cents };
}

/** Refunds a funded payment that will never be paid out (athlete removed, campaign cancelled). */
export async function refundPaymentIfFunded(
  getStripeClient: () => Stripe,
  admin: SupabaseClient,
  applicationId: string
): Promise<{ refunded: boolean; error?: string }> {
  const payment = await getPaymentForApplication(admin, applicationId);
  if (!payment) return { refunded: false };
  if (payment.stripe_transfer_id) return { refunded: false, error: "Athlete was already paid" };

  if (payment.hold_status === "uncommitted") {
    await admin.from("payments").update({ hold_status: "refunded", refunded_at: new Date().toISOString() }).eq("id", payment.id).eq("hold_status", "uncommitted");
    return { refunded: false };
  }
  if (payment.hold_status !== "held") return { refunded: false };

  if (payment.funding_source === "checkout" && payment.stripe_payment_intent_id) {
    try {
      await getStripeClient().refunds.create(
        { payment_intent: payment.stripe_payment_intent_id },
        { idempotencyKey: `hillink-refund-${payment.id}` }
      );
    } catch (err) {
      return { refunded: false, error: err instanceof Error ? err.message : "Refund failed" };
    }
  }
  await admin
    .from("payments")
    .update({ hold_status: "refunded", refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", payment.id)
    .eq("hold_status", "held");
  return { refunded: true };
}
