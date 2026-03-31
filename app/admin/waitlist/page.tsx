"use client";

import { useEffect, useMemo, useState } from "react";

type WaitlistStatus = "new" | "contacted" | "approved" | "rejected";

type WaitlistEntry = {
  id: string;
  school: string | null;
  sport: string | null;
  nil_experience: string | null;
  deal_types: string[] | null;
  would_use_platform: string | null;
  wants_early_access: boolean;
  email: string;
  instagram_handle: string | null;
  preferred_business_types: string | null;
  objections: string | null;
  status: WaitlistStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const STATUS_OPTIONS: WaitlistStatus[] = ["new", "contacted", "approved", "rejected"];

function statusColors(status: WaitlistStatus): React.CSSProperties {
  if (status === "approved") return { background: "#2f855a", color: "#ffffff" };
  if (status === "rejected") return { background: "#c53030", color: "#ffffff" };
  if (status === "contacted") return { background: "#2b6cb0", color: "#ffffff" };
  return { background: "#718096", color: "#ffffff" };
}

export default function AdminWaitlistPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | WaitlistStatus>("");
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, WaitlistStatus>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const loadEntries = async () => {
    setLoading(true);
    setError("");

    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/waitlist/athletes${query}`);
      const data = (await res.json()) as { entries?: WaitlistEntry[]; error?: string };

      if (!res.ok) {
        setError(data.error || "Failed to load athlete waitlist entries.");
        setEntries([]);
        return;
      }

      const nextEntries = (data.entries || []) as WaitlistEntry[];
      setEntries(nextEntries);
      setStatusDrafts(
        nextEntries.reduce<Record<string, WaitlistStatus>>((acc, entry) => {
          acc[entry.id] = entry.status || "new";
          return acc;
        }, {})
      );
      setNoteDrafts(
        nextEntries.reduce<Record<string, string>>((acc, entry) => {
          acc[entry.id] = entry.admin_notes || "";
          return acc;
        }, {})
      );
    } catch {
      setError("Failed to load athlete waitlist entries.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [statusFilter]);

  const pendingCount = useMemo(
    () => entries.filter((entry) => entry.status === "new").length,
    [entries]
  );

  const saveEntry = async (entryId: string) => {
    setError("");
    setSuccess("");

    const status = statusDrafts[entryId] || "new";
    const adminNotes = noteDrafts[entryId] || "";

    setSavingId(entryId);
    try {
      const res = await fetch(`/api/admin/waitlist/athletes/${entryId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to update waitlist entry.");
        return;
      }

      setSuccess("Waitlist entry updated.");
      await loadEntries();
    } catch {
      setError("Failed to update waitlist entry.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a href="/admin" style={{ color: "#6f7481", fontSize: 14 }}>
          ← Back to Admin
        </a>
      </div>

      <h1>Athlete Waitlist Review</h1>
      <p style={{ color: "#6f7481", marginTop: 4 }}>
        Track submissions, add reviewer notes, and move entries through outreach and approval status.
      </p>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 16 }}>
        <label>
          Status filter
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | WaitlistStatus)}
          >
            <option value="">all</option>
            <option value="new">new</option>
            <option value="contacted">contacted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>

        <button className="secondary-button" type="button" onClick={loadEntries}>
          Refresh
        </button>

        <div style={{ color: "#6f7481", fontSize: 13, marginLeft: "auto" }}>
          Pending review: <strong>{pendingCount}</strong>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Submitted</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>School / Sport</th>
              <th style={thStyle}>Interest</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Reviewer Notes</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, color: "#6f7481" }}>
                  Loading waitlist entries...
                </td>
              </tr>
            )}

            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, color: "#6f7481" }}>
                  No athlete waitlist entries found.
                </td>
              </tr>
            )}

            {!loading &&
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{new Date(entry.created_at).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <div>{entry.email}</div>
                    {entry.instagram_handle ? (
                      <div style={{ color: "#6f7481", marginTop: 4 }}>@{entry.instagram_handle.replace(/^@/, "")}</div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    <div>{entry.school || "—"}</div>
                    <div style={{ color: "#6f7481", marginTop: 4 }}>{entry.sport || "—"}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: "#4a5568" }}>{entry.would_use_platform || "—"}</div>
                    <div style={{ color: "#6f7481", marginTop: 4 }}>
                      Deals: {(entry.deal_types || []).join(", ") || "—"}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...statusColors(entry.status || "new"),
                        display: "inline-block",
                        fontSize: 12,
                        borderRadius: 999,
                        padding: "2px 10px",
                        textTransform: "capitalize",
                        fontWeight: 700,
                      }}
                    >
                      {entry.status || "new"}
                    </span>
                    {entry.reviewed_at ? (
                      <div style={{ color: "#6f7481", marginTop: 6, fontSize: 12 }}>
                        Reviewed {new Date(entry.reviewed_at).toLocaleString()}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    <textarea
                      value={noteDrafts[entry.id] || ""}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                      rows={3}
                      style={{ minWidth: 240 }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <select
                        value={statusDrafts[entry.id] || "new"}
                        onChange={(e) =>
                          setStatusDrafts((prev) => ({
                            ...prev,
                            [entry.id]: e.target.value as WaitlistStatus,
                          }))
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <button
                        className="cta-button"
                        style={{ fontSize: 12, padding: "6px 10px" }}
                        type="button"
                        disabled={savingId === entry.id}
                        onClick={() => saveEntry(entry.id)}
                      >
                        {savingId === entry.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid #ddd",
  padding: "8px 10px",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "8px 10px",
  verticalAlign: "top",
};
