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
