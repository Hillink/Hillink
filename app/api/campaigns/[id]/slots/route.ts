import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

type CampaignRow = {
  id: string;
  business_id: string;
  status: string;
  open_slots: number;
  slots: number;
  version: number;
  start_date: string | null;
  auto_accept_locked_at: string | null;
  auto_accept_lock_hours?: number | null;
};

type PatchBody = {
  openSlots?: number;
  force?: boolean;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

async function getAcceptedCount(admin: ReturnType<typeof createAdminClient>, campaignId: string) {
  const { count, error } = await admin
    .from("campaign_applications")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "accepted");

  if (error) {
    throw new Error(error.message || "Failed to count accepted applications");
  }

  return count || 0;
}

async function loadCampaign(admin: ReturnType<typeof createAdminClient>, campaignId: string) {
  const primary = await admin
    .from("campaigns")
    .select("id, business_id, status, open_slots, slots, version, start_date, auto_accept_locked_at")
    .eq("id", campaignId)
    .single<CampaignRow>();

  if (!primary.error && primary.data) {
    return primary.data;
  }

  const columnMissing = /column .* does not exist/i.test(primary.error?.message || "");
  if (!columnMissing) {
    return null;
  }

  const fallback = await admin
    .from("campaigns")
    .select("id, business_id, status, open_slots, slots, start_date, auto_accept_lock_hours")
    .eq("id", campaignId)
    .single<CampaignRow>();

  if (fallback.error || !fallback.data) {
    return null;
  }

  const lockHours = Number(fallback.data.auto_accept_lock_hours ?? 12);
  const lockAtMs = fallback.data.start_date
    ? new Date(fallback.data.start_date).getTime() - lockHours * 60 * 60 * 1000
    : NaN;

  return {
    ...fallback.data,
    version: 0,
    auto_accept_locked_at: Number.isFinite(lockAtMs) ? new Date(lockAtMs).toISOString() : null,
  };
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
  const campaign = await loadCampaign(admin, campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (auth.role === "business" && campaign.business_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const acceptedCount = await getAcceptedCount(admin, campaignId);
    return NextResponse.json({
      campaign,
      filledSlots: acceptedCount,
      remainingSlots: Math.max(0, Number(campaign.open_slots || 0)),
      totalSlots: Number(campaign.slots || 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load slot summary" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ["business", "admin"]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  let bodyData: { openSlots?: unknown };
  try {
    bodyData = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { openSlots: rawOpenSlots } = bodyData;
  const openSlots = Number(rawOpenSlots);

  // Validate openSlots is a positive integer.
  if (!Number.isInteger(openSlots) || openSlots <= 0) {
    return NextResponse.json(
      { error: "openSlots must be a positive integer" },
      { status: 422 }
    );
  }

  const { id: campaignId } = await params;
  const { userId, role } = authResult;

  const admin = createAdminClient();

  // Fetch campaign: id, status, business_id, open_slots, start_date, auto_accept_lock_hours.
  const { data: campaign, error: fetchError } = await admin
    .from("campaigns")
    .select("id, status, business_id, open_slots, start_date, auto_accept_lock_hours")
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

  // Count current accepted applications.
  const { count: rawCount, error: countError } = await admin
    .from("campaign_applications")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "accepted");

  if (countError) {
    return NextResponse.json(
      { error: "Failed to fetch application count" },
      { status: 500 }
    );
  }

  // Cast count to number (Supabase count returns string).
  const acceptedCount = Number(rawCount ?? 0);

  // Validate openSlots >= acceptedCount (admin does NOT bypass this).
  if (openSlots < acceptedCount) {
    return NextResponse.json(
      {
        error: "Cannot set slots below current accepted count",
        reason: "below_filled_count",
      },
      { status: 422 }
    );
  }

  // Admin bypasses lock window check, but not below_filled_count check.
  if (role !== "admin") {
    if (campaign.status === "active" && campaign.start_date !== null) {
      const startTimeMs = new Date(campaign.start_date).getTime();
      const lockHours = campaign.auto_accept_lock_hours ?? 0;
      const lockWindowMs = lockHours * 60 * 60 * 1000;
      const lockTime = startTimeMs - lockWindowMs;
      const now = Date.now();

      if (now >= lockTime) {
        return NextResponse.json(
          {
            error: "Cannot change slots within lock window before campaign start",
            reason: "locked_before_start",
          },
          { status: 422 }
        );
      }
    }
  }

  // Update campaign slots.
  const { error: updateError } = await admin
    .from("campaigns")
    .update({ open_slots: openSlots })
    .eq("id", campaignId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update campaign slots" },
      { status: 500 }
    );
  }

  // Return response.
  const remaining = openSlots - acceptedCount;

  return NextResponse.json(
    {
      openSlots,
      filledSlots: acceptedCount,
      remaining,
    },
    { status: 200 }
  );
}