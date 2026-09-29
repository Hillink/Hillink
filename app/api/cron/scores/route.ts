import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { envValue } from "@/lib/env/read";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAllScores, refreshInstagramFollowers } from "@/lib/score/server";

// Recomputes Hillink Scores and refreshes verified Instagram follower counts.
// Called daily by Vercel Cron (GET with "Authorization: Bearer $CRON_SECRET"), or by an admin (POST).
// AUTH_EXEMPT for GET: guarded by CRON_SECRET instead of a user session.
function hasCronSecret(req: NextRequest): boolean {
  const secret = envValue("CRON_SECRET");
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret;
}

async function run() {
  const admin = createAdminClient();
  try {
    const scores = await refreshAllScores(admin);
    const followers = await refreshInstagramFollowers(admin);
    return NextResponse.json({ scores, followers });
  } catch (err) {
    console.error("[scores] refresh failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Score refresh failed" }, { status: 500 });
  }
}

export const maxDuration = 60;

// Vercel Cron: secret only, so a link can't trigger it with someone's session.
export async function GET(req: NextRequest) {
  if (!hasCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

// Manual run: cron secret or a signed-in admin.
export async function POST(req: NextRequest) {
  if (!hasCronSecret(req)) {
    const roleResult = await requireRole(req, ["admin"]);
    if (roleResult instanceof NextResponse) return roleResult;
  }
  return run();
}
