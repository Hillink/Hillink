import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { getAppUrl } from "@/lib/stripe/config";
import { rotateStaffLink, staffLinkCreatedAt } from "@/lib/redemptions/server";

// Makes a new private link for counter staff to log customer codes. Any older link stops working.
export async function POST() {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) return access.response;

  try {
    const token = await rotateStaffLink(createAdminClient(), access.userId);
    return NextResponse.json({ url: `${getAppUrl()}/redeem/${token}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create link" }, { status: 500 });
  }
}

// Whether a staff link already exists, so the page can warn before replacing it.
export async function GET() {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) return access.response;
  const createdAt = await staffLinkCreatedAt(createAdminClient(), access.userId);
  return NextResponse.json({ exists: !!createdAt, createdAt });
}
