// Customer code flow against a local Supabase. See docs/PAYMENTS_AND_LOCAL_TESTING.md for setup.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  businessForStaffToken,
  getOrCreatePromoCode,
  recordRedemption,
  rotateStaffLink,
} from "../../lib/redemptions/server.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key ? "set LOCAL_SUPABASE_URL and LOCAL_SUPABASE_SERVICE_ROLE_KEY" : false;

let admin: SupabaseClient;
let businessId: string;
let otherBusinessId: string;
let athleteId: string;

async function makeUser(role: string, extra?: (id: string) => PromiseLike<unknown>) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").upsert({ id: data.user.id, role });
  if (extra) await extra(data.user.id);
  return data.user.id;
}

async function makeApplication(status: string, forBusiness = businessId) {
  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .insert({ business_id: forBusiness, title: "Taco Tuesday", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: 5000, slots: 3 })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const { data: app, error: aErr } = await admin
    .from("campaign_applications")
    .insert({ campaign_id: campaign.id, athlete_id: athleteId, status })
    .select("id")
    .single();
  if (aErr) throw aErr;
  return app.id as string;
}

// Each redemption test uses its own code, so the 60-second duplicate window doesn't leak between tests.
async function freshCode() {
  const applicationId = await makeApplication("accepted");
  const r = await getOrCreatePromoCode(admin, { applicationId, athleteId });
  assert.ok(r.ok);
  return { applicationId, code: r.ok ? r.code.code : "" };
}

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  businessId = await makeUser("business", (id) => admin.from("business_profiles").upsert({ id, business_name: "Joe's Tacos" }));
  otherBusinessId = await makeUser("business");
  athleteId = await makeUser("athlete", (id) => admin.from("athlete_profiles").upsert({ id, first_name: "Jake" }));
});

test("an accepted athlete gets one stable code with their name", { skip }, async () => {
  const applicationId = await makeApplication("accepted");
  const a = await getOrCreatePromoCode(admin, { applicationId, athleteId });
  const b = await getOrCreatePromoCode(admin, { applicationId, athleteId });
  assert.ok(a.ok && b.ok);
  assert.match(a.ok ? a.code.code : "", /^JAKE-[A-Z0-9]{4}$/);
  assert.equal(a.ok && a.code.id, b.ok && b.code.id);
});

test("ten simultaneous requests still make one code", { skip }, async () => {
  const applicationId = await makeApplication("accepted");
  const results = await Promise.all(Array.from({ length: 10 }, () => getOrCreatePromoCode(admin, { applicationId, athleteId })));
  const codes = new Set(results.map((r) => (r.ok ? r.code.code : "fail")));
  assert.equal(codes.size, 1);
  assert.ok(!codes.has("fail"));
});

test("no code before acceptance, and not for someone else's application", { skip }, async () => {
  const applied = await makeApplication("applied");
  const r1 = await getOrCreatePromoCode(admin, { applicationId: applied, athleteId });
  assert.equal(r1.ok, false);
  const accepted = await makeApplication("accepted");
  const r2 = await getOrCreatePromoCode(admin, { applicationId: accepted, athleteId: otherBusinessId });
  assert.equal(r2.ok, false);
});

test("staff log a code once; a double tap isn't counted twice", { skip }, async () => {
  const { code } = await freshCode();
  const first = await recordRedemption(admin, { businessId, rawCode: code.toLowerCase().replace("-", " "), source: "staff_link", recordedBy: null, purchaseCents: 1250 });
  assert.ok(first.ok && !first.duplicate);
  assert.equal(first.ok && first.athleteFirstName, "Jake");
  const second = await recordRedemption(admin, { businessId, rawCode: code, source: "staff_link", recordedBy: null });
  assert.ok(second.ok && second.duplicate);
  const { count } = await admin.from("redemptions").select("id", { count: "exact", head: true }).eq("promo_code_id", (await admin.from("athlete_promo_codes").select("id").eq("code", code).single()).data!.id);
  assert.equal(count, 1);
});

test("a business can't log another business's code", { skip }, async () => {
  const { code } = await freshCode();
  const r = await recordRedemption(admin, { businessId: otherBusinessId, rawCode: code, source: "business", recordedBy: otherBusinessId });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 404);
});

test("codes stop working when the athlete leaves the campaign", { skip }, async () => {
  const { applicationId, code } = await freshCode();
  await admin.from("campaign_applications").update({ status: "withdrawn" }).eq("id", applicationId);
  const r = await recordRedemption(admin, { businessId, rawCode: code, source: "business", recordedBy: businessId });
  assert.equal(r.ok, false);
});

