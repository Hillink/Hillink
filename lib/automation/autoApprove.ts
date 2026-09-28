import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { notifyUser } from "@/lib/notifications";
import { getPaymentForApplication, payOutPayment } from "@/lib/payments/server";
import { completeIfAllRequiredApproved } from "@/lib/deliverables/completion";
import { isReviewOverdue } from "@/lib/compliance/rules";

// Proof that sits unreviewed past the campaign's review window is approved automatically, so
// businesses don't have to babysit every post and athletes aren't left waiting.
// Only funded work with no open dispute is approved. Unfunded work gets one reminder to the business.

export type AutoApproveSummary = {
  approved: number;
  paid: number;
  reminded: number;
  errors: string[];
};

const PAGE = 200;
const MAX_PAGES = 5;
// Nothing is auto-approved sooner than this, whatever the campaign's setting.
const MIN_WINDOW_MS = 24 * 3600_000;
const ACTIVE_DISPUTE = new Set(["open", "under_review"]);

type CampaignWindow = { id: string; title: string; business_id: string; review_window_hours: number | null };
type Embedded<T> = T | T[] | null;
const many = <T,>(v: Embedded<T>): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const hasActiveDispute = (disputes: Embedded<{ status: string }>) => many(disputes).some((d) => ACTIVE_DISPUTE.has(d.status));

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
    .select("stripe_account_id, payout_ready, stripe_onboarding_complete")
    .eq("athlete_id", athleteId)
    .maybeSingle();
  // No payout account yet: the payment stays held and the business's "Pay athlete" button retries later.
  if (!profile?.stripe_account_id || !profile.payout_ready || !profile.stripe_onboarding_complete) return;
  // A failed payout (Stripe down, missing key) is logged and left for the "Pay athlete" retry, so it
  // can't stop the rest of the run.
  try {
    const result = await payOutPayment(getStripeClient(), admin, payment, profile.stripe_account_id);
    if (result.ok && !result.alreadyPaid) summary.paid++;
    if (!result.ok && result.status !== 409) summary.errors.push(`payout ${applicationId}: ${result.error}`);
  } catch (error) {
    summary.errors.push(`payout ${applicationId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type FundedApp = {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: string;
  submitted_at: string | null;
  disputes: Embedded<{ status: string }>;
};

/** Simple proof flow: funded applications in "submitted". */
async function approveSubmittedApplications(admin: SupabaseClient, getStripeClient: () => Stripe, now: Date, summary: AutoApproveSummary) {
  const cutoff = new Date(now.getTime() - MIN_WINDOW_MS).toISOString();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin
      .from("campaign_applications")
      .select("id, campaign_id, athlete_id, status, submitted_at, payments!inner(hold_status), disputes(status)")
      .eq("status", "submitted")
      .eq("payments.hold_status", "held")
      .lte("submitted_at", cutoff)
      .order("submitted_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      summary.errors.push(error.message);
      return;
    }
    const apps = (data || []) as unknown as FundedApp[];
    const campaigns = await campaignsById(admin, apps.map((a) => a.campaign_id));

    for (const app of apps) {
      const campaign = campaigns.get(app.campaign_id);
      if (!campaign || hasActiveDispute(app.disputes) || !isReviewOverdue(app.submitted_at, campaign.review_window_hours, now)) continue;
      const nowIso = new Date().toISOString();
      const { data: updated, error: updateError } = await admin
        .from("campaign_applications")
        .update({ status: "approved", reviewed_at: nowIso, decided_at: nowIso })
        .eq("id", app.id)
        .eq("status", "submitted")
        .select("id");
      if (updateError) {
        summary.errors.push(`approve ${app.id}: ${updateError.message}`);
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
    if (apps.length < PAGE) return;
  }
}

type FundedSubmission = {
  id: string;
  application_id: string;
  submitted_at: string;
  campaign_applications: Embedded<FundedApp>;
};

/** Deliverables flow: pending submissions on funded, active applications. */
async function approveDeliverables(admin: SupabaseClient, getStripeClient: () => Stripe, now: Date, summary: AutoApproveSummary) {
  const cutoff = new Date(now.getTime() - MIN_WINDOW_MS).toISOString();
  const approvedApps = new Map<string, FundedApp>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin
      .from("deliverable_submissions")
      .select(
        "id, application_id, submitted_at, campaign_applications!inner(id, campaign_id, athlete_id, status, submitted_at, payments!inner(hold_status), disputes(status))"
      )
      .eq("status", "pending_review")
      .in("campaign_applications.status", ["accepted", "submitted"])
      .eq("campaign_applications.payments.hold_status", "held")
      .lte("submitted_at", cutoff)
      .order("submitted_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    // Databases without the deliverables tables have nothing to approve here.
    if (error && (error.code === "42P01" || error.code === "PGRST205")) return;
    if (error) {
      summary.errors.push(error.message);
      break;
    }
    const subs = (data || []) as unknown as FundedSubmission[];
    const campaigns = await campaignsById(admin, subs.map((s) => many(s.campaign_applications)[0]?.campaign_id).filter(Boolean) as string[]);

    for (const sub of subs) {
      const app = many(sub.campaign_applications)[0];
      if (!app || hasActiveDispute(app.disputes)) continue;
      const campaign = campaigns.get(app.campaign_id);
      if (!campaign || !isReviewOverdue(sub.submitted_at, campaign.review_window_hours, now)) continue;
      const { data: updated, error: updateError } = await admin
        .from("deliverable_submissions")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), rejection_reason: null })
        .eq("id", sub.id)
        .eq("status", "pending_review")
        .select("id");
      if (updateError) {
        summary.errors.push(`approve submission ${sub.id}: ${updateError.message}`);
        continue;
      }
      if (!updated?.length) continue;
      summary.approved++;
      approvedApps.set(app.id, app);
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
    if (subs.length < PAGE) break;
  }

  for (const app of approvedApps.values()) {
    const completion = await completeIfAllRequiredApproved(admin, app);
    if (!completion.ok) {
      summary.errors.push(`complete ${app.id}: ${completion.error}`);
      continue;
    }
    if (completion.applicationStatus === "completed") {
      await payIfReady(admin, getStripeClient, app.id, app.athlete_id, summary);
    }
  }
}

/** One reminder per application when proof is overdue but the business hasn't funded the athlete yet. */
async function remindUnfunded(admin: SupabaseClient, now: Date, summary: AutoApproveSummary) {
  const cutoff = new Date(now.getTime() - MIN_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("campaign_applications")
    .select("id, campaign_id, athlete_id, status, submitted_at, payments(hold_status), disputes(status)")
    .eq("status", "submitted")
    .is("funding_reminder_sent_at", null)
    .lte("submitted_at", cutoff)
    .order("submitted_at", { ascending: true })
    .limit(PAGE);
  if (error) {
    summary.errors.push(error.message);
    return;
  }
  const apps = ((data || []) as unknown as (FundedApp & { payments: Embedded<{ hold_status: string }> })[]).filter((a) => {
    const payment = many(a.payments)[0];
    return (!payment || payment.hold_status === "uncommitted") && !hasActiveDispute(a.disputes);
  });
  const campaigns = await campaignsById(admin, apps.map((a) => a.campaign_id));
  for (const app of apps) {
    const campaign = campaigns.get(app.campaign_id);
    if (!campaign || !isReviewOverdue(app.submitted_at, campaign.review_window_hours, now)) continue;
    const { data: marked } = await admin
      .from("campaign_applications")
      .update({ funding_reminder_sent_at: new Date().toISOString() })
      .eq("id", app.id)
      .is("funding_reminder_sent_at", null)
      .select("id");
    if (!marked?.length) continue;
    summary.reminded++;
    await notifyUser({
      userId: campaign.business_id,
      type: "proof_submitted",
      title: "Proof waiting on payment",
      body: `An athlete's proof for "${campaign.title}" is past its review window. Fund their payment so it can be approved.`,
      ctaLabel: "Open dashboard",
      ctaUrl: "/business",
      metadata: { applicationId: app.id, campaignId: campaign.id },
    }).catch(() => {});
  }
}

export async function runAutoApprove(
  admin: SupabaseClient,
  getStripeClient: () => Stripe,
  now: Date = new Date()
): Promise<AutoApproveSummary> {
  const summary: AutoApproveSummary = { approved: 0, paid: 0, reminded: 0, errors: [] };
  await approveSubmittedApplications(admin, getStripeClient, now, summary);
  await approveDeliverables(admin, getStripeClient, now, summary);
  await remindUnfunded(admin, now, summary);
  return summary;
}
