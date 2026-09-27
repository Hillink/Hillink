// Runs the payment money flow against a local Supabase with a fake Stripe.
// Needs: `npx supabase start` + `scripts/local-db-bootstrap.sh`, then `npm run test:payments:local`.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ensurePaymentForApplication,
  getPaymentForApplication,
  markPaymentFunded,
  payOutPayment,
  refundPaymentIfFunded,
} from "../../lib/payments/server.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key ? "set LOCAL_SUPABASE_URL and LOCAL_SUPABASE_SERVICE_ROLE_KEY" : false;

type FakeStripe = {
  transfers: { calls: number; byKey: Map<string, { id: string }>; byGroup: Map<string, { id: string }> };
  refunds: { calls: number; intents: string[] };
  expired: string[];
  client: any;
};

function fakeStripe(opts: { transferDelayMs?: number; failTransfers?: boolean } = {}): FakeStripe {
  const state: FakeStripe = {
    transfers: { calls: 0, byKey: new Map(), byGroup: new Map() },
    refunds: { calls: 0, intents: [] },
    expired: [],
    client: null,
  };
  state.client = {
    transfers: {
      // Like Stripe: the same idempotency key returns the same transfer instead of paying again.
      create: async (params: { transfer_group?: string }, o: { idempotencyKey: string }) => {
        state.transfers.calls++;
        if (opts.transferDelayMs) await new Promise((r) => setTimeout(r, opts.transferDelayMs));
        if (opts.failTransfers) throw new Error("card_declined");
        const existing = state.transfers.byKey.get(o.idempotencyKey);
        if (existing) return existing;
        const t = { id: `tr_${state.transfers.byKey.size + 1}_${Date.now()}` };
        state.transfers.byKey.set(o.idempotencyKey, t);
        if (params.transfer_group) state.transfers.byGroup.set(params.transfer_group, t);
        return t;
      },
      list: async (params: { transfer_group: string }) => {
        const t = state.transfers.byGroup.get(params.transfer_group);
        return { data: t ? [t] : [] };
      },
    },
    refunds: {
      create: async (params: { payment_intent: string }) => {
        state.refunds.calls++;
        state.refunds.intents.push(params.payment_intent);
        if (opts.transferDelayMs) await new Promise((r) => setTimeout(r, opts.transferDelayMs));
        return { id: "re_1" };
      },
    },
    checkout: {
      sessions: {
        expire: async (id: string) => {
          state.expired.push(id);
          return { id };
        },
      },
    },
    paymentIntents: { retrieve: async () => ({ latest_charge: "ch_test_1" }) },
  };
  return state;
}

let admin: SupabaseClient;
let businessId: string;
let athleteId: string;

async function makeUser(role: string) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await admin.from("profiles").upsert({ id, role });
  return id;
}

async function makeApplication(payoutCents: number) {
  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .insert({ business_id: businessId, title: "Test campaign", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: payoutCents, slots: 3 })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const { data: app, error: aErr } = await admin
    .from("campaign_applications")
    .insert({ campaign_id: campaign.id, athlete_id: athleteId, status: "accepted" })
    .select("id")
    .single();
  if (aErr) throw aErr;
  return app.id as string;
}

async function fundedPayment(payoutCents: number) {
  const applicationId = await makeApplication(payoutCents);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents });
  const stripe = fakeStripe();
  const result = await markPaymentFunded(stripe.client, admin, {
    id: "cs_test",
    metadata: { payment_id: payment.id },
    payment_status: "paid",
    amount_total: payment.business_charge_cents,
    payment_intent: "pi_test",
  } as any);
  assert.equal(result.applied, true);
  return (await getPaymentForApplication(admin, applicationId))!;
}

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  businessId = await makeUser("business");
  athleteId = await makeUser("athlete");
});

test("accepting creates an unfunded payment with a 20% fee and card fee quote", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  assert.equal(payment.hold_status, "uncommitted");
  assert.equal(payment.amount_cents, 5000);
  assert.equal(payment.platform_fee_cents, 1000);
  assert.equal(payment.business_charge_cents, 6000 + payment.card_fee_cents);
  // Calling again (double click) keeps the same row.
  const again = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  assert.equal(again.id, payment.id);
});

test("an unfunded payment can't be paid out", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  const stripe = fakeStripe();
  const result = await payOutPayment(stripe.client, admin, payment, "acct_test");
  assert.equal(result.ok, false);
  assert.equal(stripe.transfers.calls, 0);
});

test("underpaid checkout does not fund the payment", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  const result = await markPaymentFunded(fakeStripe().client, admin, {
    id: "cs_x", metadata: { payment_id: payment.id }, payment_status: "paid", amount_total: 100, payment_intent: "pi_x",
  } as any);
  assert.equal(result.applied, false);
  assert.equal((await getPaymentForApplication(admin, applicationId))!.hold_status, "uncommitted");
});

