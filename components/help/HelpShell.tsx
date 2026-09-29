import Link from "next/link";
import type { ReactNode } from "react";
import type { HelpViewer } from "@/lib/help/server";
import { supportHref } from "@/lib/help/support";

const HOME_BY_ROLE: Record<HelpViewer["role"], string> = {
  athlete: "/athlete",
  business: "/business",
  admin: "/admin",
};

/** Adds an admin's preview choice to a Help link so it survives navigation. Ignored for everyone else. */
export function previewHref(href: string, previewAs: string | null): string {
  if (!previewAs) return href;
  return `${href}${href.includes("?") ? "&" : "?"}as=${previewAs}`;
}

export function HelpSearchForm({ defaultValue = "", previewAs = null, dark = false }: { defaultValue?: string; previewAs?: string | null; dark?: boolean }) {
  return (
    <form action="/help/search" method="get" className="help-search" role="search">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search help (e.g. when do I get paid?)"
        aria-label="Search help articles"
        maxLength={200}
      />
      {previewAs && <input type="hidden" name="as" value={previewAs} />}
      <button type="submit" className={dark ? "cta-button" : "secondary-button"}>Search</button>
    </form>
  );
}

export function StillNeedHelp({ viewer, articleSlug, topic }: { viewer: HelpViewer; articleSlug?: string; topic?: string }) {
  return (
    <section className="panel help-contact">
      <div>
        <h2>Still need help?</h2>
        <p>Email the HILLink team and we&apos;ll get back to you.</p>
      </div>
      <a className="cta-button" href={supportHref({ role: viewer.role, articleSlug, topic })}>
        Contact HILLink
      </a>
    </section>
  );
}

export default function HelpShell({
  viewer,
  previewAs,
  currentPath,
  children,
}: {
  viewer: HelpViewer;
  previewAs: string | null;
  currentPath: string;
  children: ReactNode;
}) {
  return (
    <main className="page-shell">
      <div className="help-shell">
        <div className="help-topbar">
          <Link href={HOME_BY_ROLE[viewer.role]} className="help-back">
            ← Back to dashboard
          </Link>
          <Link href={previewHref("/help", previewAs)} className="help-brand">
            <span><span style={{ color: "var(--red)" }}>HIL</span>Link</span>
            <span className="muted">Help</span>
          </Link>
        </div>

        {viewer.role === "admin" && (
          <div className="help-admin-bar">
            <strong>Admin view.</strong>
            <span>Showing:</span>
            <Link href={currentPath} aria-current={!previewAs}>everything</Link>
            <Link href={previewHref(currentPath, "athlete")} aria-current={previewAs === "athlete"}>as an athlete</Link>
            <Link href={previewHref(currentPath, "business")} aria-current={previewAs === "business"}>as a business</Link>
            <span>·</span>
            <Link href="/admin/help">Manage articles</Link>
          </div>
        )}

        {children}
      </div>
    </main>
  );
}
