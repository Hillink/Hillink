import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { recordRedemption } from "@/lib/redemptions/server";

type Body = { code?: string; purchaseCents?: number | null; note?: string | null };

// A signed-in business logs a customer code itself.
export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as Body;
  const result = await recordRedemption(createAdminClient(), {
    businessId: access.userId,
    rawCode: String(body.code || ""),
    source: "business",
    recordedBy: access.userId,
    purchaseCents: body.purchaseCents ?? null,
    note: body.note ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
