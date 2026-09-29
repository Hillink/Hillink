import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { buildMonthlyReport, currentMonth, monthRange } from "@/lib/redemptions/codes";

type AppRow = { id: string; campaign_id: string; athlete_id: string; status: string; reviewed_at: string | null; updated_at: string | null };

// Pages through all of a business's applications (the API returns at most 1000 rows per request).
async function fetchApplications(admin: SupabaseClient, campaignIds: string[]): Promise<{ data: AppRow[]; error: { message: string } | null }> {
  const out: AppRow[] = [];
  if (!campaignIds.length) return { data: out, error: null };
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("campaign_applications")
      .select("id, campaign_id, athlete_id, status, reviewed_at, updated_at")
      .in("campaign_id", campaignIds)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    out.push(...((data || []) as AppRow[]));
    if (!data || data.length < pageSize) return { data: out, error: null };
  }
}

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
    fetchApplications(admin, campaignIds),
    // Totals come from the database so big months aren't cut off by the API row limit.
    admin.rpc("business_redemption_totals", { p_business_id: businessId, p_start: range.start, p_end: range.end }),
    admin.from("business_billing_profiles").select("monthly_price_cents, subscription_status").eq("business_id", businessId).maybeSingle(),
    admin.from("business_profiles").select("business_name").eq("id", businessId).maybeSingle(),
  ]);
  if (apps.error) return NextResponse.json({ error: apps.error.message }, { status: 500 });
  if (reds.error) return NextResponse.json({ error: reds.error.message }, { status: 500 });

  const appIds = (apps.data || []).map((a: { id: string }) => a.id);
  const reach = appIds.length
    ? await admin.from("instagram_post_diagnostics").select("application_id, reach, impressions").in("application_id", appIds).eq("diagnostics_status", "verified")
    : empty;

  const subscriptionCents = billing.data?.subscription_status === "active" ? Number(billing.data.monthly_price_cents || 0) : 0;
  const report = buildMonthlyReport({
    campaigns: campaigns || [],
    // No approved_at column: legacy approvals set reviewed_at; deliverable completions only touch updated_at.
    // Older completions have no reviewed_at; fall back to updated_at for those.
    applications: apps.data.map((a) => ({
      id: a.id,
      campaign_id: a.campaign_id,
      athlete_id: a.athlete_id,
      status: a.status,
      approved_at: a.reviewed_at ?? a.updated_at,
    })),
    redemptions: ((reds.data || []) as { campaign_id: string; athlete_id: string; customers: number | string; purchase_cents: number | string }[]).map((r) => ({
      campaign_id: r.campaign_id,
      athlete_id: r.athlete_id,
      customers: Number(r.customers),
      purchase_cents: Number(r.purchase_cents),
    })),
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
