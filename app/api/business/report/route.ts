import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { buildMonthlyReport, currentMonth, monthRange } from "@/lib/redemptions/codes";

// Monthly results for one business: customers its athletes brought in, what it cost, and reach.
export async function GET(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) return access.response;
  const businessId = access.userId;

  const month = req.nextUrl.searchParams.get("month") || currentMonth(new Date());
  const range = monthRange(month);
  if (!range) return NextResponse.json({ error: "month must look like 2026-09" }, { status: 400 });

  const admin = createAdminClient();
  const { data: campaigns, error: campaignError } = await admin
    .from("campaigns")
    .select("id, title, payout_cents")
    .eq("business_id", businessId);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  const campaignIds = (campaigns || []).map((c) => c.id);

  const empty = { data: [] as never[], error: null };
  const [apps, reds, billing, business] = await Promise.all([
    campaignIds.length
      ? admin.from("campaign_applications").select("id, campaign_id, athlete_id, status, reviewed_at, updated_at").in("campaign_id", campaignIds)
      : Promise.resolve(empty),
    admin
      .from("redemptions")
      .select("campaign_id, athlete_id, purchase_cents")
      .eq("business_id", businessId)
      .gte("redeemed_at", range.start)
      .lt("redeemed_at", range.end),
    admin.from("business_billing_profiles").select("monthly_price_cents, subscription_status").eq("business_id", businessId).maybeSingle(),
    admin.from("business_profiles").select("business_name").eq("id", businessId).maybeSingle(),
  ]);
  if (apps.error) return NextResponse.json({ error: apps.error.message }, { status: 500 });
  if (reds.error) return NextResponse.json({ error: reds.error.message }, { status: 500 });

  const appIds = (apps.data || []).map((a: { id: string }) => a.id);
  const reach = appIds.length
    ? await admin.from("instagram_post_diagnostics").select("application_id, reach, impressions").in("application_id", appIds)
    : empty;

  const subscriptionCents = billing.data?.subscription_status === "active" ? Number(billing.data.monthly_price_cents || 0) : 0;
  const report = buildMonthlyReport({
    campaigns: campaigns || [],
    // No approved_at column: legacy approvals set reviewed_at; deliverable completions only touch updated_at.
    applications: (apps.data || []).map((a: { id: string; campaign_id: string; athlete_id: string; status: string; reviewed_at: string | null; updated_at: string | null }) => ({
      id: a.id,
      campaign_id: a.campaign_id,
      athlete_id: a.athlete_id,
      status: a.status,
      approved_at: a.reviewed_at ?? a.updated_at,
    })),
    redemptions: reds.data || [],
    reach: reach.error ? [] : reach.data || [],
    subscriptionCents,
    monthStart: range.start,
    monthEnd: range.end,
  });

  const athleteIds = report.topAthletes.map((a) => a.athleteId);
  const { data: athletes } = athleteIds.length
    ? await admin.from("athlete_profiles").select("id, first_name, last_name, school, sport").in("id", athleteIds)
    : { data: [] };
  const nameById = new Map((athletes || []).map((a) => [a.id, a]));

  return NextResponse.json({
    month,
    businessName: business.data?.business_name || "Your business",
    ...report,
    topAthletes: report.topAthletes.map((a) => {
      const p = nameById.get(a.athleteId);
      return { ...a, name: p ? `${p.first_name ?? ""} ${(p.last_name ?? "").slice(0, 1)}.`.trim() : "Athlete", school: p?.school ?? null, sport: p?.sport ?? null };
    }),
  });
}
