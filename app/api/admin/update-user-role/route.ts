import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

type Body = {
  userId?: string;
  role?: "athlete" | "business";
};

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const body = (await req.json()) as Body;
  const userId = body.userId?.trim();
  const role = body.role;

  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
  }

  if (role !== "athlete" && role !== "business") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (userId === access.userId) {
    return NextResponse.json({ error: "Admins cannot change their own role" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await access.admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const oldRole = String(existing.role || "").trim().toLowerCase();
  if (oldRole === role) {
    return NextResponse.json({ success: true, unchanged: true });
  }

  const { error: updateError } = await access.admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit trail until dedicated role-audit table is introduced.
  const { error: auditError } = await access.admin.from("finance_events").insert({
    source: "system",
    event_type: "admin.role_changed",
    event_id: `${Date.now()}-${access.userId}-${userId}`,
    status: "applied",
    details_json: {
      actor_admin_id: access.userId,
      target_user_id: userId,
      old_role: oldRole,
      new_role: role,
    },
  });

  if (auditError) {
    console.error("role change audit insert failed", auditError.message);
  }

  return NextResponse.json({ success: true, userId, role });
}
