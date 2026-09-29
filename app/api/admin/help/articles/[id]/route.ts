import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { validateArticleInput } from "@/lib/help/validate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdminAccess();
  if (!access.ok) return access.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await access.admin.from("help_articles").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { search_vector: _vector, ...article } = data as Record<string, unknown>;
  return NextResponse.json({ article });
}

// Admin: save every field of an article. Unpublishing is a status change (to draft or deprecated).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdminAccess();
  if (!access.ok) return access.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateArticleInput(body || {});
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 422 });

  const { data, error } = await access.admin
    .from("help_articles")
    .update({ ...checked.value, updated_by: access.userId })
    .eq("id", id)
    .select("id, version, updated_at")
    .maybeSingle();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "Another article already uses that URL name." : error.message }, { status });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ article: data });
}
