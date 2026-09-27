// Hillink Score, rating integrity and verified follower counts against a local Supabase.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { refreshAllScores, refreshInstagramFollowers } from "../../lib/score/server.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const skip = !url || !key || !anonKey ? "set LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY and LOCAL_SUPABASE_ANON_KEY" : false;
const PW = "Password123!";

let admin: SupabaseClient;
let business: { id: string; email: string };

async function makeUser(role: "athlete" | "business") {
  const email = `${role}-score-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").upsert({ id: data.user.id, role });
  if (role === "athlete") await admin.from("athlete_profiles").upsert({ id: data.user.id, first_name: "Score" });
  return { id: data.user.id, email };
}

async function signedIn(email: string) {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

async function completedCampaign(athleteId: string, opts: { onTime: boolean; rating?: number; customers?: number }) {
  const { data: c } = await admin
    .from("campaigns")
    .insert({ business_id: business.id, title: "Scored", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: 3000, slots: 2, completion_window_days: 3 })
    .select("id")
    .single();
  const { data: app } = await admin
    .from("campaign_applications")
    .insert({ campaign_id: c!.id, athlete_id: athleteId, status: "approved", accepted_at: daysAgo(10), submitted_at: opts.onTime ? daysAgo(9) : daysAgo(2) })
    .select("id")
    .single();
  if (opts.rating) await admin.from("athlete_ratings").insert({ athlete_id: athleteId, business_id: business.id, application_id: app!.id, rating: opts.rating });
  if (opts.customers) {
    const { data: promo } = await admin
      .from("athlete_promo_codes")
      .insert({ code: `SC${Math.floor(Math.random() * 1e6).toString(36).toUpperCase().padStart(4, "0").slice(0, 4)}-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "A").padEnd(4, "A")}`, application_id: app!.id, campaign_id: c!.id, athlete_id: athleteId, business_id: business.id })
      .select("id")
      .single();
    await admin.from("redemptions").insert(
      Array.from({ length: opts.customers }, () => ({ promo_code_id: promo!.id, application_id: app!.id, campaign_id: c!.id, athlete_id: athleteId, business_id: business.id, source: "business" }))
    );
  }
  return app!.id as string;
}

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  business = await makeUser("business");
});

test("a reliable athlete who brings customers outscores a late, low-rated one", { skip }, async () => {
  const star = await makeUser("athlete");
  const flaky = await makeUser("athlete");
  for (let i = 0; i < 4; i++) {
    await completedCampaign(star.id, { onTime: true, rating: 5, customers: 6 });
    await completedCampaign(flaky.id, { onTime: false, rating: 2, customers: 0 });
  }
  await refreshAllScores(admin);
  const { data } = await admin.from("athlete_scores").select("athlete_id, score, provisional, on_time_part").in("athlete_id", [star.id, flaky.id]);
  const s = new Map((data || []).map((r) => [r.athlete_id, r]));
  assert.ok(s.get(star.id)!.score >= 85, `star ${s.get(star.id)!.score}`);
  assert.ok(s.get(flaky.id)!.score < 50, `flaky ${s.get(flaky.id)!.score}`);
  assert.equal(s.get(star.id)!.provisional, false);
  assert.ok(s.get(star.id)!.on_time_part > s.get(flaky.id)!.on_time_part);
});

test("athletes can read scores but can't write their own", { skip }, async () => {
  const a = await makeUser("athlete");
  await refreshAllScores(admin);
  const c = await signedIn(a.email);
  const { data: mine } = await c.from("athlete_scores").select("score").eq("athlete_id", a.id).maybeSingle();
  assert.ok(mine, "athlete can read their score");
  await c.from("athlete_scores").update({ score: 100 }).eq("athlete_id", a.id);
  await c.from("athlete_scores").upsert({ athlete_id: a.id, score: 100, rating_part: 100, on_time_part: 100, first_try_part: 100, customers_part: 100 });
  const { data: after } = await admin.from("athlete_scores").select("score").eq("athlete_id", a.id).single();
  assert.notEqual(after!.score, 100);
});

test("athletes can't edit their own rating average, and a business rating updates it", { skip }, async () => {
  const a = await makeUser("athlete");
  const c = await signedIn(a.email);
  await c.from("athlete_profiles").update({ average_rating: 5, total_ratings: 99, bio: "hi" }).eq("id", a.id);
  const { data: tampered } = await admin.from("athlete_profiles").select("average_rating, total_ratings, bio").eq("id", a.id).single();
  assert.equal(tampered!.bio, "hi", "normal profile edits still work");
  assert.equal(tampered!.average_rating, null);
  assert.equal(tampered!.total_ratings, 0);

  const appId = await completedCampaign(a.id, { onTime: true });
  const b = await signedIn(business.email);
  const { error } = await b.from("athlete_ratings").insert({ athlete_id: a.id, business_id: business.id, application_id: appId, rating: 4 });
  assert.equal(error, null, error?.message);
  const { data: rated } = await admin.from("athlete_profiles").select("average_rating, total_ratings").eq("id", a.id).single();
  assert.equal(Number(rated!.average_rating), 4);
  assert.equal(rated!.total_ratings, 1);
});

test("verified follower counts come from Instagram and are checked at most weekly", { skip }, async () => {
  const a = await makeUser("athlete");
  await refreshAllScores(admin);
  await admin.from("athlete_instagram_connections").upsert({ athlete_id: a.id, ig_user_id: "17841400000000000", ig_username: "score_test", access_token: "tok", verified: true });
  let calls = 0;
  const fakeFetch = async (u: string) => {
    calls++;
    assert.match(u, /fields=followers_count/);
    return { ok: true, json: async () => ({ followers_count: 3456 }) };
  };
  await refreshInstagramFollowers(admin, fakeFetch, 1000);
  const { data } = await admin.from("athlete_scores").select("instagram_followers, followers_checked_at").eq("athlete_id", a.id).single();
  assert.equal(data!.instagram_followers, 3456);
  const before = calls;
  await refreshInstagramFollowers(admin, fakeFetch, 1000);
  const { data: again } = await admin.from("athlete_scores").select("followers_checked_at").eq("athlete_id", a.id).single();
  assert.equal(again!.followers_checked_at, data!.followers_checked_at, "not re-checked within a week");
  assert.ok(calls >= before);
});

test("ratings only count from the business that ran the campaign", { skip }, async () => {
  const a = await makeUser("athlete");
  const rival = await makeUser("athlete");
  const appId = await completedCampaign(a.id, { onTime: true });
  const rivalApp = await completedCampaign(rival.id, { onTime: true });
  const c = await signedIn(a.email);
  // Rating yourself, even while claiming to be the business.
  const self = await c.from("athlete_ratings").insert({ athlete_id: a.id, business_id: a.id, application_id: appId, rating: 5 });
  assert.notEqual(self.error, null, "athlete can't rate themselves");
  // A different business can't rate work on a campaign it didn't run.
  const other = await makeUser("business");
  const o = await signedIn(other.email);
  const stranger = await o.from("athlete_ratings").insert({ athlete_id: rival.id, business_id: other.id, application_id: rivalApp, rating: 1 });
  assert.notEqual(stranger.error, null, "stranger business can't rate");
  // A mismatched athlete on a real application is rejected too.
  const b = await signedIn(business.email);
  const mismatch = await b.from("athlete_ratings").insert({ athlete_id: rival.id, business_id: business.id, application_id: appId, rating: 1 });
  assert.notEqual(mismatch.error, null, "athlete must match the application");
  // Rows planted before the fix (inserted here by the server) don't count toward the average or the score.
  await admin.from("athlete_ratings").insert({ athlete_id: rival.id, business_id: other.id, application_id: appId, rating: 1 });
  const { data: p } = await admin.from("athlete_profiles").select("total_ratings").eq("id", rival.id).single();
  assert.equal(p!.total_ratings, 0);
});

test("athletes can't rewrite the timestamps the on-time part uses", { skip }, async () => {
  const a = await makeUser("athlete");
  const appId = await completedCampaign(a.id, { onTime: false });
  const { data: before } = await admin.from("campaign_applications").select("accepted_at, submitted_at").eq("id", appId).single();
  const c = await signedIn(a.email);
  await c.from("campaign_applications").update({ submitted_at: daysAgo(30), accepted_at: new Date().toISOString() }).eq("id", appId);
  const { data: after } = await admin.from("campaign_applications").select("accepted_at, submitted_at").eq("id", appId).single();
  assert.deepEqual(after, before);
});

test("campaigns without tracked proof rounds don't earn first-try credit", { skip }, async () => {
  const a = await makeUser("athlete");
  for (let i = 0; i < 4; i++) await completedCampaign(a.id, { onTime: true });
  await refreshAllScores(admin);
  const { data } = await admin.from("athlete_scores").select("first_try_part").eq("athlete_id", a.id).single();
  assert.equal(data!.first_try_part, 80, "stays at the starting value, not 100");
});

test("only Instagram-login connections are verified, and switching accounts clears the count", { skip }, async () => {
  const a = await makeUser("athlete");
  await refreshAllScores(admin);
  const c = await signedIn(a.email);
  // Direct write claiming to be verified: stored as unverified, never checked.
  await c.from("athlete_instagram_connections").upsert({ athlete_id: a.id, ig_user_id: "999", access_token: "brand-token", verified: true });
  const { data: conn } = await admin.from("athlete_instagram_connections").select("verified").eq("athlete_id", a.id).single();
  assert.equal(conn!.verified, false);
  const fetched: string[] = [];
  const fakeFetch = async (u: string) => {
    fetched.push(u);
    return { ok: true, json: async () => ({ followers_count: 1_000_000 }) };
  };
  await refreshInstagramFollowers(admin, fakeFetch, 500);
  assert.ok(!fetched.some((u) => u.includes("brand-token")), "unverified token never used");

  // A verified connection gets a count; the athlete then swaps the account id and the count is cleared.
  await admin.from("athlete_instagram_connections").upsert({ athlete_id: a.id, ig_user_id: "1784", access_token: "real", verified: true });
  await refreshInstagramFollowers(admin, fakeFetch, 500);
  const { data: counted } = await admin.from("athlete_scores").select("instagram_followers").eq("athlete_id", a.id).single();
  assert.equal(counted!.instagram_followers, 1_000_000);
  await c.from("athlete_instagram_connections").update({ ig_user_id: "999" }).eq("athlete_id", a.id);
  const { data: cleared } = await admin.from("athlete_scores").select("instagram_followers").eq("athlete_id", a.id).single();
  assert.equal(cleared!.instagram_followers, null);
});

test("a dead Instagram token is stamped and doesn't block other athletes", { skip }, async () => {
  const dead = await makeUser("athlete");
  const live = await makeUser("athlete");
  await refreshAllScores(admin);
  await admin.from("athlete_instagram_connections").upsert([
    { athlete_id: dead.id, ig_user_id: "1", access_token: "dead", verified: true },
    { athlete_id: live.id, ig_user_id: "2", access_token: "live", verified: true },
  ]);
  const fakeFetch = async (u: string) =>
    u.includes("dead") ? { ok: false, json: async () => ({ error: { message: "expired" } }) } : { ok: true, json: async () => ({ followers_count: 42 }) };
  await refreshInstagramFollowers(admin, fakeFetch, 500);
  const { data } = await admin.from("athlete_scores").select("athlete_id, instagram_followers, followers_checked_at").in("athlete_id", [dead.id, live.id]);
  const m = new Map((data || []).map((r) => [r.athlete_id, r]));
  assert.equal(m.get(live.id)!.instagram_followers, 42);
  assert.equal(m.get(dead.id)!.instagram_followers, null);
  assert.ok(m.get(dead.id)!.followers_checked_at, "failure is stamped");
});
