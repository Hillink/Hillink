import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET,
  CODE_PATTERN,
  buildMonthlyReport,
  codePrefix,
  currentMonth,
  isDuplicateTap,
  makeCode,
  monthRange,
  normalizeCode,
} from "../../lib/redemptions/codes.ts";

test("codes use the athlete's name and readable characters", () => {
  const code = makeCode("Jake", new Uint8Array([0, 1, 2, 3]));
  assert.equal(code, "JAKE-ABCD");
  assert.match(code, CODE_PATTERN);
  for (const bad of ["0", "O", "1", "I", "L"]) assert.ok(!CODE_ALPHABET.includes(bad));
});

test("odd names still make valid codes", () => {
  assert.equal(codePrefix("José"), "JOSE");
  assert.equal(codePrefix("D'Andre"), "DANDRE");
  assert.equal(codePrefix("Bartholomew-James"), "BARTHOLO");
  assert.equal(codePrefix("X"), "HL");
  assert.equal(codePrefix(null), "HL");
  assert.equal(codePrefix("李"), "HL");
  for (let i = 0; i < 200; i++) {
    const bytes = new Uint8Array([i, 255 - i, (i * 7) % 256, (i * 13) % 256]);
    assert.match(makeCode("Ana", bytes), CODE_PATTERN);
  }
});

test("staff typing is forgiving", () => {
  assert.equal(normalizeCode(" jake-7k2q "), "JAKE-7K2Q");
  assert.equal(normalizeCode("jake 7k2q"), "JAKE-7K2Q");
  assert.equal(normalizeCode("JAKE7K2Q"), "JAKE-7K2Q");
  assert.equal(normalizeCode(""), null);
  assert.equal(normalizeCode("7K2Q"), null);
  assert.equal(normalizeCode("'; drop table redemptions; --"), null);
});

test("a second tap within a minute is a duplicate", () => {
  const now = new Date("2026-09-27T12:00:30Z");
  assert.equal(isDuplicateTap("2026-09-27T12:00:00Z", now), true);
  assert.equal(isDuplicateTap("2026-09-27T11:59:00Z", now), false);
  assert.equal(isDuplicateTap(null, now), false);
});

test("month ranges", () => {
  assert.deepEqual(monthRange("2026-09"), { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z" });
  assert.equal(monthRange("2026-13"), null);
  assert.equal(monthRange("sept"), null);
  assert.equal(currentMonth(new Date("2026-09-27T00:00:00Z")), "2026-09");
});

test("monthly report adds up customers, cost and cost per customer", () => {
  const report = buildMonthlyReport({
    campaigns: [
      { id: "c1", title: "Tacos", payout_cents: 5000 },
      { id: "c2", title: "Coffee", payout_cents: 3000 },
      { id: "c3", title: "Empty", payout_cents: 9000 },
    ],
    applications: [
      { id: "a1", campaign_id: "c1", athlete_id: "t1", status: "approved", approved_at: "2026-09-10T00:00:00Z" },
      { id: "a2", campaign_id: "c1", athlete_id: "t2", status: "completed", approved_at: "2026-09-12T00:00:00Z" },
      { id: "a3", campaign_id: "c1", athlete_id: "t3", status: "accepted", approved_at: null },
      { id: "a4", campaign_id: "c2", athlete_id: "t1", status: "approved", approved_at: "2026-08-30T00:00:00Z" },
      { id: "a5", campaign_id: "c2", athlete_id: "t4", status: "declined", approved_at: null },
    ],
    redemptions: [
      { campaign_id: "c1", athlete_id: "t1", purchase_cents: 1200 },
      { campaign_id: "c1", athlete_id: "t1", purchase_cents: null },
      { campaign_id: "c1", athlete_id: "t2", purchase_cents: 800 },
      { campaign_id: "c2", athlete_id: "t1", purchase_cents: 500 },
    ],
    reach: [{ application_id: "a1", reach: 900, impressions: 1500 }, { application_id: "a2", reach: null, impressions: 400 }],
    subscriptionCents: 25000,
    monthStart: "2026-09-01T00:00:00.000Z",
    monthEnd: "2026-10-01T00:00:00.000Z",
  });

  const tacos = report.campaigns.find((c) => c.campaignId === "c1")!;
  assert.equal(tacos.athletes, 3);
  assert.equal(tacos.postsApproved, 2);
  assert.equal(tacos.customers, 3);
  assert.equal(tacos.reportedSalesCents, 2000);
  assert.equal(tacos.athletePayCents, 10000);
  assert.equal(tacos.reach, 1300);
  assert.equal(tacos.costPerCustomerCents, 3333);

  const coffee = report.campaigns.find((c) => c.campaignId === "c2")!;
  assert.equal(coffee.postsApproved, 0, "approved last month doesn't count this month");
  assert.equal(coffee.customers, 1);
  assert.equal(coffee.athletes, 1, "declined athletes aren't counted");

  assert.equal(report.campaigns.some((c) => c.campaignId === "c3"), false, "campaigns with nothing are hidden");
  assert.equal(report.totals.customers, 4);
  assert.equal(report.totals.athletes, 3);
  assert.equal(report.totals.totalCostCents, 35000);
  assert.equal(report.totals.totalCostPerCustomerCents, 8750);
  assert.deepEqual(report.topAthletes[0], { athleteId: "t1", customers: 3 });
});

test("no customers means no cost-per-customer, not divide by zero", () => {
  const report = buildMonthlyReport({
    campaigns: [], applications: [], redemptions: [], reach: [], subscriptionCents: 25000,
    monthStart: "2026-09-01T00:00:00.000Z", monthEnd: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(report.totals.totalCostPerCustomerCents, null);
  assert.equal(report.totals.totalCostCents, 25000);
});
