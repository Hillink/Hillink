"use client";

import { useMemo, useState } from "react";

type ActiveCampaign = {
  id: number;
  campaign: string;
  progress: number;
  todo: string;
  dueDate: string;
  payout: number;
  completedRewarded?: boolean;
};

type PendingCampaign = {
  id: number;
  campaign: string;
  pay: number;
  details: string;
  deadline: string;
  status: string;
  category: string;
};

const starterActive: ActiveCampaign[] = [
  {
    id: 1,
    campaign: "Iron Horse Gym",
    progress: 74,
    todo: "1 IG post",
    dueDate: "Apr 30, 2024",
    payout: 65,
  },
  {
    id: 2,
    campaign: "Tommy's Tacos",
    progress: 61,
    todo: "1 IG post",
    dueDate: "May 10, 2024",
    payout: 65,
  },
];

const starterPending: PendingCampaign[] = [
  {
    id: 3,
    campaign: "Aggieland Smoothies",
    pay: 35,
    details: "1 photo post",
    deadline: "Jun 20",
    status: "Pending",
    category: "Food",
  },
  {
    id: 4,
    campaign: "Bryan Fitness Co.",
    pay: 65,
    details: "1 IG post, 1 story",
    deadline: "Jun 24",
    status: "Pending",
    category: "Fitness",
  },
  {
    id: 5,
    campaign: "Local Apparel Drop",
    pay: 100,
    details: "1 reel + 1 story",
    deadline: "Jun 28",
    status: "Pending",
    category: "Apparel",
  },
];

const starterLeaderboard = [
  { name: "Sarah Green", xp: 3120 },
  { name: "Emma White", xp: 2870 },
  { name: "John Smith", xp: 2510 },
  { name: "You", xp: 1480 },
];

const earningsHistorySeed = [
  { name: "Tommy's Tacos", amount: 65, status: "Paid" },
  { name: "Iron Horse Gym", amount: 65, status: "Pending" },
  { name: "Aggieland Smoothies", amount: 35, status: "Pending" },
];

