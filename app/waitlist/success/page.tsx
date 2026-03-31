import Link from "next/link";

export default function WaitlistSuccessPage() {
  return (
    <main className="waitlist-shell waitlist-center">
      <section className="waitlist-panel waitlist-panel-center">
        <h1 className="waitlist-title">You&apos;re in.</h1>
        <p className="waitlist-subtitle">
          Thanks for joining the HILLink waitlist. We&apos;ll reach out when early access opens.
        </p>

        <div className="waitlist-success-actions">
          <Link href="/" className="waitlist-link-button waitlist-link-button-muted">
            Back to Home
          </Link>
          <Link href="/waitlist/business" className="waitlist-link-button waitlist-link-button-primary">
            Join as a Business
          </Link>
          <Link href="/waitlist/athlete" className="waitlist-link-button waitlist-link-button-dark">
            Join as an Athlete
          </Link>
        </div>
      </section>
    </main>
  );
}
