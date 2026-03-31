"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Campaign = {
  id: string;
  title: string;
  campaign_type: string;
};

type Requirement = {
  id: string;
  campaign_id: string;
  type: string;
  description: string | null;
  deadline_days_after_accept: number;
  is_required: boolean;
};

type Submission = {
  id: string;
  requirement_id: string;
  submission_url: string | null;
  notes: string | null;
  status: "pending_review" | "approved" | "rejected" | "revision_requested";
  version: number;
  due_at: string | null;
  submitted_at: string;
  rejection_reason: string | null;
};

type Application = {
  id: string;
  campaign_id: string;
  status: string;
  accepted_at: string | null;
  campaign: Campaign;
  submissions: Submission[];
};

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  pending_review: { bg: "#fff6e5", color: "#8a5a00", label: "Pending Review" },
  approved: { bg: "#e7f8ee", color: "#0a7f2e", label: "Approved" },
  rejected: { bg: "#ffe8e8", color: "#9b1c1c", label: "Rejected" },
  revision_requested: { bg: "#fff0e0", color: "#b45309", label: "Revision Needed" },
};

const REQ_TYPE_LABELS: Record<string, string> = {
  instagram_post: "Instagram Post",
  tiktok_post: "TikTok Post",
  story: "Story / Reel",
  reel: "Reel",
  tweet: "Tweet",
  review: "Review",
  other: "Other",
};

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  return `${diff}d left`;
}

function duePillColor(dateStr: string | null): { bg: string; color: string } {
  if (!dateStr) return { bg: "#f3f4f6", color: "#374151" };
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { bg: "#ffe8e8", color: "#9b1c1c" };
  if (diff <= 2) return { bg: "#fff6e5", color: "#8a5a00" };
  return { bg: "#e7f8ee", color: "#0a7f2e" };
}

