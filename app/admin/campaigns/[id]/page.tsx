"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type CampaignSettings = {
  id: string;
  title: string;
  status: string;
  open_slots: number;
  auto_accept_enabled: boolean;
  auto_accept_radius_miles: number;
  auto_accept_lock_hours: number;
  min_athlete_tier: "bronze" | "silver" | "gold" | "diamond";
};

const ADMIN_STATUS_OPTIONS = ["draft", "active", "paused", "completed", "cancelled"] as const;

export default function AdminCampaignSettingsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = String(params?.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [campaign, setCampaign] = useState<CampaignSettings | null>(null);
  const [forceAthleteId, setForceAthleteId] = useState("");
  const [forceStatus, setForceStatus] = useState<(typeof ADMIN_STATUS_OPTIONS)[number]>("cancelled");
  const [forceStatusReason, setForceStatusReason] = useState("");
  const [forcingStatus, setForcingStatus] = useState(false);

  const loadCampaign = async () => {
    if (!campaignId) {
      setError("Campaign id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load campaign settings.");
        setCampaign(null);
      } else {
        setCampaign(data.campaign as CampaignSettings);
      }
    } catch {
      setError("Failed to load campaign settings.");
      setCampaign(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCampaign();
  }, [campaignId]);

  const saveSettings = async () => {
    if (!campaign) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_accept_enabled: campaign.auto_accept_enabled,
          auto_accept_radius_miles: campaign.auto_accept_radius_miles,
          auto_accept_lock_hours: campaign.auto_accept_lock_hours,
          min_athlete_tier: campaign.min_athlete_tier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update campaign settings.");
      } else {
        setCampaign(data.campaign as CampaignSettings);
        setSuccess("Settings updated.");
      }
    } catch {
      setError("Failed to update campaign settings.");
    }

    setSaving(false);
  };

  const forceAccept = async () => {
    const athleteId = forceAthleteId.trim();
    if (!campaign || !athleteId) {
      setError("athleteId is required.");
      return;
    }

    setForcing(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/force-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Force accept failed.");
      } else {
        setSuccess("Athlete force-accepted.");
        setForceAthleteId("");
        await loadCampaign();
      }
    } catch {
      setError("Force accept failed.");
    }

    setForcing(false);
  };

  const forceTransition = async () => {
    if (!campaign) return;
    const reason = forceStatusReason.trim();
    if (!reason) {
      setError("Reason is required for forced transitions.");
      return;
    }

    setForcingStatus(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: forceStatus, reason, force: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Force transition failed.");
      } else {
        setSuccess(`Campaign forced to ${forceStatus}.`);
        setForceStatusReason("");
        await loadCampaign();
      }
    } catch {
      setError("Force transition failed.");
    }

    setForcingStatus(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a href="/admin" style={{ color: "#6f7481", fontSize: 14 }}>
          ← Back to Admin
        </a>
      </div>
      <h1 style={{ marginBottom: 8 }}>Campaign Auto-Accept Controls</h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 16 }}>
        Campaign ID: <span style={{ fontFamily: "monospace" }}>{campaignId || "(missing)"}</span>
      </p>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {loading && <p>Loading...</p>}

      {!loading && campaign && (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <h2>Auto-Accept Settings</h2>
            </div>

            <p style={{ marginTop: 0 }}><strong>{campaign.title}</strong></p>
            <p style={{ marginTop: 0, color: "#666", fontSize: 13 }}>
              status: {campaign.status} | open slots: {campaign.open_slots}
            </p>

            <label style={{ display: "block", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={campaign.auto_accept_enabled}
                onChange={(e) => setCampaign((prev) => (prev ? { ...prev, auto_accept_enabled: e.target.checked } : prev))}
                style={{ marginRight: 8 }}
              />
              Auto-accept enabled
            </label>

            <div className="form-grid" style={{ marginTop: 8 }}>
              <label>
                Radius (miles)
                <input
                  type="number"
                  min={1}
                  max={250}
                  value={campaign.auto_accept_radius_miles}
                  onChange={(e) => setCampaign((prev) => (prev ? { ...prev, auto_accept_radius_miles: Number(e.target.value || 0) } : prev))}
                />
              </label>

              <label>
                Lock hours before start
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={campaign.auto_accept_lock_hours}
                  onChange={(e) => setCampaign((prev) => (prev ? { ...prev, auto_accept_lock_hours: Number(e.target.value || 0) } : prev))}
                />
              </label>

              <label>
                Minimum athlete tier
                <select
                  value={campaign.min_athlete_tier}
                  onChange={(e) => setCampaign((prev) => (prev ? { ...prev, min_athlete_tier: e.target.value as CampaignSettings["min_athlete_tier"] } : prev))}
                >
                  <option value="bronze">bronze</option>
                  <option value="silver">silver</option>
                  <option value="gold">gold</option>
                  <option value="diamond">diamond</option>
                </select>
              </label>
            </div>

            <button className="cta-button" type="button" onClick={saveSettings} disabled={saving} style={{ marginTop: 12 }}>
              {saving ? "Saving..." : "Save Auto-Accept Settings"}
            </button>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Force Accept Athlete</h2>
            </div>
            <p style={{ color: "#666", marginTop: 0 }}>
              Overrides all auto-accept gates and accepts the athlete immediately. This action is audit logged.
            </p>
            <label style={{ display: "block" }}>
              Athlete user ID
              <input
                value={forceAthleteId}
                onChange={(e) => setForceAthleteId(e.target.value)}
                placeholder="Paste athlete UUID"
              />
            </label>
            <button className="cta-button" type="button" onClick={forceAccept} disabled={forcing} style={{ marginTop: 12 }}>
              {forcing ? "Applying..." : "Force Accept Athlete"}
            </button>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <h2>Force Status Transition</h2>
            </div>
            <p style={{ color: "#666", marginTop: 0 }}>
              Admin override bypasses lifecycle map and is always audit logged with your reason.
            </p>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label>
                Target status
                <select value={forceStatus} onChange={(e) => setForceStatus(e.target.value as (typeof ADMIN_STATUS_OPTIONS)[number])}>
                  {ADMIN_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Reason (required)
                <input
                  value={forceStatusReason}
                  onChange={(e) => setForceStatusReason(e.target.value)}
                  placeholder="Why is this override necessary?"
                />
              </label>
            </div>
            <button className="cta-button" type="button" onClick={forceTransition} disabled={forcingStatus} style={{ marginTop: 12 }}>
              {forcingStatus ? "Applying..." : "Force Transition"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
