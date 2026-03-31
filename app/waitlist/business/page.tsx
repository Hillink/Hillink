import BusinessWaitlistForm from "@/components/waitlist/BusinessWaitlistForm";

export default function BusinessWaitlistPage() {
  return (
    <main className="waitlist-shell">
      <section className="waitlist-panel waitlist-panel-form">
        <div className="waitlist-header-block">
          <h1 className="waitlist-title">Business Early Access</h1>
          <p className="waitlist-subtitle">
            Be first to use HILLink to connect with local college athletes for promotions and NIL campaigns.
          </p>
        </div>

        <BusinessWaitlistForm />
      </section>
    </main>
  );
}
