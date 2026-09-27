import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { validateComplianceInput, type AthleteCompliance } from "@/lib/compliance/rules";

const COLUMNS = "confirmed_adult, visa_status, school_disclosure_ack, school_conflict_categories, compliance_confirmed_at";

export async function GET() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) return access.response;
  const { data, error } = await createAdminClient().from("athlete_profiles").select(COLUMNS).eq("id", access.userId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ compliance: data });
}

// The athlete confirms they're 18+, their visa status, that they'll disclose deals to their school,
// and which categories their school has exclusive sponsors in.
export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as Partial<AthleteCompliance>;
  const result = validateComplianceInput(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("athlete_profiles")
    .update({ ...result.value, compliance_confirmed_at: new Date().toISOString() })
    .eq("id", access.userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Finish your athlete profile first." }, { status: 404 });
  return NextResponse.json({ compliance: data });
}
