"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  role: "athlete" | "business" | "admin";
  athlete_verification_status?: "pending" | "approved" | "rejected";
  referral_code: string | null;
  referred_by_code: string | null;
  email?: string;
  banned?: boolean;
};

type AthleteDetail = {
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  sport: string | null;
  graduation: string | null;
  city: string | null;
  state: string | null;
  instagram: string | null;
  tiktok: string | null;
  deal_types: string | null;
  minimum_payout: string | null;
  travel_radius: string | null;
  preferred_company_type: string | null;
  heard_about: string | null;
  bio: string | null;
  recurring_deals: boolean;
};

type BusinessDetail = {
  business_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  instagram: string | null;
  campaign_interests: string | null;
  budget: string | null;
  preferred_tiers: string | null;
  local_radius: string | null;
  heard_about: string | null;
  description: string | null;
};

type FinanceEvent = {
  id: string;
  source: "stripe_webhook" | "payout_trigger" | "system";
  event_type: string;
  event_id: string | null;
  business_id: string | null;
  athlete_id: string | null;
  campaign_id: string | null;
  application_id: string | null;
  transfer_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  details_json: Record<string, unknown> | null;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [athleteCount, setAthleteCount] = useState(0);
  const [businessCount, setBusinessCount] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<"athlete" | "business">("athlete");
  const [updatingRole, setUpdatingRole] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resettingUserData, setResettingUserData] = useState(false);
  const [xpUserId, setXpUserId] = useState("");
  const [xpDelta, setXpDelta] = useState("");
  const [xpNote, setXpNote] = useState("");
  const [grantingXp, setGrantingXp] = useState(false);
  const [tierUserId, setTierUserId] = useState("");
  const [targetAthleteTier, setTargetAthleteTier] = useState<"Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond">("Bronze");
  const [settingAthleteTier, setSettingAthleteTier] = useState(false);
  const [businessAccessUserId, setBusinessAccessUserId] = useState("");
  const [businessAccessTier, setBusinessAccessTier] = useState<"" | "starter" | "growth" | "scale" | "domination">("");
  const [settingBusinessAccess, setSettingBusinessAccess] = useState(false);
  const [campaignSettingsId, setCampaignSettingsId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingUser, setViewingUser] = useState<ProfileRow | null>(null);
  const [viewingDetail, setViewingDetail] = useState<AthleteDetail | BusinessDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [financeEvents, setFinanceEvents] = useState<FinanceEvent[]>([]);
  const [loadingFinance, setLoadingFinance] = useState(false);

  const loadAdminData = async () => {
    setError("");
    const supabase = createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.push("/login");
      return;
    }

    setAdminEmail(userData.user.email || "");
    setCurrentAdminId(userData.user.id);

    const { data: profileRole, error: roleError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (roleError || !profileRole || profileRole.role !== "admin") {
      router.push("/login");
      return;
    }

    const [profilesRes, totalRes, athleteRes, businessRes, adminRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, athlete_verification_status, referral_code, referred_by_code")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("athlete_profiles").select("id", { count: "exact", head: true }),
      supabase.from("business_profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin"),
    ]);

    if (profilesRes.error) {
      setError(profilesRes.error.message);
      setLoading(false);
      return;
    }

    const baseProfiles = (profilesRes.data || []) as ProfileRow[];

    // Merge emails + ban status from admin API
    try {
      const emailsRes = await fetch("/api/admin/users");
      if (emailsRes.ok) {
        const emailsData = await emailsRes.json();
        const userMap: Record<string, { email: string; banned: boolean }> = {};
        for (const u of emailsData.users ?? []) {
          userMap[u.id] = { email: u.email || "", banned: u.banned ?? false };
        }
        setProfiles(baseProfiles.map((p) => ({
          ...p,
          email: userMap[p.id]?.email || "",
          banned: userMap[p.id]?.banned || false,
        })));
      } else {
        setProfiles(baseProfiles);
      }
    } catch {
      setProfiles(baseProfiles);
    }

    setTotalUsers(totalRes.count || 0);
    setAthleteCount(athleteRes.count || 0);
    setBusinessCount(businessRes.count || 0);
    setAdminCount(adminRes.count || 0);
    setLoading(false);

    await loadFinanceEvents();
  };

  const loadFinanceEvents = async () => {
    setLoadingFinance(true);
    try {
      const res = await fetch("/api/admin/finance-events");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load finance events.");
        setFinanceEvents([]);
      } else {
        setFinanceEvents((data.events || []) as FinanceEvent[]);
      }
    } catch {
      setError("Failed to load finance events.");
      setFinanceEvents([]);
    }
    setLoadingFinance(false);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const postAdminJson = async (url: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      return { ok: res.ok, data: data as Record<string, unknown> };
    } catch {
      return {
        ok: false,
        data: { error: "Request failed before a valid server response was received." },
      };
    }
  };

  const handleUpdateRole = async () => {
    setError("");
    setSuccess("");

    const trimmedId = targetUserId.trim();
    if (!trimmedId) {
      setError("Target user id is required.");
      return;
    }

    setUpdatingRole(true);
    const { ok, data } = await postAdminJson("/api/admin/update-user-role", {
      userId: trimmedId,
      role: targetRole,
    });
    setUpdatingRole(false);

    if (!ok) {
      setError(String(data.error || "Role update failed."));
      return;
    }

    if (data.unchanged) {
      setSuccess("Role already set.");
    } else {
      setSuccess("Role updated.");
    }
    await loadAdminData();
  };

  const handleResetUserData = async () => {
    setError("");
    setSuccess("");

    const userId = resetUserId.trim();
    if (!userId) {
      setError("Target user id is required for reset.");
      return;
    }

    if (userId === currentAdminId) {
      setError("You cannot reset your own admin account data.");
      return;
    }

    const confirmed = window.confirm(
      "Reset this user's campaigns, applications, XP, ratings, diagnostics, notifications, and related activity data? This keeps their profile/company record."
    );
    if (!confirmed) return;

    setResettingUserData(true);
    const { ok, data } = await postAdminJson("/api/admin/reset-user-data", { userId });
    setResettingUserData(false);

    if (!ok) {
      setError((data.error as string) || "Failed to reset user data.");
      return;
    }

    setSuccess(`User activity reset completed for ${userId}.`);
    await loadAdminData();
  };

  const handleGrantXp = async () => {
    setError("");
    setSuccess("");

    const athleteId = xpUserId.trim();
    const parsedXp = Number(xpDelta);
    if (!athleteId) {
      setError("Athlete user id is required.");
      return;
    }
    if (!Number.isFinite(parsedXp) || parsedXp === 0) {
      setError("Enter a non-zero XP amount.");
      return;
    }

    setGrantingXp(true);
    const { ok, data } = await postAdminJson("/api/admin/athlete-xp-grant", {
      athleteId,
      xpDelta: parsedXp,
      note: xpNote.trim() || null,
    });
    setGrantingXp(false);

    if (!ok) {
      setError((data.error as string) || "Failed to grant XP.");
      return;
    }

    setSuccess(`Granted ${parsedXp} XP to ${athleteId}.`);
    setXpDelta("");
    setXpNote("");
  };

  const handleSetAthleteTier = async () => {
    setError("");
    setSuccess("");

    const athleteId = tierUserId.trim();
    if (!athleteId) {
      setError("Athlete user id is required.");
      return;
    }

    setSettingAthleteTier(true);
    const { ok, data } = await postAdminJson("/api/admin/athlete-tier-set", {
      athleteId,
      targetTier: targetAthleteTier,
    });
    setSettingAthleteTier(false);

    if (!ok) {
      setError((data.error as string) || "Failed to set athlete tier.");
      return;
    }

    setSuccess(`Athlete ${athleteId} set to ${targetAthleteTier}. XP adjusted by ${String(data.xpDelta)}.`);
  };

  const handleSetBusinessAccessTier = async () => {
    setError("");
    setSuccess("");

    const businessId = businessAccessUserId.trim();
    if (!businessId) {
      setError("Business user id is required.");
      return;
    }

    setSettingBusinessAccess(true);
    const { ok, data } = await postAdminJson("/api/admin/business-access-tier", {
      businessId,
      accessTier: businessAccessTier || null,
    });
    setSettingBusinessAccess(false);

    if (!ok) {
      setError((data.error as string) || "Failed to update business access tier.");
      return;
    }

    if (data.accessTierOverride) {
      setSuccess(`Business ${businessId} now has ${String(data.effectiveTier)} access while staying on ${String(data.paidTier)} billing.`);
    } else {
      setSuccess(`Business ${businessId} reverted to paid tier access (${String(data.paidTier)}).`);
    }
    if (data.warning) {
      setError(String(data.warning));
    }
    await loadAdminData();
  };

  const handleViewUser = async (profile: ProfileRow) => {
    setViewingUser(profile);
    setViewingDetail(null);
    setLoadingDetail(true);

    const supabase = createClient();
    if (profile.role === "athlete") {
      const { data } = await supabase
        .from("athlete_profiles")
        .select("*")
        .eq("id", profile.id)
        .single();
      setViewingDetail((data as AthleteDetail) ?? null);
    } else if (profile.role === "business") {
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("id", profile.id)
        .single();
      setViewingDetail((data as BusinessDetail) ?? null);
    }
    setLoadingDetail(false);
  };

  const handleDeleteUser = async (userId: string) => {
    setDeleting(true);
    setError("");

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();
    setDeleting(false);
    setDeleteConfirmId(null);

    if (!res.ok) {
      setError(data.error || "Failed to delete user.");
      return;
    }

    setSuccess("User deleted.");
    if (viewingUser?.id === userId) setViewingUser(null);
    await loadAdminData();
  };

  const handleInviteUser = async () => {
    setError("");
    setSuccess("");
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setError("Valid email required.");
      return;
    }
    setInviting(true);
    const res = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) {
      setError(data.error || "Invite failed.");
      return;
    }
    setSuccess(`Invite sent to ${inviteEmail.trim()}.`);
    setInviteEmail("");
    await loadAdminData();
  };

  const handleSuspendUser = async (userId: string, suspend: boolean) => {
    setError("");
    setSuccess("");
    setSuspending(userId);
    const res = await fetch("/api/admin/suspend-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, suspend }),
    });
    const data = await res.json();
    setSuspending(null);
    if (!res.ok) {
      setError(data.error || "Suspend action failed.");
      return;
    }
    setSuccess(suspend ? "User suspended." : "User unsuspended.");
    await loadAdminData();
  };

  const handleSetAthleteVerification = async (
    userId: string,
    status: "pending" | "approved" | "rejected",
    reason?: string
  ) => {
    setError("");
    setSuccess("");
    const res = await fetch("/api/admin/athlete-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status, reason }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to update athlete verification.");
      return;
    }

    if (data.emailWarning) {
      setSuccess(`Athlete verification status set to ${status}. Email warning: ${data.emailWarning}`);
    } else {
      setSuccess(`Athlete verification status set to ${status}. Email notification sent.`);
    }
    await loadAdminData();
  };

  const filteredProfiles = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.id.toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.role || "").toLowerCase().includes(q) ||
      (p.referral_code || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Loading admin portal...</div>
      </div>
    );
  }

  return (
    <>
      <div className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 1100 }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1>Admin Portal</h1>
              <p style={{ margin: 0 }}>Signed in as <strong>{adminEmail}</strong></p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                router.push("/login");
              }}
            >
              Sign out
            </button>
          </div>

          {error && <div className="error-message" style={{ marginTop: 16 }}>{error}</div>}
          {success && <div className="success-message" style={{ marginTop: 16 }}>{success}</div>}

          {/* Stats */}
          <div className="form-grid" style={{ marginTop: 20 }}>
            <label>Total users<input value={String(totalUsers)} readOnly /></label>
            <label>Athletes<input value={String(athleteCount)} readOnly /></label>
            <label>Businesses<input value={String(businessCount)} readOnly /></label>
            <label>Admins<input value={String(adminCount)} readOnly /></label>
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="cta-button"
              type="button"
              onClick={() => router.push("/admin/notifications")}
              style={{ marginBottom: 0 }}
            >
              Notification Send-Out
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push("/admin/campaigns")}
              style={{ marginBottom: 0 }}
            >
              Campaign Manager
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push("/admin/analytics")}
              style={{ marginBottom: 0 }}
            >
              Analytics
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push("/admin/disputes")}
              style={{ marginBottom: 0 }}
            >
              Disputes
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push("/admin/waitlist")}
              style={{ marginBottom: 0 }}
            >
              Waitlist Review
            </button>
          </div>

          {/* Users table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32 }}>
            <h2 style={{ margin: 0 }}>Users</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Search email, id, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 220 }}
              />
              <button className="secondary-button" type="button" onClick={loadAdminData}>
                Refresh
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>User ID</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Referral Code</th>
                  <th style={thStyle}>Referred By</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr
                    key={profile.id}
                    style={{ background: profile.banned ? "#fff5f5" : viewingUser?.id === profile.id ? "#f8f8f8" : "transparent" }}
                  >
                    <td style={tdStyle}>{profile.email || <span style={{ color: "#aaa" }}>—</span>}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                      {profile.id.slice(0, 8)}…
                    </td>
                    <td style={tdStyle}>
                      <span style={roleBadgeStyle(profile.role)}>{profile.role}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {profile.banned
                          ? <span style={{ background: "#e53e3e", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>Suspended</span>
                          : <span style={{ color: "#38a169", fontSize: 13 }}>Active</span>
                        }
                        {profile.role === "athlete" && (
                          <span
                            style={{
                              background:
                                profile.athlete_verification_status === "approved"
                                  ? "#2f855a"
                                  : profile.athlete_verification_status === "rejected"
                                  ? "#c53030"
                                  : "#805ad5",
                              color: "white",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 12,
                              textTransform: "capitalize",
                            }}
                          >
                            {profile.athlete_verification_status || "pending"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>{profile.referral_code || "—"}</td>
                    <td style={tdStyle}>{profile.referred_by_code || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          className="secondary-button"
                          style={{ padding: "2px 10px", fontSize: 12 }}
                          onClick={() => handleViewUser(profile)}
                        >
                          View
                        </button>
                        {profile.id !== currentAdminId && (
                          <>
                            {profile.role === "athlete" && (
                              <>
                                <button
                                  className="secondary-button"
                                  style={{ padding: "2px 10px", fontSize: 12 }}
                                  onClick={() => handleSetAthleteVerification(profile.id, "approved")}
                                >
                                  Approve Athlete
                                </button>
                                <button
                                  className="secondary-button"
                                  style={{ padding: "2px 10px", fontSize: 12 }}
                                  onClick={() => {
                                    const reason = window.prompt("Required rejection reason:");
                                    if (!reason || !reason.trim()) {
                                      setError("Rejection reason is required.");
                                      return;
                                    }
                                    handleSetAthleteVerification(profile.id, "rejected", reason.trim());
                                  }}
                                >
                                  Reject Athlete
                                </button>
                              </>
                            )}
                            <button
                              className="secondary-button"
                              style={{ padding: "2px 10px", fontSize: 12 }}
                              disabled={suspending === profile.id}
                              onClick={() => handleSuspendUser(profile.id, !profile.banned)}
                            >
                              {suspending === profile.id ? "…" : profile.banned ? "Unsuspend" : "Suspend"}
                            </button>
                            <button
                              className="secondary-button"
                              style={{ padding: "2px 10px", fontSize: 12 }}
                              onClick={() => {
                                setResetUserId(profile.id);
                                window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                              }}
                            >
                              Reset Data
                            </button>
                            {profile.role === "athlete" && (
                              <>
                                <button
                                  className="secondary-button"
                                  style={{ padding: "2px 10px", fontSize: 12 }}
                                  onClick={() => {
                                    setXpUserId(profile.id);
                                    setTierUserId(profile.id);
                                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                                  }}
                                >
                                  XP / Tier
                                </button>
                              </>
                            )}
                            {profile.role === "business" && (
                              <button
                                className="secondary-button"
                                style={{ padding: "2px 10px", fontSize: 12 }}
                                onClick={() => {
                                  setBusinessAccessUserId(profile.id);
                                  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                                }}
                              >
                                Access Tier
                              </button>
                            )}
                            <button
                              style={deleteButtonStyle}
                              onClick={() => setDeleteConfirmId(profile.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProfiles.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#aaa", padding: 24 }}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Invite User */}
          <h2 style={{ marginTop: 32 }}>Invite User</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Sends the user an invite email with a link to set their own password. They will then go through the normal role-select and onboarding flow.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              Email address
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </label>
            <button
              className="cta-button"
              type="button"
              onClick={handleInviteUser}
              disabled={inviting}
              style={{ marginBottom: 0 }}
            >
              {inviting ? "Sending…" : "Send Invite"}
            </button>
          </div>

          {/* Role Management */}
          <h2 style={{ marginTop: 32 }}>Role Management</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Use this to switch a user between athlete and business. Admin promotion must be done via SQL.
          </p>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Target user ID
              <input
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="Paste UUID from table above"
              />
            </label>
            <label>
              New role
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as "athlete" | "business")}
              >
                <option value="athlete">athlete</option>
                <option value="business">business</option>
              </select>
            </label>
          </div>
          <button
            className="cta-button"
            type="button"
            onClick={handleUpdateRole}
            disabled={updatingRole}
            style={{ marginTop: 12 }}
          >
            {updatingRole ? "Updating..." : "Update Role"}
          </button>

          {/* Per-user data reset */}
          <h2 style={{ marginTop: 32 }}>Reset User Activity Data</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Wipes one user&apos;s operational data (campaigns, applications, XP, ratings, diagnostics, notifications) while keeping profile and company records.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              Target user ID
              <input
                value={resetUserId}
                onChange={(e) => setResetUserId(e.target.value)}
                placeholder="Paste UUID (example: 7658ce51-2694-425b-8cfb-8f5cc93cc6cb)"
              />
            </label>
            <button
              className="cta-button"
              type="button"
              onClick={handleResetUserData}
              disabled={resettingUserData}
              style={{ marginBottom: 0 }}
            >
              {resettingUserData ? "Resetting..." : "Reset This User"}
            </button>
          </div>

          <h2 style={{ marginTop: 32 }}>Grant Athlete XP</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Manually add or subtract XP from an athlete account.
          </p>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Athlete user ID
              <input value={xpUserId} onChange={(e) => setXpUserId(e.target.value)} placeholder="Paste athlete UUID" />
            </label>
            <label>
              XP delta
              <input value={xpDelta} onChange={(e) => setXpDelta(e.target.value)} placeholder="100 or -250" />
            </label>
            <label>
              Note
              <input value={xpNote} onChange={(e) => setXpNote(e.target.value)} placeholder="Manual adjustment note" />
            </label>
          </div>
          <button className="cta-button" type="button" onClick={handleGrantXp} disabled={grantingXp} style={{ marginTop: 12 }}>
            {grantingXp ? "Granting..." : "Apply XP Adjustment"}
          </button>

          <h2 style={{ marginTop: 32 }}>Set Athlete Tier</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Adjusts athlete XP so the account lands exactly at the minimum XP for the selected tier.
          </p>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Athlete user ID
              <input value={tierUserId} onChange={(e) => setTierUserId(e.target.value)} placeholder="Paste athlete UUID" />
            </label>
            <label>
              Target tier
              <select value={targetAthleteTier} onChange={(e) => setTargetAthleteTier(e.target.value as "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond") }>
                <option value="Bronze">Bronze</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold</option>
                <option value="Platinum">Platinum</option>
                <option value="Diamond">Diamond</option>
              </select>
            </label>
          </div>
          <button className="cta-button" type="button" onClick={handleSetAthleteTier} disabled={settingAthleteTier} style={{ marginTop: 12 }}>
            {settingAthleteTier ? "Updating..." : "Set Athlete Tier"}
          </button>

          <h2 style={{ marginTop: 32 }}>Override Business Access Tier</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Grant a business higher platform access without changing what they pay. Clearing the override reverts them to their paid tier access.
          </p>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              Business user ID
              <input value={businessAccessUserId} onChange={(e) => setBusinessAccessUserId(e.target.value)} placeholder="Paste business UUID" />
            </label>
            <label>
              Access tier override
              <select value={businessAccessTier} onChange={(e) => setBusinessAccessTier(e.target.value as "" | "starter" | "growth" | "scale" | "domination") }>
                <option value="">Use paid tier</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="scale">Scale</option>
                <option value="domination">Domination</option>
              </select>
            </label>
          </div>
          <button className="cta-button" type="button" onClick={handleSetBusinessAccessTier} disabled={settingBusinessAccess} style={{ marginTop: 12 }}>
            {settingBusinessAccess ? "Updating..." : "Update Business Access"}
          </button>

          <h2 style={{ marginTop: 32 }}>Campaign Auto-Accept Settings</h2>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Open per-campaign controls to update auto-accept rules or force-accept an athlete.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <label style={{ flex: 1 }}>
              Campaign ID
              <input
                value={campaignSettingsId}
                onChange={(e) => setCampaignSettingsId(e.target.value)}
                placeholder="Paste campaign UUID"
              />
            </label>
            <button
              className="cta-button"
              type="button"
              onClick={() => {
                const id = campaignSettingsId.trim();
                if (!id) {
                  setError("Campaign ID is required.");
                  return;
                }
                router.push(`/admin/campaigns/${id}`);
              }}
              style={{ marginBottom: 0 }}
            >
              Open Campaign Controls
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => router.push("/admin/campaigns")}
              style={{ marginBottom: 0 }}
            >
              Open Campaign Manager
            </button>
          </div>

          {/* Finance Ledger */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 36 }}>
            <h2 style={{ margin: 0 }}>Finance Ledger</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={loadFinanceEvents}
              disabled={loadingFinance}
            >
              {loadingFinance ? "Loading..." : "Refresh Ledger"}
            </button>
          </div>
          <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
            Tracks Stripe webhooks and payout transfer outcomes for reconciliation and support.
          </p>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Event</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Business</th>
                  <th style={thStyle}>Athlete</th>
                  <th style={thStyle}>Transfer</th>
                </tr>
              </thead>
              <tbody>
                {financeEvents.map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{new Date(event.created_at).toLocaleString()}</td>
                    <td style={tdStyle}>{event.source}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{event.event_type}</td>
                    <td style={tdStyle}>{event.status || "—"}</td>
                    <td style={tdStyle}>
                      {typeof event.amount_cents === "number"
                        ? `$${(event.amount_cents / 100).toFixed(2)} ${(event.currency || "usd").toUpperCase()}`
                        : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                      {event.business_id ? `${event.business_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                      {event.athlete_id ? `${event.athlete_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>
                      {event.transfer_id ? `${event.transfer_id.slice(0, 14)}…` : "—"}
                    </td>
                  </tr>
                ))}
                {financeEvents.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#aaa", padding: 20 }}>
                      {loadingFinance ? "Loading finance events..." : "No finance events found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* User Detail Modal */}
      {viewingUser && (
        <div className="modal-overlay" onClick={() => setViewingUser(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>User Account</h3>
              <button
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
                onClick={() => setViewingUser(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={detailRowStyle}><span style={detailLabelStyle}>Email</span><span>{viewingUser.email || "—"}</span></div>
              <div style={detailRowStyle}><span style={detailLabelStyle}>User ID</span><span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{viewingUser.id}</span></div>
              <div style={detailRowStyle}><span style={detailLabelStyle}>Role</span><span style={roleBadgeStyle(viewingUser.role)}>{viewingUser.role}</span></div>
              <div style={detailRowStyle}><span style={detailLabelStyle}>Referral Code</span><span>{viewingUser.referral_code || "—"}</span></div>
              <div style={detailRowStyle}><span style={detailLabelStyle}>Referred By</span><span>{viewingUser.referred_by_code || "—"}</span></div>

              <div style={{ marginTop: 20 }}>
                {loadingDetail && <p style={{ color: "#888" }}>Loading profile details...</p>}

                {!loadingDetail && viewingUser.role === "athlete" && viewingDetail && (
                  <>
                    <h4 style={{ marginBottom: 12 }}>Athlete Profile</h4>
                    {renderAthleteDetail(viewingDetail as AthleteDetail)}
                  </>
                )}

                {!loadingDetail && viewingUser.role === "business" && viewingDetail && (
                  <>
                    <h4 style={{ marginBottom: 12 }}>Business Profile</h4>
                    {renderBusinessDetail(viewingDetail as BusinessDetail)}
                  </>
                )}

                {!loadingDetail &&
                  (viewingUser.role === "athlete" || viewingUser.role === "business") &&
                  !viewingDetail && (
                    <p style={{ color: "#888" }}>No onboarding profile found — user has not completed setup.</p>
                  )}

                {viewingUser.role === "admin" && (
                  <p style={{ color: "#888" }}>Admin accounts do not have a separate profile record.</p>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between" }}>
              <button className="secondary-button" onClick={() => setViewingUser(null)}>Close</button>
              {viewingUser.id !== currentAdminId && (
                <button
                  style={deleteButtonStyle}
                  onClick={() => { setDeleteConfirmId(viewingUser.id); setViewingUser(null); }}
                >
                  Delete this user
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirmId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
            </div>
            <div className="modal-body">
              <p>This will permanently delete this user and all their data. This action cannot be undone.</p>
              <p style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#666", marginTop: 8 }}>
                {deleteConfirmId}
              </p>
            </div>
            <div className="modal-footer" style={{ display: "flex", gap: 12 }}>
              <button
                className="secondary-button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                style={deleteButtonStyle}
                onClick={() => handleDeleteUser(deleteConfirmId)}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderAthleteDetail(d: AthleteDetail) {
  const fields: [string, string | null | undefined][] = [
    ["Name", [d.first_name, d.last_name].filter(Boolean).join(" ") || null],
    ["School", d.school],
    ["Sport", d.sport],
    ["Graduation", d.graduation],
    ["City", d.city],
    ["State", d.state],
    ["Instagram", d.instagram],
    ["TikTok", d.tiktok],
    ["Deal Types", d.deal_types],
    ["Minimum Payout", d.minimum_payout],
    ["Travel Radius", d.travel_radius],
    ["Preferred Company", d.preferred_company_type],
    ["Recurring Deals", d.recurring_deals ? "Yes" : "No"],
    ["How They Heard", d.heard_about],
    ["Bio", d.bio],
  ];
  return (
    <>
      {fields.map(([label, val]) =>
        val ? (
          <div style={detailRowStyle} key={label}>
            <span style={detailLabelStyle}>{label}</span>
            <span>{val}</span>
          </div>
        ) : null
      )}
    </>
  );
}

function renderBusinessDetail(d: BusinessDetail) {
  const fields: [string, string | null | undefined][] = [
    ["Business Name", d.business_name],
    ["Contact", [d.contact_first_name, d.contact_last_name].filter(Boolean).join(" ") || null],
    ["Category", d.category],
    ["City", d.city],
    ["State", d.state],
    ["Website", d.website],
    ["Instagram", d.instagram],
    ["Campaign Interests", d.campaign_interests],
    ["Budget", d.budget],
    ["Preferred Tiers", d.preferred_tiers],
    ["Local Radius", d.local_radius],
    ["How They Heard", d.heard_about],
    ["Description", d.description],
  ];
  return (
    <>
      {fields.map(([label, val]) =>
        val ? (
          <div style={detailRowStyle} key={label}>
            <span style={detailLabelStyle}>{label}</span>
            <span>{val}</span>
          </div>
        ) : null
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid #ddd",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "middle",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  padding: "6px 0",
  borderBottom: "1px solid #f0f0f0",
  alignItems: "flex-start",
};

const detailLabelStyle: React.CSSProperties = {
  fontWeight: 600,
  minWidth: 160,
  color: "#666",
  fontSize: 13,
  flexShrink: 0,
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "#e53e3e",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

function roleBadgeStyle(role: string): React.CSSProperties {
  const colors: Record<string, string> = {
    admin: "#7b2d8b",
    athlete: "#2b6cb0",
    business: "#276749",
  };
  return {
    background: colors[role] || "#888",
    color: "white",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
    display: "inline-block",
  };
}

