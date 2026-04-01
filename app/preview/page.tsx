import Link from "next/link";

export default function PreviewPage() {
  return (
    <main className="waitlist-shell waitlist-center">
      <section className="waitlist-panel waitlist-panel-center" style={{ maxWidth: 1150 }}>
        <h1 className="waitlist-title">HILLink Product Preview</h1>
        <p className="waitlist-subtitle">
          Demo interiors for both portals. This preview shows controls and workflows, but buttons are intentionally disabled.
        </p>
        <p className="waitlist-copy" style={{ marginBottom: 20 }}>
          Explore what athletes and businesses will see once the full platform is open.
        </p>

        <div className="prototype-banner">
          <span>Prototype Mode</span>
          <span>No actions will be submitted</span>
        </div>

        <div className="prototype-portals-grid">
          <article className="prototype-portal-card">
            <header className="prototype-portal-head athlete">
              <h3>Athlete Portal</h3>
              <p>Campaign feed, submission queue, and earnings overview.</p>
            </header>

            <div className="prototype-stats-row">
              <div>
                <strong>4</strong>
                <span>Active Campaigns</span>
              </div>
              <div>
                <strong>92%</strong>
                <span>On-Time Rate</span>
              </div>
              <div>
                <strong>4.7</strong>
                <span>Current Rating</span>
              </div>
            </div>

            <div className="prototype-list-card">
              <h4>Today&apos;s Deliverables</h4>
              <ul>
                <li>
                  <span>Post draft for Aggie Auto Group</span>
                  <em>Due in 5h</em>
                </li>
                <li>
                  <span>Story proof for Brazos Fitness</span>
                  <em>Under Review</em>
                </li>
                <li>
                  <span>Tag verification for Local Grind Coffee</span>
                  <em>Ready to Submit</em>
                </li>
              </ul>
            </div>

            <div className="prototype-actions">
              <button disabled>Apply to Campaign</button>
              <button disabled>Upload Deliverable</button>
              <button disabled>View Earnings</button>
            </div>
          </article>

          <article className="prototype-portal-card">
            <header className="prototype-portal-head business">
              <h3>Business Portal</h3>
              <p>Create campaigns, review athletes, and monitor performance.</p>
            </header>

            <div className="prototype-stats-row">
              <div>
                <strong>3</strong>
                <span>Open Campaigns</span>
              </div>
              <div>
                <strong>18</strong>
                <span>Total Applicants</span>
              </div>
              <div>
                <strong>$2.4K</strong>
                <span>Monthly Spend</span>
              </div>
            </div>

            <div className="prototype-list-card">
              <h4>Campaign Snapshot</h4>
              <ul>
                <li>
                  <span>Aggie Auto Group Spring Promo</span>
                  <em>6/8 slots filled</em>
                </li>
                <li>
                  <span>Brazos Fitness Student Push</span>
                  <em>2 deliverables pending</em>
                </li>
                <li>
                  <span>Local Grind Weekend Boost</span>
                  <em>ROI trend +14%</em>
                </li>
              </ul>
            </div>

            <div className="prototype-actions">
              <button disabled>Create Campaign</button>
              <button disabled>Review Applicants</button>
              <button disabled>Rate Athlete</button>
            </div>
          </article>
        </div>

        <div className="prototype-note">
          <h4>Want full access?</h4>
          <p>
            Join the waitlist for early onboarding. We are prioritizing athlete and business users in College Station and nearby Houston markets.
          </p>
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
