import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Role = "business" | "athlete" | "admin";

export async function requireRole(
  _req: NextRequest,
  allowed: Role[]
): Promise<{ userId: string; role: Role } | NextResponse> {
  const supabase = await createServerClient();
  const { data: auth, error } = await supabase.auth.getUser();

  if (error || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: adminProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  const adminRole = String(adminProfile?.role || "").trim().toLowerCase();
  const role = adminRole as Role;
  if (role !== "business" && role !== "athlete" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!allowed.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: auth.user.id, role };
}
