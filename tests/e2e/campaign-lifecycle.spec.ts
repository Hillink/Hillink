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
};

async function getUserIds(): Promise<UserIds> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);

  const users = data.users || [];
  const byEmail = (email: string) => users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase())?.id;

  const adminId = byEmail(testUsers.admin.email);
  const business1Id = byEmail(testUsers.business1.email);
  const business2Id = byEmail(testUsers.business2.email);

  if (!adminId || !business1Id || !business2Id) {
    throw new Error("Missing seeded users. Run npm run test:seed.");
  }

  return { adminId, business1Id, business2Id };
}

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function createCampaign(businessId: string, status: string, opts?: { openSlots?: number; startDate?: string | null }) {
  const openSlots = opts?.openSlots ?? 2;
  const startDate = opts?.startDate === undefined ? plusHours(48) : opts.startDate;

  const { data, error } = await admin
    .from("campaigns")
    .insert({
      business_id: businessId,
      title: `Lifecycle E2E ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaign_type: "basic_post",
      deliverables: "1 post",
      preferred_tier: "Bronze",
      payout_cents: 5000,
      slots: 2,
      open_slots: openSlots,
      start_date: startDate,
      status,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }

  return data.id as string;
}

async function latestStatusLog(campaignId: string) {
  const { data, error } = await admin
    .from("campaign_status_log")
    .select("from_status, to_status, changed_by, reason, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`status log query failed: ${error.message}`);
  return data;
}

test("Module 3 lifecycle checklist", async ({ browser }) => {
  const { adminId, business1Id, business2Id } = await getUserIds();

  const business1Context = await browser.newContext();
  const business1Page = await business1Context.newPage();
  await loginViaUserPortal(business1Page, testUsers.business1.email, testUsers.business1.password, /\/business/);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginViaUserPortal(adminPage, testUsers.admin.email, testUsers.admin.password, /\/admin/);

  // 1) draft -> active with valid fields: 200
  const c1 = await createCampaign(business1Id, "draft", { openSlots: 2, startDate: plusHours(48) });
  const r1 = await business1Context.request.patch(`/api/campaigns/${c1}/status`, {
    data: { toStatus: "active", reason: "activate for launch" },
  });
  expect(r1.status()).toBe(200);

  // 2) draft -> active with no start_date: 422
  const c2 = await createCampaign(business1Id, "draft", { openSlots: 2, startDate: null });
  const r2 = await business1Context.request.patch(`/api/campaigns/${c2}/status`, {
    data: { toStatus: "active" },
  });
  expect(r2.status()).toBe(422);

  // 3) completed -> active: 409
  const c3 = await createCampaign(business1Id, "completed", { openSlots: 2, startDate: plusHours(48) });
  const r3 = await business1Context.request.patch(`/api/campaigns/${c3}/status`, {
    data: { toStatus: "active" },
  });
  expect(r3.status()).toBe(409);

  // 4) cancelled -> paused: 409
  const c4 = await createCampaign(business1Id, "cancelled", { openSlots: 2, startDate: plusHours(48) });
  const r4 = await business1Context.request.patch(`/api/campaigns/${c4}/status`, {
    data: { toStatus: "paused" },
  });
  expect(r4.status()).toBe(409);

  // 5) Business updating another business's campaign: 403
  const c5 = await createCampaign(business2Id, "draft", { openSlots: 2, startDate: plusHours(48) });
  const r5 = await business1Context.request.patch(`/api/campaigns/${c5}/status`, {
    data: { toStatus: "active" },
  });
  expect(r5.status()).toBe(403);

  // 6) Admin is still bound by transition map: cancelled -> active is rejected
  const c6 = await createCampaign(business1Id, "cancelled", { openSlots: 2, startDate: plusHours(48) });
  const forceReason = `admin override ${Date.now()}`;
  const r6 = await adminContext.request.patch(`/api/campaigns/${c6}/status`, {
    data: { toStatus: "active", reason: forceReason, force: true },
  });
  expect(r6.status()).toBe(409);

  // 7) campaign_status_log row created on every valid transition
  const c7 = await createCampaign(business1Id, "draft", { openSlots: 2, startDate: plusHours(48) });
  const beforeLogs = await admin
    .from("campaign_status_log")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c7);

  const r7a = await business1Context.request.patch(`/api/campaigns/${c7}/status`, {
    data: { toStatus: "active", reason: "go live" },
  });
  expect(r7a.status()).toBe(200);

  const r7b = await business1Context.request.patch(`/api/campaigns/${c7}/status`, {
    data: { toStatus: "paused", reason: "temporary hold" },
  });
  expect(r7b.status()).toBe(200);

  const afterLogs = await admin
    .from("campaign_status_log")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c7);

  expect((afterLogs.count || 0) - (beforeLogs.count || 0)).toBe(2);

  await business1Context.close();
  await adminContext.close();
});
