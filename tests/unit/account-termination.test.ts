import assert from "node:assert/strict";
import test from "node:test";
import { closeBusinessBilling, type StripeSubscriptions } from "../../lib/account/termination.ts";

function fakeStripe(subs: Record<string, { status: string; customer?: string }>, opts: { failCancel?: boolean; stuck?: boolean; hasMore?: boolean } = {}) {
  const cancelled: string[] = [];
  const stripe: StripeSubscriptions = {
    subscriptions: {
      async retrieve(id) {
        if (!subs[id]) throw new Error(`No such subscription: ${id}`);
        return { id, status: subs[id].status };
      },
      async cancel(id) {
        if (opts.failCancel) throw new Error("Stripe timeout");
        cancelled.push(id);
        if (!opts.stuck) subs[id].status = "canceled";
        return { id, status: subs[id].status };
      },
      async list({ customer }) {
        const data = Object.entries(subs)
          .filter(([, s]) => s.customer === customer)
          .map(([id, s]) => ({ id, status: s.status }));
        return { data, has_more: Boolean(opts.hasMore) };
      },
    },
  };
  return { stripe, cancelled };
}

test("no Stripe IDs means nothing to close", async () => {
  assert.deepEqual(await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: null }, null), { ok: true, cancelled: [] });
});

test("a stored subscription with Stripe unconfigured blocks deletion", async () => {
  const result = await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: "sub_1" }, null);
  assert.equal(result.ok, false);
});

test("a stored customer with Stripe unconfigured blocks deletion", async () => {
  const result = await closeBusinessBilling({ stripeCustomerId: "cus_1", stripeSubscriptionId: null }, null);
  assert.equal(result.ok, false);
});

test("the active subscription is cancelled and confirmed", async () => {
  const { stripe, cancelled } = fakeStripe({ sub_1: { status: "active", customer: "cus_1" } });
  assert.deepEqual(await closeBusinessBilling({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }, stripe), { ok: true, cancelled: ["sub_1"] });
  assert.deepEqual(cancelled, ["sub_1"]);
});

test("a subscription missing from the billing row is found through the customer", async () => {
  const { stripe, cancelled } = fakeStripe({
    sub_old: { status: "canceled", customer: "cus_1" },
    sub_new: { status: "past_due", customer: "cus_1" },
  });
  const result = await closeBusinessBilling({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_old" }, stripe);
  assert.deepEqual(result, { ok: true, cancelled: ["sub_new"] });
  assert.deepEqual(cancelled, ["sub_new"]);
});

test("an already cancelled subscription is not cancelled again", async () => {
  const { stripe, cancelled } = fakeStripe({ sub_1: { status: "canceled" } });
  assert.deepEqual(await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: "sub_1" }, stripe), { ok: true, cancelled: [] });
  assert.deepEqual(cancelled, []);
});

test("a Stripe error blocks deletion", async () => {
  const { stripe } = fakeStripe({ sub_1: { status: "active" } }, { failCancel: true });
  const result = await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: "sub_1" }, stripe);
  assert.equal(result.ok, false);
});

test("an unknown stored subscription ID blocks deletion", async () => {
  const { stripe } = fakeStripe({});
  const result = await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: "sub_missing" }, stripe);
  assert.equal(result.ok, false);
});

test("a subscription that stays active after cancel blocks deletion", async () => {
  const { stripe } = fakeStripe({ sub_1: { status: "active" } }, { stuck: true });
  const result = await closeBusinessBilling({ stripeCustomerId: null, stripeSubscriptionId: "sub_1" }, stripe);
  assert.equal(result.ok, false);
});

test("an unpaged customer subscription list blocks deletion", async () => {
  const { stripe } = fakeStripe({ sub_1: { status: "active", customer: "cus_1" } }, { hasMore: true });
  const result = await closeBusinessBilling({ stripeCustomerId: "cus_1", stripeSubscriptionId: null }, stripe);
  assert.equal(result.ok, false);
});
