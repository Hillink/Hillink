import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function mustGetUserIdByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }
  const user = (data.users || []).find((u) => String(u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error(`Missing auth user for ${email}. Run: npm run test:seed`);
  }
  return user.id;
}

function plusHours(hours) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

async function createCampaign(businessId, overrides = {}) {
  const base = {
    business_id: businessId,
    title: `Lifecycle Verify ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaign_type: "basic_post",
    deliverables: "1 post",
    preferred_tier: "Bronze",
    payout_cents: 5000,
    start_date: plusHours(48),
    slots: 2,
    open_slots: 2,
    status: "draft",
  };

  const { data, error } = await admin
    .from("campaigns")
    .insert({ ...base, ...overrides })
    .select("id, status")
    .single();

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }
  return data.id;
}

async function transition({ campaignId, toStatus, changedBy, reason = null, force = false }) {
  const { data, error } = await admin.rpc("transition_campaign_status", {
    p_campaign_id: campaignId,
    p_to_status: toStatus,
    p_changed_by: changedBy,
    p_reason: reason,
    p_force: force,
  });
  return { data, error };
}

function assertOk(name, value, detail) {
  if (!value) {
    throw new Error(`${name} failed: ${detail}`);
  }
}

async function getLastLog(campaignId) {
  const { data, error } = await admin
    .from("campaign_status_log")
    .select("from_status, to_status, changed_by, reason, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`status log read failed: ${error.message}`);
  return data;
}

async function main() {
  const businessId = await mustGetUserIdByEmail("hillink+business1@test.local");
  const adminId = await mustGetUserIdByEmail("hillink+admin@test.local");

  const results = [];
  const runCase = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  await runCase("draft -> completed invalid", async () => {
    const campaignId = await createCampaign(businessId, { status: "draft" });
    const { error } = await transition({ campaignId, toStatus: "completed", changedBy: businessId });
    assertOk("invalid transition error", !!error, "expected error");
    assertOk("invalid transition message", String(error.message || "").includes("invalid_transition"), error.message);
  });

  await runCase("draft -> active requires open_slots > 0", async () => {
    const campaignId = await createCampaign(businessId, { status: "draft", open_slots: 0, slots: 1 });
    const { error } = await transition({ campaignId, toStatus: "active", changedBy: businessId });
    assertOk("open_slots_required", !!error && String(error.message || "") === "open_slots_required", error?.message || "");
  });

  await runCase("draft -> active requires start_date", async () => {
    const campaignId = await createCampaign(businessId, { status: "draft", open_slots: 1, slots: 1, start_date: null });
    const { error } = await transition({ campaignId, toStatus: "active", changedBy: businessId });
    assertOk("start_date_required", !!error && String(error.message || "") === "start_date_required", error?.message || "");
  });

  await runCase("valid draft -> active writes log", async () => {
    const campaignId = await createCampaign(businessId, { status: "draft", open_slots: 2, slots: 2, start_date: plusHours(72) });
    const reason = "verify activation";
    const { error } = await transition({ campaignId, toStatus: "active", changedBy: businessId, reason });
    assertOk("transition success", !error, error?.message || "unexpected error");

    const lastLog = await getLastLog(campaignId);
    assertOk("log exists", !!lastLog, "missing log row");
    assertOk("log from_status", lastLog.from_status === "draft", `got ${lastLog.from_status}`);
    assertOk("log to_status", lastLog.to_status === "active", `got ${lastLog.to_status}`);
    assertOk("log reason", String(lastLog.reason || "") === reason, `got ${lastLog.reason}`);
  });

  await runCase("active -> paused -> active valid", async () => {
    const campaignId = await createCampaign(businessId, { status: "active", open_slots: 2, slots: 2, start_date: plusHours(72) });
    const first = await transition({ campaignId, toStatus: "paused", changedBy: businessId, reason: "pause" });
    assertOk("active->paused", !first.error, first.error?.message || "unexpected error");

    const second = await transition({ campaignId, toStatus: "active", changedBy: businessId, reason: "resume" });
    assertOk("paused->active", !second.error, second.error?.message || "unexpected error");
  });

  await runCase("cancelled cannot un-cancel", async () => {
    const campaignId = await createCampaign(businessId, { status: "active", open_slots: 2, slots: 2, start_date: plusHours(72) });
    const cancel = await transition({ campaignId, toStatus: "cancelled", changedBy: businessId, reason: "cancel" });
    assertOk("cancel success", !cancel.error, cancel.error?.message || "unexpected error");

    const reopen = await transition({ campaignId, toStatus: "active", changedBy: businessId, reason: "reopen" });
    assertOk("uncancel blocked", !!reopen.error && String(reopen.error.message || "").includes("invalid_transition"), reopen.error?.message || "");
  });

  await runCase("admin force can bypass map", async () => {
    const campaignId = await createCampaign(businessId, { status: "cancelled", open_slots: 2, slots: 2, start_date: plusHours(72) });
    const forced = await transition({
      campaignId,
      toStatus: "active",
      changedBy: adminId,
      reason: "admin override",
      force: true,
    });
    assertOk("forced transition success", !forced.error, forced.error?.message || "unexpected error");

    const lastLog = await getLastLog(campaignId);
    assertOk("force log exists", !!lastLog, "missing force log row");
    assertOk("force log to active", lastLog.to_status === "active", `got ${lastLog.to_status}`);
    assertOk("force log actor", lastLog.changed_by === adminId, `got ${lastLog.changed_by}`);
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) {
      console.log(`PASS: ${r.name}`);
    } else {
      console.log(`FAIL: ${r.name}`);
      console.log(`  ${r.error}`);
    }
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length}/${results.length} lifecycle checks failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} campaign lifecycle checks passed.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
