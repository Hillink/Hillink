"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HELP_AUDIENCES, HELP_STATUSES } from "@/lib/help/access";
import { HELP_CATEGORIES, articlePath } from "@/lib/help/categories";

type Form = {
  title: string;
  slug: string;
  category: string;
  audience: string;
  status: string;
  short_answer: string;
  steps: string;
  body: string;
  keywords: string;
  question_variants: string;
  related_slugs: string;
  feature: string;
  featured: boolean;
  escalation_required: boolean;
  sort_order: number;
  last_verified_at: string;
};

const EMPTY: Form = {
  title: "",
  slug: "",
  category: "getting-started",
  audience: "both",
  status: "draft",
  short_answer: "",
  steps: "",
  body: "",
  keywords: "",
  question_variants: "",
  related_slugs: "",
  feature: "",
  featured: false,
  escalation_required: false,
  sort_order: 100,
  last_verified_at: "",
};

const AUDIENCE_HELP: Record<string, string> = {
  athlete: "Athletes only",
  business: "Businesses only",
  both: "Athletes and businesses",
  admin: "Admins only (internal, never shown to customers)",
};

const STATUS_HELP: Record<string, string> = {
  live: "Live: customers can read it",
  draft: "Draft: hidden",
  planned: "Planned feature: hidden",
  experimental: "Experimental: hidden",
  deprecated: "Deprecated: hidden",
};

const lines = (value: string) => value.split("\n").map((s) => s.trim()).filter(Boolean);

// Admin: create or edit one Help Center article.
export default function AdminHelpArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedPath, setSavedPath] = useState("");

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/admin/help/articles/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load the article.");
        const a = data.article;
        setForm({
          title: a.title,
          slug: a.slug,
          category: a.category,
          audience: a.audience,
          status: a.status,
          short_answer: a.short_answer || "",
          steps: (a.steps || []).join("\n"),
          body: a.body || "",
          keywords: (a.keywords || []).join(", "),
          question_variants: (a.question_variants || []).join("\n"),
          related_slugs: (a.related_slugs || []).join("\n"),
          feature: a.feature || "",
          featured: !!a.featured,
          escalation_required: !!a.escalation_required,
          sort_order: a.sort_order ?? 100,
          last_verified_at: a.last_verified_at ? String(a.last_verified_at).slice(0, 10) : "",
        });
        setSavedPath(articlePath(a));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const save = async () => {
    if (form.status === "live" && (form.audience === "athlete" || form.audience === "business" || form.audience === "both")) {
      const who = AUDIENCE_HELP[form.audience].toLowerCase();
      if (!window.confirm(`Publish this so ${who} can read it? Only describe features that are live today.`)) return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...form,
      steps: lines(form.steps),
      keywords: form.keywords.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      question_variants: lines(form.question_variants),
      related_slugs: lines(form.related_slugs),
      sort_order: Number(form.sort_order),
    };
    try {
      const res = await fetch(isNew ? "/api/admin/help/articles" : `/api/admin/help/articles/${id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save.");
        return;
      }
      if (isNew) {
        router.replace(`/admin/help/${data.id}`);
        return;
      }
      setNotice("Saved.");
      setSavedPath(articlePath({ category: form.category, slug: form.slug }));
    } catch {
      setError("Couldn't reach Hillink. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const field = { display: "flex", flexDirection: "column" as const, gap: 6, fontWeight: 600, fontSize: 14 };

  return (
    <main className="page-shell">
      <div className="container" style={{ maxWidth: 860, padding: "28px 0 60px" }}>
        <Link href="/admin/help" className="muted" style={{ fontWeight: 700 }}>← Help Center articles</Link>
        <h1 className="page-title" style={{ fontSize: "2rem", margin: "6px 0 16px" }}>{isNew ? "New article" : "Edit article"}</h1>

        {error && <div className="error-message">{error}</div>}
        {notice && <div className="success-message">{notice}</div>}

        {loading ? (
          <div className="panel">Loading…</div>
        ) : (
          <section className="panel" style={{ display: "grid", gap: 14 }}>
            <label style={field}>
              Title (the question, in the user&apos;s words)
              <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <label style={field}>
                Who can read it
                <select value={form.audience} onChange={(e) => set("audience", e.target.value)}>
                  {HELP_AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_HELP[a]}</option>)}
                </select>
              </label>
              <label style={field}>
                Status
                <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {HELP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_HELP[s]}</option>)}
                </select>
              </label>
              <label style={field}>
                Category
                <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                  {HELP_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <label style={field}>
              URL name (leave empty to make one from the title; changing it breaks old links)
              <input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="when-do-i-get-paid" />
            </label>
            <label style={field}>
              Short answer (one or two sentences)
              <textarea value={form.short_answer} onChange={(e) => set("short_answer", e.target.value)} style={{ minHeight: 70, padding: 12 }} maxLength={600} />
            </label>
            <label style={field}>
              Steps (optional, one per line)
              <textarea value={form.steps} onChange={(e) => set("steps", e.target.value)} style={{ minHeight: 90, padding: 12 }} />
            </label>
            <label style={field}>
              Details (blank line between paragraphs; ## heading; - bullet; **bold**; [link text](/help/...))
              <textarea value={form.body} onChange={(e) => set("body", e.target.value)} style={{ minHeight: 220, padding: 12, fontFamily: "monospace", fontSize: 13 }} />
            </label>
            <label style={field}>
              Other ways people ask this (one per line, helps search)
              <textarea value={form.question_variants} onChange={(e) => set("question_variants", e.target.value)} style={{ minHeight: 70, padding: 12 }} />
            </label>
            <label style={field}>
              Search keywords (comma separated)
              <input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} />
            </label>
            <label style={field}>
              Related articles (URL names, one per line)
              <textarea value={form.related_slugs} onChange={(e) => set("related_slugs", e.target.value)} style={{ minHeight: 70, padding: 12 }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <label style={field}>
                Feature (optional, e.g. payouts)
                <input value={form.feature} onChange={(e) => set("feature", e.target.value)} />
              </label>
              <label style={field}>
                Sort order (lower shows first)
                <input type="number" min={0} max={10000} value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
              </label>
              <label style={field}>
                Last checked against the app
                <input type="date" value={form.last_verified_at} onChange={(e) => set("last_verified_at", e.target.value)} />
              </label>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
              <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} style={{ width: 18, minHeight: 18 }} />
              Show in Common questions on the Help home page
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
              <input type="checkbox" checked={form.escalation_required} onChange={(e) => set("escalation_required", e.target.checked)} style={{ width: 18, minHeight: 18 }} />
              The support agent should hand this topic to a person
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="cta-button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
              {savedPath && <Link className="secondary-button" href={savedPath} target="_blank">View article</Link>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
