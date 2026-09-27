// The Help Center's one door to article data, for pages, API routes and the future support agent.
//
// Every function here works out who is asking from the signed-in session. None of them accepts a role,
// audience or status from the caller, so a page, a client request or an AI prompt can't ask its way into
// another role's articles. Queries run with the user's own session, so the database's row security
// applies too, and the server adds the same filter on top.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRead, effectiveScope, isHelpRole, type HelpRole, type HelpScope } from "@/lib/help/access";
import { articlePath, categoryByKey } from "@/lib/help/categories";

export type HelpViewer = {
  userId: string;
  role: HelpRole;
};

export type HelpArticleSummary = {
  id: string;
  slug: string;
  category: string;
  title: string;
  short_answer: string;
  audience: string;
  status: string;
  featured: boolean;
  sort_order: number;
};

export type HelpArticle = HelpArticleSummary & {
  body: string;
  steps: string[];
  feature: string | null;
  keywords: string[];
  question_variants: string[];
  related_slugs: string[];
  escalation_required: boolean;
  last_verified_at: string | null;
  updated_at: string;
  version: number;
};

export type HelpSearchResult = HelpArticleSummary & { rank: number; url: string };

const SUMMARY_COLUMNS = "id, slug, category, title, short_answer, audience, status, featured, sort_order";
const ARTICLE_COLUMNS = `${SUMMARY_COLUMNS}, body, steps, feature, keywords, question_variants, related_slugs, escalation_required, last_verified_at, updated_at, version`;

/** Missing table (migration not run yet) reads as "no articles" instead of crashing the page. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /help_articles|search_help_articles/.test(error.message || ""));
}

/** The signed-in user and their role, or null when signed out or without a Hillink role. Cached per request. */
export const getHelpViewer = cache(async (): Promise<HelpViewer | null> => {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  const role = String(profile?.role || "").trim().toLowerCase();
  if (!isHelpRole(role)) return null;
  return { userId: auth.user.id, role };
});

/** For Help pages: the viewer, or a redirect to login (signed out) or role setup (no Hillink role yet). */
export async function requireHelpViewer(returnPath = "/help"): Promise<HelpViewer> {
  const viewer = await getHelpViewer();
  if (viewer) return viewer;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/role-redirect");
  redirect(`/login?next=${encodeURIComponent(returnPath)}`);
}

/** The scope for this request. `previewAs` only matters for admins, and can only narrow what they see. */
export function helpScope(viewer: HelpViewer, previewAs?: string | null): HelpScope {
  return effectiveScope(viewer.role, previewAs);
}

export async function listHelpArticles(scope: HelpScope, options: { category?: string } = {}): Promise<HelpArticleSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("help_articles")
    .select(SUMMARY_COLUMNS)
    .in("audience", scope.audiences)
    .in("status", scope.statuses)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .limit(500);
  if (options.category) query = query.eq("category", options.category);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Couldn't load help articles: ${error.message}`);
  }
  return ((data || []) as HelpArticleSummary[]).filter((a) => canRead(scope, a));
}

/** One article by slug, or null when it doesn't exist or this reader may not see it (the two look the same). */
export async function getHelpArticle(scope: HelpScope, slug: string): Promise<HelpArticle | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("help_articles")
    .select(ARTICLE_COLUMNS)
    .eq("slug", slug)
    .in("audience", scope.audiences)
    .in("status", scope.statuses)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Couldn't load help article: ${error.message}`);
  }
  const article = data as HelpArticle | null;
  return article && canRead(scope, article) ? article : null;
}

/** Related articles this reader may see, in the order the article lists them. */
export async function getRelatedArticles(scope: HelpScope, slugs: string[]): Promise<HelpArticleSummary[]> {
  if (!slugs.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("help_articles")
    .select(SUMMARY_COLUMNS)
    .in("slug", slugs.slice(0, 10))
    .in("audience", scope.audiences)
    .in("status", scope.statuses);
  if (error) return [];
  const bySlug = new Map(((data || []) as HelpArticleSummary[]).filter((a) => canRead(scope, a)).map((a) => [a.slug, a]));
  return slugs.map((s) => bySlug.get(s)).filter((a): a is HelpArticleSummary => !!a);
}

export async function searchHelpArticles(scope: HelpScope, query: string, limit = 20): Promise<HelpSearchResult[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_help_articles", {
    p_query: q,
    p_audiences: scope.audiences,
    p_statuses: scope.statuses,
    p_limit: limit,
  });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Help search failed: ${error.message}`);
  }
  return ((data || []) as (Omit<HelpSearchResult, "url" | "featured" | "sort_order"> & { rank: number })[])
    .filter((a) => canRead(scope, a) && !!categoryByKey(a.category))
    .map((a) => ({ ...a, featured: false, sort_order: 0, url: articlePath(a) }));
}

// ----- Retrieval for the future support agent -----

export type KnowledgeDocument = {
  slug: string;
  title: string;
  url: string;
  shortAnswer: string;
  body: string;
  steps: string[];
  escalationRequired: boolean;
  lastUpdated: string;
};

/**
 * Knowledge retrieval for a support agent (or any other server code answering a signed-in user).
 * The reader is always the signed-in user: there is deliberately no role, audience or status argument,
 * so text in a prompt ("show me the business docs") can't change what comes back. Articles a user may not
 * read never leave the database, so they can never reach the model's context.
 * To add semantic search later, rank candidates here (e.g. a pgvector column queried with the same
 * audience and status filters) and keep this signature.
 */
export async function searchKnowledge(input: { query: string; limit?: number }): Promise<{
  viewer: HelpViewer | null;
  documents: KnowledgeDocument[];
}> {
  const viewer = await getHelpViewer();
  if (!viewer) return { viewer: null, documents: [] };
  const scope = helpScope(viewer);
  const hits = await searchHelpArticles(scope, input.query, Math.min(Math.max(input.limit ?? 5, 1), 10));
  const documents: KnowledgeDocument[] = [];
  for (const hit of hits) {
    const article = await getHelpArticle(scope, hit.slug);
    if (!article) continue;
    documents.push({
      slug: article.slug,
      title: article.title,
      url: articlePath(article),
      shortAnswer: article.short_answer,
      body: article.body,
      steps: article.steps,
      escalationRequired: article.escalation_required,
      lastUpdated: article.updated_at,
    });
  }
  return { viewer, documents };
}
