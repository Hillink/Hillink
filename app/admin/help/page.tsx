"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HELP_AUDIENCES, HELP_STATUSES } from "@/lib/help/access";
import { HELP_CATEGORIES, categoryLabel } from "@/lib/help/categories";

type Row = {
  id: string;
  slug: string;
  category: string;
  title: string;
  audience: string;
  status: string;
  featured: boolean;
  sort_order: number;
  updated_at: string;
  last_verified_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  live: "#1f9d57",
  draft: "#6f7481",
  planned: "#2b6cb0",
  experimental: "#b7791f",
  deprecated: "#9b1c1c",
};

// Admin: every Help Center article. Customers only ever see live articles for their own audience.
export default function AdminHelpPage() {
  const [articles, setArticles] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    fetch("/api/admin/help/articles")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load articles.");
        setArticles(data.articles || []);
      })
      .catch((err: Error) => setError(err.message.includes("help_articles") ? "The Help Center database update hasn't been run yet (supabase/migrations/20260928000600_help_center.sql)." : err.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return articles.filter(
      (a) =>
        (!audience || a.audience === audience) &&
        (!status || a.status === status) &&
        (!category || a.category === category) &&
        (!needle || a.title.toLowerCase().includes(needle) || a.slug.includes(needle))
    );
  }, [articles, text, audience, status, category]);

  return (
    <main className="page-shell">
      <div className="container" style={{ maxWidth: 1100, padding: "28px 0 60px" }}>
        <Link href="/admin" className="muted" style={{ fontWeight: 700 }}>← Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 16px" }}>
          <h1 className="page-title" style={{ fontSize: "2rem" }}>Help Center articles</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="secondary-button" href="/help">Open Help Center</Link>
            <Link className="cta-button" href="/admin/help/new">New article</Link>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Athletes and businesses only see <strong>live</strong> articles written for them (or for both). Everything else, and
          anything marked Admins only, stays here.
        </p>

        {error && <div className="error-message">{error}</div>}

        <section className="panel">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
            <input placeholder="Search title or URL name" value={text} onChange={(e) => setText(e.target.value)} />
            <select value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Audience">
              <option value="">All audiences</option>
              {HELP_AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {HELP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {HELP_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : shown.length === 0 ? (
            <p className="muted">No articles match.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: 8 }}>Title</th>
                    <th style={{ padding: 8 }}>Category</th>
                    <th style={{ padding: 8 }}>Audience</th>
                    <th style={{ padding: 8 }}>Status</th>
                    <th style={{ padding: 8 }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: 8 }}>
                        <Link href={`/admin/help/${a.id}`} style={{ fontWeight: 700 }}>{a.featured ? "★ " : ""}{a.title}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{a.slug}</div>
                      </td>
                      <td style={{ padding: 8 }}>{categoryLabel(a.category, "admin")}</td>
                      <td style={{ padding: 8 }}>{a.audience}</td>
                      <td style={{ padding: 8 }}>
                        <span style={{ color: "#fff", background: STATUS_COLORS[a.status] || "#6f7481", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{a.status}</span>
                      </td>
                      <td style={{ padding: 8 }}>{new Date(a.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
