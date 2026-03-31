import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

type CampaignPatchBody = {
  auto_accept_enabled?: boolean;
  auto_accept_radius_miles?: number;
  auto_accept_lock_hours?: number;
  min_athlete_tier?: "bronze" | "silver" | "gold" | "diamond";
};

const ALLOWED_TIERS = new Set(["bronze", "silver", "gold", "diamond"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const { id } = await params;
  const campaignId = id?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id is required" }, { status: 400 });
  }

  const { data, error } = await access.admin
    .from("campaigns")
    .select("id, title, status, open_slots, auto_accept_enabled, auto_accept_radius_miles, auto_accept_lock_hours, min_athlete_tier")
    .eq("id", campaignId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const { id } = await params;
  const campaignId = id?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id is required" }, { status: 400 });
  }

  let body: CampaignPatchBody;
  try {
    body = (await req.json()) as CampaignPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.auto_accept_enabled === "boolean") {
    patch.auto_accept_enabled = body.auto_accept_enabled;
  }

  if (body.auto_accept_radius_miles !== undefined) {
    if (!Number.isFinite(body.auto_accept_radius_miles) || body.auto_accept_radius_miles < 1 || body.auto_accept_radius_miles > 250) {
      return NextResponse.json({ error: "auto_accept_radius_miles must be between 1 and 250" }, { status: 400 });
    }
    patch.auto_accept_radius_miles = Math.round(body.auto_accept_radius_miles);
  }

  if (body.auto_accept_lock_hours !== undefined) {
    if (!Number.isFinite(body.auto_accept_lock_hours) || body.auto_accept_lock_hours < 1 || body.auto_accept_lock_hours > 168) {
      return NextResponse.json({ error: "auto_accept_lock_hours must be between 1 and 168" }, { status: 400 });
    }
    patch.auto_accept_lock_hours = Math.round(body.auto_accept_lock_hours);
  }

  if (body.min_athlete_tier !== undefined) {
    const tier = String(body.min_athlete_tier).trim().toLowerCase();
    if (!ALLOWED_TIERS.has(tier)) {
      return NextResponse.json({ error: "min_athlete_tier is invalid" }, { status: 400 });
    }
    patch.min_athlete_tier = tier;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const { data, error } = await access.admin
    .from("campaigns")
    .update(patch)
    .eq("id", campaignId)
    .select("id, title, status, open_slots, auto_accept_enabled, auto_accept_radius_miles, auto_accept_lock_hours, min_athlete_tier")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to update campaign" }, { status: 500 });
  }

  const { error: auditError } = await access.admin.from("finance_events").insert({
    source: "system",
    event_type: "admin.campaign_auto_accept_updated",
    event_id: `${Date.now()}-${access.userId}-${campaignId}`,
    campaign_id: campaignId,
    status: "applied",
    details_json: {
      actor_admin_id: access.userId,
      patch,
    },
  });

  if (auditError) {
    console.error("campaign settings audit insert failed", auditError.message);
  }

  return NextResponse.json({ campaign: data });
}
