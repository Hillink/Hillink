import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const { data, error } = await access.admin
    .from("finance_events")
    .select(
      "id, source, event_type, event_id, business_id, athlete_id, campaign_id, application_id, transfer_id, amount_cents, currency, status, details_json, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
