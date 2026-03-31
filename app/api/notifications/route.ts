import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export async function GET() {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, type, title, body, cta_url, cta_label, is_read, email_sent, email_sent_at, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}
