// AUTH_EXEMPT: counter staff have no Hillink login. Access is the business's secret staff link token
// (192 random bits, stored hashed), and it can only log codes on that business's own campaigns.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessForStaffToken, recordRedemption } from "@/lib/redemptions/server";

type Body = { token?: string; code?: string; purchaseCents?: number | null; note?: string | null };

async function resolveToken(token: string | undefined | null) {
  const admin = createAdminClient();
  const business = await businessForStaffToken(admin, String(token || ""));
  return { admin, business };
}

// Staff page checks its link is valid and shows the business name.
export async function GET(req: NextRequest) {
  const { business } = await resolveToken(req.nextUrl.searchParams.get("token"));
  if (!business) return NextResponse.json({ error: "This staff link isn't valid anymore. Ask the owner for a new one." }, { status: 404 });
  return NextResponse.json({ businessName: business.businessName });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const { admin, business } = await resolveToken(body.token);
  if (!business) return NextResponse.json({ error: "This staff link isn't valid anymore. Ask the owner for a new one." }, { status: 404 });

  const result = await recordRedemption(admin, {
    businessId: business.businessId,
    rawCode: String(body.code || ""),
    source: "staff_link",
    recordedBy: null,
    purchaseCents: body.purchaseCents ?? null,
    note: body.note ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
