import { expect, test } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { loginViaUserPortal, testUsers } from "./helpers/auth";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type UserIds = {
  business1Id: string;
  athlete1Id: string;
  athlete2Id: string;
  athlete3Id: string;
};

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function getUserIds(): Promise<UserIds> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const users = data.users || [];
  const byEmail = (email: string) => users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase())?.id;

  const business1Id = byEmail(testUsers.business1.email);
  const athlete1Id = byEmail(testUsers.athlete1.email);
  const athlete2Id = byEmail(testUsers.athlete2.email);
  const athlete3Id = byEmail(testUsers.athlete3.email);

  if (!business1Id || !athlete1Id || !athlete2Id || !athlete3Id) {
    throw new Error("Missing seeded users. Run npm run test:seed.");
  }

  return { business1Id, athlete1Id, athlete2Id, athlete3Id };
}

async function ensureAthleteReady(athleteId: string) {
  const { error } = await admin
    .from("athlete_profiles")
    .update({
      is_verified: true,
      is_flagged: false,
      tier: "gold",
      latitude: 40.7128,
      longitude: -74.006,
    })
    .eq("id", athleteId);

  if (error) throw new Error(`ensureAthleteReady failed: ${error.message}`);
}

async function ensureBusinessCoords(businessId: string) {
  const { error } = await admin
    .from("business_profiles")
    .update({
      latitude: 40.713,
      longitude: -74.0062,
    })
    .eq("id", businessId);

  if (error) throw new Error(`ensureBusinessCoords failed: ${error.message}`);
}

async function createCampaign(businessId: string, opts?: { openSlots?: number; startHours?: number; status?: string }) {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      business_id: businessId,
      title: `Slots E2E ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaign_type: "basic_post",
      deliverables: "1 post",
      preferred_tier: "Bronze",
      payout_cents: 5000,
      slots: 5,
      open_slots: opts?.openSlots ?? 1,
      auto_accept_enabled: true,
      auto_accept_radius_miles: 50,
      auto_accept_lock_hours: 12,
      min_athlete_tier: "bronze",
      latitude: 40.713,
      longitude: -74.0062,
      start_date: plusHours(opts?.startHours ?? 48),
      status: opts?.status || "active",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

test("Module 4 slot locking checklist", async ({ browser }) => {
  const ids = await getUserIds();
  await ensureAthleteReady(ids.athlete1Id);
  await ensureAthleteReady(ids.athlete2Id);
  await ensureAthleteReady(ids.athlete3Id);
  await ensureBusinessCoords(ids.business1Id);

  const businessContext = await browser.newContext();
  const athlete1Context = await browser.newContext();
  const athlete2Context = await browser.newContext();

  const businessPage = await businessContext.newPage();
  const athlete1Page = await athlete1Context.newPage();
  const athlete2Page = await athlete2Context.newPage();

  await loginViaUserPortal(businessPage, testUsers.business1.email, testUsers.business1.password, /\/business/);
  await loginViaUserPortal(athlete1Page, testUsers.athlete1.email, testUsers.athlete1.password, /\/athlete/);
  await loginViaUserPortal(athlete2Page, testUsers.athlete2.email, testUsers.athlete2.password, /\/athlete/);

  // 1) one remaining slot with two simultaneous apply attempts -> exactly one success
  const c1 = await createCampaign(ids.business1Id, { openSlots: 1, startHours: 72, status: "active" });
  const [r1a, r1b] = await Promise.all([
    athlete1Context.request.post(`/api/campaigns/${c1}/apply`),
    athlete2Context.request.post(`/api/campaigns/${c1}/apply`),
  ]);

  const statuses = [r1a.status(), r1b.status()];
  expect(statuses.filter((s) => s === 201).length).toBe(1);
  expect(statuses.filter((s) => s === 422).length).toBe(1);

  // 2) accepted count is 3; setting open_slots=2 -> 422 below_accepted_count
  const c2 = await createCampaign(ids.business1Id, { openSlots: 5, startHours: 48, status: "active" });
  const { error: acceptedInsertError } = await admin.from("campaign_applications").insert([
    { campaign_id: c2, athlete_id: ids.athlete1Id, status: "accepted", applied_at: new Date().toISOString() },
    { campaign_id: c2, athlete_id: ids.athlete2Id, status: "accepted", applied_at: new Date().toISOString() },
    { campaign_id: c2, athlete_id: ids.athlete3Id, status: "accepted", applied_at: new Date().toISOString() },
  ]);
  if (acceptedInsertError) throw new Error(`accepted insert failed: ${acceptedInsertError.message}`);

  const r2 = await businessContext.request.patch(`/api/campaigns/${c2}/slots`, {
    data: { openSlots: 2 },
  });
  expect(r2.status()).toBe(422);
  const body2 = await r2.json();
  expect(body2.reason).toBe("below_filled_count");

  // 3) active campaign starts in 5h; changing slots is locked -> 422 locked_before_start
  const c3 = await createCampaign(ids.business1Id, { openSlots: 4, startHours: 5, status: "active" });
  const r3 = await businessContext.request.patch(`/api/campaigns/${c3}/slots`, {
    data: { openSlots: 3 },
  });
  expect(r3.status()).toBe(422);
  const body3 = await r3.json();
  expect(body3.reason).toBe("locked_before_start");

  await businessContext.close();
  await athlete1Context.close();
  await athlete2Context.close();
});