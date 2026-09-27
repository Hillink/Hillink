// Rewards road: points ledger, badges and the store, against a local Supabase.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_POINTS_CAP_PER_CAMPAIGN, claimReward, seasonBalance, syncAthleteRewards } from "../../lib/rewards/server.ts";
import { POINTS, seasonFor } from "../../lib/rewards/road.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const skip = !url || !key || !anonKey ? "set LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY and LOCAL_SUPABASE_ANON_KEY" : false;
const PW = "Password123!";

let admin: SupabaseClient;
let business: { id: string; email: string };

async function makeUser(role: "athlete" | "business") {
  const email = `${role}-rw-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").upsert({ id: data.user.id, role });
  if (role === "athlete") await admin.from("athlete_profiles").upsert({ id: data.user.id, first_name: "Rewards" });
  return { id: data.user.id, email };
}

async function signedIn(email: string) {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

async function giveXp(athleteId: string, xp: number) {
  const { error } = await admin.from("athlete_xp_events").insert({ athlete_id: athleteId, action: "complete_campaign", xp_delta: xp });
  if (error) throw error;
}

const madeItems: string[] = [];

async function makeItem(cost: number, stock: number | null = null) {
  const { data, error } = await admin
    .from("reward_items")
    .insert({ name: `Test item ${cost}`, points_cost: cost, stock, active: true })
    .select("id")
    .single();
  if (error) throw error;
  madeItems.push(data.id);
  return data.id as string;
}

// Switch test items off so they never show in the store of a shared database.
after(async () => {
  if (!skip && madeItems.length) await admin.from("reward_items").update({ active: false }).in("id", madeItems);
});

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  business = await makeUser("business");
});

test("XP this season turns into level points, paid once however often it syncs", { skip }, async () => {
  const a = await makeUser("athlete");
  await giveXp(a.id, 60 + 62 + 64 + 66); // exactly level 5
  const first = await syncAthleteRewards(admin, a.id);
  assert.equal(first.progress.level, 5);
  assert.equal(first.points, 4 * POINTS.perLevel + POINTS.milestone);
  const again = await syncAthleteRewards(admin, a.id);
  assert.equal(again.points, first.points);
});

test("customers who use the athlete's code earn points", { skip }, async () => {
  const a = await makeUser("athlete");
  const { data: c } = await admin
    .from("campaigns")
    .insert({ business_id: business.id, title: "RW", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: 3000, slots: 2 })
    .select("id")
    .single();
  const { data: app } = await admin.from("campaign_applications").insert({ campaign_id: c!.id, athlete_id: a.id, status: "accepted" }).select("id").single();
  const code = `RW${Date.now().toString(36).slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "Z").padEnd(4, "Z")}`;
  const { data: promo, error } = await admin
    .from("athlete_promo_codes")
    .insert({ code, application_id: app!.id, campaign_id: c!.id, athlete_id: a.id, business_id: business.id })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  await admin.from("redemptions").insert(
    Array.from({ length: 3 }, () => ({ promo_code_id: promo!.id, application_id: app!.id, campaign_id: c!.id, athlete_id: a.id, business_id: business.id, source: "business" }))
  );
  const state = await syncAthleteRewards(admin, a.id);
  assert.equal(state.points, 3 * POINTS.perCustomer);
});

test("athletes can read their own points but can't write any", { skip }, async () => {
  const a = await makeUser("athlete");
  const other = await makeUser("athlete");
  await giveXp(other.id, 500);
  await syncAthleteRewards(admin, other.id);
  const c = await signedIn(a.email);
  const planted = await c.from("athlete_points_ledger").insert({ athlete_id: a.id, season: seasonFor(new Date()).key, delta: 9999, reason: "x", ref: "x" });
  assert.notEqual(planted.error, null);
  const { data: theirs } = await c.from("athlete_points_ledger").select("id").eq("athlete_id", other.id);
  assert.equal(theirs!.length, 0, "can't see another athlete's points");
  const rpc = await c.rpc("claim_reward_item", { p_athlete_id: a.id, p_item_id: a.id, p_season: "x" });
  assert.notEqual(rpc.error, null, "claim function is server-only");
});

test("store: needs enough points, respects stock, and two taps can't spend twice", { skip }, async () => {
  const a = await makeUser("athlete");
  await giveXp(a.id, 60 + 62 + 64 + 66); // 65 points
  await syncAthleteRewards(admin, a.id);

  const pricey = await makeItem(1000);
  const tooMuch = await claimReward(admin, a.id, pricey);
  assert.equal(tooMuch.ok, false);

  const { data: inactive } = await admin.from("reward_items").insert({ name: "Off", points_cost: 1, active: false }).select("id").single();
  const off = await claimReward(admin, a.id, inactive!.id);
  assert.equal(off.ok, false);

  const item = await makeItem(50, 5);
  const [x, y] = await Promise.all([claimReward(admin, a.id, item), claimReward(admin, a.id, item)]);
  assert.equal([x, y].filter((r) => r.ok).length, 1, "only one claim fits the balance");
  const season = seasonFor(new Date()).key;
  assert.equal(await seasonBalance(admin, a.id, season), 15);
  const { data: stock } = await admin.from("reward_items").select("stock").eq("id", item).single();
  assert.equal(stock!.stock, 4);

  const b = await makeUser("athlete");
  await giveXp(b.id, 60 + 62 + 64 + 66);
  await syncAthleteRewards(admin, b.id);
  const lastOne = await makeItem(10, 0);
  const soldOut = await claimReward(admin, b.id, lastOne);
  assert.deepEqual(soldOut.ok ? null : soldOut.error, "That reward is out of stock.");
});

test("badges are awarded once and count toward points", { skip }, async () => {
  const a = await makeUser("athlete");
  await admin.from("athlete_scores").upsert({ athlete_id: a.id, score: 93, rating_part: 90, on_time_part: 95, first_try_part: 90, customers_part: 90, completed_campaigns: 5, provisional: false, instagram_followers: 1200 });
  const s = await syncAthleteRewards(admin, a.id);
  const earned = s.badges.filter((b) => b.earned).map((b) => b.key).sort();
  assert.deepEqual(earned, ["always_on_time", "first_campaign", "five_campaigns", "hillink_pro", "verified_reach"]);
  assert.equal(s.pro, true);
  assert.equal(s.points, earned.length * POINTS.badge);
  assert.equal((await syncAthleteRewards(admin, a.id)).points, s.points);
});

const LEVEL_5_XP = 60 + 62 + 64 + 66;

test("an XP challenge can only be awarded once, even from parallel requests", { skip }, async () => {
  const a = await makeUser("athlete");
  const row = { athlete_id: a.id, action: "weekly_activity_streak", xp_delta: 75, details_json: { source: "xp_challenge", challenge_id: "campaign-starter" } };
  const results = await Promise.all([admin.from("athlete_xp_events").insert(row), admin.from("athlete_xp_events").insert(row)]);
  assert.equal(results.filter((r) => r.error === null).length, 1);
  assert.equal(results.find((r) => r.error)?.error?.code, "23505");
});

test("points from XP that goes away are taken back, and paid again when re-earned", { skip }, async () => {
  const a = await makeUser("athlete");
  const { data: ev } = await admin.from("athlete_xp_events").insert({ athlete_id: a.id, action: "complete_campaign", xp_delta: LEVEL_5_XP }).select("id").single();
  assert.equal((await syncAthleteRewards(admin, a.id)).points, 4 * POINTS.perLevel + POINTS.milestone);
  await admin.from("athlete_xp_events").delete().eq("id", ev!.id);
  const lost = await syncAthleteRewards(admin, a.id);
  assert.equal(lost.progress.level, 1);
  assert.equal(lost.points, 0);
  await giveXp(a.id, LEVEL_5_XP);
  assert.equal((await syncAthleteRewards(admin, a.id)).points, 4 * POINTS.perLevel + POINTS.milestone);
  assert.equal((await syncAthleteRewards(admin, a.id)).points, 4 * POINTS.perLevel + POINTS.milestone, "stable once in line");
});

test("admin-set XP doesn't move the road", { skip }, async () => {
  const a = await makeUser("athlete");
  await admin.from("athlete_xp_events").insert({ athlete_id: a.id, action: "complete_campaign", xp_delta: 5000, details_json: { source: "admin_tier_set" } });
  const s = await syncAthleteRewards(admin, a.id);
  assert.equal(s.progress.level, 1);
  assert.equal(s.points, 0);
});

test("customer points are capped per campaign", { skip }, async () => {
  const a = await makeUser("athlete");
  const { data: c } = await admin
    .from("campaigns")
    .insert({ business_id: business.id, title: "Cap", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: 3000, slots: 2 })
    .select("id")
    .single();
  const { data: app } = await admin.from("campaign_applications").insert({ campaign_id: c!.id, athlete_id: a.id, status: "accepted" }).select("id").single();
  const code = `CP${Date.now().toString(36).slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "Z").padEnd(4, "Z")}`;
  const { data: promo, error } = await admin
    .from("athlete_promo_codes")
    .insert({ code, application_id: app!.id, campaign_id: c!.id, athlete_id: a.id, business_id: business.id })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  const ins = await admin.from("redemptions").insert(
    Array.from({ length: CUSTOMER_POINTS_CAP_PER_CAMPAIGN + 5 }, () => ({ promo_code_id: promo!.id, application_id: app!.id, campaign_id: c!.id, athlete_id: a.id, business_id: business.id, source: "business" }))
  );
  assert.equal(ins.error, null, ins.error?.message);
  const s = await syncAthleteRewards(admin, a.id);
  const { data: badgeRows } = await admin.from("athlete_points_ledger").select("delta").eq("athlete_id", a.id).like("ref", "badge:%");
  const badgePoints = (badgeRows || []).reduce((t, r) => t + r.delta, 0);
  assert.equal(s.points - badgePoints, CUSTOMER_POINTS_CAP_PER_CAMPAIGN * POINTS.perCustomer);
});

test("Pro track pays only for levels reached while Pro", { skip }, async () => {
  const a = await makeUser("athlete");
  await giveXp(a.id, LEVEL_5_XP);
  await syncAthleteRewards(admin, a.id);
  await admin.from("athlete_scores").upsert({ athlete_id: a.id, score: 93, rating_part: 90, on_time_part: 95, first_try_part: 90, customers_part: 90, completed_campaigns: 5, provisional: false });
  const nowPro = await syncAthleteRewards(admin, a.id);
  assert.equal(nowPro.pro, true);
  const proRefs = async () =>
    ((await admin.from("athlete_points_ledger").select("ref").eq("athlete_id", a.id).or("ref.like.pro:*,ref.like.promilestone:*")).data || []).map((r) => r.ref.split(":").pop());
  assert.deepEqual(await proRefs(), [], "levels 2-5 were reached before Pro");
  await giveXp(a.id, 68); // level 6
  await syncAthleteRewards(admin, a.id);
  assert.deepEqual(await proRefs(), ["6"]);
  // Losing Pro later keeps what was earned while Pro.
  await admin.from("athlete_scores").update({ score: 70 }).eq("athlete_id", a.id);
  await syncAthleteRewards(admin, a.id);
  const { data: rows } = await admin.from("athlete_points_ledger").select("delta").eq("athlete_id", a.id).eq("base_ref", `pro:${seasonFor(new Date()).key}:6`);
  assert.equal((rows || []).reduce((t, r) => t + r.delta, 0), POINTS.proPerLevel);
});

test("cancelling a reward request refunds the points and the stock, once", { skip }, async () => {
  const a = await makeUser("athlete");
  await giveXp(a.id, LEVEL_5_XP);
  const before = (await syncAthleteRewards(admin, a.id)).points;
  const item = await makeItem(40, 3);
  const claimed = await claimReward(admin, a.id, item);
  assert.equal(claimed.ok, true);
  const id = claimed.ok ? claimed.claimId : "";
  const first = await admin.rpc("cancel_reward_claim", { p_claim_id: id });
  assert.equal(first.data, true);
  const second = await admin.rpc("cancel_reward_claim", { p_claim_id: id });
  assert.equal(second.data, false);
  assert.equal(await seasonBalance(admin, a.id, seasonFor(new Date()).key), before);
  const { data: stock } = await admin.from("reward_items").select("stock").eq("id", item).single();
  assert.equal(stock!.stock, 3);
  const c = await signedIn(a.email);
  assert.notEqual((await c.rpc("cancel_reward_claim", { p_claim_id: id })).error, null, "cancel is server-only");
});
