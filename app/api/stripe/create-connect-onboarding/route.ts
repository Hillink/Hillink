import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, getStripe } from "@/lib/stripe/config";
import { isValidStripeSecretKey } from "@/lib/env/validation";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

export async function POST() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;
  const supabase = access.supabase;
  const authUser = access.authUser;
  const fallbackName = "Dev Athlete";
  const metadataFullName = typeof authUser.user_metadata?.full_name === "string"
    ? authUser.user_metadata.full_name
    : null;
  const recipientName = metadataFullName || fallbackName;
  const recipientEmail = authUser.email || null;

  const hasValidSecret = isValidStripeSecretKey(process.env.STRIPE_SECRET_KEY);
  const allowDevFallback =
    process.env.STRIPE_DEV_FALLBACK === "true" ||
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "preview";

  if (!hasValidSecret) {
     if (allowDevFallback) {
      const adminClient = createAdminClient();
      const { error: payoutError } = await adminClient.from("athlete_payout_profiles").upsert(
        {
          athlete_id: userId,
          payout_method: "stripe_connect",
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          stripe_onboarding_complete: true,
          payout_ready: true,
        },
        { onConflict: "athlete_id" }
      );

      if (payoutError) {
        return NextResponse.json({ error: payoutError.message }, { status: 500 });
      }

      return NextResponse.json({ manualActivated: true });
    }

    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY in Vercel for production payouts, or enable STRIPE_DEV_FALLBACK=true for local/preview testing.",
      },
      { status: 503 }
    );
  }

  try {
    const stripe = getStripe();
    const adminClient = createAdminClient();
    const appUrl = getAppUrl();

    const { data: payoutProfile } = await supabase
      .from("athlete_payout_profiles")
      .select("stripe_account_id")
      .eq("athlete_id", userId)
      .single();

    let accountId = payoutProfile?.stripe_account_id || null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: authUser?.email || undefined,
        metadata: {
          athlete_id: userId,
        },
      });

      accountId = account.id;

      await adminClient.from("athlete_payout_profiles").upsert(
        {
          athlete_id: userId,
          payout_method: "stripe_connect",
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          stripe_account_id: accountId,
          payout_ready: false,
        },
        { onConflict: "athlete_id" }
      );
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings?connect=refresh`,
      return_url: `${appUrl}/settings?connect=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create onboarding link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
