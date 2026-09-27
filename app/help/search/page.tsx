import Link from "next/link";
import HelpShell, { HelpSearchForm, StillNeedHelp, previewHref } from "@/components/help/HelpShell";
import { START_HERE_SLUGS, categoryLabel } from "@/lib/help/categories";
import { helpScope, requireHelpViewer, searchHelpArticles } from "@/lib/help/server";
import { readPreviewAs } from "@/lib/help/preview";

export const dynamic = "force-dynamic";

export default async function HelpSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; as?: string | string[] }>;
}) {
  const viewer = await requireHelpViewer("/help/search");
  const sp = await searchParams;
  const previewAs = readPreviewAs(viewer, sp.as);
  const scope = helpScope(viewer, previewAs);
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q || "").trim().slice(0, 200);
  const results = query.length >= 2 ? await searchHelpArticles(scope, query) : [];
  const startRole = scope.audienceRole === "business" ? "business" : "athlete";

  return (
    <HelpShell viewer={viewer} previewAs={previewAs} currentPath={`/help/search?q=${encodeURIComponent(query)}`}>
      <div className="help-breadcrumb">
        <Link href={previewHref("/help", previewAs)}>Help</Link>
        <span>/</span>
        <span>Search</span>
      </div>
      <section className="panel">
        <HelpSearchForm defaultValue={query} previewAs={previewAs} />
        {query.length >= 2 && (
          <p className="muted" style={{ margin: "14px 0 0" }}>
            {results.length === 0
              ? `No articles match "${query}".`
              : `${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`}
          </p>
        )}
        {results.map((result) => (
          <Link key={result.slug} href={previewHref(result.url, previewAs)} className="help-question">
            <strong>
              {viewer.role === "admin" && result.status !== "live" && <span className="help-pill warn">{result.status}</span>}
              {result.title}
            </strong>
            <span>{categoryLabel(result.category, scope.audienceRole)} · {result.short_answer}</span>
          </Link>
        ))}
        {query.length >= 2 && results.length === 0 && (
          <p style={{ marginBottom: 0 }}>
            Try fewer or different words, or read the{" "}
            <Link className="help-inline-link" href={previewHref(`/help/getting-started/${START_HERE_SLUGS[startRole]}`, previewAs)}>
              Start Here guide
            </Link>
            .
          </p>
        )}
      </section>
      <StillNeedHelp viewer={viewer} topic={query || undefined} />
    </HelpShell>
  );
}
