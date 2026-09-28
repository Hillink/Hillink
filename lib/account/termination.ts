// Decides whether a business's Stripe billing is safely closed before the account is deleted.
// Deleting the account removes the stored Stripe IDs, so anything we cannot confirm must block
// deletion instead of being skipped (LIFE-001). No imports so it can be unit tested with `node --test`.

export type BillingIds = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

// The subset of the Stripe client this check uses, so tests can pass a fake.
export type StripeSubscriptions = {
  subscriptions: {
    retrieve(id: string): Promise<{ id: string; status: string }>;
    cancel(id: string, params?: { prorate?: boolean }): Promise<{ id: string; status: string }>;
    list(params: { customer: string; status: "all"; limit: number }): Promise<{
      data: { id: string; status: string }[];
      has_more: boolean;
    }>;
  };
};

export type BillingClosure = { ok: true; cancelled: string[] } | { ok: false; error: string };

const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function isSubscriptionEnded(status: string | null | undefined) {
  return ENDED_STATUSES.has(String(status || "").trim().toLowerCase());
}

export async function closeBusinessBilling(
  ids: BillingIds,
  stripe: StripeSubscriptions | null
): Promise<BillingClosure> {
  const subscriptionId = ids.stripeSubscriptionId?.trim() || null;
  const customerId = ids.stripeCustomerId?.trim() || null;

  if (!subscriptionId && !customerId) {
    return { ok: true, cancelled: [] };
  }

  if (!stripe) {
    return {
      ok: false,
      error: "Billing could not be verified because Stripe is not configured. Contact support to close this account.",
    };
  }

  try {
    const toCheck = new Set<string>();
    if (subscriptionId) toCheck.add(subscriptionId);

    if (customerId) {
      const page = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      if (page.has_more) {
        return { ok: false, error: "Billing could not be verified: too many subscriptions. Contact support to close this account." };
      }
      for (const sub of page.data) {
        if (!isSubscriptionEnded(sub.status)) toCheck.add(sub.id);
      }
    }

    const cancelled: string[] = [];
    for (const id of toCheck) {
      const current = await stripe.subscriptions.retrieve(id);
      if (isSubscriptionEnded(current.status)) continue;
      const result = await stripe.subscriptions.cancel(id, { prorate: false });
      if (!isSubscriptionEnded(result.status)) {
        return { ok: false, error: `Subscription ${id} is still ${result.status} after cancelling. Contact support to close this account.` };
      }
      cancelled.push(id);
    }
    return { ok: true, cancelled };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe request failed";
    return { ok: false, error: `Unable to terminate account because billing could not be closed: ${message}` };
  }
}
