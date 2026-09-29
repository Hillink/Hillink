import { NextRequest, NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { effectiveScope } from "@/lib/help/access";
import { searchHelpArticles } from "@/lib/help/server";

// Help search for the signed-in user. What they may see comes from their session, never from the request.
export async function GET(req: NextRequest) {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) return access.response;

  const query = (req.nextUrl.searchParams.get("q") || "").trim();
  const scope = effectiveScope(access.role, req.nextUrl.searchParams.get("as"));
  try {
    const results = await searchHelpArticles(scope, query);
    return NextResponse.json({
      results: results.map((r) => ({ slug: r.slug, category: r.category, title: r.title, shortAnswer: r.short_answer, url: r.url })),
    });
  } catch {
    return NextResponse.json({ error: "Search isn't available right now." }, { status: 500 });
  }
}
