"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Requirement = {
  id: string;
  type: string;
  description: string | null;
  is_required: boolean;
};

type Submission = {
  id: string;
  requirement_id: string;
  submission_url: string | null;
  notes: string | null;
  status: "pending_review" | "approved" | "rejected" | "revision_requested";
  version: number;
  submitted_at: string;
  rejection_reason: string | null;
  athlete: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type Campaign = {
  id: string;
  title: string;
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

export default function BusinessDeliverablesPage() {
  const params = useParams<{ id: string }>();
  const campaignId = String(params?.id || "").trim();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const [reviewing, setReviewing] = useState<Record<string, boolean>>({});
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<Record<string, string>>({});
  const [reviewSuccess, setReviewSuccess] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      // Fetch campaign info
      const { data: campaignData, error: campErr } = await supabase
        .from("campaigns")
        .select("id, title")
        .eq("id", campaignId)
        .single();

      if (cancelled) return;
      if (campErr || !campaignData) {
        setError("Campaign not found.");
        setLoading(false);
        return;
      }
      setCampaign(campaignData as Campaign);

      // Fetch requirements
      const { data: reqs } = await supabase
        .from("deliverable_requirements")
        .select("id, type, description, is_required")
        .eq("campaign_id", campaignId);

      if (!cancelled) setRequirements((reqs ?? []) as Requirement[]);

      // Fetch latest submissions for this campaign (via applications)
      const { data: subs, error: subsErr } = await supabase
        .from("deliverable_submissions")
        .select(
          `id, requirement_id, submission_url, notes, status, version, submitted_at, rejection_reason,
           athlete:profiles!deliverable_submissions_athlete_id_fkey(id, full_name, email)`
        )
        .in(
          "application_id",
          (await supabase
            .from("campaign_applications")
            .select("id")
            .eq("campaign_id", campaignId)
            .then((r) => (r.data ?? []).map((a: { id: string }) => a.id)))
        )
        .order("version", { ascending: false });

      if (cancelled) return;

      if (subsErr) {
        setError("Failed to load submissions.");
        setLoading(false);
        return;
      }

      // Deduplicate: keep latest version per (athlete, requirement) pair
      const seen = new Set<string>();
      const latest: Submission[] = [];
      for (const sub of (subs ?? []) as unknown as Submission[]) {
        const athleteId = (sub.athlete as any)?.id ?? "unknown";
        const key = `${athleteId}:${sub.requirement_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          latest.push(sub);
        }
      }

      setSubmissions(latest);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const handleReview = async (
    submissionId: string,
    status: "approved" | "rejected" | "revision_requested"
  ) => {
    const reason = (rejectionReason[submissionId] || "").trim();
    if ((status === "rejected" || status === "revision_requested") && !reason) {
      setReviewError((p) => ({
        ...p,
        [submissionId]: "Please provide a reason for rejection or revision request.",
      }));
      return;
    }

    setReviewing((p) => ({ ...p, [submissionId]: true }));
    setReviewError((p) => ({ ...p, [submissionId]: "" }));
    setReviewSuccess((p) => ({ ...p, [submissionId]: "" }));

    try {
      const res = await fetch(`/api/deliverables/${submissionId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          rejectionReason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError((p) => ({
          ...p,
          [submissionId]: data.error || "Review failed.",
        }));
      } else {
        setReviewSuccess((p) => ({
          ...p,
          [submissionId]: `Marked as ${status.replace("_", " ")}.`,
        }));
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === submissionId
              ? {
                  ...s,
                  status,
                  rejection_reason: reason || null,
                }
              : s
          )
        );
      }
    } catch {
      setReviewError((p) => ({
        ...p,
        [submissionId]: "Unexpected error. Please retry.",
      }));
    } finally {
      setReviewing((p) => ({ ...p, [submissionId]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6f7481" }}>
        Loading deliverables…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          maxWidth: 800,
          margin: "40px auto",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            background: "#ffe8e8",
            color: "#9b1c1c",
            padding: "16px 20px",
            borderRadius: 10,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  // Group submissions by requirement
  const submissionsByRequirement: Record<string, Submission[]> = {};
  for (const sub of submissions) {
    if (!submissionsByRequirement[sub.requirement_id]) {
      submissionsByRequirement[sub.requirement_id] = [];
    }
    submissionsByRequirement[sub.requirement_id].push(sub);
  }

  const pendingCount = submissions.filter(
    (s) => s.status === "pending_review"
  ).length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a
          href={`/business/campaigns/${campaignId}`}
          style={{ color: "#6f7481", fontSize: 14 }}
        >
          ← Back to Campaign
        </a>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          {campaign?.title} — Deliverables
        </h1>
        {pendingCount > 0 && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: "#fff6e5",
              color: "#8a5a00",
              padding: "3px 10px",
              borderRadius: 12,
            }}
          >
            {pendingCount} pending
          </span>
        )}
      </div>

      {requirements.length === 0 && (
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
          No deliverable requirements set for this campaign.
        </div>
      )}

      {requirements.map((req) => {
        const reqSubs = submissionsByRequirement[req.id] ?? [];
        return (
          <div
            key={req.id}
            style={{
              background: "#ffffff",
              border: "1px solid #d9dce2",
              borderRadius: 12,
              marginBottom: 20,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            {/* Requirement header */}
            <div
              style={{
                padding: "14px 20px",
                background: "#f8f8fa",
                borderBottom: "1px solid #e8eaed",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>
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
              {req.description && (
                <span style={{ color: "#6f7481", fontSize: 13, marginLeft: 4 }}>
                  — {req.description}
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 13,
                  color: "#6f7481",
                }}
              >
                {reqSubs.length} submission{reqSubs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {reqSubs.length === 0 && (
              <div style={{ padding: "16px 20px", color: "#6f7481", fontSize: 14 }}>
                No submissions yet.
              </div>
            )}

            {reqSubs.map((sub) => {
              const athleteName =
                (sub.athlete as any)?.full_name ||
                (sub.athlete as any)?.email ||
                "Athlete";
              const isPending = sub.status === "pending_review";
              return (
                <div
                  key={sub.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid #f0f1f5",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
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
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {athleteName}
                        </span>
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
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          v{sub.version} ·{" "}
                          {new Date(sub.submitted_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {sub.submission_url && (
                        <a
                          href={sub.submission_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: "#2563eb",
                            textDecoration: "underline",
                          }}
                        >
                          View submission
                        </a>
                      )}
                      {sub.notes && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#6f7481",
                            marginTop: 4,
                          }}
                        >
                          Notes: {sub.notes}
                        </div>
                      )}
                      {sub.rejection_reason && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "#9b1c1c",
                            marginTop: 4,
                          }}
                        >
                          Reason: {sub.rejection_reason}
                        </div>
                      )}
                    </div>

                    {/* Review actions */}
                    {isPending && (
                      <div style={{ minWidth: 240 }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                          <button
                            onClick={() => handleReview(sub.id, "approved")}
                            disabled={reviewing[sub.id]}
                            style={{
                              padding: "7px 14px",
                              background: "#0a7f2e",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: 6,
                              cursor: reviewing[sub.id] ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(sub.id, "revision_requested")}
                            disabled={reviewing[sub.id]}
                            style={{
                              padding: "7px 14px",
                              background: "#fff6e5",
                              color: "#8a5a00",
                              border: "1px solid #f0c060",
                              borderRadius: 6,
                              cursor: reviewing[sub.id] ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Request Revision
                          </button>
                          <button
                            onClick={() => handleReview(sub.id, "rejected")}
                            disabled={reviewing[sub.id]}
                            style={{
                              padding: "7px 14px",
                              background: "#ffe8e8",
                              color: "#9b1c1c",
                              border: "1px solid #fca5a5",
                              borderRadius: 6,
                              cursor: reviewing[sub.id] ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                            }}
                          >
                            Reject
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Rejection / revision reason (required for reject)"
                          value={rejectionReason[sub.id] ?? ""}
                          onChange={(e) =>
                            setRejectionReason((p) => ({
                              ...p,
                              [sub.id]: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "7px 10px",
                            border: "1px solid #d9dce2",
                            borderRadius: 6,
                            fontSize: 13,
                            outline: "none",
                          }}
                        />
                        {reviewError[sub.id] && (
                          <div
                            style={{ fontSize: 12, color: "#9b1c1c", marginTop: 4 }}
                          >
                            {reviewError[sub.id]}
                          </div>
                        )}
                      </div>
                    )}

                    {reviewSuccess[sub.id] && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#0a7f2e",
                          padding: "6px 10px",
                          background: "#e7f8ee",
                          borderRadius: 6,
                        }}
                      >
                        {reviewSuccess[sub.id]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
