// Pure helpers for athlete customer codes and the monthly results report. No imports so it can be
// unit tested with `node --test`.

// No 0/O, 1/I/L: codes get read aloud and typed by counter staff.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_PATTERN = /^[A-Z0-9]{2,12}-[A-Z0-9]{4}$/;

/** Same code tapped twice within this window counts once (double taps, two staff at once). */
export const DUPLICATE_TAP_WINDOW_MS = 60_000;

/** Readable prefix from the athlete's first name, e.g. "Jake" -> "JAKE". Falls back to "HL". */
export function codePrefix(firstName: string | null | undefined): string {
  const cleaned = (firstName || "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return cleaned.length >= 2 ? cleaned : "HL";
}

/** Builds a code like JAKE-7K2Q from four random bytes. */
export function makeCode(firstName: string | null | undefined, random: Uint8Array): string {
  if (random.length < 4) throw new Error("need 4 random bytes");
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
  return `${codePrefix(firstName)}-${suffix}`;
}

/** Cleans up what staff typed ("jake 7k2q", "JAKE7K2Q") into a stored code, or null if it can't be one. */
export function normalizeCode(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!raw.includes("-") && raw.length > 4) raw = `${raw.slice(0, -4)}-${raw.slice(-4)}`;
  return CODE_PATTERN.test(raw) ? raw : null;
}

export function isDuplicateTap(lastRedeemedAt: string | null | undefined, now: Date): boolean {
  if (!lastRedeemedAt) return false;
  const last = Date.parse(lastRedeemedAt);
  return Number.isFinite(last) && now.getTime() - last < DUPLICATE_TAP_WINDOW_MS;
}

/** "2026-09" -> UTC [start, end). Returns null for anything that isn't a real month. */
export function monthRange(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12 || year < 2020 || year > 2100) return null;
  return {
    start: new Date(Date.UTC(year, mon - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, mon, 1)).toISOString(),
  };
}

export function currentMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ----- Monthly results report -----

export type ReportCampaign = { id: string; title: string; payout_cents: number };
export type ReportApplication = { id: string; campaign_id: string; athlete_id: string; status: string; approved_at: string | null };
export type ReportRedemption = { campaign_id: string; athlete_id: string; purchase_cents: number | null };
export type ReportReach = { application_id: string; reach: number | null; impressions: number | null };

export type CampaignResult = {
  campaignId: string;
  title: string;
  athletes: number;
  postsApproved: number;
  customers: number;
  reportedSalesCents: number;
  athletePayCents: number;
  reach: number;
  costPerCustomerCents: number | null;
};

export type MonthlyReport = {
  campaigns: CampaignResult[];
  totals: Omit<CampaignResult, "campaignId" | "title"> & { subscriptionCents: number; totalCostCents: number; totalCostPerCustomerCents: number | null };
  topAthletes: { athleteId: string; customers: number }[];
};

const WORKING = new Set(["accepted", "submitted", "approved", "completed"]);
const DONE = new Set(["approved", "completed"]);

/**
 * Builds the report from rows already limited to one business and one month:
 * `applications` are the business's working applications, `redemptions` those logged in the month,
 * and a post counts toward the month it was approved in (its pay is the campaign's payout).
 */
export function buildMonthlyReport(input: {
  campaigns: ReportCampaign[];
  applications: ReportApplication[];
  redemptions: ReportRedemption[];
  reach: ReportReach[];
  subscriptionCents: number;
  monthStart: string;
  monthEnd: string;
}): MonthlyReport {
  const inMonth = (iso: string | null) => !!iso && iso >= input.monthStart && iso < input.monthEnd;
  const reachByApp = new Map(input.reach.map((r) => [r.application_id, Number(r.reach ?? r.impressions ?? 0)]));

  const campaigns: CampaignResult[] = input.campaigns.map((c) => {
    const apps = input.applications.filter((a) => a.campaign_id === c.id && WORKING.has(a.status));
    const approvedThisMonth = apps.filter((a) => DONE.has(a.status) && inMonth(a.approved_at));
    const reds = input.redemptions.filter((r) => r.campaign_id === c.id);
    const athletePayCents = approvedThisMonth.length * Math.max(0, c.payout_cents || 0);
    return {
      campaignId: c.id,
      title: c.title,
      athletes: new Set(apps.map((a) => a.athlete_id)).size,
      postsApproved: approvedThisMonth.length,
      customers: reds.length,
      reportedSalesCents: reds.reduce((sum, r) => sum + (r.purchase_cents || 0), 0),
      athletePayCents,
      reach: approvedThisMonth.reduce((sum, a) => sum + (reachByApp.get(a.id) || 0), 0),
      costPerCustomerCents: reds.length ? Math.round(athletePayCents / reds.length) : null,
    };
  }).filter((c) => c.athletes > 0 || c.customers > 0);

  const sum = (key: keyof CampaignResult) => campaigns.reduce((acc, c) => acc + Number(c[key] || 0), 0);
  const customers = sum("customers");
  const athletePayCents = sum("athletePayCents");
  const totalCostCents = athletePayCents + Math.max(0, input.subscriptionCents);

  const byAthlete = new Map<string, number>();
  for (const r of input.redemptions) byAthlete.set(r.athlete_id, (byAthlete.get(r.athlete_id) || 0) + 1);
  const topAthletes = [...byAthlete.entries()]
    .map(([athleteId, n]) => ({ athleteId, customers: n }))
    .sort((a, b) => b.customers - a.customers)
    .slice(0, 5);

  return {
    campaigns,
    totals: {
      athletes: new Set(input.applications.filter((a) => WORKING.has(a.status)).map((a) => a.athlete_id)).size,
      postsApproved: sum("postsApproved"),
      customers,
      reportedSalesCents: sum("reportedSalesCents"),
      athletePayCents,
      reach: sum("reach"),
      costPerCustomerCents: customers ? Math.round(athletePayCents / customers) : null,
      subscriptionCents: Math.max(0, input.subscriptionCents),
      totalCostCents,
      totalCostPerCustomerCents: customers ? Math.round(totalCostCents / customers) : null,
    },
    topAthletes,
  };
}
