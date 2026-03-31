import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAccessResult =
  | {
      ok: true;
      userId: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
      admin: ReturnType<typeof createAdminClient>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAdminAccess(): Promise<AdminAccessResult> {
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

  const resolvedRole = String(adminProfile?.role || sessionProfile?.role || "")
    .trim()
    .toLowerCase();

  if (!resolvedRole && adminProfileError && sessionProfileError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Unable to verify admin role: ${adminProfileError.message}` },
        { status: 500 }
      ),
    };
  }

  if (resolvedRole !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: auth.user.id,
    supabase,
    admin,
  };
}
