import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHillinkScore, improvementTip, scoreLabel } from "../../lib/score/hillinkScore.ts";

test("a brand-new athlete starts in the middle and is provisional", () => {
  const s = computeHillinkScore({});
  assert.ok(s.score >= 55 && s.score <= 70, `got ${s.score}`);
  assert.equal(s.provisional, true);
});

test("a proven great athlete scores high", () => {
  const s = computeHillinkScore({ ratingCount: 12, ratingSum: 59, completed: 12, timed: 12, onTime: 12, firstTry: 12, trackedCampaigns: 10, customers: 60 });
  assert.ok(s.score >= 90, `got ${s.score}`);
  assert.equal(s.provisional, false);
});

test("a flaky athlete scores low", () => {
  const s = computeHillinkScore({ ratingCount: 8, ratingSum: 14, completed: 8, timed: 8, onTime: 1, firstTry: 2, trackedCampaigns: 6, customers: 0 });
  assert.ok(s.score < 45, `got ${s.score}`);
});

test("one bad rating doesn't sink a new athlete", () => {
  const s = computeHillinkScore({ ratingCount: 1, ratingSum: 1, completed: 1, timed: 1, onTime: 1, firstTry: 1 });
  assert.ok(s.score >= 45, `got ${s.score}`);
});

test("campaigns without code tracking don't count against customers", () => {
  const untracked = computeHillinkScore({ completed: 10, timed: 10, onTime: 10, firstTry: 10, trackedCampaigns: 0, customers: 0 });
  const trackedZero = computeHillinkScore({ completed: 10, timed: 10, onTime: 10, firstTry: 10, trackedCampaigns: 10, customers: 0 });
  assert.ok(untracked.parts.customers > trackedZero.parts.customers);
});

test("weights add up and parts stay in range for junk input", () => {
  const s = computeHillinkScore({ ratingCount: -5, ratingSum: NaN, completed: 3, onTime: 99, timed: 3, firstTry: 99, customers: 1e9, trackedCampaigns: 1 });
  for (const v of Object.values(s.parts)) assert.ok(v >= 0 && v <= 100);
  assert.ok(s.score >= 0 && s.score <= 100);
});

test("labels and tips", () => {
  assert.equal(scoreLabel(null), "New");
  assert.equal(scoreLabel(92), "Excellent");
  assert.equal(scoreLabel(30), "Needs work");
  assert.match(improvementTip({ rating: 90, onTime: 20, firstTry: 90, customers: 90 }), /deadline/);
  assert.match(improvementTip({ rating: 90, onTime: 90, firstTry: 90, customers: 10 }), /customer code/);
});
