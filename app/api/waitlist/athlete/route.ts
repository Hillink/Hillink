import { NextRequest, NextResponse } from "next/server";
import { createWaitlistAdminClient } from "@/lib/supabase/waitlist-admin";
import { applyRateLimit } from "@/lib/security/rateLimit";

// AUTH_EXEMPT: Public waitlist endpoint used by unauthenticated visitors.

type AthleteWaitlistBody = {
  school?: string;
  sport?: string;
  nil_experience?: string;
  deal_types?: string[];
  would_use_platform?: string;
  wants_early_access?: boolean;
  email?: string;
  instagram_handle?: string;
  preferred_business_types?: string;
  objections?: string;
};

const MAX_CONTENT_LENGTH = 20_000;
const MAX_SHORT_TEXT = 120;
const MAX_LONG_TEXT = 2_000;
const MAX_DEAL_TYPES = 8;

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
    routeKey: "waitlist-athlete-submit",
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

  let body: AthleteWaitlistBody;
  try {
    body = (await req.json()) as AthleteWaitlistBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const school = normalizeText(body.school);
  const sport = normalizeText(body.sport);
  const nilExperience = normalizeText(body.nil_experience);
  const wouldUsePlatform = normalizeText(body.would_use_platform);
  const email = normalizeText(body.email).toLowerCase();
  const dealTypes = Array.isArray(body.deal_types)
    ? body.deal_types.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  if (!school || !sport || !nilExperience || !wouldUsePlatform || !email || dealTypes.length === 0) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (
    dealTypes.length > MAX_DEAL_TYPES ||
    exceedsLength(school, MAX_SHORT_TEXT) ||
    exceedsLength(sport, MAX_SHORT_TEXT) ||
    exceedsLength(nilExperience, MAX_SHORT_TEXT) ||
    exceedsLength(wouldUsePlatform, MAX_SHORT_TEXT) ||
    exceedsLength(email, MAX_SHORT_TEXT) ||
    dealTypes.some((item) => exceedsLength(item, MAX_SHORT_TEXT)) ||
    exceedsLength(normalizeText(body.instagram_handle), MAX_SHORT_TEXT) ||
    exceedsLength(normalizeText(body.preferred_business_types), MAX_LONG_TEXT) ||
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
    .from("athlete_waitlist")
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
        error: "That email is already on the athlete waitlist.",
        duplicate: true,
      },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("athlete_waitlist")
    .insert({
      school,
      sport,
      nil_experience: nilExperience,
      deal_types: dealTypes,
      would_use_platform: wouldUsePlatform,
      wants_early_access: !!body.wants_early_access,
      email,
      instagram_handle: normalizeOptionalText(body.instagram_handle),
      preferred_business_types: normalizeOptionalText(body.preferred_business_types),
      objections: normalizeOptionalText(body.objections),
      status: "new",
    })
    .select("id")
    .single();

  if (insertError) {
    // Handles unique index violations gracefully when duplicates race.
    if (insertError.code === "23505") {
      return NextResponse.json(
        {
          error: "That email is already on the athlete waitlist.",
          duplicate: true,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
