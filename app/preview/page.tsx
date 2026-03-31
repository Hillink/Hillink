import Link from "next/link";

const previewSteps = [
  {
    title: "1. Business Creates Campaign",
    body: "Set payout, athlete tier, campaign goals, and timeline in a guided flow.",
  },
  {
    title: "2. Athletes Join and Submit",
    body: "Athletes apply, deliver content, and submit proof with diagnostics visibility.",
  },
  {
    title: "3. Business Reviews and Pays",
    body: "Approve deliverables, track status, and release payouts with clear audit history.",
  },
];

const featureCards = [
  {
    heading: "Smart Athlete Matching",
    text: "Filter by sport, location, tier, and payout expectations to find aligned athletes quickly.",
  },
  {
    heading: "Built-In Campaign Controls",
    text: "Manage slots, status transitions, and campaign lifecycle from one dashboard.",
  },
  {
    heading: "Diagnostics + Reporting",
    text: "Track submissions and key engagement metrics so campaign performance stays transparent.",
  },
];

export default function PreviewPage() {
  return (
    <main className="waitlist-shell waitlist-center">
      <section className="waitlist-panel waitlist-panel-center" style={{ maxWidth: 980 }}>
        <h1 className="waitlist-title">HILLink Product Preview</h1>
        <p className="waitlist-subtitle">
          A quick look at how businesses and athletes will collaborate inside HILLink.
        </p>
        <p className="waitlist-copy" style={{ marginBottom: 20 }}>
          This is a prototype walkthrough. Final production details may change before launch.
        </p>

        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          {previewSteps.map((step) => (
            <article
              key={step.title}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 16,
                textAlign: "left",
              }}
            >
              <h3 style={{ margin: "0 0 8px" }}>{step.title}</h3>
              <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>{step.body}</p>
            </article>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 24 }}>
          {featureCards.map((card) => (
            <article
              key={card.heading}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 14,
                textAlign: "left",
              }}
            >
              <h4 style={{ margin: "0 0 8px" }}>{card.heading}</h4>
              <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5, fontSize: 14 }}>{card.text}</p>
            </article>
          ))}
        </div>

        <div className="waitlist-success-actions">
          <Link href="/waitlist/athlete" className="waitlist-link-button waitlist-link-button-dark">
            Join Athlete Waitlist
          </Link>
          <Link href="/waitlist/business" className="waitlist-link-button waitlist-link-button-primary">
            Join Business Waitlist
          </Link>
          <Link href="/waitlist" className="waitlist-link-button waitlist-link-button-muted">
            Back to Waitlist
          </Link>
        </div>
      </section>
    </main>
  );
}
