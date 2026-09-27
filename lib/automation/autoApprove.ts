import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { notifyUser } from "@/lib/notifications";
import { getPaymentForApplication, payOutPayment } from "@/lib/payments/server";
import { completeIfAllRequiredApproved } from "@/lib/deliverables/completion";
import { isReviewOverdue } from "@/lib/compliance/rules";

// Proof that sits unreviewed past the campaign's review window is approved automatically, so
// businesses don't have to babysit every post and athletes aren't left waiting.
// Only funded work is approved; unfunded work gets a reminder to the business instead.

export type AutoApproveSummary = {
  approved: number;
  paid: number;
  waitingOnFunding: number;
  errors: string[];
};

const BATCH = 200;
// Nothing is auto-approved sooner than this, whatever the campaign's setting.
const MIN_WINDOW_MS = 24 * 3600_000;

type CampaignWindow = { id: string; title: string; business_id: string; review_window_hours: number | null };

async function campaignsById(admin: SupabaseClient, ids: string[]): Promise<Map<string, CampaignWindow>> {
  if (!ids.length) return new Map();
  const { data } = await admin.from("campaigns").select("id, title, business_id, review_window_hours").in("id", Array.from(new Set(ids)));
  return new Map(((data || []) as CampaignWindow[]).map((c) => [c.id, c]));
}

async function payIfReady(
  admin: SupabaseClient,
  getStripeClient: () => Stripe,
  applicationId: string,
  athleteId: string,
  summary: AutoApproveSummary
) {
  const payment = await getPaymentForApplication(admin, applicationId);
  if (!payment || payment.stripe_transfer_id || payment.amount_cents <= 0) return;
  const { data: profile } = await admin
    .from("athlete_payout_profiles")
    .select("stripe_account_id, payout_ready")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  // No payout account yet: the payment stays held and the business's "Pay athlete" button retries later.
  if (!profile?.stripe_account_id || !profile.payout_ready) return;
  const result = await payOutPayment(getStripeClient(), admin, payment, profile.stripe_account_id);
  if (result.ok && !result.alreadyPaid) summary.paid++;
  if (!result.ok && result.status !== 409) summary.errors.push(`payout ${applicationId}: ${result.error}`);
}

async function remindToFund(admin: SupabaseClient, campaign: CampaignWindow, applicationId: string) {
  await notifyUser({
    userId: campaign.business_id,
    type: "proof_submitted",
    title: "Proof waiting on payment",
    body: `An athlete's proof for "${campaign.title}" is past its review window. Fund their payment so it can be approved.`,
    ctaLabel: "Open dashboard",
    ctaUrl: "/business",
    metadata: { applicationId, campaignId: campaign.id },
  }).catch(() => {});
}

