import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["athlete", "business", "admin"]);
  if (auth instanceof NextResponse) {
    return auth;
  }

  return NextResponse.json({ userId: auth.userId, role: auth.role });
}
