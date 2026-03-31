import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const { data, error } = await access.admin.auth.admin.inviteUserByEmail(email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.user.id });
}
