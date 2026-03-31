import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: { userId?: unknown; suspend?: unknown };
  try {
    body = (await req.json()) as { userId?: unknown; suspend?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const suspend = Boolean(body.suspend);

  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === access.userId) {
    return NextResponse.json({ error: "You cannot suspend your own account" }, { status: 400 });
  }

  const { error } = await access.admin.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "87600h" : "none", // 10 years = effectively permanent; "none" lifts ban
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