test("junk input and bad amounts are rejected", { skip }, async () => {
  const { code } = await freshCode();
  assert.equal((await recordRedemption(admin, { businessId, rawCode: "hello", source: "business", recordedBy: null })).ok, false);
  assert.equal((await recordRedemption(admin, { businessId, rawCode: code, source: "business", recordedBy: null, purchaseCents: -5 })).ok, false);
});

test("staff links: only the newest works, and only its hash is stored", { skip }, async () => {
  const oldToken = await rotateStaffLink(admin, businessId);
  const newToken = await rotateStaffLink(admin, businessId);
  assert.equal(await businessForStaffToken(admin, oldToken), null);
  const found = await businessForStaffToken(admin, newToken);
  assert.equal(found?.businessId, businessId);
  assert.equal(found?.businessName, "Joe's Tacos");
  const { data } = await admin.from("business_staff_links").select("token_hash").eq("business_id", businessId).single();
  assert.notEqual(data!.token_hash, newToken);
  assert.equal(await businessForStaffToken(admin, "short"), null);
});

test("signed-in users can't read other businesses' redemptions", { skip }, async () => {
  const { code } = await freshCode();
  await recordRedemption(admin, { businessId, rawCode: code, source: "business", recordedBy: businessId });
  const email = `peek-${Date.now()}@test.local`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  await admin.from("profiles").upsert({ id: u.user!.id, role: "business" });
  const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
  if (!anonKey) return;
  const client = createClient(url!, anonKey, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: "Password123!" });
  const { data: rows } = await client.from("redemptions").select("id").eq("business_id", businessId);
  assert.equal((rows || []).length, 0);
  const { data: links } = await client.from("business_staff_links").select("*");
  assert.equal((links || []).length, 0);
});

test("owner and staff logging the same code at the same moment count once", { skip }, async () => {
  const { code } = await freshCode();
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      recordRedemption(admin, { businessId, rawCode: code, source: i % 2 ? "staff_link" : "business", recordedBy: null })
    )
  );
  assert.ok(results.every((r) => r.ok));
  assert.equal(results.filter((r) => r.ok && !r.duplicate).length, 1);
  const { data: promo } = await admin.from("athlete_promo_codes").select("id").eq("code", code).single();
  const { count } = await admin.from("redemptions").select("id", { count: "exact", head: true }).eq("promo_code_id", promo!.id);
  assert.equal(count, 1);
});

test("a code stops at 50 customers a day", { skip }, async () => {
  const { applicationId, code } = await freshCode();
  const { data: promo } = await admin.from("athlete_promo_codes").select("id, campaign_id").eq("code", code).single();
  // 50 earlier today, spread out so none is inside the duplicate window.
  const rows = Array.from({ length: 50 }, (_, i) => ({
    promo_code_id: promo!.id, application_id: applicationId, campaign_id: promo!.campaign_id, athlete_id: athleteId,
    business_id: businessId, source: "business", redeemed_at: new Date(Date.now() - (i + 2) * 5 * 60 * 1000).toISOString(),
  }));
  await admin.from("redemptions").insert(rows);
  const r = await recordRedemption(admin, { businessId, rawCode: code, source: "staff_link", recordedBy: null });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 429);
});

test("monthly totals come from the database, grouped by campaign and athlete", { skip }, async () => {
  const { code } = await freshCode();
  await recordRedemption(admin, { businessId, rawCode: code, source: "business", recordedBy: null, purchaseCents: 900 });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const { data, error } = await admin.rpc("business_redemption_totals", { p_business_id: businessId, p_start: start, p_end: end });
  assert.equal(error, null);
  const total = (data as { customers: number }[]).reduce((s, r) => s + Number(r.customers), 0);
  assert.ok(total >= 1);
  // Signed-in users can't call it for someone else's business.
  const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url!, anonKey, { auth: { persistSession: false } });
    const denied = await anon.rpc("business_redemption_totals", { p_business_id: businessId, p_start: start, p_end: end });
    assert.ok(denied.error);
    const denied2 = await anon.rpc("record_redemption_once", { p_promo_code_id: "00000000-0000-0000-0000-000000000000", p_source: "business", p_recorded_by: null, p_purchase_cents: null, p_note: null });
    assert.ok(denied2.error);
  }
});
