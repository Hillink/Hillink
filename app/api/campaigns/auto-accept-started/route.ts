import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { askBusinessToFund, isFunded, paymentForWork } from "@/lib/payments/workFunding";

export async function POST() {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Find this business's open campaigns whose start_date has arrived
  const { data: startedCampaigns, error: campaignError } = await admin
    .from("campaigns")
    .select("id, title, open_slots, slots")
    .eq("business_id", userId)
    .eq("status", "open")
    .lte("start_date", today)
    .not("start_date", "is", null);

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  if (!startedCampaigns || startedCampaigns.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  const campaignIds = startedCampaigns.map((c) => c.id);

  // Find all pending (applied) applications for those campaigns
  const { data: pendingApps, error: appsError } = await admin
    .from("campaign_applications")
    .select("id, athlete_id, campaign_id")
    .in("campaign_id", campaignIds)
    .eq("status", "applied")
    .order("applied_at", { ascending: true }); // first-come first-served

  if (appsError) {
    return NextResponse.json({ error: appsError.message }, { status: 500 });
  }

  if (!pendingApps || pendingApps.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  // Track remaining open slots per campaign
  const openSlots: Record<string, number> = {};
  for (const c of startedCampaigns) {
    openSlots[c.id] = c.open_slots ?? 0;
  }

  const toAccept: typeof pendingApps = [];
  for (const app of pendingApps) {
    if ((openSlots[app.campaign_id] ?? 0) > 0) {
      toAccept.push(app);
      openSlots[app.campaign_id] -= 1;
    }
  }

  if (toAccept.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  const now = new Date().toISOString();
  const acceptIds = toAccept.map((a) => a.id);

  // Bulk accept
  const { error: updateError } = await admin
    .from("campaign_applications")
    .update({ status: "accepted", decided_at: now, accepted_at: now })
    .in("id", acceptIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Decrement open_slots on each campaign
  for (const campaign of startedCampaigns) {
    const remaining = openSlots[campaign.id];
    const accepted = (campaign.open_slots ?? 0) - remaining;
    if (accepted > 0) {
      await admin
        .from("campaigns")
        .update({ open_slots: Math.max(0, remaining) })
        .eq("id", campaign.id);
    }
  }

  // The business pays when it accepts (D5): set up each athlete's payment now. If it isn't funded yet,
  // the athlete is told to wait and the business is asked to pay, once per campaign.
  const campaignById = Object.fromEntries(startedCampaigns.map((c) => [c.id, c]));
  const needsFunding = new Set<string>();
  const funded = new Map<string, boolean>();
  for (const app of toAccept) {
    try {
      const payment = await paymentForWork(admin, {
        applicationId: app.id,
        campaignId: app.campaign_id,
        athleteId: app.athlete_id,
      });
      funded.set(app.id, isFunded(payment));
    } catch (error) {
      console.error("[auto-accept-started] failed to create payment", error);
      funded.set(app.id, false);
    }
    if (!funded.get(app.id)) needsFunding.add(app.campaign_id);
  }
  await Promise.allSettled(
    Array.from(needsFunding).map((campaignId) =>
      askBusinessToFund({ businessId: userId, campaignId, campaignTitle: campaignById[campaignId]?.title })
    )
  );

  // Send notifications (fire-and-forget per athlete)
  await Promise.allSettled(
    toAccept.map((app) => {
      const campaignTitle = campaignById[app.campaign_id]?.title ?? "your campaign";
      return createNotification({
        userId: app.athlete_id,
        type: "application_accepted",
        title: "You've been accepted!",
        body: funded.get(app.id)
          ? `You were automatically accepted into "${campaignTitle}". Upload your proof when you're ready.`
          : `You were automatically accepted into "${campaignTitle}". You can send proof once the business has paid for your spot. We'll let you know.`,
        metadata: { applicationId: app.id, campaignId: app.campaign_id, campaignTitle },
      });
    })
  );

  return NextResponse.json({ accepted: toAccept.length });
}
