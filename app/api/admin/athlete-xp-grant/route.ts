import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { getXpReward, type XpAction } from "@/lib/xp";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidAction(value: string): value is XpAction {
  return getXpReward(value) > 0;
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: {
    userId?: string;
    action?: string;
    xpDelta?: number;
    note?: string;
  };
  try {
    body = (await req.json()) as {
      userId?: string;
      action?: string;
      xpDelta?: number;
      note?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }

  const action = body.action?.trim();
  const manualXp = Number(body.xpDelta || 0);

  if (!action && (!Number.isFinite(manualXp) || manualXp === 0)) {
    return NextResponse.json({ error: "Provide a valid action or a non-zero xpDelta" }, { status: 400 });
  }

  const resolvedAction = action && isValidAction(action) ? action : "weekly_activity_streak";
  const resolvedXp = action && isValidAction(action) ? getXpReward(action) : manualXp;

  const { error: insertError } = await access.admin.from("athlete_xp_events").insert({
    athlete_id: userId,
    action: resolvedAction,
    xp_delta: resolvedXp,
    details_json: {
      source: "admin_manual_grant",
      admin_id: access.userId,
      note: body.note || null,
    },
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    userId,
    action: resolvedAction,
    xpDelta: resolvedXp,
  });
}