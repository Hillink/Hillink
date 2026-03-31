"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Dispute = {
  id: string;
  reason: string;
  status:
    | "open"
    | "under_review"
    | "resolved_athlete"
    | "resolved_business"
    | "resolved_partial"
    | "closed";
  opened_by_role: "athlete" | "business";
  sla_deadline: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  application: {
    id: string;
    athlete: { id: string } | null;
    campaign: { title: string } | null;
  } | null;
};

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  open: { bg: "#fee2e2", color: "#b91c1c", label: "Open" },
  under_review: { bg: "#fff6e5", color: "#8a5a00", label: "Under Review" },
  resolved_athlete: { bg: "#e7f8ee", color: "#0a7f2e", label: "Resolved — Athlete" },
  resolved_business: { bg: "#dbeafe", color: "#1d4ed8", label: "Resolved — Business" },
  resolved_partial: { bg: "#f3f4f6", color: "#374151", label: "Resolved — Partial" },
  closed: { bg: "#f3f4f6", color: "#6f7481", label: "Closed" },
};

const TERMINAL = new Set([
  "resolved_athlete",
  "resolved_business",
  "resolved_partial",
  "closed",
]);

function slaColor(deadline: string): { bg: string; color: string } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) return { bg: "#ffe8e8", color: "#9b1c1c" };
  if (diff < 86400000 * 2) return { bg: "#fff6e5", color: "#8a5a00" };
  return { bg: "#e7f8ee", color: "#0a7f2e" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminDisputesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});

  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [resolveError, setResolveError] = useState<Record<string, string>>({});
  const [resolveSuccess, setResolveSuccess] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (!profile || profile.role !== "admin") {
        router.push("/role-redirect");
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from("disputes")
        .select(
          `id, reason, status, opened_by_role, sla_deadline, resolution_notes, resolved_at, created_at,
           application:campaign_applications!inner(
             id,
             athlete:profiles!campaign_applications_athlete_id_fkey(id),
             campaign:campaigns!inner(title)
           )`
        )
        .order("sla_deadline", { ascending: true });

      if (cancelled) return;

      if (fetchErr) {
        setError("Failed to load disputes.");
        setLoading(false);
        return;
      }

      const disputeRows = (data ?? []) as unknown as Dispute[];
      setDisputes(disputeRows);

      const athleteIds = Array.from(
        new Set(
          disputeRows
            .map((d) => d.application?.athlete?.id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (athleteIds.length > 0) {
        const { data: athleteRows } = await supabase
          .from("athlete_profiles")
          .select("id, first_name, last_name")
          .in("id", athleteIds);

        const nextNames: Record<string, string> = {};
        for (const row of athleteRows ?? []) {
          const first = String(row.first_name ?? "").trim();
          const last = String(row.last_name ?? "").trim();
          const full = `${first} ${last}`.trim();
          nextNames[row.id] = full || `Athlete ${row.id.slice(0, 8)}`;
        }
        setAthleteNames(nextNames);
      } else {
        setAthleteNames({});
      }

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const handleResolve = async (
    disputeId: string,
    status:
      | "under_review"
      | "resolved_athlete"
      | "resolved_business"
      | "resolved_partial"
      | "closed"
  ) => {
    const notes = (resolutionNotes[disputeId] || "").trim();
    const isTerminal = TERMINAL.has(status);
    if (isTerminal && notes.length < 10) {
      setResolveError((p) => ({
        ...p,
        [disputeId]: "Resolution notes required (min 10 characters).",
      }));
      return;
    }

    setResolving((p) => ({ ...p, [disputeId]: true }));
    setResolveError((p) => ({ ...p, [disputeId]: "" }));
    setResolveSuccess((p) => ({ ...p, [disputeId]: "" }));

    try {
      const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNotes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResolveError((p) => ({
          ...p,
          [disputeId]: data.error || "Action failed.",
        }));
      } else {
        const label = STATUS_PILL[status]?.label ?? status;
        setResolveSuccess((p) => ({ ...p, [disputeId]: `Status updated: ${label}` }));
        setDisputes((prev) =>
          prev.map((d) =>
            d.id === disputeId
              ? {
                  ...d,
                  status,
                  resolution_notes: notes || d.resolution_notes,
                  resolved_at: isTerminal ? new Date().toISOString() : d.resolved_at,
                }
              : d
          )
        );
      }
    } catch {
      setResolveError((p) => ({
        ...p,
        [disputeId]: "Unexpected error. Please retry.",
      }));
    } finally {
      setResolving((p) => ({ ...p, [disputeId]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6f7481" }}>
        Loading disputes…
      </div>
    );
  }

  const openCount = disputes.filter(
    (d) => d.status === "open" || d.status === "under_review"
  ).length;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a href="/admin" style={{ color: "#6f7481", fontSize: 14 }}>
          ← Back to Admin
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
          Disputes Queue
        </h1>
        {openCount > 0 && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: "#fee2e2",
              color: "#b91c1c",
              padding: "3px 10px",
              borderRadius: 12,
            }}
          >
            {openCount} active
          </span>
        )}
      </div>

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

      {disputes.length === 0 && !error && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #d9dce2",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: "#6f7481",
          }}
        >
          No disputes on record.
        </div>
      )}

      {disputes.map((dispute) => {
        const isTerminal = TERMINAL.has(dispute.status);
        const sla = slaColor(dispute.sla_deadline);
        const athleteId = dispute.application?.athlete?.id;
        const athleteName = athleteId ? (athleteNames[athleteId] ?? `Athlete ${athleteId.slice(0, 8)}`) : "Athlete";
        const campaignTitle =
          (dispute.application?.campaign as any)?.title ?? "Campaign";

        return (
          <div
            key={dispute.id}
            style={{
              background: "#ffffff",
              border: "1px solid #d9dce2",
              borderRadius: 12,
              marginBottom: 16,
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              opacity: isTerminal ? 0.7 : 1,
            }}
          >
            {/* Header row */}
            <div
              style={{
                padding: "14px 20px",
                background: "#f8f8fa",
                borderBottom: "1px solid #e8eaed",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 180 }}>
                {campaignTitle}
              </span>
              <span style={{ fontSize: 13, color: "#6f7481" }}>
                Opened by <strong>{dispute.opened_by_role}</strong> ·{" "}
                {formatDate(dispute.created_at)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: STATUS_PILL[dispute.status]?.bg ?? "#f3f4f6",
                  color: STATUS_PILL[dispute.status]?.color ?? "#374151",
                }}
              >
                {STATUS_PILL[dispute.status]?.label ?? dispute.status}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 12,
                  background: sla.bg,
                  color: sla.color,
                }}
              >
                SLA: {formatDate(dispute.sla_deadline)}
              </span>
            </div>

            {/* Body */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Athlete: </span>
                <span style={{ fontSize: 13 }}>{athleteName}</span>
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#374151",
                  background: "#f8f8fa",
                  border: "1px solid #e8eaed",
                  borderRadius: 7,
                  padding: "10px 14px",
                  marginBottom: 14,
                }}
              >
                <strong>Reason:</strong> {dispute.reason}
              </div>

              {dispute.resolution_notes && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#374151",
                    marginBottom: 12,
                  }}
                >
                  <strong>Resolution notes:</strong> {dispute.resolution_notes}
                </div>
              )}

              {/* Actions */}
              {!isTerminal && (
                <div style={{ marginTop: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    {dispute.status === "open" && (
                      <button
                        onClick={() => handleResolve(dispute.id, "under_review")}
                        disabled={resolving[dispute.id]}
                        style={{
                          padding: "7px 14px",
                          background: "#fff6e5",
                          color: "#8a5a00",
                          border: "1px solid #f0c060",
                          borderRadius: 6,
                          cursor: resolving[dispute.id] ? "not-allowed" : "pointer",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        Mark Under Review
                      </button>
                    )}
                    <button
                      onClick={() => handleResolve(dispute.id, "resolved_athlete")}
                      disabled={resolving[dispute.id]}
                      style={{
                        padding: "7px 14px",
                        background: "#e7f8ee",
                        color: "#0a7f2e",
                        border: "1px solid #86efac",
                        borderRadius: 6,
                        cursor: resolving[dispute.id] ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Resolve for Athlete
                    </button>
                    <button
                      onClick={() => handleResolve(dispute.id, "resolved_business")}
                      disabled={resolving[dispute.id]}
                      style={{
                        padding: "7px 14px",
                        background: "#dbeafe",
                        color: "#1d4ed8",
                        border: "1px solid #93c5fd",
                        borderRadius: 6,
                        cursor: resolving[dispute.id] ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Resolve for Business
                    </button>
                    <button
                      onClick={() => handleResolve(dispute.id, "closed")}
                      disabled={resolving[dispute.id]}
                      style={{
                        padding: "7px 14px",
                        background: "#f3f4f6",
                        color: "#6f7481",
                        border: "1px solid #d9dce2",
                        borderRadius: 6,
                        cursor: resolving[dispute.id] ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    placeholder="Resolution notes (required for resolving)"
                    value={resolutionNotes[dispute.id] ?? ""}
                    onChange={(e) =>
                      setResolutionNotes((p) => ({
                        ...p,
                        [dispute.id]: e.target.value,
                      }))
                    }
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #d9dce2",
                      borderRadius: 6,
                      fontSize: 13,
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  {resolveError[dispute.id] && (
                    <div
                      style={{ fontSize: 12, color: "#9b1c1c", marginTop: 4 }}
                    >
                      {resolveError[dispute.id]}
                    </div>
                  )}
                  {resolveSuccess[dispute.id] && (
                    <div
                      style={{ fontSize: 12, color: "#0a7f2e", marginTop: 4 }}
                    >
                      {resolveSuccess[dispute.id]}
                    </div>
                  )}
                </div>
              )}

              {isTerminal && dispute.resolved_at && (
                <div style={{ fontSize: 13, color: "#6f7481" }}>
                  Resolved on {formatDate(dispute.resolved_at)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