test("funded payment pays out once, tied to the business's charge", { skip }, async () => {
  const payment = await fundedPayment(5000);
  assert.equal(payment.hold_status, "held");
  assert.equal(payment.stripe_charge_id, "ch_test_1");
  const stripe = fakeStripe();
  const first = await payOutPayment(stripe.client, admin, payment, "acct_test");
  assert.equal(first.ok, true);
  const reread = (await getPaymentForApplication(admin, payment.application_id))!;
  assert.equal(reread.hold_status, "released");
  const second = await payOutPayment(stripe.client, admin, reread, "acct_test");
  assert.ok(second.ok && second.alreadyPaid);
  assert.equal(stripe.transfers.calls, 1);
});

test("five simultaneous payout clicks make exactly one transfer", { skip }, async () => {
  const payment = await fundedPayment(5000);
  const stripe = fakeStripe({ transferDelayMs: 150 });
  const results = await Promise.all(Array.from({ length: 5 }, () => payOutPayment(stripe.client, admin, payment, "acct_test")));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(stripe.transfers.calls, 1);
});

test("a failed transfer can be retried and still only pays once", { skip }, async () => {
  const payment = await fundedPayment(5000);
  const failing = fakeStripe({ failTransfers: true });
  const failed = await payOutPayment(failing.client, admin, payment, "acct_test");
  assert.equal(failed.ok, false);
  const stripe = fakeStripe();
  const retry = await payOutPayment(stripe.client, admin, (await getPaymentForApplication(admin, payment.application_id))!, "acct_test");
  assert.equal(retry.ok, true);
});

test("a saved transfer id can't be overwritten", { skip }, async () => {
  const payment = await fundedPayment(5000);
  await payOutPayment(fakeStripe().client, admin, payment, "acct_test");
  const { error } = await admin.from("payments").update({ stripe_transfer_id: "tr_evil" }).eq("id", payment.id);
  assert.ok(error, "expected the database to refuse");
});

test("removing an athlete refunds a funded payment once", { skip }, async () => {
  const payment = await fundedPayment(5000);
  const stripe = fakeStripe();
  const r1 = await refundPaymentIfFunded(() => stripe.client, admin, payment.application_id);
  assert.equal(r1.refunded, true);
  const r2 = await refundPaymentIfFunded(() => stripe.client, admin, payment.application_id);
  assert.equal(r2.refunded, false);
  assert.equal(stripe.refunds.calls, 1);
  const after = (await getPaymentForApplication(admin, payment.application_id))!;
  assert.equal(after.hold_status, "refunded");
  const payout = await payOutPayment(stripe.client, admin, after, "acct_test");
  assert.equal(payout.ok, false);
});

test("a paid athlete is never refunded", { skip }, async () => {
  const payment = await fundedPayment(5000);
  await payOutPayment(fakeStripe().client, admin, payment, "acct_test");
  const stripe = fakeStripe();
  const r = await refundPaymentIfFunded(() => stripe.client, admin, payment.application_id);
  assert.equal(r.refunded, false);
  assert.ok(r.error);
  assert.equal(stripe.refunds.calls, 0);
});

test("refunding an unfunded payment needs no Stripe key", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  const r = await refundPaymentIfFunded(() => { throw new Error("should not create Stripe"); }, admin, applicationId);
  assert.equal(r.refunded, false);
  assert.equal(r.error, undefined);
});

test("a $0 in-kind deal is held without any charge", { skip }, async () => {
  const applicationId = await makeApplication(0);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 0 });
  assert.equal(payment.hold_status, "held");
  assert.equal(payment.business_charge_cents, 0);
});

test("a refund and a payout racing each other: only one happens", { skip }, async () => {
  for (let i = 0; i < 5; i++) {
    const payment = await fundedPayment(5000);
    const stripe = fakeStripe({ transferDelayMs: 100 });
    const [payout, refund] = await Promise.all([
      payOutPayment(stripe.client, admin, payment, "acct_test"),
      refundPaymentIfFunded(() => stripe.client, admin, payment.application_id),
    ]);
    const paid = payout.ok && stripe.transfers.calls === 1;
    assert.notEqual(paid, refund.refunded, `round ${i}: paid=${paid} refunded=${refund.refunded}`);
    assert.ok(stripe.transfers.calls + stripe.refunds.calls <= 1, `round ${i}: both money moves ran`);
  }
});

