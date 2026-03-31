import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  const { data, error } = await access.admin.auth.admin.listUsers({ perPage: 1000 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = data.users.map((u: {
    id: string;
    email?: string | null;
    confirmed_at?: string | null;
    created_at?: string;
    banned_until?: string | null;
  }) => ({
    id: u.id,
    email: u.email ?? "",
    confirmed_at: u.confirmed_at ?? null,
    created_at: u.created_at,
    banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
  }));

  return NextResponse.json({ users });
}
