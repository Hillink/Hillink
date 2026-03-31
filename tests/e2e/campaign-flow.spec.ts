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

async function mustGetUserIdByEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const user = (data.users || []).find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Missing auth user for ${email}. Run npm run test:seed.`);
  return user.id;
}

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function createCampaignForBusiness(businessId: string, title: string) {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      business_id: businessId,
      title,
      campaign_type: "basic_post",
      deliverables: "1 Instagram post and 1 story mention",
      preferred_tier: "Bronze",
      payout_cents: 7500,
      slots: 1,
      open_slots: 1,
      status: "active",
      start_date: plusHours(72),
      auto_accept_enabled: true,
      auto_accept_radius_miles: 50,
      auto_accept_lock_hours: 12,
      min_athlete_tier: "bronze",
      latitude: 30.2672,
      longitude: -97.7431,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

async function ensureAthleteReady(athleteId: string) {
  const { error } = await admin
    .from("athlete_profiles")
    .update({
      is_verified: true,
      is_flagged: false,
      tier: "gold",
      latitude: 30.2672,
      longitude: -97.7431,
    })
    .eq("id", athleteId);

  if (error) {
    throw new Error(`ensureAthleteReady failed: ${error.message}`);
  }
}

test("business and athlete can complete core campaign flow through submitted proof", async ({ browser }) => {
  const businessContext = await browser.newContext();
  const athleteContext = await browser.newContext();
  const businessPage = await businessContext.newPage();
  const athletePage = await athleteContext.newPage();

  await loginViaUserPortal(businessPage, testUsers.business1.email, testUsers.business1.password);
  await loginViaUserPortal(athletePage, testUsers.athlete1.email, testUsers.athlete1.password);

  const campaignTitle = `E2E Campaign ${Date.now()}`;
  const business1Id = await mustGetUserIdByEmail(testUsers.business1.email);
  const athlete1Id = await mustGetUserIdByEmail(testUsers.athlete1.email);
  await ensureAthleteReady(athlete1Id);
  const campaignId = await createCampaignForBusiness(business1Id, campaignTitle);

  const applyResponse = await athleteContext.request.post(`/api/campaigns/${campaignId}/apply`);
  expect(applyResponse.status()).toBe(201);
  const { applicationId } = await applyResponse.json() as { applicationId: string };

  await athletePage.reload({ waitUntil: "networkidle" });
  const activeDealCard = athletePage.locator(`#active-deals .mini-card[data-application-id="${applicationId}"]`);
  await expect(activeDealCard).toBeVisible();

  await activeDealCard
    .getByLabel("Proof URL (post/story/reel link)")
    .fill("https://www.instagram.com/p/TEST12345/");
  await activeDealCard.getByLabel("Notes").fill("E2E proof submission for smoke validation");
  await activeDealCard.getByRole("button", { name: "Submit Proof" }).click();

  await expect(athletePage.locator(".success-message")).toContainText(/Proof submitted/i);

  await businessContext.close();
  await athleteContext.close();
});
