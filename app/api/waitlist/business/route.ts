import { NextRequest, NextResponse } from "next/server";
import { createWaitlistAdminClient } from "@/lib/supabase/waitlist-admin";
import { applyRateLimit } from "@/lib/security/rateLimit";

// AUTH_EXEMPT: Public waitlist endpoint used by unauthenticated visitors.

type BusinessWaitlistBody = {
  full_name?: string;
  business_name?: string;
  business_type?: string;
  city?: string;
  email?: string;
  website_or_instagram?: string;
  influencer_marketing_experience?: string;
  desired_campaign_use?: string;
  wants_early_access?: boolean;
  budget_range?: string;
  objections?: string;
};

const MAX_CONTENT_LENGTH = 20_000;
const MAX_SHORT_TEXT = 160;
const MAX_LONG_TEXT = 2_000;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | null {
  const next = normalizeText(value);
  return next ? next : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function exceedsLength(value: string, maxLength: number): boolean {
  return value.length > maxLength;
}

export async function POST(req: NextRequest) {
  const limit = applyRateLimit({
    req,
    routeKey: "waitlist-business-submit",
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
        },
      }
    );
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
  }

  let body: BusinessWaitlistBody;
  try {
    body = (await req.json()) as BusinessWaitlistBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = normalizeText(body.full_name);
  const businessName = normalizeText(body.business_name);
  const businessType = normalizeText(body.business_type);
  const city = normalizeText(body.city);
  const influencerMarketingExperience = normalizeText(body.influencer_marketing_experience);
  const desiredCampaignUse = normalizeText(body.desired_campaign_use);
  const email = normalizeText(body.email).toLowerCase();

  if (
    !fullName ||
    !businessName ||
    !businessType ||
    !city ||
    !influencerMarketingExperience ||
    !desiredCampaignUse ||
    !email
  ) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (
    exceedsLength(fullName, MAX_SHORT_TEXT) ||
    exceedsLength(businessName, MAX_SHORT_TEXT) ||
    exceedsLength(businessType, MAX_SHORT_TEXT) ||
    exceedsLength(city, MAX_SHORT_TEXT) ||
    exceedsLength(email, MAX_SHORT_TEXT) ||
    exceedsLength(influencerMarketingExperience, MAX_SHORT_TEXT) ||
    exceedsLength(desiredCampaignUse, MAX_LONG_TEXT) ||
    exceedsLength(normalizeText(body.website_or_instagram), MAX_SHORT_TEXT) ||
    exceedsLength(normalizeText(body.budget_range), MAX_SHORT_TEXT) ||
    exceedsLength(normalizeText(body.objections), MAX_LONG_TEXT)
  ) {
    return NextResponse.json({ error: "One or more fields exceed allowed length." }, { status: 400 });
  }

  let admin;
  try {
    admin = createWaitlistAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server configuration error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from("business_waitlist")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  }

  if (duplicate) {
    return NextResponse.json(
      {
        error: "That email is already on the business waitlist.",
        duplicate: true,
      },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("business_waitlist")
    .insert({
      full_name: fullName,
      business_name: businessName,
      business_type: businessType,
      city,
      email,
      website_or_instagram: normalizeOptionalText(body.website_or_instagram),
      influencer_marketing_experience: influencerMarketingExperience,
      desired_campaign_use: desiredCampaignUse,
      wants_early_access: !!body.wants_early_access,
      budget_range: normalizeOptionalText(body.budget_range),
      objections: normalizeOptionalText(body.objections),
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        {
          error: "That email is already on the business waitlist.",
          duplicate: true,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
