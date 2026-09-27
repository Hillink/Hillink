import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ArticleBody from "@/components/help/ArticleBody";
import HelpShell, { StillNeedHelp, previewHref } from "@/components/help/HelpShell";
import { articlePath, categoryByKey, categoryLabel } from "@/lib/help/categories";
import { getHelpArticle, getRelatedArticles, helpScope, requireHelpViewer } from "@/lib/help/server";
import { readPreviewAs } from "@/lib/help/preview";

export const dynamic = "force-dynamic";

const AUDIENCE_LABEL: Record<string, string> = {
  athlete: "Athletes",
  business: "Businesses",
  both: "Athletes and businesses",
  admin: "Admins only",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  const { category, slug } = await params;
  const viewer = await requireHelpViewer(`/help/${category}/${slug}`);
  const previewAs = readPreviewAs(viewer, (await searchParams).as);
  const scope = helpScope(viewer, previewAs);

  // Missing and not-allowed articles return the same page, so a URL never reveals that an article exists.
  const article = await getHelpArticle(scope, slug);
  if (!article || !categoryByKey(article.category)) notFound();
  // Links keep working after an article moves to another topic.
  if (article.category !== category) redirect(previewHref(articlePath(article), previewAs));

  const related = await getRelatedArticles(scope, article.related_slugs);
  const label = categoryLabel(article.category, scope.audienceRole);
  const updated = formatDate(article.updated_at);
  const verified = formatDate(article.last_verified_at);

  return (
    <HelpShell viewer={viewer} previewAs={previewAs} currentPath={articlePath(article)}>
      <div className="help-breadcrumb">
        <Link href={previewHref("/help", previewAs)}>Help</Link>
        <span>/</span>
        <Link href={previewHref(`/help/${article.category}`, previewAs)}>{label}</Link>
      </div>

      <article className="panel help-article">
        {viewer.role === "admin" && (
          <div style={{ marginBottom: 12 }}>
            <span className={`help-pill${article.status === "live" ? "" : " warn"}`}>{article.status}</span>
            <span className="help-pill">{AUDIENCE_LABEL[article.audience] || article.audience}</span>
            {article.escalation_required && <span className="help-pill warn">hand off to a person</span>}
            {article.status !== "live" && <span className="muted" style={{ fontSize: 13 }}>Customers can&apos;t see this article.</span>}{" "}
            <Link href={`/admin/help/${article.id}`} className="help-inline-link" style={{ fontSize: 13 }}>Edit</Link>
          </div>
        )}
        <h1>{article.title}</h1>
        {article.short_answer && <div className="help-answer">{article.short_answer}</div>}
        {article.steps.length > 0 && (
          <ol className="help-steps">
            {article.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        {article.body && <ArticleBody body={article.body} />}
        {(updated || verified) && (
          <div className="help-meta">
            {updated && <>Last updated {updated}</>}
            {verified && <>{updated ? " · " : ""}Checked against the app {verified}</>}
          </div>
        )}
      </article>

      {related.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="stat-title" style={{ marginBottom: 4 }}>Related</div>
          {related.map((r) => (
            <Link key={r.slug} href={previewHref(articlePath(r), previewAs)} className="help-question">
              <strong>{r.title}</strong>
              <span>{r.short_answer}</span>
            </Link>
          ))}
        </section>
      )}

      <StillNeedHelp viewer={viewer} articleSlug={article.slug} topic={article.title} />
    </HelpShell>
  );
}