export default function AthleteDeliverablesDashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  // Per-requirement submission form state
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [submitUrl, setSubmitUrl] = useState<Record<string, string>>({});
  const [submitNotes, setSubmitNotes] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<Record<string, string>>({});
  const [submitSuccess, setSubmitSuccess] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        router.push("/login");
        return;
      }

      const { data: apps, error: appsError } = await supabase
        .from("campaign_applications")
        .select(
          `id, campaign_id, status, accepted_at,
           campaign:campaigns!inner(id, title, campaign_type),
           submissions:deliverable_submissions(id, requirement_id, submission_url, notes, status, version, due_at, submitted_at, rejection_reason)`
        )
        .eq("athlete_id", userId)
        .in("status", ["accepted", "in_progress", "submitted", "completed"])
        .order("accepted_at", { ascending: false });

      if (cancelled) return;

      if (appsError) {
        setError("Failed to load your deliverables.");
        setLoading(false);
        return;
      }

      const typedApps = (apps ?? []) as unknown as Application[];
      setApplications(typedApps);

      const campaignIds = [...new Set(typedApps.map((a) => a.campaign_id))];
      if (campaignIds.length > 0) {
        const { data: reqs } = await supabase
          .from("deliverable_requirements")
          .select(
            "id, campaign_id, type, description, deadline_days_after_accept, is_required"
          )
          .in("campaign_id", campaignIds);
        if (!cancelled) setRequirements((reqs ?? []) as Requirement[]);
      }

      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (applicationId: string, requirementId: string) => {
    const key = `${applicationId}:${requirementId}`;
    const url = (submitUrl[key] || "").trim();
    if (!url) {
      setSubmitError((prev) => ({ ...prev, [key]: "Submission URL is required." }));
      return;
    }

    setSubmitting((prev) => ({ ...prev, [key]: true }));
    setSubmitError((prev) => ({ ...prev, [key]: "" }));
    setSubmitSuccess((prev) => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch("/api/deliverables/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          requirementId,
          submissionUrl: url,
          notes: (submitNotes[key] || "").trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError((prev) => ({ ...prev, [key]: data.error || "Submission failed." }));
      } else {
        setSubmitSuccess((prev) => ({ ...prev, [key]: "Submitted successfully! Awaiting review." }));
        setSubmitUrl((prev) => ({ ...prev, [key]: "" }));
        setSubmitNotes((prev) => ({ ...prev, [key]: "" }));
        // Refresh to show updated submission
        const updatedSub: Submission = {
          id: data.submission?.id ?? crypto.randomUUID(),
          requirement_id: requirementId,
          submission_url: url,
          notes: submitNotes[key] || null,
          status: "pending_review",
          version: data.submission?.version ?? 1,
          due_at: data.submission?.due_at ?? null,
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
        };
        setApplications((prev) =>
          prev.map((app) =>
            app.id !== applicationId
              ? app
              : {
                  ...app,
                  submissions: [
                    ...app.submissions.filter((s) => s.requirement_id !== requirementId),
                    updatedSub,
                  ],
                }
          )
        );
      }
    } catch {
      setSubmitError((prev) => ({ ...prev, [key]: "Unexpected error. Please retry." }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6f7481" }}>
        Loading deliverables…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>My Deliverables</h1>
      <p style={{ color: "#6f7481", marginBottom: 24, marginTop: 0 }}>
        Submit your work for each active campaign requirement.
      </p>

      {error && (
        <div
          style={{
            background: "#ffe8e8",
            color: "#9b1c1c",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {applications.length === 0 && !error && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #d9dce2",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: "#6f7481",
          }}
        >
          No active campaigns with deliverables yet.
        </div>
      )}

      {applications.map((app) => {
        const campaignReqs = requirements.filter(
          (r) => r.campaign_id === app.campaign_id
        );
        const latestSubmissions: Record<string, Submission> = {};
        for (const sub of app.submissions) {
          const existing = latestSubmissions[sub.requirement_id];
          if (!existing || sub.version > existing.version) {
            latestSubmissions[sub.requirement_id] = sub;
          }
        }

        return (
          <div
            key={app.id}
            style={{
              background: "#ffffff",
              border: "1px solid #d9dce2",
              borderRadius: 12,
              marginBottom: 20,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            {/* Campaign header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #f0f1f5",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {app.campaign.title}
                </div>
                <div style={{ color: "#6f7481", fontSize: 13, marginTop: 2 }}>
                  {app.campaign.campaign_type}
                </div>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: app.status === "completed" ? "#dbeafe" : "#e7f8ee",
                  color: app.status === "completed" ? "#1d4ed8" : "#166534",
                  textTransform: "capitalize",
                }}
              >
                {app.status.replace("_", " ")}
              </span>
            </div>

            {campaignReqs.length === 0 && (
              <div style={{ padding: "16px 20px", color: "#6f7481", fontSize: 14 }}>
                No deliverable requirements set for this campaign.
              </div>
            )}

            {campaignReqs.map((req) => {
              const sub = latestSubmissions[req.id];
              const key = `${app.id}:${req.id}`;
              const needsSubmission =
                !sub ||
                sub.status === "rejected" ||
                sub.status === "revision_requested";
              const dueLabel = sub?.due_at
                ? daysUntil(sub.due_at)
                : null;
              const dueColor = duePillColor(sub?.due_at ?? null);

              return (
                <div
                  key={req.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid #f0f1f5",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {REQ_TYPE_LABELS[req.type] ?? req.type}
                        </span>
                        {req.is_required && (
                          <span
                            style={{
                              fontSize: 11,
                              background: "#fee2e2",
                              color: "#b91c1c",
                              padding: "2px 7px",
                              borderRadius: 10,
                              fontWeight: 600,
                            }}
                          >
                            Required
                          </span>
                        )}
                        {sub && (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "2px 9px",
                              borderRadius: 10,
                              background: STATUS_PILL[sub.status]?.bg ?? "#f3f4f6",
                              color: STATUS_PILL[sub.status]?.color ?? "#374151",
                            }}
                          >
                            {STATUS_PILL[sub.status]?.label ?? sub.status}
                          </span>
                        )}
                        {dueLabel && (
                          <span
                            style={{
                              fontSize: 12,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: dueColor.bg,
                              color: dueColor.color,
                              fontWeight: 500,
                            }}
                          >
                            {dueLabel}
                          </span>
                        )}
                      </div>
                      {req.description && (
                        <div
                          style={{ color: "#6f7481", fontSize: 13, marginTop: 4 }}
                        >
                          {req.description}
                        </div>
                      )}
                      {sub?.submission_url && (
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                          <a
                            href={sub.submission_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#2563eb", textDecoration: "underline" }}
                          >
                            View submission v{sub.version}
                          </a>
                        </div>
                      )}
                      {sub?.rejection_reason && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            background: "#ffe8e8",
                            color: "#9b1c1c",
                            padding: "8px 12px",
                            borderRadius: 6,
                          }}
                        >
                          <strong>Feedback:</strong> {sub.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {needsSubmission && (
                    <div style={{ marginTop: 12 }}>
                      {sub?.status === "rejected" && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#8a5a00",
                            marginBottom: 8,
                          }}
                        >
                          Your previous submission was rejected. Please resubmit.
                        </div>
                      )}
                      {sub?.status === "revision_requested" && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#8a5a00",
                            marginBottom: 8,
                          }}
                        >
                          A revision was requested. Please update and resubmit.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          type="url"
                          placeholder="Submission URL (e.g. Instagram post link)"
                          value={submitUrl[key] ?? ""}
                          onChange={(e) =>
                            setSubmitUrl((p) => ({ ...p, [key]: e.target.value }))
                          }
                          style={{
                            flex: 1,
                            minWidth: 220,
                            padding: "8px 12px",
                            border: "1px solid #d9dce2",
                            borderRadius: 6,
                            fontSize: 14,
                            outline: "none",
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Optional notes"
                          value={submitNotes[key] ?? ""}
                          onChange={(e) =>
                            setSubmitNotes((p) => ({ ...p, [key]: e.target.value }))
                          }
                          style={{
                            flex: 1,
                            minWidth: 160,
                            padding: "8px 12px",
                            border: "1px solid #d9dce2",
                            borderRadius: 6,
                            fontSize: 14,
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={() => handleSubmit(app.id, req.id)}
                          disabled={submitting[key]}
                          style={{
                            padding: "8px 18px",
                            background: submitting[key] ? "#6f7481" : "#111111",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 6,
                            cursor: submitting[key] ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: 14,
                          }}
                        >
                          {submitting[key] ? "Submitting…" : "Submit"}
                        </button>
                      </div>
                      {submitError[key] && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: "#9b1c1c",
                          }}
                        >
                          {submitError[key]}
                        </div>
                      )}
                      {submitSuccess[key] && (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: "#0a7f2e",
                          }}
                        >
                          {submitSuccess[key]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
