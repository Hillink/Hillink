// Rewards road: points ledger, badges and the store, against a local Supabase.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { claimReward, seasonBalance, syncAthleteRewards } from "../../lib/rewards/server.ts";
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

async function makeItem(cost: number, stock: number | null = null) {
  const { data, error } = await admin
    .from("reward_items")
    .insert({ name: `Test item ${cost}`, points_cost: cost, stock, active: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

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
