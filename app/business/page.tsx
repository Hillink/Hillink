"use client";

import { useMemo, useState } from "react";

type Athlete = {
  id: number;
  name: string;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  pay: number;
  city: string;
  sport: string;
};

type Campaign = {
  id: number;
  name: string;
  progress: number;
  deliverables: string;
  dueDate: string;
  status: string;
};

const athletePool: Athlete[] = [
  {
    id: 1,
    name: "Alex Thompson",
    tier: "Bronze",
    pay: 35,
    city: "Townville, USA",
    sport: "Basketball",
  },
  {
    id: 2,
    name: "Jordan Lee",
    tier: "Silver",
    pay: 65,
    city: "Riverton, USA",
    sport: "Volleyball",
  },
  {
    id: 3,
    name: "Mia Carter",
    tier: "Gold",
    pay: 100,
    city: "College Station, USA",
    sport: "Track",
  },
  {
    id: 4,
    name: "Dylan Brooks",
    tier: "Silver",
    pay: 65,
    city: "Bryan, USA",
    sport: "Football",
  },
];

const starterCampaigns: Campaign[] = [
  {
    id: 1,
    name: "Spring Promotion",
    progress: 72,
    deliverables: "1 IG Post; 2 Stories",
    dueDate: "Apr 30, 2024",
    status: "Active",
  },
  {
    id: 2,
    name: "Local Event Promo",
    progress: 39,
    deliverables: "1 TikTok Post",
    dueDate: "May 7, 2024",
    status: "Active",
  },
  {
    id: 3,
    name: "Limited Campaign",
    progress: 35,
    deliverables: "1 X Post",
    dueDate: "May 14, 2024",
    status: "Review",
  },
];

