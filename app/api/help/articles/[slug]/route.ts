import { NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { effectiveScope } from "@/lib/help/access";
import { articlePath } from "@/lib/help/categories";
import { getHelpArticle } from "@/lib/help/server";

// One help article, for contextual help and the future support agent. Missing and not-allowed both 404.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) return access.response;

  const { slug } = await params;
  const article = await getHelpArticle(effectiveScope(access.role), slug).catch(() => null);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    article: {
      slug: article.slug,
      category: article.category,
      title: article.title,
      shortAnswer: article.short_answer,
      body: article.body,
      steps: article.steps,
      relatedSlugs: article.related_slugs,
      escalationRequired: article.escalation_required,
      updatedAt: article.updated_at,
      url: articlePath(article),
    },
  });
}
