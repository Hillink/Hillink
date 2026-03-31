import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type MarkReadBody = {
  ids?: string[];
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as MarkReadBody;
  const admin = createAdminClient();

  if (body.ids && body.ids.length > 0) {
    await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", body.ids);
  } else {
    // Mark all unread for this user
    await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }

  return NextResponse.json({ success: true });
}
