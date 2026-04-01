import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { VALID_TRANSITIONS } from "./constants";

type Body = {
  toStatus?: string;
  reason?: string;
  force?: boolean;
};

type CampaignRow = {
  id: string;
  title: string;
  status: string;
  business_id: string;
  open_slots: number;
  start_date: string | null;
};

function normalizeStatus(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ["business", "admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await params;
  const campaignId = id?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("campaigns")
    .select("id, title, status, business_id, open_slots, start_date, slots")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (auth.role === "business" && campaign.business_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ["business", "admin"]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  let bodyData: { toStatus?: string; reason?: string };
  try {
    bodyData = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { toStatus, reason } = bodyData;

  // Validate toStatus is provided and is a known status.
  const validStatuses = Object.keys(VALID_TRANSITIONS);
  if (!toStatus || !validStatuses.includes(toStatus)) {
    return NextResponse.json(
      { error: "Invalid status" },
      { status: 422 }
    );
  }

  const { id: campaignId } = await params;
  const { userId, role } = authResult;

  const admin = createAdminClient();

  // Fetch campaign by id.
  const { data: campaign, error: fetchError } = await admin
    .from("campaigns")
    .select("id, status, business_id, open_slots, start_date")
    .eq("id", campaignId)
    .single<CampaignRow>();

  if (fetchError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Business ownership check (admin bypasses).
  if (role === "business" && campaign.business_id !== userId) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // Check valid transition (admin still goes through the map).
  const allowedTransitions = VALID_TRANSITIONS[campaign.status] || [];
  if (!allowedTransitions.includes(toStatus)) {
    return NextResponse.json(
      { error: `Invalid transition: ${campaign.status} -> ${toStatus}` },
      { status: 409 }
    );
  }

  // If transitioning to active, validate constraints.
  if (toStatus === "active") {
    if (campaign.open_slots === null || campaign.open_slots < 1) {
      return NextResponse.json(
        { error: "Campaign must have at least one open slot to activate" },
        { status: 422 }
      );
    }
    if (campaign.start_date === null) {
      return NextResponse.json(
        { error: "Campaign must have a start date to activate" },
        { status: 422 }
      );
    }
  }

  // Update campaign status.
  const { error: updateError } = await admin
    .from("campaigns")
    .update({ status: toStatus })
    .eq("id", campaignId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }

  // Insert status log with reason field.
  const { error: logError } = await admin
    .from("campaign_status_log")
    .insert({
      campaign_id: campaignId,
      from_status: campaign.status,
      to_status: toStatus,
      changed_by: userId,
      reason: reason || null,
    });

  if (logError) {
    return NextResponse.json(
      { error: "Failed to log status change" },
      { status: 500 }
    );
  }

  // Fetch and return updated campaign.
  const { data: updated, error: refetchError } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (refetchError || !updated) {
    return NextResponse.json(
      { error: "Failed to fetch updated campaign" },
      { status: 500 }
    );
  }

  if (toStatus === "cancelled") {
    const { data: acceptedAthletes } = await admin
      .from("campaign_applications")
      .select("athlete_id")
      .eq("campaign_id", campaignId)
      .eq("status", "accepted");

    for (const athlete of acceptedAthletes ?? []) {
      if (!athlete?.athlete_id) {
        continue;
      }

      try {
        await createNotification({
          userId: athlete.athlete_id,
          type: "campaign_cancelled",
          title: "Campaign cancelled",
          body: "A campaign you were accepted into has been cancelled.",
          ctaUrl: "/athlete/campaigns",
          ctaLabel: "Browse Campaigns",
        });
      } catch (error) {
        console.error("Failed to create campaign cancelled notification", error);
      }
    }
  }

  return NextResponse.json(updated, { status: 200 });
}
