import { NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { isValidStripeSecretKey } from "@/lib/env/validation";

export async function POST() {
  const access = await requireRoleAccess(["athlete", "business"]);
  if (!access.ok) {
    return access.response;
  }

  const admin = createAdminClient();
  const userId = access.userId;

  // Deleting an account deletes its campaigns, applications and, with them, their payment records.
  // Don't let that happen while there's live work or money in flight: finish or cancel it first.
  const openWork = await openObligations(admin, access.role, userId);
  if (openWork) {
    return NextResponse.json({ error: openWork, code: "open_obligations" }, { status: 409 });
  }

  if (access.role === "business") {
    const { data: billingProfile } = await admin
      .from("business_billing_profiles")
      .select("stripe_subscription_id")
      .eq("business_id", userId)
      .maybeSingle();

    const stripeSubscriptionId = billingProfile?.stripe_subscription_id || null;
    const hasValidSecret = isValidStripeSecretKey(process.env.STRIPE_SECRET_KEY);

    if (stripeSubscriptionId && hasValidSecret) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(stripeSubscriptionId, {
          prorate: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe cancellation failed";
        return NextResponse.json(
          {
            error: `Unable to terminate account because subscription cancellation failed: ${message}`,
          },
          { status: 409 }
        );
      }
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

const LIVE_APPLICATION_STATUSES = ["accepted", "submitted"];
const OPEN_PAYMENT_STATUSES = ["uncommitted", "held", "disputed"];

/** A message saying why this account can't be deleted yet, or null. */
async function openObligations(
  admin: ReturnType<typeof createAdminClient>,
  role: string,
  userId: string
): Promise<string | null> {
  if (role === "athlete") {
    const { count: liveApps } = await admin
      .from("campaign_applications")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", userId)
      .in("status", LIVE_APPLICATION_STATUSES);
    if (Number(liveApps ?? 0) > 0) {
      return "You're still on a campaign. Finish it or withdraw before deleting your account.";
    }
    const { count: unpaid } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", userId)
      .in("hold_status", OPEN_PAYMENT_STATUSES);
    if (Number(unpaid ?? 0) > 0) {
      return "You have pay that hasn't been sent yet. Contact HILLink before deleting your account.";
    }
    return null;
  }

  const { count: liveCampaigns } = await admin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", userId)
    .in("status", ["open", "active", "paused"]);
  if (Number(liveCampaigns ?? 0) > 0) {
    return "You still have running campaigns. Finish or cancel them before deleting your account.";
  }
  const { count: openPayments } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", userId)
    .in("hold_status", OPEN_PAYMENT_STATUSES);
  if (Number(openPayments ?? 0) > 0) {
    return "Some athlete payments are still open. Contact HILLink before deleting your account.";
  }
  return null;
}
