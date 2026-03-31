"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  open: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  closed: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

type Campaign = {
  id: string;
  title: string;
  status: string;
  open_slots: number;
  start_date: string | null;
  slots?: number | null;
};

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#f3f4f6", color: "#374151" },
  active: { bg: "#dcfce7", color: "#166534" },
  paused: { bg: "#fef9c3", color: "#854d0e" },
  completed: { bg: "#dbeafe", color: "#1d4ed8" },
  cancelled: { bg: "#fee2e2", color: "#b91c1c" },
  open: { bg: "#dcfce7", color: "#166534" },
  closed: { bg: "#fef9c3", color: "#854d0e" },
};

function normalizeStatus(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "open") return "active";
  if (s === "closed") return "paused";
  return s;
}

export default function BusinessCampaignLifecyclePage() {
  const params = useParams<{ id: string }>();
  const campaignId = String(params?.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [reason, setReason] = useState("");

  const loadCampaign = async () => {
    if (!campaignId) {
      setError("Campaign id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load campaign.");
        setCampaign(null);
      } else {
        const nextCampaign = data.campaign as Campaign;
        setCampaign(nextCampaign);
        const from = normalizeStatus(nextCampaign.status);
        const next = (VALID_TRANSITIONS[from] || [])[0] || "";
        setSelectedStatus(next);
      }
    } catch {
      setError("Failed to load campaign.");
      setCampaign(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCampaign();
  }, [campaignId]);

  const fromStatus = normalizeStatus(campaign?.status || "");
  const nextStates = useMemo(() => VALID_TRANSITIONS[fromStatus] || [], [fromStatus]);

  const canActivate = useMemo(() => {
    if (!campaign) return false;
    return Number(campaign.open_slots || 0) > 0 && !!campaign.start_date;
  }, [campaign]);

  const activateDisabled = selectedStatus === "active" && !canActivate;

  const saveStatus = async () => {
    if (!campaign || !selectedStatus) return;

    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: selectedStatus,
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update status.");
      } else {
        setCampaign(data.campaign as Campaign);
        setReason("");
        setSuccess("Campaign status updated.");
      }
    } catch {
      setError("Failed to update status.");
    }

    setUpdating(false);
  };

  const pillTone = STATUS_PILL[fromStatus] || STATUS_PILL.draft;

  return (
    <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 16px" }}>
      <h1>Campaign Lifecycle</h1>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {loading && <p>Loading...</p>}

      {!loading && campaign && (
        <div className="panel">
          <div className="panel-header">
            <h2>{campaign.title}</h2>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: pillTone.bg,
                color: pillTone.color,
              }}
            >
              {fromStatus}
            </span>
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              Slots: {campaign.open_slots}{typeof campaign.slots === "number" ? ` / ${campaign.slots}` : ""}
            </span>
            <span style={{ color: "#6b7280", fontSize: 13 }}>
              Start date: {campaign.start_date || "not set"}
            </span>
          </div>

          <label style={{ display: "block", marginBottom: 10 }}>
            Next status
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={nextStates.length === 0}
            >
              {nextStates.length === 0 ? (
                <option value="">No valid transitions</option>
              ) : (
                nextStates.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this status changing?"
            />
          </label>

          <button
            className="cta-button"
            type="button"
            disabled={updating || !selectedStatus || activateDisabled || nextStates.length === 0}
            onClick={saveStatus}
          >
            {updating ? "Updating..." : "Update Status"}
          </button>

          {selectedStatus === "active" && !canActivate && (
            <p style={{ marginTop: 10, color: "#b45309", fontSize: 13 }}>
              Activate Campaign is disabled until open slots are greater than zero and start date is set.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
