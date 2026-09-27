"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SCHOOL_CONFLICT_OPTIONS, type VisaStatus } from "@/lib/compliance/rules";

// Athlete eligibility: required once before joining campaigns, editable any time.
export default function AthleteEligibilityPage() {
  const [adult, setAdult] = useState(false);
  const [visa, setVisa] = useState<VisaStatus | "">("");
  const [disclosure, setDisclosure] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/athlete/compliance")
      .then((res) => res.json())
      .then((data) => {
        const c = data.compliance;
        if (c) {
          setAdult(!!c.confirmed_adult);
          setVisa(c.visa_status || "");
          setDisclosure(!!c.school_disclosure_ack);
          setConflicts(c.school_conflict_categories || []);
          setConfirmedAt(c.compliance_confirmed_at);
        }
      })
      .catch(() => setError("Couldn't load your eligibility."))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) =>
    setConflicts((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/athlete/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_adult: adult, visa_status: visa || null, school_disclosure_ack: disclosure, school_conflict_categories: conflicts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save.");
        return;
      }
      setConfirmedAt(data.compliance?.compliance_confirmed_at ?? new Date().toISOString());
      setSaved(true);
    } catch {
      setError("Couldn't reach Hillink. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="container" style={{ maxWidth: 640, padding: "28px 0 60px" }}>
        <Link href="/athlete" className="muted" style={{ fontWeight: 700 }}>← Dashboard</Link>
        <h1 className="page-title" style={{ fontSize: "2rem", marginTop: 6 }}>Your eligibility</h1>
        <p className="muted">
          These protect you and your eligibility. You need to confirm them once before joining campaigns.
        </p>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <form className="panel" onSubmit={save} style={{ display: "grid", gap: 18 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} style={{ marginTop: 4 }} />
              <span><strong>I am 18 or older.</strong></span>
            </label>

            <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <legend style={{ fontWeight: 800, marginBottom: 6 }}>Visa status</legend>
              {([
                ["us_citizen_or_resident", "I'm a US citizen or permanent resident"],
                ["international_cleared", "I'm an international student and my school's international office cleared me for NIL work in the US"],
                ["international_not_cleared", "I'm an international student and haven't been cleared"],
              ] as [VisaStatus, string][]).map(([value, label]) => (
                <label key={value} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="radio" name="visa" checked={visa === value} onChange={() => setVisa(value)} style={{ marginTop: 4 }} />
                  <span>{label}</span>
                </label>
              ))}
              {visa === "international_not_cleared" && (
                <p style={{ margin: 0, color: "var(--red)", fontSize: 14 }}>
                  Most student visas (F-1, J-1) don&apos;t allow paid work in the US, including NIL. You won&apos;t be able to join campaigns until your school clears you.
                </p>
              )}
            </fieldset>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} style={{ marginTop: 4 }} />
              <span>
                <strong>I&apos;ll report my Hillink deals to my school</strong> as its NIL policy requires (usually through the school&apos;s NIL disclosure app or compliance office).
              </span>
            </label>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 800, marginBottom: 4 }}>Does your school have exclusive sponsors?</legend>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
                Pick any category where your school or team has an exclusive deal (for example Nike for apparel or Coca-Cola for drinks).
                We&apos;ll keep you out of campaigns that would conflict. Not sure? Ask your compliance office.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                {SCHOOL_CONFLICT_OPTIONS.map((c) => (
                  <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                    <input type="checkbox" checked={conflicts.includes(c.key)} onChange={() => toggle(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <button className="cta-button" type="submit" disabled={saving} style={{ justifyContent: "center" }}>
              {saving ? "Saving…" : "Confirm eligibility"}
            </button>
            {error && <div className="error-message">{error}</div>}
            {saved && (
              <div className="success-message">
                {visa === "international_not_cleared"
                  ? "Saved. You can join campaigns once your school clears you for paid work."
                  : "Saved. You can join campaigns."}
              </div>
            )}
            {confirmedAt && !saved && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Last confirmed {new Date(confirmedAt).toLocaleDateString()}.</p>}
          </form>
        )}
      </div>
    </main>
  );
}
