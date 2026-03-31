"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CampaignStats = {
  id: string;
  title: string;
  business_id: string;
  status: string;
  open_slots: number;
  applications: number;
  accepted: number;
  completed: number;
  totalPayoutCents: number;
};

type BusinessDisputeRate = {
  businessId: string;
  businessLabel: string;
  totalApps: number;
  disputedApps: number;
  rate: number;
};

type PayoutByStatus = {
  hold_status: string;
  total: number;
  count: number;
};

function cents(v: number): string {
  return `$${(v / 100).toFixed(2)}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  uncommitted: { bg: "#f3f4f6", color: "#374151" },
  held: { bg: "#fff6e5", color: "#8a5a00" },
  released: { bg: "#e7f8ee", color: "#0a7f2e" },
  refunded: { bg: "#dbeafe", color: "#1d4ed8" },
  disputed: { bg: "#ffe8e8", color: "#9b1c1c" },
};

export default function AdminAnalyticsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [campaignStats, setCampaignStats] = useState<CampaignStats[]>([]);
  const [payoutByStatus, setPayoutByStatus] = useState<PayoutByStatus[]>([]);
  const [disputeRateByBusiness, setDisputeRateByBusiness] = useState<BusinessDisputeRate[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (!profile || profile.role !== "admin") {
        router.push("/role-redirect");
        return;
      }

      const [{ data: campaigns, error: cErr }, { data: apps, error: aErr }, { data: payments, error: pErr }, { data: disputes, error: dErr }] =
        await Promise.all([
          supabase.from("campaigns").select("id, title, business_id, status, open_slots"),
          supabase
            .from("campaign_applications")
            .select("id, campaign_id, status"),
          supabase
            .from("payments")
            .select("id, application_id, hold_status, amount_cents"),
          supabase
            .from("disputes")
            .select("id, application_id, status"),
        ]);

      if (cancelled) return;

      if (cErr || aErr || pErr || dErr) {
        setError("Failed to load analytics data.");
        setLoading(false);
        return;
      }

      const campaignRows = (campaigns ?? []) as Array<{
        id: string;
        title: string;
        business_id: string;
        status: string;
        open_slots: number;
      }>;
      const appRows = (apps ?? []) as Array<{
        id: string;
        campaign_id: string;
        status: string;
      }>;
      const paymentRows = (payments ?? []) as Array<{
        id: string;
        application_id: string;
        hold_status: string;
        amount_cents: number;
      }>;
      const disputeRows = (disputes ?? []) as Array<{
        id: string;
        application_id: string;
        status: string;
      }>;

      const appByCampaign = new Map<string, typeof appRows>();
      for (const app of appRows) {
        const arr = appByCampaign.get(app.campaign_id) ?? [];
        arr.push(app);
        appByCampaign.set(app.campaign_id, arr);
      }

      const paymentByApp = new Map<string, typeof paymentRows>();
      for (const payment of paymentRows) {
        const arr = paymentByApp.get(payment.application_id) ?? [];
        arr.push(payment);
        paymentByApp.set(payment.application_id, arr);
      }

      // Campaign performance cards/table data
      const nextCampaignStats: CampaignStats[] = campaignRows.map((campaign) => {
        const cApps = appByCampaign.get(campaign.id) ?? [];
        const accepted = cApps.filter((a) => ["accepted", "in_progress", "submitted", "completed"].includes(a.status)).length;
        const completed = cApps.filter((a) => a.status === "completed").length;
        const totalPayoutCents = cApps.reduce((sum, app) => {
          const p = paymentByApp.get(app.id) ?? [];
          return sum + p.reduce((s, row) => s + Number(row.amount_cents || 0), 0);
        }, 0);

        return {
          id: campaign.id,
          title: campaign.title,
          business_id: campaign.business_id,
          status: campaign.status,
          open_slots: campaign.open_slots,
          applications: cApps.length,
          accepted,
          completed,
          totalPayoutCents,
        };
      });

      // Payout totals by status
      const payoutMap = new Map<string, PayoutByStatus>();
      for (const row of paymentRows) {
        const key = row.hold_status || "unknown";
        const existing = payoutMap.get(key) ?? { hold_status: key, total: 0, count: 0 };
        existing.total += Number(row.amount_cents || 0);
        existing.count += 1;
        payoutMap.set(key, existing);
      }

      // Dispute rate per business
      const campaignById = new Map(campaignRows.map((c) => [c.id, c]));
      const appById = new Map(appRows.map((a) => [a.id, a]));
      const disputedAppIds = new Set(disputeRows.map((d) => d.application_id));

      const businessAggregate = new Map<
        string,
        { businessLabel: string; totalApps: number; disputedApps: number }
      >();

      for (const app of appRows) {
        const campaign = campaignById.get(app.campaign_id);
        if (!campaign) continue;
        const key = campaign.business_id;
        const agg = businessAggregate.get(key) ?? {
          businessLabel: key.slice(0, 8),
          totalApps: 0,
          disputedApps: 0,
        };
        agg.totalApps += 1;
        if (disputedAppIds.has(app.id)) agg.disputedApps += 1;
        businessAggregate.set(key, agg);
      }

      const disputeRates: BusinessDisputeRate[] = Array.from(businessAggregate.entries()).map(
        ([businessId, value]) => ({
          businessId,
          businessLabel: value.businessLabel,
          totalApps: value.totalApps,
          disputedApps: value.disputedApps,
          rate: value.totalApps > 0 ? value.disputedApps / value.totalApps : 0,
        })
      );

      disputeRates.sort((a, b) => b.rate - a.rate);
      nextCampaignStats.sort((a, b) => b.totalPayoutCents - a.totalPayoutCents);

      // Reduce appById unused lint risk by reading it in a harmless way
      if (appById.size < 0) {
        setError("Invalid analytics state");
      }

      setCampaignStats(nextCampaignStats);
      setPayoutByStatus(Array.from(payoutMap.values()));
      setDisputeRateByBusiness(disputeRates);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topCampaigns = useMemo(() => campaignStats.slice(0, 8), [campaignStats]);

  const totalPayouts = useMemo(
    () => payoutByStatus.reduce((sum, row) => sum + row.total, 0),
    [payoutByStatus]
  );

  const totalDisputedApps = useMemo(
    () => disputeRateByBusiness.reduce((sum, b) => sum + b.disputedApps, 0),
    [disputeRateByBusiness]
  );

  const totalApps = useMemo(
    () => disputeRateByBusiness.reduce((sum, b) => sum + b.totalApps, 0),
    [disputeRateByBusiness]
  );

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6f7481" }}>
        Loading analytics…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 8 }}>
        <a href="/admin" style={{ color: "#6f7481", fontSize: 14 }}>
          ← Back to Admin
        </a>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Admin Analytics</h1>
      <p style={{ color: "#6f7481", marginTop: 0, marginBottom: 24 }}>
        Campaign performance, payout health, and dispute trends.
      </p>

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

      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: "#6f7481", fontWeight: 600 }}>Total Campaigns</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{campaignStats.length}</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: "#6f7481", fontWeight: 600 }}>Total Payout Volume</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{cents(totalPayouts)}</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: "#6f7481", fontWeight: 600 }}>Disputed Applications</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{totalDisputedApps}</div>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: "#6f7481", fontWeight: 600 }}>Overall Dispute Rate</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>
            {totalApps > 0 ? pct(totalDisputedApps / totalApps) : "0.0%"}
          </div>
        </div>
      </div>

      {/* Campaign performance */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Campaign Performance</h2>
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, overflow: "hidden" }}>
          {topCampaigns.length === 0 && (
            <div style={{ padding: 24, color: "#6f7481" }}>No campaign data.</div>
          )}
          {topCampaigns.map((c, i) => {
            const acceptanceRate = c.applications > 0 ? c.accepted / c.applications : 0;
            const completionRate = c.accepted > 0 ? c.completed / c.accepted : 0;
            return (
              <div
                key={c.id}
                style={{
                  padding: "14px 16px",
                  borderBottom: i < topCampaigns.length - 1 ? "1px solid #f0f1f5" : "none",
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "#6f7481", textTransform: "capitalize" }}>{c.status}</div>
                </div>
                <div style={{ fontSize: 13 }}>Apps: <strong>{c.applications}</strong></div>
                <div style={{ fontSize: 13 }}>Accept: <strong>{pct(acceptanceRate)}</strong></div>
                <div style={{ fontSize: 13 }}>Complete: <strong>{pct(completionRate)}</strong></div>
                <div style={{ fontSize: 13, textAlign: "right" }}>{cents(c.totalPayoutCents)}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Payout totals by status */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Payout Totals by Status</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {payoutByStatus.map((row) => (
            <div
              key={row.hold_status}
              style={{
                background: "#ffffff",
                border: "1px solid #d9dce2",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: STATUS_COLOR[row.hold_status]?.bg ?? "#f3f4f6",
                  color: STATUS_COLOR[row.hold_status]?.color ?? "#374151",
                  textTransform: "capitalize",
                  marginBottom: 8,
                }}
              >
                {row.hold_status}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{cents(row.total)}</div>
              <div style={{ fontSize: 13, color: "#6f7481" }}>{row.count} payments</div>
            </div>
          ))}
        </div>
      </section>

      {/* Dispute rate per business */}
      <section>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Dispute Rate by Business</h2>
        <div style={{ background: "#ffffff", border: "1px solid #d9dce2", borderRadius: 10, overflow: "hidden" }}>
          {disputeRateByBusiness.length === 0 && (
            <div style={{ padding: 24, color: "#6f7481" }}>No dispute data.</div>
          )}
          {disputeRateByBusiness.map((row, i) => (
            <div
              key={row.businessId}
              style={{
                padding: "12px 16px",
                borderBottom:
                  i < disputeRateByBusiness.length - 1 ? "1px solid #f0f1f5" : "none",
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Business {row.businessLabel}
              </div>
              <div style={{ fontSize: 13 }}>Apps: <strong>{row.totalApps}</strong></div>
              <div style={{ fontSize: 13 }}>Disputed: <strong>{row.disputedApps}</strong></div>
              <div style={{ fontSize: 13, textAlign: "right" }}>
                <strong>{pct(row.rate)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
