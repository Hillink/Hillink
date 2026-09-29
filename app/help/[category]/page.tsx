import Link from "next/link";
import { notFound } from "next/navigation";
import HelpShell, { HelpSearchForm, StillNeedHelp, previewHref } from "@/components/help/HelpShell";
import { articlePath, categoryByKey, categoryLabel } from "@/lib/help/categories";
import { helpScope, listHelpArticles, requireHelpViewer } from "@/lib/help/server";
import { readPreviewAs } from "@/lib/help/preview";

export const dynamic = "force-dynamic";

export default async function HelpCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  const { category } = await params;
  const viewer = await requireHelpViewer(`/help/${category}`);
  const previewAs = readPreviewAs(viewer, (await searchParams).as);
  const scope = helpScope(viewer, previewAs);

  // Unknown topics and topics with nothing this reader can see look the same: not found.
  if (!categoryByKey(category)) notFound();
  const articles = await listHelpArticles(scope, { category });
  if (articles.length === 0) notFound();

  return (
    <HelpShell viewer={viewer} previewAs={previewAs} currentPath={`/help/${category}`}>
      <div className="help-breadcrumb">
        <Link href={previewHref("/help", previewAs)}>Help</Link>
        <span>/</span>
        <span>{categoryLabel(category, scope.audienceRole)}</span>
      </div>
      <section className="panel">
        <h1 style={{ margin: "0 0 8px", fontSize: "1.8rem" }}>{categoryLabel(category, scope.audienceRole)}</h1>
        {articles.map((article) => (
          <Link key={article.slug} href={previewHref(articlePath(article), previewAs)} className="help-question">
            <strong>
              {viewer.role === "admin" && article.status !== "live" && <span className="help-pill warn">{article.status}</span>}
              {article.title}
            </strong>
            <span>{article.short_answer}</span>
          </Link>
        ))}
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="stat-title" style={{ marginBottom: 8 }}>Search all help</div>
        <HelpSearchForm previewAs={previewAs} />
      </section>
      <StillNeedHelp viewer={viewer} topic={categoryLabel(category, scope.audienceRole)} />
    </HelpShell>
  );
}