export default function AthletePage() {
  const [xp, setXp] = useState(1480);
  const [approvedPosts, setApprovedPosts] = useState(8);
  const [earnings, setEarnings] = useState(225);
  const [paidOut, setPaidOut] = useState(430);
  const [activeCampaigns, setActiveCampaigns] =
    useState<ActiveCampaign[]>(starterActive);
  const [pendingCampaigns, setPendingCampaigns] =
    useState<PendingCampaign[]>(starterPending);
  const [earningsHistory, setEarningsHistory] = useState(earningsHistorySeed);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);
  const [selectedPending, setSelectedPending] = useState<PendingCampaign | null>(
    null
  );

  const [settings, setSettings] = useState({
    firstName: "",
    lastName: "",
    school: "",
    sport: "",
    graduation: "",
    city: "",
    state: "",
    minPayout: "",
    dealTypes: "",
    industries: "",
    instagram: "",
    tiktok: "",
  });

  const level = useMemo(() => {
    if (xp >= 5000) return "Platinum";
    if (xp >= 2500) return "Gold";
    if (xp >= 1000) return "Silver";
    return "Bronze";
  }, [xp]);

  const nextGoal = useMemo(() => {
    if (xp >= 5000) return 8000;
    if (xp >= 2500) return 5000;
    if (xp >= 1000) return 2500;
    return 1000;
  }, [xp]);

  const leaderboard = useMemo(() => {
    const merged = starterLeaderboard.map((entry) =>
      entry.name === "You" ? { ...entry, xp } : entry
    );

    return [...merged].sort((a, b) => b.xp - a.xp);
  }, [xp]);

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  function acceptPending() {
    if (!selectedPending) return;

    const newActive: ActiveCampaign = {
      id: selectedPending.id,
      campaign: selectedPending.campaign,
      progress: 10,
      todo: selectedPending.details.split(",")[0],
      dueDate: selectedPending.deadline,
      payout: selectedPending.pay,
      completedRewarded: false,
    };

    setActiveCampaigns((prev) => [...prev, newActive]);
    setPendingCampaigns((prev) =>
      prev.filter((item) => item.id !== selectedPending.id)
    );
    setSelectedPending(null);
  }

  function declinePending() {
    if (!selectedPending) return;

    setPendingCampaigns((prev) =>
      prev.filter((item) => item.id !== selectedPending.id)
    );
    setSelectedPending(null);
  }

  function advanceCampaign(id: number) {
    setActiveCampaigns((prev) =>
      prev.map((campaign) => {
        if (campaign.id !== id) return campaign;

        const nextProgress = Math.min(campaign.progress + 18, 100);
        const justCompleted =
          nextProgress === 100 && campaign.completedRewarded !== true;

        if (justCompleted) {
          setXp((current) => current + 120);
          setEarnings((current) => current + campaign.payout);
          setApprovedPosts((current) => current + 1);
          setEarningsHistory((current) => [
            {
              name: campaign.campaign,
              amount: campaign.payout,
              status: "Pending",
            },
            ...current,
          ]);
        }

        return {
          ...campaign,
          progress: nextProgress,
          completedRewarded: campaign.completedRewarded || justCompleted,
        };
      })
    );
  }

  const lifetimeEarnings = earnings + paidOut;

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/Hillink-logo-black-red.png" alt="HILLink" className="sidebar-logo" />
          </div>

          <nav className="sidebar-nav">
            <button
              className="sidebar-link active"
              onClick={() => scrollToSection("athlete-top")}
            >
              <span className="sidebar-icon">⌂</span>
              <span>Home</span>
            </button>

            <button
              className="sidebar-link"
              onClick={() => scrollToSection("find-campaigns")}
            >
              <span className="sidebar-icon">⌕</span>
              <span>Find Campaigns</span>
            </button>

            <button
              className="sidebar-link"
              onClick={() => scrollToSection("active-campaigns")}
            >
              <span className="sidebar-icon">◫</span>
              <span>Active Campaigns</span>
            </button>

            <button
              className="sidebar-link"
              onClick={() => scrollToSection("earnings-section")}
            >
              <span className="sidebar-icon">$</span>
              <span>Earnings</span>
            </button>

            <button
              className="sidebar-link"
              onClick={() => setShowMessages(true)}
            >
              <span className="sidebar-icon">✉</span>
              <span>Messages</span>
            </button>

            <button
              className="sidebar-link"
              onClick={() => setShowSettings(true)}
            >
              <span className="sidebar-icon">⚙</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>
      </aside>

      <main className="portal-main" id="athlete-top">
        <div className="topbar">
          <h1 className="page-title">Athlete Portal</h1>

          <div className="topbar-actions">
            <button
              className="secondary-button"
              onClick={() => setShowNotifications(true)}
            >
              Notifications
            </button>
          </div>
        </div>

        <section className="athlete-top-grid">
          <div className="stat-card athlete-level-card">
            <div className="stat-title">Level</div>
            <div className="stat-value">
              {level}
              <span className="inline-muted">
                {" "}
                {xp.toLocaleString()}/{nextGoal.toLocaleString()} XP
              </span>
            </div>
            <div className="progress-track" style={{ marginTop: 14 }}>
              <div
                className="progress-fill"
                style={{ width: `${Math.min((xp / nextGoal) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Levels & Rewards</div>
            <div className="stat-value">{level}</div>
            <div className="stat-subtext">
              Get {(nextGoal - xp).toLocaleString()} XP to level up
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Approved Posts</div>
            <div className="stat-value">{approvedPosts}</div>
            <div className="stat-subtext">verified completions</div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Earnings</div>
            <div className="stat-value">${earnings}</div>
            <div className="stat-subtext">pending payout</div>
          </div>
        </section>

        <section id="active-campaigns" className="panel">
          <div className="panel-header">
            <h2>Active Campaigns - {activeCampaigns.length}</h2>
          </div>

          <div className="table-like">
            <div className="table-head four">
              <span>Campaign</span>
              <span>Progress</span>
              <span>To-do&apos;s</span>
              <span>Due date</span>
            </div>

            {activeCampaigns.map((campaign) => (
              <div
                className="table-row four clickable"
                key={campaign.id}
                onClick={() => advanceCampaign(campaign.id)}
              >
                <span>{campaign.campaign}</span>
                <span>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${campaign.progress}%` }}
                    />
                  </div>
                </span>
                <span>{campaign.todo}</span>
                <span>{campaign.dueDate}</span>
              </div>
            ))}
          </div>

          <div className="panel-note">
            Click any active campaign row to simulate completion progress.
          </div>
        </section>

        <div className="athlete-bottom-grid">
          <section id="find-campaigns" className="panel">
            <div className="panel-header">
              <h2>Find Campaigns</h2>
            </div>

            <div className="pending-grid">
              {pendingCampaigns.map((item) => (
                <div className="pending-card" key={item.id}>
                  <h3>{item.campaign}</h3>
                  <div className="pending-pay">${item.pay} per post</div>
                  <p>{item.details}</p>
                  <p>Category: {item.category}</p>
                  <p>Deadline: {item.deadline}</p>
                  <button
                    className="cta-button full"
                    onClick={() => setSelectedPending(item)}
                  >
                    {item.status}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="athlete-side-column">
            <div className="mini-panel">
              <div className="mini-panel-head">
                <h3>Messages</h3>
                <button
                  className="secondary-button"
                  onClick={() => setShowMessages(true)}
                >
                  View All
                </button>
              </div>
              <p>• Active Thread</p>
            </div>

            <div className="mini-panel">
              <div className="mini-panel-head">
                <h3>Leaderboards</h3>
                <button
                  className="secondary-button"
                  onClick={() => setLeaderboardExpanded((prev) => !prev)}
                >
                  {leaderboardExpanded ? "Collapse" : "Expand"}
                </button>
              </div>

              <div className="leaderboard-list">
                {(leaderboardExpanded ? leaderboard : leaderboard.slice(0, 3)).map(
                  (entry, index) => (
                    <div className="leaderboard-row" key={entry.name}>
                      <span>
                        {index + 1}. {entry.name}
                      </span>
                      <span>{entry.xp}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <section id="earnings-section" className="panel">
          <div className="panel-header">
            <h2>Earnings</h2>
          </div>

          <div className="earnings-grid">
            <div className="stat-card">
              <div className="stat-title">Pending</div>
              <div className="stat-value">${earnings}</div>
              <div className="stat-subtext">next payout Friday</div>
            </div>

            <div className="stat-card">
              <div className="stat-title">Paid Out</div>
              <div className="stat-value">${paidOut}</div>
              <div className="stat-subtext">completed transfers</div>
            </div>

            <div className="stat-card">
              <div className="stat-title">Lifetime</div>
              <div className="stat-value">${lifetimeEarnings}</div>
              <div className="stat-subtext">all campaign earnings</div>
            </div>
          </div>

          <div className="earnings-history">
            <h3>Recent Earnings</h3>
            <div className="table-like">
              <div className="table-head three-col">
                <span>Campaign</span>
                <span>Amount</span>
                <span>Status</span>
              </div>

              {earningsHistory.map((entry, index) => (
                <div className="table-row three-col" key={`${entry.name}-${index}`}>
                  <span>{entry.name}</span>
                  <span>${entry.amount}</span>
                  <span>{entry.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {selectedPending && (
          <div className="modal-overlay" onClick={() => setSelectedPending(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedPending.campaign}</h3>
                <button
                  className="ghost-button"
                  onClick={() => setSelectedPending(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="mini-card">
                  <strong>Payout</strong>
                  <p>${selectedPending.pay} per post</p>
                </div>
                <br />
                <div className="mini-card">
                  <strong>Deliverables</strong>
                  <p>{selectedPending.details}</p>
                </div>
                <br />
                <div className="mini-card">
                  <strong>Deadline</strong>
                  <p>{selectedPending.deadline}</p>
                </div>
              </div>

              <div className="modal-footer">
                <button className="secondary-button" onClick={declinePending}>
                  Decline
                </button>
                <button className="cta-button" onClick={acceptPending}>
                  Accept Campaign
                </button>
              </div>
            </div>
          </div>
        )}

        {showNotifications && (
          <div className="drawer open">
            <div className="drawer-header">
              <h3>Notifications</h3>
              <button
                className="ghost-button"
                onClick={() => setShowNotifications(false)}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div className="mini-card">Tommy&apos;s Tacos approved your latest post</div>
              <br />
              <div className="mini-card">New Silver campaign available nearby</div>
              <br />
              <div className="mini-card">You earned +120 XP from completion</div>
            </div>
          </div>
        )}

        {showMessages && (
          <div className="drawer open">
            <div className="drawer-header">
              <h3>Messages</h3>
              <button
                className="ghost-button"
                onClick={() => setShowMessages(false)}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div className="chat-thread">
                <div className="message left">
                  Can you complete the post by tomorrow night?
                </div>
                <div className="message right">
                  Yes, I&apos;ll have it posted before the deadline.
                </div>
                <div className="message left">
                  Perfect. Upload proof once it&apos;s live.
                </div>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Athlete Settings</h3>
                <button className="ghost-button" onClick={() => setShowSettings(false)}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-grid two">
                  <label>
                    First name
                    <input
                      value={settings.firstName}
                      onChange={(e) =>
                        setSettings({ ...settings, firstName: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Last name
                    <input
                      value={settings.lastName}
                      onChange={(e) =>
                        setSettings({ ...settings, lastName: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    School
                    <input
                      value={settings.school}
                      onChange={(e) =>
                        setSettings({ ...settings, school: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Sport
                    <input
                      value={settings.sport}
                      onChange={(e) =>
                        setSettings({ ...settings, sport: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Graduation year
                    <input
                      value={settings.graduation}
                      onChange={(e) =>
                        setSettings({ ...settings, graduation: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    City
                    <input
                      value={settings.city}
                      onChange={(e) =>
                        setSettings({ ...settings, city: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    State
                    <input
                      value={settings.state}
                      onChange={(e) =>
                        setSettings({ ...settings, state: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Minimum payout
                    <input
                      value={settings.minPayout}
                      onChange={(e) =>
                        setSettings({ ...settings, minPayout: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Deal types
                    <input
                      value={settings.dealTypes}
                      onChange={(e) =>
                        setSettings({ ...settings, dealTypes: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Industries of interest
                    <input
                      value={settings.industries}
                      onChange={(e) =>
                        setSettings({ ...settings, industries: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Instagram handle
                    <input
                      placeholder="@yourhandle"
                      value={settings.instagram}
                      onChange={(e) =>
                        setSettings({ ...settings, instagram: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    TikTok handle (optional)
                    <input
                      placeholder="@yourhandle"
                      value={settings.tiktok}
                      onChange={(e) =>
                        setSettings({ ...settings, tiktok: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="secondary-button"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </button>
                <button
                  className="cta-button"
                  onClick={() => {
                    if (!settings.instagram) {
                      alert("Instagram handle is required");
                      return;
                    }
                    setShowSettings(false);
                  }}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}