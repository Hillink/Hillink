import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_CATEGORY_KEYS,
  BUSINESS_CATEGORIES,
  RESTRICTED_CATEGORY_KEYS,
  SCHOOL_CONFLICT_OPTIONS,
  effectiveReviewWindowHours,
  isReviewOverdue,
  joinBlock,
  validateComplianceInput,
} from "../../lib/compliance/rules.ts";

const ok = { confirmed_adult: true, visa_status: "us_citizen_or_resident" as const, school_disclosure_ack: true, school_conflict_categories: ["apparel"] };

test("category lists are consistent", () => {
  assert.equal(new Set(BUSINESS_CATEGORIES.map((c) => c.key)).size, BUSINESS_CATEGORIES.length);
  for (const k of ["alcohol", "gambling", "cannabis", "tobacco_vape", "supplements"]) assert.ok(RESTRICTED_CATEGORY_KEYS.includes(k));
  assert.ok(!ALLOWED_CATEGORY_KEYS.some((k) => RESTRICTED_CATEGORY_KEYS.includes(k)));
  assert.ok(!SCHOOL_CONFLICT_OPTIONS.some((c) => c.restrictedReason));
});

test("an eligible athlete can join a normal business", () => {
  assert.equal(joinBlock(ok, "restaurant"), null);
  assert.equal(joinBlock(ok, null), null);
});

test("missing eligibility blocks joining", () => {
  assert.equal(joinBlock(null, "restaurant")?.code, "compliance_required");
  assert.equal(joinBlock({ ...ok, confirmed_adult: false }, "restaurant")?.code, "compliance_required");
  assert.equal(joinBlock({ ...ok, school_disclosure_ack: null }, "restaurant")?.code, "compliance_required");
});

test("uncleared international athletes are blocked", () => {
  assert.equal(joinBlock({ ...ok, visa_status: "international_not_cleared" }, "restaurant")?.code, "visa_not_cleared");
  assert.equal(joinBlock({ ...ok, visa_status: "international_cleared" }, "restaurant"), null);
});

test("school exclusive deals and restricted businesses block joining", () => {
  assert.equal(joinBlock(ok, "apparel")?.code, "school_conflict");
  assert.equal(joinBlock(ok, "gambling")?.code, "business_restricted");
});

test("eligibility form validation", () => {
  assert.equal(validateComplianceInput({ ...ok, confirmed_adult: false }).ok, false);
  assert.equal(validateComplianceInput({ ...ok, visa_status: "tourist" as never }).ok, false);
  assert.equal(validateComplianceInput({ ...ok, school_disclosure_ack: false }).ok, false);
  const v = validateComplianceInput({ ...ok, school_conflict_categories: ["apparel", "apparel", "gambling", "nonsense"] });
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.value.school_conflict_categories, ["apparel"]);
});

test("review window", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  assert.equal(isReviewOverdue("2026-09-24T11:00:00Z", null, now), true, "72h default");
  assert.equal(isReviewOverdue("2026-09-25T12:00:00Z", null, now), false);
  assert.equal(isReviewOverdue("2026-09-25T12:00:00Z", 48, now), true);
  assert.equal(isReviewOverdue(null, 48, now), false);
  // BUS-002: a business-written window can't stretch past 72h.
  assert.equal(isReviewOverdue("2026-09-24T11:00:00Z", 168, now), true, "168h is capped at 72h");
  assert.equal(isReviewOverdue("2026-09-25T12:00:00Z", 168, now), false);
});

test("the enforced review window is at most 72 hours", () => {
  assert.equal(effectiveReviewWindowHours(null), 72);
  assert.equal(effectiveReviewWindowHours(0), 72);
  assert.equal(effectiveReviewWindowHours(-5), 72);
  assert.equal(effectiveReviewWindowHours(Number.NaN), 72);
  assert.equal(effectiveReviewWindowHours(48), 48);
  assert.equal(effectiveReviewWindowHours(72), 72);
  assert.equal(effectiveReviewWindowHours(168), 72);
});
