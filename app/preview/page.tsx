"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PortalMode = "athlete" | "business";
type AthleteTab = "overview" | "campaigns" | "deliverables" | "earnings";
type BusinessTab = "overview" | "campaigns" | "applicants" | "analytics";

const athleteTabs: AthleteTab[] = ["overview", "campaigns", "deliverables", "earnings"];
const businessTabs: BusinessTab[] = ["overview", "campaigns", "applicants", "analytics"];

const athleteItems = {
  campaigns: [
    { title: "Aggie Auto Group Spring Push", meta: "Instagram Reel • $125 payout", status: "Open near College Station" },
    { title: "Local Grind Finals Week Promo", meta: "Story pack • $65 payout", status: "3 athletes already accepted" },
    { title: "Brazos Fitness Member Drive", meta: "Post + story • $100 payout", status: "Closes tomorrow" },
  ],
  deliverables: [
    { title: "Draft reel for Aggie Auto Group", meta: "Due tonight at 7:00 PM", status: "Needs caption + tag" },
    { title: "Story proof for Brazos Fitness", meta: "Submitted 2 hours ago", status: "Awaiting business review" },
    { title: "Weekend recap for Local Grind", meta: "Starts Saturday", status: "Prep assets ready" },
  ],
  earnings: [
    { title: "Pending payout", meta: "2 campaigns awaiting approval", status: "$190 in queue" },
    { title: "XP progress", meta: "120 XP to Silver", status: "4.7 average rating" },
    { title: "Referral bonus", meta: "1 athlete joined from your code", status: "$25 bonus unlocked" },
  ],
};

const businessItems = {
  campaigns: [
    { title: "Aggie Auto Group Spring Promo", meta: "6 of 8 athletes selected", status: "Applications active" },
    { title: "Houston Weekend Launch", meta: "2 deliverables pending review", status: "Starts in 3 days" },
    { title: "Local Grind Student Push", meta: "ROI trend +14%", status: "Ready to duplicate" },
  ],
  applicants: [
    { title: "Morgan Reyes", meta: "Texas A&M • Volleyball • 4.8 stars", status: "Strong fit for story campaign" },
    { title: "Avery Patel", meta: "Blinn College • Baseball • 4.6 stars", status: "Affordable local reach" },
    { title: "Jordan Brooks", meta: "Houston area • Track • 4.9 stars", status: "Fastest-growing audience" },
  ],
  analytics: [
    { title: "Campaign ROI snapshot", meta: "Estimated value: $3.1K", status: "+18% engagement vs. last month" },
    { title: "Top audience pocket", meta: "College Station + Houston", status: "Best response from 18-24" },
    { title: "Renewal recommendation", meta: "2 athletes worth rebooking", status: "Strong story completion rate" },
  ],
};

