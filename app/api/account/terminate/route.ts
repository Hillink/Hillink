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
