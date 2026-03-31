"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  cta_url: string | null;
  cta_label: string | null;
  is_read: boolean;
  email_sent: boolean;
  email_sent_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const TYPE_ICON: Record<string, string> = {
  application_accepted: "✓",
  application_declined: "✗",
  proof_approved: "★",
  proof_rejected: "!",
  new_application: "✉",
  proof_submitted: "↑",
  challenge_completed: "◆",
  xp_earned: "⚡",
  athlete_verification_approved: "✓",
  athlete_verification_rejected: "!",
  campaign_cancelled: "✕",
  payout_sent: "$",
  campaign_invited: "✉",
  campaign_invite: "✉",
  admin_broadcast: "📣",
};

const TYPE_COLOR: Record<string, string> = {
  application_accepted: "#0a7f2e",
  application_declined: "#9b1c1c",
  proof_approved: "#065f46",
  proof_rejected: "#92400e",
  new_application: "#1d4ed8",
  proof_submitted: "#1d4ed8",
  challenge_completed: "#6d28d9",
  xp_earned: "#b45309",
  athlete_verification_approved: "#0a7f2e",
  athlete_verification_rejected: "#92400e",
  campaign_cancelled: "#9b1c1c",
  payout_sent: "#0b7285",
  campaign_invited: "#1d4ed8",
  campaign_invite: "#1d4ed8",
  admin_broadcast: "#b45309",
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: AppNotification[] };
      setNotifications(data.notifications ?? []);
    } catch {
      // Silent fail — non-critical
    }
  }, []);

  // Initial fetch + polling every 30 s
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Mark unread as read when opening dropdown
      const unreadIds = notifications
        .filter((n) => !n.is_read)
        .map((n) => n.id);
      if (unreadIds.length) {
        fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unreadIds }),
        }).catch(() => {});
        setNotifications((prev) =>
          prev.map((n) =>
            unreadIds.includes(n.id) ? { ...n, is_read: true } : n
          )
        );
      }
    }
  };

  const markAllRead = () => {
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div ref={dropdownRef} className="notif-bell-wrap">
      <button
        onClick={handleOpen}
        className="notif-bell-btn"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {notifications.some((n) => !n.is_read) ? (
              <button className="notif-mark-all-btn" onClick={markAllRead}>
                Mark all read
              </button>
            ) : (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>All caught up</span>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item${n.is_read ? "" : " unread"}`}
                >
                  <span
                    className="notif-item-icon"
                    style={{ color: TYPE_COLOR[n.type] ?? "#374151" }}
                  >
                    {TYPE_ICON[n.type] ?? "•"}
                  </span>
                  <div className="notif-item-body">
                    <div className={`notif-item-title${n.is_read ? " read" : ""}`}>
                      {n.title}
                    </div>
                    <div className="notif-item-text">{n.body}</div>
                    <div className="notif-item-time">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                    {n.cta_url && n.cta_label ? (
                      <a
                        className="notif-item-cta"
                        href={n.cta_url}
                      >
                        {n.cta_label}
                      </a>
                    ) : null}
                  </div>
                  {!n.is_read && <div className="notif-item-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
