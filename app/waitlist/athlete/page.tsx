import AthleteWaitlistForm from "@/components/waitlist/AthleteWaitlistForm";

export default function AthleteWaitlistPage() {
  return (
    <main className="waitlist-shell">
      <section className="waitlist-panel waitlist-panel-form">
        <div className="waitlist-header-block">
          <h1 className="waitlist-title">Athlete Early Access</h1>
          <p className="waitlist-subtitle">
            Get early access to HILLink and be first in line for local NIL opportunities.
          </p>
        </div>

        <AthleteWaitlistForm />
      </section>
    </main>
  );
}
