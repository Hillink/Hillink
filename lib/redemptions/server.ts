import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDuplicateTap, makeCode, normalizeCode } from "@/lib/redemptions/codes";

// Applications whose athlete is actively promoting the business.
export const CODE_ACTIVE_STATUSES = ["accepted", "submitted", "approved", "completed"] as const;

export type PromoCodeRow = {
  id: string;
  code: string;
  application_id: string;
  campaign_id: string;
  athlete_id: string;
  business_id: string;
  active: boolean;
};

const PROMO_COLUMNS = "id, code, application_id, campaign_id, athlete_id, business_id, active";

export function hashStaffToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The athlete's code for one campaign, created on first request. */
export async function getOrCreatePromoCode(
  admin: SupabaseClient,
  args: { applicationId: string; athleteId: string }
): Promise<{ ok: true; code: PromoCodeRow } | { ok: false; status: number; error: string }> {
  const { data: app } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status")
    .eq("id", args.applicationId)
    .maybeSingle();
  if (!app || app.athlete_id !== args.athleteId) return { ok: false, status: 404, error: "Application not found" };
  if (!(CODE_ACTIVE_STATUSES as readonly string[]).includes(app.status)) {
    return { ok: false, status: 409, error: "You get a customer code once the business accepts you." };
  }

  const { data: existing } = await admin.from("athlete_promo_codes").select(PROMO_COLUMNS).eq("application_id", app.id).maybeSingle();
  if (existing) return { ok: true, code: existing as PromoCodeRow };

  const [{ data: campaign }, { data: athlete }] = await Promise.all([
    admin.from("campaigns").select("id, business_id").eq("id", app.campaign_id).maybeSingle(),
    admin.from("athlete_profiles").select("first_name").eq("id", args.athleteId).maybeSingle(),
  ]);
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found" };

  // Retry on the rare code collision; a concurrent request for the same application wins the race.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode(athlete?.first_name, randomBytes(4));
    const { data, error } = await admin
      .from("athlete_promo_codes")
      .insert({ code, application_id: app.id, campaign_id: campaign.id, athlete_id: args.athleteId, business_id: campaign.business_id })
      .select(PROMO_COLUMNS)
      .maybeSingle();
    if (data) return { ok: true, code: data as PromoCodeRow };
    if (error && error.code !== "23505") return { ok: false, status: 500, error: error.message };
    const { data: raced } = await admin.from("athlete_promo_codes").select(PROMO_COLUMNS).eq("application_id", app.id).maybeSingle();
    if (raced) return { ok: true, code: raced as PromoCodeRow };
  }
  return { ok: false, status: 500, error: "Couldn't create a code. Try again." };
}

export type RedeemResult =
  | { ok: true; duplicate: boolean; athleteFirstName: string | null; campaignTitle: string; redemptionId: string | null }
  | { ok: false; status: number; error: string };

/** Logs one customer visit for a code. Only codes on the given business's own campaigns count. */
export async function recordRedemption(
  admin: SupabaseClient,
  args: {
    businessId: string;
    rawCode: string;
    source: "staff_link" | "business";
    recordedBy: string | null;
    purchaseCents?: number | null;
    note?: string | null;
  }
): Promise<RedeemResult> {
  const code = normalizeCode(args.rawCode);
  if (!code) return { ok: false, status: 400, error: "That doesn't look like a Hillink code. Codes look like JAKE-7K2Q." };

  const { data: promo } = await admin.from("athlete_promo_codes").select(PROMO_COLUMNS).eq("code", code).maybeSingle();
  // Same answer for "no such code" and "another business's code", so staff links can't probe codes.
  if (!promo || promo.business_id !== args.businessId) return { ok: false, status: 404, error: "Code not found for this business." };
  const row = promo as PromoCodeRow;
  if (!row.active) return { ok: false, status: 409, error: "This code has been turned off." };

  const [{ data: app }, { data: campaign }, { data: athlete }] = await Promise.all([
    admin.from("campaign_applications").select("status").eq("id", row.application_id).maybeSingle(),
    admin.from("campaigns").select("title").eq("id", row.campaign_id).maybeSingle(),
    admin.from("athlete_profiles").select("first_name").eq("id", row.athlete_id).maybeSingle(),
  ]);
  if (!app || !(CODE_ACTIVE_STATUSES as readonly string[]).includes(app.status)) {
    return { ok: false, status: 409, error: "This athlete is no longer on the campaign." };
  }
  const base = { athleteFirstName: athlete?.first_name ?? null, campaignTitle: campaign?.title ?? "Campaign" };

  const { data: last } = await admin
    .from("redemptions")
    .select("id, redeemed_at")
    .eq("promo_code_id", row.id)
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isDuplicateTap(last?.redeemed_at, new Date())) {
    return { ok: true, duplicate: true, redemptionId: last?.id ?? null, ...base };
  }

  const purchase = args.purchaseCents == null ? null : Math.round(Number(args.purchaseCents));
  if (purchase != null && (!Number.isFinite(purchase) || purchase < 0 || purchase > 10_000_00)) {
    return { ok: false, status: 400, error: "Purchase amount looks wrong." };
  }
  const { data: inserted, error } = await admin
    .from("redemptions")
    .insert({
      promo_code_id: row.id,
      application_id: row.application_id,
      campaign_id: row.campaign_id,
      athlete_id: row.athlete_id,
      business_id: row.business_id,
      source: args.source,
      recorded_by: args.recordedBy,
      purchase_cents: purchase,
      note: args.note ? args.note.slice(0, 280) : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, duplicate: false, redemptionId: inserted.id, ...base };
}

/** Creates (or replaces) the business's staff link token. The old link stops working. */
export async function rotateStaffLink(admin: SupabaseClient, businessId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const { error } = await admin
    .from("business_staff_links")
    .upsert({ business_id: businessId, token_hash: hashStaffToken(token), created_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) throw new Error(error.message);
  return token;
}

export async function businessForStaffToken(admin: SupabaseClient, token: string): Promise<{ businessId: string; businessName: string } | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const { data } = await admin.from("business_staff_links").select("business_id").eq("token_hash", hashStaffToken(token)).maybeSingle();
  if (!data) return null;
  const { data: profile } = await admin.from("business_profiles").select("business_name").eq("id", data.business_id).maybeSingle();
  return { businessId: data.business_id, businessName: profile?.business_name || "Your business" };
}
