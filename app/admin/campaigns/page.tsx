"use client";

import { useEffect, useMemo, useState } from "react";

type CampaignRow = {
  id: string;
  title: string;
  business_id: string;
  status: string;
  open_slots: number;
  accepted_count?: number;
  start_date: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["", "draft", "active", "paused", "completed", "cancelled"];

export default function AdminCampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkReason, setBulkReason] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, number>>({});
  const [slotSavingId, setSlotSavingId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    setError("");

    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/campaigns${q}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load campaigns.");
        setCampaigns([]);
      } else {
        setCampaigns((data.campaigns || []) as CampaignRow[]);
      }
    } catch {
      setError("Failed to load campaigns.");
      setCampaigns([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCampaigns();
  }, [statusFilter]);

  const selectedCampaignIds = useMemo(
    () => Object.keys(selectedIds).filter((id) => selectedIds[id]),
    [selectedIds]
  );

  const toggleSelectAll = () => {
    const nextState = selectedCampaignIds.length !== campaigns.length;
    const next: Record<string, boolean> = {};
    for (const c of campaigns) next[c.id] = nextState;
    setSelectedIds(next);
  };

  const bulkCancel = async () => {
    const ids = selectedCampaignIds;
    const reason = bulkReason.trim();

    if (ids.length === 0) {
      setError("Select at least one campaign.");
      return;
    }
    if (!reason) {
      setError("Bulk cancel reason is required.");
      return;
    }

    setBulkLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignIds: ids, reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bulk cancel failed.");
      } else {
        const failed = Array.isArray(data.failed) ? data.failed.length : 0;
        setSuccess(`Bulk cancel complete. Updated: ${data.updated || 0}, Failed: ${failed}`);
        setSelectedIds({});
        setBulkReason("");
        await loadCampaigns();
      }
    } catch {
      setError("Bulk cancel failed.");
    }

    setBulkLoading(false);
  };

  const setSlots = async (campaign: CampaignRow) => {
    const nextSlots = Number(slotDrafts[campaign.id] ?? campaign.open_slots);
    if (!Number.isFinite(nextSlots) || nextSlots < 0) {
      setError("openSlots must be >= 0.");
      return;
    }

    setSlotSavingId(campaign.id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openSlots: Math.round(nextSlots), force: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update slots.");
      } else {
        setSuccess("Slots updated.");
        await loadCampaigns();
      }
    } catch {
      setError("Failed to update slots.");
    }

    setSlotSavingId(null);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a href="/admin" style={{ color: "#6f7481", fontSize: 14 }}>
          ← Back to Admin
        </a>
      </div>
      <h1>Admin Campaign Manager</h1>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Filter</h2>
        </div>
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || "all"}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Bulk Cancel</h2>
        </div>
        <label>
          Reason
          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Required reason for audit trail"
          />
        </label>
        <button className="cta-button" style={{ marginTop: 12 }} type="button" disabled={bulkLoading} onClick={bulkCancel}>
          {bulkLoading ? "Cancelling..." : `Cancel Selected (${selectedCampaignIds.length})`}
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Campaigns</h2>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={campaigns.length > 0 && selectedCampaignIds.length === campaigns.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Title</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Open Slots</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Utilization</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Override Slots</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Start Date</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 8 }}>Campaign ID</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[campaign.id]}
                        onChange={(e) => setSelectedIds((prev) => ({ ...prev, [campaign.id]: e.target.checked }))}
                      />
                    </td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8 }}>{campaign.title}</td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8 }}>{campaign.status}</td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8 }}>{campaign.open_slots}</td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8, minWidth: 180 }}>
                      {(() => {
                        const accepted = Number(campaign.accepted_count || 0);
                        const used = accepted;
                        const total = Math.max(used + Number(campaign.open_slots || 0), 1);
                        const pct = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
                        return (
                          <div>
                            <div style={{ height: 8, borderRadius: 9999, background: "#e5e7eb", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: pct > 85 ? "#ef4444" : "#2563eb" }} />
                            </div>
                            <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
                              {used}/{total} filled ({pct}%)
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8, minWidth: 180 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          min={0}
                          value={slotDrafts[campaign.id] ?? campaign.open_slots}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setSlotDrafts((prev) => ({
                              ...prev,
                              [campaign.id]: Number.isFinite(next) ? next : campaign.open_slots,
                            }));
                          }}
                          style={{ width: 80 }}
                        />
                        <button
                          type="button"
                          className="cta-button"
                          disabled={slotSavingId === campaign.id}
                          onClick={() => setSlots(campaign)}
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          {slotSavingId === campaign.id ? "Saving..." : "Set"}
                        </button>
                      </div>
                    </td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8 }}>{campaign.start_date || "—"}</td>
                    <td style={{ borderBottom: "1px solid #f3f4f6", padding: 8, fontFamily: "monospace", fontSize: 11 }}>{campaign.id}</td>
                  </tr>
                ))}
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 14, color: "#9ca3af" }}>No campaigns found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
