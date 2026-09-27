import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getAppUrl } from "@/lib/stripe/config";
import { getOrCreatePromoCode } from "@/lib/redemptions/server";

// An athlete's customer code for one campaign, plus the link they share with followers.
export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { applicationId?: string };
  const applicationId = body.applicationId?.trim();
  if (!applicationId) return NextResponse.json({ error: "applicationId is required" }, { status: 400 });

  const result = await getOrCreatePromoCode(createAdminClient(), { applicationId, athleteId: access.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    code: result.code.code,
    shareUrl: `${getAppUrl()}/c/${result.code.code}`,
  });
}