export async function runAutoApprove(
  admin: SupabaseClient,
  getStripeClient: () => Stripe,
  now: Date = new Date()
): Promise<AutoApproveSummary> {
  const summary: AutoApproveSummary = { approved: 0, paid: 0, waitingOnFunding: 0, errors: [] };
  const cutoff = new Date(now.getTime() - MIN_WINDOW_MS).toISOString();

  // 1. Simple proof flow: application status "submitted".
  const { data: submitted, error: submittedError } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status, submitted_at")
    .eq("status", "submitted")
    .lte("submitted_at", cutoff)
    .order("submitted_at", { ascending: true })
    .limit(BATCH);
  if (submittedError) summary.errors.push(submittedError.message);
  const legacy = (submitted || []) as { id: string; campaign_id: string; athlete_id: string; status: string; submitted_at: string }[];
  const legacyCampaigns = await campaignsById(admin, legacy.map((a) => a.campaign_id));

  for (const app of legacy) {
    const campaign = legacyCampaigns.get(app.campaign_id);
    if (!campaign || !isReviewOverdue(app.submitted_at, campaign.review_window_hours, now)) continue;
    const payment = await getPaymentForApplication(admin, app.id);
    if (!payment || payment.hold_status !== "held") {
      summary.waitingOnFunding++;
      await remindToFund(admin, campaign, app.id);
      continue;
    }
    const nowIso = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("campaign_applications")
      .update({ status: "approved", reviewed_at: nowIso, decided_at: nowIso })
      .eq("id", app.id)
      .eq("status", "submitted")
      .select("id");
    if (error) {
      summary.errors.push(`approve ${app.id}: ${error.message}`);
      continue;
    }
    if (!updated?.length) continue; // The business reviewed it in the meantime.
    summary.approved++;
    await notifyUser({
      userId: app.athlete_id,
      type: "proof_approved",
      title: "Proof approved",
      body: `Your proof for "${campaign.title}" was approved automatically after the review window.`,
      ctaUrl: "/athlete/earnings",
      ctaLabel: "View earnings",
      metadata: { applicationId: app.id, campaignId: campaign.id, automatic: true },
    }).catch(() => {});
    await payIfReady(admin, getStripeClient, app.id, app.athlete_id, summary);
  }

  // 2. Deliverables flow: individual submissions "pending_review".
  const { data: pending, error: pendingError } = await admin
    .from("deliverable_submissions")
    .select("id, application_id, athlete_id, submitted_at")
    .eq("status", "pending_review")
    .lte("submitted_at", cutoff)
    .order("submitted_at", { ascending: true })
    .limit(BATCH);
  if (pendingError) summary.errors.push(pendingError.message);
  const submissions = (pending || []) as { id: string; application_id: string; athlete_id: string; submitted_at: string }[];
  const appIds = Array.from(new Set(submissions.map((s) => s.application_id)));
  const { data: appRows } = appIds.length
    ? await admin.from("campaign_applications").select("id, campaign_id, athlete_id, status").in("id", appIds)
    : { data: [] };
  const apps = new Map(((appRows || []) as { id: string; campaign_id: string; athlete_id: string; status: string }[]).map((a) => [a.id, a]));
  const deliverableCampaigns = await campaignsById(admin, Array.from(apps.values()).map((a) => a.campaign_id));
  const touched = new Set<string>();

  for (const sub of submissions) {
    const app = apps.get(sub.application_id);
    if (!app || !["accepted", "submitted"].includes(app.status)) continue;
    const campaign = deliverableCampaigns.get(app.campaign_id);
    if (!campaign || !isReviewOverdue(sub.submitted_at, campaign.review_window_hours, now)) continue;
    const payment = await getPaymentForApplication(admin, app.id);
    if (!payment || payment.hold_status !== "held") {
      if (!touched.has(app.id)) {
        summary.waitingOnFunding++;
        await remindToFund(admin, campaign, app.id);
      }
      touched.add(app.id);
      continue;
    }
    const { data: updated, error } = await admin
      .from("deliverable_submissions")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", sub.id)
      .eq("status", "pending_review")
      .select("id");
    if (error) {
      summary.errors.push(`approve submission ${sub.id}: ${error.message}`);
      continue;
    }
    if (!updated?.length) continue;
    summary.approved++;
    touched.add(app.id);
    await notifyUser({
      userId: app.athlete_id,
      type: "deliverable_reviewed",
      title: "Deliverable approved",
      body: `Your deliverable for "${campaign.title}" was approved automatically after the review window.`,
      ctaUrl: "/athlete/deliverables",
      ctaLabel: "View deliverables",
      metadata: { submissionId: sub.id, applicationId: app.id, automatic: true },
    }).catch(() => {});
  }

  for (const appId of touched) {
    const app = apps.get(appId)!;
    const completion = await completeIfAllRequiredApproved(admin, app);
    if (!completion.ok) {
      summary.errors.push(`complete ${appId}: ${completion.error}`);
      continue;
    }
    if (completion.applicationStatus === "completed") {
      await payIfReady(admin, getStripeClient, appId, app.athlete_id, summary);
    }
  }

  return summary;
}
