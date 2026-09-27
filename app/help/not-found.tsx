import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/help/support";

// Shown for missing articles and for articles this account can't read. The two look the same on purpose.
export default function HelpNotFound() {
  return (
    <main className="page-shell">
      <div className="help-shell">
        <section className="panel">
          <h1 style={{ marginTop: 0 }}>We couldn&apos;t find that help article</h1>
          <p className="muted">It may have moved, or it isn&apos;t available for your account.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="cta-button" href="/help">Go to Help</Link>
            <a className="secondary-button" href={`mailto:${SUPPORT_EMAIL}`}>Contact HILLink</a>
          </div>
        </section>
      </div>
    </main>
  );
}
