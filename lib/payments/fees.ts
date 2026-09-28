// Pure money math for campaign payments. No imports so it can be unit tested with `node --test`.
//
// Money always comes in before it goes out: a business funds an athlete's payout (plus Hillink's
// platform fee) when it accepts the athlete, and the athlete is paid from those funds after approval.

export type AthletePayMode = "on_top" | "included";

export type FeeSettings = {
  /** Hillink's cut of each athlete payout, in basis points (2000 = 20%). */
  platformFeeBps: number;
  /** Add card processing to the business's charge instead of Hillink absorbing it. */
  passCardFees: boolean;
  /** "on_top": business pays athletes on top of its tier. "included": tier price covers athlete pay up to a monthly credit. */
  athletePayMode: AthletePayMode;
  /** In "included" mode, share of the monthly tier price available as athlete credit, in basis points. */
  includedCreditBps: number;
};

// Stripe US card pricing: 2.9% + 30c.
export const CARD_FEE_BPS = 290;
export const CARD_FEE_FIXED_CENTS = 30;

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  platformFeeBps: 2000,
  passCardFees: true,
  athletePayMode: "on_top",
  includedCreditBps: 6000,
};

function parseBps(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0 || value > 10000) return fallback;
  return value;
}

// Dashboard-pasted env values can carry stray whitespace or capitals ("false ", "Included").
function normalized(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function readFeeSettings(env: Record<string, string | undefined> = process.env): FeeSettings {
  const mode = normalized(env.ATHLETE_PAY_MODE) === "included" ? "included" : "on_top";
  return {
    platformFeeBps: parseBps(env.PLATFORM_FEE_BPS, DEFAULT_FEE_SETTINGS.platformFeeBps),
    passCardFees: normalized(env.PASS_CARD_FEES_TO_BUSINESS) !== "false",
    athletePayMode: mode,
    includedCreditBps: parseBps(env.INCLUDED_ATHLETE_CREDIT_BPS, DEFAULT_FEE_SETTINGS.includedCreditBps),
  };
}

export type FundingQuote = {
  /** What the athlete receives. */
  athletePayoutCents: number;
  /** Hillink's platform fee. */
  platformFeeCents: number;
  /** Card processing added to the charge (0 when Hillink absorbs it). */
  cardFeeCents: number;
  /** Total charged to the business. */
  businessChargeCents: number;
};

function assertCents(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer number of cents`);
  }
}

export function platformFeeFor(athletePayoutCents: number, platformFeeBps: number): number {
  assertCents(athletePayoutCents, "athletePayoutCents");
  return Math.round((athletePayoutCents * platformFeeBps) / 10000);
}

/**
 * Card fee needed so that, after Stripe takes 2.9% + 30c of the gross charge, `netCents` remains.
 * Solves gross - (gross * 0.029 + 30) >= net for the smallest whole-cent gross.
 */
export function cardFeeToCover(netCents: number): number {
  assertCents(netCents, "netCents");
  if (netCents === 0) return 0;
  const gross = Math.ceil(((netCents + CARD_FEE_FIXED_CENTS) * 10000) / (10000 - CARD_FEE_BPS));
  return gross - netCents;
}

export function quoteFunding(athletePayoutCents: number, settings: FeeSettings = DEFAULT_FEE_SETTINGS): FundingQuote {
  const platformFeeCents = platformFeeFor(athletePayoutCents, settings.platformFeeBps);
  const net = athletePayoutCents + platformFeeCents;
  const cardFeeCents = settings.passCardFees ? cardFeeToCover(net) : 0;
  return {
    athletePayoutCents,
    platformFeeCents,
    cardFeeCents,
    businessChargeCents: net + cardFeeCents,
  };
}

/** Monthly athlete credit a business gets in "included" mode. */
export function includedCreditCents(monthlyPriceCents: number, settings: FeeSettings = DEFAULT_FEE_SETTINGS): number {
  assertCents(monthlyPriceCents, "monthlyPriceCents");
  if (settings.athletePayMode !== "included") return 0;
  return Math.floor((monthlyPriceCents * settings.includedCreditBps) / 10000);
}

/** Start of the calendar month (UTC) that `at` falls in, used as the credit period. */
export function creditPeriodStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** Stable Stripe idempotency key for paying out one payment row. Retries reuse it, so Stripe never pays twice. */
export function payoutIdempotencyKey(paymentId: string): string {
  if (!paymentId) throw new Error("paymentId is required");
  return `hillink-payout-${paymentId}`;
}

// Application status rules. The business may only move an application forward one legal step.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  applied: ["accepted", "declined"],
  pending: ["accepted", "declined"],
  submitted: ["approved", "rejected"],
};

export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
