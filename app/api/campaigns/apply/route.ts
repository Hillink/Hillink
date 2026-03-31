import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createServerClient } from "@/lib/supabase-server";

type ApplyBody = {
  campaignId?: string;
};

type RpcResult = {
  success?: boolean;
  reason?: string;
  application_id?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["athlete"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaignId = body.campaignId?.trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("attempt_auto_accept", {
    p_campaign_id: campaignId,
    p_athlete_id: auth.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already applied", reason: "duplicate_application" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || "Apply failed" }, { status: 500 });
  }

  const result = (data || {}) as RpcResult;
  if (!result.success) {
    if (result.reason === "duplicate_application") {
      return NextResponse.json({ error: "Already applied", reason: result.reason }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Unable to apply", reason: result.reason || "unknown" },
      { status: 422 }
    );
  }

  if (!result.application_id) {
    return NextResponse.json({ error: "Apply failed", reason: "missing_application_id" }, { status: 500 });
  }

  return NextResponse.json({ applicationId: result.application_id }, { status: 201 });
}