export default function BusinessPage() {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  const [campaigns, setCampaigns] = useState<Campaign[]>(starterCampaigns);
  const [athleteSlots, setAthleteSlots] = useState(6);
  const [filterTier, setFilterTier] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);

  const [form, setForm] = useState({
    title: "New Launch Push",
    deliverables: "1 IG Post",
    tier: "Silver",
    slots: 2,
    dueDate: "May 21, 2024",
  });

  const filteredAthletes = useMemo(() => {
    if (filterTier === "All") return athletePool;
    return athletePool.filter((athlete) => athlete.tier === filterTier);
  }, [filterTier]);

  const engagementRate = useMemo(() => {
    const totalProgress = campaigns.reduce((sum, c) => sum + c.progress, 0);
    return (totalProgress / campaigns.length / 10).toFixed(1);
  }, [campaigns]);

  function advanceCampaign(id: number) {
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === id
          ? {
              ...campaign,
              progress: Math.min(campaign.progress + 12, 100),
              status: campaign.progress + 12 >= 100 ? "Complete" : "Active",
            }
          : campaign
      )
    );
  }

  function submitCampaign() {
    const newCampaign: Campaign = {
      id: Date.now(),
      name: form.title,
      progress: 8,
      deliverables: form.deliverables,
      dueDate: form.dueDate,
      status: "Pending",
    };

    setCampaigns([newCampaign, ...campaigns]);
    setAthleteSlots((prev) => Math.max(0, prev - Number(form.slots)));
    setShowModal(false);
  }

  function assignAthlete() {
    if (!selectedAthlete || athleteSlots <= 0) return;
    setAthleteSlots((prev) => prev - 1);
    setSelectedAthlete(null);
  }

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/Hillink-logo-black-red.png" alt="HILLink" className="sidebar-logo" />
          </div>

          <nav className="sidebar-nav">
            <button className="sidebar-link active" onClick={() => scrollTo("top")}>
              <span className="sidebar-icon">⌂</span>
              <span>Home</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollTo("campaigns")}>
              <span className="sidebar-icon">◧</span>
              <span>Campaigns</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollTo("matches")}>
              <span className="sidebar-icon">◎</span>
              <span>Active</span>
            </button>
            <button className="sidebar-link" onClick={() => setShowDiagnostics(true)}>
              <span className="sidebar-icon">▣</span>
              <span>Diagnostics</span>
            </button>
            <button className="sidebar-link" onClick={() => setShowMessages(true)}>
              <span className="sidebar-icon">✉</span>
              <span>Messages</span>
            </button>
            <button className="sidebar-link" onClick={() => alert("Referral system coming soon")}>
              <span className="sidebar-icon">⋈</span>
              <span>Referrals</span>
            </button>
            <button className="sidebar-link" onClick={() => alert("Settings panel coming soon")}>
              <span className="sidebar-icon">⚙</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <button className="sidebar-cta" onClick={() => setShowModal(true)}>
          Post New Campaign
        </button>
      </aside>

      <main className="portal-main" id="top">
        <div className="topbar">
          <h1 className="page-title">Business Portal</h1>

          <div className="topbar-actions">
            <div className="topbar-chip">Tier 2 Plan</div>
            <button className="notification-btn">
              <span>🔔</span>
              <span className="notification-count">5</span>
            </button>
          </div>
        </div>

        <section className="stats-grid four">
          <div className="stat-card">
            <div className="stat-title">Athlete Slots</div>
            <div className="stat-value">{athleteSlots}</div>
            <div className="stat-subtext">Tier 2 Plan</div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Active Campaigns</div>
            <div className="stat-value">{campaigns.length}</div>
            <div className="stat-subtext">1 ending soon</div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Engagement Rate</div>
            <div className="stat-value">{engagementRate}%</div>
            <div className="stat-subtext">simulated live average</div>
          </div>

          <div className="stat-card">
            <div className="stat-title">Approved Posts</div>
            <div className="stat-value">15</div>
            <div className="stat-subtext">tracked campaign proofs</div>
          </div>
        </section>

        <div className="portal-toolbar">
          <button className="secondary-button" onClick={() => setShowDiagnostics(true)}>
            Diagnostics
          </button>
          <button className="secondary-button" onClick={() => setShowMessages(true)}>
            Messages
          </button>
          <button className="secondary-button">Find Athletes</button>
        </div>

        <section id="campaigns" className="panel">
          <div className="panel-header">
            <h2>Active Campaigns</h2>
          </div>

          <div className="table-like">
            <div className="table-head six">
              <span>Campaign</span>
              <span>Progress</span>
              <span>Deliverables</span>
              <span>Due Date</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            {campaigns.map((campaign) => (
              <div className="table-row six" key={campaign.id}>
                <span>{campaign.name}</span>
                <span>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${campaign.progress}%` }}
                    />
                  </div>
                </span>
                <span>{campaign.deliverables}</span>
                <span>{campaign.dueDate}</span>
                <span>{campaign.status}</span>
                <span>
                  <button
                    className="small-button"
                    onClick={() => advanceCampaign(campaign.id)}
                  >
                    Advance
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="matches" className="panel">
          <div className="panel-header">
            <h2>Available Matches</h2>

            <div className="filter-group">
              <button
                className={filterTier === "All" ? "filter active" : "filter"}
                onClick={() => setFilterTier("All")}
              >
                All
              </button>
              <button
                className={filterTier === "Bronze" ? "filter active" : "filter"}
                onClick={() => setFilterTier("Bronze")}
              >
                Bronze
              </button>
              <button
                className={filterTier === "Silver" ? "filter active" : "filter"}
                onClick={() => setFilterTier("Silver")}
              >
                Silver
              </button>
              <button
                className={filterTier === "Gold" ? "filter active" : "filter"}
                onClick={() => setFilterTier("Gold")}
              >
                Gold
              </button>
            </div>
          </div>

          <div className="match-grid">
            {filteredAthletes.map((athlete) => (
              <div className="match-card" key={athlete.id}>
                <div>
                  <strong>{athlete.name}</strong>{" "}
                  <span className="muted">- {athlete.tier}</span>
                </div>
                <div>${athlete.pay} per post</div>
                <div>{athlete.city}</div>
                <div>{athlete.sport}</div>

                <div className="match-card-footer">
                  <span className="rating">Top match</span>
                  <button
                    className="small-button"
                    onClick={() => setSelectedAthlete(athlete)}
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Post New Campaign</h3>
                <button className="ghost-button" onClick={() => setShowModal(false)}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-grid two">
                  <label>
                    Campaign title
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </label>

                  <label>
                    Eligible tier
                    <select
                      value={form.tier}
                      onChange={(e) => setForm({ ...form, tier: e.target.value })}
                    >
                      <option>Bronze</option>
                      <option>Silver</option>
                      <option>Gold</option>
                      <option>Platinum</option>
                    </select>
                  </label>

                  <label>
                    Deliverables
                    <input
                      value={form.deliverables}
                      onChange={(e) =>
                        setForm({ ...form, deliverables: e.target.value })
                      }
                    />
                  </label>

                  <label>
                    Slots
                    <input
                      type="number"
                      min="1"
                      value={form.slots}
                      onChange={(e) =>
                        setForm({ ...form, slots: Number(e.target.value) })
                      }
                    />
                  </label>

                  <label>
                    Due date
                    <input
                      value={form.dueDate}
                      onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    />
                  </label>

                  <div className="quote-box">
                    <div>
                      <span>Monthly platform access</span>
                      <strong>$250</strong>
                    </div>
                    <div>
                      <span>Per athlete ({form.tier})</span>
                      <strong>
                        {form.tier === "Bronze"
                          ? "$35"
                          : form.tier === "Silver"
                          ? "$65"
                          : form.tier === "Gold"
                          ? "$100"
                          : "$200"}
                      </strong>
                    </div>
                    <div>
                      <span>Estimated total</span>
                      <strong>
                        $
                        {250 +
                          (form.tier === "Bronze"
                            ? 35
                            : form.tier === "Silver"
                            ? 65
                            : form.tier === "Gold"
                            ? 100
                            : 200) *
                            Number(form.slots)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="secondary-button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="cta-button" onClick={submitCampaign}>
                  Launch Campaign
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedAthlete && (
          <div className="modal-overlay" onClick={() => setSelectedAthlete(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedAthlete.name}</h3>
                <button
                  className="ghost-button"
                  onClick={() => setSelectedAthlete(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="detail-grid">
                  <div className="mini-card">
                    <strong>Tier</strong>
                    <p>{selectedAthlete.tier}</p>
                  </div>
                  <div className="mini-card">
                    <strong>Pay</strong>
                    <p>${selectedAthlete.pay} per post</p>
                  </div>
                  <div className="mini-card">
                    <strong>Sport</strong>
                    <p>{selectedAthlete.sport}</p>
                  </div>
                  <div className="mini-card">
                    <strong>Location</strong>
                    <p>{selectedAthlete.city}</p>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="secondary-button"
                  onClick={() => setSelectedAthlete(null)}
                >
                  Close
                </button>
                <button className="cta-button" onClick={assignAthlete}>
                  Assign Athlete
                </button>
              </div>
            </div>
          </div>
        )}

        {showMessages && (
          <div className="drawer open">
            <div className="drawer-header">
              <h3>Messages</h3>
              <button className="ghost-button" onClick={() => setShowMessages(false)}>
                ✕
              </button>
            </div>
            <div className="drawer-body">
              <div className="chat-thread">
                <div className="message left">
                  Can you add two athletes to the event push?
                </div>
                <div className="message right">
                  Yes. I’m reviewing matches now.
                </div>
                <div className="message left">Great. Need them by Friday.</div>
              </div>
            </div>
          </div>
        )}

        {showDiagnostics && (
          <div className="drawer open">
            <div className="drawer-header">
              <h3>Diagnostics</h3>
              <button
                className="ghost-button"
                onClick={() => setShowDiagnostics(false)}
              >
                ✕
              </button>
            </div>
            <div className="drawer-body">
              <div className="mini-card">
                <strong>Campaign performance</strong>
                <p>
                  Spring Promotion is trending best with the highest progress and
                  strongest completion pace.
                </p>
              </div>
              <br />
              <div className="mini-card">
                <strong>Renewal prompt</strong>
                <p>
                  Duplicate Spring Promotion with your strongest local-fit athletes.
                </p>
              </div>
              <br />
              <div className="mini-card">
                <strong>Compliance</strong>
                <p>
                  No flagged keywords. Payment method on file. Current campaigns are
                  safe to continue.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}