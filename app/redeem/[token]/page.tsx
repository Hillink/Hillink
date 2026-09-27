"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Logged = { code: string; athlete: string | null; campaign: string; at: string; duplicate: boolean };

// Counter staff page: type the customer's code, tap Log. No Hillink login needed; the link is the key.
export default function StaffRedeemPage() {
  const { token } = useParams<{ token: string }>();
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [logged, setLogged] = useState<Logged[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/redemptions/staff?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setLinkError(data.error || "This staff link isn't valid.");
        else setBusinessName(data.businessName);
      })
      .catch(() => setLinkError("Couldn't reach Hillink. Check the connection."));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const dollars = amount.trim() ? Number(amount.replace(/[$,]/g, "")) : null;
    let res: Response;
    let data: { error?: string; athleteFirstName?: string | null; campaignTitle?: string; duplicate?: boolean };
    try {
      res = await fetch("/api/redemptions/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          code,
          purchaseCents: dollars != null && Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
        }),
      });
      data = await res.json();
    } catch {
      setError("Couldn't reach Hillink. Check the connection and try again.");
      return;
    } finally {
      setSubmitting(false);
    }
    if (!res.ok) {
      setError(data.error || "Couldn't log that code.");
      return;
    }
    setLogged((prev) => [
      { code: code.toUpperCase().trim(), athlete: data.athleteFirstName ?? null, campaign: data.campaignTitle ?? "", at: new Date().toLocaleTimeString(), duplicate: !!data.duplicate },
      ...prev,
    ].slice(0, 20));
    setCode("");
    setAmount("");
    inputRef.current?.focus();
  };

  if (linkError) {
    return (
      <main className="page-shell" style={{ display: "grid", placeItems: "center", padding: 16 }}>
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1 style={{ marginTop: 0, fontSize: "1.4rem" }}>Link not working</h1>
          <p className="muted">{linkError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell" style={{ padding: "24px 16px" }}>
      <div style={{ width: "min(480px, 100%)", margin: "0 auto" }}>
        <p className="muted" style={{ margin: 0, fontWeight: 700 }}>Hillink customer codes</p>
        <h1 style={{ margin: "4px 0 16px", fontSize: "1.7rem" }}>{businessName ?? "Loading…"}</h1>

        <form className="panel" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
            Customer&apos;s code
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="JAKE-7K2Q"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              style={{ fontSize: "1.5rem", letterSpacing: "0.06em", fontWeight: 800, padding: "12px 14px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
            Order total (optional)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$12.50" />
          </label>
          <button className="cta-button" type="submit" disabled={submitting || !businessName} style={{ justifyContent: "center" }}>
            {submitting ? "Logging…" : "Log customer"}
          </button>
          {error && <div className="error-message">{error}</div>}
        </form>

        {logged.length > 0 && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>Logged on this device</h2>
            {logged.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
                <span>
                  <strong>{l.code}</strong>
                  <span className="muted"> · {l.athlete ? `${l.athlete}'s customer` : l.campaign}</span>
                  {l.duplicate && <span style={{ color: "var(--warning)" }}> · already logged</span>}
                </span>
                <span className="muted">{l.at}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