export default function PreviewPage() {
  const [portal, setPortal] = useState<PortalMode>("athlete");
  const [athleteTab, setAthleteTab] = useState<AthleteTab>("overview");
  const [businessTab, setBusinessTab] = useState<BusinessTab>("overview");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [demoMessage, setDemoMessage] = useState("Prototype mode: click around freely. Nothing here will submit or save.");

  const activeTab = portal === "athlete" ? athleteTab : businessTab;

  const activeItems = useMemo(() => {
    if (portal === "athlete") {
      if (athleteTab === "campaigns") return athleteItems.campaigns;
      if (athleteTab === "deliverables") return athleteItems.deliverables;
      if (athleteTab === "earnings") return athleteItems.earnings;
      return athleteItems.campaigns;
    }

    if (businessTab === "campaigns") return businessItems.campaigns;
    if (businessTab === "applicants") return businessItems.applicants;
    if (businessTab === "analytics") return businessItems.analytics;
    return businessItems.campaigns;
  }, [portal, athleteTab, businessTab]);

  const selectedItem = activeItems[selectedIndex] ?? activeItems[0];

  function switchPortal(nextPortal: PortalMode) {
    setPortal(nextPortal);
    setSelectedIndex(0);
    setDemoMessage(
      nextPortal === "athlete"
        ? "Athlete demo loaded. Try the tabs to browse campaigns, deliverables, and earnings."
        : "Business demo loaded. Try the tabs to review campaigns, applicants, and analytics."
    );
  }

  function showDemoAction(label: string) {
    setDemoMessage(`${label} is demo-only in the prototype. It is here to show the flow, not perform a real action.`);
  }

  return (
    <main className="waitlist-shell prototype-shell">
      <section className="prototype-hero">
        <div className="prototype-banner">
          <span>Interactive Prototype</span>
          <span>Safe demo mode • no data changes</span>
        </div>
        <h1 className="waitlist-title">Walk through the HILLink product before launch</h1>
        <p className="waitlist-subtitle">
          Toggle between athlete and business views, click into sections, and explore the feel of the product without triggering any
          live workflows.
        </p>
      </section>

      <section className="prototype-stage">
        <aside className="prototype-sidebar">
          <div className="prototype-brand-block">
            <div className="prototype-brand-logo" aria-label="HILLink">
              <span className="prototype-brand-logo-hil">HIL</span>
              <span className="prototype-brand-logo-link">Link</span>
            </div>
            <p>Prelaunch interior preview based on the real dashboard structure.</p>
          </div>

          <div className="prototype-mode-switch">
            <button
              type="button"
              className={portal === "athlete" ? "is-active athlete" : "athlete"}
              onClick={() => switchPortal("athlete")}
            >
              Athlete Portal
            </button>
            <button
              type="button"
              className={portal === "business" ? "is-active business" : "business"}
              onClick={() => switchPortal("business")}
            >
              Business Portal
            </button>
          </div>

          <nav className="prototype-sidebar-nav">
            {(portal === "athlete" ? athleteTabs : businessTabs).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? "is-current" : undefined}
                onClick={() => {
                  setSelectedIndex(0);
                  setDemoMessage(`Showing ${tab} in the ${portal} portal.`);
                  if (portal === "athlete") {
                    setAthleteTab(tab as AthleteTab);
                  } else {
                    setBusinessTab(tab as BusinessTab);
                  }
                }}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="prototype-demo-callout">
            <strong>Demo note</strong>
            <p>{demoMessage}</p>
          </div>
        </aside>

        <div className="prototype-workspace">
          <header className="prototype-topbar">
            <div>
              <span className="prototype-topbar-kicker">{portal === "athlete" ? "Athlete dashboard" : "Business dashboard"}</span>
              <h2>{portal === "athlete" ? "See matched campaigns and performance at a glance" : "Manage campaign supply, approvals, and ROI"}</h2>
            </div>
            <div className="prototype-topbar-actions">
              <button type="button" onClick={() => showDemoAction(portal === "athlete" ? "Connect Instagram" : "Create campaign")}>{portal === "athlete" ? "Connect Instagram" : "Create Campaign"}</button>
              <button type="button" className="ghost" onClick={() => showDemoAction("Open notifications")}>Notifications</button>
            </div>
          </header>

          <div className="prototype-stats-row interactive">
            {(portal === "athlete"
              ? [
                  { value: "4", label: "Active Campaigns" },
                  { value: "92%", label: "On-Time Rate" },
                  { value: "4.7", label: "Average Rating" },
                ]
              : [
                  { value: "3", label: "Open Campaigns" },
                  { value: "18", label: "Total Applicants" },
                  { value: "$2.4K", label: "Monthly Spend" },
                ]).map((stat) => (
              <button key={stat.label} type="button" className="prototype-stat-tile" onClick={() => showDemoAction(`Inspect ${stat.label.toLowerCase()}`)}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </button>
            ))}
          </div>

          <div className="prototype-content-grid">
            <section className="prototype-panel-list">
              <div className="prototype-panel-head">
                <h3>{portal === "athlete" ? "Live queue" : "Current focus"}</h3>
                <button type="button" onClick={() => showDemoAction("Filter this list")}>Filter</button>
              </div>
              <div className="prototype-click-list">
                {activeItems.map((item, index) => (
                  <button
                    key={`${item.title}-${index}`}
                    type="button"
                    className={selectedIndex === index ? "is-selected" : undefined}
                    onClick={() => {
                      setSelectedIndex(index);
                      setDemoMessage(`Viewing ${item.title}. This is a visual-only detail state.`);
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.meta}</span>
                    <em>{item.status}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="prototype-detail-panel">
              <div className="prototype-panel-head">
                <h3>Detail preview</h3>
                <button type="button" onClick={() => showDemoAction("Open full record")}>Open Full View</button>
              </div>

              <div className={`prototype-detail-hero ${portal}`}>
                <span>{portal === "athlete" ? "Selected opportunity" : "Selected workspace item"}</span>
                <h4>{selectedItem.title}</h4>
                <p>{selectedItem.meta}</p>
              </div>

              <div className="prototype-detail-grid">
                <div className="prototype-detail-card">
                  <h5>Status</h5>
                  <p>{selectedItem.status}</p>
                </div>
                <div className="prototype-detail-card">
                  <h5>What this simulates</h5>
                  <p>
                    {portal === "athlete"
                      ? "Campaign discovery, deliverable progress, and earnings visibility inside the athlete dashboard."
                      : "Campaign management, applicant review, and business-side performance visibility."}
                  </p>
                </div>
              </div>

              <div className="prototype-action-cluster">
                {(portal === "athlete"
                  ? ["Apply Now", "Save for Later", "Preview Submission"]
                  : ["Review Applicants", "Approve Deliverable", "Rate Athlete"]).map((label) => (
                  <button key={label} type="button" onClick={() => showDemoAction(label)}>
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="prototype-note">
        <h4>Want full access?</h4>
        <p>
          Join the waitlist for early onboarding. We are prioritizing athlete and business users in College Station, Houston, and the
          surrounding markets.
        </p>
      </section>

      <div className="waitlist-success-actions prototype-cta-row">
        <Link href="/waitlist/athlete" className="waitlist-link-button waitlist-link-button-dark">
          Join Athlete Waitlist
        </Link>
        <Link href="/waitlist/business" className="waitlist-link-button waitlist-link-button-primary">
          Join Business Waitlist
        </Link>
        <Link href="/waitlist" className="waitlist-link-button waitlist-link-button-muted">
          Back to Waitlist
        </Link>
      </div>
    </main>
  );
}
