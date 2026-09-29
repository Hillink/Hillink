import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/config";
import { notifyUser } from "@/lib/notifications";
import { getPaymentForApplication, payOutPayment } from "@/lib/payments/server";
import { envValue } from "@/lib/env/read";

type ReleaseBody = {
  applicationId: string;
  force?: boolean;
};

type PaymentRow = {
  id: string;
  application_id: string;
  athlete_id: string;
  hold_status: string;
  amount_cents: number;
  stripe_transfer_id: string | null;
  idempotency_key: string | null;
};

type AthletePayoutProfile = {
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
};

export async function POST(request: NextRequest) {
  try {
    // Check auth: admin role OR valid CRON_SECRET header
    const cronSecret = request.headers.get("x-cron-secret");
    const expectedCronSecret = envValue("CRON_SECRET");

    let isAuthorized = false;

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      isAuthorized = true;
    } else {
      try {
        const roleResult = await requireRole(request, ["admin"]);
        if (roleResult instanceof NextResponse) {
          return roleResult;
        }
        isAuthorized = true;
      } catch {
        isAuthorized = false;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: admin role or CRON_SECRET required" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as ReleaseBody;
    const { applicationId } = body;

    if (!applicationId || typeof applicationId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid applicationId" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Fetch payment with hold_status='released' and no stripe_transfer_id yet
    const { data: payment, error: fetchError } = await admin
      .from("payments")
      .select("*")
      .eq("application_id", applicationId)
      .eq("hold_status", "released")
      .is("stripe_transfer_id", null)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching payment:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch payment record" },
        { status: 500 }
      );
    }

    if (!payment) {
      // Either no payment found, or already transferred (409 conflict)
      const { data: existingPayment } = await admin
        .from("payments")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle();

      if (existingPayment?.stripe_transfer_id) {
        return NextResponse.json(
          {
            error: "Payout already processed for this application",
            transferId: existingPayment.stripe_transfer_id,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Payment not found or not in released status" },
        { status: 404 }
      );
    }

    const paymentRow = payment as PaymentRow;

    // Validate amount_cents > 0
    if (paymentRow.amount_cents <= 0) {
      return NextResponse.json(
        { error: "Cannot process payout with zero or negative amount" },
        { status: 422 }
      );
    }

    // Fetch athlete stripe account
    const { data: payoutProfile, error: profileError } = await admin
      .from("athlete_payout_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("athlete_id", paymentRow.athlete_id)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching payout profile:", profileError);
      return NextResponse.json(
        { error: "Failed to fetch athlete payout profile" },
        { status: 500 }
      );
    }

    if (!payoutProfile) {
      return NextResponse.json(
        { error: "Athlete payout profile not found" },
        { status: 404 }
      );
    }

    const profile = payoutProfile as AthletePayoutProfile;
    if (!profile.stripe_account_id || !profile.stripe_onboarding_complete) {
      return NextResponse.json(
        { error: "Athlete Stripe Connect account not ready for payout" },
        { status: 422 }
      );
    }

    const fullPayment = await getPaymentForApplication(admin, applicationId);
    if (!fullPayment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Deterministic idempotency key + single-claim lock: retries can never pay twice.
    const result = await payOutPayment(getStripe(), admin, fullPayment, profile.stripe_account_id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if (result.alreadyPaid) {
      return NextResponse.json(
        { error: "Payout already processed for this application", transferId: result.transferId },
        { status: 409 }
      );
    }
    const transfer = { id: result.transferId };

    try {
      await notifyUser({
        userId: paymentRow.athlete_id,
        type: "payout_sent",
        title: "Payout released",
        body: `Your payout of $${(paymentRow.amount_cents / 100).toFixed(2)} has been sent.`,
        ctaLabel: "View earnings",
        ctaUrl: "/athlete/earnings",
        metadata: {
          paymentId: paymentRow.id,
          applicationId,
          transferId: transfer.id,
          amountCents: paymentRow.amount_cents,
        },
      });
    } catch {
      // Never fail payout release due to notification errors
    }

    return NextResponse.json(
      {
        success: true,
        transferId: transfer.id,
        amount: paymentRow.amount_cents,
        athleteId: paymentRow.athlete_id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected error in payout release:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
