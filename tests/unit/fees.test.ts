import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FEE_SETTINGS,
  canTransition,
  cardFeeToCover,
  creditPeriodStart,
  includedCreditCents,
  payoutIdempotencyKey,
  platformFeeFor,
  quoteFunding,
  readFeeSettings,
} from "../../lib/payments/fees.ts";

test("platform fee is 20% of athlete pay by default", () => {
  assert.equal(platformFeeFor(5000, DEFAULT_FEE_SETTINGS.platformFeeBps), 1000);
  assert.equal(platformFeeFor(0, 2000), 0);
});

test("card fee leaves exactly enough after Stripe's 2.9% + 30c", () => {
  for (const net of [1, 99, 1000, 6000, 12345, 250000]) {
    const gross = net + cardFeeToCover(net);
    const stripeTakes = Math.round(gross * 0.029) + 30;
    assert.ok(gross - stripeTakes >= net, `net ${net}: gross ${gross} leaves ${gross - stripeTakes}`);
    // And not more than a cent of over-charge.
    const oneLess = gross - 1;
    assert.ok(oneLess - (oneLess * 0.029 + 30) < net, `net ${net}: over-charged`);
  }
  assert.equal(cardFeeToCover(0), 0);
});

test("a $50 athlete payout costs the business $50 + $10 fee + card fee", () => {
  const quote = quoteFunding(5000);
  assert.equal(quote.athletePayoutCents, 5000);
  assert.equal(quote.platformFeeCents, 1000);
  assert.equal(quote.businessChargeCents, 5000 + 1000 + quote.cardFeeCents);
  assert.equal(quote.cardFeeCents, cardFeeToCover(6000));
});

test("Hillink can absorb card fees instead", () => {
  const quote = quoteFunding(5000, { ...DEFAULT_FEE_SETTINGS, passCardFees: false });
  assert.equal(quote.cardFeeCents, 0);
  assert.equal(quote.businessChargeCents, 6000);
});

test("a $0 in-kind deal charges nothing", () => {
  assert.deepEqual(quoteFunding(0), { athletePayoutCents: 0, platformFeeCents: 0, cardFeeCents: 0, businessChargeCents: 0 });
});

test("bad amounts are rejected", () => {
  assert.throws(() => quoteFunding(-1));
  assert.throws(() => quoteFunding(10.5));
});

test("settings come from env with safe fallbacks", () => {
  assert.deepEqual(readFeeSettings({}), DEFAULT_FEE_SETTINGS);
  const s = readFeeSettings({
    PLATFORM_FEE_BPS: "1500",
    PASS_CARD_FEES_TO_BUSINESS: "false",
    ATHLETE_PAY_MODE: "included",
    INCLUDED_ATHLETE_CREDIT_BPS: "5000",
  });
  assert.deepEqual(s, { platformFeeBps: 1500, passCardFees: false, athletePayMode: "included", includedCreditBps: 5000 });
  assert.equal(readFeeSettings({ PLATFORM_FEE_BPS: "abc" }).platformFeeBps, 2000);
  assert.equal(readFeeSettings({ PLATFORM_FEE_BPS: "20000" }).platformFeeBps, 2000);
  assert.equal(readFeeSettings({ ATHLETE_PAY_MODE: "weird" }).athletePayMode, "on_top");
});

test("included mode gives 60% of the tier price as athlete credit; on-top gives none", () => {
  const included = { ...DEFAULT_FEE_SETTINGS, athletePayMode: "included" as const };
  assert.equal(includedCreditCents(40000, included), 24000);
  assert.equal(includedCreditCents(40000, DEFAULT_FEE_SETTINGS), 0);
});

test("credit period is the UTC calendar month", () => {
  assert.equal(creditPeriodStart(new Date("2026-09-27T23:59:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
});

test("payout idempotency key is stable per payment", () => {
  assert.equal(payoutIdempotencyKey("abc"), payoutIdempotencyKey("abc"));
  assert.notEqual(payoutIdempotencyKey("abc"), payoutIdempotencyKey("abd"));
  assert.throws(() => payoutIdempotencyKey(""));
});

test("applications can only move one legal step", () => {
  assert.ok(canTransition("applied", "accepted"));
  assert.ok(canTransition("submitted", "approved"));
  assert.ok(!canTransition("applied", "approved"));
  assert.ok(!canTransition("accepted", "approved"));
  assert.ok(!canTransition("approved", "approved"));
  assert.ok(!canTransition("declined", "accepted"));
});
