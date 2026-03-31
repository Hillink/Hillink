import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (usersError) {
  console.error(`listUsers failed: ${usersError.message}`);
  process.exit(1);
}

const business = (usersData.users || []).find(
  (u) => String(u.email || "").toLowerCase() === "hillink+business1@test.local"
);

if (!business) {
  console.error("Missing business test user. Run: npm run test:seed");
  process.exit(1);
}

const startDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

const { data: campaign, error: insertError } = await admin
  .from("campaigns")
  .insert({
    business_id: business.id,
    title: `Direct Trigger Smoke ${Date.now()}`,
    campaign_type: "basic_post",
    deliverables: "1 post",
    preferred_tier: "Bronze",
    payout_cents: 5000,
    start_date: startDate,
    slots: 1,
    open_slots: 1,
    status: "draft",
  })
  .select("id, status")
  .single();

if (insertError || !campaign?.id) {
  console.error(`insert failed: ${insertError?.message || "unknown"}`);
  process.exit(1);
}

const { error: updateError } = await admin
  .from("campaigns")
  .update({ status: "completed" })
  .eq("id", campaign.id)
  .select("id, status")
  .single();

if (!updateError) {
  console.error("FAIL: direct draft->completed unexpectedly succeeded");
  process.exit(1);
}

if (!String(updateError.message || "").includes("invalid_transition")) {
  console.error(`FAIL: unexpected error: ${updateError.message}`);
  process.exit(1);
}

console.log(`PASS: direct draft->completed blocked by trigger: ${updateError.message}`);
