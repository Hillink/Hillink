import { expect, test } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { loginViaUserPortal, testUsers } from "./helpers/auth";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type UserIds = {
  adminId: string;
  business1Id: string;
  business2Id: string;
  athlete1Id: string;
  athlete2Id: string;
};

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function getUserIds(): Promise<UserIds> {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const users = data.users || [];
  const byEmail = (email: string) =>
    users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase())?.id;

  const adminId = byEmail(testUsers.admin.email);
  const business1Id = byEmail(testUsers.business1.email);
  const business2Id = byEmail(testUsers.business2.email);
  const athlete1Id = byEmail(testUsers.athlete1.email);
  const athlete2Id = byEmail(testUsers.athlete2.email);

  if (!adminId || !business1Id || !business2Id || !athlete1Id || !athlete2Id) {
    throw new Error("Missing seeded users. Run npm run test:seed.");
  }

  return { adminId, business1Id, business2Id, athlete1Id, athlete2Id };
}

async function createCampaign(businessId: string, titleSuffix: string) {
  const { data, error } = await adminClient
    .from("campaigns")
    .insert({
      business_id: businessId,
      title: `Disputes E2E ${titleSuffix}-${Math.random().toString(36).slice(2, 8)}`,
      campaign_type: "basic_post",
      deliverables: "1 post",
      preferred_tier: "Bronze",
      payout_cents: 5000,
      slots: 2,
      open_slots: 2,
      start_date: plusHours(48),
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  return data.id as string;
}

async function createAcceptedApplication(campaignId: string, athleteId: string) {
  const { data, error } = await adminClient
    .from("campaign_applications")
    .insert({
      campaign_id: campaignId,
      athlete_id: athleteId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createAcceptedApplication failed: ${error?.message || "unknown"}`);
  }
  return data.id as string;
}

async function createHeldPayment(applicationId: string, athleteId: string) {
  const { data, error } = await adminClient
    .from("payments")
    .insert({
      application_id: applicationId,
      athlete_id: athleteId,
      amount_cents: 5000,
      hold_status: "held",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createHeldPayment failed: ${error?.message || "unknown"}`);
  }
  return data.id as string;
}

async function openDisputeViaApi(
  page: import("@playwright/test").Page,
  applicationId: string,
  reason: string,
  evidenceUrls: string[] = []
) {
  const response = await page.request.post(`${APP_URL}/api/disputes/open`, {
    data: { applicationId, reason, evidenceUrls },
  });
  return response;
}

async function resolveDisputeAsAdmin(
  page: import("@playwright/test").Page,
  disputeId: string,
  status: string,
  resolutionNotes: string
) {
  const response = await page.request.patch(`${APP_URL}/api/disputes/${disputeId}/resolve`, {
    data: { status, resolutionNotes },
  });
  return response;
}

async function getDispute(disputeId: string) {
  const { data, error } = await adminClient
    .from("disputes")
    .select("*")
    .eq("id", disputeId)
    .single();

  if (error) throw new Error(`getDispute failed: ${error.message}`);
  return data;
}

async function getPayment(applicationId: string) {
  const { data } = await adminClient
    .from("payments")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();
  return data;
}

test.describe("Module 7 dispute handling checklist", () => {
  // ── 1. Athlete opens dispute → payment freezes ─────────────────────────────
  test("Athlete opens dispute → payment hold_status becomes 'disputed'", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "freeze");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);

    const res = await openDisputeViaApi(
      page,
      appId,
      "Business rejected my approved deliverable without explanation"
    );

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.dispute.status).toBe("open");
    expect(body.dispute.application_id).toBe(appId);

    // Trigger ran → payment frozen
    const payment = await getPayment(appId);
    expect(payment?.hold_status).toBe("disputed");
  });

  // ── 2. Duplicate dispute blocked with 409 ──────────────────────────────────
  test("Same party cannot open a second active dispute for the same application (409)", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "dup");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);

    const first = await openDisputeViaApi(
      page,
      appId,
      "Business rejected my approved deliverable without explanation"
    );
    expect(first.status()).toBe(201);

    const second = await openDisputeViaApi(
      page,
      appId,
      "Attempting to open a duplicate dispute here again now"
    );
    expect(second.status()).toBe(409);
  });

  // ── 3. Dispute after payout released → 422 ────────────────────────────────
  test("Cannot open dispute after payout already released (422)", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "post-release");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);

    // Insert payment already in 'released' state
    await adminClient.from("payments").insert({
      application_id: appId,
      athlete_id: athlete1Id,
      amount_cents: 5000,
      hold_status: "released",
      payout_at: new Date().toISOString(),
    });

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);

    const res = await openDisputeViaApi(
      page,
      appId,
      "Trying to dispute after money was already paid out to me"
    );
    expect(res.status()).toBe(422);
  });

  // ── 4. Non-party cannot open dispute (403) ────────────────────────────────
  test("Unrelated business cannot open dispute for another business's application (403)", async ({ page }) => {
    const { business1Id, business2Id, athlete1Id } = await getUserIds();

    // business1 owns campaign, athlete1 applied
    const campaignId = await createCampaign(business1Id, "xbiz");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    // business2 tries to open dispute on business1's application
    await loginViaUserPortal(page, testUsers.business2.email, testUsers.business2.password);

    const res = await openDisputeViaApi(
      page,
      appId,
      "Trying to interfere with another company's campaign application"
    );
    expect(res.status()).toBe(403);
  });

  // ── 5. Admin can move dispute to under_review ─────────────────────────────
  test("Admin moves dispute to under_review successfully", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "review");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    // Athlete opens dispute
    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    const openRes = await openDisputeViaApi(
      page,
      appId,
      "Content was delivered but business claims it was not posted"
    );
    expect(openRes.status()).toBe(201);
    const openBody = await openRes.json();
    const disputeId = openBody.dispute.id as string;

    // Admin logs in and moves to under_review
    await loginViaUserPortal(page, testUsers.admin.email, testUsers.admin.password);
    const reviewRes = await resolveDisputeAsAdmin(page, disputeId, "under_review", "");
    expect(reviewRes.status()).toBe(200);

    const updated = await getDispute(disputeId);
    expect(updated.status).toBe("under_review");
    // Payment still frozen during review
    const payment = await getPayment(appId);
    expect(payment?.hold_status).toBe("disputed");
  });

  // ── 6. Admin resolves in athlete's favour → payout released ───────────────
  test("Admin resolves dispute for athlete → payment hold_status becomes 'released'", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "resolve-athlete");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    const openRes = await openDisputeViaApi(
      page,
      appId,
      "Business refused to acknowledge submitted proof of content delivery"
    );
    const disputeId = (await openRes.json()).dispute.id as string;

    await loginViaUserPortal(page, testUsers.admin.email, testUsers.admin.password);
    const resolveRes = await resolveDisputeAsAdmin(
      page,
      disputeId,
      "resolved_athlete",
      "Evidence reviewed. Athlete submitted post with timestamp. Business claim rejected."
    );
    expect(resolveRes.status()).toBe(200);

    const updated = await getDispute(disputeId);
    expect(updated.status).toBe("resolved_athlete");
    expect(updated.resolved_by).not.toBeNull();
    expect(updated.resolved_at).not.toBeNull();
    expect(updated.resolution_notes?.length).toBeGreaterThan(0);

    // Trigger ran → payment released
    const payment = await getPayment(appId);
    expect(payment?.hold_status).toBe("released");
    expect(payment?.payout_at).not.toBeNull();
  });

  // ── 7. Admin resolves in business's favour → payment refunded ─────────────
  test("Admin resolves dispute for business → payment hold_status becomes 'refunded'", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "resolve-biz");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.business1.email, testUsers.business1.password);
    const openRes = await openDisputeViaApi(
      page,
      appId,
      "Athlete submitted incorrect content that did not match campaign brief at all"
    );
    const disputeId = (await openRes.json()).dispute.id as string;

    await loginViaUserPortal(page, testUsers.admin.email, testUsers.admin.password);
    const resolveRes = await resolveDisputeAsAdmin(
      page,
      disputeId,
      "resolved_business",
      "Content reviewed. Post did not match campaign brief. Business refunded."
    );
    expect(resolveRes.status()).toBe(200);

    const payment = await getPayment(appId);
    expect(payment?.hold_status).toBe("refunded");
  });

  // ── 8. Resolution without notes → 422 ────────────────────────────────────
  test("Admin resolving dispute without resolutionNotes fails with 422", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "no-notes");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    const openRes = await openDisputeViaApi(
      page,
      appId,
      "Business rejected my approved deliverable without valid explanation"
    );
    const disputeId = (await openRes.json()).dispute.id as string;

    await loginViaUserPortal(page, testUsers.admin.email, testUsers.admin.password);
    const res = await resolveDisputeAsAdmin(page, disputeId, "resolved_athlete", "");
    expect(res.status()).toBe(422);
  });

  // ── 9. Resolving an already-resolved dispute → 409 ────────────────────────
  test("Resolving an already-resolved dispute returns 409", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "double-resolve");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    const openRes = await openDisputeViaApi(
      page,
      appId,
      "Requesting dispute review for content submitted and rejected unfairly"
    );
    const disputeId = (await openRes.json()).dispute.id as string;

    await loginViaUserPortal(page, testUsers.admin.email, testUsers.admin.password);

    const first = await resolveDisputeAsAdmin(
      page,
      disputeId,
      "resolved_athlete",
      "Reviewed. Athlete wins. Payment released."
    );
    expect(first.status()).toBe(200);

    const second = await resolveDisputeAsAdmin(
      page,
      disputeId,
      "resolved_business",
      "Trying to reverse the decision already made above now"
    );
    expect(second.status()).toBe(409);
  });

  // ── 10. SLA deadline is set on dispute open ───────────────────────────────
  test("Dispute sla_deadline is set approximately 7 days from now on creation", async ({ page }) => {
    const { business1Id, athlete1Id } = await getUserIds();

    const campaignId = await createCampaign(business1Id, "sla");
    const appId = await createAcceptedApplication(campaignId, athlete1Id);
    await createHeldPayment(appId, athlete1Id);

    await loginViaUserPortal(page, testUsers.athlete1.email, testUsers.athlete1.password);
    const res = await openDisputeViaApi(
      page,
      appId,
      "Business paid late and now disputes my content submission evidence"
    );
    expect(res.status()).toBe(201);

    const body = await res.json();
    const slaDeadline = new Date(body.dispute.sla_deadline).getTime();
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Within 60 seconds of expected 7-day window
    expect(Math.abs(slaDeadline - expected)).toBeLessThan(60_000);
  });
});
