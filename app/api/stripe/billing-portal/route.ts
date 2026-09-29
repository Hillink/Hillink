import { NextResponse } from "next/server";
import { getAppUrl, getStripe } from "@/lib/stripe/config";
import { isValidStripeSecretKey } from "@/lib/env/validation";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

// Opens Stripe's billing portal so a business can cancel its plan, update its card and see invoices.
// Plan changes still go through Settings (create-subscription-checkout), which prorates the difference.
// Stripe's customer portal must be turned on in the Stripe dashboard (Settings > Billing > Customer portal).
export async function POST() {
  const access = await requireRoleAccess(["business"]);
  if (!access.ok) {
    return access.response;
  }

  if (!isValidStripeSecretKey(process.env.STRIPE_SECRET_KEY)) {
    return NextResponse.json({ error: "Billing isn't set up yet. Contact HILLink to change your plan." }, { status: 503 });
  }

  const { data: billingProfile } = await access.supabase
    .from("business_billing_profiles")
    .select("stripe_customer_id")
    .eq("business_id", access.userId)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (!billingProfile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "You don't have a paid plan yet. Choose a tier and activate it first.", code: "no_stripe_customer" },
      { status: 409 }
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: billingProfile.stripe_customer_id,
      return_url: `${getAppUrl()}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't open billing";
    console.error("[stripe/billing-portal] failed", { userId: access.userId, message });
    return NextResponse.json({ error: "Couldn't open Stripe billing. Try again or contact HILLink." }, { status: 502 });
  }
}
