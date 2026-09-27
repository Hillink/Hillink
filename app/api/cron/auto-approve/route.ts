import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { runAutoApprove } from "@/lib/automation/autoApprove";

// Approves proof left unreviewed past the campaign's review window, then pays the athlete.
// Called daily by Vercel Cron (GET with "Authorization: Bearer $CRON_SECRET"), or by an admin (POST).
// AUTH_EXEMPT for GET: guarded by CRON_SECRET instead of a user session.
function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret;
}

async function run() {
  const summary = await runAutoApprove(createAdminClient(), getStripe);
  if (summary.errors.length) console.error("[auto-approve] errors", summary.errors);
  return NextResponse.json(summary);
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
