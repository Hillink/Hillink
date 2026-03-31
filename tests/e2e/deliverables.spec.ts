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
  adminId: string;
  business1Id: string;
  business2Id: string;
  athlete1Id: string;
};

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function getUserIds(): Promise<UserIds> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const users = data.users || [];
  const byEmail = (email: string) => users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase())?.id;

  const adminId = byEmail(testUsers.admin.email);
  const business1Id = byEmail(testUsers.business1.email);
  const business2Id = byEmail(testUsers.business2.email);
  const athlete1Id = byEmail(testUsers.athlete1.email);

  if (!adminId || !business1Id || !business2Id || !athlete1Id) {
    throw new Error("Missing seeded users. Run npm run test:seed.");
  }

  return { adminId, business1Id, business2Id, athlete1Id };
}

async function createCampaign(businessId: string, titleSuffix: string) {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      business_id: businessId,
      title: `Deliverables E2E ${titleSuffix}-${Math.random().toString(36).slice(2, 8)}`,
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

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

async function createAcceptedApplication(campaignId: string, athleteId: string, acceptedAtIso?: string) {
  const acceptedAt = acceptedAtIso || new Date().toISOString();
  const { data, error } = await admin
    .from("campaign_applications")
    .insert({
      campaign_id: campaignId,
      athlete_id: athleteId,
      status: "accepted",
      applied_at: acceptedAt,
      decided_at: acceptedAt,
      accepted_at: acceptedAt,
      accepted_via: "manual",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createAcceptedApplication failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

async function createRequirement(campaignId: string, opts?: { isRequired?: boolean; deadlineDays?: number; type?: string }) {
  const { data, error } = await admin
    .from("deliverable_requirements")
    .insert({
      campaign_id: campaignId,
      type: opts?.type || "instagram_post",
      description: "Deliverable requirement",
      deadline_days_after_accept: opts?.deadlineDays ?? 14,
      is_required: opts?.isRequired ?? true,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createRequirement failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

test("Module 5 deliverable submission and approval checklist", async ({ browser }) => {
  const ids = await getUserIds();

  const { error: deliverablesSchemaError } = await admin
    .from("deliverable_requirements")
    .select("id")
    .limit(1);

  test.skip(
    !!deliverablesSchemaError && /could not find the table|does not exist/i.test(deliverablesSchemaError.message || ""),
    "Deliverables schema is not deployed in this environment"
  );

  const athleteContext = await browser.newContext();
  const business1Context = await browser.newContext();
  const business2Context = await browser.newContext();
  const adminContext = await browser.newContext();

  await loginViaUserPortal(await athleteContext.newPage(), testUsers.athlete1.email, testUsers.athlete1.password, /\/athlete/);
  await loginViaUserPortal(await business1Context.newPage(), testUsers.business1.email, testUsers.business1.password, /\/business/);
  await loginViaUserPortal(await business2Context.newPage(), testUsers.business2.email, testUsers.business2.password, /\/business/);
  await loginViaUserPortal(await adminContext.newPage(), testUsers.admin.email, testUsers.admin.password, /\/admin/);

  // 1) Athlete submits deliverable after due date -> 422 unless admin override
  const c1 = await createCampaign(ids.business1Id, "late");
  const acceptedOld = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const app1 = await createAcceptedApplication(c1, ids.athlete1Id, acceptedOld);
  const req1 = await createRequirement(c1, { deadlineDays: 1, isRequired: true });

  const lateRes = await athleteContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app1, requirementId: req1, submissionUrl: "https://example.com/post/late" },
  });
  expect(lateRes.status()).toBe(422);

  const adminLateOverride = await adminContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app1, requirementId: req1, submissionUrl: "https://example.com/post/admin", force: true },
  });
  expect(adminLateOverride.status()).toBe(201);

  // 2) Athlete submits same requirement twice -> version increments to 2
  const c2 = await createCampaign(ids.business1Id, "version");
  const app2 = await createAcceptedApplication(c2, ids.athlete1Id);
  const req2 = await createRequirement(c2, { deadlineDays: 14, isRequired: true });

  const submitV1 = await athleteContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app2, requirementId: req2, submissionUrl: "https://example.com/post/v1" },
  });
  expect(submitV1.status()).toBe(201);
  const bodyV1 = await submitV1.json();
  expect(bodyV1.submission?.version).toBe(1);

  const submitV2 = await athleteContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app2, requirementId: req2, submissionUrl: "https://example.com/post/v2" },
  });
  expect(submitV2.status()).toBe(201);
  const bodyV2 = await submitV2.json();
  expect(bodyV2.submission?.version).toBe(2);

  // 3) Business rejects without reason -> 422
  const review422 = await business1Context.request.patch(`/api/deliverables/${bodyV2.submission.id}/review`, {
    data: { status: "rejected" },
  });
  expect(review422.status()).toBe(422);

  // 4) + 6) Required approved completes application, optional does not block
  const c3 = await createCampaign(ids.business1Id, "required-optional");
  const app3 = await createAcceptedApplication(c3, ids.athlete1Id);
  const reqRequired = await createRequirement(c3, { isRequired: true, type: "instagram_post" });
  await createRequirement(c3, { isRequired: false, type: "story" });

  const subRequired = await athleteContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app3, requirementId: reqRequired, submissionUrl: "https://example.com/post/required" },
  });
  expect(subRequired.status()).toBe(201);
  const subRequiredJson = await subRequired.json();

  const approveRequired = await business1Context.request.patch(`/api/deliverables/${subRequiredJson.submission.id}/review`, {
    data: { status: "approved" },
  });
  expect(approveRequired.status()).toBe(200);
  const approveBody = await approveRequired.json();
  expect(approveBody.applicationStatus).toBe("completed");

  const { data: completedApp } = await admin
    .from("campaign_applications")
    .select("status")
    .eq("id", app3)
    .single();
  expect(completedApp?.status).toBe("completed");

  // 5) Business cannot review another business campaign -> 403
  const c4 = await createCampaign(ids.business2Id, "ownership");
  const app4 = await createAcceptedApplication(c4, ids.athlete1Id);
  const req4 = await createRequirement(c4, { isRequired: true });

  const sub4 = await athleteContext.request.post("/api/deliverables/submit", {
    data: { applicationId: app4, requirementId: req4, submissionUrl: "https://example.com/post/owner-check" },
  });
  expect(sub4.status()).toBe(201);
  const sub4Body = await sub4.json();

  const wrongBusinessReview = await business1Context.request.patch(`/api/deliverables/${sub4Body.submission.id}/review`, {
    data: { status: "approved" },
  });
  expect(wrongBusinessReview.status()).toBe(403);

  await athleteContext.close();
  await business1Context.close();
  await business2Context.close();
  await adminContext.close();
});
