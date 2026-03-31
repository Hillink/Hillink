import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

type BulkCancelBody = {
  campaignIds?: string[];
  reason?: string;
};

const ALLOWED_STATUS = new Set(["draft", "active", "paused", "completed", "cancelled", "open", "closed"]);

export async function GET(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const status = String(req.nextUrl.searchParams.get("status") || "").trim().toLowerCase();
  const query = access.admin
    .from("campaigns")
    .select("id, title, business_id, status, open_slots, start_date, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && ALLOWED_STATUS.has(status)) {
    query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const campaigns = data || [];
  const campaignIds = campaigns.map((c) => c.id).filter(Boolean);
  const acceptedByCampaign: Record<string, number> = {};

  if (campaignIds.length > 0) {
    const { data: acceptedRows, error: acceptedError } = await access.admin
      .from("campaign_applications")
      .select("campaign_id")
      .in("campaign_id", campaignIds)
      .eq("status", "accepted");

    if (acceptedError) {
      return NextResponse.json({ error: acceptedError.message }, { status: 500 });
    }

    for (const row of acceptedRows || []) {
      const key = String(row.campaign_id || "");
      if (!key) continue;
      acceptedByCampaign[key] = (acceptedByCampaign[key] || 0) + 1;
    }
  }

  return NextResponse.json({
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      accepted_count: acceptedByCampaign[campaign.id] || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: BulkCancelBody;
  try {
    body = (await req.json()) as BulkCancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaignIds = Array.from(new Set((body.campaignIds || []).map((v) => String(v || "").trim()).filter(Boolean)));
  if (campaignIds.length === 0) {
    return NextResponse.json({ error: "campaignIds are required" }, { status: 400 });
  }

  const reason = String(body.reason || "").trim();
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const results: Array<{ campaignId: string; ok: boolean; error?: string }> = [];

  for (const campaignId of campaignIds) {
    const { error } = await access.admin.rpc("transition_campaign_status", {
      p_campaign_id: campaignId,
      p_to_status: "cancelled",
      p_changed_by: access.userId,
      p_reason: reason,
      p_force: true,
    });

    if (error) {
      results.push({ campaignId, ok: false, error: error.message });
    } else {
      results.push({ campaignId, ok: true });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    updated: results.length - failed.length,
    failed,
  });
}
