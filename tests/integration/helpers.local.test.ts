// Eligibility rules and proof auto-approval against a local Supabase with a fake Stripe.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runAutoApprove } from "../../lib/automation/autoApprove.ts";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const skip = !url || !key || !anonKey ? "set LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY and LOCAL_SUPABASE_ANON_KEY" : false;

let admin: SupabaseClient;
let businessId: string;
const PW = "Password123!";

function fakeStripe() {
  const state = { transfers: 0 };
  const client = {
    transfers: {
      list: async () => ({ data: [] }),
      create: async () => {
        state.transfers++;
        return { id: `tr_auto_${Date.now()}_${state.transfers}` };
      },
    },
  };
  return { state, get: () => client as never };
}

async function makeUser(role: "athlete" | "business") {
  const email = `${role}-helpers-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").upsert({ id: data.user.id, role });
  return { id: data.user.id, email };
}

async function eligibleAthlete(extra: Record<string, unknown> = {}) {
  const u = await makeUser("athlete");
  await admin.from("athlete_profiles").upsert({
    id: u.id, first_name: "Test", confirmed_adult: true, visa_status: "us_citizen_or_resident",
    school_disclosure_ack: true, compliance_confirmed_at: new Date().toISOString(), ...extra,
  });
  return u;
}

async function signedIn(email: string) {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

async function makeCampaign(fields: Record<string, unknown> = {}, owner = businessId) {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ business_id: owner, title: "Helpers", deliverables: "1 post", preferred_tier: "Bronze", payout_cents: 5000, slots: 5, review_window_hours: 48, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

before(async () => {
  if (skip) return;
  admin = createClient(url!, key!, { auth: { persistSession: false } });
  businessId = (await makeUser("business")).id;
  await admin.from("business_profiles").upsert({ id: businessId, business_name: "Helper Cafe", category_key: "apparel" });
});

test("athletes who haven't confirmed eligibility can't join", { skip }, async () => {
  const u = await makeUser("athlete");
  await admin.from("athlete_profiles").upsert({ id: u.id, first_name: "New" });
  const c = await signedIn(u.email);
  const { error } = await c.from("campaign_applications").insert({ campaign_id: await makeCampaign(), athlete_id: u.id, status: "applied" });
  assert.match(error?.message || "", /compliance_required/);
});

test("uncleared international athletes can't join", { skip }, async () => {
  const u = await eligibleAthlete({ visa_status: "international_not_cleared" });
  const c = await signedIn(u.email);
  const { error } = await c.from("campaign_applications").insert({ campaign_id: await makeCampaign(), athlete_id: u.id, status: "applied" });
  assert.match(error?.message || "", /visa_not_cleared/);
});

test("a school exclusive deal blocks that category only", { skip }, async () => {
  const u = await eligibleAthlete({ school_conflict_categories: ["apparel"] });
  const c = await signedIn(u.email);
  const blocked = await c.from("campaign_applications").insert({ campaign_id: await makeCampaign(), athlete_id: u.id, status: "applied" });
  assert.match(blocked.error?.message || "", /school_conflict/);

  const other = (await makeUser("business")).id;
  await admin.from("business_profiles").upsert({ id: other, business_name: "Taco", category_key: "restaurant" });
  const ok = await c.from("campaign_applications").insert({ campaign_id: await makeCampaign({}, other), athlete_id: u.id, status: "applied" });
  assert.equal(ok.error, null);
});

test("restricted categories can't be saved", { skip }, async () => {
  const b = await makeUser("business");
  const c = await signedIn(b.email);
  const { error } = await c.from("business_profiles").upsert({ id: b.id, business_name: "Bets", category_key: "gambling" });
  assert.ok(error);
});

test("athletes can't skip the eligibility check by editing their profile to junk", { skip }, async () => {
  const u = await eligibleAthlete();
  const c = await signedIn(u.email);
  const { error } = await c.from("athlete_profiles").update({ visa_status: "whatever" }).eq("id", u.id);
  assert.ok(error);
});

test("overdue funded proof is approved and paid; unfunded and recent proof is left alone", { skip }, async () => {
  const athlete = await eligibleAthlete();
  await admin.from("athlete_payout_profiles").upsert({
    athlete_id: athlete.id, payout_method: "stripe_connect", recipient_name: "Test", stripe_account_id: "acct_test", payout_ready: true, stripe_onboarding_complete: true,
  });
  const mk = async (submittedHoursAgo: number, funded: boolean) => {
    const { data: app } = await admin
      .from("campaign_applications")
      .insert({ campaign_id: await makeCampaign(), athlete_id: athlete.id, status: "submitted", submitted_at: hoursAgo(submittedHoursAgo), proof_url: "https://instagram.com/p/x" })
      .select("id")
      .single();
    await admin.from("payments").insert({
      application_id: app!.id, business_id: businessId, athlete_id: athlete.id, amount_cents: 5000,
      hold_status: funded ? "held" : "uncommitted", funding_source: funded ? "checkout" : null, stripe_charge_id: funded ? "ch_x" : null,
    });
    return app!.id as string;
  };
  const overdue = await mk(60, true);
  const recent = await mk(10, true);
  const unfunded = await mk(60, false);

  const stripe = fakeStripe();
  const summary = await runAutoApprove(admin, stripe.get);
  assert.deepEqual(summary.errors, []);

  const status = async (id: string) => (await admin.from("campaign_applications").select("status").eq("id", id).single()).data!.status;
  assert.equal(await status(overdue), "approved");
  assert.equal(await status(recent), "submitted");
  assert.equal(await status(unfunded), "submitted");
  const { data: pay } = await admin.from("payments").select("hold_status, stripe_transfer_id").eq("application_id", overdue).single();
  assert.equal(pay!.hold_status, "released");
  assert.ok(pay!.stripe_transfer_id);
  const { data: reminded } = await admin.from("campaign_applications").select("funding_reminder_sent_at").eq("id", unfunded).single();
  assert.ok(reminded!.funding_reminder_sent_at, "business reminded to fund");

  // Running again doesn't pay twice or remind twice.
  const again = await runAutoApprove(admin, stripe.get);
  assert.equal(stripe.state.transfers, 1);
  const { data: remindedAgain } = await admin.from("campaign_applications").select("funding_reminder_sent_at").eq("id", unfunded).single();
  assert.equal(remindedAgain!.funding_reminder_sent_at, reminded!.funding_reminder_sent_at);
  assert.deepEqual(again.errors, []);
});

test("overdue deliverables are approved and the application completes", { skip }, async () => {
  const athlete = await eligibleAthlete();
  const campaignId = await makeCampaign();
  const { data: req } = await admin.from("deliverable_requirements").insert({ campaign_id: campaignId, type: "instagram_post", is_required: true }).select("id").single();
  const { data: app } = await admin
    .from("campaign_applications")
    .insert({ campaign_id: campaignId, athlete_id: athlete.id, status: "accepted" })
    .select("id")
    .single();
  await admin.from("payments").insert({ application_id: app!.id, business_id: businessId, athlete_id: athlete.id, amount_cents: 5000, hold_status: "held" });
  await admin.from("deliverable_submissions").insert({
    application_id: app!.id, requirement_id: req!.id, athlete_id: athlete.id, submission_url: "https://instagram.com/p/y", status: "pending_review", submitted_at: hoursAgo(50),
  });

  const summary = await runAutoApprove(admin, fakeStripe().get);
  assert.deepEqual(summary.errors, []);
  const { data: after } = await admin.from("campaign_applications").select("status, reviewed_at").eq("id", app!.id).single();
  assert.equal(after!.status, "completed");
  assert.ok(after!.reviewed_at);
});

test("work under an open dispute is never auto-approved", { skip }, async () => {
  const athlete = await eligibleAthlete();
  const { data: app } = await admin
    .from("campaign_applications")
    .insert({ campaign_id: await makeCampaign(), athlete_id: athlete.id, status: "submitted", submitted_at: hoursAgo(80), proof_url: "https://instagram.com/p/z" })
    .select("id")
    .single();
  await admin.from("payments").insert({ application_id: app!.id, business_id: businessId, athlete_id: athlete.id, amount_cents: 5000, hold_status: "held" });
  const { error: disputeError } = await admin.from("disputes").insert({ application_id: app!.id, opened_by: businessId, opened_by_role: "business", reason: "Post was deleted", status: "open" });
  assert.equal(disputeError, null, disputeError?.message);
  // The freeze trigger marks the payment disputed; put it back to "held" to test the job's own check.
  await admin.from("payments").update({ hold_status: "held" }).eq("application_id", app!.id);

  const stripe = fakeStripe();
  await runAutoApprove(admin, stripe.get);
  const { data: after } = await admin.from("campaign_applications").select("status").eq("id", app!.id).single();
  assert.equal(after!.status, "submitted");
  assert.equal(stripe.state.transfers, 0);
});

test("a business can't ask the eligibility check about someone else's athlete", { skip }, async () => {
  const athlete = await eligibleAthlete({ visa_status: "international_not_cleared" });
  const b = await makeUser("business");
  const c = await signedIn(b.email);
  const { data, error } = await c.rpc("athlete_join_block", { p_athlete_id: athlete.id, p_campaign_id: await makeCampaign() });
  assert.ok(error, `expected refusal, got ${JSON.stringify(data)}`);
  const own = await (await signedIn(athlete.email)).rpc("athlete_join_block", { p_athlete_id: athlete.id, p_campaign_id: await makeCampaign() });
  assert.equal(own.data, "visa_not_cleared");
});

test("new campaigns auto-approve after 72 hours, and a payout that throws doesn't stop the run", { skip }, async () => {
  const athlete = await eligibleAthlete();
  await admin.from("athlete_payout_profiles").upsert({
    athlete_id: athlete.id, payout_method: "stripe_connect", recipient_name: "Test", stripe_account_id: "acct_test", payout_ready: true, stripe_onboarding_complete: true,
  });
  const mk = async (submittedHoursAgo: number) => {
    const { data: app } = await admin
      .from("campaign_applications")
      .insert({ campaign_id: await makeCampaign({ review_window_hours: undefined }), athlete_id: athlete.id, status: "submitted", submitted_at: hoursAgo(submittedHoursAgo), proof_url: "https://instagram.com/p/w" })
      .select("id")
      .single();
    await admin.from("payments").insert({
      application_id: app!.id, business_id: businessId, athlete_id: athlete.id, amount_cents: 5000, hold_status: "held", funding_source: "checkout", stripe_charge_id: "ch_x",
    });
    return app!.id as string;
  };
  const at50 = await mk(50);
  const at80 = await mk(80);
  const summary = await runAutoApprove(admin, () => {
    throw new Error("Missing STRIPE_SECRET_KEY");
  });
  const status = async (id: string) => (await admin.from("campaign_applications").select("status").eq("id", id).single()).data!.status;
  assert.equal(await status(at50), "submitted", "inside the 72h window");
  assert.equal(await status(at80), "approved");
  assert.ok(summary.errors.some((e) => e.includes(at80) && e.includes("STRIPE")), "payout failure recorded, not thrown");
});
