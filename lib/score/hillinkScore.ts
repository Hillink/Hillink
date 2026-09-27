// The Hillink Score: a 0-100 "credit score" for athletes that businesses see when choosing who to work with.
// Pure, no imports, unit tested with `node --test`.
//
//   rating 40%       star ratings from businesses
//   on time 25%      proof submitted within the campaign's completion window
//   first try 15%    proof approved without a redo
//   customers 20%    customers logged per campaign (only campaigns where the business logs codes)
//
// New athletes start from a neutral prior so one bad (or great) campaign doesn't swing them to an extreme,
// and the score is "provisional" until they've finished a few campaigns.

export const SCORE_WEIGHTS = { rating: 0.4, onTime: 0.25, firstTry: 0.15, customers: 0.2 } as const;
export const PROVISIONAL_BELOW_CAMPAIGNS = 3;
/** Customers per campaign that earns full marks. */
export const FULL_MARKS_CUSTOMERS_PER_CAMPAIGN = 5;

const PRIOR = {
  ratingMean: 4.0,
  ratingWeight: 3,
  rate: 0.8,
  rateWeight: 2,
  customersPerCampaign: 1,
  customersWeight: 2,
};

export type ScoreInputs = {
  ratingCount: number;
  ratingSum: number;
  completed: number;
  timed: number; // completed campaigns where we know when proof came in
  onTime: number;
  firstTry: number;
  firstTryTracked?: number; // completed campaigns with tracked proof rounds (defaults to completed)
  trackedCampaigns: number; // completed campaigns where the business logs customer codes
  customers: number; // customers logged on those campaigns
};

export type ScoreParts = { rating: number; onTime: number; firstTry: number; customers: number };
export type HillinkScore = { score: number; parts: ScoreParts; provisional: boolean };

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeHillinkScore(raw: Partial<ScoreInputs>): HillinkScore {
  const i: ScoreInputs = {
    ratingCount: safe(raw.ratingCount ?? 0),
    ratingSum: safe(raw.ratingSum ?? 0),
    completed: safe(raw.completed ?? 0),
    timed: safe(raw.timed ?? 0),
    onTime: safe(raw.onTime ?? 0),
    firstTry: safe(raw.firstTry ?? 0),
    firstTryTracked: safe(raw.firstTryTracked ?? raw.completed ?? 0),
    trackedCampaigns: safe(raw.trackedCampaigns ?? 0),
    customers: safe(raw.customers ?? 0),
  };

  const meanRating = (i.ratingSum + PRIOR.ratingMean * PRIOR.ratingWeight) / (i.ratingCount + PRIOR.ratingWeight);
  const rating = clamp(((meanRating - 1) / 4) * 100);
  const onTime = clamp(((Math.min(i.onTime, i.timed) + PRIOR.rate * PRIOR.rateWeight) / (i.timed + PRIOR.rateWeight)) * 100);
  const tries = i.firstTryTracked ?? i.completed;
  const firstTry = clamp(((Math.min(i.firstTry, tries) + PRIOR.rate * PRIOR.rateWeight) / (tries + PRIOR.rateWeight)) * 100);
  const perCampaign =
    (i.customers + PRIOR.customersPerCampaign * PRIOR.customersWeight) / (i.trackedCampaigns + PRIOR.customersWeight);
  const customers = clamp((perCampaign / FULL_MARKS_CUSTOMERS_PER_CAMPAIGN) * 100);

  const score =
    rating * SCORE_WEIGHTS.rating +
    onTime * SCORE_WEIGHTS.onTime +
    firstTry * SCORE_WEIGHTS.firstTry +
    customers * SCORE_WEIGHTS.customers;

  const round = (n: number) => Math.round(n);
  return {
    score: round(score),
    parts: { rating: round(rating), onTime: round(onTime), firstTry: round(firstTry), customers: round(customers) },
    provisional: i.completed < PROVISIONAL_BELOW_CAMPAIGNS,
  };
}

export function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "New";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Great";
  if (score >= 60) return "Good";
  if (score >= 45) return "Fair";
  return "Needs work";
}

/** Short tip for the athlete's weakest area. */
export function improvementTip(parts: ScoreParts): string {
  const weighted: [keyof ScoreParts, number][] = (Object.keys(parts) as (keyof ScoreParts)[]).map((k) => [
    k,
    (100 - parts[k]) * SCORE_WEIGHTS[k],
  ]);
  weighted.sort((a, b) => b[1] - a[1]);
  switch (weighted[0][0]) {
    case "rating":
      return "Ask businesses what they loved and deliver exactly what the campaign asks for to lift your ratings.";
    case "onTime":
      return "Submit proof before the campaign's deadline. On-time posts are a quarter of your score.";
    case "firstTry":
      return "Check the proof checklist (including #ad) before you submit so it's approved the first time.";
    default:
      return "Put your customer code in every post and story. Customers you bring in are a fifth of your score.";
  }
}
