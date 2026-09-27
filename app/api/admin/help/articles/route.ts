import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { validateArticleInput } from "@/lib/help/validate";

const LIST_COLUMNS = "id, slug, category, title, audience, status, featured, sort_order, updated_at, last_verified_at";

// Admin: every help article, whatever its audience or status.
export async function GET() {
  const access = await requireAdminAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from("help_articles")
    .select(LIST_COLUMNS)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data || [] });
}

// Admin: create an article. New articles default to draft so nothing reaches customers by accident.
export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateArticleInput({ status: "draft", ...(body || {}) });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });

  const { data, error } = await access.admin
    .from("help_articles")
    .insert({ ...checked.value, updated_by: access.userId })
    .select("id")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "Another article already uses that URL name." : error.message }, { status });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
