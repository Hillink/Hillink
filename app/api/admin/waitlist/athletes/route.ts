import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { createWaitlistAdminClient } from "@/lib/supabase/waitlist-admin";

export async function GET(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let waitlistAdmin;
  try {
    waitlistAdmin = createWaitlistAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Waitlist client is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const statusFilter = req.nextUrl.searchParams.get("status")?.trim().toLowerCase() || "";

  let query = waitlistAdmin
    .from("athlete_waitlist")
    .select(
      "id, school, sport, nil_experience, deal_types, would_use_platform, wants_early_access, email, instagram_handle, preferred_business_types, objections, status, admin_notes, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [] });
}
