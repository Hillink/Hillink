import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const users = [
  {
    key: "admin",
    email: "hillink+admin@test.local",
    password: "Password123!",
    role: "admin",
  },
  {
    key: "business1",
    email: "hillink+business1@test.local",
    password: "Password123!",
    role: "business",
    billing: {
      subscription_tier: "domination",
      monthly_price_cents: 120000,
      max_slots_per_campaign: 20,
      max_open_campaigns: 20,
      max_athlete_tier: "Diamond",
    },
  },
  {
    key: "business2",
    email: "hillink+business2@test.local",
    password: "Password123!",
    role: "business",
    billing: {
      subscription_tier: "starter",
      monthly_price_cents: 25000,
      max_slots_per_campaign: 3,
      max_open_campaigns: 2,
      max_athlete_tier: "Silver",
    },
  },
  {
    key: "athlete1",
    email: "hillink+athlete1@test.local",
    password: "Password123!",
    role: "athlete",
    athlete_verification_status: "approved",
    profile: { first_name: "Athlete", last_name: "One", sport: "Basketball", city: "Austin", state: "TX", instagram: "@athleteone" },
    xpTarget: 500,
  },
  {
    key: "athlete2",
    email: "hillink+athlete2@test.local",
    password: "Password123!",
    role: "athlete",
    athlete_verification_status: "approved",
    profile: { first_name: "Athlete", last_name: "Two", sport: "Football", city: "Dallas", state: "TX", instagram: "@athletetwo" },
    xpTarget: 3000,
  },
  {
    key: "athlete3",
    email: "hillink+athlete3@test.local",
    password: "Password123!",
    role: "athlete",
    athlete_verification_status: "pending",
    profile: { first_name: "Athlete", last_name: "Three", sport: "Soccer", city: "Houston", state: "TX", instagram: "@athletethree" },
    xpTarget: 9000,
  },
];

async function listAllUsers() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }
  return data.users || [];
}

async function getOrCreateAuthUser(config, userCache) {
  const existing = userCache.find((u) => (u.email || "").toLowerCase() === config.email.toLowerCase());
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: config.password,
      email_confirm: true,
      user_metadata: {
        full_name: config.key,
      },
    });
    if (updateError) {
      throw new Error(`updateUserById failed for ${config.email}: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    user_metadata: {
      full_name: config.key,
    },
  });

  if (error || !data.user) {
    throw new Error(`createUser failed for ${config.email}: ${error?.message || "unknown"}`);
  }

  return data.user.id;
}

function referralFromUserId(userId) {
  const normalized = userId.replace(/-/g, "").toUpperCase();
  const prefix = normalized.slice(0, 4).padEnd(4, "X");
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(36).toUpperCase().slice(0, 4).padEnd(4, "0");
  return `HL-${prefix}-${suffix}`;
}

async function seed() {
  const existingUsers = await listAllUsers();
  const idByKey = {};

  for (const config of users) {
    const id = await getOrCreateAuthUser(config, existingUsers);
    idByKey[config.key] = id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id,
        role: config.role,
        athlete_verification_status:
          config.role === "athlete"
            ? config.athlete_verification_status || "approved"
            : "approved",
        referral_code: referralFromUserId(id),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      throw new Error(`profiles upsert failed for ${config.email}: ${profileError.message}`);
    }

    if (config.role === "athlete") {
      const { error: athleteProfileError } = await admin.from("athlete_profiles").upsert(
        {
          id,
          first_name: config.profile?.first_name || config.key,
          last_name: config.profile?.last_name || "User",
          sport: config.profile?.sport || "Sport",
          city: config.profile?.city || "City",
          state: config.profile?.state || "ST",
          instagram: config.profile?.instagram || `@${config.key}`,
        },
        { onConflict: "id" }
      );

      if (athleteProfileError) {
        throw new Error(`athlete_profiles upsert failed for ${config.email}: ${athleteProfileError.message}`);
      }

      const { error: payoutError } = await admin.from("athlete_payout_profiles").upsert(
        {
          athlete_id: id,
          payout_method: "stripe_connect",
          recipient_name: `${config.profile?.first_name || config.key} ${config.profile?.last_name || "User"}`,
          recipient_email: config.email,
          payout_ready: true,
          stripe_onboarding_complete: true,
        },
        { onConflict: "athlete_id" }
      );

      if (payoutError) {
        throw new Error(`athlete_payout_profiles upsert failed for ${config.email}: ${payoutError.message}`);
      }
    }

    if (config.role === "business") {
      const { error: businessProfileError } = await admin.from("business_profiles").upsert(
        {
          id,
          business_name: `${config.key} llc`,
          contact_first_name: config.key,
          contact_last_name: "owner",
          instagram: `@${config.key}`,
        },
        { onConflict: "id" }
      );

      if (businessProfileError) {
        throw new Error(`business_profiles upsert failed for ${config.email}: ${businessProfileError.message}`);
      }

      const billing = config.billing || {
        subscription_tier: "starter",
        monthly_price_cents: 25000,
        max_slots_per_campaign: 3,
        max_open_campaigns: 2,
        max_athlete_tier: "Silver",
      };

      const { error: billingError } = await admin.from("business_billing_profiles").upsert(
        {
          business_id: id,
          subscription_tier: billing.subscription_tier,
          subscription_status: "active",
          monthly_price_cents: billing.monthly_price_cents,
          max_slots_per_campaign: billing.max_slots_per_campaign,
          max_open_campaigns: billing.max_open_campaigns,
          max_athlete_tier: billing.max_athlete_tier,
          billing_name: `${config.key} owner`,
          billing_email: config.email,
          billing_address_line1: "123 Test St",
          billing_city: "Austin",
          billing_state: "TX",
          billing_postal_code: "78701",
          billing_country: "US",
          card_brand: "visa",
          card_last4: "4242",
          billing_ready: true,
        },
        { onConflict: "business_id" }
      );

      if (billingError) {
        throw new Error(`business_billing_profiles upsert failed for ${config.email}: ${billingError.message}`);
      }
    }
  }

  const athleteUsers = users.filter((u) => u.role === "athlete");
  const athleteIds = athleteUsers.map((u) => idByKey[u.key]);

  if (athleteIds.length) {
    const { error: deleteXpError } = await admin.from("athlete_xp_events").delete().in("athlete_id", athleteIds);
    if (deleteXpError) {
      throw new Error(`failed clearing athlete_xp_events: ${deleteXpError.message}`);
    }
  }

  for (const athlete of athleteUsers) {
    const athleteId = idByKey[athlete.key];
    const xpDelta = athlete.xpTarget || 0;
    const { error: xpError } = await admin.from("athlete_xp_events").insert({
      athlete_id: athleteId,
      action: "monthly_activity_streak",
      xp_delta: xpDelta,
      details_json: { source: "seed_script", target_xp: xpDelta },
    });

    if (xpError) {
      throw new Error(`athlete_xp_events insert failed for ${athlete.email}: ${xpError.message}`);
    }
  }

  console.log("Seed complete. Test users:");
  for (const u of users) {
    console.log(`- ${u.key}: ${u.email} / ${u.password}`);
  }
}

seed().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
