"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type CampaignResult = {
  campaignId: string;
  title: string;
  athletes: number;
  postsApproved: number;
  customers: number;
  reportedSalesCents: number;
  athletePayCents: number;
  reach: number;
  costPerCustomerCents: number | null;
};

type Report = {
  month: string;
  businessName: string;
  campaigns: CampaignResult[];
  totals: Omit<CampaignResult, "campaignId" | "title"> & { subscriptionCents: number; totalCostCents: number; totalCostPerCustomerCents: number | null };
  topAthletes: { athleteId: string; customers: number; name: string; school: string | null; sport: string | null }[];
};

const usd = (cents: number | null | undefined) =>
  cents == null ? "—" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

function monthOptions(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// Monthly results: the proof a business needs that Hillink athletes bring in customers.
export default function BusinessReportPage() {
  const months = monthOptions();
  const [month, setMonth] = useState(months[0]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [staffLink, setStaffLink] = useState("");
  const [staffLinkExists, setStaffLinkExists] = useState(false);
  const latestRequest = useRef(0);
  const [code, setCode] = useState("");
  const [logMessage, setLogMessage] = useState("");

  const load = async (m: string) => {
    // Only the newest request may update the page, so fast month switching never shows the wrong month.
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/business/report?month=${m}`);
      const data = await res.json();
      if (requestId !== latestRequest.current) return;
      if (!res.ok) {
        setReport(null);
        setError(data.error || "Couldn't load the report.");
      } else {
        setReport(data);
      }
    } catch {
      if (requestId === latestRequest.current) {
        setReport(null);
        setError("Couldn't reach Hillink. Check your connection.");
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
  }, [month]);

  useEffect(() => {
    fetch("/api/business/staff-link")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStaffLinkExists(!!data?.exists))
      .catch(() => {});
  }, []);

  const makeStaffLink = async () => {
    if ((staffLink || staffLinkExists) && !confirm("Make a new staff link? The link your staff use now will stop working.")) return;
    try {
      const res = await fetch("/api/business/staff-link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't make a staff link.");
      } else {
        setStaffLink(data.url);
        setStaffLinkExists(true);
      }
    } catch {
      setError("Couldn't reach Hillink. Check your connection.");
    }
  };

  const logCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogMessage("");
    try {
      const res = await fetch("/api/business/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLogMessage(data.error || "Couldn't log that code.");
        return;
      }
      setLogMessage(data.duplicate ? "Already logged a moment ago." : `Logged ${data.athleteFirstName ? `${data.athleteFirstName}'s` : "a"} customer.`);
      setCode("");
      load(month);
    } catch {
      setLogMessage("Couldn't reach Hillink. Check your connection.");
    }
  };

  const t = report?.totals;

  return (
    <main className="page-shell">
      <div className="container" style={{ padding: "28px 0 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <Link href="/business" className="muted" style={{ fontWeight: 700 }}>← Dashboard</Link>
            <h1 className="page-title" style={{ fontSize: "2rem", marginTop: 6 }}>Results for {monthLabel(month)}</h1>
            {report && <p className="muted" style={{ margin: 0 }}>{report.businessName}</p>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }} className="no-print">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button className="small-button" onClick={() => window.print()}>Print / save PDF</button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {loading && !report && <p className="muted">Loading…</p>}

        {t && (
          <>
            <div className="stats-grid four" style={{ marginBottom: 20 }}>
              <div className="stat-card accent">
                <div className="stat-title">Customers from athletes</div>
                <div className="stat-value">{t.customers}</div>
                <div className="stat-subtext">codes logged at your counter</div>
              </div>
              <div className="stat-card">
                <div className="stat-title">Cost per customer</div>
                <div className="stat-value">{usd(t.totalCostPerCustomerCents)}</div>
                <div className="stat-subtext">athlete pay + your current plan, {usd(t.totalCostCents)} total</div>
              </div>
              <div className="stat-card">
                <div className="stat-title">Posts approved</div>
                <div className="stat-value">{t.postsApproved}</div>
                <div className="stat-subtext">{t.athletes} athlete{t.athletes === 1 ? "" : "s"} working for you</div>
              </div>
              <div className="stat-card">
                <div className="stat-title">Sales reported</div>
                <div className="stat-value">{usd(t.reportedSalesCents)}</div>
                <div className="stat-subtext">{t.reach ? `${t.reach.toLocaleString()} people reached` : "when staff enter order totals"}</div>
              </div>
            </div>

            <div className="panel">
              <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>By campaign</h2>
              {report.campaigns.length === 0 ? (
                <p className="muted">No athlete activity this month yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                        <th style={{ padding: "6px 8px" }}>Campaign</th>
                        <th style={{ padding: "6px 8px" }}>Athletes</th>
                        <th style={{ padding: "6px 8px" }}>Posts</th>
                        <th style={{ padding: "6px 8px" }}>Customers</th>
                        <th style={{ padding: "6px 8px" }}>Athlete pay</th>
                        <th style={{ padding: "6px 8px" }}>Per customer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.campaigns.map((c) => (
                        <tr key={c.campaignId} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px", fontWeight: 700 }}>{c.title}</td>
                          <td style={{ padding: "8px" }}>{c.athletes}</td>
                          <td style={{ padding: "8px" }}>{c.postsApproved}</td>
                          <td style={{ padding: "8px" }}>{c.customers}</td>
                          <td style={{ padding: "8px" }}>{usd(c.athletePayCents)}</td>
                          <td style={{ padding: "8px" }}>{usd(c.costPerCustomerCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {report.topAthletes.length > 0 && (
              <div className="panel">
                <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>Top athletes by customers</h2>
                {report.topAthletes.map((a) => (
                  <div key={a.athleteId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                    <span><strong>{a.name}</strong>{a.school ? <span className="muted"> · {a.school}{a.sport ? `, ${a.sport}` : ""}</span> : null}</span>
                    <span>{a.customers}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="panel no-print">
          <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>Log customer codes</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Every athlete gets a code like JAKE-7K2Q to share. When a customer shows one, log it here or give your counter staff a private link.
          </p>
          <form onSubmit={logCode} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="JAKE-7K2Q" aria-label="Customer code" style={{ flex: "1 1 180px" }} />
            <button className="small-button" type="submit" disabled={!code.trim()}>Log customer</button>
          </form>
          {logMessage && <p style={{ marginBottom: 0 }}>{logMessage}</p>}
          <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="small-button" onClick={makeStaffLink}>{staffLink || staffLinkExists ? "Make a new staff link" : "Get staff link"}</button>
            {staffLink && (
              <>
                <input readOnly value={staffLink} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 260px" }} aria-label="Staff link" />
                <button className="small-button" onClick={() => navigator.clipboard?.writeText(staffLink)}>Copy</button>
              </>
            )}
          </div>
          {staffLink && <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>Anyone with this link can log codes for your business. Keep it on the counter tablet or staff phones.</p>}
        </div>
      </div>
    </main>
  );
}
