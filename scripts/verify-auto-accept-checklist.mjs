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

function nowIsoPlusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

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

async function ensureAthleteState(athleteId, patch) {
  const { error } = await admin
    .from("athlete_profiles")
    .update(patch)
    .eq("id", athleteId);
  if (error) {
    throw new Error(`Failed athlete patch for ${athleteId}: ${error.message}`);
  }
}

async function createCampaign(businessId, overrides = {}) {
  const base = {
    business_id: businessId,
    title: `AutoAccept Verify ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    campaign_type: "basic_post",
    deliverables: "1 post",
    preferred_tier: "Bronze",
    payout_cents: 5000,
    start_date: nowIsoPlusHours(72),
    slots: 1,
    open_slots: 1,
    status: "active",
    auto_accept_enabled: true,
    auto_accept_radius_miles: 10,
    auto_accept_lock_hours: 12,
    min_athlete_tier: "bronze",
    latitude: 30.2672,
    longitude: -97.7431,
  };

  const payload = { ...base, ...overrides };
  const { data, error } = await admin
    .from("campaigns")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`createCampaign failed: ${error?.message || "unknown"}`);
  }

  return data.id;
}

async function callAttempt(campaignId, athleteId, client = admin) {
  const { data, error } = await client.rpc("attempt_auto_accept", {
    p_campaign_id: campaignId,
    p_athlete_id: athleteId,
  });
  if (error) {
    return { success: false, reason: `rpc_error:${error.code || "unknown"}:${error.message}` };
  }
  return data || { success: false, reason: "rpc_return_empty" };
}

function assertReason(name, result, expectedReason) {
  if (result.success !== false || result.reason !== expectedReason) {
    throw new Error(`${name} expected reason=${expectedReason}, got ${JSON.stringify(result)}`);
  }
}

function assertSuccess(name, result) {
  if (result.success !== true || !result.application_id) {
    throw new Error(`${name} expected success with application_id, got ${JSON.stringify(result)}`);
  }
}

async function main() {
  const businessId = await mustGetUserIdByEmail("hillink+business1@test.local");
  const athlete1Id = await mustGetUserIdByEmail("hillink+athlete1@test.local");

  await ensureAthleteState(athlete1Id, {
    is_verified: true,
    is_flagged: false,
    tier: "gold",
    latitude: 30.2672,
    longitude: -97.7431,
  });

  const results = [];

  const runCase = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  await runCase("Unverified athlete -> not_verified", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: false, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId);
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("unverified", result, "not_verified");
  });

  await runCase("Flagged athlete -> flagged", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: true, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId);
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("flagged", result, "flagged");
  });

  await runCase("Tier below min -> tier_insufficient", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "silver", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, { min_athlete_tier: "diamond" });
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("tier", result, "tier_insufficient");
  });

  await runCase("Campaign draft -> campaign_not_active", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, { status: "draft" });
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("status", result, "campaign_not_active");
  });

  await runCase("Start within lock window -> auto_accept_locked", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, {
      start_date: nowIsoPlusHours(6),
      auto_accept_lock_hours: 12,
    });
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("lock", result, "auto_accept_locked");
  });

  await runCase("No slots -> no_slots", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, { open_slots: 0 });
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("slots", result, "no_slots");
  });

  await runCase("Outside radius -> outside_radius", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 47.6062, longitude: -122.3321 });
    const campaignId = await createCampaign(businessId, {
      latitude: 30.2672,
      longitude: -97.7431,
      auto_accept_radius_miles: 10,
    });
    const result = await callAttempt(campaignId, athlete1Id);
    assertReason("radius", result, "outside_radius");
  });

  await runCase("Duplicate apply -> already_applied", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, { open_slots: 2, slots: 2 });
    const first = await callAttempt(campaignId, athlete1Id);
    assertSuccess("duplicate-first", first);
    const second = await callAttempt(campaignId, athlete1Id);
    assertReason("duplicate-second", second, "already_applied");
  });

  await runCase("Two simultaneous RPCs -> one success, one duplicate/no_slots", async () => {
    await ensureAthleteState(athlete1Id, { is_verified: true, is_flagged: false, tier: "gold", latitude: 30.2672, longitude: -97.7431 });
    const campaignId = await createCampaign(businessId, { open_slots: 1, slots: 1 });

    const clientA = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const clientB = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const [a, b] = await Promise.all([
      callAttempt(campaignId, athlete1Id, clientA),
      callAttempt(campaignId, athlete1Id, clientB),
    ]);

    const successCount = [a, b].filter((r) => r.success === true).length;
    const acceptableFailure = ["duplicate_application", "no_slots"];
    const failureCount = [a, b].filter((r) => r.success === false && acceptableFailure.includes(String(r.reason))).length;

    if (successCount !== 1 || failureCount !== 1) {
      throw new Error(`race expected one success + one duplicate/no_slots, got A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);
    }
  });

  await ensureAthleteState(athlete1Id, {
    is_verified: true,
    is_flagged: false,
    tier: "gold",
    latitude: 30.2672,
    longitude: -97.7431,
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
    console.error(`\n${failed.length}/${results.length} checks failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} auto-accept checks passed.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
