"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Campaign = {
  id: string;
  title: string;
};

type Payment = {
  id: string;
  application_id: string;
  amount_cents: number;
  hold_status: "uncommitted" | "held" | "released" | "refunded" | "disputed";
  stripe_transfer_id: string | null;
  payout_at: string | null;
  created_at: string;
  campaign: Campaign | null;
};

const STATUS_PILL: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  uncommitted: { bg: "#f3f4f6", color: "#374151", label: "Pending" },
  held: { bg: "#fff6e5", color: "#8a5a00", label: "In Escrow" },
  released: { bg: "#e7f8ee", color: "#0a7f2e", label: "Paid Out" },
  refunded: { bg: "#dbeafe", color: "#1d4ed8", label: "Refunded" },
  disputed: { bg: "#ffe8e8", color: "#9b1c1c", label: "Disputed" },
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AthleteEarningsDashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);

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

      const { data, error: fetchError } = await supabase
        .from("payments")
        .select(
          `id, application_id, amount_cents, hold_status, stripe_transfer_id, payout_at, created_at,
           application:campaign_applications!inner(
             campaign:campaigns!inner(id, title)
           )`
        )
        .eq("athlete_id", userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError("Failed to load earnings.");
        setLoading(false);
        return;
      }

      // Flatten nested join
      const mapped: Payment[] = (data ?? []).map((row: any) => ({
        id: row.id,
        application_id: row.application_id,
        amount_cents: row.amount_cents,
        hold_status: row.hold_status,
        stripe_transfer_id: row.stripe_transfer_id,
        payout_at: row.payout_at,
        created_at: row.created_at,
        campaign: row.application?.campaign ?? null,
      }));

      setPayments(mapped);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalReleased = payments
    .filter((p) => p.hold_status === "released")
    .reduce((s, p) => s + p.amount_cents, 0);

  const totalHeld = payments
    .filter((p) => p.hold_status === "held")
    .reduce((s, p) => s + p.amount_cents, 0);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6f7481" }}>
        Loading earnings…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>My Earnings</h1>
      <p style={{ color: "#6f7481", marginBottom: 24, marginTop: 0 }}>
        Track your campaign payouts and escrow status.
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

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#e7f8ee",
            borderRadius: 10,
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 13, color: "#0a7f2e", fontWeight: 600 }}>
            Total Paid Out
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0a7f2e", marginTop: 4 }}>
            {formatCents(totalReleased)}
          </div>
        </div>
        <div
          style={{
            background: "#fff6e5",
            borderRadius: 10,
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 13, color: "#8a5a00", fontWeight: 600 }}>
            Held in Escrow
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8a5a00", marginTop: 4 }}>
            {formatCents(totalHeld)}
          </div>
        </div>
        <div
          style={{
            background: "#f3f4f6",
            borderRadius: 10,
            padding: "16px 20px",
          }}
        >
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
            Total Transactions
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#374151", marginTop: 4 }}>
            {payments.length}
          </div>
        </div>
      </div>

      {payments.length === 0 && !error && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #d9dce2",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: "#6f7481",
          }}
        >
          No earnings yet. Complete a campaign to receive payment.
        </div>
      )}

      {payments.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #d9dce2",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {payments.map((payment, i) => (
            <div
              key={payment.id}
              style={{
                padding: "16px 20px",
                borderBottom:
                  i < payments.length - 1 ? "1px solid #f0f1f5" : "none",
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {payment.campaign?.title ?? "Campaign"}
                </div>
                <div style={{ fontSize: 13, color: "#6f7481", marginTop: 2 }}>
                  {payment.payout_at
                    ? `Paid ${formatDate(payment.payout_at)}`
                    : `Recorded ${formatDate(payment.created_at)}`}
                </div>
                {payment.stripe_transfer_id && (
                  <div style={{ fontSize: 12, color: "#6f7481", marginTop: 2 }}>
                    Transfer: {payment.stripe_transfer_id}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {formatCents(payment.amount_cents)}
                </div>
                <span
                  style={{
                    marginTop: 4,
                    display: "inline-block",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 9px",
                    borderRadius: 10,
                    background: STATUS_PILL[payment.hold_status]?.bg ?? "#f3f4f6",
                    color: STATUS_PILL[payment.hold_status]?.color ?? "#374151",
                  }}
                >
                  {STATUS_PILL[payment.hold_status]?.label ?? payment.hold_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
