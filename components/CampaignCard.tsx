"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CampaignCardCampaign = {
  id: string;
  title: string;
  business: string;
  pay: string | number;
  tier: string;
  remaining: number;
  slots: number;
  status: string;
  open_slots?: number;
  auto_accept_enabled?: boolean;
  auto_accept_radius_miles?: number;
};

type CampaignCardProps = {
  campaign: CampaignCardCampaign;
  viewerRole?: "athlete" | "business" | "admin";
  onApply?: (campaignId: string) => void;
  applying?: boolean;
};

export default function CampaignCard({ campaign, viewerRole, onApply, applying = false }: CampaignCardProps) {
  const isAthlete = viewerRole === "athlete";
  const initialOpenSlots = Number(campaign.open_slots ?? campaign.remaining ?? 0);
  const [openSlots, setOpenSlots] = useState(initialOpenSlots);
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setOpenSlots(Number(campaign.open_slots ?? campaign.remaining ?? 0));
    setAcceptedCount(null);
    setSlotsLoading(true);
  }, [campaign.id, campaign.open_slots, campaign.remaining]);

  useEffect(() => {
    if (!supabase || !campaign.id) {
      setSlotsLoading(false);
      return;
    }

    let cancelled = false;

    const refreshSlots = async () => {
      const [campaignRes, appRes] = await Promise.all([
        supabase
          .from("campaigns")
          .select("open_slots")
          .eq("id", campaign.id)
          .maybeSingle<{ open_slots: number }>(),
        supabase
          .from("campaign_applications")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "accepted"),
      ]);

      if (cancelled) {
        return;
      }

      if (!campaignRes.error && typeof campaignRes.data?.open_slots === "number") {
        setOpenSlots(campaignRes.data.open_slots);
      }

      if (!appRes.error) {
        setAcceptedCount(appRes.count || 0);
      }

      setSlotsLoading(false);
    };

    const channel = supabase
      .channel(`campaign-slot-counter-${campaign.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_applications", filter: `campaign_id=eq.${campaign.id}` },
        () => {
          void refreshSlots();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${campaign.id}` },
        (payload) => {
          const nextOpenSlots = Number(payload.new?.open_slots);
          if (Number.isFinite(nextOpenSlots)) {
            setOpenSlots(nextOpenSlots);
          }
        }
      )
      .subscribe();

    void refreshSlots();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [campaign.id, supabase]);

  const totalSlots = Number(campaign.slots ?? 0);
  const filledSlots = acceptedCount ?? Math.max(0, totalSlots - openSlots);
  const isSlotsFull = openSlots <= 0;
  const canApply = campaign.status === "active" && !isSlotsFull;
  const statusKey = String(campaign.status || "").toLowerCase();
  const statusPill =
    statusKey === "active"
      ? { bg: "#dcfce7", color: "#166534" }
      : statusKey === "paused"
      ? { bg: "#fef9c3", color: "#854d0e" }
      : statusKey === "completed"
      ? { bg: "#dbeafe", color: "#1d4ed8" }
      : statusKey === "cancelled"
      ? { bg: "#fee2e2", color: "#b91c1c" }
      : { bg: "#f3f4f6", color: "#374151" };

  return (
    <div className="border rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{campaign.title}</h2>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ background: statusPill.bg, color: statusPill.color }}
        >
          {statusKey || "draft"}
        </span>
      </div>
      <p className="text-sm text-gray-500">{campaign.business}</p>

      {campaign.auto_accept_enabled && (
        <p className="mt-1 text-xs font-semibold text-green-700">
          {isSlotsFull ? "Auto-Accept Full" : "Auto-Accept ON"} • {campaign.auto_accept_radius_miles ?? 10}mi radius
        </p>
      )}

      <div className="flex justify-between mt-2">
        <span>${campaign.pay}</span>
        <span>{campaign.tier}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span>
          {slotsLoading ? "Slots: --" : `Slots: ${filledSlots}/${totalSlots}`}
        </span>
        {isSlotsFull && (
          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
            Slots Full
          </span>
        )}
      </div>

      {isAthlete && (
        <button
          className="mt-3 w-full bg-black text-white py-2 rounded disabled:opacity-60"
          disabled={!canApply || applying}
          onClick={() => onApply?.(campaign.id)}
        >
          {applying ? "Applying..." : isSlotsFull ? "Slots Full" : "Apply"}
        </button>
      )}
    </div>
  );
}
