import WaitlistSelector from "@/components/waitlist/WaitlistSelector";
import Link from "next/link";

export default function WaitlistPage() {
  return (
    <main className="waitlist-shell waitlist-center">
      <section className="waitlist-panel waitlist-panel-center">
        <h1 className="waitlist-title">Join the HILLink waitlist</h1>
        <p className="waitlist-subtitle">
          Connect local businesses with college athletes in minutes.
        </p>
        <p className="waitlist-copy">
          Choose the option that fits you best and get early access when HILLink launches.
        </p>

        <WaitlistSelector />

        <div style={{ marginTop: 16 }}>
          <Link href="/preview" className="waitlist-link-button waitlist-link-button-muted">
            View Product Preview
          </Link>
        </div>
      </section>
    </main>
  );
}
