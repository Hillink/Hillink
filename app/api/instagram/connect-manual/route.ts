import { NextRequest, NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type Body = {
  igUserId?: string;
  igUsername?: string;
  accessToken?: string;
  expiresAt?: string | null;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;
  const supabase = access.supabase;

  const body = (await req.json()) as Body;
  const token = body.accessToken?.trim();

  if (!token) {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  const { error } = await supabase.from("athlete_instagram_connections").upsert(
    {
      athlete_id: userId,
      ig_user_id: body.igUserId?.trim() || null,
      ig_username: body.igUsername?.trim() || null,
      access_token: token,
      token_expires_at: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
      connected_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
