import Link from "next/link";
import HelpShell, { HelpSearchForm, StillNeedHelp, previewHref } from "@/components/help/HelpShell";
import { HELP_CATEGORIES, HELP_SECTIONS, START_HERE_SLUGS, articlePath, categoryLabel } from "@/lib/help/categories";
import { helpScope, listHelpArticles, requireHelpViewer, type HelpArticleSummary } from "@/lib/help/server";
import { readPreviewAs } from "@/lib/help/preview";

export const dynamic = "force-dynamic";

const GREETING = {
  athlete: "Help for Athletes",
  business: "Help for Businesses",
  admin: "Help Center",
} as const;

export default async function HelpHomePage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
  const viewer = await requireHelpViewer("/help");
  const previewAs = readPreviewAs(viewer, (await searchParams).as);
  const scope = helpScope(viewer, previewAs);
  const role = scope.audienceRole;
  const labelRole = role === "admin" ? "athlete" : role;
  const articles = await listHelpArticles(scope);

  const startHereSlugs = role === "admin" ? Object.values(START_HERE_SLUGS) : [START_HERE_SLUGS[role]];
  const startHere = startHereSlugs
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter((a): a is HelpArticleSummary => !!a);
  const popular = articles.filter((a) => a.featured && !startHereSlugs.includes(a.slug)).slice(0, 6);

  const byCategory = new Map<string, HelpArticleSummary[]>();
  for (const article of articles) {
    byCategory.set(article.category, [...(byCategory.get(article.category) || []), article]);
  }
  const sections = HELP_SECTIONS.map((section) => ({
    section,
    categories: HELP_CATEGORIES.filter((c) => c.section === section.key && byCategory.has(c.key)).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((s) => s.categories.length > 0);

  return (
    <HelpShell viewer={viewer} previewAs={previewAs} currentPath="/help">
      <section className="help-hero">
        <div className="help-kicker">{GREETING[role]}</div>
        <h1>How can we help?</h1>
        <HelpSearchForm previewAs={previewAs} dark />
      </section>

      {articles.length === 0 && (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Help articles are on the way</h2>
          <p className="muted" style={{ marginBottom: 0 }}>There&apos;s nothing here yet. Contact HILLink below and we&apos;ll help you directly.</p>
        </section>
      )}

      {startHere.map((article) => (
        <section className="panel help-start" key={article.slug} style={{ marginBottom: 16 }}>
          <div>
            <div className="help-kicker" style={{ color: "var(--red)" }}>Start here</div>
            <h2>{article.title}</h2>
            <div className="muted">{article.short_answer}</div>
          </div>
          <Link className="cta-button" href={previewHref(articlePath(article), previewAs)}>
            Read the guide
          </Link>
        </section>
      ))}

      {popular.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="stat-title" style={{ marginBottom: 4 }}>Common questions</div>
          {popular.map((article) => (
            <Link key={article.slug} href={previewHref(articlePath(article), previewAs)} className="help-question">
              <strong>{article.title}</strong>
              <span>{article.short_answer}</span>
            </Link>
          ))}
        </section>
      )}

      {sections.length > 0 && (
        <div className="help-grid">
          {sections.map(({ section, categories }) => (
            <section className="panel help-section" key={section.key}>
              <h2>{section.label[labelRole]}</h2>
              <p>{section.blurb[labelRole]}</p>
              <ul className="help-links">
                {categories.map((category) => (
                  <li key={category.key}>
                    <Link href={previewHref(`/help/${category.key}`, previewAs)}>
                      <span>{categoryLabel(category.key, role)}</span>
                      <span className="help-count">{byCategory.get(category.key)?.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <StillNeedHelp viewer={viewer} />
    </HelpShell>
  );
}
