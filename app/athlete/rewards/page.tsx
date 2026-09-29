"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import HelpLink from "@/components/help/HelpLink";
import { MAX_LEVEL, MILESTONE_EVERY, MILESTONE_LABELS, POINTS, PRO_MIN_SCORE } from "@/lib/rewards/road";

type Item = { id: string; name: string; description: string | null; points_cost: number; stock: number | null; active: boolean };
type Claim = { id: string; item_id: string; points_cost: number; status: string; created_at: string };
type Rewards = {
  season: { key: string; label: string; endsAt: string };
  progress: { level: number; xpIntoLevel: number; xpForNext: number | null; seasonXp: number };
  pro: boolean;
  points: number;
  badges: { key: string; name: string; how: string; earned: boolean }[];
  items: Item[];
  claims: Claim[];
};

const muted = { color: "var(--muted)", fontSize: 13 } as const;

// Rewards road: level up through the season with XP, earn points, spend them in the store.
export default function AthleteRewardsPage() {
  const [data, setData] = useState<Rewards | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/athlete/rewards");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't load your rewards.");
        return;
      }
      setData(body as Rewards);
    } catch {
      setError("Couldn't reach Hillink. Check your connection.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (item: Item) => {
    if (!window.confirm(`Spend ${item.points_cost} points on ${item.name}?`)) return;
    setClaimingId(item.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/athlete/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't redeem that reward.");
        return;
      }
      setNotice(`${item.name} requested. We'll reach out to get it to you.`);
      await load();
    } catch {
      setError("Couldn't reach Hillink. Check your connection.");
    } finally {
      setClaimingId(null);
    }
  };

  const p = data?.progress;
  const pct = p && p.xpForNext ? Math.round((p.xpIntoLevel / p.xpForNext) * 100) : 100;
  const itemName = (id: string) => data?.items.find((i) => i.id === id)?.name ?? "Reward";

  return (
    <main className="page-shell">
      <div className="container" style={{ maxWidth: 760, padding: "28px 0 60px" }}>
        <Link href="/athlete" className="muted" style={{ fontWeight: 700 }}>← Dashboard</Link>
        <h1 className="page-title" style={{ fontSize: "2rem", marginTop: 6 }}>Rewards road</h1>
        <HelpLink category="rewards" slug="rewards-road" label="How the rewards road works" />

        {error && <div className="error-message">{error}</div>}
        {notice && <div className="success-message">{notice}</div>}
        {!data && !error && <div className="panel">Loading your rewards…</div>}

        {data && p && (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <div className="stat-title">{data.season.label} season</div>
                  <div style={{ fontSize: 34, fontWeight: 800 }}>Level {p.level}<span style={muted}> / {MAX_LEVEL}</span></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--red)" }}>{data.points.toLocaleString()}</div>
                  <div style={muted}>points to spend</div>
                </div>
              </div>
              <div style={{ height: 10, background: "var(--track)", borderRadius: 6, margin: "12px 0 6px", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--red)" }} />
              </div>
              <div style={muted}>
                {p.xpForNext ? `${p.xpIntoLevel} / ${p.xpForNext} XP to level ${p.level + 1}` : "Max level reached this season"}
                {" · "}Season ends {new Date(Date.parse(data.season.endsAt) - 86400000).toLocaleDateString(undefined, { timeZone: "UTC" })}; points reset, your tier and score stay.
              </div>
              <div style={{ ...muted, marginTop: 8 }}>
                {data.pro
                  ? "Pro track unlocked: you earn extra points on every level."
                  : `Pro track: reach a Hillink Score of ${PRO_MIN_SCORE}+ after 3 campaigns for extra points on every level.`}
                {` Every customer who uses your code earns ${POINTS.perCustomer} points.`}
              </div>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="stat-title" style={{ marginBottom: 8 }}>The road</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                {Array.from({ length: MAX_LEVEL / 5 }, (_, i) => (i + 1) * 5).map((lvl) => {
                  const reached = p.level >= lvl;
                  const label = MILESTONE_LABELS[lvl];
                  return (
                    <div
                      key={lvl}
                      style={{
                        border: `1px solid ${reached ? "var(--red)" : "var(--border)"}`,
                        borderRadius: 8,
                        padding: 8,
                        opacity: reached ? 1 : 0.7,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{reached ? "✓ " : ""}Level {lvl}</div>
                      <div style={{ fontSize: 12 }}>{label?.free}</div>
                      <div style={{ fontSize: 12, color: data.pro ? "var(--warning)" : "var(--muted)" }}>Pro: {label?.pro}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...muted, marginTop: 8 }}>
                Every level: +{POINTS.perLevel} points (Pro +{POINTS.proPerLevel} more). Every {MILESTONE_EVERY}th level: +{POINTS.milestone} bonus (Pro +{POINTS.proMilestone} more).
              </div>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="stat-title" style={{ marginBottom: 8 }}>Badges</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                {data.badges.map((b) => (
                  <div key={b.key} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, opacity: b.earned ? 1 : 0.55 }}>
                    <div style={{ fontWeight: 700 }}>{b.earned ? "🏅 " : "🔒 "}{b.name}</div>
                    <div style={{ fontSize: 12 }}>{b.how}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...muted, marginTop: 8 }}>Each badge is worth {POINTS.badge} points the first time you earn it.</div>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="stat-title" style={{ marginBottom: 8 }}>Store</div>
              {data.items.length === 0 && <div style={muted}>Rewards are coming soon.</div>}
              <div style={{ display: "grid", gap: 8 }}>
                {data.items.map((item) => {
                  const soldOut = item.stock !== null && item.stock <= 0;
                  const short = data.points < item.points_cost;
                  return (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        {item.description && <div style={{ fontSize: 12 }}>{item.description}</div>}
                        <div style={muted}>{item.points_cost.toLocaleString()} points</div>
                      </div>
                      {!item.active || soldOut ? (
                        <span style={muted}>{!item.active ? "Coming soon" : "Sold out"}</span>
                      ) : (
                        <button className="small-button" disabled={short || claimingId !== null} onClick={() => claim(item)}>
                          {claimingId === item.id ? "Redeeming…" : short ? `Need ${item.points_cost - data.points} more` : "Redeem"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {data.claims.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="stat-title" style={{ fontSize: 13 }}>Your requests</div>
                  {data.claims.map((c) => (
                    <div key={c.id} style={muted}>
                      {itemName(c.item_id)} · {c.points_cost} points · {c.status === "requested" ? "being prepared" : c.status}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
