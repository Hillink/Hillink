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

        <div className="preview-journey-grid">
          {previewSteps.map((step) => (
            <article key={step.title} className="preview-step-card">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>

        <div className="preview-features-grid">
          {featureCards.map((card) => (
            <article key={card.heading} className="preview-feature-card">
              <h4>{card.heading}</h4>
              <p>{card.text}</p>
            </article>
          ))}
        </div>

        <div className="preview-signals-grid">
          <article className="preview-signal-card">
            <h4>For Businesses</h4>
            <p>See who accepted, who posted, and how each campaign is pacing before renewal decisions.</p>
          </article>
          <article className="preview-signal-card">
            <h4>For Athletes</h4>
            <p>Track active campaigns, deliverables, and progression milestones in one clean workflow.</p>
          </article>
          <article className="preview-signal-card">
            <h4>For Admin Ops</h4>
            <p>Prototype includes moderation, approvals, and lifecycle controls for safe rollout at launch.</p>
          </article>
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
