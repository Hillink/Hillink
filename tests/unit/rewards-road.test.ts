import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LEVEL, POINTS, earnedBadges, isPro, levelFromXp, roadGrants, seasonFor, xpToReach } from "../../lib/rewards/road.ts";

test("seasons follow the semester", () => {
  assert.equal(seasonFor(new Date("2026-02-10T00:00:00Z")).key, "2026-spring");
  assert.equal(seasonFor(new Date("2026-06-15T00:00:00Z")).key, "2026-summer");
  const fall = seasonFor(new Date("2026-12-31T23:59:59Z"));
  assert.equal(fall.key, "2026-fall");
  assert.equal(fall.end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(seasonFor(new Date("2026-08-01T00:00:00Z")).start.toISOString(), "2026-08-01T00:00:00.000Z");
});

test("levels start at 1, cap at 50, and a busy semester gets far but not to the end", () => {
  assert.deepEqual(levelFromXp(0), { level: 1, xpIntoLevel: 0, xpForNext: 60, seasonXp: 0 });
  assert.equal(levelFromXp(59).level, 1);
  assert.equal(levelFromXp(60).level, 2);
  assert.equal(levelFromXp(-5).level, 1);
  assert.equal(levelFromXp(Number.NaN).level, 1);
  assert.equal(levelFromXp(xpToReach(MAX_LEVEL)).level, MAX_LEVEL);
  assert.equal(levelFromXp(1e9).xpForNext, null);
  // 8 campaigns (accept 25 + proof 20 + approved 40 + complete 120) is about level 20.
  const busy = levelFromXp(8 * 205).level;
  assert.ok(busy >= 15 && busy < 30, `busy semester level ${busy}`);
});

test("road grants pay each level once, with milestones and the Pro track", () => {
  const free = roadGrants("2026-fall", 10, false);
  assert.equal(free.filter((g) => g.ref.startsWith("level:")).length, 9);
  assert.equal(free.filter((g) => g.ref.startsWith("milestone:")).length, 2);
  assert.equal(free.reduce((s, g) => s + g.delta, 0), 9 * POINTS.perLevel + 2 * POINTS.milestone);
  const pro = roadGrants("2026-fall", 10, true);
  assert.ok(pro.length > free.length);
  assert.equal(new Set(pro.map((g) => g.ref)).size, pro.length, "refs are unique");
  assert.equal(roadGrants("2026-fall", 1, true).length, 0);
});

test("badges and Pro follow the athlete's record", () => {
  const base = { completedCampaigns: 0, customers: 0, lastRatings: [], onTimePart: null, score: null, provisional: true, verifiedFollowers: false };
  assert.deepEqual(earnedBadges(base), []);
  const star = { completedCampaigns: 6, customers: 12, lastRatings: [5, 5, 5, 3], onTimePart: 95, score: 92, provisional: false, verifiedFollowers: true };
  assert.deepEqual(earnedBadges(star).sort(), ["always_on_time", "first_campaign", "five_campaigns", "five_star_streak", "hillink_pro", "ten_customers", "verified_reach"]);
  assert.equal(isPro({ score: 95, provisional: true }), false, "new athletes can't be Pro yet");
  assert.ok(!earnedBadges({ ...star, lastRatings: [5, 4, 5] }).includes("five_star_streak"));
});
