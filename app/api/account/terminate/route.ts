import { NextResponse } from "next/server";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { isValidStripeSecretKey } from "@/lib/env/validation";
import { closeBusinessBilling } from "@/lib/account/termination";

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
    return NextResponse.json({ error: openWork.message, code: "open_obligations" }, { status: openWork.status });
  }

  if (access.role === "business") {
    const { data: billingProfile, error: billingError } = await admin
      .from("business_billing_profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("business_id", userId)
      .maybeSingle();

    if (billingError) {
      return NextResponse.json(
        { error: "Unable to terminate account because billing could not be checked. Please try again." },
        { status: 503 }
      );
    }

    const hasValidSecret = isValidStripeSecretKey(process.env.STRIPE_SECRET_KEY);
    const closure = await closeBusinessBilling(
      {
        stripeCustomerId: billingProfile?.stripe_customer_id ?? null,
        stripeSubscriptionId: billingProfile?.stripe_subscription_id ?? null,
      },
      hasValidSecret ? getStripe() : null
    );

    if (!closure.ok) {
      return NextResponse.json({ error: closure.error }, { status: 409 });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

const LIVE_APPLICATION_STATUSES = ["accepted", "submitted"];
// Open money: not yet funded, held, disputed, or released but the athlete's transfer hasn't been sent.
const OPEN_PAYMENT_FILTER =
  "hold_status.in.(uncommitted,held,disputed),and(hold_status.eq.released,stripe_transfer_id.is.null)";

const OBLIGATIONS_UNCHECKED =
  "We couldn't check your open campaigns and payments right now, so your account wasn't deleted. Please try again.";

/** A message saying why this account can't be deleted yet, or null. Fails closed if a check errors. */
async function openObligations(
  admin: ReturnType<typeof createAdminClient>,
  role: string,
  userId: string
): Promise<{ message: string; status: number } | null> {
  const blocked = (message: string) => ({ message, status: 409 });
  const unchecked = { message: OBLIGATIONS_UNCHECKED, status: 503 };

  if (role === "athlete") {
    const { count: liveApps, error: appsError } = await admin
      .from("campaign_applications")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", userId)
      .in("status", LIVE_APPLICATION_STATUSES);
    if (appsError) return unchecked;
    if (Number(liveApps ?? 0) > 0) {
      return blocked("You're still on a campaign. Finish it or withdraw before deleting your account.");
    }
    const { count: unpaid, error: unpaidError } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("athlete_id", userId)
      .or(OPEN_PAYMENT_FILTER);
    if (unpaidError) return unchecked;
    if (Number(unpaid ?? 0) > 0) {
      return blocked("You have pay that hasn't been sent yet. Contact HILLink before deleting your account.");
    }
    return null;
  }

  const { count: liveCampaigns, error: campaignsError } = await admin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", userId)
    .in("status", ["open", "active", "paused"]);
  if (campaignsError) return unchecked;
  if (Number(liveCampaigns ?? 0) > 0) {
    return blocked("You still have running campaigns. Finish or cancel them before deleting your account.");
  }
  const { count: openPayments, error: paymentsError } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", userId)
    .or(OPEN_PAYMENT_FILTER);
  if (paymentsError) return unchecked;
  if (Number(openPayments ?? 0) > 0) {
    return blocked("Some athlete payments are still open. Contact HILLink before deleting your account.");
  }
  return null;
}
