import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AppRole = "business" | "athlete" | "admin";

export type RoleAccessResult =
  | {
      ok: true;
      userId: string;
      role: AppRole;
      authUser: {
        id: string;
        email: string | null;
        user_metadata: Record<string, unknown> | null;
      };
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireRoleAccess(allowedRoles: AppRole[]): Promise<RoleAccessResult> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client is not configured";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 500 }),
    };
  }

  const { data: adminProfile, error: adminProfileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  const { data: sessionProfile, error: sessionProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!adminProfile && !sessionProfile && adminProfileError && sessionProfileError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Unable to verify role: ${adminProfileError.message}` },
        { status: 500 }
      ),
    };
  }

  const adminRoleRaw = String(adminProfile?.role || "").trim().toLowerCase();
  const sessionRoleRaw = String(sessionProfile?.role || "").trim().toLowerCase();

  if (adminRoleRaw && sessionRoleRaw && adminRoleRaw !== sessionRoleRaw) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const role = (adminRoleRaw || sessionRoleRaw) as AppRole;

  if (role !== "business" && role !== "athlete" && role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: auth.user.id,
    role,
    authUser: {
      id: auth.user.id,
      email: auth.user.email || null,
      user_metadata:
        auth.user.user_metadata && typeof auth.user.user_metadata === "object"
          ? (auth.user.user_metadata as Record<string, unknown>)
          : null,
    },
    supabase,
  };
}