test("a transfer made but never saved is found instead of paying again", { skip }, async () => {
  const payment = await fundedPayment(5000);
  const stripe = fakeStripe();
  // Simulate: an earlier attempt created the transfer, then crashed before saving it (claim is stale).
  stripe.transfers.byGroup.set(`hillink-payment-${payment.id}`, { id: "tr_earlier" });
  await admin.from("payments").update({ payout_claimed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }).eq("id", payment.id);
  const result = await payOutPayment(stripe.client, admin, payment, "acct_test");
  assert.ok(result.ok);
  assert.equal(result.ok && result.transferId, "tr_earlier");
  assert.equal(stripe.transfers.calls, 0);
});

test("a fresh claim blocks a second payout attempt", { skip }, async () => {
  const payment = await fundedPayment(5000);
  await admin.from("payments").update({ payout_claimed_at: new Date().toISOString() }).eq("id", payment.id);
  const stripe = fakeStripe();
  const result = await payOutPayment(stripe.client, admin, payment, "acct_test");
  assert.equal(result.ok, false);
  assert.equal(stripe.transfers.calls, 0);
});

test("removing an athlete closes their open checkout", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  await admin.from("payments").update({ stripe_checkout_session_id: "cs_open" }).eq("id", payment.id);
  const stripe = fakeStripe();
  await refundPaymentIfFunded(() => stripe.client, admin, applicationId);
  assert.deepEqual(stripe.expired, ["cs_open"]);
  assert.equal((await getPaymentForApplication(admin, applicationId))!.hold_status, "refunded");
});

test("paying in a checkout tab after the athlete was removed refunds the charge", { skip }, async () => {
  const applicationId = await makeApplication(5000);
  const payment = await ensurePaymentForApplication(admin, { applicationId, businessId, athleteId, payoutCents: 5000 });
  await refundPaymentIfFunded(() => fakeStripe().client, admin, applicationId);
  const stripe = fakeStripe();
  const result = await markPaymentFunded(stripe.client, admin, {
    id: "cs_late", metadata: { payment_id: payment.id }, payment_status: "paid",
    amount_total: payment.business_charge_cents, payment_intent: "pi_late",
  } as any);
  assert.equal(result.applied, false);
  assert.deepEqual(stripe.refunds.intents, ["pi_late"]);
});

test("paying for a deleted (cancelled) campaign refunds the charge", { skip }, async () => {
  const stripe = fakeStripe();
  const result = await markPaymentFunded(stripe.client, admin, {
    id: "cs_gone", metadata: { payment_id: "00000000-0000-0000-0000-000000000000" }, payment_status: "paid",
    amount_total: 6000, payment_intent: "pi_gone",
  } as any);
  assert.equal(result.applied, false);
  assert.deepEqual(stripe.refunds.intents, ["pi_gone"]);
});

test("paying twice in two tabs refunds the second charge", { skip }, async () => {
  const payment = await fundedPayment(5000);
  const stripe = fakeStripe();
  const result = await markPaymentFunded(stripe.client, admin, {
    id: "cs_two", metadata: { payment_id: payment.id }, payment_status: "paid",
    amount_total: payment.business_charge_cents, payment_intent: "pi_second",
  } as any);
  assert.equal(result.applied, false);
  assert.deepEqual(stripe.refunds.intents, ["pi_second"]);
  // A repeat of the original webhook is not a second charge.
  const replay = await markPaymentFunded(stripe.client, admin, {
    id: "cs_test", metadata: { payment_id: payment.id }, payment_status: "paid",
    amount_total: payment.business_charge_cents, payment_intent: "pi_test",
  } as any);
  assert.equal(replay.applied, false);
  assert.equal(stripe.refunds.calls, 1);
});

test("a business that wins a dispute gets refunded, and the athlete can't be paid after", { skip }, async () => {
  const payment = await fundedPayment(5000);
  await admin.from("payments").update({ hold_status: "disputed" }).eq("id", payment.id);
  const stripe = fakeStripe();
  const r = await refundPaymentIfFunded(() => stripe.client, admin, payment.application_id);
  assert.equal(r.refunded, true);
  assert.equal(stripe.refunds.calls, 1);
  const payout = await payOutPayment(stripe.client, admin, (await getPaymentForApplication(admin, payment.application_id))!, "acct_test");
  assert.equal(payout.ok, false);
});

test("a disputed payment can't be paid out", { skip }, async () => {
  const payment = await fundedPayment(5000);
  await admin.from("payments").update({ hold_status: "disputed" }).eq("id", payment.id);
  const stripe = fakeStripe();
  const payout = await payOutPayment(stripe.client, admin, { ...payment, hold_status: "held" }, "acct_test");
  assert.equal(payout.ok, false);
  assert.equal(stripe.transfers.calls, 0);
});
